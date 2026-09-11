import { describe, it, expect } from "vitest";
import { parseColor } from "../src/graph/color";

// Values every reading of the spec must accept. Used below for the invariants
// that hold across the whole accepted set, not just one entry of it.
const ACCEPTED = [
  "#c94f7c",
  "#C94F7C",
  "#AbCdEf",
  "#f80",
  "#F80",
  "  #c94f7c  ",
  "teal",
  "TEAL",
  "  RebeccaPurple ",
  "\tmistyrose\n",
  // NBSP and BOM. YAML hands a trailing one straight through, and invisible
  // whitespace should not cost someone their colour.
  " teal﻿",
];

describe("parseColor: the hex forms", () => {
  it("takes three and six digits, in whatever case they were typed", () => {
    expect(parseColor("#c94f7c")).toBe("#c94f7c");
    expect(parseColor("#C94F7C")).toBe("#c94f7c");
    expect(parseColor("#AbCdEf")).toBe("#abcdef");
    expect(parseColor("#f80")).toBe("#f80");
    expect(parseColor("#F80")).toBe("#f80");
    expect(parseColor("#000")).toBe("#000");
    expect(parseColor("#FFFFFF")).toBe("#ffffff");
  });

  it("refuses the alpha forms, because the map derives its own transparency", () => {
    expect(parseColor("#f80a")).toBeNull();
    expect(parseColor("#F80A")).toBeNull();
    expect(parseColor("#c94f7c80")).toBeNull();
    expect(parseColor("#C94F7C80")).toBeNull();
  });

  it("refuses every other digit count, so a hex is whole or it is nothing", () => {
    expect(parseColor("#")).toBeNull();
    expect(parseColor("#f")).toBeNull();
    expect(parseColor("#f8")).toBeNull();
    expect(parseColor("#c94f7")).toBeNull();
    expect(parseColor("#c94f7c8")).toBeNull();
    expect(parseColor("#c94f7c8012")).toBeNull();
  });

  it("refuses a digit that is not a hex digit, at either length", () => {
    expect(parseColor("#ggg")).toBeNull();
    expect(parseColor("#gggggg")).toBeNull();
    expect(parseColor("#f8o")).toBeNull();
    expect(parseColor("#12345z")).toBeNull();
    expect(parseColor("#-12")).toBeNull();
    expect(parseColor("#c9.f7c")).toBeNull();
  });

  it("refuses a good hex sitting inside something else", () => {
    expect(parseColor("##f80")).toBeNull();
    expect(parseColor("#f80#f80")).toBeNull();
    expect(parseColor("#f80;")).toBeNull();
    expect(parseColor("x#f80")).toBeNull();
    expect(parseColor("color: #f80")).toBeNull();
    expect(parseColor('"#f80"')).toBeNull();
    expect(parseColor("'#c94f7c'")).toBeNull();
    // Anchored to the whole string, not to a line of it: a multi-line answer
    // would go on to `style.setProperty` as two colours and a newline.
    expect(parseColor("#f80\n#f80")).toBeNull();
  });

  it("refuses hex digits with no hash in front of them", () => {
    expect(parseColor("c94f7c")).toBeNull();
    expect(parseColor("f80")).toBeNull();
    expect(parseColor("0xc94f7c")).toBeNull();
    expect(parseColor("123456")).toBeNull();
  });

  it("refuses a hash split from its digits, or digits split from each other", () => {
    expect(parseColor("# f80")).toBeNull();
    expect(parseColor("#f 80")).toBeNull();
    expect(parseColor("#c94 f7c")).toBeNull();
  });
});

describe("parseColor: the named colours", () => {
  it("takes names from across the table, not just the famous ones", () => {
    // The table is copied by hand, so the sample is weighted towards what a
    // truncated or stale paste loses. It is not protection, and the table is
    // not protected at this tier: 34 of the 148 names are named here, and a
    // dropped source line, the three `pale*` entries or a misspelt
    // `chartreuse` would all go unnoticed. What stands in for coverage is a
    // cross-check made entry for entry on 2026-09-11 against four independent
    // tables — `mdn-data`, `@csstools/color-helpers`, `@asamuzakjp/css-color`
    // and `d3-color` — all four of which agree on exactly the same 148 names,
    // with nothing missing, extra, misspelt or out of order.
    for (const name of [
      "aliceblue",
      "antiquewhite",
      "blanchedalmond",
      "cornflowerblue",
      "darkolivegreen",
      "gainsboro",
      "honeydew",
      "indigo",
      "lavenderblush",
      "lightgoldenrodyellow",
      "mediumspringgreen",
      "midnightblue",
      "mistyrose",
      "navajowhite",
      "olivedrab",
      "papayawhip",
      "peachpuff",
      "rosybrown",
      "saddlebrown",
      "teal",
      "thistle",
      "whitesmoke",
      "yellowgreen",
    ]) {
      expect(parseColor(name)).toBe(name);
    }
  });

  it("takes the names a stale or American table would have dropped", () => {
    // rebeccapurple arrived with Color 4; the grey spellings and the two
    // aliases are in the table beside their twins, and a partial paste loses
    // exactly these.
    for (const name of [
      "rebeccapurple",
      "grey",
      "gray",
      "darkgrey",
      "darkslategrey",
      "dimgrey",
      "lightslategrey",
      "cyan",
      "aqua",
      "magenta",
      "fuchsia",
    ]) {
      expect(parseColor(name)).toBe(name);
    }
  });

  it("takes a name in any case, and answers in one", () => {
    expect(parseColor("TEAL")).toBe("teal");
    expect(parseColor("RebeccaPurple")).toBe("rebeccapurple");
    expect(parseColor("Indigo")).toBe("indigo");
    expect(parseColor("MIDNIGHTBLUE")).toBe("midnightblue");
    expect(parseColor("YellowGreen")).toBe("yellowgreen");
  });

  it("matches a whole name, never a piece of one", () => {
    expect(parseColor("rebecca")).toBeNull();
    expect(parseColor("purple!")).toBeNull();
    expect(parseColor("tealish")).toBeNull();
    expect(parseColor("xteal")).toBeNull();
    expect(parseColor("tealteal")).toBeNull();
    expect(parseColor("teal blue")).toBeNull();
    expect(parseColor("teal,blue")).toBeNull();
    expect(parseColor("teal\nblue")).toBeNull();
  });

  it("refuses a word that sounds like a colour but is not in the table", () => {
    expect(parseColor("banana")).toBeNull();
    expect(parseColor("burgundy")).toBeNull();
    expect(parseColor("cerulean")).toBeNull();
    expect(parseColor("ochre")).toBeNull();
    expect(parseColor("charcoal")).toBeNull();
    expect(parseColor("darkteal")).toBeNull();
    expect(parseColor("bluegreen")).toBeNull();
    // CSS Color 4 §6.3, not §6.1: legal CSS, but they resolve against the OS
    // theme, so a dot painted with one answers to something the note did not say.
    expect(parseColor("canvastext")).toBeNull();
    expect(parseColor("buttonface")).toBeNull();
    expect(parseColor("accentcolor")).toBeNull();
  });

  it("refuses the keywords that would paint nothing, however they are spelled", () => {
    expect(parseColor("transparent")).toBeNull();
    expect(parseColor("TRANSPARENT")).toBeNull();
    expect(parseColor("currentcolor")).toBeNull();
    expect(parseColor("currentColor")).toBeNull();
    expect(parseColor("CurrentColor")).toBeNull();
  });

  it("refuses the CSS-wide keywords, which are not colours either", () => {
    expect(parseColor("inherit")).toBeNull();
    expect(parseColor("initial")).toBeNull();
    expect(parseColor("unset")).toBeNull();
    expect(parseColor("revert")).toBeNull();
    expect(parseColor("none")).toBeNull();
    expect(parseColor("auto")).toBeNull();
  });

  it("refuses a name inherited from Object, not from CSS", () => {
    // A plain-object lookup table answers to these; a Set does not.
    expect(parseColor("constructor")).toBeNull();
    expect(parseColor("__proto__")).toBeNull();
    expect(parseColor("prototype")).toBeNull();
    expect(parseColor("toString")).toBeNull();
    expect(parseColor("hasOwnProperty")).toBeNull();
    expect(parseColor("valueOf")).toBeNull();
  });
});

describe("parseColor: the other CSS colour syntaxes", () => {
  it("refuses the function forms, which the stylesheet is not asked to carry", () => {
    expect(parseColor("rgb(1 2 3)")).toBeNull();
    expect(parseColor("rgb(255,0,0)")).toBeNull();
    expect(parseColor("rgba(1,2,3,0.5)")).toBeNull();
    expect(parseColor("hsl(200 50% 40%)")).toBeNull();
    expect(parseColor("color-mix(in srgb, red, blue)")).toBeNull();
    expect(parseColor("color(display-p3 1 0 0)")).toBeNull();
  });

  it("refuses a custom property, however plausible it looks in a stylesheet", () => {
    expect(parseColor("var(--cb-tint)")).toBeNull();
    expect(parseColor("--cb-tint")).toBeNull();
  });
});

describe("parseColor: absence", () => {
  it("has nothing to say about an absent or empty field", () => {
    expect(parseColor(null)).toBeNull();
    expect(parseColor("")).toBeNull();
    expect(parseColor("   ")).toBeNull();
    expect(parseColor("\t")).toBeNull();
    expect(parseColor("\n")).toBeNull();
  });
});

describe("parseColor: what it hands back", () => {
  it("trims what YAML left around the value, and keeps what is inside it", () => {
    expect(parseColor("  #c94f7c  ")).toBe("#c94f7c");
    expect(parseColor("\tteal\n")).toBe("teal");
    expect(parseColor(" RebeccaPurple ")).toBe("rebeccapurple");
    // Inner whitespace is part of the value, and no colour has any.
    expect(parseColor("rebecca purple")).toBeNull();
    expect(parseColor("misty rose")).toBeNull();
  });

  it("hands back the value it was given, trimmed and lower-cased — nothing else", () => {
    for (const raw of ACCEPTED) {
      expect(parseColor(raw)).toBe(raw.trim().toLowerCase());
    }
  });

  it("answers the same on every call, carrying no state between them", () => {
    for (let i = 0; i < 3; i++) {
      expect(parseColor("#f80")).toBe("#f80");
      expect(parseColor("#c94f7c")).toBe("#c94f7c");
      expect(parseColor("teal")).toBe("teal");
      expect(parseColor("#f80a")).toBeNull();
      expect(parseColor("banana")).toBeNull();
    }
  });

  it("is total: every string gets an answer, none gets an exception", () => {
    const hostile = [
      "",
      " ",
      "#",
      "#f80a",
      "^#f80$",
      "#(f80)",
      "[teal]",
      "*",
      "\\",
      "\u0000",
      "�",
      "＃f80",
      "tëal",
      "🎨",
      "теal",
      "a".repeat(10000),
      "#".repeat(10000),
      "%s",
      "{}",
      "[object Object]",
    ];
    for (const value of hostile) {
      expect(parseColor(value), value).toBeNull();
    }
  });
});
