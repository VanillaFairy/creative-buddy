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
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

// Keyed by family alias: the CLI resolves each alias to the family's newest
// version. Anything else is unknown rather than assumed, because an effort the
// CLI rejects fails the whole session.
const HONOURED: Record<string, readonly EffortLevel[]> = {
  fable: LEVELS,
  opus: LEVELS,
  sonnet: LEVELS,
};

/** Levels this model honours. Empty means it has no effort control at all. */
export function levelsFor(model: string): EffortLevel[] {
  return [...(HONOURED[model] ?? [])];
}

/**
 * A stored model read back as its family alias. Settings and workspaces saved
 * before the pickers offered families hold pinned ids like `claude-opus-5`;
 * those would otherwise stay on that version forever.
 */
export function asFamily(stored: string): string {
  return /^claude-(fable|opus|sonnet|haiku)-/.exec(stored)?.[1] ?? stored;
}

/**
 * A stored preference read back as a level. Says nothing about any model — a
 * conversation keeps the level you chose even while it sits on a model that
 * cannot use it, so switching back gives you what you had.
 */
export function asLevel(stored: unknown, fallback: EffortLevel = DEFAULT_EFFORT): EffortLevel {
  return LEVELS.includes(stored as EffortLevel) ? (stored as EffortLevel) : fallback;
}

/**
 * The effort a session should actually run at: null when the model has none,
 * otherwise a level it honours — falling back to the default rather than
 * passing on something unrecognised.
 */
export function coerce(model: string, stored: unknown): EffortLevel | null {
  const levels = levelsFor(model);
  if (levels.length === 0) return null;
  const level = asLevel(stored);
  return levels.includes(level) ? level : DEFAULT_EFFORT;
}
