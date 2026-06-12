# Hijab Haven — Free Deployment & Backend Setup Guide

## Architecture Overview (Zero Secrets in Code)

```
┌─────────────────────────────────────────────────────────┐
│              GITHUB PAGES (Free Hosting)                 │
│              Serves: index.html (frontend)               │
│                                                         │
│   Only contains: Supabase URL + anon key                │
│   (both are SAFE to commit — protected by RLS)          │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │     SUPABASE        │
              │     (Free Tier)     │
              │                     │
              │ • Products DB       │
              │ • Customers DB      │
              │ • Image Storage     │
              │ • Auth (admin)      │
              │ • RLS Policies      │
              └─────────────────────┘
```

### Why No Secrets Are Needed

The Supabase **anon key** is designed to be public. It's not a secret — it's a *public identifier* like a website's URL. Security comes from **Row Level Security (RLS) policies**, not from hiding the key:

| What anon key CAN do | What anon key CANNOT do |
|---|---|
| Read products (public) | Write/delete products |
| Register as customer | Read customer list |
| View product images | Upload/delete images |
| — | Access admin panel |

Even if someone reads your source code on GitHub, they cannot modify your data.

---

## STEP 1: Set Up Supabase (Everything Lives Here)

### Create Account & Project
1. Go to **https://supabase.com** and click "Start your project"
2. Sign up with GitHub or email — **completely free, no credit card**
3. Create a new project:
   - Name: `hijab-haven`
   - Database password: (choose a strong one, save it)
   - Region: Pick closest to India (Singapore or Mumbai)
4. Wait ~2 minutes for project to initialize

### Set Up Database
5. Go to **SQL Editor** (left sidebar)
6. Click "New query"
7. Copy-paste the ENTIRE contents of `supabase_setup.sql`
8. Click **Run** — all tables, policies, and functions will be created

### Create Your Admin Account
9. Go to **Authentication → Users**
10. Click **"Add user" → "Create new user"**
11. Enter your admin email & a strong password
12. After creation, **copy the User UID** (the UUID shown)
13. Go back to **SQL Editor** and run:
```sql
INSERT INTO admin_users (id, email, display_name, role)
VALUES (
  'PASTE-YOUR-UUID-HERE',
  'your-email@example.com',
  'Shop Owner',
  'super_admin'
);
```

### Get Your Public Credentials
14. Go to **Settings → API** (left sidebar)
15. Copy:
    - **Project URL** → e.g., `https://abcdefgh.supabase.co`
    - **anon/public key** → starts with `eyJ...`

### Free Tier Limits (more than enough!)
- 500MB database storage
- 1GB file storage (product images)
- 2GB bandwidth/month
- 50,000 monthly active users
- Unlimited API requests

---

## STEP 2: Configure Your HTML

Open `index.html` and find these lines near the top of the `<script>` section:

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

Replace with your actual values:

```javascript
const SUPABASE_URL = 'https://abcdefgh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

**These are safe to commit to GitHub.** They are NOT secrets.

---

## STEP 3: Deploy to GitHub Pages (Free Hosting)

### Strategy A: Simple Upload (Recommended for Beginners)

1. Go to **https://github.com** and sign up (free)
2. Click **+** → **New repository**
3. Name it: `hijab-haven` (or `yourusername.github.io` for root domain)
4. Make it **Public**
5. Click **Create repository**
6. Click **uploading an existing file**
7. Upload `index.html` (just this one file!)
8. Click **Commit changes**
9. Go to **Settings → Pages**
10. Under "Source", select **Deploy from a branch**
11. Branch: `main`, Folder: `/ (root)`
12. Click **Save**
13. Wait 1-2 minutes → your site is live at:
    `https://yourusername.github.io/hijab-haven/`

### Strategy B: Using Git (For Developers)

```bash
# Initialize repository
git init
git add index.html
git commit -m "Initial deploy"

# Push to GitHub
git remote add origin https://github.com/yourusername/hijab-haven.git
git branch -M main
git push -u origin main
```

Then enable GitHub Pages in Settings as above.

### Strategy C: GitHub Desktop (Easiest GUI)

1. Download GitHub Desktop: https://desktop.github.com
2. Sign in with your GitHub account
3. File → New Repository → name it `hijab-haven`
4. Copy `index.html` into the repository folder
5. Write commit message → Click "Commit to main"
6. Click "Publish repository" (ensure "Keep private" is UNCHECKED)
7. Go to github.com → your repo → Settings → Pages → enable it

---

## STEP 4: Custom Domain (Optional, Free)

### Using GitHub's Free Subdomain
Your site is already at `yourusername.github.io/hijab-haven/` — works perfectly!

### Using Your Own Domain (if you have one)
1. In repo Settings → Pages → Custom domain
2. Enter your domain (e.g., `hijabhaven.com`)
3. Add these DNS records at your registrar:
   - A record → `185.199.108.153`
   - A record → `185.199.109.153`
   - A record → `185.199.110.153`
   - A record → `185.199.111.153`
   - CNAME `www` → `yourusername.github.io`
4. Check "Enforce HTTPS"

---

## Security Summary

| Question | Answer |
|----------|--------|
| Can someone steal my data from GitHub? | No — anon key only allows reading products |
| Can someone add fake products? | No — INSERT requires admin auth |
| Can someone read my customer list? | No — SELECT on customers requires admin auth |
| Can someone delete my images? | No — DELETE on storage requires admin auth |
| Where is my admin password? | Only in Supabase Auth — never in your code |
| What if someone decompiles my JS? | They'll find only the anon key, which is useless for writes |

---

## Updating the Site

**To update products:** Use the Owner Panel on the live site (sign in with your admin email/password). No code changes needed.

**To update page content:**
1. Go to your GitHub repo → click `index.html` → edit (pencil icon)
2. Make changes → Commit
3. Site updates in ~1 minute

---

## Cost Summary

| Service | Cost | What It Provides |
|---------|------|-----------------|
| GitHub Pages | $0 | Static site hosting, HTTPS, CDN |
| Supabase (Spark) | $0 | Database, auth, image storage, RLS |
| **TOTAL** | **$0** | **Full secure e-commerce site** |

No credit card required. No secrets to manage. No risk of key leaks.
