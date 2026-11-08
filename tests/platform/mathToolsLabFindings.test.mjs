/*
 * WHAT THE MATH TOOLS LAB'S OTHER TOOLS FOUND, FIXED (student-keyboard-ci).
 *
 * Axe and the contrast review had certified only the Lab's first tool. Its other 24, each a scene of its own at
 * 1366×768 and 390×844 (tests/browser/accessibilityTeacherScreens.mjs MATH_TOOLS_LAB_SCREEN), found these, and the
 * accessibility workflow's browser-accessibility-math-tools-lab job goes red on each again with its fix taken out:
 *
 *   - the Regression Calculator's "Check my regression" and its selected row's number: white on #3f78d7 and #3d78d8,
 *     4.3:1 under the 4.5:1 their text needs (axe, both themes);
 *   - its source data, one row that scrolls sideways on a phone with nothing in it that takes focus (axe:
 *     scrollable-region-focusable);
 *   - Representation Bridge's stages that wait on the one before: the whole stage faded to 70%, so what it waits for
 *     read 3.5:1 and its instructions 3.1:1 (axe);
 *   - the number line's tick labels, fixed at #4f5b6b: 2.4:1 on the dark theme's plane (the contrast review, dark);
 *   - the mapping diagram's "Domain (x)" and "Range (y)" drawn across the oval's top edge and the first value's circle,
 *     1.1 to 1.5:1 against the stroke (the contrast review, both themes);
 *   - and the Lab itself, which mounts a tool with no question around it: the tool's Work View opener lay over its first
 *     panel's heading at 1366×768, and on a phone a two-column grid ran past the tool's edge, its text cut off.
 *
 * Nothing here renders React or lays a page out, so each fix is bound to the code that does the work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { declared, parseCss } from './helpers/cssRules.mjs';
import { overflowsSideways } from '../../src/components/common/matrixScrollRegion.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the Regression Calculator\'s Check and its selected row number are the theme\'s primary pair', () => {
  const rules = parseCss(read('src/tools/regressionCalculator/RegressionCalculator.css'));
  for (const selector of ['.regression-submit', '.regression-rows > li.is-selected .regression-row-gutter']) {
    assert.equal(declared(rules, selector, 'background', { media: null })?.value, 'var(--mm-primary)', `${selector}: the primary fill, light and dark`);
    assert.equal(declared(rules, selector, 'color', { media: null })?.value, 'var(--mm-on-primary)', `${selector}: the text made for it`);
  }
  // The pair the tokens give, in the light theme: 4.5:1 or more (white on #3f78d7 was 4.3:1).
  const tokens = read('src/theme/tokens.css');
  assert.match(tokens, /--mm-primary: #1a73e8;/);
  assert.match(tokens, /--mm-on-primary: #ffffff;/);
});

test('the Regression Calculator\'s source data is a named Tab stop while it scrolls sideways, and only then', () => {
  assert.equal(overflowsSideways({ scrollWidth: 420, clientWidth: 300 }), true, 'a phone: the row is wider than its box');
  assert.equal(overflowsSideways({ scrollWidth: 300, clientWidth: 300 }), false, 'a laptop: it fits');
  const calculator = executableSource(read('src/tools/regressionCalculator/RegressionCalculator.jsx'));
  const list = region(calculator, '<div ref={givensRef} className="regression-givens-list"', '>', 'the source data row');
  assert.match(list, /\{\.\.\.\(givensOverflow \? \{ role: 'region', tabIndex: 0, 'aria-label': SOURCE_DATA_SCROLLS \} : \{\}\)\}/, 'a region and a Tab stop only while it overflows');
  assert.match(calculator, /const SOURCE_DATA_SCROLLS = 'Source data, scrolls sideways';/, 'named for what it holds, as a wide matrix is');
  assert.match(calculator, /const givensOverflow = useOverflowsSideways\(givensRef, /);
  const hook = region(calculator, 'const useOverflowsSideways = (ref, size) => {', '\n};', 'the measurement');
  assert.match(hook, /const measure = \(\) => setOverflowing\(overflowsSideways\(box\)\);/);
  assert.match(hook, /new ResizeObserver\(measure\)/, 'measured again as the box changes size');
});

test('a Representation Bridge stage that waits fades its fields and its Check, not what it says', () => {
  const bridge = executableSource(read('src/tools/representationBridge/RepresentationBridge.jsx'));
  for (const [stage, title] of [['generalForm', 'General form: y = mx + b'], ['factoredForm', 'Factored linear form: y = a(x − c)']]) {
    const box = region(bridge, `<div style={{ border: '1px solid var(--mm-tint-border)', borderRadius: 10, padding: 12`, `>${title}</div>`, `${stage}'s stage`);
    assert.doesNotMatch(box.slice(0, box.indexOf('}}>')), /opacity/, `${stage}: the stage, its name and what it waits for are not faded`);
    const stageBody = bridge.slice(bridge.indexOf(`>${title}</div>`), bridge.indexOf(`checkStage('${stage}')}`));
    assert.match(stageBody, new RegExp(`gap: 10, opacity: stageBlocked\\('${stage}'\\) \\? 0\\.7 : 1 \\}\\}>`), `${stage}: its fields are`);
    assert.match(stageBody, new RegExp(`<div style=\\{\\{ marginTop: 10, opacity: stageBlocked\\('${stage}'\\) \\? 0\\.7 : 1 \\}\\}>\\s*<button data-mm-enter-action="card" type="button" onClick=\\{\\(\\) => $`), `${stage}: and its Check`);
  }
});

test('the number line\'s tick labels take the graph\'s label colour in each theme', () => {
  const line = executableSource(read('src/tools/intervalNumberLine/IntervalNumberLine.jsx'));
  const tick = region(line, '<g key={`major-${value}`}>', '</g>', 'a major tick');
  assert.match(tick, /<text[^>]*style=\{\{ fill: 'var\(--mm-graph-label\)' \}\}/);
  assert.doesNotMatch(tick, /fill="#4f5b6b"/, 'not the light theme\'s grey on the dark plane');
  assert.match(read('src/theme/tokens.css'), /--mm-graph-label: #f1f4f9;/, 'which the dark theme lightens');
});

test('the mapping diagram\'s titles end above the oval and the first value\'s circle', () => {
  const mapping = executableSource(read('src/tools/relationMapping/RelationMapping.jsx'));
  const number = (pattern) => Number(mapping.match(pattern)?.[1]);
  const padY = number(/const PAD_Y = (\d+);/);
  const titleY = number(/<text x=\{LEFT_X\} y=\{(\d+)\} textAnchor="middle" fontSize="13"/);
  const titleSize = number(/<text x=\{LEFT_X\} y=\{\d+\} textAnchor="middle" fontSize="(\d+)"/);
  const extra = number(/ry=\{domainValues\.length \* ROW \/ 2 \+ (\d+)\} style=\{\{ fill: 'var\(--mm-primary-subtle\)'/);
  const radius = number(/<circle cx=\{LEFT_X\} cy=\{yFor\(index, domainValues\.length\)\} r="(\d+)"/);
  assert.ok([padY, titleY, titleSize, extra, radius].every(Number.isFinite), 'the geometry is read from the source');
  // The ellipse is centred at height / 2 = PAD_Y + rows·ROW/2 with ry = rows·ROW/2 + extra, so its top is PAD_Y - extra;
  // the first value's circle (at yFor(0) = PAD_Y for the longer side) tops out at PAD_Y - r. Strokes are 2 wide.
  const titleBottom = titleY + titleSize * 0.3; // the descender of "y" and the parentheses
  assert.ok(padY - extra - 1 > titleBottom + 2, `the oval's top edge (${padY - extra}) clears the titles (to ${titleBottom})`);
  assert.ok(padY - radius - 1 > titleBottom + 2, `the first value's circle (from ${padY - radius}) clears the titles`);
  assert.match(mapping, /const height = Math\.max\(domainValues\.length, rangeValues\.length\) \* ROW \+ PAD_Y \* 2;/, 'the diagram grows by the room it gives');
});

test('the Math Tools Lab gives a bare tool what a question gives it: room for its opener, and one column on a phone', () => {
  // In the Lab's own stylesheet, which it imports: the Lab loads on demand, so the rules are off a student's first load.
  const rules = parseCss(read('src/dev/MathToolsLab.css'));
  assert.match(executableSource(read('src/dev/MathToolsLab.jsx')), /^import '\.\/MathToolsLab\.css';$/m);
  assert.doesNotMatch(read('src/App.css'), /\.mm-tools-lab-tool/, 'not in the stylesheet every screen loads');
  const surface = '.mm-tools-lab-tool .mathmaster-work-view-surface[data-enlarged="false"]:not([data-opener-stacked="true"])';
  assert.equal(declared(rules, surface, 'padding-top', { media: null })?.value, 'var(--mm-work-view-opener-bottom, 52px)', 'the work starts below the opener (a stacked opener has its own row)');
  assert.deepEqual(declared(rules, '.mm-tools-lab-tool .mathmaster-tool-grid', 'grid-template-columns', { media: '(max-width: 600px)' }), { value: 'minmax(0, 1fr)', important: true },
    'one column on a phone, as a question on a phone has (MathToolMobileLayout.css)');
  // The hook the rules and the certification's scenes name is on the element that holds the tool.
  const lab = executableSource(read('src/dev/MathToolsLab.jsx'));
  assert.match(region(lab, '<section className="mm-tools-lab-tool"', '</section>', 'the tool\'s region'), /<Tool questionData=/);
});
