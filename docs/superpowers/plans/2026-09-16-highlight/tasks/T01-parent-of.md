# T01: `parentOf` on the map data

**Role:** — (mechanical; one agent writes test and code)
**Depends on:** —
**Read first:** `shared/interfaces.md` (the `layout.ts` section), `shared/conventions.md`, `../../knowledge/run-tests.md`, `../../knowledge/commit.md`

**Files:**
- Modify: `src/mindmap/layout.ts` (`MindmapData` interface; the `return` of `buildMindmapData`)
- Test: `tests/mindmap-layout.test.ts`

**Interfaces:**
- Consumes: `hierarchyOf` from `src/graph/hierarchy.ts` — already called inside `buildMindmapData`, returning `{ parentOf, childrenOf }`.
- Produces: `MindmapData.parentOf: ReadonlyMap<string, string>`, used by T02 and T04.

## Why

The flat map builds with `prune: true`, which leaves a folded branch's notes out
of `root` entirely. Highlight has to know those notes' parents anyway — to find
neighbours, and to find which drawn branch stands in for a hidden lit note.
`buildMindmapData` already holds the full map and throws it away.

## Scope / Negative constraints

- `layout.ts` contains two literal NUL bytes. Edit it with the Edit tool only.
  Before committing, confirm they survived: `grep -c $'\x00' src/mindmap/layout.ts`
  should print a non-zero count, and `npx vitest run tests/mindmap-crosslinks.test.ts`
  must pass.
- Do not change how `root`, `crossLinks` or `hiddenPaths` are built.

- [ ] **Step 1: Write the failing test**

Append to `tests/mindmap-layout.test.ts`, reusing its existing `dataFor` helper
and `simple` fixture:

```ts
describe("parentOf", () => {
  it("covers every note but the hub, whether a fold pruned it or not", () => {
    const open = dataFor("simple", "Noir game");
    const hub = open.root!.path;
    const refs = refsIn(open);
    const folded = dataFor("simple", "Noir game", [refs.path]);

    // Pruned out of the drawn tree…
    expect(refsIn(folded).children).toEqual([]);
    // …but still known to the hierarchy.
    for (const child of refs.children) expect(folded.parentOf.get(child.path)).toBe(refs.path);
    expect(folded.parentOf.has(hub)).toBe(false);
  });

  it("agrees with the drawn tree wherever the tree is whole", () => {
    const data = dataFor("simple", "Noir game");
    const walk = (node: NonNullable<typeof data.root>): void => {
      for (const child of node.children) {
        expect(data.parentOf.get(child.path)).toBe(node.path);
        walk(child);
      }
    };
    walk(data.root!);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run tests/mindmap-layout.test.ts
```

Expected: FAIL — `parentOf` is undefined on the returned data.

- [ ] **Step 3: Implement**

In `MindmapData`, add the `parentOf` field with the doc comment from
`shared/interfaces.md`. In `buildMindmapData`, include the `parentOf` it already
destructures from `hierarchyOf` in the returned object.

- [ ] **Step 4: Run the tests and the typecheck**

```bash
npx vitest run tests/mindmap-layout.test.ts tests/mindmap-crosslinks.test.ts tests/mindmap-radial.test.ts
npx tsc --noEmit
```

Expected: all pass, typecheck clean. If a test file builds a `MindmapData`
literal and now fails to compile, add `parentOf: new Map()` to that literal — a
required field, not coverage.

- [ ] **Step 5: Commit**

```bash
git add src/mindmap/layout.ts tests/mindmap-layout.test.ts
git commit -m "feat: the map data carries the whole hierarchy's parents

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git log -1 --stat
```
