/**
 * How tall the message box gets when you drag its grip.
 *
 * The grip sits above the box and the box's bottom edge is pinned to the
 * bottom of the panel, so pulling the grip *up* makes the box taller. That is
 * the one piece of arithmetic worth writing down; everything else about the
 * drag is DOM plumbing.
 *
 * The bounds are read off the element's own computed style rather than
 * hard-coded here, so `styles.css` stays the single place that decides how
 * small and how large the box may get.
 */

export interface HeightBounds {
  min: number;
  max: number;
}

/** A px length from getComputedStyle — null for "none", "auto", "" or nonsense. */
export function pxLength(value: string): number | null {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  if (match === null) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function heightBounds(computedMin: string, computedMax: string): HeightBounds {
  return { min: pxLength(computedMin) ?? 0, max: pxLength(computedMax) ?? Infinity };
}

/**
 * Where a drag that started with the box at `startHeight` and has moved
 * `deltaY` down the screen lands. Up is negative, and up means taller.
 */
export function draggedHeight(startHeight: number, deltaY: number, bounds: HeightBounds): number {
  // A max below the min is a pane too short to honour both; the floor wins,
  // because a box you cannot type into is worse than one that overflows.
  const ceiling = Math.max(bounds.min, bounds.max);
  return Math.min(Math.max(startHeight - deltaY, bounds.min), ceiling);
}
