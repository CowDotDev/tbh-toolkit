import { computeRates, type RateSample } from '@shared/rates';
import type { RatesState, SessionSummary } from '@shared/tool-types';
import type { SaveSnapshot } from '@shared/types';
import type { MainTool, ToolContext } from './types';

const GOLD_KEY = 100001;
const MAX_SAMPLES = 2000;
const MAX_HISTORY = 50;
/** A gap this long between saves means the game was closed: start a new session. */
const SESSION_GAP_MS = 30 * 60_000;

let endSession: (() => void) | null = null;

export const liveRatesTool: MainTool = {
  id: 'live-rates',

  register(ctx: ToolContext) {
    const history = ctx.store<SessionSummary[]>('history', []);
    let samples: RateSample[] = [];

    const expTable = (): number[] => {
      const table: number[] = [];
      for (const row of ctx.core.game?.rows('LevelInfoData') ?? []) table[Number(row.Level)] = Number(row.ExpForLevelUp) || 0;
      return table;
    };

    const state = (): RatesState => {
      const game = ctx.core.game;
      const rates = computeRates(samples, expTable());
      return {
        startedAt: samples[0]?.t ?? null,
        lastSampleAt: samples[samples.length - 1]?.t ?? null,
        samples: samples.length,
        gold: rates.gold,
        goldEarned: rates.goldEarned,
        goldPerHour: rates.goldPerHour,
        xpPerHour: rates.xpPerHour,
        heroes: rates.heroes.map((h) => ({
          ...h,
          name: game ? game.t(game.find('HeroInfoData', 'HeroKey', h.key)?.HeroNameKey ?? '', `Hero ${h.key}`) : `Hero ${h.key}`,
        })),
        history: history.get(),
      };
    };

    const archive = (): void => {
      if (samples.length < 2) return;
      const rates = computeRates(samples, []);
      const summary: SessionSummary = {
        startedAt: samples[0].t,
        endedAt: samples[samples.length - 1].t,
        goldEarned: rates.goldEarned,
        xpGained: rates.heroes.reduce((sum, h) => sum + h.gained, 0),
      };
      if (summary.goldEarned > 0 || summary.xpGained > 0) {
        history.update((list) => [summary, ...list].slice(0, MAX_HISTORY));
      }
    };
    endSession = archive;

    const record = (snapshot: SaveSnapshot): void => {
      const last = samples[samples.length - 1];
      if (last && snapshot.mtimeMs <= last.t) return;
      if (last && snapshot.mtimeMs - last.t > SESSION_GAP_MS) {
        archive();
        samples = [];
      }
      const party = new Set(snapshot.save.commonSaveData.arrangedHeroKey ?? []);
      const heroes: RateSample['heroes'] = {};
      for (const h of snapshot.save.heroSaveDatas) {
        if (h.IsUnLock && (party.size === 0 || party.has(h.heroKey))) heroes[h.heroKey] = { level: h.HeroLevel, exp: h.HeroExp };
      }
      samples.push({
        t: snapshot.mtimeMs,
        gold: snapshot.save.currenySaveDatas?.find((c) => c.Key === GOLD_KEY)?.Quantity ?? 0,
        heroes,
      });
      if (samples.length > MAX_SAMPLES) samples.splice(1, samples.length - MAX_SAMPLES);
      ctx.emit('update', state());
    };

    ctx.core.on('save', record);
    if (ctx.core.snapshot) record(ctx.core.snapshot);

    ctx.handle('state', state);
    ctx.handle('reset', (): RatesState => {
      archive();
      samples = [];
      if (ctx.core.snapshot) record(ctx.core.snapshot);
      return state();
    });
    ctx.handle('clearHistory', (): RatesState => {
      history.set([]);
      return state();
    });
  },

  dispose() {
    endSession?.();
  },
};
