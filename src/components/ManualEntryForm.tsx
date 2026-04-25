import { useState } from 'react';
import type { ProjectCombo } from '../../shared/types';
import { todayIso } from '../lib/weekUtils';

interface Props {
  combos: ProjectCombo[];
  defaultDate?: string;
  onCreated: () => void;
  onAddCombo: () => void;
}

export function ManualEntryForm({
  combos,
  defaultDate,
  onCreated,
  onAddCombo,
}: Props) {
  const [comboId, setComboId] = useState<string>(combos[0]?.id ?? '');
  const [date, setDate] = useState<string>(defaultDate ?? todayIso());
  const [hours, setHours] = useState<string>('1');
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (combos.length > 0 && !combos.find((c) => c.id === comboId)) {
    setComboId(combos[0].id);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const h = Number(hours);
    if (!comboId) {
      setError('Pick or add a project combo first.');
      return;
    }
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      setError('Hours must be between 0 and 24.');
      return;
    }
    setBusy(true);
    try {
      await window.meow.entries.create({
        comboId,
        workDate: date,
        hours: h,
        note: note.trim() || null,
        source: 'manual',
      });
      setHours('1');
      setNote('');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="entry-form" onSubmit={submit}>
      <label>
        <span>Project combo</span>
        <select
          value={comboId}
          onChange={(e) => setComboId(e.target.value)}
          disabled={combos.length === 0}
        >
          {combos.length === 0 && <option value="">No combos yet</option>}
          {combos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName} — {c.visionProject}
              {c.visionPhase ? ` / ${c.visionPhase}` : ''} /{' '}
              {c.visionLaborCode}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label>
        <span>Hours</span>
        <input
          type="number"
          min="0"
          max="24"
          step="0.25"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </label>
      <label>
        <span>Note (optional)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you work on?"
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Log time'}
        </button>
        <button type="button" onClick={onAddCombo}>
          + Combo
        </button>
      </div>
      {error && (
        <div className="error" style={{ gridColumn: '1 / -1' }}>
          {error}
        </div>
      )}
    </form>
  );
}
