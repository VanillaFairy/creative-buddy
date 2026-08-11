import { describe, it, expect } from "vitest";
import { parseFrontmatter, innermostScalar, parentName, stripFrontmatterBlock } from "../src/graph/frontmatter";

describe("parseFrontmatter", () => {
  it("reads a simple mapping", () => {
    expect(parseFrontmatter('---\nparent: "[[X]]"\nkind: scene\n---\nbody')).toEqual({ parent: "[[X]]", kind: "scene" });
  });
  it("returns {} when there is no frontmatter", () => {
    expect(parseFrontmatter("just prose")).toEqual({});
    expect(parseFrontmatter("")).toEqual({});
  });
  it("returns {} when the block never closes", () => {
    expect(parseFrontmatter("---\nparent: X\nno closer")).toEqual({});
  });
  it("accepts ... as a closer", () => {
    expect(parseFrontmatter("---\nparent: X\n...\nbody")).toEqual({ parent: "X" });
  });
  it("returns {} on YAML that will not parse", () => {
    expect(parseFrontmatter("---\nparent: [unclosed\n---\n")).toEqual({});
  });
  it("returns {} when the document is not a mapping", () => {
    expect(parseFrontmatter("---\n- a\n- b\n---\n")).toEqual({});
    expect(parseFrontmatter("---\njust a scalar\n---\n")).toEqual({});
  });
  it("does not see frontmatter behind a BOM (validation semantics)", () => {
    expect(parseFrontmatter("﻿---\nparent: X\n---\n")).toEqual({});
  });
});

describe("innermostScalar", () => {
  it("digs through nested lists", () => expect(innermostScalar([["Sample"]])).toBe("Sample"));
  it("empty list is null", () => expect(innermostScalar([])).toBeNull());
  it("scalar passes through", () => expect(innermostScalar("x")).toBe("x"));
});

describe("parentName", () => {
  it("normalises the unquoted wikilink (nested list) form", () => expect(parentName([["Sample"]])).toBe("Sample"));
  it("strips [[ ]] and quotes", () => expect(parentName('"[[Sample]]"')).toBe("Sample"));
  it("drops |alias and #heading tails", () => {
    expect(parentName("[[Sample|the s]]")).toBe("Sample");
    expect(parentName("[[Sample#Part]]")).toBe("Sample");
  });
  it("empty and missing mean no parent", () => {
    expect(parentName(undefined)).toBeNull();
    expect(parentName(null)).toBeNull();
    expect(parentName("")).toBeNull();
    expect(parentName("   ")).toBeNull();
  });
  it("plain names pass through trimmed", () => expect(parentName("  Noir game  ")).toBe("Noir game"));
});

describe("pyStrip semantics via parseFrontmatter", () => {
  it("strips FS/GS/RS/US like Python str.strip()", () => {
    // U+001C..U+001F (FS/GS/RS/US) built via fromCharCode so the source stays
    // free of raw control bytes; Python's str.strip() treats them as whitespace.
    const fs = String.fromCharCode(0x1c);
    expect(parseFrontmatter(`${fs}---${fs}\nparent: X\n---\n`)).toEqual({ parent: "X" });
  });
});

describe("stripFrontmatterBlock", () => {
  it("removes a well-formed block", () => {
    expect(stripFrontmatterBlock("---\nparent: X\n---\nbody")).toBe("body");
  });
  it("does not treat a BOM-prefixed line as a delimiter (same rule as parseFrontmatter)", () => {
    const text = "﻿---\nparent: X\n---\nbody";
    expect(stripFrontmatterBlock(text)).toBe(text);
  });
  it("returns text unchanged when the block never closes", () => {
    expect(stripFrontmatterBlock("---\nparent: X\nno closer")).toBe("---\nparent: X\nno closer");
  });
});
