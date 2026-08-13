/**
 * Telling the interviewer which note the user is reading.
 *
 * It runs as a separate process with file tools and no view of the Obsidian
 * window, so it knows what is on screen only because the panel says so. Saying it
 * on every message would be a line of plumbing stapled to everything you type; so
 * the panel says it once, and again whenever the answer changes — the way you
 * would mention to a person that you have turned to a different page.
 *
 * What the interviewer does with that knowledge is in `assets/prompts/system.md`,
 * not here. This module decides only whether there is anything new to say.
 *
 * Nothing is remembered here. The caller holds what it has already said, because
 * that fact belongs to one conversation and this file serves all of them.
 */

const AWAY = "The user is not looking at any note in this graph.";

/**
 * The line to put in front of the next message, or null when what the
 * interviewer already believes is still true.
 *
 * `announced` is what this conversation has been told so far — `undefined` when
 * nothing has been said yet, which is why a conversation that opens with no note
 * open opens with no line about it either.
 *
 * The caller sets `announced` to `open` whenever a line comes back, and leaves it
 * alone otherwise.
 */
export function noteAnnouncement(open: string | null, announced: string | null | undefined): string | null {
  if (open === announced) return null;
  if (open === null) return announced === undefined ? null : AWAY;
  return `The user is looking at \`${open}\`. It is context for you, never content.`;
}
