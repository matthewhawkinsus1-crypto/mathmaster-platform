/*
 * "EXACTLY ONE SOLUTION" IS ANSWERED WITH ITS POINT (TL46).
 *
 * On the Module 3 exit ticket (one try) a student who chose "Exactly one
 * solution" could press Check with x and y blank and lose the only try
 * (Codex on #520). The shared grader already calls that work unfinished.
 * These tests pin that the screen never sends it:
 *
 *   - the rule: one solution needs every coordinate typed; "no solution" and
 *     "infinitely many" need none;
 *   - the rule says "typed" exactly when the shared grader says "complete";
 *   - every system mode with a classification (graph, graph-it-yourself,
 *     matrix) reads it before its Check is enabled or sends anything.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { solutionTyped } from '../../src/tools/systemsWorkspace/systemsSolutionTyped.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { componentSource, executableSource, region } from '../platform/helpers/sourceContract.mjs';

test('one solution needs every coordinate typed; no solution and infinitely many need none', () => {
  assert.equal(solutionTyped('one', '', ''), false);
  assert.equal(solutionTyped('one', '3', ''), false);
  assert.equal(solutionTyped('one', '  ', '2'), false);
  assert.equal(solutionTyped('one', 'abc', '2'), false, 'not a number is not typed');
  assert.equal(solutionTyped('one', '3', '-2'), true);
  assert.equal(solutionTyped('one', '0', '0'), true, 'zero is a typed coordinate');
  assert.equal(solutionTyped('one', '1', '2', ''), false, 'a 3×3 with z left blank');
  assert.equal(solutionTyped('one', '1', '2', '3'), true);
  assert.equal(solutionTyped('none'), true);
  assert.equal(solutionTyped('infinite', '', ''), true);
});

test('the screen\'s rule matches the shared grader\'s "complete"', () => {
  const linear = { type: 'systemsWorkspace', toolId: 'systemsWorkspace', mode: 'linear', system: { m1: 1, b1: 1, m2: -1, b2: 5 } };
  const matrix3 = {
    type: 'systemsWorkspace', toolId: 'systemsWorkspace', mode: 'matrix3',
    matrix: { rows: [[1, 0, 0, 1], [0, 1, 0, 2], [0, 0, 1, 3]] },
  };
  const cases = [
    [linear, { classification: 'one', x: '', y: '' }, ['', '']],
    [linear, { classification: 'one', x: '2', y: '' }, ['2', '']],
    [linear, { classification: 'one', x: '2', y: '3' }, ['2', '3']],
    [linear, { classification: 'none', x: '', y: '' }, []],
    [matrix3, { classification: 'one', x: '1', y: '2', z: '', technologyUsed: true }, ['1', '2', '']],
    [matrix3, { classification: 'one', x: '1', y: '2', z: '3', technologyUsed: true }, ['1', '2', '3']],
  ];
  for (const [question, work, coordinates] of cases) {
    const graded = gradeToolWork({ toolId: 'systemsWorkspace', question, work });
    assert.equal(graded.graded, true, JSON.stringify(work));
    assert.equal(solutionTyped(work.classification, ...coordinates), graded.isComplete, `${question.mode} ${JSON.stringify(work)}`);
  }
});

test('every classified system mode waits for the typed point before Check is enabled or sends', () => {
  const source = executableSource(componentSource('src/tools/systemsWorkspace/SystemsWorkspace.jsx'));
  assert.match(source, /import \{ solutionTyped \} from '\.\/systemsSolutionTyped\.js';/);
  const modes = [
    ['function LinearMode(', 'function InequalityMode(', /const ready = classified && solutionTyped\(classification, x, y\);/],
    ['function LinearConstructMode(', 'function LinearQuadraticMode(', /const crossingTyped = solutionTyped\(classification, x, y\);\s*const ready = classified && pointsTyped && crossingTyped;/],
    ['function MatrixMode(', 'const MODE_TASKS', /const ready = classified && !needsTechnology && solutionTyped\(classification, x, y, \.\.\.\(isMatrix3 \? \[z\] : \[\]\)\);/],
  ];
  for (const [from, to, readyRule] of modes) {
    const body = region(source, from, to, from);
    assert.match(body, readyRule, `${from} ready reads the typed point`);
    assert.match(body, /const check = \(\) => \{\s*if \(!ready\) return;/, `${from} Check sends nothing until ready`);
    assert.match(body, /primaryActions: \[\{ id: '[a-z-]+', label: \w+, onAction: check, disabled: !ready \}\]/, `${from} the host's Check is off until ready`);
    assert.match(body, /onClick=\{check\}\s*disabled=\{!ready\}/, `${from} the inline Check is off until ready`);
  }
});
