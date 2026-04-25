export type EntrySource = 'manual' | 'hotkey' | 'calendar' | 'phone';

export interface ProjectCombo {
  id: string;
  displayName: string;
  visionProject: string;
  visionScope: string | null;
  visionPhase: string | null;
  visionLaborCode: string;
  isFavorite: 0 | 1;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  comboId: string;
  workDate: string;
  hours: number;
  note: string | null;
  source: EntrySource;
  sourceRefId: string | null;
  copiedToVisionAt: string | null;
  createdAt: string;
  modifiedAt: string;
}

export interface CalendarEventTag {
  id: string;
  pattern: string;
  comboId: string;
  confidence: number;
  createdAt: string;
}

export type AuditAction =
  | 'entry.create'
  | 'entry.update'
  | 'entry.delete'
  | 'combo.create'
  | 'combo.update'
  | 'combo.delete'
  | 'entry.markCopied';

export interface AuditEvent {
  id: string;
  timestamp: string;
  action: AuditAction;
  entityId: string;
  before: string | null;
  after: string | null;
  reason: string | null;
}

export interface WeekGridRow {
  combo: ProjectCombo;
  hoursByDate: Record<string, number>;
  entriesByDate: Record<string, TimeEntry[]>;
  weekTotal: number;
}

export interface WeekGrid {
  weekStart: string;
  weekEnd: string;
  dates: string[];
  rows: WeekGridRow[];
  dailyTotals: Record<string, number>;
  weekTotal: number;
}

export interface NewTimeEntryInput {
  comboId: string;
  workDate: string;
  hours: number;
  note?: string | null;
  source: EntrySource;
  sourceRefId?: string | null;
}

export interface UpdateTimeEntryInput {
  id: string;
  hours?: number;
  note?: string | null;
  workDate?: string;
  comboId?: string;
  reason?: string | null;
}

export interface NewProjectComboInput {
  displayName: string;
  visionProject: string;
  visionScope?: string | null;
  visionPhase?: string | null;
  visionLaborCode: string;
  isFavorite?: boolean;
}
