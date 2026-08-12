import { describe, it, expect } from "vitest";
import { noteLinktext } from "../src/chat/links";

/** The shape MarkdownRenderer gives an anchor, minus the DOM. */
function anchor(attrs: Record<string, string>): { classList: { contains(t: string): boolean }; getAttribute(n: string): string | null } {
  const classes = (attrs["class"] ?? "").split(" ");
  return {
    classList: { contains: (t) => classes.includes(t) },
    getAttribute: (n) => attrs[n] ?? null,
  };
}

describe("noteLinktext", () => {
  it("is the data-href of an internal link", () => {
    expect(noteLinktext(anchor({ class: "internal-link", "data-href": "Sea shanties", href: "Sea shanties" }))).toBe("Sea shanties");
  });

  it("keeps a heading or block anchor — openLinkText splits the subpath off itself", () => {
    expect(noteLinktext(anchor({ class: "internal-link", "data-href": "Novel/Chapters#Act two" }))).toBe("Novel/Chapters#Act two");
  });

  it("falls back to href when data-href is missing", () => {
    expect(noteLinktext(anchor({ class: "internal-link", href: "Sea shanties" }))).toBe("Sea shanties");
  });

  it("is null for an external link — those already open in the browser on their own", () => {
    expect(noteLinktext(anchor({ class: "external-link", href: "https://example.com" }))).toBeNull();
  });

  it("is null for an anchor with no link class, such as a footnote or a tag", () => {
    expect(noteLinktext(anchor({ class: "tag", href: "#idea" }))).toBeNull();
  });

  it("is null when the link carries no target at all", () => {
    expect(noteLinktext(anchor({ class: "internal-link", "data-href": "" }))).toBeNull();
  });
});
