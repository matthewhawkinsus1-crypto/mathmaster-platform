// REAL URLS: REFRESH, BACK/FORWARD, DEEP LINKS AND WHAT AN ADDRESS MAY REACH.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/appUrlJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1366x768,390x844.)
//
// The real App.jsx with `firebase/*` replaced by the in-memory fakes — nothing
// can reach a Firebase project. Unlike the other journeys this one opens the
// app at the harness origin's own paths (/grades, /assignments/…): the Vite
// server falls back to the app's index.html exactly as Hosting does, and the
// harness page (index.html under tests/) deliberately keeps its own URL.
//
//   U1  Refresh on every student screen lands on the same screen — and inside
//       an assignment on the same question, numbered as the workspace
//       numbers it ("Classwork Question 2"), the number Home's Resume names.
//   U2  Back/Forward across Home → assignment → question → Grades walks the
//       same addresses and screens in both directions.
//   U3  A deep link opened while signed out returns there after sign-in.
//   U4  An address never reaches another student's work: another class's
//       assignment, a student id in the path, a teacher page, a teacher
//       preview — Home with a message, nothing of the other record on screen.
//   U5  An unknown or stale address lands on Home with a message, never blank.
//   U6  Log Out returns the bar to "/", so the next student starts at Home.
//   U7  Teacher: a tab and an assignment's monitor survive a reload; a student's
//       link to the teacher's assignment opens its monitor.
//   U8  My Math Path: Back onto /path/progress shows Progress; so does a reload.
//   U9  After Log Out, the next student's Back never opens the previous
//       student's screens or addresses.
//   U10 An excused lesson's address opens its result page, never graded work.
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/appUrls/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/appUrls');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const VIEWPORTS = (process.env.VIEWPORTS || '1366x768,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

// Harper (910001), Algebra II period 3: today's lesson "a-today" (Warm-Up
// done, Classwork 1–2, Practice 1–2, DOL). "a-p5" belongs to Algebra I
// period 5 — another class, other students.
const STUDENT = '910001';
const OTHER_STUDENT = '910002';
const TODAY = 'a-today';
const TODAY_TITLE = 'Systems of Equations — Lesson 3: Elimination';
const OTHER_CLASS_ASSIGNMENT = 'a-p5';
const OTHER_CLASS_TITLE = 'Linear Equations — Lesson 5';
const asStudent = `as=student&studentId=${STUDENT}`;
// The next student on the same Chromebook (same class), and one excused from
// today's lesson in the private-controls scenario (fixture.js PRIVATE_CONTROLS).
const NEXT_STUDENT = '910004';
const EXCUSED_STUDENT = '910006';

const findings = [];
const passed = [];
const squash = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const expect = (journey, condition, detail) => {
  if (!condition) findings.push({ journey, detail });
  return Boolean(condition);
};
const pathOf = (page) => new URL(page.url()).pathname;
const bodyText = async (page) => squash(await page.locator('body').innerText());
const toasts = async (page) => squash((await page.locator('[aria-live] > *').allTextContents()).join(' / '));

// Wait for the signed-in app: the student nav or the teacher workspace.
// Visible only: the phone layout keeps some desktop labels in the DOM, hidden.
const shown = (page, pattern) => page.getByText(pattern).filter({ visible: true }).first();
const ready = async (page, marker) => {
  await shown(page, marker).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(700);
};

// What each student screen shows, read from the page — never from the URL.
const SCREENS = [
  { path: '/', marker: /Welcome, /, label: 'Home' },
  { path: '/assignments', marker: /My Assignments/, label: 'Assignments' },
  { path: '/grades', marker: /My Grades/, label: 'Grades' },
  { path: '/rewards', marker: /My Rewards/, label: 'Rewards' },
  { path: '/path', marker: /Math Path/, label: 'My Math Path' },
  { path: '/tests', marker: /Tests & Exams/, label: 'Tests & Exams' },
  { path: '/live', marker: /Live Challenge/, label: 'Live Challenge join' },
  { path: `/assignments/${TODAY}/results`, marker: new RegExp(TODAY_TITLE), label: 'Assignment result' },
];

// "Question 2 of 2" (desktop header) or "Classwork, question 2 of 2" (phone).
const QUESTION = /[Qq]uestion (\d+) of (\d+)/;
const workspaceQuestion = async (page) => {
  const match = squash(await shown(page, QUESTION).textContent().catch(() => '')).match(QUESTION);
  return match ? `${match[1]} of ${match[2]}` : '(none)';
};

const runStudentJourneys = async (viewport) => {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await newSchoolContext(browser, { viewport });
  const page = await context.newPage();
  const unimplemented = watchUnimplementedCallables(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`${ORIGIN}/?reset=1&${asStudent}`, { timeout: 180_000 });
  await ready(page, /Welcome, /);

  // U1 — every screen, opened by its address and reloaded.
  for (const screen of SCREENS) {
    await page.goto(`${ORIGIN}${screen.path}?${asStudent}`);
    await ready(page, screen.marker);
    await page.reload();
    await ready(page, screen.marker);
    expect(`U1 ${tag}`, pathOf(page) === screen.path, `${screen.label}: reload moved ${screen.path} to ${pathOf(page)}`);
    expect(`U1 ${tag}`, !(await toasts(page)).includes('not'), `${screen.label}: reload showed a message: ${await toasts(page)}`);
  }

  // U1 — Home's Resume names the question the workspace and the URL name.
  await page.goto(`${ORIGIN}/?${asStudent}`);
  await ready(page, /Welcome, /);
  const resumeLine = (await bodyText(page)).match(/Continue at ([A-Za-z-]+) Question (\d+)/);
  if (expect(`U1 ${tag}`, resumeLine, 'Home Resume does not name a section and question')) {
    await page.getByRole('button', { name: /^Continue$/ }).filter({ visible: true }).first().click();
    await shown(page, QUESTION).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(500);
    const section = resumeLine[1].toLowerCase().replace('-', '');
    expect(`U1 ${tag}`, pathOf(page) === `/assignments/${TODAY}/${section}/${resumeLine[2]}`,
      `Resume said ${resumeLine[0]} but opened ${pathOf(page)}`);
    expect(`U1 ${tag}`, (await workspaceQuestion(page)).startsWith(`${resumeLine[2]} of`),
      `Resume said ${resumeLine[0]} but the workspace shows ${await workspaceQuestion(page)}`);
  }

  // U1 — a question survives a reload, the second one included.
  await page.goto(`${ORIGIN}/assignments/${TODAY}/classwork/2?${asStudent}`);
  await shown(page, /[Qq]uestion 2 of 2/).waitFor({ timeout: 60_000 });
  await page.reload();
  await shown(page, QUESTION).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(700);
  expect(`U1 ${tag}`, pathOf(page) === `/assignments/${TODAY}/classwork/2`, `question reload moved to ${pathOf(page)}`);
  expect(`U1 ${tag}`, (await workspaceQuestion(page)) === '2 of 2', `question reload shows ${await workspaceQuestion(page)}`);
  await page.screenshot({ path: path.join(ARTIFACTS, `U1-question-reload-${tag}.png`) });
  // A URL carries the position only: no answer, score or draft in the address.
  expect(`U1 ${tag}`, !/answer|score|draft|grade=|status=/i.test(page.url()), `the address carries work: ${page.url()}`);

  // U2 — Back/Forward across Home → assignment → question → Grades. Each
  // step's address and screen are recorded as the student clicks; Back then
  // has to walk them in reverse and Forward in order.
  const walk = [];
  const record = async (marker) => {
    await ready(page, marker);
    const at = pathOf(page);
    if (walk.at(-1)?.path !== at) walk.push({ path: at, marker });
  };
  await page.goto(`${ORIGIN}/?${asStudent}`);
  await record(/Welcome, /);
  await page.getByRole('button', { name: /^Continue$/ }).filter({ visible: true }).first().click();
  await record(QUESTION);
  await page.locator('[title^="Classwork Question 1"]').filter({ visible: true }).first().click();
  await record(/[Qq]uestion 1 of 2/);
  await page.locator('[title^="Classwork Question 2"]').filter({ visible: true }).first().click();
  await record(/[Qq]uestion 2 of 2/);
  await page.getByRole('button', { name: /^(← )?Back to (Home|dashboard)$/ }).filter({ visible: true }).first().click();
  await record(/Welcome, /);
  await page.getByRole('button', { name: /^Grades$/ }).filter({ visible: true }).first().click();
  await record(/My Grades/);
  expect(`U2 ${tag}`, walk.length >= 5, `the walk recorded only ${walk.map((step) => step.path).join(' → ')}`);
  expect(`U2 ${tag}`, walk.some((step) => step.path === `/assignments/${TODAY}/classwork/1`)
    && walk.some((step) => step.path === `/assignments/${TODAY}/classwork/2`), `questions not addressed: ${walk.map((step) => step.path).join(' → ')}`);
  for (let index = walk.length - 2; index >= 0; index -= 1) {
    await page.goBack();
    await ready(page, walk[index].marker);
    expect(`U2 ${tag}`, pathOf(page) === walk[index].path, `Back: expected ${walk[index].path}, at ${pathOf(page)}`);
  }
  for (let index = 1; index < walk.length; index += 1) {
    await page.goForward();
    await ready(page, walk[index].marker);
    expect(`U2 ${tag}`, pathOf(page) === walk[index].path, `Forward: expected ${walk[index].path}, at ${pathOf(page)}`);
  }

  // U4 — another class's assignment, another student's id, a teacher page.
  for (const probe of [
    { path: `/assignments/${OTHER_CLASS_ASSIGNMENT}`, message: /That assignment is not available/ },
    { path: `/assignments/${OTHER_CLASS_ASSIGNMENT}/classwork/1`, message: /That assignment is not available/ },
    { path: `/assignments/${OTHER_CLASS_ASSIGNMENT}/results`, message: /That assignment is not available/ },
    { path: `/students/${OTHER_STUDENT}`, message: /That page is not in MathMaster/ },
    { path: `/grades/${OTHER_STUDENT}`, message: /That page is not in MathMaster/ },
    { path: '/teacher/grades', message: /That page is for teachers/ },
    { path: `/teacher/preview/${TODAY}`, message: /That page is for teachers/ },
  ]) {
    await page.goto(`${ORIGIN}${probe.path}?${asStudent}`);
    await ready(page, /Welcome, /);
    const shown = await bodyText(page);
    expect(`U4 ${tag}`, pathOf(page) === '/', `${probe.path} left the bar at ${pathOf(page)}`);
    expect(`U4 ${tag}`, probe.message.test(await toasts(page)), `${probe.path}: no message (${await toasts(page)})`);
    expect(`U4 ${tag}`, !shown.includes(OTHER_CLASS_TITLE), `${probe.path} showed another class's assignment`);
    expect(`U4 ${tag}`, !/Instructor Dashboard|Gradebook/.test(shown), `${probe.path} showed a teacher screen to a student`);
  }

  // U5 — unknown and stale addresses.
  for (const probe of ['/nope', '/assignments/deleted-lesson', `/assignments/${TODAY}/classwork/9`]) {
    await page.goto(`${ORIGIN}${probe}?${asStudent}`);
    await page.waitForTimeout(2500);
    const message = await toasts(page);
    expect(`U5 ${tag}`, /not in MathMaster|not available|has moved/.test(message), `${probe}: no message (${message})`);
    expect(`U5 ${tag}`, (await bodyText(page)).length > 40, `${probe}: blank screen`);
  }

  // U5 — a question in a section that is not open now (today's DOL, locked)
  // resolves the way Continue does — the first unfinished open question —
  // never onto finished work in another section.
  await page.goto(`${ORIGIN}/assignments/${TODAY}/dol/1?${asStudent}`);
  await shown(page, QUESTION).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(700);
  expect(`U5 ${tag}`, pathOf(page) === `/assignments/${TODAY}/classwork/1`, `a locked DOL question's address opened ${pathOf(page)}`);
  expect(`U5 ${tag}`, /not open right now/.test(await toasts(page)), `no "not open" message (${await toasts(page)})`);

  // U8 — My Math Path's own tabs: Back onto /path/progress shows Progress.
  const activeMathPathTab = () => page.evaluate(() => [...document.querySelectorAll('nav button')]
    .find((button) => getComputedStyle(button).borderBottomColor === 'rgb(26, 115, 232)')?.textContent?.trim() || null);
  await page.goto(`${ORIGIN}/path?${asStudent}`);
  await ready(page, /Math Path/);
  await page.getByRole('button', { name: /^My Progress$/ }).filter({ visible: true }).first().click();
  await page.waitForTimeout(700);
  expect(`U8 ${tag}`, pathOf(page) === '/path/progress', `My Progress wrote ${pathOf(page)}`);
  await page.getByRole('button', { name: /^Home$/ }).filter({ visible: true }).first().click();
  await ready(page, /Welcome, /);
  await page.goBack();
  await ready(page, /Math Path/);
  await page.waitForTimeout(500);
  expect(`U8 ${tag}`, pathOf(page) === '/path/progress', `Back went to ${pathOf(page)}`);
  expect(`U8 ${tag}`, (await activeMathPathTab()) === 'My Progress', `Back onto /path/progress shows ${await activeMathPathTab()}`);
  await page.reload();
  await ready(page, /Math Path/);
  await page.waitForTimeout(500);
  expect(`U8 ${tag}`, (await activeMathPathTab()) === 'My Progress', `reload of /path/progress shows ${await activeMathPathTab()}`);

  // U6 — Log Out returns the address to "/".
  await page.goto(`${ORIGIN}/grades?${asStudent}`);
  await ready(page, /My Grades/);
  await page.getByRole('button', { name: /^Log Out$/ }).first().click();
  const confirm = page.getByRole('button', { name: /^(Log Out|Log out anyway|Yes)/ });
  await page.waitForTimeout(500);
  if (await page.getByRole('alertdialog').count()) await confirm.last().click();
  await page.getByRole('button', { name: /I'm a student/ }).waitFor({ timeout: 30_000 });
  expect(`U6 ${tag}`, pathOf(page) === '/', `after Log Out the bar reads ${pathOf(page)}`);


  expect(`errors ${tag}`, errors.length === 0, `page errors: ${errors.join(' | ')}`);
  // The workspace's background syncs (submission ingest, activity
  // reconcile) are not faked by this harness; anything else is a finding.
  const unexpected = unimplemented().filter((name) => !['ingestStudentSubmissions', 'reconcileAssignmentActivityProjection', 'resolveWeeklyPathGoalSnapshot'].includes(name));
  expect(`callables ${tag}`, unexpected.length === 0, `unimplemented callables reached: ${unexpected.join(', ')}`);
  await context.close();
  passed.push(`student ${tag}`);
};

const runSignInJourney = async (viewport) => {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await newSchoolContext(browser, { viewport });
  const page = await context.newPage();
  // U3 — a deep link opened while signed out waits through sign-in.
  await page.goto(`${ORIGIN}/assignments/${TODAY}/classwork/2?reset=1&signedOut=1&${asStudent}`, { timeout: 180_000 });
  await page.getByRole('button', { name: /I'm a student/ }).waitFor({ timeout: 60_000 });
  expect(`U3 ${tag}`, pathOf(page) === `/assignments/${TODAY}/classwork/2`, `the sign-in screen moved the address to ${pathOf(page)}`);
  // The shell names the sign-in screen before App has loaded (WCAG 2.4.2).
  expect(`U3 ${tag}`, (await page.title()) === 'Sign in – MathMaster', `sign-in title is "${await page.title()}"`);
  await page.getByRole('button', { name: /I'm a student/ }).click();
  await page.getByRole('button', { name: /Google/ }).first().click();
  await shown(page, QUESTION).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(700);
  expect(`U3 ${tag}`, pathOf(page) === `/assignments/${TODAY}/classwork/2`, `after sign-in at ${pathOf(page)}`);
  expect(`U3 ${tag}`, (await workspaceQuestion(page)) === '2 of 2', `after sign-in shows ${await workspaceQuestion(page)}`);
  await page.screenshot({ path: path.join(ARTIFACTS, `U3-after-sign-in-${tag}.png`) });
  await context.close();
  passed.push(`sign-in ${tag}`);
};

const runSharedChromebookJourney = async (viewport) => {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await newSchoolContext(browser, { viewport });
  const page = await context.newPage();
  // U9 — the next student on this Chromebook, in the same tab: Back never
  // walks into the previous student's screens (entries carry their account).
  // One document throughout: every step is a click.
  await page.goto(`${ORIGIN}/?reset=1&${asStudent}`, { timeout: 180_000 });
  await ready(page, /Welcome, /);
  await page.getByRole('button', { name: /^Continue$/ }).filter({ visible: true }).first().click();
  await shown(page, QUESTION).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: /^(← )?Back to (Home|dashboard)$/ }).filter({ visible: true }).first().click();
  await ready(page, /Welcome, /);
  await page.getByRole('button', { name: /^Grades$/ }).filter({ visible: true }).first().click();
  await ready(page, /My Grades/);
  await page.getByRole('button', { name: /^Log Out$/ }).filter({ visible: true }).first().click();
  await page.waitForTimeout(500);
  if (await page.getByRole('alertdialog').count()) await page.getByRole('button', { name: /^(Log Out|Log out anyway|Yes)/ }).last().click();
  await page.getByRole('button', { name: /I'm a student/ }).waitFor({ timeout: 30_000 });
  await page.evaluate((id) => window.__mmHarnessAuth.signInStudent(id), NEXT_STUDENT);
  await ready(page, /Welcome, /);
  for (let step = 0; step < 3; step += 1) {
    await page.goBack();
    await page.waitForTimeout(1200);
    const screen = await bodyText(page);
    expect(`U9 ${tag}`, pathOf(page) === '/', `Back #${step + 1} put the previous student's address in the bar: ${pathOf(page)}`);
    expect(`U9 ${tag}`, !QUESTION.test(screen) && !/My Grades/.test(screen), `Back #${step + 1} opened the previous student's screen`);
  }
  await page.screenshot({ path: path.join(ARTIFACTS, `U9-next-student-back-${tag}.png`) });
  await context.close();
  passed.push(`shared Chromebook ${tag}`);
};

const runSharedChromebookReloadJourney = async (viewport) => {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await newSchoolContext(browser, { viewport });
  const page = await context.newPage();
  // U9 across a RELOAD: A logs out, Back on the sign-in screen (the bar now
  // names A's screen, with A's entry), the page reloads, and B signs in. B
  // lands on their own Home, never A's address. (The page starts signed out
  // so the reload does not sign A back in from the harness's query string.)
  await page.goto(`${ORIGIN}/?reset=1&signedOut=1&${asStudent}`, { timeout: 180_000 });
  await page.getByRole('button', { name: /I'm a student/ }).click();
  await page.getByRole('button', { name: /Google/ }).first().click();
  await ready(page, /Welcome, /);
  await page.getByRole('button', { name: /^Continue$/ }).filter({ visible: true }).first().click();
  await shown(page, QUESTION).waitFor({ timeout: 30_000 });
  const aAddress = pathOf(page);
  await page.getByRole('button', { name: /^(← )?Back to (Home|dashboard)$/ }).filter({ visible: true }).first().click();
  await ready(page, /Welcome, /);
  await page.getByRole('button', { name: /^Log Out$/ }).filter({ visible: true }).first().click();
  await page.waitForTimeout(500);
  if (await page.getByRole('alertdialog').count()) await page.getByRole('button', { name: /^(Log Out|Log out anyway|Yes)/ }).last().click();
  await page.getByRole('button', { name: /I'm a student/ }).waitFor({ timeout: 30_000 });
  await page.goBack();
  await page.waitForTimeout(800);
  expect(`U9r ${tag}`, pathOf(page) === aAddress, `setup: Back on the sign-in screen should show A's address, shows ${pathOf(page)}`);
  await page.reload();
  await page.getByRole('button', { name: /I'm a student/ }).waitFor({ timeout: 60_000 });
  await page.evaluate((id) => window.__mmHarnessAuth.signInStudent(id), NEXT_STUDENT);
  await ready(page, /Welcome, /);
  await page.waitForTimeout(1200);
  expect(`U9r ${tag}`, pathOf(page) === '/', `after the reload B landed on ${pathOf(page)} (A's address was ${aAddress})`);
  expect(`U9r ${tag}`, !QUESTION.test(await bodyText(page)), 'B was shown the question A left open');
  await context.close();
  passed.push(`shared Chromebook reload ${tag}`);
};

const runExcusedJourney = async (viewport) => {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await newSchoolContext(browser, { viewport });
  const page = await context.newPage();
  // U10 — an excused lesson's address opens its result page, never graded work.
  await page.goto(`${ORIGIN}/?reset=1&controls=retired&as=student&studentId=${EXCUSED_STUDENT}`, { timeout: 180_000 });
  await ready(page, /Welcome, /);
  for (const probe of [`/assignments/${TODAY}/classwork/1`, `/assignments/${TODAY}`]) {
    await page.goto(`${ORIGIN}${probe}?controls=retired&as=student&studentId=${EXCUSED_STUDENT}`);
    await page.waitForTimeout(4000);
    expect(`U10 ${tag}`, pathOf(page) === `/assignments/${TODAY}/results`, `${probe} for an excused student went to ${pathOf(page)}`);
    expect(`U10 ${tag}`, !QUESTION.test(await bodyText(page)), `${probe} opened a question for an excused student`);
    expect(`U10 ${tag}`, /excused/i.test(await toasts(page)), `${probe}: no excused message (${await toasts(page)})`);
  }
  await context.close();
  passed.push(`excused ${tag}`);
};

const runTeacherJourney = async (viewport) => {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await newSchoolContext(browser, { viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // U7 — a tab survives a reload.
  await page.goto(`${ORIGIN}/teacher/grades?reset=1`, { timeout: 180_000 });
  await page.waitForTimeout(5000);
  await page.goto(`${ORIGIN}/teacher/grades`);
  await page.waitForTimeout(4000);
  await page.reload();
  await page.waitForTimeout(4000);
  expect(`U7 ${tag}`, pathOf(page) === '/teacher/grades', `teacher reload moved to ${pathOf(page)}`);
  expect(`U7 ${tag}`, await page.locator('[aria-current="page"]', { hasText: /Grade/ }).count() > 0
    || /Gradebook|Grades/.test(await bodyText(page)), 'Grades is not the open tab after reload');
  // The monitor, by address and through a reload.
  await page.goto(`${ORIGIN}/teacher/assignments/assignments/${TODAY}`);
  await page.waitForTimeout(4000);
  await page.reload();
  await page.waitForTimeout(4000);
  expect(`U7 ${tag}`, pathOf(page) === `/teacher/assignments/assignments/${TODAY}`, `monitor reload moved to ${pathOf(page)}`);
  expect(`U7 ${tag}`, await page.getByRole('dialog').filter({ hasText: TODAY_TITLE }).count() === 1, 'the assignment monitor is not open after reload');
  // A student's link to this teacher's assignment opens its monitor.
  await page.goto(`${ORIGIN}/assignments/${TODAY}/classwork/2`);
  await page.waitForTimeout(4000);
  expect(`U7 ${tag}`, pathOf(page) === `/teacher/assignments/assignments/${TODAY}`, `a student link for a teacher went to ${pathOf(page)}`);
  await page.screenshot({ path: path.join(ARTIFACTS, `U7-monitor-${tag}.png`) });
  expect(`errors ${tag}`, errors.length === 0, `page errors: ${errors.join(' | ')}`);
  await context.close();
  passed.push(`teacher ${tag}`);
};

try {
  for (const viewport of VIEWPORTS) {
    await runStudentJourneys(viewport);
    await runSignInJourney(viewport);
    await runExcusedJourney(viewport);
    await runSharedChromebookJourney(viewport);
    await runSharedChromebookReloadJourney(viewport);
    await runTeacherJourney(viewport);
  }
} catch (error) {
  findings.push({ journey: 'runner', detail: error?.stack || String(error) });
} finally {
  await browser.close();
}

console.log(`passed: ${passed.join(', ') || 'none'}`);
if (findings.length) {
  console.error(`\n${findings.length} finding(s):`);
  findings.forEach((finding) => console.error(`  [${finding.journey}] ${finding.detail}`));
  process.exit(1);
}
console.log('App URL journeys: all checks passed.');
