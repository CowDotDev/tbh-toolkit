import { useState } from 'react';
import type { LibraryEntry } from '@shared/tool-types';
import type { ResolvedBuild } from '@shared/types';
import { dateTime } from '../../app/format';
import { call } from '../../app/ipc';
import { BuildView } from './BuildView';

interface Props {
  entries: LibraryEntry[];
  onChanged: () => void;
  onCompare: (id: string) => void;
}

export function LibraryView({ entries, onChanged, onCompare }: Props) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ entry: LibraryEntry; build: ResolvedBuild } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const importCode = (): Promise<void> =>
    run(async () => {
      const entry = await call<LibraryEntry>('build-share:import', code, name);
      setCode('');
      setName('');
      setNotice(`Imported “${entry.label}” (${entry.heroes.map((h) => h.name).join(', ')}).`);
      onChanged();
    });

  const view = (entry: LibraryEntry): Promise<void> =>
    run(async () => setViewing({ entry, build: await call<ResolvedBuild>('build-share:get', entry.id) }));

  const copy = (entry: LibraryEntry): Promise<void> =>
    run(async () => {
      const result = await call<{ code: string }>('build-share:code', entry.id);
      await call('core:copyText', result.code);
      setNotice(`Copied the code for “${entry.label}”.`);
    });

  const remove = (id: string): Promise<void> =>
    run(async () => {
      await call('build-share:remove', id);
      setConfirmId(null);
      onChanged();
    });

  if (viewing) {
    return (
      <div>
        <div className="row spread">
          <div>
            <button className="link" onClick={() => setViewing(null)}>
              ← Back to friends’ builds
            </button>
            <h2 className="inline-title">{viewing.entry.label}</h2>
            <span className="muted small">
              game v{viewing.entry.game} · captured {dateTime(viewing.entry.at * 1000)}
            </span>
          </div>
          <button className="button" onClick={() => onCompare(viewing.entry.id)}>
            Compare with mine
          </button>
        </div>
        <BuildView build={viewing.build} />
      </div>
    );
  }

  return (
    <div className="panel-grid">
      <section className="card">
        <h3>Import a share code</h3>
        <textarea className="code-box" placeholder="Paste a TBH1-… code here" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
        <div className="field">
          <label className="field-label" htmlFor="import-name">
            Save as (optional — defaults to the name your friend gave it)
          </label>
          <input id="import-name" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="button primary" onClick={importCode} disabled={!code.trim()}>
          Import build
        </button>
        {error && <div className="banner error">{error}</div>}
        {notice && <div className="banner ok">{notice}</div>}
      </section>

      <section className="card">
        <h3>Saved builds</h3>
        {entries.length === 0 && <p className="muted">No builds yet. Paste a code from a friend to add one.</p>}
        <ul className="library">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="library-main">
                <div className="library-title">{entry.label}</div>
                <div className="muted small">
                  {entry.heroes.map((h) => `${h.name} ${h.level}`).join(' · ')} · v{entry.game} · {dateTime(entry.at * 1000)}
                </div>
              </div>
              {confirmId === entry.id ? (
                <div className="row">
                  <span className="small">Delete this build?</span>
                  <button className="button danger" onClick={() => remove(entry.id)}>
                    Delete
                  </button>
                  <button className="button" onClick={() => setConfirmId(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <div className="row">
                  <button className="button" onClick={() => view(entry)}>
                    View
                  </button>
                  <button className="button" onClick={() => onCompare(entry.id)}>
                    Compare
                  </button>
                  <button className="button" onClick={() => copy(entry)} title="Copy this build's share code">
                    Copy code
                  </button>
                  <button className="button" onClick={() => setConfirmId(entry.id)}>
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
