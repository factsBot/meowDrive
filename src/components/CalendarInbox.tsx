import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectCombo } from '../../shared/types';
import {
  dismissEvent,
  eventDurationHours,
  eventWorkDate,
  listEventsForWeek,
  markEventImported,
} from '../lib/calendar/calendarService';
import type { CalendarEvent } from '../lib/calendar/types';

interface Props {
  weekStart: string;
  weekEnd: string;
  combos: ProjectCombo[];
  refreshKey: number;
  onEntryCreated: () => Promise<void> | void;
}

interface DraftState {
  comboId: string;
  hours: string;
  note: string;
}

function formatTimeRange(event: CalendarEvent): string {
  if (event.isAllDay) return 'All day';
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatDayHeader(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function CalendarInbox({
  weekStart,
  weekEnd,
  combos,
  refreshKey,
  onEntryCreated,
}: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listEventsForWeek(weekStart, weekEnd);
      setEvents(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const pending = useMemo(
    () =>
      events.filter(
        (e) => e.importedEntryId === null && e.dismissedAt === null,
      ),
    [events],
  );

  const grouped = useMemo(() => {
    const out: Record<string, CalendarEvent[]> = {};
    for (const e of pending) {
      const day = eventWorkDate(e);
      (out[day] ??= []).push(e);
    }
    return out;
  }, [pending]);

  function getDraft(event: CalendarEvent): DraftState {
    return (
      drafts[event.id] ?? {
        comboId: combos[0]?.id ?? '',
        hours: String(eventDurationHours(event) || 1),
        note: event.subject ?? '',
      }
    );
  }

  function patchDraft(eventId: string, patch: Partial<DraftState>) {
    setDrafts((cur) => ({
      ...cur,
      [eventId]: { ...getDraftFromCur(cur, eventId), ...patch },
    }));
  }

  function getDraftFromCur(
    cur: Record<string, DraftState>,
    eventId: string,
  ): DraftState {
    const event = events.find((e) => e.id === eventId);
    if (!event) return { comboId: '', hours: '1', note: '' };
    return (
      cur[eventId] ?? {
        comboId: combos[0]?.id ?? '',
        hours: String(eventDurationHours(event) || 1),
        note: event.subject ?? '',
      }
    );
  }

  async function addToGrid(event: CalendarEvent) {
    const draft = getDraft(event);
    setError(null);
    if (!draft.comboId) {
      setError('Pick a project combo first.');
      return;
    }
    const hours = Number(draft.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      setError('Hours must be between 0 and 24.');
      return;
    }
    setBusyId(event.id);
    try {
      const entry = await window.meow.entries.create({
        comboId: draft.comboId,
        workDate: eventWorkDate(event),
        hours,
        note: draft.note.trim() || null,
        source: 'calendar',
        sourceRefId: event.icalUid,
      });
      await markEventImported(event.id, entry.id);
      setEvents((cur) =>
        cur.map((e) =>
          e.id === event.id ? { ...e, importedEntryId: entry.id } : e,
        ),
      );
      await onEntryCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(event: CalendarEvent) {
    setBusyId(event.id);
    try {
      await dismissEvent(event.id);
      setEvents((cur) =>
        cur.map((e) =>
          e.id === event.id
            ? { ...e, dismissedAt: new Date().toISOString() }
            : e,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="calendar-inbox" aria-label="Calendar inbox">
      <header className="calendar-inbox-head">
        <h3 style={{ margin: 0 }}>Calendar inbox</h3>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {loading
            ? 'loading…'
            : pending.length === 0
              ? 'no pending events'
              : `${pending.length} pending`}
        </span>
      </header>

      {error && <div className="error">{error}</div>}

      {pending.length === 0 && !loading && (
        <div className="empty" style={{ padding: 12 }}>
          Nothing to review. Click <b>Sync calendar</b> to pull this week's
          events from your published Outlook feed.
        </div>
      )}

      {Object.keys(grouped)
        .sort()
        .map((day) => (
          <div key={day} className="calendar-inbox-day">
            <div className="calendar-inbox-day-head">{formatDayHeader(day)}</div>
            {grouped[day].map((event) => {
              const draft = getDraft(event);
              return (
                <div key={event.id} className="calendar-inbox-row">
                  <div className="calendar-inbox-row-meta">
                    <div className="calendar-inbox-subject">
                      {event.subject ?? '(no subject)'}
                    </div>
                    <div className="calendar-inbox-sub">
                      {formatTimeRange(event)}
                      {event.organizer ? ` · ${event.organizer}` : ''}
                      {event.location ? ` · ${event.location}` : ''}
                    </div>
                  </div>
                  <div className="calendar-inbox-row-fields">
                    <select
                      value={draft.comboId}
                      onChange={(e) =>
                        patchDraft(event.id, { comboId: e.target.value })
                      }
                      disabled={busyId === event.id || combos.length === 0}
                    >
                      {combos.length === 0 && (
                        <option value="">No combos yet</option>
                      )}
                      {combos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.displayName} — {c.visionProject}
                          {c.visionPhase ? ` / ${c.visionPhase}` : ''} /{' '}
                          {c.visionLaborCode}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.25"
                      value={draft.hours}
                      onChange={(e) =>
                        patchDraft(event.id, { hours: e.target.value })
                      }
                      disabled={busyId === event.id}
                      style={{ width: 80 }}
                    />
                    <input
                      type="text"
                      value={draft.note}
                      onChange={(e) =>
                        patchDraft(event.id, { note: e.target.value })
                      }
                      placeholder="Note"
                      disabled={busyId === event.id}
                    />
                    <button
                      className="primary"
                      onClick={() => void addToGrid(event)}
                      disabled={busyId === event.id || combos.length === 0}
                    >
                      Add to grid
                    </button>
                    <button
                      onClick={() => void dismiss(event)}
                      disabled={busyId === event.id}
                      title="Hide this event"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
    </section>
  );
}
