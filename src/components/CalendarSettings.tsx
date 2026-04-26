import { useEffect, useState } from 'react';
import {
  clearSource,
  getSource,
  saveSource,
} from '../lib/calendar/calendarService';
import type { CalendarSource } from '../lib/calendar/types';

interface Props {
  onClose: () => void;
  onSaved?: () => void;
}

export function CalendarSettings({ onClose, onSaved }: Props) {
  const [source, setSource] = useState<CalendarSource | null>(null);
  const [icsUrl, setIcsUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await getSource();
        if (cancelled) return;
        setSource(current);
        setIcsUrl(current?.icsUrl ?? '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = icsUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      setError('Paste the full https:// ICS link from Outlook.');
      return;
    }
    setBusy(true);
    try {
      await saveSource(trimmed);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setError(null);
    setBusy(true);
    try {
      await clearSource();
      setSource(null);
      setIcsUrl('');
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="combo-form" onSubmit={save}>
      <h3 style={{ gridColumn: '1 / -1', margin: 0 }}>Calendar source</h3>
      <p
        className="hint"
        style={{ gridColumn: '1 / -1', margin: 0, color: 'var(--muted)' }}
      >
        In Outlook web, open Settings → Calendar → Shared calendars → Publish a
        calendar, choose <b>Can view all details</b>, and paste the ICS link
        below. The token in the URL is the only auth — keep it private.
      </p>
      <label style={{ gridColumn: '1 / -1' }}>
        <span>ICS URL</span>
        <input
          type="url"
          value={icsUrl}
          onChange={(e) => setIcsUrl(e.target.value)}
          placeholder="https://outlook.office365.com/owa/calendar/.../calendar.ics"
          disabled={loading || busy}
          autoFocus
        />
      </label>
      {source?.lastSyncedAt && (
        <div
          style={{
            gridColumn: '1 / -1',
            color: 'var(--muted)',
            fontSize: 12,
          }}
        >
          Last synced {new Date(source.lastSyncedAt).toLocaleString()}
        </div>
      )}
      {source?.lastSyncError && (
        <div className="error" style={{ gridColumn: '1 / -1' }}>
          Last sync error: {source.lastSyncError}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, gridColumn: '1 / -1' }}>
        <button type="submit" className="primary" disabled={busy || loading}>
          {busy ? 'Saving…' : source ? 'Update' : 'Save'}
        </button>
        <button type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        {source && (
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={busy}
            style={{ marginLeft: 'auto' }}
          >
            Disconnect
          </button>
        )}
      </div>
      {error && (
        <div className="error" style={{ gridColumn: '1 / -1' }}>
          {error}
        </div>
      )}
    </form>
  );
}
