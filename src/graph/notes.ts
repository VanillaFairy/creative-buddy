import { parseFrontmatter, parentName, innermostScalar } from "./frontmatter";
import { normalizeContent, stripBom } from "./reader";
import { casefold, pyStr } from "./py-compat";
import { stemOf } from "./types";

export interface Note {
  path: string;
  stem: string;
  parent: string | null;
  aliases: string[];
  kind: string | null;
  status: string | null;
  links: string[];
}

const WIKILINK = /\[\[([^\[\]]+)\]\]/g;

export function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(WIKILINK)) {
    const target = match[1]!.split("|", 1)[0]!.split("#", 1)[0]!.trim();
    if (target !== "") out.push(target);
  }
  return out;
}

function scalarOrNull(raw: unknown): string | null {
  const value = innermostScalar(raw);
  if (value === null || value === undefined) return null;
  const text = pyStr(value).trim();
  return text === "" ? null : text;
}

function aliasesOf(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const item of list) {
    if (item === null || item === undefined) continue;
    const text = pyStr(item).trim();
    if (text !== "") out.push(text);
  }
  return out;
}

/**
 * The frontmatter delimiters bound a YAML block, not prose — a `parent:
 * "[[X]]"` value would otherwise masquerade as a wikilink. Excise that block
 * (same `---`/`...` boundary rule as parseFrontmatter) before scanning for
 * links, whether or not the YAML inside it actually parses.
 */
function stripFrontmatterBlock(text: string): string {
  const lines = text.split("\n");
  if (lines.length === 0 || lines[0]!.trim() !== "---") return text;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t === "---" || t === "...") return lines.slice(i + 1).join("\n");
  }
  return text;
}

/**
 * One index row. `parent` follows graph_check.py semantics (no BOM strip, so a
 * BOM'd note reads as parentless); the body-level fields use the forgiving
 * BOM-stripped text.
 */
export function noteFromFile(path: string, rawContent: string): Note {
  const text = normalizeContent(rawContent);
  const fm = parseFrontmatter(text);
  const body = stripFrontmatterBlock(stripBom(text));
  return {
    path,
    stem: stemOf(path),
    parent: parentName(fm["parent"]),
    aliases: aliasesOf(fm["aliases"]),
    kind: scalarOrNull(fm["kind"]),
    status: scalarOrNull(fm["status"]),
    links: extractLinks(body),
  };
}

/** Resolution map for links/aliases (used by the mindmap): casefolded stem and aliases → note. */
export function nameResolutionMap(notes: Note[]): Map<string, Note> {
  const map = new Map<string, Note>();
  for (const note of notes) map.set(casefold(note.stem), note);
  for (const note of notes) {
    for (const alias of note.aliases) {
      const key = casefold(alias);
      if (!map.has(key)) map.set(key, note);
    }
  }
  return map;
}
