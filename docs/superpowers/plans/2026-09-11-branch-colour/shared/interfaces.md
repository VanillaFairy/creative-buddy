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

### Settled while writing the tests

T01a's author surfaced five cases the design left open. They are decided here,
once, so no implementer decides them quietly:

1. **System colours are not named colours.** The table is CSS Color 4 §6.1
   `<named-color>` only — `canvastext`, `accentcolor`, `buttonface` and the rest
   of §6.3 are rejected. They resolve against the OS theme, so honouring one
   would put a colour on the map that neither the note nor the Obsidian theme
   chose.
2. **Plain `String.trim()`.** It strips NBSP and BOM as well as spaces, and that
   is the wanted behaviour: this is a hand-edited field, and invisible whitespace
   should not cost someone their colour. The deliberate BOM asymmetry in
   `frontmatter.ts` is a Python-parity obligation and does not reach here.
3. **`toLowerCase()`, never `toLocaleLowerCase()`.** Under a Turkish locale the
   latter turns `INDIGO` into `ındıgo` and rejects it. No test can catch this on
   a machine in another locale, so it is a contract line instead.
4. **A value still wearing quotes is malformed.** `scalarOrNull` hands over
   YAML's parsed scalar, so the quotes are long gone by the time this function
   runs. `'"#f80"'` is not a colour.
5. **No synonym folding.** `grey` and `gray` both come back as written, as do
   `cyan`/`aqua` and `magenta`/`fuchsia`. "One spelling per colour" means one
   *casing*, not one of each pair of aliases — folding would rewrite what the
   user typed into something they did not.

### Settled while writing the inheritance tests

T03a's author surfaced five more. Decided here, once:

6. **An unreadable `color:` inherits.** A note whose value does not parse is
   read as asking for no colour at all, so it takes whatever stands over it —
   identical to a note with no `color:` line. Anything else would need `Note` to
   distinguish "absent" from "present but bad", which means re-reading
   frontmatter in the view layer: a second source of truth, and the thing this
   architecture exists to avoid. The design doc's wording was amended to match.
7. **Cross-links take no colour.** `crossLinks` are arcs between notes, not
   notes. Nothing tints them.
8. **A colour cannot reach into a graph from outside it.** `buildMindmapData`
   only ever sees notes inside `graphDir`, and a graph is self-contained by
   doctrine. Intended, not an oversight.
9. **`layout.ts` knows nothing about Heat.** Precedence lives entirely in the
   stylesheet. The effective colour is never suppressed in the data.
10. **Two notes sharing a stem** in different folders is legal and nothing about
    colour turns on it. No test needed.

**The name table must be a `Set`, not an object literal.** A plain-object lookup
answers to `__proto__`, `constructor` and `toString`, so a note asking for
`color: constructor` would get a truthy hit. T01a pins this.

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
