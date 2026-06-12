-- ════════════════════════════════════════════════════════════
-- HIJAB HAVEN MIGRATION 003 — self-service account deletion
-- Idempotent. Run after 001 + 002 (applied to production 12 Jun 2026).
-- ════════════════════════════════════════════════════════════
-- delete_my_account(): lets an authenticated customer permanently
-- delete their own account from the Profile page.
--   • Blocks admins ('ADMIN_ACCOUNT') — remove the admin role first,
--     so the last super_admin can never lock the shop out.
--   • Removes their gate/broadcast record(s) from customers, matched
--     by the account's email or the profile's phone.
--   • Deletes the auth.users row; FK cascades remove user_profiles,
--     addresses, wishlists. orders.user_id is ON DELETE SET NULL, so
--     past orders are preserved as anonymous guest business records.

CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_phone TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF EXISTS (SELECT 1 FROM admin_users WHERE id = v_uid) THEN
    RAISE EXCEPTION 'ADMIN_ACCOUNT';
  END IF;

  SELECT lower(coalesce(email, '')) INTO v_email FROM auth.users WHERE id = v_uid;
  SELECT coalesce(phone, '') INTO v_phone FROM user_profiles WHERE id = v_uid;

  -- Gate/broadcast records carrying this account's identity
  DELETE FROM customers
   WHERE (v_email <> '' AND lower(coalesce(email, '')) = v_email)
      OR (v_phone <> '' AND phone = v_phone);

  -- Cascades: user_profiles, addresses, wishlists. Orders → guest (SET NULL).
  DELETE FROM auth.users WHERE id = v_uid;
END; $$;

REVOKE EXECUTE ON FUNCTION delete_my_account() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION delete_my_account() TO authenticated;
