export interface LocatorEnv {
  platform: NodeJS.Platform | string;
  env: Record<string, string | undefined>;
}

/** Ordered candidate paths for the user's Claude Code executable. Pure — no fs. */
export function candidateClaudePaths(ctx: LocatorEnv): string[] {
  const win = ctx.platform === "win32";
  const exe = win ? "claude.exe" : "claude";
  const sep = win ? ";" : ":";
  const out: string[] = [];
  for (const dir of (ctx.env["PATH"] ?? ctx.env["Path"] ?? "").split(sep)) {
    if (dir !== "") out.push(`${dir.replace(/\\/g, "/").replace(/\/+$/, "")}/${exe}`);
  }
  if (win) {
    const local = ctx.env["LOCALAPPDATA"];
    const home = ctx.env["USERPROFILE"];
    if (local !== undefined) out.push(`${local.replace(/\\/g, "/")}/Programs/claude/${exe}`);
    if (home !== undefined) out.push(`${home.replace(/\\/g, "/")}/.local/bin/${exe}`);
  } else {
    const home = ctx.env["HOME"];
    if (home !== undefined) out.push(`${home}/.local/bin/${exe}`);
    out.push(`/usr/local/bin/${exe}`, `/opt/homebrew/bin/${exe}`);
  }
  return out;
}

export function findClaudeExecutable(ctx: LocatorEnv, exists: (p: string) => boolean): string | null {
  for (const candidate of candidateClaudePaths(ctx)) {
    if (exists(candidate)) return candidate;
  }
  return null;
}
