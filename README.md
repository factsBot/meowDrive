# meowDrive

Local-first time-capture companion for **Deltek Vision 7.6** timesheets.

This app does **not** integrate with Vision. It does not call APIs, it does
not drive the Vision UI, it does not need IT to enable anything. It is a
personal, single-user capture tool whose job is to make Friday afternoon
take ten minutes instead of ninety. You log time as the day happens; on
Friday you open the week grid, hit **Copy Row**, and paste into Vision.

## What ships in v0.1

Day 1:
- Electron + React + TypeScript desktop app, Windows-first.
- Local SQLite store (`better-sqlite3`) under your user data folder.
- Manual time-entry form + project-combo manager.
- Friday reconciliation grid: one row per project combo, columns Mon–Sun,
  daily and weekly totals, **Copy Row to Vision** (tab-separated hours
  ready to paste into the seven day cells), and **Copy All** for review.
- Per-entry audit log of every create / update / delete with before/after
  snapshots, plus mandatory reason-for-change on entries already marked as
  copied to Vision (DCAA-friendly).

Day 2:
- Global hotkey **Ctrl+Alt+T** opens a floating quick-log popup.
- Top-5 favorite combos surface as numbered buttons (1–5).
- Hours input parses `1.5`, `90m`, `1h30`.
- Number-keys + Ctrl pick a favorite; ↑/↓ + Enter also work; Esc closes.

## Setup

```powershell
# Windows, PowerShell, from the repo root
npm install
# better-sqlite3 ships native bindings for Node — Electron uses a different
# ABI, so we rebuild after install:
npm run rebuild
npm run dev
```

The dev server launches Vite, which boots Electron pointing at the dev URL.

## Build a Windows installer

```powershell
npm run package:win
```

Outputs an NSIS installer under `release/`.

## Where your data lives

`%APPDATA%/meowDrive/meowdrive.sqlite` (Windows). Back this file up if
losing it would matter.

## Web / PWA build with Supabase sync

The same renderer also builds as a static PWA you can host anywhere and
open from any device. Data lives in IndexedDB locally and syncs through a
Supabase project that you own.

### One-time Supabase setup

1. Create a free project at https://supabase.com.
2. In the SQL editor, paste and run `supabase/schema.sql`.
3. Enable email auth (it's on by default).
4. Copy the project URL and anon key into `.env.local`:

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   ```

The anon key is safe to ship in the client bundle — row-level security
ensures each user can only read/write their own rows.

### Running the web build locally

```bash
npm run dev:web      # vite dev server, web mode
# or to test the production bundle:
npm run build:web
npx vite preview
```

### Deploying

The repo ships a GitHub Actions workflow at
`.github/workflows/deploy-pages.yml` that publishes the web bundle to
GitHub Pages on every push to `main`. To use it:

1. In GitHub → repo Settings → Pages → Source: **GitHub Actions**.
2. In Settings → Secrets and variables → Actions, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Push to `main`. The site appears at
   `https://<user>.github.io/meowDrive/`.

For Cloudflare Pages or Vercel, point at the repo, set the build command
to `npm run build:web`, output dir `dist`, and add the same two env vars.
If you serve from the root of a custom domain, also set `MEOW_BASE=/`.

### What you lose on web vs Electron

- The **Ctrl+Alt+T** global hotkey is OS-wide on Electron only. The web
  build has an in-page shortcut (still works while the tab is focused).
- Local file storage becomes IndexedDB (browser-managed). Clear-site-data
  wipes it; the cloud copy still has everything.

## Roadmap

- v0.2: Microsoft Graph calendar import, learned tag mappings.
- v0.3: Conflict UI for cross-device edits beyond last-write-wins.
- v0.4: Vision-shaped paste tester, configurable column order.