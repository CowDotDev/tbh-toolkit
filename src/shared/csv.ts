import type { Table } from './types';

/** RFC-4180-ish CSV parser: handles a BOM, quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): Table {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const columns = rows.shift() ?? [];
  // Drop blank lines (a single empty field).
  const body = rows.filter((r) => r.length > 1 || r[0] !== '');
  return { columns, rows: body };
}
