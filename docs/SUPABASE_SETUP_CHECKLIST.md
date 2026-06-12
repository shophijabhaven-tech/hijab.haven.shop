# Supabase Setup Checklist — Hijab Haven Rebuild (Migrations 001 + 002)

Owner-facing. Follow the numbered steps in order. Everything here happens in the
Supabase dashboard for project `tacjzpobeoxyrdrvazni`
(https://supabase.com/dashboard/project/tacjzpobeoxyrdrvazni).

Both migrations are **idempotent**: if anything fails halfway, fix the cause and
run the whole file again — it is safe to re-run.

> **There are TWO migration files now. Run 001 first (Parts 1–2), then 002
> (Part 2b) — in that order, in the same sitting.** 002 depends on functions
> and tables that 001 creates; never run 002 alone.

---

## Part 1 — Run the migration

1. Open the dashboard → **SQL Editor** → **New query**.
2. Open the file `app\supabase\migrations\001_rebuild.sql` (in this repo) in a
   text editor, select ALL of it, copy, and paste into the SQL Editor.
3. Click **Run**.
   - **Expected output:** "Success. No rows returned" (or a single small result
     showing a number like `1000` or a large 13-digit number — that is the
     `setval` result from section D and is normal).
   - **If you see** `ERROR: must be owner of relation objects` (or similar)
     pointing at the `storage.objects` lines: your project restricts storage
     policies in SQL. In that case delete/recreate those four storage policies
     via **Storage → Policies → product-images** in the dashboard UI using the
     same names and definitions shown in section C of the file, then re-run the
     whole SQL file — the storage `CREATE POLICY` lines will be the only
     failures, everything else re-applies cleanly. (This was not expected on
     this project — the original storage policies were created via SQL — but it
     is the only known environment-dependent step.)
   - Any other error: stop, copy the exact error text, and report it. Do not
     improvise changes to the SQL.

## Part 2 — Verification queries (run each in SQL Editor)

4. RLS enabled on every table:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
   ```
   **Expected:** rows for `admin_users, products, customers, user_profiles,
   addresses, orders, wishlists` — `rowsecurity = true` on ALL of them.

5. Policies in place:
   ```sql
   SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename;
   ```
   **Expected (public schema):**
   - `addresses`: Users manage own addresses (ALL)
   - `admin_users`: Admins can view admin list (SELECT); Super admins insert/update/delete admins (INSERT/UPDATE/DELETE)
   - `customers`: Anyone can register as customer (INSERT); Only admins can view/update/delete customers (SELECT/UPDATE/DELETE)
   - `orders`: Users can view own orders (SELECT); Admins can view all orders (SELECT); Admins can update orders (UPDATE) — **no INSERT and no DELETE policy, that is intentional**
   - `products`: Public read access to products (SELECT); Only admins can insert/update/delete products (INSERT/UPDATE/DELETE)
   - `user_profiles`: Users can view/update/insert own profile; Admins can view all profiles
   - `wishlists`: Users manage own wishlist (ALL)

6. Helper functions:
   ```sql
   SELECT is_admin(), is_super_admin();
   ```
   **Expected:** one row. (In the SQL editor you run as `postgres`, with no
   auth.uid(), so both return `false`.)

7. Self-contained `place_order` test (writes nothing — everything rolls back):
   ```sql
   BEGIN;
   INSERT INTO products (name, price, category, stock)
     VALUES ('MIGRATION TEST PRODUCT', 100, 'everyday', 5);
   SELECT place_order(
     'Test Customer', '9999999999', '{}'::jsonb,
     jsonb_build_array(jsonb_build_object(
       'product_id', (SELECT id FROM products WHERE name='MIGRATION TEST PRODUCT'),
       'quantity', 2))
   ) AS result;
   SELECT stock FROM products WHERE name='MIGRATION TEST PRODUCT';
   ROLLBACK;
   ```
   **Expected:** `result` is JSON like
   `{"order_id": 1, "order_code": "HH-00001", "total": 200}` and the stock
   query shows `3` (5 minus 2). The final `ROLLBACK` removes the test product
   and the test order — nothing persists. This also proves the new `id`
   sequence works (the INSERT did not supply an id).

8. Legacy-site spot check (the old live site must keep working):
   open https://hijab-haven.netlify.app in a private/incognito window —
   the entry gate must accept a name+phone, and products must display.

## Part 2b — Migration 002 (V2) — run IMMEDIATELY after 001, same sitting

Migration 002 adds the V2 features: dynamic collections, shop settings,
customer emails, payment IDs, and the private payment-proofs bucket. It is
idempotent like 001 and never touches anything the legacy live site uses
(the only change it makes to existing behavior is REMOVING a restriction —
the hardcoded product-category list).

### 2b.1 — Run the migration

1. SQL Editor → **New query**.
2. Open `app\supabase\migrations\002_v2_delta.sql`, select ALL, copy, paste,
   **Run**.
   - **Expected output:** "Success. No rows returned".
   - **If you see** `ERROR: must be owner of relation objects` pointing at the
     `storage.objects` lines: same environment-dependent caveat as 001 Part 1 —
     create the three `payment-proofs` policies via **Storage → Policies** in
     the dashboard UI using the exact names and definitions from section H of
     the file, then re-run the whole file.
   - Any other error: stop, copy the exact error text, and report it. Do not
     improvise changes to the SQL.

### 2b.2 — Verification queries (run each in SQL Editor)

1. Collections seeded:
   ```sql
   SELECT key, label, sort_order FROM collections ORDER BY sort_order;
   ```
   **Expected:** exactly 6 rows — `everyday, occasion, hampers, accessories,
   pastel, minimal` with `sort_order` 1–6.

2. Settings row seeded:
   ```sql
   SELECT upi_id, upi_qr_url FROM shop_settings;
   ```
   **Expected:** 1 row — `9820517390@ptyes` and `/images/upi-qr.jpg`.

3. Product category CHECK is gone:
   ```sql
   SELECT conname FROM pg_constraint WHERE conrelid = 'products'::regclass
     AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%category%';
   ```
   **Expected:** 0 rows.

4. Orders payment columns exist:
   ```sql
   SELECT column_name FROM information_schema.columns
     WHERE table_name = 'orders'
       AND (column_name LIKE 'payment%' OR column_name = 'proof_submitted_at');
   ```
   **Expected:** 5 rows — `payment_method` (from 001), plus the four new ones:
   `payment_ref`, `payment_status`, `payment_proof_path`, `proof_submitted_at`.

5. Private proofs bucket exists:
   ```sql
   SELECT id, public FROM storage.buckets WHERE id = 'payment-proofs';
   ```
   **Expected:** 1 row with `public = false` (it MUST be false — proofs are
   payment screenshots, admin-only).

6. `place_order` now returns a Payment ID (writes nothing — rolls back):
   ```sql
   BEGIN;
   INSERT INTO products (name, price, category, stock)
     VALUES ('MIGRATION TEST PRODUCT', 100, 'everyday', 5);
   SELECT place_order(
     'Test Customer', '9999999999', '{}'::jsonb,
     jsonb_build_array(jsonb_build_object(
       'product_id', (SELECT id FROM products WHERE name='MIGRATION TEST PRODUCT'),
       'quantity', 2))
   ) AS result;
   ROLLBACK;
   ```
   **Expected:** `result` is JSON like
   `{"order_id": 1, "order_code": "HH-00001", "payment_ref": "PAY-HH-00001", "total": 200}`
   — the new `payment_ref` key is the thing being verified.

7. Proof pairing fails closed:
   ```sql
   SELECT submit_payment_proof('HH-99999', 'PAY-HH-99999', 'HH-99999/x.jpg');
   ```
   **Expected:** `ERROR: ORDER_NOT_FOUND` (no such order — this error IS the
   pass result).

8. Anon-key re-checks (PowerShell; same header pattern as Appendix B):
   | Request | Expected AFTER 002 |
   |---|---|
   | `GET /rest/v1/collections?select=key&order=sort_order` | HTTP 200, 6 rows |
   | `GET /rest/v1/shop_settings?select=upi_id` | HTTP 200, 1 row |
   | `POST /rest/v1/rpc/submit_payment_proof` with bogus code/ref | HTTP 400, message contains `ORDER_NOT_FOUND` (was 404 pre-002) |
   | `POST /rest/v1/rpc/register_customer_v2` | no longer 404 (do NOT actually call it casually — every call inserts/updates a customer row; the gate exercises it end-to-end) |

9. Legacy-site spot check (unchanged requirement): open
   https://hijab-haven.netlify.app in incognito — gate accepts name+phone
   (3-arg `register_customer` untouched), products render, and the legacy
   admin can still add a product with one of the 6 original categories.

### 2b.3 — Edge function `notify-payment` (OPTIONAL — email is best-effort)

> **Email is best-effort and optional.** The app is fully functional without
> it: submitted proofs always appear badged `proof_submitted` in
> `/admin/orders`, which is the source of truth. This function only adds a
> convenience email ping. Skip this section entirely if you don't want email.

1. Create a free account at https://resend.com **using the same email address
   you will set as the shop's notification email** (Resend's free tier without
   a custom domain only delivers to the account owner's address, from
   `onboarding@resend.dev`). Then Dashboard → API Keys → create a key.
2. Deploy the function — dashboard path: Supabase Dashboard → **Edge
   Functions** → "Deploy a new function" → **via Editor** → name it exactly
   `notify-payment`, paste the full contents of
   `app\supabase\functions\notify-payment\index.ts`, deploy — then in the
   function's settings turn **OFF "Enforce JWT verification"** (guests have no
   JWT; the publishable anon key is not a JWT — with verification on, the
   function would reject exactly the callers it exists for).
   CLI fallback if the in-browser editor is unavailable (no global install
   needed):
   ```
   cd "C:\Users\ARIF\Desktop\Hijab Haven\app"
   npx supabase login
   npx supabase functions deploy notify-payment --project-ref tacjzpobeoxyrdrvazni --no-verify-jwt
   ```
3. Set the secret: Dashboard → Edge Functions → Secrets → add
   `RESEND_API_KEY` = the key from step 1.
   CLI alternative:
   `npx supabase secrets set RESEND_API_KEY=<key> --project-ref tacjzpobeoxyrdrvazni`
4. In the app (once deployed): `/admin/settings` → set "Notification email"
   to the SAME address as step 1 → Save. (Until then you can seed it in SQL:
   `UPDATE shop_settings SET shop_email = 'you@example.com' WHERE id = 1;`)
5. Verify end-to-end: place a test order, upload any image as payment proof,
   then check BOTH the inbox AND `/admin/orders` — the order's payment badge
   must show `proof_submitted` **regardless of whether the email arrived**.
   If email fails, the panel is still correct; debug via Dashboard → Edge
   Functions → notify-payment → Logs.

## Part 3 — Dashboard configuration (one-time)

9. **Authentication → Sign In / Providers → Email:** keep Email enabled.
   Set **Email OTP expiry to 600 seconds**. Leave password sign-in enabled
   (admins use email+password).
10. **Authentication → URL Configuration:**
    - Site URL: `https://hijab-haven.netlify.app`
    - Redirect URLs (add both): `https://hijab-haven.netlify.app/**` and
      `http://localhost:5173/**`

## Part 4 — Create the owner (super_admin) account

11. **Authentication → Users → Add user → Create new user.** Enter YOUR email
    and a strong password (this becomes your shop-admin login). Tick
    "Auto Confirm User" if offered. After creation, copy the user's **UID**
    (a UUID like `1b2c3d4e-...`).
12. In **SQL Editor**, run (replace both placeholders):
    ```sql
    INSERT INTO admin_users (id, email, display_name, role)
    VALUES ('PASTE-YOUR-USER-UUID-HERE', 'your-email@example.com', 'Shop Owner', 'super_admin')
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin';
    ```
    **Expected:** "Success. 1 row affected" (or similar).
13. Verify:
    ```sql
    SELECT id, email, role FROM admin_users;
    ```
    **Expected:** your row with `role = super_admin`.

## Part 5 — Optional: second plain-admin test account (used by QA, WP-11)

14. Repeat step 11 with a second email (e.g. a test inbox), copy its UID, then:
    ```sql
    INSERT INTO admin_users (id, email, display_name, role)
    VALUES ('PASTE-SECOND-UUID-HERE', 'test-admin@example.com', 'Test Admin', 'admin')
    ON CONFLICT (id) DO UPDATE SET role = 'admin';
    ```
    This account can manage products/orders/customers but CANNOT add or remove
    admins (that is super_admin only). To remove it later:
    `DELETE FROM admin_users WHERE email = 'test-admin@example.com';`

## Part 6 — Security rule (permanent)

15. **NEVER put the service-role key in frontend code, in the repo, in
    Netlify environment variables, or anywhere the browser can reach.**
    The frontend uses ONLY the publishable anon key
    (`sb_publishable_P3yvDhbFdSmDnxbgTSROrw_1ef6-TA4`), which is safe to ship
    because Row Level Security limits what it can do. The service-role key
    bypasses ALL of that security — anyone who obtains it can read and delete
    everything. It must never leave the Supabase dashboard.

---

## Appendix A — Pre-migration baseline (recorded 2026-06-11, anon key only)

Recorded by WP-02 against `https://tacjzpobeoxyrdrvazni.supabase.co/rest/v1`
with headers `apikey: <anon key>` and `Authorization: Bearer <anon key>`.

| # | Request | Result (pre-migration) | Meaning |
|---|---|---|---|
| a1 | `GET /products?select=id,name,price,category&limit=5` | **HTTP 200**, body `[]` | Public read policy works. Table exists but currently has ZERO rows (live products were never in this table or were cleared). |
| a2 | `GET /products?select=stock&limit=1` | **HTTP 400**, `42703 column products.stock does not exist` | `stock` column not yet added — migration section D adds it. |
| a3 | `GET /products?select=id,name,price,category,description,image_url,created_at,updated_at,created_by&limit=1` | **HTTP 200** `[]` | All 9 legacy columns exist as per supabase_setup.sql. |
| b | `GET /customers?select=id&limit=1` | **HTTP 500**, `42P17 infinite recursion detected in policy for relation "admin_users"` | LIVE PROOF of the ARCHITECTURE §4.2 recursion bug. The migration's sections B+C fix exactly this. |
| c | `POST /orders` (any body) | **HTTP 404**, `PGRST205 Could not find the table 'public.orders'` | `orders` table does not exist yet — expected pre-migration. |
| d | `POST /rpc/is_admin` body `{}` | **HTTP 200**, body `false` | Function exists and fails closed for anon. |
| d2 | `POST /rpc/is_super_admin` body `{}` | **HTTP 404**, `PGRST202 not found` | Not yet created — migration section A adds it. |
| e | `POST /rpc/place_order` (4 named args) | **HTTP 404**, `PGRST202 Could not find the function public.place_order(...)` | Not yet created — expected pre-migration; section I adds it. |
| f1 | `GET /user_profiles?limit=1` | **HTTP 404**, `PGRST205` | Table not yet created — expected. |
| f2 | `GET /wishlists?limit=1` | **HTTP 404**, `PGRST205` | Table not yet created — expected. |
| f3 | `GET /addresses?limit=1` | **HTTP 404**, `PGRST205` | Table not yet created — expected. |

Note: `register_customer` was NOT invoked (calling it would insert a junk row
into the live `customers` table). Its existence is established by
`supabase_setup.sql` and by the live site's working entry gate.

## Appendix B — Re-run these AFTER the migration (expected-after results)

Run in Git Bash / WSL (or any shell with `curl`). PowerShell equivalents below.

```bash
KEY="sb_publishable_P3yvDhbFdSmDnxbgTSROrw_1ef6-TA4"
BASE="https://tacjzpobeoxyrdrvazni.supabase.co/rest/v1"
A() { curl -s -w "\nHTTP %{http_code}\n" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" "$@"; }

A "$BASE/products?select=id,name,price,category,stock&limit=5"
A "$BASE/customers?select=id&limit=1"
A -X POST -H "Content-Type: application/json" -d '{"customer_name":"x","customer_phone":"0","items":[],"total":0}' "$BASE/orders"
A -X POST -H "Content-Type: application/json" -d '{}' "$BASE/rpc/is_admin"
A -X POST -H "Content-Type: application/json" -d '{}' "$BASE/rpc/is_super_admin"
A -X POST -H "Content-Type: application/json" -d '{"p_customer_name":"x","p_customer_phone":"0","p_address":{},"p_items":[]}' "$BASE/rpc/place_order"
A "$BASE/user_profiles?limit=1"
A "$BASE/wishlists?limit=1"
A "$BASE/addresses?limit=1"
```

PowerShell version of the first call (same header pattern for the rest):

```powershell
$key = "sb_publishable_P3yvDhbFdSmDnxbgTSROrw_1ef6-TA4"
$h = @{ apikey = $key; Authorization = "Bearer $key" }
Invoke-RestMethod -Headers $h -Uri "https://tacjzpobeoxyrdrvazni.supabase.co/rest/v1/products?select=id,name,price,category,stock&limit=5"
```

| Request | Expected AFTER migration |
|---|---|
| `GET /products?...&select=...,stock` | HTTP 200, `[]` or product rows — `stock` column now selectable (no more 42703) |
| `GET /customers?select=id&limit=1` | HTTP 200, body `[]` — clean RLS denial-by-empty-set. The 500 recursion error is GONE. (Any 500 here = migration did not apply.) |
| `POST /orders` direct insert | HTTP 401 or 403 with code `42501` "row-level security" — direct inserts are blocked by design (no INSERT policy; orders go only through `place_order`). The 404 is gone. |
| `POST /rpc/is_admin` | HTTP 200, `false` (unchanged) |
| `POST /rpc/is_super_admin` | HTTP 200, `false` (was 404) |
| `POST /rpc/place_order` with empty `p_items` | HTTP 400 with message containing `EMPTY_ORDER` (was 404). This proves the RPC exists and validates. The happy path is proven by checklist step 7 (rollback test) and again end-to-end in WP-06. |
| `GET /user_profiles?limit=1` | HTTP 200, `[]` (anon sees no rows; was 404) |
| `GET /wishlists?limit=1` | HTTP 200, `[]` (was 404) |
| `GET /addresses?limit=1` | HTTP 200, `[]` (was 404) |

If every row matches the "Expected AFTER" column, the database side of the
rebuild is complete and WP-03 can build against it.

## Appendix C — Pre-002 baseline (recorded 2026-06-11, anon key only)

Recorded by WP-V2-01 against `https://tacjzpobeoxyrdrvazni.supabase.co/rest/v1`
via PowerShell `Invoke-RestMethod` with headers `apikey: <anon key>` and
`Authorization: Bearer <anon key>`. Neither 001 nor 002 had been run yet.

| # | Request | Result (pre-002) | Meaning |
|---|---|---|---|
| c1 | `GET /collections?select=id&limit=1` | **HTTP 404**, `PGRST205 Could not find the table 'public.collections'` | Table not yet created — 002 section A adds it. |
| c2 | `GET /shop_settings?select=upi_id&limit=1` | **HTTP 404**, `PGRST205 Could not find the table 'public.shop_settings'` | Table not yet created — 002 section D adds it. |
| c3 | `POST /rpc/register_customer_v2` (4 named args) | **HTTP 404**, `PGRST202 Could not find the function public.register_customer_v2(p_email, p_joined_date, p_name, p_phone)` — hint: "Perhaps you meant to call the function public.register_customer" | Not yet created — 002 section C adds it. The hint is live proof the legacy 3-arg `register_customer` exists, confirming why v2 needs a distinct name (overload ambiguity). No row was inserted (the call never executed). |
| c4 | `POST /rpc/submit_payment_proof` (3 named args) | **HTTP 404**, `PGRST202 Could not find the function public.submit_payment_proof(p_order_code, p_payment_ref, p_proof_path)` | Not yet created — 002 section G adds it. |

After running 001 + 002, re-check using the table in Part 2b step 2b.2 #8:
c1/c2 become HTTP 200 with rows, c4 becomes HTTP 400 `ORDER_NOT_FOUND`, and
c3 exists (but is only exercised through the entry gate, never casually).
