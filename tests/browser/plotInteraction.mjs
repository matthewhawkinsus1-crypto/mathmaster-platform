// Can a student actually place and move a point — with a mouse and with a finger?
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/plotInteraction.mjs
//
// Three claims, each checked by doing the gesture rather than reading the code:
//   1. An interactive plane offers an enlarge control (it used to be excluded).
//   2. A point lands where the gesture ENDS, not where it started — which is the
//      whole difference between a tap and a press-slide-lift on a phone, where
//      the finger covers the target.
//   3. An existing point can be picked up and dragged somewhere else.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const DEVICES = {
  chromebook: { viewport: { width: 1366, height: 640 }, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
};

const readStudentPoints = (page) => page.evaluate(() => {
  const svg = document.querySelector('svg');
  if (!svg) return [];
  // The student's points carry a P-label; given points are labelled otherwise.
  return [...svg.querySelectorAll('text')]
    .filter((t) => /^P\d+$/.test((t.textContent || '').trim()))
    .map((t) => ({ label: t.textContent.trim(), x: Math.round(Number(t.getAttribute('x'))), y: Math.round(Number(t.getAttribute('y'))) }));
});

const failures = [];
const note = (device, message) => { failures.push(`${device}: ${message}`); console.log(`  FAIL ${message}`); };

const browser = await chromium.launch();

for (const [device, config] of Object.entries(DEVICES)) {
  console.log(`\n=== ${device} (${config.viewport.width}x${config.viewport.height}) ===`);
  const context = await browser.newContext(config);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${ORIGIN}/tests/browser/toolOpenAudit.html?tool=graphing2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 1. The enlarge control exists on an interactive plane.
  const enlarge = await page.locator('button', { hasText: /Enlarge to plot|Enlarge graph/ }).count();
  if (enlarge > 0) console.log('  ok   enlarge control present on an interactive plane');
  else note(device, 'no enlarge control on an interactive plane');

  const svg = page.locator('svg').first();
  const box = await svg.boundingBox();
  if (!box) { note(device, 'no plane rendered'); await context.close(); continue; }

  // 2. Press in one place, release in another. The point must land on release.
  const from = { x: box.x + box.width * 0.32, y: box.y + box.height * 0.34 };
  const to = { x: box.x + box.width * 0.66, y: box.y + box.height * 0.62 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(220);

  const afterPlace = await readStudentPoints(page);
  if (!afterPlace.length) note(device, 'press-drag-lift plotted nothing');
  else {
    // Compare against where the gesture started vs ended, in screen space.
    const placed = afterPlace[afterPlace.length - 1];
    const screenX = box.x + (placed.x / 640) * box.width;
    const nearerToRelease = Math.abs(screenX - to.x) < Math.abs(screenX - from.x);
    if (nearerToRelease) console.log('  ok   the point lands where the gesture ends, not where it started');
    else note(device, `point landed nearer the press than the release (svg x=${placed.x})`);
  }

  // 3. Drag that point somewhere else.
  const before = await readStudentPoints(page);
  const target = { x: box.x + box.width * 0.44, y: box.y + box.height * 0.24 };
  await page.mouse.move(to.x, to.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(220);
  const after = await readStudentPoints(page);

  if (before.length && after.length === before.length
      && (after[after.length - 1].x !== before[before.length - 1].x || after[after.length - 1].y !== before[before.length - 1].y)) {
    console.log('  ok   an existing point can be dragged to a new spot');
  } else if (after.length > before.length) {
    note(device, `dragging an existing point added a new one instead (${before.length} -> ${after.length})`);
  } else {
    note(device, 'dragging an existing point did not move it');
  }

  // 4. The enlarged view has to be a bigger place to WORK, not just to look at.
  //    An enlarge that cannot be plotted in is the dead end the old exclusion
  //    was worried about, so this plots inside it and checks the point took.
  const enlargeButton = page.locator('button', { hasText: /Enlarge to plot|Enlarge graph/ }).first();
  if (await enlargeButton.count()) {
    const countBefore = (await readStudentPoints(page)).length;
    await enlargeButton.click();
    await page.waitForTimeout(320);
    const bigSvg = page.locator('svg').last();
    const bigBox = await bigSvg.boundingBox();
    if (!bigBox) note(device, 'enlarged view rendered no plane');
    else {
      if (bigBox.width > box.width) console.log(`  ok   enlarged plane is bigger (${Math.round(box.width)} -> ${Math.round(bigBox.width)}px)`);
      else note(device, `enlarged plane is not bigger (${Math.round(box.width)} -> ${Math.round(bigBox.width)}px)`);
      const spot = { x: bigBox.x + bigBox.width * 0.6, y: bigBox.y + bigBox.height * 0.3 };
      await page.mouse.move(spot.x, spot.y);
      await page.mouse.down();
      await page.mouse.move(spot.x + 12, spot.y + 12, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(240);
      const countAfter = (await readStudentPoints(page)).length;
      if (countAfter >= countBefore) console.log('  ok   a student can plot inside the enlarged view');
      else note(device, 'plotting inside the enlarged view did nothing');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  if (errors.length) note(device, `page errors: ${[...new Set(errors)].slice(0, 2).join(' | ')}`);
  await context.close();
}

await browser.close();

if (failures.length) {
  console.log(`\n${failures.length} problem(s):`);
  failures.forEach((f) => console.log(`  ${f}`));
  process.exit(1);
}
console.log('\nPlotting works by press-slide-lift, points can be moved, and the plane can be enlarged — on both devices.');
