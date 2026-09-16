# T04: Dimming

**Role:** — (view shell; manual-test by the project's rule)
**Depends on:** T03
**Read first:** `shared/interfaces.md`, `shared/conventions.md`, the spec's *What is drawn lit*, `styles.css` lines around `.cb-mm-crosslink` (the chord `display: none` comment explains a measured performance decision — read it), `../../knowledge/typecheck-build.md`, `../../knowledge/commit.md`

**Files:**
- Modify: `src/mindmap/MindmapView.tsx` (`drawTree`, `paintCartesian`, `paintRadial`)
- Modify: `styles.css`

**Interfaces:**
- Consumes: `drawnLit` from `./highlight`; `this.highlight` and `this.collapse` on the view; `MindmapData.parentOf`.
- Produces: classes `cb-mm-dimmed` and `cb-mm-crosslink-held`.

## Scope / Negative constraints

- The only question the painters ask is "is this path in the drawn-lit set?".
  Everything behind that answer is `drawnLit`'s.
- Do not change hover (`setActive`, `cb-mm-crosslink-live`). Hover must keep
  working on top of Highlight, dimmed notes included.
- Do not touch the chord `display: none` rule itself; add a sibling rule.
- Do not change the layout, the zoom, or `edgeOpacity`.

- [ ] **Step 1: Compute the drawn-lit set once per draw**

In `drawTree`, before calling a painter:

```ts
const lit = this.highlight === null
  ? null
  : drawnLit(this.highlight, data.parentOf, this.collapse.collapsedSet(this.graphDir!));
```

Pass `lit: ReadonlySet<string> | null` to both painters as a new parameter.
Inside each painter, two local helpers keep the call sites short:

```ts
const dimmed = (path: string): boolean => lit !== null && !lit.has(path);
const held = (a: string, b: string): boolean => lit !== null && lit.has(a) && lit.has(b);
```

- [ ] **Step 2: Paint — `paintCartesian`**

- Tree edges (`root.links()`): add `cb-mm-dimmed` when either
  `link.source.data.path` or `link.target.data.path` is dimmed. Use
  `classed("cb-mm-dimmed", …)` after setting `class`.
- Cross-links: `cb-mm-crosslink-held` when `held(cross.from, cross.to)`;
  otherwise `cb-mm-dimmed` when Highlight is on.
- Node groups: `cb-mm-dimmed` when `dimmed(node.path)`.

- [ ] **Step 3: Paint — `paintRadial`**

Same three rules, with `link.source.path` / `link.target.path` for tree edges and
`radialNode.path` for nodes.

- [ ] **Step 4: Styles**

Beside the `.cb-mm-crosslink` block in `styles.css`:

- `.cb-mm-node.cb-mm-dimmed` — lower `opacity` on the group, so the dot or box,
  the caption, the fold count and the heat colour dim together.
- `.cb-mm-edge.cb-mm-dimmed` — lower `stroke-opacity`, **not** `opacity`: the
  edge's `opacity` attribute carries the depth fade, and `stroke-opacity`
  multiplies with it instead of replacing it.
- `.cb-mm-crosslink.cb-mm-dimmed:not(.cb-mm-crosslink-live)` — lower
  `stroke-opacity`, so hover still lights a dimmed link at full weight.
- `.cb-mm-crosslink-held` — the same weight as `.cb-mm-crosslink-live`.
- `.cb-mm-crosslink-chord.cb-mm-crosslink-held` — `display: inline`, beside the
  existing `-live` rule. One comment: held chords are drawn for as long as
  Highlight is on, which is a subset the performance note above allows because
  a Highlight holds a handful of links, not the whole mesh.

Starting values: nodes and tree edges `0.25`, dimmed cross-links `0.4` on top of
their existing faintness. They are starting points to tune by eye, not measured
constants — say that in one comment, and do not add them to the INDEX's list of
measurements.

Add no transitions for the dimming: it is a state, not an animation, so the
`prefers-reduced-motion` block needs no change.

- [ ] **Step 5: Typecheck, suite, build**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: all clean.

- [ ] **Step 6: Manual smoke test**

Deploy and in the dev vault, on both maps, with Heat off and then on:

- tick Highlight → only the center and its neighbours stay at full weight; the
  tree edges and cross-links between them are drawn; everything else dims;
- on the radial map, the cross-links inside the Highlight are visible without
  hovering;
- hover a dimmed note → its cross-links light over the dimming; move away → the
  held links stay;
- Add a far note → it and its links to already-lit notes come up; Remove it →
  they go back;
- fold a branch holding a lit note → the folded branch stays lit; unfold → the
  note itself is lit again;
- Heat colours still read on lit notes and are visibly dimmed on dimmed ones.

Tune the two opacities if a real graph reads badly, and note the values you
settled on in the report. If the dev vault is not reachable, say so and leave
the checks for T06.

- [ ] **Step 7: Commit**

```bash
git add src/mindmap/MindmapView.tsx styles.css
git commit -m "feat: Highlight dims the map outside it and holds its connections

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git log -1 --stat
```
