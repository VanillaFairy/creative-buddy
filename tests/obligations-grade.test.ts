import { describe, it, expect } from "vitest";
import { grade } from "../src/graph/obligations";

const TODAY = { y: 2026, m: 8, d: 11 };

describe("grade", () => {
  it("dated buckets: overdue / due_today / upcoming (day 14 counts) / later", () => {
    expect(grade("2026-08-05: pull screenshots", TODAY)).toEqual({ bucket: "overdue", text: "pull screenshots", due: "2026-08-05" });
    expect(grade("2026-08-11: re-watch", TODAY)).toEqual({ bucket: "due_today", text: "re-watch", due: "2026-08-11" });
    expect(grade("2026-08-25: day fourteen", TODAY)).toEqual({ bucket: "upcoming", text: "day fourteen", due: "2026-08-25" });
    expect(grade("2026-08-26: day fifteen", TODAY)).toEqual({ bucket: "later", text: "day fifteen", due: "2026-08-26" });
  });

  it("single-digit month/day stamps parse", () => {
    expect(grade("2026-8-9: short form", TODAY)!.bucket).toBe("overdue");
  });

  it("a date-shaped stamp that is not a real date lands in malformed, keeping the whole line", () => {
    expect(grade("2026-13-45: impossible", TODAY)).toEqual({ bucket: "malformed", text: "2026-13-45: impossible", due: null });
  });

  it("marker buckets are case-insensitive and keep their text", () => {
    expect(grade("owed: send the doc", TODAY)).toEqual({ bucket: "owed", text: "send the doc", due: null });
    expect(grade("GAP: no scene stages it", TODAY)).toEqual({ bucket: "gaps", text: "no scene stages it", due: null });
    expect(grade("look up: when it closed", TODAY)).toEqual({ bucket: "lookups", text: "when it closed", due: null });
    expect(grade("lookup: closed-up typo", TODAY)).toEqual({ bucket: "lookups", text: "closed-up typo", due: null });
    expect(grade("parked: the tatami night", TODAY)).toEqual({ bucket: "parked", text: "the tatami night", due: null });
    expect(grade("parked 2026-07-01: with a date", TODAY)).toEqual({ bucket: "parked", text: "with a date", due: null });
  });

  it("markers must anchor the start; mid-sentence dates are compost", () => {
    expect(grade("ask again on 2026-08-20: maybe", TODAY)).toBeNull();
    expect(grade("What is the backstory?", TODAY)).toBeNull();
  });

  it("empty rest falls back to the whole task text", () => {
    expect(grade("owed:", TODAY)).toEqual({ bucket: "owed", text: "owed:", due: null });
  });
});
