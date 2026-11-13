import type { TableSummary } from '@shared/tool-types';
import type { Table } from '@shared/types';
import type { MainTool, ToolContext } from './types';

export const dataBrowserTool: MainTool = {
  id: 'data-browser',

  register(ctx: ToolContext) {
    ctx.handle('tables', (): TableSummary[] => {
      const tables = ctx.core.game?.data.tables ?? {};
      return Object.entries(tables)
        .map(([name, t]) => ({ name, columns: t.columns.length, rows: t.rows.length }))
        .sort((a, b) => a.name.localeCompare(b.name));
    });

    ctx.handle('table', (name): Table => {
      const table = typeof name === 'string' ? ctx.core.game?.data.tables[name] : undefined;
      if (!table) throw new Error('That table does not exist in this game version.');
      return table;
    });

    /** Localization key -> text, so the renderer can show names next to raw keys. */
    ctx.handle('strings', (): Record<string, string> => ctx.core.game?.data.strings ?? {});
  },
};
