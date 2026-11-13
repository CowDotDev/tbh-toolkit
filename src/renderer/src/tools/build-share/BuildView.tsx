import { useState } from 'react';
import type { ResolvedBuild, ResolvedGear, ResolvedHero, StatLine } from '@shared/types';
import { titleCase } from '../../app/format';

export function gradeClass(grade: string): string {
  return `grade grade-${grade.toLowerCase() || 'none'}`;
}

export function GearCard({ gear, part }: { gear: ResolvedGear | null; part?: string }) {
  if (!gear) {
    return (
      <div className="gear-card empty">
        <div className="gear-part">{part ? titleCase(part) : 'Empty'}</div>
        <div className="muted">Nothing equipped</div>
      </div>
    );
  }
  return (
    <div className="gear-card">
      <div className="gear-head">
        <div>
          <div className="gear-part">{titleCase(gear.part)}</div>
          <div className={gradeClass(gear.grade)}>{gear.name}</div>
        </div>
        <div className="gear-meta">
          {gear.chaotic && <span className="tag chaotic">Chaotic</span>}
          <span className="tag">{titleCase(gear.grade)}</span>
          {gear.level > 0 && <span className="tag">Lv {gear.level}</span>}
        </div>
      </div>
      {gear.base.length > 0 && <StatList lines={gear.base} className="base" />}
      {gear.inherent.length > 0 && <StatList lines={gear.inherent} />}
      {gear.unique && <div className="unique">{gear.unique}</div>}
      {gear.enchants.length > 0 && (
        <ul className="stat-list enchants">
          {gear.enchants.map((e, i) => (
            <li key={i} title={[e.material, e.min !== undefined ? `Tier ${e.tier} rolls ${e.min}–${e.max} (raw)` : `Tier ${e.tier}`].filter(Boolean).join(' · ')}>
              <span className={`ench ench-${e.kind.toLowerCase()}`}>{e.kind[0]}</span>
              {e.text}
              <span className="tier">T{e.tier}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatList({ lines, className = '' }: { lines: StatLine[]; className?: string }) {
  return (
    <ul className={`stat-list ${className}`}>
      {lines.map((l, i) => (
        <li key={i}>{l.text}</li>
      ))}
    </ul>
  );
}

export function HeroTabs({ heroes, active, onSelect }: { heroes: ResolvedHero[]; active: number; onSelect: (key: number) => void }) {
  return (
    <div className="hero-tabs">
      {heroes.map((h) => (
        <button key={h.key} className={h.key === active ? 'hero-tab active' : 'hero-tab'} onClick={() => onSelect(h.key)}>
          <span className="hero-name">
            {h.inParty && (
              <span className="party-star" title="In the active party">
                ★
              </span>
            )}
            {h.name}
          </span>
          <span className="muted small">Lv {h.level}</span>
        </button>
      ))}
    </div>
  );
}

export function HeroPanel({ hero }: { hero: ResolvedHero }) {
  const equipped = hero.gear.filter(Boolean).length;
  return (
    <div className="hero-panel">
      <section>
        <h3>
          Equipment <span className="muted small">{equipped} equipped</span>
        </h3>
        <div className="gear-grid">
          {hero.gear.map((g, i) => (g ? <GearCard key={i} gear={g} /> : null))}
          {equipped === 0 && <div className="muted">No gear equipped.</div>}
        </div>
      </section>
      <aside className="hero-side">
        <section>
          <h3>Skills</h3>
          <div className="chips">
            {hero.skills.map((s) => (
              <span key={s.key} className="chip">
                {s.name}
              </span>
            ))}
          </div>
        </section>
        <section>
          <h3>
            Gear stat totals <span className="muted small">base + inherent + enchants</span>
          </h3>
          {hero.totals.length ? (
            <ul className="totals">
              {hero.totals.map((t) => (
                <li key={`${t.stat}|${t.mod}`}>{t.text}</li>
              ))}
            </ul>
          ) : (
            <div className="muted">No gear stats.</div>
          )}
        </section>
        <section>
          <h3>
            Attributes <span className="muted small">{hero.pointsSpent} points spent</span>
          </h3>
          {hero.attributeGroups.map((g) => (
            <div key={g.key} className="attr-group">
              {g.requiredPoints > 0 && <div className="attr-req muted small">Unlocks at {g.requiredPoints} points</div>}
              {g.nodes.map((n) => (
                <div key={n.key} className={n.level > 0 ? 'attr' : 'attr off'} title={n.effect}>
                  <span className={n.type === 'ACTIVESKILL' ? 'attr-name skill' : 'attr-name'}>{n.name}</span>
                  <span className="attr-level">
                    {n.level}/{n.max}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}

export function AccountPanel({ build }: { build: ResolvedBuild }) {
  const [showRunes, setShowRunes] = useState(false);
  const runePoints = build.runes.reduce((sum, r) => sum + r.level, 0);
  return (
    <div className="account-panel">
      <section>
        <h3>Relics</h3>
        {!build.hasRelics && <div className="muted">Not included in this build.</div>}
        {build.hasRelics && build.relics.length === 0 && <div className="muted">No reliquary equipped.</div>}
        {build.relics.map((r, i) => (
          <div key={i} className="reliquary">
            <div className={gradeClass(r.grade)}>{r.name}</div>
            <ul className="stat-list">
              {r.stats.map((s, j) => (
                <li key={j}>{s.text}</li>
              ))}
              {r.resonance.map((text, j) => (
                <li key={`r${j}`} className="resonance">
                  {text}
                </li>
              ))}
            </ul>
            <ul className="relic-list">
              {r.relics.map((relic, j) => (
                <li key={j}>
                  {relic ? (
                    <>
                      <span className={`relic-dot relic-${relic.color.toLowerCase()}`} />
                      <span className={gradeClass(relic.grade)}>{relic.name}</span>
                      <span className="muted"> {relic.stat?.text}</span>
                    </>
                  ) : (
                    <span className="muted">Empty slot</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section>
        <h3>Pet</h3>
        {build.pet ? (
          <div>
            <div>{build.pet.name}</div>
            <ul className="stat-list">
              {build.pet.stats.map((s, i) => (
                <li key={i}>{s.text}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="muted">None / not included.</div>
        )}
        <h3 className="spaced">Runes</h3>
        {build.hasRunes ? (
          <>
            <div>
              {build.runes.length} runes learned · {runePoints} levels{' '}
              <button className="link" onClick={() => setShowRunes((v) => !v)}>
                {showRunes ? 'hide' : 'show all'}
              </button>
            </div>
            {showRunes && (
              <ul className="rune-list">
                {build.runes.map((r) => (
                  <li key={r.key} title={r.effect}>
                    <span>{r.name}</span>
                    <span className="muted small">{r.effect}</span>
                    <span className="attr-level">
                      {r.level}/{r.max}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="muted">Not included in this build.</div>
        )}
      </section>
    </div>
  );
}

export function BuildView({ build }: { build: ResolvedBuild }) {
  const [heroKey, setHeroKey] = useState(build.heroes[0]?.key ?? 0);
  const hero = build.heroes.find((h) => h.key === heroKey) ?? build.heroes[0];
  if (!hero) return <div className="muted">This build has no heroes.</div>;
  return (
    <div>
      <HeroTabs heroes={build.heroes} active={hero.key} onSelect={setHeroKey} />
      <HeroPanel hero={hero} />
      <AccountPanel build={build} />
    </div>
  );
}
