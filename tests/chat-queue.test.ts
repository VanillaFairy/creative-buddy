import { describe, it, expect } from "vitest";
import { HOLD_MS, Outgoing, Queued, advance, cancelAll, hasWaiting, msUntilSendable, remove, setCanceled } from "../src/chat/queue";

/** A fixed clock. Every message below is committed to at this instant. */
const NOW = 10_000;
/** The instant the message committed to at NOW is finally allowed out. */
const RIPE = NOW + HOLD_MS;

const waiting = (...texts: string[]): Queued[] => texts.map((text) => ({ text, canceled: false, at: NOW }));
const canceled = (...texts: string[]): Queued[] => texts.map((text) => ({ text, canceled: true, at: NOW }));
/** What you typed: a message with no name on it. */
const typed = (text: string): { text: string } => ({ text });

/** Commit to a message, then let its hold run out — what a send looks like end to end. */
const committed = (queue: Queued[], busy: boolean, message?: Outgoing): ReturnType<typeof advance> => {
  const held = advance(queue, busy, NOW, message);
  return advance(held.queue, busy, RIPE);
};

describe("advance — a preset keeps its name", () => {
  const preset = { text: "Ask me the one question…", label: "Ask me" };

  it("hands the name over with the text when a waiting preset is released", () => {
    expect(advance([{ ...preset, canceled: false, at: NOW }], false, RIPE).send).toEqual(preset);
  });

  it("hands the name over on a preset that goes out once its hold is up", () => {
    expect(committed([], false, preset)).toEqual({ queue: [], send: preset });
  });

  it("keeps the name on a preset that has to wait its turn", () => {
    expect(advance([], true, NOW, preset).queue).toEqual([{ ...preset, canceled: false, at: NOW }]);
  });

  it("sends what you typed with no name on it", () => {
    expect(committed([], false, typed("what happens in act two?")).send).toEqual(typed("what happens in act two?"));
  });
});

/**
 * Every message waits out a short hold before it can leave, so there is a
 * moment in which it is on screen, yours, and still deletable. Enter is a
 * commitment you can take back for half a second — which is the whole point:
 * the instant it goes, the model has it forever, and no amount of stopping
 * unsays it.
 */
describe("advance — the hold before a message can leave", () => {
  it("keeps a message you just committed to, rather than sending it", () => {
    expect(advance([], false, NOW, typed("wait, no"))).toEqual({ queue: waiting("wait, no"), send: null });
  });

  it("still holds it one tick short of the window", () => {
    expect(advance([], false, NOW, typed("wait, no")).send).toBeNull();
    expect(advance(waiting("wait, no"), false, RIPE - 1).send).toBeNull();
  });

  it("lets it go the instant the window is up", () => {
    expect(advance(waiting("go"), false, RIPE)).toEqual({ queue: [], send: typed("go") });
  });

  it("holds the line rather than letting a riper message overtake the front", () => {
    // The second was typed later, so its hold ends later; the first is what the
    // conversation is owed next either way.
    const queue: Queued[] = [{ text: "first", canceled: false, at: NOW + 100 }, { text: "second", canceled: false, at: NOW }];
    expect(advance(queue, false, RIPE).send).toBeNull();
  });

  it("does not restart the hold on the messages already in line", () => {
    const step = advance(waiting("first"), false, RIPE, typed("second"));
    expect(step.send).toEqual(typed("first"));
    expect(step.queue).toEqual([{ text: "second", canceled: false, at: RIPE }]);
  });
});

describe("msUntilSendable", () => {
  it("says how long is left on the front of the queue", () => {
    expect(msUntilSendable(waiting("soon"), false, NOW + 200)).toBe(HOLD_MS - 200);
  });

  it("is zero once the hold is up, so the wake-up is due now", () => {
    expect(msUntilSendable(waiting("ready"), false, RIPE)).toBe(0);
  });

  it("has nothing to wait for on an empty queue", () => {
    expect(msUntilSendable([], false, NOW)).toBeNull();
  });

  it("has nothing to wait for when everything has been taken back", () => {
    expect(msUntilSendable(canceled("taken back"), false, RIPE)).toBeNull();
  });

  it("has nothing to wait for while a turn is running — its ending is the wake-up", () => {
    expect(msUntilSendable(waiting("later"), true, RIPE)).toBeNull();
  });
});

describe("remove", () => {
  it("takes a message out of the queue entirely", () => {
    expect(remove(waiting("keep", "bin", "keep too"), 1)).toEqual(waiting("keep", "keep too"));
  });

  it("leaves the queue as it was when the index is not in it", () => {
    expect(remove(waiting("only"), 4)).toEqual(waiting("only"));
  });

  it("leaves the queue it was given alone", () => {
    const before = waiting("a", "b");
    remove(before, 0);
    expect(before).toEqual(waiting("a", "b"));
  });
});

describe("advance", () => {
  it("holds the message while a turn is in flight", () => {
    expect(advance([], true, NOW, typed("also, rename Nadia"))).toEqual({ queue: waiting("also, rename Nadia"), send: null });
  });

  it("keeps messages in the order they were typed", () => {
    expect(advance([], true, NOW, typed("second")).queue.map((m) => m.text)).toEqual(["second"]);
    expect(advance(waiting("first"), true, NOW, typed("second")).queue.map((m) => m.text)).toEqual(["first", "second"]);
  });

  it("releases the front of the queue when the turn ends", () => {
    expect(advance(waiting("first", "second"), false, RIPE).send).toEqual(typed("first"));
  });

  it("releases one per turn, so each message gets its own answer", () => {
    const first = advance(waiting("first", "second"), false, RIPE);
    expect(first.send).toEqual(typed("first"));
    expect(first.queue).toEqual(waiting("second"));
    expect(advance(first.queue, false, RIPE).send).toEqual(typed("second"));
  });

  it("has nothing to release when the queue is empty", () => {
    expect(advance([], false, RIPE)).toEqual({ queue: [], send: null });
  });

  it("does not let a late message jump the line", () => {
    expect(advance(waiting("first"), false, RIPE, typed("late")).send).toEqual(typed("first"));
  });

  it("ignores blank input rather than queueing an empty turn", () => {
    expect(advance([], false, NOW, typed("   "))).toEqual({ queue: [], send: null });
  });

  it("skips over a message you took back", () => {
    expect(advance([...canceled("taken back"), ...waiting("this one")], false, RIPE).send).toEqual(typed("this one"));
  });

  it("leaves the canceled ones on screen when something goes out — they are still resendable", () => {
    expect(advance([...canceled("taken back"), ...waiting("this one")], false, RIPE).queue).toEqual(canceled("taken back"));
  });

  it("has nothing to send when everything has been taken back", () => {
    expect(advance(canceled("a", "b"), false, RIPE).send).toBeNull();
  });

  it("leaves the queue it was given alone", () => {
    const before = waiting("first");
    advance(before, false, RIPE, typed("second"));
    expect(before).toEqual(waiting("first"));
  });
});

describe("setCanceled", () => {
  it("takes one back and leaves it in place", () => {
    const queue = waiting("first", "second");
    expect(setCanceled(queue, 0, true)).toEqual([...canceled("first"), ...waiting("second")]);
  });

  it("puts one back in line where it was, so it keeps its place in the order", () => {
    const queue = [...canceled("first"), ...waiting("second")];
    expect(setCanceled(queue, 0, false)).toEqual(waiting("first", "second"));
  });

  it("leaves the queue as it was when the index is not in it", () => {
    expect(setCanceled(waiting("only"), 4, true)).toEqual(waiting("only"));
  });
});

describe("cancelAll", () => {
  it("takes back everything still waiting", () => {
    expect(cancelAll(waiting("a", "b"))).toEqual(canceled("a", "b"));
  });

  it("is nothing to do on an empty queue", () => {
    expect(cancelAll([])).toEqual([]);
  });
});

describe("hasWaiting", () => {
  it("is true while something is still due to go out", () => {
    expect(hasWaiting([...canceled("taken back"), ...waiting("this one")])).toBe(true);
  });

  it("is false once everything has been taken back", () => {
    expect(hasWaiting(canceled("a", "b"))).toBe(false);
  });
});

describe("advance — a message keeps the note it was written about", () => {
  const about = (text: string, note: string): Outgoing => ({ text, note });

  it("carries the note out with a message that goes out after its hold", () => {
    expect(committed([], false, about("who is she?", "Cast/Nadia.md")).send).toEqual(about("who is she?", "Cast/Nadia.md"));
  });

  it("carries the note out with a message that had to wait its turn", () => {
    const queued = advance([], true, NOW, about("who is she?", "Cast/Nadia.md")).queue;
    expect(advance(queued, false, RIPE).send).toEqual(about("who is she?", "Cast/Nadia.md"));
  });

  it("keeps the note through a cancel and a resend", () => {
    const queued = advance([], true, NOW, about("who is she?", "Cast/Nadia.md")).queue;
    const back = setCanceled(setCanceled(queued, 0, true), 0, false);
    expect(advance(back, false, RIPE).send).toEqual(about("who is she?", "Cast/Nadia.md"));
  });

  it("keeps the note through a delete of the message beside it", () => {
    const two = advance(advance([], true, NOW, about("first", "A.md")).queue, true, NOW, about("second", "B.md")).queue;
    expect(advance(remove(two, 0), false, RIPE).send).toEqual(about("second", "B.md"));
  });

  it("leaves a message composed with no note open without one", () => {
    expect(committed([], false, typed("what happens in act two?")).send).toEqual({ text: "what happens in act two?" });
  });
});
