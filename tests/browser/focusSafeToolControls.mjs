// A CONTROL THAT DISABLES ITSELF KEEPS KEYBOARD FOCUS (student pass 3, A11Y-2).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/focusSafeToolControls.mjs
//
// Each of these used to disable itself on the very press that used it up, and
// a disabled button cannot hold focus: the browser dropped a keyboard student
// to the top of the page. Through the real QuestionEngine, by keyboard:
//   graphing2      "Start over" after two plotted points
//   plane          "Reset view" after a zoom
//   stepAlgebra2   "Start over" after one applied move
//   stepAlgebra    a distribution target, once the factor is placed on it
//                  (the core, through Step Algebra 2's rewrite mode)
// After the press, focus is still on the control, which says it is
// unavailable (aria-disabled) and does nothing if pressed again.
//
// A SCROLL PANE THAT TAKES FOCUS SHOWS ITS RING ON EVERY SIDE (CI09, 2026-10-24).
// Graph Scenario Match's two panes are Tab stops (the arrow keys scroll them).
// The page's focus ring sits outside a box, and the bank around a pane clips
// everything outside it, so a keyboard student saw one line along the top edge
// and the keyboard sweep read the stop as having no visible focus. After a Tab,
// the ring is opaque and no ancestor's overflow cuts a side of it off.
// Exits non-zero on any failure.
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch);

let failures = 0;
const check = async (name, run) => {
  try { await run(); console.log(`ok   ${name}`); } catch (error) { failures += 1; console.error(`FAIL ${name}: ${error.message}`); }
};

// Focus is on `locator`'s element, which reports itself unavailable.
const keptFocus = async (page, locator, what) => {
  const state = await locator.evaluate((element) => ({
    focused: document.activeElement === element,
    active: `${document.activeElement?.tagName} ${document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 40)}`,
    ariaDisabled: element.getAttribute('aria-disabled'),
  }));
  assert.ok(state.focused, `${what} keeps focus (focus is on ${state.active})`);
  assert.equal(state.ariaDisabled, 'true', `${what} says it is unavailable`);
};

for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  const at = `${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Graphing: Start over, and the plane's Reset view.
  await page.goto(`${origin}/tests/browser/keyboardSweep.html?tool=graphing2`, { waitUntil: 'networkidle', timeout: 90000 });
  const plane = page.locator('svg.mathmaster-responsive-canvas[role="application"]').first();
  await plane.waitFor({ timeout: 60000 });
  await check(`${at} graphing2: Start over keeps focus when the construction empties`, async () => {
    await plane.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    const startOver = page.locator('.mathmaster-tool-shell button', { hasText: /^Start over$/ }).first();
    await startOver.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('dt:has-text("Points plotted") + dd').textContent(), 'None yet', 'the construction was cleared');
    await keptFocus(page, startOver, 'Start over');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('dt:has-text("Points plotted") + dd').textContent(), 'None yet', 'a second press does nothing');
  });
  await check(`${at} plane: Reset view keeps focus when the view is reset`, async () => {
    await page.locator('button[aria-label="Zoom in"]').first().click();
    const reset = page.locator('button', { hasText: /^Reset view$/ }).first();
    await reset.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await keptFocus(page, reset, 'Reset view');
  });

  // The Work View rail's own Start over (Graphing opens in Work View by default
  // on a Chromebook): the same focus-safe rule as the inline button.
  if (viewport.width >= 1050) {
    await check(`${at} graphing2 Work View: the rail's Start over keeps focus`, async () => {
      await page.goto(`${origin}/tests/browser/keyboardSweep.html?tool=graphing2`, { waitUntil: 'networkidle', timeout: 90000 });
      if (await page.evaluate(() => document.documentElement.getAttribute('data-work-view-open')) !== 'true') {
        // "Open Work View" since the assignment chrome (pass 3); "Enlarge" before.
        await page.locator('button:has-text("Open Work View"), button:has-text("Enlarge")').first().click();
        await page.waitForFunction(() => document.documentElement.getAttribute('data-work-view-open') === 'true');
      }
      const dialogPlane = page.locator('[aria-modal="true"] svg.mathmaster-responsive-canvas[role="application"]').first();
      await dialogPlane.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      const railStartOver = page.locator('[aria-modal="true"] [data-work-view-action="start-over"]').first();
      await page.waitForFunction(() => {
        const button = document.querySelector('[aria-modal="true"] [data-work-view-action="start-over"]');
        return button && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
      });
      await railStartOver.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      await keptFocus(page, railStartOver, "the rail's Start over");
    });
  }

  // Step Algebra 2's balance solver: Start over after one move.
  await page.goto(`${origin}/tests/browser/keyboardSweep.html?tool=stepAlgebra2`, { waitUntil: 'networkidle', timeout: 90000 });
  await check(`${at} stepAlgebra2: Start over keeps focus when the history empties`, async () => {
    const number = page.locator('input[placeholder="e.g. 6"]').first();
    await number.waitFor({ timeout: 60000 });
    await number.fill('6');
    await number.press('Enter');
    await page.waitForTimeout(200);
    const startOver = page.locator('.mathmaster-tool-shell button', { hasText: /^Start over$/ }).first();
    assert.equal(await startOver.getAttribute('aria-disabled'), null, 'a move was applied');
    await startOver.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await keptFocus(page, startOver, 'Start over');
  });

  // Step Algebra's inline distribution: y = 3(x − 2), rewritten in slope-intercept form.
  const distributeSpec = encodeURIComponent(JSON.stringify({ mode: 'rewriteLinearForm', targetForm: 'slopeIntercept', equation: 'y = 3(x - 2)', prompt: 'Rewrite y = 3(x − 2) in slope-intercept form.' }));
  await page.goto(`${origin}/tests/browser/keyboardSweep.html?tool=stepAlgebra2&spec=${distributeSpec}`, { waitUntil: 'networkidle', timeout: 90000 });
  await check(`${at} stepAlgebra: a distribution target keeps focus once the factor is placed on it`, async () => {
    await page.locator('button.algebra-distribute-toggle, .algebra-inline-factor-token').first().waitFor({ timeout: 60000 });
    if (!(await page.locator('.algebra-inline-factor-token').count())) await page.locator('button.algebra-distribute-toggle').first().click();
    const token = page.locator('.algebra-inline-factor-token').first();
    await token.focus();
    await page.keyboard.press('Enter');
    const target = page.locator('.algebra-inline-distribution-target').first();
    await target.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    assert.equal(await target.getAttribute('aria-pressed'), 'true', 'the factor was placed');
    await keptFocus(page, target, 'the placed target');
  });

  // Graph Scenario Match: the graph bank and the scenario bank take focus by Tab.
  await page.goto(`${origin}/tests/browser/keyboardSweep.html?tool=graphScenarioMatch`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.locator('[role="region"][aria-label="Scrollable scenario bank"]').waitFor({ timeout: 60000 });
  for (const name of ['Scrollable graph bank', 'Scrollable scenario bank']) {
    await check(`${at} graphScenarioMatch: "${name}" shows its focus ring on every side`, async () => {
      await page.evaluate(() => document.querySelector('[data-kb-sentinel="start"]').focus());
      let focused = false;
      for (let presses = 0; presses < 40 && !focused; presses += 1) {
        await page.keyboard.press('Tab');
        focused = await page.evaluate((label) => document.activeElement?.getAttribute('aria-label') === label, name);
      }
      assert.ok(focused, `Tab reaches "${name}"`);
      const ring = await page.evaluate(() => {
        const element = document.activeElement;
        const style = getComputedStyle(element);
        const width = parseFloat(style.outlineWidth) || 0;
        const offset = parseFloat(style.outlineOffset) || 0;
        const channels = (style.outlineColor.match(/[\d.]+/g) || []).map(Number);
        const box = element.getBoundingClientRect();
        // The band a ring paints runs from `offset` to `offset + width` outside the border box (negative: inside it).
        const reach = offset + width;
        const painted = { left: box.left - reach, top: box.top - reach, right: box.right + reach, bottom: box.bottom + reach };
        const cut = new Set();
        for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (ancestorStyle.overflowX === 'visible' && ancestorStyle.overflowY === 'visible') continue;
          const around = ancestor.getBoundingClientRect();
          const visible = {
            left: around.left + parseFloat(ancestorStyle.borderLeftWidth),
            top: around.top + parseFloat(ancestorStyle.borderTopWidth),
            right: around.right - parseFloat(ancestorStyle.borderRightWidth),
            bottom: around.bottom - parseFloat(ancestorStyle.borderBottomWidth),
          };
          // A side is cut when the element's own edge is in view and the ring's outer edge is not. An element that is
          // itself scrolled partly out of its container (a tall pane on a phone) is not the ring's doing.
          for (const side of ['left', 'top']) if (box[side] >= visible[side] - 0.5 && painted[side] < visible[side] - 0.5) cut.add(side);
          for (const side of ['right', 'bottom']) if (box[side] <= visible[side] + 0.5 && painted[side] > visible[side] + 0.5) cut.add(side);
        }
        return { drawn: style.outlineStyle !== 'none' && width >= 2, opaque: channels.length < 4 || channels[3] === 1, cut: [...cut], byKeyboard: element.matches(':focus-visible') };
      });
      assert.ok(ring.byKeyboard, 'Tab gave it keyboard focus');
      assert.ok(ring.drawn, 'it draws a ring at least 2px wide');
      assert.ok(ring.opaque, 'the ring is opaque (a translucent one is about 1.4:1 on the bank)');
      assert.deepEqual(ring.cut, [], 'no ancestor cuts a side of the ring off');
    });
  }

  await check(`${at}: no page errors`, async () => assert.deepEqual(errors, []));
  await context.close();
}

await browser.close();
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('focusSafeToolControls: all checks passed');
