export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function startOfWeekMonday(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  const day = out.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  out.setUTCDate(out.getUTCDate() + diff);
  return out;
}

export function currentWeekStart(): string {
  return isoDate(startOfWeekMonday(new Date()));
}

export function shiftWeek(weekStart: string, weeks: number): string {
  const d = new Date(weekStart + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return isoDate(d);
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function formatDayHeader(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  const idx = (d.getUTCDay() + 6) % 7;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${DAY_LABELS[idx]} ${mm}/${dd}`;
}
