// A SYSTEM'S GRAPH USES THE ITEM'S LETTERS (walkthrough 2026-10-23, Solving
// Systems by Graphing CW 7: 5s + 10a = 3000 and s + a = 450, "the horizontal
// axis is s and the vertical axis is a", drawn and boxed as x and y).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_AXIS_NAMES, systemAxisNames } from '../../src/tools/systemsWorkspace/systemAxisNames.js';

test('two distinct short names are the horizontal and vertical axes; anything else is x and y', () => {
  assert.deepEqual(systemAxisNames({ variables: ['s', 'a'] }), { x: 's', y: 'a' });
  assert.deepEqual(systemAxisNames({}), DEFAULT_AXIS_NAMES);
  assert.deepEqual(systemAxisNames({ variables: ['x', 'y', 'z'] }), DEFAULT_AXIS_NAMES);
  assert.deepEqual(systemAxisNames({ variables: ['s', 's'] }), DEFAULT_AXIS_NAMES);
  assert.deepEqual(systemAxisNames({ variables: ['student tickets', 'a'] }), DEFAULT_AXIS_NAMES);
});

test('the graph-it-yourself view names its axes, point boxes and solution boxes with them', () => {
  const view = readFileSync(new URL('../../src/tools/systemsWorkspace/SystemsWorkspace.jsx', import.meta.url), 'utf8');
  const construct = view.slice(view.indexOf('function LinearConstructMode('), view.indexOf('function LinearQuadraticMode('));
  assert.match(construct, /const names = systemAxisNames\(questionData\);/);
  assert.match(construct, /axisNames=\{names\}/);
  assert.match(construct, /aria-label=\{`Equation \$\{index \+ 1\}, point \$\{which\}: \$\{names\.x\}`\}/);
  assert.match(construct, /<Field label=\{names\.x\}>/);
  assert.doesNotMatch(construct, /<Field label="x">/);
  const plane = readFileSync(new URL('../../src/tools/shared/CoordinatePlane.jsx', import.meta.url), 'utf8');
  assert.match(plane, /\{axisNames\?\.x \|\| 'x'\}<\/text>/);
});

test('a wrong graph names the line that is off', () => {
  const view = readFileSync(new URL('../../src/tools/systemsWorkspace/SystemsWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(view, /const wrongLines = \[1, 2\]\.filter\(\(line\) => !partCorrect\(feedback, `line-\$\{line\}`\)\);/);
  assert.match(view, /`The line for Equation \$\{wrongLines\[0\]\} is not`/);
  assert.doesNotMatch(view, /At least one line is not graphed right yet/);
});
