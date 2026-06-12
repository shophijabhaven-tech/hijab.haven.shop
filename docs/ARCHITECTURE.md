# Hijab Haven — Rebuild Architecture (BINDING)

Status: **APPROVED / BINDING**. Implementation agents build EXACTLY this. Deviations require a documented change to this file first.

Source-of-truth references used while writing this document:
- Live site: `C:\Users\ARIF\Desktop\Hijab Haven\index.html` (1.2 MB single-file SPA, deployed at hijab-haven.netlify.app)
- Current DB setup: `C:\Users\ARIF\Desktop\Hijab Haven\supabase_setup.sql`
- Prior partial rebuild: `C:\Users\ARIF\Desktop\Hijab Haven\App Build\` (Next.js 16, ~1,500 LOC, ~85% feature shape)
- Prior rebuild's planned (never-run) migration: `C:\Users\ARIF\Desktop\Hijab Haven\App Build\supabase_migration.sql`

The folder `C:\Users\ARIF\Desktop\Hijab Haven\hijab-haven-app\` is an abandoned scaffold (node_modules + boilerplate only). It is NOT used.

> **Cleanup note (12 Jun 2026):** salvage is complete, so `App Build\` and `hijab-haven-app\` were deleted, and the legacy site files (`index.html`, `hijab_haven_final.html`, `supabase_setup.sql`, `DEPLOYMENT_GUIDE.md`) were archived to `original V1\`. Path references to the old locations elsewhere in this document are historical.

---

## 1. Executive Summary & Stack Decision

### 1.1 What we are building

Rebuild the 1.2 MB single-file HTML SPA into a maintainable **multi-page React SPA** at `C:\Users\ARIF\Desktop\Hijab Haven\app`, preserving the existing brand/design pixel-for-pixel, with:

- Separate customer site (`/`, `/shop`, `/product/:id`, `/checkout`, `/account/*`) and admin area (`/admin/*`).
- Orders **persisted in Supabase** (today they exist only as WhatsApp messages).
- Real auth: optional customer accounts (email OTP) + admin email/password with `admin_users` RBAC. The hardcoded PIN `1226` is removed.
- Guest checkout preserved — the WhatsApp + UPI flow stays the primary purchase path. No payment gateway.
- Zero cost: Supabase free tier + Netlify free tier only.

### 1.2 Stack decision (FINAL)

**Vite 6 + React 19 + TypeScript 5 + Tailwind CSS 4 + React Router 7 (library mode, `BrowserRouter`) + @supabase/supabase-js v2. Pure static SPA on Netlify.**

| Option | Verdict | Reasoning |
|---|---|---|
| **Vite + React SPA** | ✅ **CHOSEN** | Builds to plain static files → Netlify free tier with a single `/* → /index.html 200` redirect; zero server runtime, zero cold starts, zero Netlify-Next-runtime risk. All data is client→Supabase already (RLS is the security boundary), so SSR buys nothing. Simplest possible mental model for a solo non-expert maintainer: one build command, one `dist/` folder. |
| Next.js 16 (App Build baseline) | ❌ Rejected | On Netlify, Next 16 requires the Netlify Next runtime (OpenNext adapter) — an extra moving part that breaks independently of your code. `output: 'export'` static mode would avoid that, but static export cannot pre-render `/product/[id]` for products created at runtime by the admin, which forces query-param hacks. The App Build code is 100% `'use client'` components anyway — it uses zero Next.js server features, so Next is pure overhead here. |
| Astro / SvelteKit / other | ❌ Rejected | Throws away the salvageable React code in App Build and adds a new framework for the maintainer to learn. No requirement justifies it. |

SEO trade-off, stated honestly: an SPA renders client-side, so Google sees less. This shop's traffic is Instagram (`instagram.com/_hijab__haven_`) + WhatsApp + word of mouth, not organic search. Mitigation: static `<title>`/`<meta>`/OpenGraph tags in `index.html` (sufficient for WhatsApp/Instagram link previews, which read static HTML). If organic SEO ever becomes a requirement, the seam is `src/pages/*` — pages are already route-isolated and could be pre-rendered later. Do not build for that now (YAGNI).

### 1.3 Salvage decision (FINAL)

**Build clean at `C:\Users\ARIF\Desktop\Hijab Haven\app` (new Vite project), porting App Build source files mechanically.** App Build is NOT continued in place (it is welded to Next.js project structure), but its code is good and is the starting material:

Ported from `App Build\src\` (mechanical changes only — remove `'use client'`, replace `next/navigation` → `react-router` (`useNavigate`), `next/link` → `react-router` `Link`, `next/image` is not used so no change):

| App Build file | Destination in `app/src/` | Port notes |
|---|---|---|
| `lib/supabase.ts` | `lib/supabase.ts` | Env var names change to `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` via `import.meta.env`. Types extended per §4. |
| `context/AuthContext.tsx` | `context/AuthContext.tsx` | Keep as-is (already uses `is_admin` RPC). Add `profile` loading per §5. |
| `context/CartContext.tsx` | `context/CartContext.tsx` | Keep as-is (localStorage `hh_cart`). |
| `context/WishlistContext.tsx` | `context/WishlistContext.tsx` | Complete the skeleton per §6. |
| `components/Navbar.tsx`, `Footer.tsx`, `CartDrawer.tsx`, `ProductCard.tsx`, `Toast.tsx` | `components/` same names | Port. `CategoryModal.tsx` is NOT ported — categories become real pages (§3). |
| `app/auth/page.tsx` | `pages/Auth.tsx` | Port OTP flow verbatim. |
| `app/checkout/page.tsx` | `pages/Checkout.tsx` | Port, then replace the bare `orders` insert with the `place_order` RPC (§4.6, §6.1). |
| `app/account/page.tsx` | `pages/account/Profile.tsx` + split | Split into account sub-pages (§3). |
| `app/admin/page.tsx` | `pages/admin/*` | Split the 4 tabs into routed admin pages (§3). |
| `app/page.tsx` | `pages/Home.tsx` | Port structure; **content/visual source of truth is `index.html`, not App Build** (§8). |
| `app/globals.css` | `styles/globals.css` | Port; it already maps the exact brand tokens into Tailwind 4 `@theme`. |
| `public/images/logo.jpg`, `public/images/upi-qr.jpg` | `public/images/` | **Copy the binary files byte-for-byte.** These are the only two static brand images and MUST be preserved. |

NOT salvaged: `@supabase/auth-helpers-nextjs` dependency (Next-only, drop it), Next config files, default Next SVGs in `public/`.

`App Build\` and `hijab_haven_final.html` remain on disk untouched as reference until cutover is complete (§10.4), then the owner may archive them.

---

## 2. System Topology

```
                         ┌─────────────────────────────────────────────┐
                         │                 NETLIFY (free)              │
                         │  Static hosting of app/dist (Vite build)    │
                         │  /* → /index.html 200  (SPA redirect)       │
                         └──────────────────┬──────────────────────────┘
                                            │ HTTPS (static assets)
            ┌───────────────────────────────┴───────────────────────────────┐
            │                        BROWSER (React SPA)                    │
            │                                                               │
            │  Customer surface                Admin surface                │
            │  /  /shop  /product/:id          /admin/* (client guard:      │
            │  /checkout /auth /account/*       isAdmin via is_admin RPC)   │
            │                                                               │
            │  Contexts: Auth · Cart(localStorage hh_cart) · Wishlist ·     │
            │            Toast                                              │
            └───────┬───────────────────────────────┬───────────────┬───────┘
                    │ supabase-js (anon key + RLS)   │               │
                    ▼                                ▼               ▼
   ┌────────────────────────────────┐   ┌────────────────────┐  ┌────────────────────┐
   │      SUPABASE (free tier)      │   │  WhatsApp deep     │  │  Google Fonts CDN  │
   │ tacjzpobeoxyrdrvazni.supabase.co│  │  links (wa.me/     │  │  Cormorant Garamond│
   │                                │   │  919820517390,     │  │  + Jost            │
   │  Postgres + RLS (security      │   │  chat.whatsapp.com │  └────────────────────┘
   │  boundary):                    │   │  group for hampers)│
   │   products, customers,         │   └────────────────────┘
   │   admin_users, user_profiles,  │      Order fulfilment & broadcast happen
   │   addresses, orders, wishlists │      IN WhatsApp (no API, zero cost).
   │  RPCs: is_admin, is_super_admin│      Payment = static UPI QR
   │   register_customer, place_order│     (9820517390@ptyes) — no gateway.
   │  Auth: email OTP (customers),  │
   │   email+password (admins)      │
   │  Storage: product-images bucket│
   └────────────────────────────────┘
```

**Security model in one sentence:** the browser holds only the publishable anon key (`sb_publishable_P3yvDhbFdSmDnxbgTSROrw_1ef6-TA4` — safe to ship); every privileged operation is enforced by Postgres RLS keyed on `auth.uid()`; client-side route guards are UX convenience only, never the security boundary.

---

## 3. Route Map

Router: `react-router` v7, `<BrowserRouter>`, route tree defined in `src/App.tsx`. Netlify SPA redirect makes deep links work.

### 3.1 Customer routes

| Route | Page component | Purpose | Auth guard | Data dependencies |
|---|---|---|---|---|
| `/` | `pages/Home.tsx` | Marketing home: gate overlay, hero, marquee, 6 category cards (link to `/shop/:category`), quote, hampers (static, WhatsApp-group enquire links), why-us, payment section, Instagram section | None. `<Gate>` overlay shows when `localStorage.hh_user` absent | `register_customer` RPC on gate submit; no product fetch needed on home |
| `/shop` | `pages/Shop.tsx` | All products, category filter chips (all/everyday/occasion/hampers/accessories/pastel/minimal) | None | `products` SELECT (public), cached per §9.2 |
| `/shop/:category` | `pages/Shop.tsx` (same component, param-driven) | Pre-filtered category view; replaces the old category modal | None. Invalid category → redirect `/shop` | same |
| `/product/:id` | `pages/Product.tsx` | Product detail: image, name, price ₹, description, stock state, add-to-cart, wishlist button | None | `products` SELECT by id; `wishlists` if logged in |
| `/checkout` | `pages/Checkout.tsx` | 3-step checkout: details → UPI QR pay → confirm + WhatsApp. Guest OR logged-in | None (guest checkout is a hard requirement). If logged in, prefills from profile + saved addresses | `place_order` RPC; `addresses` SELECT (own) when logged in |
| `/auth` | `pages/Auth.tsx` | Email OTP sign-in/sign-up (single flow). On success → upsert `user_profiles`, redirect to `from` location or `/` | Redirect to `/` if already logged in | `supabase.auth.signInWithOtp` / `verifyOtp`; `user_profiles` upsert |
| `/account` | `pages/account/Profile.tsx` | Profile (name, phone, email) + address book CRUD | `RequireAuth` → redirects `/auth` | `user_profiles` (own), `addresses` (own) |
| `/account/orders` | `pages/account/Orders.tsx` | Logged-in user's order history with status badges | `RequireAuth` | `orders` SELECT (own via RLS) |
| `/account/wishlist` | `pages/account/Wishlist.tsx` | Saved products | `RequireAuth` | `wishlists` joined to `products` |
| `*` | `pages/NotFound.tsx` | Branded 404 with link home | None | none |

**Cart is a drawer, not a route** (`components/CartDrawer.tsx`), exactly as the live site behaves. No `/cart` page. The drawer's checkout button navigates to `/checkout`.

**The entry gate is preserved exactly**: first visit shows the name+phone gate (copy, layout, and styling per `index.html` `#gate`); submit calls `register_customer(p_name, p_phone, p_joined_date)` RPC and stores `localStorage.hh_user = {"name":..., "phone":...}`; returning visitors never see it. It renders as an overlay inside the customer layout only — never on `/admin/*`.

> **V2 note:** superseded in part by §12.1-§12.2 - a splash screen now precedes the gate, and the gate becomes a signup form with a required email field (stored via `register_customer_v2`).

### 3.2 Admin routes

> **V2 note:** `/admin/login` is superseded by §12.3 - the route now permanently redirects to `/auth` (unified login); `RequireAdmin` redirects unauthenticated users to `/auth`. New admin routes `/admin/collections` and `/admin/settings` are added per §12.4-§12.5.

All admin routes except `/admin/login` are wrapped in `RequireAdmin` (§5.4). Layout: `pages/admin/AdminLayout.tsx` with sidebar nav (Dashboard, Orders, Products, Customers, Broadcast, Admins, Sign out). "Admins" nav item renders only for `super_admin`.

| Route | Page component | Purpose | Guard | Data dependencies |
|---|---|---|---|---|
| `/admin/login` | `pages/admin/Login.tsx` | Email + password sign-in. On success, verify `is_admin()` RPC; non-admins are signed out with error "Not an admin account" | Redirect to `/admin` if already admin | `supabase.auth.signInWithPassword`, `is_admin` RPC |
| `/admin` | `pages/admin/Dashboard.tsx` | Counts: pending orders, total orders, products, customers; 5 most recent orders | `RequireAdmin` | `orders` count by status, `products` count, `customers` count (all admin-RLS) |
| `/admin/orders` | `pages/admin/Orders.tsx` | Order list (newest first), filter by status, expand row → items, address, phone (with `wa.me` link to customer), status transition buttons per lifecycle §6.3 | `RequireAdmin` | `orders` SELECT all, UPDATE status |
| `/admin/products` | `pages/admin/Products.tsx` | Product table + "Add product" panel (name, price, category select, description, stock, image upload to `product-images` bucket) + edit + delete. Mirrors the current admin "add/manage" tabs | `RequireAdmin` | `products` CRUD, Storage upload |
| `/admin/customers` | `pages/admin/Customers.tsx` | Gate-signup list (name, phone, joined) + client-side CSV export (same columns as today) | `RequireAdmin` | `customers` SELECT |
| `/admin/broadcast` | `pages/admin/Broadcast.tsx` | Compose message, customer checklist (select all / individual), "Send next →" opens `https://wa.me/91<phone>?text=<msg>` per customer sequentially (WhatsApp has no free bulk API; this preserves today's manual broadcast) | `RequireAdmin` | `customers` SELECT |
| `/admin/admins` | `pages/admin/Admins.tsx` | List admins; super_admin can add (by auth user UUID + email) / remove / change role. UI hides itself for plain `admin` (RLS enforces regardless) | `RequireAdmin` + client check `role === 'super_admin'` | `admin_users` CRUD (super-RLS) |

---

## 4. Database Schema & Migration

### 4.1 Principles

- **Additive + non-breaking**: the live `index.html` site keeps working against the same Supabase project throughout the build. Nothing here renames or drops `products`, `customers`, `admin_users`, the storage bucket, or `register_customer`.
- **Idempotent**: the entire migration in §4.7 can be re-run safely in the Supabase SQL editor (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` before every `CREATE POLICY`).
- **`items` as JSONB on `orders`, not an `order_items` table** (FINAL): order lines are immutable price/name snapshots at purchase time; nothing ever queries individual lines relationally at this scale (a few orders/day); JSONB removes a join, a table, and four RLS policies. Trade-off accepted: no SQL aggregation over line items — if "top products sold" reporting is ever needed, `jsonb_array_elements` can still do it.

### 4.2 The admin_users RLS recursion bug (must fix)

`supabase_setup.sql` lines 30–32 define on `admin_users`:
```sql
USING (auth.uid() IN (SELECT id FROM admin_users))
```
A policy on `admin_users` that SELECTs `admin_users` re-triggers its own policy → infinite recursion → every admin check errors. **Fix**: route all admin checks through the existing `SECURITY DEFINER` function `is_admin()` (definer runs as table owner, bypassing RLS, breaking the cycle), add `is_super_admin()` the same way, and rewrite EVERY policy that contains `IN (SELECT id FROM admin_users)` — on `admin_users`, `products`, `customers`, and `storage.objects` — to use the functions. This also makes policies faster (one stable function call vs. a subquery per row).

### 4.3 Final table inventory

| Table | Status | Purpose |
|---|---|---|
| `products` | exists — ALTER | catalog. **Add** `stock INTEGER NULL` (NULL = untracked/always purchasable; ≥0 = tracked; 0 = out of stock) and an id default sequence (today the live site generates ids client-side with `Date.now()`; new admin UI must not have to) |
| `customers` | exists — unchanged | gate signups (name+phone), broadcast list |
| `admin_users` | exists — policies rewritten | RBAC: `admin`, `super_admin` |
| `user_profiles` | **new** | customer account profile (1:1 auth.users) |
| `addresses` | **new** | customer address book |
| `orders` | **new** | persisted orders, guest or account, status lifecycle |
| `wishlists` | **new** | account wishlist |

### 4.4 Orders design

- `user_id UUID NULL` — NULL for guest orders. Guests are identified to the shop by `customer_phone` + the WhatsApp thread (same as today); guest orders are visible to admins only. We deliberately do NOT auto-claim guest orders into a later-created account by phone match — phone is unverified, that would leak strangers' orders. (Seam: if phone verification is ever added, claiming becomes safe; not built now.)
- `order_code TEXT` — human-friendly id `HH-00042` (`'HH-' || lpad(id::text, 5, '0')`), generated inside `place_order`, included in the WhatsApp message so owner and DB reconcile trivially.
- Status lifecycle (CHECK-enforced): `pending → confirmed → shipped → delivered`, with `cancelled` reachable from `pending` or `confirmed`. Transition rules are enforced in admin UI (§6.3); DB CHECK enforces the value set.
- **Inserts happen ONLY through the `place_order` RPC** (SECURITY DEFINER). There is intentionally NO INSERT policy on `orders`: clients cannot insert rows directly, so prices/totals cannot be forged — the RPC re-reads prices from `products` server-side and decrements tracked stock atomically.

### 4.5 Permission matrix (target)

| Resource | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| products | anyone | admin | admin | admin |
| customers | admin | anyone (via RPC or direct insert, as today) | admin | admin |
| admin_users | admin (via fn) | super_admin | super_admin | super_admin |
| user_profiles | owner, admin | owner | owner | — |
| addresses | owner | owner | owner | owner |
| orders | owner (own rows), admin (all) | — (RPC only) | admin | — |
| wishlists | owner | owner | owner | owner |
| storage `product-images` | anyone | admin | admin | admin |

> **V2 note:** §12.9 adds matrix rows for `collections`, `shop_settings`, and storage `payment-proofs`, and removes the products.category CHECK constraint.

### 4.6 `place_order` contract (the only write path for orders)

```
place_order(
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_address JSONB,          -- {full_name, phone, address_line1, address_line2, city, state, pincode} (free-text guest address maps line1)
  p_items JSONB             -- [{"product_id": 123, "quantity": 2}, ...]
) RETURNS JSONB             -- {"order_id": 42, "order_code": "HH-00042", "total": 1198}
```
Validation inside the function (raise EXCEPTION with the listed message; client maps to toasts §9):
- empty/invalid items → `EMPTY_ORDER`
- quantity not in 1..50 → `BAD_QUANTITY`
- unknown product_id → `UNKNOWN_PRODUCT`
- tracked stock insufficient → `OUT_OF_STOCK:<product name>`

It snapshots `{product_id, name, price, quantity, image_url}` per line from the `products` table, computes total server-side, decrements stock where tracked, inserts with `user_id = auth.uid()` (NULL for anon), and sets `order_code`. `GRANT EXECUTE TO anon, authenticated`.

### 4.7 THE MIGRATION (run verbatim in Supabase SQL editor; idempotent)

The implementing engineer must save this exact SQL as `C:\Users\ARIF\Desktop\Hijab Haven\app\supabase\migrations\001_rebuild.sql` and run it once in the SQL editor of project `tacjzpobeoxyrdrvazni`:

```sql
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
```

**Post-migration verification (the engineer running §4.7 MUST execute and report results):**
```sql
SELECT is_admin();                                       -- false (run as SQL editor anon role check via API instead if needed)
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';  -- all true
SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename;
-- And from the app with anon key: SELECT on products succeeds; SELECT on customers returns 0 rows;
-- direct INSERT into orders fails; place_order with a real product id succeeds and returns order_code.
```

**Dashboard configuration (one-time, manual, owner or devops agent):**
1. Authentication → Providers → Email: keep Email enabled; OTP expiry 600s. Password sign-in stays enabled (admins use it).
2. Authentication → URL Configuration: Site URL `https://hijab-haven.netlify.app`; Redirect URLs `https://hijab-haven.netlify.app/**` and `http://localhost:5173/**`.
3. Create the owner's admin auth user (email+password) in Authentication → Users, then:
   `INSERT INTO admin_users (id, email, display_name, role) VALUES ('<that uuid>', '<owner email>', 'Shop Owner', 'super_admin') ON CONFLICT (id) DO UPDATE SET role='super_admin';`

---

## 5. Auth & RBAC Design

### 5.1 Three actor classes (FINAL decision)

1. **Guest (default, conversion-critical)** — sees the gate once (name+phone → `customers` table + `localStorage.hh_user`), browses, carts, and checks out without any account. This is today's entire flow and MUST remain frictionless: a WhatsApp-driven shop dies if signup is forced.
2. **Customer account (optional)** — **email OTP** (6-digit code), no passwords. Chosen over email+password because: zero password-reset support burden for the owner, App Build already implements it (`pages/Auth.tsx` port), and Supabase free tier includes OTP email sends. Benefit to the customer: order history, saved addresses, wishlist, prefilled checkout. The UI nudges ("Sign in to track your order") but never blocks.
3. **Admin** — Supabase email+**password** (`signInWithPassword`) at `/admin/login`, authorized by membership in `admin_users`. Role `super_admin` additionally manages the admin list. The PIN `1226` is gone; the admin overlay becomes the routed `/admin` area.

   > **V2 note:** superseded by §12.3 - `/admin/login` is removed as a surface; admins sign in at `/auth` (OTP by default, or the password toggle).

### 5.2 Flow: guest gate
```
First visit → no localStorage.hh_user → <Gate> overlay (exact #gate design)
 → submit(name, phone) → rpc register_customer(name, phone, joined_date)  [fire-and-forget; failure tolerated §9]
 → localStorage.hh_user = {name, phone} → overlay closes, never shown again on this device
```

### 5.3 Flow: customer sign-in (OTP)
```
/auth → enter email → supabase.auth.signInWithOtp({email})
     → enter 6-digit code → verifyOtp({email, token, type:'email'})
     → upsert user_profiles {id, email}  → navigate back (location.state.from ?? '/')
AuthContext: getSession() on mount + onAuthStateChange subscription
           → on session: rpc('is_admin') → isAdmin flag; fetch own user_profiles row → profile
```
Sign-out: `supabase.auth.signOut()` from Navbar account menu.

### 5.4 Route guards (UX) vs RLS (security)

**RLS is the security boundary. Client guards are convenience only.** Even if an attacker forces `/admin/orders` to render, every query returns zero rows / permission errors without a session whose `auth.uid()` is in `admin_users`. State this in code comments.

- `components/guards/RequireAuth.tsx`: while `isLoading` → full-page spinner; if no `user` → `<Navigate to="/auth" state={{from: location}}>`; else render `<Outlet/>`.
- `components/guards/RequireAdmin.tsx`: while `isLoading` → spinner; if no `user` OR `!isAdmin` → `<Navigate to="/admin/login">`; else `<Outlet/>`.
- `/admin/admins` additionally checks `profileRole === 'super_admin'` (fetched from `admin_users` SELECT of own row — readable because `is_admin()` is true); plain admins see "Super admin only". RLS enforces the writes regardless.

### 5.5 Role check data flow

`AuthContext` exposes: `user`, `session`, `profile` (user_profiles row or null), `isAdmin: boolean`, `adminRole: 'admin' | 'super_admin' | null`, `isLoading`, `signOut()`. `isAdmin` comes from `rpc('is_admin')`; `adminRole` from `select role from admin_users where id = user.id` (single row, only succeeds for admins).

---

## 6. Sequence Flows — 5 Critical Journeys

### 6.1 Guest: browse → cart → checkout
```
Guest        SPA                     Supabase                    WhatsApp
  │  /shop    │                          │                          │
  │──────────▶│ select * from products   │                          │
  │           │─────────────────────────▶│ (public RLS)             │
  │           │◀───────── products ──────│                          │
  │ add to cart (CartContext → localStorage hh_cart)                │
  │ open CartDrawer → "Checkout" → /checkout                        │
  │ STEP 1: name (prefill hh_user.name), WhatsApp phone             │
  │         (prefill hh_user.phone), address  → validate non-empty  │
  │ STEP 2: show /images/upi-qr.jpg + UPI ID 9820517390@ptyes       │
  │         + amount ₹total. Button "I've Paid — Confirm Order"     │
  │──────────▶│ rpc place_order(name, phone, {address...}, items)   │
  │           │─────────────────────────▶│ validate, snapshot,      │
  │           │                          │ stock--, insert,         │
  │           │◀── {order_code, total} ──│ return HH-000NN          │
  │ STEP 3: success screen; after 800ms open                        │
  │         wa.me/919820517390?text=<order message incl. order_code>│
  │           │─────────────────────────────────────────────────────▶
  │ clearCart() on "Continue shopping"                              │
```
WhatsApp message format (exact, ported from App Build checkout, with `order_code` added):
```
🧕 *New Order — Hijab Haven*

*Order:* HH-000NN
*Customer:* <name>
*WhatsApp:* <phone>
*Address:* <address>

*Items:*
• <name> × <qty> = ₹<line total>
...

*Total: ₹<total>*

_Payment via UPI: 9820517390@ptyes_
```
Failure path: if `place_order` throws, STILL advance to step 3 and open WhatsApp with the same message minus the order line (business continuity — the WhatsApp order IS the order, DB persistence is the new bonus), and show toast "Order sent on WhatsApp; saving to our system failed — the owner will record it manually." (§9.4).

> **V2 note:** per §12.5-§12.6, step 2 QR/UPI now come from `shop_settings` (baked-in values remain the fallback), `place_order` v2 also returns `payment_ref`, and step 3 gains an optional payment-proof upload.

### 6.2 Logged-in checkout (delta from 6.1)
```
STEP 1 prefills from profile (full_name, phone) and renders saved addresses
as selectable cards (addresses SELECT own) + "new address" form; optional
"save this address" checkbox → INSERT into addresses.
place_order runs with auth.uid() ≠ NULL → order owned by user.
After success, step 3 shows "Track it in My Orders" link → /account/orders.
/account/orders lists own orders (RLS user_id = auth.uid()) with status badges:
pending=sand, confirmed=blush, shipped=rose, delivered=mocha, cancelled=warm.
```

### 6.3 Order lifecycle (admin)
```
Admin → /admin/login (email+password) → is_admin() true → /admin/orders
  │ select * from orders order by created_at desc  (admin RLS)
  │ filter chips: all | pending | confirmed | shipped | delivered | cancelled
  │ expand order → items, address, customer phone (wa.me link), admin_note
  │ allowed transitions (UI enforces; update via UPDATE orders SET status=...):
  │    pending   → [Confirm] [Cancel]
  │    confirmed → [Mark Shipped] [Cancel]
  │    shipped   → [Mark Delivered]
  │    delivered, cancelled → terminal (no buttons)
  │ Cancel on a stock-tracked order does NOT auto-restock (manual stock edit
  │ in /admin/products; auto-restock is a flagged future seam, not built).
  │ Each transition → optimistic UI + toast; on error revert + error toast.
```

### 6.4 Product CRUD (admin)
```
/admin/products
  ADD: form {name, price, category(select of 6), description, stock(blank = untracked), image file}
    1. upload file → storage.from('product-images').upload(`products/${Date.now()}_${slug(file.name)}`, file)
       (admin RLS on storage.objects)
    2. getPublicUrl(path) → image_url
    3. insert into products {name, price, category, description, image_url, stock,
       created_by: user.id}   -- id comes from products_id_seq default now
  EDIT: same form prefilled; image optional (keep old image_url if no new file)
  DELETE: confirm dialog → delete row; then best-effort storage.remove([old path])
          parsed from image_url (failure tolerated — orphan files are cosmetic).
  List refetches after each mutation (no client cache invalidation cleverness).
```

### 6.5 Customer broadcast (admin)
```
/admin/broadcast
  │ select name, phone from customers (admin RLS)
  │ compose textarea + live preview; checklist of customers (default all checked)
  │ "Start broadcast" → for the Nth checked customer, button shows
  │   "Open chat N of M — <name>" → window.open('https://wa.me/91<phone>?text=' + enc(msg))
  │   → advance to N+1. (WhatsApp offers no free bulk-send API; this preserves
  │   today's manual one-tap-per-customer flow with progress tracking.)
  │ /admin/customers offers the same list + "Export CSV": client-side Blob
  │   download `hijab-haven-customers.csv` with header name,phone,joined_date.
```

---

## 7. Folder Structure & Component Inventory (exact)

```
C:\Users\ARIF\Desktop\Hijab Haven\
├── index.html                  # LIVE legacy site — untouched until cutover (§10.4)
├── supabase_setup.sql          # historical reference — untouched
├── App Build\                  # salvage source — untouched
├── docs\
│   └── ARCHITECTURE.md         # this file
├── netlify.toml                # repo root (§10.1)
└── app\                        # ★ THE CANONICAL APP (new Vite project)
    ├── package.json            # deps: react, react-dom, react-router, @supabase/supabase-js
    │                           # dev: vite, @vitejs/plugin-react, typescript, tailwindcss,
    │                           #      @tailwindcss/vite, eslint, vitest
    ├── vite.config.ts          # plugins: react(), tailwindcss()
    ├── tsconfig.json           # strict: true, paths: {"@/*": ["./src/*"]}
    ├── index.html              # Vite entry: fonts <link> (§8.2), title "Hijab Haven",
    │                           # meta description + OG tags (og:image = /images/logo.jpg)
    ├── .env.local              # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (gitignored;
    │                           # anon key is publishable, but keep the habit)
    ├── .env.example            # same keys with the real public values (anon key is safe)
    ├── public\
    │   └── images\
    │       ├── logo.jpg        # byte-copied from App Build\public\images\
    │       └── upi-qr.jpg      # byte-copied from App Build\public\images\
    ├── supabase\
    │   └── migrations\
    │       └── 001_rebuild.sql # exact SQL from §4.7
    └── src\
        ├── main.tsx            # ReactDOM.createRoot; BrowserRouter; providers:
        │                       # AuthProvider > CartProvider > WishlistProvider > ToastProvider
        ├── App.tsx             # <Routes> tree per §3; CustomerLayout vs AdminLayout split
        ├── styles\
        │   └── globals.css     # §8.1 — tokens, @theme, keyframes, utility classes
        ├── lib\
        │   ├── supabase.ts     # client + ALL shared types (Product, Customer, UserProfile,
        │   │                   # Address, Order, OrderItem, WishlistItem, AdminUser,
        │   │                   # CATEGORIES const, CategoryKey) — extended from App Build
        │   ├── queries.ts      # typed data access: fetchProducts(), fetchProduct(id),
        │   │                   # placeOrder(input), fetchMyOrders(), fetchAllOrders(),
        │   │                   # updateOrderStatus(), product CRUD, customers, broadcast list,
        │   │                   # admin_users CRUD, uploadProductImage(file)
        │   ├── format.ts       # inr(n) → "₹1,198" (Intl.NumberFormat en-IN, no decimals),
        │   │                   # formatDate(ts) → "11 Jun 2026"
        │   └── whatsapp.ts     # buildOrderMessage(order parts) per §6.1; OWNER_WA = '919820517390';
        │                       # HAMPER_GROUP_URL = 'https://chat.whatsapp.com/LWnsTUxGY4G9hmpFCEC06R';
        │                       # waLink(phone, msg)
        ├── context\
        │   ├── AuthContext.tsx       # ported + profile/adminRole per §5.5
        │   ├── CartContext.tsx       # ported as-is (localStorage hh_cart)
        │   ├── WishlistContext.tsx   # completed: load on login, toggle(productId), has(productId)
        │   └── ToastContext.tsx      # showToast(message, kind: 'success'|'error'|'info')
        ├── components\
        │   ├── Gate.tsx              # entry gate overlay (§3.1), exact #gate design
        │   ├── Navbar.tsx            # ported; links: Home, Shop, Hampers(/#hampers),
        │   │                         # Payment(/#payment); cart button w/ count; account/auth icon;
        │   │                         # hamburger mobile menu (parity with live #mobileNav)
        │   ├── Footer.tsx            # ported
        │   ├── CartDrawer.tsx        # ported; checkout → navigate('/checkout')
        │   ├── ProductCard.tsx       # ported + stock badge ("Out of stock" overlay when stock===0,
        │   │                         # disables add-to-cart) + wishlist heart (logged-in only)
        │   ├── Toast.tsx             # ported
        │   ├── LoadingSpinner.tsx    # rose spinner, animate-spin-slow
        │   ├── ErrorBlock.tsx        # message + Retry button (§9)
        │   ├── ConfirmDialog.tsx     # used by admin deletes/cancels
        │   ├── StatusBadge.tsx       # order status pill, colors per §6.2
        │   └── guards\
        │       ├── RequireAuth.tsx   # §5.4
        │       └── RequireAdmin.tsx  # §5.4
        └── pages\
            ├── Home.tsx              # gate + hero + marquee + categories + quote + hampers
            │                         # + why + payment + instagram (content verbatim §8.3)
            ├── Shop.tsx              # /shop and /shop/:category
            ├── Product.tsx           # /product/:id
            ├── Checkout.tsx          # 3-step (§6.1/6.2)
            ├── Auth.tsx              # OTP (ported)
            ├── NotFound.tsx
            ├── account\
            │   ├── AccountLayout.tsx # tabs: Profile | Orders | Wishlist
            │   ├── Profile.tsx
            │   ├── Orders.tsx
            │   └── Wishlist.tsx
            └── admin\
                ├── Login.tsx
                ├── AdminLayout.tsx   # sidebar shell (§3.2)
                ├── Dashboard.tsx
                ├── Orders.tsx
                ├── Products.tsx
                ├── Customers.tsx
                ├── Broadcast.tsx
                └── Admins.tsx
```

State management decision (FINAL): **React Contexts only** (Auth, Cart, Wishlist, Toast) + per-page `useEffect` fetching via `lib/queries.ts`. No Redux/Zustand/React-Query — at ~15 pages and a handful of entities they add dependency weight without solving a problem this app has.

Cart persistence & merge (FINAL): cart lives in `localStorage.hh_cart` for everyone, guest or logged-in. There is no server-side cart, therefore **login "merge" is a no-op by design** — the device cart simply survives the login transition untouched (the key never changes). This is the simplest correct behavior; a DB cart synced across devices is explicitly out of scope (no requirement supports it).

Wishlist (FINAL): DB-backed (`wishlists` table), logged-in users only. Guests tapping the heart get a toast "Sign in to save favourites" with a link to `/auth`. No localStorage wishlist (avoids a real merge problem for marginal value).

---

## 8. Design-Token Preservation Plan

The brand must survive byte-exact. **`index.html` (live site) is the visual source of truth** — App Build is structurally useful but where they differ, the live site wins.

### 8.1 `src/styles/globals.css` (exact token block)

```css
@import "tailwindcss";

:root {
  --rose: #c9897a;
  --blush: #f0d9d0;
  --cream: #faf6f3;
  --mocha: #4a2e26;
  --sand: #e8d5c4;
  --warm: #8b5e52;
}

@theme {
  --color-rose: #c9897a;
  --color-blush: #f0d9d0;
  --color-cream: #faf6f3;
  --color-mocha: #4a2e26;
  --color-sand: #e8d5c4;
  --color-warm: #8b5e52;
  --font-heading: 'Cormorant Garamond', serif;
  --font-body: 'Jost', sans-serif;
}

@layer base {
  body { font-family: var(--font-body); background: var(--color-cream); color: var(--color-mocha); overflow-x: hidden; }
  html { scroll-behavior: smooth; }
}

/* keyframes ported verbatim from App Build globals.css:
   fadeIn, popIn, spin, float, marquee — plus utility classes
   .animate-fade-in .animate-pop-in .animate-spin-slow .animate-float
   .animate-float-delay .animate-marquee .font-heading */
```

### 8.2 Fonts — exact `<link>` in `app/index.html` `<head>` (identical to live site)

```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
```

### 8.3 Content preservation (verbatim port checklist for the UI engineer)

Port the following text/content blocks **character-for-character** from `index.html` into the corresponding components (open the live file, copy the strings — do not paraphrase):

| Live section (id/area in index.html) | Destination | Notes |
|---|---|---|
| `#gate` (heading, body copy, labels, note) | `components/Gate.tsx` | brand "Hijab Haven", gate tag "✦ Navi Mumbai · Online Store" (live copy — corrected per QA WP-12 D1; "Elegance in Every Drape" is the brand tagline used in meta/OG, not the gate) |
| nav + `#mobileNav` | `components/Navbar.tsx` | logo circle = `/images/logo.jpg` |
| `#hero` (badge, title with `<em>`, sub, buttons, orbs) | `pages/Home.tsx` | |
| marquee: `Hijabs ✦ Hampers ✦ Accessories ✦ Online Payments Only ✦ Navi Mumbai ✦ Hijab & Happiness ✦` (duplicated for loop) | `pages/Home.tsx` | 22s linear loop |
| `#categories` — 6 cards (everyday, occasion, hampers, accessories, pastel, minimal) with their icons/copy | `pages/Home.tsx` cards now `<Link to="/shop/<key>">` | card visuals unchanged; behavior changes from modal to page |
| quote section | `pages/Home.tsx` | |
| `#hampers` — "✦ Gift with Love", "Curated *Hampers*", 3 cards: **Blossom Hamper** (Most Loved), **Celebration Set** (Bestseller), **Royal Hamper** (Luxury Pick), each "Enquire →" linking `https://chat.whatsapp.com/LWnsTUxGY4G9hmpFCEC06R` | `pages/Home.tsx` | static, no prices, no cart — exactly as live |
| `#why` — "Hijab & *Happiness*", 4 numbered items (Handpicked Quality / Based in Navi Mumbai / Secure Online Payments / Growing Community) | `pages/Home.tsx` | |
| `#payment` — static UPI QR `/images/upi-qr.jpg`, UPI ID `9820517390@ptyes` | `pages/Home.tsx` + reused in `Checkout.tsx` step 2 | |
| `#instagram` — handle `instagram.com/_hijab__haven_`, mocha→warm gradient band | `pages/Home.tsx` | |
| footer | `components/Footer.tsx` | |

> **V2 note:** the `#payment` row above is superseded by §12.8 - the section and the Navbar Payment link are removed; QR/UPI render only in Checkout from `shop_settings`.

QA acceptance for design (§11 WP-12): side-by-side screenshot comparison of live vs rebuilt home at 390px and 1440px widths — colors, fonts, spacing, copy must be indistinguishable.

---

## 9. Error Handling & Resilience

### 9.1 Principles
- Every Supabase call goes through `lib/queries.ts`, which returns `{ data, error }` style results or throws typed `Error` with the RPC's message codes; **no swallowed errors** — every failure surfaces a toast and/or an `ErrorBlock`.
- Every page that fetches has three explicit states: loading (`LoadingSpinner` or skeleton cards on `/shop`), error (`ErrorBlock` with Retry that re-invokes the fetch), success.

### 9.2 Product catalog fallback (stale-while-revalidate)
On successful `fetchProducts()`, write the array to `localStorage.hh_products` (the live site already uses this key — same shape, harmless overlap). On fetch failure, if `hh_products` exists, render it with a dismissible banner "Showing recently viewed catalogue — refresh to retry"; if absent, `ErrorBlock`. This keeps the shop browsable through transient Supabase free-tier hiccups (free projects pause after 7 days of inactivity — see §10.5).

### 9.3 RPC error mapping (Checkout)
| RPC exception | User-facing toast |
|---|---|
| `EMPTY_ORDER` | "Your cart looks empty — please re-add items." |
| `BAD_QUANTITY` | "Quantity must be between 1 and 50." |
| `UNKNOWN_PRODUCT` | "An item in your cart is no longer available. It was removed." (also remove it from cart) |
| `OUT_OF_STOCK:<name>` | "<name> just sold out. Please adjust your cart." |
| `MISSING_CONTACT` | "Please fill your name and WhatsApp number." |
| network/other | proceed to WhatsApp anyway per §6.1 failure path |

### 9.4 Business-continuity rule (binding)
The WhatsApp order message is the commercially critical artifact. **No Supabase failure may ever block the customer from reaching step 3 and opening the WhatsApp deep link.** DB persistence is best-effort on the customer path, mandatory-by-default but degradable.

### 9.5 Auth edge cases
- Expired/invalid OTP → inline error (ported behavior), "Use a different email" reset.
- Admin session expires mid-task → next query returns RLS error → `AuthContext` `onAuthStateChange` fires → `RequireAdmin` redirects to `/admin/login`; unsaved form state loss is accepted (low stakes, small forms).
- `is_admin` RPC failure → treated as `isAdmin=false` (fail closed).

### 9.6 Uploads
Image upload failures show the storage error message and keep the form filled; product insert only proceeds after a successful upload (no products with broken `image_url`). 5 MB/type limits are enforced by the bucket config; mirror the check client-side for a friendlier message.

---

## 10. Deployment Architecture (Netlify)

### 10.1 `C:\Users\ARIF\Desktop\Hijab Haven\netlify.toml` (repo root — exact contents)

```toml
[build]
  base    = "app"
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "22"

[[redirects]]
  from = "/*"
  to   = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### 10.2 Environment variables (set in Netlify UI → Site settings → Environment, and in `app/.env.local` for dev)
```
VITE_SUPABASE_URL=https://tacjzpobeoxyrdrvazni.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_P3yvDhbFdSmDnxbgTSROrw_1ef6-TA4
```
The anon key is a publishable key protected by RLS — committing it in `.env.example` is acceptable; no service-role key exists anywhere in this architecture (and none may ever be added to frontend code).

### 10.3 Build pipeline
`npm ci && npm run build` in `app/` → `app/dist/` static output. Local verification loop for every WP: `npm run dev` (port 5173), `npx tsc --noEmit`, `npm run lint`, `npm run build`.

### 10.4 Staging → cutover plan
1. Create a SECOND Netlify site (free), e.g. `hijab-haven-staging`, connected to the same repo/folder with the §10.1 config. The existing production site continues serving the legacy root `index.html` untouched.
2. Run the §4.7 migration (it is non-breaking for the legacy site — verified by the policy-compatibility analysis in §4.2/§4.7: public product reads, customer gate inserts, and admin product CRUD semantics are preserved).
3. QA signs off on staging (WP-12).
4. Cutover: point the production `hijab-haven.netlify.app` site at the same build config (set base/command/publish per §10.1). Legacy `index.html` stays in the repo but is no longer served. Rollback = revert the production site's build settings (minutes).
5. Post-cutover: Supabase Auth Site URL already points at production (§4.7 dashboard step 2).

### 10.5 Free-tier operating notes (document for the owner in README)
- Supabase free projects **pause after ~7 days with zero activity**; the shop's own traffic prevents this, but after any long quiet period the owner may need one click ("Restore") in the Supabase dashboard. §9.2's cached catalogue keeps the storefront readable meanwhile.
- Netlify free: 100 GB bandwidth/mo, 300 build minutes/mo — orders of magnitude above this site's needs.

---

## 11. Implementation Work Packages

Execute strictly in dependency order. One engineer agent per WP. Every WP ends with the stated verification, plus the standing loop: `npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` succeeds.

| # | Tag | Work package | Depends on | Contents & acceptance |
|---|---|---|---|---|
| **WP-01** | [devops] | **Scaffold & tokens** | — | Create `app/` (Vite react-ts template); install deps per §7; `vite.config.ts` with react + tailwindcss plugins; `tsconfig` strict + `@/*` alias; `styles/globals.css` per §8.1; fonts link + meta/OG in `app/index.html` per §8.2; copy `logo.jpg`/`upi-qr.jpg`; `.env.local`/`.env.example` per §10.2; root `netlify.toml` per §10.1. ✔ `npm run dev` shows a cream page with both fonts loading; build passes. |
| **WP-02** | [api/data] | **Database migration** | — (parallel with WP-01) | Save §4.7 SQL verbatim to `app/supabase/migrations/001_rebuild.sql`; run in Supabase SQL editor; perform §4.7 dashboard steps incl. super_admin seed; run ALL verification queries and an anon-key smoke test (products SELECT ok, customers SELECT empty, direct orders INSERT rejected, `place_order` happy-path returns an `order_code`). ✔ Legacy live site still functions (gate signup + product display spot-check). |
| **WP-03** | [core] | **App shell: lib, contexts, router, guards, chrome** | WP-01, WP-02 | `lib/supabase.ts` (ported+extended types), `lib/queries.ts`, `lib/format.ts`, `lib/whatsapp.ts`; contexts Auth/Cart/Wishlist/Toast per §5.5/§7; `App.tsx` full route tree with placeholder-free minimal pages rendering real layout chrome; guards per §5.4; Navbar, Footer, CartDrawer, Toast, LoadingSpinner, ErrorBlock, StatusBadge, ConfirmDialog. ✔ Routing works incl. deep links; guard redirects verified logged-out. |
| **WP-04** | [ui] | **Home page + Gate** | WP-03 | `pages/Home.tsx` + `components/Gate.tsx` with ALL sections content-verbatim per §8.3; gate → `register_customer` + `hh_user`. ✔ Screenshot parity vs live at 390/1440px; gate row appears in `customers` table. |
| **WP-05** | [ui] | **Shop / category / product pages** | WP-03 | `Shop.tsx` (filter chips, `/shop/:category`), `Product.tsx`, `ProductCard` stock badge + wishlist heart; §9.2 catalogue cache. ✔ Category filtering matches the 6 keys; out-of-stock product cannot be added to cart; offline-Supabase simulation shows cached catalogue banner. |
| **WP-06** | [core] | **Checkout** | WP-03, WP-05 | 3-step flow per §6.1/§6.2 incl. prefills, saved-address picker for logged-in, `place_order` integration, §9.3 error map, §9.4 continuity rule, exact WhatsApp message format. ✔ Guest order: row in `orders` with NULL user_id + correct snapshot/total + WhatsApp opens with order_code; logged-in order owned by user; stock decremented on a tracked product. |
| **WP-07** | [core] | **Customer auth & account area** | WP-03 | `Auth.tsx` (OTP, ported), `account/AccountLayout|Profile|Orders|Wishlist`, addresses CRUD, WishlistContext completion. ✔ OTP round-trip works on staging Supabase; `/account/orders` shows only own orders; wishlist toggle persists across reload. |
| **WP-08** | [core] | **Admin login + shell** | WP-03 | `admin/Login.tsx` (password auth + is_admin verification + non-admin signout path), `AdminLayout.tsx` sidebar, `Dashboard.tsx` counts + recent orders. ✔ Non-admin account is rejected with the exact error; deep link `/admin/orders` logged-out lands on `/admin/login` then returns. |
| **WP-09** | [api/data][ui] | **Admin products CRUD** | WP-08 | `admin/Products.tsx` per §6.4 incl. storage upload, edit, delete + best-effort image cleanup, stock field semantics (blank=NULL). ✔ Created product appears on `/shop` AND on the legacy live site (shared table); id auto-generated by sequence. |
| **WP-10** | [ui] | **Admin orders lifecycle** | WP-08, WP-06 | `admin/Orders.tsx` per §6.3: filters, expansion, transition buttons with allowed-transition matrix, admin_note editing, wa.me customer link. ✔ Full lifecycle pending→confirmed→shipped→delivered exercised; cancelled is terminal; customer sees updated status in `/account/orders`. |
| **WP-11** | [ui] | **Customers, broadcast, admins mgmt** | WP-08 | `admin/Customers.tsx` (+CSV per §6.5), `admin/Broadcast.tsx` (sequential wa.me flow), `admin/Admins.tsx` (super_admin CRUD; plain-admin sees read-only with notice). ✔ CSV downloads with header `name,phone,joined_date`; broadcast opens correct `wa.me/91<phone>` links in order; role checks verified with a second (plain admin) test account. |
| **WP-12** | [qa] | **System QA & security verification** | WP-04…WP-11 | Execute all 5 journeys of §6 end-to-end on staging; §8.3 screenshot parity check; RLS audit from an anon client AND a customer client (customers table unreadable, others' orders unreadable, direct order insert rejected, storage write rejected); mobile pass at 390px on every route; Lighthouse run (no regressions vs legacy on performance). Defects filed back to owning WPs; WP-12 re-runs until clean. |
| **WP-13** | [devops] | **Staging deploy & production cutover** | WP-12 | Staging Netlify site per §10.4 steps 1–3 (done early, kept updated); cutover steps 4–5; post-cutover smoke test (gate, order, admin login on production URL); write `app/README.md` for the owner: env vars, how to add an admin, §10.5 free-tier notes, rollback procedure. ✔ Production serves the new app; an end-to-end real order is placed and visible in `/admin/orders`. |

Parallelism: WP-01 ∥ WP-02. After WP-03: WP-04 ∥ WP-05 ∥ WP-07 ∥ WP-08. WP-06 after WP-05; WP-09/10/11 after WP-08 (WP-10 also needs WP-06). One agent edits a given file at a time — the WP boundaries above are also file-ownership boundaries.

---

## 12. V2 Delta (BINDING)

Status: **APPROVED / BINDING**, same force as §1–§11. V1 sections remain authoritative except where a "V2 note" marks supersession. All V1 constraints still bind: zero cost (Supabase free + Netlify free), RLS as the security boundary, anon key only in the frontend, frictionless guest checkout, the §9.4 WhatsApp continuity rule, brand tokens unchanged, and the live legacy `index.html` must keep working (migrations additive + idempotent). **Migration 001 has NOT yet been run by the owner** — 002 (§12.9) is written to run immediately after 001 in one sitting; nothing in 002 assumes any state beyond `supabase_setup.sql` + 001.

### 12.1 Splash screen

New component `src/components/Splash.tsx`, rendered as the FIRST child of `CustomerLayout` in `App.tsx` (above `<Gate />`).

- **Visual**: full-viewport fixed overlay, `z-[10001]` (above the gate's `z-[9999]`), brand gradient `bg-gradient-to-br from-mocha to-warm`. Centered column: the logo `/images/logo.jpg` in a 110px circle (same border treatment as the gate head: `border-4 border-white/30`, soft shadow) with a blink/pulse animation; beneath it the wordmark "Hijab Haven" in `font-heading` white; beneath that a progress bar — 180×3px track in `bg-white/20` rounded, fill `bg-rose` animating 0→100% width.
- **Keyframes** (added to `styles/globals.css`):
  ```css
  @keyframes splash-blink { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(1.04); } }
  @keyframes splash-bar   { from { width: 0% } to { width: 100% } }
  .animate-splash-blink { animation: splash-blink 1.4s ease-in-out infinite; }
  .animate-splash-bar   { animation: splash-bar 1.8s linear forwards; }
  @media (prefers-reduced-motion: reduce) { .animate-splash-blink { animation: none; } }
  ```
- **Timing**: fixed 1.8s (within the required 1.5–2.5s band; long enough for one full blink cycle, short enough not to tax checkout deep links). At 1.8s the overlay fades out over 400ms (`transition-opacity`, same exit feel as the gate) and unmounts.
- **Frequency decision — once per browser session (`sessionStorage.hh_splash_seen = '1'`), NOT every load.** Justification: customers arrive repeatedly from WhatsApp/Instagram links and refresh mid-checkout; an every-load splash re-taxes exactly those flows. `sessionStorage` gives the brand moment on every new visit/tab while never re-firing on refresh or in-session navigation. The flag is set when the fade starts; lazy state init (`useState(() => sessionStorage.getItem('hh_splash_seen') === '1')`) means seen-this-session renders `null` immediately. `sessionStorage` failures (private mode quirks) are caught and treated as "seen" — the splash must never be able to brick entry.
- **Gate interaction**: the gate's logic is untouched (`localStorage.hh_user` absent ⇒ gate visible). The gate mounts beneath the splash from the start; when the splash fades, the gate (new users) or the app (returning users) is revealed. This is exactly the R1 sequence with zero coupling between the two components.
- **Admin deep links**: `Splash` lives only in `CustomerLayout`, which `/admin/*` routes never use — so `/admin/orders` deep links skip the splash entirely, for free (same mechanism that already keeps the gate off admin routes, §3.1). Customer-route deep links (`/checkout`, `/product/:id`) get the one 1.8s splash per session — accepted as reasonable.

### 12.2 Gate → new-user signup form (email)

`src/components/Gate.tsx` gains a third field. Everything else about the gate (copy, layout, exit animation, fire-and-forget rule §9.4, never on `/admin/*`) is unchanged.

- **Fields & validation** (live error-pill pattern preserved — 3.5s auto-hide, 1.5s border flash, focus the offender):
  | Field | Rule | Error copy |
  |---|---|---|
  | name | non-empty | existing copy unchanged |
  | phone | ≥10 digits after stripping non-digits | existing copy unchanged |
  | email | required; `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` after trim+lowercase | `Please enter a valid email address ✦` |
  Validation order: name → phone → email. `localStorage.hh_user` gains `email` (shape stays backward-compatible — readers only access `name`/`phone`).
- **Persistence**: gate submit calls the NEW RPC `register_customer_v2(p_name, p_phone, p_joined_date, p_email)` (§12.9 C). The legacy 3-arg `register_customer` is left untouched because the live legacy site calls it; a 4th defaulted parameter on the same name would create a PostgREST overload ambiguity (two candidates match a 3-named-arg call → HTTP 300) and break the legacy gate. A distinct name is the only safe additive path. On phone conflict, v2 backfills `email` if the existing row has none.
- **Supabase auth account at the gate? — NO (FINAL).** Justification: (1) frictionless-gate constraint — OTP verification at the gate adds a mandatory email round-trip to the single most conversion-critical surface; (2) Supabase's built-in SMTP is rate-limited to a handful of auth emails per hour on free tier — gating signups on it would break under trivial traffic; (3) the requirement's value ("customer login details") is satisfied by the email landing in `customers` (broadcast list, owner contact); (4) the same email is what the customer would use at `/auth` — optional OTP account creation stays exactly where V1 put it, and a future "your gate email pre-fills /auth" nicety is a one-line seam, not built now (YAGNI).

### 12.3 Unified login (supersedes `/admin/login`)

**`/auth` becomes the single login surface for everyone, including admins.**

- **`pages/Auth.tsx`**: two modes. Default mode = the existing email-OTP flow, verbatim (works for admin accounts too — OTP is an auth method, not a role). A small toggle link under the form — `Owner? Sign in with password` — switches to an email+password form (`signInWithPassword`, logic lifted from the current `admin/Login.tsx`); a `← Back to code sign-in` link returns. No "Not an admin account" sign-out exists anymore: any successful sign-in is just a sign-in; **the role decides the view, not the surface**.
- **Post-login redirect (race-safe)**: `AuthContext` gains `isRoleLoading: boolean` (true while `loadRoleAndProfile` is in flight for the current user). `Auth.tsx`'s already-logged-in branch becomes: `user && isRoleLoading` → `LoadingSpinner`; `user` → `<Navigate to={isAdmin ? '/admin' : from} replace />`. This fixes the existing race where `user` lands before `isAdmin` resolves.
- **`components/guards/RequireAdmin.tsx`**: `isLoading || (user && isRoleLoading)` → spinner; `!user` → `<Navigate to="/auth" state={{from: location}} replace />`; `user && !isAdmin` → render a polite branded "Not authorized" block (cream card: "This area is for the shop owner." + a `Link` home), NOT a redirect. **Decision: block over redirect** — a silent bounce to `/` reads as a bug to a customer who tapped a stale link, and a redirect would also mask the state during the brief role-loading window. RLS remains the real boundary (§5.4).
- **`App.tsx`**: route `/admin/login` is kept but becomes `<Route path="/admin/login" element={<Navigate to="/auth" replace />} />` (old bookmarks keep working); `pages/admin/Login.tsx` is **deleted** in the same change (WP-V2-08 — never earlier, or the build breaks on the dangling import).
- **`components/Navbar.tsx`**: the existing role-aware button is relabeled — `isAdmin` → `⚙ Owner Panel` → `/admin` (replaces `⚙ Admin`); non-admin signed-in → `👤 Account`; signed-out → `Sign In` → `/auth`. (Same single button; no second item — the admin doesn't need a customer Account page entry, and one button is the V1 pattern.)
- **Admin view contents** (R2 mapping): add products = existing `/admin/products`; add collections = NEW `/admin/collections` (§12.4); broadcast = existing `/admin/broadcast`; change UPI image / settings = NEW `/admin/settings` (§12.5); view pending orders = existing `/admin/orders` (+ Dashboard pending count). `AdminLayout` sidebar order: Dashboard, Orders, Products, **Collections**, Customers, Broadcast, **Settings**, Admins (super_admin only).
- `RequireAuth` is unchanged (already targets `/auth`).

### 12.4 Dynamic collections

**New table `collections`** (schema + seed + RLS in §12.9 A): `id BIGSERIAL PK`, `key TEXT UNIQUE` (slug), `label`, `icon` (emoji text), `description`, `sort_order INT`, `created_at`. Public SELECT, admin INSERT/UPDATE/DELETE. Seeded with the existing 6 categories using the exact live copy (currently in `lib/supabase.ts` `CATEGORIES`).

- **`products.category` stays TEXT with a SOFT reference to `collections.key` (FINAL — no FK).** Justification: an FK would (1) fail to validate any legacy row whose category drifted, blocking the migration; (2) let the live legacy admin UI (which writes free category text) hit FK violations; (3) force delete-ordering constraints we handle better with the guard below. Integrity is provided instead by: the admin product form only offering collection keys, plus a **`BEFORE DELETE` trigger on `collections`** that raises `COLLECTION_IN_USE` when any product still uses `OLD.key` (§12.9 A). **Decision on delete enforcement: client check (product count → disable Delete with explanation) for UX, DB trigger for actual enforcement.** RLS alone can't express it; the trigger can, at zero cost — "client check only" is rejected because parallel admins could race.
- **The CHECK constraint on `products.category` is DROPPED** (§12.9 B). It was created inline in `supabase_setup.sql` line 47 (default name `products_category_check`); 002 drops it by name with `IF EXISTS` **plus** a defensive `DO` block that drops any remaining CHECK on `products` whose definition mentions `category` — correct regardless of whether 001 has run (001 never touched it) or the constraint was ever renamed.
- **Frontend contract** (foundation WP):
  - `lib/supabase.ts`: `type Collection = { id: number; key: string; label: string; icon: string; description: string; sort_order: number; created_at: string }`. `CategoryKey` union is deleted; `Product.category: string`. The old `CATEGORIES` const is reshaped into `DEFAULT_COLLECTIONS: Collection[]` (same 6, ids 1–6, sort_order 1–6) — the last-resort fallback so the UI can never render zero collections.
  - `lib/queries.ts`: `fetchCollections(): Promise<Collection[]>` (`order('sort_order')`, writes `localStorage.hh_collections` on success — same §9.2 stale-while-revalidate pattern), `readCachedCollections(): Collection[] | null`, `createCollection`, `updateCollection`, `deleteCollection` (maps `COLLECTION_IN_USE` → friendly Error), `swapCollectionOrder(a, b)` (two UPDATEs swapping `sort_order`).
  - **New `context/CollectionsContext.tsx`** exposing `{ collections, byKey, isLoading, refresh }` with resolution order: fetch → `hh_collections` cache → `DEFAULT_COLLECTIONS`. A context (vs per-page fetch) is justified: four customer surfaces + the admin product form consume the same near-static list; one fetch per session, no flicker. Provider added in `main.tsx` inside `AuthProvider`.
  - Consumers switch from `CATEGORIES` to the context: `Home.tsx` category cards (`collections.map`), `Shop.tsx` chips + heading/desc + `:category` validation (`byKey[category]` else redirect `/shop`), `Product.tsx` label lookup (`byKey[product.category]?.label ?? product.category`), `admin/Products.tsx` category `<select>` (options from `collections`).
- **New `pages/admin/Collections.tsx`**: list ordered by `sort_order` showing icon · label · key · product count; ↑/↓ reorder buttons (swap `sort_order`, optimistic + refetch); add form — label (required) → auto-slug key (`lowercase, non-alphanumeric → '-', trim '-'`, uniqueness checked client-side against the loaded list; key immutable after create so product soft references never dangle), icon (single emoji text input, default 🌸), description; edit (label/icon/description only — never key); delete via `ConfirmDialog`, disabled with "N products use this collection" when count > 0, and the trigger backs it server-side.

### 12.5 `shop_settings`

**New single-row table** (§12.9 D): `id SMALLINT PK DEFAULT 1 CHECK (id = 1)`, `upi_id`, `upi_qr_url`, `shop_email`, `whatsapp`, `updated_at`. Public SELECT, admin UPDATE; **no INSERT/DELETE policies** — the row is seeded by the migration and clients can never add or remove rows. Single-row-with-CHECK chosen over key-value: four typed columns beat stringly-typed EAV for a settings page this small.

- **Seed values**: `upi_id = '9820517390@ptyes'`, `upi_qr_url = '/images/upi-qr.jpg'`, `shop_email = ''` (owner sets it in Settings), `whatsapp = '919820517390'`. **Decision: keep the local file as seed AND permanent fallback** — it ships in every deploy, costs nothing, and satisfies §9.4 (checkout must render a QR even if Supabase is down). When the owner uploads a new QR, `upi_qr_url` becomes a storage public URL and the local file simply stops being referenced.
- **QR upload target — the existing `product-images` bucket, path `settings/upi-qr_<ts>.<ext>` (FINAL).** A new public bucket would add three storage policies for zero benefit; `product-images` already has public SELECT + admin INSERT (001), which is exactly the required matrix. The QR is not a secret — it renders on checkout for everyone.
- **Frontend**: `lib/supabase.ts` gains `type ShopSettings`; `lib/queries.ts` gains `fetchShopSettings()` (caches `localStorage.hh_settings`), `readCachedSettings()`, `updateShopSettings(patch)`, `uploadSettingsQr(file)`. Baked-in fallback object `DEFAULT_SETTINGS` mirrors the seed (the current `UPI_ID` const in `lib/whatsapp.ts` remains as its source so the continuity value lives in exactly one place per concern).
- **New `pages/admin/Settings.tsx`**: form for UPI ID (text), QR image (file input + live preview, 5MB/type client check per §9.6 → `uploadSettingsQr` → save URL), notification email `shop_email`, WhatsApp number; Save → `updateShopSettings` + toast. Shows the currently active QR.
- **`Checkout.tsx` step 2** renders `settings.upi_qr_url` + `settings.upi_id` from `fetchShopSettings()` with fallback chain fetch → cache → `DEFAULT_SETTINGS` (continuity §9.4: payment info can never fail to render). `buildOrderMessage` (`lib/whatsapp.ts`) gains an optional `upiId` parameter defaulting to the baked-in `UPI_ID`.

### 12.6 Payment ID + proof of payment

**Orders extension** (§12.9 E): `payment_ref TEXT UNIQUE`, `payment_status TEXT NOT NULL DEFAULT 'awaiting_proof' CHECK IN ('awaiting_proof','proof_submitted','verified','rejected')`, `payment_proof_path TEXT`, `proof_submitted_at TIMESTAMPTZ`.

- **`payment_ref` format**: `'PAY-HH-' || lpad(id::text, 5, '0')` → `PAY-HH-00042`. Generated inside `place_order` v2 alongside `order_code`; 002 also backfills any order created between 001 and 002 (defensive — normally zero rows since both run in one sitting).
- **`place_order` v2** (§12.9 F): `CREATE OR REPLACE` with the SAME signature — adds payment_ref generation and returns `{order_id, order_code, payment_ref, total}`. Backward compatible: JSONB return gains a key; existing client code reading `order_code`/`total` is unaffected. Client types: `PlaceOrderResult.payment_ref: string | null` (tolerates a stale function during the deploy window).
- **Storage**: new PRIVATE bucket `payment-proofs` (§12.9 H) — `public = false`, `file_size_limit = 5MB`, `allowed_mime_types = jpeg/png/webp/pdf`. Policies: INSERT for anyone (`bucket_id` check only — guests MUST be able to upload; the spam tradeoff is accepted at this scale and bounded by the size/mime caps), SELECT admin-only, DELETE admin-only, **no UPDATE policy** (uploaded proofs are immutable to clients — no overwrite attacks). Path pattern: `<order_code>/<ts>_<sanitized filename>`. Admin views via `createSignedUrl(path, 300)`.
- **`submit_payment_proof(p_order_code, p_payment_ref, p_proof_path)`** (§12.9 G): `SECURITY DEFINER`, `GRANT EXECUTE TO anon, authenticated`. Validates: an order exists matching BOTH `order_code` AND `payment_ref` (**the pairing is the guest's bearer token** — order_code alone is guessable-sequential; the pair is only ever shown to the person who placed the order) else `ORDER_NOT_FOUND`; `payment_status <> 'verified'` else `ALREADY_VERIFIED` (resubmission after `rejected` or over an earlier proof is allowed — customers fix mistakes); `p_proof_path` must start with `<order_code>/` else `BAD_PATH`. Sets `payment_status='proof_submitted'`, `payment_proof_path`, `proof_submitted_at`.
- **`Checkout.tsx`**: step 3 shows `Payment ID: <payment_ref>` beside the order code, plus an **optional, skippable** proof-upload block (rendered only when the RPC succeeded — the §9.4 continuity path has no ref and stays WhatsApp-only): file input (client-side 5MB/mime check) → upload to `payment-proofs` → `submit_payment_proof` RPC → fire-and-forget `notifyPaymentEmail` (§12.7) → inline success "Proof received ✅ — the owner will verify shortly." Upload failure → error toast, WhatsApp path untouched. **The WhatsApp share remains the primary path**; the message (§6.1 format) gains a `*Payment ID:* PAY-HH-000NN` line when present (omitted on the continuity path, same as the order line).
- **`admin/Orders.tsx`**: payment column/badge per order — `awaiting_proof` = sand, `proof_submitted` = rose (needs attention), `verified` = mocha, `rejected` = warm; a `proof submitted` quick-filter chip alongside the status chips; expanded row gains "View proof" (signed URL opened in a new tab) and **Verify / Reject** buttons (visible when `proof_submitted`; plain `UPDATE orders SET payment_status` — the admin UPDATE policy from 001 already covers it). `lib/queries.ts` adds `updatePaymentStatus(id, 'verified' | 'rejected')` and `getPaymentProofUrl(path)`.

### 12.7 Email notification (best-effort, zero-cost)

**Decision: (a) Supabase Edge Function `notify-payment` + Resend free tier — PRIMARY.** Honest comparison:

| Option | Verdict | Reasoning |
|---|---|---|
| (a) Edge Function + Resend | ✅ CHOSEN | Supabase free tier includes 500K edge invocations/mo; Resend free = 100 emails/day. Secrets live server-side (function env). Failure isolated from the order flow. Owner-debuggable (function logs in dashboard). |
| (b) Database webhook → external service | ❌ | A webhook still needs a zero-cost HTTP receiver that can send email — which is… an edge function. Same destination, more moving parts. |
| (c) `pg_net` HTTP call from a trigger | ❌ | Works on Supabase, but puts the Resend key in DB config (Vault), couples email latency/failures to the write path's vicinity, and is the hardest of the three for a non-expert owner to inspect when email silently stops. |

**Binding posture: email is BEST-EFFORT.** The system is fully functional without it — `proof_submitted` orders are visible (badged + filterable) in `/admin/orders`, which is the source of truth. The client invokes the function fire-and-forget (`supabase.functions.invoke('notify-payment', { body: { order_code, payment_ref } }).catch(() => {})`); no failure ever surfaces to the customer or blocks step 3.

**JWT verification is DISABLED for this function** (deploy with `--no-verify-jwt` / dashboard toggle "Enforce JWT verification" off). Reason: guests have no session JWT, and the project's publishable `sb_publishable_…` anon key is not a JWT, so verification would reject exactly the callers we need. The function performs its own authorization: it only acts when the `order_code` + `payment_ref` pairing matches a row whose status is `proof_submitted` — the same bearer-token logic as §12.6. Abuse ceiling: a spammer who somehow knows a valid pair can re-trigger an email about a real pending proof — annoying, not harmful, and capped by Resend's 100/day.

**Resend free-tier honesty**: without verifying a custom domain, Resend only sends from `onboarding@resend.dev` **to the email address the Resend account was created with**. That is exactly our use case (notify the owner), but the owner MUST sign up to Resend with the same email they put in `shop_settings.shop_email`. Document this in `GO_LIVE.md`.

**Complete function — save as `app/supabase/functions/notify-payment/index.ts`:**

```ts
// Supabase Edge Function: notify-payment
// Deployed with JWT verification DISABLED (guests have no JWT; the publishable
// anon key is not a JWT). Authorization = the order_code + payment_ref pairing,
// verified against the DB below. Best-effort by design (§12.7): the admin panel
// is the source of truth; this email is a convenience ping.
import { createClient } from 'npm:@supabase/supabase-js@2'

type OrderItem = { name: string; quantity: number; price: number }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  let orderCode = ''
  let paymentRef = ''
  try {
    const body = await req.json()
    orderCode = String(body.order_code ?? '').trim()
    paymentRef = String(body.payment_ref ?? '').trim()
  } catch {
    return json({ error: 'BAD_JSON' }, 400)
  }
  if (!orderCode || !paymentRef) return json({ error: 'MISSING_FIELDS' }, 400)

  // Service-role client: server-side only — this key never reaches the browser.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // The pairing is the bearer token: both values must match one row (§12.6).
  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'order_code, payment_ref, payment_status, customer_name, customer_phone, items, total, shipping_address, payment_proof_path, proof_submitted_at'
    )
    .eq('order_code', orderCode)
    .eq('payment_ref', paymentRef)
    .maybeSingle()
  if (error || !order) return json({ error: 'ORDER_NOT_FOUND' }, 404)
  if (order.payment_status !== 'proof_submitted') return json({ error: 'NO_PROOF_PENDING' }, 409)

  const { data: settings } = await supabase
    .from('shop_settings')
    .select('shop_email')
    .eq('id', 1)
    .maybeSingle()
  const to = settings?.shop_email?.trim()
  if (!to) return json({ skipped: 'shop_email not configured' })

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return json({ skipped: 'RESEND_API_KEY not set' })

  const itemLines = ((order.items ?? []) as OrderItem[])
    .map((i) => `• ${i.name} × ${i.quantity} = ₹${i.price * i.quantity}`)
    .join('\n')
  const addr = (order.shipping_address ?? {}) as Record<string, string>
  const addressLine = [addr.address_line1, addr.address_line2, addr.city, addr.state, addr.pincode]
    .filter((p) => p && String(p).trim() !== '')
    .join(', ')

  const text =
    `Payment proof submitted on Hijab Haven.\n\n` +
    `Order: ${order.order_code}\n` +
    `Payment ID: ${order.payment_ref}\n` +
    `Status: proof_submitted — verify or reject in the Owner Panel\n\n` +
    `Customer: ${order.customer_name}\n` +
    `WhatsApp: ${order.customer_phone}\n` +
    `Address: ${addressLine}\n\n` +
    `Items:\n${itemLines}\n\n` +
    `Total: ₹${order.total}\n\n` +
    `Proof file: ${order.payment_proof_path}\n` +
    `Submitted at: ${order.proof_submitted_at}\n\n` +
    `Open the Owner Panel: https://hijab-haven.netlify.app/admin/orders`

  const resend = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Hijab Haven <onboarding@resend.dev>',
      to: [to],
      subject: `Payment proof — ${order.order_code} (${order.payment_ref})`,
      text,
    }),
  })
  if (!resend.ok) return json({ error: 'RESEND_FAILED', detail: await resend.text() }, 502)
  return json({ sent: true })
})
```

**Owner deployment steps (document in `GO_LIVE.md`):**
1. Create a free account at resend.com **using the shop's notification email address**; create an API key (Dashboard → API Keys).
2. Supabase Dashboard → **Edge Functions**. The dashboard supports creating a function in-browser ("Deploy a new function" → via Editor): name it `notify-payment`, paste the code above, deploy, then in the function's settings turn **OFF "Enforce JWT verification"**. If the in-browser editor is unavailable in the project's dashboard version, use the CLI path (no global install needed):
   ```
   cd "C:\Users\ARIF\Desktop\Hijab Haven\app"
   npx supabase login
   npx supabase functions deploy notify-payment --project-ref tacjzpobeoxyrdrvazni --no-verify-jwt
   ```
3. Set the secret: Dashboard → Edge Functions → Secrets → add `RESEND_API_KEY` = the key from step 1 (CLI alternative: `npx supabase secrets set RESEND_API_KEY=<key> --project-ref tacjzpobeoxyrdrvazni`).
4. In the app: `/admin/settings` → set "Notification email" to the same address as step 1 → Save.
5. Verify: place a test order, upload any image as proof, check the inbox AND `/admin/orders` (the badge must flip to `proof_submitted` regardless of email outcome).

### 12.8 Home page changes

`pages/Home.tsx`: **remove the `#payment` section entirely** (currently ~line 330) and its hash-scroll handling; remove the "After payment share your screenshot…" group-link line that lived inside it. `components/Navbar.tsx`: remove the `Payment` (`/#payment`) link from both desktop and mobile lists (`Hampers` stays). Category cards become collection-driven (§12.4). **Everything else in §8.3 stays verbatim** — hero, marquee, quote, hampers, why-us, instagram, footer, all character-for-character.

### 12.9 Migration 002 — complete, idempotent, runs immediately after 001

Save verbatim as `C:\Users\ARIF\Desktop\Hijab Haven\app\supabase\migrations\002_v2_delta.sql`. The owner runs **001 then 002 in the same sitting** in the SQL editor of project `tacjzpobeoxyrdrvazni`. 002 depends on 001 only for `is_admin()` and the `orders` table / `update_updated_at()`; it never touches anything the legacy site uses except dropping the category CHECK (pure widening — legacy inserts only the 6 values, which remain valid).

```sql
-- ════════════════════════════════════════════════════════════
-- HIJAB HAVEN MIGRATION 002 — V2 delta. Idempotent, additive.
-- RUN IMMEDIATELY AFTER 001 (same sitting). Legacy site unaffected.
-- ════════════════════════════════════════════════════════════

-- ── A. collections (dynamic categories) ──
CREATE TABLE IF NOT EXISTS collections (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🌸',
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view collections" ON collections;
DROP POLICY IF EXISTS "Admins insert collections" ON collections;
DROP POLICY IF EXISTS "Admins update collections" ON collections;
DROP POLICY IF EXISTS "Admins delete collections" ON collections;
CREATE POLICY "Anyone can view collections" ON collections
  FOR SELECT USING (true);
CREATE POLICY "Admins insert collections" ON collections
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins update collections" ON collections
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins delete collections" ON collections
  FOR DELETE USING (is_admin());

INSERT INTO collections (key, label, icon, description, sort_order) VALUES
  ('everyday',    'Everyday Hijabs',   '🧕', 'Lightweight, breathable fabrics in versatile colours for your daily wear.', 1),
  ('occasion',    'Occasion Wear',     '✨', 'Elegant embellished hijabs for weddings, Eid, and celebrations.',           2),
  ('hampers',     'Gift Hampers',      '🎁', 'Beautifully curated hampers — the perfect gift for every occasion.',        3),
  ('accessories', 'Accessories',       '💎', 'Pins, underscarves, hijab magnets and more to keep you put-together.',      4),
  ('pastel',      'Pastel Collection', '🌸', 'Soft, dreamy tones that radiate femininity and grace.',                     5),
  ('minimal',     'Minimal & Neutral', '🖤', 'Classic blacks, whites, and earth tones for an effortlessly chic look.',    6)
ON CONFLICT (key) DO NOTHING;

-- Delete guard: a collection still used by products cannot be deleted (DB-enforced).
CREATE OR REPLACE FUNCTION collections_block_delete_in_use()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM products WHERE category = OLD.key) THEN
    RAISE EXCEPTION 'COLLECTION_IN_USE';
  END IF;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS collections_guard_delete ON collections;
CREATE TRIGGER collections_guard_delete
  BEFORE DELETE ON collections
  FOR EACH ROW EXECUTE FUNCTION collections_block_delete_in_use();

-- ── B. products: drop the hardcoded category CHECK (soft reference now) ──
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_check;
-- Defensive sweep: drop ANY remaining check constraint on products mentioning category
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'products'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE products DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- ── C. customers.email + register_customer_v2 ──
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';

-- NOTE: the 3-arg register_customer is deliberately untouched — the live legacy
-- site calls it, and a 4th DEFAULT parameter on the same name would create a
-- PostgREST overload ambiguity (HTTP 300) for 3-named-arg callers.
CREATE OR REPLACE FUNCTION register_customer_v2(
  p_name TEXT, p_phone TEXT, p_joined_date TEXT, p_email TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO customers (name, phone, joined_date, email)
  VALUES (trim(p_name), trim(p_phone), p_joined_date, lower(trim(coalesce(p_email, ''))))
  ON CONFLICT (phone) DO UPDATE
    SET email = CASE WHEN coalesce(customers.email, '') = ''
                     THEN EXCLUDED.email ELSE customers.email END;
END; $$;
GRANT EXECUTE ON FUNCTION register_customer_v2(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ── D. shop_settings (single row, id = 1) ──
CREATE TABLE IF NOT EXISTS shop_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  upi_id TEXT NOT NULL DEFAULT '9820517390@ptyes',
  upi_qr_url TEXT NOT NULL DEFAULT '/images/upi-qr.jpg',
  shop_email TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '919820517390',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO shop_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view settings" ON shop_settings;
DROP POLICY IF EXISTS "Admins update settings" ON shop_settings;
CREATE POLICY "Anyone can view settings" ON shop_settings
  FOR SELECT USING (true);
CREATE POLICY "Admins update settings" ON shop_settings
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
-- No INSERT/DELETE policies: the seeded row can never be added to or removed by clients.

DROP TRIGGER IF EXISTS shop_settings_updated_at ON shop_settings;
CREATE TRIGGER shop_settings_updated_at
  BEFORE UPDATE ON shop_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── E. orders: payment columns ──
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_ref TEXT UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'awaiting_proof';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_path TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS proof_submitted_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('awaiting_proof','proof_submitted','verified','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill payment_ref for any order created between 001 and 002 (normally none).
UPDATE orders SET payment_ref = 'PAY-HH-' || lpad(id::TEXT, 5, '0') WHERE payment_ref IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

-- ── F. place_order v2 (same signature; adds payment_ref) ──
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
  v_payment_ref TEXT;
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

  v_order_code  := 'HH-' || lpad(v_order_id::TEXT, 5, '0');
  v_payment_ref := 'PAY-HH-' || lpad(v_order_id::TEXT, 5, '0');
  UPDATE orders SET order_code = v_order_code, payment_ref = v_payment_ref
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_code', v_order_code,
    'payment_ref', v_payment_ref,
    'total', v_total
  );
END; $$;

GRANT EXECUTE ON FUNCTION place_order(TEXT, TEXT, JSONB, JSONB) TO anon, authenticated;

-- ── G. submit_payment_proof (guest bearer token = order_code + payment_ref pair) ──
CREATE OR REPLACE FUNCTION submit_payment_proof(
  p_order_code TEXT, p_payment_ref TEXT, p_proof_path TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id BIGINT;
  v_status TEXT;
BEGIN
  IF coalesce(trim(p_proof_path), '') = ''
     OR position(trim(p_order_code) || '/' IN p_proof_path) <> 1 THEN
    RAISE EXCEPTION 'BAD_PATH';
  END IF;

  SELECT id, payment_status INTO v_id, v_status FROM orders
   WHERE order_code = trim(p_order_code) AND payment_ref = trim(p_payment_ref);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF v_status = 'verified' THEN
    RAISE EXCEPTION 'ALREADY_VERIFIED';
  END IF;

  UPDATE orders
     SET payment_status = 'proof_submitted',
         payment_proof_path = p_proof_path,
         proof_submitted_at = NOW()
   WHERE id = v_id;
END; $$;

GRANT EXECUTE ON FUNCTION submit_payment_proof(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ── H. payment-proofs bucket (PRIVATE) + storage policies ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', FALSE, 5242880,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can upload payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins view payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete payment proofs" ON storage.objects;
CREATE POLICY "Anyone can upload payment proofs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'payment-proofs');
CREATE POLICY "Admins view payment proofs" ON storage.objects
  FOR SELECT USING (bucket_id = 'payment-proofs' AND is_admin());
CREATE POLICY "Admins delete payment proofs" ON storage.objects
  FOR DELETE USING (bucket_id = 'payment-proofs' AND is_admin());
-- No UPDATE policy: uploaded proofs are immutable to clients.
```

**Post-002 verification (run and report, same discipline as §4.7):**
```sql
SELECT key, label, sort_order FROM collections ORDER BY sort_order;          -- 6 seeded rows
SELECT upi_id, upi_qr_url FROM shop_settings;                                -- seeded values
SELECT conname FROM pg_constraint WHERE conrelid = 'products'::regclass
  AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%category%';        -- 0 rows
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'orders' AND column_name LIKE 'payment%';               -- 3 rows + proof_submitted_at
SELECT id, public FROM storage.buckets WHERE id = 'payment-proofs';          -- public = false
-- From the app (anon key): place_order returns payment_ref; INSERT into products
-- with category 'test-new-collection' succeeds for an admin (CHECK gone);
-- submit_payment_proof with a wrong payment_ref raises ORDER_NOT_FOUND;
-- anon SELECT on a payment-proofs object is denied; anon upload ≤5MB image succeeds.
-- Legacy site spot-check: gate signup works (3-arg register_customer untouched),
-- products render, legacy admin add-product with one of the 6 categories works.
```

**Permission matrix — V2 additional rows (extends §4.5):**

| Resource | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| collections | anyone | admin | admin | admin (blocked by trigger while products reference the key) |
| shop_settings | anyone | — (seeded row only) | admin | — |
| customers.email | (admin, via customers SELECT) | anyone via `register_customer_v2` RPC | admin | — |
| orders payment_* | owner/admin (via orders SELECT) | — (`place_order` only) | admin (verify/reject); guests only via `submit_payment_proof` RPC pairing | — |
| storage `payment-proofs` | admin (signed URLs) | anyone (5MB, image/pdf mime caps) | — (immutable) | admin |

### 12.10 V2 Work Packages — strict file ownership

Rules: a file appears in EXACTLY ONE WP; no two parallel WPs may touch the same file; `App.tsx` is integration-only and goes LAST so parallel WPs never contend for it (and so deleting `admin/Login.tsx` coincides with removing its import). Every WP ends with `npx tsc --noEmit` clean, `npm run lint` clean, `npm run build` succeeds, plus its stated acceptance.

| # | Tag | Work package | Files owned (exactly; absolute under `app\` unless noted) | Depends on | Acceptance |
|---|---|---|---|---|---|
| **WP-V2-01** | [api-data] | **Migration 002 + edge function + owner runbook** | `supabase/migrations/002_v2_delta.sql` (new, §12.9 verbatim), `supabase/functions/notify-payment/index.ts` (new, §12.7 verbatim), repo-root `GO_LIVE.md` (add: run 001→002 in one sitting; Resend signup; function deploy + secret; settings email step) | — | SQL files match §12.9/§12.7 byte-for-byte; `GO_LIVE.md` steps complete. Nothing is run against prod here — the owner runs it per runbook. |
| **WP-V2-02** | [core] | **Foundation: types, queries, contexts** | `src/lib/supabase.ts` (Collection, ShopSettings, PaymentStatus, Order payment fields, `category: string`, `DEFAULT_COLLECTIONS`), `src/lib/queries.ts` (collections CRUD+cache, settings fetch/update/QR upload, `registerCustomer(name, phone, email)`→v2 RPC, `placeOrder` payment_ref, proof upload/submit/signed-URL, `updatePaymentStatus`, `notifyPaymentEmail`), `src/lib/whatsapp.ts` (optional `paymentRef` + `upiId` in `buildOrderMessage`), `src/context/AuthContext.tsx` (`isRoleLoading`), `src/context/CollectionsContext.tsx` (new), `src/main.tsx` (provider) | WP-V2-01 (contract only) | Typecheck/build clean; unit tests for slugify + message builder; all V1 call sites still compile. |
| **WP-V2-03** | [ui] ★frontend-design skill | **Splash + Gate signup** | `src/components/Splash.tsx` (new), `src/components/Gate.tsx` (email field), `src/styles/globals.css` (splash keyframes only) | WP-V2-02 | Splash per §12.1 (1.8s, once per session, reduced-motion safe); gate email validation per §12.2; `hh_user` gains email; `register_customer_v2` row lands with email. |
| **WP-V2-04** | [core] | **Unified auth surfaces** | `src/pages/Auth.tsx` (OTP + password toggle + role-aware redirect), `src/components/guards/RequireAdmin.tsx` (`/auth` redirect + polite not-authorized block), `src/components/Navbar.tsx` (Owner Panel label; remove Payment link) | WP-V2-02 | Admin via OTP AND via password both land on `/admin`; customer lands on `from`; non-admin at `/admin` sees the polite block; no Payment link at any width. Must NOT touch `App.tsx`/`Login.tsx`. |
| **WP-V2-05** | [ui] | **Collection-driven customer pages + Home cleanup** | `src/pages/Home.tsx` (cards from context; `#payment` section removed), `src/pages/Shop.tsx` (chips/heading/param validation from context), `src/pages/Product.tsx` (label via `byKey`) | WP-V2-02 | A collection added in DB appears on Home/Shop without redeploy; cache fallback renders 6 defaults offline; `#payment` gone, everything else §8.3-verbatim. |
| **WP-V2-06** | [ui] | **Admin panel V2** | `src/pages/admin/AdminLayout.tsx` (Collections + Settings nav; responsive mobile shell), `src/pages/admin/Collections.tsx` (new, §12.4), `src/pages/admin/Settings.tsx` (new, §12.5), `src/pages/admin/Products.tsx` (select from context), `src/pages/admin/Orders.tsx` (payment badge/filter, View proof signed URL, Verify/Reject) | WP-V2-02 | Collection CRUD incl. blocked delete (client + `COLLECTION_IN_USE` toast); QR upload swaps checkout image; Verify/Reject round-trips; admin usable at 390px. |
| **WP-V2-07** | [core] | **Checkout payment flow** | `src/pages/Checkout.tsx` (settings-driven QR/UPI with fallback chain; payment_ref on step 3; optional skippable proof upload → storage + RPC + fire-and-forget email; WhatsApp message Payment-ID line) | WP-V2-02 | Guest order shows PAY-HH ref; proof upload flips `payment_status` to `proof_submitted`; §9.4 continuity path still reaches WhatsApp with zero Supabase available; upload failure never blocks. |
| **WP-V2-08** | [core] | **Integration & route wiring** | `src/App.tsx` (Splash in CustomerLayout; `/admin/login` → `Navigate /auth`; `/admin/collections` + `/admin/settings` routes), DELETE `src/pages/admin/Login.tsx` | WP-V2-03…07 | All routes resolve; `/admin/login` redirects; admin deep links skip splash; build has no dangling imports. |
| **WP-V2-09** | [qa] | **V2 system QA** (no file ownership; defects filed to owning WPs) | — | WP-V2-08 + owner (or authorized agent) has run 001+002 on the staging project | Full R1–R4 journeys; RLS audit additions (anon cannot read payment-proofs or others' proofs, cannot UPDATE shop_settings/collections, submit_payment_proof pairing enforced); responsive pass 390/768/1440 on EVERY route incl. admin; legacy site regression spot-check; email best-effort verified (panel correct even with the function undeployed). |

Parallelism: WP-V2-01 first (contract), then WP-V2-02; after WP-V2-02 → **WP-V2-03 ∥ WP-V2-04 ∥ WP-V2-05 ∥ WP-V2-06 ∥ WP-V2-07** (disjoint file sets by construction); then WP-V2-08, then WP-V2-09. The frontend-design skill is mandated for WP-V2-03 (splash/gate are pure brand-visual work) and recommended for the two new admin pages in WP-V2-06.

### 12.11 V2 decisions register (one line each, with trace)

| Decision | Choice | Traces to |
|---|---|---|
| Splash frequency | Once per browser session (`sessionStorage`), 1.8s, customer layout only | R1; WhatsApp-link/refresh UX; admin-deep-link constraint |
| Gate email | Required field, regex-validated, → `customers.email` via NEW `register_customer_v2` | R1; legacy 3-arg RPC must keep working (PostgREST overload ambiguity) |
| Auth account at gate | NO — gate stays account-free; `/auth` remains the optional account path | Frictionless-guest constraint; free-tier auth email limits |
| Unified login | `/auth` single surface; OTP default for all incl. admins; password toggle for owner; role decides view | R2 |
| `/admin/login` | Route kept as a permanent redirect to `/auth`; `Login.tsx` deleted at integration | R2; bookmark continuity |
| Non-admin at `/admin` | Polite branded "not authorized" block, not a redirect | R2; UX clarity, no loops |
| Collections reference | `products.category` TEXT soft reference to `collections.key`; CHECK dropped | R2 (dynamic categories); legacy-site write compatibility |
| Collection delete guard | Client count check (UX) + `BEFORE DELETE` trigger raising `COLLECTION_IN_USE` (enforcement) | R2; RLS cannot express it; admin race safety |
| Collections in UI | `CollectionsContext`: fetch → `hh_collections` cache → `DEFAULT_COLLECTIONS` | §9.2 pattern; UI must never empty |
| Settings storage | Single-row `shop_settings` (id=1 CHECK); public read, admin update, no insert/delete | R2/R3; simplest typed shape |
| QR image hosting | Seed/fallback = local `/images/upi-qr.jpg`; uploads → `product-images` bucket `settings/` path | Zero-cost; §9.4 continuity; reuse existing policies |
| Payment ID | `PAY-HH-00042` generated in `place_order` v2; same RPC signature, JSONB return extended | R3; backward compatibility |
| Proof authorization | `order_code` + `payment_ref` pairing as guest bearer token in `submit_payment_proof` | R3; guests have no `auth.uid()` |
| Proof storage | PRIVATE `payment-proofs` bucket; anon INSERT (5MB/mime caps), admin-only SELECT via signed URLs, no UPDATE | R3; privacy of payment screenshots; spam tradeoff accepted |
| Email mechanism | Edge function `notify-payment` + Resend free (100/day), fire-and-forget, JWT verification off, function self-authorizes via pairing | R3; zero-cost; publishable key is not a JWT |
| Email posture | Best-effort only; `/admin/orders` badges are the source of truth | §9.4 spirit; free-tier honesty |
| Home `#payment` | Removed with its Navbar link; UPI surfaces only in checkout from `shop_settings` | R3 |
| Responsiveness | QA gate at 390/768/1440 on every route; AdminLayout gains mobile shell | R4 |
| `App.tsx` ownership | Integration-only, final WP | V1 parallel-agent lesson; one-owner-per-file rule |

---

## Appendix A — Decisions register (one line each, with trace)

| Decision | Choice | Traces to |
|---|---|---|
| Framework | Vite+React SPA, static Netlify | Req 4 (Netlify, reliable), Req 5 (zero cost), maintainer constraint |
| Salvage | New `app/`, port App Build files mechanically | Owner constraint (canonical at `app/`), App Build is client-only code |
| Customer auth | Optional email OTP; guest checkout preserved; gate preserved | Req 1 (preserve flows), Req 3 (accounts), conversion constraint |
| Admin auth | Email+password + admin_users RBAC, PIN removed | Req 3 |
| Order lines | JSONB `items` snapshot on `orders` | Scale (few orders/day), immutability of price snapshots |
| Order writes | `place_order` SECURITY DEFINER RPC only; no INSERT policy | Security (price forgery), guest inserts without RLS identity |
| RLS recursion fix | `is_admin()`/`is_super_admin()` SECURITY DEFINER in all admin policies | Named bug in supabase_setup.sql lines 30–32 |
| Stock | Nullable `stock`; NULL = untracked; RPC decrements atomically | Req (inventory column) without breaking existing products |
| Cart | localStorage only; login merge = no-op by design | Req (guest persistence); no cross-device requirement exists |
| State mgmt | Contexts + per-page fetch only | Simplicity-first; app size doesn't justify more |
| Cart page | Drawer only, no `/cart` route | Preserve live UX exactly |
| Hampers | Static section with WhatsApp-group enquiry links (as live) | Verified live content — hampers have no prices/cart today |
| Guest order claiming | Not built (unverified phone) — flagged seam | Security; future seam documented §4.4 |
| Broadcast | Sequential wa.me deep links | Zero-cost constraint (no WhatsApp Business API) |
