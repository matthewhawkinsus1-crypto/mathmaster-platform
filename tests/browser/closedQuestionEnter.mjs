// ENTER ON A CLOSED QUESTION GOES ON — AND NEVER TAKES A CONTROL'S OWN ENTER
// (student pass 3, Batch 5; review of the batch).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/closedQuestionEnter.mjs
//
// The real QuestionEngine (the feedbackTeaches harness, with a way on), at
// 1366x768 and 390x844. After a correct answer:
//   - focus is on Next, and Enter goes on, once;
//   - Enter on "See why it works" (a <summary>) opens it and goes nowhere;
//   - Enter on another button presses that button and goes nowhere;
//   - Enter on the page itself goes on.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const advanced = (page) => page.evaluate(() => window.__mmAdvanced || 0);

for (const [name, viewport] of [['chromebook', { width: 1366, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (error) => failures.push(`${name}: page error ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/feedbackTeaches.html?q=multi&role=practice&next=1&run=enter-${Date.now()}`, { waitUntil: 'networkidle' });
  await page.locator('[data-feedback-fixture]').waitFor();
  await page.waitForTimeout(700);
  const field = page.locator('.mathmaster-question-tool-workspace math-field').first();
  await field.evaluate((element) => { element.setValue('\\frac{3}{4}'); element.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(250);
  await page.locator('button.mathmaster-bar-submit:visible').first().click();
  await page.locator('[data-correct-review] summary').waitFor();
  await page.waitForTimeout(400);

  const focused = await page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName);
  check(/mathmaster-bar-continue/.test(focused), `${name}: after a correct answer focus is on Next`, focused);

  const summary = page.locator('[data-correct-review] summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(await page.locator('[data-correct-review]').evaluate((details) => details.open), `${name}: Enter on "See why it works" opens it`);
  check(await advanced(page) === 0, `${name}: and does not go on`, String(await advanced(page)));

  const other = page.locator('[data-correct-review] button:visible, [data-attempt-results] button:visible').filter({ hasNotText: /Next|Continue/ }).first();
  if (await other.count()) {
    await other.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    check(await advanced(page) === 0, `${name}: Enter on another button presses it and does not go on`, String(await advanced(page)));
  }

  await page.evaluate(() => { document.activeElement?.blur(); });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(await advanced(page) === 1, `${name}: Enter on the page goes on, once`, String(await advanced(page)));
  await page.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nclosed question Enter: all checks passed');
process.exit(failures.length ? 1 : 0);
