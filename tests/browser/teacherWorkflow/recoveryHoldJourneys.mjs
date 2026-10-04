// A RECOVERY MATHMASTER COULD NOT FULLY GRADE — IN THE REAL APP.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/recoveryHoldJourneys.mjs [--slow]
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1366x768,768x1024,390x844
//    — Chromebook, iPad, phone; ONLY=S1,S2,T1,T2 to run some journeys.)
//
// Same harness as journeys.mjs: the real App.jsx with `firebase/*` replaced by
// in-memory fakes and a synthetic school. `&recovery=p0` adds
// recoveryFixture.js: a DOL Recovery (three Question Family questions on three
// skills, weights 4 / 3 / 3) whose Q3 the teacher re-tuned after three
// students had started — every Q3 pin dealt before the edit names an instance
// the family no longer makes (the PR #430 P0 case). The Recovery callables run
// the real shared server modules (sectionRecoveryActions, sectionRecoveryPlan,
// sectionRecoveryResolution); the Cloud Functions around them are certified on
// the Firestore emulator (tests/integration/sectionRecoveryPlatformFailure).
//
//   S1  Jonah answers Q1 and Q2 in the browser. Q3 cannot be shown: he reads
//       "MathMaster could not grade this Recovery question. It will not count
//       against your score." — never Incorrect, 0 points or wrong, never a
//       code, a pin or a stack — and Submit does not warn him about it. The
//       server holds the Recovery (Q3 was the only intercepts question): the
//       held message, "Under review" on the result screen, Pending Grade in
//       Grades. His pins, questions, answers and original DOL are untouched.
//   S2  Kira's Recovery left Q3 out (Q1 covers its skill): 100%, recorded at
//       the 90 cap, with "MathMaster could not grade 1 Recovery question. It
//       did not count against your score."
//   T1  the teacher: Grades → Algebra I → the lesson. Imani's DOL is marked
//       Held; Details says, per question, what happened and why (no pin, no
//       answer key), whether the evidence was enough and what to do next.
//       Finalize from the graded questions records 100 → 90, audited, and the
//       Held mark becomes the ordinary Recovery mark.
//   T2  the teacher issues a replacement question instead. Imani opens her
//       Recovery: Q1 and Q2 are kept and never asked again, only the new
//       question is open; she answers it and finishes at 90. Q3's pin, result
//       and history stay in the record.
//
// At every viewport nothing scrolls sideways; on a touch screen the controls
// this change added are at least 44 px. `--slow` adds 4× CPU throttling and a
// slow network (the Chromebook).
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/recoveryHold/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';
import {
  EXCLUDED_STUDENT_ID,
  HELD_STUDENT_ID,
  RECOVERY_ASSIGNMENT_ID,
  RECOVERY_ASSIGNMENT_TITLE,
  RECOVERY_SHARED_ASSIGNMENT_ID,
  RECOVERY_SHARED_ASSIGNMENT_TITLE,
  SUBMITTING_STUDENT_ID,
  recoveryFieldAnswers,
} from './recoveryFixture.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/recoveryHold');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SLOW = process.argv.includes('--slow');
const SLOW_FACTOR = SLOW ? 4 : 1;
const VIEWPORTS = (process.env.VIEWPORTS || '1366x768,768x1024,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));
const DB_KEY = 'mm-teacher-workflow-harness-db-v1';
const CLASS_NAME = 'Algebra I — Period 1';
// The teacher, with the harness's Weekly Path scenario healthy (by default it
// fails the way production once did, which is another journey's subject).
const TEACHER_QUERY = 'reset=1&recovery=p0&weeklyPath=ok';

// The brief's words, verbatim (SectionRecoveryRunner.jsx UNAVAILABLE_QUESTION_NOTICE,
// studentRecoveryModel.js RECOVERY_STATE.HELD).
const UNAVAILABLE_NOTICE = 'MathMaster could not grade this Recovery question. It will not count against your score.';
const HELD_MESSAGE = 'Your completed Recovery work has been saved. MathMaster could not grade one or more required questions, so your Recovery is being held for review.';
const EXCLUDED_NOTE = 'MathMaster could not grade 1 Recovery question. It did not count against your score.';
const HELD_GRADE_REASON = 'Not counted yet — your Recovery work is saved, and your teacher is reviewing it because MathMaster could not grade part of it.';
// Never on a student's screen about a question MathMaster could not grade.
const STUDENT_FORBIDDEN = /\bincorrect\b|\b0 points\b|\bwrong\b|fingerprint|mismatch|pin-|\bpin\b|stack|exception|unavailable|Technical details|Copy details|undefined|NaN/i;
// Never in the teacher's Recovery detail: the pin, the generator's internals
// or the answer key.
const TEACHER_FORBIDDEN = /fingerprint|\bpin\b|slot ?key|stride|\bseed\b|variant|answer key|acceptedAnswers|undefined|NaN/i;

// PRE-EXISTING, NOT THIS CHANGE'S, AND SAID SO: the two-step-equation
// family's answer field is called `solution`, a key the server draft backup
// refuses on purpose (functions/shared/workspaceDraftSchema.mjs — it never
// stores anything that looks like an answer key). The draft stays on the
// device; only the cross-device copy is skipped. Family generation belongs to
// another change, so the run reports it as a note, not a finding.
const KNOWN_PREEXISTING = /^console\.error: \[MathMaster draft sync\] The server backup will NOT store "[^"]+": forbidden-key at `solution`/;
const notes = new Set();

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);

const findings = [];
let passed = 0;
const squash = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const expect = (where, condition, detail) => {
  if (condition) passed += 1;
  else findings.push(`${where}: ${detail}`);
  return Boolean(condition);
};
const wanted = (name) => !ONLY || ONLY.includes(name);
const tagOf = (page) => `${page.viewportSize().width}x${page.viewportSize().height}`;
const shot = (page, name) => page.screenshot({ path: path.join(ARTIFACTS, `${name}-${tagOf(page)}.png`), fullPage: true });
const isTouch = (page) => page.viewportSize().width <= 1024 && page.viewportSize().height >= page.viewportSize().width * 0.7;

/* ------------------------------------------------------------- devices */

const openDevice = async ({ viewport, query, context = null }) => {
  const ownContext = context || await newSchoolContext(browser, { viewport });
  const page = await ownContext.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !/Download the React DevTools|favicon/i.test(text)) errors.push(`console.error: ${text.slice(0, 300)}`);
  });
  const unimplemented = watchUnimplementedCallables(page);
  const cdp = SLOW ? await ownContext.newCDPSession(page) : null;
  if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${PAGE}?${query}`, { timeout: 300000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(600 * SLOW_FACTOR);
  if (cdp) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.5e6 / 8, uploadThroughput: 750e3 / 8 });
  return { context: ownContext, page, errors, unimplemented };
};

const closeDevice = async (where, device, { keepContext = false } = {}) => {
  device.errors.filter((error) => KNOWN_PREEXISTING.test(error)).forEach((error) => notes.add(error.slice(0, 160)));
  const errors = device.errors.filter((error) => !KNOWN_PREEXISTING.test(error));
  expect(where, errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
  expect(where, device.unimplemented().length === 0, `every callable reached is implemented (${device.unimplemented().join(', ')})`);
  await device.page.close();
  if (!keepContext) await device.context.close();
};

const harnessDb = async (page) => Object.fromEntries(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), DB_KEY));
const recoveryRecord = (db, studentId, assignmentId) => db[`grades/${studentId}`]?.sectionRecoveryByAssignment?.[assignmentId]?.dol || null;
const assignmentFrom = (db, assignmentId) => ({ id: assignmentId, ...db[`assignments/${assignmentId}`] });
const pinsOf = (record) => Object.fromEntries((record?.plan?.items || []).map((item) => [item.itemId, JSON.stringify(item.pin)]));

/* ------------------------------------------------------------- layout */

const noSidewaysScroll = async (where, page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(where, overflow <= 1, `nothing scrolls sideways (${overflow}px)`);
};

// The controls this change added: big enough for a finger on a touch screen,
// and inside the screen.
const touchTargets = async (where, page, selector) => {
  if (!isTouch(page)) return;
  const report = await page.evaluate((query) => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll(query)].filter((element) => element.getBoundingClientRect().width > 1).map((element) => {
      const rect = element.getBoundingClientRect();
      return { name: String(element.getAttribute('aria-label') || element.innerText || element.tagName).trim().slice(0, 40), width: rect.width, height: rect.height, inside: rect.left >= -1 && rect.right <= width + 1 };
    });
  }, selector);
  const small = report.filter((entry) => entry.height < 43.5 || entry.width < 43.5);
  const outside = report.filter((entry) => !entry.inside);
  expect(where, small.length === 0, `every new control is at least 44 px (${small.map((entry) => `${entry.name} ${Math.round(entry.width)}x${Math.round(entry.height)}`).join('; ')})`);
  expect(where, outside.length === 0, `every new control is on the screen (${outside.map((entry) => entry.name).join('; ')})`);
};

/* ------------------------------------------------------------- student */

// From the dashboard its Grades tab; from an assignment's result screen (which
// has no dashboard tabs) its "View All Grades".
const openStudentGrades = async (page) => {
  const fromResult = page.getByRole('button', { name: 'View All Grades' });
  if (await fromResult.count()) await fromResult.first().click();
  else await page.getByRole('button', { name: /^Grades$/ }).first().click();
  await page.waitForTimeout(500 * SLOW_FACTOR);
};
const gradeRow = (page, title) => page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).first();
const openResult = async (page, title) => {
  await openStudentGrades(page);
  const row = gradeRow(page, title);
  await row.waitFor({ timeout: 30000 * SLOW_FACTOR });
  await row.getByRole('button', { name: 'View Results' }).click();
  const card = page.locator('[data-section-recovery-panel] [data-recovery-section="dol"]');
  await card.waitFor({ timeout: 30000 * SLOW_FACTOR });
  return card;
};

// Type each answer into its field the way a student does: MathLive for math,
// a text box for words.
const answerQuestion = async (page, runner, answers) => {
  const fields = runner.locator('.mathmaster-multipart-fields > div');
  await fields.first().waitFor({ timeout: 30000 * SLOW_FACTOR });
  for (const [index, answer] of answers.entries()) {
    const input = fields.nth(index).locator('math-field, input[type="text"]').first();
    await input.waitFor({ timeout: 10000 * SLOW_FACTOR });
    if (await input.evaluate((element) => element.tagName === 'MATH-FIELD')) {
      await input.evaluate((element, value) => {
        element.setValue(value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }, answer.value);
    } else {
      await input.fill(answer.value);
    }
    await page.waitForTimeout(150 * SLOW_FACTOR);
  }
  await runner.locator('.mathmaster-bar-submit').click();
};

const studentCopy = async (where, locator) => {
  const text = squash(await locator.innerText());
  const hit = text.match(STUDENT_FORBIDDEN);
  expect(where, !hit, `the student never reads "${hit?.[0]}" (${text.slice(0, 160)}…)`);
  return text;
};

/* ------------------------------------------------------------- teacher */

const sidebar = (page, name) => page.locator('nav, aside').getByRole('button', { name: new RegExp(`${name}$`) }).first().click();
const openTeacherGradebook = async (page) => {
  await sidebar(page, 'Grades');
  await page.waitForTimeout(700 * SLOW_FACTOR);
  const chooser = page.locator('section[aria-labelledby="gradebook-choose-class"]');
  if (await chooser.count()) {
    await chooser.getByRole('button', { name: new RegExp(CLASS_NAME) }).first().click();
    await page.waitForTimeout(700 * SLOW_FACTOR);
  }
  const picker = page.locator('select[aria-label="Gradebook assignment"]');
  await picker.waitFor({ timeout: 30000 * SLOW_FACTOR });
  await picker.selectOption(RECOVERY_ASSIGNMENT_ID);
  await page.waitForTimeout(700 * SLOW_FACTOR);
};
const studentRow = (page, studentId) => page.locator('tbody tr').filter({ hasText: `ID ${studentId}` }).first();
const openStudentDetail = async (page, studentId) => {
  await studentRow(page, studentId).getByRole('button', { name: 'Details' }).click();
  const audit = page.locator(`[data-section-recovery-audit="${studentId}"]`);
  await audit.waitFor({ timeout: 30000 * SLOW_FACTOR });
  return audit;
};
const teacherCopy = async (where, locator, { pins = {} } = {}) => {
  const text = squash(await locator.innerText());
  const hit = text.match(TEACHER_FORBIDDEN);
  expect(where, !hit, `the teacher's Recovery detail never shows "${hit?.[0]}"`);
  const fingerprints = Object.values(pins).map((pin) => JSON.parse(pin)?.fingerprint).filter(Boolean);
  expect(where, fingerprints.every((fingerprint) => !text.includes(fingerprint)), 'no pin fingerprint in the teacher\'s Recovery detail');
  return text;
};

/* ------------------------------------------------------------- journeys */

const journeys = {
  // A platform failure on Q3 while the student works: never their fault.
  async S1(viewport) {
    const where = `S1 ${viewport.width}x${viewport.height}`;
    const device = await openDevice({ viewport, query: `reset=1&recovery=p0&as=student&studentId=${SUBMITTING_STUDENT_ID}` });
    const { page } = device;
    const before = await harnessDb(page);
    const assignment = assignmentFrom(before, RECOVERY_ASSIGNMENT_ID);
    const record = recoveryRecord(before, SUBMITTING_STUDENT_ID, RECOVERY_ASSIGNMENT_ID);
    const trackerBefore = JSON.stringify(before[`grades/${SUBMITTING_STUDENT_ID}`].gradesByAssignment[RECOVERY_ASSIGNMENT_ID]);
    const pinsBefore = pinsOf(record);
    const [q1, q2, q3] = record.plan.items;
    expect(where, record.status === 'inProgress', `the student starts in progress (${record.status})`);
    expect(where, recoveryFieldAnswers(assignment, q3) === null, 'Q3\'s pin no longer replays against the edited lesson (the P0 case)');

    const card = await openResult(page, RECOVERY_ASSIGNMENT_TITLE);
    await card.getByRole('button', { name: 'Continue DOL Recovery' }).click();
    const runner = page.locator('[data-recovery-runner="assessment"]');
    await runner.waitFor({ timeout: 30000 * SLOW_FACTOR });

    for (const item of [q1, q2]) {
      await runner.locator(`[data-recovery-item="${item.itemId}"]`).click();
      await answerQuestion(page, runner, recoveryFieldAnswers(assignment, item));
      await runner.locator(`[data-recovery-item="${item.itemId}"][data-recovery-item-state="saved"]`).waitFor({ timeout: 20000 * SLOW_FACTOR });
    }
    expect(where, true, 'Q1 and Q2 render and take an answer');

    await runner.locator(`[data-recovery-item="${q3.itemId}"]`).click();
    const notice = runner.locator(`[data-recovery-unavailable="${q3.itemId}"]`);
    await notice.waitFor({ timeout: 20000 * SLOW_FACTOR });
    expect(where, squash(await notice.innerText()) === UNAVAILABLE_NOTICE, `Q3 says exactly "${UNAVAILABLE_NOTICE}" (${squash(await notice.innerText())})`);
    expect(where, await runner.locator(`[data-recovery-item="${q3.itemId}"]`).getAttribute('data-recovery-item-state') === 'unavailable', 'Q3\'s button says MathMaster could not grade it');
    expect(where, await runner.locator(`[data-recovery-item="${q3.itemId}"]`).getAttribute('aria-label') === 'Question 3, MathMaster could not grade this question', 'and so does its accessible name');
    expect(where, await runner.locator('.mathmaster-bar-submit').count() === 0, 'Q3 offers no Submit: no attempt can be spent on it');
    expect(where, await runner.locator('[data-question-resolution-failure]').count() === 1, 'Q3 is never replaced by a different question');
    await studentCopy(`${where} Q3`, runner);
    await noSidewaysScroll(`${where} Q3`, page);
    await shot(page, 's1-q3-unavailable');

    const submit = runner.getByRole('button', { name: 'Submit DOL Recovery (2/3 saved)' });
    expect(where, await submit.count() === 1, 'Submit counts the two answers saved');
    await submit.click();
    await page.waitForTimeout(400 * SLOW_FACTOR);
    expect(where, await page.getByRole('button', { name: 'Submit anyway' }).count() === 0, 'Submit does not warn that Q3 will count as incorrect');
    const held = page.locator('[data-recovery-runner="held"]');
    await held.waitFor({ timeout: 30000 * SLOW_FACTOR });
    const heldText = await studentCopy(`${where} held`, held);
    expect(where, heldText.includes(HELD_MESSAGE), `the held screen says "${HELD_MESSAGE}"`);
    expect(where, !/\d+%/.test(heldText), 'the held screen shows no score');
    await noSidewaysScroll(`${where} held`, page);
    await shot(page, 's1-held');

    const after = await harnessDb(page);
    const stored = recoveryRecord(after, SUBMITTING_STUDENT_ID, RECOVERY_ASSIGNMENT_ID);
    expect(where, stored.status === 'held' && stored.rawScore === null, `the server held it with no score (${stored.status}, ${stored.rawScore})`);
    expect(where, stored.hold?.reason === 'skill-without-evidence', `because Q3 was the intercepts skill's only question (${stored.hold?.reason})`);
    expect(where, stored.results?.[q1.itemId]?.status === 'correct' && stored.results?.[q2.itemId]?.status === 'correct', 'Q1 and Q2 were graded correct on the server');
    const q3Result = stored.results?.[q3.itemId] || {};
    expect(where, q3Result.status === 'platform-unavailable' && q3Result.credit === null && q3Result.isCorrect === null && q3Result.countsTowardScore === false, `Q3 is MathMaster's failure, never a wrong answer (${JSON.stringify(q3Result)})`);
    expect(where, q3Result.classification === 'pin-fingerprint-mismatch', `classified by the server (${q3Result.classification})`);
    expect(where, JSON.stringify(pinsOf(stored)) === JSON.stringify(pinsBefore), 'every pin is exactly as it was dealt');
    expect(where, stored.plan.items.map((item) => item.questionId).join() === record.plan.items.map((item) => item.questionId).join(), 'every question id is unchanged');
    expect(where, JSON.stringify(after[`grades/${SUBMITTING_STUDENT_ID}`].gradesByAssignment[RECOVERY_ASSIGNMENT_ID]) === trackerBefore, 'the original DOL evidence is untouched');

    await held.getByRole('button', { name: 'Done' }).click();
    const panel = page.locator('[data-section-recovery-panel] [data-recovery-section="dol"]');
    await panel.waitFor({ timeout: 20000 * SLOW_FACTOR });
    expect(where, await panel.getAttribute('data-recovery-state') === 'held', 'the result screen shows the Recovery held');
    const panelText = await studentCopy(`${where} panel`, panel);
    expect(where, /Under review/i.test(panelText) && panelText.includes(HELD_MESSAGE), `the result screen reads "Under review" and the held message (${panelText.slice(0, 120)})`);
    expect(where, await panel.getByRole('button', { name: /Continue|Start/ }).count() === 0, 'nothing offers to resubmit it');
    await noSidewaysScroll(`${where} panel`, page);

    await openStudentGrades(page);
    const row = gradeRow(page, RECOVERY_ASSIGNMENT_TITLE);
    await row.waitFor({ timeout: 20000 * SLOW_FACTOR });
    const rowText = squash(await row.innerText());
    expect(where, /pending grade/i.test(rowText), `Grades says Pending Grade (${rowText.slice(0, 160)})`);
    expect(where, rowText.includes(HELD_GRADE_REASON), 'and says why, in the student\'s words');
    expect(where, !/\b0%|\bincorrect\b|\bwrong\b/i.test(rowText), 'never 0% or wrong');
    await noSidewaysScroll(`${where} grades`, page);
    await shot(page, 's1-grades');
    await closeDevice(where, device);
  },

  // Enough evidence without Q3: scored over what MathMaster could grade.
  async S2(viewport) {
    const where = `S2 ${viewport.width}x${viewport.height}`;
    const device = await openDevice({ viewport, query: `reset=1&recovery=p0&as=student&studentId=${EXCLUDED_STUDENT_ID}` });
    const { page } = device;
    const record = recoveryRecord(await harnessDb(page), EXCLUDED_STUDENT_ID, RECOVERY_SHARED_ASSIGNMENT_ID);
    expect(where, record.status === 'completed' && record.rawScore === 100, `the server scored it 7 of 7 points of weight (${record.status} ${record.rawScore})`);
    expect(where, JSON.stringify(record.evidence?.excludedItemIds) === JSON.stringify([record.plan.items[2].itemId]), 'Q3 was left out of the denominator');

    await openStudentGrades(page);
    const row = gradeRow(page, RECOVERY_SHARED_ASSIGNMENT_TITLE);
    await row.waitFor({ timeout: 20000 * SLOW_FACTOR });
    const rowText = squash(await row.innerText());
    expect(where, /\b90%/.test(rowText) && !/pending grade/i.test(rowText), `Grades shows 90% (${rowText.slice(0, 160)})`);

    const card = await openResult(page, RECOVERY_SHARED_ASSIGNMENT_TITLE);
    expect(where, await card.getAttribute('data-recovery-state') === 'completed', 'the Recovery is complete');
    const cardText = await studentCopy(where, card);
    expect(where, cardText.includes(EXCLUDED_NOTE), `the student reads "${EXCLUDED_NOTE}" (${cardText.slice(0, 200)})`);
    expect(where, /Original\s*30%/.test(cardText) && /Recovery\s*100%/.test(cardText) && /Final\s*90%/.test(cardText), `Original 30% · Recovery 100% · Final 90% (${cardText.slice(0, 200)})`);
    await noSidewaysScroll(where, page);
    await shot(page, 's2-completed');
    await closeDevice(where, device);
  },

  // The teacher sees a held Recovery, understands it, and finalizes it.
  async T1(viewport) {
    const where = `T1 ${viewport.width}x${viewport.height}`;
    const device = await openDevice({ viewport, query: TEACHER_QUERY });
    const { page } = device;
    const before = recoveryRecord(await harnessDb(page), HELD_STUDENT_ID, RECOVERY_ASSIGNMENT_ID);
    await openTeacherGradebook(page);
    await studentRow(page, HELD_STUDENT_ID).waitFor({ timeout: 20000 * SLOW_FACTOR });
    const heldMark = studentRow(page, HELD_STUDENT_ID).locator('[data-held-recovery-section="dol"]');
    expect(where, await heldMark.count() === 1, 'Imani\'s DOL is marked Held in the gradebook');
    const heldCell = squash(await studentRow(page, HELD_STUDENT_ID).locator('td').nth(5).innerText());
    expect(where, /^30%\s*Held$/.test(heldCell), `the DOL column keeps the original 30% while held — never a Recovery score (${heldCell})`);
    await studentRow(page, SUBMITTING_STUDENT_ID).waitFor({ timeout: 20000 * SLOW_FACTOR });
    expect(where, await studentRow(page, SUBMITTING_STUDENT_ID).locator('[data-held-recovery-section]').count() === 0, 'a Recovery still in progress is not');
    await noSidewaysScroll(`${where} gradebook`, page);

    const audit = await openStudentDetail(page, HELD_STUDENT_ID);
    const section = audit.locator('[data-recovery-audit-section="dol"]');
    expect(where, await section.getAttribute('data-recovery-audit-status') === 'held', 'Details shows the DOL Recovery held');
    const text = await teacherCopy(where, section, { pins: pinsOf(before) });
    expect(where, /Held for review/.test(text), 'the status says Held for review');
    expect(where, /Recovery\s*—/.test(text) && /Final\s*30%\s*\(waiting for you\)/.test(text), `no Recovery score counts yet: Final is the original 30% (${text.slice(0, 220)})`);
    expect(where, squash(await audit.locator('[data-held-recovery-reason="dol"]').innerText()) === 'A skill this Recovery assesses has no question MathMaster could grade.', 'the hold says which rule held it');
    const evidence = squash(await audit.locator('[data-recovery-evidence="dol"]').innerText());
    expect(where, /^MathMaster graded 2 of 3 questions \(7 of 10 points of weight\)\. No graded question for: .+\.$/.test(evidence), `whether the evidence was enough (${evidence})`);
    const items = await audit.locator('[data-recovery-items="dol"] li').evaluateAll((nodes) => nodes.map((node) => ({ status: node.dataset.recoveryItemStatus, classification: node.dataset.recoveryItemClassification, text: node.innerText.replace(/\s+/g, ' ').trim() })));
    expect(where, items.length === 3 && items[0].status === 'correct' && items[1].status === 'correct', `each question, by place (${items.map((item) => item.text).join(' | ')})`);
    expect(where, items[2]?.status === 'platform-unavailable' && /DOL Q3/.test(items[2].text) && /not counted against the student/.test(items[2].text) && /The question was changed after this Recovery started/.test(items[2].text), `Q3: what happened and why, in plain words (${items[2]?.text})`);
    expect(where, items[0].text.startsWith('Recovery question 1 (DOL Q1): Correct') && items[1].text.startsWith('Recovery question 2 (DOL Q2): Correct'), 'the graded questions keep their grading');
    const next = squash(await audit.locator('[data-recovery-next-step="dol"]').innerText());
    expect(where, /issue a replacement question/.test(next) && /finalize from the 2 questions MathMaster could grade/.test(next) && /keep the original score/.test(next) && /Classroom and Grade Transfer wait/.test(next), `the next step (${next})`);
    const actions = await audit.locator('[data-held-recovery-action]').evaluateAll((nodes) => nodes.map((node) => node.dataset.heldRecoveryAction));
    expect(where, actions.join() === 'issueReplacement,finalizeGraded,keepOriginal', `what the teacher can do (${actions.join()})`);
    await touchTargets(where, page, '[data-held-recovery-action]');
    await noSidewaysScroll(`${where} details`, page);
    await shot(page, 't1-held-details');

    await audit.locator('[data-held-recovery-action="finalizeGraded"]').click();
    const confirmGroup = audit.getByRole('group', { name: 'Finalize from the graded questions' });
    await confirmGroup.waitFor({ timeout: 10000 * SLOW_FACTOR });
    expect(where, /left out of the score — never counted as wrong/.test(squash(await confirmGroup.innerText())), 'the confirmation says what finalizing means');
    await confirmGroup.locator('input').fill('Q3 was changed after the Recovery started.');
    await touchTargets(where, page, '[data-held-recovery-actions] button, [data-held-recovery-actions] input');
    await noSidewaysScroll(`${where} confirm`, page);
    await audit.locator('[data-held-recovery-confirm="finalizeGraded"]').click();
    await audit.locator('[data-recovery-audit-section="dol"][data-recovery-audit-status="completed"]').waitFor({ timeout: 30000 * SLOW_FACTOR });
    const resolved = await teacherCopy(`${where} resolved`, audit.locator('[data-recovery-audit-section="dol"]'), { pins: pinsOf(before) });
    expect(where, /Recovery\s*100%/.test(resolved) && /Final\s*90%/.test(resolved), `finalized: Recovery 100%, Final 90% (${resolved.slice(0, 200)})`);
    expect(where, /Finalized from the graded questions by .+ — "Q3 was changed after the Recovery started\."/.test(squash(await audit.locator('[data-recovery-resolution="dol"]').innerText())), 'the resolution names who, when and why');
    await shot(page, 't1-finalized');
    // Details replaces the class table; back to it.
    await page.getByRole('button', { name: 'Back to class list' }).click();
    const row = studentRow(page, HELD_STUDENT_ID);
    await row.waitFor({ timeout: 20000 * SLOW_FACTOR });
    expect(where, await row.locator('[data-held-recovery-section]').count() === 0, 'the Held mark is gone');
    expect(where, await row.locator('[data-recovered-section="dol"]').count() === 1, 'and the ordinary Recovery mark is there');
    const dolCell = squash(await row.locator('td').nth(5).innerText());
    expect(where, dolCell.startsWith('90%'), `the DOL column shows the recorded 90% (${dolCell})`);

    const db = await harnessDb(page);
    const after = recoveryRecord(db, HELD_STUDENT_ID, RECOVERY_ASSIGNMENT_ID);
    expect(where, after.status === 'completed' && after.rawScore === 100 && after.evidence?.finalizedBy === 'teacher', `stored: completed, 100, finalized by the teacher (${after.status} ${after.rawScore} ${after.evidence?.finalizedBy})`);
    expect(where, JSON.stringify(after.results) === JSON.stringify(before.results), 'every question\'s result is exactly as graded');
    expect(where, JSON.stringify(pinsOf(after)) === JSON.stringify(pinsOf(before)), 'every pin is exactly as dealt');
    expect(where, Object.keys(db).some((key) => key.startsWith(`grades/${HELD_STUDENT_ID}/gradeOverrideAudits/`)), 'the decision is audited');
    await closeDevice(where, device);
  },

  // The teacher issues a replacement; the student answers only it.
  async T2(viewport) {
    const where = `T2 ${viewport.width}x${viewport.height}`;
    const teacher = await openDevice({ viewport, query: TEACHER_QUERY });
    const before = recoveryRecord(await harnessDb(teacher.page), HELD_STUDENT_ID, RECOVERY_ASSIGNMENT_ID);
    const [q1, q2, q3] = before.plan.items;
    await openTeacherGradebook(teacher.page);
    let audit = await openStudentDetail(teacher.page, HELD_STUDENT_ID);
    await audit.locator('[data-held-recovery-action="issueReplacement"]').click();
    const confirmGroup = audit.getByRole('group', { name: 'Issue a replacement question' });
    await confirmGroup.waitFor({ timeout: 10000 * SLOW_FACTOR });
    expect(where, /The student answers only the new questions; their other answers are kept\./.test(squash(await confirmGroup.innerText())), 'the confirmation says the student answers only the new question');
    await audit.locator('[data-held-recovery-confirm="issueReplacement"]').click();
    await audit.locator('[data-recovery-audit-section="dol"][data-recovery-audit-status="inProgress"]').waitFor({ timeout: 30000 * SLOW_FACTOR });
    const issued = await teacherCopy(`${where} issued`, audit.locator('[data-recovery-audit-section="dol"]'), { pins: pinsOf(before) });
    expect(where, /Replaced by a new question/.test(issued) && /— replacement/.test(issued), `the old question is marked replaced and the new one listed (${issued.slice(0, 260)})`);
    const issuedDb = await harnessDb(teacher.page);
    const reissued = recoveryRecord(issuedDb, HELD_STUDENT_ID, RECOVERY_ASSIGNMENT_ID);
    const replacement = reissued.plan.items.find((item) => item.replaces === q3.itemId);
    expect(where, replacement && replacement.itemId !== q3.itemId && replacement.pin?.fingerprint !== q3.pin.fingerprint, 'the replacement is a new item with a new identity');
    expect(where, replacement?.issueReason === 'pin-fingerprint-mismatch', `and records why it was issued (${replacement?.issueReason})`);
    expect(where, JSON.stringify(reissued.plan.items.find((item) => item.itemId === q3.itemId)?.pin) === JSON.stringify(q3.pin), 'Q3\'s pin is kept, never rewritten');
    expect(where, JSON.stringify(reissued.results?.[q3.itemId]) === JSON.stringify(before.results?.[q3.itemId]), 'and so is Q3\'s result');
    await shot(teacher.page, 't2-issued');
    // The student signs in on this device's school account, in another tab.
    await closeDevice(`${where} teacher`, teacher, { keepContext: true });

    const student = await openDevice({ viewport, query: `recovery=p0&as=student&studentId=${HELD_STUDENT_ID}`, context: teacher.context });
    const { page } = student;
    const card = await openResult(page, RECOVERY_ASSIGNMENT_TITLE);
    expect(where, await card.getAttribute('data-recovery-state') === 'inProgress', 'the student\'s Recovery is open again');
    const cardText = await studentCopy(`${where} student panel`, card);
    expect(where, /new question/i.test(cardText), `the student is told a new question is waiting (${cardText.slice(0, 200)})`);
    await card.getByRole('button', { name: 'Continue DOL Recovery' }).click();
    const runner = page.locator('[data-recovery-runner="assessment"]');
    await runner.waitFor({ timeout: 30000 * SLOW_FACTOR });
    const nav = await runner.locator('[data-recovery-item]').evaluateAll((nodes) => nodes.map((node) => `${node.dataset.recoveryItem}:${node.dataset.recoveryItemState}`));
    expect(where, nav.join() === `${q1.itemId}:submitted,${q2.itemId}:submitted,${replacement.itemId}:open`, `Q1 and Q2 are kept, Q3 is gone, the replacement is open (${nav.join()})`);
    expect(where, await runner.locator(`[data-recovery-item="${replacement.itemId}"][aria-current="step"]`).count() === 1, 'the runner opens on the replacement');
    await answerQuestion(page, runner, recoveryFieldAnswers(assignmentFrom(issuedDb, RECOVERY_ASSIGNMENT_ID), replacement));
    await runner.locator(`[data-recovery-item="${replacement.itemId}"][data-recovery-item-state="saved"]`).waitFor({ timeout: 20000 * SLOW_FACTOR });
    await runner.locator(`[data-recovery-item="${q1.itemId}"]`).click();
    expect(where, await runner.locator(`[data-recovery-submitted="${q1.itemId}"]`).count() === 1 && await runner.locator('.mathmaster-bar-submit').count() === 0, 'Q1 is never asked again');
    await studentCopy(`${where} runner`, runner);
    await noSidewaysScroll(`${where} runner`, page);
    await shot(page, 't2-student-replacement');
    await runner.getByRole('button', { name: 'Submit DOL Recovery (1/1 saved)' }).click();
    const complete = page.locator('[data-recovery-runner="complete"]');
    await complete.waitFor({ timeout: 30000 * SLOW_FACTOR });
    const completeText = squash(await complete.innerText());
    expect(where, /Original\s*30%/.test(completeText) && /Recovery\s*100%/.test(completeText) && /Final\s*90%/.test(completeText), `finished: Original 30% · Recovery 100% · Final 90% (${completeText.slice(0, 200)})`);
    await noSidewaysScroll(`${where} complete`, page);
    await shot(page, 't2-student-complete');

    const db = await harnessDb(page);
    const after = recoveryRecord(db, HELD_STUDENT_ID, RECOVERY_ASSIGNMENT_ID);
    expect(where, after.status === 'completed' && after.rawScore === 100, `stored: completed at 100 (${after.status} ${after.rawScore})`);
    expect(where, JSON.stringify(after.results?.[q1.itemId]) === JSON.stringify(before.results?.[q1.itemId]) && JSON.stringify(after.results?.[q2.itemId]) === JSON.stringify(before.results?.[q2.itemId]), 'Q1 and Q2 kept their first grading, byte for byte');
    expect(where, JSON.stringify(after.results?.[q3.itemId]) === JSON.stringify(before.results?.[q3.itemId]) && after.plan.items.find((item) => item.itemId === q3.itemId)?.supersededBy === replacement.itemId, 'Q3\'s result and pin stay in the record, marked replaced');
    expect(where, after.results?.[replacement.itemId]?.status === 'correct', 'the replacement was graded on the server');
    expect(where, (after.history || []).some((entry) => entry.event === 'held'), 'the hold stays in the history');
    expect(where, (after.holdHistory || []).some((entry) => entry.resolution?.action === 'issueReplacement'), 'and so does the teacher\'s decision');
    await closeDevice(`${where} student`, student, { keepContext: true });

    // Back on the teacher's tab: the Recovery counts now.
    const again = await openDevice({ viewport, query: TEACHER_QUERY.replace('reset=1&', ''), context: teacher.context });
    await openTeacherGradebook(again.page);
    await studentRow(again.page, HELD_STUDENT_ID).waitFor({ timeout: 20000 * SLOW_FACTOR });
    expect(where, await studentRow(again.page, HELD_STUDENT_ID).locator('[data-held-recovery-section]').count() === 0 && await studentRow(again.page, HELD_STUDENT_ID).locator('[data-recovered-section="dol"]').count() === 1, 'the gradebook shows the completed Recovery, not Held');
    audit = await openStudentDetail(again.page, HELD_STUDENT_ID);
    const done = await teacherCopy(`${where} teacher after`, audit.locator('[data-recovery-audit-section="dol"]'), { pins: pinsOf(after) });
    expect(where, /Recovery\s*100%/.test(done) && /Final\s*90%/.test(done), `the teacher sees Recovery 100%, Final 90% (${done.slice(0, 200)})`);
    await closeDevice(`${where} teacher after`, again);
  },
};

const started = Date.now();
for (const viewport of VIEWPORTS) {
  for (const [name, run] of Object.entries(journeys)) {
    if (!wanted(name)) continue;
    const where = `${name} ${viewport.width}x${viewport.height}`;
    const t0 = Date.now();
    try {
      await run(viewport);
      console.log(`ran ${where}${SLOW ? ' (slow)' : ''} in ${Math.round((Date.now() - t0) / 1000)} s`);
    } catch (error) {
      findings.push(`${where}: threw ${String(error?.message || error).split('\n')[0]}`);
      console.log(`threw ${where}: ${String(error?.stack || error).split('\n').slice(0, 4).join(' | ')}`);
    }
  }
}
await browser.close();

if (notes.size) {
  console.log('\nPre-existing, outside this change (reported, not counted):');
  notes.forEach((note) => console.log(`  note ${note}`));
}
console.log(`\n${passed} checks passed in ${Math.round((Date.now() - started) / 1000)} s${SLOW ? ' (4× CPU, slow network)' : ''}.`);
if (findings.length) {
  console.log(`\n${findings.length} finding(s):`);
  findings.forEach((finding) => console.log(`  FAIL ${finding}`));
  process.exit(1);
}
console.log('No findings.');
