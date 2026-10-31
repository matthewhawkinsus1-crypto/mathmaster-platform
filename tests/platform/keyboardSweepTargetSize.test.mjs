// WCAG 2.2 2.5.8 TARGET SIZE (MINIMUM), as the keyboard sweep reads it
// (tests/browser/support/targetSize.mjs). Boxes are page pixels: { x, y, w, h }.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { TARGET_MIN, smallTargetsOf } from '../browser/support/targetSize.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const box = (x, y, w, h, name = `box-${x}-${y}`) => ({ id: name, name, x, y, w, h });
const failingNames = (boxes) => smallTargetsOf(boxes).failing.map((target) => target.name);

test('the minimum is 24 CSS px, and a box exactly that size is not undersized', () => {
  assert.equal(TARGET_MIN, 24);
  const result = smallTargetsOf([box(0, 0, 24, 24, 'exact'), box(100, 0, 23.9, 40, 'narrow')]);
  assert.equal(result.measured, 2);
  assert.equal(result.undersized, 1, 'only the 23.9px one is under');
  assert.deepEqual(result.failing, [], 'and it is alone, so its spacing passes');
  assert.equal(result.bySpacing, 1);
  assert.deepEqual(result.passing.map((target) => target.name), ['narrow'], 'and it is listed as passing by spacing, so the exception can be checked by eye');
});

test('a small target with room around it passes by spacing; the same target crowded by a neighbour fails', () => {
  // 20x20 targets: circles of 24px around their centres do not meet at 30px apart …
  const apart = [box(0, 0, 20, 20, 'a'), box(50, 0, 20, 20, 'b')];
  assert.deepEqual(failingNames(apart), []);
  assert.equal(smallTargetsOf(apart).bySpacing, 2);
  // … and do at 22px apart (centres 22 < 24).
  assert.deepEqual(failingNames([box(0, 0, 20, 20, 'a'), box(22, 0, 20, 20, 'b')]).sort(), ['a', 'b']);
});

test('a small target beside a LARGE one fails when the large one is inside its 24px circle, and passes when it is not', () => {
  const small = box(0, 12, 20, 20, 'small'); // centre at x=10
  // The big box starts 30px from that centre: outside the 12px radius.
  assert.deepEqual(failingNames([small, box(40, 0, 100, 44, 'big')]), []);
  // 12px from the centre: the circle touches the box and no more (an offset of exactly 24 passes).
  assert.deepEqual(failingNames([small, box(22, 0, 100, 44, 'big')]), []);
  // 11px from the centre (the boxes 1px apart): the circle meets it.
  assert.deepEqual(failingNames([small, box(21, 0, 100, 44, 'big')]), ['small']);
  // The large target is never listed: it is not undersized.
  assert.ok(!failingNames([small, box(21, 0, 100, 44, 'big')]).includes('big'));
});

test('the circle is measured from the centre of the box, not its edge', () => {
  // A 12x12 mark 11px from a big box: its edge is 11px away, but its centre is 17px away, so the 12px circle misses.
  assert.deepEqual(failingNames([box(0, 0, 12, 12, 'dot'), box(23, 0, 80, 44, 'big')]), []);
  // At 5px from the edge the centre is 11px away: inside the circle.
  assert.deepEqual(failingNames([box(0, 0, 12, 12, 'dot'), box(17, 0, 80, 44, 'big')]), ['dot']);
});

test('a target inside another is that control, not its neighbour', () => {
  const button = box(0, 0, 120, 44, 'button');
  const icon = box(10, 12, 16, 16, 'icon');
  assert.deepEqual(failingNames([button, icon]), []);
  assert.equal(smallTargetsOf([button, icon]).bySpacing, 1);
});

test('rows of identical small targets fail together, and each is named', () => {
  const row = [0, 14, 28, 42].map((x, index) => box(x, 0, 12, 12, `dot-${index}`));
  assert.deepEqual(failingNames(row), ['dot-0', 'dot-1', 'dot-2', 'dot-3']);
  const result = smallTargetsOf(row);
  assert.equal(result.undersized, 4);
  assert.equal(result.bySpacing, 0);
});

test('nothing measured is nothing undersized', () => {
  assert.deepEqual(smallTargetsOf([]), { measured: 0, undersized: 0, bySpacing: 0, failing: [], passing: [] });
  assert.deepEqual(smallTargetsOf(), { measured: 0, undersized: 0, bySpacing: 0, failing: [], passing: [] });
});

test('a failing entry carries what a reviewer needs to find the control', () => {
  const [entry] = smallTargetsOf([
    { id: 'k1', tag: 'button', roleAttr: null, name: 'x', className: 'close', owners: ['Dialog'], x: 0, y: 0, w: 18, h: 18, extra: 'dropped' },
    { id: 'k2', tag: 'button', roleAttr: null, name: 'y', className: '', owners: [], x: 20, y: 0, w: 18, h: 18 },
  ]).failing;
  assert.deepEqual(entry, { id: 'k1', tag: 'button', roleAttr: null, name: 'x', className: 'close', owners: ['Dialog'], w: 18, h: 18 });
});

// Browser proofs nobody runs prove nothing: the target size check is a step of the accessibility workflow.
test('CI runs studentShellLargeText --check=targetsize, and the driver reads the same rules the sweep does', () => {
  const workflow = readFileSync(path.join(root, '.github/workflows/accessibility-certification.yml'), 'utf8');
  const runs = [...workflow.matchAll(/run: node tests\/browser\/studentShellLargeText\.mjs --check=([\w,]+)/g)].map((match) => match[1].split(','));
  assert.ok(runs.some((checks) => checks.includes('targetsize')), 'a CI step runs studentShellLargeText --check=targetsize');
  const driver = readFileSync(path.join(root, 'tests/browser/studentShellLargeText.mjs'), 'utf8');
  const sweep = readFileSync(path.join(root, 'tests/browser/keyboardSweep.mjs'), 'utf8');
  for (const [name, source] of [['the large-text driver', driver], ['the keyboard sweep', sweep]]) {
    assert.match(source, /import \{[^}]*collectTargetBoxes[^}]*smallTargetsOf[^}]*\} from '\.\/support\/targetSize\.mjs'/, `${name} imports the shared collector and rules`);
  }
});
