/*
 * NUMBER LINE BY KEYBOARD ONLY (KEYBOARD_SWEEP T3 + T4), in real Chromium at
 * 1366x768 and 390x844.
 *
 *   npx vite --host 127.0.0.1 --port 5503 --strictPort &
 *   AUDIT_ORIGIN=http://127.0.0.1:5503 node tests/browser/toolKeyboardNumberLine.mjs
 *
 * The Interval Number Line is mounted through QuestionEngine on the keyboard
 * sweep harness (tests/browser/keyboardSweep.html, the SAMPLE_SPECS question:
 * the answer is [-3, 5), asked here as the graph alone). Everything after the
 * page loads is a key press:
 *
 *   the line      Tab to it, the placement marker shows; ArrowLeft x3, Enter
 *                 places a closed endpoint at -3; Shift+Tab to "Open", Enter;
 *                 Tab back, arrows to 5, Space places the open endpoint.
 *   an endpoint   Tab to "Open endpoint at 5": Enter makes it closed, Space
 *                 open again, focus stays on it. Tab to the -3 endpoint:
 *                 ArrowLeft moves it to -4 and announces it, ArrowRight back.
 *   Check         Tab to the tool's Check, Enter: QuestionEngine records a
 *                 grade (onGrade), and it is correct.
 *
 * At 1366x768 the same graph built by mouse clicks on the line records the
 * same graph and the same grade. Exits non-zero on any failure.
 */
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5503';
const launch = { args: ['--no-sandbox'] };
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
try { if (statSync(executablePath).isFile()) launch.executablePath = executablePath; } catch { /* Playwright's default */ }

const SPEC = encodeURIComponent(JSON.stringify({ ask: ['graph'] }));
const URL = `${origin}/tests/browser/keyboardSweep.html?tool=intervalNumberLine&spec=${SPEC}`;
const LINE = 'svg[role="application"]';
const NO_VERDICT = /correct|right|wrong|incorrect|well done|not yet/i;

const browser = await chromium.launch(launch);
let failures = 0;

const active = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return {
    tag: el?.tagName?.toLowerCase() || '',
    role: el?.getAttribute?.('role') || '',
    label: el?.getAttribute?.('aria-label') || el?.textContent?.trim().slice(0, 60) || '',
    submit: el?.getAttribute?.('data-mm-enter-action') === 'submit',
  };
});

/* Tab (or Shift+Tab) until the focused element satisfies `want`. Keys only. */
const tabTo = async (page, want, what, { back = false, limit = 80 } = {}) => {
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    const now = await active(page);
    if (want(now)) return now;
  }
  throw new Error(`could not ${back ? 'Shift+Tab' : 'Tab'} to ${what}`);
};

const announcement = (page) => page.locator('[data-number-line-endpoint-announcement]').first().textContent();
const endpointLabels = (page) => page.locator(`${LINE} g[role="button"]`).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label').split('.')[0]));
const grades = (page) => page.evaluate(() => window.__KB_GRADES__.filter((g) => g.kind === 'grade'));
/* The focused element's computed outline, and whether it matches :focus-visible. */
const focusRing = (page) => page.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  return { tag: el.tagName.toLowerCase(), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) || 0, focusVisible: el.matches(':focus-visible') };
});
const graphText = (page) => page.locator('p[aria-live="polite"]', { hasText: 'Your graph' }).first().textContent();

for (const [width, height] of [[1366, 768], [390, 844]]) {
  const at = `${width}x${height}`;
  try {
    /* ---------------------------------------------------- keyboard only */
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.locator(LINE).first().waitFor();

    // The line: a tab stop in its own right, with a visible marker on keyboard focus.
    const line = await tabTo(page, (el) => el.tag === 'svg' && el.role === 'application', 'the number line');
    assert.match(line.label, /arrow keys/i, `${at}: the line says how to use it from the keyboard`);
    assert.equal(await page.locator('[data-number-line-marker]').count(), 1, `${at}: the placement marker shows on keyboard focus`);
    const keyRing = await focusRing(page);
    assert.ok(keyRing.focusVisible && keyRing.style !== 'none' && keyRing.width >= 2, `${at}: keyboard focus on the line draws a focus ring (${JSON.stringify(keyRing)})`);
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowLeft');
    assert.match(await announcement(page), /^Marker at −3\./, `${at}: the marker position is announced`);
    await page.keyboard.press('Enter');
    assert.deepEqual(await endpointLabels(page), ['Closed pending endpoint at −3'], `${at}: Enter placed a closed endpoint at -3`);
    assert.match(await page.locator('p[aria-live="polite"]:not([data-number-line-endpoint-announcement])').first().textContent(), /^Closed endpoint at −3\. Place a second endpoint/, `${at}: the status line reads out the new endpoint`);

    await tabTo(page, (el) => el.tag === 'button' && /○ Open/.test(el.label), 'the Open mode button', { back: true });
    await page.keyboard.press('Enter');
    await tabTo(page, (el) => el.tag === 'svg' && el.role === 'application', 'the number line again');
    for (let i = 0; i < 8; i += 1) await page.keyboard.press('ArrowRight');
    assert.match(await announcement(page), /^Marker at 5\./);
    await page.keyboard.press(' ');
    assert.deepEqual(await endpointLabels(page), ['Closed endpoint at −3', 'Open endpoint at 5'], `${at}: Space placed the open endpoint at 5`);
    assert.equal(await announcement(page), 'Open endpoint placed at 5. Graph piece from −3 to 5 added.');
    assert.equal((await graphText(page)).trim(), 'Your graph: [-3, 5)');

    // An endpoint: Enter / Space switch it, exactly as a click does, and focus stays.
    let focused = await tabTo(page, (el) => el.role === 'button' && el.label.startsWith('Open endpoint at 5.'), 'the endpoint at 5');
    assert.match(focused.label, /Enter or Space to switch open or closed.*arrow keys to move it/, `${at}: the endpoint names its keys`);
    await page.keyboard.press('Enter');
    focused = await active(page);
    assert.match(focused.label, /^Closed endpoint at 5\./, `${at}: Enter closed the endpoint and kept focus on it`);
    assert.equal(await announcement(page), 'Closed endpoint at 5.');
    await page.keyboard.press(' ');
    assert.match((await active(page)).label, /^Open endpoint at 5\./, `${at}: Space opened it again`);

    // Arrows move it by the snap step.
    await tabTo(page, (el) => el.role === 'button' && el.label.startsWith('Closed endpoint at −3.'), 'the endpoint at -3', { back: true });
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('ArrowLeft');
    assert.match((await active(page)).label, /^Closed endpoint at −4\./, `${at}: ArrowLeft moved the endpoint one step`);
    assert.equal(await announcement(page), 'Closed endpoint at −4.');
    assert.equal((await graphText(page)).trim(), 'Your graph: [-4, 5)');
    await page.keyboard.press('Shift+ArrowRight');
    assert.match((await active(page)).label, /^Closed endpoint at 1\./, `${at}: Shift+ArrowRight moved five steps`);
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('ArrowRight');
    assert.match((await active(page)).label, /^Closed endpoint at −3\./);
    assert.equal(await page.evaluate(() => window.scrollY), scrollBefore, `${at}: arrows did not scroll the page`);
    assert.doesNotMatch(await announcement(page), NO_VERDICT, `${at}: the announcement carries no verdict`);
    assert.equal((await grades(page)).length, 0, 'nothing graded before Check');

    // Check, by keyboard: the tool graded, and the keyboard-built graph is right.
    const check = await tabTo(page, (el) => el.submit, "the tool's Check button");
    assert.match(check.label, /Check|Record/);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__KB_GRADES__.some((g) => g.kind === 'grade'), null, { timeout: 5000 });
    const keyboardGrades = await grades(page);
    assert.equal(keyboardGrades.at(-1).isCorrect, true, `${at}: the keyboard-built [-3, 5) graded correct`);
    const keyboardGraph = (await graphText(page)).trim();
    await page.close();

    /* ---------------------------------------------- the same by pointer */
    // At 1366 only: at 390 the harness page (no app shell) collapses the tool's
    // workspace scroller to a few pixels under the work bar, which keys reach
    // but a real mouse cannot. Pointer/keyboard state and grade equality is
    // proven for every route in tests/tools/intervalNumberLineKeyboard.test.mjs.
    if (width < 800) {
      console.log(`ok ${at}: number line placed, switched, moved and checked by keyboard`);
      continue;
    }
    const mouse = await browser.newPage({ viewport: { width, height } });
    await mouse.goto(URL, { waitUntil: 'networkidle' });
    const svg = mouse.locator(LINE).first();
    await svg.scrollIntoViewIfNeeded();
    // The viewBox x of a value on this line (min -7.5, max 10; PAD 42 of 620).
    const vbX = (v) => 42 + ((v + 7.5) / 17.5) * (620 - 84);
    const clickAt = async (v) => {
      const box = await svg.boundingBox();
      await mouse.mouse.click(box.x + (vbX(v) / 620) * box.width, box.y + box.height / 2);
    };
    // A pointer press must look exactly as it did before the line became a tab
    // stop: it focuses the svg, but draws no focus ring and no marker.
    const beforeClick = await svg.evaluate((el) => getComputedStyle(el).outlineStyle);
    await clickAt(-3);
    const clickRing = await focusRing(mouse);
    assert.equal(clickRing.tag, 'svg', `${at}: the click focused the line (precondition for the ring check)`);
    assert.equal(clickRing.focusVisible, false, `${at}: a click is not :focus-visible`);
    assert.equal(clickRing.style, beforeClick, `${at}: a mouse click draws no focus ring on the line (${JSON.stringify(clickRing)})`);
    assert.equal(clickRing.style, 'none', `${at}: the line has no outline after a click`);
    await mouse.getByRole('button', { name: '○ Open' }).click();
    await clickAt(5);
    assert.deepEqual(await endpointLabels(mouse), ['Closed endpoint at −3', 'Open endpoint at 5']);
    assert.equal(await mouse.locator('[data-number-line-marker]').count(), 0, `${at}: a click shows no keyboard marker`);
    assert.equal((await graphText(mouse)).trim(), keyboardGraph, `${at}: clicks record the graph the keys recorded`);
    await mouse.locator('[data-mm-enter-action="submit"]').first().click();
    await mouse.waitForFunction(() => window.__KB_GRADES__.some((g) => g.kind === 'grade'), null, { timeout: 5000 });
    assert.equal((await grades(mouse)).at(-1).isCorrect, keyboardGrades.at(-1).isCorrect, `${at}: and grade the same`);
    await mouse.close();

    console.log(`ok ${at}: number line placed, switched, moved and checked by keyboard; pointer agrees`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${at}: ${error.message}`);
  }
}

await browser.close();
if (failures) {
  console.error(`${failures} viewport(s) failed`);
  process.exit(1);
}
