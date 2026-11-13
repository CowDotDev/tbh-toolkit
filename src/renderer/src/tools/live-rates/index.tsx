import { useEffect, useState } from 'react';
import type { RatesState } from '@shared/tool-types';
import { compact, dateTime, duration } from '../../app/format';
import { call, useEvent, useQuery } from '../../app/ipc';
import type { ToolProps } from '../registry';

export function LiveRates({ status }: ToolProps) {
  const query = useQuery<RatesState>('live-rates:state');
  const [live, setLive] = useState<RatesState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  useEvent('live-rates:update', (payload) => setLive(payload as RatesState));
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const state = live ?? query.data;
  const act = (channel: string) => async (): Promise<void> => {
    try {
      setLive(await call<RatesState>(channel));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const warmingUp = !state || state.samples < 2;
  const stale = state?.lastSampleAt ? now - state.lastSampleAt > 10 * 60_000 : false;

  return (
    <div className="tool">
      <header className="tool-header">
        <div>
          <h1>Live Rates</h1>
          <p className="muted">XP and gold per hour for your active party, measured from the game’s own autosaves.</p>
        </div>
        <button className="button" onClick={act('live-rates:reset')}>
          Start new session
        </button>
      </header>

      {error && <div className="banner error">{error}</div>}
      {!status?.saveTime && <div className="banner">No save loaded yet. Check the save folder in Settings.</div>}
      {status?.saveTime && warmingUp && (
        <div className="banner">
          Waiting for the game’s next autosave to measure a rate. Keep the game running — the first numbers appear after two saves (usually a
          few minutes).
        </div>
      )}
      {stale && !warmingUp && <div className="banner">No new autosave for {duration((now - state!.lastSampleAt!) / 1000)} — is the game still running?</div>}

      <div className="stat-cards">
        <Card label="Gold / hour" value={warmingUp ? '—' : compact(state!.goldPerHour)} hint="spending is ignored" />
        <Card label="Party XP / hour" value={warmingUp ? '—' : compact(state!.xpPerHour)} />
        <Card label="Gold earned" value={state ? compact(state.goldEarned) : '—'} hint={state ? `${compact(state.gold)} on hand` : undefined} />
        <Card
          label="Session"
          value={state?.startedAt && state.lastSampleAt ? duration((state.lastSampleAt - state.startedAt) / 1000) : '—'}
          hint={state ? `${state.samples} saves seen` : undefined}
        />
      </div>

      <section className="card">
        <h3>Heroes</h3>
        {state?.heroes.length ? (
          <table className="diff-table">
            <thead>
              <tr>
                <th>Hero</th>
                <th>Level</th>
                <th>XP / hour</th>
                <th>XP this session</th>
                <th>To next level</th>
                <th>Time to level</th>
              </tr>
            </thead>
            <tbody>
              {state.heroes.map((h) => (
                <tr key={h.key}>
                  <td>{h.name}</td>
                  <td>{h.level}</td>
                  <td>{warmingUp ? '—' : compact(h.xpPerHour)}</td>
                  <td>{compact(h.gained)}</td>
                  <td>{h.toNextLevel !== undefined ? compact(h.toNextLevel) : <span className="muted">max level</span>}</td>
                  <td>{h.etaSeconds !== undefined ? duration(h.etaSeconds) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No party heroes found in the save yet.</p>
        )}
        <p className="muted small">Rates use the last 20 minutes of saves, so they follow what you are farming right now.</p>
      </section>

      <section className="card">
        <div className="row spread">
          <h3 className="flush">Past sessions</h3>
          {state?.history.length ? (
            <button className="link" onClick={act('live-rates:clearHistory')}>
              Clear history
            </button>
          ) : null}
        </div>
        {state?.history.length ? (
          <table className="diff-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Length</th>
                <th>Gold earned</th>
                <th>Gold / hour</th>
                <th>XP gained</th>
                <th>XP / hour</th>
              </tr>
            </thead>
            <tbody>
              {state.history.map((s) => {
                const hours = Math.max(1, s.endedAt - s.startedAt) / 3_600_000;
                return (
                  <tr key={s.startedAt}>
                    <td>{dateTime(s.startedAt)}</td>
                    <td>{duration((s.endedAt - s.startedAt) / 1000)}</td>
                    <td>{compact(s.goldEarned)}</td>
                    <td>{compact(s.goldEarned / hours)}</td>
                    <td>{compact(s.xpGained)}</td>
                    <td>{compact(s.xpGained / hours)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">Finished sessions show up here. A session ends when you start a new one, close the app, or the game stops saving for 30 minutes.</p>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}
