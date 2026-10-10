/*
 * ACCESSIBLE PRIMITIVES — the Dialog, the keyboard focus ring and the
 * new-question announcement, in real Chromium at 1366×768 and 390×844.
 *
 *   npx vite --host 127.0.0.1 --port 5199 --strictPort &
 *   node tests/browser/accessiblePrimitives.mjs
 *
 * Dialog (src/ui/Dialog.jsx): opens with focus on the first control that is
 * not Close; Tab and Shift+Tab wrap; a nested confirm traps alone, opens on its
 * [data-autofocus] Cancel, and Escape closes only it; closeOnEscape={false}
 * holds; focus returns to the opener. Focus ring (src/index.css): an
 * interactive span with inline outline:none shows the ring on keyboard focus
 * and not on a mouse press. Announcer: a question change puts position and the
 * rendered prompt — math in words, no LaTeX — in a polite status region.
 */
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);
const focused = (page) => page.evaluate(() => document.activeElement?.getAttribute('data-test') || document.activeElement?.tagName);

for (const [width, height] of [[1366, 768], [390, 844]]) {
  const at = `${width}x${height}`;
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${origin}/tests/browser/accessiblePrimitives.html`, { waitUntil: 'networkidle' });

  // ---- Dialog
  await page.locator('[data-test="opener"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-test="dialog"]').waitFor();
  assert.equal(await focused(page), 'name', `${at}: opens on the first control that is not Close`);
  await page.locator('[data-test="delete"]').focus();
  assert.equal(await focused(page), 'delete');
  await page.keyboard.press('Tab'); // ask
  await page.keyboard.press('Tab');
  assert.equal(await focused(page), 'close', `${at}: Tab on the last wraps to the first`);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await focused(page), 'open-foreign', `${at}: Shift+Tab on the first wraps to the last`);

  // A modal that is not a Dialog opened on top (the Toast confirm): the Dialog
  // stands down — it neither pulls focus back nor answers Escape.
  await page.keyboard.press('Enter');
  await page.locator('[data-test="foreign"]').waitFor();
  await page.locator('[data-test="foreign-a"]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await focused(page), 'foreign-b', `${at}: Tab inside a later non-Dialog modal is left alone`);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-test="foreign"]').count(), 0, `${at}: the foreign modal closed itself`);
  assert.equal(await page.locator('[data-test="dialog"]').count(), 1, `${at}: …and the Dialog under it stayed open`);
  // Focus that escapes (a click on the page behind) is pulled back.
  await page.evaluate(() => document.querySelector('[data-test="opener"]').focus());
  assert.notEqual(await focused(page), 'opener', `${at}: focus cannot leave the dialog`);

  // Nested confirm: traps alone, Escape closes only it.
  await page.locator('[data-test="delete"]').click();
  await page.locator('[data-test="confirm"]').waitFor();
  assert.equal(await focused(page), 'confirm-no', `${at}: [data-autofocus] wins (least destructive)`);
  await page.keyboard.press('Tab');
  assert.equal(await focused(page), 'confirm-yes', `${at}: the confirm traps on its own`);
  // Focus moved into the PARENT dialog while the confirm is on top is pulled
  // back into the confirm (Codex review, PR #454).
  await page.evaluate(() => document.querySelector('[data-test="name"]').focus());
  assert.ok(['confirm-yes', 'confirm-no'].includes(await focused(page)), `${at}: focus cannot sit in the parent under an open confirm`);
  await page.locator('[data-test="confirm-yes"]').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-test="confirm"]').count(), 0, `${at}: Escape closed the confirm`);
  assert.equal(await page.locator('[data-test="dialog"]').count(), 1, `${at}: …and only the confirm`);
  assert.equal(await focused(page), 'delete', `${at}: focus back on the button that opened the confirm`);

  // Escape in a math field still closes the dialog: MathInput prevents its
  // default only to keep MathLive out of LaTeX mode (PR #454 review S1).
  await page.locator('[data-test="math"] math-field').first().click();
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-test="dialog"]').count(), 0, `${at}: Escape in a math field closes the dialog`);
  await page.locator('[data-test="opener"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-test="dialog"]').waitFor();

  // closeOnEscape={false} while busy.
  await page.locator('[data-test="busy"]').check();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-test="dialog"]').count(), 1, `${at}: Escape does not close while busy`);
  await page.locator('[data-test="busy"]').uncheck();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-test="dialog"]').count(), 0, `${at}: Escape closes`);
  assert.equal(await focused(page), 'opener', `${at}: focus returns to the opener`);

  // An opener disabled while the dialog loaded still gets focus back.
  await page.locator('[data-test="slow-opener"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-test="dialog"]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-test="dialog"]').count(), 0);
  assert.equal(await focused(page), 'slow-opener', `${at}: focus returns to an opener that was disabled while loading`);

  // A press that never took focus (Safari and iPadOS buttons): closing must not
  // jump to whatever was focused long before — an answer field, whose focus
  // would open a phone keypad (PR #454 review M1).
  await page.locator('[data-test="answer"]').focus();
  await page.evaluate(() => document.activeElement.blur());
  await page.evaluate(() => document.querySelector('[data-test="opener"]').click());
  await page.locator('[data-test="dialog"]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-test="dialog"]').count(), 0);
  assert.notEqual(await focused(page), 'answer', `${at}: closing does not focus an unrelated earlier field`);

  // ---- Focus ring on an interactive span with inline outline:none
  const outline = () => page.locator('[data-test="term"]').evaluate((el) => getComputedStyle(el).outlineStyle);
  await page.locator('[data-test="term"]').click();
  assert.equal(await outline(), 'none', `${at}: no ring for a mouse press`);
  await page.locator('[data-test="answer"]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await focused(page), 'term');
  assert.equal(await outline(), 'solid', `${at}: keyboard focus shows the ring despite inline outline:none`);

  // ---- New-question announcement
  const status = page.locator('[data-question-announcer]');
  assert.equal((await status.textContent()).trim(), '', `${at}: opening is not announced`);
  await page.locator('[data-test="next"]').click();
  await page.waitForFunction(() => document.querySelector('[data-question-announcer]').textContent.trim().length > 0);
  const said = (await status.textContent()).trim();
  assert.equal(said, 'Practice, question 2 of 3. Graph y equals negative 2 over 3 x plus 4.', `${at}: announcement`);
  assert.equal(await status.getAttribute('aria-live'), 'polite');
  assert.equal(await status.getAttribute('role'), 'status');
  await page.close();
  console.log(`${at}: dialog, focus ring and announcer OK`);
}
await browser.close();
