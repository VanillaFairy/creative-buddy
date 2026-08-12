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

const PAD_X = 13;
const SUFFIX_GAP = 6;
const MIN_WIDTH = 52;
const MAX_WIDTH = 240;
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
  const suffixWidth = suffix === null ? 0 : SUFFIX_GAP + measure(suffix);

  // The suffix is never dropped, so it eats into the label's budget first —
  // "…" plus a count still says more than a fuller name with the count lost.
  const budget = MAX_WIDTH - pad * 2 - suffixWidth;
  const shown = measure(label) <= budget ? label : ellipsise(label, budget, measure);
  const labelWidth = measure(shown);

  return {
    label: shown,
    suffix,
    width: Math.max(isHub ? 0 : MIN_WIDTH, pad * 2 + labelWidth + suffixWidth),
    height,
    labelX: pad,
    suffixX: suffix === null ? null : pad + labelWidth + SUFFIX_GAP,
  };
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
 * Edges thin and fade as they get further from the hub, so the trunk reads
 * before the twigs at a glance. Flat past the fourth level — below that the
 * difference stops being visible and the line just gets hard to see.
 */
export function edgeWeight(depth: number): { width: number; opacity: number } {
  const step = Math.min(Math.max(depth, 0), 4);
  return { width: 2.2 - step * 0.35, opacity: 1 - step * 0.13 };
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
