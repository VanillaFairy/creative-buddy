/**
 * How hot a note is — the count of questions it still owes an answer, and the
 * step of the palette that count lands on.
 *
 * An open question is `- [ ]` written where its answer will go (the rule the
 * interviewer works to; see `assets/prompts/system.md`). Counting is a mindmap
 * concern, not a graph one: the oracle has no opinion about task boxes, so this
 * lives here rather than widening `Note` with a field the Python never had.
 */

import { stripFrontmatterBlock } from "../graph/frontmatter";
import { normalizeContent, stripBom } from "../graph/reader";

/** The top of the scale. Ten questions and forty are both "as hot as it gets". */
export const HEAT_MAX = 10;

const OPEN_BOX = /^[ \t]*[-*+] \[ \]/;
const FENCE = /^[ \t]*(?:`{3,}|~{3,})/;

/**
 * Open questions in a note's body.
 *
 * Reads through the same normalise → de-BOM → drop-frontmatter path the note
 * index uses for links, which is what keeps a CRLF note from reading as one
 * long line and losing every box on it.
 */
export function countOpenQuestions(noteText: string): number {
  const body = stripFrontmatterBlock(stripBom(normalizeContent(noteText)));
  let count = 0;
  let fenced = false;
  for (const line of body.split("\n")) {
    // A box inside a fence is an example of the notation, not a live question.
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && OPEN_BOX.test(line)) count += 1;
  }
  return count;
}

/** The palette step a count lands on, clamped to the top of the scale. */
export function heatBucket(count: number): number {
  return count > HEAT_MAX ? HEAT_MAX : count;
}

/**
 * The class carrying that step's colours. The eleven steps are declared in
 * `styles.css`, once per theme; naming them here is what keeps the two ends
 * from drifting apart.
 */
export function heatClass(count: number): string {
  return `cb-mm-heat-${heatBucket(count)}`;
}
