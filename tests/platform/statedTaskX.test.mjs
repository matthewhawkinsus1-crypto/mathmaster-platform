import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region, executableSource } from './helpers/sourceContract.mjs';
import { buildInteractivePointTasks, taskStatesX, withStatedTaskX } from '../../src/interactiveGraphEngine.js';

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
