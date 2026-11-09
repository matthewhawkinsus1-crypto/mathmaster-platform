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
//
// AX32 (slice 4): THE DIRECTIONS NAME THE KEYS THAT WORK. Graph Scenario Match,
// the Graph Axis Editor and Sequence Explorer's plot step say how to do each thing
// from the keyboard beside the click; each is read, and the keys it names are
// then pressed with the mouse never touched.
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

  // AX32 (slice 4). Tab and Shift+Tab walk the page from its first sentinel; Enter and Space press.
  const walkTo = async (test, what, { back = false, limit = 60 } = {}) => {
    for (let presses = 0; presses < limit; presses += 1) {
      await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
      const now = await page.evaluate(() => ({ label: document.activeElement?.getAttribute('aria-label') || '', text: (document.activeElement?.textContent || '').replace(/\s+/g, ' ').trim(), cls: String(document.activeElement?.className?.baseVal ?? document.activeElement?.className ?? ''), role: document.activeElement?.getAttribute('role') || '', pressed: document.activeElement?.getAttribute('aria-pressed') }));
      if (test(now)) return now;
    }
    throw new Error(`${back ? 'Shift+Tab' : 'Tab'} never reached ${what}`);
  };
  const fromStart = () => page.evaluate(() => document.querySelector('[data-kb-sentinel="start"]').focus());

  await check(`${at} graphScenarioMatch: the direction names Tab and Enter, and they match a graph to a scenario`, async () => {
    await page.goto(`${origin}/tests/browser/keyboardSweep.html?tool=graphScenarioMatch`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.locator('.graph-scenario-match-instructions').waitFor({ timeout: 60000 });
    const direction = (await page.locator('.graph-scenario-match-instructions').innerText()).replace(/\s+/g, ' ');
    assert.ok(direction.includes('Select a graph (click or tap, or Tab to it and press Enter), or drag it directly onto a scenario.'), direction);
    await fromStart();
    await walkTo((now) => /graph-scenario-graph-select/.test(now.cls), 'a graph');
    await page.keyboard.press('Enter');
    assert.match((await page.locator('.graph-scenario-match-instructions').innerText()).replace(/\s+/g, ' '), /selected 2\. Now select the scenario/);
    await walkTo((now) => /graph-scenario-story-select/.test(now.cls), 'a scenario');
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    assert.match(await page.locator('main').innerText(), /Disconnect/, 'the scenario shows its graph, with a Disconnect');
  });

  // The Graph Axis Editor: a card is selected with Enter, then the keyboard goes BACK UP to the box (Shift+Tab).
  const axisSpec = encodeURIComponent(JSON.stringify({
    axisSetup: { required: true, inputMode: 'drag', applyToGraph: true }, recipe: null, workflow: null,
    quantities: [{ id: 'time', label: 'Time', unit: 'minutes' }, { id: 'volume', label: 'Water in the pool', unit: 'litres' }],
  }));
  await check(`${at} Graph Axis Editor: the direction names Tab, Shift+Tab and Enter, and they put a quantity and a unit on the graph`, async () => {
    await page.goto(`${origin}/tests/browser/keyboardSweep.html?tool=relationshipModel&variant=axes-keys&spec=${axisSpec}`, { waitUntil: 'networkidle', timeout: 90000 });
    await page.locator('.mathmaster-axis-editor-grid').waitFor({ timeout: 60000 });
    const keys = 'Tab to a card and press Enter, then Shift+Tab back to the matching axis box and press Enter';
    const direction = viewport.width <= 768 ? `Tap a card, then tap the matching axis box, or ${keys}.` : `Drag a card to the matching axis box. You can also click or tap a card and then the box, or ${keys}.`;
    const panel = (await page.locator('.mathmaster-axis-editor-grid').evaluate((grid) => grid.parentElement.innerText)).replace(/\s+/g, ' ');
    assert.ok(panel.includes(direction), panel);
    assert.ok(panel.includes('Place the labels and units on the graph') && panel.includes('Place quantity here'), 'the heading and the empty boxes say what to do, not how');
    await fromStart();
    const card = await walkTo((now) => now.pressed === 'false' && now.text === 'Time', 'the Time card');
    assert.equal(card.pressed, 'false');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-pressed')), 'true', 'Enter selected the card, and it says so');
    await walkTo((now) => now.text.startsWith('X-axis quantity'), 'the X-axis quantity box', { back: true });
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.textContent.replace(/\s+/g, ' ').trim()), 'X-axis quantityTime', 'Enter put the card in the box');
    await walkTo((now) => now.pressed === 'false' && now.text === 'litres', 'the litres card');
    await page.keyboard.press('Space');
    await walkTo((now) => now.text.startsWith('Y-axis unit'), 'the Y-axis unit box', { back: true });
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => document.activeElement.textContent.replace(/\s+/g, ' ').trim()), 'Y-axis unitlitres', 'Space put the unit in its box');
  });

  // Sequence Explorer's plot step: the line says to focus the grid and use the arrow keys and Enter.
  await check(`${at} sequenceExplorer: the plot step names the arrow keys and Enter, and they plot a point`, async () => {
    await page.goto(`${origin}/tests/browser/keyboardSweep.html?tool=sequenceExplorer`, { waitUntil: 'networkidle', timeout: 90000 });
    const plane = page.locator('svg[role="application"]').first();
    await plane.waitFor({ timeout: 60000 });
    const step = (await page.locator('p', { hasText: /^Choose a sequence, then plot each ordered pair/ }).first().innerText()).replace(/\s+/g, ' ');
    assert.equal(step, 'Choose a sequence, then plot each ordered pair on the graph (click or tap it, or focus the grid and use the arrow keys and Enter). Switching sequences changes which model receives the next point.');
    await fromStart();
    await walkTo((now) => now.role === 'application', 'the plane');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const said = await page.locator('[role="status"], [aria-live]').allInnerTexts();
    assert.ok(said.some((text) => text.trim().startsWith('Plotted (')), `the keys the step names plotted a point (${JSON.stringify(said)})`);
  });

  await check(`${at}: no page errors`, async () => assert.deepEqual(errors, []));
  await context.close();
}

await browser.close();
if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('focusSafeToolControls: all checks passed');
