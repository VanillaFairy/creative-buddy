# T04: Paint

**Depends on:** T03b
**Read first:** `shared/interfaces.md`, `shared/conventions.md`, `knowledge/commit.md`

**Files:**
- Modify: `src/mindmap/MindmapView.tsx` (two lines, one per painter)
- Modify: `styles.css`

No automated tests. `MindmapView` is a view shell and the project's standing
rule is that every decision lives in a pure module beside it — the two decisions
here already do (`color.ts`, `layout.ts`). What is left is drawing, and that is
verified by eye. The manual pass is Step 5 and it is not optional.

## The idea

Each painter sets one inline custom property on the node's group. The stylesheet
reads it as the **second** fallback, behind the heat step:

```css
fill:   var(--cb-heat-fill, var(--cb-tint-fill, DEFAULT));
stroke: var(--cb-heat-line, var(--cb-tint,      DEFAULT));
```

Heat on → the heat classes define `--cb-heat-*` → heat wins. Heat off → they are
undefined → the tint is used. Neither → the flat palette. No painter asks which
mode is on, and there is no precedence code to keep in step.

- [ ] **Step 1: Set the property in the flat-tree painter**

In `src/mindmap/MindmapView.tsx`, find the group built with
`.attr("transform", \`translate(${n.y},${n.x})\`)` — the flat tree's. Directly
after that statement ends (`.attr("aria-label", facts ?? node.stem);`), add:

```ts
      // The colour is a fact about the graph; Heat is a way of reading it. The
      // stylesheet keeps them in that order, so nothing here asks which is on.
      if (node.color !== null) g.style("--cb-tint", node.color);
```

- [ ] **Step 2: Set it in the radial painter**

Find the group built with
`.attr("transform", \`translate(${radialNode.x},${radialNode.y})\`)` and add the
same line after that statement, without the comment — one explanation for one
idea is enough:

```ts
      if (node.color !== null) g.style("--cb-tint", node.color);
```

- [ ] **Step 3: Derive the fill, once, in `styles.css`**

Replace the `.cb-mm-node` rule:

```css
.cb-mm-node {
  cursor: pointer;
  outline: none;
}
```

with:

```css
.cb-mm-node {
  cursor: pointer;
  outline: none;
  /* A node's effective colour arrives as `--cb-tint`, set inline by the
     painters. Lines take it whole and areas take it at a fraction, so one
     value in a note's frontmatter paints both and composites over whichever
     theme is loaded.

     The trap: where no note above set a tint, this `var()` cannot resolve,
     which makes `--cb-tint-fill` the guaranteed-invalid value — and that is
     precisely what makes `var(--cb-tint-fill, X)` below fall through to X.
     An uncoloured node keeps the flat palette because of this line, not
     despite it. */
  --cb-tint-fill: color-mix(in srgb, var(--cb-tint) 22%, transparent);
}
```

- [ ] **Step 4: Give every painted shape the middle fallback**

Six rules in `styles.css`. Each change is the same shape: the existing default
becomes the fallback of a tint lookup. Nothing else in these rules moves.

`.cb-mm-box`:

```css
.cb-mm-box {
  fill: var(--cb-heat-fill, var(--cb-tint-fill, var(--background-secondary)));
  stroke: var(--cb-heat-line, var(--cb-tint, var(--cb-rail)));
  stroke-width: 1px;
  transition: stroke 100ms ease, fill 100ms ease;
}
```

The hover rule that follows it — only the `fill` line changes, the `stroke:
var(--cb-live)` stays:

```css
.cb-mm-node:hover .cb-mm-box,
.cb-mm-node:focus-visible .cb-mm-box,
.cb-mm-node:hover .cb-mm-child-region,
.cb-mm-node:focus-visible .cb-mm-child-region {
  fill: var(--cb-heat-fill, var(--cb-tint-fill, var(--background-modifier-hover)));
  stroke: var(--cb-live);
  stroke-width: 1.5px;
}
```

`.cb-mm-child-region`:

```css
.cb-mm-child-region {
  fill: var(--cb-heat-fill, var(--cb-tint-fill, var(--background-secondary)));
  stroke: var(--cb-heat-line, var(--cb-tint, var(--cb-rail)));
  stroke-width: 1px;
  transition: stroke 100ms ease, fill 100ms ease;
}
```

`.cb-mm-hub-spine`:

```css
.cb-mm-hub-spine {
  fill: var(--cb-heat-line, var(--cb-tint, var(--cb-live)));
}
```

`.cb-mm-dot` — the stroke-width and transition lines are unchanged:

```css
.cb-mm-dot {
  fill: var(--cb-heat-fill, var(--cb-tint-fill, var(--cb-rail)));
  stroke: var(--cb-heat-line, var(--cb-tint, var(--background-modifier-border-hover)));
  stroke-width: 1.5;
  transition: fill 120ms ease, stroke 120ms ease;
}
```

`.cb-mm-hub-dot`:

```css
.cb-mm-hub-dot {
  fill: var(--cb-heat-fill, var(--cb-tint-fill, var(--cb-live)));
  stroke: var(--cb-heat-line, var(--cb-tint, transparent));
}
```

`.cb-mm-fold-mark` — only the `stroke` line changes:

```css
.cb-mm-fold-mark {
  pointer-events: none;
  opacity: 0;
  stroke: var(--cb-heat-line, var(--cb-tint, var(--cb-ink)));
  stroke-width: 1.5;
  stroke-linecap: round;
  transition: opacity 100ms ease;
}
```

Leave `.cb-mm-dot-hidden` alone. It is only drawn while Heat is on, so a tint
could never reach it.

- [ ] **Step 5: Build, deploy, and look at it**

```bash
npm run build
```

```bash
deploy.bat
```

Then in the vault, reload the plugin and check all six:

1. Put `color: "#c94f7c"` in a branch note. In **radial**, its dot and every dot
   below it turn that colour — a filled centre and a stronger outline.
2. Switch to the **flat tree**. The same notes' boxes take the colour, in the
   same places.
3. Give a note **below** it `color: teal`. That note and its own descendants go
   teal; its siblings stay pink.
4. Turn **Heat** on. Every colour gives way to the heat scale. Turn it off — the
   colours come back.
5. Hover a coloured node. The border goes live-blue, the fill keeps its colour.
6. Fold a coloured branch. The dot keeps its colour; in the flat tree the
   child-ref area beside the divider keeps it too.

If a shape goes black, or a whole node vanishes, you have an unresolved `var()`
somewhere — an invalid `fill` falls back to inherited, and SVG's inherited fill
is black. Check the rule you last touched.

- [ ] **Step 6: Commit**

```bash
git add src/mindmap/MindmapView.tsx styles.css
git commit -m "feat: the map paints a note in the colour it asks for

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Scope / Negative constraints

- Do NOT add a `if (this.heatmap)` check to the colour path. The stylesheet
  already orders them; a second opinion in TypeScript is the thing this design
  exists to avoid.
- Do NOT write a test that greps `styles.css`. The project's rules forbid
  asserting on source text.
- Do NOT change the heat step declarations or the 22% without saying why.
