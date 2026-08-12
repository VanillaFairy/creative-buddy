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
  hubPath: string;
  todayIso: string;
  stats: GraphStats;
}

/** Per-session context: everything mechanical the model used to run scripts for. */
export function buildSessionPreamble(input: PreambleInput): string {
  return [
    `You are bound to the graph whose hub is \`${input.hubPath}\`.`,
    `Today's date is ${input.todayIso}. It appears in Log/ filenames only — never in statements.`,
    `Shape: ${input.stats.nodes} nodes, ${input.stats.hubChildren} of them hanging directly off the hub.`,
  ].join("\n\n");
}
