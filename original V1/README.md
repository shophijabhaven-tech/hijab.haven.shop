# Original V1 — Legacy Single-File Site (archive)

This folder preserves the original Hijab Haven website exactly as it ran
before the rebuild. Nothing here is used by the new app in `..\app\`.

| File | What it is |
|---|---|
| `index.html` | The complete original site — one 1.2 MB HTML file with all CSS/JS inline. This is what hijab-haven.netlify.app served before cutover. |
| `hijab_haven_final.html` | A near-identical backup copy of the same file (kept for completeness). |
| `supabase_setup.sql` | The original database setup script. **Do not run it** — it contains the RLS recursion bug that migrations `..\app\supabase\migrations\001_rebuild.sql` fixed in production on 12 Jun 2026. Historical reference only. |
| `DEPLOYMENT_GUIDE.md` | The original GitHub-Pages deployment guide. Superseded by `..\GO_LIVE.md` and `..\app\README.md` (Netlify). |

Safe to keep, safe to commit (the only key inside is the publishable anon
key, which is public by design). If you ever need to roll back to the old
site in an emergency, deploying this `index.html` as a static file is all
it took — but note the old site's admin panel used the hardcoded PIN 1226,
which the new database no longer treats as meaningful security.
