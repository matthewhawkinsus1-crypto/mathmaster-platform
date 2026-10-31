// THE PLANE'S READOUT CLOSES ON ESCAPE (WCAG 1.4.13, content on hover or focus).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/planeReadoutEscape.mjs
//
// The pointer's crosshair, its coordinate chip and a hovered point's
// coordinates are drawn over the plot. Graphing, mounted through
// QuestionEngine on the tool-outcome harness, at 1366x768:
//   hover     the mouse resting on the plane (focus elsewhere) shows the
//             crosshair; Escape puts it away with the pointer still; moving
//             inside the plane keeps it away, while the spoken readout (the
//             plane a screen-reader student has) still follows the pointer;
//             leaving and coming back shows it again.
//   focused   after a press on the plane (focus there), Escape puts the
//             crosshair away too.
//   point     a plotted point's coordinates, shown on hover, close on Escape.
//   keyboard  the arrow keys' crosshair is the student's own cursor: Escape
//             leaves it where it is.
// Escape is never taken from what has focus (Work View still closes on the
// first one): no Escape here is marked handled.
// Exits non-zero on any failure.
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch);

const URL = `${origin}/tests/browser/toolAttemptOutcome.html?role=practice&tool=graphing&prior=0&run=planeReadoutEscape-${Date.now()}`;
const PLANE = 'svg.mathmaster-responsive-canvas[role="application"]';

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

const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
const plane = page.locator(PLANE).first();
await plane.waitFor({ timeout: 60000 });
await plane.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);

// Whether each Escape was marked handled, read after its dispatch is over.
await page.evaluate(() => {
  window.__escapeHandled = [];
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    setTimeout(() => window.__escapeHandled.push(event.defaultPrevented), 0);
  }, true);
});
const lastEscapeHandled = async () => {
  await page.waitForTimeout(50);
  return page.evaluate(() => window.__escapeHandled.at(-1));
};
const crosshairs = () => page.locator(`${PLANE} [data-plane-readout]`).count();
// The plane's live region: what a screen reader hears as the cursor moves.
const spoken = () => plane.evaluate((svg) => {
  for (let node = svg.parentElement; node; node = node.parentElement) {
    const region = node.querySelector('p.mm-sr-only[aria-live="polite"]');
    if (region) return region.textContent;
  }
  return null;
});
const pointReadouts = () => page.locator(`${PLANE} [data-plane-point-readout]`).count();
const box = await plane.boundingBox();
// A spot well inside the plot, away from the axes and any point.
const inside = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
const away = async () => { await page.mouse.move(box.x - 40 > 0 ? box.x - 40 : 2, 2); await page.waitForTimeout(80); };

await check('hover: the mouse on the plane shows the crosshair', async () => {
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(...inside(0.3, 0.3));
  await page.waitForTimeout(120);
  assert.equal(await crosshairs(), 1);
});

await check('hover: Escape puts it away, the pointer still', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  assert.equal(await crosshairs(), 0, 'no crosshair after Escape');
  assert.equal(await lastEscapeHandled(), false, 'the key is left to the focus');
});

await check('hover: moving inside the plane keeps it away, and the spoken readout still follows', async () => {
  const before = await spoken();
  await page.mouse.move(...inside(0.5, 0.62), { steps: 4 });
  await page.waitForTimeout(120);
  assert.equal(await crosshairs(), 0);
  const after = await spoken();
  assert.match(after || '', /\(-?\d/, `the live region reads a coordinate (${after})`);
  assert.notEqual(after, before, 'the live region moved with the pointer');
});

await check('hover: leaving the plane and coming back shows it again', async () => {
  await away();
  await page.mouse.move(...inside(0.3, 0.3), { steps: 3 });
  await page.waitForTimeout(120);
  assert.equal(await crosshairs(), 1);
});

await check('focused: after a press on the plane, Escape puts the crosshair away too', async () => {
  await page.mouse.click(...inside(0.3, 0.3));
  await page.mouse.move(...inside(0.32, 0.3), { steps: 2 });
  await page.waitForTimeout(150);
  const focused = await plane.evaluate((svg) => svg === document.activeElement);
  assert.ok(focused, 'the press put focus on the plane');
  assert.equal(await crosshairs(), 1, 'the crosshair shows');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  assert.equal(await crosshairs(), 0, 'no crosshair after Escape');
  assert.equal(await lastEscapeHandled(), false, 'the key goes on (Work View closes on it)');
});

// A point at (2, 1), by keyboard so it is exact; then the mouse on its dot.
await away();
await plane.focus();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('Enter');
await page.evaluate(() => document.activeElement?.blur?.());
await page.waitForTimeout(200);
const dot = await plane.evaluate((svg) => {
  const circle = [...svg.querySelectorAll('circle[stroke="#fff"]')].at(-1);
  if (!circle) return null;
  const point = svg.createSVGPoint();
  point.x = Number(circle.getAttribute('cx'));
  point.y = Number(circle.getAttribute('cy'));
  const screen = point.matrixTransform(svg.getScreenCTM());
  return [screen.x, screen.y];
});

await check('point: a plotted point shows its coordinates on hover', async () => {
  assert.ok(dot, 'a plotted dot');
  await page.mouse.move(dot[0] + 30, dot[1] + 30);
  await page.mouse.move(dot[0], dot[1], { steps: 3 });
  await page.waitForTimeout(150);
  assert.equal(await pointReadouts(), 1);
});

await check('point: Escape puts the point readout and the crosshair away', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  assert.equal(await pointReadouts(), 0, 'no point readout');
  assert.equal(await crosshairs(), 0, 'no crosshair');
});

await away();
await check('keyboard: an arrow key on the focused plane shows the crosshair', async () => {
  await plane.focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(120);
  assert.equal(await crosshairs(), 1);
});

await check('keyboard: Escape leaves the arrow keys\' crosshair, and the key goes on', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  assert.equal(await crosshairs(), 1, 'the crosshair stays');
  assert.equal(await lastEscapeHandled(), false, 'the key is not taken');
});

await check('keyboard: after a hover readout was put away, the arrow keys show the crosshair', async () => {
  await page.mouse.move(...inside(0.3, 0.3), { steps: 3 });
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  assert.equal(await crosshairs(), 0, 'the hover crosshair is put away');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(120);
  assert.equal(await crosshairs(), 1, 'the keyboard crosshair shows');
});

await check('no page errors', async () => assert.deepEqual(errors, []));

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nall checks passed');
