-- ═══════════════════════════════════════════════════════════════════════════
-- WP-02 PACKAGING NOTES (review of ARCHITECTURE.md §4.7 — 2026-06-11)
-- Source: docs/ARCHITECTURE.md §4.7, copied verbatim EXCEPT one fix below.
--
-- FIX (idempotency bug, section B): §4.7 created the three NEW policies
--   "Super admins insert admins" / "Super admins update admins" /
--   "Super admins delete admins"
-- WITHOUT a preceding DROP POLICY IF EXISTS. First run succeeds; any re-run
-- aborts with error 42710 (duplicate policy), contradicting §4.1's binding
-- idempotency guarantee ("DROP POLICY IF EXISTS before every CREATE POLICY").
-- Three DROP POLICY IF EXISTS lines were added in section B. Nothing else
-- was changed, reordered, or reformatted.
--
-- VERIFIED-CORRECT (no change needed), against live supabase_setup.sql:
-- 1. is_admin() / update_updated_at() already exist with IDENTICAL signatures
--    (no args, same return types) → CREATE OR REPLACE is valid Postgres here.
-- 2. products.id is BIGINT with no default. Live ids were generated client-side
--    via Date.now() (~1.75e12). setval(products_id_seq, GREATEST(MAX(id)+1,1000))
--    therefore continues ABOVE the epoch-millisecond ids; BIGINT max is
--    9223372036854775807 (~9.22e18), so headroom is ~5×10^6 times the current
--    ids. Re-running setval only moves the sequence forward (MAX grows). Safe.
-- 3. place_order: `SELECT * INTO v_product FROM products ... FOR UPDATE` with a
--    products%ROWTYPE variable is valid plpgsql (locking clauses are permitted
--    in SELECT INTO; FOUND is set, so IF NOT FOUND is correct). After section D
--    runs, %ROWTYPE includes the new stock column, which section I reads.
-- 4. SECURITY DEFINER functions are owned by the SQL-editor role (postgres),
--    which owns the public tables → table-owner RLS bypass inside place_order
--    is intentional and is why no INSERT policy on orders is needed.
-- 5. Live anon-key smoke test (2026-06-11) CONFIRMS the §4.2 recursion bug in
--    production: GET /rest/v1/customers returns HTTP 500
--    "infinite recursion detected in policy for relation admin_users" (42P17).
--    Section B/C below is the fix.
-- ═══════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- HIJAB HAVEN REBUILD MIGRATION 001 — idempotent, non-breaking
-- ════════════════════════════════════════════════════════════

-- ── A. Helper functions (SECURITY DEFINER breaks RLS recursion) ──
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin');
END; $$;

GRANT EXECUTE ON FUNCTION is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO anon, authenticated;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── B. FIX admin_users recursive policies ──
DROP POLICY IF EXISTS "Admins can view admin list" ON admin_users;
DROP POLICY IF EXISTS "Super admins can manage admin list" ON admin_users;
-- [WP-02 FIX] drops added so re-runs are idempotent (see header note):
DROP POLICY IF EXISTS "Super admins insert admins" ON admin_users;
DROP POLICY IF EXISTS "Super admins update admins" ON admin_users;
DROP POLICY IF EXISTS "Super admins delete admins" ON admin_users;

CREATE POLICY "Admins can view admin list" ON admin_users
  FOR SELECT USING (is_admin());
CREATE POLICY "Super admins insert admins" ON admin_users
  FOR INSERT WITH CHECK (is_super_admin());
CREATE POLICY "Super admins update admins" ON admin_users
  FOR UPDATE USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY "Super admins delete admins" ON admin_users
  FOR DELETE USING (is_super_admin());

-- ── C. Rewrite existing subquery policies to use is_admin() ──
-- products
DROP POLICY IF EXISTS "Only admins can insert products" ON products;
DROP POLICY IF EXISTS "Only admins can update products" ON products;
DROP POLICY IF EXISTS "Only admins can delete products" ON products;
CREATE POLICY "Only admins can insert products" ON products
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Only admins can update products" ON products
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Only admins can delete products" ON products
  FOR DELETE USING (is_admin());
-- (public SELECT policy on products is kept as-is)

-- customers
DROP POLICY IF EXISTS "Only admins can view customers" ON customers;
DROP POLICY IF EXISTS "Only admins can update customers" ON customers;
DROP POLICY IF EXISTS "Only admins can delete customers" ON customers;
CREATE POLICY "Only admins can view customers" ON customers
  FOR SELECT USING (is_admin());
CREATE POLICY "Only admins can update customers" ON customers
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Only admins can delete customers" ON customers
  FOR DELETE USING (is_admin());
-- ("Anyone can register as customer" INSERT policy kept as-is)

-- storage.objects (product-images)
DROP POLICY IF EXISTS "Only admins can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Only admins can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Only admins can delete product images" ON storage.objects;
CREATE POLICY "Only admins can upload product images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND is_admin());
CREATE POLICY "Only admins can update product images" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-images' AND is_admin());
CREATE POLICY "Only admins can delete product images" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images' AND is_admin());
-- ("Anyone can view product images" SELECT policy kept as-is)

-- ── D. products: stock column + server-side id default ──
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER;  -- NULL = untracked

CREATE SEQUENCE IF NOT EXISTS products_id_seq;
ALTER TABLE products ALTER COLUMN id SET DEFAULT nextval('products_id_seq');
SELECT setval('products_id_seq',
  GREATEST((SELECT COALESCE(MAX(id), 0) FROM products) + 1, 1000));

-- ── E. user_profiles ──
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON user_profiles
  FOR SELECT USING (is_admin());

DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── F. addresses ──
CREATE TABLE IF NOT EXISTS addresses (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT DEFAULT 'Home',
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  pincode TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

DROP POLICY IF EXISTS "Users manage own addresses" ON addresses;
CREATE POLICY "Users manage own addresses" ON addresses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── G. orders ──
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_code TEXT UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL = guest
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',          -- [{product_id,name,price,quantity,image_url}]
  total NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled')),
  shipping_address JSONB NOT NULL DEFAULT '{}',
  payment_method TEXT NOT NULL DEFAULT 'upi',
  admin_note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can create orders" ON orders;   -- remove if present from old plan
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all orders" ON orders
  FOR SELECT USING (is_admin());
CREATE POLICY "Admins can update orders" ON orders
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
-- NO insert policy: inserts only via place_order(). NO delete policy: orders are cancelled, never deleted.

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── H. wishlists ──
CREATE TABLE IF NOT EXISTS wishlists (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);
ALTER TABLE wishlists ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);

DROP POLICY IF EXISTS "Users manage own wishlist" ON wishlists;
CREATE POLICY "Users manage own wishlist" ON wishlists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── I. place_order RPC (sole write path for orders) ──
CREATE OR REPLACE FUNCTION place_order(
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_address JSONB,
  p_items JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_line JSONB;
  v_product products%ROWTYPE;
  v_qty INTEGER;
  v_items JSONB := '[]'::JSONB;
  v_total NUMERIC(10,2) := 0;
  v_order_id BIGINT;
  v_order_code TEXT;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_ORDER';
  END IF;
  IF coalesce(trim(p_customer_name), '') = '' OR coalesce(trim(p_customer_phone), '') = '' THEN
    RAISE EXCEPTION 'MISSING_CONTACT';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_line->>'quantity')::INTEGER;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 50 THEN
      RAISE EXCEPTION 'BAD_QUANTITY';
    END IF;

    SELECT * INTO v_product FROM products
      WHERE id = (v_line->>'product_id')::BIGINT
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'UNKNOWN_PRODUCT';
    END IF;

    IF v_product.stock IS NOT NULL THEN
      IF v_product.stock < v_qty THEN
        RAISE EXCEPTION 'OUT_OF_STOCK:%', v_product.name;
      END IF;
      UPDATE products SET stock = stock - v_qty WHERE id = v_product.id;
    END IF;

    v_items := v_items || jsonb_build_object(
      'product_id', v_product.id,
      'name',       v_product.name,
      'price',      v_product.price,
      'quantity',   v_qty,
      'image_url',  v_product.image_url
    );
    v_total := v_total + (v_product.price * v_qty);
  END LOOP;

  INSERT INTO orders (user_id, customer_name, customer_phone, items, total, shipping_address)
  VALUES (auth.uid(), trim(p_customer_name), trim(p_customer_phone), v_items, v_total,
          coalesce(p_address, '{}'::JSONB))
  RETURNING id INTO v_order_id;

  v_order_code := 'HH-' || lpad(v_order_id::TEXT, 5, '0');
  UPDATE orders SET order_code = v_order_code WHERE id = v_order_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'order_code', v_order_code, 'total', v_total);
END; $$;

GRANT EXECUTE ON FUNCTION place_order(TEXT, TEXT, JSONB, JSONB) TO anon, authenticated;
