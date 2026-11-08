# Sad Reaccs: 10k run tracker

A small web app for Dee, Dils, Prav and Sachi to log runs and keep each other honest on the way to the 10k on **Sun 21 Feb 2027**.

## Files

| File | What it does |
|---|---|
| `index.html` | The main page: layout only, no logic |
| `styles.css` | The race-bib look (colours, fonts, spacing) |
| `app.js` | Main page logic: reads runs, works out progress and next run, draws everything |
| `common.js` | Shared code: runner list and colours, date maths, the plan maths, and the data store |
| `config.js` | **Your settings**: Supabase URL and key, admin code |
| `admin.html` / `admin.js` | Admin page for editing weekly targets |
| `schema.sql` | Builds the database: paste it into Supabase once |
| `manifest.webmanifest`, `icons/` | Makes it installable on iPhone with the app icon |

## How it works (the mechanics)

- **The database stores only facts.** There are three tables: `runs` (one row per run: who, date, km), `plan_weeks` (the 16 weekly targets) and `reaccs` (one row per 😢 sent).
- **Everything else is calculated in the browser**, the same way your spreadsheet formulas work:
  - weekly total = sum of that week's runs (`SUM`)
  - long run = the longest single run that week (`MAX`)
  - weeks run Monday to Sunday, starting Mon 2 Nov 2026
- **Next run** (in `common.js` → `nextRun`) is decided in this order:
  1. Long run not done yet this week → do the long run.
  2. Long run done but weekly km short → km left ÷ runs left (using the top of the runs range), rounded **up** to the nearest 0.5 km.
  3. Both done → "Week done", showing how far you'd still need to go to hit the stretch target.
- **No logins.** Each phone remembers who you are (stored on that phone). The database lets anyone with the link read, log and delete runs, so keep the link in the group chat.
- **Demo mode:** if `config.js` has no Supabase details, the app saves to the browser only. That's handy for testing.

## Setup (one time, about 15 minutes)

### 1. Database (Supabase)
1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open `schema.sql`, copy everything, paste it in, then click **Run**. You should see "Success. No rows returned".
3. Check: **Table Editor** → `plan_weeks` should have 16 rows.

### 2. Plug in your keys
Open `config.js` and paste in your Project URL and anon/publishable key:
```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_...';
```
Change `ADMIN_PIN` if you want a different admin code (default `2102`).

### 3. Put the code on GitHub
1. Open your empty `sad-reaccs` repo on github.com.
2. Click **uploading an existing file**. Drag in **everything inside** the `sad-reaccs` folder, including the `icons` folder.
3. Click **Commit changes**.

### 4. Publish it (Vercel)
1. vercel.com → **Add New… → Project** → **Import** the `sad-reaccs` repo.
2. Framework preset: **Other**. Leave the build settings empty, then click **Deploy**.
3. You'll get a link like `sad-reaccs.vercel.app`. Under **Settings → Domains** you can rename it, e.g. `sadreaccs.vercel.app`.

From now on, any file you change on GitHub goes live automatically within about 30 seconds.

### 5. Install it on an iPhone
1. Open the link in **Safari** (it has to be Safari).
2. Tap **Share** (the square with the arrow) → **Add to Home Screen** → **Add**.
3. The orange bib icon appears on the home screen. Open it and tap your name.

## Good to know
- **Free Supabase projects pause after about 7 days with no activity.** If the app says it can't reach the database, log into Supabase and click **Restore project**.
- **Admin page:** link at the bottom of the app, or `/admin.html`. The code only prevents accidental edits; it isn't real security.
- **To add or rename a runner**, the name has to change in two places: `RUNNERS` in `common.js`, and the `check (runner in (...))` lines in the database.
