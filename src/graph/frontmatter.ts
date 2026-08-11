import { load } from "js-yaml";
import { pyStr } from "./py-compat";

/** Python's whitespace set for str.strip() — notably excludes U+FEFF (BOM). */
const PY_STRIP_CLASS =
  "[\\t\\n\\v\\f\\r \\u001c-\\u001f\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\u0085]";
const PY_STRIP_RE = new RegExp(`^${PY_STRIP_CLASS}+|${PY_STRIP_CLASS}+$`, "g");

/** Python str.strip() — trims JS whitespace EXCEPT U+FEFF (Python keeps the BOM). */
function pyStrip(s: string): string {
  return s.replace(PY_STRIP_RE, "");
}

/**
 * Line index of the closing `---`/`...` delimiter (pyStripped), scanning from
 * line 1 onward; -1 if the block never closes. Shared by parseFrontmatter and
 * stripFrontmatterBlock so both agree on where a frontmatter block ends.
 */
function findCloserLine(lines: string[]): number {
  for (let i = 1; i < lines.length; i++) {
    const t = pyStrip(lines[i]!);
    if (t === "---" || t === "...") return i;
  }
  return -1;
}

/** The note's YAML frontmatter as a mapping — {} on anything unreadable (hand edits are legal). */
export function parseFrontmatter(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  if (lines.length === 0 || pyStrip(lines[0]!) !== "---") return {};
  const end = findCloserLine(lines);
  if (end === -1) return {};
  let loaded: unknown;
  try {
    loaded = load(lines.slice(1, end).join("\n"));
  } catch {
    return {};
  }
  if (typeof loaded !== "object" || loaded === null || Array.isArray(loaded) || loaded instanceof Date) return {};
  return loaded as Record<string, unknown>;
}

/**
 * Excise a note's frontmatter block using the same boundary rule as
 * parseFrontmatter (pyStrip-based, so a BOM'd `---` line is never a
 * delimiter): first line must pyStrip to `---`, and the block runs to the
 * first later line that pyStrips to `---` or `...`. No closer means there is
 * no well-formed block, so the text is returned unchanged.
 */
export function stripFrontmatterBlock(text: string): string {
  const lines = text.split("\n");
  if (lines.length === 0 || pyStrip(lines[0]!) !== "---") return text;
  const end = findCloserLine(lines);
  if (end === -1) return text;
  return lines.slice(end + 1).join("\n");
}

/** `parent: [[Sample]]` is a list holding a list holding "Sample" to YAML. */
export function innermostScalar(value: unknown): unknown {
  while (Array.isArray(value)) {
    if (value.length === 0) return null;
    value = value[0];
  }
  return value;
}

/** Normalise a `parent:` value to a bare note name, or null if there isn't one. */
export function parentName(raw: unknown): string | null {
  const value = innermostScalar(raw);
  if (value === null || value === undefined) return null;
  let text = pyStr(value).trim();
  for (const quote of ['"', "'"]) {
    if (text.length >= 2 && text.startsWith(quote) && text.endsWith(quote)) {
      text = text.slice(1, -1).trim();
    }
  }
  if (text.startsWith("[[") && text.endsWith("]]")) text = text.slice(2, -2);
  text = text.split("|", 1)[0]!.split("#", 1)[0]!.trim();
  return text === "" ? null : text;
}
