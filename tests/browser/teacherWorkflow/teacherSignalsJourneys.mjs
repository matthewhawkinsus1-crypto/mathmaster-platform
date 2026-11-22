// TEACHER SIGNALS, "WORTH A CONVERSATION" (SP-2) — AGAINST THE REAL APP.
//
//   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
//   node tests/browser/teacherWorkflow/teacherSignalsJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1366x768,1024x768.)
//
// The real App.jsx with `firebase/*` replaced by in-memory fakes and the
// synthetic school (fixture.js, `questions=real`): Period 3 is in session, and
// today's lesson has a two-part answer-box question (Classwork Q2), marked
// difficulty band 3 for this journey. docs/platform/SHOWING_THE_PROCESS.md,
// section 7.
//
//   S1  a student pastes into the first part's math box: the fact and the
//       part are stored, and nothing of what was pasted
//   S2  the page is hidden for a while; soon after it returns both parts are
//       answered right and submitted on the first try: "left the page, then a
//       burst of right parts" and "right first time on a hard question" are
//       stored, as counts
//   S3  nothing on the student's screen, the student's grade record or the
//       queued attempt says a word about it, and the question is marked as it
//       is for a classmate who raised nothing (S4)
//   S4  the classmate, answering the same question the same way without
//       leaving, and pasting only what they copied on the page, raises only
//       "right first time"
//   S5  a student with See every part at once who leaves and returns raises
//       no "left the page"; one whose response is word-processed raises no
//       "pasted"
//   T1  the teacher's Live tile shows "Worth a conversation" with the facts,
//       labelled not conclusive; Mark reviewed records who, when and a note,
//       and the fact leaves the tile but stays in the record
//   T2  the projector's Large room tiles show none of it, and neither does
//       a student's drawer opened over them
//   T3  the student's drawer lists the facts that need attention and keeps
//       the reviewed one under "Reviewed"
//   T6  (WE-G) worked examples by skill, in the student's and the class's
//       results: who opened one, and how the next question on the skill went
//   T4  the assignment's results show the student's signals beside the
//       question they belong to
//   T5  the case review's "Work-pattern signals" tab counts them over the
//       window, lists each with its review, and puts them on the timeline
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/teacher-signals/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newSchoolContext } from './schoolClock.mjs';
import { answerParts, openPartIndex, partBox } from '../support/partByPart.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/teacher-signals');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const VIEWPORTS = (process.env.VIEWPORTS || '1366x768,1024x768')
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
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${condition ? '' : ` — ${detail}`}`);
  if (condition) passed.push(label);
  else findings.push(`${label}: ${detail}`);
};

const ASSIGNMENT = 'a-today';
const LESSON = 'Systems of Equations — Lesson 3: Elimination';
// Classwork Q2 is the lesson's third question (Warm-Up Q1, Classwork Q1, Q2).
const QUESTION_INDEX = 2;
// Period 3 students with no support on file (fixture.js).
const STUDENT = '910003';
const CLASSMATE = '910009';
const EVERY_PART_STUDENT = '910006';
const WORD_PROCESSOR_STUDENT = '910007';
const HARNESS_TEACHER = 'teacher@harness.example';
const PASTED_TEXT = '-2/3';
const ROOT = '.mathmaster-question-tool-workspace';
// As long as the app's own floor for "left the page" (attemptSignalFacts.js MIN_AWAY_MS).
const AWAY_MS = 8600;

const shot = (page, name, viewport) => page.screenshot({ path: path.join(ARTIFACTS, `${name}-${viewport.width}x${viewport.height}.png`), fullPage: false });

const openPage = async (context, query, viewport) => {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  page.on('pageerror', (error) => findings.push(`page error (${query}): ${error.message}`));
  await page.goto(`${PAGE}?${query}`, { waitUntil: 'networkidle' });
  return page;
};

// The lesson's two-part question is a hard one for this journey.
const markQuestionHard = (page) => page.evaluate((assignmentId) => {
  const store = window.__mmHarnessStore;
  const assignment = JSON.parse(JSON.stringify(store.get(`assignments/${assignmentId}`)));
  let marked = 0;
  assignment.sections.forEach((section) => (section.questions || []).forEach((question) => {
    if (String(question.questionId || '').endsWith('-c2')) { question.difficultyBand = 3; marked += 1; }
  }));
  store.set(`assignments/${assignmentId}`, assignment);
  return marked;
}, ASSIGNMENT);

// A support on the student's own roster row, as a saved profile projects it.
const giveSupport = (page, studentId, accommodations) => page.evaluate(([id, list]) => {
  const store = window.__mmHarnessStore;
  const row = JSON.parse(JSON.stringify(store.get(`grades/${id}`)));
  row.profile = { ...(row.profile || {}), inclusionStatus: false, accommodations: list, modifications: [], translationLanguage: null };
  store.set(`grades/${id}`, row);
}, [studentId, accommodations]);

const signalsOf = (page, studentId) => page.evaluate((id) => {
  const store = window.__mmHarnessStore;
  return store.paths(`grades/${id}/attemptSignals/`).map((entry) => ({ path: entry, ...store.get(entry) }));
}, studentId);
const waitForSignals = async (page, studentId, kinds) => {
  await page.waitForFunction(([id, wanted]) => {
    const store = window.__mmHarnessStore;
    const found = store.paths(`grades/${id}/attemptSignals/`).map((entry) => store.get(entry)?.kind);
    return wanted.every((kind) => found.includes(kind));
  }, [studentId, kinds], { timeout: 8000 }).catch(() => {});
  return signalsOf(page, studentId);
};

const openLesson = async (page) => {
  const card = page.locator('[data-primary-action="true"]:visible').first();
  await card.waitFor({ timeout: 20000 });
  if (!(await page.locator(`text=${LESSON}`).count())) throw new Error(`Home does not offer ${LESSON}`);
  await card.click();
  await page.locator('math-field').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
};
const goToTwoPartQuestion = async (page) => {
  const picker = page.locator('select[aria-label="Choose a question"]:visible').filter({ has: page.locator('option', { hasText: 'Classwork Q2' }) });
  await picker.first().waitFor({ timeout: 10000 });
  await picker.first().selectOption({ label: 'Classwork Q2' });
  await page.locator(`${ROOT} [data-answer-part-count], ${ROOT} math-field`).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(900);
};
const typeInto = async (page, field, value) => {
  await field.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(value, { delay: 15 });
  await page.waitForTimeout(150);
};
const answerBothParts = (page) => answerParts(page, ['-2/3', '4'], { root: ROOT, type: (field, value) => typeInto(page, field, value) });
const submit = async (page) => {
  await page.locator('button.mathmaster-bar-submit:visible').first().click();
  await page.waitForTimeout(1500);
};

// The page is hidden, as a tab switch reports it, then shown again.
const leaveThePage = async (page, ms) => {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(ms);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
};

// A paste into the box that has focus: the browser's own paste event, with
// text on its clipboard.
const pasteIntoFocusedBox = (page, text) => page.evaluate((pasted) => {
  const target = document.activeElement;
  const data = new DataTransfer();
  data.setData('text/plain', pasted);
  target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true }));
  return target?.tagName || '';
}, text);

const ALLOWED_KEYS = ['schemaVersion', 'studentId', 'assignmentId', 'questionIndex', 'kind', 'attemptNumber', 'activityRole', 'partIndex', 'partCount', 'awaySeconds', 'difficultyBand', 'duringClass', 'supports', 'recordedAt', 'path'];
const REVIEW_NOTE = 'Talked with her; she showed the steps on paper.';
const kindsOf = (signals) => signals.map((signal) => signal.kind).sort().join(',');
const questionRecord = (page, studentId) => page.evaluate(([id, assignmentId, index]) => {
  const row = window.__mmHarnessStore.get(`grades/${id}`) || {};
  const record = row.gradesByAssignment?.[assignmentId]?.[index] || null;
  return { record, row: JSON.stringify(row) };
}, [studentId, ASSIGNMENT, QUESTION_INDEX]);

for (const viewport of VIEWPORTS) {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await newSchoolContext(browser);

  /* ----------------------------------------------- the student's attempt */
  let page = await openPage(context, `reset=1&questions=real&server=1&as=student&studentId=${STUDENT}`, viewport);
  expect(`S0 ${tag} the lesson's two-part question is marked band 3`, (await markQuestionHard(page)) === 1, 'Classwork Q2 was not found in the lesson');
  // Opened again without `reset`, which would seed the school afresh.
  await page.goto(`${PAGE}?questions=real&server=1&as=student&studentId=${STUDENT}`, { waitUntil: 'networkidle' });
  await openLesson(page);
  await goToTwoPartQuestion(page);
  expect(`S0 ${tag} the question opens part by part`, (await openPartIndex(page, { root: ROOT })) === 0, 'part 1 is not the open part');

  // S1: a paste into part 1's math box.
  await partBox(page, 0, { root: ROOT }).click();
  const pastedInto = await pasteIntoFocusedBox(page, PASTED_TEXT);
  let signals = await waitForSignals(page, STUDENT, ['pasted']);
  const pasted = signals.find((signal) => signal.kind === 'pasted');
  expect(`S1 ${tag} the paste landed in a math box`, pastedInto === 'MATH-FIELD', `focus was on ${pastedInto}`);
  expect(`S1 ${tag} a paste is recorded: the fact and the part`, Boolean(pasted) && pasted.partIndex === 0 && pasted.questionIndex === QUESTION_INDEX && pasted.assignmentId === ASSIGNMENT && pasted.studentId === STUDENT && pasted.attemptNumber === 1, JSON.stringify(signals));
  expect(`S1 ${tag} at the fact's own document`, pasted?.path === `grades/${STUDENT}/attemptSignals/${ASSIGNMENT}__${QUESTION_INDEX}__pasted__0`, String(pasted?.path));
  expect(`S1 ${tag} nothing of what was pasted`, Boolean(pasted) && Object.keys(pasted).every((key) => ALLOWED_KEYS.includes(key)) && !JSON.stringify(signals).includes(PASTED_TEXT), JSON.stringify(pasted));

  // S2: away, back, both parts right within the minute, first try.
  await leaveThePage(page, AWAY_MS);
  await answerBothParts(page);
  await submit(page);
  signals = await waitForSignals(page, STUDENT, ['pasted', 'leftThenRight', 'hardFirstTry']);
  const left = signals.find((signal) => signal.kind === 'leftThenRight');
  const hard = signals.find((signal) => signal.kind === 'hardFirstTry');
  expect(`S2 ${tag} three facts, one of each`, kindsOf(signals) === 'hardFirstTry,leftThenRight,pasted', kindsOf(signals));
  expect(`S2 ${tag} left the page, then two right parts: the count and the time away`, Boolean(left) && left.partCount === 2 && left.awaySeconds >= 8 && left.awaySeconds <= 30 && left.attemptNumber === 1, JSON.stringify(left));
  expect(`S2 ${tag} right first time on a band-3 question, no tool work`, Boolean(hard) && hard.difficultyBand === 3 && hard.partCount === 2 && hard.attemptNumber === 1, JSON.stringify(hard));
  expect(`S2 ${tag} every record is positions and counts`, signals.every((signal) => Object.keys(signal).every((key) => ALLOWED_KEYS.includes(key)) && Object.entries(signal).every(([key, value]) => ['path', 'studentId', 'assignmentId', 'kind', 'activityRole', 'recordedAt', 'duringClass', 'supports'].includes(key) || Number.isInteger(value))), JSON.stringify(signals));
  expect(`S2 ${tag} beside each: in the class's scheduled time, and the supports in effect (none)`, signals.every((signal) => signal.duringClass === true && Array.isArray(signal.supports) && signal.supports.length === 0), JSON.stringify(signals.map((signal) => [signal.duringClass, signal.supports])));
  expect(`S2 ${tag} the section is named`, signals.every((signal) => signal.activityRole === 'classwork'), JSON.stringify(signals.map((signal) => signal.activityRole)));
  // The heartbeat is every 20 seconds (livePresence.js HEARTBEAT_INTERVAL_MS).
  await page.waitForFunction((id) => window.__mmHarnessStore.get(`presence/${id}`)?.attemptSignalCount === 3, STUDENT, { timeout: 45000 }).catch(() => {});
  const presence = await page.evaluate((id) => window.__mmHarnessStore.get(`presence/${id}`) || null, STUDENT);
  expect(`S2 ${tag} the heartbeat carries the count, and only the count`, presence?.attemptSignalCount === 3 && !/pasted|leftThenRight|hardFirstTry/.test(JSON.stringify(presence)), JSON.stringify(presence));

  // S3: the student sees nothing of it, and the grade record knows nothing of it.
  const studentScreen = await page.locator('body').innerText();
  expect(`S3 ${tag} nothing on the student's screen`, !/worth a conversation|pasted into|left the page|right first time/i.test(studentScreen), 'the student is shown a signal');
  // The harness's server (the shared ingestion) records the attempt.
  const recorded = (id) => page.waitForFunction(([student, assignmentId, index]) => Boolean(window.__mmHarnessStore.get(`grades/${student}`)?.gradesByAssignment?.[assignmentId]?.[index]?.status), [id, ASSIGNMENT, QUESTION_INDEX], { timeout: 20000 }).catch(() => {});
  await recorded(STUDENT);
  const marked = await questionRecord(page, STUDENT);
  expect(`S3 ${tag} the question is marked right on its first try`, marked.record?.status === 'correct' && Number(marked.record?.totalAttempts) === 1, JSON.stringify(marked.record));
  expect(`S3 ${tag} the grade record carries no signal`, !/attemptSignal|leftThenRight|hardFirstTry|pasted/i.test(marked.row), 'the roster row mentions a signal');
  const queued = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key]) => /outbox|queue|draft|tracker/i.test(key)))));
  expect(`S3 ${tag} the queued attempt and drafts carry no signal`, !/attemptSignal|leftThenRight|hardFirstTry/i.test(queued), 'a device queue mentions a signal');
  await shot(page, 's3-student-after-submit', viewport);
  // Parked, so its heartbeat stays on file without overwriting later writes.
  const studentTab = page;
  await studentTab.goto('about:blank');

  /* ---------------------------------- a classmate who raised only one */
  page = await openPage(context, `questions=real&server=1&as=student&studentId=${CLASSMATE}`, viewport);
  await openLesson(page);
  await goToTwoPartQuestion(page);
  // The classmate copies something on the page, then pastes it into part 1:
  // the page's own text, so no "pasted".
  await partBox(page, 0, { root: ROOT }).click();
  await page.evaluate(() => document.querySelector('.mathmaster-question-stage').dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, composed: true })));
  await pasteIntoFocusedBox(page, PASTED_TEXT);
  await page.waitForTimeout(800);
  await answerBothParts(page);
  await submit(page);
  const classmateSignals = await waitForSignals(page, CLASSMATE, ['hardFirstTry']);
  expect(`S4 ${tag} a paste of the page's own text and no absence: only "right first time"`, kindsOf(classmateSignals) === 'hardFirstTry', kindsOf(classmateSignals));
  await recorded(CLASSMATE);
  const classmateMarked = await questionRecord(page, CLASSMATE);
  const grade = (record) => JSON.stringify({ status: record?.status, attemptCount: record?.attemptCount, totalAttempts: record?.totalAttempts, isCorrect: record?.isCorrect, score: record?.score ?? null, partialCredit: record?.partialCredit ?? null });
  expect(`S4 ${tag} marked exactly as the student who raised three`, grade(classmateMarked.record) === grade(marked.record), `${grade(classmateMarked.record)} vs ${grade(marked.record)}`);
  await page.close();

  /* ------------------------- supports that explain the pattern: no signal */
  page = await openPage(context, `questions=real&server=1&as=student&studentId=${EVERY_PART_STUDENT}`, viewport);
  await giveSupport(page, EVERY_PART_STUDENT, ['every-part-at-once', 'text-to-speech']);
  await page.reload({ waitUntil: 'networkidle' });
  await openLesson(page);
  await goToTwoPartQuestion(page);
  expect(`S5 ${tag} See every part at once shows both boxes`, (await page.locator(`${ROOT} [data-part-state]`).count()) === 0 && (await page.locator(`${ROOT} math-field`).count()) === 2, 'the question still walks its parts');
  await leaveThePage(page, AWAY_MS);
  await answerBothParts(page);
  await submit(page);
  const exemptSignals = await waitForSignals(page, EVERY_PART_STUDENT, ['hardFirstTry']);
  expect(`S5 ${tag} a support that explains leaving and a burst raises no "left the page"`, kindsOf(exemptSignals) === 'hardFirstTry', kindsOf(exemptSignals));
  expect(`S5 ${tag} the signal that is raised names the supports in effect`, JSON.stringify(exemptSignals[0]?.supports) === JSON.stringify(['every-part-at-once', 'text-to-speech']), JSON.stringify(exemptSignals[0]?.supports));
  await page.close();

  page = await openPage(context, `questions=real&server=1&as=student&studentId=${WORD_PROCESSOR_STUDENT}`, viewport);
  await giveSupport(page, WORD_PROCESSOR_STUDENT, ['word-processor-response']);
  await page.reload({ waitUntil: 'networkidle' });
  await openLesson(page);
  await goToTwoPartQuestion(page);
  await partBox(page, 0, { root: ROOT }).click();
  await pasteIntoFocusedBox(page, PASTED_TEXT);
  await page.waitForTimeout(1200);
  expect(`S5 ${tag} a word-processed response raises no "pasted"`, (await signalsOf(page, WORD_PROCESSOR_STUDENT)).length === 0, JSON.stringify(await signalsOf(page, WORD_PROCESSOR_STUDENT)));
  await page.close();

  /* -------------------------------------------- the teacher's Live tile */
  page = await openPage(context, '', viewport);
  const tile = page.locator(`[data-live-tile="${STUDENT}"]`).first();
  await tile.waitFor({ timeout: 20000 }).catch(() => {});
  const live = tile.locator('[data-worth-a-conversation]');
  await live.waitFor({ timeout: 10000 }).catch(() => {});
  expect(`T1 ${tag} the Live tile says "Worth a conversation"`, (await live.count()) === 1 && /Worth a conversation · 3/.test(await live.innerText().catch(() => '')), (await tile.count()) ? await tile.innerText() : 'no live tile for the student');
  if (await live.count()) {
    await live.scrollIntoViewIfNeeded();
    await live.locator('summary').click();
    const liveText = await live.innerText();
    expect(`T1 ${tag} the facts, as facts`, /Pasted into a math box/.test(liveText) && /What was pasted is not recorded/.test(liveText) && /Left the page, then a burst of right parts/.test(liveText) && /2 parts were answered and marked right/.test(liveText) && /Right first time on a hard question, with no tool work/.test(liveText) && /difficulty band 3/.test(liveText), liveText);
    expect(`T1 ${tag} where each happened`, (liveText.match(/Classwork · Question 3/g) || []).length === 3, liveText);
    expect(`T1 ${tag} never a verdict, and labelled not conclusive`, /never change a score, an attempt or mastery/.test(liveText) && !/cheat|integrity|dishonest|suspicious/i.test(liveText) && (await live.locator('[data-not-conclusive]').count()) === 3, liveText);
    expect(`T1 ${tag} class time and supports beside each`, (liveText.match(/During the class's scheduled time · No supports in effect/g) || []).length === 3, liveText);
    await shot(page, 't1-live-tile', viewport);
    const drawerBefore = await page.locator('[data-student-profile-drawer]').count();
    await live.getByLabel(/^Note for your review \(optional\): Pasted into a math box/).fill(REVIEW_NOTE);
    await live.getByRole('button', { name: /^Mark reviewed: Pasted into a math box/ }).click();
    await page.waitForFunction((id) => document.querySelectorAll(`[data-live-tile="${id}"] [data-attempt-signal]`).length === 2, STUDENT, { timeout: 10000 }).catch(() => {});
    expect(`T1 ${tag} reviewed: it leaves the tile`, (await live.locator('[data-attempt-signal]').count()) === 2 && (await live.locator('[data-attempt-signal="pasted"]').count()) === 0, await live.innerText().catch(() => 'the panel is gone'));
    expect(`T1 ${tag} Mark reviewed does not open the student`, (await page.locator('[data-student-profile-drawer]').count()) === drawerBefore, 'the tile opened the student when Mark reviewed was pressed');
    const dismissed = (await signalsOf(page, STUDENT)).find((signal) => signal.kind === 'pasted');
    expect(`T1 ${tag} the review names the teacher, keeps their note and changes nothing else`, dismissed?.dismissedByEmail === HARNESS_TEACHER && Boolean(dismissed?.dismissedAt) && dismissed.reviewNote === REVIEW_NOTE && dismissed.partIndex === 0 && dismissed.questionIndex === QUESTION_INDEX && dismissed.kind === 'pasted', JSON.stringify(dismissed));
    expect(`T1 ${tag} reviewed is not deleted`, (await signalsOf(page, STUDENT)).length === 3, `${(await signalsOf(page, STUDENT)).length} records`);
    // No tile reads signals for a student whose heartbeat reports none.
    expect(`T1 ${tag} only on tiles that have some`, (await page.locator('[data-live-tile] [data-worth-a-conversation]').count()) === 1, `${await page.locator('[data-live-tile] [data-worth-a-conversation]').count()} tiles show the panel`);
  }

  /* ----------------------------------------- the student's results */
  await tile.getByRole('button').first().click();
  const drawer = page.locator(`[data-student-profile-drawer="${STUDENT}"]`);
  await drawer.waitFor({ timeout: 10000 }).catch(() => {});
  const results = drawer.locator('[data-worth-a-conversation]');
  await results.waitFor({ timeout: 10000 }).catch(() => {});
  await results.locator('[data-attempt-signal]').first().waitFor({ timeout: 10000 }).catch(() => {});
  const resultsText = (await results.count()) ? await results.innerText() : '';
  expect(`T3 ${tag} the student's results list what is still open`, /Worth a conversation \(2\)/.test(resultsText) && /Left the page, then a burst of right parts/.test(resultsText) && /Right first time on a hard question/.test(resultsText) && /Reviewed \(1\)/.test(resultsText), resultsText || 'no "Worth a conversation" in the drawer');
  expect(`T3 ${tag} each names its assignment and question`, (resultsText.match(new RegExp(`${LESSON} · Classwork · Question 3`, 'g')) || []).length >= 2, resultsText);
  if (await results.locator('[data-reviewed-signals]').count()) {
    await results.locator('[data-reviewed-signals] > summary').click();
    const keptText = await results.locator('[data-reviewed-signals]').innerText();
    expect(`T3 ${tag} the reviewed signal is kept, with who reviewed it and their note`, /Pasted into a math box/.test(keptText) && keptText.includes(`Reviewed by ${HARNESS_TEACHER}`) && keptText.includes(REVIEW_NOTE) && (await results.locator('[data-reviewed-signals] button').count()) === 0, keptText);
  } else findings.push(`T3 ${tag}: no "Reviewed" list in the drawer`);
  expect(`T3 ${tag} only the teacher sees them, and they are not a grade`, /Students never see them/.test(resultsText) && /never change a score, an attempt or mastery/.test(resultsText), resultsText);
  if (await results.count()) {
    await results.scrollIntoViewIfNeeded();
    await shot(page, 't3-student-results', viewport);
    await results.getByRole('button', { name: /^Mark reviewed: Left the page/ }).click();
    await page.waitForFunction((id) => /Worth a conversation \(1\)/.test(document.querySelector(`[data-student-profile-drawer="${id}"] [data-worth-a-conversation]`)?.innerText || ''), STUDENT, { timeout: 10000 }).catch(() => {});
    expect(`T3 ${tag} reviewed there too, without a note`, /Worth a conversation \(1\)/.test(await results.innerText()) && /Reviewed \(2\)/.test(await results.innerText()), await results.innerText());
  }
  await drawer.getByRole('button', { name: 'Close student profile' }).click().catch(() => {});

  /* ----------------------------------------------------- the projector */
  const roomTiles = page.getByRole('button', { name: 'Large room tiles' });
  if (await roomTiles.count()) {
    await roomTiles.first().click();
    await page.waitForTimeout(600);
    expect(`T2 ${tag} not on the projector`, (await page.locator('[data-worth-a-conversation]').count()) === 0 && !/Worth a conversation/.test(await page.locator('body').innerText()), '"Worth a conversation" is shown on Large room tiles');
    // A student opened over the projected tiles: the drawer withholds it too.
    await page.locator(`[data-live-tile="${STUDENT}"]`).first().getByRole('button').first().click();
    const projectedDrawer = page.locator(`[data-student-profile-drawer="${STUDENT}"]`);
    await projectedDrawer.waitFor({ timeout: 10000 }).catch(() => {});
    await projectedDrawer.locator('[data-worth-a-conversation-withheld]').waitFor({ timeout: 10000 }).catch(() => {});
    expect(`T2 ${tag} nor in a drawer opened over the projected tiles`, (await projectedDrawer.count()) === 1 && (await projectedDrawer.locator('[data-worth-a-conversation-withheld]').count()) === 1 && (await page.locator('[data-worth-a-conversation], [data-attempt-signal]').count()) === 0, (await projectedDrawer.count()) ? 'the drawer shows the signals while the tiles are projected' : 'the drawer did not open');
  } else findings.push(`T2 ${tag}: no "Large room tiles" control to check the projector`);
  await page.close();

  /* --------------------------------------- the assignment's results */
  // By now: the paste and the absence are reviewed, "right first time" is not.
  page = await openPage(context, '', viewport);
  const openStudent = async () => {
    const liveTile = page.locator(`[data-live-tile="${STUDENT}"]`).first();
    await liveTile.waitFor({ timeout: 20000 });
    await liveTile.getByRole('button').first().click();
    const opened = page.locator(`[data-student-profile-drawer="${STUDENT}"]`);
    await opened.waitFor({ timeout: 10000 });
    return opened;
  };
  let studentDrawer = await openStudent();
  // "Work", exactly: "Mark reviewed: … no tool work" is a button too.
  const lessonRow = studentDrawer.locator('tr, li').filter({ hasText: LESSON }).filter({ has: page.getByRole('button', { name: 'Work', exact: true }) }).last();
  await lessonRow.getByRole('button', { name: 'Work', exact: true }).first().click();
  const questionNotes = page.locator(`[data-question-signals="${QUESTION_INDEX}"]`);
  await questionNotes.waitFor({ timeout: 20000 }).catch(() => {});
  const notesText = (await questionNotes.count()) ? await questionNotes.innerText() : '';
  expect(`T4 ${tag} the assignment's results show the signals beside their question`, (await questionNotes.count()) === 1 && (await questionNotes.locator('[data-attempt-signal]').count()) === 3 && /WORTH A CONVERSATION/i.test(notesText), notesText || 'no signals beside Classwork Q2 in the gradebook\'s student view');
  expect(`T4 ${tag} what happened, in which part, and not conclusive`, /Pasted into a math box/.test(notesText) && /answer box of part 1/.test(notesText) && /Left the page/.test(notesText) && /Right first time/.test(notesText) && (await questionNotes.locator('[data-not-conclusive]').count()) === 3, notesText);
  expect(`T4 ${tag} when, with class time and supports`, /\d{4}/.test(notesText) && /During the class's scheduled time · No supports in effect/.test(notesText), notesText);
  expect(`T4 ${tag} the reviewed ones stay, marked reviewed with the note; one still needs attention`, (await questionNotes.locator('[data-attempt-signal][data-reviewed="true"]').count()) === 2 && notesText.includes(REVIEW_NOTE) && (await questionNotes.getByRole('button', { name: /^Mark reviewed:/ }).count()) === 1, notesText);
  expect(`T4 ${tag} no other question carries a note`, (await page.locator('[data-question-signals]').count()) === 1, `${await page.locator('[data-question-signals]').count()} questions show signals`);
  if (await questionNotes.count()) { await questionNotes.scrollIntoViewIfNeeded(); await shot(page, 't4-assignment-results', viewport); }

  /* ------------------------- worked examples, by skill (WE-G), beside them */
  // Nothing opened yet: the student's results say so, and say it changes no score.
  const studentExamples = page.locator('[data-worked-examples-by-skill="student"]');
  await studentExamples.waitFor({ timeout: 20000 }).catch(() => {});
  const noneText = (await studentExamples.count()) ? await studentExamples.innerText() : '';
  expect(`T6 ${tag} the student's results have "Worked examples, by skill", beside the worth-a-conversation notes`, (await studentExamples.count()) === 1 && /Worked examples, by skill/.test(noneText) && /changes no score/.test(noneText) && (await page.locator('[data-question-signals]').count()) === 1, noneText || 'no worked-examples panel in the gradebook\'s student view');
  expect(`T6 ${tag} none opened is said as none`, /No worked example was opened on this assignment\./.test(noneText), noneText);
  // (This lesson's questions name no family and no student action, so each is
  // listed as a question with no skill named: tests/platform/workedExampleTeacherView.test.mjs
  // covers named skills and their next question.)
  // The student's answer is on record as one they asked for an example on
  // (what QuestionEngine records with the attempt: supportUsage.workedExampleUsed).
  const seeded = await page.evaluate(([student, assignmentId, index]) => {
    const store = window.__mmHarnessStore;
    const mark = (record) => ({ ...record, supportUsage: { ...(record?.supportUsage || {}), workedExampleUsed: true } });
    const detailPath = `grades/${student}/responseDetail/${assignmentId}`;
    const detail = store.get(detailPath);
    if (detail?.questions?.[index]) {
      store.set(detailPath, { ...detail, questions: { ...detail.questions, [index]: mark(detail.questions[index]) } });
      return 'detail';
    }
    const row = store.get(`grades/${student}`) || {};
    const tracker = row.gradesByAssignment?.[assignmentId] || {};
    if (!tracker[index]) return '';
    store.set(`grades/${student}`, { ...row, gradesByAssignment: { ...row.gradesByAssignment, [assignmentId]: { ...tracker, [index]: mark(tracker[index]) } } });
    return 'record';
  }, [STUDENT, ASSIGNMENT, QUESTION_INDEX]);
  await studentExamples.locator('[data-example-opened="asked"]').first().waitFor({ timeout: 20000 }).catch(() => {});
  const openedText = (await studentExamples.count()) ? await studentExamples.innerText() : '';
  const openedRow = studentExamples.locator('[data-example-opened="asked"]');
  expect(`T6 ${tag} an example the student asked for is shown under its skill, with the question and how it was marked`, Boolean(seeded) && (await openedRow.count()) === 1 && /This student opened a worked example once, on 1 question with no skill named\./.test(openedText) && new RegExp(`Question ${QUESTION_INDEX + 1} \\(Classwork\\)`).test(openedText) && /Asked for it/.test(openedText) && /Right on the first try|Right after another try|Not right/.test(openedText), openedText || `seeded: ${seeded || 'no record to mark'}`);
  expect(`T6 ${tag} and what followed on the next question on the skill, as recorded`, /Next question on the skill/i.test(openedText) && /No later question on this skill|Question \d+ \((?:Classwork|Practice|DOL)\): (?:Right on the first try|Right after another try|Not right|Not answered|Answered earlier)/.test(openedText), openedText);
  expect(`T6 ${tag} it says what was recorded, not why`, /do not say the example is why/.test(openedText) && !/because|helped|caused/i.test(openedText), openedText);
  if (await studentExamples.count()) { await studentExamples.scrollIntoViewIfNeeded(); await shot(page, 't6-worked-examples-student', viewport); }
  // The class: which students opened one, per skill; a name opens that student's results.
  await page.getByRole('button', { name: 'Back to class list' }).click();
  const classExamples = page.locator('[data-worked-examples-by-skill="class"]');
  await classExamples.waitFor({ timeout: 20000 }).catch(() => {});
  const classText = (await classExamples.count()) ? await classExamples.innerText() : '';
  expect(`T6 ${tag} the class's results name who opened an example, per skill`, (await classExamples.count()) === 1 && /1 of \d+ students? opened a worked example, on 1 question with no skill named\./.test(classText) && /1 student opened an example \(1 time\)\. On the next question on the skill: /.test(classText) && (await classExamples.locator('[data-example-opened]').count()) === 1, classText || 'no worked-examples panel in the gradebook\'s class view');
  if (await classExamples.count()) {
    await classExamples.scrollIntoViewIfNeeded();
    await shot(page, 't6-worked-examples-class', viewport);
    await classExamples.getByRole('button', { name: /open this student's results/ }).first().click();
    await page.locator('[data-worked-examples-by-skill="student"]').waitFor({ timeout: 20000 }).catch(() => {});
    expect(`T6 ${tag} a name opens that student's results, with the notes`, (await page.locator('[data-worked-examples-by-skill="student"]').count()) === 1 && (await page.locator(`[data-question-signals="${QUESTION_INDEX}"]`).count()) === 1, 'the student\'s results did not open from the class view');
  }
  await page.close();

  /* ------------------------------------------------- the case review */
  page = await openPage(context, '', viewport);
  studentDrawer = await openStudent();
  await studentDrawer.locator('[data-case-review-entry]').getByRole('button', { name: 'Open case review' }).click();
  const review = page.locator('[data-case-review]');
  await review.waitFor({ timeout: 30000 });
  await review.getByRole('button', { name: /^(Build|Rebuild) case review$/ }).click();
  await review.getByRole('tablist').waitFor({ timeout: 30000 });
  await review.getByRole('tab', { name: 'Work-pattern signals' }).click();
  const patterns = review.locator('[data-case-work-patterns]');
  await patterns.waitFor({ timeout: 20000 }).catch(() => {});
  const patternsText = (await patterns.count()) ? await patterns.innerText() : '';
  expect(`T5 ${tag} the case review has a Work-pattern signals section, labelled not conclusive`, /Work-pattern signals \(3\)/.test(patternsText) && /Not conclusive/.test(patternsText) && /no narrative fact is written from them/.test(patternsText), patternsText || 'no Work-pattern signals section');
  expect(`T5 ${tag} patterns over the window: how often, and how many are reviewed`, /Pasted into a math box on 1 of \d+ answered questions?\./.test(patternsText) && /2 of 3 reviewed by a teacher; 1 not yet reviewed\./.test(patternsText) && /Class time: 3 during the class's scheduled time, 0 outside it, 0 not known\./.test(patternsText), patternsText);
  // What the counts are out of is said, with the date they are counted from.
  const denominatorText = (await review.locator('[data-case-signal-denominator]').innerText().catch(() => '')) || '';
  const monthsText = (await review.locator('[data-case-signal-months]').innerText().catch(() => '')) || '';
  expect(`T5 ${tag} the denominator is stated: classroom answers since the first signal on record`, /^Counted out of \d+ answered Warm-Up, Classwork, Practice and DOL questions?, last answered on or after .+ \(the first signal on record for this student\)/.test(denominatorText) && patternsText.includes(denominatorText), denominatorText || 'no denominator line');
  expect(`T5 ${tag} month by month: answers counted and answers with a signal`, /Answers counted/i.test(monthsText) && /\b\d+ of \d+\b/.test(monthsText) && /\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/.test(monthsText), monthsText || 'no month table');
  const rows = review.locator('[data-case-signal-rows] tbody tr');
  const rowsText = (await rows.count()) ? await review.locator('[data-case-signal-rows]').innerText() : '';
  expect(`T5 ${tag} each signal is listed with its review and the teacher's note`, (await rows.count()) === 3 && rowsText.includes(`Teacher's note (the teacher's own words): ${REVIEW_NOTE}`) && (await review.locator('[data-case-signal-rows] [data-teacher-note]').getAttribute('title').catch(() => '')) === 'Teacher-authored: written by the teacher, not a recorded fact or generated evidence.' && /Not yet reviewed/.test(rowsText) && rowsText.includes(`Reviewed by ${HARNESS_TEACHER}`), rowsText || 'no signal rows');
  await shot(page, 't5-case-review-signals', viewport);
  await review.getByRole('tab', { name: 'Timeline' }).click();
  await review.getByRole('button', { name: 'Work-pattern signals' }).click();
  await page.waitForTimeout(400);
  const onTimeline = review.locator('[data-timeline-kind="work-pattern-signal"]');
  expect(`T5 ${tag} on the case timeline`, (await onTimeline.count()) === 3 && (await review.locator('[data-timeline-kind]:not([data-timeline-kind="work-pattern-signal"])').count()) === 0 && /\(not conclusive\)/.test(await onTimeline.first().innerText()), `${await onTimeline.count()} timeline entries`);
  await review.getByRole('tab', { name: 'Narrative facts' }).click();
  await page.waitForTimeout(400);
  // The fact sentences themselves (the tab also prints the guard's own rules).
  const factsText = (await review.locator('[data-case-tab="facts"] .cr-fact__text').allInnerTexts().catch(() => [])).join('\n');
  const signalWords = factsText.match(/.{0,60}(?:pasted|left the page|right first time|work-pattern|worth a conversation).{0,60}/i);
  expect(`T5 ${tag} no narrative fact is written from a signal`, factsText.length > 0 && !signalWords, signalWords ? signalWords[0] : 'the Narrative facts tab did not draw');
  await page.close();
  await studentTab.close();
  await context.close();
}

await browser.close();
console.log(`\n${passed.length} checks passed, ${findings.length} findings.`);
if (findings.length) {
  findings.forEach((finding) => console.error(`  ✗ ${finding}`));
  process.exit(1);
}
