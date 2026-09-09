/**
 * How far each note stands from the hub.
 *
 * A generation is a band rather than a ring. Its notes share a floor, and each
 * takes the innermost lane that clears everything already drawn — stepping out
 * a line of text at a time when it cannot. That is worth doing because the two
 * ways a caption can be in the way are complementary. Near twelve o'clock a
 * caption lies flat across its band and takes its whole width out of it, but
 * it is only a line deep, so one lane's worth of radius buys a whole
 * neighbour's caption. Near three o'clock it is the other way round: it points
 * straight down its own radius, costs the band almost nothing across, and no
 * lane could clear it anyway. So the band pulls in where the captions lie
 * across it and stays put where they lie along it.
 *
 * Angles are decided elsewhere and arrive settled; nothing here moves a note
 * round the circle.
 */

import { CAPTION_HEIGHT } from "./geometry";
import { CAPTION_GAP } from "./radial";
import type { Reach } from "./radial";

/** A note whose bearing is already settled and whose distance is not. */
export interface Seatable {
  path: string;
  /** Radians. Zero points straight up and the angle grows clockwise. */
  angle: number;
  reach: Reach;
}

/** One generation, and the ring it would have had to itself. */
export interface Generation {
  depth: number;
  /**
   * The radius this generation would need with every note on one circle. It is
   * the loosest a band ever gets: there is nothing to gain by going further
   * out, because on that circle nothing has to step aside in the first place.
   */
  loosest: number;
  notes: ReadonlyArray<Seatable>;
}

export interface Placement {
  radius: number;
  /** Which lane of its band, counting outward from nought. */
  lane: number;
}

/** How far apart two lanes of one band sit: a line of text, plus air. */
const LANE_STEP = CAPTION_HEIGHT + 6;
/** Air between one band's outermost ink and the next band's innermost dots. */
const BAND_CLEARANCE = 16;
/**
 * How many radii a band tries between its floor and its own ring.
 *
 * The cost of coming in is not smooth — it falls, then jumps as a lane opens,
 * then falls again — so there is nothing to bisect towards and the whole range
 * gets walked. Twenty-eight puts the steps well inside a lane's depth on every
 * graph measured, and a step is one seating of one generation.
 */
const RADIUS_TRIES = 28;

interface Ink {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The rectangle a note's ink covers, with its caption hanging away from the hub. */
const inkAt = (angle: number, radius: number, reach: Reach): Ink => {
  const x = radius * Math.sin(angle);
  const y = -radius * Math.cos(angle);
  const tail = reach.caption > 0 ? reach.dot + CAPTION_GAP + reach.caption : reach.dot;
  const half = Math.max(reach.dot, CAPTION_HEIGHT / 2);
  return {
    left: x - (x < 0 ? tail : reach.dot),
    right: x + (x < 0 ? reach.dot : tail),
    top: y - half,
    bottom: y + half,
  };
};

const hits = (a: Ink, b: Ink): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** How far a note reaches away from the hub, caption and all. */
const reachOutward = (note: Seatable, radius: number): number =>
  radius +
  note.reach.dot +
  Math.abs(Math.sin(note.angle)) * (note.reach.caption > 0 ? CAPTION_GAP + note.reach.caption : 0);

interface Seating {
  seats: Array<{ path: string; radius: number; lane: number; ink: Ink }>;
  /** Where the band's ink stops, so the next band knows what to clear. */
  outer: number;
  /** How deep the lanes ran, which is not the same as how far the ink reached. */
  stack: number;
}

function seatAt(
  notes: ReadonlyArray<Seatable>,
  base: number,
  drawn: ReadonlyArray<Ink>,
): Seating {
  const seats: Seating["seats"] = [];
  const mine: Ink[] = [];
  let outer = base;
  let stack = 0;
  for (const note of notes) {
    let lane = 0;
    let ink = inkAt(note.angle, base, note.reach);
    while (mine.some((other) => hits(ink, other)) || drawn.some((other) => hits(ink, other))) {
      lane++;
      ink = inkAt(note.angle, base + lane * LANE_STEP, note.reach);
    }
    const radius = base + lane * LANE_STEP;
    mine.push(ink);
    seats.push({ path: note.path, radius, lane, ink });
    stack = Math.max(stack, lane * LANE_STEP);
    outer = Math.max(outer, reachOutward(note, radius));
  }
  return { seats, outer, stack };
}

/**
 * Seats every generation, walking outward from the hub.
 *
 * `leastGap` is the density the map was asked for: the least room between one
 * band's floor and the next one's.
 */
export function placeBands(
  generations: ReadonlyArray<Generation>,
  hub: Reach,
  leastGap: number,
): Map<string, Placement> {
  const placed = new Map<string, Placement>();
  const drawn: Ink[] = [inkAt(0, 0, hub)];

  let floor = hub.dot + CAPTION_GAP + hub.caption + BAND_CLEARANCE;
  let previousBase = 0;

  for (const generation of [...generations].sort((a, b) => a.depth - b.depth)) {
    const notes = [...generation.notes].sort((a, b) => a.angle - b.angle);
    const bottom = Math.max(floor, previousBase + leastGap);
    const loosest = Math.max(bottom, generation.loosest);

    // On its own ring nothing has to step aside, so that is both the loosest
    // this band gets and the yardstick every tighter one is judged against.
    let best = seatAt(notes, loosest, drawn);
    let bestBase = loosest;
    for (let step = 1; step <= RADIUS_TRIES; step++) {
      const base = bottom + ((loosest - bottom) * (RADIUS_TRIES - step)) / RADIUS_TRIES;
      const tried = seatAt(notes, base, drawn);
      // A band stops reading as one generation around the hub, and starts
      // reading as a blob, once its lanes run deeper than the circle they
      // stand on. That is what says when to stop pulling in, and it scales
      // with the graph rather than being a number somebody picked.
      if (tried.stack > base) continue;
      if (tried.outer < best.outer) {
        best = tried;
        bestBase = base;
      }
    }

    for (const seat of best.seats) {
      placed.set(seat.path, { radius: seat.radius, lane: seat.lane });
      drawn.push(seat.ink);
    }
    floor = best.outer + BAND_CLEARANCE;
    previousBase = bestBase;
  }

  return placed;
}
