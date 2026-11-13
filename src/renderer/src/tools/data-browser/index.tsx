import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TableSummary } from '@shared/tool-types';
import type { Table } from '@shared/types';
import { useQuery } from '../../app/ipc';
import type { ToolProps } from '../registry';

const ROW_HEIGHT = 28;
const COLUMN_WIDTH = 170;

export function DataBrowser({ status }: ToolProps) {
  const tables = useQuery<TableSummary[]>('data-browser:tables', [], ['core:status']);
  const strings = useQuery<Record<string, string>>('data-browser:strings', [], ['core:status']);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const list = (tables.data ?? []).filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()));
  const active = selected && tables.data?.some((t) => t.name === selected) ? selected : (tables.data?.find((t) => t.name === 'ItemInfoData')?.name ?? tables.data?.[0]?.name ?? null);

  return (
    <div className="tool data-browser">
      <header className="tool-header">
        <div>
          <h1>Data Browser</h1>
          <p className="muted">
            {tables.data?.length ?? 0} tables read straight from your install{status?.gameVersion ? ` (game v${status.gameVersion})` : ''}. Nothing here is bundled
            with the app.
          </p>
        </div>
      </header>
      {tables.data && tables.data.length === 0 && <div className="banner">No game data loaded. Check the game folder in Settings.</div>}
      <div className="browser">
        <aside className="table-list">
          <input className="input" placeholder="Filter tables…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul>
            {list.map((t) => (
              <li key={t.name}>
                <button className={t.name === active ? 'table-item active' : 'table-item'} onClick={() => setSelected(t.name)}>
                  <span>{t.name.replace(/InfoData$/, '')}</span>
                  <span className="muted small">{t.rows.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        {active && <TableView key={active} name={active} strings={strings.data ?? {}} />}
      </div>
    </div>
  );
}

function TableView({ name, strings }: { name: string; strings: Record<string, string> }) {
  const table = useQuery<Table>('data-browser:table', [name], ['core:status']);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ column: number; desc: boolean } | null>(null);
  const [showNames, setShowNames] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    if (!table.data) return [];
    const q = search.trim().toLowerCase();
    let out = table.data.rows;
    if (q) {
      out = out.filter((r) => r.some((cell) => cell.toLowerCase().includes(q) || (strings[cell]?.toLowerCase().includes(q) ?? false)));
    }
    if (sort) {
      const { column, desc } = sort;
      out = [...out].sort((a, b) => {
        const x = a[column] ?? '';
        const y = b[column] ?? '';
        const nx = Number(x);
        const ny = Number(y);
        const cmp = x !== '' && y !== '' && !Number.isNaN(nx) && !Number.isNaN(ny) ? nx - ny : x.localeCompare(y);
        return desc ? -cmp : cmp;
      });
    }
    return out;
  }, [table.data, search, sort, strings]);

  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_HEIGHT, overscan: 20 });

  if (table.error) return <div className="banner error">{table.error}</div>;
  if (!table.data) return <div className="muted">Loading…</div>;
  const columns = table.data.columns;
  const width = columns.length * COLUMN_WIDTH;

  const clickSort = (column: number): void =>
    setSort((s) => (s?.column === column ? (s.desc ? null : { column, desc: true }) : { column, desc: false }));

  return (
    <section className="table-view">
      <div className="row spread">
        <div className="row">
          <h3 className="flush">{name}</h3>
          <span className="muted small">
            {rows.length.toLocaleString()} of {table.data.rows.length.toLocaleString()} rows · {columns.length} columns
          </span>
        </div>
        <div className="row">
          <label className="check small" title="Show the in-game text for cells that hold a text key">
            <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> Show in-game names
          </label>
          <input className="input search" placeholder="Search this table…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="grid-scroll" ref={scroller}>
        <div className="grid-head" style={{ width }}>
          {columns.map((c, i) => (
            <button key={i} className="grid-cell head" style={{ width: COLUMN_WIDTH }} onClick={() => clickSort(i)} title={`Sort by ${c}`}>
              {c}
              {sort?.column === i ? (sort.desc ? ' ▼' : ' ▲') : ''}
            </button>
          ))}
        </div>
        <div style={{ height: virtual.getTotalSize(), width, position: 'relative' }}>
          {virtual.getVirtualItems().map((item) => {
            const row = rows[item.index];
            return (
              <div key={item.key} className="grid-row" style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}>
                {columns.map((_, i) => {
                  const raw = row[i] ?? '';
                  const text = showNames ? strings[raw] : undefined;
                  return (
                    <div key={i} className={text ? 'grid-cell named' : 'grid-cell'} style={{ width: COLUMN_WIDTH }} title={text ? `${text}\n(${raw})` : raw}>
                      {text ?? raw}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {rows.length === 0 && <div className="muted pad">No rows match “{search}”.</div>}
      </div>
    </section>
  );
}
