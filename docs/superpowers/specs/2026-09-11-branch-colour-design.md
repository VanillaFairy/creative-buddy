# Branch Colour

**Date:** 2026-09-11
**Status:** Designed, not yet built.

## Context

The map paints every note the same. Heat can tint it by open questions, but that
is a reading mode you switch on and off — nothing on the map says "this part of
the graph is the world, that part is the cast" at a glance. On a graph past a
few dozen notes, the shape is legible and the *regions* are not.

The graph already has the structure such a thing would hang off. Since the
folder tree became the hierarchy, a folder holding a note of its own name is a
generation of the tree, and everything in that folder hangs off that note. What
the project has never had is a name for that arrangement, so the docs describe
it in a sentence every time they need it.

Both gaps are one change: name the thing, then let it carry a colour.

## The word

A **branch** is a folder together with the note of its own name that speaks for
it. That note is the **branch note**.

A folder with no such note is not a branch. It is a plain folder — a filing
convenience — and the notes inside it pass up to the nearest branch above. The
hub is the graph's root branch, and the graph folder is its folder.

The word is already half-present: `hierarchy.ts` says a folder "speaks through"
a note and calls a spoken-for folder a generation, and the mindmap's UI language
uses "branch" for the subtree under a dot. Those are the same thing seen from
two ends — the junction and everything hanging off it — so one word covers both
without straining.

## Goals

1. `color:` in a note's frontmatter paints that note's dot, and the dots of
   everything under it, in that colour.
2. The vocabulary — branch, branch note, plain folder — is what the plugin,
   its prompts and its comments say from here on.
3. The interviewer understands the field well enough to explain it and to set
   one on request.

## Non-goals

- No colour picker, no settings UI, no palette editor. The field is hand-written
  or written by the interviewer when asked.
- No colour in the chat, the note inspector or the graph list. The map is the
  only surface that reads it.
- No change to `oracle/graph_check.py`. It pins tree shape and has never read a
  frontmatter field, so there is no Python-first step here.
- `assets/prompts/skill-source.md` stays as it is. It still teaches the old
  `parent:`-is-truth doctrine, but nothing imports it — it is an archival copy of
  the original Obsidian skill, not a shipped prompt.

## The field

```yaml
---
color: "#c94f7c"
---
```

**Quoted, always.** In YAML an unquoted `#` opens a comment, so `color: #c94f7c`
parses as an empty value and the colour silently does nothing. This is the one
part of the feature a hand-editor will get wrong, so it is stated wherever the
field is documented.

Legal values are `#rgb`, `#rrggbb`, or a CSS colour name (`teal`). The four- and
eight-digit hex forms are rejected: the fill derives its own transparency from
the value, and a half-transparent outline would fight it. Anything else — a
malformed hex, a word that is not a colour, a list, a number — is ignored, and
the note falls back to the default palette. A value that does not parse never
reaches the DOM.

A colour applies to the note that carries it and to everything below that note
in the tree. The nearest ancestor carrying one wins; a descendant carrying its
own takes over from there down. It is legal on any note, and on a leaf it simply
paints one dot. It earns its keep on a branch note, because that is where a
subtree hangs, and that is what the documentation recommends.

Colour is the user's own mark, like `status:` and unlike `kind:`. The
interviewer explains it, sets or changes one when asked, and never adds one
unprompted.

## Precedence

Heat wins while it is switched on. Colour is a fact about the graph; Heat and
Radial are ways of reading it, which is the distinction `MindmapView` already
draws. Switching Heat off returns the map to its colours.

This costs no conditional code. Every shape already paints from
`var(--cb-heat-fill, DEFAULT)`, so the tint goes in as the middle fallback and
Heat overrides it by the ordinary mechanism of being defined:

```css
fill:   var(--cb-heat-fill, var(--cb-tint-fill, DEFAULT));
stroke: var(--cb-heat-line, var(--cb-tint,      DEFAULT));
```

`--cb-tint-fill` is derived once, on `.cb-mm-node`:

```css
--cb-tint-fill: color-mix(in srgb, var(--cb-tint) 22%, transparent);
```

When no ancestor set `--cb-tint`, that `var()` cannot resolve, which makes
`--cb-tint-fill` the guaranteed-invalid value — and `var(--cb-tint-fill, X)`
then takes `X`. So an uncoloured note falls straight through to the flat
palette, exactly as it does today.

Deriving the fill rather than asking for two values means one colour paints
both areas, and the transparency composites over whichever theme is loaded, so
a colour picked in the dark theme still reads in the light one. The 22% lives in
`styles.css` beside the heat steps for the reason `heat.ts` gives: a palette
split across two languages drifts.

## Where the code changes

| File | Change |
|---|---|
| `src/graph/color.ts` *(new)* | `parseColor(raw) → string \| null`: the hex grammar and the CSS named-colour set. Pure and total — no DOM, no Obsidian. |
| `src/graph/notes.ts` | `Note` gains `color: string \| null`, parsed at read time beside `kind` and `status`. |
| `src/mindmap/layout.ts` | `MindmapNode` gains `color` — the **effective** one. The existing `toNode` walk carries the inherited value down; `own ?? inherited` is the whole rule. |
| `src/mindmap/MindmapView.tsx` | Both painters set `--cb-tint` on the node's `<g>` when the node has a colour. One line each, no Heat check. |
| `styles.css` | The derivation above, plus the middle fallback on the dot, the hub dot, the box, the hub spine, the child-fold region and the fold mark. |

Radial and flat both take the colour. Two modes that disagree about what the
graph looks like would make the Radial switch read as a change to the graph
rather than a change of view.

## Tests

`tests/color.test.ts` — the parser: the accepted forms, the rejected ones, a
word that is not a colour, and the quoted-hash case that proves an unquoted `#`
arrives as nothing.

`tests/mindmap-layout.test.ts` — inheritance: a colour reaching a grandchild, a
nested colour taking over from its own note down, a sibling outside the branch
staying uncoloured, and a colour surviving a fold.

Painting and stylesheet stay manual-test, per the project's standing rule that
every decision belongs in a pure module beside the view shell rather than in it.

## Where it is written down

- `assets/prompts/system.md` — the branch vocabulary, and `color:` beside
  `kind:` and `status:` with the quoting rule and the never-unasked rule.
- `src/graph/hierarchy.ts` — its header comment names what it already describes.
- `CLAUDE.md` — the architecture note on `hierarchy.ts`.
- `assets/agents/kg-scout.md` — line 16 still tells the scout to follow a note's
  `parent:`, which no longer exists. It follows the folder now.
- `assets/prompts/system.md` — the heading `### The folders mirror the tree`
  contradicts its own body ("they **are** the tree"). Renamed in the same pass.

## Closed questions

**Q. Does a colour on a note that is not a branch note count?**
A. Yes. It paints that note and its subtree like any other; on a leaf the subtree is empty. The alternative — ignoring it — adds a silent failure with nothing to explain it.

**Q. What is a legal colour value?**
A. `#rgb`, `#rrggbb`, or a CSS colour name, validated in TypeScript. A closed named palette in `styles.css` would guarantee both themes read well, but it would also be the plugin choosing the user's colours for them, and the derived-transparency fill already answers the theme problem.

**Q. Heat is on and a note has a colour — which wins?**
A. Heat, everywhere, until it is switched off. It is a reading mode; a colour left standing under Heat would make "where does this graph owe me thinking?" a partial answer.

**Q. Which renderings take the colour?**
A. Both. Dots in radial, boxes and spines in the flat tree, through the custom properties Heat already uses.

**Q. Should the interviewer set colours itself?**
A. Only when asked. Colour is the user's own mark, like a grading, not a filing decision like `kind:`.
