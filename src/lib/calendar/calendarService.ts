import { supabase, supabaseEnabled } from '../storage/supabaseClient';
import type {
  CalendarEvent,
  CalendarSource,
  SyncCalendarResult,
} from './types';

interface RemoteCalendarEvent {
  id: string;
  ical_uid: string;
  recurrence_id: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  subject: string | null;
  organizer: string | null;
  location: string | null;
  status: string | null;
  imported_entry_id: string | null;
  dismissed_at: string | null;
}

function fromRemote(r: RemoteCalendarEvent): CalendarEvent {
  return {
    id: r.id,
    icalUid: r.ical_uid,
    recurrenceId: r.recurrence_id,
    startAt: r.start_at,
    endAt: r.end_at,
    isAllDay: r.is_all_day,
    subject: r.subject,
    organizer: r.organizer,
    location: r.location,
    status: r.status,
    importedEntryId: r.imported_entry_id,
    dismissedAt: r.dismissed_at,
  };
}

export function calendarEnabled(): boolean {
  return supabaseEnabled();
}

export async function getSource(): Promise<CalendarSource | null> {
  if (!supabaseEnabled()) return null;
  const { data, error } = await supabase()
    .from('user_calendar_sources')
    .select('ics_url, last_synced_at, last_sync_error')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    icsUrl: data.ics_url,
    lastSyncedAt: data.last_synced_at,
    lastSyncError: data.last_sync_error,
  };
}

export async function saveSource(icsUrl: string): Promise<void> {
  const sb = supabase();
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) throw new Error('not signed in');
  const nowIso = new Date().toISOString();
  const { error } = await sb.from('user_calendar_sources').upsert(
    {
      owner_id: userData.user.id,
      ics_url: icsUrl,
      updated_at: nowIso,
      last_sync_error: null,
    },
    { onConflict: 'owner_id' },
  );
  if (error) throw new Error(error.message);
}

export async function clearSource(): Promise<void> {
  const sb = supabase();
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) throw new Error('not signed in');
  const { error } = await sb
    .from('user_calendar_sources')
    .delete()
    .eq('owner_id', userData.user.id);
  if (error) throw new Error(error.message);
}

export async function syncWeek(
  weekStart: string,
  weekEnd: string,
): Promise<SyncCalendarResult> {
  const { data, error } = await supabase().functions.invoke('sync-calendar', {
    body: { weekStart, weekEnd },
  });
  if (error) {
    const detail =
      (data as { error?: string } | null)?.error ?? error.message;
    throw new Error(detail);
  }
  return data as SyncCalendarResult;
}

export async function listEventsForWeek(
  weekStart: string,
  weekEnd: string,
): Promise<CalendarEvent[]> {
  if (!supabaseEnabled()) return [];
  const startIso = `${weekStart}T00:00:00Z`;
  const endIso = `${weekEnd}T23:59:59Z`;
  const { data, error } = await supabase()
    .from('calendar_events')
    .select(
      'id, ical_uid, recurrence_id, start_at, end_at, is_all_day, subject, organizer, location, status, imported_entry_id, dismissed_at',
    )
    .gte('start_at', startIso)
    .lte('start_at', endIso)
    .order('start_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as RemoteCalendarEvent[]).map(fromRemote);
}

export async function markEventImported(
  eventId: string,
  entryId: string,
): Promise<void> {
  const { error } = await supabase()
    .from('calendar_events')
    .update({
      imported_entry_id: entryId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);
  if (error) throw new Error(error.message);
}

export async function dismissEvent(eventId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase()
    .from('calendar_events')
    .update({ dismissed_at: nowIso, updated_at: nowIso })
    .eq('id', eventId);
  if (error) throw new Error(error.message);
}

export function eventDurationHours(event: CalendarEvent): number {
  if (event.isAllDay) return 0;
  const ms = new Date(event.endAt).getTime() - new Date(event.startAt).getTime();
  return Math.max(0, Math.round((ms / 3_600_000) * 100) / 100);
}

export function eventWorkDate(event: CalendarEvent): string {
  return event.startAt.slice(0, 10);
}
