// "What changed" and the one Log Out, measured at 1366×768 and 390×844.
//
// HOW TO RUN:
//
//   npx vite --host 127.0.0.1 --port 5215 --strictPort &
//   node tests/browser/studentWhatChanged.mjs [screenshotDir]
//
// WHAT IT CHECKS:
//   1. The list is on screen with its heading, rows in the model's order, the
//      "New" markers exactly on the unseen rows, and no teacher note/identity.
//   2. Every row is a ≥44px button that opens its assignment; onMarkSeen fires
//      once for the shown list and never for an empty compact one.
//   3. Exactly ONE Log Out on the page. With unsent work, Log Out asks; "Stay
//      and let it send" closes the question without logging out; "Log out
//      anyway" logs out; with nothing at risk Log Out goes straight through.
//   4. No horizontal scroll, no console or page errors.
//
// NO PRODUCTION CONTACT: every non-localhost request is aborted.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5215';
const SHOTS = process.argv[2] || null;
const VIEWPORTS = [
  { name: 'desktop', width: 1366, height: 768, isMobile: false },
  { name: 'phone', width: 390, height: 844, isMobile: true },
];
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

let browser;
try { browser = await chromium.launch({ args: ['--no-sandbox'] }); } catch {
  browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium' });
}

for (const viewport of VIEWPORTS) {
  const where = `${viewport.name} ${viewport.width}×${viewport.height}`;
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile, hasTouch: viewport.isMobile, deviceScaleFactor: viewport.isMobile ? 2 : 1 });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/^(https?|wss?):\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error' && !/favicon|React DevTools/i.test(message.text())) errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${ORIGIN}/tests/browser/studentWhatChanged.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-what-changed="list"]', { timeout: 30000 });

  const items = await page.evaluate(() => window.__mmWhatChangedItems);
  const list = await page.evaluate(() => {
    const section = document.querySelector('[data-what-changed="list"]');
    const rows = [...section.querySelectorAll('li > button')];
    return {
      heading: section.querySelector('h2')?.textContent,
      rows: rows.map((row) => ({ text: row.textContent, height: row.getBoundingClientRect().height, isNew: Boolean(row.querySelector('[data-what-changed-new]')) })),
      text: document.body.innerText,
      log: document.querySelector('[data-harness="log"]').textContent,
      emptyCompact: document.querySelectorAll('[data-what-changed]').length,
      emptyFull: document.querySelector('[data-harness-empty-full]')?.innerText || '',
    };
  });
  check(list.heading === 'What changed', `${where}: heading "${list.heading}"`);
  check(list.rows.length === items.length && items.length >= 6, `${where}: ${list.rows.length} rows for ${items.length} items`);
  items.forEach((item, index) => {
    const row = list.rows[index];
    check(row && row.text.includes(item.text), `${where}: row ${index} is not "${item.text}"`);
    check(row && row.isNew === item.unseen, `${where}: row ${index} New marker ${row?.isNew} for unseen=${item.unseen}`);
    check(row && row.height >= 44, `${where}: row ${index} is ${row?.height}px tall`);
  });
  check(items.some((item) => item.unseen) && items.some((item) => !item.unseen), `${where}: fixture has both new and seen rows`);
  check(list.text.includes('Reason: Prohibited cellphone use'), `${where}: the integrity reason is missing`);
  for (const secret of ['SECRET-NOTE', 'teacher@school.example', 'Ms Teacher', 'Another class only']) check(!list.text.includes(secret), `${where}: "${secret}" is on screen`);
  check(list.log === 'seen', `${where}: onMarkSeen log "${list.log}" (expected one "seen", none for the empty compact list)`);
  check(list.emptyCompact === 2, `${where}: ${list.emptyCompact} What changed panels (expected the list + "Nothing new"; compact empty draws none)`);
  check(/Nothing new/.test(list.emptyFull), `${where}: the full empty list does not say "Nothing new"`);

  // Rows open their assignment.
  await page.locator('[data-what-changed="list"] li > button').first().click();
  check((await page.locator('[data-harness="log"]').textContent()).endsWith(`open:${items[0].assignmentId}`), `${where}: first row did not open ${items[0].assignmentId}`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `${where}: page scrolls sideways by ${overflow}px`);

  // One Log Out.
  const logOut = page.getByRole('button', { name: 'Log Out', exact: true });
  check(await logOut.count() === 1, `${where}: ${await logOut.count()} Log Out buttons`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/whatChanged-${viewport.name}.png`, fullPage: true });

  // With unsent work, Log Out asks.
  await logOut.click();
  const dialog = page.getByRole('alertdialog');
  check(await dialog.isVisible(), `${where}: no confirm after Log Out with unsent work`);
  check(/hasn't been sent yet/.test(await dialog.textContent()), `${where}: confirm text`);
  const box = await dialog.boundingBox();
  check(box && box.x >= 0 && box.x + box.width <= viewport.width + 0.5, `${where}: confirm off screen ${JSON.stringify(box)}`);
  for (const name of ['Stay and let it send', 'Log out anyway']) {
    const height = (await page.getByRole('button', { name }).boundingBox())?.height || 0;
    check(height >= 44, `${where}: "${name}" is ${height}px`);
  }
  check(await page.evaluate(() => document.activeElement?.textContent) === 'Stay and let it send', `${where}: focus is not on the safe choice`);
  const overflowDialog = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflowDialog <= 0, `${where}: confirm makes the page scroll sideways by ${overflowDialog}px`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/logoutConfirm-${viewport.name}.png` });
  await page.getByRole('button', { name: 'Stay and let it send' }).click();
  check(await dialog.count() === 0, `${where}: Stay did not close the confirm`);
  check(!(await page.locator('[data-harness="log"]').textContent()).includes('logout'), `${where}: Stay logged out`);

  // Stay hands focus back to Log Out (not the top of the page).
  check(await page.evaluate(() => document.activeElement?.textContent) === 'Log Out', `${where}: focus did not return to Log Out after Stay`);

  // Keyboard: Enter on Log Out opens the question, Escape closes it and
  // focus returns to Log Out.
  await logOut.focus();
  await page.keyboard.press('Enter');
  check(await dialog.isVisible(), `${where}: Enter on Log Out did not open the confirm`);
  check(await page.evaluate(() => document.activeElement?.textContent) === 'Stay and let it send', `${where}: keyboard: focus is not on the safe choice`);
  await page.keyboard.press('Tab');
  check(await page.evaluate(() => document.activeElement?.textContent) === 'Log out anyway', `${where}: Tab does not reach "Log out anyway"`);
  await page.keyboard.press('Escape');
  check(await dialog.count() === 0, `${where}: Escape did not close the confirm`);
  check(await page.evaluate(() => document.activeElement?.textContent) === 'Log Out', `${where}: focus did not return to Log Out after Escape`);
  check(!(await page.locator('[data-harness="log"]').textContent()).includes('logout'), `${where}: Escape logged out`);

  await logOut.click();
  await page.getByRole('button', { name: 'Log out anyway' }).click();
  check((await page.locator('[data-harness="log"]').textContent()).endsWith('|logout'), `${where}: Log out anyway did not log out`);
  check(await dialog.count() === 0, `${where}: confirm still open after Log out anyway`);

  // Nothing at risk: straight through.
  await page.locator('[data-harness="clear-risk"]').click();
  await logOut.click();
  check(await dialog.count() === 0, `${where}: confirm shown with nothing at risk`);
  check((await page.locator('[data-harness="log"]').textContent()).match(/logout/g)?.length === 2, `${where}: Log Out with nothing at risk did not log out`);
  check(!(await page.locator('[data-harness="log"]').textContent()).includes('nav-logout'), `${where}: the nav logged out`);

  check(errors.length === 0, `${where}: errors: ${errors.join(' | ')}`);
  console.log(`${where}: ${items.length} rows, ${items.filter((item) => item.unseen).length} new, overflow ${overflow}px`);
  await context.close();
}
await browser.close();

if (failures.length) {
  console.error(`FAIL (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('PASS: What changed list, one Log Out, logout confirm — 1366×768 and 390×844');
