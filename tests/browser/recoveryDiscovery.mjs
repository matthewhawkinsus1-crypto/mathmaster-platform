// CAN A STUDENT FIND AN OPEN RECOVERY, AND DOES THE BUTTON DO THE NEXT THING?
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/recoveryDiscovery.mjs
//
// Renders Home, the Assignments Center and the Results screen's Recovery panel
// through recoveryDiscoveryMain.jsx, on a phone, an iPad and a Chromebook, in
// light and dark, and checks what a student needs from them:
//
//   FOUND      a closed Warm-Up/DOL with a second try open is on Home and in
//              the default (Active) tab of the Assignments Center — and
//              nothing is offered on the lesson day, while the original is open
//   NEXT STEP  each Recovery has one button naming the next thing to do
//              (Practice for, Start, Continue), and pressing it opens THAT
//              Recovery with THAT action
//   EXPLAINED  a locked Recovery names the bar and exactly which practice
//              counts (Recovery V2: the assignment's own Practice questions on
//              the same skills, by number, and "Practice for …"); every card
//              says until when, and the Results panel when the original closed
//   NEW        an unopened Recovery is marked NEW; work in progress is not
//   FITS       no sideways scroll at 360px; every button is a 44px target
//
// Screenshots go to tests/browser/artifacts/recoveryDiscovery/ (gitignored).

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.RECOVERY_SHOTS_DIR || path.join(here, 'artifacts/recoveryDiscovery');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { id: 'phone-360', width: 360, height: 780 },
  { id: 'ipad', width: 820, height: 1180 },
  { id: 'chromebook', width: 1366, height: 768 },
];
const THEMES = ['light', 'dark'];

const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM;
const browser = await chromium.launch(launchOptions);
const failures = [];
const check = (label, fn) => fn().catch((error) => { failures.push(`${label}: ${error.message}`); });

const open = async ({ device, theme, scene, view }) => {
  // The school's own clock, so "Open until" reads as a student sees it.
  const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, colorScheme: theme, timezoneId: 'America/Chicago' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${ORIGIN}/tests/browser/recoveryDiscovery.html?scene=${scene}&view=${view}`);
  await page.waitForFunction(() => Array.isArray(window.__mmRecoveryOpportunities));
  await page.waitForTimeout(150);
  return { context, page, errors };
};

const fits = async (page, label) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  assert.ok(scrollWidth <= innerWidth, `${label}: page is ${scrollWidth}px wide in a ${innerWidth}px window`);
  const short = await page.$$eval('[data-recovery-action]', (buttons) => buttons
    .map((button) => ({ label: button.textContent, height: button.getBoundingClientRect().height }))
    .filter((button) => button.height < 44));
  assert.deepEqual(short, [], `${label}: Recovery buttons under 44px`);
};

for (const device of DEVICES) {
  for (const theme of THEMES) {
    const tag = `${device.id}-${theme}`;

    await check(`${tag} home available`, async () => {
      const { context, page, errors } = await open({ device, theme, scene: 'available', view: 'home' });
      const home = page.locator('[data-recovery-home]');
      await home.waitFor();
      assert.deepEqual(await home.locator('[data-recovery-opportunity]').evaluateAll((cards) => cards.map((card) => card.dataset.recoveryOpportunity)), ['dol', 'warmup']);
      assert.deepEqual(await home.locator('[data-recovery-action]').allTextContents(), ['Practice for DOL Recovery', 'Practice for Warm-Up Recovery']);
      const text = await home.innerText();
      assert.match(text, /Get 7 of your last 8 practice questions right on your own to unlock it/);
      assert.match(text, /Practice Q1 and Q2 in this assignment count when you answer them without a hint or help, and so do the questions behind “Practice for …”/);
      assert.match(text, /Open until Fri, Oct 16, 11:59 PM/, 'the final submission date, in school time');
      assert.equal(await home.locator('[data-recovery-new]').count(), 2, 'both unopened Recoveries are NEW');
      await fits(page, `${tag} home`);
      await page.screenshot({ path: path.join(OUT, `home-available-${tag}.png`), fullPage: true });
      await home.locator('[data-recovery-action]').first().click();
      assert.deepEqual(await page.evaluate(() => window.__mmRecoveryOpened), [{ section: 'dol', action: 'practice' }]);
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check(`${tag} home unlocked / in progress`, async () => {
      const unlocked = await open({ device, theme, scene: 'unlocked', view: 'home' });
      const firstUnlocked = unlocked.page.locator('[data-recovery-home] [data-recovery-opportunity]').first();
      assert.equal(await firstUnlocked.getAttribute('data-recovery-state'), 'unlocked', 'a ready second try comes first');
      assert.equal(await firstUnlocked.locator('[data-recovery-action]').innerText(), 'Start DOL Recovery');
      assert.equal(await firstUnlocked.locator('[role="meter"]').count(), 0, 'no meter once unlocked');
      await fits(unlocked.page, `${tag} unlocked`);
      await unlocked.page.screenshot({ path: path.join(OUT, `home-unlocked-${tag}.png`), fullPage: true });
      await firstUnlocked.locator('[data-recovery-action]').click();
      assert.deepEqual(await unlocked.page.evaluate(() => window.__mmRecoveryOpened), [{ section: 'dol', action: 'start' }]);
      await unlocked.context.close();

      const started = await open({ device, theme, scene: 'inProgress', view: 'home' });
      const firstStarted = started.page.locator('[data-recovery-home] [data-recovery-opportunity]').first();
      assert.equal(await firstStarted.locator('[data-recovery-action]').innerText(), 'Continue DOL Recovery');
      assert.equal(await firstStarted.locator('[data-recovery-new]').count(), 0, 'work in progress is never NEW');
      await started.context.close();
    });

    await check(`${tag} lesson day`, async () => {
      const { context, page } = await open({ device, theme, scene: 'lessonDay', view: 'home' });
      assert.equal(await page.locator('[data-recovery-home]').count(), 0, 'nothing is offered while the original is open');
      await context.close();
    });

    await check(`${tag} results panel`, async () => {
      const { context, page, errors } = await open({ device, theme, scene: 'available', view: 'results' });
      const panel = page.locator('[data-section-recovery-panel]');
      await panel.waitFor();
      const text = await panel.innerText();
      assert.match(text, /Answer practice questions on your own to unlock another try/);
      assert.match(text, /Your DOL was given in class on Mon, Oct 5 and is now closed\./);
      assert.match(text, /Practice Q1 and Q2 in this assignment count when you answer them without a hint or help/);
      assert.equal(await panel.locator('[data-recovery-section]').count(), 2);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      assert.ok(scrollWidth <= innerWidth, `${tag} results: page is ${scrollWidth}px wide in a ${innerWidth}px window`);
      await page.screenshot({ path: path.join(OUT, `results-available-${tag}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check(`${tag} assignments center`, async () => {
      const { context, page, errors } = await open({ device, theme, scene: 'available', view: 'center' });
      const notice = page.locator('[data-recovery-inline]');
      await notice.waitFor();
      assert.deepEqual(await notice.locator('[data-recovery-action]').allTextContents(), ['Practice for DOL Recovery', 'Practice for Warm-Up Recovery']);
      assert.match(await notice.innerText(), /Recovery practice mastery 0%/);
      await fits(page, `${tag} center`);
      await page.screenshot({ path: path.join(OUT, `center-available-${tag}.png`), fullPage: true });
      await notice.locator('[data-recovery-action]').nth(1).click();
      assert.deepEqual(await page.evaluate(() => window.__mmRecoveryOpened), [{ section: 'warmup', action: 'practice' }]);
      assert.deepEqual(errors, []);
      await context.close();
    });
  }
}

await browser.close();
if (failures.length) {
  console.error(`${failures.length} Recovery discovery check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Recovery discovery: every check passed on ${DEVICES.length} devices x ${THEMES.length} themes. Screenshots: ${OUT}`);
