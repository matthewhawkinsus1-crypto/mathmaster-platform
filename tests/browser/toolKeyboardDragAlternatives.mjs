/*
 * WHERE A POINTER CAN ONLY DRAG, THE KEYS FINISH THE TASK (VPAT 2.5.7).
 *
 *   npx vite --config tests/browser/emulator/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort &
 *   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/toolKeyboardDragAlternatives.mjs
 *
 *   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
 *    when the defaults below are not installed.)
 *
 * A GATE: exits non-zero when a check fails.
 *
 * The VPAT's Dragging Movements row (docs/accessibility/VPAT_2.5_WCAG_MathMaster.md)
 * names four places where a pointer's only route is a drag, each with a
 * keyboard route. A route that only exists is not enough: this holds two of
 * them to the end of the task, in the work the tool grades, keys only, at
 * 1366×768 and on a 390×844 touch phone, through QuestionEngine on
 * keyboardSweep.html (its grade log is what the engine recorded):
 *
 *   plane  the shared coordinate plane, in Graphing 2 (2x + y = 4): (0, 4) and
 *          (1, 3) plotted by keys grade wrong. Enter on (1, 3) picks it up, and
 *          the plane says it is moving the point; ArrowDown and Enter put it
 *          down at (1, 2), and the same two points grade right. (A new point
 *          plotted there would replace (1, 3) and grade right too, so the
 *          moving sentence is what shows it was a move.)
 *   story  Graph Story's sketch: every written part typed after Tab, two points
 *          placed by keys still leave the sketch missing, so Submit stays off;
 *          a third joins them into one line, drawn through the three in order,
 *          and the item grades complete.
 *
 * The other two are held to the end of theirs by the drivers beside this one in
 * the accessibility workflow: the 3D model turns by its arrow keys, holds its
 * tilt limits and comes back with Home (toolKeyboardThreePlane.mjs), and the
 * calculator moves by the arrow keys and Enter on its ↕ button, always on
 * screen (calculatorKeyboard.mjs). A pointer-only device was not tried, and
 * whether each place also wants a click-click route is a person's call.
 */
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launch = { args: ['--no-sandbox'] };
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
try { if (statSync(executablePath).isFile()) launch.executablePath = executablePath; } catch { /* Playwright's default */ }

const SIZES = [
  { at: '1366x768', options: { viewport: { width: 1366, height: 768 } } },
  { at: '390x844', options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
];

// Wait for an outcome, not a clock: a busy runner is slower than this machine.
const until = async (predicate, timeout = 10000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
};

const open = async (browser, options, tool, spec) => {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  const query = `tool=${tool}&variant=dragAlternative&spec=${encodeURIComponent(JSON.stringify(spec))}&run=${Date.now()}`;
  await page.goto(`${ORIGIN}/tests/browser/keyboardSweep.html?${query}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-kb-sentinel="end"]');
  return { context, page, errors };
};

const active = (page) => page.evaluate(() => {
  const el = document.activeElement;
  const label = el?.closest?.('label');
  return {
    tag: el?.tagName?.toLowerCase() || null,
    role: el?.getAttribute?.('role') || null,
    name: (el?.getAttribute?.('aria-label') || el?.textContent || '').trim().replace(/\s+/g, ' '),
    label: label ? (label.firstChild?.textContent || '').trim() : '',
    sentinel: el?.getAttribute?.('data-kb-sentinel') || null,
  };
});

// Tab (then Shift+Tab) until the focused element is the one wanted: keys only.
const tabTo = async (page, wanted, what) => {
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 150; i += 1) {
      const now = await active(page);
      if (wanted(now)) return now;
      if (i > 0 && now.sentinel === (key === 'Tab' ? 'end' : 'start')) break;
      await page.keyboard.press(key);
    }
  }
  throw new Error(`Tab never reached ${what}`);
};

const grades = (page) => page.evaluate(() => window.__KB_GRADES__.filter((entry) => entry.kind === 'grade').map((entry) => entry.isCorrect));
const isSubmit = (now) => now.tag === 'button' && /^Submit\b/.test(now.name);
const submitByKeys = async (page, label) => {
  const before = (await grades(page)).length;
  await tabTo(page, isSubmit, `Submit (${label})`);
  await page.keyboard.press('Enter');
  assert.ok(await until(async () => (await grades(page)).length > before), `${label}: Enter on Submit graded the work`);
  return (await grades(page)).at(-1);
};

/* ---------------------------------------------------------------- plane */

const PLANE_NAME = /^Coordinate plane for constructing your line/;
const onPlane = (now) => now.tag === 'svg' && now.role === 'application' && PLANE_NAME.test(now.name);
// What the plane's live region says: the plot just made, or where a held point is going.
const planeSays = (page) => page.evaluate(() => {
  let host = document.activeElement?.closest?.('svg[role="application"]');
  while (host && !host.querySelector?.('p.mm-sr-only[aria-live]')) host = host.parentElement;
  return (host?.querySelector('p.mm-sr-only[aria-live]')?.textContent || '').trim();
});

const plane = async (browser, { at, options }) => {
  const { context, page, errors } = await open(browser, options, 'graphing2', { mode: 'standardForm', standard: { A: 2, B: 1, C: 4 } });
  const label = `plane ${at}`;
  // The tool arrives in its own chunk: walk the page once the plane is drawn.
  await page.waitForSelector('svg[role="application"].mathmaster-touch-surface');
  await page.evaluate(() => document.querySelector('[data-kb-sentinel="start"]')?.focus());
  await tabTo(page, onPlane, 'the plane');
  // The crosshair starts at the origin and each arrow moves it one unit.
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Enter', 'ArrowRight', 'ArrowDown', 'Enter']) await page.keyboard.press(key);
  assert.ok(await until(async () => /2 of 2 points plotted/.test(await planeSays(page))), `${label}: two points plotted by keys (${await planeSays(page)})`);
  assert.equal(await submitByKeys(page, `${label}, (1, 3)`), false, `${label}: (0, 4) and (1, 3) grade wrong`);

  // Back to the plane: the crosshair is still on (1, 3).
  await tabTo(page, onPlane, 'the plane again');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  assert.ok(
    await until(async () => (await planeSays(page)).startsWith('Moving the point from (1, 3) to (1, 2).')),
    `${label}: Enter picked (1, 3) up and ArrowDown moves it (${await planeSays(page)})`,
  );
  await page.keyboard.press('Enter');
  assert.ok(await until(async () => !(await planeSays(page)).startsWith('Moving the point')), `${label}: Enter put it down`);
  assert.equal(await submitByKeys(page, `${label}, moved`), true, `${label}: the point moved by keys is the one graded: (0, 4) and (1, 2) grade right`);
  assert.deepEqual(errors, [], `${label}: no page errors`);
  await context.close();
  console.log(`ok ${label}: a misplaced point picked up, moved and put down by keys, and graded right`);
};

/* ---------------------------------------------------------------- story */

const STORY = {
  type: 'graphStory',
  prompt: 'Write a story about a changing amount, then sketch its graph.',
  graph: null,
  requireSketch: true,
};
const WRITTEN = [
  ['Scenario', 'A bath fills with water for ten minutes, then the tap is turned off.'],
  ['Independent quantity', 'time'],
  ['Dependent quantity', 'water in the bath'],
  ['X-axis label', 'Time'],
  ['X-axis unit', 'minutes'],
  ['Y-axis label', 'Water'],
  ['Y-axis unit', 'litres'],
  ['Explain what the points, segments, or smooth curve represent', 'The line rises while the tap is on and stays level once it is off.'],
];
const SKETCH = 'svg[aria-label="Graph story sketch"]';
const onSketch = (now) => now.tag === 'svg' && now.name === 'Graph story sketch';
const sketchSays = (page) => page.evaluate(() => document.querySelector('[data-graph-story-description] ~ p[aria-live="polite"]')?.textContent?.trim() || '');
const submitControl = (page) => page.getByRole('button', { name: /^Submit\b/ }).first();

const story = async (browser, { at, options }) => {
  const { context, page, errors } = await open(browser, options, 'graphStory', STORY);
  const label = `story ${at}`;
  await page.waitForSelector(SKETCH);
  await page.evaluate(() => document.querySelector('[data-kb-sentinel="start"]')?.focus());
  for (const [field, text] of WRITTEN) {
    await tabTo(page, (now) => now.label === field, field);
    await page.keyboard.type(text);
  }
  assert.ok(await submitControl(page).isDisabled(), `${label}: with no sketch the item is not complete`);

  await tabTo(page, onSketch, 'the sketch');
  for (const key of ['Enter', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp', 'Enter']) await page.keyboard.press(key);
  assert.ok(await until(async () => /Point 2 placed at 3 right, 2 up\. The line has 2 points\./.test(await sketchSays(page))), `${label}: two points placed by keys (${await sketchSays(page)})`);
  assert.ok(await submitControl(page).isDisabled(), `${label}: two points are not yet a sketch, so Submit stays off`);

  for (const key of ['Shift+ArrowRight', 'Enter']) await page.keyboard.press(key);
  assert.ok(await until(async () => /Point 3 placed at 8 right, 2 up\. The line has 3 points\./.test(await sketchSays(page))), `${label}: a third point joins the line (${await sketchSays(page)})`);
  const lines = await page.locator(`${SKETCH} polyline`).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('points')));
  assert.deepEqual(lines, ['44,376 170,292 380,292'], `${label}: one line through the three points, in the order placed`);
  assert.ok(await until(async () => !(await submitControl(page).isDisabled())), `${label}: the sketch completes the item, so Submit is on`);
  assert.equal(await submitByKeys(page, label), true, `${label}: the item, its sketch made by keys, grades complete`);
  assert.deepEqual(errors, [], `${label}: no page errors`);
  await context.close();
  console.log(`ok ${label}: written parts and a three-point sketch by keys alone, graded complete`);
};

const browser = await chromium.launch(launch);
let failed = false;
for (const size of SIZES) {
  for (const scene of [plane, story]) {
    try {
      await scene(browser, size);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${scene.name} ${size.at}: ${error?.message || error}`);
    }
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
