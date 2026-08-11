/** Python reads text with universal newlines; Node does not. Normalize on every read. */
export function normalizeContent(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** utf-8-sig semantics: drop exactly one leading BOM. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
