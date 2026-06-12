# WP-12 QA Report — Hijab Haven Rebuild

Date: 2026-06-11 · Scope: `C:\Users\ARIF\Desktop\Hijab Haven\app` vs binding spec `docs/ARCHITECTURE.md` (§3, §5, §6, §8.3, §9, §11)
QA agent: qa-engineer (WP-12)

## VERDICT: **APPROVE-WITH-NOTES**

All five §6 critical journeys conform in code. All static gates pass (typecheck, lint, build, 19/19 unit tests). Runtime smoke passes on dev and production-preview servers. Security posture verified live: anon writes denied everywhere, no PIN, no service-role key. Two P1 copy-parity defects were found and **fixed during this pass**; gates re-verified green after the fixes. Remaining items are owner-dependent (migration not yet run, no admin credentials / email inbox) and are listed at the end — they block WP-13 cutover, not this approval.

---

## 1. Journey-by-journey conformance (static code audit vs §6)

| # | Journey / rule | Spec | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Guest checkout, 3 steps, prefills, place_order RPC | §6.1 | **PASS** | `src/pages/Checkout.tsx`: step 1 prefill from `hh_user`/profile, step 2 UPI QR + `9820517390@ptyes` + total, step 3 + 800 ms auto-open of wa.me link; cart cleared on entering step 3 |
| 2 | WhatsApp message format EXACT | §6.1 block | **PASS** | `src/lib/whatsapp.ts` `buildOrderMessage` — pinned character-for-character by `whatsapp.test.ts` (incl. legacy `• name × qty = ₹line` bullet format matching live `index.html` line 1143/1146); `orderCode: null` omits only the `*Order:*` line |
| 3 | §9.3 RPC error map complete | §9.3 | **PASS** | `Checkout.tsx handleOrderError`: EMPTY_ORDER, BAD_QUANTITY, MISSING_CONTACT (→ step 1), UNKNOWN_PRODUCT (+ cart prune via catalog refresh), `OUT_OF_STOCK:<name>` (name extracted into toast), all with the exact spec toast strings |
| 4 | §9.4 continuity rule — no Supabase failure blocks WhatsApp | §9.4 | **PASS** | Every await on the customer path is non-blocking: `placeOrder` failure (non-validation) → step 3 + WhatsApp link without order code + the exact §6.1 toast; `fetchMyAddresses` failure → silent degrade to textarea; `addAddress` is `.catch`-ed best-effort; gate `registerCustomer` is fire-and-forget |
| 5 | Logged-in checkout deltas | §6.2 | **PASS** | Saved-address cards + default preselect, "+ Use a new address" form, "Save this address" persists only after order success, "Track it in My Orders" link rendered only when `user` |
| 6 | Admin order lifecycle transition matrix | §6.3 | **PASS** | `src/pages/admin/Orders.tsx` `TRANSITIONS`: pending→[Confirm, Cancel], confirmed→[Mark Shipped, Cancel], shipped→[Mark Delivered], delivered/cancelled terminal (no buttons); optimistic update + revert-on-error + toasts; cancel goes through ConfirmDialog with explicit "Stock is NOT auto-restocked" |
| 7 | Product CRUD: upload-before-insert | §6.4/§9.6 | **PASS** | `src/pages/admin/Products.tsx handleSubmit`: `uploadProductImage` awaited BEFORE `createProduct`; upload failure keeps form filled and never inserts; edit keeps old `image_url` when no new file; delete → best-effort `deleteProductImage` (errors swallowed by design); 5 MB/type limits mirrored client-side |
| 8 | Broadcast sequential wa.me flow | §6.5 | **PASS** | `src/pages/admin/Broadcast.tsx`: compose + live preview, default all-checked checklist, "Open chat N of M — <name>", list locked during run, progress bar |
| 9 | Customers CSV | §6.5 | **PASS** | `src/pages/admin/Customers.tsx`: exact header `name,phone,joined_date`, filename `hijab-haven-customers.csv`, RFC-4180 escaping |
| 10 | Guards fail closed | §5.4/§9.5 | **PASS** | `AuthContext`: `is_admin` RPC error/throw ⇒ `isAdmin=false`; `RequireAdmin` redirects to `/admin/login` on `!user || !isAdmin`; `admin/Login.tsx` re-checks `is_admin` directly after `signInWithPassword`, signs out non-admins with exact error "Not an admin account"; RLS-is-the-boundary comments present |
| 11 | Gate behavior | §3.1/§5.2 | **PASS** | `Gate.tsx`: shows only when `localStorage.hh_user` absent, only inside CustomerLayout (never `/admin/*` — verified in `App.tsx` route tree), live validation rules + error copy, fire-and-forget register |
| 12 | OTP auth flow (code review only — no inbox) | §5.3 | **PASS (review)** | `Auth.tsx`: `signInWithOtp` → `verifyOtp(type:'email')` → best-effort `upsertMyProfile` → navigate `from ?? '/'`; resend cooldown; "Use a different email" reset |
| 13 | §9.2 catalogue cache | §9.2 | **PASS** | `queries.ts` writes `hh_products` on success; `Shop.tsx` falls back to cache with the exact banner "Showing recently viewed catalogue — refresh to retry" |
| 14 | Stock semantics | §4.3/§7 | **PASS** | `stock === 0` → "Out of stock" overlay + disabled add (`ProductCard.tsx`, `Product.tsx`); blank admin field → `null` (untracked) |

## 2. Security audit

### Static
| Check | Result |
|---|---|
| PIN `1226` anywhere in `app/src` | **NONE** (grep clean) |
| service-role / `sb_secret` key anywhere in `app/src` | **NONE** (only supabase-js library doc-comments in `node_modules`) |
| Anon key only via `import.meta.env` | **PASS** — key literal exists only in `.env.local` / `.env.example` (spec-sanctioned) and the built `dist/` output (expected Vite env inlining of the publishable key); `src/lib/supabase.ts` reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and fails fast if missing |

### Live (anon key `sb_publishable_…TA4` against `tacjzpobeoxyrdrvazni.supabase.co`, 2026-06-11)
| Probe | Status code | Verdict |
|---|---|---|
| GET `/rest/v1/products` SELECT | **200** `[]` | PASS (public read; table empty pre-migration as expected) |
| GET `/rest/v1/customers` SELECT | **500** `42P17` infinite recursion in `admin_users` policy | DENIED (no data leaked). Known legacy bug §4.2; migration 001 fixes to clean deny |
| POST `/rest/v1/products` (forged insert) | **500** `42P17` recursion | **DENIED** — re-queried: intrusion row NOT inserted (200 `[]`) |
| POST `/rest/v1/admin_users` (privilege escalation) | **500** `42P17` recursion | **DENIED** |
| POST `/storage/v1/object/product-images/...` | **400** (`DatabaseInvalidObjectDefinition`) | **DENIED** |
| POST `/rest/v1/rpc/is_admin` as anon | **200** `false` | PASS (fail closed) |
| GET `/rest/v1/orders` | **404** table missing | Expected pre-migration |
| POST `/rest/v1/rpc/place_order` | **404** function missing | Expected pre-migration |
| POST `/rest/v1/rpc/register_customer` | **204** | PASS (gate path live). NOTE: this smoke test inserted one row `QA Smoke Test / 0000000000` into live `customers` — owner should delete it after migration |

Conclusion: nothing is writable with the anon key. Denials currently surface as 500 (policy recursion) instead of clean 401/403; migration 001 converts these to proper RLS denials. **Re-run this table after the migration** (expected: customers SELECT → 200 `[]` for anon, writes → 401/403).

## 3. Copy parity vs live `index.html` (§8.3)

| Block | Verdict |
|---|---|
| Gate: body copy, labels, placeholders, button "Enter the Shop ✨", note "🔒 We only use your info to send order updates & offers.", error pills | PASS |
| Gate tagline | **FIXED** (was P1 — see Defect D1) |
| Hero: badge "✦ Navi Mumbai's Favourite Hijab Store", title `From casual<br>to <em>elegant,</em><br>always a statement.`, sub, buttons, "✦ Hijab · Hampers · Accessories ✦" | PASS |
| Marquee `Hijabs ✦ Hampers ✦ Accessories ✦ Online Payments Only ✦ Navi Mumbai ✦ Hijab & Happiness ✦` (duplicated) | PASS |
| 6 category cards (names, icons, descriptions) incl. "Minimal & Neutral" | PASS (char-exact in `CATEGORIES`, `lib/supabase.ts`) |
| Quote `"From casual to elegant, hijab is always a statement." — Hijab Haven` | PASS |
| Hampers: Blossom Hamper/Most Loved 🌸, Celebration Set/Bestseller 🎀, Royal Hamper/Luxury Pick 💝, descs, "Enquire →" → `chat.whatsapp.com/LWnsTUxGY4G9hmpFCEC06R` | PASS |
| Why: "Hijab & Happiness", 4 items (Handpicked Quality / Based in Navi Mumbai / Secure Online Payments / Growing Community) + 3 visual blocks | PASS |
| Payment: owner name "Kaneez Zehra Afaq Hussain Abedi", UPI ID `9820517390@ptyes`, "Paytm · GPay · PhonePe · BHIM", screenshot note 💚 | PASS |
| Instagram: "Follow the Journey", "101 posts · 274 followers · Countless happy hijabis.", `@_hijab__haven_`, share buttons | PASS |
| Footer | **FIXED** (was P1 — see Defect D2) |
| Checkout step 2/3 copy (not in §8.3 list, checked anyway) | PASS — matches live overlay copy incl. "✅ I've Paid — Confirm Order" and the full thank-you message |

## 4. Runtime smoke

Dev server (`npm run dev`, :5173) and production preview (`vite preview` of `npm run build` output, :4173): all of `/`, `/shop`, `/product/1`, `/checkout`, `/auth`, `/account`, `/admin`, `/admin/login`, `/nonexistent` returned **HTTP 200** with the SPA shell (`<div id="root">`) on both servers — no import-time crashes, dev log clean. Both servers killed and ports verified closed afterwards.

## 5. Gates (run AFTER the defect fixes)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `npm test` (`vitest run`) | **PASS — 19/19** (`src/lib/format.test.ts` 10, `src/lib/whatsapp.test.ts` 9) |
| `npm run build` | PASS (551.8 kB JS / 153 kB gzip; chunk-size warning — see P2-1) |

New in this WP: `"test": "vitest run"` script; unit tests pinning `inr` en-IN grouping (`₹0`, `₹1,198`, `₹1,00,000`, `₹1,23,45,678`), `formatDate` (valid/invalid/empty), `buildOrderMessage` exact §6.1 template with/without order code, and `waLink` URL-encoding round-trips.

## 6. Defects found & fixed (P0/P1)

| ID | Sev | Defect | Fix |
|---|---|---|---|
| D1 | P1 | Gate tagline read "✦ Elegance in Every Drape" — that string appears nowhere in live `index.html`; the live `#gate` tag (line 409) is "✦ Navi Mumbai · Online Store". §8 rule: "where they differ, the live site wins". NOTE: the §8.3 notes column itself names "Elegance in Every Drape" — internal spec contradiction, resolved in favor of the live file per §8's governing rule. | `src/components/Gate.tsx` — tagline replaced with the live string. The tagline remains on `/auth` (a new page with no live counterpart — acceptable). |
| D2 | P1 | Footer not verbatim (§8.3 lists footer as a verbatim port): rebuilt said "Made with 💕" and dropped the linked `@_hijab__haven_` handle; live is `© 2025 Hijab Haven · Navi Mumbai · @_hijab__haven_ · Made with ❤️`. | `src/components/Footer.tsx` — line restored verbatim with the handle linked to Instagram; orphaned `HAMPER_GROUP_URL` import removed. |

No P0 defects found.

## 7. P2 recommendations (not fixed — polish only)

1. **Bundle chunk warning**: 551 kB single JS chunk (>500 kB threshold). A `React.lazy` boundary around `pages/admin/*` would cut the customer-path bundle materially. Not a spec requirement; do in a later WP if desired.
2. **Admin deep-link refresh bounce**: on a hard refresh of e.g. `/admin/orders`, `AuthContext.isLoading` flips false before the async `is_admin` RPC resolves, so a signed-in admin is briefly redirected `/admin/orders → /admin/login → /admin` (loses the deep link, lands on Dashboard). Fails closed and self-corrects; consider keeping a separate `roleLoading` flag if it annoys the owner.
3. **Cart-clear timing**: spec sequence note says `clearCart()` on "Continue shopping"; the code clears on entering step 3 (and again on the button). Earlier clearing is the safer behavior (prevents accidental double orders via back-navigation) — recommend keeping the code as-is and treating the spec line as satisfied in intent.
4. Live `customers` table now contains one QA smoke row (`QA Smoke Test` / `0000000000`, 2026-06-11) — delete from `/admin/customers` after migration, or via SQL editor.

## 8. Owner-dependent verifications still pending (NOT failures — environment limits)

These block **WP-13 cutover sign-off**, not this code approval:

1. **Run migration** `app/supabase/migrations/001_rebuild.sql` in the Supabase SQL editor (project `tacjzpobeoxyrdrvazni`), then re-run the §4.7 post-migration queries AND the security table in §2 above (expect clean 401/403 denials, customers SELECT 200-empty for anon, `place_order` happy path returning `HH-000NN`).
2. **Seed super_admin** (dashboard step §4.7) and E2E the admin round-trip: login, non-admin rejection ("Not an admin account"), order lifecycle, product CRUD upload, Admins page role checks with a second plain-admin account.
3. **OTP round-trip** with a real inbox (send → verify → profile row → `/account/*`).
4. **Guest + logged-in order E2E** against the live `place_order` (row with NULL/own `user_id`, snapshot/total correctness, stock decrement on a tracked product).
5. **Screenshot parity** live vs staging at 390 px and 1440 px (§8.3 acceptance) and the 390 px mobile pass on every route + Lighthouse — requires the WP-13 staging deploy.

## 9. Files touched in this WP

- `app/src/components/Gate.tsx` — D1 fix
- `app/src/components/Footer.tsx` — D2 fix
- `app/package.json` — added `test` script
- `app/src/lib/format.test.ts` — new (10 tests)
- `app/src/lib/whatsapp.test.ts` — new (9 tests)

---

## V2 QA (WP-V2-09)

Date: 2026-06-12 · Scope: full §12 V2 delta + still-binding V1 rules (§6.1 message, §9.3 error map, §9.4 continuity) · QA agent: qa-engineer

### VERDICT: **APPROVE-WITH-NOTES**

Every §12.1–§12.8 requirement conforms in code. All gates green after one fix: `npx tsc --noEmit` exit 0, `npm run lint` exit 0, **29/29 unit tests**, `npm run build` clean (admin pages now lazy chunks — the WP-12 P2-1 bundle warning is gone; largest chunk 314 kB). Runtime smoke passes on dev (:5173) and built-dist preview (:4173); both servers killed and ports verified closed. Live-DB degradation verified by REST probe + code trace. One P1 copy defect fixed in this pass; remaining items are P2 polish or owner-dependent.

### 1. Conformance table (§12.1–§12.8, static audit)

| § | Requirement | Verdict | Evidence |
|---|---|---|---|
| 12.1 | Splash: sessionStorage `hh_splash_seen` once/session, lazy init, flag set at fade start, 1.8 s + 400 ms fade, z-[10001] above gate, brand gradient/110px logo/wordmark/180×3 bar | **PASS** | `Splash.tsx`; `hasSeenSplash()` try/catch returns `true` on storage failure — splash can never brick entry; setter failure also caught (unmount timer still fires) |
| 12.1 | Keyframes + reduced-motion (blink disabled, bar kept) | **PASS** | `globals.css` lines 62–66 — character-identical to the spec block |
| 12.1 | Customer-layout-only mounting (admin deep links skip it) | **PASS** | `App.tsx` — `<Splash />` is first child of `CustomerLayout`, above `<Gate />`; `/admin/*` routes live outside that layout |
| 12.2 | Gate email field: required, `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` after trim+lowercase, error copy `Please enter a valid email address ✦`, order name→phone→email, live pill behavior (3.5 s hide / 1.5 s flash / focus) | **PASS** | `Gate.tsx` `validate()` + `showError()` |
| 12.2 | `hh_user` shape `{name, phone, email, joinedDate, joinedTs}`; `registerCustomerV2` fire-and-forget; legacy `register_customer` never called with 4 args | **PASS** | `Gate.tsx` handleSubmit (`.catch(() => {})`); grep: the only `register_customer` mention in src is a warning comment in `queries.ts`; `registerCustomerV2` calls `register_customer_v2` with the 4 named params |
| 12.3 | `/auth` unified: OTP default + `Owner? Sign in with password` toggle + `← Back to code sign-in`; no "Not an admin account" sign-out anywhere | **PASS** | `Auth.tsx`; grep for the old string returns nothing |
| 12.3 | Race-safe redirect: `isRoleLoading` in AuthContext (seq-guarded against overlapping auth events, always settles, fails closed); `user && isRoleLoading` → spinner before `Navigate` | **PASS** | `AuthContext.tsx` (roleRequestSeq), `Auth.tsx` lines 58–59 |
| 12.3 | `RequireAdmin`: `isLoading \|\| (user && isRoleLoading)` → spinner; `!user` → `/auth` with `state.from`; non-admin → branded "This area is for the shop owner." block (NOT redirect) | **PASS** | `RequireAdmin.tsx` — also fixes WP-12 P2-2 (deep-link refresh bounce) |
| 12.3 | `/admin/login` → `<Navigate to="/auth" replace />`; `admin/Login.tsx` deleted; Navbar `⚙ Owner Panel`; sidebar order Dashboard→Orders→Products→Collections→Customers→Broadcast→Settings→Admins(super only) | **PASS** | `App.tsx` line 75; file absent, zero dangling imports; `Navbar.tsx`; `AdminLayout.tsx` |
| 12.4 | Context fallback chain fetch → `hh_collections` cache → `DEFAULT_COLLECTIONS`, never empty (even a successful-but-empty fetch is ignored); one fetch/session; provider inside AuthProvider | **PASS** | `CollectionsContext.tsx` (lazy seed + `fresh.length > 0` guard), `main.tsx` |
| 12.4 | Shop deep-link no-bounce: invalid `:category` redirects only after `collectionsLoading` settles; pending key renders skeletons, never "Coming Soon" | **PASS** | `Shop.tsx` lines 101–107 |
| 12.4 | Admin Collections: sort_order list + counts, ↑/↓ optimistic swap + revert, add with auto-slug + client uniqueness, key immutable after create (form disabled AND `updateCollection` type omits `key`), delete disabled at count>0 + `COLLECTION_IN_USE` mapped | **PASS** | `Collections.tsx`, `queries.ts` (`slugifyCollectionKey`, `deleteCollection`) |
| 12.4 | Consumers collection-driven: Home cards, Shop chips/heading/desc, Product label (`byKey[...]?.label ?? category`), admin product `<select>` (keeps a removed-collection key visible on edit) | **PASS** | `Home.tsx`, `Shop.tsx`, `Product.tsx` 122–124, `admin/Products.tsx` 327–331 |
| 12.5 | Checkout fallback chain fetch → `hh_settings` cache → `DEFAULT_SETTINGS` — never blocks render (lazy initializer is synchronous; fetch failure caught) | **PASS** | `Checkout.tsx` 128–145 |
| 12.5 | QR `onError` → baked-in fallback without loop; empty-string `upi_qr_url`/`upi_id` fall back via `\|\|` | **PASS** | `Checkout.tsx` 595–611 (`endsWith` guard) |
| 12.5 | Admin Settings: UPI/email/WhatsApp validation + save, QR upload (5 MB/type client check → `uploadSettingsQr` to `product-images/settings/upi-qr_<ts>.<ext>` → save URL), current QR preview | **PASS** | `Settings.tsx`, `queries.ts` |
| 12.6 | `payment_ref` threading: `PlaceOrderResult.payment_ref: string \| null`, `undefined → null` normalization (pre-002 RPC), `enterStep3` stores it, message gains the line only when present | **PASS** | `queries.ts` 305–329, `Checkout.tsx` |
| 12.6 | Step-3 proof upload only when `orderCode && paymentRef` (continuity path has neither → block absent); 5 MB/mime client check; upload → `submit_payment_proof` → fire-and-forget `notifyPaymentEmail` AFTER success; `ALREADY_VERIFIED` mapped distinctly; state machine idle/uploading/done/error with retry | **PASS** | `Checkout.tsx` 367–393, 663–696 |
| 12.6 | WhatsApp `*Payment ID:*` line directly after `*Order:*`; byte-identical V1 output when ref/upiId omitted | **PASS** | `whatsapp.ts`; pinned by `whatsapp.test.ts` (exact-string + `withNull === without` tests) |
| 12.6 | Admin Orders: PaymentBadge sand/rose/mocha/warm, `proof submitted` quick-filter chip, View proof via `createSignedUrl(path, 300)` (popup-blocker-safe open), Verify/Reject only on `proof_submitted`, optimistic + revert; `payment_status` undefined-tolerant pre-002 | **PASS** | `admin/Orders.tsx` |
| 12.7 | `notifyPaymentEmail` never throws, never awaited on the customer path; edge function `app/supabase/functions/notify-payment/index.ts` is **byte-identical** to the §12.7 spec block (verified by programmatic diff) | **PASS** | `queries.ts` 401–409; diff: MATCH |
| 12.8 | Home `#payment` section + group-link line gone; Navbar Payment link gone (desktop + mobile share one `links` array); Hampers stays; §8.3 blocks otherwise untouched | **PASS** | `Home.tsx`, `Navbar.tsx`; grep `#payment` → comments only |
| 12.9 | Migration 002 on disk: SQL body verbatim from the spec block (diff anchored at first statement: MATCH; only packaging-comment header differs); `payment-proofs` bucket private/5 MB/4 mimes, INSERT-anyone, SELECT/DELETE admin, no UPDATE policy | **PASS** | `app/supabase/migrations/002_v2_delta.sql` |
| §6.1/§9.3 | Error map unchanged and complete; exact toast strings; `OUT_OF_STOCK:<name>` extraction | **PASS** | `Checkout.tsx` `handleOrderError` |
| §9.4 | Full re-trace of every `await` on the customer path: `fetchShopSettings` (caught, seed stays) · `fetchMyAddresses` (caught → textarea) · `placeOrder` (caught → continuity step 3, no-ref message) · `addAddress` (`.catch` + toast) · `fetchProducts` in UNKNOWN_PRODUCT branch (caught; pre-step-3 validation path by design) · gate `registerCustomerV2` (`.catch`) · splash (timers only, storage try/catch). Proof upload + email are post-step-3 and optional. **Nothing new can block the WhatsApp link.** | **PASS** | traced in `Checkout.tsx`, `Gate.tsx`, `Splash.tsx` |
| Security | No service-role/`sb_secret`/PIN `1226` in src (grep clean); anon key via `import.meta.env` only; `payment-proofs` touched only by `upload` + `createSignedUrl`; service-role key exists only inside the edge function via `Deno.env` (server-side, per spec) | **PASS** | grep + `queries.ts` |

### 2. Runtime smoke

Dev (:5173) and `vite preview` of the production build (:4173): `/`, `/shop`, `/auth`, `/admin`, `/admin/login`, `/admin/collections`, `/admin/settings`, `/checkout`, `/nonexistent` → **HTTP 200 SPA shell** (`<div id="root">`) on both. Dev log clean (no import-time errors). Both servers killed; ports re-checked closed (0 listeners).

### 3. Live-DB degradation audit (anon key, pre-migration, 2026-06-12)

| Probe | Live result | Frontend behavior (code-traced) | Verdict |
|---|---|---|---|
| GET `/rest/v1/collections` | **404** PGRST205 (table missing) | `fetchCollections` throws → context `.catch` keeps seed → `readCachedCollections()` null on fresh device → **`DEFAULT_COLLECTIONS` (6 cards, exact live copy)** | PASS |
| GET `/rest/v1/shop_settings` | **404** PGRST205 | `fetchShopSettings` throws → Checkout `.catch` keeps lazy seed → **`DEFAULT_SETTINGS`** (`9820517390@ptyes`, `/images/upi-qr.jpg`); admin Settings page shows ErrorBlock+Retry (correct pre-002) | PASS |
| POST `/rest/v1/rpc/register_customer_v2` | **404** PGRST202 (function missing) | Gate `.catch(() => {})` — entry, hh_user write, welcome toast all unaffected | PASS |
| POST `/rest/v1/rpc/submit_payment_proof` | **404** PGRST202 | Unreachable pre-002: `place_order` v1 returns no `payment_ref` → proof block never renders; defensive inline error path exists anyway | PASS |

### 4. Defects found & fixed

| ID | Sev | Defect | Fix |
|---|---|---|---|
| D-V2-1 | P1 (binding-copy) | Step-3 proof success line read "Proof received — we'll confirm your order soon 💕"; §12.6 specifies the exact string `Proof received ✅ — the owner will verify shortly.` Spec is binding; no documented deviation existed. | `Checkout.tsx` — string replaced with the spec copy. All gates re-run green after the fix. |

No P0 defects.

### 5. P2 notes (not fixed — polish/letter-vs-intent)

1. §12.6 says proof "Upload failure → error **toast**"; storage/RPC failures render a persistent **inline** error instead (client-side validation failures do use toasts). Intent fully met — the failure surfaces and the WhatsApp path is untouched — and inline survives longer than a 3.5 s toast. Recommend a one-line spec note rather than a code change.
2. Admin Settings accepts `image/gif` for the QR upload; the spec's mime examples are jpeg/png/webp. The `product-images` bucket has no mime cap (001 adds policies only), so GIF works — harmless liberality.
3. Mobile nav overlay shows an extra "⚙ Owner Panel" item for admins in addition to the role-aware header button — duplication visible only to a signed-in admin on mobile; harmless.
4. Carry-over from WP-12: the live `customers` table still holds the QA smoke row (`QA Smoke Test` / `0000000000`) — delete after migration.

Resolved since WP-12: P2-1 bundle warning (admin pages lazy-loaded; build warning gone) and P2-2 admin deep-link refresh bounce (`isRoleLoading` in `RequireAdmin`).

### 6. Gates (after D-V2-1 fix)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `npm test` | **PASS — 29/29** (format 10, whatsapp 13 incl. V2 Payment-ID/upiId-override/byte-parity, queries/slugify 6) |
| `npm run build` | PASS — code-split, no chunk warning |

Spec-suggested test additions (buildOrderMessage with paymentRef + upiId override; slugifyCollectionKey edges incl. symbols-only → '') were **already present** from WP-V2-02 — nothing forced.

### 7. Owner-dependent deferrals (NOT failures)

1. **Run migrations 001 then 002** in one sitting (Supabase SQL editor) — then re-run the §2 security table and the degradation probes (expect collections/shop_settings 200, RPCs live, `place_order` returning `payment_ref`).
2. **Deploy edge function** `notify-payment` (optional — system is fully functional without email): Resend signup with the shop email, `RESEND_API_KEY` secret, JWT verification OFF, per GO_LIVE steps.
3. **Admin E2E**: unified `/auth` password login → Owner Panel; non-admin "Not authorized" block; Collections CRUD against the real trigger (`COLLECTION_IN_USE`); Settings save + QR upload round-trip.
4. **OTP round-trip** with a real inbox.
5. **Real proof-upload E2E**: guest order → upload screenshot → `proof_submitted` badge → View proof signed URL → Verify/Reject → resubmission-after-reject.
6. **Responsive screenshot pass** (390 px / 1440 px) incl. splash + gate sequence on the staging deploy.
