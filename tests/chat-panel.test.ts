// @vitest-environment jsdom
/**
 * The one shell test in the suite. Everywhere else a decision lives in a pure
 * module and is tested there; these two facts are about the rendered DOM
 * itself, and a pure module cannot see either.
 *
 * The first: Send and Stop used to be the two branches of one ternary, so React
 * reused a single <button> and swapped only its handler — the control under
 * your finger became Stop the instant the send it had just made flipped the
 * panel to busy, and a second press inside that gesture cancelled the turn the
 * first had started.
 *
 * The second: what a finished turn says it was. A real session's user pressed
 * Escape, the SDK reported the abort as `is_error`, and the panel drew "turn
 * errored · $0.00" — sending them hunting for a bug that was their own keyboard.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react";
import { ChatSurface, ChatCallbacks } from "../src/chat/components";
import { TranscriptItem } from "../src/chat/transcript";
import { Queued } from "../src/chat/queue";
import { FAMILY_NAMES } from "../src/agent/models";

function noopCallbacks(record: string[]): ChatCallbacks {
  return {
    onSend: () => record.push("send"),
    onModelChange: () => undefined,
    onEffortChange: () => undefined,
    onApprove: () => undefined,
    onInterrupt: () => record.push("interrupt"),
    onQueuedCanceled: () => record.push("cancel"),
    onQueuedDeleted: (i: number) => record.push(`delete:${i}`),
    onPresetsToggle: () => undefined,
  } as unknown as ChatCallbacks;
}

interface Panel {
  host: HTMLElement;
  draw: (busy: boolean) => Promise<void>;
  type: (text: string) => Promise<void>;
  click: (node: Element) => Promise<void>;
  sendButton: () => HTMLButtonElement;
  stopButton: () => HTMLButtonElement | null;
}

async function mount(record: string[], items: TranscriptItem[] = [], queued: Queued[] = []): Promise<Panel> {
  const callbacks = noopCallbacks(record);
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root | null = null;
  const draw = async (busy: boolean): Promise<void> => {
    await act(async () => {
      root = root ?? createRoot(host);
      root.render(
        React.createElement(ChatSurface, {
          model: "opus",
          modelLabels: FAMILY_NAMES,
          effort: "high",
          busy,
          status: null,
          items,
          queued,
          presetsOpen: false,
          openQuestions: 0,
          callbacks,
        }),
      );
    });
  };
  await draw(false);
  return {
    host,
    draw,
    type: async (text) => {
      const box = host.querySelector("textarea") as HTMLTextAreaElement;
      await act(async () => {
        // React tracks the last value it wrote, so a plain assignment looks like
        // no change to it. The prototype setter is how you type in jsdom.
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
        setter.call(box, text);
        box.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    click: async (node) => {
      await act(async () => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    },
    sendButton: () => host.querySelector(".cb-send") as HTMLButtonElement,
    stopButton: () => host.querySelector(".cb-stop"),
  };
}

beforeAll(() => {
  // The transcript scrolls itself to the bottom on every change; jsdom has no
  // scrolling, and the effect would throw before any assertion ran.
  Element.prototype.scrollTo = (): void => undefined;
});

describe("the composer's controls", () => {
  it("does not turn the send control into the stop control under your hand", async () => {
    const record: string[] = [];
    const panel = await mount(record);
    await panel.type("hello");
    const button = panel.sendButton();

    await panel.click(button);
    await panel.draw(true); // what the shell does with a send: mark busy, redraw

    expect(panel.sendButton(), "the send control kept its identity").toBe(button);
    expect(button.classList.contains("cb-stop"), "and did not become the stop control").toBe(false);
  });

  it("cannot stop the turn a second activation of the send control lands on", async () => {
    const record: string[] = [];
    const panel = await mount(record);
    await panel.type("hello");
    const button = panel.sendButton();

    await panel.click(button);
    await panel.draw(true);
    // The same physical control, pressed again inside the same gesture.
    await panel.click(button);

    expect(record).toEqual(["send"]);
  });

  it("offers a stop control while a turn is running, away from the composer", async () => {
    const record: string[] = [];
    const panel = await mount(record);
    expect(panel.stopButton(), "nothing to stop while the panel is idle").toBeNull();

    await panel.draw(true);
    const stop = panel.stopButton();
    expect(stop, "a running turn can be stopped").not.toBeNull();
    expect(panel.host.querySelector(".cb-chat-composer")!.contains(stop!)).toBe(false);

    await panel.click(stop!);
    expect(record).toEqual(["interrupt"]);
  });
});

/**
 * The bin is only honest on a message that has never left. Once one goes, the
 * model has it for good — a stop aborts the answer, not the message — so a bin
 * on a sent message could only ever hide it from the person who wrote it while
 * the interviewer went on reading it. The rule is therefore about *where* the
 * control may appear, which makes it a fact about the rendered panel.
 */
describe("deleting a message that never went out", () => {
  const unsent = (text: string): Queued => ({ text, canceled: false, at: 0 });

  it("offers a bin on a message still waiting to go", async () => {
    const record: string[] = [];
    const panel = await mount(record, [], [unsent("wait, no")]);
    const bin = panel.host.querySelector(".cb-queued-delete") as HTMLButtonElement;
    expect(bin, "a waiting message can be thrown away").not.toBeNull();

    await panel.click(bin);
    expect(record).toEqual(["delete:0"]);
  });

  it("offers one on a message taken back, too — it also never went out", async () => {
    const panel = await mount([], [], [{ text: "held", canceled: true, at: 0 }]);
    expect(panel.host.querySelector(".cb-queued-delete")).not.toBeNull();
  });

  it("bins the row you pointed at, not the first one", async () => {
    const record: string[] = [];
    const panel = await mount(record, [], [unsent("keep"), unsent("bin"), unsent("keep too")]);
    const bins = panel.host.querySelectorAll(".cb-queued-delete");
    await panel.click(bins[1]!);
    expect(record).toEqual(["delete:1"]);
  });

  it("offers none on a message the model has already been given", async () => {
    // The same words, in the transcript rather than the queue: said, and past
    // taking back.
    const panel = await mount([], [{ kind: "user", text: "wait, no" }], []);
    expect(panel.host.querySelector(".cb-queued-delete"), "nothing to bin once it is said").toBeNull();
  });
});

describe("how a finished turn reads", () => {
  const rule = (host: HTMLElement): string => host.querySelector(".cb-turn-end")!.textContent!;

  it("names a stop as yours rather than as a failure", async () => {
    const panel = await mount([], [{ kind: "result", costUsd: 0, outcome: "stopped" }]);
    expect(rule(panel.host)).toContain("you stopped this turn");
    expect(panel.host.querySelector(".cb-turn-end-error")).toBeNull();
  });

  it("shows a failure's own words under the rule", async () => {
    const panel = await mount([], [{ kind: "result", costUsd: 0, outcome: "error", reason: "Credit balance too low" }]);
    expect(rule(panel.host)).toContain("turn errored");
    expect(panel.host.querySelector(".cb-turn-end-reason")!.textContent).toBe("Credit balance too low");
  });

  it("draws a finished turn as the rule alone", async () => {
    const panel = await mount([], [{ kind: "result", costUsd: 0.42, outcome: "done" }]);
    expect(rule(panel.host)).toContain("turn done · $0.42");
    expect(panel.host.querySelector(".cb-turn-end-reason")).toBeNull();
  });
});
