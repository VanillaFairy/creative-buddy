import { baseName } from "../graph/types";

export type TranscriptItem =
  /**
   * Your turn. `label` is set when a preset said it for you, and is what the
   * panel draws in place of the text — the paragraph behind a preset is
   * machinery, and re-reading it every time you scroll past is not a record,
   * it is noise. The text stays, so the record is still exact.
   */
  | { kind: "user"; text: string; label?: string }
  | { kind: "assistant"; markdown: string; streaming: boolean }
  | {
      kind: "tool";
      id: string;
      name: string;
      line: string;
      done: boolean;
      /** Epoch ms the call started. Null only on items restored from a pre-panels workspace.json. */
      at: number | null;
      /** Epoch ms the result landed; null while the call is still in flight. */
      doneAt: number | null;
    }
  | {
      kind: "approval";
      id: string;
      toolName: string;
      targetPath: string | null;
      reason: string;
      /** The SDK's own prompt line, when it sent one; null means we render our own. */
      title: string | null;
      resolution: "pending" | "allowed" | "denied";
    }
  | { kind: "notice"; tone: "info" | "error"; text: string }
  /**
   * The rule under the turn. `reason` is the failure's own words, and is set
   * only when there was a failure and it had something to say.
   */
  | { kind: "result"; costUsd: number; outcome: TurnOutcome; reason?: string };

/** How a turn ended. Stopping one is a thing you did, not a thing that broke. */
export type TurnOutcome = "done" | "stopped" | "error";

/** Long enough for a real message, short enough to live in workspace.json. */
const REASON_LIMIT = 300;

export type TranscriptEvent =
  | { type: "user-sent"; text: string; label?: string }
  | { type: "text-delta"; text: string }
  | { type: "assistant-final"; text: string }
  | {
      type: "tool-use";
      id: string;
      name: string;
      input: Record<string, unknown>;
      subagent?: boolean;
      /** Whether the write target was already a note in the vault. Only meaningful for Write/Edit. */
      existed?: boolean;
    }
  | { type: "tool-result"; toolUseId: string }
  | { type: "approval"; id: string; toolName: string; targetPath: string | null; reason: string; title: string | null }
  | { type: "approval-resolved"; id: string; allowed: boolean }
  | { type: "notice"; text: string }
  /**
   * `stopped` is the shell's own knowledge — it is what asked for the stop. The
   * SDK cannot supply it: an aborted turn comes back flagged `is_error` exactly
   * like one that failed.
   */
  | { type: "result"; costUsd: number; stopped: boolean; isError: boolean; resultText: string }
  | { type: "error"; message: string };

export interface ToolLineContext {
  /** The call came from the kg-scout subagent rather than the interviewer itself. */
  subagent: boolean;
  /** The write target was already a note in the vault, so this is an update rather than an addition. */
  existed: boolean;
}

/**
 * The one line a tool call contributes to its activity panel. Read-only calls
 * name the tool; writes name the note and what happened to it, because that is
 * what the "Updating knowledge base" panel is a list of.
 */
export function formatToolLine(name: string, input: Record<string, unknown>, ctx: ToolLineContext): string {
  const path = typeof input["file_path"] === "string" ? baseName(input["file_path"].replace(/\\/g, "/")) : null;
  return (ctx.subagent ? "scout · " : "") + toolBody(name, input, path, ctx.existed);
}

function toolBody(name: string, input: Record<string, unknown>, path: string | null, existed: boolean): string {
  switch (name) {
    case "Read":
      return path !== null ? `Read ${path}` : name;
    // A Write onto a note that is already there is an update — the model
    // rewrites whole notes, and the zero-byte recovery path asks it to.
    case "Write":
      return path !== null ? `${path} : ${existed ? "updated" : "added"}` : name;
    case "Edit":
      return path !== null ? `${path} : updated` : name;
    case "Grep":
    case "Glob":
      return typeof input["pattern"] === "string" ? `${name} "${input["pattern"]}"` : name;
    case "Task":
      return typeof input["description"] === "string" ? `Scout: ${input["description"]}` : "Scout";
    default:
      return name;
  }
}

/** A failure's own words, or null when it had none worth keeping. */
function trimReason(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  return trimmed.length <= REASON_LIMIT ? trimmed : `${trimmed.slice(0, REASON_LIMIT - 1)}…`;
}

/**
 * Pure fold of session events into renderable items. Always returns a new array.
 * The caller owns the clock — `now` is epoch ms, so tests can pin it.
 */
export function reduceTranscript(items: TranscriptItem[], event: TranscriptEvent, now: number): TranscriptItem[] {
  const next = [...items];
  const last = next[next.length - 1];

  switch (event.type) {
    case "user-sent":
      next.push({ kind: "user", text: event.text, label: event.label });
      return next;

    case "text-delta":
      if (last !== undefined && last.kind === "assistant" && last.streaming) {
        next[next.length - 1] = { ...last, markdown: last.markdown + event.text };
      } else {
        next.push({ kind: "assistant", markdown: event.text, streaming: true });
      }
      return next;

    case "assistant-final":
      if (last !== undefined && last.kind === "assistant" && last.streaming) {
        next[next.length - 1] = { kind: "assistant", markdown: event.text, streaming: false };
      } else {
        next.push({ kind: "assistant", markdown: event.text, streaming: false });
      }
      return next;

    case "tool-use": {
      const line = formatToolLine(event.name, event.input, { subagent: event.subagent === true, existed: event.existed === true });
      // The input is deliberately not kept: it carries whole note bodies, and
      // items are persisted into workspace.json.
      next.push({ kind: "tool", id: event.id, name: event.name, line, done: false, at: now, doneAt: null });
      return next;
    }

    case "tool-result":
      return next.map((item) => (item.kind === "tool" && item.id === event.toolUseId ? { ...item, done: true, doneAt: now } : item));

    case "approval":
      next.push({
        kind: "approval",
        id: event.id,
        toolName: event.toolName,
        targetPath: event.targetPath,
        reason: event.reason,
        title: event.title,
        resolution: "pending",
      });
      return next;

    case "approval-resolved":
      return next.map((item) =>
        item.kind === "approval" && item.id === event.id ? { ...item, resolution: event.allowed ? "allowed" : "denied" } : item,
      );

    case "notice":
      next.push({ kind: "notice", tone: "info", text: event.text });
      return next;

    case "result": {
      // A stop wins over the error flag: the abort races the turn's own
      // ending, and which side got there first says nothing about what you
      // asked for.
      if (event.stopped) {
        next.push({ kind: "result", costUsd: event.costUsd, outcome: "stopped" });
        return next;
      }
      if (!event.isError) {
        next.push({ kind: "result", costUsd: event.costUsd, outcome: "done" });
        return next;
      }
      const reason = trimReason(event.resultText);
      next.push({ kind: "result", costUsd: event.costUsd, outcome: "error", ...(reason === null ? {} : { reason }) });
      return next;
    }

    case "error":
      next.push({ kind: "notice", tone: "error", text: event.message });
      return next;
  }
}
