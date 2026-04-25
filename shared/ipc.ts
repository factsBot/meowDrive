import type {
  ProjectCombo,
  TimeEntry,
  WeekGrid,
  NewTimeEntryInput,
  UpdateTimeEntryInput,
  NewProjectComboInput,
} from './types';

export const IpcChannels = {
  combosList: 'combos:list',
  combosCreate: 'combos:create',
  combosFavorites: 'combos:favorites',
  entriesCreate: 'entries:create',
  entriesUpdate: 'entries:update',
  entriesDelete: 'entries:delete',
  entriesMarkCopied: 'entries:markCopied',
  weekGet: 'week:get',
  quickLogShow: 'quicklog:show',
  quickLogHide: 'quicklog:hide',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export interface MeowApi {
  combos: {
    list(): Promise<ProjectCombo[]>;
    create(input: NewProjectComboInput): Promise<ProjectCombo>;
    favorites(limit?: number): Promise<ProjectCombo[]>;
  };
  entries: {
    create(input: NewTimeEntryInput): Promise<TimeEntry>;
    update(input: UpdateTimeEntryInput): Promise<TimeEntry>;
    delete(id: string, reason?: string): Promise<void>;
    markCopied(ids: string[]): Promise<void>;
  };
  week: {
    get(weekStart: string): Promise<WeekGrid>;
  };
  quickLog: {
    hide(): Promise<void>;
  };
}
