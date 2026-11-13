import { useState } from 'react';
import type { AppStatus } from '@shared/types';
import { dateTime } from '../../app/format';
import { call, useQuery } from '../../app/ipc';
import type { ToolProps } from '../registry';

const REPO_URL = 'https://github.com/CowDotDev/tbh-toolkit';

export function Settings({ status }: ToolProps) {
  const info = useQuery<{ version: string; electron: string }>('core:appInfo');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Status updates arrive through the 'core:status' event, so we only need to surface errors.
  const run = (channel: string, ...args: unknown[]) => async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await call<AppStatus>(channel, ...args);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tool">
      <header className="tool-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">Where TBH Toolkit reads the game from. Both folders are found automatically in most setups.</p>
        </div>
        <button className="button" onClick={run('core:refresh')} disabled={busy}>
          Re-read game & save
        </button>
      </header>

      {error && <div className="banner error">{error}</div>}
      {status?.errors.map((e, i) => (
        <div key={i} className="banner error">
          {e}
        </div>
      ))}

      <section className="card">
        <h3>Folders</h3>
        <div className="setting">
          <div>
            <div className="field-label">Game install</div>
            <div className="path">{status?.installDir ?? 'Not found'}</div>
            <div className="muted small">
              {status?.gameVersion ? `Game v${status.gameVersion} · ${status.tableCount} tables · ${status.stringCount.toLocaleString()} text entries` : 'The folder that contains TaskBarHero.exe'}
            </div>
          </div>
          <button className="button" onClick={run('core:chooseDir', 'install')} disabled={busy}>
            Change…
          </button>
        </div>
        <div className="setting">
          <div>
            <div className="field-label">Save folder</div>
            <div className="path">{status?.saveDir ?? 'Not found'}</div>
            <div className="muted small">
              {status?.saveTime ? `Reading ${status.saveFile} · last saved ${dateTime(status.saveTime)} · save v${status.saveVersion}` : 'The folder that contains SaveFile_Live.es3'}
            </div>
          </div>
          <button className="button" onClick={run('core:chooseDir', 'save')} disabled={busy}>
            Change…
          </button>
        </div>
        <button className="link" onClick={run('core:resetDirs')} disabled={busy}>
          Reset both to automatic detection
        </button>
      </section>

      <section className="card">
        <h3>About</h3>
        <p>
          TBH Toolkit {info.data ? `v${info.data.version}` : ''} is an unofficial, open-source fan project. It is not affiliated with or endorsed by the
          developers of TBH: Task Bar Hero.
        </p>
        <ul className="plain">
          <li>
            <b>Read-only.</b> It reads your save file and the game’s data files. It never writes to them, never touches the running game’s memory,
            and never automates gameplay.
          </li>
          <li>
            <b>Local.</b> Nothing is uploaded. Share codes only leave your PC when you paste them somewhere yourself.
          </li>
          <li>
            <b>No game data in the app.</b> Item names and stats are read from your own install each time the app starts.
          </li>
        </ul>
        <button className="link" onClick={run('core:openExternal', REPO_URL)}>
          Source code, issues and roadmap on GitHub
        </button>
      </section>
    </div>
  );
}
