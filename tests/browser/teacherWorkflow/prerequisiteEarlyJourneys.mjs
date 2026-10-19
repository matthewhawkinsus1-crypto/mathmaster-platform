// A PREREQUISITE MET EARLY OPENS CLASSWORK AND PRACTICE — IN THE REAL APP.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/prerequisiteEarlyJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1366x768,390x844.)
//
// Job I's rule (docs/handoffs/STUDENT_PUSH_I_SERVER_TRUTH.md, item 4), wired
// into App.jsx by job G2: `getSectionAccessState` is bound to the signed-in
// student's own Classwork grades (sectionAccessForStudent), so a scheduled
// lesson whose prerequisite they met opens Classwork and Practice now.
// The school is the harness fixture with `&prereq=1` (fixture.js
// PREREQUISITE_EARLY): Lesson 4 releases in three days, with yesterday's
// Lesson 2 as its prerequisite. The server is the harness's (`&server=1`,
// fakeServer.js): ingestion around the same shared modules
// functions/index.js calls.
//
//   P1  met (Classwork 100): Lesson 4 opens on Classwork Question 1; an answer
//       is saved and the SERVER accepts it. The live section still reads
//       "scheduled" on the server, so the verdict is the capture-time proof
//       the browser recorded (sectionWasOpenAtCapture). Practice is reachable
//       too.
//   P2  met: the timed sections never open early. Warm-Up and DOL stay locked.
//       The address of the DOL question does not open it either.
//   P3  not met (Classwork 50): Lesson 4 still "opens later", on Home and by
//       its address, and a Classwork address opens no question.
//   P4  not met: the quiz with the same prerequisite still opens later.
//       A quiz is never a manual section, so the binding cannot open it. (A
//       met prerequisite opening a quiz-type assignment is a separate rule:
//       prerequisiteAccess, the same on main. It is reported in
//       docs/handoffs/STUDENT_PUSH_G2_APP_SPLIT.md, not asserted here.)
//
// Without the binding P1 fails: the met student lands on the result page,
// "Classwork — opens when your teacher starts it in class".
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/prerequisiteEarly/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/prerequisiteEarly');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const VIEWPORTS = (process.env.VIEWPORTS || '1366x768,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

// fixture.js PREREQUISITE_EARLY (not imported: fixture.js pulls in the app's
// browser modules).
const MET = '910004';
const UNMET = '910005';
const LESSON = 'a-prereq-lesson';
const LESSON_TITLE = 'Systems of Equations — Lesson 4: Applications';
const QUIZ = 'a-prereq-quiz';
const QUIZ_TITLE = 'Systems of Equations — Quiz 1';
const SCENARIO = 'prereq=1&server=1&questions=real';

const findings = [];
const passed = [];
const squash = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const expect = (journey, condition, detail) => {
  if (!condition) findings.push({ journey, detail });
  return Boolean(condition);
};
const pathOf = (page) => new URL(page.url()).pathname;
const bodyText = async (page) => squash(await page.locator('body').innerText());
const shown = (page, pattern) => page.getByText(pattern).filter({ visible: true }).first();
const QUESTION = /[Qq]uestion (\d+) of (\d+)/;
const RESULT = /Not Open Yet|RESULT SO FAR/i;

const openAs = async (page, studentId, address, marker) => {
  await page.goto(`${ORIGIN}${address}?${SCENARIO}&as=student&studentId=${studentId}`, { timeout: 180_000 });
  await shown(page, marker).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1200);
};
const receiptsFor = (page, studentId, assignmentId) => page.evaluate(({ studentId, assignmentId }) => (
  window.__mmHarnessStore.paths('studentSubmissionReceipts/')
    .map((key) => window.__mmHarnessStore.get(key))
    .filter((receipt) => receipt?.studentId === studentId && receipt?.assignmentId === assignmentId)
), { studentId, assignmentId });
const recordFor = (page, studentId, assignmentId, questionIndex) => page.evaluate(({ studentId, assignmentId, questionIndex }) => (
  window.__mmHarnessStore.get(`grades/${studentId}`)?.gradesByAssignment?.[assignmentId]?.[String(questionIndex)] || null
), { studentId, assignmentId, questionIndex });
// The workspace's question chooser: "Warm-Up Q1 · Opens Mon, Oct 19" (disabled,
// data-locked, with its reason after the dot), "Classwork Q1", … Since pass 3
// the DOL reads "Exit ticket (DOL) Q1" and a locked question names why, not
// "locked".
const chooserOption = async (page, label) => page.evaluate((label) => {
  const option = [...document.querySelectorAll('select[aria-label="Choose a question"] option')]
    .find((entry) => entry.textContent.trim().startsWith(label));
  return option ? { text: option.textContent.trim(), disabled: option.disabled, locked: option.dataset.locked === 'true' } : null;
}, label);
const isLocked = (option) => Boolean(option?.disabled && option.locked && /·\s*\S/.test(option.text));
// Not simulated by the harness (fakeFunctions.js): a projection repair the
// student's Home asks for. Nothing in these journeys depends on it.
const NOT_SIMULATED = new Set(['reconcileAssignmentActivityProjection']);

const run = async (viewport) => {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await newSchoolContext(browser, { viewport });
  const page = await context.newPage();
  const unimplemented = watchUnimplementedCallables(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Seed the school once (reset), with the scenario and the server.
  await page.goto(`${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1&${SCENARIO}&as=student&studentId=${MET}`, { timeout: 180_000 });
  await shown(page, /Welcome, /).waitFor({ timeout: 180_000 });

  // P1 — met: Home offers the lesson now, and its address opens Classwork 1.
  const home = await bodyText(page);
  const lessonCard = home.slice(home.indexOf(LESSON_TITLE), home.indexOf(LESSON_TITLE) + 400);
  expect(`P1 ${tag}`, home.includes(LESSON_TITLE) && /Classwork 0\/2/.test(lessonCard) && !/Classwork opens|opens when your teacher/i.test(lessonCard),
    `Home does not offer the lesson's Classwork: ${lessonCard}`);
  await openAs(page, MET, `/assignments/${LESSON}`, QUESTION);
  expect(`P1 ${tag}`, pathOf(page) === `/assignments/${LESSON}/classwork/1`, `the lesson opened at ${pathOf(page)}, not Classwork Question 1`);
  expect(`P1 ${tag}`, !RESULT.test(await bodyText(page)), 'the met student was sent to the result page ("not open yet")');
  const field = page.locator('math-field').filter({ visible: true }).first();
  if (expect(`P1 ${tag}`, await field.count(), 'Classwork Question 1 has no answer field')) {
    await field.click();
    await page.keyboard.type('3/4');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Submit/ }).filter({ visible: true }).first().click();
    await shown(page, /Correct|Question complete/).waitFor({ timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const receipts = await receiptsFor(page, MET, LESSON);
    expect(`P1 ${tag}`, receipts.length === 1 && receipts[0].disposition === 'accepted' && receipts[0].questionIndex === 1,
      `the server did not accept the early Classwork answer: ${JSON.stringify(receipts)}`);
    const record = await recordFor(page, MET, LESSON, 1);
    expect(`P1 ${tag}`, record?.status === 'correct' && record?.submissionOrigin === 'server-ingestion',
      `the answer is not on the student's grade record: ${JSON.stringify(record)}`);
    await page.screenshot({ path: path.join(ARTIFACTS, `P1-classwork-accepted-${tag}.png`) });
  }
  // Practice is a manual section too: reachable, unlocked.
  const practice = await chooserOption(page, 'Practice Q1');
  expect(`P1 ${tag}`, practice && !practice.disabled, `Practice Q1 is not choosable: ${JSON.stringify(practice)}`);
  await openAs(page, MET, `/assignments/${LESSON}/practice/1`, QUESTION);
  expect(`P1 ${tag}`, pathOf(page) === `/assignments/${LESSON}/practice/1`, `Practice Question 1's address opened ${pathOf(page)}`);
  expect(`P1 ${tag}`, await page.locator('math-field').filter({ visible: true }).count() > 0, 'Practice Question 1 has no answer field');

  // P2 — met: the timed sections stay closed.
  const warmup = await chooserOption(page, 'Warm-Up Q1');
  const dol = await chooserOption(page, 'Exit ticket (DOL)');
  expect(`P2 ${tag}`, isLocked(warmup), `Warm-Up Q1 is not locked: ${JSON.stringify(warmup)}`);
  expect(`P2 ${tag}`, isLocked(dol), `the DOL is not locked: ${JSON.stringify(dol)}`);
  await page.goto(`${ORIGIN}/assignments/${LESSON}/dol/1?${SCENARIO}&as=student&studentId=${MET}`);
  // Ready means the address has been opened: a question (or the result page)
  // is on screen. "Welcome, " is Home's flash while the app loads, and
  // "Question n of N" is the navigator, which can paint before its question;
  // asserting the address 1.5 s after either raced the redirect on a loaded
  // machine (both builds open the address about 1.5 s after Home's flash).
  await page.locator('.mathmaster-question-stage math-field').first()
    .or(shown(page, RESULT)).first().waitFor({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);
  expect(`P2 ${tag}`, pathOf(page) !== `/assignments/${LESSON}/dol/1`, 'the DOL question\'s address opened the DOL early');
  const beforeDol = (await receiptsFor(page, MET, LESSON)).length;
  expect(`P2 ${tag}`, !/DOL(?: \/ Exit Ticket)?, question 1/i.test(await bodyText(page)), 'the DOL question is on screen');
  expect(`P2 ${tag}`, (await receiptsFor(page, MET, LESSON)).length === beforeDol, 'something was submitted to the DOL');
  await page.screenshot({ path: path.join(ARTIFACTS, `P2-dol-closed-${tag}.png`) });

  // P3 — not met: still opens later, on Home and by address.
  await page.getByRole('button', { name: /Log Out/ }).filter({ visible: true }).first().click();
  await page.waitForTimeout(1000);
  await openAs(page, UNMET, '/', /Welcome, /);
  const unmetHome = await bodyText(page);
  const unmetCard = unmetHome.slice(unmetHome.indexOf(LESSON_TITLE), unmetHome.indexOf(LESSON_TITLE) + 400);
  expect(`P3 ${tag}`, !unmetHome.includes(LESSON_TITLE) || !/OPEN NOW/.test(unmetCard), `Home offers the lesson to a student without the prerequisite: ${unmetCard}`);
  await openAs(page, UNMET, `/assignments/${LESSON}`, /RESULT SO FAR|Welcome, |not available/i);
  const unmetLesson = await bodyText(page);
  expect(`P3 ${tag}`, /Classwork — opens/i.test(unmetLesson) || /not open/i.test(unmetLesson), `the lesson does not say it opens later: ${unmetLesson.slice(0, 600)}`);
  expect(`P3 ${tag}`, (await page.locator('math-field').filter({ visible: true }).count()) === 0, 'a question is open for a student without the prerequisite');
  await page.goto(`${ORIGIN}/assignments/${LESSON}/classwork/1?${SCENARIO}&as=student&studentId=${UNMET}`);
  // Since student pass 3 (NAV-10) a blocked start lands on the result page and says why there.
  await shown(page, /RESULT SO FAR|Welcome, |[Qq]uestion \d+ of \d+|Finish the earlier lesson first/i).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  expect(`P3 ${tag}`, pathOf(page) !== `/assignments/${LESSON}/classwork/1`, 'the Classwork address opened Classwork without the prerequisite');
  expect(`P3 ${tag}`, (await page.locator('math-field').filter({ visible: true }).count()) === 0, 'the Classwork address opened a question without the prerequisite');
  await page.screenshot({ path: path.join(ARTIFACTS, `P3-opens-later-${tag}.png`) });

  // P4 — not met: the quiz still opens later.
  await openAs(page, UNMET, `/assignments/${QUIZ}`, /RESULT SO FAR|Welcome, |not available/i);
  expect(`P4 ${tag}`, (await page.locator('math-field').filter({ visible: true }).count()) === 0, 'the quiz opened for a student without the prerequisite');
  expect(`P4 ${tag}`, (await receiptsFor(page, UNMET, QUIZ)).length === 0, 'something was submitted to the quiz');
  expect(`P4 ${tag}`, (await bodyText(page)).includes(QUIZ_TITLE) || pathOf(page) === '/', 'the quiz address showed neither the quiz nor Home');

  expect(`errors ${tag}`, errors.length === 0, `page errors: ${errors.join(' | ')}`);
  expect(`callables ${tag}`, unimplemented().every((name) => NOT_SIMULATED.has(name)), `unimplemented callables: ${unimplemented().join(', ')}`);
  passed.push(tag);
  await context.close();
};

for (const viewport of VIEWPORTS) {
  try {
    await run(viewport);
  } catch (error) {
    findings.push({ journey: `${viewport.width}x${viewport.height}`, detail: `threw: ${error.stack || error.message}` });
  }
}
await browser.close();

for (const tag of passed) console.log(`ran   ${tag}`);
for (const { journey, detail } of findings) console.log(`FAIL  ${journey}: ${detail}`);
console.log(findings.length ? `\n${findings.length} finding(s).` : '\nAll prerequisite-early journeys passed.');
process.exit(findings.length ? 1 : 0);
