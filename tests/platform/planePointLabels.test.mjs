// A POINT'S NAME IS READABLE WHERE THE PLANE IS CROWDED (FB16).
//
// The Transformations Lab on a 390px phone draws its five source points one
// unit apart on a diagonal: 29.6 by 18.7 viewBox units, dots of radius 8, text
// of 23 units. Each name used to be drawn up and to the right of its dot, which
// is under the NEXT dot (S1 under S2), and the name of the point on the origin
// sat on the origin's "0" ("S2 on the 0", the QA walkthrough's words). The
// plane now lets a name step aside to a clear side of its own dot.
//
// planePointLabels.js is pure geometry; these tests judge its answers with a
// separate overlap check written here, on the numbers measured in the browser
// at 390x844 (tests/browser is not needed: the screenshots are in the report).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { axisNumberBox, boxesTouch, placePointLabels, placedLabelBox } from '../../src/tools/shared/planePointLabels.js';

const FONT = 23.2;
const RADIUS = 8;

// A name's box and a dot's square, judged here and not by the module.
const nameBox = (spot, label) => {
  const width = label.length * 0.62 * FONT;
  const left = spot.anchor === 'end' ? spot.x - width : spot.anchor === 'middle' ? spot.x - width / 2 : spot.x;
  return { left, right: left + width, top: spot.y - 0.78 * FONT, bottom: spot.y + 0.2 * FONT };
};
const meet = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const dotSquare = (dot) => ({ left: dot.x - dot.radius, right: dot.x + dot.radius, top: dot.y - dot.radius, bottom: dot.y + dot.radius });
const DEFAULT = { dx: 10, dy: -9, anchor: 'start' };

/** Every clash a set of placed names has: with a dot, with another name, with an axis number. */
const clashes = (dots, spots, avoid) => {
  const found = [];
  dots.forEach((dot, index) => {
    if (!spots[index]) return;
    const box = nameBox(spots[index], dot.label);
    dots.forEach((other, otherIndex) => { if (meet(box, dotSquare(other))) found.push(`${dot.label} over the dot of ${other.label || otherIndex}`); });
    dots.forEach((other, otherIndex) => { if (otherIndex > index && spots[otherIndex] && meet(box, nameBox(spots[otherIndex], other.label))) found.push(`${dot.label} over ${other.label}`); });
    avoid.forEach((number, numberIndex) => { if (meet(box, number)) found.push(`${dot.label} over axis number ${numberIndex}`); });
  });
  return found;
};
const atDefault = (dots) => dots.map((dot) => (dot.label ? { x: dot.x + DEFAULT.dx, y: dot.y + DEFAULT.dy, anchor: DEFAULT.anchor } : null));

// The lab at 390x844: the origin at (279.9, 189.8), one unit = 29.6 across and 18.7 up.
const UNIT = { x: 29.6, y: 18.7 };
const ORIGIN = { x: 279.9, y: 189.8 };
const at = (x, y, label, extra = {}) => ({ x: ORIGIN.x + x * UNIT.x, y: ORIGIN.y - y * UNIT.y, radius: RADIUS, label, ...extra });
const SOURCES = [-2, -1, 0, 1, 2].map((value, index) => at(value, value, `S${index + 1}`));
const IMAGES = [[-5, -2], [-4, -1], [-3, 0], [-2, 1], [-1, 2]].map(([x, y], index) => at(x, y, `P${index + 1}`));
// The numbers on the axes the lab draws: every second unit, x below the axis, y left of it.
const ticks = [-8, -6, -4, -2, 2, 4, 6, 8];
const AXIS_NUMBERS = [
  ...ticks.map((value) => axisNumberBox({ x: ORIGIN.x + value * UNIT.x, y: ORIGIN.y + 24, characters: String(value).length, fontSize: 11 * 2.1 })),
  ...ticks.map((value) => axisNumberBox({ x: ORIGIN.x - 9, y: ORIGIN.y - value * UNIT.y + 4, anchor: 'end', characters: String(value).length, fontSize: 11 * 2.1 })),
];
const BOUNDS = { left: 0, right: 560, top: 0, bottom: 380 };
const place = (dots, avoid = AXIS_NUMBERS) => placePointLabels({ dots, fontSize: FONT, bounds: BOUNDS, avoid });

test('the old place for every name on the phone lab is crowded: the geometry here is the real one', () => {
  const found = clashes(SOURCES, atDefault(SOURCES), AXIS_NUMBERS);
  assert.ok(found.length >= 3, `up and to the right covers other dots and numbers: ${found.join('; ')}`);
  assert.ok(found.some((entry) => /S1 over the dot of S2/.test(entry)), found.join('; '));
});

test('five source points one unit apart: every name has a side of its own, clear of dots, names and axis numbers', () => {
  const spots = place(SOURCES);
  assert.equal(spots.length, 5);
  assert.deepEqual(clashes(SOURCES, spots, AXIS_NUMBERS), []);
  assert.equal(new Set(spots.map((spot) => `${Math.round(spot.x)},${Math.round(spot.y)}`)).size, 5, 'five different places');
});

test('the source and the plotted points together: ten names, none over a dot, and far less over each other than before', () => {
  const dots = [...SOURCES, ...IMAGES];
  const spots = place(dots);
  // Ten names in a space this small cannot all be clear of each other, but no
  // name covers a dot (up and to the right covered several), and what names
  // cover of each other is a sliver.
  const dotsCovered = (placed) => clashes(dots, placed, []).filter((entry) => /over the dot of/.test(entry));
  assert.ok(dotsCovered(atDefault(dots)).length >= 4, `the old places hide dots: ${dotsCovered(atDefault(dots)).join('; ')}`);
  assert.deepEqual(dotsCovered(spots), []);
  const nameOverNames = dots.reduce((sum, dot, index) => sum + dots.slice(index + 1).reduce((inner, other, offset) => {
    const a = nameBox(spots[index], dot.label);
    const b = nameBox(spots[index + 1 + offset], other.label);
    const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return inner + (across > 0 && down > 0 ? across * down : 0);
  }, 0), 0);
  const oneName = 2 * 0.62 * FONT * (0.98 * FONT);
  assert.ok(nameOverNames < oneName * 0.25, `${Math.round(nameOverNames)} square units over each other, one name is ${Math.round(oneName)}`);
});

test('a name with nothing near it keeps the place it has always had', () => {
  const lone = [{ x: 200, y: 150, radius: 6, label: 'A' }];
  assert.deepEqual(placePointLabels({ dots: lone, fontSize: 11, bounds: BOUNDS }), [{ x: 210, y: 141, anchor: 'start' }]);
  // Two far apart: both keep it.
  const two = [{ x: 100, y: 100, radius: 6, label: 'A' }, { x: 400, y: 250, radius: 6, label: 'B' }];
  assert.deepEqual(placePointLabels({ dots: two, fontSize: 11, bounds: BOUNDS }), [{ x: 110, y: 91, anchor: 'start' }, { x: 410, y: 241, anchor: 'start' }]);
});

test('a name at the right edge steps to the left of its dot', () => {
  const dot = { x: 540, y: 150, radius: 6, label: 'S5' };
  const [spot] = placePointLabels({ dots: [dot], fontSize: 11, bounds: BOUNDS });
  assert.equal(spot.anchor, 'end', 'drawn leftward from the dot');
  const box = placedLabelBox({ spot, label: 'S5', fontSize: 11 });
  assert.ok(box.right <= BOUNDS.right && box.left >= BOUNDS.left, JSON.stringify(box));
});

test('a number on an axis keeps names off it, and an unlabelled dot is kept clear too', () => {
  const dot = { x: 200, y: 150, radius: 6, label: 'A' };
  const number = axisNumberBox({ x: 222, y: 142, characters: 2, fontSize: 11 });
  const [moved] = placePointLabels({ dots: [dot], fontSize: 11, bounds: BOUNDS, avoid: [number] });
  assert.ok(!boxesTouch(placedLabelBox({ spot: moved, label: 'A', fontSize: 11 }), number), 'clear of the number');
  assert.notDeepEqual(moved, { x: 210, y: 141, anchor: 'start' }, 'it did not stay on the number');
  // An unlabelled neighbour sitting where the name would go.
  const neighbour = { x: 222, y: 141, radius: 6, label: '' };
  const spots = placePointLabels({ dots: [dot, neighbour], fontSize: 11, bounds: BOUNDS });
  assert.equal(spots[1], null, 'no label, no place');
  assert.ok(!boxesTouch(placedLabelBox({ spot: spots[0], label: 'A', fontSize: 11 }), { left: 216, right: 228, top: 135, bottom: 147 }), 'clear of the unlabelled dot');
});

test('dots with no point (null) and dots with no label have no place; the answer is one per dot, in order', () => {
  const spots = placePointLabels({ dots: [null, { x: 100, y: 100, radius: 6, label: '' }, { x: 300, y: 100, radius: 6, label: 'B' }], fontSize: 11, bounds: BOUNDS });
  assert.equal(spots.length, 3);
  assert.equal(spots[0], null);
  assert.equal(spots[1], null);
  assert.ok(spots[2] && spots[2].anchor);
});

test('the same points give the same places every time', () => {
  assert.deepEqual(place([...SOURCES, ...IMAGES]), place([...SOURCES, ...IMAGES]));
});

/* ----------------------------------------------------------- the plane uses it */

const plane = readFileSync(new URL('../../src/tools/shared/CoordinatePlane.jsx', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');

test('the plane draws each name where placePointLabels put it, and lets the origin "0" yield to a name', () => {
  assert.match(plane, /const labelSpots = placePointLabels\(\{/);
  assert.match(plane, /x=\{labelSpots\[index\]\?\.x \?\? sx\(pointX\) \+ 10\} y=\{labelSpots\[index\]\?\.y \?\? sy\(pointY\) - 9\} textAnchor=\{labelSpots\[index\]\?\.anchor \|\| 'start'\}/);
  // Every dot keeps names off it, and the axis numbers and the origin are what names avoid.
  assert.match(plane, /axisNumberBox\(\{ x: sx\(x\)/);
  assert.match(plane, /originVisible && originSpot && !originUnderLabel/);
});

test('the Correct watermark is not drawn over a math tool', () => {
  assert.match(engine, /\{isCorrect && showOutcomeFeedback && !isToolQuestion && \(/);
  assert.match(engine, /aria-hidden="true" data-correct-watermark=""/, 'a form of answers still gets it');
});
