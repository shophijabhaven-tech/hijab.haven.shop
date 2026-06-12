-- ═══════════════════════════════════════════════════════════════
-- HIJAB HAVEN — SUPABASE ROLE-BASED ACCESS CONTROL (RBAC)
-- ═══════════════════════════════════════════════════════════════
-- 
-- ROLES:
--   • CUSTOMER (anonymous/public) — Can ONLY view products & images
--   • ADMIN (authenticated user in admin_users table) — Full CRUD
--
-- Run this ENTIRE script in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 1. ADMIN USERS TABLE
-- ─────────────────────────────────────────────
-- This table maps Supabase Auth user IDs to admin privileges.
-- Only users whose auth.uid() appears here get write access.

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT DEFAULT 'Admin',
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on admin_users (only admins can see other admins)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admin list"
  ON admin_users FOR SELECT
  USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Super admins can manage admin list"
  ON admin_users FOR ALL
  USING (auth.uid() IN (SELECT id FROM admin_users WHERE role = 'super_admin'));


-- ─────────────────────────────────────────────
-- 2. PRODUCTS TABLE
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('everyday','occasion','hampers','accessories','pastel','minimal')),
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- CUSTOMER POLICY: Anyone (even anonymous) can VIEW products
CREATE POLICY "Public read access to products"
  ON products FOR SELECT
  USING (true);

-- ADMIN POLICY: Only authenticated admins can INSERT products
CREATE POLICY "Only admins can insert products"
  ON products FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND auth.uid() IN (SELECT id FROM admin_users)
  );

-- ADMIN POLICY: Only authenticated admins can UPDATE products
CREATE POLICY "Only admins can update products"
  ON products FOR UPDATE
  USING (
    auth.uid() IS NOT NULL 
    AND auth.uid() IN (SELECT id FROM admin_users)
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND auth.uid() IN (SELECT id FROM admin_users)
  );

-- ADMIN POLICY: Only authenticated admins can DELETE products
CREATE POLICY "Only admins can delete products"
  ON products FOR DELETE
  USING (
    auth.uid() IS NOT NULL 
    AND auth.uid() IN (SELECT id FROM admin_users)
  );


-- ─────────────────────────────────────────────
-- 3. CUSTOMERS TABLE
-- ─────────────────────────────────────────────
-- Customers self-register when they enter the shop (public INSERT).
-- Only admins can VIEW, UPDATE, or DELETE customer records.
-- This keeps customer data private — no secrets needed in frontend.

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  joined_date TEXT DEFAULT '',
  joined_ts BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- PUBLIC: Customers can register themselves (INSERT only)
CREATE POLICY "Anyone can register as customer"
  ON customers FOR INSERT
  WITH CHECK (true);

-- ADMIN ONLY: Can view all customers
CREATE POLICY "Only admins can view customers"
  ON customers FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() IN (SELECT id FROM admin_users)
  );

-- ADMIN ONLY: Can update customer records
CREATE POLICY "Only admins can update customers"
  ON customers FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() IN (SELECT id FROM admin_users)
  );

-- ADMIN ONLY: Can delete customer records
CREATE POLICY "Only admins can delete customers"
  ON customers FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() IN (SELECT id FROM admin_users)
  );

-- Prevent duplicate phone registration (upsert-friendly)
CREATE OR REPLACE FUNCTION register_customer(p_name TEXT, p_phone TEXT, p_joined_date TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO customers (name, phone, joined_date)
  VALUES (p_name, p_phone, p_joined_date)
  ON CONFLICT (phone) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────
-- 4. STORAGE BUCKET FOR PRODUCT IMAGES
-- ─────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images', 
  'product-images', 
  true,                                          -- publicly readable URLs
  5242880,                                       -- 5MB max file size
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif'];


-- ─────────────────────────────────────────────
-- 4. STORAGE POLICIES (Role-Based)
-- ─────────────────────────────────────────────

-- CUSTOMER: Can VIEW/DOWNLOAD product images (public read)
CREATE POLICY "Anyone can view product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- ADMIN ONLY: Can UPLOAD new product images
CREATE POLICY "Only admins can upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND auth.uid() IS NOT NULL
    AND auth.uid() IN (SELECT id FROM admin_users)
  );

-- ADMIN ONLY: Can REPLACE/UPDATE existing product images
CREATE POLICY "Only admins can update product images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND auth.uid() IS NOT NULL
    AND auth.uid() IN (SELECT id FROM admin_users)
  );

-- ADMIN ONLY: Can DELETE product images
CREATE POLICY "Only admins can delete product images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND auth.uid() IS NOT NULL
    AND auth.uid() IN (SELECT id FROM admin_users)
  );


-- ─────────────────────────────────────────────
-- 5. HELPER FUNCTION: Check if user is admin
-- ─────────────────────────────────────────────
-- Use this in your app: SELECT is_admin();

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────
-- 6. HELPER FUNCTION: Auto-update timestamp
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ═══════════════════════════════════════════════════════════════
-- 7. FIRST-TIME ADMIN SETUP
-- ═══════════════════════════════════════════════════════════════
--
-- AFTER running this script, do the following:
--
-- A) Create your admin account:
--    1. Go to Authentication → Users in Supabase Dashboard
--    2. Click "Add user" → "Create new user"
--    3. Enter your email & password (this is your owner login)
--    4. Copy the User UID that gets generated
--
-- B) Register yourself as admin (replace the UUID below):
--    Run this query in SQL Editor:
--
--    INSERT INTO admin_users (id, email, display_name, role)
--    VALUES (
--      'PASTE-YOUR-USER-UUID-HERE',
--      'your-email@example.com',
--      'Shop Owner',
--      'super_admin'
--    );
--
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 8. SECURITY VERIFICATION QUERIES
-- ─────────────────────────────────────────────
-- Run these to confirm everything is locked down:

-- Check RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Check policies exist:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd 
-- FROM pg_policies WHERE schemaname = 'public';

-- Test admin check function:
-- SELECT is_admin(); -- Should return false when not logged in


-- ═══════════════════════════════════════════════════════════════
-- PERMISSION MATRIX SUMMARY
-- ═══════════════════════════════════════════════════════════════
--
-- ┌─────────────────┬───────────┬───────────┬───────────┬───────────┐
-- │ Resource        │  SELECT   │  INSERT   │  UPDATE   │  DELETE   │
-- ├─────────────────┼───────────┼───────────┼───────────┼───────────┤
-- │ products        │ ✅ Anyone │ 🔐 Admin  │ 🔐 Admin  │ 🔐 Admin  │
-- │ customers       │ 🔐 Admin  │ ✅ Anyone │ 🔐 Admin  │ 🔐 Admin  │
-- │ product-images  │ ✅ Anyone │ 🔐 Admin  │ 🔐 Admin  │ 🔐 Admin  │
-- │ admin_users     │ 🔐 Admin  │ 🔐 Super  │ 🔐 Super  │ 🔐 Super  │
-- └─────────────────┴───────────┴───────────┴───────────┴───────────┘
--
-- ✅ Anyone  = No authentication required (public/anonymous)
-- 🔐 Admin   = Must be authenticated + listed in admin_users
-- 🔐 Super   = Must be authenticated + role = 'super_admin'
--
-- SECURITY NOTE: The Supabase anon key is SAFE to commit to GitHub.
-- It only grants the permissions defined by RLS policies above.
-- No other secrets (JSONBin, API keys, etc.) are needed.
-- ═══════════════════════════════════════════════════════════════
