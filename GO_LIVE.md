# Hijab Haven — Go-Live Checklist

This is the single entry point for launching the new shop app. Work through
it top to bottom, ticking each box. Details for every step live in:

- `app\README.md` — the app's owner manual (full version of this checklist)
- `docs\SUPABASE_SETUP_CHECKLIST.md` — database setup, step by step
- `docs\QA_REPORT.md` — what was already tested and what was deferred to you

---

## Step 0 — Publish to GitHub (one time, before Netlify can see the code)

- [x] **DONE 12 Jun 2026** — repository initialized, the full rebuild
      committed (77 files), and pushed to the `rebuild` branch of
      `shophijabhaven-tech/hijab.haven.shop`. `main` (the old live site)
      is untouched. Future updates from this folder are just:

```
git add .
git commit -m "describe the change"
git push
```

**Branch strategy (recommended): push to a branch named `rebuild`, not
`main`.** Anything already on `main` in the GitHub repository stays
untouched; Netlify deploys the `rebuild` branch for staging, and at cutover
you simply point the production site at `rebuild` too. (Pushing straight to
`main` also works, but gives you no separation between old and new.)

What gets uploaded is already filtered by two `.gitignore` files:

- `app\.gitignore` — keeps out `node_modules`, `dist` (build output), and
  `.env.local`
- `.gitignore` (this folder) — additionally keeps out any `node_modules`/
  `dist` anywhere

So the push contains the new app's source, docs, the small brand images,
and the archived original site (`original V1\`) — no dependency folders,
no local secrets file.

## Step 1 — Database setup (BOTH migrations: 001 then 002)
- [x] **DONE 12 Jun 2026** (run remotely via the Supabase Management API):
      migrations 001 + 002 applied and verified (all tables, RLS policies,
      functions, collections seed, settings seed, private payment-proofs
      bucket); Authentication configured (Site URL
      `https://hijab-haven.netlify.app`, redirect allowlist incl.
      `http://localhost:5173/**`, OTP expiry 600s); super-admin already
      existed (`shop.hijab.haven@gmail.com`, role `super_admin`) and was
      verified working. An end-to-end test order (place_order → HH code +
      PAY ref + stock decrement) passed and was cleaned up.
- [ ] **Credential hygiene (do now):** revoke the `claude-migration` access
      token (Supabase → avatar → Account Settings → Access Tokens) and
      rotate the project's **secret/service_role API key** (Project
      Settings → API keys) — both were shared in chat during setup.

## Step 1b — OPTIONAL: payment-proof email notifications
- [ ] **OPTIONAL — skip freely.** Email is best-effort: submitted payment
      proofs ALWAYS show up badged in `/admin/orders` (the source of truth),
      with or without this step. If you want an email ping too, follow
      checklist Part 2b.3 in `docs\SUPABASE_SETUP_CHECKLIST.md`:
      sign up at resend.com **with your shop notification email**, deploy the
      `notify-payment` edge function (dashboard editor, or CLI with
      `--no-verify-jwt`), set the `RESEND_API_KEY` secret, and enter the same
      email in `/admin/settings` after the app is deployed.

## Step 2 — Remove the QA test row
- [x] **DONE 12 Jun 2026** — the "QA Smoke Test" customer row was deleted
      during the remote database setup. Nothing to do.

## Step 3 — Create the staging site on Netlify
- [x] **SUPERSEDED 12 Jun 2026** — production cut over directly (Step 5):
      merging `rebuild` → `main` triggered the connected Netlify site to
      auto-build the new app. The app ships with baked-in fallback Supabase
      credentials, so the missing Netlify env vars did not break the build.
      Optionally still add both `VITE_SUPABASE_*` variables in Site
      settings → Environment variables (values in `app\.env.example`) as
      good practice.

## Step 4 — Verify (deferred QA items — now ON PRODUCTION)
- [ ] Owner login round-trip: `/auth` → "Owner? Sign in with password" →
      your email+password → you land in the Owner Panel. (A non-admin
      account signing in lands on the shop as a customer; if it browses to
      `/admin` it sees a polite "Not authorized" page.)
- [ ] Customer email OTP round-trip at `/auth` with a real inbox.
- [ ] One real guest order end-to-end: cart → 3-step checkout → WhatsApp
      message opens with the HH-000NN order code → order row visible in
      `/admin/orders`.
- [ ] Side-by-side look check vs the current live site at 390px (phone) and
      1440px (desktop): indistinguishable.

## Step 5 — Production cutover
- [x] **DONE 12 Jun 2026** — `rebuild` merged into `main` (merge commit
      `abf1abf`); Netlify auto-built and https://hijab-haven.netlify.app
      now serves the new app. Verified: all routes 200 (SPA deep links
      work), fonts/OG tags present, JS bundle + both brand images serving.
- [ ] **Rollback if ever needed:** Netlify → **Deploys** → select the last
      pre-cutover deploy → **Publish deploy** (old site back in under a
      minute). Or `git revert abf1abf` on `main` and push.

## Step 6 — Post-cutover smoke test (on https://hijab-haven.netlify.app)
- [ ] Incognito window: splash plays, entry gate appears, accepts
      name+phone+email, row shows in `/admin/customers`.
- [ ] Browse `/shop`, open a product, add to cart.
- [ ] Place one real order: WhatsApp message + row in `/admin/orders` +
      status moves pending → confirmed.
- [ ] Admin login works on the production URL.
- [ ] Direct link `https://hijab-haven.netlify.app/shop` loads in a fresh
      tab (no 404).

Done — the new app is live. Full manual: `app\README.md`.
