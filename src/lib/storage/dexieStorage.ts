import type {
  ProjectCombo,
  TimeEntry,
  WeekGrid,
  WeekGridRow,
  NewProjectComboInput,
  NewTimeEntryInput,
  UpdateTimeEntryInput,
  AuditAction,
} from '../../../shared/types';
import type { MeowApi } from '../../../shared/ipc';
import {
  dexieDb,
  type DexieCombo,
  type DexieEntry,
} from './dexieDb';

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function toCombo(r: DexieCombo): ProjectCombo {
  return {
    id: r.id,
    displayName: r.displayName,
    visionProject: r.visionProject,
    visionScope: r.visionScope,
    visionPhase: r.visionPhase,
    visionLaborCode: r.visionLaborCode,
    isFavorite: r.isFavorite,
    lastUsedAt: r.lastUsedAt,
    useCount: r.useCount,
    createdAt: r.createdAt,
  };
}

function toEntry(r: DexieEntry): TimeEntry {
  return {
    id: r.id,
    comboId: r.comboId,
    workDate: r.workDate,
    hours: r.hours,
    note: r.note,
    source: r.source as TimeEntry['source'],
    sourceRefId: r.sourceRefId,
    copiedToVisionAt: r.copiedToVisionAt,
    createdAt: r.createdAt,
    modifiedAt: r.updatedAt,
  };
}

interface DexieStorageOptions {
  ownerId: string;
  onLocalMutation?: () => void;
}

export function createDexieStorage(opts: DexieStorageOptions): MeowApi {
  const { ownerId } = opts;
  const db = dexieDb();
  const notify = () => opts.onLocalMutation?.();

  async function audit(
    action: AuditAction,
    entityId: string,
    before: unknown,
    after: unknown,
    reason: string | null = null,
  ): Promise<void> {
    await db.audit.add({
      id: uuid(),
      ownerId,
      timestamp: nowIso(),
      action,
      entityId,
      before:
        before === null || before === undefined ? null : JSON.stringify(before),
      after:
        after === null || after === undefined ? null : JSON.stringify(after),
      reason,
      dirty: 1,
    });
  }

  return {
    combos: {
      async list() {
        const rows = await db.combos
          .where('ownerId')
          .equals(ownerId)
          .filter((c) => c.deletedAt === null)
          .toArray();
        rows.sort((a, b) => {
          if (a.isFavorite !== b.isFavorite) return b.isFavorite - a.isFavorite;
          const al = a.lastUsedAt ?? '';
          const bl = b.lastUsedAt ?? '';
          if (al !== bl) return bl.localeCompare(al);
          return a.displayName.localeCompare(b.displayName);
        });
        return rows.map(toCombo);
      },

      async favorites(limit = 5) {
        const all = await db.combos
          .where('ownerId')
          .equals(ownerId)
          .filter((c) => c.deletedAt === null && (c.isFavorite === 1 || c.useCount > 0))
          .toArray();
        all.sort((a, b) => {
          if (a.useCount !== b.useCount) return b.useCount - a.useCount;
          const al = a.lastUsedAt ?? '';
          const bl = b.lastUsedAt ?? '';
          return bl.localeCompare(al);
        });
        return all.slice(0, limit).map(toCombo);
      },

      async create(input: NewProjectComboInput) {
        const id = uuid();
        const ts = nowIso();
        const row: DexieCombo = {
          id,
          ownerId,
          displayName: input.displayName,
          visionProject: input.visionProject,
          visionScope: input.visionScope ?? null,
          visionPhase: input.visionPhase ?? null,
          visionLaborCode: input.visionLaborCode,
          isFavorite: input.isFavorite ? 1 : 0,
          lastUsedAt: null,
          useCount: 0,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          dirty: 1,
        };
        await db.combos.add(row);
        await audit('combo.create', id, null, toCombo(row));
        notify();
        return toCombo(row);
      },
    },

    entries: {
      async create(input: NewTimeEntryInput) {
        const id = uuid();
        const ts = nowIso();
        const row: DexieEntry = {
          id,
          ownerId,
          comboId: input.comboId,
          workDate: input.workDate,
          hours: input.hours,
          note: input.note ?? null,
          source: input.source,
          sourceRefId: input.sourceRefId ?? null,
          copiedToVisionAt: null,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          dirty: 1,
        };
        await db.transaction('rw', db.entries, db.combos, db.audit, async () => {
          await db.entries.add(row);
          const combo = await db.combos.get(input.comboId);
          if (combo) {
            await db.combos.update(combo.id, {
              useCount: combo.useCount + 1,
              lastUsedAt: ts,
              updatedAt: ts,
              dirty: 1,
            });
          }
        });
        await audit('entry.create', id, null, toEntry(row));
        notify();
        return toEntry(row);
      },

      async update(input: UpdateTimeEntryInput) {
        const before = await db.entries.get(input.id);
        if (!before) throw new Error(`Entry ${input.id} not found`);
        if (before.copiedToVisionAt !== null && !input.reason) {
          throw new Error(
            'reason is required when editing an entry already copied to Vision',
          );
        }
        const next: DexieEntry = {
          ...before,
          comboId: input.comboId ?? before.comboId,
          workDate: input.workDate ?? before.workDate,
          hours: input.hours ?? before.hours,
          note: input.note === undefined ? before.note : input.note,
          updatedAt: nowIso(),
          dirty: 1,
        };
        await db.entries.put(next);
        await audit(
          'entry.update',
          input.id,
          toEntry(before),
          toEntry(next),
          input.reason ?? null,
        );
        notify();
        return toEntry(next);
      },

      async delete(id: string, reason?: string) {
        const before = await db.entries.get(id);
        if (!before) return;
        if (before.copiedToVisionAt !== null && !reason) {
          throw new Error(
            'reason is required when deleting an entry already copied to Vision',
          );
        }
        const ts = nowIso();
        await db.entries.update(id, {
          deletedAt: ts,
          updatedAt: ts,
          dirty: 1,
        });
        await audit('entry.delete', id, toEntry(before), null, reason ?? null);
        notify();
      },

      async markCopied(ids: string[]) {
        if (ids.length === 0) return;
        const ts = nowIso();
        await db.transaction('rw', db.entries, db.audit, async () => {
          for (const id of ids) {
            await db.entries.update(id, {
              copiedToVisionAt: ts,
              updatedAt: ts,
              dirty: 1,
            });
          }
        });
        for (const id of ids) {
          await audit('entry.markCopied', id, null, { copiedToVisionAt: ts });
        }
        notify();
      },
    },

    week: {
      async get(weekStart: string): Promise<WeekGrid> {
        const dates: string[] = [];
        const start = new Date(weekStart + 'T00:00:00Z');
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setUTCDate(start.getUTCDate() + i);
          dates.push(d.toISOString().slice(0, 10));
        }
        const weekEnd = dates[dates.length - 1];

        const entries = await db.entries
          .where('[ownerId+workDate]')
          .between([ownerId, weekStart], [ownerId, weekEnd], true, true)
          .filter((e) => e.deletedAt === null)
          .toArray();
        entries.sort((a, b) => {
          if (a.workDate !== b.workDate) return a.workDate.localeCompare(b.workDate);
          return a.createdAt.localeCompare(b.createdAt);
        });

        const comboIds = Array.from(new Set(entries.map((e) => e.comboId)));
        const combos = comboIds.length
          ? await db.combos.where('id').anyOf(comboIds).toArray()
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
          for (const entry of entries.filter((e) => e.comboId === combo.id)) {
            hoursByDate[entry.workDate] += entry.hours;
            entryIdsByDate[entry.workDate].push(entry.id);
            if (entry.note) notesByDate[entry.workDate].push(entry.note);
            weekTotal += entry.hours;
          }
          return {
            combo: toCombo(combo),
            hoursByDate,
            entryIdsByDate,
            notesByDate,
            weekTotal,
          };
        });

        const dailyTotals: Record<string, number> = {};
        let weekTotal = 0;
        for (const date of dates) {
          dailyTotals[date] = rows.reduce((s, r) => s + r.hoursByDate[date], 0);
          weekTotal += dailyTotals[date];
        }

        return { weekStart, weekEnd, dates, rows, dailyTotals, weekTotal };
      },
    },

    quickLog: {
      async hide() {
        // No-op in browser: there is no quick-log popup window.
      },
    },
  };
}
