// Can a student actually place and move a point — with a mouse and with a finger?
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/plotInteraction.mjs
//
// Each claim is checked by doing the gesture rather than reading the code:
//   1. An interactive plane can be enlarged (it used to be excluded).
//   2. A point lands where the gesture ENDS, not where it started — which is the
//      whole difference between a tap and a press-slide-lift on a phone, where
//      the finger covers the target.
//   3. The plane stays where it is while points are placed. Graphing 2's "what
//      to do next" line above it used to get shorter after the first point,
//      and the plane jumped up 18px between a student's first click and their
//      second (src/App.css, .mathmaster-steady-text).
//   4. An existing point can be picked up and dragged somewhere else.
//   5. The zoom buttons change the window, and a point still lands where it
//      was aimed; a two-finger pinch leaves the window alone.
//
// Graphing 2 opens in Work View on a Chromebook-width screen, so the plane a
// student works on there is the one inside it: every check finds the plane by
// its name, inside an open Work View first.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const DEVICES = {
  chromebook: { viewport: { width: 1366, height: 640 }, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
};

const PLANE = 'svg[aria-label^="Coordinate plane"]';
const OPEN_PLANE = `.mathmaster-work-view-host[data-open="true"] ${PLANE}`;
const activePlane = async (page) => {
  const open = page.locator(OPEN_PLANE);
  return (await open.count()) ? open.first() : page.locator(PLANE).first();
};

// The student's points, where they are drawn on screen. Their labels read
// P1, P2; a given point is labelled otherwise. The dot is the circle without
// an opacity (the ring around a hovered or held point has one).
const readStudentPoints = (page) => page.evaluate(({ open, any }) => {
  const svg = document.querySelector(open) || document.querySelector(any);
  if (!svg) return [];
  return [...svg.querySelectorAll('text[data-point-label]')]
    .filter((t) => /^P\d+$/.test((t.textContent || '').trim()))
    .map((t) => {
      const circle = t.parentElement.querySelector('circle:not([opacity])');
      const dot = circle?.getBoundingClientRect();
      return {
        label: t.textContent.trim(),
        x: dot ? dot.x + dot.width / 2 : NaN,
        y: dot ? dot.y + dot.height / 2 : NaN,
        // Where it is in the plane's own units, which a page zoom cannot move.
        at: circle ? `${circle.getAttribute('cx')},${circle.getAttribute('cy')}` : '',
      };
    });
}, { open: OPEN_PLANE, any: PLANE });

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

  // 1. The workspace can be enlarged.
  //
  //    The control reads "Open Work View" (it was "Enlarge workspace" from
  //    Stage 3A, "Enlarge to plot" before; TL35). The plane no longer
  //    offers a shell of its own in a migrated tool: the tool wraps its WHOLE
  //    split, so the enlarged view carries the Check button and the construction
  //    summary with the graph instead of leaving them behind a backdrop.
  const ENLARGE_CONTROL = /Open Work View/;
  const workViewOpen = () => page.locator('.mathmaster-work-view-host[data-open="true"]').count();
  const enlarge = await page.locator('button', { hasText: ENLARGE_CONTROL }).count();
  // A plotting tool on a Chromebook-width screen opens Work View for the
  // student, so there is no control left to press — and there should not be.
  const alreadyEnlarged = (await workViewOpen()) > 0;
  if (enlarge > 0 || alreadyEnlarged) console.log(`  ok   ${alreadyEnlarged ? 'the workspace opens enlarged on this screen' : 'enlarge control present on an interactive plane'}`);
  else note(device, 'no enlarge control on an interactive plane');

  const plane = await activePlane(page);
  const box = await plane.boundingBox();
  if (!box) { note(device, 'no plane rendered'); await context.close(); continue; }
  console.log(`  ..   working on the ${alreadyEnlarged ? 'Work View' : 'inline'} plane (${Math.round(box.width)}px wide)`);

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
    const placed = afterPlace[afterPlace.length - 1];
    const nearerToRelease = Math.hypot(placed.x - to.x, placed.y - to.y) < Math.hypot(placed.x - from.x, placed.y - from.y);
    if (nearerToRelease) console.log('  ok   the point lands where the gesture ends, not where it started');
    else note(device, `point landed nearer the press than the release (${Math.round(placed.x)}, ${Math.round(placed.y)})`);
  }

  // 3. The plane did not move when that first point was placed. A student's
  //    second click is aimed from where the grid WAS; a plane that moves under
  //    it puts the point a grid step away from where they meant.
  const stayedPut = async (before, what) => {
    const now = await (await activePlane(page)).boundingBox();
    const moved = Math.max(Math.abs(now.x - before.x), Math.abs(now.y - before.y));
    if (moved < 1) console.log(`  ok   the plane stays put when ${what}`);
    else note(device, `the plane moved ${Math.round(moved)}px when ${what}`);
    return now;
  };
  const afterFirst = await stayedPut(box, 'the first point is placed');

  // 4. Drag that point somewhere else, from where it is drawn: points snap to
  //    the grid, so the dot is up to half a square from where the press ended.
  const before = await readStudentPoints(page);
  const held = before[before.length - 1];
  const target = { x: afterFirst.x + afterFirst.width * 0.44, y: afterFirst.y + afterFirst.height * 0.24 };
  if (held) {
    await page.mouse.move(held.x, held.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(220);
  }
  const after = await readStudentPoints(page);
  if (held && after.length === before.length
      && Math.hypot(after[after.length - 1].x - held.x, after[after.length - 1].y - held.y) > 10) {
    console.log('  ok   an existing point can be dragged to a new spot');
  } else if (after.length > before.length) {
    note(device, `dragging an existing point added a new one instead (${before.length} -> ${after.length})`);
  } else {
    note(device, 'dragging an existing point did not move it');
  }

  // The second point: the line under the plane changes its words again.
  const beforeSecond = await (await activePlane(page)).boundingBox();
  await page.mouse.click(beforeSecond.x + beforeSecond.width * 0.3, beforeSecond.y + beforeSecond.height * 0.7);
  await page.waitForTimeout(220);
  if ((await readStudentPoints(page)).length === 2) console.log('  ok   a second point is placed');
  else note(device, `a second click left ${(await readStudentPoints(page)).length} points`);
  await stayedPut(beforeSecond, 'the second point is placed');

  // 5. The enlarged view has to be a bigger place to WORK, not just to look at.
  //    An enlarge that cannot be plotted in is the dead end the old exclusion
  //    was worried about, so this moves a point inside it and checks it took.
  const enlargeButton = page.locator('button', { hasText: ENLARGE_CONTROL }).first();
  if (alreadyEnlarged || await enlargeButton.count()) {
    if (!alreadyEnlarged) await enlargeButton.click();
    await page.waitForTimeout(320);
    const bigBox = await page.locator(OPEN_PLANE).first().boundingBox().catch(() => null);
    if (!bigBox) note(device, 'enlarged view rendered no plane');
    else {
      // Nothing to compare against when the workspace was enlarged from the
      // start — `box` was measured inside it. What still has to hold is that a
      // student can plot in there, which is the next check either way.
      if (alreadyEnlarged) console.log(`  ok   the enlarged plane is ${Math.round(bigBox.width)}px wide`);
      else if (bigBox.width > box.width) console.log(`  ok   enlarged plane is bigger (${Math.round(box.width)} -> ${Math.round(bigBox.width)}px)`);
      else note(device, `enlarged plane is not bigger (${Math.round(box.width)} -> ${Math.round(bigBox.width)}px)`);
      // Both points are down, so a third press moves the nearer one there.
      const pointsBefore = await readStudentPoints(page);
      const spot = { x: bigBox.x + bigBox.width * 0.6, y: bigBox.y + bigBox.height * 0.3 };
      await page.mouse.move(spot.x, spot.y);
      await page.mouse.down();
      await page.mouse.move(spot.x + 12, spot.y + 12, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(240);
      const pointsAfter = await readStudentPoints(page);
      const changed = pointsAfter.some((point, index) => Math.hypot(point.x - (pointsBefore[index]?.x ?? NaN), point.y - (pointsBefore[index]?.y ?? NaN)) > 10
        || !Number.isFinite(pointsBefore[index]?.x));
      if (pointsAfter.length === 2 && changed) console.log('  ok   a student can plot inside the enlarged view');
      else note(device, `plotting inside the enlarged view did nothing (${pointsBefore.length} -> ${pointsAfter.length} points)`);
    }
    // Leave it as it was found: a workspace that opened itself stays open, or
    // the zoom-button checks below would run against a plane that is no longer
    // the one a student on this screen is looking at.
    if (!alreadyEnlarged) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  }

  // 6. PAN AND ZOOM. The buttons are the way to zoom, and what matters most is
  //    the last check: zooming must not move where a point actually lands.
  const readAxis = () => page.evaluate(({ open, any }) => {
    const svg = document.querySelector(open) || document.querySelector(any);
    const labels = [...(svg?.querySelectorAll('text') || [])]
      .map((t) => Number((t.textContent || '').trim()))
      .filter((n) => Number.isFinite(n));
    return labels.length ? { min: Math.min(...labels), max: Math.max(...labels) } : null;
  }, { open: OPEN_PLANE, any: PLANE });
  const zoomIn = page.locator('button[aria-label="Zoom in"]').first();
  if (!(await zoomIn.count())) note(device, 'no zoom control on a plane a student plots on');
  else {
    const before = await readAxis();
    await zoomIn.click();
    await page.waitForTimeout(220);
    const after = await readAxis();
    if ((after.max - after.min) < (before.max - before.min)) {
      console.log(`  ok   zooming in narrows the window (${before.max - before.min} -> ${after.max - after.min} units)`);
    } else {
      note(device, `zoom in did not narrow the window (${before.max - before.min} -> ${after.max - after.min})`);
    }

    // The reset has to actually come back, or a student who zooms is stranded.
    await page.locator('button', { hasText: 'Reset view' }).first().click();
    await page.waitForTimeout(220);
    const reset = await readAxis();
    if ((reset.max - reset.min) === (before.max - before.min)) console.log('  ok   reset returns the original window');
    else note(device, `reset did not restore the window (${before.max - before.min} -> ${reset.max - reset.min})`);

    // THE ONE THAT MATTERS: a point must land where the student aimed, whatever
    // the zoom. If the coordinate mapping ignores the view, a zoomed student
    // plots somewhere they did not choose and cannot tell why they were wrong.
    await zoomIn.click();
    await page.waitForTimeout(220);
    const zoomedBox = await (await activePlane(page)).boundingBox();
    const aim = { x: zoomedBox.x + zoomedBox.width * 0.5, y: zoomedBox.y + zoomedBox.height * 0.5 };
    const pointsBefore = await readStudentPoints(page);
    await page.mouse.move(aim.x, aim.y);
    await page.mouse.down();
    await page.mouse.move(aim.x + 4, aim.y + 4, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(240);
    const placed = await readStudentPoints(page);
    // The point that moved (a press past the last point moves the nearer one).
    const landed = placed.find((point, index) => !pointsBefore[index]
      || Math.hypot(point.x - pointsBefore[index].x, point.y - pointsBefore[index].y) > 2);
    if (!landed) note(device, 'plotting while zoomed placed no point');
    else {
      // Within half a grid square of the aim, the most a snap can move it.
      const offBy = Math.hypot(landed.x - (aim.x + 4), landed.y - (aim.y + 4));
      const halfSquare = Math.hypot(zoomedBox.width, zoomedBox.height) / Math.max(1, after.max - after.min) / 2;
      if (offBy <= halfSquare + 2) console.log(`  ok   a point plotted while zoomed lands where it was aimed (${Math.round(offBy)}px off)`);
      else note(device, `zoomed plot landed ${Math.round(offBy)}px from the aim point`);
    }
    await page.locator('button', { hasText: 'Reset view' }).first().click().catch(() => {});
    await page.waitForTimeout(200);
  }

  // 7. A REAL TWO-FINGER PINCH, not a mouse pretending to be one, and it is
  //    the BROWSER'S gesture: it must not rewrite the coordinate window
  //    (CoordinatePlane's touch-action leaves pinch to page zoom). Playwright's
  //    touchscreen API is single-touch, but the DevTools protocol dispatches
  //    genuine multi-touch: two pointer ids with pointerType "touch".
  if (config.hasTouch) {
    const spanOf = (axis) => (axis ? axis.max - axis.min : null);
    const spanBefore = spanOf(await readAxis());
    const pointsBefore = (await readStudentPoints(page)).map((point) => point.at).join(' ');

    const pinchBox = await (await activePlane(page)).boundingBox();
    const cdp = await context.newCDPSession(page);
    const cx = pinchBox.x + pinchBox.width / 2;
    const cy = pinchBox.y + pinchBox.height / 2;
    const pair = (spread) => ([{ x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 }]);
    // Fingers moving apart.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pair(26) });
    for (const spread of [40, 56, 72, 88, 104, 120]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pair(spread) });
      await page.waitForTimeout(30);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    const spanAfter = spanOf(await readAxis());

    if (spanBefore && spanAfter === spanBefore) console.log(`  ok   a two-finger pinch leaves the coordinate window alone (${spanBefore} units)`);
    else note(device, `a two-finger pinch changed the coordinate window (${spanBefore} -> ${spanAfter})`);

    // And neither finger may plot: with both points down a stray press would
    // MOVE one rather than add a third, so the points are compared, not counted.
    const pointsAfter = (await readStudentPoints(page)).map((point) => point.at).join(' ');
    if (pointsAfter === pointsBefore) console.log('  ok   pinching did not plot or move a point');
    else note(device, `pinching changed the points (${pointsBefore} -> ${pointsAfter})`);
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
console.log('\nPlotting works by press-slide-lift, the plane stays put, points can be moved, and the plane can be enlarged — on both devices.');
