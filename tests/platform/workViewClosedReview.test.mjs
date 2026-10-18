/*
 * TOOL-13 (student pass 3): small Work View inconsistencies.
 *
 *  - The dialog's name said "Question Work View, Work View".
 *  - Only two tools marked their work area, so every other tool opened Work
 *    View at its top, above the work: QuestionEngine now marks the question's
 *    work area as the fallback (data-work-view-area).
 *  - A closed question's opener was disabled, so a student could not enlarge
 *    their own graded graph to review it. It stays enabled for review; the
 *    grading transition still closes an open Work View, and what Work View
 *    shows of a closed question is exactly the closed work area (inert, no
 *    Submit / Reset / Undo, Help says it is closed).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findWorkViewRevealTarget } from '../../src/platform/workView/workViewReveal.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const figure = read('src/components/common/EnlargeableFigure.jsx');
const engine = read('src/QuestionEngine.jsx');

test('TOOL-13: the dialog says "Work View" once', async () => {
  // The component file is .jsx (node cannot import it): evaluate the helper's own text.
  const helper = region(figure, 'export const workViewDialogName = (label) => {', '\n};', 'name helper');
  // eslint-disable-next-line no-new-func
  const workViewDialogName = new Function(`${helper.replace('export const workViewDialogName =', 'return')}\n}`)();
  assert.equal(workViewDialogName('Question Work View'), 'Question Work View');
  assert.equal(workViewDialogName('graph'), 'graph, Work View');
  assert.equal(workViewDialogName(''), 'Work View');
  assert.match(figure, /aria-label=\{enlarged \? workViewDialogName\(label\) : undefined\}/);
});

const box = (top, height) => ({ getBoundingClientRect: () => ({ top, bottom: top + height, width: 300, height }) });
const surfaceWith = (bySelector) => ({ querySelectorAll: (selector) => bySelector[selector] || [] });

test('TOOL-13: Work View opens on the question\'s work area when the tool marks nothing finer', () => {
  const area = box(600, 400);
  const plane = box(700, 200);
  const focus = box(800, 100);
  assert.equal(findWorkViewRevealTarget(surfaceWith({ '[data-work-view-area="true"]': [area] })).target, area);
  assert.equal(findWorkViewRevealTarget(surfaceWith({ '[data-work-view-area="true"]': [area] })).align, 'nearest');
  // A tool's own markers still win.
  assert.equal(findWorkViewRevealTarget(surfaceWith({ '[data-work-view-area="true"]': [area], '[data-work-view-reveal="true"]': [plane] })).target, plane);
  assert.equal(findWorkViewRevealTarget(surfaceWith({ '[data-work-view-area="true"]': [area], '[data-work-view-focus="true"]': [focus] })).target, focus);
  // A hidden area (an inactive stage) is skipped.
  assert.equal(findWorkViewRevealTarget(surfaceWith({ '[data-work-view-area="true"]': [box(0, 0)] })), null);
  assert.match(engine, /<fieldset disabled=\{workAreaClosed\} data-work-view-area="true"/);
});

test('TOOL-13: a closed question\'s opener stays for review; closing still closes Work View', () => {
  assert.match(figure, /const openerBlocked = nestedWorkView \|\| \(shouldForceClose && !reviewWhenClosed\);/);
  assert.match(figure, /onClick=\{openWorkView\} disabled=\{openerBlocked\}/);
  const open = region(figure, 'const openWorkView = () => {', '};', 'openWorkView');
  assert.match(open, /if \(openerBlocked\) return;/);
  // The grading transition still closes an open Work View, and auto-open never opens a closed one.
  assert.match(figure, /useEffect\(\(\) => \{\s*if \(!shouldForceClose\) return;[\s\S]{0,600}?setEnlarged\(false\);\s*\}, \[shouldForceClose, nestedWorkView\]\);/);
  assert.match(figure, /const allowedToAutoOpen = !shouldForceClose && openEnlarged/);
  // Focus returns to the opener after a review, never after a grading close.
  assert.match(figure, /if \(!shouldForceClose \|\| reviewed\) openerRef\.current\?\.focus/);
  // QuestionEngine opts in, and keeps the closed area closed inside Work View.
  const shell = region(engine, '<EnlargeableFigure\n        label="Question Work View"', '>', 'the question shell');
  assert.match(shell, /forceClosed=\{locked\}/);
  assert.match(shell, /reviewWhenClosed/);
  assert.match(engine, /const workAreaClosed = !moduleFailed && Boolean\(locked \|\|/);
  assert.match(engine, /inert=\{workAreaClosed \? true : undefined\}/);
  // On a closed question the Work View Help is only "this question is closed".
  assert.match(engine, /: locked\s*\?\s*\{ label: 'Help', text: 'This question is closed\. Your work stays in place when you open or close Work View\.'/);
});
