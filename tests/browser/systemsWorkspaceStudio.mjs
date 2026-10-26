// THE SYSTEMS-OF-INEQUALITIES WORKSPACE, USED THE WAY A STUDENT USES IT.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/systemsWorkspaceStudio.mjs [scenario ...]
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// The student-build mode walks a student through a system one step at a time
// (inequalityBuildFlow.js) beside a graph that stays on screen
// (InequalityWorkspace.css). Each fixture in systemsWorkspaceStudioMain.jsx is
// mounted in the real QuestionEngine and driven only through rendered controls:
//
//   journey    a whole system on a Chromebook (1366×768): a wrong boundary,
//              line style, shading side and classification are each called
//              out and keep the student on that step; a right one moves on by
//              itself; the whole graph is on screen for every tap; graded right
//   phone      the same journey on a 390×844 touch screen
//   reload     work, the open step and what was checked survive a reload; a
//              changed answer counts only once it is checked again
//   keyboard   the graph plots from the arrow keys and Enter, a plotted point is
//              moved and a side is shaded the same way, the lines say so before
//              a key is pressed, and a passing Check hands focus to the step it
//              opens (AX32)
//   keyboardReasoning  a whole system worked on the graph by keys alone: three
//              boundaries, their sides, a test point of the student's own and
//              every corner, with each step's line naming the tap and the keys
//   keyboardConstruct  the two construct forms, whose points are typed or
//              plotted, take the same keys
//   rewrite    the rewrite runs in the relation solver inside its step, the
//              graph does nothing until y is alone, then the boundary opens;
//              the solver teaches no cancelling there (TL34), at 1366x768 and
//              on a 390x844 touch screen (rewritePhone)
//   workview   the enlarged Work View says what the graph is waiting for, and a
//              tap there is the same work as a tap on the page
//   contrast   every line of the steps is readable, light and dark
//
// Nothing here weakens the mathematics: every step is still the student's to
// do and to check. What is held is that doing it takes no hunting.
//
// Exits non-zero on any failure.

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { balanced, cancelPair } from './relationWorkspaceDriver.mjs';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/systemsWorkspaceStudio');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const tally = {};
let surface = '';
const check = (ok, label, detail = '') => {
  tally[surface] = tally[surface] || { ok: 0, fail: 0 };
  tally[surface][ok ? 'ok' : 'fail'] += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const settle = (page, ms = 300) => page.waitForTimeout(ms);

const CHROMEBOOK = { width: 1366, height: 768 };
const PHONE = { width: 390, height: 844 };
const stamp = Date.now();
let pageCount = 0;
const pages = [];
const open = async (q, { role = 'practice', theme = 'light', viewport = CHROMEBOOK, touch = false } = {}) => {
  pageCount += 1;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  pages.push(page);
  // A control that never appears is a finding, not a 30-second wait.
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => check(false, `${surface}: page error`, error.message));
  await page.goto(`${ORIGIN}/tests/browser/systemsWorkspaceStudio.html?q=${q}&role=${role}&theme=${theme}&run=${stamp}-${pageCount}`, { waitUntil: 'networkidle' });
  await page.locator('[data-studio-fixture]').waitFor();
  await settle(page, 900);
  return page;
};

/** One scenario: a missing control fails it, never the rest of the gate. */
const scenario = async (label, body) => {
  try {
    await body();
  } catch (error) {
    const waitedFor = (error.message.match(/waiting for (.*)/) || [])[1];
    const plain = (text) => text.split(String.fromCharCode(27)).map((piece) => piece.replace(/^\[\d+m/, '')).join('');
    check(false, `${label}: the journey could not be completed`, `${error.message.split('\n')[0]}${waitedFor ? ` (waiting for ${plain(waitedFor)})` : ''}`);
    mkdirSync(ARTIFACTS, { recursive: true });
    await screenshotKeepingTouch(pages.at(-1), { path: path.join(ARTIFACTS, `FAILED-${label.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: true }).catch(() => {});
  } finally {
    while (pages.length) await pages.pop().context().close().catch(() => {});
  }
};

const bodyText = (page) => page.evaluate(() => document.body.innerText);
// The tool's final action spends a try: under QuestionEngine it reads "Submit —
// uses 1 of 3 tries" (student pass 3, D9) where it once read "Check my work".
const button = (page, name) => (name === 'Check my work'
  ? page.getByRole('button', { name: /^Submit — / }).first()
  : page.getByRole('button', { name, exact: true }).first());
const press = async (page, name) => {
  await button(page, name).click();
  await settle(page, 350);
};
const choose = async (page, value) => {
  await page.locator(`button[data-choice="${value}"]:visible`).first().click();
  await settle(page, 200);
};
const cursor = (page) => page.locator('[data-cursor]').first().getAttribute('data-cursor');
const lastGrade = async (page) => (await page.evaluate(() => window.__mmGraded)).at(-1) || null;
const chips = (page) => page.locator('[data-boundary-point]:visible').allInnerTexts().then((texts) => texts.map((text) => text.replace('×', '').trim()));
const status = (page, index) => page.locator(`[data-constraint-index="${index}"] .mm-ineq-card-status-text`).innerText();

const GRAPH = 'svg[aria-label^="Student-constructed graph of the inequality system"]';
const BUILD = { xMin: -6, xMax: 8, yMin: -4, yMax: 10 };

/**
 * How much of the graph the student can see: inside the window, inside every
 * scrolling box around it, and above the sticky action bar.
 */
const graphOnScreen = (page, scope = '') => page.evaluate((selector) => {
  const svg = document.querySelector(selector);
  if (!svg) return 0;
  const rect = svg.getBoundingClientRect();
  let top = Math.max(rect.top, 0);
  let bottom = Math.min(rect.bottom, window.innerHeight);
  for (let element = svg.parentElement; element; element = element.parentElement) {
    if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(element).overflowY)) continue;
    const box = element.getBoundingClientRect();
    top = Math.max(top, box.top);
    bottom = Math.min(bottom, box.bottom);
  }
  const bar = document.querySelector('.mathmaster-desktop-action-bar, .portrait-action-bar, .landscape-action-bar');
  const barTop = bar ? bar.getBoundingClientRect().top : Infinity;
  if (barTop > top) bottom = Math.min(bottom, barTop);
  return Math.max(0, bottom - top) / rect.height;
}, `${scope}${GRAPH}`);

/** A tap where the student sees (x, y) — without scrolling for them. Returns how much of the graph was on screen. */
const tapAt = async (page, [x, y], bounds, { touch = false, scope = '' } = {}) => {
  const share = await graphOnScreen(page, scope);
  const at = await page.evaluate(([gx, gy, b, selector]) => {
    const svg = document.querySelector(selector);
    // CoordinatePlane draws into a 560×380 viewBox with 42 of padding.
    const point = svg.createSVGPoint();
    point.x = 42 + ((gx - b.xMin) / (b.xMax - b.xMin)) * (560 - 84);
    point.y = 380 - 42 - ((gy - b.yMin) / (b.yMax - b.yMin)) * (380 - 84);
    const screen = point.matrixTransform(svg.getScreenCTM());
    return [screen.x, screen.y];
  }, [x, y, bounds, `${scope}${GRAPH}`]);
  if (touch) {
    await page.touchscreen.tap(at[0], at[1]);
  } else {
    await page.mouse.move(at[0], at[1]);
    await page.mouse.down();
    await page.mouse.up();
  }
  await settle(page, 300);
  return share;
};

/* --------------------------------------------------------------- journey */

const fullJourney = async (label, { viewport, touch }) => {
  const page = await open('build', { viewport, touch });
  const shares = [];
  const tap = async (point) => shares.push(await tapAt(page, point, BUILD, { touch }));

  check(await cursor(page) === 'c0:boundary', `${label}: the question opens on constraint 1's boundary, ready for a tap — no button arms the graph`);
  // (0, 0) and (1, 0) are not on y = x + 1.
  await tap([0, 0]);
  await tap([1, 0]);
  check((await chips(page)).join(' | ') === 'Point 1 (0, 0) | Point 2 (1, 0)', `${label}: each tap plots the next boundary point`, (await chips(page)).join(' | '));
  await tap([3, 3]);
  check(/Both points are on the graph/.test(await bodyText(page)) && (await chips(page)).length === 2, `${label}: a third tap moves nothing, and says why`);
  await press(page, 'Check boundary');
  check(/Check whether the points you used satisfy the boundary equation\./.test(await bodyText(page)) && await cursor(page) === 'c0:boundary',
    `${label}: a wrong boundary is called out — neutrally on a first miss — and the student stays on it`);
  await button(page, 'Remove point 2 (1, 0)').click();
  await button(page, 'Remove point 1 (0, 0)').click();
  await settle(page, 200);
  await tap([0, 1]);
  await tap([2, 3]);
  check(!/Check whether the points you used/.test(await bodyText(page)), `${label}: the old line goes with the work it was about`);
  await press(page, 'Check boundary');
  check(await cursor(page) === 'c0:lineStyle', `${label}: a right boundary opens solid or dashed by itself`);

  await choose(page, 'dashed');
  await press(page, 'Check line style');
  check(/Check whether points on the boundary are included\./.test(await bodyText(page)) && await cursor(page) === 'c0:lineStyle',
    `${label}: a wrong line style is called out, and the student stays on it`);
  await choose(page, 'solid');
  await press(page, 'Check line style');
  check(await cursor(page) === 'c0:shading', `${label}: the right style opens the shading`);

  await tap([1, 2]);
  check(/That point is on the boundary line/.test(await bodyText(page)), `${label}: a shading tap on the line itself is explained, not taken`);
  await tap([0, -2]);
  await press(page, 'Check shading');
  check(/Use a test point or compare the inequality to its boundary\./.test(await bodyText(page)) && await cursor(page) === 'c0:shading',
    `${label}: the wrong side is called out, and the student stays on it`);
  await tap([0, 6]);
  await press(page, 'Check shading');
  check(await cursor(page) === 'c1:boundary' && await status(page, 0) === '✓ Done', `${label}: a finished constraint closes and the next one opens by itself`);

  await tap([0, 6]);
  await tap([4, 4]);
  await press(page, 'Check boundary');
  await choose(page, 'dashed');
  await press(page, 'Check line style');
  await tap([0, 0]);
  await press(page, 'Check shading');
  check(await cursor(page) === 'combine', `${label}: with every constraint right, combining is next`);
  await press(page, 'Find overlap / Combine regions');
  check(await cursor(page) === 'classify' && await page.locator('[data-overlap="true"]').count() === 1, `${label}: the overlap the student built is drawn, and the reasoning opens`);

  await choose(page, 'bounded');
  await press(page, 'Check classification');
  check(/Look at whether the shaded overlap/.test(await bodyText(page)) && await cursor(page) === 'classify', `${label}: a wrong classification is called out`);
  await choose(page, 'unbounded');
  await press(page, 'Check classification');
  check(await page.locator('.mm-ineq-submit').getAttribute('data-ready') === 'true', `${label}: everything done, Check my work is the next thing to press`);
  await press(page, 'Check my work');
  await settle(page, 600);
  const grade = await lastGrade(page);
  check(grade?.isCorrect === true && grade.partialCreditPercent === 100, `${label}: graded right`, JSON.stringify(grade && { isCorrect: grade.isCorrect, partial: grade.partialCreditPercent }));
  const least = Math.min(...shares);
  check(least >= 0.98, `${label}: the whole graph was on screen for every one of ${shares.length} taps`, `least ${Math.round(least * 100)}%`);
};

/* ---------------------------------------------------------------- reload */

const reload = async () => {
  const page = await open('build');
  const tap = (point) => tapAt(page, point, BUILD);
  await tap([0, 1]);
  await tap([2, 3]);
  await press(page, 'Check boundary');
  await choose(page, 'solid');
  await press(page, 'Check line style');
  await tap([0, 6]);
  await press(page, 'Check shading');
  await tap([0, 6]);
  await tap([4, 4]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-studio-fixture]').waitFor();
  await settle(page, 900);
  check(await cursor(page) === 'c1:boundary', 'reload: the student is back on the step they left');
  check((await chips(page)).join(' | ') === 'Point 1 (0, 6) | Point 2 (4, 4)', 'reload: the unchecked points are still placed', (await chips(page)).join(' | '));
  check(await status(page, 0) === '✓ Done', 'reload: the checked constraint is still checked');

  // A checked answer, changed, no longer counts until it is checked again.
  await page.locator('[data-constraint-index="0"] .mm-ineq-card-header').click();
  await settle(page, 300);
  check(await cursor(page) === 'c0', 'reload: a finished constraint opens as its summary');
  await button(page, 'Change solid or dashed for constraint 1').click();
  await settle(page, 300);
  await choose(page, 'dashed');
  check(await status(page, 0) !== '✓ Done' && /Locked until every constraint above is correct\./.test(await bodyText(page)), 'reload: a changed style is not counted as checked', await status(page, 0));
  await choose(page, 'solid');
  check(await status(page, 0) === '✓ Done', 'reload: changed back to the work that was checked, it counts again');
  await page.locator('[data-constraint-index="1"] .mm-ineq-card-header').click();
  await settle(page, 300);
  await press(page, 'Check boundary');
  await choose(page, 'dashed');
  await press(page, 'Check line style');
  await tapAt(page, [0, 0], BUILD);
  await press(page, 'Check shading');
  check(await cursor(page) === 'combine', 'reload: and the work carries on to the overlap');
};

/* -------------------------------------------------------------- keyboard */

// A graph worked from the keyboard: Tab brings it into focus, each arrow key moves
// its crosshair one unit, and Enter plots there (or picks up the point under the
// crosshair, and puts it down). The crosshair stays where it was left while the
// steps change beside it, so `at` follows it.
const keyboardPlane = (page, selector = GRAPH) => {
  const at = [0, 0];
  const focused = () => page.evaluate((query) => document.activeElement === document.querySelector(query), selector);
  const focus = async () => {
    // From the top of the page the graph is ahead; after a click on a step's control it is behind (it sits above the steps).
    const atTop = await page.evaluate(() => document.activeElement === document.body);
    for (const key of atTop ? ['Tab', 'Shift+Tab'] : ['Shift+Tab', 'Tab']) {
      for (let guard = 0; guard < 80 && !(await focused()); guard += 1) await page.keyboard.press(key);
    }
    return focused();
  };
  const move = async ([x, y]) => {
    for (const [axis, target, less, more] of [[0, x, 'ArrowLeft', 'ArrowRight'], [1, y, 'ArrowDown', 'ArrowUp']]) {
      while (at[axis] !== target) {
        await page.keyboard.press(at[axis] < target ? more : less);
        at[axis] += at[axis] < target ? 1 : -1;
      }
    }
  };
  const plot = async (point) => {
    if (!(await focus())) throw new Error('the graph cannot be reached with Tab');
    await move(point);
    await page.keyboard.press('Enter');
    await settle(page, 250);
  };
  return { focus, move, plot, focused };
};

const keyboard = async () => {
  const page = await open('build');
  const plane = keyboardPlane(page);
  const first = await bodyText(page);
  // AX32: the step beside the graph says what a tap does, so the graph's own line is
  // only the keyboard route — and it is there BEFORE the graph has focus. The step's
  // line gives both routes, and the point still to plot says what to do, not how.
  check(/From the keyboard, focus the grid and use the arrow keys and Enter\./.test(first), 'keyboard: the route is named before the graph has focus');
  check(/Click or tap the grid to plot two points on the boundary line, or focus the grid and use the arrow keys and Enter\./.test(first), 'keyboard: and the step beside it names the tap and the keys in one line');
  check((await chips(page)).join(' | ') === 'Point 1: plot it on the graph | Point 2: next', 'keyboard: the point still to plot says what to do, not how', (await chips(page)).join(' | '));
  check(await plane.focus(), 'keyboard: the graph is reached with Tab');
  check(/The arrow keys move the/.test(await bodyText(page)), 'keyboard: and says how to plot from the keyboard while it has focus');
  check(!/From the keyboard, focus the grid/.test(await bodyText(page)), 'keyboard: the fuller sentence takes the short line\'s place');
  // The crosshair starts at the origin; each arrow moves it one unit.
  await plane.plot([0, 1]);
  await plane.plot([2, 3]);
  check((await chips(page)).join(' | ') === 'Point 1 (0, 1) | Point 2 (2, 3)', 'keyboard: arrows and Enter plot both points', (await chips(page)).join(' | '));
  // A third Enter, on empty ground, plots nothing and says how a plotted point is moved: by a drag, and by keys.
  await plane.plot([4, 3]);
  const notice = await page.locator('p.mm-ineq-note[role="status"]').innerText();
  check(notice === 'Both points are on the graph. Drag a point to move it, or remove one with × and plot it again. From the keyboard, move the crosshair onto a point and press Enter to pick it up, use the arrow keys to move it, then press Enter to put it down.', 'keyboard: a third Enter moves nothing, and says how to move a point from the keyboard', notice);
  check((await chips(page)).length === 2, 'keyboard: and the two points stay as they were');
  // …and the keys it names do it. (3, 4) is on y = x + 1, so the boundary is still right.
  await plane.plot([2, 3]);
  await plane.move([3, 4]);
  await page.keyboard.press('Enter');
  await settle(page, 300);
  check((await chips(page)).join(' | ') === 'Point 1 (0, 1) | Point 2 (3, 4)', 'keyboard: Enter on a point picks it up, the arrows move it and Enter puts it down', (await chips(page)).join(' | '));
  check(!/Both points are on the graph/.test(await bodyText(page)), 'keyboard: and the notice goes with the move');
  await button(page, 'Check boundary').focus();
  await page.keyboard.press('Enter');
  await settle(page, 400);
  const focused = await page.evaluate(() => ({ heading: document.activeElement?.dataset?.stepHeading || '', text: document.activeElement?.textContent || '' }));
  check(focused.heading === 'current' && /Solid or dashed/.test(focused.text), 'keyboard: a passing Check hands focus to the step it opens', JSON.stringify(focused));
  // The shading step: its line names the tap and the keys, and a key shades a side.
  await choose(page, 'solid');
  await press(page, 'Check line style');
  check(await cursor(page) === 'c0:shading', 'keyboard: the right style opens the shading');
  check(/Click or tap the graph on the side of your boundary line that should be shaded, or focus the grid and use the arrow keys and Enter\./.test(await bodyText(page)), 'keyboard: its line names the tap and the keys');
  await plane.plot([2, 3]);
  check(/That point is on the boundary line\. Choose a point on the side you want to shade\./.test(await bodyText(page)), 'keyboard: a key on the boundary line itself is explained, not taken');
  await plane.plot([1, 6]);
  check(/Shaded the side with \(1, 6\)\. Choose a point on the other side to change it\./.test(await bodyText(page)), 'keyboard: a key above the line shades that side');
  await press(page, 'Check shading');
  check(await cursor(page) === 'c1:boundary' && await status(page, 0) === '✓ Done', 'keyboard: and a finished constraint closes and the next one opens');
};

/** The line the enlarged Work View gives the step the student is on, opened and shut again. */
const workViewLine = async (page) => {
  await page.getByRole('button', { name: /Open Work View/ }).first().click();
  await settle(page, 800);
  const dialog = page.getByRole('dialog').first();
  const said = await dialog.innerText();
  await dialog.getByRole('button', { name: /^Close/ }).first().click();
  await settle(page, 500);
  return said;
};

// The whole system, on the graph, by keys: every boundary from two grid points, its
// side, a test point of the student's own, then every corner of the region.
const keyboardReasoning = async () => {
  const page = await open('reasoning');
  const plane = keyboardPlane(page);
  for (const [index, { points, side }] of [
    { points: [[0, 0], [2, 1]], side: [2, 3] }, // y ≥ 0.5x, above
    { points: [[2, 4], [4, 2]], side: [2, 2] }, // y ≤ −x + 6, below
    { points: [[0, 0], [1, 2]], side: [3, 2] }, // y ≤ 2x, below
  ].entries()) {
    for (const point of points) await plane.plot(point);
    check((await chips(page)).length === 2, `keyboard: constraint ${index + 1}'s two boundary points are plotted`, (await chips(page)).join(' | '));
    await press(page, 'Check boundary');
    await choose(page, 'solid');
    await press(page, 'Check line style');
    await plane.plot(side);
    await press(page, 'Check shading');
  }
  check(await cursor(page) === 'combine', 'keyboard: three boundaries and their sides, plotted by keys, finish the constraints', await cursor(page));
  await press(page, 'Find overlap / Combine regions');
  await choose(page, 'bounded');
  await press(page, 'Check classification');
  check(await cursor(page) === 'studentPoint', 'keyboard: the region is classified, and the student\'s own test point is next', await cursor(page));

  // The test point: the line names the tap and the keys, and the same line says how to move it.
  check((await bodyText(page)).includes('Pick your own test point: click or tap anywhere on the graph, or focus the grid and use the arrow keys and Enter.'), 'keyboard: the test point step names the tap and the keys');
  check((await workViewLine(page)).includes('Click or tap the graph to place a test point of your own (or focus the grid and use the arrow keys and Enter), then test it.'), 'keyboard: and so does the enlarged view\'s header');
  await plane.plot([2, 2]);
  check((await bodyText(page)).includes('Your point: (2, 2). Click or tap the graph again to move it, or focus the grid and use the arrow keys and Enter.'), 'keyboard: Enter places the point, and the line says how to move it');
  await plane.plot([3, 2]);
  check((await bodyText(page)).includes('Your point: (3, 2). Click or tap the graph again to move it'), 'keyboard: the same keys move it');
  for (const question of ['inequality-1', 'inequality-2', 'inequality-3', 'system']) await page.locator(`[data-question="${question}"] button[data-choice="yes"]`).click();
  await press(page, 'Check this point');
  check(await cursor(page) === 'vertices', 'keyboard: the point is judged right, and the corners are next', await cursor(page));

  // The corners.
  check((await bodyText(page)).includes('Click or tap each point where two boundary lines meet at a corner of the solution region, or focus the grid and use the arrow keys and Enter. If the region has no corners'), 'keyboard: the corners step names the tap and the keys');
  check((await workViewLine(page)).includes('Click or tap each corner of the solution region (or focus the grid and use the arrow keys and Enter) and say whether it is included.'), 'keyboard: and so does the enlarged view\'s header');
  for (const corner of [[0, 0], [4, 2], [2, 4]]) await plane.plot(corner);
  check(await page.locator('[data-vertex]').count() === 3, 'keyboard: Enter on each corner marks it', `${await page.locator('[data-vertex]').count()} marked`);
  for (const index of [0, 1, 2]) await page.locator(`[data-question="vertex-${index}"] button[data-choice="yes"]`).click();
  await press(page, 'Check vertices');
  check(await page.locator('.mm-ineq-submit').getAttribute('data-ready') === 'true', 'keyboard: three corners marked and judged finish the work');
};

// The two construct forms plot into typed boxes: the same keys fill them.
const keyboardConstruct = async () => {
  for (const [label, fixture, graph, instruction, boxes] of [
    ['the inequality construct', 'construct', 'svg[aria-label^="Student-constructed graph of the inequality solution region"]',
      'Type two points on each boundary line, or plot them on the graph: click or tap it, or focus the grid and use the arrow keys and Enter. Then choose its style and the side to shade.',
      ['Boundary point 1: x', 'Boundary point 1: y', 'Boundary point 2: x', 'Boundary point 2: y']],
    ['the linear construct', 'linearConstruct', 'svg[aria-label^="Your graph of both equations in the system"]',
      'Type two points on each line, or plot them on the graph: click or tap it, or focus the grid and use the arrow keys and Enter. Use each equation to find its points.',
      ['Equation 1, point 1: x', 'Equation 1, point 1: y', 'Equation 1, point 2: x', 'Equation 1, point 2: y']],
  ]) {
    const page = await open(fixture);
    const plane = keyboardPlane(page, graph);
    const said = await bodyText(page);
    check(said.includes(instruction), `${label}: the line over the points names the tap and the keys`);
    check(said.includes('or plot it on the graph') && !/or tap the graph/.test(said), `${label}: the point still to plot says what to do, not how`);
    // Two points on the first line: (0, −3) and (2, 1) for y = 2x − 3; (0, −1) and (1, 1) for y = 2x − 1.
    const points = fixture === 'construct' ? [[0, -3], [2, 1]] : [[0, -1], [1, 1]];
    for (const point of points) await plane.plot(point);
    // (The first inequality's boxes: each card repeats the same labels.)
    const typed = [];
    for (const name of boxes) typed.push(await page.getByLabel(name, { exact: true }).first().inputValue());
    check(typed.join(' | ') === points.flat().join(' | '), `${label}: Tab, the arrow keys and Enter fill the boxes`, typed.join(' | '));
  }
};

/* --------------------------------------------------------------- rewrite */

// TL34 (finding A2-55): the relation solver is the absolute-value lessons'
// workspace, where cancelling is taught; inside this step it is extra reading
// (a "Cancellation hints" toggle, a sentence about clicking two items, a
// tooltip on a cancellable term). The terms still take the click: the journey
// below cancels a pair by hand.
const noCancellationTeaching = async (page, where) => {
  const text = await page.locator('.mm-ineq-rewrite').innerText();
  check(!/Cancellation/i.test(text), `${where}: the solver teaches no cancelling (no hints toggle, no sentence)`, text.match(/[^.\n]*Cancellation[^.\n]*/i)?.[0] || '');
  check(!(await page.locator('.mm-ineq-rewrite [title*="cancelled"]').count()), `${where}: and no term says it can be cancelled`);
  check(await page.locator('.mm-ineq-rewrite button:visible').filter({ hasText: /^Simplify$/ }).count() === 1, `${where}: Simplify is still there`);
};
// Nothing sticks out sideways: every control of the step is inside the screen.
const rewriteFits = async (page, where) => {
  const overflow = await page.evaluate(() => {
    const edge = document.documentElement.clientWidth;
    return [...document.querySelectorAll('.mm-ineq-rewrite button')]
      .filter((el) => el.getClientRects().length)
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.right > edge + 1 || rect.left < -1).length;
  });
  check(overflow === 0, `${where}: every control of the rewrite is inside the screen`, `${overflow} outside`);
};

const rewrite = async ({ viewport = CHROMEBOOK, touch = false } = {}) => {
  const where = touch ? 'rewrite (phone)' : 'rewrite';
  const page = await open('rewrite', { viewport, touch });
  check(await cursor(page) === 'c0:rewrite', `${where}: the question opens on rewriting constraint 1`);
  const label = () => page.locator(GRAPH).getAttribute('aria-label');
  check(!/Click to plot/.test(await label()), `${where}: the graph takes no taps while y is not alone`, await label());
  check(!(await page.locator('button:visible').filter({ hasText: /^No solution$/ }).count()), `${where}: the solver's other operations start folded away`);
  await noCancellationTeaching(page, where);
  await rewriteFits(page, where);
  await balanced(page, 'subtract', 'x');
  // The pair to cancel is on the board now: this is where the tooltip would be.
  await noCancellationTeaching(page, `${where}, with a pair to cancel`);
  await cancelPair(page, 'left', 0, 2);
  await balanced(page, 'divide', '-1');
  check(await cursor(page) === 'c0:rewrite', `${where}: dividing by −1 is not finished until the student updates the relation`);
  await page.getByRole('button', { name: 'Choose relation symbol' }).click();
  await settle(page, 300);
  await page.locator('.mm-ineq-rewrite button:visible').filter({ hasText: /^≤$/ }).last().click();
  await settle(page, 800);
  check(await cursor(page) === 'c0:boundary', `${where}: y alone opens the boundary step by itself`);
  check((await page.locator('[data-constraint-index="0"] .mm-ineq-math').innerText()).trim() === 'y ≤ x + 1', `${where}: the constraint is now written in the form the student reached`);
  check(/Plot boundary point 1 for constraint 1/.test(await label()), `${where}: and the graph takes the first boundary point`, await label());
};

/* -------------------------------------------------------------- workview */

const workview = async () => {
  const page = await open('build');
  await page.getByRole('button', { name: /Open Work View/ }).first().click();
  await settle(page, 1000);
  const dialog = page.getByRole('dialog').first();
  check((await dialog.innerText()).includes('Constraint 1: click or tap the grid to plot two points on the boundary line, or focus the grid and use the arrow keys and Enter.'), 'workview: the enlarged view says what the graph is waiting for, with the keys');
  const scope = '[role="dialog"] ';
  await tapAt(page, [0, 1], BUILD, { scope });
  await tapAt(page, [2, 3], BUILD, { scope });
  await dialog.getByRole('button', { name: 'Check boundary', exact: true }).click();
  await settle(page, 400);
  check((await dialog.innerText()).includes('Constraint 1: is the boundary line solid or dashed?'), 'workview: and moves on with the student');
  await dialog.getByRole('button', { name: /^Close/ }).first().click();
  await settle(page, 600);
  check(await cursor(page) === 'c0:lineStyle' && /Through \(0, 1\) and \(2, 3\)/.test(await bodyText(page)), 'workview: the work done there is the work on the page');
};

/* -------------------------------------------------------------- contrast */

const lowContrast = (page) => page.evaluate(() => {
  const channels = (color) => (color.match(/[\d.]+/g) || []).map(Number);
  const luminance = ([r, g, b]) => [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const background = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const value = channels(getComputedStyle(node).backgroundColor);
      if (value.length === 3 || (value.length === 4 && value[3] >= 0.9)) return value;
    }
    return [255, 255, 255];
  };
  const low = [];
  for (const element of document.querySelectorAll('.mm-ineq-side *')) {
    const ownText = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
    if (!ownText || !element.getClientRects().length) continue;
    if (element.closest('.mm-ineq-visually-hidden, [disabled], [aria-hidden="true"]')) continue;
    const style = getComputedStyle(element);
    const [l1, l2] = [luminance(channels(style.color)), luminance(background(element))].sort((a, b) => b - a);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) low.push(`"${element.textContent.trim().slice(0, 40)}" ${ratio.toFixed(2)}`);
  }
  return low;
});

const contrast = async (theme) => {
  const page = await open('build', { theme });
  const states = [];
  states.push(['the first step', await lowContrast(page)]);
  await tapAt(page, [0, 1], BUILD);
  await tapAt(page, [2, 3], BUILD);
  await press(page, 'Check boundary');
  await choose(page, 'dashed');
  await press(page, 'Check line style');
  states.push(['a step called out', await lowContrast(page)]);
  for (const [state, low] of states) check(low.length === 0, `contrast (${theme}): ${state} reads at 4.5:1 or better`, low.join('; '));
};

/* ------------------------------------------------------------------- run */

const SCENARIOS = {
  journey: () => scenario('journey', () => fullJourney('journey', { viewport: CHROMEBOOK, touch: false })),
  phone: () => scenario('phone', () => fullJourney('phone', { viewport: PHONE, touch: true })),
  reload: () => scenario('reload', reload),
  keyboard: () => scenario('keyboard', keyboard),
  keyboardReasoning: () => scenario('keyboardReasoning', keyboardReasoning),
  keyboardConstruct: () => scenario('keyboardConstruct', keyboardConstruct),
  rewrite: () => scenario('rewrite', () => rewrite()),
  rewritePhone: () => scenario('rewritePhone', () => rewrite({ viewport: PHONE, touch: true })),
  workview: () => scenario('workview', workview),
  contrast: async () => {
    await scenario('contrast light', () => contrast('light'));
    await scenario('contrast dark', () => contrast('dark'));
  },
};

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
for (const name of requested.length ? requested : Object.keys(SCENARIOS)) {
  if (!SCENARIOS[name]) {
    console.log(`Unknown scenario ${name}`);
    failures.push(`unknown scenario ${name}`);
    continue;
  }
  surface = name;
  console.log(`\n== ${name}`);
  await SCENARIOS[name]();
}
await browser.close();

console.log(`\n${'scenario'.padEnd(20)} ok  fail`);
Object.entries(tally).forEach(([name, { ok, fail }]) => console.log(`${name.padEnd(20)} ${String(ok).padStart(2)}  ${String(fail).padStart(4)}`));
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n${failures.map((failure) => `  - ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log('\nEvery step is the student\'s to do and to check; none of it takes hunting for.');
