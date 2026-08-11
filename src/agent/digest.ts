import { ObligationsReport, SURFACED } from "../graph/obligations";
import { isInsidePath } from "./permissions";

/** The obligations digest, filtered to one graph, in the register's own format. */
export function renderDigestForGraph(report: ObligationsReport, graphDir: string): string[] {
  const lines: string[] = [];
  for (const [bucket, heading] of SURFACED) {
    const entries = report[bucket].filter((e) => isInsidePath(e.note, graphDir));
    if (entries.length === 0) continue;
    lines.push(`${heading}:`);
    for (const entry of entries) {
      const stamp = entry.date !== undefined ? `${entry.date} — ` : "";
      lines.push(`  ${stamp}${entry.text}  (${entry.note}:${entry.line})`);
    }
  }
  return lines;
}
