/**
 * Mindmap geometry — the drawing decisions, kept out of the view shell.
 *
 * The shell owns the DOM and hands in a text measurer; every rule about how
 * wide a box gets, when a label truncates, how an edge thins with depth and
 * where the first view lands is decided here, where it can be tested.
 */

/** Measures a label in the face it will actually render in. */
export type Measure = (text: string) => number;

export interface Box {
  /** Rendered label, ellipsised if the full stem would overrun. */
  label: string;
  /** Metadata set after the label in a quieter face, or null. */
  suffix: string | null;
  width: number;
  height: number;
  labelX: number;
  /** Where the suffix starts, so the shell never has to measure again. */
  suffixX: number | null;
  /**
   * Where the rule dividing the note's own area from its child-ref area sits,
   * or null when nothing is folded away and the box is all one area.
   */
  dividerX: number | null;
}

/**
 * A node's caption in radial mode: the same text rules as a box, without the
 * box. There is no divider to draw, so the fold count is simply set after the
 * stem at the same remove the box puts either side of its rule.
 */
export interface Caption {
  /** Rendered stem, ellipsised if the full one would overrun. */
  label: string;
  /** The count of children folded away, or null. */
  suffix: string | null;
  /** Total drawn width, stem plus the gap and the count. */
  width: number;
  /** Where the count starts, measured from the caption's own start. */
  suffixX: number | null;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Transform {
  k: number;
  x: number;
  y: number;
}

export const NODE_HEIGHT = 28;
/** The hub is a title rather than a box, so it needs room to sit taller. */
export const HUB_HEIGHT = 36;
/** The dot a note draws in radial mode, and the larger one the hub gets. */
export const DOT_RADIUS = 6;
export const HUB_DOT_RADIUS = 11;

const PAD_X = 13;
/** Breathing room on each side of the divider rule. */
const DIVIDER_GAP = 8;
const MIN_WIDTH = 52;
/** The box's corner rounding; the child-ref area has to match it to seat cleanly. */
export const CORNER_RADIUS = 6;
const MAX_WIDTH = 240;
/**
 * The caption cap in radial mode. Tighter than a box's, because a ring is read
 * at a glance and a long caption there eats angle its neighbours need.
 *
 * Coupled to `radial.ts`'s RING_GAP: a ring must be spaced out past
 * `DOT_RADIUS + CAPTION_GAP + this` or a caption near 3/9 o'clock bleeds onto
 * the next ring out. Today's values clear it by 11px — accepted by design,
 * since crowding that pushes a node toward 3/9 o'clock widens RING_GAP too.
 * Raising this cap narrows that margin without anything else noticing.
 */
const MAX_CAPTION_WIDTH = 168;
const ELLIPSIS = "…";

/**
 * A node's rendered box.
 *
 * The hub gets no padding because it has no box to pad — its width is its
 * title's width, which keeps the spine flush under the text. A suffix (the
 * count of children folded away behind a collapsed node) is laid out as its
 * own run rather than glued onto the stem: it is metadata about the note, not
 * part of the note's name, and a reader should be able to tell which is which.
 */
export function nodeBox(
  label: string,
  measure: Measure,
  options: { isHub?: boolean; suffix?: string | null } = {},
): Box {
  const isHub = options.isHub === true;
  const suffix = options.suffix === undefined || options.suffix === "" ? null : options.suffix;
  const pad = isHub ? 0 : PAD_X;
  const height = isHub ? HUB_HEIGHT : NODE_HEIGHT;
  // A gap either side of the rule, so the count is not jammed against it.
  const suffixWidth = suffix === null ? 0 : DIVIDER_GAP * 2 + measure(suffix);

  // The suffix is never dropped, so it eats into the label's budget first —
  // "…" plus a count still says more than a fuller name with the count lost.
  const budget = MAX_WIDTH - pad * 2 - suffixWidth;
  const shown = measure(label) <= budget ? label : ellipsise(label, budget, measure);
  const labelWidth = measure(shown);
  const dividerX = suffix === null ? null : pad + labelWidth + DIVIDER_GAP;

  return {
    label: shown,
    suffix,
    width: Math.max(isHub ? 0 : MIN_WIDTH, pad * 2 + labelWidth + suffixWidth),
    height,
    labelX: pad,
    suffixX: dividerX === null ? null : dividerX + DIVIDER_GAP,
    dividerX,
  };
}

export function radialCaption(
  label: string,
  measure: Measure,
  options: { suffix?: string | null } = {},
): Caption {
  const suffix = options.suffix === undefined || options.suffix === "" ? null : options.suffix;
  const suffixWidth = suffix === null ? 0 : DIVIDER_GAP + measure(suffix);
  const budget = MAX_CAPTION_WIDTH - suffixWidth;
  const shown = measure(label) <= budget ? label : ellipsise(label, budget, measure);
  const labelWidth = measure(shown);
  return {
    label: shown,
    suffix,
    width: labelWidth + suffixWidth,
    suffixX: suffix === null ? null : labelWidth + DIVIDER_GAP,
  };
}

/**
 * The child-ref area as a path: a rectangle from the divider to the box's right
 * edge, rounded on the right corners only so it seats inside the box's outline
 * instead of poking out of its curves. Null when the node folds nothing away.
 */
export function childRegionPath(box: Box): string | null {
  if (box.dividerX === null) return null;
  const top = -box.height / 2;
  const bottom = box.height / 2;
  const r = CORNER_RADIUS;
  const right = box.width;
  return [
    `M ${box.dividerX},${top}`,
    `H ${right - r}`,
    `A ${r},${r} 0 0 1 ${right},${top + r}`,
    `V ${bottom - r}`,
    `A ${r},${r} 0 0 1 ${right - r},${bottom}`,
    `H ${box.dividerX}`,
    "Z",
  ].join(" ");
}

/**
 * Longest prefix that still fits once the ellipsis is added. Walks down one
 * character at a time rather than bisecting: labels are note stems, so the
 * loop is short and a proportional face makes bisection no more accurate.
 */
function ellipsise(label: string, budget: number, measure: Measure): string {
  const chars = [...label];
  for (let take = chars.length - 1; take > 0; take--) {
    const candidate = chars.slice(0, take).join("").trimEnd() + ELLIPSIS;
    if (measure(candidate) <= budget) return candidate;
  }
  return ELLIPSIS;
}

/**
 * Edges fade as they get further from the hub, so the trunk reads before the
 * twigs at a glance. Flat past the fourth level — below that the difference
 * stops being visible and the line just gets hard to see. Depth shows in the
 * ink alone; the stroke is one width for every edge, set in the stylesheet
 * beside the cross-link weight it has to match.
 */
export function edgeOpacity(depth: number): number {
  const step = Math.min(Math.max(depth, 0), 4);
  return 1 - step * 0.13;
}

/**
 * How far a small graph may be scaled up to use the pane it was given.
 *
 * Capping at 1 keeps a small graph honest but leaves it marooned in a corner
 * of a maximised window — a dozen notes using a fifth of the screen. Past
 * roughly 1.6 the labels start reading as a mockup rather than a map.
 */
const MAX_FIT_SCALE = 1.6;

/**
 * The transform that brings `bounds` fully into `viewport` with a margin,
 * centred on both axes.
 */
export function fitTransform(bounds: Bounds, viewport: Viewport, margin = 32): Transform {
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const usableWidth = Math.max(1, viewport.width - margin * 2);
  const usableHeight = Math.max(1, viewport.height - margin * 2);
  const k = clamp(Math.min(usableWidth / Math.max(1, contentWidth), usableHeight / Math.max(1, contentHeight)), 0.25, MAX_FIT_SCALE);
  // Centre what is left over after scaling, in screen units.
  const x = (viewport.width - contentWidth * k) / 2 - bounds.minX * k;
  const y = (viewport.height - contentHeight * k) / 2 - bounds.minY * k;
  return { k, x, y };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * The inspector strip's reading of a node. Returns null when there is nothing
 * to say beyond the name, so the strip can fall back to its hint rather than
 * showing a lone stem the user is already looking at.
 */
export function inspectorLine(node: {
  stem: string;
  kind: string | null;
  status: string | null;
  problemKinds: string[];
  collapsedChildren: number;
}): string | null {
  const facts = [
    node.kind,
    node.status,
    node.collapsedChildren > 0 ? `${node.collapsedChildren} hidden` : null,
    ...node.problemKinds,
  ].filter((fact): fact is string => fact !== null && fact !== "");
  return facts.length === 0 ? null : `${node.stem} · ${facts.join(" · ")}`;
}
