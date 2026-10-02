// The Student Case Review on a phone (about 390 px wide, down to 320): the
// whole review scrolls so the evidence gets the screen, every control is a
// fingertip target, and every table reads as one card per row with each value
// under its column's name. The browser journey checks the result at 390x844
// (tests/browser/teacherWorkflow/caseReviewJourneys.mjs); these check the
// pieces that make it so.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { keepTableCellsLabelled, labelTableCells } from '../../src/components/teacher/caseReview/tableCellLabels.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const css = read('src/components/teacher/caseReview/caseReview.css');
const view = read('src/components/teacher/caseReview/StudentCaseReviewView.jsx');
// Upright or on its side: the scrolling layout and fingertip targets.
const shortScreen = region(css, '@media (max-width: 600px), (max-height: 500px) {', '\n}\n', 'phone rules, any orientation');
// Upright: tables as cards.
const phone = region(css, '@media (max-width: 600px) {', '\n}\n', 'upright phone rules');

// A minimal table, as the DOM exposes one (tHead, tBodies, rows, cells).
const cell = (text = '', colSpan = 1) => {
  const attributes = {};
  return { textContent: text, colSpan, getAttribute: (name) => attributes[name] ?? null, setAttribute: (name, value) => { attributes[name] = String(value); } };
};
const table = (headers, rowCount = 2, cellsPerRow = headers.length) => ({
  tHead: headers ? { rows: [{ cells: headers.map((header) => (Array.isArray(header) ? cell(...header) : cell(header))) }] } : null,
  tBodies: [{ rows: Array.from({ length: rowCount }, () => ({ cells: Array.from({ length: cellsPerRow }, () => cell('value')) })) }],
});
const root = (...tables) => ({ querySelectorAll: (selector) => (selector === 'table' ? tables : []) });
const labels = (subject) => subject.tBodies[0].rows.map((row) => row.cells.map((entry) => entry.getAttribute('data-label')));

test('every body cell is named by its column header, once, and stays right after a rename', () => {
  const grades = table(['Assignment', '  Class\n due ', 'DOL']);
  assert.equal(labelTableCells(root(grades)), 6);
  assert.deepEqual(labels(grades), [['Assignment', 'Class due', 'DOL'], ['Assignment', 'Class due', 'DOL']]);
  assert.equal(labelTableCells(root(grades)), 0, 'idempotent: nothing to change the second time');
  grades.tHead.rows[0].cells[2].textContent = 'DOL score';
  assert.equal(labelTableCells(root(grades)), 2, 'a renamed column relabels its cells');
  assert.equal(labels(grades)[1][2], 'DOL score');
});

test('a spanning header names every column it covers; a table without a header is left alone', () => {
  const spanned = table([['Attempt'], ['Result and credit', 2]], 1, 3);
  labelTableCells(root(spanned));
  assert.deepEqual(labels(spanned), [['Attempt', 'Result and credit', 'Result and credit']]);
  const headless = table(null, 1, 2);
  assert.equal(labelTableCells(root(headless)), 0);
  assert.deepEqual(labels(headless), [[null, null]]);
  assert.equal(labelTableCells(null), 0);
});

test('rows that arrive later (a page, a filter, a rebuild) are labelled as they arrive, and watching stops', () => {
  const observed = [];
  let disconnected = false;
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observed.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { disconnected = true; }
  };
  try {
    const grades = table(['Assignment', 'Status'], 1);
    const area = root(grades);
    const stop = keepTableCellsLabelled(area);
    assert.deepEqual(labels(grades), [['Assignment', 'Status']], 'labelled at once');
    assert.deepEqual(observed[0].options, { childList: true, characterData: true, subtree: true });
    assert.equal(observed[0].target, area);
    grades.tBodies[0].rows.push({ cells: [cell('x'), cell('y')] });
    observed[0].callback([]);
    assert.deepEqual(labels(grades)[1], ['Assignment', 'Status'], 'a new row is labelled');
    stop();
    assert.equal(disconnected, true);
  } finally {
    delete globalThis.MutationObserver;
  }
  assert.equal(typeof keepTableCellsLabelled(null), 'function', 'nothing to watch, nothing to stop');
});

test('on a phone, upright or on its side, the whole case review scrolls, so neither the header nor a reopened selection can crowd out the evidence', () => {
  assert.match(shortScreen, /\.cr-shell \{ overflow-x: hidden; overflow-y: auto; \}/);
  assert.match(shortScreen, /\.cr-body \{ flex: 0 0 auto; overflow: visible; \}/);
  // The scroll memory follows whichever element scrolls.
  const scrollerOf = region(view, 'const scrollerOf = (body, shell) => {', '\n};', 'scrollerOf');
  assert.match(scrollerOf, /getComputedStyle\(body\)\.overflowY === 'visible' && shell \? shell : body/);
  const restore = region(view, 'useLayoutEffect(() => {\n    const scroller = scrollerOf(bodyRef.current, shellRef.current);', '}, [locationKey]);', 'restore effect');
  assert.match(restore, /scroller\.scrollTop = Number\.isFinite\(saved\) \? saved : Math\.min\(scroller\.scrollTop, evidenceTopIn\(scroller, bodyRef\.current\)\);/);
  assert.match(region(view, 'const navigate = useCallback((next) => {', '}, [location, locationKey]);', 'navigate'), /const scroller = scrollerOf\(bodyRef\.current, shellRef\.current\);\n\s*if \(scroller\) scrollByTab\.current\[locationKey\] = scroller\.scrollTop;/);
  assert.match(region(view, 'const goBack = () => {', '\n  };', 'goBack'), /rememberScroll\(\);/);
  assert.match(view, /data-case-review=\{student\.id\} onScroll=\{rememberScroll\}>/, 'the whole review remembers where it is scrolled');
  assert.match(view, /<div ref=\{bodyRef\} className="cr-body" onScroll=\{rememberScroll\}>/);
});

test('on a phone, upright or on its side, every control is at least 44 px', () => {
  [
    /\.cr-shell \.tw-btn, \.cr-shell \.tw-chip, \.cr-shell \.tw-select, \.cr-shell \.tw-input, \.cr-file \{ min-height: 44px; \}/,
    /\.cr-tab \{ min-height: 44px; \}/,
    /\.cr-crumbs button, \.cr-linkish \{ min-height: 44px;/,
    /\.cr-shell summary \{ min-height: 44px;/,
    /\.cr-assignment-picker label \{ min-height: 44px; \}/,
  ].forEach((rule) => assert.match(shortScreen, rule));
});

test('on a phone each table row is a card and each value carries its column name', () => {
  assert.match(phone, /\.cr-scroll-x \{ overflow-x: visible; \}/, 'no table scrolls sideways');
  assert.match(phone, /\.cr-table, \.cr-table > tbody, \.cr-table > tbody > tr, \.cr-table > tbody > tr > td,[\s\S]*?\{\s*display: block; width: 100%;/);
  assert.match(phone, /\.cr-table > thead, \.cr-print-preview thead \{\s*position: absolute; width: 1px; height: 1px;[^}]*clip: rect\(0 0 0 0\)/, 'headers stay for screen readers, out of sight');
  assert.match(phone, /td::before \{\s*content: attr\(data-label\);/);
  // The labels come from the headers, kept current by the view.
  assert.match(view, /import \{ keepTableCellsLabelled \} from '\.\/tableCellLabels\.js';/);
  assert.match(executableSource(view), /useEffect\(\(\) => keepTableCellsLabelled\(bodyRef\.current\), \[open, student\?\.id\]\);/);
});

test('a long record path wraps instead of widening the narrative facts past the screen', () => {
  const outside = css.slice(0, css.indexOf('@media (max-width: 600px), (max-height: 500px) {'));
  assert.match(outside, /\.cr-facts > li \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;[^}]*\}/);
  assert.match(outside, /\.cr-body code \{ overflow-wrap: anywhere; \}/);
});
