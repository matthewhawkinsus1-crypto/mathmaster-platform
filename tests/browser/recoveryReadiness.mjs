// DOES A TEACHER READ RECOVERY READINESS RIGHT, ON EVERY SCREEN THEY USE?
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/recoveryReadiness.mjs
//
// Renders the Warm-Up and DOL Recovery panel (recoveryReadinessMain.jsx) for
// the real lessons on a phone, an iPad and a Chromebook, in light and dark:
//
//   READY      the live lesson in Pre-Flight: both sections Ready, the verdict
//              says so, and every question's Recovery is named
//   NOT YET    the same lesson as a live copy: nothing is called ready before
//              the teacher approves Prepare Recovery
//   WHY        a lesson no family can pair: Not ready, the reason under each
//              question, and a "Fix for Recovery" button that opens the repair
//              for THAT question
//   FITS       no sideways scroll at 360px; every button a 40px target
//
// Screenshots go to tests/browser/artifacts/recoveryReadiness/ (gitignored).

import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.RECOVERY_SHOTS_DIR || path.join(here, 'artifacts/recoveryReadiness');
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

const open = async ({ device, theme, scene }) => {
  const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, colorScheme: theme });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${ORIGIN}/tests/browser/recoveryReadiness.html?scene=${scene}`);
  await page.waitForFunction(() => Boolean(window.__mmRecoveryReadinessScene));
  await page.locator('[data-recovery-readiness-panel]').waitFor();
  return { context, page, errors };
};

const fits = async (page, label) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  assert.ok(scrollWidth <= innerWidth, `${label}: page is ${scrollWidth}px wide in a ${innerWidth}px window`);
  const short = await page.$$eval('[data-recovery-readiness-panel] button', (buttons) => buttons
    .map((button) => ({ label: button.textContent, height: button.getBoundingClientRect().height }))
    .filter((button) => button.height < 40));
  assert.deepEqual(short, [], `${label}: buttons under 40px`);
};

const statusOf = (page, section) => page.locator(`[data-recovery-readiness-section="${section}"]`).getAttribute('data-recovery-readiness-status');

for (const device of DEVICES) {
  for (const theme of THEMES) {
    const tag = `${device.id}-${theme}`;

    await check(`${tag} Pre-Flight, live lesson`, async () => {
      const { context, page, errors } = await open({ device, theme, scene: 'preflight-l2' });
      assert.equal(await statusOf(page, 'warmup'), 'ready');
      assert.equal(await statusOf(page, 'dol'), 'ready');
      assert.equal(await page.locator('[data-recovery-fully-ready]').getAttribute('data-recovery-fully-ready'), 'true');
      const text = await page.locator('[data-recovery-readiness-panel]').innerText();
      assert.match(text, /Ready: a student who needs it can recover the Warm-Up and the DOL with fresh questions/);
      assert.equal(await page.locator('[data-recovery-readiness-row]').count(), 6);
      assert.equal(await page.locator('[data-recovery-readiness-row="unavailable"]').count(), 0);
      await fits(page, `${tag} preflight-l2`);
      await page.screenshot({ path: path.join(OUT, `preflight-l2-${tag}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check(`${tag} live copy before approval`, async () => {
      const { context, page, errors } = await open({ device, theme, scene: 'live-l2' });
      assert.equal(await statusOf(page, 'warmup'), 'unavailable', 'nothing is ready before the teacher approves');
      assert.equal(await statusOf(page, 'dol'), 'unavailable');
      const text = await page.locator('[data-recovery-readiness-panel]').innerText();
      assert.match(text, /not ready yet — MathMaster can add Recovery versions without changing the question \(Prepare Recovery\)/);
      assert.doesNotMatch(text, /Ready: a student/);
      await fits(page, `${tag} live-l2`);
      await page.screenshot({ path: path.join(OUT, `live-l2-${tag}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      await context.close();
    });

    await check(`${tag} a lesson that cannot be paired yet`, async () => {
      const { context, page, errors } = await open({ device, theme, scene: 'preflight-l3' });
      assert.equal(await page.locator('[data-recovery-fully-ready]').getAttribute('data-recovery-fully-ready'), 'false');
      const notReady = page.locator('[data-recovery-readiness-row="unavailable"]');
      assert.ok(await notReady.count() > 0);
      const text = await page.locator('[data-recovery-readiness-panel]').innerText();
      assert.match(text, /Not fully Recovery-ready yet/);
      const fix = page.locator('[data-recovery-repair]').first();
      const index = Number(await fix.getAttribute('data-recovery-repair'));
      await fits(page, `${tag} preflight-l3`);
      await page.screenshot({ path: path.join(OUT, `preflight-l3-${tag}.png`), fullPage: true });
      await fix.click();
      assert.deepEqual(await page.evaluate(() => window.__mmRecoveryRepairs), [index], 'the repair opens for that question');
      await page.locator('[data-repair-controls]').waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    });
  }
}

await browser.close();
if (failures.length) {
  console.error(`${failures.length} Recovery readiness check(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Recovery readiness: every check passed on ${DEVICES.length} devices x ${THEMES.length} themes. Screenshots: ${OUT}`);
