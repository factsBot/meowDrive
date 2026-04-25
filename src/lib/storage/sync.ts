import { dexieDb, type DexieCombo, type DexieEntry, type DexieAuditEvent } from './dexieDb';
import { supabase, supabaseEnabled } from './supabaseClient';

const META_LAST_PULL_PREFIX = 'lastPull:';

interface RemoteCombo {
  id: string;
  owner_id: string;
  display_name: string;
  vision_project: string;
  vision_scope: string | null;
  vision_phase: string | null;
  vision_labor_code: string;
  is_favorite: boolean;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface RemoteEntry {
  id: string;
  owner_id: string;
  combo_id: string;
  work_date: string;
  hours: number;
  note: string | null;
  source: string;
  source_ref_id: string | null;
  copied_to_vision_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface RemoteAudit {
  id: string;
  owner_id: string;
  timestamp: string;
  action: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

function comboToRemote(c: DexieCombo): RemoteCombo {
  return {
    id: c.id,
    owner_id: c.ownerId,
    display_name: c.displayName,
    vision_project: c.visionProject,
    vision_scope: c.visionScope,
    vision_phase: c.visionPhase,
    vision_labor_code: c.visionLaborCode,
    is_favorite: c.isFavorite === 1,
    last_used_at: c.lastUsedAt,
    use_count: c.useCount,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt,
  };
}

function comboFromRemote(r: RemoteCombo): DexieCombo {
  return {
    id: r.id,
    ownerId: r.owner_id,
    displayName: r.display_name,
    visionProject: r.vision_project,
    visionScope: r.vision_scope,
    visionPhase: r.vision_phase,
    visionLaborCode: r.vision_labor_code,
    isFavorite: r.is_favorite ? 1 : 0,
    lastUsedAt: r.last_used_at,
    useCount: r.use_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    dirty: 0,
  };
}

function entryToRemote(e: DexieEntry): RemoteEntry {
  return {
    id: e.id,
    owner_id: e.ownerId,
    combo_id: e.comboId,
    work_date: e.workDate,
    hours: e.hours,
    note: e.note,
    source: e.source,
    source_ref_id: e.sourceRefId,
    copied_to_vision_at: e.copiedToVisionAt,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt,
  };
}

function entryFromRemote(r: RemoteEntry): DexieEntry {
  return {
    id: r.id,
    ownerId: r.owner_id,
    comboId: r.combo_id,
    workDate: r.work_date,
    hours: r.hours,
    note: r.note,
    source: r.source,
    sourceRefId: r.source_ref_id,
    copiedToVisionAt: r.copied_to_vision_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    dirty: 0,
  };
}

function auditToRemote(a: DexieAuditEvent): RemoteAudit {
  return {
    id: a.id,
    owner_id: a.ownerId,
    timestamp: a.timestamp,
    action: a.action,
    entity_id: a.entityId,
    before: a.before ? JSON.parse(a.before) : null,
    after: a.after ? JSON.parse(a.after) : null,
    reason: a.reason,
  };
}

async function getMeta(key: string): Promise<string | null> {
  const row = await dexieDb().meta.get(key);
  return row?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  await dexieDb().meta.put({ key, value });
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

export class SyncEngine {
  private timer: number | null = null;
  private running = false;
  private listeners = new Set<(state: SyncState) => void>();
  private state: SyncState = { running: false, lastSyncAt: null, error: null };

  constructor(private ownerId: string) {}

  start(intervalMs = 30_000): void {
    void this.runOnce();
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.runOnce(), intervalMs);
    window.addEventListener('online', this.onOnline);
  }

  stop(): void {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    window.removeEventListener('online', this.onOnline);
  }

  subscribe(fn: (state: SyncState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private setState(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  private onOnline = () => {
    void this.runOnce();
  };

  async runOnce(): Promise<SyncResult> {
    const result: SyncResult = { pushed: 0, pulled: 0, errors: [] };
    if (!supabaseEnabled()) return result;
    if (this.running) return result;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return result;
    }
    this.running = true;
    this.setState({ running: true, error: null });
    try {
      result.pushed = await this.push();
      result.pulled = await this.pull();
      this.setState({ lastSyncAt: new Date().toISOString(), error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(msg);
      this.setState({ error: msg });
    } finally {
      this.running = false;
      this.setState({ running: false });
    }
    return result;
  }

  private async push(): Promise<number> {
    const sb = supabase();
    const db = dexieDb();
    let pushed = 0;

    const dirtyCombos = await db.combos
      .where('ownerId')
      .equals(this.ownerId)
      .filter((c) => c.dirty === 1)
      .toArray();
    if (dirtyCombos.length > 0) {
      const { error } = await sb
        .from('project_combos')
        .upsert(dirtyCombos.map(comboToRemote), { onConflict: 'id' });
      if (error) throw new Error(`combos push: ${error.message}`);
      await db.transaction('rw', db.combos, async () => {
        for (const c of dirtyCombos) await db.combos.update(c.id, { dirty: 0 });
      });
      pushed += dirtyCombos.length;
    }

    const dirtyEntries = await db.entries
      .where('ownerId')
      .equals(this.ownerId)
      .filter((e) => e.dirty === 1)
      .toArray();
    if (dirtyEntries.length > 0) {
      const { error } = await sb
        .from('time_entries')
        .upsert(dirtyEntries.map(entryToRemote), { onConflict: 'id' });
      if (error) throw new Error(`entries push: ${error.message}`);
      await db.transaction('rw', db.entries, async () => {
        for (const e of dirtyEntries)
          await db.entries.update(e.id, { dirty: 0 });
      });
      pushed += dirtyEntries.length;
    }

    const dirtyAudit = await db.audit
      .where('ownerId')
      .equals(this.ownerId)
      .filter((a) => a.dirty === 1)
      .toArray();
    if (dirtyAudit.length > 0) {
      const { error } = await sb
        .from('audit_events')
        .upsert(dirtyAudit.map(auditToRemote), { onConflict: 'id' });
      if (error) throw new Error(`audit push: ${error.message}`);
      await db.transaction('rw', db.audit, async () => {
        for (const a of dirtyAudit) await db.audit.update(a.id, { dirty: 0 });
      });
      pushed += dirtyAudit.length;
    }

    return pushed;
  }

  private async pull(): Promise<number> {
    const sb = supabase();
    const db = dexieDb();
    let pulled = 0;

    const sinceCombos = (await getMeta(META_LAST_PULL_PREFIX + 'combos')) ?? '1970-01-01T00:00:00Z';
    const { data: remoteCombos, error: cErr } = await sb
      .from('project_combos')
      .select('*')
      .eq('owner_id', this.ownerId)
      .gt('updated_at', sinceCombos)
      .order('updated_at', { ascending: true });
    if (cErr) throw new Error(`combos pull: ${cErr.message}`);
    if (remoteCombos && remoteCombos.length > 0) {
      await db.transaction('rw', db.combos, async () => {
        for (const r of remoteCombos as RemoteCombo[]) {
          const local = await db.combos.get(r.id);
          if (!local || local.updatedAt < r.updated_at) {
            const merged = comboFromRemote(r);
            if (local && local.dirty === 1 && local.updatedAt >= r.updated_at) continue;
            await db.combos.put(merged);
          }
        }
      });
      const newest = (remoteCombos as RemoteCombo[]).reduce(
        (max, r) => (r.updated_at > max ? r.updated_at : max),
        sinceCombos,
      );
      await setMeta(META_LAST_PULL_PREFIX + 'combos', newest);
      pulled += remoteCombos.length;
    }

    const sinceEntries = (await getMeta(META_LAST_PULL_PREFIX + 'entries')) ?? '1970-01-01T00:00:00Z';
    const { data: remoteEntries, error: eErr } = await sb
      .from('time_entries')
      .select('*')
      .eq('owner_id', this.ownerId)
      .gt('updated_at', sinceEntries)
      .order('updated_at', { ascending: true });
    if (eErr) throw new Error(`entries pull: ${eErr.message}`);
    if (remoteEntries && remoteEntries.length > 0) {
      await db.transaction('rw', db.entries, async () => {
        for (const r of remoteEntries as RemoteEntry[]) {
          const local = await db.entries.get(r.id);
          if (!local || local.updatedAt < r.updated_at) {
            if (local && local.dirty === 1 && local.updatedAt >= r.updated_at) continue;
            await db.entries.put(entryFromRemote(r));
          }
        }
      });
      const newest = (remoteEntries as RemoteEntry[]).reduce(
        (max, r) => (r.updated_at > max ? r.updated_at : max),
        sinceEntries,
      );
      await setMeta(META_LAST_PULL_PREFIX + 'entries', newest);
      pulled += remoteEntries.length;
    }

    return pulled;
  }
}

export interface SyncState {
  running: boolean;
  lastSyncAt: string | null;
  error: string | null;
}
