import { useEffect, useState } from 'react';
import type { AppStatus } from '@shared/types';
import { tools } from '../tools/registry';
import { ago } from './format';
import { useEvent, useQuery } from './ipc';

const LAST_TOOL_KEY = 'tbh:lastTool';

function readLastTool(): string {
  try {
    const id = localStorage.getItem(LAST_TOOL_KEY);
    if (id && tools.some((t) => t.id === id)) return id;
  } catch {
    // storage unavailable: use the default
  }
  return tools[0].id;
}

export function App() {
  const [active, setActive] = useState(readLastTool);
  const status = useQuery<AppStatus>('core:status', [], ['core:status', 'core:save']);
  const tool = tools.find((t) => t.id === active) ?? tools[0];
  const Tool = tool.component;

  const select = (id: string): void => {
    setActive(id);
    try {
      localStorage.setItem(LAST_TOOL_KEY, id);
    } catch {
      // not persisted; fine
    }
  };

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          <span className="brand-mark">TBH</span>
          <span>Toolkit</span>
        </div>
        <ul className="nav">
          {tools.map((t) => (
            <li key={t.id}>
              <button className={t.id === tool.id ? 'nav-item active' : 'nav-item'} onClick={() => select(t.id)} title={t.description}>
                <span className="nav-icon" aria-hidden="true">
                  {t.icon}
                </span>
                {t.title}
              </button>
            </li>
          ))}
        </ul>
        <StatusFooter status={status.data} onOpenSettings={() => select('settings')} />
      </nav>
      <main className="content">
        <Tool key={tool.id} status={status.data} />
      </main>
    </div>
  );
}

function StatusFooter({ status, onOpenSettings }: { status: AppStatus | undefined; onOpenSettings: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEvent('core:save', () => {
    setPulse(true);
    setTimeout(() => setPulse(false), 1500);
  });

  if (!status) return <div className="status-footer muted">Starting…</div>;
  const hasErrors = status.errors.length > 0;
  return (
    <div className="status-footer">
      <div className="status-line">
        <span className={`dot ${status.gameVersion ? 'ok' : 'bad'}`} />
        {status.gameVersion ? `Game v${status.gameVersion}` : 'Game not found'}
      </div>
      <div className="status-line">
        <span className={`dot ${status.saveTime ? (pulse ? 'pulse' : 'ok') : 'bad'}`} />
        {status.saveTime ? `Saved ${ago(status.saveTime, now)}` : 'No save loaded'}
      </div>
      {hasErrors && (
        <button className="link warn" onClick={onOpenSettings}>
          {status.errors.length} problem{status.errors.length > 1 ? 's' : ''} — open Settings
        </button>
      )}
      <div className="muted small">Read-only · nothing leaves your PC</div>
    </div>
  );
}
