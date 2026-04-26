// Supabase Edge Function: sync-calendar
// Triggered by the renderer's "Sync Now" button. Pulls the user's published ICS feed,
// parses it, expands recurrences within the requested week window, and upserts each
// occurrence into public.calendar_events. Auto-categorisation lives elsewhere.

import { createClient } from '@supabase/supabase-js';
import ICAL from 'ical.js';

interface SyncRequest {
  weekStart: string; // YYYY-MM-DD (Monday, UTC)
  weekEnd: string;   // YYYY-MM-DD (Sunday, UTC)
}

interface SyncResponse {
  count: number;
  lastSyncedAt: string;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}

async function makeId(ownerId: string, icalUid: string, startIso: string): Promise<string> {
  // UUID v5 over (owner, uid, start) — stable across runs so upserts target the same row.
  const data = new TextEncoder().encode(`${ownerId}|${icalUid}|${startIso}`);
  const buf = await crypto.subtle.digest('SHA-1', data);
  const b = new Uint8Array(buf);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b.slice(0, 16), (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

interface ParsedOccurrence {
  ical_uid: string;
  recurrence_id: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  subject: string | null;
  organizer: string | null;
  location: string | null;
  status: string | null;
}

function parseIcs(icsText: string, rangeStart: Date, rangeEnd: Date): ParsedOccurrence[] {
  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents('vevent');
  const out: ParsedOccurrence[] = [];

  for (const ve of vevents) {
    const event = new ICAL.Event(ve);
    const status = ve.getFirstPropertyValue('status') as string | null;
    if (status && String(status).toUpperCase() === 'CANCELLED') continue;

    const baseInfo = {
      ical_uid: event.uid,
      subject: event.summary ?? null,
      organizer: event.organizer ? String(event.organizer).replace(/^mailto:/i, '') : null,
      location: event.location ?? null,
      status: status ? String(status) : null,
    };

    if (event.isRecurring()) {
      const it = event.iterator();
      let next: ICAL.Time | null;
      while ((next = it.next())) {
        const occ = event.getOccurrenceDetails(next);
        const startJs: Date = occ.startDate.toJSDate();
        const endJs: Date = occ.endDate.toJSDate();
        if (endJs < rangeStart) continue;
        if (startJs > rangeEnd) break;
        out.push({
          ...baseInfo,
          recurrence_id: occ.recurrenceId.toString(),
          start_at: startJs.toISOString(),
          end_at: endJs.toISOString(),
          is_all_day: occ.startDate.isDate,
        });
      }
    } else {
      const startJs = event.startDate.toJSDate();
      const endJs = event.endDate.toJSDate();
      if (endJs < rangeStart) continue;
      if (startJs > rangeEnd) continue;
      out.push({
        ...baseInfo,
        recurrence_id: null,
        start_at: startJs.toISOString(),
        end_at: endJs.toISOString(),
        is_all_day: event.startDate.isDate,
      });
    }
  }

  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const auth = req.headers.get('authorization');
  if (!auth) return json({ error: 'missing authorization header' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return json({ error: 'server misconfigured' }, 500);

  const sb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });

  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);
  const ownerId = userData.user.id;

  let body: SyncRequest;
  try {
    body = (await req.json()) as SyncRequest;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.weekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(body.weekEnd)) {
    return json({ error: 'weekStart and weekEnd must be YYYY-MM-DD' }, 400);
  }
  const rangeStart = new Date(`${body.weekStart}T00:00:00Z`);
  const rangeEnd = new Date(`${body.weekEnd}T23:59:59Z`);

  const { data: source, error: srcErr } = await sb
    .from('user_calendar_sources')
    .select('ics_url')
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (srcErr) return json({ error: `source lookup failed: ${srcErr.message}` }, 500);
  if (!source?.ics_url) return json({ error: 'no calendar source configured' }, 400);

  let icsText: string;
  try {
    const res = await fetch(source.ics_url, { headers: { accept: 'text/calendar' } });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    icsText = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sb
      .from('user_calendar_sources')
      .update({ last_sync_error: msg, updated_at: new Date().toISOString() })
      .eq('owner_id', ownerId);
    return json({ error: `fetch failed: ${msg}` }, 502);
  }

  let occurrences: ParsedOccurrence[];
  try {
    occurrences = parseIcs(icsText, rangeStart, rangeEnd);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sb
      .from('user_calendar_sources')
      .update({ last_sync_error: `parse: ${msg}`, updated_at: new Date().toISOString() })
      .eq('owner_id', ownerId);
    return json({ error: `parse failed: ${msg}` }, 500);
  }

  const nowIso = new Date().toISOString();
  const rows = await Promise.all(
    occurrences.map(async (o) => ({
      id: await makeId(ownerId, o.ical_uid, o.start_at),
      owner_id: ownerId,
      ical_uid: o.ical_uid,
      recurrence_id: o.recurrence_id,
      start_at: o.start_at,
      end_at: o.end_at,
      is_all_day: o.is_all_day,
      subject: o.subject,
      organizer: o.organizer,
      location: o.location,
      status: o.status,
      updated_at: nowIso,
    })),
  );

  if (rows.length > 0) {
    const { error: upErr } = await sb
      .from('calendar_events')
      .upsert(rows, { onConflict: 'owner_id,ical_uid,start_at' });
    if (upErr) return json({ error: `upsert failed: ${upErr.message}` }, 500);
  }

  await sb
    .from('user_calendar_sources')
    .update({ last_synced_at: nowIso, last_sync_error: null, updated_at: nowIso })
    .eq('owner_id', ownerId);

  const response: SyncResponse = { count: rows.length, lastSyncedAt: nowIso };
  return json(response);
});
