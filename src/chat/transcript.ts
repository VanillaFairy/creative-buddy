import { baseName } from "../graph/types";

export type TranscriptItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; markdown: string; streaming: boolean }
  | { kind: "tool"; id: string; name: string; line: string; input: Record<string, unknown>; done: boolean }
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
  | { kind: "result"; costUsd: number; isError: boolean };

export type TranscriptEvent =
  | { type: "user-sent"; text: string }
  | { type: "text-delta"; text: string }
  | { type: "assistant-final"; text: string }
  | { type: "tool-use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool-result"; toolUseId: string }
  | { type: "approval"; id: string; toolName: string; targetPath: string | null; reason: string; title: string | null }
  | { type: "approval-resolved"; id: string; allowed: boolean }
  | { type: "notice"; text: string }
  | { type: "result"; costUsd: number; isError: boolean }
  | { type: "error"; message: string };

export function formatToolLine(name: string, input: Record<string, unknown>): string {
  const path = typeof input["file_path"] === "string" ? baseName((input["file_path"] as string).replace(/\\/g, "/")) : null;
  switch (name) {
    case "Read":
    case "Write":
    case "Edit":
      return path !== null ? `${name} ${path}` : name;
    case "Grep":
    case "Glob":
      return typeof input["pattern"] === "string" ? `${name} "${input["pattern"]}"` : name;
    case "Task":
      return typeof input["description"] === "string" ? `Scout: ${input["description"]}` : "Scout";
    default:
      return name;
  }
}

/** Pure fold of session events into renderable items. Always returns a new array. */
export function reduceTranscript(items: TranscriptItem[], event: TranscriptEvent): TranscriptItem[] {
  const next = [...items];
  const last = next[next.length - 1];

  switch (event.type) {
    case "user-sent":
      next.push({ kind: "user", text: event.text });
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

    case "tool-use":
      next.push({ kind: "tool", id: event.id, name: event.name, line: formatToolLine(event.name, event.input), input: event.input, done: false });
      return next;

    case "tool-result":
      return next.map((item) => (item.kind === "tool" && item.id === event.toolUseId ? { ...item, done: true } : item));

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

    case "result":
      next.push({ kind: "result", costUsd: event.costUsd, isError: event.isError });
      return next;

    case "error":
      next.push({ kind: "notice", tone: "error", text: event.message });
      return next;
  }
}
