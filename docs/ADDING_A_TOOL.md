# Adding a tool

A tool has up to two halves that share an **id** (lowercase letters, digits and dashes):

| Half | Lives in | Runs in | Needed when |
| --- | --- | --- | --- |
| UI | `src/renderer/src/tools/<id>/index.tsx` | the sandboxed renderer | always |
| Main module | `src/main/tools/<id>.ts` | the Electron main process | the tool needs the save, game tables, files or persistence |

The UI can only talk to the main process through `window.tbh` (see `src/preload/api.ts`), wrapped by the helpers
in `src/renderer/src/app/ipc.ts`.

## Example: a "Rune Summary" tool

### 1. Main module — `src/main/tools/rune-summary.ts`

```ts
import type { MainTool } from './types';

export interface RuneSummary {
  learned: number;
  levels: number;
}

export const runeSummaryTool: MainTool = {
  id: 'rune-summary',

  register(ctx) {
    // Reachable from the UI as call('rune-summary:summary')
    ctx.handle('summary', (): RuneSummary => {
      const runes = ctx.core.snapshot?.save.RuneSaveData ?? [];
      const learned = runes.filter((r) => r.Level > 0);
      return { learned: learned.length, levels: learned.reduce((sum, r) => sum + r.Level, 0) };
    });
  },
};
```

Register it in `src/main/tools/index.ts`:

```ts
export const mainTools: MainTool[] = [buildShareTool, dataBrowserTool, liveRatesTool, runeSummaryTool];
```

### 2. UI — `src/renderer/src/tools/rune-summary/index.tsx`

```tsx
import { useQuery } from '../../app/ipc';
import type { ToolProps } from '../registry';

export function RuneSummary(_props: ToolProps) {
  // Reloads automatically whenever the game autosaves.
  const summary = useQuery<{ learned: number; levels: number }>('rune-summary:summary', [], ['core:save']);
  return (
    <div className="tool">
      <header className="tool-header">
        <h1>Rune Summary</h1>
      </header>
      {summary.error && <div className="banner error">{summary.error}</div>}
      {summary.data && (
        <div className="card">
          {summary.data.learned} runes learned, {summary.data.levels} levels in total.
        </div>
      )}
    </div>
  );
}
```

Add it to the sidebar in `src/renderer/src/tools/registry.ts`:

```ts
{ id: 'rune-summary', title: 'Rune Summary', description: 'How far along your rune tree is', icon: '◆', component: RuneSummary },
```

That's it — `npm run dev` and the tool appears in the sidebar.

## What `ctx` gives a main module

| Member | Use |
| --- | --- |
| `ctx.core.snapshot` | The latest decrypted save (`SaveSnapshot`), or `null`. `snapshot.save` is the game's `PlayerSaveData`. |
| `ctx.core.game` | A `GameIndex` over the datamined tables and text, or `null` if the install wasn't found. |
| `ctx.core.on('save', fn)` | Called with the new snapshot every time the game autosaves. |
| `ctx.handle(name, fn)` | Registers `'<id>:<name>'`. Thrown errors reach the UI as readable messages. |
| `ctx.emit(event, payload)` | Pushes `'<id>:<event>'` to the UI (`useEvent` on the other side). |
| `ctx.store(name, fallback)` | A small JSON file in the app's user-data folder, namespaced by tool id. |

### Looking things up in the game data

```ts
const game = ctx.core.game!;
game.rows('ItemInfoData');                         // every row as { column: value }
game.find('ItemInfoData', 'ItemKey', 300001);      // first matching row
game.group('StatModInfoData', 'StatModKey', 100101); // all matching rows (one per tier)
game.t('ItemName_300001');                         // localized text, falls back to the key
```

Use the **Data Browser** tool to explore which tables and columns exist. Shared helpers for turning a save into
a build live in `src/shared/build-model.ts` (`snapshotFromSave`, `resolveBuild`, `statLine`, `sumStats`).

## UI helpers

| Helper | Use |
| --- | --- |
| `call<T>(channel, ...args)` | One-off request; rejects with an `Error` carrying the main process's message. |
| `useQuery<T>(channel, args, refreshOn)` | Load data and reload on events such as `'core:save'` or `'core:status'`. |
| `useEvent(channel, handler)` | Subscribe to pushed events. |
| CSS classes | `tool`, `tool-header`, `card`, `banner`, `button`, `input`, `diff-table`, `muted`, … in `app/styles.css`. |

Core events available to every tool: `core:save` (a new autosave was read) and `core:status` (paths, game data or
errors changed).

## Ground rules

- **Read-only.** Tools must never write to the save, the game folder or the game's memory, and must not automate
  gameplay. Pull requests that do will be declined.
- **Validate what crosses the bridge.** Arguments arriving in `ctx.handle` come from the renderer; check their
  types before using them. Anything pasted by a user (like share codes) is untrusted input.
- **No bundled game data.** Read tables and text from the user's install through `ctx.core.game`.
- **Keep logic testable.** Put pure logic in `src/shared/` and cover it in `tests/` with synthetic data — never
  commit a real save.
