// WHAT A STUDENT SEES WHEN PART OF MATHMASTER FAILS.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/errorRecovery.mjs
//
// The real boundaries in a real browser:
//   question-chunk  a tool's chunk from an older build: "MathMaster was just
//                   updated" (not "this question was set up wrong"); pressing
//                   the button reloads; the SAME failure straight after that
//                   reload offers "Try again" instead of reloading forever
//   app-chunk       the same at the root boundary
//   app-bug         an ordinary bug: plain words, no stack trace, a copyable
//                   report, and the failure kept in the scrubbed local log
// Exits non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

for (const scene of ['question-chunk', 'app-chunk']) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/tests/browser/errorRecovery.html?scene=${scene}`, { waitUntil: 'networkidle' });
  const panel = page.locator('[data-recovery-panel]');
  await panel.waitFor({ timeout: 10000 });
  const first = { tone: await panel.getAttribute('data-recovery-panel'), text: await panel.innerText() };
  check(first.tone === 'updated' && /just updated/i.test(first.text), `${scene}: first failure says the app was updated`, first.text.split('\n')[0]);
  check(!/set up|tell your teacher|could not start/i.test(first.text), `${scene}: nothing blames the question or claims a startup crash`);
  await Promise.all([
    page.waitForURL(/_mm_reload=/, { timeout: 10000 }),
    page.getByRole('button', { name: 'Load the new version' }).click(),
  ]);
  await panel.waitFor({ timeout: 10000 });
  const second = { tone: await panel.getAttribute('data-recovery-panel'), text: await panel.innerText() };
  check(second.tone === 'offline' && /try again/i.test(second.text), `${scene}: the same failure right after a reload offers "Try again", not another automatic reload`, second.text.split('\n')[0]);
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/tests/browser/errorRecovery.html?scene=app-bug`, { waitUntil: 'networkidle' });
  const panel = page.locator('[data-recovery-panel]');
  await panel.waitFor({ timeout: 10000 });
  const text = await panel.innerText();
  check(/Something went wrong on this screen/.test(text), 'app-bug: plain-language title');
  check(!/at Buggy|\.jsx:\d+|at renderWithHooks/.test(text), 'app-bug: no stack trace on screen');
  check(await page.getByRole('button', { name: 'Reload MathMaster' }).isVisible(), 'app-bug: reload offered');
  const logged = await page.evaluate(() => window.__MATHMASTER_DIAGNOSTICS__?.() || []);
  check(logged.some((entry) => entry.kind === 'render-error' && /reading 'map'/.test(entry.message)), 'app-bug: kept in the local diagnostic log', JSON.stringify(logged.at(-1)));
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  check(width <= 390, 'app-bug: fits a 390px phone without sideways scroll', `scrollWidth ${width}`);
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} error-recovery failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nerror recovery: every failure lands on a recoverable screen.');
