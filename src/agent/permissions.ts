/**
 * The skill's approval table, made mechanical. Pure — no SDK, no Obsidian,
 * no fs. AgentService maps these decisions onto the SDK's canUseTool hook.
 */

export interface PermissionContext {
  vaultRoot: string; // absolute path of the vault on disk (either separator)
  graphDir: string;  // vault-relative posix dir of the bound graph; "" = vault root
}

export type Decision =
  | { behavior: "allow" }
  | { behavior: "deny"; message: string }
  | { behavior: "ask"; reason: string };

const FORBIDDEN = [":", "/", "\\", "|", "?", "*", '"', "<", ">"] as const;

/** Characters Windows silently mangles out of a filename, in spec order. */
export function badTitleChars(title: string): string[] {
  return FORBIDDEN.filter((ch) => title.includes(ch));
}

/** Forward slashes, resolved "." and "..", collapsed doubles. No fs access. */
export function normalizeFsPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" && out.length > 0) continue;
    if (part === ".") continue;
    if (part === "..") {
      if (out.length > 1 || (out.length === 1 && !out[0]!.endsWith(":"))) out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

/** Vault-relative posix path, or null when the path is outside the vault. Case-insensitive. */
export function vaultRelative(vaultRoot: string, absPath: string): string | null {
  const root = normalizeFsPath(vaultRoot).toLowerCase().replace(/\/+$/, "");
  const target = normalizeFsPath(absPath);
  const targetLower = target.toLowerCase();
  if (targetLower === root) return "";
  if (!targetLower.startsWith(root + "/")) return null;
  return target.slice(root.length + 1);
}

/** Segment-wise prefix test; scope "" contains everything. */
export function isInsidePath(relPath: string, scopeDir: string): boolean {
  if (scopeDir === "") return true;
  const scope = scopeDir.toLowerCase();
  const lower = relPath.toLowerCase();
  return lower === scope || lower.startsWith(scope + "/");
}

const READ_TOOLS = new Set(["Read", "Glob", "Grep"]);
const WRITE_TOOLS = new Set(["Write", "Edit"]);

/** Reserved DOS device names Windows refuses (or worse, aliases) as filenames. */
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Dot-directories (.obsidian, .git, .trash) hold plugin code and app state,
 * not notes — never auto-allowed, whatever graph the tab is bound to.
 */
function hasHiddenSegment(relPath: string): boolean {
  return relPath.split("/").some((segment) => segment.startsWith(".") && segment !== "");
}

export function targetPathOf(tool: string, input: Record<string, unknown>): string | null {
  const candidate = input["file_path"] ?? input["path"] ?? input["notebook_path"];
  return typeof candidate === "string" && candidate !== "" ? candidate : null;
}

function isAbsoluteFsPath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("/") || p.startsWith("\\");
}

/**
 * A single leading slash means "root of the current drive" on Windows — almost
 * always a model writing a POSIX-flavoured vault path. Treating it as in-vault
 * would let \foo alias the real drive root, so it is refused with a correction
 * instead of being judged (deny, not ask: the model can fix it without the user).
 */
function isDriveRelative(p: string): boolean {
  return (p.startsWith("/") && !p.startsWith("//")) || (p.startsWith("\\") && !p.startsWith("\\\\"));
}

function driveRelativeMessage(target: string, vaultRoot: string): string {
  return (
    `The path ${target} starts at a bare drive root, which is ambiguous. ` +
    `Use a vault-relative path (no leading slash) or the full absolute path — the vault lives at ${vaultRoot}.`
  );
}

/** The session's cwd is the vault root, so relative tool targets live there. */
export function resolveTarget(vaultRoot: string, target: string): string {
  return isAbsoluteFsPath(target) ? target : `${vaultRoot.replace(/[\\/]+$/, "")}/${target}`;
}

function filenameProblem(relPath: string, graphDir: string): string | null {
  // Judge every path segment below the graph folder: new folders become part
  // of titles too (a node with children lives in a folder of its own name).
  const below = graphDir === "" ? relPath : relPath.slice(graphDir.length + 1);
  for (const segment of below.split("/")) {
    const title = segment.toLowerCase().endsWith(".md") ? segment.slice(0, -3) : segment;
    const bad = badTitleChars(title);
    if (bad.length > 0) {
      const list = bad.map((c) => `"${c}"`).join(" ");
      return (
        `The title "${title}" contains characters Windows cannot store in a filename: ${list}. ` +
        `Rename the note with an oblique or punctuation-free title and put the exact wording in the note's aliases instead.`
      );
    }
    // The same "Windows silently mangles it" rule, beyond punctuation.
    if (/[\u0000-\u001f]/.test(title)) {
      return `The title "${title}" contains control characters Windows cannot store in a filename. Pick a plain title.`;
    }
    if (title !== title.replace(/[. ]+$/, "")) {
      return `The title "${title}" ends with a dot or space, which Windows silently strips. Rename the note without the trailing character.`;
    }
    if (RESERVED_NAMES.test(title)) {
      return `The title "${title}" is a reserved Windows device name. Pick a different title and keep the wording in aliases.`;
    }
  }
  return null;
}

export function decideToolUse(tool: string, input: Record<string, unknown>, ctx: PermissionContext): Decision {
  if (tool === "Task") return { behavior: "allow" }; // kg-scout dispatch; subagent is read-only by definition

  if (READ_TOOLS.has(tool)) {
    const target = targetPathOf(tool, input);
    if (target === null) return { behavior: "allow" }; // Glob/Grep default to cwd = vault root
    if (isDriveRelative(target)) return { behavior: "deny", message: driveRelativeMessage(target, ctx.vaultRoot) };
    const rel = vaultRelative(ctx.vaultRoot, resolveTarget(ctx.vaultRoot, target));
    if (rel === null) return { behavior: "ask", reason: `${tool} outside the vault: ${target}` };
    if (hasHiddenSegment(rel)) return { behavior: "ask", reason: `${tool} in a hidden folder (app state, not notes): ${rel}` };
    return { behavior: "allow" };
  }

  if (WRITE_TOOLS.has(tool)) {
    const target = targetPathOf(tool, input);
    if (target === null) return { behavior: "deny", message: `${tool} call carried no file path.` };
    if (isDriveRelative(target)) return { behavior: "deny", message: driveRelativeMessage(target, ctx.vaultRoot) };
    const rel = vaultRelative(ctx.vaultRoot, resolveTarget(ctx.vaultRoot, target));
    if (rel === null) return { behavior: "ask", reason: `${tool} outside the vault: ${target}` };
    if (hasHiddenSegment(rel)) return { behavior: "ask", reason: `${tool} in a hidden folder (app state, not notes): ${rel}` };
    if (rel === ctx.graphDir) return { behavior: "ask", reason: `${tool} targets the graph folder itself, not a note: ${rel === "" ? "(vault root)" : rel}` };
    if (!isInsidePath(rel, ctx.graphDir)) {
      return { behavior: "ask", reason: `${tool} outside the bound graph (${ctx.graphDir === "" ? "vault root" : ctx.graphDir}): ${rel}` };
    }
    const problem = filenameProblem(rel, ctx.graphDir);
    if (problem !== null) return { behavior: "deny", message: problem };
    return { behavior: "allow" };
  }

  return { behavior: "deny", message: `The ${tool} tool is not available in graph sessions.` };
}

/** The failed-write footgun, made mechanical: the message the model sees when a Write left a zero-byte file. */
export function zeroByteWriteMessage(path: string): string {
  return (
    `The write to ${path} produced an empty file — the content did not land. ` +
    `Recover the note's content now, while you still have it, and write it again.`
  );
}
