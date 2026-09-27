/**
 * How scattered the map is drawn, in either shape.
 *
 * Both layouts first pack as tight as their notes allow, then every distance
 * is multiplied by the step's spread: anchors move apart, the notes themselves
 * stay the size they are. Scaling where fixed-size boxes stand by one or more
 * only ever widens the gap between any two of them, so no spread can make two
 * notes collide that the tight layout kept apart — and the same map at a looser
 * step is always the tighter one pulled outward, never a different arrangement.
 */

export type Density = "near" | "mid" | "far";

export const DENSITIES: ReadonlyArray<{ id: Density; label: string; spread: number }> = [
  { id: "near", label: "Near", spread: 1 },
  { id: "mid", label: "Medium", spread: 1.3 },
  { id: "far", label: "Far", spread: 1.7 },
];

export function spreadOf(density: Density): number {
  return DENSITIES.find((step) => step.id === density)!.spread;
}

/** A saved view's density, or Medium for one saved before it had one. */
export function densityFrom(value: unknown): Density {
  return DENSITIES.find((step) => step.id === value)?.id ?? "mid";
}
