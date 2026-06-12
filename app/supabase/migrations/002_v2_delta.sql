-- ═══════════════════════════════════════════════════════════════════════════
-- WP-V2-01 PACKAGING NOTES (review of ARCHITECTURE.md §12.9 — 2026-06-11)
-- Source: docs/ARCHITECTURE.md §12.9, copied VERBATIM. The review found ZERO
-- correctness bugs — no [WP-V2-01 FIX] edits were required. Verified points:
--
-- 1. ON CONFLICT (phone) in register_customer_v2 is valid: customers.phone is
--    TEXT NOT NULL UNIQUE (supabase_setup.sql line 102 — same constraint the
--    legacy 3-arg register_customer already upserts against).
-- 2. place_order v2 (section F) has the IDENTICAL signature to 001 section I —
--    (p_customer_name TEXT, p_customer_phone TEXT, p_address JSONB,
--    p_items JSONB) RETURNS JSONB — so CREATE OR REPLACE replaces the function
--    in place (no orphan overload, no PostgREST ambiguity). The re-issued
--    GRANT is a harmless no-op on re-run.
-- 3. register_customer_v2 is a DISTINCT name from the legacy register_customer
--    per §12.2. Live anon-key smoke (2026-06-11, pre-002): POST
--    /rpc/register_customer_v2 → 404 PGRST202 with hint "Perhaps you meant
--    public.register_customer" — confirming the legacy 3-arg function exists
--    and that a 4th defaulted param on the same name would have created the
--    overload ambiguity §12.2 warns about.
-- 4. Idempotency audit — PASS on every statement: all 9 CREATE POLICY are
--    preceded by DROP POLICY IF EXISTS (collections ×4, shop_settings ×2,
--    storage payment-proofs ×3); all 3 functions are CREATE OR REPLACE; all 5
--    ADD COLUMN use IF NOT EXISTS; both seeds use ON CONFLICT … DO NOTHING;
--    both triggers are DROP TRIGGER IF EXISTS before CREATE TRIGGER (incl.
--    the BEFORE DELETE collections guard); orders_payment_status_check is
--    wrapped in a duplicate_object exception handler; the bucket INSERT has
--    ON CONFLICT (id) DO NOTHING; the payment_ref backfill is bounded by
--    WHERE payment_ref IS NULL.
-- 5. "ADD COLUMN IF NOT EXISTS payment_ref TEXT UNIQUE" stays idempotent:
--    when the column exists, Postgres skips the ENTIRE clause including the
--    UNIQUE constraint — no duplicate-constraint error on re-run.
-- 6. The products category CHECK drop (section B) is state-proof: named
--    DROP CONSTRAINT IF EXISTS (default inline name products_category_check
--    from supabase_setup.sql line 47) PLUS a catalog sweep over pg_constraint
--    that drops any remaining CHECK on products whose definition mentions
--    category. Correct whether the constraint exists, was renamed, or is gone.
-- 7. No policy-name collisions with supabase_setup.sql or 001: the three new
--    storage.objects policy names ("…payment proofs") are disjoint from the
--    four product-images policy names; collections/shop_settings are new
--    tables. No function-name collisions except place_order, which is the
--    intended in-place replacement (see 2).
-- 8. submit_payment_proof: position(needle IN haystack) argument order is
--    correct; NULL p_order_code/p_payment_ref make the IF conditions NULL
--    (not true) and fall through to the ORDER_NOT_FOUND check — fail-closed.
-- 9. Dependencies on 001 (is_admin(), update_updated_at(), orders table) are
--    the ONLY external requirements — hence the binding rule below.
--
-- DOC NIT (architecture §12.9 verification comment, NOT this SQL): the
-- "column_name LIKE 'payment%'" check actually returns 4 rows, not 3 —
-- payment_method (from 001) also matches. The owner checklist states the
-- correct expectation.
-- ═══════════════════════════════════════════════════════════════════════════

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
