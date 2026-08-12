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
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value);
}

/** The oracle sorts str(Path) on Windows, where the separator is a backslash. */
export function sortKeyWindows(p: string): string {
  return p.replaceAll("/", "\\");
}

/**
 * Python string `<` compares by code point, not UTF-16 code unit — the two
 * agree everywhere except astral characters (emoji and friends), where JS's
 * surrogate-pair halves would otherwise sort out of order.
 */
export function comparePyStrings(a: string, b: string): number {
  const ai = a[Symbol.iterator]();
  const bi = b[Symbol.iterator]();
  for (;;) {
    const an = ai.next();
    const bn = bi.next();
    if (an.done && bn.done) return 0;
    if (an.done) return -1;
    if (bn.done) return 1;
    const ac = an.value.codePointAt(0)!;
    const bc = bn.value.codePointAt(0)!;
    if (ac !== bc) return ac < bc ? -1 : 1;
  }
}

/**
 * Python sorted(list[Path]) compares the parts tuples element-wise, but on
 * Windows the sort key is `_parts_normcase` — the casefolded segments — so
 * "alpha" and "Beta" compare case-insensitively (NTFS forbids case-only
 * siblings, so a stable sort on ties is fine).
 */
export function comparePathSegments(a: string, b: string): number {
  const as = a === "" ? [] : a.split("/");
  const bs = b === "" ? [] : b.split("/");
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const cmp = comparePyStrings(casefold(as[i]!), casefold(bs[i]!));
    if (cmp !== 0) return cmp;
  }
  return as.length - bs.length;
}

