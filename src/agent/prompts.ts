import systemMd from "../../assets/prompts/system.md";
import grillMd from "../../assets/prompts/grill.md";
import consultMd from "../../assets/prompts/consult.md";
import { GraphStats } from "../graph/validation";
import { Problem } from "../graph/types";

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
  /** This graph's structural problems, as the plugin's continuous check sees them. */
  problems: Problem[];
}

/**
 * The structure check, addressed to the interviewer rather than to the user.
 * The plugin computes it either way; handing it to the model is what turns a
 * report into a repair, since an unresolved parent is usually a title that
 * lost a character to the filesystem and only the model knows the title.
 */
function structureCheck(problems: Problem[]): string {
  if (problems.length === 0) return "Structure check: clean.";
  const lines = problems.map((p) => `[${p.kind}] ${p.note} — ${p.detail}`);
  return ["Structure check — fix these as part of ordinary work, not as an announced task:", ...lines].join("\n");
}

/** Per-session context: everything mechanical the model used to run scripts for. */
export function buildSessionPreamble(input: PreambleInput): string {
  return [
    `You are bound to the graph whose hub is \`${input.hubPath}\`.`,
    `Today's date is ${input.todayIso}. It is context for you, never content: it does not go into a statement.`,
    `Shape: ${input.stats.nodes} nodes, ${input.stats.hubChildren} of them hanging directly off the hub.`,
    structureCheck(input.problems),
  ].join("\n\n");
}
