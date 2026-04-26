import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectCombo, TimeEntry } from '../../shared/types';
import { useFavorites } from '../hooks/useMeow';

const DURATIONS: { label: string; hours: number }[] = [
  { label: '+15m', hours: 0.25 },
  { label: '+30m', hours: 0.5 },
  { label: '+1h', hours: 1 },
  { label: '+2h', hours: 2 },
  { label: '+4h', hours: 4 },
];

interface Props {
  defaultExpanded: boolean;
  onLogged: () => Promise<void>;
}

interface RecentEntry {
  entry: TimeEntry;
  combo: ProjectCombo;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function QuickLogPanel({ defaultExpanded, onLogged }: Props) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded);
  const { favorites, reload: reloadFavorites } = useFavorites(5);
  const [selectedComboId, setSelectedComboId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFavoriteRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (selectedComboId == null && favorites.length > 0) {
      setSelectedComboId(favorites[0].id);
    }
  }, [favorites, selectedComboId]);

  useEffect(() => {
    if (!collapsed && defaultExpanded) {
      firstFavoriteRef.current?.focus();
    }
  }, [collapsed, defaultExpanded]);

  const selectedCombo = useMemo(
    () => favorites.find((c) => c.id === selectedComboId) ?? null,
    [favorites, selectedComboId],
  );

  async function logDuration(hours: number) {
    if (!selectedCombo) return;
    setError(null);
    setBusy(true);
    try {
      const entry = await window.meow.entries.create({
        comboId: selectedCombo.id,
        workDate: selectedDate,
        hours,
        note: null,
        source: 'manual',
      });
      setRecent((cur) => [{ entry, combo: selectedCombo }, ...cur].slice(0, 10));
      await Promise.all([onLogged(), reloadFavorites()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function updateRecent(id: string, patch: Partial<TimeEntry>) {
    setRecent((cur) =>
      cur.map((r) =>
        r.entry.id === id ? { ...r, entry: { ...r.entry, ...patch } } : r,
      ),
    );
  }

  async function commitRecent(entry: TimeEntry, hours: number, note: string | null) {
    setError(null);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      setError(`Hours must be a positive number up to 24 (got "${hours}").`);
      return;
    }
    if (entry.copiedToVisionAt !== null) {
      setError('This entry has been copied to Vision — edit it from the cell modal so a reason can be recorded.');
      return;
    }
    setBusy(true);
    try {
      const updated = await window.meow.entries.update({
        id: entry.id,
        hours,
        note,
      });
      await updateRecent(entry.id, updated);
      await onLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecent(entry: TimeEntry) {
    setError(null);
    if (entry.copiedToVisionAt !== null) {
      setError('This entry has been copied to Vision — delete it from the cell modal so a reason can be recorded.');
      return;
    }
    setBusy(true);
    try {
      await window.meow.entries.delete(entry.id);
      setRecent((cur) => cur.filter((r) => r.entry.id !== entry.id));
      await onLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (collapsed) {
    return (
      <aside className="quicklog-panel collapsed">
        <button
          className="quicklog-toggle"
          onClick={() => setCollapsed(false)}
          aria-label="Expand quick log panel"
          aria-expanded="false"
        >
          <span className="quicklog-toggle-label">Quick log</span>
          <span aria-hidden="true">‹</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="quicklog-panel expanded" aria-label="Quick log">
      <header className="quicklog-head">
        <div className="quicklog-title">Quick log</div>
        <button
          className="quicklog-toggle-collapse"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse quick log panel"
          aria-expanded="true"
        >
          ›
        </button>
      </header>

      <div className="quicklog-body">
        <label className="quicklog-field">
          <span>Date</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={busy}
          />
        </label>

        <div className="quicklog-section-label">Project</div>
        {favorites.length === 0 ? (
          <div className="empty" style={{ padding: '12px 0' }}>
            Add a combo first using the form below the week grid.
          </div>
        ) : (
          <div className="quicklog-favs">
            {favorites.map((c, idx) => (
              <button
                key={c.id}
                ref={idx === 0 ? firstFavoriteRef : undefined}
                className={`quicklog-fav${selectedComboId === c.id ? ' active' : ''}`}
                onClick={() => setSelectedComboId(c.id)}
                disabled={busy}
                title={`${c.visionProject}${c.visionPhase ? ' / ' + c.visionPhase : ''} / ${c.visionLaborCode}`}
              >
                <div className="quicklog-fav-name">{c.displayName}</div>
                <div className="quicklog-fav-codes">
                  {c.visionProject}
                  {c.visionPhase ? ` / ${c.visionPhase}` : ''} /{' '}
                  {c.visionLaborCode}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="quicklog-section-label">Tap to log</div>
        <div className="quicklog-durations">
          {DURATIONS.map((d) => (
            <button
              key={d.label}
              className="quicklog-duration"
              onClick={() => void logDuration(d.hours)}
              disabled={busy || !selectedCombo}
              aria-label={`Log ${d.label} on ${selectedCombo?.displayName ?? 'selected project'}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {error && <div className="error">{error}</div>}

        {recent.length > 0 && (
          <>
            <div className="quicklog-section-label">Logged this session</div>
            <div className="quicklog-recents">
              {recent.map((r) => (
                <RecentRow
                  key={r.entry.id}
                  entry={r.entry}
                  combo={r.combo}
                  busy={busy}
                  onSave={(h, n) => void commitRecent(r.entry, h, n)}
                  onDelete={() => void deleteRecent(r.entry)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

interface RecentRowProps {
  entry: TimeEntry;
  combo: ProjectCombo;
  busy: boolean;
  onSave: (hours: number, note: string | null) => void;
  onDelete: () => void;
}

function RecentRow({ entry, combo, busy, onSave, onDelete }: RecentRowProps) {
  const [hours, setHours] = useState(String(entry.hours));
  const [note, setNote] = useState(entry.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setHours(String(entry.hours));
    setNote(entry.note ?? '');
  }, [entry.hours, entry.note]);

  const dirty =
    Number(hours) !== entry.hours || (note ?? '') !== (entry.note ?? '');

  function commit() {
    if (!dirty) return;
    onSave(Number(hours), note.trim() ? note.trim() : null);
  }

  return (
    <div className="quicklog-recent-row">
      <div className="quicklog-recent-meta">
        <span className="quicklog-recent-combo">{combo.displayName}</span>
        <span className="quicklog-recent-date">
          {entry.workDate.slice(5)}
        </span>
      </div>
      <div className="quicklog-recent-fields">
        <input
          className="quicklog-recent-hours"
          type="number"
          min="0"
          max="24"
          step="0.25"
          value={hours}
          disabled={busy}
          onChange={(e) => setHours(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <input
          className="quicklog-recent-note"
          type="text"
          value={note}
          placeholder="Add a note"
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {confirmDelete ? (
          <>
            <button
              className="danger"
              onClick={() => {
                setConfirmDelete(false);
                onDelete();
              }}
              disabled={busy}
              title="Confirm delete"
            >
              ✓
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              title="Cancel delete"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            className="danger"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            title="Delete this entry"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
