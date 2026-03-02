# Optavia Plus — Setup Guide

Follow these steps IN ORDER. Each step takes about 5 minutes.

---

## Step 1: Create Your Free Accounts

You need three free accounts. Open each link and sign up:

1. **GitHub** — https://github.com (stores your code)
2. **Supabase** — https://supabase.com (your database + user accounts)
3. **Vercel** — https://vercel.com (hosts your live website — sign up WITH your GitHub account)

---

## Step 2: Create a Supabase Project

1. Log into https://supabase.com
2. Click **"New Project"**
3. Give it a name: `optavia-plus`
4. Set a **database password** (save this somewhere — you won't need it often but don't lose it)
5. Pick a region close to you (e.g., East US)
6. Click **"Create new project"** and wait ~2 minutes for it to set up

---

## Step 3: Set Up the Database

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase-schema.sql` from this project
4. Copy the ENTIRE contents and paste it into the SQL editor
5. Click **"Run"** (the green play button)
6. You should see "Success. No rows returned" — that's correct!

---

## Step 4: Configure Supabase Auth

1. In Supabase, go to **Authentication** → **Providers** in the left sidebar
2. Make sure **Email** is enabled (it should be by default)
3. OPTIONAL but recommended for testing: Go to **Authentication** → **Settings**
   - Under "Email Auth", you can toggle OFF **"Confirm email"** to skip email verification during development
   - You can turn it back on later for production

---

## Step 5: Get Your Supabase Keys

1. In Supabase, go to **Settings** → **API** (in the left sidebar under Configuration)
2. You'll see two values you need:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public key** — a long string starting with `eyJ...`
3. Keep this page open — you'll need these in the next step

---

## Step 6: Upload Code to GitHub

1. Go to https://github.com/new
2. Name the repository: `optavia-plus`
3. Keep it **Public** (required for free Vercel hosting) or Private if you have Vercel Pro
4. Click **"Create repository"**
5. You'll see instructions — you need to upload all the project files.

**Easiest method — use GitHub's upload feature:**
1. On your new empty repo page, click **"uploading an existing file"**
2. Drag and drop ALL the project files/folders from the `optavia-plus` folder
3. Click **"Commit changes"**

**OR if you have Git installed on your computer:**
```bash
cd optavia-plus
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/optavia-plus.git
git push -u origin main
```

---

## Step 7: Create the .env.local File

Before deploying, you need to create a file called `.env.local` in the root of the project.

1. Copy `.env.local.example` and rename it to `.env.local`
2. Fill in your Supabase values from Step 5:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...your-long-key-here
```

If you're using GitHub upload, you'll add these as Environment Variables in Vercel instead (see Step 8).

---

## Step 8: Deploy to Vercel

1. Go to https://vercel.com/new
2. Click **"Import"** next to your `optavia-plus` GitHub repository
3. Before clicking Deploy, expand **"Environment Variables"**
4. Add these two variables (from Step 5):
   - Name: `NEXT_PUBLIC_SUPABASE_URL` → Value: your Supabase URL
   - Name: `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Value: your Supabase anon key
5. Click **"Deploy"**
6. Wait 1-2 minutes for it to build

---

## Step 9: Set the Auth Redirect URL

After Vercel deploys, you'll get a URL like `https://optavia-plus.vercel.app`.

1. Copy your Vercel URL
2. Go back to **Supabase** → **Authentication** → **URL Configuration**
3. Set **Site URL** to your Vercel URL: `https://optavia-plus.vercel.app`
4. Under **Redirect URLs**, add: `https://optavia-plus.vercel.app/auth/callback`
5. Click **Save**

---

## You're Live! 🎉

Go to your Vercel URL. You should see the Optavia Plus login page!

1. Click "Create One" to make your first coach account
2. Sign in
3. You're in your dashboard — start adding clients!

---

## What's Working Now

- ✅ Real sign-up and sign-in with email + password
- ✅ Each coach gets their own private account
- ✅ Add clients manually or import via CSV
- ✅ Client list with search and status filtering
- ✅ Client detail page with editing, notes, weight tracking
- ✅ Quick actions: Log a Call, Log a Text, Log a Note
- ✅ Relationship Score auto-calculated per client
- ✅ "Who Needs You Today" dashboard widget
- ✅ Activity feed tracking everything you do
- ✅ Data is private per coach (Row Level Security)
- ✅ Works on phone, tablet, and desktop

## Coming Next

- Phase 4: Automated touchpoint sequences
- Phase 5: MLM team hierarchy and downline view
- Phase 6: Marketing hub with post templates and scripts

---

## Troubleshooting

**"Invalid login credentials" error:**
- Make sure you created an account first (click "Create One")
- If you enabled email confirmation, check your inbox

**Blank page after login:**
- Check that your Supabase URL and anon key are correct in Vercel environment variables
- Redeploy after changing environment variables

**"relation coaches does not exist" error:**
- You need to run the SQL schema (Step 3) — go back and paste the SQL into Supabase SQL Editor

**Need to redeploy after changes:**
- Push changes to GitHub → Vercel auto-deploys
- Or go to Vercel dashboard → Deployments → Redeploy
