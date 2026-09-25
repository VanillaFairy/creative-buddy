import { describe, it, expect } from "vitest";
import {
  SessionList,
  activate,
  activeSession,
  addSession,
  closeSession,
  emptySession,
  highestApprovalSeq,
  openOn,
  replaceSession,
  restoreSessions,
  sharedGraphs,
} from "../src/chat/sessions";
import { DEFAULT_EFFORT } from "../src/agent/effort";
import { TranscriptItem } from "../src/chat/transcript";

const MODEL = "sonnet";
const SEED = { model: MODEL, effort: "high" } as const;

function listOf(...graphDirs: Array<string | null>): SessionList {
  return {
    sessions: graphDirs.map((graphDir, i) => ({ ...emptySession(`t${i}`, SEED), graphDir })),
    active: 0,
    seq: graphDirs.length,
  };
}

describe("addSession", () => {
  it("appends a blank conversation and focuses it", () => {
    const list = addSession(listOf("A", "B"), SEED);
    expect(list.sessions).toHaveLength(3);
    expect(list.active).toBe(2);
    expect(activeSession(list).graphDir).toBeNull();
  });

  it("never reissues a key, even after the tab holding it was closed", () => {
    let list = addSession(listOf("A"), SEED);
    const firstKey = activeSession(list).key;
    list = addSession(closeSession(list, 1), SEED);
    expect(activeSession(list).key).not.toBe(firstKey);
  });

  it("opens the new conversation on a project when given one", () => {
    const list = addSession(listOf("A"), SEED, "B");
    expect(activeSession(list).graphDir).toBe("B");
    expect(activeSession(list).items).toEqual([]);
  });

  /** A second conversation on the same project is legal — you asked for it twice. */
  it("will open a second conversation on a project that already has one", () => {
    const list = addSession(listOf("A"), SEED, "A");
    expect(list.sessions.map((s) => s.graphDir)).toEqual(["A", "A"]);
    expect(list.active).toBe(1);
  });
});

describe("openOn", () => {
  it("goes back to the conversation already on that project instead of starting a second", () => {
    const list = openOn(activate(listOf("A", "B"), 1), "A", SEED);
    expect(list.sessions).toHaveLength(2);
    expect(list.active).toBe(0);
  });

  it("does nothing at all when you are already in that project's conversation", () => {
    const before = activate(listOf("A", "B"), 1);
    expect(openOn(before, "B", SEED)).toBe(before); // same object → nothing to save or redraw
  });

  /** Two tabs on one project predate this rule; landing on the one you are on beats jumping. */
  it("stays on the active tab when more than one is bound to the project", () => {
    const before = activate(listOf("A", "A"), 1);
    expect(openOn(before, "A", SEED).active).toBe(1);
  });

  it("binds the blank conversation you are sitting on rather than adding beside it", () => {
    const list = openOn(listOf(null), "A", SEED);
    expect(list.sessions).toHaveLength(1);
    expect(activeSession(list).graphDir).toBe("A");
  });

  it("adds a conversation on the project when the one you are on is in use", () => {
    const list = openOn(listOf("A"), "B", SEED);
    expect(list.sessions).toHaveLength(2);
    expect(list.active).toBe(1);
    expect(activeSession(list).graphDir).toBe("B");
  });

  /** Rebinding a live conversation would drop its session and orphan its transcript. */
  it("never rebinds a conversation that is already in use", () => {
    const list = openOn(listOf("A"), "B", SEED);
    expect(list.sessions[0]!.graphDir).toBe("A");
    expect(list.sessions[0]!.key).toBe("t0");
  });

  it("leaves the other conversations' transcripts alone", () => {
    const before = listOf("A", "B");
    const withTalk = replaceSession(before, "t1", {
      ...before.sessions[1]!,
      items: [{ kind: "user", text: "hello" } as TranscriptItem],
    });
    const list = openOn(withTalk, "C", SEED);
    expect(list.sessions[1]!.items).toHaveLength(1);
  });

  it("treats a project at the vault root as a project like any other", () => {
    const list = openOn(activate(listOf("", "A"), 1), "", SEED);
    expect(list.sessions).toHaveLength(2);
    expect(list.active).toBe(0);
  });
});

describe("closeSession", () => {
  it("lands on the tab that slid into the closed one's place", () => {
    const list = closeSession(activate(listOf("A", "B", "C"), 1), 1);
    expect(list.sessions.map((s) => s.graphDir)).toEqual(["A", "C"]);
    expect(activeSession(list).graphDir).toBe("C");
  });

  it("falls back to the new last tab when the end of the strip closes", () => {
    const list = closeSession(activate(listOf("A", "B", "C"), 2), 2);
    expect(activeSession(list).graphDir).toBe("B");
  });

  it("keeps you on the same conversation when a tab to its left closes", () => {
    const list = closeSession(activate(listOf("A", "B", "C"), 2), 0);
    expect(activeSession(list).graphDir).toBe("C");
  });

  it("keeps you on the same conversation when a tab to its right closes", () => {
    const list = closeSession(activate(listOf("A", "B", "C"), 0), 2);
    expect(activeSession(list).graphDir).toBe("A");
  });

  it("refuses to empty the panel", () => {
    const one = listOf("A");
    expect(closeSession(one, 0)).toBe(one);
  });

  it("ignores an index that is not there", () => {
    const list = listOf("A", "B");
    expect(closeSession(list, 7)).toBe(list);
    expect(closeSession(list, -1)).toBe(list);
  });
});

describe("activate", () => {
  it("ignores an index that is not there rather than blanking the panel", () => {
    const list = listOf("A", "B");
    expect(activate(list, 5)).toBe(list);
    expect(activeSession(activate(list, 1)).graphDir).toBe("B");
  });
});

describe("replaceSession", () => {
  it("swaps one conversation and leaves the strip alone", () => {
    const list = listOf("A", "B");
    const next = { ...list.sessions[1]!, graphDir: "C" };
    const after = replaceSession(list, "t1", next);
    expect(after.sessions.map((s) => s.graphDir)).toEqual(["A", "C"]);
    expect(after.active).toBe(list.active);
  });

  it("is a no-op for a key that has already been closed", () => {
    const list = listOf("A");
    expect(replaceSession(list, "gone", emptySession("gone", SEED)).sessions).toEqual(list.sessions);
  });
});

describe("restoreSessions", () => {
  it("opens one blank conversation for a panel that has never been used", () => {
    const list = restoreSessions(undefined, SEED);
    expect(list.sessions).toHaveLength(1);
    expect(list.sessions[0]!.model).toBe(MODEL);
    expect(list.active).toBe(0);
  });

  it("carries a pre-tab-strip panel's one conversation across, transcript intact", () => {
    const legacy = {
      graphDir: "Noir game",
      model: "opus",
      sessionId: "abc123",
      items: [{ kind: "user", text: "hello" }] as TranscriptItem[],
    };
    const list = restoreSessions(legacy, SEED);
    expect(list.sessions).toHaveLength(1);
    expect(list.sessions[0]).toMatchObject({ graphDir: "Noir game", model: "opus", sessionId: "abc123" });
    expect(list.sessions[0]!.items).toHaveLength(1);
  });

  it("treats a legacy panel that was never bound as legacy, not as never used", () => {
    const list = restoreSessions({ graphDir: null, items: [], sessionId: null }, SEED);
    expect(list.sessions).toHaveLength(1);
    expect(list.sessions[0]!.graphDir).toBeNull();
  });

  it("restores a tab strip and the tab that was open", () => {
    const list = restoreSessions(
      { sessions: [{ key: "t0", graphDir: "A" }, { key: "t1", graphDir: "B" }], active: 1 },
      SEED,
    );
    expect(list.sessions.map((s) => s.graphDir)).toEqual(["A", "B"]);
    expect(activeSession(list).graphDir).toBe("B");
  });

  it("clamps an active index that outlived its tab", () => {
    const list = restoreSessions({ sessions: [{ key: "t0", graphDir: "A" }], active: 4 }, SEED);
    expect(list.active).toBe(0);
  });

  it("mints keys past the ones on disk, so a new tab cannot collide", () => {
    const list = addSession(restoreSessions({ sessions: [{ key: "t7" }, { key: "t2" }] }, SEED), SEED);
    expect(activeSession(list).key).toBe("t8");
  });

  it("settles a bubble caught mid-stream by the restart", () => {
    const list = restoreSessions(
      { sessions: [{ items: [{ kind: "assistant", markdown: "half", streaming: true }] }] },
      SEED,
    );
    expect(list.sessions[0]!.items[0]).toMatchObject({ streaming: false });
  });

  it("reads a result saved before turns knew how they had ended", () => {
    // Those items only carried `isError`, which conflated a stop with a
    // failure. A restored one can only be read the pessimistic way, but it must
    // at least come back in the shape the panel now draws.
    const list = restoreSessions(
      { sessions: [{ items: [{ kind: "result", costUsd: 0.4, isError: true }, { kind: "result", costUsd: 0.1, isError: false }] }] },
      SEED,
    );
    expect(list.sessions[0]!.items).toEqual([
      { kind: "result", costUsd: 0.4, outcome: "error" },
      { kind: "result", costUsd: 0.1, outcome: "done" },
    ]);
  });

  it("falls back to the default model for a session that has none", () => {
    const list = restoreSessions({ sessions: [{ key: "t0" }] }, SEED);
    expect(list.sessions[0]!.model).toBe(MODEL);
  });

  it("moves a conversation saved on a pinned version onto that version's family", () => {
    const list = restoreSessions({ sessions: [{ key: "t0", model: "claude-opus-5" }] }, SEED);
    expect(list.sessions[0]!.model).toBe("opus");
  });

  it("keeps the effort a conversation was left on", () => {
    const list = restoreSessions({ sessions: [{ key: "t0", effort: "max" }] }, SEED);
    expect(list.sessions[0]!.effort).toBe("max");
  });

  it("seeds the effort of a panel written before effort existed", () => {
    const list = restoreSessions({ sessions: [{ key: "t0", graphDir: "A" }] }, SEED);
    expect(list.sessions[0]!.effort).toBe(SEED.effort);
  });

  it("does not pass on a stored effort that is not a level", () => {
    // Straight to the CLI otherwise, which rejects the session outright.
    const list = restoreSessions({ sessions: [{ key: "t0", effort: "ludicrous" }] }, SEED);
    expect(list.sessions[0]!.effort).toBe(DEFAULT_EFFORT);
  });

  it("keeps an effort the session's own model cannot use", () => {
    // The preference outlives the model: move this tab back off Haiku and the
    // level you picked is still there.
    const list = restoreSessions({ sessions: [{ key: "t0", model: "haiku", effort: "max" }] }, SEED);
    expect(list.sessions[0]!.effort).toBe("max");
  });
});

describe("highestApprovalSeq", () => {
  it("is zero for a transcript with no cards", () => {
    expect(highestApprovalSeq([{ kind: "user", text: "hi" } as TranscriptItem])).toBe(0);
  });

  it("finds the highest ordinal, not the last one", () => {
    const items = [
      { kind: "approval", id: "a7" },
      { kind: "approval", id: "a3" },
    ] as TranscriptItem[];
    expect(highestApprovalSeq(items)).toBe(7);
  });
});

describe("sharedGraphs", () => {
  it("names a graph bound twice in one panel", () => {
    expect([...sharedGraphs([["A", "B", "A"]])]).toEqual(["A"]);
  });

  it("names a graph bound once in each of two panels", () => {
    expect([...sharedGraphs([["A"], ["A"]])]).toEqual(["A"]);
  });

  it("says nothing about a graph bound once, or about unbound tabs", () => {
    expect([...sharedGraphs([["A", null], [null, "B"]])]).toEqual([]);
  });
});
