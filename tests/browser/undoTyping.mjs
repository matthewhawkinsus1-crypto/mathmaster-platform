// ONE UNDO TAKES BACK WHAT THE STUDENT TYPED, AND THE FIELD AGREES WITH IT.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/undoTyping.mjs
//
// The real QuestionEngine and its platform Undo, over two registry tools:
//
//   Relation Mapping (plain inputs). Undo took back ONE CHARACTER per press —
//   eight presses for "-2, 1, 3" — and a long answer spent the 60-entry limit
//   (src/platform/workView/mathUndoStack.js, "THE STUDENT TYPES"). A run of
//   typing in one field is now one step; a pause or another field starts the
//   next.
//
//   Interval Number Line (MathLive). MathLive keeps its own undo per field.
//   After the platform Undo cleared "[-3,5)", Ctrl+Z in the field put it back.
//   The field's history now starts at whatever the platform wrote
//   (MathInput.jsx, resetUndo). Guarded alongside: Ctrl+Z on the student's own
//   typing still works, and a restored draft survives a Ctrl+Z.
//
// Exits non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

const run = Date.now();
let pageNumber = 0;
const open = async (tool, { reuse = null } = {}) => {
  const page = reuse || await context.newPage();
  if (!reuse) page.on('pageerror', (error) => failures.push(`${tool}: page error ${error.message}`));
  pageNumber += reuse ? 0 : 1;
  await page.goto(`${ORIGIN}/tests/browser/undoTyping.html?tool=${tool}&run=${run}-${pageNumber}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  return page;
};
const platformUndo = (page) => page.locator('.mathmaster-universal-undo:visible').first();
const pressUndo = async (page) => {
  const undo = platformUndo(page);
  if (!(await undo.isEnabled())) return false;
  await undo.click();
  await page.waitForTimeout(150);
  return true;
};
const type = async (page, text) => { await page.keyboard.type(text, { delay: 60 }); await page.waitForTimeout(250); };

// RELATION MAPPING: typing groups into steps.
{
  const page = await open('relationMapping');
  const domain = page.locator('input[placeholder^="e.g. -4"]');
  const range = page.locator('input[placeholder^="e.g. -3"]');
  await domain.click();
  await type(page, '-2, 1, 3');
  check(await pressUndo(page), 'relation: the platform Undo is enabled after typing');
  check(await domain.inputValue() === '', 'relation: ONE Undo takes back "-2, 1, 3"', JSON.stringify(await domain.inputValue()));
  check(!(await platformUndo(page).isEnabled()), 'relation: and there is nothing left to undo');

  await domain.click();
  await type(page, '-2');
  await page.waitForTimeout(1400);
  await type(page, ', 1');
  await pressUndo(page);
  check(await domain.inputValue() === '-2', 'relation: after a pause, Undo goes back to where the student stopped', JSON.stringify(await domain.inputValue()));
  await pressUndo(page);
  check(await domain.inputValue() === '', 'relation: and the next Undo to before that', JSON.stringify(await domain.inputValue()));

  await domain.click();
  await type(page, '1, 3');
  await range.click();
  await type(page, '2, 4');
  await pressUndo(page);
  check(await range.inputValue() === '' && await domain.inputValue() === '1, 3', 'relation: another field is another step', `${JSON.stringify(await domain.inputValue())} / ${JSON.stringify(await range.inputValue())}`);
  await page.close();
}

// BY KEYBOARD: the press that takes back the last step keeps the focus. A
// natively disabled button cannot hold it, so it used to drop to the page and
// a keyboard or screen-reader user lost their place.
{
  const page = await open('relationMapping');
  const domain = page.locator('input[placeholder^="e.g. -4"]');
  await domain.click();
  await type(page, '4, 5');
  const undo = platformUndo(page);
  await undo.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check(await domain.inputValue() === '', 'keyboard: Enter on Undo takes back the typing', JSON.stringify(await domain.inputValue()));
  const focus = await page.evaluate(() => ({
    onUndo: Boolean(document.activeElement?.classList?.contains('mathmaster-universal-undo')),
    ariaDisabled: document.activeElement?.getAttribute('aria-disabled') ?? null,
  }));
  check(focus.onUndo && focus.ariaDisabled === 'true', 'keyboard: focus stays on Undo, which now says it is unavailable', JSON.stringify(focus));
  check(!(await undo.isEnabled()), 'keyboard: and it reads as not enabled');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check(await domain.inputValue() === '', 'keyboard: another Enter changes nothing');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(100);
  check(await undo.evaluate((element) => element.disabled), 'keyboard: once focus moves on, Undo is disabled as before');
  await page.close();
}

// INTERVAL NUMBER LINE: MathLive's own undo agrees with the platform's.
{
  const page = await open('intervalNumberLine');
  const field = page.locator('math-field').first();
  const value = () => field.evaluate((element) => element.value);
  await field.click();
  await type(page, '[-3');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(await value() === '[-', 'math field: Ctrl+Z on the student\'s own typing still works', JSON.stringify(await value()));
  await type(page, '3,5)');
  check(await value() === '[-3,5)', 'math field: typed', JSON.stringify(await value()));

  await pressUndo(page);
  check(await value() === '', 'math field: the platform Undo clears it', JSON.stringify(await value()));
  await field.click();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  check(await value() === '', 'math field: Ctrl+Z in the field does not bring back what Undo removed', JSON.stringify(await value()));

  await page.close();
}

// A REFRESH: the restored answer is where the field's history starts.
{
  const page = await open('intervalNumberLine');
  await page.locator('math-field').first().click();
  await type(page, '(1,2]');
  await page.waitForTimeout(800);
  await open('intervalNumberLine', { reuse: page });
  const restored = page.locator('math-field').first();
  check(await restored.evaluate((element) => element.value) === '(1,2]', 'math field: a refresh restores the draft', JSON.stringify(await restored.evaluate((element) => element.value)));
  await restored.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  check(await restored.evaluate((element) => element.value) === '(1,2]', 'math field: Ctrl+Z after a refresh does not empty the restored answer', JSON.stringify(await restored.evaluate((element) => element.value)));
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} undo failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nundo: one step per thing the student did, and every field agrees.');
