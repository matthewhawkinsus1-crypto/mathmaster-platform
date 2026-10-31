/*
 * A 3x3 MATRIX FITS A NARROW PHONE'S BOX (PH09; finding D-61).
 *
 * A matrix is one box that scrolls sideways when it is wider than its
 * container, as a long one must. A 3x3 the student fills in (its name, brackets
 * and three 64px boxes a row) measured 277px in the real App: 7px wider than the
 * 270px box a 344px phone leaves it and 31px wider than a 320px phone's 246px, so
 * every Matrix Lab solve item showed a scrollbar for a few pixels (DOL #2 CW 9,
 * CW 11, PR 14, PR 17, DOL 7).
 *
 * The geometry is proved in the real App (tests/browser/teacherWorkflow/
 * matrixLabPhoneJourneys.mjs `narrowPhones`: no matrix box of the 19 questions
 * scrolls at 344x882 or 320x640). Nothing here renders CSS, so this binds the
 * rules the geometry depends on, with the measured widths. Each assertion was
 * broken once to see it go red (see the PR).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import { parseCss, declared } from './helpers/cssRules.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const css = parseCss(read('src/components/common/MatrixGrid.css'));
const ui = executableSource(read('src/tools/matrixLab/matrixLabUi.jsx'));
const grid = executableSource(read('src/components/common/MatrixGrid.jsx'));

const VARIABLE = '--mm-matrix-cell-width';
const px = (value) => {
  const match = String(value ?? '').match(/^calc\((\d+) \* var\(--mm-px\)\)$/);
  assert.ok(match, `${value} is a size in the text-scaled px unit`);
  return Number(match[1]);
};

test('the cell box takes its width from a variable, 64px unless a narrow phone says otherwise', () => {
  assert.match(ui, /export const cellInputStyle = \{[^}]*width: 'var\(--mm-matrix-cell-width, calc\(64 \* var\(--mm-px\)\)\)'/);
  // It cannot go below its own floor, whatever the variable says.
  assert.match(ui, /minWidth: 52,/);
  assert.match(grid, /import '\.\/MatrixGrid\.css';/, 'the grid brings the stylesheet that sets the variable');
});

test('a 3x3 matrix fits the box of a 344px phone and of a 320px phone, and nothing changes from 360px', () => {
  // Measured in the real App: a 3x3 with 64px boxes is 277px; the name, the brackets and the gaps are the 73px
  // that is not boxes (277 - 3 x (64 + 4 of cell padding)). The box a phone leaves it: the screen less 74px.
  const FIXED = 73;
  const widthWith = (box) => FIXED + 3 * (box + 4);
  const roomAt = (screen) => screen - 74;
  assert.equal(widthWith(64), 277, 'the measured width');
  assert.ok(widthWith(64) <= roomAt(360), '360px: it fit already');

  const tier = (query) => px(declared(css, '[data-matrix-grid]', VARIABLE, { media: query })?.value);
  const narrow = tier('(max-width: 359.98px)');
  const narrowest = tier('(max-width: 339.98px)');
  assert.ok(widthWith(narrow) <= roomAt(344), `344px: ${widthWith(narrow)}px in ${roomAt(344)}px`);
  assert.ok(widthWith(narrowest) <= roomAt(320), `320px: ${widthWith(narrowest)}px in ${roomAt(320)}px`);
  // Narrower only as far as the phone needs, and never under the box's own floor.
  assert.ok(narrow < 64 && narrowest < narrow, 'each tier is narrower than the one above');
  assert.ok(narrowest >= 52, 'not under the 52px floor: "-12" and "-7/2" still fit');
  // The default is not set outside the tiers: a phone from 360px, a tablet and a laptop keep the 64px.
  assert.equal(declared(css, '[data-matrix-grid]', VARIABLE, { media: null }), null);
});

test('a matrix wider than its box still scrolls, as a long one must', () => {
  assert.match(grid, /data-matrix-scroll="true" style=\{\{[^}]*overflowX: 'auto'/);
  assert.match(grid, /minWidth: 0/, 'so it scrolls instead of widening its panel');
});
