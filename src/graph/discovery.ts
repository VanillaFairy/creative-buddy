import { VaultView, baseName } from "./types";
import { normalizeContent, stripBom } from "./reader";
import { casefold, comparePathSegments, sortKeyWindows } from "./py-compat";

export const SKIP_DIRS: ReadonlySet<string> = new Set([".obsidian", ".claude", ".git", ".trash", "node_modules"]);
const LOG_DIR = "log";
const CHARTER = "## Charter";

export function hubPath(view: VaultView, dir: string): string {
  const name = dir === "" ? view.rootName : baseName(dir);
  return dir === "" ? `${name}.md` : `${dir}/${name}.md`;
}

/** Immediate subdirectories of dir, derived from the path set. `skip` filters by exact name. */
export function childDirectories(view: VaultView, dir: string, skip: ReadonlySet<string> | null): string[] {
  const prefix = dir === "" ? "" : dir + "/";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of view.paths()) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) continue;
    const name = rest.slice(0, slash);
    if (seen.has(name)) continue;
    seen.add(name);
    if (skip !== null && skip.has(name)) continue;
    out.push(prefix + name);
  }
  return out;
}

export function filesDirectlyIn(view: VaultView, dir: string): string[] {
  const prefix = dir === "" ? "" : dir + "/";
  const out: string[] = [];
  for (const p of view.paths()) {
    if (!p.startsWith(prefix)) continue;
    if (p.slice(prefix.length).indexOf("/") === -1) out.push(p);
  }
  return out;
}

/** True when the directory holds `<DirName>.md` carrying a `## Charter` line. */
export function isGraphDir(view: VaultView, dir: string): boolean {
  const content = view.get(hubPath(view, dir));
  if (content === undefined) return false;
  return stripBom(normalizeContent(content))
    .split("\n")
    .some((line) => line.trim() === CHARTER);
}

/** Every graph at or under the root; a found graph is not descended into. */
export function findGraphs(view: VaultView): string[] {
  const found: string[] = [];
  const pending: string[] = [""];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    if (isGraphDir(view, dir)) {
      found.push(dir);
      continue;
    }
    for (const child of childDirectories(view, dir, SKIP_DIRS)) pending.push(child);
  }
  return found.sort(comparePathSegments);
}

function isMarkdown(path: string): boolean {
  return casefold(path).endsWith(".md");
}

/** graph_check.py collect_notes: everything under the graph, only Log/ excluded. */
export function collectNoteFiles(view: VaultView, graphDir: string): string[] {
  const out: string[] = [];
  const pending: string[] = [graphDir];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    for (const child of childDirectories(view, dir, null)) {
      if (casefold(baseName(child)) !== LOG_DIR) pending.push(child);
    }
    for (const file of filesDirectlyIn(view, dir)) {
      if (isMarkdown(file)) out.push(file);
    }
  }
  return out.sort((a, b) => (sortKeyWindows(a) < sortKeyWindows(b) ? -1 : sortKeyWindows(a) > sortKeyWindows(b) ? 1 : 0));
}

/** obligations.py markdown_files: SKIP_DIRS and log/ both excluded. */
export function markdownFiles(view: VaultView, graphDir: string): string[] {
  const out: string[] = [];
  const pending: string[] = [graphDir];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    for (const child of childDirectories(view, dir, null)) {
      const name = baseName(child);
      if (!SKIP_DIRS.has(name) && casefold(name) !== LOG_DIR) pending.push(child);
    }
    for (const file of filesDirectlyIn(view, dir)) {
      if (isMarkdown(file)) out.push(file);
    }
  }
  return out.sort();
}
