/*
 * THE "VALUES HAVE NOT CHANGED" CONFIRM FROM INSIDE WORK VIEW (review of #463,
 * MAJOR 2). Real QuestionEngine (tests/browser/feedbackTeaches.html, a
 * multi-part practice question), Chromium at 1366×768 and 390×844.
 *
 *   npx vite --config tests/browser/emulator/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/unchangedConfirmWorkView.mjs
 *
 * A wrong answer, then Work View, then Work View's own Submit with the same
 * values: the confirm must be ON TOP of Work View (what is under Go Back's
 * centre is Go Back), hold focus on Go Back, and Escape must close only it,
 * returning focus inside Work View. At z-index 12000 it opened behind Work
 * View (2147483000) and took focus there, invisible.
 *
 * Then the keyboard way out of Work View from a math field (TL15): the first
 * Escape leaves the field (keypad closed, focus on its √x button) and Work
 * View stays; the second closes it — with the keypad open and closed.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

for (const [width, height, mobile] of [[1366, 768, false], [390, 844, true]]) {
  const at = `${width}x${height}`;
  const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${ORIGIN}/tests/browser/feedbackTeaches.html?q=multi&role=practice&run=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.locator('[data-feedback-fixture]').waitFor();
  const field = page.locator('.mathmaster-question-tool-workspace math-field').first();
  await field.waitFor();
  await field.evaluate((element) => { element.setValue('1'); element.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
  await page.waitForFunction(() => (window.__mmGrades || []).length === 1);

  // Work View.
  await page.locator('button:visible', { hasText: /Open Work View/ }).first().click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-work-view-open') === 'true');
  const workViewSubmit = page.locator('[aria-modal="true"] button:visible', { hasText: /^Submit/ }).first();
  await workViewSubmit.focus();
  await page.keyboard.press('Enter');
  const goBack = page.locator('[data-unchanged-confirm] button', { hasText: 'Go Back' });
  await goBack.waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Go Back');
  const onTop = await goBack.evaluate((button) => {
    const r = button.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === button || button.contains(hit);
  });
  assert.ok(onTop, `${at}: the confirm is drawn above Work View (Go Back is what is under its centre)`);
  assert.equal((await page.evaluate(() => window.__mmGrades.length)), 1, `${at}: nothing was submitted yet`);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-unchanged-confirm]'));
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-work-view-open')), 'true', `${at}: Work View stays open`);
  assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest('[aria-modal="true"]'))), `${at}: focus is back inside Work View`);

  // TL15 (owner decision): in Work View, Escape in a math field leaves the
  // field — its keypad closes, focus moves onto the field's √x button — and
  // Work View stays; the next Escape closes Work View. Keypad open and closed
  // (a phone opens it on focus, a Chromebook only on request).
  const workViewOpen = () => page.evaluate(() => document.documentElement.getAttribute('data-work-view-open') === 'true');
  const wvInput = page.locator('[aria-modal="true"] .mathmaster-question-tool-workspace .mathmaster-math-input').first();
  const wvField = wvInput.locator('math-field');
  const wvKeypad = wvInput.locator('[role="toolbar"][aria-label="Math tools"]');
  const twoEscapes = async (label) => {
    assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest?.('math-field'))), `${at} ${label}: focus starts in the field`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.ok(await workViewOpen(), `${at} ${label}: the first Escape keeps Work View open`);
    assert.equal(await wvKeypad.count(), 0, `${at} ${label}: the keypad is closed`);
    assert.ok(await page.evaluate(() => document.activeElement?.classList?.contains('mathmaster-math-tools-toggle') === true
      && Boolean(document.activeElement.closest('[aria-modal="true"]'))), `${at} ${label}: focus is on the field's √x button, inside Work View`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.documentElement.getAttribute('data-work-view-open') !== 'true');
  };
  const openWorkView = async () => {
    await page.locator('button:visible', { hasText: /Open Work View/ }).first().click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-work-view-open') === 'true');
    await wvField.waitFor();
  };
  assert.equal(await wvField.count(), 1, `${at}: the answer box is in Work View`);
  await wvField.click();
  await page.waitForTimeout(200);
  // Whichever state the item opens the keypad in, then the other one.
  const startsOpen = (await wvKeypad.count()) === 1;
  await twoEscapes(startsOpen ? 'keypad open' : 'keypad closed');
  await openWorkView();
  await wvField.click();
  await page.waitForTimeout(200);
  // The √x button (which keeps focus in the field) gives the other state.
  if (((await wvKeypad.count()) === 1) === startsOpen) {
    await wvInput.locator('.mathmaster-math-tools-toggle').click();
    await page.waitForTimeout(200);
  }
  assert.equal(await wvKeypad.count(), startsOpen ? 0 : 1, `${at}: the keypad is now ${startsOpen ? 'closed' : 'open'}`);
  await twoEscapes(startsOpen ? 'keypad closed' : 'keypad open');
  assert.deepEqual(errors, [], `${at}: no page errors`);
  console.log(`unchanged confirm over Work View ${at}: ok`);
  await context.close();
}
await browser.close();
console.log('unchangedConfirmWorkView: all checks passed');
