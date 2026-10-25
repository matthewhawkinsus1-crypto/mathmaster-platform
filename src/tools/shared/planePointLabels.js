/*
 * WHERE A POINT'S NAME GOES SO IT CAN BE READ (FB16, "S2 on the 0").
 *
 * A point's label has always been drawn up and to the right of its dot. On a
 * phone the dots and the text both grow (planeTextScale.js) and the plane is
 * only 290px wide, so the Transformations Lab's five source points S1 to S5,
 * one unit apart on a diagonal, are 18 by 12 px apart: each label lands under
 * the next dot or over a number on an axis. The first label is under the
 * second dot, the one beside the origin sits on the 0.
 *
 * A label keeps that place while nothing is there. When its box would touch
 * another dot, another label, or a number drawn on an axis, it tries the other
 * sides of its own dot (left of it, below it, straight above, straight below,
 * then the same a little farther out) and takes the first that is clear. When
 * none is clear it takes the one that covers least, a dot counting most (a
 * hidden point is worse than a crowded name), then a name, then an axis number.
 *
 * Pure geometry in the plane's viewBox units, in the style of planeTextScale.js:
 * a dot is { x, y, radius, label }; `avoid` is a list of boxes the labels must
 * not cover (the axis numbers); `bounds` is the drawing area.
 */

// A bold label's average advance, in ems; an overestimate errs toward moving.
const GLYPH_WIDTH = 0.62;
const CAP_HEIGHT = 0.78;
const DESCENT = 0.2;
const GAP = 1.5;
// What covering each kind of thing costs, per unit of area covered.
const COST_DOT = 3;
const COST_LABEL = 1.5;
const COST_AXIS_NUMBER = 1;
const COST_OUTSIDE = 4;

/** The box the text of `label` fills when its baseline starts at (x, y). */
const labelBox = ({ x, y, anchor, label, fontSize }) => {
  const width = String(label).length * GLYPH_WIDTH * fontSize;
  const left = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
  return { left, right: left + width, top: y - CAP_HEIGHT * fontSize, bottom: y + DESCENT * fontSize };
};

const overlapArea = (a, b) => {
  const across = Math.min(a.right + GAP, b.right) - Math.max(a.left - GAP, b.left);
  const down = Math.min(a.bottom + GAP, b.bottom) - Math.max(a.top - GAP, b.top);
  return across > 0 && down > 0 ? across * down : 0;
};

export const boxesTouch = (a, b) => overlapArea(a, b) > 0;

/** The square a dot's circle fills: a little generous, so a name keeps off the edge. */
const dotBox = (dot) => ({ left: dot.x - dot.radius, right: dot.x + dot.radius, top: dot.y - dot.radius, bottom: dot.y + dot.radius });

const outsideArea = (box, bounds) => {
  if (!bounds) return 0;
  const area = (box.right - box.left) * (box.bottom - box.top);
  const across = Math.min(box.right, bounds.right) - Math.max(box.left, bounds.left);
  const down = Math.min(box.bottom, bounds.bottom) - Math.max(box.top, bounds.top);
  return across > 0 && down > 0 ? area - across * down : area;
};

// Where to try, nearest the old place first. `side`, `above` and `below` keep the text clear of a grown dot.
const candidatesFor = (dot, fontSize) => {
  const side = Math.max(10, dot.radius + 4);
  const above = -Math.max(9, dot.radius + 3);
  const below = Math.max(16, dot.radius + fontSize * 0.9);
  // The six places beside the dot, then the same sides a little farther out and
  // straight left and right: a diagonal of dots one unit apart needs the room.
  return [
    { dx: 10, dy: -9, anchor: 'start' },
    { dx: -side, dy: above, anchor: 'end' },
    { dx: side, dy: below, anchor: 'start' },
    { dx: -side, dy: below, anchor: 'end' },
    { dx: 0, dy: above - 4, anchor: 'middle' },
    { dx: 0, dy: below + 2, anchor: 'middle' },
    { dx: side * 1.7, dy: above * 1.7, anchor: 'start' },
    { dx: -side * 1.7, dy: above * 1.7, anchor: 'end' },
    { dx: side * 1.7, dy: below * 1.5, anchor: 'start' },
    { dx: -side * 1.7, dy: below * 1.5, anchor: 'end' },
    { dx: side + 6, dy: 4, anchor: 'start' },
    { dx: -(side + 6), dy: 4, anchor: 'end' },
  ];
};

/**
 * One { x, y, anchor } per dot, in the dots' order (null for a dot with no
 * label, or no dot). `x, y` is where the label's text starts, as SVG text takes it.
 */
export const placePointLabels = ({ dots = [], fontSize = 11, bounds = null, avoid = [] } = {}) => {
  // Every dot keeps a name off it, labelled or not.
  const every = dots.filter(Boolean).map(dotBox);
  const taken = [];
  return dots.map((dot) => {
    if (!dot || String(dot.label ?? '') === '') return null;
    let best = null;
    for (const candidate of candidatesFor(dot, fontSize)) {
      const spot = { x: dot.x + candidate.dx, y: dot.y + candidate.dy, anchor: candidate.anchor };
      const box = labelBox({ ...spot, label: dot.label, fontSize });
      const cost = every.reduce((sum, other) => sum + COST_DOT * overlapArea(box, other), 0)
        + taken.reduce((sum, other) => sum + COST_LABEL * overlapArea(box, other), 0)
        + avoid.reduce((sum, other) => sum + COST_AXIS_NUMBER * overlapArea(box, other), 0)
        + COST_OUTSIDE * outsideArea(box, bounds);
      if (!best || cost < best.cost) best = { spot, box, cost };
      if (cost === 0) break;
    }
    taken.push(best.box);
    return best.spot;
  });
};

/** The box a placed label fills: `spot` is what placePointLabels returned for it. */
export const placedLabelBox = ({ spot, label, fontSize }) => labelBox({ ...spot, label, fontSize });

/** The box a number drawn on an axis fills, for `avoid`: `characters` wide, baseline at `y`. */
export const axisNumberBox = ({ x, y, anchor = 'middle', characters, fontSize }) => labelBox({ x, y, anchor, label: 'x'.repeat(Math.max(1, characters)), fontSize: fontSize * 0.9 });
