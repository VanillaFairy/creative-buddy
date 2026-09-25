/**
 * Which models the pickers offer, and what to call them.
 *
 * The pickers offer families, never versions: the CLI resolves `opus` to the
 * newest Opus it knows. So the version worth showing is not something this
 * plugin can know on its own; it comes from the CLI's own model listing.
 */

/** The families the pickers offer, keyed by the alias the CLI accepts. */
export const FAMILY_NAMES: Record<string, string> = {
  fable: "Fable",
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
};

const PINNED = /^claude-(fable|opus|sonnet|haiku)-/;

/**
 * A stored model read back as its family alias. Settings and workspaces saved
 * before the pickers offered families hold pinned ids like `claude-opus-5`;
 * those would otherwise stay on that version forever.
 */
export function asFamily(stored: string): string {
  return PINNED.exec(stored)?.[1] ?? stored;
}

/** One row of the CLI's `supportedModels()` — only the fields read here. */
export interface ListedModel {
  value: string;
  resolvedModel?: string;
}

// claude-opus-5-5[1m], claude-sonnet-5, claude-haiku-4-5-20251001: a one- or
// two-digit minor is a version, the eight-digit tail is a snapshot date.
const VERSIONED = /^claude-(fable|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[[^\]]*\])?$/;

/**
 * Picker labels for every family, named after the version the CLI resolves it
 * to ("Opus 5.5"). A family the listing says nothing about keeps its bare name.
 */
export function modelLabels(rows: readonly ListedModel[]): Record<string, string> {
  const labels = { ...FAMILY_NAMES };
  const seen = new Set<string>();
  for (const row of rows) {
    const match = VERSIONED.exec(row.resolvedModel ?? row.value);
    if (match === null) continue;
    const [, family, major, minor] = match as unknown as [string, string, string, string | undefined];
    if (seen.has(family)) continue;
    seen.add(family);
    labels[family] = `${FAMILY_NAMES[family]} ${minor === undefined ? major : `${major}.${minor}`}`;
  }
  return labels;
}
