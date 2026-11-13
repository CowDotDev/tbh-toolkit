import crypto from 'node:crypto';
import { resolveBuild, snapshotFromSave } from '@shared/build-model';
import { decodeShareCode, encodeShareCode } from '@shared/share-code';
import type { ExportOptions, LibraryEntry } from '@shared/tool-types';
import type { BuildSnapshot, ResolvedBuild } from '@shared/types';
import type { MainTool, ToolContext } from './types';

interface StoredBuild {
  id: string;
  addedAt: number;
  build: BuildSnapshot;
}

const MAX_LIBRARY = 200;

function parseExportOptions(raw: unknown): ExportOptions {
  const o = (raw ?? {}) as Partial<ExportOptions>;
  return {
    heroKeys: Array.isArray(o.heroKeys) ? o.heroKeys.filter((k): k is number => Number.isInteger(k)) : [],
    runes: o.runes !== false,
    pet: o.pet !== false,
    relics: o.relics !== false,
    label: typeof o.label === 'string' ? o.label.trim().slice(0, 80) : '',
  };
}

export const buildShareTool: MainTool = {
  id: 'build-share',

  register(ctx: ToolContext) {
    const library = ctx.store<StoredBuild[]>('library', []);

    const requireGame = () => {
      if (!ctx.core.game) throw new Error('Game data is not loaded yet. Check the game folder in Settings.');
      return ctx.core.game;
    };
    const requireSave = () => {
      if (!ctx.core.snapshot) throw new Error('No save has been read yet. Check the save folder in Settings.');
      return ctx.core.snapshot.save;
    };
    const entry = (stored: StoredBuild): LibraryEntry => {
      const game = ctx.core.game;
      return {
        id: stored.id,
        addedAt: stored.addedAt,
        label: stored.build.label || 'Unnamed build',
        game: stored.build.game,
        at: stored.build.at,
        heroes: stored.build.heroes.map((h) => ({
          key: h.k,
          level: h.l,
          name: game ? game.t(game.find('HeroInfoData', 'HeroKey', h.k)?.HeroNameKey ?? '', `Hero ${h.k}`) : `Hero ${h.k}`,
        })),
      };
    };

    /** Your current build, resolved for display. Null until both game data and a save exist. */
    ctx.handle('mine', (): ResolvedBuild | null => {
      const game = ctx.core.game;
      const snapshot = ctx.core.snapshot;
      if (!game || !snapshot) return null;
      return resolveBuild(snapshotFromSave(snapshot.save, game, { label: 'My build', at: Math.floor(snapshot.mtimeMs / 1000) }), game);
    });

    ctx.handle('export', (raw): { code: string } => {
      const opts = parseExportOptions(raw);
      if (opts.heroKeys.length === 0) throw new Error('Pick at least one hero to share.');
      const build = snapshotFromSave(requireSave(), requireGame(), opts);
      if (build.heroes.length === 0) throw new Error('None of the selected heroes are unlocked in your save.');
      return { code: encodeShareCode(build) };
    });

    ctx.handle('import', (code, label): LibraryEntry => {
      if (typeof code !== 'string') throw new Error('Paste a share code first.');
      const build = decodeShareCode(code);
      if (typeof label === 'string' && label.trim()) build.label = label.trim().slice(0, 80);
      const stored: StoredBuild = { id: crypto.randomUUID(), addedAt: Date.now(), build };
      library.update((list) => [stored, ...list].slice(0, MAX_LIBRARY));
      return entry(stored);
    });

    ctx.handle('library', (): LibraryEntry[] => library.get().map(entry));

    ctx.handle('get', (id): ResolvedBuild => {
      const stored = library.get().find((b) => b.id === id);
      if (!stored) throw new Error('That build is no longer in your library.');
      return resolveBuild(stored.build, requireGame());
    });

    ctx.handle('code', (id): { code: string } => {
      const stored = library.get().find((b) => b.id === id);
      if (!stored) throw new Error('That build is no longer in your library.');
      return { code: encodeShareCode(stored.build) };
    });

    ctx.handle('rename', (id, label): LibraryEntry[] => {
      if (typeof label !== 'string') throw new Error('Invalid name.');
      library.update((list) =>
        list.map((b) => (b.id === id ? { ...b, build: { ...b.build, label: label.trim().slice(0, 80) } } : b)),
      );
      return library.get().map(entry);
    });

    ctx.handle('remove', (id): LibraryEntry[] => {
      library.update((list) => list.filter((b) => b.id !== id));
      return library.get().map(entry);
    });
  },
};
