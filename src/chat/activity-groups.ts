import { TranscriptItem } from "./transcript";

export type ActivityMode = "explore" | "write";

export interface ActivityGroup {
  kind: "group";
  key: string;
  mode: ActivityMode;
  lines: string[];
  running: boolean;
  /** Wall-clock span of the run, or null when either end has no timestamp. */
  elapsedMs: number | null;
}

/** Everything grouping passes straight through. Tool items always land in a group. */
export type ActivityItem = Exclude<TranscriptItem, { kind: "tool" }>;

export type ActivityRow = { kind: "item"; key: string; item: ActivityItem } | ActivityGroup;

type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;

/**
 * Writing tools are the discriminator, not the read set: the permission table
 * denies everything outside the agent's contract, but a denied call still
 * produces a tool item, and an unknown name should stay visible as exploring
 * rather than silently vanish from the transcript.
 */
const WRITE_TOOLS = new Set(["Write", "Edit"]);

function modeOf(item: ToolItem): ActivityMode {
  return WRITE_TOOLS.has(item.name) ? "write" : "explore";
}

/**
 * Folds consecutive same-mode tool calls into one panel each, passing every
 * other item through untouched. A run breaks on any non-tool item — assistant
 * text, an approval card, a notice, the turn-cost row — which keeps each panel's
 * elapsed time an honest single span and keeps anything needing a click out in
 * the open.
 */
export function groupActivity(items: TranscriptItem[], busy: boolean): ActivityRow[] {
  const rows: ActivityRow[] = [];
  let run: ToolItem[] = [];
  let runMode: ActivityMode | null = null;

  const flush = (): void => {
    const group = buildGroup(run);
    if (group !== null) rows.push(group);
    run = [];
    runMode = null;
  };

  items.forEach((item, index) => {
    if (item.kind === "tool") {
      const mode = modeOf(item);
      if (runMode !== null && runMode !== mode) flush();
      run.push(item);
      runMode = mode;
      return;
    }
    flush();
    // Keys are namespaced because a group's is a tool id and an item's is an
    // ordinal; without the prefix a tool called "3" could collide with index 3.
    rows.push({ kind: "item", key: `i:${index}`, item });
  });
  flush();

  // Everything settles the moment the turn ends, so a tab restored from disk
  // can never show a panel stuck on "Thinking…".
  const last = rows[rows.length - 1];
  if (busy && last !== undefined && last.kind === "group") last.running = true;
  return rows;
}

/** Null for an empty run — a panel always lists at least one call. */
function buildGroup(run: ToolItem[]): ActivityGroup | null {
  const first = run[0];
  const last = run[run.length - 1];
  if (first === undefined || last === undefined) return null;
  // The span is defined by its ends: a tool that never returned in the middle
  // of the run does not make the run's duration unknowable.
  const elapsedMs = first.at === null || last.doneAt === null ? null : last.doneAt - first.at;
  return {
    kind: "group",
    key: `g:${first.id}`,
    mode: modeOf(first),
    lines: run.map((item) => item.line),
    running: false,
    elapsedMs,
  };
}

export function groupTitle(row: ActivityGroup): string {
  if (row.mode === "write") return row.running ? "Updating knowledge base…" : "Updated knowledge base";
  if (row.running) return "Thinking…";
  return row.elapsedMs === null ? "Thought" : `Thought for ${formatDuration(row.elapsedMs)}`;
}

/** Drops zero units and always shows at least one, so a fast run reads "0s". */
export function formatDuration(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const parts: string[] = [];
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  return parts.length === 0 ? "0s" : parts.join(" ");
}
