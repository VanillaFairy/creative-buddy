# T01b: Colour parser

**Role:** `green`
**Depends on:** T01a
**Read first:** `shared/interfaces.md`, `shared/conventions.md`, `knowledge/run-tests.md`, `knowledge/commit.md`

**Files:**
- Create: `src/graph/color.ts`
- Test (READ-ONLY): `tests/color.test.ts`

## Scope / Negative constraints

- **Do NOT modify `tests/color.test.ts`.** It was authored by T01a and is
  locked. If you believe a test is wrong, stop and escalate — never edit it to
  match your implementation.
- Write no new tests in this task.
- `src/graph/` takes no Obsidian imports and no DOM. This module is pure.
- Do not touch `src/graph/notes.ts`; wiring the field in is T02.

- [ ] **Step 1: Read the locked tests**

```bash
npx vitest run tests/color.test.ts
```

Read `tests/color.test.ts` in full before writing anything. It is the
specification; `shared/interfaces.md` gives the signature.

- [ ] **Step 2: Write the implementation**

Create `src/graph/color.ts`:

```ts
/**
 * What counts as a colour a note may ask for.
 *
 * Its own file because the name table is a table, and a table is a thing a
 * reader goes looking for. Total by construction: an unreadable value is null,
 * never a throw and never a string the stylesheet would have to defend against.
 */

/** `#rgb` and `#rrggbb`. The alpha forms are out — the map derives its own. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

/**
 * The CSS Color 4 named colours. `transparent` and `currentcolor` are absent on
 * purpose: both are legal CSS and neither paints a dot you could see, so they
 * are better read as a mistake than honoured.
 */
const NAMES: ReadonlySet<string> = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque",
  "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood",
  "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
  "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray",
  "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
  "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
  "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue",
  "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro",
  "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey",
  "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
  "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
  "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
  "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
  "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen",
  "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue",
  "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
  "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue",
  "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace",
  "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
  "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff",
  "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple", "red",
  "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen",
  "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray",
  "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle",
  "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
  "yellowgreen",
]);

/**
 * A note's `color:`, validated and canonicalised. Null means no colour — the
 * field was absent, or what it held is not one.
 *
 * Takes an already-scalarised string rather than raw frontmatter, so this
 * module never learns what a frontmatter is.
 */
export function parseColor(value: string | null): string | null {
  if (value === null) return null;
  const text = value.trim().toLowerCase();
  if (HEX.test(text)) return text;
  return NAMES.has(text) ? text : null;
}
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run tests/color.test.ts
```

Expected: all tests pass. If one does not, fix `src/graph/color.ts` — never the
test.

- [ ] **Step 4: Typecheck**

```bash
npm run build
```

Expected: the build completes and writes `main.js`. This module is not imported
by anything yet, so the build is only proving it compiles.

- [ ] **Step 5: Commit**

```bash
git add src/graph/color.ts
git commit -m "feat: what counts as a colour a note may ask for

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
