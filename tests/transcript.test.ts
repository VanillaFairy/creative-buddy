import { describe, it, expect } from "vitest";
import { reduceTranscript, formatToolLine, TranscriptItem } from "../src/chat/transcript";

const apply = (events: Parameters<typeof reduceTranscript>[1][]): TranscriptItem[] =>
  events.reduce<TranscriptItem[]>((items, e) => reduceTranscript(items, e), []);

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
    const items = apply([
      { type: "tool-use", id: "t1", name: "Write", input: { file_path: "C:/v/Noir game/X.md", content: "..." } },
      { type: "tool-result", toolUseId: "t1" },
    ]);
    expect(items).toEqual([
      { kind: "tool", id: "t1", name: "Write", line: formatToolLine("Write", { file_path: "C:/v/Noir game/X.md" }), input: { file_path: "C:/v/Noir game/X.md", content: "..." }, done: true },
    ]);
  });

  it("a new assistant stream after a tool starts a fresh bubble", () => {
    const items = apply([
      { type: "text-delta", text: "Filing." },
      { type: "tool-use", id: "t1", name: "Read", input: { file_path: "a.md" } },
      { type: "text-delta", text: "Next question…" },
    ]);
    expect(items.map((i) => i.kind)).toEqual(["assistant", "tool", "assistant"]);
  });

  it("approvals resolve in place", () => {
    let items = apply([{ type: "approval", id: "a1", toolName: "Edit", targetPath: "Здоровье/n.md", reason: "outside the graph" }]);
    items = reduceTranscript(items, { type: "approval-resolved", id: "a1", allowed: false });
    expect(items).toEqual([
      { kind: "approval", id: "a1", toolName: "Edit", targetPath: "Здоровье/n.md", reason: "outside the graph", resolution: "denied" },
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
  it("summarises each contract tool in one line", () => {
    expect(formatToolLine("Read", { file_path: "C:/v/G/x.md" })).toBe("Read x.md");
    expect(formatToolLine("Write", { file_path: "C:/v/G/New Note.md" })).toBe("Write New Note.md");
    expect(formatToolLine("Edit", { file_path: "C:/v/G/x.md" })).toBe("Edit x.md");
    expect(formatToolLine("Grep", { pattern: "parent:" })).toBe('Grep "parent:"');
    expect(formatToolLine("Glob", { pattern: "**/*.md" })).toBe('Glob "**/*.md"');
    expect(formatToolLine("Task", { description: "scout the graph" })).toBe("Scout: scout the graph");
  });
});
