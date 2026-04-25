import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ProjectCombo,
  TimeEntry,
  WeekGrid,
  WeekGridRow,
  NewTimeEntryInput,
  UpdateTimeEntryInput,
  NewProjectComboInput,
  AuditAction,
} from '../shared/types';

let db: Database.Database | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

export function initDb(overridePath?: string): Database.Database {
  if (db) return db;
  const dbPath =
    overridePath ?? path.join(app.getPath('userData'), 'meowdrive.sqlite');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS project_combos (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      vision_project TEXT NOT NULL,
      vision_scope TEXT,
      vision_phase TEXT,
      vision_labor_code TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY,
      combo_id TEXT NOT NULL REFERENCES project_combos(id) ON DELETE RESTRICT,
      work_date TEXT NOT NULL,
      hours REAL NOT NULL,
      note TEXT,
      source TEXT NOT NULL,
      source_ref_id TEXT,
      copied_to_vision_at TEXT,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entries_work_date ON time_entries(work_date);
    CREATE INDEX IF NOT EXISTS idx_entries_combo ON time_entries(combo_id);

    CREATE TABLE IF NOT EXISTS calendar_event_tags (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      combo_id TEXT NOT NULL REFERENCES project_combos(id) ON DELETE CASCADE,
      confidence REAL NOT NULL DEFAULT 1.0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      before TEXT,
      after TEXT,
      reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_id);
  `);
}

interface ComboRow {
  id: string;
  display_name: string;
  vision_project: string;
  vision_scope: string | null;
  vision_phase: string | null;
  vision_labor_code: string;
  is_favorite: number;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
}

interface EntryRow {
  id: string;
  combo_id: string;
  work_date: string;
  hours: number;
  note: string | null;
  source: string;
  source_ref_id: string | null;
  copied_to_vision_at: string | null;
  created_at: string;
  modified_at: string;
}

function rowToCombo(r: ComboRow): ProjectCombo {
  return {
    id: r.id,
    displayName: r.display_name,
    visionProject: r.vision_project,
    visionScope: r.vision_scope,
    visionPhase: r.vision_phase,
    visionLaborCode: r.vision_labor_code,
    isFavorite: r.is_favorite ? 1 : 0,
    lastUsedAt: r.last_used_at,
    useCount: r.use_count,
    createdAt: r.created_at,
  };
}

function rowToEntry(r: EntryRow): TimeEntry {
  return {
    id: r.id,
    comboId: r.combo_id,
    workDate: r.work_date,
    hours: r.hours,
    note: r.note,
    source: r.source as TimeEntry['source'],
    sourceRefId: r.source_ref_id,
    copiedToVisionAt: r.copied_to_vision_at,
    createdAt: r.created_at,
    modifiedAt: r.modified_at,
  };
}

function audit(
  action: AuditAction,
  entityId: string,
  before: unknown,
  after: unknown,
  reason: string | null = null,
): void {
  const d = initDb();
  d.prepare(
    `INSERT INTO audit_events (id, timestamp, action, entity_id, before, after, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    nowIso(),
    action,
    entityId,
    before === null || before === undefined ? null : JSON.stringify(before),
    after === null || after === undefined ? null : JSON.stringify(after),
    reason,
  );
}

export function listCombos(): ProjectCombo[] {
  const d = initDb();
  const rows = d
    .prepare(
      `SELECT * FROM project_combos
       ORDER BY is_favorite DESC, last_used_at DESC NULLS LAST, display_name ASC`,
    )
    .all() as ComboRow[];
  return rows.map(rowToCombo);
}

export function favoriteCombos(limit = 5): ProjectCombo[] {
  const d = initDb();
  const rows = d
    .prepare(
      `SELECT * FROM project_combos
       WHERE is_favorite = 1 OR use_count > 0
       ORDER BY use_count DESC, last_used_at DESC NULLS LAST
       LIMIT ?`,
    )
    .all(limit) as ComboRow[];
  return rows.map(rowToCombo);
}

export function createCombo(input: NewProjectComboInput): ProjectCombo {
  const d = initDb();
  const id = randomUUID();
  const createdAt = nowIso();
  d.prepare(
    `INSERT INTO project_combos
      (id, display_name, vision_project, vision_scope, vision_phase,
       vision_labor_code, is_favorite, last_used_at, use_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`,
  ).run(
    id,
    input.displayName,
    input.visionProject,
    input.visionScope ?? null,
    input.visionPhase ?? null,
    input.visionLaborCode,
    input.isFavorite ? 1 : 0,
    createdAt,
  );
  const row = d
    .prepare(`SELECT * FROM project_combos WHERE id = ?`)
    .get(id) as ComboRow;
  const combo = rowToCombo(row);
  audit('combo.create', id, null, combo);
  return combo;
}

function bumpComboUsage(comboId: string): void {
  const d = initDb();
  d.prepare(
    `UPDATE project_combos
     SET use_count = use_count + 1, last_used_at = ?
     WHERE id = ?`,
  ).run(nowIso(), comboId);
}

export function createEntry(input: NewTimeEntryInput): TimeEntry {
  const d = initDb();
  const id = randomUUID();
  const ts = nowIso();
  d.prepare(
    `INSERT INTO time_entries
      (id, combo_id, work_date, hours, note, source, source_ref_id,
       copied_to_vision_at, created_at, modified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    id,
    input.comboId,
    input.workDate,
    input.hours,
    input.note ?? null,
    input.source,
    input.sourceRefId ?? null,
    ts,
    ts,
  );
  bumpComboUsage(input.comboId);
  const row = d
    .prepare(`SELECT * FROM time_entries WHERE id = ?`)
    .get(id) as EntryRow;
  const entry = rowToEntry(row);
  audit('entry.create', id, null, entry);
  return entry;
}

export function updateEntry(input: UpdateTimeEntryInput): TimeEntry {
  const d = initDb();
  const before = d
    .prepare(`SELECT * FROM time_entries WHERE id = ?`)
    .get(input.id) as EntryRow | undefined;
  if (!before) throw new Error(`Entry ${input.id} not found`);

  const next = {
    hours: input.hours ?? before.hours,
    note: input.note === undefined ? before.note : input.note,
    work_date: input.workDate ?? before.work_date,
    combo_id: input.comboId ?? before.combo_id,
  };
  const wasCopied = before.copied_to_vision_at !== null;
  if (wasCopied && !input.reason) {
    throw new Error(
      'reason is required when editing an entry already copied to Vision',
    );
  }

  d.prepare(
    `UPDATE time_entries
     SET hours = ?, note = ?, work_date = ?, combo_id = ?, modified_at = ?
     WHERE id = ?`,
  ).run(next.hours, next.note, next.work_date, next.combo_id, nowIso(), input.id);

  const row = d
    .prepare(`SELECT * FROM time_entries WHERE id = ?`)
    .get(input.id) as EntryRow;
  const entry = rowToEntry(row);
  audit(
    'entry.update',
    input.id,
    rowToEntry(before),
    entry,
    input.reason ?? null,
  );
  return entry;
}

export function deleteEntry(id: string, reason: string | null = null): void {
  const d = initDb();
  const before = d
    .prepare(`SELECT * FROM time_entries WHERE id = ?`)
    .get(id) as EntryRow | undefined;
  if (!before) return;
  if (before.copied_to_vision_at !== null && !reason) {
    throw new Error(
      'reason is required when deleting an entry already copied to Vision',
    );
  }
  d.prepare(`DELETE FROM time_entries WHERE id = ?`).run(id);
  audit('entry.delete', id, rowToEntry(before), null, reason);
}

export function markEntriesCopied(ids: string[]): void {
  if (ids.length === 0) return;
  const d = initDb();
  const ts = nowIso();
  const update = d.prepare(
    `UPDATE time_entries SET copied_to_vision_at = ? WHERE id = ?`,
  );
  const tx = d.transaction((entryIds: string[]) => {
    for (const id of entryIds) {
      update.run(ts, id);
      audit('entry.markCopied', id, null, { copiedToVisionAt: ts });
    }
  });
  tx(ids);
}

export function getWeek(weekStart: string): WeekGrid {
  const d = initDb();
  const dates: string[] = [];
  const start = new Date(weekStart + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const dt = new Date(start);
    dt.setUTCDate(start.getUTCDate() + i);
    dates.push(dt.toISOString().slice(0, 10));
  }
  const weekEnd = dates[dates.length - 1];

  const entries = d
    .prepare(
      `SELECT * FROM time_entries
       WHERE work_date >= ? AND work_date <= ?
       ORDER BY work_date ASC, created_at ASC`,
    )
    .all(weekStart, weekEnd) as EntryRow[];

  const comboIds = Array.from(new Set(entries.map((e) => e.combo_id)));
  const combos: ProjectCombo[] = comboIds.length
    ? (d
        .prepare(
          `SELECT * FROM project_combos WHERE id IN (${comboIds
            .map(() => '?')
            .join(',')})`,
        )
        .all(...comboIds) as ComboRow[]).map(rowToCombo)
    : [];

  const rows: WeekGridRow[] = combos.map((combo) => {
    const hoursByDate: Record<string, number> = {};
    const entryIdsByDate: Record<string, string[]> = {};
    const notesByDate: Record<string, string[]> = {};
    for (const date of dates) {
      hoursByDate[date] = 0;
      entryIdsByDate[date] = [];
      notesByDate[date] = [];
    }
    let weekTotal = 0;
    for (const entry of entries.filter((e) => e.combo_id === combo.id)) {
      hoursByDate[entry.work_date] += entry.hours;
      entryIdsByDate[entry.work_date].push(entry.id);
      if (entry.note) notesByDate[entry.work_date].push(entry.note);
      weekTotal += entry.hours;
    }
    return { combo, hoursByDate, entryIdsByDate, notesByDate, weekTotal };
  });

  const dailyTotals: Record<string, number> = {};
  let weekTotal = 0;
  for (const date of dates) {
    dailyTotals[date] = rows.reduce(
      (sum, row) => sum + row.hoursByDate[date],
      0,
    );
    weekTotal += dailyTotals[date];
  }

  return { weekStart, weekEnd, dates, rows, dailyTotals, weekTotal };
}
