import { useState } from 'react';
import type { ProjectCombo, TimeEntry, WeekGrid as WeekGridT } from '../../shared/types';
import { formatDayHeader } from '../lib/weekUtils';
import {
  formatRowForVision,
  formatGridForReview,
} from '../lib/visionClipboard';
import { EntryEditModal } from './EntryEditModal';

interface Props {
  week: WeekGridT;
  onMarkRowCopied: (entryIds: string[]) => Promise<void>;
  onEntriesChanged: () => Promise<void>;
}

interface CellTarget {
  combo: ProjectCombo;
  workDate: string;
  entries: TimeEntry[];
}

function fmtTotal(h: number): string {
  if (h === 0) return '—';
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/\.?0+$/, '');
}

function notesTooltip(entries: TimeEntry[]): string {
  const notes = entries.map((e) => e.note).filter((n): n is string => !!n);
  return notes.length > 0 ? notes.join('\n') : '';
}

export function WeekGridView({ week, onMarkRowCopied, onEntriesChanged }: Props) {
  const [flashedRow, setFlashedRow] = useState<string | null>(null);
  const [flashedAll, setFlashedAll] = useState(false);
  const [cellTarget, setCellTarget] = useState<CellTarget | null>(null);

  async function copyRow(rowIdx: number) {
    const row = week.rows[rowIdx];
    const text = formatRowForVision(row, week.dates);
    await navigator.clipboard.writeText(text);
    const ids = week.dates.flatMap((d) =>
      (row.entriesByDate[d] ?? []).map((e) => e.id),
    );
    if (ids.length > 0) await onMarkRowCopied(ids);
    setFlashedRow(row.combo.id);
    setTimeout(() => setFlashedRow(null), 1800);
  }

  async function copyAll() {
    const text = formatGridForReview(week.rows, week.dates);
    await navigator.clipboard.writeText(text);
    setFlashedAll(true);
    setTimeout(() => setFlashedAll(false), 1800);
  }

  if (week.rows.length === 0) {
    return (
      <div className="grid-card">
        <div className="empty">
          No time logged this week yet. Use the form below to log your first
          entry, or hit <b>Ctrl+Alt+T</b> for quick log.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid-card">
        <table className="grid">
          <thead>
            <tr>
              <th>Project / Phase / Labor</th>
              {week.dates.map((d) => (
                <th key={d} className="num">
                  {formatDayHeader(d)}
                </th>
              ))}
              <th className="num">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {week.rows.map((row, idx) => (
              <tr key={row.combo.id}>
                <td className="combo">
                  <div className="name">{row.combo.displayName}</div>
                  <div className="codes">
                    {row.combo.visionProject}
                    {row.combo.visionPhase ? ` / ${row.combo.visionPhase}` : ''}
                    {' / '}
                    {row.combo.visionLaborCode}
                  </div>
                </td>
                {week.dates.map((d) => {
                  const h = row.hoursByDate[d];
                  const cellEntries = row.entriesByDate[d] ?? [];
                  const hasEntries = cellEntries.length > 0;
                  return (
                    <td
                      key={d}
                      className={`num${hasEntries ? ' editable' : ''}`}
                      title={
                        hasEntries
                          ? `${notesTooltip(cellEntries)}${notesTooltip(cellEntries) ? '\n\n' : ''}Click to edit`
                          : ''
                      }
                      onClick={
                        hasEntries
                          ? () =>
                              setCellTarget({
                                combo: row.combo,
                                workDate: d,
                                entries: cellEntries,
                              })
                          : undefined
                      }
                    >
                      {h === 0 ? '' : fmtTotal(h)}
                    </td>
                  );
                })}
                <td className="num totals">{fmtTotal(row.weekTotal)}</td>
                <td>
                  <button onClick={() => copyRow(idx)}>Copy Row</button>
                  {flashedRow === row.combo.id && (
                    <span className="copy-flash">copied ✓</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Daily totals</td>
              {week.dates.map((d) => (
                <td key={d} className="num">
                  {fmtTotal(week.dailyTotals[d])}
                </td>
              ))}
              <td className="num">{fmtTotal(week.weekTotal)}</td>
              <td>
                <button onClick={copyAll}>Copy All</button>
                {flashedAll && <span className="copy-flash">copied ✓</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {cellTarget && (
        <EntryEditModal
          combo={cellTarget.combo}
          workDate={cellTarget.workDate}
          entries={cellTarget.entries}
          onClose={() => setCellTarget(null)}
          onChanged={onEntriesChanged}
        />
      )}
    </>
  );
}
