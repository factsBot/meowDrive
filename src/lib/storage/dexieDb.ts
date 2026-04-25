import Dexie, { type EntityTable } from 'dexie';

export interface DexieCombo {
  id: string;
  ownerId: string;
  displayName: string;
  visionProject: string;
  visionScope: string | null;
  visionPhase: string | null;
  visionLaborCode: string;
  isFavorite: 0 | 1;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  dirty: 0 | 1;
}

export interface DexieEntry {
  id: string;
  ownerId: string;
  comboId: string;
  workDate: string;
  hours: number;
  note: string | null;
  source: string;
  sourceRefId: string | null;
  copiedToVisionAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  dirty: 0 | 1;
}

export interface DexieAuditEvent {
  id: string;
  ownerId: string;
  timestamp: string;
  action: string;
  entityId: string;
  before: string | null;
  after: string | null;
  reason: string | null;
  dirty: 0 | 1;
}

export interface DexieMeta {
  key: string;
  value: string;
}

export class MeowDexie extends Dexie {
  combos!: EntityTable<DexieCombo, 'id'>;
  entries!: EntityTable<DexieEntry, 'id'>;
  audit!: EntityTable<DexieAuditEvent, 'id'>;
  meta!: EntityTable<DexieMeta, 'key'>;

  constructor() {
    super('meowdrive');
    this.version(1).stores({
      combos:
        'id, ownerId, isFavorite, lastUsedAt, useCount, deletedAt, updatedAt, dirty',
      entries:
        'id, ownerId, comboId, workDate, deletedAt, updatedAt, copiedToVisionAt, dirty, [ownerId+workDate]',
      audit: 'id, ownerId, entityId, timestamp, dirty',
      meta: 'key',
    });
  }
}

let _db: MeowDexie | null = null;
export function dexieDb(): MeowDexie {
  if (!_db) _db = new MeowDexie();
  return _db;
}
