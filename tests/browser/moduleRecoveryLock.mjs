// A CLOSED QUESTION STAYS CLOSED AFTER ITS MODULE FAILS (student pass 3,
// Batch 5, RUN-13 — the review's blocker).
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/moduleRecoveryLock.mjs
//
// "Start this question fresh" has to be pressable on a closed question, so the
// work area is not disabled while a failed module's panel is all it holds. The
// fresh start remounts the module under a new key; My Math Path swaps the next
// item under the same engine. In both, the new module is not the one that
// failed: the work area must be closed again for a closed question, and live
// for an open one. Through rendered controls only, at 1366x768 and 390x844.
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

const workArea = (page) => page.evaluate(() => {
  const fieldset = document.querySelector('.mathmaster-question-tool-workspace fieldset');
  const inner = fieldset?.firstElementChild;
  return {
    disabled: Boolean(fieldset?.disabled),
    inert: Boolean(inner?.inert),
    panel: Boolean([...document.querySelectorAll('button')].find((button) => /Start this question fresh/.test(button.textContent || ''))),
    probe: Boolean(document.querySelector('[data-probe-tool]')),
  };
});

const open = async (viewport, query) => {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/moduleRecoveryLock.html?${query}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mmModuleRecoveryReady === true);
  await page.waitForTimeout(500);
  return page;
};

for (const [name, viewport] of [['chromebook', { width: 1366, height: 768 }], ['phone', { width: 390, height: 844 }]]) {
  for (const status of ['expired', 'correct']) {
    const at = `${name} ${status}`;
    const page = await open(viewport, `scene=fresh&status=${status}`);
    let state = await workArea(page);
    check(state.panel && !state.disabled && !state.inert, `${at}: the failure panel can be used on a closed question`, JSON.stringify(state));
    await page.evaluate(() => { window.__mmCrash = false; });
    await page.getByRole('button', { name: 'Start this question fresh' }).click();
    await page.getByRole('button', { name: 'Start fresh' }).click();
    await page.locator('[data-probe-tool]').waitFor();
    await page.waitForTimeout(300);
    state = await workArea(page);
    check(state.probe && state.disabled && state.inert, `${at}: started fresh, the closed question is closed again (disabled, inert)`, JSON.stringify(state));
    await page.close();
  }

  // My Math Path: one engine, no key. Item 1 is open and its module fails;
  // item 2 is answered correctly and must be closed, item 3 open and live.
  const page = await open(viewport, 'scene=path');
  let state = await workArea(page);
  check(state.panel && !state.disabled, `${name} path: item 1's failure panel can be used`, JSON.stringify(state));
  await page.evaluate(() => { window.__mmCrash = false; window.__mmNextItem({ status: 'correct' }); });
  await page.locator('[data-probe-tool]').waitFor();
  await page.waitForTimeout(300);
  state = await workArea(page);
  check(state.probe && state.disabled && state.inert, `${name} path: the next item, correct, is closed (the failure did not carry over)`, JSON.stringify(state));
  await page.evaluate(() => window.__mmNextItem({ status: 'unattempted' }));
  await page.waitForTimeout(400);
  state = await workArea(page);
  check(state.probe && !state.disabled && !state.inert, `${name} path: an open item is live`, JSON.stringify(state));
  await page.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nmodule recovery lock: all checks passed');
process.exit(failures.length ? 1 : 0);
