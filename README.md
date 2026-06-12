# Hijab Haven — Online Store

Premium hijabs, hampers & accessories · Navi Mumbai · [hijab-haven.netlify.app](https://hijab-haven.netlify.app)

| Where | What |
|---|---|
| [`app/`](app/) | **The web app** (Vite + React + Supabase). Start with [`app/README.md`](app/README.md) — the owner manual. |
| [`GO_LIVE.md`](GO_LIVE.md) | Launch checklist (what's done, what's left). |
| [`docs/`](docs/) | Architecture, Supabase setup checklist, QA reports. |
| [`original V1/`](original%20V1/) | Archived original single-file site (pre-rebuild). |

Deployment: Netlify builds from [`netlify.toml`](netlify.toml) (base `app`, publish `dist`).
Backend: Supabase (PostgreSQL + Auth + Storage), secured by Row Level Security.
