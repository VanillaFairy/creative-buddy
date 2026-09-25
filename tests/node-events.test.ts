import { describe, it, expect } from "vitest";
import * as events from "node:events";
import { setMaxListeners } from "../src/agent/node-events";

// What Obsidian's renderer hands the SDK: an EventTarget from the DOM, not from Node.
function domSignal(): object {
  return { aborted: false, addEventListener() {}, removeEventListener() {} };
}

describe("setMaxListeners in Obsidian's renderer", () => {
  it("accepts a DOM AbortSignal that Node's own version rejects", () => {
    const signal = domSignal();
    expect(() => events.setMaxListeners(50, signal as EventTarget)).toThrow();
    expect(() => setMaxListeners(50, signal as EventTarget)).not.toThrow();
  });

  it("still raises the cap on Node emitters passed alongside one", () => {
    const emitter = new events.EventEmitter();
    setMaxListeners(37, domSignal() as EventTarget, emitter);
    expect(emitter.getMaxListeners()).toBe(37);
  });

  it("still rejects a target that is no event target at all", () => {
    expect(() => setMaxListeners(50, {} as EventTarget)).toThrow();
  });
});
