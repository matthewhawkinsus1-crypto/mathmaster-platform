/*
 * DIVIDING POLYNOMIALS ON A PHONE: THE BRACKET IS READABLE AND THE REMAINDER IS
 * ON SCREEN (PH06; findings D-51, D-50).
 *
 * D-51: on a phone, Dividing PR 14 (divisor y² + y − 5) drew the divisor over
 * the dividend inside the long-division bracket. A phone's question container
 * gives every element `min-width: 0` (MathToolMobileLayout.css), which let the
 * bracket's `auto` tracks shrink below the divisor's math: 75px of math in a
 * 42-58px cell at 360px and 344px.
 *
 * D-50: the five-coefficient synthetic table scrolled sideways inside its box
 * from a 344px phone down, with the remainder (its last column) off the right
 * edge: its first column took 90 to 136px of the 322px box and every other
 * column held at 2.9em.
 *
 * The geometry is proved in the real App at 390x844, 360x740, 344x882 and
 * 320x640 (tests/browser/teacherWorkflow/dividingPolynomialsPhoneJourneys.mjs).
 * Nothing here renders CSS, so this binds the rules it depends on, each to the
 * rule that does the work. Each assertion was broken once to see it go red
 * (see the PR).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { parseCss, declared } from './helpers/cssRules.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const css = parseCss(read('src/tools/polynomialWorkshop/PolynomialWorkshop.css'));
const jsx = executableSource(read('src/tools/polynomialWorkshop/PolynomialWorkshop.jsx'));
const PHONE = { media: '(max-width: 560px)' };
const em = (value) => {
  const match = String(value ?? '').match(/^([\d.]+)em$/);
  assert.ok(match, `${value} is a length in em`);
  return Number(match[1]);
};

test('a long-division cell is never squeezed below its math', () => {
  // The phone container's `min-width: 0` is the cause; the bracket's own items take their content minimum back,
  // from a selector that outranks it (one class more), so it holds whichever sheet loads last.
  assert.equal(declared(css, '.mm-long-division-scroll .mm-long-division > *', 'min-width', { media: null })?.value, 'auto');
  const container = parseCss(read('src/components/student/MathToolMobileLayout.css'));
  assert.equal(declared(container, '.mathmaster-question-container *', 'min-width')?.value, '0', 'the rule this works against is still there');
  // Cells stay on one line: their width is their math's width, and a wider bracket scrolls in its box.
  assert.equal(declared(css, '.mm-ld-cell', 'white-space', { media: null })?.value, 'nowrap');
  assert.equal(declared(css, '.mm-long-division-scroll', 'overflow-x', { media: null })?.value, 'auto');
  assert.equal(declared(css, '.mm-long-division-scroll', 'contain', { media: null })?.value, 'inline-size', 'the box takes the width it is given');
});

test('a phone narrows the bracket\'s columns, not its cells\' math', () => {
  // The columns' minimum is a variable the CSS sets, so a phone's narrower minimum reaches the inline template.
  // Only the minimum narrows: the template still ends `, auto)`, so a track grows to its cell's math and nothing is cut.
  assert.match(jsx, /gridTemplateColumns: `auto repeat\(\$\{n \+ 1\}, minmax\(var\(--mm-ld-column, 2\.8em\), auto\)\)`/);
  assert.equal(em(declared(css, '.mm-long-division', '--mm-ld-column', PHONE)?.value), 2.3);
  assert.ok(em(declared(css, '.mm-long-division', '--mm-ld-column', PHONE)?.value) < 2.8, 'narrower than the 2.8em a laptop keeps');
});

test('on a phone every synthetic-division column shares the box, so the table fits and the remainder is on screen', () => {
  // The first column was `auto` (90-136px of a 322px box); it is the same share as the rest on a phone and keeps
  // `auto` everywhere else.
  assert.match(jsx, /minmax\(var\(--mm-synthetic-column\), var\(--mm-synthetic-r-width, auto\)\) repeat\(\$\{columns\}, minmax\(var\(--mm-synthetic-column\), 1fr\)\)/);
  assert.equal(declared(css, '.mm-synthetic', '--mm-synthetic-r-width', PHONE)?.value, '1fr');
  assert.equal(declared(css, '.mm-synthetic', '--mm-synthetic-r-width', { media: null }), null, 'a laptop keeps its auto column');

  // The width it needs, against the narrowest supported phone: the box is the screen less the gutters of the
  // work area and the cards around the table (68px, measured in the real App at 344, 360 and 390).
  const column = em(declared(css, '.mm-synthetic', '--mm-synthetic-column', PHONE)?.value);
  const COLUMNS = 6; // r and five coefficients: the longest table a lesson draws
  const FONT = 16;
  const BOX_AT_320 = 320 - 68;
  assert.ok(COLUMNS * column * FONT <= BOX_AT_320, `${COLUMNS} columns of ${column}em are ${Math.round(COLUMNS * column * FONT)}px; the box at 320px is ${BOX_AT_320}px`);

  // A box fills its column: 2.6em wide where the column has room, and the column where it is narrower.
  assert.equal(declared(css, '.mm-synthetic-input', 'width', { media: null })?.value, '100%');
  assert.equal(declared(css, '.mm-synthetic-input', 'min-width', PHONE)?.value, 'min(2.6em, 100%)', 'a box is 2.6em wide, or its column where that is narrower');
});

test('a table that still does not fit (200% text) shows a soft edge on the side that has more', () => {
  for (const selector of ['.mm-long-division-scroll', '.mm-synthetic-scroll']) {
    assert.equal(declared(css, selector, 'overflow-x', { media: null })?.value, 'auto', `${selector} scrolls inside its box`);
    const layers = declared(css, selector, 'background', { media: null })?.value ?? '';
    // Two covers that scroll with the content hide the two shadows fixed to the box once an edge is reached.
    assert.equal((layers.match(/\blocal\b/g) || []).length, 2, `${selector}: two covers`);
    assert.equal((layers.match(/\bscroll\b/g) || []).length, 2, `${selector}: two shadows`);
    assert.ok(layers.indexOf('local') < layers.indexOf('scroll'), `${selector}: the covers are drawn over the shadows`);
  }
});

test('an add & subtract column box shows its whole placeholder on a phone (TL31)', () => {
  // At 390px a column's box is about 90px beside its √x button: some 60px of
  // text at 20px, about six letters. "opposite" and "term or 0" showed as
  // "opposit…" and "term or…" (walkthrough 2026-10-22, Operations, phone).
  const addSubtract = region(jsx, 'function AddSubtract(', 'function FactorQuadratic(', 'AddSubtract');
  // Each <MathInput … /> tag (its props hold arrows, so not [^>]*), the compact ones.
  const columnBoxes = [...addSubtract.matchAll(/<MathInput\b[\s\S]*?\/>/g)].map((match) => match[0]).filter((tag) => /\scompact\s/.test(tag));
  assert.equal(columnBoxes.length, 2, 'the opposite and the combined box of a column');
  columnBoxes.forEach((box) => {
    const placeholder = /\bplaceholder="([^"]*)"/.exec(box)?.[1] ?? '';
    assert.ok(placeholder.length <= 5, `"${placeholder}" fits a phone column's box`);
  });
  // What a box takes is said above it: the 0 for a column that cancels is in
  // the Combined label, on screen at every width.
  assert.match(addSubtract, />Combined <span[^>]*>\(0 if they cancel\)<\/span>/);
});
