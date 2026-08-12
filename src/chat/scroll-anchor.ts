/**
 * Keeping the bottom of the transcript still while the composer changes size.
 *
 * Growing the message box takes its space from the transcript above it. Left
 * alone, the transcript keeps its distance from the *top* — so the last line
 * you were reading slides up under the composer and the panel lurches. What
 * should stay put is the bottom edge: the line sitting just above the composer
 * before the drag is the line sitting just above it after.
 *
 * So the quantity to hold constant is how much transcript is below the fold.
 * Both cases fall out of that one number without a branch: pinned to the
 * bottom is simply a gap of zero, and scrolled up by N is a gap of N.
 */

/** The three numbers every scrollable element reports about itself. */
export interface ScrollFrame {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * How much transcript sits below the fold. Never negative: a list shorter than
 * its viewport, and the subpixel overscroll a trackpad can leave behind, both
 * report as "nothing below", which is what they look like.
 */
export function bottomGap(frame: ScrollFrame): number {
  return Math.max(0, frame.scrollHeight - frame.scrollTop - frame.clientHeight);
}

/**
 * Where to scroll so `gap` pixels sit below the fold again. Clamped at zero for
 * the case the composer *shrank* far enough that the whole transcript now fits
 * — there is no way to keep a gap you no longer have the content for, and the
 * top of the list is the honest answer.
 */
export function anchoredScrollTop(frame: ScrollFrame, gap: number): number {
  return Math.max(0, frame.scrollHeight - frame.clientHeight - Math.max(0, gap));
}
