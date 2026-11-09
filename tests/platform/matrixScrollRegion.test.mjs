/*
 * A MATRIX WIDER THAN ITS BOX IS A NAMED TAB STOP THE ARROW KEYS SCROLL
 * (student-a11y-3; the matrices walkthrough's P-4).
 *
 * In the App's phone shell (390×844) the matrices lesson's 4×5 matrices are
 * wider than their boxes, which scroll sideways, and a keyboard could not bring
 * the last column into view: CW 3's matrix A (shown, not answered) holds nothing
 * that takes focus, and CW 1's cells take focus only once an element is chosen.
 * While it overflows, and only then, the box is a focusable region named for its
 * matrix (src/components/common/matrixScrollRegion.js); the browser proof, Tab,
 * the arrow keys and every cell in view at 390 px and at 200% text, is
 * tests/browser/teacherWorkflow/matrixLabPhoneJourneys.mjs `keyboardScroll`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matrixScrollRegionProps, overflowsSideways } from '../../src/components/common/matrixScrollRegion.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { parseCss } from './helpers/cssRules.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('a box is wider than it shows when more than a pixel of the matrix is past its edge', () => {
  // CW 3's matrix A in the App's phone shell: 27 px over.
  assert.equal(overflowsSideways({ scrollWidth: 344, clientWidth: 317 }), true);
  assert.equal(overflowsSideways({ scrollWidth: 318, clientWidth: 317 }), false, 'a pixel of rounding is not a scroll');
  assert.equal(overflowsSideways({ scrollWidth: 277, clientWidth: 317 }), false, 'a matrix that fits');
  assert.equal(overflowsSideways({}), false);
});

test('while it overflows the box is a region a keyboard reaches, named for its matrix; otherwise it is nothing', () => {
  assert.deepEqual(matrixScrollRegionProps({ overflowing: true, spokenName: 'Matrix A', dimensionsText: '4 by 5' }), {
    role: 'region', tabIndex: 0, 'aria-label': 'Matrix A, 4 by 5, scrolls sideways',
  });
  assert.equal(matrixScrollRegionProps({ overflowing: true, spokenName: 'Matrix', dimensionsText: '2 by 3' })['aria-label'], 'Matrix, 2 by 3, scrolls sideways');
  // A matrix that fits adds no Tab stop: a laptop's Tab order is as it was.
  assert.deepEqual(matrixScrollRegionProps({ overflowing: false, spokenName: 'Matrix A', dimensionsText: '4 by 5' }), {});
  assert.deepEqual(matrixScrollRegionProps(), {});
});

test('MatrixGrid measures its scroller and spreads the region on it, for every matrix it draws', () => {
  const grid = executableSource(read('src/components/common/MatrixGrid.jsx'));
  // The box that scrolls is the one measured and the one named.
  assert.match(grid, /<div ref=\{scrollRef\} data-matrix-scroll="true" \{\.\.\.matrixScrollRegionProps\(\{ overflowing, spokenName, dimensionsText \}\)\} style=\{\{[^}]*overflowX: 'auto'/);
  // Measured again whenever the box or the matrix in it changes size (a narrower
  // screen, larger text, a longer value typed in a cell).
  const hook = region(grid, 'const useOverflowsSideways = (ref, shape) => {', '\n};', 'the measure');
  assert.match(hook, /const measure = \(\) => setOverflowing\(overflowsSideways\(box\)\);/);
  assert.match(hook, /const observer = new ResizeObserver\(measure\);\s*observer\.observe\(box\);\s*\[\.\.\.box\.children\]\.forEach\(\(child\) => observer\.observe\(child\)\);/);
  assert.match(hook, /return \(\) => observer\.disconnect\(\);/);
  // A hook, so before the grid's early return for an empty matrix (rules of hooks).
  const body = region(grid, 'export default function MatrixGrid({', '\n}\n', 'MatrixGrid');
  const measured = body.indexOf('const overflowing = useOverflowsSideways(scrollRef, ');
  assert.ok(measured > 0 && measured < body.indexOf('if (!height || !width) return null;'), 'measured before the empty matrix returns');
});

test('the page\'s keyboard ring shows it: a Tab stop the global ring covers, which it does not opt out of', () => {
  // index.css draws the ring on every [tabindex] stop that does not draw its own.
  const ring = parseCss(read('src/index.css')).find((rule) => rule.selectors.some((selector) => selector.includes('[tabindex]:not([tabindex="-1"])') && selector.endsWith(':focus-visible')));
  assert.ok(ring, 'the global ring covers a [tabindex] stop');
  assert.equal(ring.declarations.outline?.value, '3px solid var(--mm-focus)');
  assert.equal(ring.declarations.outline?.important, true, 'over any inline outline: none');
  assert.equal(matrixScrollRegionProps({ overflowing: true })['data-focus-ring'], undefined, 'the region keeps the page\'s ring');
});
