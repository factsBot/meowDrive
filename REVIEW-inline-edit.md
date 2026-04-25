# Senior-Eng Review — Inline Edit/Delete (commit 61c03b4)

Self-review of the work I shipped on `claude/meowdrive-backlog-planning-XGyI1`,
before recommending a test plan to the user.

## Issues found

### 1. I never ran the feature. (critical process miss)
Build + typecheck were clean, but build success ≠ runtime success. CLAUDE.md's
own guidance says: "For UI or frontend changes, start the dev server and use
the feature in a browser before reporting the task as complete." I didn't.
The user's "verify on live site after Pages deploys" line in my hand-off was a
direct consequence — I was outsourcing verification I should have done first.
**Revision:** local dev-server walkthrough is step 1 of the test plan, not
step N.

### 2. Modal initializes drafts from props exactly once.
`useState(() => entries.map(entryToDraft))` runs on mount only. If the parent
reloads `entries` while the modal is open (a sync pull at the 30s tick fires
during a long edit session), the modal silently shows stale data. Low risk in
practice because the modal closes after save and sessions are short, but it's
a footgun. **Revision:** add to the test matrix — open modal, force-sync,
confirm staleness behavior is acceptable. If it isn't, sync drafts to props
via effect with a "remote changed, refresh?" prompt.

### 3. Save loop has no per-entry error isolation.
`save()` awaits `update` calls in a `for` loop. If entry 3 throws, entries 1
and 2 are already persisted; entry 3 + 4 + 5 are not, and we surface a single
error. Audit log preserves the full history so this isn't data loss, but the
modal stays open with a confused state. **Revision:** wrap each call in
try/catch, collect failures, only close on full success — or surface a
per-row error indicator.

### 4. Sync push for batched edits is timing-dependent.
Every `update`/`delete` calls `notify()` → `sync.runOnce()`, which has a
`if (this.running) return` guard. So edits 2..N during the loop fire-and-drop.
The first `runOnce` queries dirty rows at the moment its push() runs — if
some edits land in IndexedDB after that query, those rows wait 30s for the
next tick. No data loss, just latency. **Revision:** debounce the
`onLocalMutation` callback or have the modal call `sync.runOnce()` once at
the end of `save()` instead of N times implicitly.

### 5. Confirm dialog uses `window.confirm`.
Blocks the renderer thread, looks like a 1998 alert in a PWA, and on iOS
Safari it can throw the user out of the app momentarily. **Revision:** inline
confirm step inside the modal (button changes to "Click again to confirm
delete" or a small inline are-you-sure row).

### 6. Accessibility gaps.
Esc closes, backdrop click closes, close button has `aria-label`. But
missing: `role="dialog"`, `aria-modal="true"`, focus trap, focus on first
input when opened, focus restore to the cell when closed. Screen-reader users
won't have a good time. **Revision:** add the ARIA attributes and a tiny
focus-trap (or use the native `<dialog>` element).

### 7. No automated tests added.
The validation logic (`isDirty`, `reasonRequired`, hours bounds) and storage
guardrails (Dexie `update` rejecting copied + no-reason) are pure functions
trivial to unit-test. A 15-minute investment would make regressions visible
in CI rather than in production. **Revision:** add a vitest for
`EntryEditModal` validation and one for `dexieStorage.entries.update`'s
guardrail before the next storage refactor.

### 8. Error message for hours range is imprecise.
Code rejects `h <= 0 || h > 24`, message says "between 0 and 24". 0 is
rejected, 24 is allowed — message should read "greater than 0 and at most
24" or, simpler, "must be a positive number up to 24". **Revision:** trivial
copy fix.

### 9. No assertion that audit rows actually sync.
The audit row is written with `dirty=1` and `sync.ts:248-262` picks it up. I
relied on inspection rather than verification. **Revision:** test plan
includes a Supabase dashboard check that an `audit_events` row appears with
the reason text after editing a copied entry.

## What I revised based on the above

The test plan I'm sending the user now is structured around:
1. **Local-first verification** before live-site testing.
2. **A concrete matrix of scenarios** (boundaries, copied/not-copied,
   single/multi-entry cells), not "click around and see."
3. **DevTools-driven sync verification** (Network tab for Supabase POST,
   IndexedDB inspector for `dirty` flags, second browser profile for
   round-trip), not "trust that it syncs."
4. **A note flagging the issues above** so the user knows what's
   technically-shipped-but-rough vs. what's solid.

## What I would do differently next time

- Run the dev server before saying "done." Always. Even for a 30-second
  smoke test.
- Add the smallest possible vitest alongside any new component with
  branching validation logic. The bar shouldn't be "comprehensive coverage,"
  it should be "the obvious cases are pinned down."
- For modal/dialog work, start from the native `<dialog>` element or a known
  accessible primitive, not a hand-rolled div.
