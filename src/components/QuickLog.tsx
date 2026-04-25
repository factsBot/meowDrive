import { useEffect, useRef, useState } from 'react';
import { useFavorites } from '../hooks/useMeow';
import { todayIso } from '../lib/weekUtils';

export function QuickLog() {
  const { favorites, reload } = useFavorites(5);
  const [activeIdx, setActiveIdx] = useState(0);
  const [hoursStr, setHoursStr] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hoursInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    hoursInput.current?.focus();
  }, []);

  function close() {
    setHoursStr('');
    setNote('');
    void window.meow.quickLog.hide();
  }

  async function logFor(idx: number) {
    setError(null);
    if (idx < 0 || idx >= favorites.length) return;
    const combo = favorites[idx];
    const parsed = parseHours(hoursStr);
    if (parsed == null) {
      setError('Enter hours, e.g. 1.5 or 90m or 1h30');
      return;
    }
    setSaving(true);
    try {
      await window.meow.entries.create({
        comboId: combo.id,
        workDate: todayIso(),
        hours: parsed.hours,
        note: parsed.note ?? note.trim() ?? null,
        source: 'hotkey',
      });
      await reload();
      setFlash(`Logged ${fmt(parsed.hours)}h on ${combo.displayName}`);
      setHoursStr('');
      setNote('');
      setTimeout(() => {
        setFlash(null);
        close();
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key >= '1' && e.key <= '9' && (e.metaKey || e.ctrlKey || e.altKey)) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < favorites.length) {
        e.preventDefault();
        setActiveIdx(idx);
        void logFor(idx);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(favorites.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void logFor(activeIdx);
    }
  }

  return (
    <div className="quicklog" onKeyDown={onKeyDown} tabIndex={-1}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2>Quick log — {todayIso()}</h2>
        <button onClick={close}>Esc</button>
      </div>

      {favorites.length === 0 ? (
        <div className="empty">
          No favorites yet. Open meowDrive and log time against a project, then
          come back here.
        </div>
      ) : (
        <div className="favs" role="listbox">
          {favorites.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={`fav ${i === activeIdx ? 'active' : ''}`}
              onClick={() => {
                setActiveIdx(i);
                void logFor(i);
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="num">{i + 1}</span>
              <span style={{ flex: 1 }}>
                <div className="name">{c.displayName}</div>
                <div className="codes">
                  {c.visionProject}
                  {c.visionPhase ? ` / ${c.visionPhase}` : ''} /{' '}
                  {c.visionLaborCode}
                </div>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="row">
        <input
          ref={hoursInput}
          value={hoursStr}
          onChange={(e) => setHoursStr(e.target.value)}
          placeholder="Hours (e.g. 1.5, 90m, 1h30)"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
        />
        <button
          className="primary"
          onClick={() => logFor(activeIdx)}
          disabled={saving || favorites.length === 0}
        >
          {saving ? '…' : 'Log'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {flash && <div className="copy-flash">{flash}</div>}
      <div className="hint">
        Tip: number keys + Ctrl pick a favorite. ↑/↓ + Enter also works. Esc
        closes.
      </div>
    </div>
  );
}

function parseHours(
  input: string,
): { hours: number; note: string | null } | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const plain = Number(s);
  if (Number.isFinite(plain) && plain > 0 && plain <= 24) {
    return { hours: plain, note: null };
  }
  const minutesMatch = /^(\d+(?:\.\d+)?)m$/.exec(s);
  if (minutesMatch) {
    const m = Number(minutesMatch[1]);
    if (m > 0 && m <= 24 * 60) return { hours: m / 60, note: null };
  }
  const hMin = /^(\d+)h(\d+)?$/.exec(s);
  if (hMin) {
    const h = Number(hMin[1]);
    const m = hMin[2] ? Number(hMin[2]) : 0;
    if (h >= 0 && h <= 24 && m >= 0 && m < 60) {
      return { hours: h + m / 60, note: null };
    }
  }
  return null;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
