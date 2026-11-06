/*
 * A GRAPH-ANALYSIS INTERVAL BOX FITS THE INTERVAL TYPED IN IT
 * (student walkthrough 2026-11-06, Algebra II Honors module 1, part 2, P-2).
 *
 * At 1366×768 the Analysis Parts rail was 220px wide and each interval box
 * 120px beside its keypad button. A typed (−∞, ∞) showed as "−∞, ∞", both
 * brackets cut off, and (−∞, 0) ∪ (0, ∞) (L2 Day 1 CW 5 and DOL 1) scrolled
 * inside its box. In an interval the brackets are the answer.
 *
 * Now a question that asks for an interval gets a 270px rail, and each
 * interval box takes its card's whole width, in the compact type, with its
 * keypad button under it. That every typed interval in the module then fits,
 * at 1366×768 and 390×844 with CI's fonts, was measured in Chromium; this file
 * holds the workspace and the field to that layout.
 *
 * math-speech-2, item 6: at 200% text the rail stayed 270px while the box's
 * math doubled, and a typed (−∞, −1) ∪ (−1, ∞) (361px of math) showed 188px.
 * The rail is 270 of the text's own px now, as are Work View's domain and
 * range columns, which were 230px and cut the union even at the default size.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { startShallowLoader } from './helpers/shallowComponent.mjs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { analysisKeypadProfile } from '../../functions/shared/pathToolContracts.mjs';
import { parseCss, declared } from './helpers/cssRules.mjs';

const lesson = (file) => parseAssignmentBlueprintText(readFileSync(new URL(`../../teacher-import-jsons/algebra2-honors-module1/${file}`, import.meta.url), 'utf8')).questions;
const L2_DAY1 = lesson('L2_Day1_Parent_Functions_Key_Attributes.json');
const L1_DAY2 = lesson('L1_Day2_Function_Attributes_Relations.json');
const item = (questions, id) => questions.find((question) => question.questionId === id);

// The workspace's hooks run once (helpers/shallowComponent.mjs); its effects
// reach for a window, which a server render does not have.
const noop = () => {};
const WINDOW = {
  innerWidth: 1366, innerHeight: 768, addEventListener: noop, removeEventListener: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  requestAnimationFrame: () => 0, cancelAnimationFrame: noop, setTimeout, clearTimeout,
  navigator: { maxTouchPoints: 0, userAgent: 'node' },
};
let shallow = null;
let ssr = null;
let hadWindow = false;
let previousWindow;
before(async () => {
  hadWindow = 'window' in globalThis;
  previousWindow = globalThis.window;
  globalThis.window = WINDOW;
  shallow = await startShallowLoader();
  const { createServer } = await import('vite');
  ssr = await createServer({ server: { middlewareMode: true, ws: false, hmr: false, watch: null }, appType: 'custom', logLevel: 'silent' });
});
after(async () => {
  await shallow?.close();
  await ssr?.close();
  if (hadWindow) globalThis.window = previousWindow;
  else delete globalThis.window;
});

// The rail's width and what each analysis box is given, on the analysis stage.
const analysisOf = async (question) => {
  const MathInput = (await shallow.ssrLoadModule('/src/MathInput.jsx')).default;
  const Workspace = (await shallow.ssrLoadModule('/src/InteractiveGraphWorkspace.jsx')).default;
  const tree = Workspace({ question, onStateChange: noop, mode: 'analysis' });
  const boxes = [];
  let rail = null;
  let grid = '';
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    if (node.type === MathInput) boxes.push(node.props);
    if (String(node.props?.className || '').includes('mathmaster-function-workspace-grid')) {
      // A width in px, or in the text's own px (calc(N * var(--mm-px))), which grows with the text size.
      rail = /^minmax\(min\(100%, 180px\), (?:(\d+)px|calc\((\d+) \* var\(--mm-px\)\))\)/.exec(node.props.style?.gridTemplateColumns || '');
      grid = String(node.props.className);
    }
    if (node.props) walk(node.props.children);
  };
  walk(tree);
  return { rail: Number(rail?.[1] ?? rail?.[2]), grows: rail?.[2] !== undefined, grid, boxes };
};

test('a question that asks for intervals gets the wider rail, and each interval box its card\'s width', async () => {
  for (const [name, question, count] of [
    ['L2 Day 1 CW 6 (2ˣ)', item(L2_DAY1, 'q_classwork-2_2_6'), 3],
    ['L2 Day 1 CW 5 (1/x, a union)', item(L2_DAY1, 'q_classwork-2_2_5'), 4],
    ['L1 Day 2 CW 3 (four intervals)', item(L1_DAY2, 'q_classwork-2_2_3'), 4],
  ]) {
    assert.ok(question, name);
    const { rail, grows, grid, boxes } = await analysisOf(question);
    assert.equal(rail, 270, `${name}: the rail`);
    assert.ok(grows, `${name}: the rail grows with the text size`);
    assert.match(grid, /\bmathmaster-interval-answers\b/, `${name}: Work View can give its columns the same room`);
    const intervals = boxes.filter((box) => box.toolProfile === 'interval');
    assert.equal(intervals.length, count, `${name}: its interval boxes`);
    for (const box of intervals) {
      assert.equal(box.fieldOwnRow, true, `${name} ${box.ariaLabel}: the field has its own row`);
      assert.equal(box.compact, true, `${name} ${box.ariaLabel}: the compact type`);
    }
  }
});

test('a question with no interval to type keeps the 220px rail and the boxes as they were', async () => {
  const question = item(L2_DAY1, 'q_classwork-2_2_6');
  const pointsOnly = { ...question, analysisRequests: question.analysisRequests.filter((part) => analysisKeypadProfile(part) !== 'interval') };
  assert.ok(pointsOnly.analysisRequests.length > 0, 'the y-intercept part is left');
  const { rail, grows, grid, boxes } = await analysisOf(pointsOnly);
  assert.equal(rail, 220);
  assert.ok(!grows, 'a fixed 220px');
  assert.doesNotMatch(grid, /mathmaster-interval-answers/);
  for (const box of boxes) assert.ok(!box.fieldOwnRow && !box.compact, `${box.ariaLabel} is as it was`);
});

test('a field with its own row wraps its tools button under it; any other field keeps one row', async () => {
  const MathInput = (await ssr.ssrLoadModule('/src/MathInput.jsx')).default;
  const markup = (props) => renderToStaticMarkup(createElement(MathInput, { value: '', onChange: noop, ariaLabel: 'Domain', ...props }));
  const own = markup({ fieldOwnRow: true });
  assert.match(own, /class="mathmaster-math-input-row" style="[^"]*flex-wrap:wrap/, 'the row wraps');
  assert.match(own, /<math-field[^>]*style="[^"]*flex:1 1 100%/, 'the field takes the row');
  assert.match(own, /class="mathmaster-math-tools-toggle"[^>]*style="[^"]*margin-left:auto/, 'the button sits under it, at its end');
  const plain = markup({});
  assert.doesNotMatch(plain, /flex-wrap|margin-left:auto/, 'no other field changes');
  assert.match(plain, /<math-field[^>]*style="[^"]*flex:1 1 auto/);
});

// Work View's domain and range columns (App.css, from 1050px): 230px left 174px
// for a typed (−∞, −1) ∪ (−1, ∞), 182px of math at the default text size.
test('in Work View, the domain and range columns of an interval question grow as the rail does', () => {
  const css = parseCss(readFileSync(new URL('../../src/App.css', import.meta.url), 'utf8'));
  const WIDE = { media: '(min-width: 1050px)' };
  const base = '[data-enlarged="true"] .mathmaster-function-workspace-grid.mathmaster-domain-range-only';
  const interval = declared(css, `${base}.mathmaster-interval-answers`, 'grid-template-columns', WIDE);
  assert.ok(interval?.important, 'it outranks the 230px columns (one class more, !important as they are)');
  assert.equal((interval.value.match(/calc\(270 \* var\(--mm-px\)\)/g) || []).length, 2, `both columns: ${interval.value}`);
  assert.match(declared(css, base, 'grid-template-columns', WIDE)?.value || '', /230px/, 'a question with no interval keeps 230px');
});
