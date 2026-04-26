export interface CalendarEvent {
  id: string;
  icalUid: string;
  recurrenceId: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  subject: string | null;
  organizer: string | null;
  location: string | null;
  status: string | null;
  importedEntryId: string | null;
  dismissedAt: string | null;
}

export interface CalendarSource {
  icsUrl: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export interface SyncCalendarResult {
  count: number;
  lastSyncedAt: string;
}
