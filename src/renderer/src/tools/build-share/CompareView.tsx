import { useMemo, useState } from 'react';
import { formatNumber, PART_ORDER } from '@shared/build-model';
import { diffAttributes, diffRunes, diffStats, type StatDiffRow } from '@shared/diff';
import type { LibraryEntry } from '@shared/tool-types';
import type { ResolvedBuild, ResolvedGear, ResolvedHero } from '@shared/types';
import { useQuery } from '../../app/ipc';
import { GearCard } from './BuildView';

interface Props {
  mine: ResolvedBuild | null;
  entries: LibraryEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function CompareView({ mine, entries, selectedId, onSelect }: Props) {
  const id = selectedId && entries.some((e) => e.id === selectedId) ? selectedId : (entries[0]?.id ?? null);
  if (!mine) return <div className="muted">Your build is not loaded yet, so there is nothing to compare against.</div>;
  if (!id) return <div className="muted">Import a friend’s build under “Friends’ Builds” first, then compare it here.</div>;
  return (
    <div>
      <div className="row">
        <label className="field-label" htmlFor="compare-build">
          Compare my build with
        </label>
        <select id="compare-build" className="input select" value={id} onChange={(e) => onSelect(e.target.value)}>
          {entries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label} (v{e.game})
            </option>
          ))}
        </select>
      </div>
      <Comparison key={id} mine={mine} id={id} />
    </div>
  );
}

function Comparison({ mine, id }: { mine: ResolvedBuild; id: string }) {
  const theirs = useQuery<ResolvedBuild>('build-share:get', [id], ['core:status']);
  const [heroKey, setHeroKey] = useState<number | null>(null);

  const heroKeys = useMemo(() => {
    const keys: number[] = [];
    for (const h of [...(theirs.data?.heroes ?? []), ...mine.heroes]) if (!keys.includes(h.key)) keys.push(h.key);
    return keys;
  }, [theirs.data, mine]);

  if (theirs.error) return <div className="banner error">{theirs.error}</div>;
  if (!theirs.data) return <div className="muted">Loading…</div>;
  const other = theirs.data;

  const active = heroKey !== null && heroKeys.includes(heroKey) ? heroKey : heroKeys[0];
  const a = mine.heroes.find((h) => h.key === active);
  const b = other.heroes.find((h) => h.key === active);
  const nameOf = (key: number): string => (mine.heroes.find((h) => h.key === key) ?? other.heroes.find((h) => h.key === key))?.name ?? `Hero ${key}`;

  return (
    <div>
      {other.game !== mine.game && (
        <div className="banner">
          This build was captured on game v{other.game} and you are on v{mine.game}. Item and stat data can differ between versions.
        </div>
      )}
      <div className="hero-tabs">
        {heroKeys.map((key) => {
          const both = mine.heroes.some((h) => h.key === key) && other.heroes.some((h) => h.key === key);
          return (
            <button key={key} className={key === active ? 'hero-tab active' : 'hero-tab'} onClick={() => setHeroKey(key)}>
              <span className="hero-name">{nameOf(key)}</span>
              <span className="muted small">{both ? 'both' : mine.heroes.some((h) => h.key === key) ? 'only you' : 'only them'}</span>
            </button>
          );
        })}
      </div>

      <div className="compare-head">
        <SideTitle label="You" hero={a} />
        <SideTitle label={other.label || 'Them'} hero={b} />
      </div>

      <h3>Gear stat totals</h3>
      <StatDiffTable rows={diffStats(a?.totals ?? [], b?.totals ?? [])} theirLabel={other.label || 'Them'} />

      <h3>Equipment</h3>
      <GearCompare a={a} b={b} />

      <h3>Skills & attributes</h3>
      <SkillsAndAttributes a={a} b={b} theirLabel={other.label || 'Them'} />

      <h3>Runes</h3>
      <RuneDiff mine={mine} other={other} />
    </div>
  );
}

function SideTitle({ label, hero }: { label: string; hero: ResolvedHero | undefined }) {
  return (
    <div className="side-title">
      <span className="side-label">{label}</span>
      {hero ? (
        <span>
          {hero.name} · Lv {hero.level}
        </span>
      ) : (
        <span className="muted">does not have this hero in the build</span>
      )}
    </div>
  );
}

function StatDiffTable({ rows, theirLabel }: { rows: StatDiffRow[]; theirLabel: string }) {
  const [onlyDifferent, setOnlyDifferent] = useState(false);
  const shown = onlyDifferent ? rows.filter((r) => r.delta !== 0) : rows;
  if (rows.length === 0) return <div className="muted">Neither build has gear stats for this hero.</div>;
  return (
    <>
      <label className="check small">
        <input type="checkbox" checked={onlyDifferent} onChange={(e) => setOnlyDifferent(e.target.checked)} /> Only show differences
      </label>
      <table className="diff-table">
        <thead>
          <tr>
            <th>Stat</th>
            <th>You</th>
            <th>{theirLabel}</th>
            <th title="Their total minus yours, in the game's raw units">Difference</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.key}>
              <td>
                {r.label} {r.mod !== 'FLAT' && <span className="muted small">({r.mod === 'ADDITIVE' ? 'increased' : r.mod.toLowerCase()})</span>}
              </td>
              <td>{r.a?.text ?? <span className="muted">—</span>}</td>
              <td>{r.b?.text ?? <span className="muted">—</span>}</td>
              <td className={r.delta > 0 ? 'delta behind' : r.delta < 0 ? 'delta ahead' : 'delta'}>
                {r.delta === 0 ? 'same' : r.delta > 0 ? `they have +${formatNumber(r.delta)}` : `you have +${formatNumber(-r.delta)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Differences are in the game’s raw units (percentage stats are stored in tenths of a percent).</p>
    </>
  );
}

function byPart(hero: ResolvedHero | undefined): Map<string, ResolvedGear> {
  const map = new Map<string, ResolvedGear>();
  for (const g of hero?.gear ?? []) if (g) map.set(g.part, g);
  return map;
}

function GearCompare({ a, b }: { a: ResolvedHero | undefined; b: ResolvedHero | undefined }) {
  const mine = byPart(a);
  const theirs = byPart(b);
  const parts = [...PART_ORDER, ...[...mine.keys(), ...theirs.keys()].filter((p) => !PART_ORDER.includes(p))];
  const seen = new Set<string>();
  const rows = parts.filter((p) => !seen.has(p) && seen.add(p) && (mine.has(p) || theirs.has(p)));
  if (rows.length === 0) return <div className="muted">No gear on either side.</div>;
  return (
    <div className="gear-compare">
      {rows.map((part) => (
        <div key={part} className="gear-compare-row">
          <GearCard gear={mine.get(part) ?? null} part={part} />
          <GearCard gear={theirs.get(part) ?? null} part={part} />
        </div>
      ))}
    </div>
  );
}

function SkillsAndAttributes({ a, b, theirLabel }: { a: ResolvedHero | undefined; b: ResolvedHero | undefined; theirLabel: string }) {
  const rows = diffAttributes(a, b);
  return (
    <>
      <div className="compare-head">
        <div className="chips">{a?.skills.map((s) => <span key={s.key} className="chip">{s.name}</span>)}</div>
        <div className="chips">{b?.skills.map((s) => <span key={s.key} className="chip">{s.name}</span>)}</div>
      </div>
      {rows.length === 0 ? (
        <div className="muted">No attribute points spent on either side.</div>
      ) : (
        <table className="diff-table">
          <thead>
            <tr>
              <th>Attribute</th>
              <th>You</th>
              <th>{theirLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.a === r.b ? 'same-row' : ''}>
                <td>{r.name}</td>
                <td className={r.a > r.b ? 'delta ahead' : ''}>
                  {r.a}/{r.max}
                </td>
                <td className={r.b > r.a ? 'delta behind' : ''}>
                  {r.b}/{r.max}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function RuneDiff({ mine, other }: { mine: ResolvedBuild; other: ResolvedBuild }) {
  if (!other.hasRunes) return <div className="muted">Runes were not included in their build.</div>;
  const rows = diffRunes(mine.runes, other.runes);
  if (rows.length === 0) return <div className="muted">Identical rune levels.</div>;
  return (
    <table className="diff-table">
      <thead>
        <tr>
          <th>Rune</th>
          <th>You</th>
          <th>{other.label || 'Them'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>
              {r.name} <span className="muted small">#{r.key}</span>
            </td>
            <td className={r.a > r.b ? 'delta ahead' : ''}>
              {r.a}/{r.max}
            </td>
            <td className={r.b > r.a ? 'delta behind' : ''}>
              {r.b}/{r.max}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

