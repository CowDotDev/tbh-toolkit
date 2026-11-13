import { useEffect, useState } from 'react';
import type { ExportOptions } from '@shared/tool-types';
import type { ResolvedBuild } from '@shared/types';
import { call } from '../../app/ipc';

export function SharePanel({ mine }: { mine: ResolvedBuild | null }) {
  const [selected, setSelected] = useState<number[] | null>(null);
  const [runes, setRunes] = useState(true);
  const [pet, setPet] = useState(true);
  const [relics, setRelics] = useState(true);
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Default selection: the active party (or everyone if no party is set).
  const heroes = mine?.heroes ?? [];
  const defaults = heroes.some((h) => h.inParty) ? heroes.filter((h) => h.inParty).map((h) => h.key) : heroes.map((h) => h.key);
  const heroKeys = selected ?? defaults;

  // Any change to the options invalidates the code on screen.
  useEffect(() => {
    setCode('');
    setCopied(false);
  }, [selected, runes, pet, relics, label]);

  if (!mine) return <div className="muted">Your build is not loaded yet, so there is nothing to share.</div>;

  const toggle = (key: number): void => {
    setSelected(heroKeys.includes(key) ? heroKeys.filter((k) => k !== key) : [...heroKeys, key]);
  };

  const generate = async (): Promise<void> => {
    setError(null);
    setCopied(false);
    try {
      const options: ExportOptions = { heroKeys, runes, pet, relics, label };
      const result = await call<{ code: string }>('build-share:export', options);
      setCode(result.code);
    } catch (err) {
      setCode('');
      setError((err as Error).message);
    }
  };

  const copy = async (): Promise<void> => {
    try {
      await call('core:copyText', code);
      setCopied(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="panel-grid">
      <section className="card">
        <h3>What to share</h3>
        <div className="field">
          <label className="field-label">Heroes</label>
          <div className="check-list">
            {heroes.map((h) => (
              <label key={h.key} className="check">
                <input type="checkbox" checked={heroKeys.includes(h.key)} onChange={() => toggle(h.key)} />
                {h.name} <span className="muted small">Lv {h.level}{h.inParty ? ' · in party' : ''}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label">Account-wide</label>
          <div className="check-list">
            <label className="check">
              <input type="checkbox" checked={relics} onChange={(e) => setRelics(e.target.checked)} /> Relics
            </label>
            <label className="check">
              <input type="checkbox" checked={runes} onChange={(e) => setRunes(e.target.checked)} /> Runes
            </label>
            <label className="check">
              <input type="checkbox" checked={pet} onChange={(e) => setPet(e.target.checked)} /> Pet
            </label>
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="share-label">
            Name shown to your friend (optional)
          </label>
          <input id="share-label" className="input" maxLength={80} value={label} placeholder="e.g. Cow’s lightning party" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <button className="button primary" onClick={generate} disabled={heroKeys.length === 0}>
          Generate share code
        </button>
        {error && <div className="banner error">{error}</div>}
      </section>

      <section className="card">
        <h3>Share code</h3>
        {code ? (
          <>
            <textarea className="code-box" readOnly value={code} onFocus={(e) => e.target.select()} />
            <div className="row">
              <button className="button primary" onClick={copy}>
                {copied ? 'Copied ✓' : 'Copy to clipboard'}
              </button>
              <span className="muted small">{code.length.toLocaleString()} characters</span>
            </div>
            <p className="muted small">
              Send this to a friend. They paste it under <b>Friends’ Builds</b> in their own TBH Toolkit. The code contains only item,
              enchant, attribute, rune and relic data — no account, Steam or inventory identifiers.
            </p>
          </>
        ) : (
          <p className="muted">Choose what to include, then generate a code. It reflects your most recent autosave.</p>
        )}
      </section>
    </div>
  );
}
