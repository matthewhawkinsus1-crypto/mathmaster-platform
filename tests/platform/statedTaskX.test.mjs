import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region, executableSource } from './helpers/sourceContract.mjs';
import {
  buildInteractivePointTasks, gradePointPlacements, placementsMatchTasks, taskStatesX, withStatedTaskX,
} from '../../src/interactiveGraphEngine.js';

// PQ-024: a point card that states its x ("P1: x = −1") asks only for the
// height. The plane accepted any x, so a fingertip off by half a square was a
// wrong point; some builders flagged those tasks lockedX and nothing read it.

test('a card that states its x places at that x, whatever x the tap landed on', () => {
  const task = { id: 'point-1', label: 'P1', role: 'point', x: -1, expected: [-1, 4] };
  assert.equal(taskStatesX(task), true);
  assert.deepEqual(withStatedTaskX(task, [-1.5, 4]), [-1, 4]);
  // The height is still the student's.
  assert.deepEqual(withStatedTaskX(task, [-0.5, 2.5]), [-1, 2.5]);
  // A table x written as text is the same x.
  assert.deepEqual(withStatedTaskX({ ...task, x: '-1' }, [3, 7]), [-1, 7]);
});

test('every function family\'s plotted points are held, and its key or centre never is', () => {
  for (const spec of [
    { type: 'linear', m: 2, b: 1 },
    { type: 'quadratic', a: 1, h: 2, k: -1 },
    { type: 'rational', a: 1, h: 1, k: 2 },
    { type: 'expression', expression: '2x+1', variable: 'x' },
  ]) {
    const tasks = buildInteractivePointTasks(spec, { points: [[-1, -1], [1, 3], [2, 5], [3, 7]] });
    const plotted = tasks.filter((task) => task.role === 'point');
    assert.ok(plotted.length > 0, spec.type);
    plotted.forEach((task) => assert.equal(taskStatesX(task), true, `${spec.type} ${task.id}`));
    // A centre or key point does not show its x; holding it would place it.
    tasks.filter((task) => ['center', 'key'].includes(task.role)).forEach((task) => {
      assert.equal(taskStatesX(task), false, `${spec.type} ${task.id}`);
      assert.deepEqual(withStatedTaskX(task, [0.5, 1]), [0.5, 1]);
    });
  }
});

test('an x the student chooses, or no x at all, is never held', () => {
  const chosen = buildInteractivePointTasks({ type: 'quadratic', a: 1, h: 0, k: 0 }, { studentChoosesX: true }).filter((task) => task.studentChoosesX);
  assert.ok(chosen.length > 0);
  chosen.forEach((task) => assert.equal(taskStatesX(task), false));
  // Even with a starting x on it, an x the student chooses is theirs to move.
  assert.equal(taskStatesX({ role: 'point', x: 3, studentChoosesX: true }), false);
  assert.equal(taskStatesX({ role: 'point', x: undefined }), false);
  assert.equal(taskStatesX({ role: 'point', x: '' }), false);
  assert.equal(taskStatesX({ role: 'point', x: 'two' }), false);
  assert.equal(withStatedTaskX({ role: 'point', x: 2 }, 'undefined'), 'undefined');
  assert.deepEqual(withStatedTaskX(undefined, [1, 2]), [1, 2]);
});

test('the card prints x exactly when the plane holds it, and every placement route holds it', () => {
  const workspace = executableSource(readFileSync('src/InteractiveGraphWorkspace.jsx', 'utf8'));
  assert.match(workspace, /<MathText>\{task\.label\}<\/MathText>\{taskStatesX\(task\) \? `: x = \$\{task\.x\}` : ''\}/);
  // placeTask is the funnel for click, drag, keyboard and typed coordinates.
  const place = region(workspace, 'const placeTask = ', 'const nearestEndpoint', 'placeTask');
  const held = place.indexOf('const point = withStatedTaskX(task, rawPoint);');
  assert.ok(held > -1, 'placeTask holds the point to the card');
  assert.ok(held < place.indexOf('constructionHistory.setValue'), 'before it is stored');
  assert.doesNotMatch(place.slice(place.indexOf('constructionHistory.setValue')), /rawPoint/, 'and only the held point is stored');
  // The drag guide and the drop show the same x the point will take.
  const guide = region(workspace, 'const eventToTaskPlacement = ', 'const [keyboardCursor', 'eventToTaskPlacement');
  assert.match(guide, /const latticePoint = withStatedTaskX\(task, /);
  assert.match(guide, /return \{ point: withStatedTaskX\(task, magnetic\?\.point \|\| latticePoint\), magnetic \};/);
});

// A relation with two outputs at one input: two cards both read "x = 2", and
// nothing but their order tells them apart.
const relationTasks = [
  { id: 'p1', label: 'P1', role: 'point', x: 2, expected: [2, 3], lockedX: true },
  { id: 'p2', label: 'P2', role: 'point', x: 2, expected: [2, 5], lockedX: true },
  { id: 'p3', label: 'P3', role: 'point', x: 4, expected: [4, 1], lockedX: true },
];
const relationSpec = { type: 'expression', expression: '0', variable: 'x' };
const verdicts = (placements) => Object.fromEntries(gradePointPlacements(relationTasks, placements, relationSpec).map((part) => [part.id, part.isCorrect]));

test('cards that state the same x are matched as a set, so a correct plot is correct either way round', () => {
  assert.deepEqual(verdicts({ p1: [2, 3], p2: [2, 5], p3: [4, 1] }), { p1: true, p2: true, p3: true });
  assert.deepEqual(verdicts({ p1: [2, 5], p2: [2, 3], p3: [4, 1] }), { p1: true, p2: true, p3: true });
  assert.equal(placementsMatchTasks(relationTasks, { p1: [2, 5], p2: [2, 3], p3: [4, 1] }, 0.26, relationSpec), true);
});

test('the set match finds what is right and no more', () => {
  // One of the two x = 2 heights is right, whichever card holds it.
  assert.deepEqual(verdicts({ p1: [2, 5], p2: [2, 4], p3: [4, 1] }), { p1: true, p2: false, p3: true });
  // Both cards on the same right height is one right answer, not two.
  assert.deepEqual(verdicts({ p1: [2, 3], p2: [2, 3], p3: [4, 1] }), { p1: true, p2: false, p3: true });
  // Ties keep the in-order pairing.
  assert.deepEqual(verdicts({ p1: [2, 3], p2: [2, 4], p3: [4, 2] }), { p1: true, p2: false, p3: false });
  // A card with a different x is never matched to another x's point (a draft
  // saved before cards held their x can hold any x).
  assert.deepEqual(verdicts({ p1: [4, 1], p2: [2, 5], p3: [2, 3] }), { p1: false, p2: true, p3: false });
  // A key point is not interchangeable with a card, even at the same x: its
  // own position is the thing being asked.
  const withKey = [
    { id: 'key', label: 'Center / Key Point', role: 'key', x: 2, expected: [2, 3], lockedX: true },
    { id: 'p2', label: 'P2', role: 'point', x: 2, expected: [2, 5], lockedX: true },
  ];
  const keyParts = gradePointPlacements(withKey, { key: [2, 5], p2: [2, 3] }, relationSpec);
  assert.deepEqual(keyParts.map((part) => part.isCorrect), [false, false]);
});

test('a function\'s cards, each with its own x, are graded exactly as before', () => {
  const tasks = buildInteractivePointTasks({ type: 'linear', m: 2, b: 1 });
  const placements = Object.fromEntries(tasks.map((task, index) => [task.id, index === 0 ? [task.expected[0], task.expected[1] + 1] : task.expected]));
  const parts = gradePointPlacements(tasks, placements, { type: 'linear', m: 2, b: 1 });
  assert.deepEqual(parts.map((part) => part.isCorrect), tasks.map((_, index) => index !== 0));
});
