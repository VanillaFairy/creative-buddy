/**
 * Which clicked anchors in a rendered message are notes.
 *
 * `MarkdownRenderer.render` builds the anchors and stops there. Obsidian wires
 * link clicks per container — `MarkdownPreviewRenderer.registerDomEvents`, called
 * for the reading view, for embeds and for the editor — and a plugin's own div is
 * never one of those. So the panel delegates clicks itself, and this is the
 * decision it makes on each one.
 */

/** As much of an anchor as the decision needs; `HTMLAnchorElement` is one. */
export interface ClickedAnchor {
  classList: { contains(token: string): boolean };
  getAttribute(name: string): string | null;
}

/**
 * The linktext a clicked anchor points at, or null when it is not a note link.
 *
 * `data-href` before `href`: both carry the raw linktext, but `href` is the one
 * post-processors rewrite. Any subpath rides along — `openLinkText` splits the
 * `#heading` off itself.
 */
export function noteLinktext(anchor: ClickedAnchor): string | null {
  if (!anchor.classList.contains("internal-link")) return null;
  const linktext = anchor.getAttribute("data-href") ?? anchor.getAttribute("href") ?? "";
  return linktext === "" ? null : linktext;
}
