import { useCallback, useEffect, useMemo, useState } from 'react';
import { ManualEntryForm } from './components/ManualEntryForm';
import { AddComboForm } from './components/AddComboForm';
import { WeekGridView } from './components/WeekGrid';
import { QuickLogPanel } from './components/QuickLogPanel';
import { useCombos, useWeek } from './hooks/useMeow';
import { currentWeekStart, shiftWeek, formatDayHeader } from './lib/weekUtils';
import type { SyncState } from './lib/storage/sync';

interface AppProps {
  onSignOut?: () => Promise<void>;
}

function readQuickLogIntent(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('panel') === 'quicklog';
}

export default function App({ onSignOut }: AppProps = {}) {
  const [weekStart, setWeekStart] = useState<string>(currentWeekStart());
  const { combos, reload: reloadCombos } = useCombos();
  const { week, reload: reloadWeek, loading } = useWeek(weekStart);
  const [showAddCombo, setShowAddCombo] = useState(false);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const quickLogIntent = useMemo(readQuickLogIntent, []);

  useEffect(() => {
    const sync = window.__meowSync;
    if (!sync) return;
    return sync.subscribe(setSyncState);
  }, []);

  useEffect(() => {
    if (!quickLogIntent) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('panel');
    window.history.replaceState({}, '', url.toString());
  }, [quickLogIntent]);

  const weekLabel = useMemo(() => {
    if (!week) return '';
    return `${formatDayHeader(week.weekStart)}  →  ${formatDayHeader(week.weekEnd)}`;
  }, [week]);

  const onCreated = useCallback(async () => {
    await Promise.all([reloadWeek(), reloadCombos()]);
  }, [reloadWeek, reloadCombos]);

  const onMarkRowCopied = useCallback(
    async (entryIds: string[]) => {
      await window.meow.entries.markCopied(entryIds);
      await reloadWeek();
    },
    [reloadWeek],
  );

  const onForceSync = useCallback(async () => {
    const sync = window.__meowSync;
    if (!sync) return;
    await sync.runOnce();
    await Promise.all([reloadWeek(), reloadCombos()]);
  }, [reloadWeek, reloadCombos]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>meowDrive</h1>
        <div className="totals">
          Week total:{' '}
          <b>{week ? fmt(week.weekTotal) : '…'}</b> hrs
          {loading && <span style={{ marginLeft: 12 }}>refreshing…</span>}
        </div>
      </header>

      <div className="toolbar">
        <button onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>
          ← Prev week
        </button>
        <button onClick={() => setWeekStart(currentWeekStart())}>
          This week
        </button>
        <button onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>
          Next week →
        </button>
        <div style={{ marginLeft: 12, color: 'var(--muted)' }}>{weekLabel}</div>
        <div className="spacer" />
        {syncState && (
          <button onClick={onForceSync} title={syncState.error ?? ''}>
            {syncState.running
              ? 'syncing…'
              : syncState.error
                ? '⚠ sync failed'
                : syncState.lastSyncAt
                  ? `synced ${relTime(syncState.lastSyncAt)}`
                  : 'sync'}
          </button>
        )}
        {onSignOut && (
          <button onClick={() => void onSignOut()}>Sign out</button>
        )}
      </div>

      <main className="app-body">
        <div className="app-body-main">
          {week && (
            <WeekGridView
              week={week}
              onMarkRowCopied={onMarkRowCopied}
              onEntriesChanged={reloadWeek}
            />
          )}

          {showAddCombo ? (
            <AddComboForm
              onCreated={async () => {
                setShowAddCombo(false);
                await reloadCombos();
              }}
              onCancel={() => setShowAddCombo(false)}
            />
          ) : (
            <ManualEntryForm
              combos={combos}
              onCreated={onCreated}
              onAddCombo={() => setShowAddCombo(true)}
            />
          )}
        </div>

        <QuickLogPanel defaultExpanded={quickLogIntent} onLogged={onCreated} />
      </main>
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 30_000) return 'just now';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}
