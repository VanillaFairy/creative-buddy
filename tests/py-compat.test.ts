import { describe, it, expect } from "vitest";
import { casefold, pyRepr, pyStr, sortKeyWindows, comparePathSegments, parseIsoDate, epochDays, isoDate } from "../src/graph/py-compat";
import { normalizeContent, stripBom } from "../src/graph/reader";
import { baseName, dirName, stemOf } from "../src/graph/types";

describe("pyRepr", () => {
  it("prefers single quotes", () => expect(pyRepr("Nobody")).toBe("'Nobody'"));
  it("uses double quotes when the string holds a single quote", () => expect(pyRepr("O'Hara")).toBe('"O\'Hara"'));
  it("escapes the quote char when both quote kinds appear", () => expect(pyRepr(`a"b'c`)).toBe(`'a"b\\'c'`));
  it("escapes backslashes", () => expect(pyRepr("a\\b")).toBe("'a\\\\b'"));
});

describe("sort compat", () => {
  it("sortKeyWindows orders prefix-siblings the Windows way", () => {
    const paths = ["Act2/y.md", "Act/x.md"];
    paths.sort((a, b) => (sortKeyWindows(a) < sortKeyWindows(b) ? -1 : 1));
    expect(paths).toEqual(["Act2/y.md", "Act/x.md"]); // "2" (50) < "\\" (92)
  });
  it("comparePathSegments matches Python Path ordering", () => {
    // ("a b",) > ("a","b"): tuple compare stops at "a b" vs "a", and the
    // shorter prefix "a" sorts first — verified against live Python 3.14.
    expect(comparePathSegments("a b", "a/b")).toBeGreaterThan(0);
    expect(comparePathSegments("a/b", "a")).toBeGreaterThan(0);
    expect(comparePathSegments("Alpha", "Beta")).toBeLessThan(0);
  });
});

describe("dates", () => {
  it("parses real dates incl. single-digit month/day", () => {
    expect(parseIsoDate("2026-8-9")).toEqual({ y: 2026, m: 8, d: 9 });
    expect(isoDate({ y: 2026, m: 8, d: 9 })).toBe("2026-08-09");
  });
  it("rejects impossible dates", () => {
    expect(parseIsoDate("2026-13-45")).toBeNull();
    expect(parseIsoDate("2026-02-30")).toBeNull();
  });
  it("epochDays orders correctly across months", () => {
    expect(epochDays({ y: 2026, m: 9, d: 1 }) - epochDays({ y: 2026, m: 8, d: 31 })).toBe(1);
  });
});

describe("reader", () => {
  it("normalizes CRLF and lone CR", () => expect(normalizeContent("a\r\nb\rc")).toBe("a\nb\nc"));
  it("strips exactly one BOM", () => expect(stripBom("\uFEFF\uFEFFx")).toBe("\uFEFFx"));
  it("leaves BOM-free text alone", () => expect(stripBom("x")).toBe("x"));
});

describe("path pieces", () => {
  it("baseName / dirName / stemOf", () => {
    expect(baseName("a/b/c.md")).toBe("c.md");
    expect(dirName("a/b/c.md")).toBe("a/b");
    expect(dirName("c.md")).toBe("");
    expect(stemOf("a/b/Heavy Rain.md")).toBe("Heavy Rain");
    expect(stemOf("a/x.tar.md")).toBe("x.tar");
    expect(stemOf("a/.md")).toBe(".md"); // Python Path(".md").stem
  });
  it("casefold lowercases (incl. Cyrillic)", () => expect(casefold("Мысли")).toBe("мысли"));
  it("pyStr renders yaml dates like Python str()", () => {
    expect(pyStr(new Date(Date.UTC(2024, 0, 1)))).toBe("2024-01-01");
    expect(pyStr(42)).toBe("42");
  });
});
