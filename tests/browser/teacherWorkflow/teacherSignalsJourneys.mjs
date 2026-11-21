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
//       leaving or pasting, raises only "right first time"
//   S5  a student with See every part at once who leaves and returns raises
//       no "left the page"; one whose response is word-processed raises no
//       "pasted"
//   T1  the teacher's Live tile shows "Worth a conversation" with the facts;
//       Dismiss records who dismissed it, and the fact leaves the tile
//   T2  the projector's Large room tiles show none of it
//   T3  the student's results (the drawer) list the facts still open, beside
//       the same note, and a second Dismiss works there too
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

const ALLOWED_KEYS = ['schemaVersion', 'studentId', 'assignmentId', 'questionIndex', 'kind', 'attemptNumber', 'activityRole', 'partIndex', 'partCount', 'awaySeconds', 'difficultyBand', 'recordedAt', 'path'];
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
  expect(`S2 ${tag} every record is positions and counts`, signals.every((signal) => Object.keys(signal).every((key) => ALLOWED_KEYS.includes(key)) && Object.entries(signal).every(([key, value]) => ['path', 'studentId', 'assignmentId', 'kind', 'activityRole', 'recordedAt'].includes(key) || Number.isInteger(value))), JSON.stringify(signals));
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
  await answerBothParts(page);
  await submit(page);
  const classmateSignals = await waitForSignals(page, CLASSMATE, ['hardFirstTry']);
  expect(`S4 ${tag} no paste and no absence: only "right first time"`, kindsOf(classmateSignals) === 'hardFirstTry', kindsOf(classmateSignals));
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
    expect(`T1 ${tag} never a verdict`, /never change a score, an attempt or mastery/.test(liveText) && !/cheat|integrity|dishonest|suspicious/i.test(liveText), liveText);
    await shot(page, 't1-live-tile', viewport);
    const drawerBefore = await page.locator('[data-student-profile-drawer]').count();
    await live.getByRole('button', { name: /^Dismiss: Pasted into a math box/ }).click();
    await page.waitForFunction((id) => document.querySelectorAll(`[data-live-tile="${id}"] [data-attempt-signal]`).length === 2, STUDENT, { timeout: 10000 }).catch(() => {});
    expect(`T1 ${tag} dismissed: it leaves the tile`, (await live.locator('[data-attempt-signal]').count()) === 2 && (await live.locator('[data-attempt-signal="pasted"]').count()) === 0, await live.innerText().catch(() => 'the panel is gone'));
    expect(`T1 ${tag} Dismiss does not open the student`, (await page.locator('[data-student-profile-drawer]').count()) === drawerBefore, 'the tile opened the student when Dismiss was pressed');
    const dismissed = (await signalsOf(page, STUDENT)).find((signal) => signal.kind === 'pasted');
    expect(`T1 ${tag} the dismissal names the teacher and changes nothing else`, dismissed?.dismissedByEmail === HARNESS_TEACHER && Boolean(dismissed?.dismissedAt) && dismissed.partIndex === 0 && dismissed.questionIndex === QUESTION_INDEX, JSON.stringify(dismissed));
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
  expect(`T3 ${tag} the student's results list what is still open`, /Worth a conversation \(2\)/.test(resultsText) && /Left the page, then a burst of right parts/.test(resultsText) && /Right first time on a hard question/.test(resultsText) && !/Pasted into a math box/.test(resultsText), resultsText || 'no "Worth a conversation" in the drawer');
  expect(`T3 ${tag} each names its assignment and question`, (resultsText.match(new RegExp(`${LESSON} · Classwork · Question 3`, 'g')) || []).length === 2, resultsText);
  expect(`T3 ${tag} only the teacher sees them, and they are not a grade`, /Only you see them/.test(resultsText) && /never change a score, an attempt or mastery/.test(resultsText), resultsText);
  if (await results.count()) {
    await results.scrollIntoViewIfNeeded();
    await shot(page, 't3-student-results', viewport);
    await results.getByRole('button', { name: /^Dismiss: Left the page/ }).click();
    await page.waitForFunction((id) => document.querySelectorAll(`[data-student-profile-drawer="${id}"] [data-attempt-signal]`).length === 1, STUDENT, { timeout: 10000 }).catch(() => {});
    expect(`T3 ${tag} dismissed there too`, /Worth a conversation \(1\)/.test(await results.innerText()), await results.innerText());
  }
  await drawer.getByRole('button', { name: 'Close student profile' }).click().catch(() => {});

  /* ----------------------------------------------------- the projector */
  const roomTiles = page.getByRole('button', { name: 'Large room tiles' });
  if (await roomTiles.count()) {
    await roomTiles.first().click();
    await page.waitForTimeout(600);
    expect(`T2 ${tag} not on the projector`, (await page.locator('[data-worth-a-conversation]').count()) === 0 && !/Worth a conversation/.test(await page.locator('body').innerText()), '"Worth a conversation" is shown on Large room tiles');
  } else findings.push(`T2 ${tag}: no "Large room tiles" control to check the projector`);
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
