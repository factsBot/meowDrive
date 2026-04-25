import type { WeekGridRow } from '../../shared/types';

function fmtHours(h: number): string {
  if (h === 0) return '';
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Vision 7.6 timesheet rows accept tab-separated daily values when pasted
 * into the Mon..Sun columns. We emit the 7 hour cells only — the Project /
 * Scope / Phase / Labor Code lookups must already exist in the row.
 */
export function formatRowForVision(
  row: WeekGridRow,
  dates: string[],
): string {
  return dates.map((d) => fmtHours(row.hoursByDate[d] ?? 0)).join('\t');
}

/**
 * Full-grid copy: one row per project combo, columns = identifying fields
 * (for the user's reference) + 7 daily hour cells. Header row included so
 * the user can paste into a spreadsheet for review.
 */
export function formatGridForReview(
  rows: WeekGridRow[],
  dates: string[],
): string {
  const header = ['Project', 'Scope', 'Phase', 'Labor', ...dates, 'Total'];
  const body = rows.map((r) => [
    r.combo.visionProject,
    r.combo.visionScope ?? '',
    r.combo.visionPhase ?? '',
    r.combo.visionLaborCode,
    ...dates.map((d) => fmtHours(r.hoursByDate[d] ?? 0)),
    fmtHours(r.weekTotal),
  ]);
  return [header, ...body].map((cols) => cols.join('\t')).join('\n');
}
