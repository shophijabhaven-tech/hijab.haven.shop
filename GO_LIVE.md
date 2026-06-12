# Hijab Haven — Go-Live Checklist

This is the single entry point for launching the new shop app. Work through
it top to bottom, ticking each box. Details for every step live in:

- `app\README.md` — the app's owner manual (full version of this checklist)
- `docs\SUPABASE_SETUP_CHECKLIST.md` — database setup, step by step
- `docs\QA_REPORT.md` — what was already tested and what was deferred to you

---

## Step 0 — Publish to GitHub (one time, before Netlify can see the code)

This folder is not a git repository yet. From a terminal in
`C:\Users\ARIF\Desktop\Hijab Haven`, run:

```
git init
git checkout -b rebuild
git add .
git commit -m "Hijab Haven rebuild (Vite SPA + Supabase)"
git remote add origin https://github.com/shophijabhaven-tech/hijab.haven.shop.git
git push -u origin rebuild
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
- [ ] Netlify → **Add new site → Import an existing project → GitHub** →
      repository `hijab.haven.shop` → branch `rebuild`.
- [ ] Build settings are auto-read from `netlify.toml` — do not change them.
- [ ] **Site settings → Environment variables** → add both:
      ```
      VITE_SUPABASE_URL=https://tacjzpobeoxyrdrvazni.supabase.co
      VITE_SUPABASE_ANON_KEY=sb_publishable_P3yvDhbFdSmDnxbgTSROrw_1ef6-TA4
      ```
- [ ] Deploy (re-trigger a deploy if the variables were added after the
      first build). Note the staging URL.

## Step 4 — Verify on staging (deferred QA items)
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
- [ ] Netlify → existing **hijab-haven** production site → connect it to the
      same repository + `rebuild` branch (settings auto-read from
      `netlify.toml`) → add the same 2 environment variables → deploy.
- [ ] **Rollback if needed:** production site → **Deploys** → select the
      last good pre-cutover deploy → **Publish deploy** (old site back in
      under a minute). Fix on staging, cut over again.

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
