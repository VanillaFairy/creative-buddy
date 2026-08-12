import { describe, it, expect } from "vitest";
import { Queued, advance, cancelAll, hasWaiting, setCanceled } from "../src/chat/queue";

const waiting = (...texts: string[]): Queued[] => texts.map((text) => ({ text, canceled: false }));
const canceled = (...texts: string[]): Queued[] => texts.map((text) => ({ text, canceled: true }));

describe("advance", () => {
  it("hands the message straight to the agent when nothing is running", () => {
    expect(advance([], false, "what happens in act two?")).toEqual({ queue: [], send: "what happens in act two?" });
  });

  it("holds the message while a turn is in flight", () => {
    expect(advance([], true, "also, rename Nadia")).toEqual({ queue: waiting("also, rename Nadia"), send: null });
  });

  it("keeps messages in the order they were typed", () => {
    expect(advance(waiting("first"), true, "second").queue).toEqual(waiting("first", "second"));
  });

  it("releases the front of the queue when the turn ends", () => {
    expect(advance(waiting("first", "second"), false)).toEqual({ queue: waiting("second"), send: "first" });
  });

  it("releases one per turn, so each message gets its own answer", () => {
    const afterFirst = advance(waiting("first", "second"), false);
    expect(afterFirst.send).toBe("first");
    // The next release only happens once that turn reports back.
    expect(advance(afterFirst.queue, true).send).toBeNull();
    expect(advance(afterFirst.queue, false)).toEqual({ queue: [], send: "second" });
  });

  it("has nothing to release when the queue is empty", () => {
    expect(advance([], false)).toEqual({ queue: [], send: null });
  });

  it("does not let a late message jump the line", () => {
    // The session died and came back: what was already waiting still goes first.
    expect(advance(waiting("earlier"), false, "later")).toEqual({ queue: waiting("later"), send: "earlier" });
  });

  it("ignores blank input rather than queueing an empty turn", () => {
    expect(advance([], true, "   ")).toEqual({ queue: [], send: null });
  });

  it("skips over a message you took back", () => {
    const queue = [...canceled("taken back"), ...waiting("still due")];
    expect(advance(queue, false).send).toBe("still due");
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
    advance(queue, true, "second");
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
