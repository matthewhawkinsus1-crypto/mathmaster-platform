/*
 * MAPPING DIAGRAM COORDINATE PLOT BY KEYBOARD (KEYBOARD_SWEEP.md T1 + T4), in
 * real Chromium at 1366x768 and 390x844.
 *
 *   npx vite --host 127.0.0.1 --port 5501 --strictPort &
 *   AUDIT_ORIGIN=http://127.0.0.1:5501 node tests/browser/toolKeyboardRelationMapping.mjs
 *
 * Mounted through QuestionEngine by the keyboard-sweep harness
 * (tests/browser/keyboardSweep.html) with the sweep's relationMapping:plot
 * question, which leaves typed point entry off: the plot itself is the only
 * way to answer it. Per viewport:
 *
 *   1. KEYS ONLY. Tab from the start sentinel to the plot (a focusable
 *      role="application" with a keyboard description and a visible ring),
 *      aim with the arrows, Enter/Space to plot, Enter again to remove a
 *      mis-plot, Escape to hide the crosshair; type the domain and range; Tab
 *      to Check and press Enter. Asserts the state the keys reached (the
 *      plotted list, in order), what the live region said (positions only,
 *      never a verdict) and that the tool graded, correct.
 *   2. POINTER. The same answer by mouse clicks on the drawn grid points must
 *      record the identical plotted list and grade the same.
 *   3. KEYS, WRONG. A keyboard-plotted wrong point grades wrong: the grade
 *      follows the keyboard's state, not a constant.
 *
 * Exits non-zero on the first failed assertion.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5501';
const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';

// The sweep's relationMapping:plot scene (tests/browser/keyboardSweep.mjs).
const SPEC = { pairs: [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: -1 }], ask: ['plot', 'domain', 'range'] };
const URL_FOR = ({ bare = false } = {}) => `${origin}/tests/browser/keyboardSweep.html?tool=relationMapping&spec=${encodeURIComponent(JSON.stringify(SPEC))}${bare ? '&host=bare' : ''}&run=${Date.now()}`;
const PLOT = 'svg[aria-label="Coordinate plane for plotting the relation"]';
const STATUS = '[data-relation-plot-status]';
const VERDICT = /\b(correct|incorrect|right|wrong|not quite|match|matches)\b/i;
const MAX_TABS = 80;

const browser = await chromium.launch(launchOptions);

const open = async (viewport, options = {}) => {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(URL_FOR(options), { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForSelector(PLOT);
  return { page, errors };
};

const activeIs = (page, selector) => page.evaluate((sel) => document.activeElement?.matches?.(sel) === true, selector);
const activeName = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return '';
  const labelled = el.getAttribute('aria-label');
  if (labelled) return labelled;
  if (el.labels?.length) return el.labels[0].textContent.trim();
  return (el.textContent || '').trim();
});

/** Tab forward until `match(page)` holds; returns the number of presses. */
const tabUntil = async (page, match, what) => {
  for (let i = 1; i <= MAX_TABS; i += 1) {
    await page.keyboard.press('Tab');
    if (await match()) return i;
  }
  throw new assert.AssertionError({ message: `${what}: not reached in ${MAX_TABS} Tab presses (focus on "${await activeName(page)}")` });
};

/** The plotted list exactly as the tool holds it: its "Remove plotted point" buttons, in order. */
const plottedList = (page) => page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Remove plotted point "]')]
  .map((button) => button.getAttribute('aria-label').replace('Remove plotted point ', '').split(', ').map(Number)));
const status = (page) => page.locator(STATUS).innerText();
const grades = (page) => page.evaluate(() => window.__KB_GRADES__.filter((entry) => entry.kind === 'grade'));

const pressAndHear = async (page, keys, at) => {
  const said = [];
  for (const key of keys) {
    await page.keyboard.press(key);
    said.push(await status(page));
    assert.ok(await activeIs(page, PLOT), `${at}: focus stays on the plot after ${key}`);
  }
  return said;
};

/** Start sentinel -> Tab to the plot, keys only. */
const tabToPlot = async (page, at) => {
  await page.locator('[data-kb-sentinel="start"]').focus();
  const presses = await tabUntil(page, () => activeIs(page, PLOT), `${at}: the coordinate plot`);
  const info = await page.evaluate((sel) => {
    const svg = document.querySelector(sel);
    const help = document.getElementById(svg.getAttribute('aria-describedby') || '');
    const helpBox = help?.getBoundingClientRect();
    const style = getComputedStyle(svg);
    return {
      role: svg.getAttribute('role'),
      tabIndex: svg.tabIndex,
      focusVisible: svg.matches(':focus-visible'),
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      help: help?.textContent || '',
      helpShown: Boolean(helpBox && helpBox.width > 40 && helpBox.height > 8),
    };
  }, PLOT);
  assert.equal(info.role, 'application', `${at}: the plot keeps role="application" only because it takes keys`);
  assert.equal(info.tabIndex, 0, `${at}: the plot is in the Tab order`);
  assert.ok(info.focusVisible, `${at}: keyboard focus on the plot is :focus-visible`);
  assert.doesNotMatch(info.outline, /^none/, `${at}: the plot shows a focus ring (${info.outline})`);
  assert.match(info.help, /Arrow keys move the crosshair one unit/, `${at}: the plot's description is the keyboard instruction`);
  assert.match(info.help, /Enter or Space plots/, `${at}: ...including how to plot`);
  assert.ok(info.helpShown, `${at}: the instruction is on screen while the plot has keyboard focus`);
  return presses;
};

const typeAnswersAndCheck = async (page, at) => {
  // The text boxes, not the mapping diagram's "Domain value …" nodes.
  const inBox = async (pattern) => (await activeIs(page, 'input')) && pattern.test(await activeName(page));
  await tabUntil(page, () => inBox(/^Domain/), `${at}: the domain box`);
  await page.keyboard.type('-2, 1, 3');
  await tabUntil(page, () => inBox(/^Range/), `${at}: the range box`);
  await page.keyboard.type('-1, 2, 3');
  assert.equal((await grades(page)).length, 0, `${at}: nothing graded before Check`);
  await tabUntil(page, async () => (await activeName(page)) === 'Check', `${at}: the Check button`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__KB_GRADES__.some((entry) => entry.kind === 'grade'), null, { timeout: 15000 });
  return grades(page);
};

const CORRECT = [[-2, 3], [1, 2], [3, -1]];

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  const at = `${viewport.width}x${viewport.height}`;

  // ---- 1. Keys only: a correct answer, with a mis-plot removed on the way.
  {
    const { page, errors } = await open(viewport);
    await tabToPlot(page, at);
    assert.equal(await page.locator('[data-relation-crosshair]').count(), 0, `${at}: no crosshair before a key`);
    const said = await pressAndHear(page, [
      'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Enter', // (-2, 3)
      'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'Space', // (1, 2) by Space
      'ArrowRight', 'Enter', // (2, 2): a mis-plot...
      'Enter', // ...removed again
      'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter', // (3, -1)
    ], at);
    assert.deepEqual(said, [
      'Crosshair at (-1, 0).', 'Crosshair at (-2, 0).', 'Crosshair at (-2, 1).', 'Crosshair at (-2, 2).', 'Crosshair at (-2, 3).', 'Plotted (-2, 3).',
      'Crosshair at (-1, 3).', 'Crosshair at (0, 3).', 'Crosshair at (1, 3).', 'Crosshair at (1, 2).', 'Plotted (1, 2).',
      'Crosshair at (2, 2).', 'Plotted (2, 2).',
      'Removed (2, 2).',
      'Crosshair at (3, 2).', 'Crosshair at (3, 1).', 'Crosshair at (3, 0).', 'Crosshair at (3, -1).', 'Plotted (3, -1).',
    ], `${at}: the live region says where, step by step`);
    said.forEach((line) => assert.doesNotMatch(line, VERDICT, `${at}: no verdict while answerable: "${line}"`));
    assert.equal(await page.locator(STATUS).getAttribute('aria-live'), 'polite', `${at}: the status is a polite live region`);
    assert.equal(await page.locator('[data-relation-crosshair="keyboard"]').count(), 1, `${at}: the keyboard crosshair is drawn`);
    assert.deepEqual(await plottedList(page), CORRECT, `${at}: the keys recorded exactly the three pairs, in order`);
    assert.equal(await page.locator(`${PLOT} circle[r="7"]`).count(), 3, `${at}: three points drawn`);

    // Escape leaves crosshair mode and keeps focus (it must not close the
    // question around the plot); the next arrow brings the crosshair back.
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-relation-crosshair]').count(), 0, `${at}: Escape hides the crosshair`);
    assert.ok(await activeIs(page, PLOT), `${at}: Escape keeps focus on the plot`);
    assert.match(await status(page), /^Crosshair hidden\./, `${at}: Escape is announced`);
    await page.keyboard.press('ArrowUp');
    assert.equal(await status(page), 'Crosshair at (0, 1).', `${at}: the next arrow starts again from the origin`);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowUp');
    assert.equal(await status(page), 'Crosshair at (-2, 5).', `${at}: Shift moves five`);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await status(page), 'Crosshair at (-2, 3), on a plotted point.', `${at}: a plotted point under the crosshair is announced, without a verdict`);
    assert.deepEqual(await plottedList(page), CORRECT, `${at}: moving the crosshair changes nothing`);

    const recorded = await typeAnswersAndCheck(page, at);
    assert.equal(recorded.length, 1, `${at}: one grade recorded`);
    assert.equal(recorded[0].isCorrect, true, `${at}: the keyboard-built answer graded correct`);
    assert.deepEqual(errors, [], `${at}: no page errors`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${at}: no horizontal page scroll (${overflow}px)`);
    await page.close();
  }

  // ---- 2. Pointer: the same answer by clicks records the identical state.
  // On the phone this run uses the harness's bare host: under the
  // assignment-screen wrapper at 390x844 the harness leaves the tool's scroll
  // region 16px tall, so most of the plot cannot be clicked at all (keyboard
  // focus scrolls inside it; a mouse cannot). The tool is the same either way.
  {
    const { page, errors } = await open(viewport, { bare: viewport.width < 600 });
    const clickGrid = async ([x, y], nudge = [0, 0]) => {
      const svg = page.locator(PLOT);
      // Centred, as a student scrolls it: on a phone the sticky task card and
      // work bar cover a plot that is merely "in view" at the edge.
      await svg.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const box = await svg.boundingBox();
      const scale = Math.min(box.width / 430, box.height / 430);
      const left = box.x + (box.width - 430 * scale) / 2;
      const top = box.y + (box.height - 430 * scale) / 2;
      // The -5..5 window this question draws: 34px pad, 362px for 10 units.
      const vx = 34 + ((x + 5) / 10) * 362 + nudge[0];
      const vy = 34 + ((5 - y) / 10) * 362 + nudge[1];
      const cx = left + vx * scale;
      const cy = top + vy * scale;
      const hit = await page.evaluate(([px, py, sel]) => Boolean(document.elementFromPoint(px, py)?.closest(sel)), [cx, cy, PLOT]);
      assert.ok(hit, `${at}: the drawn (${x}, ${y}) is uncovered for the click`);
      await page.mouse.click(cx, cy);
    };
    await clickGrid([-2, 3], [4, -3]);
    await clickGrid([1, 2], [-3, 2]);
    await clickGrid([2, 2]);
    await clickGrid([2, 2], [2, 2]);
    await clickGrid([3, -1], [0, 4]);
    assert.deepEqual(await plottedList(page), CORRECT, `${at}: clicks record the same plotted list as the keys`);
    assert.equal(await page.locator('[data-relation-plot-help]').evaluate((el) => el.getBoundingClientRect().width), 1, `${at}: a pointer user does not see the keyboard instruction`);
    await page.locator('[data-kb-sentinel="start"]').focus();
    await tabUntil(page, () => activeIs(page, PLOT), `${at}: the plot (pointer run)`);
    const recorded = await typeAnswersAndCheck(page, at);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].isCorrect, true, `${at}: the pointer-built answer grades the same as the keyboard-built one`);
    assert.deepEqual(errors, [], `${at}: no page errors (pointer)`);
    await page.close();
  }

  // ---- 3. Keys, wrong: the grade follows what the keys plotted.
  {
    const { page, errors } = await open(viewport);
    await tabToPlot(page, `${at} wrong`);
    await pressAndHear(page, ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'Enter', 'Shift+ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'Enter'], `${at} wrong`);
    assert.deepEqual(await plottedList(page), [[-2, 3], [2, 1]], `${at}: the keys recorded (-2, 3) and (2, 1)`);
    const recorded = await typeAnswersAndCheck(page, `${at} wrong`);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].isCorrect, false, `${at}: a keyboard-plotted wrong point grades wrong`);
    assert.deepEqual(errors, [], `${at}: no page errors (wrong)`);
    await page.close();
  }

  console.log(`ok ${at}: plot reached by Tab, plotted/removed by keys, announced positions only, graded; pointer parity; wrong plot graded wrong`);
}

await browser.close();
console.log('toolKeyboardRelationMapping: all assertions passed');
