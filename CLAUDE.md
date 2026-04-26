# meowDrive — context for future Claude sessions

## What this project is

Local-first personal time-capture companion for **Deltek Vision 7.6**
timesheets at JBB. The app never integrates with Vision — it captures
entries locally, then on Friday produces tab-separated hour rows the
user pastes into Vision's weekly grid. No IT involvement, no API access,
no UI automation against Vision.

## Live URL

`https://factsbot.github.io/meowDrive/` — deployed via GitHub Pages from
`main` on every push. Service worker installed; pin the page in Chrome
to "Install app" and it lives in the taskbar.

## Stack

- **Renderer**: React 18 + TypeScript (strict) + Vite 5.
- **Local storage (web)**: Dexie 4 (IndexedDB). Source of truth on each
  device.
- **Cloud sync (web)**: Supabase JS v2 — Postgres + magic-link auth +
  RLS. User-owned project. Push on every local mutation; pull every 30s
  with `updated_at` watermarks. Last-write-wins per record.
- **Local storage (Electron)**: `better-sqlite3` in the main process.
- **Build/bundling**: `vite-plugin-electron/simple` for desktop;
  `vite-plugin-pwa` for web. `MEOW_TARGET=web` env var switches.

## Repository layout

```
shared/
  types.ts        Domain types (ProjectCombo, TimeEntry, WeekGrid, ...)
  ipc.ts          MeowApi interface — the contract both backends implement.
electron/
  main.ts         BrowserWindow, IPC handlers, Ctrl+Alt+T global hotkey.
  preload.ts      contextBridge — populates window.meow from IPC.
  db.ts           better-sqlite3 schema + queries + audit log.
src/
  main.tsx        Bootstraps Electron OR web (AuthGate -> initWindowMeowFromWeb).
  App.tsx         Toolbar, week nav, sync indicator, calendar sync, sign-out.
  components/
    WeekGrid.tsx          Mon-Sun grid, Copy Row to Vision (tab-separated).
    ManualEntryForm.tsx
    AddComboForm.tsx
    QuickLog.tsx          Hotkey popup (Electron only).
    AuthGate.tsx          Magic-link sign-in, falls back to local-only.
    CalendarInbox.tsx     Lists fetched events for the current week, accept/dismiss.
    CalendarSettings.tsx  Paste/save/disconnect the published ICS URL.
  hooks/useMeow.ts      useCombos, useFavorites, useWeek.
  lib/
    weekUtils.ts        Monday-anchored week math.
    visionClipboard.ts  formatRowForVision, formatGridForReview.
    calendar/
      calendarService.ts  Edge Function invocation + supabase reads.
      types.ts            CalendarEvent, CalendarSource, SyncCalendarResult.
    storage/
      dexieDb.ts        IndexedDB schema (dirty + deletedAt for sync).
      dexieStorage.ts   MeowApi impl over Dexie.
      supabaseClient.ts Lazy client, supabaseEnabled() guard.
      sync.ts           SyncEngine (push, pull, online/offline, subscribe).
      webStorage.ts     Wires Dexie + sync into one MeowApi handle.
      index.ts          initWindowMeowFromWeb, isElectronPreloadActive.
supabase/
  schema.sql              Tables + RLS policies. Already applied to the project.
  functions/
    sync-calendar/        Edge Function: fetches user's published ICS,
                          parses with ical.js, upserts into calendar_events.
.github/workflows/
  deploy-pages.yml      Builds web bundle, deploys to GH Pages on push to main.
```

## How to run

```bash
# Web (PWA + Supabase)
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_* values
npm run dev:web              # vite dev server
npm run build:web            # static bundle in dist/

# Electron (Windows desktop)
npm install
npm run rebuild              # rebuilds better-sqlite3 against Electron ABI
npm run dev                  # boots Electron + Vite
npm run package:win          # NSIS installer in release/
```

## Environment + Supabase wiring

Required env vars for sync:
- `VITE_SUPABASE_URL` — project URL.
- `VITE_SUPABASE_ANON_KEY` — anon JWT, safe to ship (RLS protects rows).

In CI: stored as repo Actions secrets, read by `deploy-pages.yml`.

In Supabase dashboard, Authentication → URL Configuration must have:
- **Site URL** = `https://factsbot.github.io/meowDrive/`
- **Redirect URLs** allowlist includes `https://factsbot.github.io/meowDrive/**`

Without those, magic links redirect to localhost:3000.

## What works (v0.1)

- Magic-link sign-in, multi-device sync confirmed working.
- Add project combos (project / scope / phase / labor).
- Manual time entry (date, hours, note, source=manual).
- Week grid: Mon-Sun, daily/weekly totals, **Copy Row** to Vision-paste
  format, **Copy All** for review.
- Audit log on every mutation; reason-for-change required when editing
  entries already marked copied to Vision.
- Sync indicator + force-sync button in toolbar.
- PWA install on desktop and mobile.
- Electron build still works in parallel; global Ctrl+Alt+T hotkey on
  desktop opens a frameless quick-log popup with top-5 favorites.

## Conventions

- TypeScript strict, no unused locals/params.
- `MeowApi` is the boundary. Anything that talks to storage goes
  through `window.meow.*`.
- Default to no comments. Identifier names + the type system carry the
  intent. Add a comment only when the WHY is non-obvious.
- No backwards-compat shims. If something is unused, delete it.
- The renderer never imports from `electron/` and never imports
  `better-sqlite3`. Cross-target code goes in `shared/` or `src/lib/`.
- Soft deletes on the web side (`deletedAt`) so sync can propagate
  removals; the Electron side hard-deletes.

## Known rough edges (intentional draft scope)

- PWA icon is a single SVG. iOS Add-to-Home-Screen prefers PNG; swap in
  192/512 PNGs for nicer install UX.
- Conflict resolution is last-writer-wins on `updated_at`. Fine for one
  user across devices; needs a real merge UI before going multi-user.
- Sync push is fire-and-forget after each mutation. On failure, rows
  stay `dirty=1` and re-push next interval — no data loss, but no
  inline error toast either.
- The "synced" pill on already-copied rows in the week grid is stubbed
  out; needs `WeekGridRow` to expose a copied-count so it can render.
- `WeekGrid.tsx` has an unused-looking IIFE around the row map (legacy
  from a removed `allCopied` calc) — safe to clean up next pass.
- `quicklog.html` is Electron-only. Web has no global hotkey
  equivalent.

## Backlog (priority order)

1. **Microsoft Graph calendar import** — read yesterday's events each
   morning, suggest categorization, learn from past tags. Highest user
   value: solves "reconstructing what I did from memory."
2. **Inline edit/delete on the week grid** — click an hours cell, edit
   in place, prompt for reason if already copied to Vision.
3. **Voice notes on phone** — the PWA already runs on phone; Web Speech
   API can capture quick voice memos against the active project.
4. **Per-row "synced to Vision" pill** — surface copy state visibly.
5. **Real conflict UI** — when Dexie sees a remote `updated_at` newer
   than its local dirty record, show a diff and let the user pick.
6. **Browser-extension companion** — sidebar in Outlook web for one-
   click logging from a calendar event.
7. **Export week as CSV / paste-to-Vision dry-run tester** — local
   tool to validate the tab/newline format against Vision's actual
   paste behavior.
8. **PNG icons** — generate 192/512/maskable PNGs from `favicon.svg`.

## How to resume

Future Claude session: read this file first, then `README.md`, then
`shared/ipc.ts` to understand the storage contract. To pick up the
calendar work, start with `src/lib/calendar/` (does not exist yet) and
add `EntrySource = 'calendar'` is already supported by the schema.
Microsoft Graph delegated permissions needed: `Calendars.Read`. Follow
the existing pattern: an adapter behind an interface, lazy-loaded.

To add a feature touching storage: extend `MeowApi` in
`shared/ipc.ts`, implement on both `electron/db.ts` and
`src/lib/storage/dexieStorage.ts`, then wire into the renderer. Keep
the two impls behaviorally identical.
