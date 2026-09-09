import { describe, it, expect } from "vitest";
import { placeBands } from "../src/mindmap/bands";
import type { Generation, Seatable } from "../src/mindmap/bands";
import type { Reach } from "../src/mindmap/radial";
import { CAPTION_GAP } from "../src/mindmap/radial";
import { CAPTION_HEIGHT } from "../src/mindmap/geometry";

/**
 * How far each note stands from the hub, tested from the outside.
 *
 * A generation is no longer a ring. It is a band: the notes in it share a
 * floor and a bearing apiece, and each one takes the innermost lane that
 * clears everything already drawn. So nothing here pins a lane step, a
 * clearance or a search: every expectation is computed from what this file
 * handed in plus what came back, or compared between two placements.
 */

const TAU = Math.PI * 2;
const EPS = 1e-6;

const reach = (caption: number, dot = 6): Reach => ({ dot, caption });

/** Notes spread evenly right round the circle, all the same size. */
const evenly = (count: number, at: Reach, prefix = "n"): Seatable[] =>
  Array.from({ length: count }, (_, i) => ({
    path: `${prefix}${i}.md`,
    angle: (i / count) * TAU - Math.PI,
    reach: at,
  }));

/** Notes fanned across a narrow arc centred on twelve o'clock. */
const fannedAt = (angles: number[], at: Reach, prefix = "f"): Seatable[] =>
  angles.map((angle, i) => ({ path: `${prefix}${i}.md`, angle, reach: at }));

const generation = (notes: Seatable[], loosest: number, depth = 1): Generation => ({
  depth,
  loosest,
  notes,
});

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The rectangle a note's ink occupies, worked out from the angle this file
 * handed in and the radius that came back — never from the module's insides. A
 * caption hangs off whichever side of the dot points away from the hub.
 */
const inkOf = (note: Seatable, radius: number): Rect => {
  const x = radius * Math.sin(note.angle);
  const y = -radius * Math.cos(note.angle);
  const tail =
    note.reach.caption > 0 ? note.reach.dot + CAPTION_GAP + note.reach.caption : note.reach.dot;
  const half = Math.max(note.reach.dot, CAPTION_HEIGHT / 2);
  return {
    left: x - (x < 0 ? tail : note.reach.dot),
    right: x + (x < 0 ? note.reach.dot : tail),
    top: y - half,
    bottom: y + half,
  };
};

const overlaps = (a: Rect, b: Rect): boolean =>
  a.left + EPS < b.right && b.left + EPS < a.right && a.top + EPS < b.bottom && b.top + EPS < a.bottom;

const expectNothingOverlaps = (
  notes: Seatable[],
  placed: ReadonlyMap<string, { radius: number; lane: number }>,
  also: Rect[] = [],
): void => {
  const inks = notes.map((note) => ({ note, rect: inkOf(note, placed.get(note.path)!.radius) }));
  for (let i = 0; i < inks.length; i++) {
    for (let j = i + 1; j < inks.length; j++) {
      const a = inks[i]!;
      const b = inks[j]!;
      expect(
        overlaps(a.rect, b.rect),
        `${a.note.path} and ${b.note.path} are drawn on top of each other`,
      ).toBe(false);
    }
    for (const other of also) {
      expect(overlaps(inks[i]!.rect, other), `${inks[i]!.note.path} is drawn over the hub`).toBe(false);
    }
  }
};

const hub = reach(60, 11);

// ---------------------------------------------------------------------------

describe("the overlap helper this file tests with", () => {
  // A no-overlap suite that cannot see an overlap proves nothing.
  const rect = (left: number, top: number): Rect => ({ left, right: left + 40, top, bottom: top + 16 });

  it("sees two rectangles sitting on top of each other", () => {
    expect(overlaps(rect(0, 0), rect(10, 4))).toBe(true);
  });

  it("lets two rectangles that merely touch pass", () => {
    expect(overlaps(rect(0, 0), rect(40, 0))).toBe(false);
  });

  it("lets two rectangles on different lines pass", () => {
    expect(overlaps(rect(0, 0), rect(10, 20))).toBe(false);
  });
});

describe("placeBands: nothing is ever drawn on top of anything else", () => {
  it("holds for a generation packed right round the circle", () => {
    const notes = evenly(40, reach(140));
    const placed = placeBands([generation(notes, 400)], hub, 130);
    expectNothingOverlaps(notes, placed, [inkOf({ path: "hub", angle: 0, reach: hub }, 0)]);
  });

  it("holds when the notes are all different widths", () => {
    const widths = [200, 8, 150, 40, 190, 12, 90, 6];
    const notes = evenly(32, reach(0)).map((note, i) => ({
      ...note,
      reach: reach(widths[i % widths.length]!, 4 + (i % 3)),
    }));
    const placed = placeBands([generation(notes, 500)], hub, 130);
    expectNothingOverlaps(notes, placed);
  });

  it("holds across three generations, which have to clear each other too", () => {
    const one = evenly(6, reach(120), "a");
    const two = evenly(18, reach(150), "b");
    const three = evenly(40, reach(130), "c");
    const placed = placeBands(
      [generation(one, 200, 1), generation(two, 500, 2), generation(three, 900, 3)],
      hub,
      130,
    );
    expectNothingOverlaps([...one, ...two, ...three], placed);
  });

  it("holds for two notes on almost the same bearing", () => {
    const notes = fannedAt([0, 0.001, 0.002], reach(150));
    const placed = placeBands([generation(notes, 300)], hub, 130);
    expectNothingOverlaps(notes, placed);
    // Not vacuous: on one radius these three would be written over each other.
    const stacked = new Map(notes.map((n) => [n.path, { radius: 300, lane: 0 }]));
    expect(() => expectNothingOverlaps(notes, stacked)).toThrow();
  });
});

describe("placeBands: a note steps outward only when it has to", () => {
  it("leaves a whole generation in the innermost lane when the circle has room", () => {
    const notes = evenly(6, reach(40));
    const placed = placeBands([generation(notes, 600)], hub, 130);
    for (const note of notes) expect(placed.get(note.path)!.lane).toBe(0);
    const radii = new Set(notes.map((n) => placed.get(n.path)!.radius));
    expect(radii.size).toBe(1);
  });

  it("keeps notes pointing straight out of the band in the innermost lane", () => {
    // Out at three o'clock a caption lies along its own radius, so two of them
    // are stacked one above the other and a line of text apart is enough. A
    // placement that stepped these outward would be paying for room they do
    // not need.
    const quarter = Math.PI / 2;
    const step = (CAPTION_HEIGHT + 4) / 300;
    const notes = fannedAt([quarter - step, quarter, quarter + step], reach(150));
    const placed = placeBands([generation(notes, 300)], hub, 130);
    for (const note of notes) expect(placed.get(note.path)!.lane).toBe(0);
  });

  it("steps a note lying across the band outward instead of over its neighbour", () => {
    // The same three notes' worth of angle at twelve o'clock, where a caption
    // lies flat across the band and cannot share it.
    const step = (CAPTION_HEIGHT + 4) / 300;
    const notes = fannedAt([-step, 0, step], reach(150));
    const placed = placeBands([generation(notes, 300)], hub, 130);
    expect(Math.max(...notes.map((n) => placed.get(n.path)!.lane))).toBeGreaterThan(0);
  });
});

describe("placeBands: a band comes in as far as it pays to", () => {
  it("draws a crowded generation nearer the hub than its own ring would", () => {
    // The whole point. Left on one radius this generation needs the ring it was
    // handed; given lanes it does not.
    const notes = evenly(40, reach(140));
    const loosest = 400;
    const placed = placeBands([generation(notes, loosest)], hub, 130);
    expect(Math.min(...notes.map((n) => placed.get(n.path)!.radius))).toBeLessThan(loosest);
  });

  it("reaches no further out than leaving the generation on its own ring would", () => {
    // Coming in is only worth it if the band's far side ends up nearer than the
    // ring it replaced. A placement that spent more radius than it saved would
    // pass every overlap check above and make the map bigger.
    const notes = evenly(40, reach(140));
    const loosest = 400;
    const placed = placeBands([generation(notes, loosest)], hub, 130);
    const outer = Math.max(
      ...notes.map((n) => {
        const at = placed.get(n.path)!;
        return at.radius + n.reach.dot + Math.abs(Math.sin(n.angle)) * (CAPTION_GAP + n.reach.caption);
      }),
    );
    const onOneRing = loosest + reach(140).dot + CAPTION_GAP + 140;
    expect(outer).toBeLessThanOrEqual(onOneRing + EPS);
  });

  it("never stacks a band deeper than the circle it stands on", () => {
    // Past that a generation stops reading as a ring around the hub and starts
    // reading as a blob, however little room it saves.
    for (const count of [12, 40, 90]) {
      const notes = evenly(count, reach(150));
      const placed = placeBands([generation(notes, 40 * count)], hub, 130);
      const base = Math.min(...notes.map((n) => placed.get(n.path)!.radius));
      const stack = Math.max(...notes.map((n) => placed.get(n.path)!.radius)) - base;
      expect(stack, `${count} notes stacked ${stack.toFixed(0)} deep on a ${base.toFixed(0)} circle`)
        .toBeLessThanOrEqual(base + EPS);
    }
  });

  it("never seats a band inside the hub's own caption", () => {
    const notes = evenly(8, reach(20));
    const placed = placeBands([generation(notes, 500)], hub, 130);
    const nearest = Math.min(...notes.map((n) => placed.get(n.path)!.radius));
    expect(nearest).toBeGreaterThan(hub.dot + CAPTION_GAP + hub.caption);
  });

  it("keeps each generation outside the one within it", () => {
    const one = evenly(6, reach(120), "a");
    const two = evenly(18, reach(150), "b");
    const placed = placeBands([generation(one, 200, 1), generation(two, 500, 2)], hub, 130);
    const outermostOfOne = Math.max(...one.map((n) => placed.get(n.path)!.radius));
    const innermostOfTwo = Math.min(...two.map((n) => placed.get(n.path)!.radius));
    expect(innermostOfTwo).toBeGreaterThan(outermostOfOne);
  });

  it("holds the density it was given between one band's floor and the next's", () => {
    const one = evenly(4, reach(30), "a");
    const two = evenly(4, reach(30), "b");
    const bases = (leastGap: number): number[] => {
      const placed = placeBands([generation(one, 200, 1), generation(two, 400, 2)], hub, leastGap);
      return [
        Math.min(...one.map((n) => placed.get(n.path)!.radius)),
        Math.min(...two.map((n) => placed.get(n.path)!.radius)),
      ];
    };
    const near = bases(60);
    const far = bases(240);
    expect(far[1]! - far[0]!).toBeGreaterThan(near[1]! - near[0]!);
  });
});

describe("placeBands: what it promises the caller", () => {
  it("places every note it was handed, exactly once", () => {
    const one = evenly(6, reach(120), "a");
    const two = evenly(18, reach(150), "b");
    const placed = placeBands([generation(one, 200, 1), generation(two, 500, 2)], hub, 130);
    expect(placed.size).toBe(one.length + two.length);
    for (const note of [...one, ...two]) expect(placed.get(note.path)).toBeDefined();
  });

  it("reports a lane that agrees with the radius it gave", () => {
    // The lane is what the view and the tests group by, so a lane that did not
    // follow the radius would be a second, lying source of truth.
    const notes = evenly(30, reach(150));
    const placed = placeBands([generation(notes, 400)], hub, 130);
    const base = Math.min(...notes.map((n) => placed.get(n.path)!.radius));
    const step = new Set<number>();
    for (const note of notes) {
      const at = placed.get(note.path)!;
      expect(at.lane).toBeGreaterThanOrEqual(0);
      if (at.lane > 0) step.add((at.radius - base) / at.lane);
    }
    // One and the same step for every lane, whatever that step happens to be.
    expect(step.size).toBeLessThanOrEqual(1);
  });

  it("places the same generation the same way twice", () => {
    const notes = evenly(30, reach(150));
    const once = placeBands([generation(notes, 400)], hub, 130);
    const twice = placeBands([generation(notes, 400)], hub, 130);
    for (const note of notes) {
      expect(twice.get(note.path)!.radius).toBe(once.get(note.path)!.radius);
      expect(twice.get(note.path)!.lane).toBe(once.get(note.path)!.lane);
    }
  });

  it("copes with a generation of one, and with notes that draw no caption", () => {
    const lone = fannedAt([0], reach(80), "one");
    const bare = evenly(5, reach(0), "bare");
    const placed = placeBands([generation(lone, 200, 1), generation(bare, 400, 2)], hub, 130);
    for (const note of [...lone, ...bare]) {
      expect(Number.isFinite(placed.get(note.path)!.radius)).toBe(true);
      expect(placed.get(note.path)!.radius).toBeGreaterThan(0);
    }
  });
});
