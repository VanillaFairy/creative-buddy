/**
 * The one `kind:` the plugin reads for itself.
 *
 * Every other kind is a graph's own filing vocabulary, defined by its charter,
 * and nothing outside the inspector strip has an opinion about it. `service` is
 * the exception: a note filed under it is infrastructure rather than content —
 * an `Images` folder rather than a chapter — and the map draws it as a dashed
 * dot instead of a box.
 *
 * The word is spelled here once so the renderer and `assets/prompts/system.md`
 * cannot drift apart about what it is.
 *
 * The shape lives here too, rather than in `geometry.ts` where the other box
 * rules are: it is assembled entirely from pieces that module already exports,
 * and building it here keeps `CAPTION_GAP` in the one place radial defines it
 * instead of moving a constant six consumers already import.
 */

import { radialCaption, CAPTION_HEIGHT, DOT_RADIUS } from "./geometry";
import { CAPTION_GAP } from "./radial";
import type { Box, Measure } from "./geometry";

const SERVICE = "service";

/**
 * Whether a note's kind is the reserved one.
 *
 * `toLowerCase`, never `toLocaleLowerCase` — the latter turns the I in a
 * Turkish locale into a dotless ı and would stop reading `SERVICE`.
 */
export function isService(kind: string | null): boolean {
  return kind !== null && kind.toLowerCase() === SERVICE;
}

/**
 * A service node's box: the dot and the name beside it, sized so the flat tree
 * lays it out without ever learning it is not a box.
 *
 * The shape is the radial map's, borrowed whole — a service node looks the same
 * in both views, and looking the same in both is itself the signal that it opted
 * out of being a note you read. `dividerX` stays null because there is no box to
 * split, so a folded one says `+3` after its name the way a caption does.
 */
export function serviceBox(
  label: string,
  measure: Measure,
  options: { suffix?: string | null } = {},
): Box {
  const caption = radialCaption(label, measure, options);
  const labelX = DOT_RADIUS * 2 + CAPTION_GAP;
  return {
    label: caption.label,
    suffix: caption.suffix,
    width: labelX + caption.width,
    height: Math.max(DOT_RADIUS * 2, CAPTION_HEIGHT),
    labelX,
    suffixX: caption.suffixX === null ? null : labelX + caption.suffixX,
    dividerX: null,
  };
}
