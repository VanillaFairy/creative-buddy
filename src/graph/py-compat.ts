/** Helpers that replicate Python-side semantics the oracle depends on. */

export function casefold(s: string): string {
  return s.toLowerCase();
}

/** Python repr() for the plain strings that appear in problem details. */
export function pyRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let body = "";
  for (const ch of s) {
    body += ch === "\\" || ch === quote ? "\\" + ch : ch;
  }
  return quote + body + quote;
}

/** Python str() for YAML scalars (dates render as YYYY-MM-DD like PyYAML's date). */
export function pyStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** The oracle sorts str(Path) on Windows, where the separator is a backslash. */
export function sortKeyWindows(p: string): string {
  return p.replaceAll("/", "\\");
}

/** Python sorted(list[Path]) compares the parts tuples element-wise. */
export function comparePathSegments(a: string, b: string): number {
  const as = a === "" ? [] : a.split("/");
  const bs = b === "" ? [] : b.split("/");
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const x = as[i]!;
    const y = bs[i]!;
    if (x !== y) return x < y ? -1 : 1;
  }
  return as.length - bs.length;
}

export interface DateOnly {
  y: number;
  m: number;
  d: number;
}

/** strptime("%Y-%m-%d") — real calendar dates only; 1–2 digit month/day accepted.
 *  Uses setUTCFullYear (not Date.UTC) to dodge the JS 0–99 → 1900+y folding quirk,
 *  and bounds the year to Python datetime's 1–9999 range. */
export function parseIsoDate(stamp: string): DateOnly | null {
  const parts = stamp.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1 || y > 9999) return null;
  const probe = new Date(0);
  probe.setUTCFullYear(y, m - 1, d);
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function epochDays(date: DateOnly): number {
  const probe = new Date(0);
  probe.setUTCFullYear(date.y, date.m - 1, date.d);
  return probe.getTime() / 86_400_000;
}

export function isoDate(date: DateOnly): string {
  return `${String(date.y).padStart(4, "0")}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}
