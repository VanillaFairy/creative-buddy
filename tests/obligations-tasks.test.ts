import { describe, it, expect } from "vitest";
import { openTasks } from "../src/graph/obligations";

const lines = (...ls: string[]) => ls.join("\n");

describe("openTasks", () => {
  it("yields 1-based line numbers and rstripped text for - * + bullets", () => {
    const text = lines("- [ ] first  ", "* [ ] second", "+ [ ] third", "  - [ ] indented");
    expect([...openTasks(text)]).toEqual([
      [1, "first"],
      [2, "second"],
      [3, "third"],
      [4, "indented"],
    ]);
  });

  it("only status ' ' counts as open", () => {
    const text = lines("- [x] done", "- [X] DONE", "- [/] partial", "- [-] cancelled", "- [>] moved", "- [ ] open");
    expect([...openTasks(text)]).toEqual([[6, "open"]]);
  });

  it("numbered lists are not tasks", () => {
    expect([...openTasks("1. [ ] not a task")]).toEqual([]);
  });

  it("skips tasks inside backtick fences, including the fence lines", () => {
    const text = lines("```markdown", "- [ ] fenced", "```", "- [ ] real");
    expect([...openTasks(text)]).toEqual([[4, "real"]]);
  });

  it("closes only on a same-char fence of >= length with no info string", () => {
    const text = lines("````", "- [ ] in", "```", "- [ ] still in", "````", "- [ ] out");
    expect([...openTasks(text)]).toEqual([[6, "out"]]);
  });

  it("tilde fences work and an unclosed fence swallows to EOF", () => {
    const text = lines("~~~", "- [ ] tilde-fenced", "~~~", "- [ ] real", "```text", "- [ ] unclosed");
    expect([...openTasks(text)]).toEqual([[4, "real"]]);
  });

  it("a fence-open line with an info string never closes an open fence", () => {
    const text = lines("```", "- [ ] in", "``` python", "- [ ] still in");
    expect([...openTasks(text)]).toEqual([]);
  });

  it("CRLF and lone-CR input behaves like Python splitlines", () => {
    expect([...openTasks("- [ ] task one\r\n- [ ] task two\r\n")]).toEqual([
      [1, "task one"],
      [2, "task two"],
    ]);
    expect([...openTasks("- [ ] a\r- [ ] b")]).toEqual([
      [1, "a"],
      [2, "b"],
    ]);
  });
});
