/*
 * REGRESSION CALCULATOR BY KEYBOARD ALONE (KEYBOARD_SWEEP.md T5).
 *
 *   npx vite --host 127.0.0.1 --port 5504 --strictPort &
 *   AUDIT_ORIGIN=http://127.0.0.1:5504 node tests/browser/toolKeyboardRegression.mjs
 *
 * Mounts the calculator through QuestionEngine on the keyboard-sweep harness
 * (tests/browser/keyboardSweep.html, SAMPLE_SPECS question) at 1366x768 and
 * 390x844 and, with keys only after focusing the start sentinel:
 *
 *   1. the "Add Item" menu button: Enter / Space / ArrowDown open on the first
 *      item, ArrowUp on the last enabled one; ArrowDown/ArrowUp wrap over the
 *      enabled items (inference is disabled and skipped); Home/End; Escape
 *      closes and returns focus to the trigger; Tab closes and moves on;
 *   2. chooses "table" with Enter, types the source data, adds the regression,
 *      interprets it with the selects and submits — and the harness records a
 *      grade (window.__KB_GRADES__);
 *   3. does the same answer with the mouse on a fresh page and requires the
 *      same table, the same regression read-out, the same selects and the same
 *      grade.
 *
 * Exits non-zero on the first failed assertion.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5504';
const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const SOURCE = [[1, 3], [2, 5], [3, 6], [4, 9], [5, 10]];

const active = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: 'BODY', label: '', role: '', text: '' };
  return {
    tag: el.tagName,
    label: el.getAttribute('aria-label') || '',
    role: el.getAttribute('role') || '',
    text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
  };
});
const menuOpen = (page) => page.locator('.regression-add-menu[role="menu"]').count();
const triggerExpanded = (page) => page.locator('button[aria-label="Add Item"]').getAttribute('aria-expanded');

const tabUntil = async (page, test, { reverse = false, max = 120, what }) => {
  for (let i = 0; i < max; i += 1) {
    if (test(await active(page))) return;
    await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
  }
  throw new Error(`Tab never reached ${what}`);
};

const openHarness = async (width, height) => {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${origin}/tests/browser/keyboardSweep.html?tool=regressionCalculator&run=${Date.now()}`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.locator('button[aria-label="Add Item"]').waitFor({ timeout: 120000 });
  return page;
};

// Everything the student built that the grade reads, as the screen shows it.
const snapshot = (page) => page.evaluate(() => ({
  table: [...document.querySelectorAll('.regression-table input')].map((input) => input.value),
  expressions: [...document.querySelectorAll('.regression-expression-row input')].map((input) => input.value),
  result: document.querySelector('.regression-result')?.textContent.replace(/\s+/g, ' ').trim() || '',
  selects: [...document.querySelectorAll('.regression-interpretation select')].map((select) => select.value),
  grades: (window.__KB_GRADES__ || []).filter((entry) => entry.kind === 'grade').map((entry) => entry.isCorrect),
}));

const keyboardRoute = async (width, height) => {
  const at = `${width}x${height}`;
  const page = await openHarness(width, height);
  await page.locator('[data-kb-sentinel="start"]').focus();
  const isTrigger = (a) => a.label === 'Add Item' && a.role !== 'menu' && a.tag === 'BUTTON' && a.role !== 'menuitem';
  await tabUntil(page, isTrigger, { what: 'the Add Item trigger' });

  // Enter opens on the first item.
  await page.keyboard.press('Enter');
  assert.equal(await menuOpen(page), 1, `${at}: Enter opens the menu`);
  assert.equal(await triggerExpanded(page), 'true', `${at}: trigger reports expanded`);
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
  assert.match((await active(page)).text, /expression$/, `${at}: opening focuses the first item`);
  const tabbable = await page.locator('.regression-add-menu [role="menuitem"]').evaluateAll((items) => items.map((item) => item.tabIndex));
  assert.deepEqual(tabbable, [-1, -1, -1], `${at}: menu items rove (tabIndex -1), they are not tab stops`);

  // Arrows wrap over the enabled items; inference is disabled and skipped.
  await page.keyboard.press('ArrowDown');
  assert.match((await active(page)).text, /table$/, `${at}: ArrowDown moves to table`);
  await page.keyboard.press('ArrowDown');
  assert.match((await active(page)).text, /expression$/, `${at}: ArrowDown wraps past the disabled item`);
  await page.keyboard.press('ArrowUp');
  assert.match((await active(page)).text, /table$/, `${at}: ArrowUp wraps to the last enabled item`);
  await page.keyboard.press('Home');
  assert.match((await active(page)).text, /expression$/, `${at}: Home`);
  await page.keyboard.press('End');
  assert.match((await active(page)).text, /table$/, `${at}: End`);

  // Escape closes and returns focus to the trigger.
  await page.keyboard.press('Escape');
  assert.equal(await menuOpen(page), 0, `${at}: Escape closes the menu`);
  assert.equal(await triggerExpanded(page), 'false', `${at}: trigger reports collapsed`);
  assert.ok(isTrigger(await active(page)), `${at}: Escape returns focus to the trigger`);

  // ArrowUp on the trigger opens on the last enabled item; ArrowDown on the first.
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
  assert.match((await active(page)).text, /table$/, `${at}: ArrowUp opens on the last enabled item`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
  assert.match((await active(page)).text, /expression$/, `${at}: ArrowDown opens on the first item`);

  // Tab leaves the menu and closes it, without dropping focus to <body>.
  await page.keyboard.press('Tab');
  assert.equal(await menuOpen(page), 0, `${at}: Tab closes the menu`);
  assert.notEqual((await active(page)).tag, 'BODY', `${at}: Tab moved focus on, not to <body>`);
  await tabUntil(page, isTrigger, { reverse: true, what: 'the Add Item trigger (back)' });

  // Space opens; choose "table" with Enter: the same click handler a pointer uses.
  await page.keyboard.press(' ');
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.locator('.regression-table').waitFor();
  assert.equal(await menuOpen(page), 0, `${at}: choosing closes the menu`);
  assert.ok(isTrigger(await active(page)), `${at}: after choosing table focus returns to the trigger, not <body>`);
  assert.equal(await page.locator('.regression-table').count(), 1, `${at}: one table created`);

  // Type the source data; Enter walks the cells.
  await tabUntil(page, (a) => a.label === 'x row 1', { what: 'x row 1' });
  for (const [x, y] of SOURCE) {
    await page.keyboard.type(String(x));
    await page.keyboard.press('Enter');
    await page.keyboard.type(String(y));
    await page.keyboard.press('Enter');
  }
  // Add Regression sits in the table row's gutter, before the cells.
  await tabUntil(page, (a) => a.label === 'Add Regression', { reverse: true, what: 'Add Regression' });
  await page.keyboard.press('Enter');
  await page.locator('.regression-result').waitFor();

  await tabUntil(page, (a) => a.tag === 'SELECT', { what: 'the Direction select' });
  await page.keyboard.press('ArrowDown'); // Positive
  await page.keyboard.press('Tab');
  assert.equal((await active(page)).tag, 'SELECT', `${at}: Strength select follows`);
  await page.keyboard.press('ArrowDown'); // Strong
  await tabUntil(page, (a) => a.text === 'Submit my regression', { what: 'Submit my regression' });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window.__KB_GRADES__ || []).some((entry) => entry.kind === 'grade'), null, { timeout: 30000 });

  const state = await snapshot(page);
  assert.deepEqual(state.table.slice(0, 10), SOURCE.flat().map(String), `${at}: table holds the typed source data`);
  assert.deepEqual(state.selects, ['positive', 'strong'], `${at}: interpretation chosen by keys`);
  assert.match(state.result, /r = 0\.9\d{3}/, `${at}: regression ran`);
  assert.ok(state.grades.length >= 1, `${at}: the tool graded`);
  await page.close();
  return state;
};

const pointerRoute = async (width, height) => {
  const page = await openHarness(width, height);
  await page.locator('button[aria-label="Add Item"]').click();
  await page.getByRole('menuitem', { name: 'table' }).click();
  const cells = page.locator('.regression-table input');
  for (const [index, value] of SOURCE.flat().entries()) await cells.nth(index).fill(String(value));
  await page.getByRole('button', { name: 'Add Regression' }).click();
  await page.locator('.regression-result').waitFor();
  await page.getByLabel('Direction').selectOption('positive');
  await page.getByLabel('Strength').selectOption('strong');
  await page.getByRole('button', { name: 'Submit my regression' }).click();
  await page.waitForFunction(() => (window.__KB_GRADES__ || []).some((entry) => entry.kind === 'grade'), null, { timeout: 30000 });
  const state = await snapshot(page);
  await page.close();
  return state;
};

let failed = false;
try {
  for (const [width, height] of [[1366, 768], [390, 844]]) {
    const keyboard = await keyboardRoute(width, height);
    const pointer = await pointerRoute(width, height);
    assert.deepEqual(keyboard, pointer, `${width}x${height}: keyboard and pointer reach the same state and grade`);
    console.log(`${width}x${height}: keyboard route ok, grade ${JSON.stringify(keyboard.grades)} matches pointer`);
  }
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
