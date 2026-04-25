import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ProjectCombo, TimeEntry } from '../../shared/types';
import { formatDayHeader } from '../lib/weekUtils';

interface Props {
  combo: ProjectCombo;
  workDate: string;
  entries: TimeEntry[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

interface Draft {
  id: string;
  hours: string;
  note: string;
  copiedToVisionAt: string | null;
  original: TimeEntry;
  saveError: string | null;
}

function entryToDraft(e: TimeEntry): Draft {
  return {
    id: e.id,
    hours: String(e.hours),
    note: e.note ?? '',
    copiedToVisionAt: e.copiedToVisionAt,
    original: e,
    saveError: null,
  };
}

function isDirty(d: Draft): boolean {
  const h = Number(d.hours);
  if (!Number.isFinite(h) || h !== d.original.hours) return true;
  if ((d.note || '') !== (d.original.note ?? '')) return true;
  return false;
}

export function EntryEditModal({
  combo,
  workDate,
  entries,
  onClose,
  onChanged,
}: Props) {
  const [drafts, setDrafts] = useState<Draft[]>(() => entries.map(entryToDraft));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const titleId = useId();
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const entriesKey = entries.map((e) => `${e.id}:${e.hours}:${e.note ?? ''}:${e.copiedToVisionAt ?? ''}`).join('|');
  useEffect(() => {
    setDrafts((prev) => {
      const prevById = new Map(prev.map((d) => [d.id, d]));
      return entries.map((e) => {
        const existing = prevById.get(e.id);
        if (!existing) return entryToDraft(e);
        const dirty = isDirty(existing);
        if (!dirty && (existing.original.hours !== e.hours || (existing.original.note ?? '') !== (e.note ?? '') || existing.copiedToVisionAt !== e.copiedToVisionAt)) {
          return entryToDraft(e);
        }
        return { ...existing, original: e, copiedToVisionAt: e.copiedToVisionAt };
      });
    });
  }, [entriesKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

  const anyCopied = useMemo(
    () => drafts.some((d) => d.copiedToVisionAt !== null),
    [drafts],
  );
  const dirtyDrafts = useMemo(() => drafts.filter(isDirty), [drafts]);
  const hasChanges = dirtyDrafts.length > 0;
  const reasonRequired = anyCopied && hasChanges;
  const pendingDelete = useMemo(
    () => drafts.find((d) => d.id === pendingDeleteId) ?? null,
    [drafts, pendingDeleteId],
  );
  const pendingDeleteNeedsReason = pendingDelete !== null && pendingDelete.copiedToVisionAt !== null;

  function patch(id: string, patchFn: (d: Draft) => Draft) {
    setDrafts((cur) => cur.map((d) => (d.id === id ? patchFn(d) : d)));
  }

  async function save() {
    setError(null);
    setPendingDeleteId(null);
    if (!hasChanges) {
      onClose();
      return;
    }
    for (const d of dirtyDrafts) {
      const h = Number(d.hours);
      if (!Number.isFinite(h) || h <= 0 || h > 24) {
        setError(`Hours must be a positive number up to 24 (got "${d.hours}").`);
        return;
      }
    }
    if (reasonRequired && !reason.trim()) {
      setError('Reason is required when editing entries already copied to Vision.');
      return;
    }
    setBusy(true);
    setDrafts((cur) => cur.map((d) => ({ ...d, saveError: null })));
    const failures: string[] = [];
    try {
      for (const d of dirtyDrafts) {
        try {
          await window.meow.entries.update({
            id: d.id,
            hours: Number(d.hours),
            note: d.note.trim() ? d.note.trim() : null,
            reason: d.copiedToVisionAt !== null ? reason.trim() : undefined,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push(msg);
          setDrafts((cur) =>
            cur.map((x) => (x.id === d.id ? { ...x, saveError: msg } : x)),
          );
        }
      }
      await onChanged();
      const sync = window.__meowSync;
      if (sync) void sync.runOnce();
      if (failures.length === 0) {
        onClose();
      } else {
        setError(
          failures.length === 1
            ? `Save failed: ${failures[0]}`
            : `${failures.length} entries failed to save. See per-row errors below.`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(d: Draft) {
    setError(null);
    if (d.copiedToVisionAt !== null && !reason.trim()) {
      setError('Reason is required to delete an entry already copied to Vision.');
      return;
    }
    setBusy(true);
    try {
      await window.meow.entries.delete(
        d.id,
        d.copiedToVisionAt !== null ? reason.trim() : undefined,
      );
      const remaining = drafts.filter((x) => x.id !== d.id);
      setDrafts(remaining);
      setPendingDeleteId(null);
      await onChanged();
      const sync = window.__meowSync;
      if (sync) void sync.runOnce();
      if (remaining.length === 0) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={() => !busy && onClose()}
      role="presentation"
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-head">
          <div>
            <div id={titleId} className="modal-title">{combo.displayName}</div>
            <div className="modal-sub">
              {formatDayHeader(workDate)} ·{' '}
              {combo.visionProject}
              {combo.visionPhase ? ` / ${combo.visionPhase}` : ''} /{' '}
              {combo.visionLaborCode}
            </div>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modal-body">
          {drafts.length === 0 && (
            <div className="empty">No entries left for this cell.</div>
          )}
          {drafts.map((d, idx) => (
            <div key={d.id} className="entry-row">
              <label>
                <span>Hours</span>
                <input
                  ref={idx === 0 ? firstInputRef : undefined}
                  type="number"
                  min="0"
                  max="24"
                  step="0.25"
                  value={d.hours}
                  onChange={(e) =>
                    patch(d.id, (cur) => ({ ...cur, hours: e.target.value, saveError: null }))
                  }
                  disabled={busy}
                />
              </label>
              <label className="grow">
                <span>
                  Note
                  {d.copiedToVisionAt !== null && (
                    <span className="pill copied" style={{ marginLeft: 8 }}>
                      copied to Vision
                    </span>
                  )}
                </span>
                <input
                  type="text"
                  value={d.note}
                  onChange={(e) =>
                    patch(d.id, (cur) => ({ ...cur, note: e.target.value, saveError: null }))
                  }
                  disabled={busy}
                  placeholder="(no note)"
                />
                {d.saveError && (
                  <span className="error" style={{ marginTop: 4 }}>{d.saveError}</span>
                )}
              </label>
              {pendingDeleteId === d.id ? (
                <div className="confirm-delete">
                  <span className="confirm-text">Delete?</span>
                  <button
                    className="danger"
                    onClick={() => void confirmDelete(d)}
                    disabled={busy || (pendingDeleteNeedsReason && !reason.trim())}
                    title={
                      pendingDeleteNeedsReason && !reason.trim()
                        ? 'Reason required'
                        : 'Confirm delete'
                    }
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => setPendingDeleteId(null)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="danger"
                  onClick={() => {
                    setError(null);
                    setPendingDeleteId(d.id);
                  }}
                  disabled={busy}
                  title="Delete this entry"
                >
                  Delete
                </button>
              )}
            </div>
          ))}

          {anyCopied && (
            <label className="reason-field">
              <span>
                Reason for change{' '}
                {(reasonRequired || pendingDeleteNeedsReason) ? <em className="req">(required)</em> : null}
              </span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you changing an entry already copied to Vision?"
                disabled={busy}
              />
            </label>
          )}

          {error && <div className="error">{error}</div>}
        </div>

        <footer className="modal-foot">
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="primary"
            onClick={() => void save()}
            disabled={busy || drafts.length === 0 || !hasChanges}
          >
            {busy ? 'Saving…' : hasChanges ? 'Save changes' : 'No changes'}
          </button>
        </footer>
      </div>
    </div>
  );
}
