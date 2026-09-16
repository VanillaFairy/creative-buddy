# T03: Menu, state and header

**Role:** — (view shell; manual-test by the project's rule)
**Depends on:** T02b
**Read first:** `shared/interfaces.md`, `shared/conventions.md`, `src/mindmap/INDEX.md`, the spec's *Behaviour* → *Turning it on*, *Growing and trimming*, *Header*, *Lifetime*; `../../knowledge/typecheck-build.md`; `../../knowledge/commit.md`

**Files:**
- Modify: `src/mindmap/MindmapView.tsx`
- Modify: `styles.css` (header chip only)

**Interfaces:**
- Consumes: `Highlight`, `Links`, `toggle`, `add`, `remove`, `extend`, `prune`, `menuFor` from `./highlight`; `MindmapData.parentOf` / `crossLinks`.
- Produces: `MindmapView.highlight` state and `wireNode(…, links: Links)`, which T04 builds on.

After this task Highlight can be switched on, moved, grown, trimmed and switched
off, and the header names the center — but nothing dims yet. That is T04.

## Scope / Negative constraints

- No decision about who is lit or what a menu offers is made here. Every `if`
  about that is a call into `highlight.ts`.
- Do not add Highlight to `getState` / `setState`.
- Do not touch the painters' classes or any cross-link styling — T04.

- [ ] **Step 1: State and lifetime**

In `MindmapView`:

- Import `Menu` from `obsidian`, and `Highlight`, `Links`, `add`, `extend`,
  `menuFor`, `prune`, `remove`, `toggle` from `./highlight`.
- Add the field, with one comment saying why it stays out of `getState`
  (Highlight is a way of exploring, not a saved view; a stored path could outlive
  its note across a restart):

  ```ts
  private highlight: Highlight | null = null;
  ```

- In `showGraph`, set `this.highlight = null` beside `this.lastTransform = null`.
- In `redraw()`, where an unresolvable `graphDir` falls back to `null`, clear
  `this.highlight` as well.
- In `redraw()`, once `graphDir` is known good and before building `data`, prune
  against the notes that exist:

  ```ts
  const notes = model.notes(this.graphDir);
  this.highlight = prune(this.highlight, new Set(notes.map((note) => note.path)));
  ```

- [ ] **Step 2: Header chip**

In `redraw()`, between the `cb-mm-stats` span and `this.settingsMenu(header)`:

```ts
if (this.highlight !== null) {
  const center = this.highlight.center;
  const stem = notes.find((note) => note.path === center)?.stem ?? center;
  header.createSpan({ cls: "cb-mm-highlight", text: `Highlight: ${stem}`, attr: { title: center } });
}
```

In `styles.css`, beside `.cb-mm-stats`, style `.cb-mm-highlight` to match the
stats span's size and muted colour, and to give way on a narrow pane:
`min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
plus whatever `flex` value keeps the project picker and the gear at their
natural size. Read `.cb-mm-header` and `.cb-mm-stats` first and match them.

- [ ] **Step 3: The context menu**

Give `wireNode` a fourth parameter `links: Links`, and pass `data` from both
call sites (`paintCartesian` and `paintRadial` already hold `data`; `MindmapData`
satisfies `Links`).

Inside `wireNode`, beside the existing handlers:

```ts
g.on("contextmenu", (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  const apply = (next: Highlight | null): void => {
    this.highlight = next;
    this.redraw();
  };
  const on = this.highlight;
  const offer = menuFor(on, node.path);
  const menu = new Menu();
  menu.addItem((item) =>
    item.setTitle("Highlight").setChecked(offer.checked).onClick(() => apply(toggle(on, links, node.path))),
  );
  if (on !== null && offer.membership === "add") {
    menu.addItem((item) => item.setTitle("Add to Highlight").onClick(() => apply(add(on, node.path))));
  }
  if (on !== null && offer.membership === "remove") {
    menu.addItem((item) => item.setTitle("Remove from Highlight").onClick(() => apply(remove(on, node.path))));
  }
  if (on !== null && offer.extend) {
    menu.addItem((item) => item.setTitle("Extend Highlight").onClick(() => apply(extend(on, links, node.path))));
  }
  // A menu raised from the keyboard can arrive without a pointer position, so it
  // opens beside the node instead of in the corner of the window.
  if (event.clientX === 0 && event.clientY === 0) {
    const rect = (event.currentTarget as Element).getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom });
  } else {
    menu.showAtMouseEvent(event);
  }
});
```

No redraw is scheduled through `scheduleRedraw` here: a click is one event, and
folds already redraw directly.

The radial caption stops `click` from reaching the node but not `contextmenu`,
so right-clicking a caption reaches this handler with no extra wiring. Confirm
that in Step 5 rather than adding a second handler.

- [ ] **Step 4: Typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 5: Manual smoke test**

Deploy (`deploy.bat`) and in the dev vault, on both the flat and the radial map:

- right-click a note → a menu with an unticked **Highlight**;
- tick it → the header shows `Highlight: <name>`; right-click the same note →
  **Highlight** ticked plus **Extend Highlight**, no Remove;
- right-click a neighbour → **Remove from Highlight** and **Extend Highlight**;
  a far note → **Add to Highlight** and **Extend Highlight**;
- untick on the center → the chip goes;
- right-click a radial caption → same menu as its dot;
- focus a node with Tab and press Shift+F10 → the menu opens beside the node;
- switch project → the chip is gone.

If the dev vault is not reachable from this session, say so in the report and
leave the checks for T06's hand-off — do not claim them.

- [ ] **Step 6: Commit**

```bash
git add src/mindmap/MindmapView.tsx styles.css
git commit -m "feat: Highlight on a note's context menu, named in the map header

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git log -1 --stat
```
