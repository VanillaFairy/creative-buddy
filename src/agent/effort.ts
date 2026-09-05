/**
 * How hard the interviewer thinks, and which models let you say.
 *
 * Effort and model are coupled state: a level that was legal a second ago stops
 * being legal the moment you switch models, and the value itself comes back off
 * disk where anything could have been written. Both facts live here, so the
 * settings tab, the chat header, and the restore path all ask the same
 * question instead of each re-deriving the answer.
 */

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Cheapest first, so a picker built from this reads as a dial. */
export const LEVELS: readonly EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];

/** What the CLI does when nothing sets effort. */
export const DEFAULT_EFFORT: EffortLevel = "high";

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: "Low — file it and move on",
  medium: "Medium — balanced",
  high: "High — the default",
  xhigh: "Extra high — a long grilling",
  max: "Max — no ceiling",
};

// Only the models the picker offers. Anything else is unknown rather than
// assumed, because an effort the CLI rejects fails the whole session.
const HONOURED: Record<string, readonly EffortLevel[]> = {
  "claude-fable-5-1": LEVELS,
  "claude-opus-5": LEVELS,
  "claude-sonnet-5": LEVELS,
};

/** Levels this model honours. Empty means it has no effort control at all. */
export function levelsFor(model: string): EffortLevel[] {
  return [...(HONOURED[model] ?? [])];
}

/**
 * The effort a session should actually run at: null when the model has none,
 * otherwise a level it honours — falling back to the default rather than
 * passing on something unrecognised.
 */
export function coerce(model: string, stored: unknown): EffortLevel | null {
  const levels = levelsFor(model);
  if (levels.length === 0) return null;
  return levels.includes(stored as EffortLevel) ? (stored as EffortLevel) : DEFAULT_EFFORT;
}
