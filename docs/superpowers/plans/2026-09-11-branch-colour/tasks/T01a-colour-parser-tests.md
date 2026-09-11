# T01a: Colour parser tests

**Role:** `red`
**Depends on:** —
**Read first:** `shared/interfaces.md`, `shared/conventions.md`, `knowledge/run-tests.md`, `knowledge/commit.md`

**Files:**
- Create: `tests/color.test.ts`

**You do not implement anything in this task.** You write the tests, watch them
fail for the right reason, and commit. `src/graph/color.ts` is T01b's to write.

## What the field means

From the design doc (`docs/superpowers/specs/2026-09-11-branch-colour-design.md`):

- Legal: `#rgb`, `#rrggbb`, or a CSS Color 4 named colour (`teal`,
  `rebeccapurple`).
- Rejected: the alpha hex forms `#rgba` and `#rrggbbaa` — the map derives the
  fill's transparency from the value itself, and a half-transparent outline
  would fight it.
- Rejected: anything that would paint nothing, namely `transparent` and
  `currentcolor`.
- Rejected: everything else — a malformed hex, a word that is not a colour, a
  function form like `rgb(1 2 3)`.
- Returns the value trimmed and lower-cased, so the stylesheet never sees two
  spellings of one colour.
- `null` in, `null` out.

If something in that list reads as ambiguous to you, **escalate rather than
picking a reading** — do not invent an expected value the design does not fix.

- [ ] **Step 1: Write the failing tests**

Create `tests/color.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseColor } from "../src/graph/color";

describe("parseColor", () => {
  it("takes the two hex forms, lower-cased so one colour has one spelling", () => {
    expect(parseColor("#c94f7c")).toBe("#c94f7c");
    expect(parseColor("#F80")).toBe("#f80");
  });

  it("takes a CSS colour name, around whatever whitespace YAML left on it", () => {
    expect(parseColor("teal")).toBe("teal");
    expect(parseColor("  RebeccaPurple ")).toBe("rebeccapurple");
  });

  it("refuses the alpha hex forms, because the map derives its own", () => {
    expect(parseColor("#f80a")).toBeNull();
    expect(parseColor("#c94f7c80")).toBeNull();
  });

  it("refuses what is not a colour at all", () => {
    expect(parseColor("banana")).toBeNull();
    expect(parseColor("#ggg")).toBeNull();
    expect(parseColor("#c94f7")).toBeNull();
    expect(parseColor("rgb(1 2 3)")).toBeNull();
  });

  it("refuses the keywords that would paint nothing", () => {
    expect(parseColor("transparent")).toBeNull();
    expect(parseColor("currentcolor")).toBeNull();
  });

  it("has nothing to say about an absent or empty field", () => {
    expect(parseColor(null)).toBeNull();
    expect(parseColor("")).toBeNull();
    expect(parseColor("   ")).toBeNull();
  });

  it("knows the far ends of the name table, not just the famous ones", () => {
    // The table is copied by hand, so the risk is a truncated paste rather than
    // a wrong entry. First and last alphabetically, plus one from the middle.
    expect(parseColor("aliceblue")).toBe("aliceblue");
    expect(parseColor("yellowgreen")).toBe("yellowgreen");
    expect(parseColor("mistyrose")).toBe("mistyrose");
  });
});
```

- [ ] **Step 2: Run them and confirm they fail for the right reason**

```bash
npx vitest run tests/color.test.ts
```

Expected: the file fails to collect, with an error naming the missing module —
`Failed to resolve import "../src/graph/color"` or `Cannot find module`. That is
the correct red: the behaviour is unimplemented, not mis-asserted. If you see any
other failure, stop and say so.

- [ ] **Step 3: Commit**

```bash
git add tests/color.test.ts
git commit -m "test: what counts as a colour a note may ask for

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Scope / Negative constraints

- Do NOT create `src/graph/color.ts`.
- Do NOT touch `src/graph/notes.ts` — reading the field at index time is T02.
- Do NOT add tests about inheritance or painting. This file is about one
  function and one question: is this string a colour?
