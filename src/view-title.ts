import { baseName } from "./graph/types";

/** A graph rooted at "" spans the whole vault, so it has no folder name of its own. */
export function projectName(graphDir: string | null, vaultName: string): string | null {
  if (graphDir === null) return null;
  return graphDir === "" ? vaultName : baseName(graphDir);
}

export function tabTitle(prefix: string, graphDir: string | null, vaultName: string): string {
  const name = projectName(graphDir, vaultName);
  return name === null ? prefix : `${prefix}: ${name}`;
}
