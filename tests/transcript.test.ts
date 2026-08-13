import { describe, it, expect } from "vitest";
import { reduceTranscript, formatToolLine, TranscriptItem, TranscriptEvent } from "../src/chat/transcript";

/** Folds events with a clock that ticks one second per event unless told otherwise. */
const apply = (events: TranscriptEvent[], clock?: number[]): TranscriptItem[] =>
  events.reduce<TranscriptItem[]>((items, e, i) => reduceTranscript(items, e, clock?.[i] ?? (i + 1) * 1000), []);

const read = (path: string): Record<string, unknown> => ({ file_path: path });

describe("preset messages", () => {
  it("records what a preset is called alongside the text the model was given", () => {
    // The label is stored rather than worked out later from the text: the
    // prompts are prose files meant to be reworded, and a rewording must not
    // reach back into conversations that already happened.
    const items = apply([{ type: "user-sent", text: "Ask me the one question…", label: "Ask me" }]);
    expect(items).toEqual([{ kind: "user", text: "Ask me the one question…", label: "Ask me" }]);
  });

  it("leaves a typed message unlabelled, so it still renders as the words themselves", () => {
    const [item] = apply([{ type: "user-sent", text: "hi" }]);
    expect((item as { label?: string }).label).toBeUndefined();
  });
});

describe("reduceTranscript", () => {
  it("accumulates streaming deltas into one assistant item and finalizes it", () => {
    const items = apply([
      { type: "user-sent", text: "hi" },
      { type: "text-delta", text: "Hel" },
      { type: "text-delta", text: "lo" },
      { type: "assistant-final", text: "Hello" },
    ]);
    expect(items).toEqual([
      { kind: "user", text: "hi" },
      { kind: "assistant", markdown: "Hello", streaming: false },
    ]);
  });

  it("keeps tool activity as compact items correlated by id", () => {
    const items = apply(
      [
        { type: "tool-use", id: "t1", name: "Write", input: { file_path: "C:/v/Noir game/X.md", content: "..." }, existed: false },
        { type: "tool-result", toolUseId: "t1" },
      ],
      [1_000, 4_000],
    );
    expect(items).toEqual([
      { kind: "tool", id: "t1", name: "Write", line: "X.md : added", done: true, at: 1_000, doneAt: 4_000 },
    ]);
  });

  it("does not retain the tool input — note bodies must not reach workspace.json", () => {
    const items = apply([{ type: "tool-use", id: "t1", name: "Write", input: { file_path: "a.md", content: "a whole note" } }]);
    expect(items[0]).not.toHaveProperty("input");
  });

  it("leaves doneAt null until the result lands", () => {
    const items = apply([{ type: "tool-use", id: "t1", name: "Read", input: read("a.md") }], [7_000]);
    expect(items[0]).toMatchObject({ done: false, at: 7_000, doneAt: null });
  });

  it("stamps doneAt only on the tool the result belongs to", () => {
    const items = apply(
      [
        { type: "tool-use", id: "t1", name: "Read", input: read("a.md") },
        { type: "tool-use", id: "t2", name: "Read", input: read("b.md") },
        { type: "tool-result", toolUseId: "t2" },
      ],
      [1_000, 2_000, 5_000],
    );
    expect(items.map((i) => (i.kind === "tool" ? [i.id, i.done, i.doneAt] : null))).toEqual([
      ["t1", false, null],
      ["t2", true, 5_000],
    ]);
  });

  it("a new assistant stream after a tool starts a fresh bubble", () => {
    const items = apply([
      { type: "text-delta", text: "Filing." },
      { type: "tool-use", id: "t1", name: "Read", input: read("a.md") },
      { type: "text-delta", text: "Next question…" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["assistant", "tool", "assistant"]);
  });

  it("approvals resolve in place", () => {
    let items = apply([
      { type: "approval", id: "a1", toolName: "Edit", targetPath: "Здоровье/n.md", reason: "outside the graph", title: null },
    ]);
    items = reduceTranscript(items, { type: "approval-resolved", id: "a1", allowed: false }, 0);
    expect(items).toEqual([
      { kind: "approval", id: "a1", toolName: "Edit", targetPath: "Здоровье/n.md", reason: "outside the graph", title: null, resolution: "denied" },
    ]);
  });

  it("carries the SDK's own prompt line when there is one", () => {
    const items = apply([
      {
        type: "approval",
        id: "a2",
        toolName: "Write",
        targetPath: "Здоровье/n.md",
        reason: "outside the graph",
        title: "Claude wants to write Здоровье/n.md",
      },
    ]);
    expect(items).toEqual([
      {
        kind: "approval",
        id: "a2",
        toolName: "Write",
        targetPath: "Здоровье/n.md",
        reason: "outside the graph",
        title: "Claude wants to write Здоровье/n.md",
        resolution: "pending",
      },
    ]);
  });

  it("results and errors append trailing notices", () => {
    const items = apply([
      { type: "result", costUsd: 0.42, isError: false },
      { type: "error", message: "boom" },
    ]);
    expect(items).toEqual([
      { kind: "result", costUsd: 0.42, isError: false },
      { kind: "notice", tone: "error", text: "boom" },
    ]);
  });
});

describe("formatToolLine", () => {
  const plain = { subagent: false, existed: false };

  it("summarises each read-only tool in one line", () => {
    expect(formatToolLine("Read", read("C:/v/G/x.md"), plain)).toBe("Read x.md");
    expect(formatToolLine("Grep", { pattern: "parent:" }, plain)).toBe('Grep "parent:"');
    expect(formatToolLine("Glob", { pattern: "**/*.md" }, plain)).toBe('Glob "**/*.md"');
    expect(formatToolLine("Task", { description: "scout the graph" }, plain)).toBe("Scout: scout the graph");
  });

  it("names the note and the verb for writes, not the tool", () => {
    expect(formatToolLine("Write", read("C:/v/G/New Note.md"), { subagent: false, existed: false })).toBe("New Note.md : added");
    expect(formatToolLine("Write", read("C:/v/G/New Note.md"), { subagent: false, existed: true })).toBe("New Note.md : updated");
    expect(formatToolLine("Edit", read("C:/v/G/x.md"), { subagent: false, existed: true })).toBe("x.md : updated");
  });

  it("treats a rewritten existing note as an update, not an addition", () => {
    // The zero-byte recovery path tells the model to Write a note it already
    // wrote; calling that "added" would be a lie.
    expect(formatToolLine("Write", read("hub.md"), { subagent: false, existed: true })).toBe("hub.md : updated");
  });

  it("falls back to the bare tool name when the input carries nothing to show", () => {
    expect(formatToolLine("Read", {}, plain)).toBe("Read");
    expect(formatToolLine("Write", {}, plain)).toBe("Write");
    expect(formatToolLine("Grep", {}, plain)).toBe("Grep");
    expect(formatToolLine("Task", {}, plain)).toBe("Scout");
  });

  it("labels tool calls made by the scout, not the interviewer", () => {
    expect(formatToolLine("Read", read("N/x.md"), { subagent: true, existed: false })).toBe("scout · Read x.md");
    expect(formatToolLine("Read", read("N/x.md"), plain)).toBe("Read x.md");
  });
});

describe("subagent tool lines (M2 hardening)", () => {
  it("carries the scout label through the reducer", () => {
    const items = reduceTranscript([], { type: "tool-use", id: "t1", name: "Read", input: read("N/x.md"), subagent: true }, 0);
    expect(items[0]).toMatchObject({ kind: "tool", line: "scout · Read x.md" });
    const own = reduceTranscript([], { type: "tool-use", id: "t2", name: "Read", input: read("N/x.md") }, 0);
    expect(own[0]).toMatchObject({ kind: "tool", line: "Read x.md" });
  });
});
