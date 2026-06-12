# Hijab Haven Rebuild — Work Packages (per docs/ARCHITECTURE.md §11)

## V2 Plan (per ARCHITECTURE.md §12 — splash, unified auth, collections, payment proofs)
- [x] WP-V2-01 [api-data] Migration 002 + notify-payment edge function + GO_LIVE update
- [x] WP-V2-02 [core] Foundation: types, queries, AuthContext isRoleLoading, CollectionsContext
- [x] WP-V2-03 [ui★frontend-design] Splash + Gate signup form (email)
- [x] WP-V2-04 [core] Unified auth: Auth.tsx password toggle, RequireAdmin, Navbar Owner Panel
- [x] WP-V2-05 [ui] Collection-driven Home/Shop/Product + remove #payment
- [x] WP-V2-06 [ui] Admin V2: Collections, Settings (UPI), Products select, Orders payment verify
- [x] WP-V2-07 [core] Checkout: settings-driven UPI, payment_ref, proof upload, email fire-and-forget
- [x] WP-V2-08 [core] Integration: App.tsx wiring + delete admin/Login.tsx
- [x] WP-V2-09 [qa] System QA V2 — APPROVE-WITH-NOTES, 1 P1 copy fix, 29/29 tests, all gates green
- [x] Director visual verification: splash flag set on load, gate signup w/ email, unified /auth,
      checkout-only UPI (step 2), §9.4 continuity live-tested (place_order 404 → step 3 + toast),
      Home has no #payment/UPI/nav link, mobile responsive

## Plan
- [x] WP-01 [devops] Scaffold Vite app + design tokens + netlify.toml
- [x] WP-02 [api/data] Migration SQL file + setup checklist + anon-key smoke tests (DB run is a manual owner step)
- [x] WP-03 [core] App shell: lib, contexts, router, guards, chrome
- [x] WP-04 [ui] Home page + Gate (content-verbatim from index.html)
- [x] WP-05 [ui] Shop / category / product pages + catalogue cache
- [x] WP-06 [core] Checkout (3-step, place_order RPC, WhatsApp continuity)
- [x] WP-07 [core] Customer auth (OTP) + account area (profile, orders, wishlist, addresses)
- [x] WP-08 [core] Admin login + shell + dashboard
- [x] WP-09 [api/data][ui] Admin products CRUD + storage upload
- [x] WP-10 [ui] Admin orders lifecycle
- [x] WP-11 [ui] Admin customers, broadcast, admins management
- [x] WP-12 [qa] System QA & security verification — verdict APPROVE-WITH-NOTES, 2 P1 copy defects fixed, 19/19 unit tests
- [x] WP-13 [devops] Build validation (npm ci clean, all gates green) + README + GO_LIVE.md + admin code-splitting

## Review

All 13 work packages complete (2026-06-11). Final state:
- Canonical app at `app/` — Vite 8 + React 19 + TS strict + Tailwind 4 + react-router 7, builds clean
  (tsc 0, eslint 0, vitest 19/19, build 515 kB main + 8 lazy admin chunks).
- Brand preserved pixel-faithful (verified by copy-parity grep diff + preview screenshots at desktop/mobile).
- Database migration written but NOT YET RUN (owner must paste app/supabase/migrations/001_rebuild.sql
  in the Supabase SQL editor) — it also fixes a live production RLS-recursion bug on `customers`.
- Owner-manual steps are all in GO_LIVE.md (migration, super_admin seed, Netlify staging + cutover,
  deferred E2Es: admin login round-trip, OTP round-trip, real order, screenshot parity on staging).
- QA leftover: delete the smoke row `DELETE FROM customers WHERE phone='0000000000';` (anon key cannot — RLS).

