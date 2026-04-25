import { useCallback, useMemo, useState } from 'react';
import { ManualEntryForm } from './components/ManualEntryForm';
import { AddComboForm } from './components/AddComboForm';
import { WeekGridView } from './components/WeekGrid';
import { useCombos, useWeek } from './hooks/useMeow';
import { currentWeekStart, shiftWeek, formatDayHeader } from './lib/weekUtils';

export default function App() {
  const [weekStart, setWeekStart] = useState<string>(currentWeekStart());
  const { combos, reload: reloadCombos } = useCombos();
  const { week, reload: reloadWeek, loading } = useWeek(weekStart);
  const [showAddCombo, setShowAddCombo] = useState(false);

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
        <span className="pill">Hotkey: Ctrl+Alt+T</span>
      </div>

      <main className="app-body">
        {week && <WeekGridView week={week} onMarkRowCopied={onMarkRowCopied} />}

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
      </main>
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
