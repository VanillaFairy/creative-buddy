/**
 * How many questions a note still owes an answer.
 *
 * An open question is `- [ ]` written where its answer will go — the rule the
 * interviewer works to, defined in `assets/prompts/system.md`. Two surfaces want
 * this number: the map colours a node by it, and the composer decides from it
 * whether to offer the "Current note questions" preset. So it lives here rather
 * than inside either of them.
 *
 * It is still not a `Note` field: the oracle has no opinion about task boxes, and
 * widening the ported types with something the Python never had would break the
 * parity the whole `src/graph/` layer exists to keep.
 */

import { stripFrontmatterBlock } from "./graph/frontmatter";
import { normalizeContent, stripBom } from "./graph/reader";

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
