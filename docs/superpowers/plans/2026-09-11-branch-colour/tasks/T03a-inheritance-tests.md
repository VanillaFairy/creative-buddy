# T03a: Inheritance tests

**Role:** `red`
**Depends on:** T02
**Read first:** `shared/interfaces.md`, `shared/conventions.md`, `knowledge/run-tests.md`, `knowledge/commit.md`

**Files:**
- Modify: `tests/mindmap-layout.test.ts` (append a new `describe` block)

**You do not implement anything in this task.** `src/mindmap/layout.ts` is
T03b's to change.

## What the rule means

From the design doc: a colour applies to the note that carries it and to
everything below that note in the tree. The nearest ancestor carrying one wins;
a descendant carrying its own takes over from there down. `MindmapNode.color` is
the **effective** colour — already resolved, so no painter ever walks upward.

Four things follow, and each gets a test: a colour reaches a child; it reaches a
grandchild through a branch note that has none of its own; a descendant's own
colour takes over from itself down; a branch elsewhere in the graph stays
uncoloured. A fifth pins that a fold does not wash the colour out.

If anything here reads as ambiguous, **escalate rather than picking a reading**.

## Background you need

`buildMindmapData(model, graphDir, collapsed, options?)` builds the tree. A
`GraphModel` can be constructed straight from a `Map` of vault-relative paths to
file contents — no fixture directory needed. A folder counts as a graph when it
holds a note of its own name carrying a `## Charter` line.

The file already has a module-scope `findNode(root, stem)` helper (line 76);
reuse it rather than writing a second one.

- [ ] **Step 1: Write the failing tests**

Append to `tests/mindmap-layout.test.ts`:

```ts
describe("colour down a branch", () => {
  const CHARTER = "## Charter\n\nA noir game.\n";
  const coloured = (colour: string): string => `---\ncolor: "${colour}"\n---\n\nBody.\n`;

  /**
   * Cast is coloured and Villains recolours itself; Suspects carries no colour
   * of its own, so it is the one that proves a colour crosses a branch note on
   * its way down. Places is the control: another limb, untouched.
   */
  const graph = (): GraphModel =>
    new GraphModel(
      "Vault",
      new Map([
        ["Noir game/Noir game.md", CHARTER],
        ["Noir game/Cast/Cast.md", coloured("#c94f7c")],
        ["Noir game/Cast/Detective.md", "Body.\n"],
        ["Noir game/Cast/Suspects/Suspects.md", "Body.\n"],
        ["Noir game/Cast/Suspects/Butler.md", "Body.\n"],
        ["Noir game/Cast/Villains/Villains.md", coloured("teal")],
        ["Noir game/Cast/Villains/Kingpin.md", "Body.\n"],
        ["Noir game/Places/Places.md", "Body.\n"],
      ]),
    );

  const colourOf = (data: ReturnType<typeof buildMindmapData>, stem: string): string | null =>
    findNode(data.root!, stem)!.color;

  it("paints the note that asks for it", () => {
    const data = buildMindmapData(graph(), "Noir game", new Set());
    expect(colourOf(data, "Cast")).toBe("#c94f7c");
  });

  it("reaches a child, and a grandchild through a branch note with no colour of its own", () => {
    const data = buildMindmapData(graph(), "Noir game", new Set());
    expect(colourOf(data, "Detective")).toBe("#c94f7c");
    expect(colourOf(data, "Suspects")).toBe("#c94f7c");
    expect(colourOf(data, "Butler")).toBe("#c94f7c");
  });

  it("a nearer colour takes over from its own note down", () => {
    const data = buildMindmapData(graph(), "Noir game", new Set());
    expect(colourOf(data, "Villains")).toBe("teal");
    expect(colourOf(data, "Kingpin")).toBe("teal");
  });

  it("leaves the rest of the graph alone", () => {
    const data = buildMindmapData(graph(), "Noir game", new Set());
    expect(colourOf(data, "Noir game")).toBeNull();
    expect(colourOf(data, "Places")).toBeNull();
  });

  it("a colour on the hub paints the whole graph", () => {
    const model = new GraphModel(
      "Vault",
      new Map([
        ["Noir game/Noir game.md", `---\ncolor: teal\n---\n\n${CHARTER}`],
        ["Noir game/Places/Places.md", "Body.\n"],
        ["Noir game/Places/Docks.md", "Body.\n"],
      ]),
    );
    const data = buildMindmapData(model, "Noir game", new Set());
    for (const stem of ["Noir game", "Places", "Docks"]) {
      expect(colourOf(data, stem), stem).toBe("teal");
    }
  });

  it("a fold does not wash the colour out of what it hides", () => {
    // The circle asks for the whole tree and draws part of it, so a folded
    // note is still built — and still has to know what colour it is.
    const data = buildMindmapData(graph(), "Noir game", new Set(["Noir game/Cast/Cast.md"]), {
      prune: false,
    });
    expect(colourOf(data, "Detective")).toBe("#c94f7c");
    expect(colourOf(data, "Kingpin")).toBe("teal");
  });
});
```

- [ ] **Step 2: Run them and confirm they fail for the right reason**

```bash
npx vitest run tests/mindmap-layout.test.ts
```

Expected: the new tests fail because `color` is `undefined` on every node —
`expected undefined to be '#c94f7c'`. Every pre-existing test in the file still
passes. If anything throws instead, stop and say so.

- [ ] **Step 3: Commit**

```bash
git add tests/mindmap-layout.test.ts
git commit -m "test: a colour reaches everything below the note that asks for it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Scope / Negative constraints

- Do NOT touch `src/mindmap/layout.ts`.
- Do NOT touch `tests/mindmap-radial.test.ts` — T03b edits it to keep a type
  literal compiling, and two tasks must not share a file.
- Do NOT test painting, CSS, or Heat precedence. Those are not decisions this
  module makes.
