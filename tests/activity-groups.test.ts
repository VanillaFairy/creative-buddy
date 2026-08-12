import { describe, it, expect } from "vitest";
import { TranscriptItem } from "../src/chat/transcript";
import { groupActivity, groupTitle, formatDuration, ActivityRow, ActivityGroup } from "../src/chat/activity-groups";

const tool = (id: string, name: string, opts: { at?: number | null; doneAt?: number | null; line?: string } = {}): TranscriptItem => ({
  kind: "tool",
  id,
  name,
  line: opts.line ?? `${name} ${id}`,
  done: opts.doneAt !== undefined && opts.doneAt !== null,
  at: opts.at === undefined ? 0 : opts.at,
  doneAt: opts.doneAt === undefined ? null : opts.doneAt,
});

const say = (text: string): TranscriptItem => ({ kind: "assistant", markdown: text, streaming: false });

const groupsOf = (rows: ActivityRow[]): ActivityGroup[] => rows.filter((r): r is ActivityGroup => r.kind === "group");
const shape = (rows: ActivityRow[]): string[] => rows.map((r) => (r.kind === "group" ? r.mode : r.item.kind));

describe("groupActivity — run boundaries", () => {
  it("folds a run of read-only calls into one explore group", () => {
    const rows = groupActivity([tool("t1", "Read"), tool("t2", "Glob"), tool("t3", "Grep")], false);
    expect(shape(rows)).toEqual(["explore"]);
    expect(groupsOf(rows)[0]?.lines).toEqual(["Read t1", "Glob t2", "Grep t3"]);
  });

  it("folds a run of note writes into one write group", () => {
    const rows = groupActivity([tool("t1", "Write"), tool("t2", "Edit")], false);
    expect(shape(rows)).toEqual(["write"]);
  });

  it("splits when the mode changes mid-run", () => {
    const rows = groupActivity([tool("t1", "Read"), tool("t2", "Write"), tool("t3", "Read")], false);
    expect(shape(rows)).toEqual(["explore", "write", "explore"]);
  });

  it("assistant narration between two read batches makes two groups, not one", () => {
    const rows = groupActivity([tool("t1", "Read"), say("Let me check one more thing."), tool("t2", "Read")], false);
    expect(shape(rows)).toEqual(["explore", "assistant", "explore"]);
  });

  it("an approval card interrupts a run so it cannot hide behind a collapsed header", () => {
    const approval: TranscriptItem = {
      kind: "approval",
      id: "a1",
      toolName: "Write",
      targetPath: "Other/n.md",
      reason: "outside the graph",
      title: null,
      resolution: "pending",
    };
    const rows = groupActivity([tool("t1", "Write"), approval, tool("t2", "Write")], false);
    expect(shape(rows)).toEqual(["write", "approval", "write"]);
  });

  it("passes non-tool items through untouched and in order", () => {
    const items = [say("hi"), tool("t1", "Read"), { kind: "result" as const, costUsd: 0.4, isError: false }];
    const rows = groupActivity(items, false);
    expect(shape(rows)).toEqual(["assistant", "explore", "result"]);
    expect(rows[0]).toMatchObject({ kind: "item", item: items[0] });
  });

  it("returns nothing for an empty transcript", () => {
    expect(groupActivity([], false)).toEqual([]);
    expect(groupActivity([], true)).toEqual([]);
  });
});

describe("groupActivity — mode classification", () => {
  it("counts the scout dispatch and its nested reads as exploring", () => {
    const rows = groupActivity([tool("t1", "Task"), tool("t2", "Read"), tool("t3", "Grep")], false);
    expect(shape(rows)).toEqual(["explore"]);
  });

  it("keeps an unrecognised tool visible rather than dropping it", () => {
    const rows = groupActivity([tool("t1", "Bash")], false);
    expect(shape(rows)).toEqual(["explore"]);
    expect(groupsOf(rows)[0]?.lines).toEqual(["Bash t1"]);
  });
});

describe("groupActivity — running", () => {
  it("marks only the trailing group as running while the turn is in flight", () => {
    const rows = groupActivity([tool("t1", "Read"), say("Filing."), tool("t2", "Write")], true);
    expect(groupsOf(rows).map((g) => g.running)).toEqual([false, true]);
  });

  it("settles every group once the turn is done", () => {
    const rows = groupActivity([tool("t1", "Read"), say("Filing."), tool("t2", "Write")], false);
    expect(groupsOf(rows).map((g) => g.running)).toEqual([false, false]);
  });

  it("does not mark a group running when something else trails it", () => {
    const rows = groupActivity([tool("t1", "Read"), say("Done.")], true);
    expect(groupsOf(rows).map((g) => g.running)).toEqual([false]);
  });
});

describe("groupActivity — elapsed", () => {
  it("spans the first call's start to the last call's finish", () => {
    const rows = groupActivity(
      [tool("t1", "Read", { at: 1_000, doneAt: 2_000 }), tool("t2", "Read", { at: 2_100, doneAt: 6_000 })],
      false,
    );
    expect(groupsOf(rows)[0]?.elapsedMs).toBe(5_000);
  });

  it("ignores gaps in the middle — the span is defined by its ends", () => {
    const rows = groupActivity(
      [
        tool("t1", "Read", { at: 1_000, doneAt: 2_000 }),
        tool("t2", "Read", { at: 2_000, doneAt: null }),
        tool("t3", "Read", { at: 3_000, doneAt: 9_000 }),
      ],
      false,
    );
    expect(groupsOf(rows)[0]?.elapsedMs).toBe(8_000);
  });

  it("reports an unknown duration when the last call never returned", () => {
    const rows = groupActivity([tool("t1", "Read", { at: 1_000, doneAt: null })], false);
    expect(groupsOf(rows)[0]?.elapsedMs).toBeNull();
  });

  it("reports an unknown duration for items restored without timestamps", () => {
    const rows = groupActivity([tool("t1", "Read", { at: null, doneAt: null })], false);
    expect(groupsOf(rows)[0]?.elapsedMs).toBeNull();
  });
});

describe("groupActivity — keys", () => {
  it("keys a group by its first call so an expanded panel survives new calls landing in it", () => {
    const before = groupActivity([tool("t1", "Read")], true);
    const after = groupActivity([tool("t1", "Read"), tool("t2", "Read")], true);
    expect(after[0]?.key).toBe(before[0]?.key);
  });

  it("gives every row a distinct key", () => {
    const rows = groupActivity([tool("t1", "Read"), say("a"), tool("t2", "Write"), say("b")], false);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe("formatDuration", () => {
  it("drops zero units and always shows at least one", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(999)).toBe("0s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(80_000)).toBe("1m 20s");
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(3_605_000)).toBe("1h 5s");
    expect(formatDuration(3_665_000)).toBe("1h 1m 5s");
  });

  it("never renders a negative duration", () => {
    expect(formatDuration(-5_000)).toBe("0s");
  });
});

describe("groupTitle", () => {
  const group = (over: Partial<ActivityGroup>): ActivityGroup => ({
    kind: "group",
    key: "g:t1",
    mode: "explore",
    lines: [],
    running: false,
    elapsedMs: 0,
    ...over,
  });

  it("says what the panel is doing while it runs", () => {
    expect(groupTitle(group({ mode: "explore", running: true }))).toBe("Thinking…");
    expect(groupTitle(group({ mode: "write", running: true }))).toBe("Updating knowledge base…");
  });

  it("says what the panel did once it settles", () => {
    expect(groupTitle(group({ mode: "explore", elapsedMs: 80_000 }))).toBe("Thought for 1m 20s");
    expect(groupTitle(group({ mode: "write" }))).toBe("Updated knowledge base");
  });

  it("drops the duration when there is none to report", () => {
    expect(groupTitle(group({ mode: "explore", elapsedMs: null }))).toBe("Thought");
  });
});
