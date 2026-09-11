# T02: `Note.color`

**Depends on:** T01b
**Read first:** `shared/interfaces.md`, `shared/conventions.md`, `knowledge/run-tests.md`, `knowledge/commit.md`

**Files:**
- Modify: `src/graph/notes.ts`
- Test: `tests/notes.test.ts`

This one is wiring, not a judgement call, so it is a single TDD task rather than
a triad: the interesting question (what is a colour?) was settled in T01.

## Background

`noteFromFile` already reads `kind` and `status` through a local helper,
`scalarOrNull`, which unwraps YAML's habit of turning `[[Link]]` into a list
inside a list and returns a trimmed string or null. The colour goes through the
same helper and then through `parseColor`, so `Note.color` is either a usable
colour or null — no third state reaches the rest of the plugin.

The test that matters most is the YAML one. In YAML an unquoted `#` opens a
comment, so `color: #c94f7c` parses as an **empty value**. That is the mistake a
hand-editor will actually make, and the index has to survive it quietly.

- [ ] **Step 1: Write the failing tests**

In `tests/notes.test.ts`, add inside the existing `describe("noteFromFile", …)`
block:

```ts
  it("reads a quoted colour", () => {
    const raw = ["---", 'color: "#C94F7C"', "---", "", "Body."].join("\n");
    expect(noteFromFile("Noir game/Cast/Cast.md", raw).color).toBe("#c94f7c");
  });

  it("an unquoted colour is a YAML comment, and reads as no colour at all", () => {
    // `color: #c94f7c` — the # opens a comment, so the field is empty. This is
    // the mistake a hand-editor makes, and it must be quiet, not broken.
    const raw = ["---", "color: #c94f7c", "---", "", "Body."].join("\n");
    expect(noteFromFile("Noir game/Cast/Cast.md", raw).color).toBeNull();
  });

  it("a colour that is not one is no colour", () => {
    const raw = ["---", "color: banana", "---", "", "Body."].join("\n");
    expect(noteFromFile("Noir game/Cast/Cast.md", raw).color).toBeNull();
  });

  it("a note with no colour field has none", () => {
    expect(noteFromFile("Noir game/Cast/Cast.md", "Body, no frontmatter.").color).toBeNull();
  });
```

- [ ] **Step 2: Loosen the one assertion that pins an exact key set**

`tests/notes.test.ts:18` asserts the whole index row with `toEqual`, which fails
the moment `Note` grows a field — and `Note` is growing one now. The project's
coding rules name this case directly: never pin an exact key set on an object a
correct implementation may extend.

Change that single call from `toEqual({` to `toMatchObject({`. Leave the
expected object itself alone.

- [ ] **Step 3: Run the tests and confirm they fail for the right reason**

```bash
npx vitest run tests/notes.test.ts
```

Expected: the four new tests fail because `color` is `undefined`, not because
anything threw. The loosened assertion should already pass.

- [ ] **Step 4: Implement**

In `src/graph/notes.ts`:

Add the import beside the others:

```ts
import { parseColor } from "./color";
```

Add the field to the interface, between `status` and `links`:

```ts
export interface Note {
  path: string;
  stem: string;
  aliases: string[];
  kind: string | null;
  status: string | null;
  /** The colour this note asks for. Null when absent or unreadable. */
  color: string | null;
  links: string[];
}
```

And fill it in `noteFromFile`, in the same position:

```ts
    status: scalarOrNull(fm["status"]),
    color: parseColor(scalarOrNull(fm["color"])),
    links: extractLinks(body),
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/notes.test.ts
```

Expected: all pass.

- [ ] **Step 6: Run the whole suite and the build**

```bash
npx vitest run
```

```bash
npm run build
```

Expected: both green. `Note` is a widely-used type, so the build is what proves
no other consumer was constructing one by hand.

- [ ] **Step 7: Commit**

```bash
git add src/graph/notes.ts tests/notes.test.ts
git commit -m "feat: a note carries the colour it asks for

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Scope / Negative constraints

- Do NOT modify `src/graph/color.ts`.
- Do NOT touch `src/mindmap/layout.ts` — inheritance is T03.
- Do NOT add a `color` field to `oracle/graph_check.py`. The oracle pins tree
  shape only and has no opinion about frontmatter.
