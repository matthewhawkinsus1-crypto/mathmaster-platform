// MATRIX LAB ON A PHONE, IN THE REAL APP (PH10, PH03).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   TEACHER_HARNESS_ORIGIN=http://127.0.0.1:5188 node tests/browser/teacherWorkflow/matrixLabPhoneJourneys.mjs
//
// tests/browser/matrixLabFeedback.mjs proves the Matrix Lab in the QuestionEngine
// harness, where the page is the scroller and nothing around the question is
// the app's. P2-7 ("Check never covered after the last value") and the
// platform's phone chrome were therefore never seen in the real App's phone
// shell: identity bar, navigator, the task panel, the tries and the grade
// weight, the work in its own scroller, the work bar under it. This is that
// shell: today's lesson is the Algebra II matrices lesson (`?questions=matrices`,
// the real teacher-import chain), the student is 910002, Period 3 is well
// under way (`p3StartMin=40`: the Warm-Up is closed, so no banner is over the
// task), on a 390×844 touch phone.
//
//   firstScreen   Classwork 1 (Guided Notes), Classwork 6 (the calculator) and
//                 Practice 6: the "Open Work View" button
//                 covers nothing (PH01); "Learning goal" shares the task
//                 panel's heading row; the tries and the grade weight share
//                 one row; the work bar is one row of icons (61px, not the
//                 111px two rows six tools made); and the work area keeps at
//                 least 400px of the screen (331-381px before) (PH03).
//   checkReach    Practice 6, every box filled, Check brought into view the way
//                 a browser does: nothing covers it, and it is above the work
//                 bar, not under it (P2-7; PH10).
//
// Exit code 1 on any finding. MATRIX_PHONE_SHOTS=<dir> saves a screenshot of each.
import { mkdirSync } from 'node:fs';
import { newSchoolContext } from './schoolClock.mjs';
import { readOpenerCover } from '../support/openerCover.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const SHOTS = process.env.MATRIX_PHONE_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const STUDENT = '910002';
const PHONE = { name: 'phone 390×844', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
// The work area on the first screen, at least (PH03). With the Warm-Up closed
// it was 331-381px before the compaction and is 432-510px after.
const MIN_WORK = 400;

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};

const openLesson = async (device = PHONE) => {
  const context = await newSchoolContext(browser, { viewport: device.viewport, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${device.name}: page error ${error.message}`));
  const search = new URLSearchParams({ reset: '1', as: 'student', studentId: STUDENT, questions: 'matrices', p3StartMin: '40' });
  await page.goto(`${ORIGIN}/tests/browser/teacherWorkflow/index.html?${search}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  await page.locator('.mathmaster-question-stage').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1800);
  return { context, page };
};

// A question by its section and number, through the navigator a student uses.
const goTo = async (page, section, number) => {
  const progress = page.locator('.mathmaster-focus-view-button');
  if (/show progress/i.test(await progress.innerText())) {
    await progress.click();
    await page.waitForTimeout(500);
  }
  await page.locator('.mathmaster-section-tab', { hasText: section }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.mathmaster-question-number', { hasText: new RegExp(`^${number}$`) }).first().click();
  await page.waitForTimeout(1800);
  // Back to the compact row a student works under.
  const focus = page.locator('.mathmaster-focus-view-button');
  if (/focus view/i.test(await focus.innerText())) {
    await focus.click();
    await page.waitForTimeout(500);
  }
};

const firstScreen = (page) => page.evaluate(() => {
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const panel = document.querySelector('.question-prompt-panel');
  const heading = panel?.querySelector('.question-prompt-heading');
  const goal = panel?.querySelector('.question-prompt-heading .mathmaster-heading-meta');
  const hasGoal = Boolean(panel?.querySelector('.mathmaster-question-task-meta'));
  const strip = document.querySelector('.mathmaster-question-attempt-strip');
  const weight = document.querySelector('[data-grade-weight]');
  const work = document.querySelector('.math-tool-workspace');
  const bar = document.querySelector('.portrait-action-bar');
  const tools = bar ? [...bar.querySelectorAll(':scope > button')] : [];
  return {
    panel: Boolean(panel),
    hasGoal,
    goalInHeading: Boolean(goal),
    goalTop: goal ? Math.round(box(goal).top) : null,
    headingBottom: heading ? Math.round(box(heading).bottom) : null,
    stripTop: strip ? Math.round(box(strip).top) : null,
    weightTop: weight ? Math.round(box(weight).top) : null,
    work: work ? Math.round(box(work).height) : null,
    barHeight: bar ? Math.round(box(bar).height) : null,
    barRows: new Set(tools.map((tool) => Math.round(box(tool).top))).size,
    barTools: tools.length,
    scrollWidth: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

/* ---------------------------------------------------------- firstScreen */
{
  const { context, page } = await openLesson();
  const SCENES = [
    ['Classwork', 1, 'Classwork 1 (Guided Notes)'],
    ['Classwork', 6, 'Classwork 6 (the calculator)'],
    ['Practice', 6, 'Practice 6'],
  ];
  for (const [section, number, label] of SCENES) {
    await goTo(page, section, number);
    const screen = await firstScreen(page);
    const cover = await readOpenerCover(page);
    check(cover.opener !== null && cover.covered.length === 0, `${PHONE.name}, ${label}: the Open Work View button covers nothing`, cover.covered.join(', '));
    check(screen.hasGoal, `${PHONE.name}, ${label}: the question has its "Learning goal"`);
    check(screen.goalInHeading && screen.goalTop < screen.headingBottom, `${PHONE.name}, ${label}: "Learning goal" is in the heading's row`, `${screen.goalInHeading ? `top ${screen.goalTop}, heading ends ${screen.headingBottom}` : 'on a row of its own'}`);
    check(screen.stripTop !== null && (screen.weightTop === null || Math.abs(screen.weightTop - screen.stripTop) < 12), `${PHONE.name}, ${label}: the tries and the grade weight share a row`, `tries ${screen.stripTop}, weight ${screen.weightTop}`);
    check(screen.barRows === 1 && screen.barHeight <= 64, `${PHONE.name}, ${label}: the work bar is one row (${screen.barTools} tools)`, `${screen.barRows} row(s), ${screen.barHeight}px`);
    check(screen.work >= MIN_WORK, `${PHONE.name}, ${label}: the work area keeps at least ${MIN_WORK}px`, `${screen.work}px`);
    check(screen.scrollWidth <= 0, `${PHONE.name}, ${label}: nothing scrolls sideways`, `${screen.scrollWidth}px`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/first-screen-${section.toLowerCase()}-${number}.png` });

    // The grade weight opens to its sentence, on the row it shares or under it, inside the screen.
    const weightSummary = page.locator('[data-grade-weight] summary');
    if (await weightSummary.count()) {
      await weightSummary.tap();
      await page.waitForTimeout(300);
      const opened = await page.evaluate(() => {
        const details = document.querySelector('[data-grade-weight] details');
        const rect = details.getBoundingClientRect();
        return { open: details.open, left: Math.round(rect.left), right: Math.round(rect.right), sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      check(opened.open && opened.left >= 0 && opened.right <= PHONE.viewport.width && opened.sideways <= 0, `${PHONE.name}, ${label}: the open grade weight stays inside the screen`, JSON.stringify(opened));
      await weightSummary.tap();
      await page.waitForTimeout(200);
    }

    // The task hidden and shown again: "Learning goal" goes with it and comes back once.
    const goalCount = () => page.locator('.question-prompt-panel .mathmaster-question-task-meta').count();
    await page.getByRole('button', { name: /^Minimize/ }).tap();
    await page.waitForTimeout(300);
    const hidden = await firstScreen(page);
    check(await goalCount() === 0, `${PHONE.name}, ${label}: with the task hidden there is no "Learning goal" row`);
    check(hidden.work > screen.work, `${PHONE.name}, ${label}: hiding the task gives the work its room`, `${screen.work}px, then ${hidden.work}px`);
    await page.getByRole('button', { name: /^Show Prompt/ }).tap();
    await page.waitForTimeout(300);
    check(await goalCount() === 1, `${PHONE.name}, ${label}: showing the task again brings back one "Learning goal"`);
  }
  await context.close();
}

/* ------------------------------------------------------------ checkReach */
{
  const { context, page } = await openLesson();
  await goTo(page, 'Practice', 6);
  const stage = page.locator('.mathmaster-question-stage');
  // Every box with a name, then the solution type and the three values: the
  // matrices driver's own steps (matrixLabFeedback.mjs, P2-7).
  const cells = stage.locator('input[aria-label]');
  const count = await cells.count();
  for (let index = 0; index < count; index += 1) {
    await cells.nth(index).scrollIntoViewIfNeeded();
    await cells.nth(index).tap();
    await cells.nth(index).fill('1');
  }
  await stage.getByRole('radio', { name: 'Exactly one solution' }).tap();
  for (const variable of ['x', 'y', 'z']) {
    const box = stage.getByLabel(`Value of ${variable}`, { exact: true });
    await box.tap();
    await box.fill('1');
  }
  await page.waitForTimeout(600);
  const check1 = stage.locator('[data-primary-answer-action]').first();
  check(await check1.count() === 1, `${PHONE.name}, Practice 6: the lab's Check is on the page`);
  // The way a browser brings a control into view: the nearest scroll that shows it.
  const reach = await page.evaluate(() => {
    const button = document.querySelector('.mathmaster-question-stage [data-primary-answer-action]');
    button.scrollIntoView({ block: 'nearest' });
    const box = button.getBoundingClientRect();
    const bar = document.querySelector('.portrait-action-bar')?.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      own: Boolean(hit?.closest('[data-primary-answer-action]')),
      hit: (hit?.textContent || hit?.tagName || '').trim().slice(0, 24),
      bottom: Math.round(box.bottom),
      barTop: bar ? Math.round(bar.top) : null,
      enabled: !button.disabled,
    };
  });
  check(reach.own, `${PHONE.name}, Practice 6: after the last value nothing covers Check`, JSON.stringify(reach));
  check(reach.barTop !== null && reach.bottom <= reach.barTop, `${PHONE.name}, Practice 6: Check is above the work bar, not under it`, `Check ends at ${reach.bottom}, the bar starts at ${reach.barTop}`);
  check(reach.enabled, `${PHONE.name}, Practice 6: Check is ready with every value in`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/check-reach-practice-6.png` });
  await context.close();
}

/* ------------------------------------------------------------ narrowPhones */
// A matrix is one box that scrolls sideways when it is wider than its
// container, as a long one must; a 3×3 the student fills in was 7px wider than
// a 344px phone's box and 31px wider than a 320px phone's, so every solve item
// showed a scrollbar for a few pixels (PH09, D-61).
for (const device of [
  { name: 'foldable 344×882', viewport: { width: 344, height: 882 } },
  { name: 'phone 320×640', viewport: { width: 320, height: 640 } },
]) {
  const { context, page } = await openLesson(device);
  let questions = 0;
  let matrices = 0;
  for (let index = 0; index < 25; index += 1) {
    const boxes = await page.evaluate(() => [...document.querySelectorAll('[data-matrix-scroll]')].map((box) => ({ needs: box.scrollWidth, has: box.clientWidth })));
    questions += 1;
    matrices += boxes.length;
    const cut = boxes.filter((box) => box.needs > box.has + 1);
    check(cut.length === 0, `${device.name}, question ${index + 1}: no matrix scrolls sideways (${boxes.length} on screen)`, cut.map((box) => `${box.needs}px in ${box.has}px`).join('; '));
    const next = page.getByRole('button', { name: /^Next question/ }).first();
    if (!(await next.count()) || await next.isDisabled()) break;
    await next.click();
    await page.waitForTimeout(1200);
  }
  check(questions >= 15 && matrices >= 15, `${device.name}: the lesson's questions and its matrices were all looked at`, `${questions} questions, ${matrices} matrices`);
  await context.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s):\n${failures.map((f) => `  - ${f}`).join('\n')}` : '\nMatrix Lab on a phone, in the real App: every check passed.');
process.exit(failures.length ? 1 : 0);
