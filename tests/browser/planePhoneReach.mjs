// ON A PHONE, PLANE TEXT CAN BE READ AND A MISSED DRAG KEEPS THE LINE
// (student pass 3, TOOL-11).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/planePhoneReach.mjs
//
// Graphing (2x + y = 4, whole-number snapping), mounted through QuestionEngine
// on the tool-outcome harness, which draws nothing over the plane:
//   text    at 390x844 the plane's tick numbers, axis names and point labels
//           render at 12 CSS px or more (they rendered at about 6-7 px); at
//           1366x768 they keep their authored size.
//   reach   with P1 at (0, 0) and P2 at (3, 0), a press about half a unit to the
//           right of P2 — a missed drag, landing in the next cell — and a lift
//           there leaves (0, 0) and (4, 0): the line is kept. It used to plot
//           a third point, which wiped the line. (A press in another cell is a
//           new point, not a pick-up: the Systems tool plots boundary points
//           one cell apart — systemsWorkspaceStudio.)
//   third   a deliberate third point far from both replaces the nearest point,
//           so the line is never silently erased.
// Exits non-zero on any failure.
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch);

const URL = (device) => `${origin}/tests/browser/toolAttemptOutcome.html?role=practice&tool=graphing&prior=0&run=planePhoneReach-${Date.now()}-${device}`;
const PLANE = 'svg.mathmaster-responsive-canvas[role="application"]';

// The smallest rendered size of the plane's text, in CSS px.
const smallestText = (page) => page.locator(PLANE).first().evaluate((svg) => {
  const scale = svg.getScreenCTM().a;
  return Math.min(...[...svg.querySelectorAll('text')]
    .filter((text) => text.textContent.trim() && !text.closest('[aria-hidden="true"]'))
    .map((text) => Number.parseFloat(getComputedStyle(text).fontSize) * scale));
});
const plotted = (page) => page.locator('dt:has-text("Points plotted") + dd').textContent().then((text) => text.trim());

let failures = 0;
const check = async (name, run) => {
  try { await run(); console.log(`ok   ${name}`); } catch (error) { failures += 1; console.error(`FAIL ${name}: ${error.message}`); }
};

for (const [device, viewport] of [['phone', { width: 390, height: 844 }], ['chromebook', { width: 1366, height: 768 }]]) {
  const context = await browser.newContext({ viewport, hasTouch: device === 'phone', deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(URL(device), { waitUntil: 'networkidle', timeout: 90000 });
  const plane = page.locator(PLANE).first();
  await plane.waitFor({ timeout: 60000 });
  await plane.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  await check(`${device}: the plane's text is readable`, async () => {
    const px = await smallestText(page);
    if (device === 'phone') assert.ok(px >= 11.9, `smallest plane text renders at ${px.toFixed(1)} CSS px`);
    else assert.ok(px >= 10 && px <= 13.5, `a wide plane keeps its authored sizes (${px.toFixed(1)} px)`);
  });

  // P1 at (0, 0) and P2 at (3, 0), by keyboard so the points are exact.
  await plane.focus();
  await page.keyboard.press('Enter');
  for (let step = 0; step < 3; step += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.waitForTimeout(200);
  await check(`${device}: two points plotted`, async () => assert.equal(await plotted(page), '(0, 0) and (3, 0)'));

  if (device === 'phone') {
    await check(`${device}: a missed drag beside P2 keeps the line`, async () => {
      // Centres through the svg's own transform: the dots' boxes include their stroke.
      const centres = await plane.evaluate((svg) => [...svg.querySelectorAll('circle[stroke="#fff"]')].map((circle) => {
        const point = svg.createSVGPoint();
        point.x = Number(circle.getAttribute('cx'));
        point.y = Number(circle.getAttribute('cy'));
        const screen = point.matrixTransform(svg.getScreenCTM());
        return [screen.x, screen.y];
      }));
      assert.equal(centres.length, 2, 'two point dots');
      const [p1, p2] = centres.sort((a, b) => a[0] - b[0]);
      const unit = (p2[0] - p1[0]) / 3;
      const at = [p2[0] + unit * 0.55, p2[1]];
      assert.equal(await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('svg[role="application"]')), at), true, 'the press lands on the plane');
      await page.mouse.move(at[0], at[1]);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(250);
      assert.equal(await plotted(page), '(0, 0) and (4, 0)');
    });
    await check(`${device}: a third point far from both replaces the nearest, the line stays`, async () => {
      await plane.focus();
      for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      // The crosshair was left at (3, 0); now (3, 4). Nearest of (0, 0) and
      // (4, 0) is (4, 0), which it replaces; (0, 0) stays.
      assert.equal(await plotted(page), '(0, 0) and (3, 4)');
    });
  }
  await check(`${device}: no page errors`, async () => assert.deepEqual(errors, []));
  await context.close();
}

await browser.close();
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('planePhoneReach: all checks passed');
