import { describe, it, expect } from "vitest";
import { countOpenQuestions } from "../src/open-questions";

describe("countOpenQuestions", () => {
  it("counts an unchecked box", () => {
    expect(countOpenQuestions("Body.\n\n- [ ] What broke the marriage?\n")).toBe(1);
  });

  it("does not count a box the user has ticked", () => {
    expect(countOpenQuestions("- [x] answered\n- [X] also answered\n- [ ] still open\n")).toBe(1);
  });

  it("counts an indented box — a question nested under a bullet is still owed", () => {
    expect(countOpenQuestions("- the scene\n  - [ ] who else is in the room?\n")).toBe(1);
  });

  it("counts the other list bullets Markdown allows", () => {
    expect(countOpenQuestions("* [ ] star\n+ [ ] plus\n- [ ] dash\n")).toBe(3);
  });

  it("ignores a fenced example — a box in a code block is documentation, not a question", () => {
    const text = ["- [ ] real", "", "```md", "- [ ] an example that never counts", "```", "", "- [ ] also real"].join("\n");
    expect(countOpenQuestions(text)).toBe(2);
  });

  it("ignores boxes in frontmatter, matching how links are read from the body", () => {
    expect(countOpenQuestions("---\nkind: scene\naliases:\n  - [ ]\n---\n\n- [ ] the only real one\n")).toBe(1);
  });

  it("survives CRLF — the split(\"\\n\") trap that once dropped every task", () => {
    expect(countOpenQuestions("---\r\nkind: scene\r\n---\r\n\r\n- [ ] one\r\n- [ ] two\r\n")).toBe(2);
  });

  it("survives a BOM", () => {
    expect(countOpenQuestions("\uFEFF- [ ] a BOM'd question still counts\n")).toBe(1);
  });

  it("ignores a box that is not opening a list item", () => {
    expect(countOpenQuestions("see the note - [ ] is not a task here\n")).toBe(0);
  });

  it("is zero for a note that asks nothing", () => {
    expect(countOpenQuestions("---\nkind: scene\n---\n\nJust prose.\n")).toBe(0);
  });

  // Both are spelled out in the `simple` fixture, which says in its own words
  // that neither should surface.
  it("does not count a cancelled line", () => {
    expect(countOpenQuestions("- [-] a cancelled line never surfaces\n")).toBe(0);
  });

  it("does not count a numbered line", () => {
    expect(countOpenQuestions("1. [ ] a numbered line is not a task\n")).toBe(0);
  });
});
