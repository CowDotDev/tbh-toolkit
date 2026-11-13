/**
 * JSON.parse that keeps very large integers intact.
 *
 * The save stores item UniqueIds as 18-digit integers, which exceed Number.MAX_SAFE_INTEGER and
 * would silently lose precision. Any bare integer token with 16+ digits is turned into a string
 * before parsing. Tokens inside string literals are left alone.
 */
export function parseJsonBigSafe(text: string): unknown {
  const n = text.length;
  let out = '';
  let last = 0;
  let i = 0;

  while (i < n) {
    const ch = text.charCodeAt(i);
    if (ch === 34 /* " */) {
      i++;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 92 /* \ */) i += 2;
        else if (c === 34) {
          i++;
          break;
        } else i++;
      }
    } else if (ch === 45 /* - */ || (ch >= 48 && ch <= 57)) {
      const start = i;
      let integer = true;
      i++;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c >= 48 && c <= 57) i++;
        else if (c === 46 || c === 101 || c === 69 || c === 43 || c === 45) {
          integer = false;
          i++;
        } else break;
      }
      const digits = i - start - (ch === 45 ? 1 : 0);
      if (integer && digits >= 16) {
        out += text.slice(last, start) + '"' + text.slice(start, i) + '"';
        last = i;
      }
    } else {
      i++;
    }
  }
  return JSON.parse(last === 0 ? text : out + text.slice(last));
}
