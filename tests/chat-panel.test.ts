// @vitest-environment jsdom
/**
 * The one shell test in the suite, and it earns its place: the bug it guards
 * against cannot be seen from a pure module. Send and Stop used to be the two
 * branches of one ternary, so React reused a single <button> and swapped only
 * its handler — the control under your finger became Stop the instant the send
 * it had just made flipped the panel to busy, and a second press inside that
 * gesture cancelled the turn the first had started.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react";
import { ChatSurface, ChatCallbacks } from "../src/chat/components";

function noopCallbacks(record: string[]): ChatCallbacks {
  return {
    onSend: () => record.push("send"),
    onModelChange: () => undefined,
    onEffortChange: () => undefined,
    onApprove: () => undefined,
    onInterrupt: () => record.push("interrupt"),
    onQueuedCanceled: () => undefined,
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

async function mount(record: string[]): Promise<Panel> {
  const callbacks = noopCallbacks(record);
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root | null = null;
  const draw = async (busy: boolean): Promise<void> => {
    await act(async () => {
      root = root ?? createRoot(host);
      root.render(
        React.createElement(ChatSurface, {
          model: "claude-opus-5",
          effort: "high",
          busy,
          status: null,
          items: [],
          queued: [],
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

