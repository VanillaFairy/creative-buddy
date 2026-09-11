/**
 * The one `kind:` the plugin reads for itself.
 *
 * Every other kind is a graph's own filing vocabulary, defined by its charter,
 * and nothing outside the inspector strip has an opinion about it. `service` is
 * the exception: a note filed under it is infrastructure rather than content —
 * an `Images` folder rather than a chapter — and the map draws it as a dashed
 * dot instead of a box.
 *
 * The word is spelled here once so the renderer and `assets/prompts/system.md`
 * cannot drift apart about what it is.
 */

const SERVICE = "service";

/**
 * Whether a note's kind is the reserved one.
 *
 * `toLowerCase`, never `toLocaleLowerCase` — the latter turns the I in a
 * Turkish locale into a dotless ı and would stop reading `SERVICE`.
 */
export function isService(kind: string | null): boolean {
  return kind !== null && kind.toLowerCase() === SERVICE;
}
