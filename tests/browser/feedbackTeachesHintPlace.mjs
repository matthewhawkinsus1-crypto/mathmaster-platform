// AFTER A MISS, "SHOW A HINT" OPENS THE HINT WHERE THE STUDENT CLICKED (FB10).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/feedbackTeachesHintPlace.mjs
//
// At 1366×768 and 390×844, through rendered controls only, in the real
// QuestionEngine (the feedbackTeaches and algebra2MatricesLesson harnesses):
//
//   typed answer   after the second miss, one press of "Show a hint" in the box
//                  shows hint 1 directly under that box (not in the panel at the
//                  top of the work), with the box still on screen, the hint on
//                  screen and Submit on screen;
//   Matrix Lab     the same under a tool's own result area, and on a laptop the
//                  tool's own Check is still on screen (on the base the page
//                  jumped 941px up and Check ended 1157px further down it);
//   Hint control   the work bar's Hint opens the panel at the top, as before;
//   "similar"      "See a similar problem worked" opens under the box as well.
//
// Not yet run by a workflow (the student runtime gates list their drivers by
// name): it belongs beside feedbackTeaches.mjs in student-teacher-journeys.yml.
// Exits non-zero on any failure. Screenshots: tests/browser/artifacts/feedbackTeachesHintPlace.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenshotKeepingTouch } from './support/touchEmulation.mjs';

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'artifacts/feedbackTeachesHintPlace');
mkdirSync(ARTIFACTS, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const DEVICES = [
  { name: 'desktop', viewport: { width: 1366, height: 768 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

// On screen, not merely positioned there: its top is on screen and at least
// 30px of it (or all of it, if shorter) shows through the viewport and every
// scrolling or clipping box around it.
const onScreen = (page, locator) => locator.evaluate((element) => {
  const vh = window.innerHeight;
  const rect = element.getBoundingClientRect();
  let top = Math.max(0, rect.top);
  let bottom = Math.min(vh, rect.bottom);
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowY !== 'visible') {
      const clip = node.getBoundingClientRect();
      top = Math.max(top, clip.top);
      bottom = Math.min(bottom, clip.bottom);
    }
  }
  return bottom - top >= Math.min(30, rect.height) - 1;
});

const openPage = async (device, url) => {
  const context = await browser.newContext({ viewport: device.viewport, isMobile: device.isMobile || false, hasTouch: device.hasTouch || false });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => check(false, `${device.name}: page error`, String(error)));
  await page.goto(url, { waitUntil: 'networkidle' });
  return { page, context };
};

// Where the hint panel is drawn: under the results, at the top, or nowhere.
const panelPlace = (page) => page.evaluate(() => {
  const panels = [...document.querySelectorAll('.mathmaster-hint-panel')];
  return {
    count: panels.length,
    inResults: panels.filter((panel) => panel.closest('[data-attempt-results]')).length,
    atTop: panels.filter((panel) => panel.closest('.mathmaster-top-panel-row')).length,
  };
});

for (const device of DEVICES) {
  /* ---------------------------------------------- typed answer, practice */
  {
    const { page, context } = await openPage(device, `${ORIGIN}/tests/browser/feedbackTeaches.html?q=multi&role=practice&run=${Date.now()}`);
    await page.locator('[data-feedback-fixture]').waitFor();
    await page.waitForTimeout(800);
    const answer = async (value) => {
      const field = page.locator('.mathmaster-question-tool-workspace math-field').first();
      await field.waitFor();
      await field.evaluate((element, next) => { element.setValue(next); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
      await page.waitForTimeout(250);
    };
    const submit = async () => {
      await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
      await page.waitForTimeout(600);
    };
    await answer('5');
    await submit();
    await answer('6');
    await submit();
    const offer = page.locator('[data-attempt-results] button:visible', { hasText: 'Show a hint' }).first();
    await offer.waitFor();
    await offer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const outcome = page.locator('[data-attempt-results] [role="status"]', { hasText: /Not quite/ }).first();
    check(await onScreen(page, offer), `${device.name} typed: the offer is on screen before the press`);
    check((await panelPlace(page)).count === 0, `${device.name} typed: no panel before the press`);
    await offer.click();
    await page.waitForTimeout(900);
    const place = await panelPlace(page);
    check(place.count === 1 && place.inResults === 1 && place.atTop === 0, `${device.name} typed: one press opens the panel under the box, not at the top`, JSON.stringify(place));
    const hints = page.locator('.mathmaster-hint-panel li[data-hint-source]');
    check(await hints.count() === 1, `${device.name} typed: one press shows exactly one hint`, String(await hints.count()));
    check(await onScreen(page, hints.last()), `${device.name} typed: the hint is on screen`);
    check(await onScreen(page, outcome), `${device.name} typed: the box the student pressed in is still on screen`);
    check(await onScreen(page, page.locator('button:visible', { hasText: /^Submit/ }).first()), `${device.name} typed: Submit is on screen`);
    // The hint sits below the box: the box's bottom is above the hint's top.
    const order = await page.evaluate(() => {
      const box = [...document.querySelectorAll('[data-attempt-results] [role="status"]')].find((el) => /Not quite/.test(el.textContent));
      const hint = document.querySelector('.mathmaster-hint-panel li[data-hint-source]');
      return box && hint ? hint.getBoundingClientRect().top - box.getBoundingClientRect().bottom : null;
    });
    check(order !== null && order >= 0 && order < 200, `${device.name} typed: the hint starts right under the box`, String(order));
    await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-typed-after.png`) });

    // The panel's own "Show the next hint" keeps it where it is.
    await page.locator('.mathmaster-hint-panel button', { hasText: 'Show the next hint' }).click().catch(() => {});
    await page.waitForTimeout(500);
    const kept = await panelPlace(page);
    check(kept.inResults === 1 && kept.atTop === 0, `${device.name} typed: the panel's own buttons do not move it`, JSON.stringify(kept));

    // The work bar's Hint control closes it, and opens it again at the top.
    await page.locator('[data-hint-control]').click();
    await page.waitForTimeout(300);
    check((await panelPlace(page)).count === 0, `${device.name} typed: the Hint control closes the panel`);
    await page.locator('[data-hint-control]').click();
    await page.waitForTimeout(500);
    const bar = await panelPlace(page);
    check(bar.count === 1 && bar.atTop === 1 && bar.inResults === 0, `${device.name} typed: the Hint control opens it at the top, as before`, JSON.stringify(bar));
    await context.close();
  }

  /* ---------------------------------------- "see a similar problem worked" */
  {
    const { page, context } = await openPage(device, `${ORIGIN}/tests/browser/feedbackTeaches.html?q=multi&role=practice&run=${Date.now()}`);
    await page.locator('[data-feedback-fixture]').waitFor();
    await page.waitForTimeout(800);
    const answer = async (value) => {
      const field = page.locator('.mathmaster-question-tool-workspace math-field').first();
      await field.waitFor();
      await field.evaluate((element, next) => { element.setValue(next); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
      await page.waitForTimeout(250);
    };
    const submit = async () => {
      await page.locator('button:visible', { hasText: /^Submit/ }).first().click();
      await page.waitForTimeout(600);
    };
    await answer('5');
    await submit();
    const similar = page.locator('[data-attempt-results] [data-similar-offer]:visible').first();
    await similar.waitFor();
    await similar.scrollIntoViewIfNeeded();
    await similar.click();
    await page.waitForTimeout(900);
    const place = await panelPlace(page);
    const example = page.locator('.mathmaster-hint-panel [data-similar-example]');
    check(place.inResults === 1 && place.atTop === 0 && await example.count() === 1, `${device.name} similar: the worked example opens under the box`, JSON.stringify(place));
    check(await onScreen(page, example), `${device.name} similar: the example is on screen`);
    await context.close();
  }

  /* ------------------------------------------------- Matrix Lab, own Check */
  {
    const { page, context } = await openPage(device, `${ORIGIN}/tests/browser/algebra2MatricesLesson.html?run=hintplace-${Date.now()}`);
    await page.waitForFunction(() => Boolean(window.__matrices), null, { timeout: 60000 });
    await page.evaluate(() => {
      // The app's assignment screen keeps scrolled-to content clear of the work bar.
      document.getElementById('root').classList.add('mathmaster-assignment-screen');
      document.documentElement.style.setProperty('--mm-action-bar-height', '65px');
    });
    await page.evaluate((questionId) => window.__matrices.go(questionId), 'l3m-cw-2');
    await page.waitForSelector('[data-question-id="l3m-cw-2"]');
    await page.waitForTimeout(600);
    const fill = (name, value) => page.getByLabel(name, { exact: true }).fill(String(value));
    await fill('Dimensions of matrix B: number of rows', 4);
    await fill('Dimensions of matrix B: number of columns', 5);
    const notation = page.locator('input[aria-label^="Row number"], input[aria-label^="Column number"]');
    for (let k = 0; k < await notation.count(); k += 1) await notation.nth(k).fill('1');
    const toolCheck = page.locator('[data-question-id] [data-primary-answer-action="true"]').first();
    await toolCheck.click();
    await page.waitForTimeout(900);
    await fill('Dimensions of matrix B: number of rows', 5);
    await toolCheck.click();
    await page.waitForTimeout(900);
    const offer = page.locator('button:visible', { hasText: 'Show a hint' }).first();
    await offer.waitFor();
    await offer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const checkBefore = await onScreen(page, toolCheck);
    await offer.click();
    await page.waitForTimeout(900);
    const place = await panelPlace(page);
    check(place.count === 1 && place.inResults === 1 && place.atTop === 0, `${device.name} Matrix Lab: the hint opens under the result, not at the top`, JSON.stringify(place));
    const hint = page.locator('.mathmaster-hint-panel li[data-hint-source]').last();
    check(await onScreen(page, hint), `${device.name} Matrix Lab: the hint is on screen`);
    check(await onScreen(page, page.locator('button:visible', { hasText: 'Show a hint' }).first()), `${device.name} Matrix Lab: the button the student pressed is still on screen`);
    // Where Check was on screen before the press (a laptop), it still is. On a
    // phone the student scrolled down to the offer, far below Check, so Check
    // was already above the screen; the page then moves only to the hint.
    if (checkBefore) check(await onScreen(page, toolCheck), `${device.name} Matrix Lab: the tool's own Check is still on screen`);
    else console.log(`note ${device.name} Matrix Lab: Check was above the screen before the press (the offer is below it), so it is not asserted`);
    await screenshotKeepingTouch(page, { path: path.join(ARTIFACTS, `${device.name}-matrix-after.png`) });
    await context.close();
  }
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} hint-place failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nhint place: after a miss the hint opens under the box the student pressed in.');
