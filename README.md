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

## Roadmap

- v0.2: Microsoft Graph calendar import, learned tag mappings.
- v0.3: PWA companion for phone capture, OneDrive/Supabase sync.
- v0.4: Vision-shaped paste tester, configurable column order.