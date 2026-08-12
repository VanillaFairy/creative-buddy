import { describe, it, expect } from "vitest";
import { ScrollFrame, anchoredScrollTop, bottomGap } from "../src/chat/scroll-anchor";

/** A resize: the composer takes `taken` pixels from the transcript's viewport. */
function resize(before: ScrollFrame, taken: number): ScrollFrame {
  const gap = bottomGap(before);
  const after = { ...before, clientHeight: before.clientHeight - taken };
  return { ...after, scrollTop: anchoredScrollTop(after, gap) };
}

describe("bottomGap", () => {
  it("is nothing when the transcript is scrolled to the end", () => {
    expect(bottomGap({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(0);
  });

  it("is how much is still below the fold when scrolled up", () => {
    expect(bottomGap({ scrollTop: 300, scrollHeight: 1000, clientHeight: 400 })).toBe(300);
  });

  it("is nothing when the whole transcript already fits", () => {
    expect(bottomGap({ scrollTop: 0, scrollHeight: 200, clientHeight: 400 })).toBe(0);
  });

  it("is nothing rather than negative after a trackpad overscroll", () => {
    expect(bottomGap({ scrollTop: 612, scrollHeight: 1000, clientHeight: 400 })).toBe(0);
  });
});

describe("anchoredScrollTop", () => {
  it("puts you at the end when nothing was below the fold", () => {
    expect(anchoredScrollTop({ scrollTop: 0, scrollHeight: 1000, clientHeight: 300 }, 0)).toBe(700);
  });

  it("leaves the asked-for amount below the fold", () => {
    expect(anchoredScrollTop({ scrollTop: 0, scrollHeight: 1000, clientHeight: 300 }, 300)).toBe(400);
  });

  it("is the top when the transcript no longer overflows", () => {
    expect(anchoredScrollTop({ scrollTop: 0, scrollHeight: 200, clientHeight: 400 }, 300)).toBe(0);
  });
});

describe("holding the bottom still across a resize", () => {
  it("stays at the end when it was at the end", () => {
    const after = resize({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 }, 100);
    expect(after.scrollTop).toBe(700);
    expect(bottomGap(after)).toBe(0);
  });

  it("keeps the same last-visible line when it was scrolled up", () => {
    // 300px below the fold before; the composer takes 100 of the viewport.
    const after = resize({ scrollTop: 300, scrollHeight: 1000, clientHeight: 400 }, 100);
    // The transcript scrolls up by exactly what the viewport lost.
    expect(after.scrollTop).toBe(400);
    expect(bottomGap(after)).toBe(300);
  });

  it("gives the space back the same way when the composer shrinks", () => {
    const after = resize({ scrollTop: 400, scrollHeight: 1000, clientHeight: 300 }, -100);
    expect(after.scrollTop).toBe(300);
    expect(bottomGap(after)).toBe(300);
  });

  it("holds through a whole drag, one step at a time, without drifting", () => {
    let frame: ScrollFrame = { scrollTop: 300, scrollHeight: 1000, clientHeight: 400 };
    const gap = bottomGap(frame);
    for (let i = 0; i < 40; i++) frame = resize(frame, 3);
    expect(bottomGap(frame)).toBe(gap);
  });

  it("falls back to the top when shrinking leaves the transcript fitting whole", () => {
    const after = resize({ scrollTop: 50, scrollHeight: 420, clientHeight: 370 }, -200);
    expect(after.scrollTop).toBe(0);
  });
});
