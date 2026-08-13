/**
 * How hot a note is — the step of the palette its open-question count lands on.
 *
 * The count itself is `countOpenQuestions` in `src/open-questions.ts`. It moved
 * out when the composer started asking for the same number: two surfaces
 * disagreeing about whether a note owes anything would be worse than either of
 * them being wrong. What stays here is the mapping from a count to a colour,
 * which is nobody else's business.
 */

/** The top of the scale. Ten questions and forty are both "as hot as it gets". */
export const HEAT_MAX = 10;

/** The palette step a count lands on, clamped to the top of the scale. */
export function heatBucket(count: number): number {
  return count > HEAT_MAX ? HEAT_MAX : count;
}

/**
 * The class carrying that step's colours. The eleven steps are declared in
 * `styles.css`, once per theme; naming them here is what keeps the two ends
 * from drifting apart.
 */
export function heatClass(count: number): string {
  return `cb-mm-heat-${heatBucket(count)}`;
}
