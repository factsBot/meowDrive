import { useState } from 'react';

interface Props {
  onCreated: () => void;
  onCancel: () => void;
}

export function AddComboForm({ onCreated, onCancel }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [visionProject, setVisionProject] = useState('');
  const [visionScope, setVisionScope] = useState('');
  const [visionPhase, setVisionPhase] = useState('');
  const [visionLaborCode, setVisionLaborCode] = useState('');
  const [isFavorite, setIsFavorite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim() || !visionProject.trim() || !visionLaborCode.trim()) {
      setError('Display name, project, and labor code are required.');
      return;
    }
    setBusy(true);
    try {
      await window.meow.combos.create({
        displayName: displayName.trim(),
        visionProject: visionProject.trim(),
        visionScope: visionScope.trim() || null,
        visionPhase: visionPhase.trim() || null,
        visionLaborCode: visionLaborCode.trim(),
        isFavorite,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="combo-form" onSubmit={submit}>
      <label>
        <span>Display name</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Trinity Hospital DD"
          autoFocus
        />
      </label>
      <label>
        <span>Project</span>
        <input
          value={visionProject}
          onChange={(e) => setVisionProject(e.target.value)}
          placeholder="2024-1234"
        />
      </label>
      <label>
        <span>Scope</span>
        <input
          value={visionScope}
          onChange={(e) => setVisionScope(e.target.value)}
          placeholder="(optional)"
        />
      </label>
      <label>
        <span>Phase</span>
        <input
          value={visionPhase}
          onChange={(e) => setVisionPhase(e.target.value)}
          placeholder="DD"
        />
      </label>
      <label>
        <span>Labor code</span>
        <input
          value={visionLaborCode}
          onChange={(e) => setVisionLaborCode(e.target.value)}
          placeholder="ENG"
        />
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            color: 'var(--text)',
          }}
        >
          <input
            type="checkbox"
            checked={isFavorite}
            onChange={(e) => setIsFavorite(e.target.checked)}
          />
          <span style={{ color: 'var(--text)' }}>Favorite</span>
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && (
        <div className="error" style={{ gridColumn: '1 / -1' }}>
          {error}
        </div>
      )}
    </form>
  );
}
