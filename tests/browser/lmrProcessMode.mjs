// PROCESS MODE ON THE MULTIPLE REPRESENTATIONS BOARD, DONE AS A STUDENT DOES IT.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/lmrProcessMode.mjs [journey ...]
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// Process Mode boards for every GIVEN kind (lmrProcessModeMain.jsx), compiled
// through the teacher import chain and mounted in the real QuestionEngine.
// Driven only through rendered controls: typing into MathLive fields, tapping
// chips, rows and the grid, operating the embedded Step Algebra workspace,
// pressing Enter and Escape, reloading. The only thing read back from storage
// is the saved draft, to prove what was recorded and what survived a reload.
//
//   recognition        y = −x + 4 (laptop): "−x" and "0" are named for what they
//                      are; a right slope beside a wrong b is kept while b is
//                      fixed; the facts open the cards; a known point is plotted
//                      in one tap.
//   standard           2x − 4y = 12 (laptop): both intercepts by substituting 0
//                      and solving in Step Algebra, then the slope formula on the
//                      student's own intercepts; every card opens; a reload keeps
//                      every fact.
//   point-slope        y − 2 = −1(x − 3) (laptop): solved for y in Step Algebra,
//                      reloaded mid-solve, finished, then m and b read from the
//                      student's own equation, which fills slope-intercept form.
//   table              The table (iPad, touch): Δy/Δx with a sign slip first, the
//                      pattern extended to each axis, a row taken as a point.
//   graph              The graph (laptop): a crossing picked wrong then right,
//                      rise over run with its legs drawn, the workspace enlarged.
//   phone              The tank (390×844, touch): the situation read, the
//                      x-intercept worked out in Step Algebra; no sideways scroll
//                      anywhere; enlarge and Back to board return focus.
//   keyboard           Find, choose a method, type, Check and go back — by
//                      keyboard alone.
//   dol                Outcomes withheld: Save, never Check; no verdict, no
//                      colour, no redirect; a wrong intercept is saved as written
//                      and can be changed; one submission, graded.
//   family             The family-backed assignment (?family=1): this student's
//                      own version of a Process Mode slot, its facts read from
//                      that version's line; the candle board stays a Worksheet
//                      board.
//
// Exit code 1 on any finding. Screenshots: tests/browser/artifacts/lmrProcessMode/.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  balancedMove,
  cancelFactor,
  cancelTerm,
  closeInlineModes,
  combineLikeTerms,
  distribute,
  mathState,
  rewriteTerm,
  setMathField,
  simplifySide,
} from './stepAlgebraDriver.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const ARTIFACTS = process.env.ARTIFACTS_DIR || path.join(ROOT, 'tests/browser/artifacts/lmrProcessMode');
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PLAYWRIGHT_MODULE);
const { sanitizeWorkspaceDraftValue } = await import(path.join(ROOT, 'functions/shared/workspaceDraftSchema.mjs'));
const { deriveLinearMultipleRepresentations } = await import(path.join(ROOT, 'functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs'));

const LAPTOP = { width: 1366, height: 900 };
const IPAD = { width: 820, height: 1180 };
const PHONE = { width: 390, height: 844 };

const findings = [];
const notes = [];
let journeyName = '';
const check = (value, message) => {
  if (!value) findings.push(`[${journeyName}] ${message}`);
  return Boolean(value);
};
const note = (message) => notes.push(`[${journeyName}] ${message}`);
const settle = (page, ms = 350) => page.waitForTimeout(ms);

mkdirSync(ARTIFACTS, { recursive: true });
const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);

// ------------------------------------------------------------------ helpers

const open = async (viewport, questionId, { touch = false, family = false, run = `${Date.now()}` } = {}) => {
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch && viewport.width < 600, deviceScaleFactor: touch ? 2 : 1 });
  const page = await context.newPage();
  page.on('pageerror', (error) => findings.push(`[${journeyName}] page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Download the React DevTools|favicon/.test(message.text())) findings.push(`[${journeyName}] console error: ${message.text().slice(0, 300)}`);
  });
  await page.goto(`${ORIGIN}/tests/browser/lmrProcessMode.html?q=${questionId}&run=${run}${family ? '&family=1' : ''}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.mm-lmr-board', { timeout: 30000 });
  await settle(page, 900);
  return { context, page };
};
const shot = async (target, name) => {
  await target.screenshot({ path: path.join(ARTIFACTS, `${journeyName}-${name}.png`) });
};
const workspace = (page) => page.locator('[data-lmr-card="process"]');
const strip = (page) => page.locator('[data-process-facts]');
const press = async (page, locator, touch) => {
  await locator.scrollIntoViewIfNeeded();
  if (touch) await locator.tap();
  else await locator.click();
  await settle(page, 250);
};
const find = async (page, fact, { touch = false } = {}) => {
  await press(page, strip(page).locator(`[data-process-find="${fact}"]`), touch);
  await workspace(page).waitFor({ timeout: 5000 });
  await settle(page, 400);
};
const chooseMethod = async (page, strategy, { touch = false } = {}) => {
  await press(page, workspace(page).locator(`[data-process-choice="method:${strategy}"]`), touch);
  await settle(page, 500);
};
const field = (page, name) => workspace(page).locator(`[data-process-field="${name}"] math-field`);
const type = (page, name, value) => setMathField(page, field(page, name), value);
const checkWork = async (page, { touch = false } = {}) => {
  await press(page, workspace(page).locator('[data-card-check="true"]'), touch);
  await settle(page, 700);
};
const message = async (page) => ((await workspace(page).count()) ? (await workspace(page).locator('p[role="status"]').allInnerTexts()).join(' ') : '');
const notice = async (page) => (await strip(page).locator('p[role="status"]').allInnerTexts()).join(' ');
const work = (page, questionId) => page.evaluate((id) => window.__pm.work(id), questionId);
const lockedCards = (page) => page.$$eval('[data-process-locked]', (elements) => elements.map((element) => element.getAttribute('data-process-locked')));
// What sticks out past the screen's right edge where a student would see it:
// content inside a container that clips or scrolls it (the screen-reader-only
// live region, Step Algebra's own equation strip) is not on the page.
const overflow = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const root = document.querySelector('.mathmaster-tool-shell');
  const contained = (element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      if (/hidden|auto|scroll|clip/.test(getComputedStyle(node).overflowX) && node.getBoundingClientRect().right <= vw + 1) return true;
    }
    return false;
  };
  const offenders = [...(root?.querySelectorAll('*') || [])]
    .filter((element) => { const box = element.getBoundingClientRect(); return box.width > 0 && box.right > vw + 1 && getComputedStyle(element).position !== 'fixed' && !contained(element); })
    .slice(0, 5).map((element) => `${element.tagName.toLowerCase()} right=${Math.round(element.getBoundingClientRect().right)}`);
  return { vw, docScroll: document.documentElement.scrollWidth, offenders };
});
const noSidewaysScroll = async (page, where) => {
  const result = await overflow(page);
  check(result.docScroll <= result.vw + 1 && !result.offenders.length, `${where}: sideways scroll (${JSON.stringify(result)})`);
};

// The GIVEN plane in the workspace, aimed at by coordinates as a student aims by sight.
const planeGeometry = async (page) => {
  const wrap = workspace(page).locator('[data-process-plane]').first();
  await wrap.scrollIntoViewIfNeeded();
  const [xMin, xMax, yMin, yMax] = (await wrap.getAttribute('data-bounds')).split(',').map(Number);
  const svg = wrap.locator('svg').first();
  const box = await svg.boundingBox();
  const [, , width, height] = (await svg.getAttribute('viewBox')).split(/\s+/).map(Number);
  return { xMin, xMax, yMin, yMax, box, width, height };
};
const pick = async (page, [x, y], { touch = false } = {}) => {
  const g = await planeGeometry(page);
  const pad = 42;
  const vx = pad + ((x - g.xMin) / (g.xMax - g.xMin)) * (g.width - pad * 2);
  const vy = g.height - pad - ((y - g.yMin) / (g.yMax - g.yMin)) * (g.height - pad * 2);
  const at = { x: g.box.x + (vx * g.box.width) / g.width, y: g.box.y + (vy * g.box.height) / g.height };
  if (touch) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await settle(page, 300);
};

// Step Algebra inside the workspace: solve a·v = c to v = c/a.
const divideAndSimplify = async (page, divisor, simplified, side = 'right') => {
  const host = workspace(page);
  await balancedMove(page, host, 'Divide by', divisor);
  if (await host.locator('[aria-label$="mark this factor for cancellation"]').count()) await cancelFactor(page, host);
  await settle(page, 400);
  if (await host.locator(`math-field[aria-label="${side === 'right' ? 'Right' : 'Left'} side: enter your simplification"]`).count()) await simplifySide(page, host, side, simplified);
  await settle(page, 600);
};

const recordShape = async (page, questionId) => {
  const record = await work(page, questionId);
  const sanitized = sanitizeWorkspaceDraftValue(record || {});
  check(sanitized.ok, `the saved board record is refused by the sync: ${sanitized.reason}`);
  return record;
};

// ---------------------------------------------------------------- journeys

const journeys = {
  async recognition() {
    const { context, page } = await open(LAPTOP, 'pm-slope-intercept');
    check((await lockedCards(page)).includes('graphSlopeIntercept'), 'Graph 2 starts locked');
    await find(page, 'slope');
    // One way to find it here, so it opens on it; the GIVEN stays in sight.
    check(await workspace(page).locator('[data-process-method="readSlopeIntercept@given"]').count(), 'reading m and b is the method');
    await type(page, 'm', '-x');
    await checkWork(page);
    check(/coefficient of x/.test(await message(page)), `"−x" is named as the x-term: ${await message(page)}`);
    await type(page, 'm', '0');
    await checkWork(page);
    check(/still has a coefficient/.test(await message(page)), `"0" is named: ${await message(page)}`);
    await type(page, 'm', '-1');
    await type(page, 'b', '-4');
    await checkWork(page);
    check(await workspace(page).count(), 'the workspace stays open on the wrong b');
    check(/Keep the sign/.test(await message(page)), `b's sign is named: ${await message(page)}`);
    check(/Slope: -1/.test(await notice(page)), `the right slope is kept: ${await notice(page)}`);
    await shot(workspace(page), 'partial');
    await type(page, 'b', '4');
    await checkWork(page);
    check(!(await workspace(page).count()), 'established, the workspace returns to the board');
    check(await page.evaluate(() => document.activeElement?.closest?.('[data-process-facts]') !== null), 'focus returns to the facts');
    check(/Now open: .*Graph 2/.test(await notice(page)), `the cards it opened are named: ${await notice(page)}`);
    check(!(await lockedCards(page)).includes('graphSlopeIntercept'), 'Graph 2 is open');
    const log = (await recordShape(page, 'pm-slope-intercept')).processLog;
    check(log?.entries?.length === 1 && log.entries[0].tries === 4, `one entry, four tries: ${JSON.stringify(log?.entries?.map((entry) => entry.tries))}`);
    // Reuse: the y-intercept plotted on Graph 2 in one tap.
    const graph2 = page.locator('[data-lmr-card="graphSlopeIntercept"]');
    await press(page, graph2.locator('[data-process-reuse] button').first());
    const points = (await work(page, 'pm-slope-intercept')).graph2Points;
    check(JSON.stringify(points) === '[[0,4]]', `the y-intercept is plotted: ${JSON.stringify(points)}`);
    await shot(page, 'board');
    await context.close();
  },

  async standard() {
    const { context, page } = await open(LAPTOP, 'pm-standard');
    check((await lockedCards(page)).length === 6, `six cards wait for facts: ${await lockedCards(page)}`);
    await shot(page, 'locked');
    // The slope first: only Solve for y is available now; the slope formula is
    // named as the way that needs two points.
    await find(page, 'slope');
    check(/Slope formula \(needs two points on the line\)/.test(await workspace(page).locator('[data-process-later]').innerText()), 'the method that needs more is named, not offered');
    await settle(page, 800);
    await shot(workspace(page), 'workspace-solve-for-y');
    await press(page, workspace(page).locator('[data-process-close]'));
    await find(page, 'xIntercept');
    await chooseMethod(page, 'substituteZero');
    await press(page, workspace(page).locator('[data-process-choice="zero:x"]'));
    check(/same y-coordinate/.test(await message(page)), 'substituting into the wrong variable is redirected at once (guided)');
    await press(page, workspace(page).locator('[data-process-choice="zero:y"]'));
    await settle(page, 1200);
    check(/2~?\s*x\s*=\s*12/.test(await mathState(workspace(page))), `Step Algebra opens on 2x = 12: ${await mathState(workspace(page))}`);
    await divideAndSimplify(page, '2', '6');
    await type(page, 'point', '(6, 0)');
    await checkWork(page);
    check(/x-intercept: \(6, 0\)/.test(await notice(page)), `x-intercept established: ${await notice(page)}`);
    await find(page, 'yIntercept');
    await chooseMethod(page, 'substituteZero');
    await press(page, workspace(page).locator('[data-process-choice="zero:x"]'));
    await settle(page, 1200);
    await divideAndSimplify(page, '-4', '-3');
    await type(page, 'point', '(0, -3)');
    await checkWork(page);
    check(/y-intercept: \(0, -3\)/.test(await notice(page)), `y-intercept established: ${await notice(page)}`);
    // The slope from the student's own two intercepts.
    await find(page, 'slope');
    await chooseMethod(page, 'twoPointFormula');
    await press(page, workspace(page).locator('[data-process-point="yIntercept"]'));
    await press(page, workspace(page).locator('[data-process-point="xIntercept"]'));
    for (const [name, value] of [['y2', '0'], ['y1', '-3'], ['x2', '6'], ['x1', '0'], ['m', '1/2']]) await type(page, name, value);
    await checkWork(page);
    check(/Slope: 1\/2/.test(await notice(page)), `slope established from the intercepts: ${await notice(page)}`);
    check((await lockedCards(page)).length === 0, `every card is open: ${await lockedCards(page)}`);
    await shot(page, 'all-open');
    // A reload keeps every fact.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.mm-lmr-board');
    await settle(page, 1200);
    for (const fact of ['slope', 'yIntercept', 'xIntercept']) check(await strip(page).locator(`[data-process-fact="${fact}"]`).count(), `${fact} survives a reload`);
    check((await lockedCards(page)).length === 0, 'the cards stay open after a reload');
    await recordShape(page, 'pm-standard');
    await context.close();
  },

  async 'point-slope'() {
    const { context, page } = await open(LAPTOP, 'pm-point-slope');
    await find(page, 'slope');
    await chooseMethod(page, 'solveForY');
    await settle(page, 1000);
    const host = workspace(page);
    await distribute(page, host);
    // Reload in the middle of the algebra: the workspace and its steps come back.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.mm-lmr-board');
    await settle(page, 1500);
    check(await workspace(page).count(), 'the workspace is still open after a reload');
    check(/\\left\(-1\\right\)/.test(await mathState(workspace(page))), `the distributed step survived: ${await mathState(workspace(page))}`);
    await balancedMove(page, workspace(page), 'Add', '2');
    await cancelTerm(page, workspace(page), '- 2');
    await rewriteTerm(page, workspace(page), 'right', /3/, '3');
    await closeInlineModes(page, workspace(page));
    await combineLikeTerms(page, workspace(page), 'right', [1, 2], '5');
    await closeInlineModes(page, workspace(page));
    if (/-1~ x/.test(await mathState(workspace(page)))) {
      await rewriteTerm(page, workspace(page), 'right', /x/, '-x');
      await closeInlineModes(page, workspace(page));
    }
    await shot(workspace(page), 'solved');
    // Reload with the algebra finished but not yet checked: the restored
    // equation is the one Check marks.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.mm-lmr-board');
    await settle(page, 1500);
    check(/y\s*=\s*-\s*x\s*\+\s*5/.test(await mathState(workspace(page))), `the finished equation survived: ${await mathState(workspace(page))}`);
    await checkWork(page);
    check(/read the slope and y-intercept from it/.test(await message(page)), `the next step of the pathway opens: ${await message(page)}`);
    check(await workspace(page).locator('[data-process-method="readSlopeIntercept@siEquation"]').count(), 'reading m and b from their own equation');
    await type(page, 'm', '-1');
    await type(page, 'b', '5');
    await checkWork(page);
    check(/Slope: -1 · y-intercept: \(0, 5\)/.test(await notice(page)), `both facts from their own equation: ${await notice(page)}`);
    const card = page.locator('[data-lmr-card="slopeIntercept"]');
    await press(page, card.getByRole('button', { name: 'Use your equation' }));
    await press(page, card.locator('[data-card-check="true"]'));
    check(await card.locator('text=✓ Correct').count(), 'their own equation is a correct slope-intercept form');
    const log = (await recordShape(page, 'pm-point-slope')).processLog;
    const solve = log.entries.find((entry) => entry.strategy === 'solveForY');
    check(solve?.ev?.steps?.length >= 3, `the intermediate equations are recorded: ${JSON.stringify(solve?.ev?.steps)}`);
    await context.close();
  },

  async table() {
    const { context, page } = await open(IPAD, 'pm-table', { touch: true });
    const touch = { touch: true };
    await find(page, 'slope', touch);
    await press(page, workspace(page).locator('[data-process-row="0"]'), true);
    await press(page, workspace(page).locator('[data-process-row="2"]'), true);
    await type(page, 'dy', '-4');
    await type(page, 'dx', '2');
    await type(page, 'm', '-2');
    await checkWork(page, touch);
    check(/Check the sign/.test(await message(page)), `Δy's sign is named: ${await message(page)}`);
    await type(page, 'dy', '4');
    await type(page, 'm', '2');
    await checkWork(page, touch);
    check(/Slope: 2/.test(await notice(page)), `slope established: ${await notice(page)}`);
    await find(page, 'yIntercept', touch);
    await chooseMethod(page, 'extendTable', touch);
    await page.locator('[data-process-extend="0:x"]').fill('0');
    await page.locator('[data-process-extend="0:y"]').fill('-3');
    await checkWork(page, touch);
    check(/y-intercept: \(0, -3\)/.test(await notice(page)), `y-intercept by extending the table: ${await notice(page)}`);
    await find(page, 'xIntercept', touch);
    await chooseMethod(page, 'extendTable', touch);
    await page.locator('[data-process-extend="0:x"]').fill('3/2');
    await page.locator('[data-process-extend="0:y"]').fill('0');
    await checkWork(page, touch);
    check(/x-intercept: \(3\/2, 0\)/.test(await notice(page)), `x-intercept kept exact: ${await notice(page)}`);
    await noSidewaysScroll(page, 'iPad board');
    await shot(page, 'board');
    await context.close();
  },

  async graph() {
    const { context, page } = await open(LAPTOP, 'pm-graph');
    await find(page, 'yIntercept');
    await pick(page, [3, -1]);
    await checkWork(page);
    check(/not on the y-axis/.test(await message(page)), `a point on the line but off the axis is named: ${await message(page)}`);
    await pick(page, [0, 1]);
    await checkWork(page);
    check(/y-intercept: \(0, 1\)/.test(await notice(page)), `crossing established: ${await notice(page)}`);
    await find(page, 'slope');
    await chooseMethod(page, 'riseRun');
    await pick(page, [0, 1]);
    await pick(page, [3, -1]);
    await type(page, 'run', '3');
    await type(page, 'rise', '2');
    await type(page, 'm', '2/3');
    await checkWork(page);
    check(/moving down is negative/.test(await message(page)), `the rise's direction is named: ${await message(page)}`);
    await shot(workspace(page), 'rise-run');
    await press(page, workspace(page).locator('[data-process-enlarge]'));
    check((await workspace(page).getAttribute('role')) === 'dialog', 'enlarged, the workspace is a dialog');
    await shot(page, 'enlarged');
    await page.keyboard.press('Escape');
    await settle(page);
    check((await workspace(page).getAttribute('role')) === 'region', 'Escape returns it to the board');
    await type(page, 'rise', '-2');
    await type(page, 'm', '-2/3');
    await checkWork(page);
    check(/Slope: -2\/3/.test(await notice(page)), `slope by rise over run: ${await notice(page)}`);
    await context.close();
  },

  async phone() {
    const { context, page } = await open(PHONE, 'pm-scenario', { touch: true });
    const touch = { touch: true };
    await noSidewaysScroll(page, 'phone board');
    await find(page, 'slope', touch);
    await noSidewaysScroll(page, 'phone workspace');
    await type(page, 'rate', '-3');
    await type(page, 'start', '24');
    await checkWork(page, touch);
    check(/Rate of change: -3 · Initial value: 24/.test(await notice(page)), `the situation read: ${await notice(page)}`);
    await find(page, 'xIntercept', touch);
    await press(page, workspace(page).locator('[data-process-choice="zero:y"]'), true);
    await settle(page, 1200);
    const host = workspace(page);
    await balancedMove(page, host, 'Subtract', '24');
    await cancelTerm(page, host, '+ 24');
    await simplifySide(page, host, 'left', '-24');
    await divideAndSimplify(page, '-3', '8', 'left');
    await noSidewaysScroll(page, 'phone Step Algebra');
    await shot(page, 'algebra');
    await type(page, 'point', '(8, 0)');
    await checkWork(page, touch);
    check(/x-intercept: \(8, 0\)/.test(await notice(page)), `x-intercept from the student's own facts: ${await notice(page)}`);
    await find(page, 'point', touch);
    await press(page, workspace(page).locator('[data-process-enlarge]'), true);
    await noSidewaysScroll(page, 'phone enlarged');
    await shot(page, 'enlarged');
    await press(page, workspace(page).locator('[data-process-close]'), true);
    check(await page.evaluate(() => document.activeElement?.getAttribute('data-process-find') === 'point'), 'Back to board returns to the Find button');
    await shot(page, 'board');
    await context.close();
  },

  async keyboard() {
    const { context, page } = await open(LAPTOP, 'pm-fraction');
    await strip(page).locator('[data-process-find="slope"]').focus();
    await page.keyboard.press('Enter');
    await settle(page, 600);
    check(await workspace(page).count(), 'Enter on "Find the slope" opens the workspace');
    check(await page.evaluate(() => document.activeElement?.getAttribute('data-lmr-card') === 'process'), 'focus moves to the workspace');
    await field(page, 'm').focus();
    await page.keyboard.type('-0.75', { delay: 20 });
    await page.keyboard.press('Enter');
    await settle(page, 700);
    check(/Slope: -3\/4/.test(await notice(page)), `Enter checks, and the slope stays exact: ${await notice(page)}`);
    check(await page.evaluate(() => Boolean(document.activeElement?.closest?.('[data-process-facts]'))), 'focus returns to "What I know"');
    // Keyboard through a locked card's Find and back.
    const findPoint = page.locator('[data-process-locked="pointSlope"] [data-process-find="point"]');
    await findPoint.focus();
    await page.keyboard.press('Enter');
    await settle(page, 500);
    await workspace(page).locator('[data-process-close]').focus();
    await page.keyboard.press('Enter');
    await settle(page, 500);
    check(await page.evaluate(() => document.activeElement?.closest?.('[data-process-locked="pointSlope"]') !== null), 'Back to board returns focus to the card it came from');
    await context.close();
  },

  async dol() {
    const { context, page } = await open(LAPTOP, 'pm-dol');
    check(!(await page.locator('[data-lmr-card]:not([data-lmr-card="process"]) [data-card-check="true"]').count()), 'no Check anywhere on the board');
    await find(page, 'xIntercept');
    check((await workspace(page).locator('[data-card-check="true"]').innerText()).trim() === 'Save', 'the workspace saves; it does not check');
    await press(page, workspace(page).locator('[data-process-choice="zero:x"]'));
    check(!(await message(page)), 'no redirect where outcomes are withheld');
    await settle(page, 1200);
    await divideAndSimplify(page, '2', '3');
    await type(page, 'point', '(0, 3');
    await checkWork(page);
    check(/ordered pair/.test(await message(page)), 'an unreadable pair is the one thing said');
    await type(page, 'point', '(0, 3)');
    await checkWork(page);
    check(/Saved — x-intercept: \(0, 3\)/.test(await notice(page)), `saved as written: ${await notice(page)}`);
    check(!(await page.locator('text=✓').count()), 'no tick anywhere: nothing says whether it is right');
    await shot(strip(page), 'saved');
    check(await strip(page).getByRole('button', { name: 'Change x-intercept' }).count(), 'a saved fact can be changed');
    await page.getByRole('button', { name: 'Submit board' }).click();
    await settle(page);
    await page.getByRole('button', { name: 'Submit anyway' }).click();
    await settle(page, 1500);
    const grades = await page.evaluate(() => window.__pm.grades());
    check(grades.length === 1, `one submission: ${grades.length}`);
    const xPart = grades[0]?.parts?.find((part) => part.id === 'xIntercept');
    check(xPart && xPart.isCorrect === false && /substituted 0 and solved/.test(xPart.response), `the saved intercept is graded, with its method: ${JSON.stringify(xPart)}`);
    await context.close();
  },

  async family() {
    const { context, page } = await open(LAPTOP, 'lmr-cw-2', { family: true });
    const version = await page.evaluate(() => window.__pm.delivered('lmr-cw-2'));
    const facts = deriveLinearMultipleRepresentations(version);
    const text = ({ n, d }) => (d === 1 ? String(n) : `${n}/${d}`);
    check(version.interactionMode === 'process', 'the generated version is a Process Mode board');
    await find(page, 'slope');
    await type(page, 'm', text(facts.slopeFraction));
    await type(page, 'b', text(facts.yInterceptFraction));
    await checkWork(page);
    check(new RegExp(`Slope: ${text(facts.slopeFraction).replace('/', '\\/')}`).test(await notice(page)), `this student's own line: ${await notice(page)}`);
    const log = (await work(page, 'lmr-cw-2')).processLog;
    check(/^lmr1-[0-9a-f]{16}$/.test(log?.bind || ''), 'the process is bound to this version');
    await page.locator('[data-nav="lmr-pr-2"]').click();
    await settle(page, 1500);
    check(!(await strip(page).count()), 'the candle board is a Worksheet board: no facts strip');
    check(await page.locator('[data-lmr-card="slope"] math-field').count(), 'its key features are typed, as they always were');
    await shot(page, 'worksheet-unchanged');
    await context.close();
  },
};

const selected = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(journeys);
for (const name of selected) {
  journeyName = name;
  const started = Date.now();
  try {
    await journeys[name]();
  } catch (error) {
    findings.push(`[${name}] threw: ${error.message.split('\n')[0]}`);
  }
  note(`${Math.round((Date.now() - started) / 1000)}s`);
}
await browser.close();

writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify({ findings, notes }, null, 2));
console.log(notes.join('\n'));
if (findings.length) {
  console.log(`\n${findings.length} finding(s):\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`\nAll ${selected.length} journeys passed.`);
