import { asLevel, EffortLevel } from "../agent/effort";
import { TranscriptItem } from "./transcript";

/**
 * A chat panel holds several conversations behind its own tab strip, the way
 * Claudian does — one Obsidian leaf, many sessions. This module owns the
 * bookkeeping: what a restored panel looks like, which tab a close lands you
 * on, and which graphs are bound in more than one place.
 */

/** One conversation. Exactly what survives a restart. */
export interface ChatSession {
  /** Stable across restarts, so live per-session state can be keyed on it. */
  key: string;
  graphDir: string | null;
  model: string;
  /** Kept even on a model with no effort, so switching back restores it. */
  effort: EffortLevel;
  sessionId: string | null;
  items: TranscriptItem[];
}

/** What a new conversation starts as, before you have said anything to it. */
export interface SessionSeed {
  model: string;
  effort: EffortLevel;
}

export interface SessionList {
  sessions: ChatSession[];
  active: number;
  /** Mints the next key. Persisted, so a restored panel cannot reissue one. */
  seq: number;
}

export function emptySession(key: string, seed: SessionSeed, graphDir: string | null = null): ChatSession {
  return { key, graphDir, model: seed.model, effort: seed.effort, sessionId: null, items: [] };
}

/**
 * A new conversation always opens focused — you asked for it. It opens on a
 * project when the caller resolved one, and unbound (so the picker asks) when it
 * did not; a second conversation on a project that already has one is allowed,
 * because asking for a new conversation twice is a thing people do.
 */
export function addSession(list: SessionList, seed: SessionSeed, graphDir: string | null = null): SessionList {
  return {
    sessions: [...list.sessions, emptySession(`t${list.seq}`, seed, graphDir)],
    active: list.sessions.length,
    seq: list.seq + 1,
  };
}

/**
 * Closing lands you on the tab that slides into the closed one's place — its
 * right neighbour, or the new last tab when you closed the end of the strip.
 *
 * A panel always keeps one conversation, so closing the only tab does nothing
 * and the shell hides the control rather than offering a dead button.
 */
export function closeSession(list: SessionList, index: number): SessionList {
  if (list.sessions.length <= 1 || index < 0 || index >= list.sessions.length) return list;
  const sessions = list.sessions.filter((_, i) => i !== index);
  const active = index < list.active ? list.active - 1 : Math.min(list.active, sessions.length - 1);
  return { ...list, sessions, active };
}

export function activate(list: SessionList, index: number): SessionList {
  return index < 0 || index >= list.sessions.length ? list : { ...list, active: index };
}

/** Replaces one conversation in place, leaving the rest of the strip alone. */
export function replaceSession(list: SessionList, key: string, next: ChatSession): SessionList {
  return { ...list, sessions: list.sessions.map((s) => (s.key === key ? next : s)) };
}

/** A conversation nobody has used yet — another one beside it would be a copy. */
export function isPristine(session: ChatSession): boolean {
  return session.graphDir === null && session.items.length === 0;
}

/**
 * Open the panel on a project: the conversation you already have about it, or a
 * new one when there is none.
 *
 * Asking for a project you are already talking about has to be a way *back* to
 * that thread, not a second thread beside it — two conversations on one graph
 * both write to it and the last write wins. A conversation already in use is
 * never rebound either: its Claude session and transcript belong to the project
 * it was opened on, so a fresh tab is the only honest place to put another.
 */
export function openOn(list: SessionList, graphDir: string, seed: SessionSeed): SessionList {
  // Returned unchanged, so the caller has nothing to save and nothing to redraw.
  if (activeSession(list).graphDir === graphDir) return list;
  const existing = list.sessions.findIndex((s) => s.graphDir === graphDir);
  if (existing !== -1) return activate(list, existing);
  // The blank conversation you are sitting on is the one to use; anything in use
  // keeps its own project and gets a new tab beside it.
  if (!isPristine(activeSession(list))) return addSession(list, seed, graphDir);
  const target = activeSession(list);
  return replaceSession(list, target.key, { ...target, graphDir });
}

export function activeSession(list: SessionList): ChatSession {
  // The list is never empty, but an index out of step with it would otherwise
  // crash the whole panel rather than one tab.
  return list.sessions[list.active] ?? list.sessions[0]!;
}

/**
 * Rebuilds a panel from workspace.json.
 *
 * Understands the one-session-per-leaf shape this plugin used before the tab
 * strip existed, so an upgrade keeps the transcripts that are already on disk
 * rather than opening a blank panel over them.
 */
export function restoreSessions(raw: unknown, seed: SessionSeed): SessionList {
  const state = (raw ?? {}) as Record<string, unknown>;
  const stored = state["sessions"];
  const rows: unknown[] = Array.isArray(stored)
    ? stored
    : isLegacyPanel(state)
      ? [state]
      : [];

  const sessions = rows.map((row, i) => restoreSession(row, seed, `t${i}`));
  if (sessions.length === 0) sessions.push(emptySession("t0", seed));

  const active = Number.isInteger(state["active"]) ? (state["active"] as number) : 0;
  return {
    sessions,
    active: Math.min(Math.max(active, 0), sessions.length - 1),
    seq: nextSeq(sessions),
  };
}

/** A pre-tab-strip panel wrote its one conversation at the top level. */
function isLegacyPanel(state: Record<string, unknown>): boolean {
  return "graphDir" in state || "items" in state || "sessionId" in state;
}

function restoreSession(raw: unknown, seed: SessionSeed, fallbackKey: string): ChatSession {
  const row = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(row["items"]) ? (row["items"] as TranscriptItem[]) : [];
  return {
    key: typeof row["key"] === "string" && row["key"] !== "" ? row["key"] : fallbackKey,
    graphDir: typeof row["graphDir"] === "string" ? row["graphDir"] : null,
    model: typeof row["model"] === "string" ? row["model"] : seed.model,
    // A panel written before effort existed has none, and workspace.json is a
    // file anyone can edit, so the stored value is read rather than trusted.
    effort: asLevel(row["effort"], seed.effort),
    sessionId: typeof row["sessionId"] === "string" ? row["sessionId"] : null,
    items: items.map(restoreItem),
  };
}

/** Past every key already in use, so a restored panel cannot mint a collision. */
function nextSeq(sessions: ChatSession[]): number {
  let highest = -1;
  for (const session of sessions) {
    const n = Number(/^t(\d+)$/.exec(session.key)?.[1] ?? NaN);
    if (Number.isInteger(n) && n > highest) highest = n;
  }
  return highest + 1;
}

/**
 * Repairs an item coming back from workspace.json.
 *
 * A bubble caught mid-stream by a restart would stay "streaming" (plain text,
 * dimmed) forever — the stream it belonged to is gone. A tool item written
 * before the activity panels carries an `input` blob and no timestamps; the
 * destructuring drops the blob and the nulls make its panel report an unknown
 * duration rather than a nonsense one. A result written before turns knew how
 * they had ended carries only `isError`, which cannot tell a stop from a
 * failure — the old flag is all there is, so it is read as written.
 */
export function restoreItem(item: TranscriptItem): TranscriptItem {
  if (item.kind === "assistant" && item.streaming) return { ...item, streaming: false };
  if (item.kind === "tool") {
    const { id, name, line, done } = item;
    return { kind: "tool", id, name, line, done, at: item.at ?? null, doneAt: item.doneAt ?? null };
  }
  if (item.kind === "result" && item.outcome === undefined) {
    const legacy = (item as { isError?: boolean }).isError === true;
    return { kind: "result", costUsd: item.costUsd, outcome: legacy ? "error" : "done" };
  }
  return item;
}

/**
 * Highest approval ordinal already in a transcript. Restored cards keep their
 * "a<N>" ids, so a counter starting from zero would reissue one and resolving
 * a new card would flip the restored one too.
 */
export function highestApprovalSeq(items: TranscriptItem[]): number {
  let highest = 0;
  for (const item of items) {
    if (item.kind !== "approval") continue;
    const n = Number(/^a(\d+)$/.exec(item.id)?.[1] ?? 0);
    if (n > highest) highest = n;
  }
  return highest;
}

/**
 * Graphs bound by more than one conversation, across every panel's sessions.
 * Two conversations on one graph both write to it and the last write wins, so
 * both tabs need to say so — not just the one opened second.
 */
export function sharedGraphs(panels: ReadonlyArray<ReadonlyArray<string | null>>): Set<string> {
  const counts = new Map<string, number>();
  for (const panel of panels) {
    for (const graphDir of panel) {
      if (graphDir === null) continue;
      counts.set(graphDir, (counts.get(graphDir) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([dir]) => dir));
}
