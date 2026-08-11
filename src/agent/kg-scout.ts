import kgScoutMd from "../../assets/agents/kg-scout.md";
import { parseFrontmatter } from "../graph/frontmatter";
import { normalizeContent } from "../graph/reader";

function splitFrontmatter(text: string): { meta: Record<string, unknown>; body: string } {
  const normalized = normalizeContent(text);
  const meta = parseFrontmatter(normalized);
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "---") return { meta, body: normalized };
  const close = lines.findIndex((l, i) => i > 0 && (l.trim() === "---" || l.trim() === "..."));
  if (close === -1) return { meta, body: normalized }; // unterminated frontmatter: keep everything
  return { meta, body: lines.slice(close + 1).join("\n").trim() };
}

const { meta, body } = splitFrontmatter(kgScoutMd);

/** The scout, carried over verbatim: read-only, one question in, sentences out. */
export const KG_SCOUT = {
  description: String(meta["description"] ?? "Read-only reader for a knowledge graph."),
  prompt: body,
  tools: ["Read", "Grep", "Glob"],
  model: "haiku",
} as const;
