import systemMd from "../../assets/prompts/system.md";
import grillMd from "../../assets/prompts/grill.md";
import consultMd from "../../assets/prompts/consult.md";
import { GraphStats } from "../graph/validation";

const STITCH_NOTE =
  "_(The Grill and Consult references follow inline below. Any mention of `SKILL.md`, " +
  "`references/grill.md`, or `references/consult.md` points within this one document — " +
  "never try to Read them as files.)_";

/** The full embedded interviewer instructions (spec decision: inlined, not lazy-loaded). */
export function buildSystemPrompt(): string {
  return [systemMd, STITCH_NOTE, grillMd, consultMd].join("\n\n---\n\n");
}

export interface PreambleInput {
  graphDir: string;
  hubPath: string;
  todayIso: string;
  stats: GraphStats;
  digestLines: string[]; // surfaced obligations digest for THIS graph, pre-rendered
}

/** Per-session context: everything mechanical the model used to run scripts for. */
export function buildSessionPreamble(input: PreambleInput): string {
  const digest = input.digestLines.length > 0 ? input.digestLines.join("\n") : "Nothing is due or owed today.";
  return [
    `You are bound to the graph whose hub is \`${input.hubPath}\`.`,
    `Today's date is ${input.todayIso}. It appears in Log/ filenames and in pinned deadlines only — never in statements.`,
    `Shape: ${input.stats.nodes} nodes, ${input.stats.hubChildren} of them hanging directly off the hub.`,
    `Obligations register for this graph:`,
    digest,
  ].join("\n\n");
}
