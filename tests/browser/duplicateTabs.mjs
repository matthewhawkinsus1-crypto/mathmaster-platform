// THE SAME QUESTION IN TWO TABS: THE NEWEST WORK IS THE WORK THAT IS KEPT.
//
//   npx vite --port 5199 --strictPort &
//   node tests/browser/duplicateTabs.mjs
//
// The real QuestionEngine and its real draft persistence (studentUxPlatform
// harness), two tabs of one browser — so one localStorage, exactly like a
// student who clicked the Classroom link twice. Before the active-tab guard
// (src/platform/persistence/activeWorkTab.js), the student typed "12345" in the
// newer tab, pressed one key in the forgotten older tab, and the saved answer
// became "19".
//
// Checks: the older tab pauses the moment the newer one opens the question;
// a key pressed there changes nothing; "Continue here" brings back the newest
// work and pauses the other tab instead; what is saved is what the student
// last saw. Exits non-zero on any failure.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const url = `${ORIGIN}/tests/browser/studentUxPlatform.html?q=ux-simple&run=dup-${Date.now()}`;

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const field = (page) => page.locator('math-field').first();
const value = (page) => page.evaluate(() => document.querySelector('math-field')?.value ?? null);
const paused = (page) => page.locator('[data-active-work-paused]').isVisible().catch(() => false);
const open = async () => {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await field(page).waitFor();
  await page.waitForTimeout(800);
  return page;
};
const typeAtEnd = async (page, text) => {
  await field(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await page.waitForTimeout(600);
};

const older = await open();
await typeAtEnd(older, '1');
const newer = await open();
check(await value(newer) === '1', 'the newer tab restores the saved work', await value(newer));
await typeAtEnd(newer, '2345');
check(await value(newer) === '12345', 'the newer tab continues it', await value(newer));

await older.bringToFront();
await older.waitForTimeout(300);
check(await paused(older), 'the older tab has paused the question');
check(!(await paused(newer)), 'the newer tab has not');
// A key pressed in the paused tab reaches nothing.
await older.keyboard.type('9');
await older.waitForTimeout(500);
check(await value(older) === '1', 'a key in the paused tab changes nothing', await value(older));

const reopened = await open();
check(await value(reopened) === '12345', 'what is saved is the newest work', await value(reopened));
await reopened.close();
await newer.waitForTimeout(300);

await older.getByRole('button', { name: 'Continue here' }).click();
await field(older).waitFor();
await older.waitForTimeout(800);
check(await value(older) === '12345', '"Continue here" loads the newest work first', await value(older));
check(!(await paused(older)), 'the older tab is working again');
check(await paused(newer), 'and the other tab is now the paused one');
await typeAtEnd(older, '6');
const final = await open();
check(await value(final) === '123456', 'the work continues from the newest copy', await value(final));

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} duplicate-tab failure(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nduplicate tabs: the newest work is always the work that is kept.');
