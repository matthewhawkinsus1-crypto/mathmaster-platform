// "NOT BEING SAVED" SURVIVES A RELOAD OF THE TAB WHILE IT IS TRUE (pass 3, wave 7, W7-3).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   TEACHER_HARNESS_ORIGIN=http://127.0.0.1:5188 node tests/browser/teacherWorkflow/draftSaveNoticeReloadJourneys.mjs
//
// The real App, signed in as a student. The draft-save problems lived in the
// page's memory only: after a reload Home and the assignment said nothing
// until the next failed write. Now a backup problem (the server backup refused
// a draft that is still on this device) is kept in the tab's sessionStorage.
//
//   R1  A draft the backup refused, then a reload: the account loads again
//       (App no longer clears the problems when an account arrives) and
//       the assignment says the work is only on this device.
//   R2  The student edits that draft and it is backed up: the notice goes at
//       once, and a second reload does not bring it back.
//   R3  A kept problem for a draft that is no longer on the device (retired,
//       submitted elsewhere) is not shown after a reload.
//
// The refusal is planted the way draftSaveHealth.js keeps it (the guard that
// refuses a real draft is covered by draftSaveFailureNotice.test.mjs). At
// 1366×900. Exit code 1 on any failure.
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const STUDENT = '910002';
const ASSIGNMENT = 'a-today';
const KEPT = 'mathmaster:draft-save-health:v1';
const REFUSED = /can only be saved on this device, not backed up/;

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launch.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};

const signedIn = async (page, { reset = false } = {}) => {
  const search = new URLSearchParams({ as: 'student', studentId: STUDENT, questions: 'real', ...(reset ? { reset: '1' } : {}) });
  await page.goto(`${PAGE}?${search}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
};
const openAssignment = async (page) => {
  await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await page.locator('.mathmaster-question-stage math-field').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
};
const typeIntoFirst = async (page, text) => {
  const field = page.locator('.mathmaster-question-stage math-field').first();
  await field.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(text, { delay: 25 });
  await page.keyboard.press('Tab');
};
const draftKeys = (page) => page.evaluate((prefix) => Object.keys(window.localStorage).filter((key) => key.startsWith(prefix)), `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:`);
const plant = (page, keys) => page.evaluate(([name, value]) => window.sessionStorage.setItem(name, value), [KEPT, JSON.stringify({ 'backup-refused': keys })]);
const kept = (page) => page.evaluate((name) => window.sessionStorage.getItem(name), KEPT);
const says = async (page, pattern, ms = 4000) => {
  const deadline = Date.now() + ms;
  for (;;) {
    const text = await page.locator('body').innerText();
    if (pattern.test(text) || Date.now() > deadline) return pattern.test(text);
    await page.waitForTimeout(250);
  }
};

const context = await newSchoolContext(browser, { viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (error) => failures.push(`page error ${error.message}`));

await signedIn(page, { reset: true });
await openAssignment(page);
await typeIntoFirst(page, '7');
await page.waitForTimeout(3500);
const keys = await draftKeys(page);
const draft = keys.find((key) => !key.includes(':ui') && !key.endsWith(':resume')) || keys[0];
check(Boolean(draft), 'the first question has a draft on this device', JSON.stringify(keys));

console.log('\nR1 — refused by the backup, then the tab reloads');
await plant(page, [draft]);
await signedIn(page);
check(Boolean(await kept(page)), 'the kept problem survives the account loading again', String(await kept(page)));
check(await says(page, /Some work needs attention/), 'Home says some work needs attention');
await openAssignment(page);
check(await says(page, REFUSED), 'the assignment says the work is only on this device');

console.log('\nR2 — the student edits it and the backup takes it');
await typeIntoFirst(page, '8');
await page.waitForTimeout(1500);
check(!(await says(page, REFUSED, 1000)), 'the notice goes once the draft is backed up');
check((await kept(page)) === null, 'and nothing is kept for the next reload', String(await kept(page)));
await signedIn(page);
await openAssignment(page);
check(!(await says(page, REFUSED, 2500)), 'a reload does not bring it back');

console.log('\nR3 — a kept problem for a draft no longer on the device');
await plant(page, [`mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:9:0:student`]);
await signedIn(page);
check(!(await says(page, /Some work needs attention/, 2000)), 'Home does not say so');
check((await kept(page)) === null, 'and it is dropped', String(await kept(page)));

await context.close();
await browser.close();
console.log(`\n${failures.length ? `${failures.length} failure(s)` : 'all passed'}`);
process.exit(failures.length ? 1 : 0);
