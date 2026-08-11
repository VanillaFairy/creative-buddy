import { describe, it, expect } from "vitest";
import { parseFrontmatter, innermostScalar, parentName } from "../src/graph/frontmatter";

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
