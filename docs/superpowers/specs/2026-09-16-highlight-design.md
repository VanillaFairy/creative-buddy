# Highlight — design

A way of reading the map around one note. Right-click a note, tick
**Highlight**, and everything not connected to it dims, while the connections
between the notes that stay lit are drawn at full weight and stay drawn. From
there you can grow or trim what is lit, one note at a time or a whole
neighbourhood at once.

**Highlight** is the name of the view. Its words, used throughout:

- **Highlight is on / off** — whether the map is in this view.
- **The Highlight center** — the note you ticked Highlight on. Its name is shown
  in the map header.
- **In the Highlight** — a note that is lit. Every other note is **dimmed**.

## Behaviour

### Turning it on, moving it, turning it off

- Every note's context menu carries a **Highlight** checkbox.
- Ticking it on a note starts Highlight with that note as the center. The notes
  in the Highlight are the center plus its **neighbours** (below).
- Ticking it on a different note while Highlight is on makes that note the new
  center and starts over from it — whatever had been added or removed is
  forgotten.
- Unticking it on the center turns Highlight off. That is the only way out.

### Neighbours

A note's neighbours are its parent, its children, and every note it shares a
cross-link with, in either direction. They are read from the whole graph, not
from what is drawn, so a fold never changes who a note's neighbours are.

### Growing and trimming

While Highlight is on, two more actions appear:

- **Add to Highlight** (on a dimmed note) lights that one note.
- **Remove from Highlight** (on a lit note other than the center) dims it. The
  center cannot be removed; it has no Remove item, and the rule refuses it
  anyway.
- **Extend Highlight** (on any note) lights the note and all its neighbours,
  including any that had been removed earlier.

What the menu shows, by note:

| Note | Items |
|---|---|
| any, Highlight off | Highlight ☐ |
| the center | Highlight ☑, Extend Highlight |
| lit, not the center | Highlight ☐, Remove from Highlight, Extend Highlight |
| dimmed | Highlight ☐, Add to Highlight, Extend Highlight |

### The set is a snapshot

What is lit changes only when you click. If a new link to the center appears
while Highlight is on — the interviewer writes one, say — the linked note stays
dimmed until you add it.

### What is drawn lit

- A note is lit when it is in the Highlight.
- A folded branch is drawn lit when it is in the Highlight **or hides a note that
  is**. Folds are never opened by Highlight; the folded branch stands in for
  what it hides.
- A tree edge or cross-link is lit only when **both** of its drawn ends are lit.
  Where an end is hidden in a fold, the folded branch standing in for it is the
  end that counts.
- Cross-links that are lit stay drawn at the hover weight for as long as
  Highlight is on.

Everything else is dimmed. Dimmed notes behave exactly as before: click, alt-click,
fold and hover all work, and they have the context menu. Hover still lights the
hovered note's cross-links on top of Highlight, dimmed or not.

### Header

While Highlight is on, the map header shows **Highlight: *center name*** between
the note count and the settings gear. It is a label, not a control, truncates
with an ellipsis on a narrow pane so the project picker keeps its room, and
carries the center's full path as a tooltip.

### Lifetime

Highlight lives only while you look. It is not saved with the view: switching
project or reopening Obsidian leaves it off. While it is on, every redraw checks
it against the notes that exist — if the center has gone (deleted, or renamed
away), Highlight turns off; a lit note that has gone simply drops out.

## Architecture

### `src/mindmap/highlight.ts` — the rules

Pure: no Obsidian, no DOM, tested in `tests/mindmap-highlight.test.ts`. Every decision
above lives here.

- State: `Highlight | null`, where `Highlight = { center: string; lit: ReadonlySet<string> }`.
  `lit` always contains `center`; the operations are the only way to make one, and
  none of them can take the center out.
- `neighboursOf(data, path)` — parent, children, cross-link partners, from
  `parentOf` and `crossLinks` of `MindmapData`.
- Transitions, each returning a new state:
  - `toggle(state, data, path)` — off if `path` is the center, otherwise a fresh
    Highlight centered on `path`.
  - `add(state, path)`, `remove(state, path)` (a no-op on the center),
    `extend(state, data, path)`.
  - `prune(state, existing)` — off when the center is missing, otherwise drop the
    missing lit paths.
- `menuFor(state, path)` — which items a note's menu carries, and whether
  Highlight is ticked.
- Drawing questions: whether a drawn note is lit (itself, or a folded branch
  hiding a lit note), and whether an edge between two drawn ends is lit.

The flat tree prunes folded branches out of `MindmapData.root`, so the drawn tree
cannot answer who a note's neighbours are, or which folded branch hides a lit
note. `buildMindmapData` already computes the full hierarchy's `parentOf`; it
gains one field, `parentOf: ReadonlyMap<string, string>`, covering every note in
the graph whether pruned or not. Children are its inverse, and a hidden note's
stand-in is its nearest drawn ancestor along it. (`layout.ts` holds two NUL
bytes, so this change shows as a binary diff.)

### `MindmapView.tsx` — the shell

- Holds `private highlight: Highlight | null = null`. Not in `getState`;
  `showGraph` sets it back to `null`.
- `redraw()` runs `prune` against the graph's notes before painting.
- `wireNode` adds a `contextmenu` handler (pointer, the context-menu key, and
  Shift+F10 on a focused node) that builds an Obsidian `Menu` from `menuFor`.
  Highlight is a checked item via `MenuItem.setChecked`. Each item applies its
  transition, stores the result and redraws. The radial caption, which stops
  click propagation, gets the same menu.
- `paintCartesian` and `paintRadial` ask the drawing questions once per note and
  per edge and set classes: `cb-mm-dimmed` on dimmed notes, edges and cross-links;
  a persistent lit class on lit cross-links, separate from `cb-mm-crosslink-live`
  so that hover leaving a note cannot turn them off.
- The header chip is created in `redraw()` between the stats span and
  `settingsMenu`.

### `styles.css`

`cb-mm-dimmed` lowers opacity on top of whatever the element already is, so heat,
tint and fold marks keep working. The persistent lit cross-link class matches the
`cb-mm-crosslink-live` look. The header chip gets an ellipsis. The dimmed opacity
is a starting value to be tuned by eye on a real vault, not a measured constant.

## Testing

`tests/mindmap-highlight.test.ts`, against small fixture graphs built in each test, with
expected sets computed from the fixture's own links rather than written out:

- neighbours include parent, children and cross-links in both directions;
- toggle on, toggle off on the center, toggle elsewhere recenters and forgets
  adds and removes;
- add; remove; remove on the center changes nothing; extend relights removed
  neighbours;
- prune turns Highlight off when the center is missing and drops missing lit notes
  otherwise;
- `menuFor` for the center, a lit note, a dimmed note, and with Highlight off;
- a folded branch hiding a lit note is drawn lit; an edge is lit only with both
  ends lit, counting a folded stand-in as the end.

The menu, the header chip and the dimming are manual-only, like the rest of the
view; they are added to `docs/superpowers/manual-test-checklist.md`.

## Docs

- `docs/GLOSSARY.md` — a **Highlight** entry with its words (center, in the
  Highlight, dimmed) and the module that decides.
- `src/mindmap/INDEX.md` — Highlight is in-memory by design and pruned on every
  redraw.

## Closed questions

**Q. What counts as directly connected?**
A. Both kinds of connection: parent, children, and cross-links in either
direction. Extend pulls in the same set.

**Q. What happens when a lit neighbour is hidden inside a fold?**
A. Folds are left alone. The folded branch is drawn lit as a stand-in for
what it hides. Auto-unfolding was rejected because it rewrites your saved folds;
a temporary unfold only while Highlight is on was rejected as a second fold state
beside the real one.

**Q. Does Highlight survive a restart or a project switch?**
A. No. It is a way of exploring, not a saved view, and keeping it in memory
avoids stale paths after a restart.

**Q. Which connections stay lit?**
A. Only those with both ends lit, so the picture is exactly the chosen
subgraph. Lighting everything touching a lit note was rejected as too busy.

**Q. Can the center be removed?**
A. No. Unticking Highlight is the only exit; a Remove that exits would be two
controls for one action, and a dimmed center would leave the header naming a
note that is not lit.

**Q. Is the lit set a snapshot or recomputed from the graph on every redraw?**
A. A snapshot. The picture changes only on a click. A live recipe would need a
removed-list that can go stale and could relight a note you just removed.
