import { useState } from 'react';
import type { LibraryEntry } from '@shared/tool-types';
import type { ResolvedBuild } from '@shared/types';
import { useQuery } from '../../app/ipc';
import type { ToolProps } from '../registry';
import { BuildView } from './BuildView';
import { CompareView } from './CompareView';
import { LibraryView } from './LibraryView';
import { SharePanel } from './SharePanel';

type Tab = 'mine' | 'share' | 'library' | 'compare';

const TABS: { id: Tab; label: string }[] = [
  { id: 'mine', label: 'My Build' },
  { id: 'share', label: 'Share' },
  { id: 'library', label: 'Friends’ Builds' },
  { id: 'compare', label: 'Compare' },
];

export function BuildShare({ status }: ToolProps) {
  const [tab, setTab] = useState<Tab>('mine');
  const [compareId, setCompareId] = useState<string | null>(null);
  // Your build refreshes whenever the game autosaves or game data is reloaded.
  const mine = useQuery<ResolvedBuild | null>('build-share:mine', [], ['core:save', 'core:status']);
  const library = useQuery<LibraryEntry[]>('build-share:library');

  const needsSetup = !mine.loading && !mine.data;

  return (
    <div className="tool">
      <header className="tool-header">
        <div>
          <h1>Build Share</h1>
          <p className="muted">Your heroes, gear, enchants and attribute points — shareable as a single code.</p>
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={t.id === tab ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'library' && library.data?.length ? <span className="badge">{library.data.length}</span> : null}
            </button>
          ))}
        </div>
      </header>

      {mine.error && <div className="banner error">{mine.error}</div>}
      {needsSetup && !mine.error && (
        <div className="banner">
          {status?.errors.length ? status.errors.join(' ') : 'Waiting for game data and a save file…'} You can still import and view
          friends’ builds once the game folder is found.
        </div>
      )}

      {tab === 'mine' && (mine.data ? <BuildView build={mine.data} /> : !needsSetup && <div className="muted">Loading your build…</div>)}
      {tab === 'share' && <SharePanel mine={mine.data ?? null} />}
      {tab === 'library' && (
        <LibraryView
          entries={library.data ?? []}
          onChanged={library.reload}
          onCompare={(id) => {
            setCompareId(id);
            setTab('compare');
          }}
        />
      )}
      {tab === 'compare' && <CompareView mine={mine.data ?? null} entries={library.data ?? []} selectedId={compareId} onSelect={setCompareId} />}
    </div>
  );
}
