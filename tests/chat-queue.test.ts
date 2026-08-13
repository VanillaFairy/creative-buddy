import { describe, it, expect } from "vitest";
import { Queued, advance, cancelAll, hasWaiting, setCanceled } from "../src/chat/queue";

const waiting = (...texts: string[]): Queued[] => texts.map((text) => ({ text, canceled: false }));
const canceled = (...texts: string[]): Queued[] => texts.map((text) => ({ text, canceled: true }));
/** What you typed: a message with no name on it. */
const typed = (text: string): { text: string } => ({ text });

describe("advance — a preset keeps its name", () => {
  const preset = { text: "Ask me the one question…", label: "Ask me" };

  it("hands the name over with the text when a waiting preset is released", () => {
    expect(advance([{ ...preset, canceled: false }], false).send).toEqual(preset);
  });

  it("hands the name over on a preset that goes straight out", () => {
    expect(advance([], false, preset)).toEqual({ queue: [], send: preset });
  });

  it("keeps the name on a preset that has to wait its turn", () => {
    expect(advance([], true, preset).queue).toEqual([{ ...preset, canceled: false }]);
  });

  it("sends what you typed with no name on it", () => {
    expect(advance([], false, { text: "what happens in act two?" }).send).toEqual({ text: "what happens in act two?" });
  });
});

describe("advance", () => {
  it("hands the message straight to the agent when nothing is running", () => {
    expect(advance([], false, typed("what happens in act two?"))).toEqual({ queue: [], send: typed("what happens in act two?") });
  });

  it("holds the message while a turn is in flight", () => {
    expect(advance([], true, typed("also, rename Nadia"))).toEqual({ queue: waiting("also, rename Nadia"), send: null });
  });

  it("keeps messages in the order they were typed", () => {
    expect(advance(waiting("first"), true, typed("second")).queue).toEqual(waiting("first", "second"));
  });

  it("releases the front of the queue when the turn ends", () => {
    expect(advance(waiting("first", "second"), false)).toEqual({ queue: waiting("second"), send: typed("first") });
  });

  it("releases one per turn, so each message gets its own answer", () => {
    const afterFirst = advance(waiting("first", "second"), false);
    expect(afterFirst.send).toEqual(typed("first"));
    // The next release only happens once that turn reports back.
    expect(advance(afterFirst.queue, true).send).toBeNull();
    expect(advance(afterFirst.queue, false)).toEqual({ queue: [], send: typed("second") });
  });

  it("has nothing to release when the queue is empty", () => {
    expect(advance([], false)).toEqual({ queue: [], send: null });
  });

  it("does not let a late message jump the line", () => {
    // The session died and came back: what was already waiting still goes first.
    expect(advance(waiting("earlier"), false, typed("later"))).toEqual({ queue: waiting("later"), send: typed("earlier") });
  });

  it("ignores blank input rather than queueing an empty turn", () => {
    expect(advance([], true, typed("   "))).toEqual({ queue: [], send: null });
  });

  it("skips over a message you took back", () => {
    const queue = [...canceled("taken back"), ...waiting("still due")];
    expect(advance(queue, false).send).toEqual(typed("still due"));
  });

  it("leaves the canceled ones on screen when something goes out — they are still resendable", () => {
    const queue = [...canceled("taken back"), ...waiting("still due", "after that")];
    expect(advance(queue, false).queue).toEqual([...canceled("taken back"), ...waiting("after that")]);
  });

  it("has nothing to send when everything has been taken back", () => {
    const queue = canceled("taken back");
    expect(advance(queue, false)).toEqual({ queue, send: null });
  });

  it("leaves the queue it was given alone", () => {
    const queue = waiting("first");
    advance(queue, true, typed("second"));
    advance(queue, false);
    expect(queue).toEqual(waiting("first"));
  });
});

describe("setCanceled", () => {
  it("takes one back and leaves it in place", () => {
    expect(setCanceled(waiting("a", "b", "c"), 1, true)).toEqual([
      { text: "a", canceled: false },
      { text: "b", canceled: true },
      { text: "c", canceled: false },
    ]);
  });

  it("puts one back in line where it was, so it keeps its place in the order", () => {
    const queue = [...waiting("a"), ...canceled("b"), ...waiting("c")];
    expect(setCanceled(queue, 1, false)).toEqual(waiting("a", "b", "c"));
  });

  it("leaves the queue as it was when the index is not in it", () => {
    expect(setCanceled(waiting("a", "b"), 7, true)).toEqual(waiting("a", "b"));
  });
});

describe("cancelAll", () => {
  it("takes back everything still waiting", () => {
    expect(cancelAll([...canceled("earlier"), ...waiting("a", "b")])).toEqual(canceled("earlier", "a", "b"));
  });

  it("is nothing to do on an empty queue", () => {
    expect(cancelAll([])).toEqual([]);
  });
});

describe("hasWaiting", () => {
  it("is true while something is still due to go out", () => {
    expect(hasWaiting([...canceled("gone"), ...waiting("due")])).toBe(true);
  });

  it("is false once everything has been taken back", () => {
    expect(hasWaiting(canceled("gone"))).toBe(false);
  });
});

describe("advance — a message keeps the note it was written about", () => {
  const about = { text: "answer the second one", note: "Fiction/Solaris/The contact.md" };

  it("carries the note out with a message that goes straight to the agent", () => {
    expect(advance([], false, about).send).toEqual(about);
  });

  it("carries the note out with a message that had to wait its turn", () => {
    // Written while reading one note, released a turn later — possibly while the
    // user is reading something else entirely. It still means the note it meant.
    expect(advance([{ ...about, canceled: false }], false).send).toEqual(about);
  });

  it("keeps the note through a cancel and a resend", () => {
    const queue = setCanceled([{ ...about, canceled: false }], 0, true);
    expect(advance(queue, false).send).toBeNull();
    expect(advance(setCanceled(queue, 0, false), false).send).toEqual(about);
  });

  it("leaves a message composed with no note open without one", () => {
    expect(advance([], false, typed("what happens in act two?")).send?.note).toBeUndefined();
  });
});
