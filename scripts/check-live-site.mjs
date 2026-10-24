#!/usr/bin/env node
// Does the live site start? Read-only (OP02).
//
//   node scripts/check-live-site.mjs                       # https://mathmaster-aleks.web.app
//   node scripts/check-live-site.mjs --project <id>
//   node scripts/check-live-site.mjs --url http://localhost:4173 --expect-sha <commit>
//
// Loads the page in headless Chromium as a signed-out visitor, waits for the
// app to replace its boot screen, and fails on an uncaught error, a failed
// asset of the site's own origin, or a served build other than --expect-sha
// (scripts/lib/liveSiteStartup.mjs decides). Exit 0 started, 1 did not,
// 2 could not check here (no Playwright). Writes nothing and signs in to
// nothing. scripts/release-firebase.mjs runs it after every Hosting deploy.
import { liveSiteStartupVerdict } from './lib/liveSiteStartup.mjs';

const option = (name, fallback = null) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const project = option('project', process.env.FIREBASE_PROJECT || 'mathmaster-aleks');
const origin = (option('url') || `https://${project}.web.app`).replace(/\/$/, '');
const expectedSha = option('expect-sha');
const timeoutMs = Math.max(5_000, Number(option('timeout-ms', '45000')) || 45_000);

let chromium;
try {
  ({ chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'));
} catch {
  console.log('Live-site check skipped: Playwright is not installed here.');
  console.log(`Check by hand: open ${origin} in a private window, or run this script where Playwright is installed.`);
  process.exit(2);
}

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const observed = { status: null, bootFallbackGone: false, recoveryShown: false, pageErrors: [], failedAssets: [], servedSha: null, expectedSha };
try {
  const page = await browser.newPage();
  const ownOrigin = new URL(origin).origin;
  const ownAsset = (request) => {
    try { return new URL(request.url()).origin === ownOrigin && ['script', 'stylesheet', 'document'].includes(request.resourceType()); } catch { return false; }
  };
  page.on('pageerror', (error) => observed.pageErrors.push(error?.message || String(error)));
  page.on('requestfailed', (request) => { if (ownAsset(request)) observed.failedAssets.push({ url: request.url(), status: null }); });
  page.on('response', (response) => {
    if (ownAsset(response.request()) && response.status() >= 400) observed.failedAssets.push({ url: response.url(), status: response.status() });
  });
  const response = await page.goto(`${origin}/?live-check=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  observed.status = response?.status() ?? null;
  observed.bootFallbackGone = await page.waitForFunction(
    // Runs in the page.
    () => !globalThis.document.getElementById('mathmaster-boot-fallback') && (globalThis.document.getElementById('root')?.childElementCount || 0) > 0,
    null,
    { timeout: timeoutMs },
  ).then(() => true).catch(() => false);
  observed.recoveryShown = await page.locator('.mm-boot-recovery').count().then((count) => count > 0).catch(() => false);
  if (expectedSha) {
    const manifest = await page.evaluate(async (url) => {
      try {
        const reply = await fetch(url, { cache: 'no-store' });
        return reply.ok ? await reply.json() : null;
      } catch { return null; }
    }, `${origin}/mathmaster-build.json?v=${Date.now()}`);
    observed.servedSha = manifest?.gitSha || null;
  }
} finally {
  await browser.close();
}

const verdict = liveSiteStartupVerdict(observed);
console.log(verdict.ok ? `Live site started cleanly: ${origin}` : `Live site did NOT start cleanly: ${origin}`);
verdict.problems.forEach((problem) => console.log(`  - ${problem}`));
process.exit(verdict.ok ? 0 : 1);
