// "ASK MY TEACHER" ANSWERS BACK (student pass 3, HELP-5, D6) — AGAINST THE REAL APP.
//
//   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
//   node tests/browser/teacherWorkflow/askMyTeacherJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1366x768,390x844.)
//
// The real App.jsx with `firebase/*` replaced by in-memory fakes and the
// synthetic school (fixture.js, `questions=real`): Period 3 is in session now, Period 5 meets
// later today. The fake store is shared through localStorage, so each step
// closes its page before the next account opens one. While the teacher's
// Period 3 is in session Teacher Home only counts the questions (TT26), so
// Period 3 ends in the store for the teacher's steps (Q2, Q5) and is put back
// before the hand steps.
//
//   Q1  a Period 5 student working at home-time on today's lesson is offered
//       "Leave a question for my teacher", not a raised hand; sends one
//   Q2  Teacher Home shows "Questions from students" folded; opened, it shows
//       the question with its place in the assignment; the teacher answers
//   Q3  the student sees the answer on the question and in the workspace's
//       "Your teacher answered your question"
//   Q4  once answered, the student can ask ONE follow-up on the same question
//       (TT01): an empty box, sent as that document opened again with the first
//       exchange beside the new words; it can be reworded while it waits and
//       cannot be followed up again
//   Q5  Teacher Home lists it with the earlier question and answer above it;
//       the teacher answers
//   Q6  the student reads both exchanges and has nothing more to press
//   H1  a Period 3 student (in class) raises a hand; a reload keeps it raised
//   H2  the teacher's live tile shows "Hand raised" with Seen / On my way;
//       "On my way" is sent; the projector's Large room tiles show neither
//   H3  the student, beside the raised hand, reads "Your teacher is on the way."
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/ask-my-teacher/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/ask-my-teacher');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const VIEWPORTS = (process.env.VIEWPORTS || '1366x768,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const findings = [];
const passed = [];
const expect = (label, condition, detail) => {
  if (condition) passed.push(label);
  else findings.push(`${label}: ${detail}`);
};

const QUESTION_TEXT = 'I moved 3x to the other side but my answer is still wrong. Do I divide both sides by 2?';
const ANSWER_TEXT = 'Yes — divide every term on both sides by 2, then check by substituting back.';
const FOLLOW_UP_TEXT = 'What if the number in front of x is negative?';
const SECOND_ANSWER_TEXT = 'Divide by it all the same; a negative divisor flips the sign of every term.';
const P5_STUDENT = '910020';
const P3_STUDENT = '910001';

const openPage = async (context, query, viewport) => {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  page.on('pageerror', (error) => findings.push(`page error (${query}): ${error.message}`));
  await page.goto(`${PAGE}?${query}`);
  return page;
};

// Opens the student's assignment from Home (its primary action), then the help panel.
const openAssignmentHelp = async (page, title) => {
  const card = page.locator('[data-primary-action="true"]:visible').first();
  await card.waitFor({ timeout: 20000 });
  if (!(await page.locator(`text=${title}`).count())) throw new Error(`Home does not offer ${title}`);
  await card.click();
  const help = page.locator('[data-hint-control]:visible').first();
  await help.waitFor({ timeout: 20000 });
  if ((await help.getAttribute('aria-expanded')) !== 'true') await help.click();
  await page.locator('[data-hint-panel]:visible').first().waitFor({ timeout: 10000 });
};

const shot = (page, name, viewport) => page.screenshot({ path: path.join(ARTIFACTS, `${name}-${viewport.width}x${viewport.height}.png`), fullPage: false });

// Do these lines appear in this text, in this order?
const inOrder = (text, lines) => {
  const places = lines.map((line) => text.indexOf(line));
  return places.every((place, index) => place !== -1 && (index === 0 || place > places[index - 1]));
};

// Period 3 out of the way for the teacher's steps, and back for the hand's.
// The windows are in the shared fake store (`settings/classSchedule`), so they
// move for every page of this context.
let periodThreeWas = null;
const endPeriodThree = async (page) => {
  periodThreeWas = await page.evaluate(() => {
    const store = window.__mmHarnessStore;
    const schedule = JSON.parse(JSON.stringify(store.get('settings/classSchedule')));
    const was = Object.fromEntries(Object.entries(schedule.modifiedSchedules).map(([key, day]) => [key, day.periods['Period 3']]));
    Object.values(schedule.modifiedSchedules).forEach((day) => { day.periods['Period 3'] = { enabled: true, start: '05:00', end: '05:30' }; });
    store.set('settings/classSchedule', schedule);
    return was;
  });
};
const resumePeriodThree = (page) => page.evaluate((was) => {
  const store = window.__mmHarnessStore;
  const schedule = JSON.parse(JSON.stringify(store.get('settings/classSchedule')));
  Object.entries(was).forEach(([key, period]) => { schedule.modifiedSchedules[key].periods['Period 3'] = period; });
  store.set('settings/classSchedule', schedule);
}, periodThreeWas);

for (const viewport of VIEWPORTS) {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await newSchoolContext(browser);

  /* --------------------------------------------- out of class: a question */
  let page = await openPage(context, `reset=1&questions=real&as=student&studentId=${P5_STUDENT}`, viewport);
  await openAssignmentHelp(page, 'Linear Equations — Lesson 5');
  const panel = page.locator('[data-hint-panel]:visible').first();
  expect(`Q1 ${tag} no hand outside class`, (await panel.getByRole('button', { name: /Ask my teacher/ }).count()) === 0, 'a "✋ Ask my teacher" hand is offered while the student\'s class is not meeting');
  const leave = panel.getByRole('button', { name: /Leave a question for my teacher/ });
  expect(`Q1 ${tag} leave a question offered`, (await leave.count()) === 1, 'no "Leave a question for my teacher" button');
  await leave.click();
  const box = panel.getByLabel('Your question for your teacher');
  expect(`Q1 ${tag} the box takes focus`, await box.evaluate((node) => node === document.activeElement), 'focus did not move into the question box');
  expect(`Q1 ${tag} capped at 500`, (await box.getAttribute('maxlength')) === '500', `maxlength ${await box.getAttribute('maxlength')}`);
  await box.fill(QUESTION_TEXT);
  await shot(page, 'q1-compose', viewport);
  await panel.getByRole('button', { name: 'Send to my teacher' }).click();
  await panel.locator('[data-ask-teacher-status="waiting"]').waitFor({ timeout: 10000 });
  expect(`Q1 ${tag} sent`, (await panel.getByRole('button', { name: 'Edit my question' }).count()) === 1, 'no "Edit my question" after sending');
  const doc = await page.evaluate(() => {
    const store = window.__mmHarnessStore;
    const [first] = store.paths('askTeacherQuestions/');
    return first ? { id: first, ...store.get(first) } : {};
  });
  expect(`Q1 ${tag} stored for the right teacher and question`, doc.id === `askTeacherQuestions/${'910020'}__a-p5__${doc.questionIndex}` && doc.teacherEmail === 'teacher@harness.example' && doc.text === QUESTION_TEXT && /Question \d+$/.test(doc.questionLabel || ''), JSON.stringify(doc));
  const presence = await page.evaluate(() => window.__mmHarnessStore?.get?.(`presence/${new URLSearchParams(location.search).get('studentId')}`) || null);
  expect(`Q1 ${tag} no hand in presence`, !presence?.helpRequestedAt && !JSON.stringify(presence || {}).includes('divide both sides'), JSON.stringify(presence));
  await shot(page, 'q1-sent', viewport);
  await endPeriodThree(page);
  await page.close();

  /* ---------------------------------------- the teacher answers on Home */
  page = await openPage(context, '', viewport);
  const questions = page.locator('[data-student-questions]');
  await questions.waitFor({ timeout: 20000 });
  expect(`Q2 ${tag} folded`, !(await questions.evaluate((node) => node.open)), 'the panel opens by itself');
  expect(`Q2 ${tag} text hidden until opened`, !(await page.getByText(QUESTION_TEXT).isVisible().catch(() => false)), 'the student\'s words show before the teacher opens the panel');
  expect(`Q2 ${tag} counts one`, /Questions from students\s*1/.test(await questions.locator(':scope > summary').innerText()), await questions.locator(':scope > summary').innerText());
  await questions.locator(':scope > summary').click();
  const row = questions.locator('[data-student-question]').first();
  expect(`Q2 ${tag} the words`, (await row.innerText()).includes(QUESTION_TEXT), await row.innerText());
  expect(`Q2 ${tag} the place`, /Linear Equations — Lesson 5 · .* · Question \d+/.test(await row.innerText()), await row.innerText());
  await shot(page, 'q2-teacher-home', viewport);
  await row.getByLabel('Your answer').fill(ANSWER_TEXT);
  await row.getByRole('button', { name: 'Send answer' }).click();
  await questions.getByText(/Answer sent to /).waitFor({ timeout: 10000 });
  // The list follows the waiting-questions snapshot, which lands a task after
  // the "Answer sent" line (on CI's runner, after this check first looked):
  // the row has to go, but it may take that long.
  const answeredLeft = await page.waitForFunction(() => !document.querySelector('[data-student-questions] [data-student-question]'), null, { timeout: 10000 }).then(() => true, () => false);
  expect(`Q2 ${tag} answered leaves the list`, answeredLeft, 'the answered question is still waiting');
  await shot(page, 'q2-answered', viewport);
  await page.close();

  /* ---------------------------------------------- the student reads it */
  page = await openPage(context, `as=student&studentId=${P5_STUDENT}`, viewport);
  await openAssignmentHelp(page, 'Linear Equations — Lesson 5');
  const answered = page.locator('[data-ask-teacher-status="answered"]').first();
  await answered.waitFor({ timeout: 10000 }).catch(() => {});
  expect(`Q3 ${tag} the answer on the question`, (await answered.count()) === 1 && (await answered.innerText()).includes(ANSWER_TEXT), (await answered.count()) ? await answered.innerText() : 'no answered status');
  const compact = page.locator('[data-teacher-answers="compact"]');
  expect(`Q3 ${tag} the workspace notice`, (await compact.count()) === 1, 'no "Your teacher answered your question" in the workspace');
  if (await compact.count()) {
    await compact.locator('summary').click();
    expect(`Q3 ${tag} the notice holds the answer`, (await compact.innerText()).includes(ANSWER_TEXT), await compact.innerText());
  }
  expect(`Q3 ${tag} not reworded in place`, (await page.getByRole('button', { name: /Leave a question|Edit my question/ }).count()) === 0, 'an answered question can be reworded');
  await shot(page, 'q3-student-reads', viewport);

  /* -------------------------------- one follow-up after the answer (TT01) */
  const readPanel = page.locator('[data-hint-panel]:visible').first();
  const askMore = readPanel.getByRole('button', { name: 'Ask a follow-up' });
  expect(`Q4 ${tag} one follow-up offered`, (await askMore.count()) === 1, 'no "Ask a follow-up" after the answer');
  await askMore.click();
  const followBox = readPanel.getByLabel('Your follow-up for your teacher');
  await followBox.waitFor({ timeout: 5000 });
  expect(`Q4 ${tag} the box starts empty and takes focus`, (await followBox.inputValue()) === '' && (await followBox.evaluate((node) => node === document.activeElement)), `value "${await followBox.inputValue()}"`);
  expect(`Q4 ${tag} capped at 500`, (await followBox.getAttribute('maxlength')) === '500', `maxlength ${await followBox.getAttribute('maxlength')}`);
  await followBox.fill(FOLLOW_UP_TEXT);
  await shot(page, 'q4-follow-up-compose', viewport);
  await readPanel.getByRole('button', { name: 'Send follow-up' }).click();
  await readPanel.locator('[data-ask-teacher-follow-up]').first().waitFor({ timeout: 10000 });
  const followWaiting = await readPanel.locator('[data-ask-teacher-status="waiting"]').innerText();
  expect(`Q4 ${tag} the first exchange stays above the follow-up`, inOrder(followWaiting, [QUESTION_TEXT, ANSWER_TEXT, FOLLOW_UP_TEXT]), followWaiting);
  expect(
    `Q4 ${tag} it can be reworded, not followed up again`,
    (await readPanel.getByRole('button', { name: 'Edit my follow-up' }).count()) === 1
      && (await readPanel.getByRole('button', { name: /Ask a follow-up|Leave a question|Edit my question/ }).count()) === 0,
    'the wrong buttons are offered while the follow-up waits',
  );
  const followDoc = await page.evaluate(() => {
    const store = window.__mmHarnessStore;
    const paths = store.paths('askTeacherQuestions/');
    return { count: paths.length, ...(paths[0] ? store.get(paths[0]) : {}) };
  });
  expect(
    `Q4 ${tag} the same document, open again, with the first exchange beside the new words`,
    followDoc.count === 1 && followDoc.status === 'open' && followDoc.text === FOLLOW_UP_TEXT
      && followDoc.earlierText === QUESTION_TEXT && followDoc.earlierAnswer === ANSWER_TEXT && followDoc.answer === ANSWER_TEXT,
    JSON.stringify(followDoc),
  );
  await shot(page, 'q4-follow-up-sent', viewport);
  await page.close();

  page = await openPage(context, '', viewport);
  const followQuestions = page.locator('[data-student-questions]');
  await followQuestions.waitFor({ timeout: 20000 });
  await followQuestions.locator(':scope > summary').click();
  const followRow = followQuestions.locator('[data-student-question]').first();
  const followRowText = await followRow.innerText();
  expect(`Q5 ${tag} the row shows the earlier question and answer, then the follow-up`, (await followRow.locator('[data-student-follow-up]').count()) === 1 && inOrder(followRowText, [QUESTION_TEXT, ANSWER_TEXT, FOLLOW_UP_TEXT]), followRowText);
  await followRow.scrollIntoViewIfNeeded();
  await shot(page, 'q5-teacher-follow-up', viewport);
  await followRow.getByLabel('Your answer').fill(SECOND_ANSWER_TEXT);
  await followRow.getByRole('button', { name: 'Send answer' }).click();
  await followQuestions.getByText(/Answer sent to /).waitFor({ timeout: 10000 });
  await page.close();

  page = await openPage(context, `as=student&studentId=${P5_STUDENT}`, viewport);
  await openAssignmentHelp(page, 'Linear Equations — Lesson 5');
  const finished = page.locator('[data-ask-teacher-status="answered"]').first();
  await finished.waitFor({ timeout: 10000 }).catch(() => {});
  const finishedText = (await finished.count()) ? await finished.innerText() : '';
  expect(`Q6 ${tag} both exchanges, in the order they happened`, inOrder(finishedText, [QUESTION_TEXT, ANSWER_TEXT, FOLLOW_UP_TEXT, SECOND_ANSWER_TEXT]), finishedText || 'no answered status');
  expect(`Q6 ${tag} nothing more to press, and where to ask next`, (await page.getByRole('button', { name: /Ask a follow-up|Edit my|Leave a question/ }).count()) === 0 && /in class/i.test(finishedText), finishedText);
  await shot(page, 'q6-student-reads-both', viewport);
  await resumePeriodThree(page);
  await page.close();

  /* ------------------------------------------- in class: the raised hand */
  page = await openPage(context, `as=student&studentId=${P3_STUDENT}`, viewport);
  await openAssignmentHelp(page, 'Systems of Equations — Lesson 3: Elimination');
  let handPanel = page.locator('[data-hint-panel]:visible').first();
  expect(`H1 ${tag} hand offered in class`, (await handPanel.getByRole('button', { name: '✋ Ask my teacher' }).count()) === 1, 'no hand in class');
  expect(`H1 ${tag} no question box in class`, (await handPanel.getByRole('button', { name: /Leave a question/ }).count()) === 0, 'a question box is offered in class');
  await handPanel.getByRole('button', { name: '✋ Ask my teacher' }).click();
  await handPanel.locator('[data-ask-teacher-status="hand"]').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const raisedAt = await page.evaluate((id) => window.__mmHarnessStore?.get?.(`presence/${id}`)?.helpRequestedAt || null, P3_STUDENT);
  expect(`H1 ${tag} hand in presence`, Number.isInteger(raisedAt), String(raisedAt));
  await page.reload();
  // The harness reloads to Home (it has no assignment URL): the student opens
  // the lesson again in the same tab, as after a real reload's sign-in.
  await page.waitForTimeout(3000);
  if (!(await page.locator('[data-hint-control]:visible').count())) await openAssignmentHelp(page, 'Systems of Equations — Lesson 3: Elimination');
  const help = page.locator('[data-hint-control]:visible').first();
  if ((await help.getAttribute('aria-expanded')) !== 'true') await help.click();
  handPanel = page.locator('[data-hint-panel]:visible').first();
  const stillRaised = handPanel.getByRole('button', { name: 'Cancel my help request' });
  await stillRaised.waitFor({ timeout: 10000 }).catch(() => {});
  expect(`H1 ${tag} a reload keeps the hand`, (await stillRaised.count()) === 1, 'the hand came down on reload');
  await page.waitForTimeout(800);
  const afterReload = await page.evaluate((id) => window.__mmHarnessStore?.get?.(`presence/${id}`)?.helpRequestedAt || null, P3_STUDENT);
  expect(`H1 ${tag} the same hand is published after the reload`, afterReload === raisedAt, `${afterReload} vs ${raisedAt}`);
  await shot(page, 'h1-hand-after-reload', viewport);
  // Park this tab (its sessionStorage — the hand — stays with it) so its
  // heartbeat cannot overwrite the teacher's write in the shared fake store.
  const studentTab = page;
  await studentTab.goto('about:blank');

  page = await openPage(context, '', viewport);
  const tile = page.locator('[data-help-acknowledge]').first();
  await tile.waitFor({ timeout: 20000 }).catch(() => {});
  expect(`H2 ${tag} Seen / On my way on the tile`, (await tile.count()) === 1, 'no acknowledgement buttons on the live monitor');
  if (await tile.count()) {
    await tile.scrollIntoViewIfNeeded();
    await shot(page, 'h2-teacher-tile', viewport);
    await tile.getByRole('button', { name: 'On my way' }).click();
    await tile.getByRole('button', { name: '✓ On my way' }).waitFor({ timeout: 10000 }).catch(() => {});
    expect(`H2 ${tag} sent and shown pressed`, (await tile.getByRole('button', { name: '✓ On my way' }).getAttribute('aria-pressed').catch(() => null)) === 'true', 'the pressed state did not appear');
    await shot(page, 'h2-teacher-sent', viewport);
    // The projector's tiles never carry them: the room does not learn who asked.
    const roomTiles = page.getByRole('button', { name: 'Large room tiles' });
    if (await roomTiles.count()) {
      await roomTiles.first().click();
      await page.waitForTimeout(500);
      expect(`H2 ${tag} not on the projector`, (await page.locator('[data-help-acknowledge]').count()) === 0, 'Seen / On my way shown on Large room tiles');
    } else findings.push(`H2 ${tag}: no "Large room tiles" control to check the projector`);
  }
  await page.close();

  // Back in the student's own tab: the hand is restored and answered.
  page = studentTab;
  await page.goto(`${PAGE}?as=student&studentId=${P3_STUDENT}`);
  await openAssignmentHelp(page, 'Systems of Equations — Lesson 3: Elimination');
  const ack = page.locator('[data-help-acknowledgement="onMyWay"]').first();
  await ack.waitFor({ timeout: 10000 }).catch(() => {});
  expect(`H3 ${tag} the student reads "on the way" beside the hand`, (await ack.count()) === 1 && (await ack.innerText()) === 'Your teacher is on the way.', (await ack.count()) ? await ack.innerText() : 'no acknowledgement shown');
  await shot(page, 'h3-student-sees-ack', viewport);
  // Lowering the hand: the acknowledgement goes with it.
  const cancel = page.locator('[data-hint-panel]:visible').first().getByRole('button', { name: 'Cancel my help request' });
  expect(`H3 ${tag} the hand is still up in this tab`, (await cancel.count()) === 1, 'no raised hand after returning to the tab');
  if (await cancel.count()) await cancel.click();
  await page.waitForTimeout(500);
  expect(`H3 ${tag} lowered: nothing left beside it`, (await page.locator('[data-help-acknowledgement]').count()) === 0, 'acknowledgement still shown after lowering');
  const lowered = await page.evaluate((id) => window.__mmHarnessStore?.get?.(`presence/${id}`)?.helpRequestedAt ?? null, P3_STUDENT);
  expect(`H3 ${tag} lowered in presence`, lowered === null, String(lowered));
  await page.close();
  await context.close();
}

await browser.close();
console.log(`${passed.length} checks passed`);
if (findings.length) {
  console.log(`${findings.length} findings:`);
  findings.forEach((finding) => console.log(`  - ${finding}`));
  process.exit(1);
}
