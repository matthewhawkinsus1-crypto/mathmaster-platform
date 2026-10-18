/*
 * THE CALCULATOR BY KEYBOARD (KEYBOARD_SWEEP S7) — real Chromium, 1366×768 and
 * 390×844, the tool mounted through QuestionEngine (keyboardSweep.html).
 *
 *   npx vite --config tests/browser/emulator/vite.config.mjs --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/calculatorKeyboard.mjs
 *
 * Opened from the work bar by Enter, focus is in the expression; Escape closes
 * it and focus returns to the work bar's Calculator button; ✕ does the same.
 * "Move calculator" moves it with the arrow keys and sends it to the next
 * corner on Enter, always inside the viewport. A mouse press on ↕ still drags
 * (it never jumps to a corner). Escape with the calculator open over Work View
 * closes the calculator only.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const PANEL = '.mathmaster-calculator-panel';
const OPENER = 'button.mathmaster-work-bar-tool[aria-label="Calculator"]';
const activeIs = (page, selector) => page.evaluate((s) => document.activeElement?.matches?.(s) ?? false, selector);
const panelBox = (page) => page.locator(PANEL).boundingBox();

for (const [width, height] of [[1366, 768], [390, 844]]) {
  const at = `${width}x${height}`;
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${origin}/tests/browser/keyboardSweep.html?tool=linearTableWorkbench`, { waitUntil: 'networkidle' });
  await page.waitForSelector(OPENER);

  // Open by keyboard: focus lands in the expression field.
  await page.locator(OPENER).focus();
  await page.keyboard.press('Enter');
  await page.locator(PANEL).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches?.('[data-calculator-expression]'));
  await page.keyboard.type('2+3');
  await page.keyboard.press('Escape');
  await page.waitForFunction((s) => !document.querySelector(s), PANEL);
  assert.ok(await activeIs(page, OPENER), `${at}: Escape returns focus to the Calculator button`);
  assert.equal(await page.locator(OPENER).getAttribute('aria-expanded'), 'false', `${at}: the work bar knows it closed`);

  // Pass 3, A11Y-6: every key has a spoken name, and the answer is announced.
  await page.keyboard.press('Enter');
  await page.locator(PANEL).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches?.('[data-calculator-expression]'));
  const keyNames = await page.locator(`${PANEL} button`).evaluateAll((keys) => keys.map((key) => key.getAttribute('aria-label') || ''));
  assert.ok(keyNames.length > 18 && keyNames.every(Boolean), `${at}: every calculator button has a name ${JSON.stringify(keyNames)}`);
  for (const name of ['Clear', 'Equals', 'Insert exponent', 'Insert stacked fraction', 'Minus']) {
    assert.ok(keyNames.includes(name), `${at}: a key is named "${name}"`);
  }
  const announcement = () => page.locator(`${PANEL} [data-calculator-result-announcement]`).textContent().then((text) => text.replace(/ /g, ' ').trim());
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('3.75*2');
  await page.keyboard.press('Enter');
  await page.waitForFunction((s) => /equals/.test(document.querySelector(s)?.textContent || ''), `${PANEL} [data-calculator-result-announcement]`);
  assert.equal(await announcement(), 'equals 7.5, exactly 15 over 2', `${at}: Enter announces the answer and its fraction`);
  assert.equal(await page.locator(`${PANEL} [data-calculator-result-announcement]`).getAttribute('role'), 'status');
  await page.locator('[data-calculator-expression]').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('2+3');
  await page.locator(`${PANEL} button[aria-label="Equals"]`).click();
  await page.waitForFunction((s) => document.querySelector(s)?.textContent?.trim() === 'equals 5' || document.querySelector(s)?.textContent?.replace(/ /g, '').trim() === 'equals 5', `${PANEL} [data-calculator-result-announcement]`);
  // After Clear the field shows "0". A key typed on the keyboard replaces it,
  // as the keypad does: "(2+3" is (2+3) = 5, never 0(2+3) = 0.
  await page.locator(`${PANEL} button[aria-label="Clear"]`).click();
  await page.locator('[data-calculator-expression]').focus();
  await page.keyboard.type('(2+3');
  await page.keyboard.press('Enter');
  await page.waitForFunction((s) => /equals|could|read|bracket/.test(document.querySelector(s)?.textContent || ''), `${PANEL} [data-calculator-result-announcement]`);
  assert.equal(await announcement(), 'equals 5', `${at}: typing after Clear replaces the 0`);
  // What the calculator could not read is shown under "Error" and said (TOOL-8).
  await page.locator(`${PANEL} button[aria-label="Clear"]`).click();
  await page.locator('[data-calculator-expression]').focus();
  await page.keyboard.type('2+3=5');
  await page.keyboard.press('Enter');
  await page.locator(`${PANEL} [data-calculator-error]`).waitFor();
  const unreadable = 'It could not read “=”. Use numbers, + − × ÷, brackets and the function keys.';
  assert.equal((await page.locator(`${PANEL} [data-calculator-error]`).textContent()).trim(), unreadable, `${at}: the reason is shown`);
  assert.equal(await announcement(), unreadable, `${at}: and said`);
  for (const control of ['Close calculator', 'Move calculator']) {
    const box = await page.locator(`${PANEL} [aria-label="${control}"]`).boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `${at}: ${control} is a 44px target (${box.width}×${box.height})`);
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction((s) => !document.querySelector(s), PANEL);
  await page.locator(OPENER).focus();

  // ✕ by keyboard: same return.
  await page.keyboard.press('Enter');
  await page.locator(PANEL).waitFor();
  await page.locator(`${PANEL} [aria-label="Close calculator"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction((s) => !document.querySelector(s), PANEL);
  assert.ok(await activeIs(page, OPENER), `${at}: Close returns focus to the Calculator button`);

  // Move calculator: arrows and corners, always on screen.
  await page.keyboard.press('Enter');
  await page.locator(PANEL).waitFor();
  const move = page.locator(`${PANEL} [data-calculator-move]`);
  assert.equal(await move.getAttribute('aria-label'), 'Move calculator');
  await move.focus();
  const start = await panelBox(page);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(80);
  const left = await panelBox(page);
  if (start.x > 8 + 24) assert.ok(Math.abs(left.x - (start.x - 24)) < 1.5, `${at}: ArrowLeft moves 24px (${start.x} → ${left.x})`);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(80);
  const up = await panelBox(page);
  assert.ok(up.y < left.y || left.y <= 8.5, `${at}: ArrowUp moves up`);
  const corners = [];
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    const box = await panelBox(page);
    corners.push(box);
    assert.ok(box.x >= 7.5 && box.y >= 7.5 && box.x + box.width <= width - 7.5 && box.y + box.height <= height - 7.5, `${at}: corner ${i} on screen ${JSON.stringify(box)}`);
  }
  assert.ok(corners[1].y < corners[0].y + 1 || height - corners[0].height < 20, `${at}: Enter cycles bottom-left → top-left`);
  assert.ok(Math.abs(corners[0].x - 8) < 1.5, `${at}: first corner is bottom-left`);
  assert.ok(await activeIs(page, '[data-calculator-move]'), `${at}: focus stays on Move`);
  assert.match(await page.locator(`${PANEL} [role="status"]`).first().textContent(), /corner/, `${at}: the move is announced`);

  // Pointer unchanged: a press-and-drag on ↕ drags, and never jumps to a corner.
  const before = await move.boundingBox();
  const panelBefore = await panelBox(page);
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 20, before.y + before.height / 2 + 30, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const dragged = await panelBox(page);
  const expectX = Math.min(width - panelBefore.width - 8, panelBefore.x + 20);
  const expectY = Math.min(height - panelBefore.height - 8, panelBefore.y + 30);
  assert.ok(Math.abs(dragged.x - expectX) < 2 && Math.abs(dragged.y - expectY) < 2, `${at}: dragging ↕ still drags (${JSON.stringify(panelBefore)} → ${JSON.stringify(dragged)})`);
  // A plain click on ↕ (no movement) leaves the panel where it is.
  await page.mouse.click(before.x + 20 + before.width / 2, before.y + 30 + before.height / 2);
  await page.waitForTimeout(120);
  const clicked = await panelBox(page);
  assert.ok(Math.abs(clicked.x - dragged.x) < 2 && Math.abs(clicked.y - dragged.y) < 2, `${at}: a click on ↕ does not jump to a corner`);

  // Escape from Move closes and returns focus too.
  await move.focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction((s) => !document.querySelector(s), PANEL);
  assert.ok(await activeIs(page, OPENER), `${at}: Escape from Move returns focus`);
  assert.deepEqual(errors, [], `${at}: no page errors`);
  await page.close();
  console.log(`calculator keyboard ${at}: ok`);
}

// Over Work View: one Escape closes the calculator, the second Work View.
{
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`${origin}/tests/browser/keyboardSweep.html?tool=graphing2`, { waitUntil: 'networkidle' });
  const enlarge = page.locator('button:has-text("Open Work View")').first();
  const modals = () => page.locator('[aria-modal="true"]').count();
  const modalsBefore = await modals();
  if (await enlarge.count()) {
    await enlarge.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction((n) => document.querySelectorAll('[aria-modal="true"]').length > n, modalsBefore);
    const opener = page.locator(`[aria-modal="true"] button:visible`, { hasText: /^\s*\S*\s*Calculator\s*$/ }).first();
    await opener.focus();
    await page.keyboard.press('Enter');
    await page.locator(PANEL).waitFor();
    await page.waitForFunction(() => document.activeElement?.matches?.('[data-calculator-expression]'));
    await page.keyboard.press('Escape');
    await page.waitForFunction((s) => !document.querySelector(s), PANEL);
    assert.ok(await modals() > modalsBefore, 'Work View stays open after the calculator closes');
    assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest('[aria-modal="true"]'))), 'focus is back inside Work View');
    await page.keyboard.press('Escape');
    await page.waitForFunction((n) => document.querySelectorAll('[aria-modal="true"]').length === n, modalsBefore);
    console.log('calculator over Work View: ok');
  } else {
    throw new Error('graphing2 has no Open Work View button');
  }
  await page.close();
}
await browser.close();
console.log('calculatorKeyboard: all checks passed');
