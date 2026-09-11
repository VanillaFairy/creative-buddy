# Shared Interfaces

**Version:** 1.0

Everything below crosses a task boundary. Names, signatures and null-ness are
fixed here; a task that wants to change one escalates rather than improvising.

## `src/graph/color.ts` (created by T01b)

```ts
/** A note's `color:`, validated. Null means "no colour" — absent or unreadable. */
export function parseColor(value: string | null): string | null;
```

- Takes an **already-scalarised** string, not raw YAML. `notes.ts` does the
  frontmatter part with its own `scalarOrNull`, so this module never learns what
  a frontmatter is.
- Returns the value **lower-cased and trimmed**, so `"#C94F7C"` comes back as
  `"#c94f7c"` and the stylesheet never sees two spellings of one colour.
- Accepts `#rgb`, `#rrggbb`, and the CSS Color 4 named colours.
- Rejects everything else, including `#rgba`/`#rrggbbaa`, `transparent` and
  `currentcolor`.

## `src/graph/notes.ts` (modified by T02)

```ts
export interface Note {
  path: string;
  stem: string;
  aliases: string[];
  kind: string | null;
  status: string | null;
  /** The colour this note asks for, validated. Null when absent or unreadable. */
  color: string | null;
  links: string[];
}
```

`color` sits between `status` and `links`, and is filled by
`parseColor(scalarOrNull(fm["color"]))`.

## `src/mindmap/layout.ts` (modified by T03b)

```ts
export interface MindmapNode {
  path: string;
  stem: string;
  kind: string | null;
  status: string | null;
  /** The colour to paint this node: its own, or the nearest ancestor's. */
  color: string | null;
  children: MindmapNode[];
  collapsedChildren: number;
  openQuestions: number;
  hiddenOpenQuestions: number;
}
```

`MindmapNode.color` is the **effective** colour, already resolved — the painters
never walk upward looking for one. The rule is `note.color ?? inherited`,
applied in the existing `toNode` walk.

## CSS custom properties (T04)

| Property | Set by | Meaning |
|---|---|---|
| `--cb-tint` | the painters, inline on each node's `<g>` | the effective colour, when the node has one |
| `--cb-tint-fill` | `styles.css`, derived on `.cb-mm-node` | the same colour at 22%, for areas rather than lines |
| `--cb-heat-fill` / `--cb-heat-line` | the heat step classes | unchanged; they stay the **first** fallback so Heat keeps winning |

The read order in every shape is:

```css
fill:   var(--cb-heat-fill, var(--cb-tint-fill, DEFAULT));
stroke: var(--cb-heat-line, var(--cb-tint,      DEFAULT));
```
