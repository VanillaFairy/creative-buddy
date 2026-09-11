/**
 * What counts as a colour a note may ask for.
 *
 * Its own file because the name table is a table, and a table is a thing a
 * reader goes looking for. Total by construction: an unreadable value is null,
 * never a throw and never a string the stylesheet would have to defend against.
 */

/** The alpha forms are out: the map derives its own transparency from the value. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;

/**
 * The CSS Color 4 §6.1 named colours, and only those.
 *
 * `transparent` and `currentcolor` are absent on purpose: both are legal CSS and
 * neither paints a dot you could see, so they read better as a mistake than as a
 * wish. The §6.3 system colours (`canvastext`, `buttonface`, …) are absent for a
 * different reason — they resolve against the OS theme, so the dot a note asked
 * for would change out from under it.
 *
 * A Set, not an object literal: a plain-object lookup answers to `__proto__`,
 * `constructor` and `toString`, so `color: constructor` would score a hit.
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
 * Takes an already-scalarised string rather than raw frontmatter, so this module
 * never learns what a frontmatter is.
 */
export function parseColor(value: string | null): string | null {
  if (value === null) return null;
  // toLowerCase, never toLocaleLowerCase: under a Turkish locale the latter
  // folds INDIGO to "ındıgo" and the table misses it. No test run outside that
  // locale can catch it, so it is a contract line rather than a preference.
  const text = value.trim().toLowerCase();
  if (HEX.test(text)) return text;
  return NAMES.has(text) ? text : null;
}
