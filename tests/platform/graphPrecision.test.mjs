import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gradePointPlacements, resolveTaskExpected, sampleVisibleFunctionPaths,
} from '../../src/interactiveGraphEngine.js';

// Two rules the graphing workspace has to keep at the same time:
//
//   the interface must never make a valid authored function impossible to
//   graph, and it must not make an easy one fiddly;
//
//   and what is graded is the mathematics — a point ON the correct curve —
//   not whether the student happened to pick the plotting points the author
//   or the engine would have picked.

// --- Any valid point on the line is a correct point ------------------------------

const LINE = { type: 'linear', m: 0.5, b: 1 };

test('a student who plots their own x-values is graded on the curve, not on our x-values', () => {
  const tasks = [
    { id: 'p1', studentChoosesX: true },
    { id: 'p2', studentChoosesX: true },
  ];
  // Two students, two completely different pairs of points, both on y = 0.5x + 1.
  const first = gradePointPlacements(tasks, { p1: [0, 1], p2: [4, 3] }, LINE, { p1: '0', p2: '4' });
  const second = gradePointPlacements(tasks, { p1: [-2, 0], p2: [2, 2] }, LINE, { p1: '-2', p2: '2' });

  assert.ok(first.every((part) => part.isCorrect), 'the first student is right');
  assert.ok(second.every((part) => part.isCorrect), 'and so is the second, with different points');
});

test('a point off the line is wrong even when its x was a fine choice', () => {
  const tasks = [{ id: 'p1', studentChoosesX: true }];
  const parts = gradePointPlacements(tasks, { p1: [2, 5] }, LINE, { p1: '2' });
  assert.equal(parts[0].isCorrect, false, 'y = 0.5(2) + 1 is 2, not 5');
});

test('the expected point follows the student\'s own x', () => {
  assert.deepEqual(resolveTaskExpected({ id: 'p', studentChoosesX: true }, LINE, { p: '3' }), [3, 2.5]);
  assert.deepEqual(resolveTaskExpected({ id: 'p', studentChoosesX: true }, LINE, { p: '-1' }), [-1, 0.5]);
  // A fixed authored point is still fixed.
  assert.deepEqual(resolveTaskExpected({ id: 'p', expected: [1, 1.5] }, LINE, {}), [1, 1.5]);
});

// --- The snap policy, as decided ---------------------------------------------------
//
// The resolver lives inside the component, so it is restated here against the
// same inputs. If these expectations and the component ever diverge, that is a
// bug in one of them and this file is where it shows up.

const MIN_USABLE_SNAP = 0.05;
const snapValue = (value, step) => Number((Math.round(value / step) * step).toFixed(6));
const snapError = (point, step) => {
  if (!Array.isArray(point) || point.length !== 2) return 0;
  return Math.hypot(
    Number(point[0]) - snapValue(Number(point[0]), step),
    Number(point[1]) - snapValue(Number(point[1]), step),
  );
};
const resolveReachableSnapStep = (requestedStep, tasks = [], curveSamples = []) => {
  const authored = Number(requestedStep);
  const authorWasExplicit = Number.isFinite(authored) && authored > 0;
  let step = authorWasExplicit ? authored : 0.5;
  const chooses = tasks.some((task) => task?.studentChoosesX);
  if (chooses && !authorWasExplicit) step = Math.min(step, 0.25);
  const expectedPoints = tasks.map((task) => task?.expected).filter(Array.isArray);
  while (step > MIN_USABLE_SNAP && expectedPoints.some((point) => snapError(point, step) > 0.2)) step /= 2;
  if (chooses && expectedPoints.length === 0 && curveSamples.length) {
    const reachable = (candidate) => curveSamples.filter((point) => snapError(point, candidate) <= 0.2).length;
    while (step > MIN_USABLE_SNAP && reachable(step) < Math.min(4, curveSamples.length)) step /= 2;
  }
  return Math.max(MIN_USABLE_SNAP, step);
};

test('an author\'s explicit snap is respected when it works', () => {
  assert.equal(resolveReachableSnapStep(1, [{ id: 'p', expected: [2, 3] }]), 1);
  assert.equal(resolveReachableSnapStep(0.5, [{ id: 'p', expected: [1, 1.5] }]), 0.5);
});

test('a required point that the snap cannot reach refines it, and only as far as needed', () => {
  // (1, 1.5) on a unit snap: unreachable. Halving once is enough.
  assert.equal(resolveReachableSnapStep(1, [{ id: 'p', expected: [1, 1.5] }]), 0.5);
  // A quarter needs one more halving, and no more.
  assert.equal(resolveReachableSnapStep(1, [{ id: 'p', expected: [1, 1.25] }]), 0.25);
});

test('student-chosen x with nothing required is quarter units, not tenths', () => {
  const samples = sampleVisibleFunctionPaths(LINE, { xMin: -6, xMax: 8, yMin: -6, yMax: 8 }).flat();
  const step = resolveReachableSnapStep(undefined, [{ id: 'p', studentChoosesX: true }], samples);
  assert.equal(step, 0.25, 'a trackpad has to be able to hit this');
});

test('being continuous is not by itself a reason to refine', () => {
  // A plain line is continuous everywhere and still only needs quarters.
  const samples = sampleVisibleFunctionPaths(LINE, { xMin: -6, xMax: 8, yMin: -6, yMax: 8 }).flat();
  assert.ok(resolveReachableSnapStep(undefined, [{ id: 'p', studentChoosesX: true }], samples) >= 0.25);
});

test('a function that lands on no quarter refines for that question only', () => {
  // y = x/3 hits no quarter-unit lattice point except the origin, so quarters
  // would leave a student with almost nowhere legitimate to click.
  const thirds = { type: 'linear', m: 1 / 3, b: 0 };
  const samples = sampleVisibleFunctionPaths(thirds, { xMin: -6, xMax: 6, yMin: -6, yMax: 6 }).flat();
  const step = resolveReachableSnapStep(undefined, [{ id: 'p', studentChoosesX: true }], samples);
  assert.ok(step <= 0.25, 'this question needs finer input than the default');
  assert.ok(step >= MIN_USABLE_SNAP, 'and it still has to be clickable');
});

test('refinement never goes below what a hand can hit', () => {
  // An unreachable-at-any-sane-step point must not produce a 0.0001 grid.
  const step = resolveReachableSnapStep(1, [{ id: 'p', expected: [0.0007, 0.0003] }]);
  assert.ok(step >= MIN_USABLE_SNAP, `refined to ${step}, which no student could hit`);
});
