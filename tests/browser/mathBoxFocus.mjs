/*
 * FOCUS THAT LEAVES A MATH BOX STAYS WHERE IT WENT, in real Chromium at
 * 1366×768 and on a 390×844 touch phone.
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/mathBoxFocus.mjs
 *
 * MathLive focuses a box's keyboard sink from a 60 ms timer after the box
 * takes focus, and ignores a blur until then; when the timer fires it focuses
 * the sink wherever focus has gone since. The platform refuses that late focus
 * once the page has moved on (mathFieldFocusHandoff.js, part 3). On four real
 * MathInput boxes (mathBoxFocusMain.jsx):
 *
 *   Tab       a Tab pressed inside those 60 ms (taken by Tab, or by a click or
 *             tap) moves on, 5 times in 5, and the second Tab is shown to have
 *             come inside them;
 *   held Tab  a Tab held down (a repeat every 33 ms) walks every box once, in
 *             order, to the control after them, with and without the boxes'
 *             keypad buttons;
 *   the page  focus the page moves within 60 ms of a box taking it stays where
 *             it went: a heading (a screen change), a message (feedback), the
 *             next box (Enter), a button, and nowhere (a blur), which a box
 *             once pulled focus back from, 3 times in 3;
 *   moved     a box React has moved in the page (a reordered list) is guarded
 *             too: MathLive builds it a new sink, which went unguarded, and a
 *             Tab inside the 60 ms came back to the box, 3 times in 3;
 *
 * and what the guard must leave alone: a box takes focus by click, tap, Tab
 * and the page's own focus(); a keypad key pressed as the box takes focus
 * types into it and leaves focus there; MathLive's own keyboard stays hidden
 * and a phone's keyboard suppressed; its menu stays shut; and an IME
 * composition (typed through Chromium's IME interface) lands in the box.
 *
 * Exits non-zero on any failure.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

// MathLive's hand-over: a second key later than this tested nothing.
const HAND_OVER_MS = 60;
const BOXES = ['Slope', 'y-intercept', 'x-intercept', 'Rate'];

const failures = [];
const check = async (label, body) => {
  try {
    await body();
    console.log(`ok   ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.error(`FAIL ${label}: ${error.message}`);
  }
};

const SIZES = [
  { at: '1366x768', viewport: { width: 1366, height: 768 }, touch: false },
  { at: '390x844', viewport: { width: 390, height: 844 }, touch: true },
];

const open = async (size, query = '') => {
  const context = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/tests/browser/mathBoxFocus.html${query}`, { waitUntil: 'networkidle' });
  await page.locator('math-field').nth(BOXES.length - 1).waitFor();
  await page.waitForTimeout(300);
  return { page, close: async () => { await context.close(); assert.deepEqual(errors, [], 'the page raised no error'); } };
};
const where = (page) => page.evaluate(() => window.__mathBoxFocus.where());
const focusLog = (page) => page.evaluate(() => window.__mathBoxFocus.log());
const press = (page, size, box) => (size.touch
  ? page.locator(`math-field[aria-label="${box}"]`).tap()
  : page.locator(`math-field[aria-label="${box}"]`).click());
// How long after the box took focus the next Tab came.
const tabGap = (log, box) => {
  const focus = log.find((entry) => entry.type === 'focus' && entry.name === `box:${box}`);
  const key = focus && log.find((entry) => entry.type === 'key' && entry.key === 'Tab' && entry.at > focus.at);
  return focus && key ? key.at - focus.at : Infinity;
};
// A box takes focus `how`, and Tab comes as soon as the driver can send it.
const tabInsideHandOver = async (page, size, box, how) => {
  await page.locator('[data-test="before"]').focus();
  await page.evaluate(() => window.__mathBoxFocus.clear());
  if (how === 'tab') await page.keyboard.press('Tab');
  else await press(page, size, box);
  await page.waitForTimeout(5);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(250);
  return { gap: tabGap(await focusLog(page), box), end: await where(page) };
};
const stopsOf = (log) => log.filter((entry) => entry.type === 'focus').reduce((stops, entry) => (
  stops.at(-1) === entry.name ? stops : [...stops, entry.name]
), []);

for (const size of SIZES) {
  const { at } = size;
  // With its keypad button, Tab goes from a box to its button; a desktop row
  // that hides the button goes straight on to the next box.
  const shapes = size.touch ? [['', 'toggle:Slope']] : [['', 'toggle:Slope'], ['?toggles=0', 'box:y-intercept']];

  for (const [query, next] of shapes) {
    const shape = query ? 'no keypad buttons' : 'keypad buttons';
    for (const how of size.touch ? ['tab', 'tap'] : ['tab', 'click']) {
      await check(`${at} ${shape}: a Tab inside the hand-over of a box taken by ${how} moves on, 5 of 5`, async () => {
        const { page, close } = await open(size, query);
        const ends = [];
        for (let run = 0; run < 5; run += 1) {
          // A busy runner can send the second Tab too late to test anything:
          // that run is tried again, and only a Tab inside the 60 ms counts.
          let tried = null;
          for (let attempt = 0; attempt < 3 && !(tried?.gap < HAND_OVER_MS); attempt += 1) {
            if (run || attempt) await page.reload({ waitUntil: 'networkidle' });
            await page.locator('math-field').nth(BOXES.length - 1).waitFor();
            tried = await tabInsideHandOver(page, size, 'Slope', how);
          }
          assert.ok(tried.gap < HAND_OVER_MS, `run ${run + 1}: the second Tab came ${Math.round(tried.gap)} ms after the box took focus, not inside its ${HAND_OVER_MS} ms`);
          ends.push(tried.end);
        }
        assert.deepEqual(ends, Array(5).fill(next), `focus went on to ${next} every time (${ends.join(' | ')})`);
        await close();
      });
    }

    await check(`${at} ${shape}: a held Tab walks every box once, in order, to the control after them`, async () => {
      const { page, close } = await open(size, query);
      await page.locator('[data-test="before"]').focus();
      await page.evaluate(() => window.__mathBoxFocus.clear());
      for (let repeat = 0; repeat < 40 && await where(page) !== 'After the boxes'; repeat += 1) {
        await page.keyboard.down('Tab');
        await page.waitForTimeout(33);
      }
      await page.keyboard.up('Tab');
      await page.waitForTimeout(250);
      const stops = stopsOf(await focusLog(page));
      const boxes = stops.filter((stop) => stop.startsWith('box:'));
      assert.deepEqual(boxes, BOXES.map((box) => `box:${box}`), `each box once, in order (${stops.join(' > ')})`);
      assert.equal(stops.at(-1), 'After the boxes', `the walk reached the control after the boxes (${stops.join(' > ')})`);
      assert.equal(await where(page), 'After the boxes', 'and stayed there');
      await close();
    });
  }

  await check(`${at}: focus the page moves within ${HAND_OVER_MS} ms of a box taking it stays where it went`, async () => {
    const { page, close } = await open(size);
    const misses = [];
    for (const to of ['heading', 'message', 'box:y-intercept', 'after', 'blur']) {
      for (const delay of [0, 5, 30]) {
        await page.reload({ waitUntil: 'networkidle' });
        await page.locator('math-field').nth(BOXES.length - 1).waitFor();
        await page.locator('[data-test="before"]').focus();
        await page.evaluate(({ d, t }) => window.__mathBoxFocus.moveAwayAfterFocus('Slope', { delay: d, to: t }), { d: delay, t: to });
        await page.keyboard.press('Tab');
        await page.waitForTimeout(250);
        const moved = await page.evaluate(() => window.__mathBoxFocus.moved());
        const end = await where(page);
        const expected = to === 'blur' ? 'page' : to === 'after' ? 'After the boxes' : to;
        if (moved !== expected || end !== expected) misses.push(`${to} after ${delay} ms: moved to ${moved}, ended on ${end}`);
      }
    }
    assert.deepEqual(misses, [], 'every move kept its target');
    await close();
  });

  await check(`${at}: a box React moved in the page is guarded too: a Tab inside its hand-over moves on, 3 of 3`, async () => {
    const { page, close } = await open(size);
    const ends = [];
    for (let run = 0; run < 3; run += 1) {
      if (run) await page.reload({ waitUntil: 'networkidle' });
      await page.locator('math-field').nth(BOXES.length - 1).waitFor();
      const rebuilt = await page.evaluate(async () => {
        const before = window.__mathBoxFocus.sinkOf('x-intercept');
        window.__mathBoxFocus.reverse();
        await new Promise((resolve) => { setTimeout(resolve, 200); });
        return before !== window.__mathBoxFocus.sinkOf('x-intercept');
      });
      assert.equal(rebuilt, true, 'precondition: moving the box made MathLive build it a new sink');
      // As above: only a Tab inside the 60 ms counts, so a late one is tried again.
      let gap = Infinity;
      for (let attempt = 0; attempt < 3 && !(gap < HAND_OVER_MS); attempt += 1) {
        await page.locator('[data-test="before"]').focus();
        await page.waitForTimeout(150);
        await page.evaluate(() => window.__mathBoxFocus.clear());
        await press(page, size, 'x-intercept');
        await page.waitForTimeout(5);
        await page.keyboard.press('Tab');
        await page.waitForTimeout(250);
        gap = tabGap(await focusLog(page), 'x-intercept');
      }
      assert.ok(gap < HAND_OVER_MS, `run ${run + 1}: the Tab came ${Math.round(gap)} ms after the box took focus`);
      ends.push(await where(page));
    }
    assert.deepEqual(ends, Array(3).fill('toggle:x-intercept'), `focus went on to the box's keypad button every time (${ends.join(' | ')})`);
    await close();
  });

  await check(`${at}: a box takes focus by ${size.touch ? 'tap' : 'click'}, Tab and the page's own focus(), and keeps it`, async () => {
    const { page, close } = await open(size);
    await press(page, size, 'Slope');
    await page.waitForTimeout(250);
    assert.equal(await where(page), 'box:Slope', `by ${size.touch ? 'tap' : 'click'}`);
    await page.locator('[data-test="before"]').focus();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(250);
    assert.equal(await where(page), 'box:Slope', 'by Tab');
    for (const how of ['platform', 'element']) {
      await page.locator('[data-test="after"]').focus();
      await page.evaluate((h) => window.__mathBoxFocus.focusBox('Rate', h), how);
      await page.waitForTimeout(250);
      assert.equal(await where(page), 'box:Rate', `by the page's ${how === 'platform' ? 'own sink focus' : 'MathfieldElement.focus()'}`);
    }
    // After a blur, the page asking for the box again is obeyed.
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.evaluate(() => window.__mathBoxFocus.focusBox('y-intercept', 'element'));
    await page.waitForTimeout(250);
    assert.equal(await where(page), 'box:y-intercept', 'focus() after a blur');
    await close();
  });

  await check(`${at}: a keypad key pressed as the box takes focus types into it and leaves focus there`, async () => {
    const { page, close } = await open(size);
    if (!size.touch) {
      await page.locator('[data-box="Slope"] .mathmaster-math-tools-toggle').click();
      await page.locator('[data-box="Slope"] [role="toolbar"][aria-label="Math tools"]').waitFor();
    }
    // A phone's keypad opens as the box takes focus; a laptop's is open already.
    await press(page, size, 'Slope');
    const key = page.locator('[data-box="Slope"] [role="toolbar"][aria-label="Math tools"] button[aria-label="Insert square root"]');
    await key.waitFor();
    await (size.touch ? key.tap() : key.click());
    await page.waitForTimeout(250);
    const values = JSON.parse(await page.locator('[data-test="values"]').textContent());
    assert.match(values.Slope || '', /\\sqrt/, `the key typed a root into the box (${JSON.stringify(values)})`);
    assert.equal(await where(page), 'box:Slope', 'focus is in the box');
    await close();
  });

  await check(`${at}: MathLive's keyboard stays hidden${size.touch ? ', the phone\'s keyboard suppressed,' : ''} and its menu shut`, async () => {
    const { page, close } = await open(size);
    await press(page, size, 'Slope');
    await page.waitForTimeout(150);
    await page.locator('math-field[aria-label="Slope"]').click({ button: 'right' });
    await page.keyboard.press('Shift+F10');
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => ({
      keyboard: Boolean(window.mathVirtualKeyboard?.visible),
      menu: [...document.querySelectorAll('.ui-menu-container')].some((menu) => menu.getBoundingClientRect().height > 0),
      inputmode: document.querySelector('math-field[aria-label="Slope"]').getAttribute('inputmode'),
    }));
    assert.deepEqual(state, { keyboard: false, menu: false, inputmode: size.touch ? 'none' : null }, 'keyboard, menu and input mode');
    assert.equal(await where(page), 'box:Slope', 'focus stayed in the box');
    await close();
  });

  await check(`${at}: an IME composition started as the box takes focus lands in the box`, async () => {
    const { page, close } = await open(size);
    const cdp = await page.context().newCDPSession(page);
    await press(page, size, 'Slope');
    await cdp.send('Input.imeSetComposition', { text: '7', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '7' });
    await page.waitForTimeout(250);
    await cdp.send('Input.imeSetComposition', { text: '2', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '2' });
    await page.waitForTimeout(250);
    const values = JSON.parse(await page.locator('[data-test="values"]').textContent());
    assert.equal(values.Slope, '72', `both composed digits are in the box (${JSON.stringify(values)})`);
    assert.equal(await where(page), 'box:Slope', 'focus is in the box');
    await close();
  });
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log('Math box focus passed: focus that leaves a box stays where it went, and a box still takes focus as before.');
