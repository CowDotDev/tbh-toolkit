/** Pure XP / gold rate math for the Live Rates tool. */

export interface RateSample {
  /** ms since epoch (save file modification time) */
  t: number;
  gold: number;
  heroes: Record<number, { level: number; exp: number }>;
}

export interface HeroRateResult {
  key: number;
  level: number;
  exp: number;
  gained: number;
  xpPerHour: number;
  toNextLevel?: number;
  etaSeconds?: number;
}

export interface RateResult {
  durationMs: number;
  gold: number;
  goldEarned: number;
  goldPerHour: number;
  xpPerHour: number;
  heroes: HeroRateResult[];
}

const HOUR = 3_600_000;

/**
 * @param samples chronological save samples for the current session
 * @param expForLevelUp index = level, value = exp needed to go from that level to the next
 * @param windowMs rates use the trailing window so they react to what you are farming right now
 */
export function computeRates(samples: RateSample[], expForLevelUp: number[], windowMs = 20 * 60_000): RateResult {
  const last = samples[samples.length - 1];
  const first = samples[0];
  if (!last || !first) return { durationMs: 0, gold: 0, goldEarned: 0, goldPerHour: 0, xpPerHour: 0, heroes: [] };

  const windowStartIndex = Math.max(
    0,
    samples.findIndex((s) => s.t >= last.t - windowMs),
  );
  const windowFirst = samples[Math.min(windowStartIndex, samples.length - 1)];
  const windowDuration = last.t - windowFirst.t;

  // Spending gold should not count as negative income: only add up increases.
  const earned = (from: number): number => {
    let total = 0;
    for (let i = Math.max(1, from + 1); i < samples.length; i++) {
      const delta = samples[i].gold - samples[i - 1].gold;
      if (delta > 0) total += delta;
    }
    return total;
  };

  // Cumulative exp needed to reach each level, when the table is available.
  const cumulative: number[] = [0, 0];
  for (let level = 1; level < expForLevelUp.length; level++) cumulative[level + 1] = cumulative[level] + (expForLevelUp[level] || 0);
  const maxLevel = expForLevelUp.length - 1;

  const heroes: HeroRateResult[] = [];
  let totalRate = 0;
  for (const [id, now] of Object.entries(last.heroes)) {
    const key = Number(id);
    const start = first.heroes[key] ?? now;
    const windowStart = windowFirst.heroes[key] ?? now;
    const gained = Math.max(0, now.exp - start.exp);
    const xpPerHour = windowDuration > 0 ? (Math.max(0, now.exp - windowStart.exp) / windowDuration) * HOUR : 0;
    totalRate += xpPerHour;

    const hero: HeroRateResult = { key, level: now.level, exp: now.exp, gained, xpPerHour };
    if (now.level >= 1 && now.level <= maxLevel) {
      // The save stores total exp; fall back to per-level exp if the numbers say otherwise.
      const isCumulative = now.exp >= cumulative[now.level];
      const remaining = isCumulative ? cumulative[now.level + 1] - now.exp : expForLevelUp[now.level] - now.exp;
      if (remaining > 0) {
        hero.toNextLevel = remaining;
        if (xpPerHour > 0) hero.etaSeconds = (remaining / xpPerHour) * 3600;
      }
    }
    heroes.push(hero);
  }
  heroes.sort((a, b) => b.xpPerHour - a.xpPerHour || a.key - b.key);

  return {
    durationMs: last.t - first.t,
    gold: last.gold,
    goldEarned: earned(0),
    goldPerHour: windowDuration > 0 ? (earned(windowStartIndex) / windowDuration) * HOUR : 0,
    xpPerHour: totalRate,
    heroes,
  };
}
