// SYSTEMS OF EQUATIONS RUSH'S ROUND SCREEN IN A REAL BROWSER (QA harness, not CI).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/systemsRushScreens.mjs
//
// On a phone (390×844) and a laptop (1366×768), through rendered controls:
//
//   every kind     two lines drawn (line 1 solid, line 2 dashed over it), both
//                  labelled, the round's key, the buttons its kind offers;
//                  nothing scrolls sideways
//   same line      the two lines lie on each other, their labels at opposite
//                  ends — also in a contrast theme (forced colours)
//   answers        a tap on the solution, "No Solution" on parallel lines,
//                  "Infinitely Many" on the same line twice, "Can't Be
//                  Determined" on lines crossing between grid lines: each told
//                  it is right, in the system's words
//   holds still    the graph keeps its place from an intercept item to a
//                  solution item and back
//
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/systemsRush.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/systemsRush');
mkdirSync(ARTIFACTS, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const DEVICES = [
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'laptop', viewport: { width: 1366, height: 768 } },
];

const CASES = [
  { name: 'one-solution', query: 'kind=slanted&variant=cross&question=solution&tier=standard', buttons: ['No Solution', 'Infinitely Many', 'Can\'t Be Determined', 'Skip'], answer: 'tap', right: /^Correct — \(.+\) is on both lines: the solution\.$/ },
  { name: 'parallel', query: 'kind=parallel&variant=slanted&question=solution&tier=standard', buttons: ['No Solution', 'Infinitely Many', 'Can\'t Be Determined', 'Skip'], answer: 'No Solution', right: /^Correct — parallel lines never meet: no solution\.$/ },
  { name: 'same-line', query: 'kind=sameLine&variant=slanted&question=solution&tier=standard', buttons: ['No Solution', 'Infinitely Many', 'Can\'t Be Determined', 'Skip'], answer: 'Infinitely Many', right: /^Correct — the same line: every point on it is a solution\.$/, sameLine: true },
  { name: 'same-line-level', query: 'kind=sameLine&variant=level&question=solution&tier=standard', buttons: ['No Solution', 'Infinitely Many', 'Can\'t Be Determined', 'Skip'], answer: 'Infinitely Many', right: /^Correct — the same line/, sameLine: true },
  { name: 'same-line-upright', query: 'kind=sameLine&variant=upright&question=solution&tier=standard', buttons: ['No Solution', 'Infinitely Many', 'Can\'t Be Determined', 'Skip'], answer: 'Infinitely Many', right: /^Correct — the same line/, sameLine: true },
  { name: 'cannot-determine', query: 'kind=cannotDetermine&variant=between&question=solution&tier=standard', buttons: ['No Solution', 'Infinitely Many', 'Can\'t Be Determined', 'Skip'], answer: 'Can\'t Be Determined', right: /^Correct — they cross at \(.+\), between grid lines\.$/ },
  { name: 'past-edge', query: 'kind=cannotDetermine&variant=pastEdge&question=solution&tier=challenge', buttons: ['No Solution', 'Infinitely Many', 'Can\'t Be Determined', 'Skip'], answer: 'Can\'t Be Determined', right: /^Correct — they meet at \(.+\), past the edge of the graph\.$/ },
  { name: 'y-intercepts', query: 'kind=slanted&variant=cross&question=yIntercept&tier=easy', buttons: ['Does Not Exist', 'Skip'], answer: 'tap-all' },
  { name: 'x-intercepts-vertical', query: 'kind=levelUpright&variant=uprightSlanted&question=xIntercept&tier=standard', buttons: ['Does Not Exist', 'Skip'], answer: 'tap-all' },
  { name: 'x-intercepts-none', query: 'kind=levelUpright&variant=twoLevel&question=xIntercept&tier=standard', buttons: ['Does Not Exist', 'Skip'], answer: 'Does Not Exist', right: /^Correct — neither line crosses the x-axis\.$/ },
];

const open = async (device, query, extra = {}) => {
  const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch, deviceScaleFactor: 2, ...extra });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${ORIGIN}/tests/browser/systemsRushScreens.html?${query}`);
  await page.waitForSelector('svg.mm-rush-graph [data-mm-system-line="2"]', { timeout: 20_000 });
  return { context, page, errors };
};

// Where a graph point is on the screen.
const pixelOf = async (page, point) => page.evaluate(({ x, y }) => {
  const svg = document.querySelector('svg.mm-rush-graph');
  const rect = svg.getBoundingClientRect();
  const question = window.__systemsQuestions[Number(svg.closest('[data-question-index]').dataset.questionIndex)];
  const { xMin, xMax, yMin, yMax } = question.view;
  return { x: rect.left + ((x - xMin) / (xMax - xMin)) * rect.width, y: rect.top + ((yMax - y) / (yMax - yMin)) * rect.height };
}, point);
const currentItem = (page) => page.evaluate(() => window.__systemsQuestions[Number(document.querySelector('[data-question-index]').dataset.questionIndex)]);
const feedback = (page) => page.evaluate(() => document.querySelector('.mm-rush-feedback')?.textContent || '');
const press = async (page, label) => page.locator('.mm-rush-controls .mm-rush-buttons:not(.mm-rush-buttons-held) button', { hasText: new RegExp(`^${label.replace(/[']/g, '.')}$`) }).first().click();

for (const device of DEVICES) {
  for (const entry of CASES) {
    const { context, page, errors } = await open(device, entry.query);
    const where = `${device.name} ${entry.name}`;
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-${entry.name}.png`) });
    const shape = await page.evaluate(() => ({
      lines: document.querySelectorAll('svg.mm-rush-graph [data-mm-system-line]').length,
      labels: [...document.querySelectorAll('svg.mm-rush-graph [data-mm-system-label]')].map((label) => label.getBoundingClientRect()).map((box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })),
      dashed: document.querySelector('svg.mm-rush-graph [data-mm-system-line="2"] line[data-mm-plane-part="line"]')?.getAttribute('stroke-dasharray') || '',
      solid: document.querySelector('svg.mm-rush-graph [data-mm-system-line="1"] line')?.getAttribute('stroke-dasharray') || '',
      widths: ['1', '2'].map((id) => Number(document.querySelector(`svg.mm-rush-graph [data-mm-system-line="${id}"] line[data-mm-plane-part="line"]`)?.getAttribute('stroke-width'))),
      ends: ['1', '2'].map((id) => { const line = document.querySelector(`svg.mm-rush-graph [data-mm-system-line="${id}"] line[data-mm-plane-part="line"]`); return ['x1', 'y1', 'x2', 'y2'].map((name) => Number(line.getAttribute(name))); }),
      legend: [...document.querySelectorAll('.mm-rush-legend > span')].map((entry) => entry.textContent.trim()).join(' '),
      // What a student can see and press (the other kind's row is held unseen beside it).
      buttons: [...document.querySelectorAll('.mm-rush-controls button')].filter((button) => button.offsetParent !== null && getComputedStyle(button).visibility === 'visible').map((button) => button.textContent.trim()),
      heldReachable: [...document.querySelectorAll('.mm-rush-buttons-held button')].some((button) => getComputedStyle(button).visibility === 'visible' || button.tabIndex >= 0 || !button.disabled || !button.closest('[aria-hidden="true"]')),
      sideways: document.scrollingElement.scrollWidth > window.innerWidth + 1,
      overflowingButton: [...document.querySelectorAll('.mm-rush-controls button')].some((button) => button.scrollWidth > button.clientWidth + 1),
    }));
    check(shape.lines === 2 && shape.labels.length === 2, `${where}: two lines, two labels`);
    check(shape.solid === '' && shape.dashed !== '' && shape.widths[0] > shape.widths[1], `${where}: line 1 solid and wide, line 2 dashed and narrow`, JSON.stringify(shape.widths));
    check(shape.legend === 'Line 1 Line 2', `${where}: the key`, shape.legend);
    check(JSON.stringify(shape.buttons) === JSON.stringify(entry.buttons), `${where}: its buttons`, shape.buttons.join(' | '));
    check(!shape.heldReachable, `${where}: the held row is unseen, unread, disabled and out of the tab order`);
    check(!shape.sideways, `${where}: nothing scrolls sideways`);
    check(!shape.overflowingButton, `${where}: every button's words fit it`);
    if (entry.sameLine) {
      const same = shape.ends[0].every((value, index) => Math.abs(value - shape.ends[1][index]) < 0.01);
      const apart = Math.hypot(shape.labels[0].x - shape.labels[1].x, shape.labels[0].y - shape.labels[1].y);
      check(same, `${where}: the two lines lie on each other`);
      check(apart > 120, `${where}: labelled 1 and 2 at opposite ends`, `${Math.round(apart)} px apart`);
    }
    // Answer it, as a student would.
    const item = await currentItem(page);
    if (entry.answer === 'tap') {
      const at = await pixelOf(page, item.targets[0]);
      await page.mouse.click(at.x, at.y);
    } else if (entry.answer === 'tap-all') {
      for (const target of item.targets) {
        // eslint-disable-next-line no-await-in-loop
        const at = await pixelOf(page, target);
        // eslint-disable-next-line no-await-in-loop
        await page.mouse.click(at.x, at.y);
      }
    } else {
      await press(page, entry.answer);
    }
    await page.waitForTimeout(80);
    const said = await feedback(page);
    if (entry.right) check(entry.right.test(said), `${where}: told it is right`, said);
    else check(/Graph complete!$|Found \(/.test(said), `${where}: each intercept found`, said);
    await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-${entry.name}-answered.png`) });
    check(!errors.length, `${where}: no page errors`, errors.join(' | '));
    await context.close();
  }
}

// THE SAME LINE TWICE IN A CONTRAST THEME: both lines the text colour, told apart by their strokes.
for (const device of DEVICES) {
  const { context, page } = await open(device, CASES.find((entry) => entry.name === 'same-line').query, { forcedColors: 'active', colorScheme: 'dark' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(ARTIFACTS, `${device.name}-same-line-forced-colours.png`) });
  const casing = await page.evaluate(() => getComputedStyle(document.querySelector('svg.mm-rush-graph [data-mm-system-line="2"] line[data-mm-plane-part="halo"]')).stroke);
  const ink = await page.evaluate(() => getComputedStyle(document.querySelector('svg.mm-rush-graph [data-mm-system-line="2"] line[data-mm-plane-part="line"]')).stroke);
  check(casing !== ink, `${device.name}: in forced colours line 2's casing is the board's colour, its dashes the text's`, `${casing} / ${ink}`);
  await context.close();
}

// HOLDS STILL: a round of every kind; the graph keeps its place from item to item.
for (const device of DEVICES) {
  const { context, page } = await open(device, 'preset=everySystem&seed=still');
  const boxes = [];
  const kinds = [];
  for (let step = 0; step < 6; step += 1) {
    // eslint-disable-next-line no-await-in-loop
    const box = await page.evaluate(() => { const rect = document.querySelector('.mm-rush-graph-frame').getBoundingClientRect(); return [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)].join(','); });
    // eslint-disable-next-line no-await-in-loop
    const item = await currentItem(page);
    boxes.push(box);
    kinds.push(item.feature);
    // eslint-disable-next-line no-await-in-loop
    await page.locator('.mm-rush-controls .mm-rush-buttons:not(.mm-rush-buttons-held) button', { hasText: /^Skip$/ }).first().click();
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(1_400);
  }
  check(new Set(kinds).size > 1, `${device.name}: the round dealt both kinds`, kinds.join(' '));
  check(new Set(boxes).size === 1, `${device.name}: the graph never moved`, [...new Set(boxes)].join(' | '));
  await context.close();
}

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nall passed');
