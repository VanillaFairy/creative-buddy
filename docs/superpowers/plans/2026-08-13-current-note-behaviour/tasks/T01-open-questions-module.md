# Task T01: Open-questions module

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md`
- Read: `../shared/conventions.md`
- Read: `../../knowledge/run-tests.md`
- Read: `../../knowledge/commit.md`

## Dependencies
- Depends on: — (none)
- Depended on by: T06 (active-note resolver)

## Scope
**Files:**
- Create: `src/open-questions.ts`
- Create: `tests/open-questions.test.ts`
- Modify: `src/mindmap/heat.ts`
- Modify: `src/mindmap/layout.ts` (line 6, the import only)
- Modify: `tests/mindmap-heat.test.ts`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Move `countOpenQuestions` **verbatim**. Same regexes, same loop, same behaviour.
- Fix the two relative imports for the new depth: `../graph/…` becomes `./graph/…`.
- Leave `heat.ts` holding exactly `HEAT_MAX`, `heatBucket`, `heatClass`.
- Move the counter's twelve existing tests across unchanged.

## Negative Constraints (DO NOT)
- Do NOT "improve" the counter. Its behaviour is asserted by the mindmap's heat tests
  and by a live fixture; a change here silently changes the map.
- Do NOT re-export `countOpenQuestions` from `heat.ts` as a convenience. One home.
- Do NOT touch `tests/expected/` or anything under `oracle/`.
- Do NOT be alarmed that `src/mindmap/layout.ts` shows as a binary file in git — it
  holds two literal NUL bytes. See `../shared/conventions.md`.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

Create `tests/open-questions.test.ts`. This is the counter block lifted out of
`tests/mindmap-heat.test.ts`, pointed at the new module:

```typescript
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/open-questions.test.ts`
Expected: FAIL — `Failed to resolve import "../src/open-questions"`.

- [ ] **Step 3: Create the module**

Create `src/open-questions.ts`:

```typescript
/**
 * How many questions a note still owes an answer.
 *
 * An open question is `- [ ]` written where its answer will go — the rule the
 * interviewer works to, defined in `assets/prompts/system.md`. Two surfaces want
 * this number: the map colours a node by it, and the composer decides from it
 * whether to offer the "Current note questions" preset. So it lives here rather
 * than inside either of them.
 *
 * It is still not a `Note` field: the oracle has no opinion about task boxes, and
 * widening the ported types with something the Python never had would break the
 * parity the whole `src/graph/` layer exists to keep.
 */

import { stripFrontmatterBlock } from "./graph/frontmatter";
import { normalizeContent, stripBom } from "./graph/reader";

const OPEN_BOX = /^[ \t]*[-*+] \[ \]/;
const FENCE = /^[ \t]*(?:`{3,}|~{3,})/;

/**
 * Open questions in a note's body.
 *
 * Reads through the same normalise → de-BOM → drop-frontmatter path the note
 * index uses for links, which is what keeps a CRLF note from reading as one
 * long line and losing every box on it.
 */
export function countOpenQuestions(noteText: string): number {
  const body = stripFrontmatterBlock(stripBom(normalizeContent(noteText)));
  let count = 0;
  let fenced = false;
  for (const line of body.split("\n")) {
    // A box inside a fence is an example of the notation, not a live question.
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && OPEN_BOX.test(line)) count += 1;
  }
  return count;
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run tests/open-questions.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Empty the old home**

Replace the whole of `src/mindmap/heat.ts` with:

```typescript
/**
 * How hot a note is — the step of the palette its open-question count lands on.
 *
 * The count itself is `countOpenQuestions` in `src/open-questions.ts`. It moved
 * out when the composer started asking for the same number: two surfaces
 * disagreeing about whether a note owes anything would be worse than either of
 * them being wrong. What stays here is the mapping from a count to a colour,
 * which is nobody else's business.
 */

/** The top of the scale. Ten questions and forty are both "as hot as it gets". */
export const HEAT_MAX = 10;

/** The palette step a count lands on, clamped to the top of the scale. */
export function heatBucket(count: number): number {
  return count > HEAT_MAX ? HEAT_MAX : count;
}

/**
 * The class carrying that step's colours. The eleven steps are declared in
 * `styles.css`, once per theme; naming them here is what keeps the two ends
 * from drifting apart.
 */
export function heatClass(count: number): string {
  return `cb-mm-heat-${heatBucket(count)}`;
}
```

- [ ] **Step 6: Repoint the mindmap's import**

In `src/mindmap/layout.ts`, line 6, replace:

```typescript
import { countOpenQuestions } from "./heat";
```

with:

```typescript
import { countOpenQuestions } from "../open-questions";
```

- [ ] **Step 7: Trim the old test file**

In `tests/mindmap-heat.test.ts`:

- change the first import to `import { heatBucket, heatClass, HEAT_MAX } from "../src/mindmap/heat";`
- delete the entire `describe("countOpenQuestions", …)` block (the twelve tests now
  living in `tests/open-questions.test.ts`)

Leave `describe("heatBucket")`, `describe("heatClass")` and
`describe("heat on the mindmap tree")` exactly as they are — the last of those is what
proves the move did not change a single number the map draws.

- [ ] **Step 8: Run the whole suite**

Run: `npx vitest run`
Expected: PASS, everything. `tests/mindmap-heat.test.ts` still asserts the fixture
counts (hub 1, Heavy Rain 4, Observer 3, Мысли 4, collapsed hub 11) — those are the
real proof the counter arrived intact.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add src/open-questions.ts src/mindmap/heat.ts src/mindmap/layout.ts tests/open-questions.test.ts tests/mindmap-heat.test.ts
git commit -m "chore: counting a note's open questions is not the map's business"
```

Remember the `Co-Authored-By:` trailer from `../shared/conventions.md`.

## Acceptance Criteria
- [ ] `npx vitest run` passes in full
- [ ] `npx tsc --noEmit` is clean
- [ ] `src/mindmap/heat.ts` no longer exports `countOpenQuestions`
- [ ] `tests/mindmap-heat.test.ts` still asserts the fixture's per-node counts
- [ ] No files outside Scope were modified
