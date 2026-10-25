/*
 * A PLANE THE STUDENT MARKS FITS BETWEEN THE PINNED TASK AND THE PINNED BAR
 * (PH11; finding A2-54).
 *
 * "Mark x-intercepts" on a 1366x640 Chromebook opened with a 400px plane of
 * which 252px showed: App.css caps a plane at the smaller of 70% of the window
 * and the window less 240px, and the pinned navigator, task card, step heading
 * and action bar were 385px. The x-axis, the thing the step asks about, was
 * under the bar. The marking plane's cap is now the chrome as it is measured.
 *
 * Nothing here renders a page, so this works the cap out the way the browser
 * does (helpers/cssMath.mjs) for the window and the measured chrome and asks
 * what the student gets. The browser half is tests/browser/stagedQuestion.mjs
 * (ROOM: the whole plane is on screen when a marking step opens, on six
 * screens). Each assertion was broken once to see it go red (see the PR).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCss, declared, rulesFor } from './helpers/cssRules.mjs';
import { evaluateLength } from './helpers/cssMath.mjs';
import { executableSource } from './helpers/sourceContract.mjs';
import { ACTION_BAR_HEIGHT_VAR, STICKY_TASK_HEIGHT_VAR } from '../../src/platform/layout/stickyHeightRef.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const workflowCss = parseCss(read('src/platform/workflow/WorkflowFocusMode.css'));
const appCss = parseCss(read('src/App.css'));

const DESKTOP = '.mathmaster-desktop-question-content';
const PLANE = `${DESKTOP} .workflow-focus__feature-plane .mathmaster-responsive-canvas`;
const WORK_VIEW_PLANE = `${DESKTOP} .mathmaster-enlarged-figure .workflow-focus__feature-plane .mathmaster-responsive-canvas`;

// The chrome measured at 1366x640 with the real app (tests/browser/stagedQuestion.mjs,
// default text size): the navigator ends 99px down, the pinned task is 151px tall, the
// action bar 65px, and the step's padding and heading take 72px before the plane starts.
const MEASURED = { '--mm-sticky-task-top': '99px', [STICKY_TASK_HEIGHT_VAR]: '151px', [ACTION_BAR_HEIGHT_VAR]: '65px', '--mm-px': '1px' };
const STEP_ABOVE_THE_PLANE = 72;

const expression = (css, selector) => {
  const found = declared(css, selector, 'max-height', { media: null });
  assert.ok(found, `${selector} sets no max-height`);
  return found.value;
};
const capOf = (height, vars = MEASURED) => evaluateLength(expression(workflowCss, PLANE), { viewport: { width: 1366, height }, vars });
const appCapOf = (height) => evaluateLength(expression(appCss, '.mathmaster-responsive-canvas'), { viewport: { width: 1366, height }, vars: { '--mm-px': '1px' } });

test('on a 1366x640 Chromebook the whole plane is between the pinned task and the action bar', () => {
  const stackBottom = 99 + 151;
  const room = 640 - 65 - (stackBottom + STEP_ABOVE_THE_PLANE);
  const cap = capOf(640);
  assert.ok(cap <= room, `a ${cap}px plane starts ${stackBottom + STEP_ABOVE_THE_PLANE}px down and ends under the ${640 - 65}px line the bar starts at`);
  // And it takes the room there is: not a plane of 150px with 90px going spare.
  assert.ok(cap >= room - 20, `${cap}px leaves ${room - cap}px of ${room}px unused`);
  // The old cap (400px) was the problem this fixes.
  assert.equal(appCapOf(640), 400);
});

test('it follows each piece of chrome: the pinned stack, the task card, the bar, and the text size', () => {
  const base = capOf(900);
  // Taller pinned stack, taller card, taller bar: each takes its height from the plane.
  assert.equal(capOf(900, { ...MEASURED, '--mm-sticky-task-top': '149px' }), base - 50);
  assert.equal(capOf(900, { ...MEASURED, [STICKY_TASK_HEIGHT_VAR]: '201px' }), base - 50);
  assert.equal(capOf(900, { ...MEASURED, [ACTION_BAR_HEIGHT_VAR]: '115px' }), base - 50);
  // "Hide task" gives the card's height back, and the plane takes it.
  assert.equal(capOf(640, { ...MEASURED, [STICKY_TASK_HEIGHT_VAR]: '80px' }) - capOf(640), 71);
  // Bigger text makes the step's own padding and heading bigger (the stack and bar are measured,
  // so they have already grown in the vars): at twice the size the plane leaves that much more.
  const larger = capOf(1200, { ...MEASURED, '--mm-px': '2px' });
  assert.ok(capOf(1200) - larger >= STEP_ABOVE_THE_PLANE, `at double text the cap fell ${capOf(1200) - larger}px, the step above it grew ${STEP_ABOVE_THE_PLANE}px`);
});

test('it is never taller than the old cap, and never collapses', () => {
  // Never over 70% of the window, however much room there is.
  for (const height of [1080, 1440, 2000]) assert.ok(capOf(height) <= 0.7 * height + 0.5, `${height}`);
  // A very short window keeps a plane that can be used; scrolling is the better failure there.
  assert.equal(capOf(480), 220);
  assert.equal(capOf(300), 220);
});

test('where no chrome is measured it is exactly the old cap, so only the layout that publishes it changes', () => {
  // A preview, a phone, a page with no pinned stack: nothing is published and the pieces add up to 240px.
  // (Under 460px the floors differ, 220 against 140, which only a desktop-layout window that short meets.)
  for (const height of [500, 640, 768, 900, 1080, 1440]) {
    assert.equal(capOf(height, { '--mm-px': '1px' }), appCapOf(height), `${height}px`);
  }
});

test('the three measurements the cap reads are ones the desktop layout publishes', () => {
  // A renamed variable would leave the cap reading its fallback and nothing would say so.
  assert.equal(STICKY_TASK_HEIGHT_VAR, '--mm-sticky-task-height');
  assert.equal(ACTION_BAR_HEIGHT_VAR, '--mm-action-bar-height');
  const published = declared(appCss, '.mathmaster-assignment-screen', '--mm-sticky-task-top', { media: '(min-width: 769px)' });
  assert.ok(published, 'the pinned stack\'s bottom edge is declared for the assignment screen');
  // And the cap answers to every one of them (a piece dropped from the sum would not move it).
  for (const name of ['--mm-sticky-task-top', STICKY_TASK_HEIGHT_VAR, ACTION_BAR_HEIGHT_VAR]) {
    assert.notEqual(capOf(900, { ...MEASURED, [name]: '300px' }), capOf(900), `${name} does not change the cap`);
  }
});

test('it is the desktop layout only, and Work View keeps its own cap', () => {
  // No rule outside the desktop layout's wrapper: a phone's work scrolls inside its own container and publishes none of this.
  assert.deepEqual(rulesFor(workflowCss, '.workflow-focus__feature-plane .mathmaster-responsive-canvas'), []);
  // Work View covers the app and is not under the pinned stack: it is as tall as it always was (App.css: 88dvh).
  const workViewCap = (height) => evaluateLength(expression(workflowCss, WORK_VIEW_PLANE), { viewport: { width: 1366, height }, vars: MEASURED });
  const appWorkView = (height) => evaluateLength(expression(appCss, '.mathmaster-enlarged-figure .mathmaster-responsive-canvas'), { viewport: { width: 1366, height }, vars: MEASURED });
  for (const height of [640, 768, 1080]) assert.equal(workViewCap(height), appWorkView(height), `${height}px`);
  assert.ok(workViewCap(640) > capOf(640), 'the enlarged plane is bigger than the one under the pinned chrome');
});

test('the marking stage carries the class the cap is written against', () => {
  const stage = executableSource(read('src/platform/workflow/GraphFeatureSelectStage.jsx'));
  assert.match(stage, /className="workflow-focus__feature-plane"/);
});
