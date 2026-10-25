// THE PROGRESS WHEELS' DETAIL CLOSES ON ESCAPE (WCAG 1.4.13, content on hover or focus).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/wheelEscape.mjs
//
// Hovering or focusing a slice of the CCMR readiness wheel shows that part of
// the test in place of the selected one; hovering or focusing a wedge of My
// Math Path's wheel puts that skill in the hub in place of "My Math Path".
// Both wheels on wheelEscape.html, at 1366x768:
//   hover     Escape puts the detail away with the pointer still on the slice,
//             and it stays away while the pointer rests there.
//   focus     Escape puts it away with focus still on the slice.
//   the key   Escape is never taken (a dialog around a wheel still closes).
// Exits non-zero on any failure.
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch);

const failures = [];
const check = async (label, body) => {
  try {
    await body();
    console.log(`ok   ${label}`);
  } catch (error) {
    failures.push(label);
    console.log(`FAIL ${label}: ${error.message}`);
  }
};

const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(`${origin}/tests/browser/wheelEscape.html?run=${Date.now()}`, { waitUntil: 'networkidle', timeout: 90000 });
await page.locator('[data-wheel="ccmr"] svg').waitFor({ timeout: 60000 });
await page.evaluate(() => {
  window.__escapeHandled = [];
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setTimeout(() => window.__escapeHandled.push(event.defaultPrevented), 0);
  }, true);
});
const escape = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  return page.evaluate(() => window.__escapeHandled.at(-1));
};
const away = async () => { await page.mouse.move(2, 2); await page.waitForTimeout(100); };
// A point ON a slice: an arc's box centre can fall in the wheel's hole.
const pointOn = (locator) => locator.evaluate((group) => {
  const path = group.querySelector('path');
  const length = path.getTotalLength();
  const svg = path.ownerSVGElement;
  // Midway along the arc's outline, nudged toward the middle of the ring.
  const a = path.getPointAtLength(length * 0.25);
  const b = path.getPointAtLength(length * 0.75);
  const point = svg.createSVGPoint();
  point.x = (a.x + b.x) / 2;
  point.y = (a.y + b.y) / 2;
  const screen = point.matrixTransform(path.getScreenCTM());
  return [screen.x, screen.y];
});
const hover = async (locator) => {
  await page.mouse.move(...(await pointOn(locator)), { steps: 3 });
  await page.waitForTimeout(150);
};

// CCMR readiness wheel: the detail card (an h4 with the part's title).
const ccmrSlice = page.locator('[data-wheel="ccmr"] [role="button"][tabindex="0"]').first();
const ccmrDetail = () => page.locator('[data-wheel="ccmr"] h4').count();

await check('ccmr: hovering a slice shows its detail', async () => {
  await away();
  assert.equal(await ccmrDetail(), 0, 'nothing selected, no detail');
  await hover(ccmrSlice);
  assert.equal(await ccmrDetail(), 1);
});
await check('ccmr: Escape puts it away with the pointer still on the slice, and leaves the key alone', async () => {
  assert.equal(await escape(), false, 'the key is not taken');
  assert.equal(await ccmrDetail(), 0);
  const [x, y] = await pointOn(ccmrSlice);
  await page.mouse.move(x + 2, y + 1);
  await page.waitForTimeout(120);
  assert.equal(await ccmrDetail(), 0, 'resting on the slice does not bring it back');
});
await check('ccmr: focusing the slice shows its detail; Escape puts it away, focus staying', async () => {
  await away();
  await ccmrSlice.focus();
  await page.waitForTimeout(120);
  assert.equal(await ccmrDetail(), 1);
  await escape();
  assert.equal(await ccmrDetail(), 0);
  assert.ok(await ccmrSlice.evaluate((node) => node === document.activeElement), 'focus stays on the slice');
});

// My Math Path wheel: the hub reads "My Math Path" until a skill is hovered or focused.
const wedge = page.locator('[data-wheel="path"] g[role="button"]').first();
const hubSaysPath = () => page.locator('[data-wheel="path"] svg').evaluate((svg) => [...svg.querySelectorAll('text')].some((text) => text.textContent.trim() === 'My Math Path'));

await check('path: hovering a wedge puts its skill in the hub', async () => {
  await page.evaluate(() => document.activeElement?.blur?.());
  await away();
  assert.equal(await hubSaysPath(), true, 'the hub starts on "My Math Path"');
  await hover(wedge);
  assert.equal(await hubSaysPath(), false);
});
await check('path: Escape puts "My Math Path" back with the pointer still, and leaves the key alone', async () => {
  assert.equal(await escape(), false, 'the key is not taken');
  assert.equal(await hubSaysPath(), true);
});
await check('path: focusing a wedge shows its skill; Escape puts the hub back, focus staying', async () => {
  await away();
  await wedge.focus();
  await page.waitForTimeout(120);
  assert.equal(await hubSaysPath(), false);
  await escape();
  assert.equal(await hubSaysPath(), true);
  assert.ok(await wedge.evaluate((node) => node === document.activeElement), 'focus stays on the wedge');
});

await check('no page errors', async () => assert.deepEqual(errors, []));

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nall checks passed');
