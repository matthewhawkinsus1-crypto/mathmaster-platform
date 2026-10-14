// The Secure Test workflow, as a teacher and as students, in real browsers,
// against the REAL Cloud Functions — at a desktop and at a Chromebook viewport.
//
// HOW TO RUN (one command; it starts the emulator, the bridge and Vite):
//
//   node tests/browser/testCycleSecureWorkflowQa.mjs
//   QA_SHOTS=/some/dir QA_DEVICES=chromebook node tests/browser/testCycleSecureWorkflowQa.mjs
//
// It needs Java (the Firestore emulator), functions/node_modules and Chromium
// (PLAYWRIGHT_MODULE / PLAYWRIGHT_CHROMIUM as for testCycleLifecycleQa.mjs),
// and exits 1 on any finding.
//
// WHAT IS REAL. The teacher's Test Cycle panel and the student's card — the
// production components — with every callable posted to a local bridge that
// runs the real handler against the Firestore emulator under the page's
// identity (the same harness as testCycleLifecycleQa.mjs). A secure sitting
// that only sets the scene (an absent student's Retest) is driven straight
// through those handlers, as tests/integration does.
//
// WHAT IT CHECKS, the way a teacher and a student would notice it:
//   teacher  the Review as a grade on each row; a Retest with no original
//            Test shown as "Not taken", its actual score beside the capped
//            grade; adding a class and a student to the same Test; setting the
//            Test day from the bell schedule and reading the exact times and
//            the work-from-home line; class-wide Waive Review and Open Test
//            sessions as one operation with its account; a partial failure
//            shown as an error with the student named; a grade set by hand;
//            archive offered instead of a delete that would lose work.
//   student  the Test closed before its class period, with the time and "in
//            class" said, and a direct call refused; open during it; a missed
//            Test turned into a Retest at home with its closing time; the
//            Retest closed after the home window.
//   both     no sideways scroll and readable buttons at each viewport.
//
// NOTHING TOUCHES PRODUCTION: firebase.js is swapped for an emulator module,
// the browsers block every non-local request, and the project id is throwaway.
// A QA tool, not a CI gate (see testCycleLifecycleQa.mjs for why); the same
// rules are held on every push by tests/integration/testCycleSecureWorkflow.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const PROJECT = 'mathmaster-game-harness';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8182';
const VITE_PORT = Number(process.env.QA_VITE_PORT || 5198);
const BRIDGE_PORT = Number(process.env.QA_BRIDGE_PORT || 5298);
const ORIGIN = `http://localhost:${VITE_PORT}`;
const BRIDGE = `http://localhost:${BRIDGE_PORT}`;
const SHOTS = process.env.QA_SHOTS || path.join(os.tmpdir(), 'test-cycle-secure-workflow-qa');
mkdirSync(SHOTS, { recursive: true });

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  chromebook: { viewport: { width: 1366, height: 768 } },
};
const RUN_DEVICES = (process.env.QA_DEVICES || 'desktop,chromebook').split(',').map((name) => name.trim()).filter((name) => DEVICES[name]);

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const log = (...parts) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);
const findings = [];
const passes = [];
const check = (ok, label, detail = '') => {
  (ok ? passes : findings).push(detail ? `${label} — ${detail}` : label);
  log(ok ? 'PASS' : 'FAIL', label, ok ? '' : detail);
};

const waitForHttp = async (url, attempts = 120) => {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return true;
    } catch { /* not up yet */ }
    await wait(500);
  }
  return false;
};

const started = [];
const killAll = () => { for (const child of started) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } } };
process.on('exit', killAll);
let startedEmulator = null;
const stopEmulator = async () => {
  if (!startedEmulator) return;
  try { process.kill(-startedEmulator.pid, 'SIGINT'); } catch { return; }
  for (let index = 0; index < 40; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (!await waitForHttp(`http://${EMULATOR}/`, 1)) return;
    // eslint-disable-next-line no-await-in-loop
    await wait(500);
  }
};

/* --------------------------- emulator + server --------------------------- */

process.env.FIRESTORE_EMULATOR_HOST = EMULATOR;
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
if (!await waitForHttp(`http://${EMULATOR}/`, 2)) {
  const emulator = spawn('npx', ['firebase', 'emulators:start', '--only', 'firestore', '--project', PROJECT, '--config', path.join(here, 'emulator/firebase.json')],
    { cwd: path.join(here, 'emulator'), stdio: 'ignore', detached: true });
  started.push(emulator);
  startedEmulator = emulator;
  if (!await waitForHttp(`http://${EMULATOR}/`)) { console.error('Firestore emulator did not start.'); process.exit(2); }
}
await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

const functionsIndex = require(path.join(repo, 'functions/platformEntry.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();
const fixture = await import(path.join(repo, 'tests/fixtures/testCycleCertificationFixture.mjs'));
const availabilityRules = await import(path.join(repo, 'functions/shared/testCycleAvailability.mjs'));
const { zonedDateKey } = await import(path.join(repo, 'functions/shared/instructionalCalendar.mjs'));
const { SCHOOL_TIME_ZONE } = await import(path.join(repo, 'functions/shared/sectionDeadline.mjs'));

const TEACHER = 'qa.teacher@desotoisd.org';
const authFor = (identity = {}) => (identity.as === 'teacher'
  ? { uid: `${identity.email}-uid`, token: { role: 'teacher', email: identity.email, email_verified: true } }
  : { uid: `${identity.studentId}-uid`, token: { role: 'student', studentId: identity.studentId } });
const asTeacher = (name, data) => functionsIndex[name].run({ auth: authFor({ as: 'teacher', email: TEACHER }), data, rawRequest: { headers: {} } });
const asStudent = (name, studentId, data) => functionsIndex[name].run({ auth: authFor({ as: 'student', studentId }), data, rawRequest: { headers: {} } });

const bridge = http.createServer(async (request, response) => {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', 'content-type');
  response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  const name = decodeURIComponent((request.url || '').replace(/^\/call\//, ''));
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const { identity, data } = JSON.parse(raw || '{}');
  const handler = functionsIndex[name];
  if (!handler?.run) { response.writeHead(404, { 'content-type': 'application/json' }); response.end(JSON.stringify({ code: 'not-found', message: `No callable ${name}` })); return; }
  try {
    const result = await handler.run({ auth: authFor(identity), data, rawRequest: { headers: {} } });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: result ?? null }));
  } catch (error) {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: error?.code || 'internal', message: error?.message || String(error), details: error?.details ?? null }));
  }
});
await new Promise((resolve) => bridge.listen(BRIDGE_PORT, resolve));

const vite = spawn('npx', ['vite', '--config', path.join(here, 'emulator/vite.testCycleBridge.config.mjs'), '--port', String(VITE_PORT), '--strictPort'],
  { cwd: repo, stdio: 'ignore', detached: true });
started.push(vite);
if (!await waitForHttp(`${ORIGIN}/`)) { console.error('Vite did not start.'); killAll(); process.exit(2); }

/* -------------------------------- fixture -------------------------------- */

const PREFIX = 'qasw_';
const QUESTIONS = 4;
const DAY = 86400000;
const dayKey = (offset = 0) => zonedDateKey(Date.now() + offset * DAY, SCHOOL_TIME_ZONE);
const families = fixture.certFamilies().map((family) => ({ ...family, id: family.id.replace(/^cert_/, PREFIX), familyId: String(family.familyId).replace(/^cert_/, PREFIX) }));

// Each device runs the whole journey on its own classes, students and Tests.
const world = (device) => {
  const tag = device === 'desktop' ? 'd' : 'c';
  const classId = (name) => `qasw-${tag}-class-${name}`;
  const period = (name) => `QA ${tag.toUpperCase()} Period ${name}`;
  const student = (name) => `QASW_${tag.toUpperCase()}_${name}`;
  return {
    tag,
    classes: { a: classId('a'), b: classId('b'), c: classId('c'), s: classId('s') },
    periods: { a: period('2'), b: period('5'), c: period('7'), s: period('3') },
    teacherTest: `qasw-${tag}-unit-4-test`,
    studentTest: `qasw-${tag}-unit-5-test`,
    students: {
      ana: [student('ANA'), 'Ana Rivera', 'a'],     // Review answered, one item half right
      ben: [student('BEN'), 'Ben Okafor', 'a'],     // Review finished
      cy: [student('CY'), 'Cy Nguyen', 'a'],        // nothing done
      dee: [student('DEE'), 'Dee Alvarez', 'a'],    // missed the Test; Retest released
      // A surname as long as a real roster's longest: the name column's width is
      // its longest word, and the table has to fit the teacher's column with it.
      fay: [student('FAY'), 'Fay Weatherspoon', 'b'], // class B, added to the Test
      gus: [student('GUS'), 'Gus Petrov', 'b'],
      eli: [student('ELI'), 'Eli Brooks', 'c'],     // added individually
      sam: [student('SAM'), 'Sam Whitfield', 's'],  // the window journey
      uma: [student('UMA'), 'Uma Castillo', 's'],   // misses the Test
    },
  };
};

const blueprint = (id) => ({
  blueprintId: `${PREFIX}${id}`,
  version: 1,
  title: 'Unit Test — Linear Models',
  courseId: 'algebra1',
  calculatorMode: 'questionSpecific',
  targets: fixture.CERT_TARGETS.slice(0, 2).map((target) => ({
    targetId: target.targetId,
    alignmentKey: target.alignmentKey,
    label: target.label,
    dok: target.dok,
    difficultyBand: target.difficultyBand,
    representation: target.representation,
    anchor: target.anchor,
    weight: 1,
    questionCount: 2,
    familyIds: families.filter((family) => family.id.startsWith(`${PREFIX}${target.targetId}-`)).map((family) => family.id),
  })),
});

const assignmentDoc = (id, title, classIds) => ({
  id,
  schemaVersion: 5,
  title,
  courseId: 'algebra1',
  assignedClassIds: classIds,
  dueAt: new Date(Date.now() + 5 * DAY).toISOString(),
  lateDueAt: new Date(Date.now() + 9 * DAY).toISOString(),
  assignment: { title, courseId: 'algebra1' },
  assessmentPolicy: { ...fixture.certAssessmentPolicy(), retest: { ...fixture.certAssessmentPolicy().retest, questionCount: QUESTIONS } },
  testBlueprint: blueprint(id),
  sections: [{
    id: 'review', role: 'review', title: 'Review',
    questions: [
      { questionId: `${id}_r1`, type: 'response', prompt: 'Review 1' },
      { questionId: `${id}_r2`, type: 'response', prompt: 'Review 2' },
    ],
  }],
});

const completeReview = (studentId, assignmentId) => db.collection('grades').doc(studentId).set({
  gradesByAssignment: { [assignmentId]: { 0: { status: 'correct', totalAttempts: 1 }, 1: { status: 'correct', totalAttempts: 1 } } },
}, { merge: true });
const storeAvailability = (assignmentId, value) => db.collection('assignments').doc(assignmentId).update({ testAvailability: value });

/** Sit a secure session through the real handlers, every answer right. */
const sitAllCorrect = async (studentId, examSessionId) => {
  await asStudent('startSecureExamSession', studentId, { examSessionId });
  for (let index = 0; index < QUESTIONS; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const issued = await asStudent('issueSecureExamQuestion', studentId, { examSessionId });
    // eslint-disable-next-line no-await-in-loop
    await asStudent('submitSecureExamResponse', studentId, {
      examSessionId,
      questionInstanceId: issued.questionInstance.questionInstanceId,
      responsePayload: { responses: { answer: fixture.certAnswerFromPrompt(issued.questionInstance.prompt) } },
      submissionId: `qasw-${examSessionId}-${index}`,
    });
  }
  await asStudent('finalizeSecureExam', studentId, { examSessionId });
};

const seed = async (w) => {
  await Promise.all(families.map(({ id, ...fields }) => db.collection('pathQuestionBank').doc(id).set(fields)));
  await Promise.all(Object.entries(w.classes).map(([name, classId]) => db.collection('classes').doc(classId).set({
    name: `Algebra I — ${w.periods[name]}`, period: w.periods[name], teacherOfRecord: TEACHER, status: 'active', course: 'algebra1',
  })));
  await Promise.all(Object.values(w.students).map(([studentId, displayName, className]) => db.collection('grades').doc(studentId).set({
    displayName, classId: w.classes[className], classPeriod: w.periods[className], assignedTeacherEmail: TEACHER, status: 'active', gradesByAssignment: {},
  })));
  await db.collection('assignments').doc(w.teacherTest).set(assignmentDoc(w.teacherTest, 'Unit 4 Test Cycle', [w.classes.a]));
  await db.collection('assignments').doc(w.studentTest).set(assignmentDoc(w.studentTest, 'Unit 5 Test Cycle', [w.classes.s]));
  // Every class's period, all day, on the bell schedule for three days.
  const periods = Object.fromEntries(Object.values(w.periods).map((name) => [name, { enabled: true, start: '00:00', end: '23:59' }]));
  await db.collection('settings').doc('classSchedule').set({
    modifiedSchedules: Object.fromEntries([-1, 0, 1].map((offset) => [dayKey(offset), { periods }])),
  }, { merge: true });

  // Ana: both Review questions answered, the second half right, saved today.
  await db.collection('grades').doc(w.students.ana[0]).set({
    gradesByAssignment: { [w.teacherTest]: {
      0: { status: 'correct', totalAttempts: 1, lastAttemptAt: new Date(Date.now() - 3 * 3600000).toISOString() },
      1: { status: 'attempted', totalAttempts: 2, bestPartialCredit: 50, lastAttemptAt: new Date(Date.now() - 3600000).toISOString() },
    } },
  }, { merge: true });
  await completeReview(w.students.ben[0], w.teacherTest);
  // Dee missed the Test (its day was yesterday), took the Retest at home with
  // everything right, and her teacher released it: 100% actual, 70% recorded.
  const dee = w.students.dee[0];
  await completeReview(dee, w.teacherTest);
  await storeAvailability(w.teacherTest, availabilityRules.withClassTestDay(null, { classId: w.classes.a, dateKey: dayKey(-1) }));
  const deeCard = await asStudent('getStudentTestCycle', dee, { assignmentId: w.teacherTest });
  await sitAllCorrect(dee, deeCard.examSessionId);
  await asTeacher('releaseTestCycleResults', { assignmentId: w.teacherTest, stage: 'retest', studentIds: [dee] });
  // The teacher's journey starts where a cycle is today: no window set.
  await db.collection('assignments').doc(w.teacherTest).update({ testAvailability: admin.firestore.FieldValue.delete() });

  // The window journey: both students finished Review and have a Test session.
  await completeReview(w.students.sam[0], w.studentTest);
  await completeReview(w.students.uma[0], w.studentTest);
  await asTeacher('runTestCycleBulkAction', { assignmentId: w.studentTest, action: 'openTestSessions', scope: { kind: 'all' }, operationId: `${PREFIX}seed-${w.tag}-${Date.now()}` });
};

/* -------------------------------- browsers ------------------------------- */

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const contexts = [];
const open = async ({ query, device }) => {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: 'light', timezoneId: 'America/Chicago' });
  contexts.push(context);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://localhost') || url.startsWith('ws://localhost') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => findings.push(`page error (${query}): ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error' && !/favicon|Failed to load resource/.test(message.text())) findings.push(`console error (${device}): ${message.text().slice(0, 200)}`); });
  await page.goto(`${ORIGIN}/tests/browser/testCycleLifecycleQa.html?${query}&bridge=${encodeURIComponent(BRIDGE)}&emulator=${EMULATOR}`, { timeout: 240_000 });
  return page;
};
const studentPage = (device, studentId, assignmentId) => open({ device, query: `view=student&as=student&studentId=${studentId}&assignmentId=${assignmentId}` });
const teacherPage = (device, assignmentId, classId, { column = 0 } = {}) => open({ device, query: `view=teacher&roster=1&as=teacher&email=${encodeURIComponent(TEACHER)}&assignmentId=${assignmentId}&classId=${classId}${column ? `&column=${column}` : ''}` });
// The teacher shell's content column: #root is 1126px wide, and the sidebar
// and the shell's padding leave 812px for a Secure Exams card on any laptop.
const SHELL_COLUMN = 812;

let shotIndex = 0;
const shot = async (page, name) => {
  shotIndex += 1;
  const file = path.join(SHOTS, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};
const waitForStage = (page, stage, timeout = 60_000) => page.waitForFunction(
  (expected) => document.querySelector('[data-test-cycle-stage]')?.getAttribute('data-test-cycle-stage') === expected, stage, { timeout },
);
const textOf = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();

/* Layout + contrast, measured the way a person meets them. */
const audit = async (page, label) => {
  const result = await page.evaluate(() => {
    const parse = (value) => (value.match(/[\d.]+/g) || []).map(Number);
    const luminance = ([r, g, b]) => {
      const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const background = (element) => {
      for (let node = element; node; node = node.parentElement) {
        const parts = parse(getComputedStyle(node).backgroundColor);
        if (parts.length >= 3 && (parts.length < 4 || parts[3] > 0.5)) return parts.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const visible = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
    const buttons = [...document.querySelectorAll('button')].filter(visible).map((button) => ({
      text: (button.textContent || '').trim().slice(0, 40),
      disabled: button.disabled,
      contrast: ratio(parse(getComputedStyle(button).color).slice(0, 3), background(button)),
      height: button.getBoundingClientRect().height,
    }));
    // A control with no accessible name is one a screen reader cannot offer.
    const unnamed = [...document.querySelectorAll('input, select')].filter(visible).filter((control) => (
      !control.labels?.length && !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby')
    )).map((control) => control.outerHTML.slice(0, 80));
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, buttons, unnamed };
  });
  check(result.overflow <= 1, `${label}: no sideways scroll of the page`, `overflow ${result.overflow}px`);
  const unreadable = result.buttons.filter((button) => button.contrast < (button.disabled ? 3 : 4.5));
  check(unreadable.length === 0, `${label}: every visible button is readable`, unreadable.map((button) => `"${button.text}" ${button.contrast.toFixed(2)}:1`).join('; '));
  const small = result.buttons.filter((button) => button.height < 32);
  check(small.length === 0, `${label}: every button is tall enough to press`, small.map((button) => `"${button.text}" ${Math.round(button.height)}px`).join('; '));
  check(result.unnamed.length === 0, `${label}: every input has a label`, result.unnamed.join(' | '));
};

/*
 * The panel at the width the teacher's screen gives it.
 *
 * Every other check opens the panel across the whole window. On the real
 * teacher screen it sits in an 812px column, and there the roster table once
 * grew wider than the card, the card wider than the page, and the Recorded
 * column was cut off with nothing to scroll.
 */
const shellColumnCheck = async (device, w) => {
  const at = (label) => `teacher @${device}, in the ${SHELL_COLUMN}px content column: ${label}`;
  const page = await teacherPage(device, w.teacherTest, w.classes.a, { column: SHELL_COLUMN });
  await page.locator(`tr[data-student-row="${w.students.fay[0]}"]`).waitFor({ timeout: 180_000 });
  const measured = await page.evaluate(() => {
    const column = document.querySelector('[data-qa-shell-column]');
    const card = column.querySelector('[data-test-cycle-teacher]');
    const table = card.querySelector('table');
    const scroller = table.parentElement;
    const columnRight = column.getBoundingClientRect().right;
    const scrollerRight = scroller.getBoundingClientRect().right;
    const visible = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
    return {
      columnWidth: column.getBoundingClientRect().width,
      cardWidth: card.getBoundingClientRect().width,
      tableWidth: table.getBoundingClientRect().width,
      scrollerWidth: scroller.clientWidth,
      sidewaysScroll: scroller.scrollWidth - scroller.clientWidth,
      cutOffColumns: [...table.querySelectorAll('thead th')].filter((th) => th.getBoundingClientRect().right > scrollerRight + 1).map((th) => th.textContent.trim()),
      cutOffControls: [...card.querySelectorAll('button, select, input')].filter(visible).filter((control) => control.getBoundingClientRect().right > columnRight + 1)
        .map((control) => (control.textContent || control.getAttribute('aria-label') || control.tagName).trim().slice(0, 40)),
      tallestRow: Math.max(...[...table.querySelectorAll('tbody > tr[data-student-row]')].map((tr) => tr.getBoundingClientRect().height)),
      columns: [...table.querySelectorAll('thead th')].map((th) => `${th.textContent.trim()} ${Math.round(th.getBoundingClientRect().width)}`).join(', '),
    };
  });
  log(`shell column @${device}: table ${Math.round(measured.tableWidth)}px in ${measured.scrollerWidth}px, tallest row ${Math.round(measured.tallestRow)}px; ${measured.columns}`);
  check(measured.cardWidth <= measured.columnWidth + 1, at('the card is no wider than its column'), `card ${Math.round(measured.cardWidth)}px in a ${Math.round(measured.columnWidth)}px column`);
  check(measured.cutOffControls.length === 0, at('no button or field reaches past the column\'s edge'), measured.cutOffControls.join(' | '));
  check(measured.cutOffColumns.length === 0 && measured.sidewaysScroll <= 1, at('every column, Recorded included, is on screen without scrolling the table sideways'), `table ${Math.round(measured.tableWidth)}px in ${measured.scrollerWidth}px; cut off: ${measured.cutOffColumns.join(', ') || 'none'}; columns: ${measured.columns}`);
  check(measured.tallestRow <= 125, at('a student\'s row is not stretched tall by the Review facts'), `tallest row ${Math.round(measured.tallestRow)}px`);
  await shot(page, `${device}-teacher-shell-column`);
};

/* ------------------------------- journeys -------------------------------- */

const teacherJourney = async (device, w) => {
  const at = (label) => `teacher @${device}: ${label}`;
  const page = await teacherPage(device, w.teacherTest, w.classes.a);
  const panel = page.locator(`[data-test-cycle-teacher="${w.teacherTest}"]`);
  const row = (key) => page.locator(`tr[data-student-row="${w.students[key][0]}"]`);
  await row('ana').waitFor({ timeout: 180_000 });

  // 1. The table: the Review as a grade, and a Retest with no original Test.
  const anaReview = await textOf(row('ana').locator('[data-review-summary]'));
  check(/^Done · 75% 2\/2 answered 1\.5 \/ 2 pts/.test(anaReview), at('the Review cell shows status, percent, answered and points'), anaReview);
  check(/saved \w{3} \d+, \d+:\d{2} (AM|PM)$/.test(anaReview), at('the Review cell shows when it was last saved'), anaReview);
  const anaReviewTitle = await row('ana').locator('[data-review-summary]').getAttribute('title');
  check(/saved .+ (AM|PM) C[DS]T/.test(anaReviewTitle || ''), at('the full saved time, with the school zone, is the cell\'s tooltip'), anaReviewTitle || '');
  check(/Not started/.test(await textOf(row('cy').locator('[data-review-summary]'))), at('a student who has done nothing reads "Not started"'));
  const deeCells = await row('dee').locator('td').allInnerTexts();
  check(deeCells.some((text) => text.trim() === 'Not taken'), at('a Retest with no original shows the Test as "Not taken"'), deeCells.join(' | '));
  check(deeCells.filter((text) => /^(100|70)%/.test(text.trim())).length >= 3, at('the actual Retest score (100%) sits beside the capped 70% and the recorded 70%'), deeCells.join(' | '));
  const windows = page.locator('[data-test-cycle-windows]');
  check(/No class-time window is set/.test(await textOf(windows)), at('a cycle with no Test day says so, and that nothing is enforced'));
  check(/Corrections and Retest: no closing time yet\. Once a Test day is set they close: \w{3}, \w{3} \d+, /.test(await textOf(windows)), at('with no Test day, the home window\'s closing time is not presented as in force'), (await textOf(windows)).slice(0, 400));
  await shot(page, `${device}-teacher-1-table`);
  await audit(page, at('results table'));

  // 2. Who is assigned, and adding a class and a student to the SAME Test.
  await page.getByRole('button', { name: /^Who is assigned · 4$/ }).click();
  const audience = page.locator('[data-test-cycle-audience]');
  await audience.waitFor();
  check(/Who is assigned · 4 students/.test(await textOf(audience)), at('the assigned classes and their sizes are listed'));
  // Exact: the student picker beside it now names each student's class, so
  // the class's name is also inside that picker's own label.
  await audience.getByLabel(`Algebra I — ${w.periods.b}`, { exact: true }).check();
  await audience.getByRole('button', { name: 'Add 1 class to this Test' }).click();
  await row('fay').waitFor({ timeout: 60_000 });
  check(await row('gus').isVisible(), at('the added class\'s students are on the table'));
  await audience.getByLabel('Add one student').selectOption(w.students.eli[0]);
  await audience.getByRole('button', { name: 'Add this student' }).click();
  await row('eli').waitFor({ timeout: 60_000 });
  check(/Added individually/.test(await textOf(row('eli'))), at('a student added on their own is marked as such'));
  const audienceText = await textOf(page.locator('[data-test-cycle-audience]'));
  check(/Eli Brooks · added individually · sits the Test with Algebra I/.test(audienceText), at('the audience review names the added student and the class they sit with'), audienceText.slice(0, 260));
  check(/Eli Brooks: added/.test(await textOf(page.locator('[data-audience-result]'))), at('each addition is reported by name'));
  // Nothing that existed changed: Dee's released Retest is exactly as it was.
  check((await row('dee').locator('td').allInnerTexts()).some((text) => text.trim() === 'Not taken'), at('existing results are untouched by adding to the audience'));
  await shot(page, `${device}-teacher-2-audience`);

  // 3. The Test day, from the bell schedule: exact times, and "in class".
  const classCard = windows.locator(`[data-test-window-class="${w.classes.a}"]`);
  const dayOptions = await classCard.getByLabel('Test day').locator('option').allInnerTexts();
  check(dayOptions.length >= 2 && /12:00 AM C[DS]T – 11:59 PM C[DS]T/.test(dayOptions[1]), at('the days offered are read from the bell schedule, with their times'), dayOptions.slice(0, 3).join(' | '));
  await classCard.getByLabel('Test day').selectOption({ index: 1 });
  await classCard.getByRole('button', { name: 'Set the Test day' }).click();
  await classCard.locator('[data-window-state="open"]').first().waitFor({ timeout: 60_000 });
  const cardText = await textOf(classCard);
  check(/Test Open now until \w{3}, \w{3} \d+, 11:59 PM C[DS]T/.test(cardText), at('the Test window shows its exact closing time in school time'), cardText.slice(0, 220));
  check(/The Test is taken in class\. Students cannot start it from home\./.test(cardText), at('the Test says it is taken in class'));
  check(/Corrections and Retest Opens when the Test window closes/.test(cardText) && /Students may do Corrections and the Retest from home\./.test(cardText), at('the home window says when it opens and that it is from home'));
  check(/Corrections and Retest close: \w{3}, \w{3} \d+, /.test(await textOf(windows)), at('the home window\'s closing time (the late due date) is shown'));
  check(/3 students have no Test session open yet|students have no Test session open yet/.test(await textOf(windows)), at('the panel warns that students have no Test session before the window'));
  await shot(page, `${device}-teacher-3-window-set`);

  // 4. Class-wide Waive Review for two ticked students: one operation, with its account.
  await row('cy').getByRole('checkbox').check();
  await row('fay').getByRole('checkbox').check();
  const bulk = page.locator('[data-test-cycle-bulk]');
  check(/2 selected:/.test(await textOf(bulk)), at('the class-wide bar counts the students ticked'));
  await bulk.locator('[data-bulk-action="waiveReview"]').click();
  const confirm = panel.getByRole('alertdialog');
  check(/Waive Review for 2 selected students\?/.test(await textOf(confirm)), at('the confirmation names how many students'));
  await confirm.getByRole('button', { name: 'Waive Review', exact: true }).click();
  const operation = page.locator('[data-test-cycle-operation]');
  await page.locator('[data-test-cycle-operation][data-operation-tone="success"]').waitFor({ timeout: 90_000 });
  check(/Waive Review finished for 2 students: 2 succeeded, 0 failed\./.test(await textOf(operation)), at('the operation reports succeeded and failed counts'), await textOf(operation));
  // The table reloads after the operation: wait for it rather than a clock.
  await row('cy').locator('[data-review-summary]', { hasText: 'Waived' }).waitFor({ timeout: 60_000 });
  check(/Waived/.test(await textOf(row('fay').locator('[data-review-summary]'))), at('the waived students\' Review now reads Waived'));
  check((await page.evaluate(() => window.__mmBridgeCalls.filter((entry) => entry.name === 'teacherTestCycleAction').length)) === 0, at('no per-student request was sent for the class-wide action'));

  // 5. Open Test sessions for everyone on the table (both classes and the
  //    added student): one operation. Dee, who took the Retest in the Test's
  //    place, is reported as not eligible rather than given a Test.
  await bulk.locator('[data-bulk-action="openTestSessions"]').click();
  check(/Open secure Test sessions for all 7 students\?/.test(await textOf(panel.getByRole('alertdialog'))), at('with nobody ticked the action is for the whole table'));
  await panel.getByRole('alertdialog').getByRole('button', { name: 'Open Test sessions', exact: true }).click();
  await page.locator('[data-test-cycle-operation][data-operation-tone="success"]', { hasText: 'Open Test sessions' }).waitFor({ timeout: 120_000 });
  const opened = await textOf(page.locator('[data-test-cycle-operation]'));
  check(/Open Test sessions finished for 7 students: 6 succeeded, 1 not eligible, 0 failed\./.test(opened), at('Open Test sessions reports succeeded, not eligible and failed'), opened);
  check(/Dee Alvarez: They missed the Test and are on the Retest that replaced it\./.test(opened), at('the student who is not eligible is named with the reason'));
  // The class button, pressed again, opens nothing twice.
  await page.getByRole('button', { name: /Open secure Test sessions|Open sessions for students who joined since/ }).click();
  await panel.getByText(/Secure Test sessions: 0 opened, 3 already open\./).waitFor({ timeout: 120_000 });
  const sessions = await db.collection('examSessions').where('courseTest.assignmentId', '==', w.teacherTest).get();
  const perStudent = new Map();
  sessions.docs.forEach((entry) => { if (entry.data().courseTest.cycleStage === 'test') perStudent.set(entry.data().studentId, (perStudent.get(entry.data().studentId) || 0) + 1); });
  check([...perStudent.values()].every((count) => count === 1) && perStudent.size === 6 && !perStudent.has(w.students.dee[0]), at('every eligible student has exactly one Test session, and Dee has none'), JSON.stringify([...perStudent]));
  await shot(page, `${device}-teacher-4-operations`);

  // 6. A partial failure is an error, with the student named — never a success.
  await page.route('**/call/runTestCycleBulkAction', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ data: {
      success: true, busy: false, operationId: 'qasw-simulated-partial', assignmentId: w.teacherTest, action: 'waiveReview', actionLabel: 'Waive Review',
      status: 'completedWithFailures', finished: true, tone: 'error',
      counts: { total: 2, succeeded: 1, alreadyComplete: 0, notEligible: 0, failed: 1, pending: 0 },
      headline: 'Waive Review did not finish for everyone: 1 succeeded, 1 failed, of 2 students.',
      failures: [{ studentId: w.students.gus[0], detail: 'A server error stopped this student\'s change. Nothing was changed for them; run it again.' }],
      notEligible: [],
      results: [],
    } }),
  }));
  await row('gus').getByRole('checkbox').check();
  await bulk.locator('[data-bulk-action="waiveReview"]').click();
  await panel.getByRole('alertdialog').getByRole('button', { name: 'Waive Review', exact: true }).click();
  const failed = page.locator('[data-test-cycle-operation][data-operation-tone="error"]');
  await failed.waitFor({ timeout: 60_000 });
  check((await failed.getAttribute('role')) === 'alert', at('a partial failure is announced as an alert'));
  check(/did not finish for everyone: 1 succeeded, 1 failed/.test(await textOf(failed)), at('a partial failure is never worded as finished'));
  check(/Gus Petrov: A server error stopped this student's change/.test(await textOf(failed.locator('[data-operation-failures]'))), at('the student it failed for is named with the reason'));
  check((await panel.getByText(/Waive Review finished for/).count()) === 0, at('no success line is shown beside a partial failure'));
  await shot(page, `${device}-teacher-5-partial-failure`);
  await page.unroute('**/call/runTestCycleBulkAction');
  await failed.getByRole('button', { name: 'Dismiss' }).click();

  // 7. A grade set by hand: the actual Retest score, read by the server, and audited.
  await row('dee').getByRole('button', { name: /Actions/ }).click();
  const actions = page.locator(`[data-test-cycle-actions-for="${w.students.dee[0]}"]`);
  check(/No original Test was taken\. The Retest score was 100%; it is recorded at the 70% retest cap\./.test(await textOf(actions)), at('the row explains why the recorded grade is 70%'));
  await actions.getByRole('button', { name: 'Set this grade by hand' }).click();
  const form = page.locator(`[data-test-cycle-grade-form="${w.students.dee[0]}"]`);
  const formText = await textOf(form);
  check(/Use the Review score \(100%\)/.test(formText) && /Use the actual Retest score \(100%\)/.test(formText) && /Enter a grade/.test(formText), at('the grade sources are named with what each would record'), formText.slice(0, 200));
  await form.getByLabel(/Use the actual Retest score/).check();
  await form.getByRole('button', { name: 'Record this grade' }).click();
  await row('dee').locator('[data-recorded-grade]', { hasText: 'Set by teacher' }).waitFor({ timeout: 60_000 });
  check(/100%/.test(await textOf(row('dee').locator('[data-recorded-grade]'))), at('the recorded grade is the actual Retest score, marked as set by the teacher'));
  const deeRecord = (await db.collection('testCycleRecords').doc(`${w.teacherTest}__${w.students.dee[0]}`).get()).data();
  const audit70to100 = deeRecord.history.at(-1);
  check(audit70to100.reason === 'teacherAdjustment' && audit70to100.by === TEACHER && audit70to100.previousRecordedGrade === 70 && audit70to100.recordedGrade === 100 && deeRecord.retest.rawScore === 100,
    at('the adjustment is audited (who, from what, 70 → 100) and the secure score is unchanged'), JSON.stringify(audit70to100));
  await shot(page, `${device}-teacher-6-grade-set`);

  // 8. Delete would lose work, so archive is offered instead; restore brings it back.
  await page.getByRole('button', { name: 'Archive or delete' }).click();
  const lifecycle = page.locator('[data-test-cycle-lifecycle]');
  await lifecycle.getByRole('button', { name: 'Delete permanently…' }).click();
  const dialog = lifecycle.getByRole('alertdialog');
  await dialog.getByText(/students? ha(s|ve) work on this Test, so it cannot be deleted/).waitFor({ timeout: 60_000 });
  check((await dialog.getByRole('button', { name: 'Delete permanently' }).count()) === 0, at('permanent delete is not offered while students have work'));
  await dialog.getByRole('button', { name: 'Archive it instead' }).click();
  await panel.getByText('Archived', { exact: true }).first().waitFor({ timeout: 60_000 });
  check((await db.collection('assignments').doc(w.teacherTest).get()).data().archived === true, at('archiving is recorded on the server'));
  check((await db.collection('testCycleRecords').where('assignmentId', '==', w.teacherTest).get()).size >= 7, at('archiving deletes no record'));
  await shot(page, `${device}-teacher-7-archived`);
  await lifecycle.getByRole('button', { name: 'Restore this Test' }).click();
  await panel.getByText('Open to students').first().waitFor({ timeout: 60_000 });
  check(true, at('a restored Test is open to students again'));
  await audit(page, at('whole panel after the journey'));
  await page.context().close();
};

const studentJourney = async (device, w) => {
  const at = (label) => `student @${device}: ${label}`;
  const sam = w.students.sam[0];
  const uma = w.students.uma[0];
  const setDay = (offset) => asTeacher('updateTestCycleAvailability', { assignmentId: w.studentTest, action: 'setClassTestDay', classId: w.classes.s, dateKey: dayKey(offset) });

  // 1. The Test day is tomorrow: closed, with the time and "in class" said.
  await setDay(1);
  const page = await studentPage(device, sam, w.studentTest);
  await waitForStage(page, 'test', 180_000);
  const closedButton = page.getByRole('button', { name: 'Opens in class' });
  check(await closedButton.isDisabled(), at('before the class period the Test cannot be started'));
  const schedule = page.locator('[data-test-cycle-schedule]');
  const testBlock = await textOf(schedule.locator('[data-schedule-block="test"]'));
  check(/Test: Opens \w{3}, \w{3} \d+, 12:00 AM C[DS]T/.test(testBlock), at('the card shows the exact opening time in school time'), testBlock);
  check(/The Test is taken in class\. You cannot start it from home\./.test(testBlock), at('the card says the Test is taken in class'));
  const homeBlock = await textOf(schedule.locator('[data-schedule-block="followUp"]'));
  check(/Corrections and Retest: Opens when the Test window closes/.test(homeBlock) && /You may do Corrections and the Retest from home\./.test(homeBlock), at('the card says Corrections and the Retest are done from home, and until when'), homeBlock);
  check(/not a timer/.test(await textOf(schedule)) && (await page.getByText(/Test is not timed/).count()) > 0, at('availability is not presented as a timer'));
  await shot(page, `${device}-student-1-before-window`);
  await audit(page, at('card before the window'));
  // A direct call from the page — the Tests & Exams list or a saved link — is refused.
  const sessionId = (await db.collection('testCycleRecords').doc(`${w.studentTest}__${sam}`).get()).data().test.examSessionId;
  const bypass = await page.evaluate(async ({ bridgeUrl, examSessionId, studentId }) => {
    const response = await fetch(`${bridgeUrl}/call/startSecureExamSession`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity: { as: 'student', studentId }, data: { examSessionId } }),
    });
    return { status: response.status, body: await response.json() };
  }, { bridgeUrl: BRIDGE, examSessionId: sessionId, studentId: sam });
  check(bypass.status !== 200 && /opens .* during your class period/.test(bypass.body?.message || ''), at('starting the Test directly before its window is refused by the server'), bypass.body?.message);

  // 2. Today: open, and it starts.
  await setDay(0);
  await page.reload();
  await waitForStage(page, 'test', 120_000);
  check(/Test: Open now until \w{3}, \w{3} \d+, 11:59 PM C[DS]T/.test(await textOf(page.locator('[data-schedule-block="test"]'))), at('during the class period the card shows when the window closes'));
  await page.getByRole('button', { name: 'Start Test' }).click();
  await page.locator('[data-secure-start-rules]').waitFor({ timeout: 60_000 });
  check(await page.getByText('This test is not timed. Take the time you need.').isVisible(), at('inside the window the secure Test opens, untimed'));
  await shot(page, `${device}-student-2-window-open`);
  // Into the Test. Next and "Review and submit" sit under the question, so the
  // page is at the bottom when they are pressed (Playwright scrolls a button
  // into view before clicking it, as a student scrolls down to it). What opens
  // next must open at its top.
  await page.locator('[data-secure-start-rules]').locator('xpath=..').getByRole('button', { name: 'Start Test' }).click();
  await page.locator('[data-secure-exam-status="in_progress"]').waitFor({ timeout: 60_000 });
  await page.getByText(/Question 1 of \d+/).first().waitFor({ timeout: 60_000 });
  const scrollTop = () => page.evaluate(() => Math.round(document.scrollingElement.scrollTop));
  const scrollRoom = () => page.evaluate(() => Math.round(document.scrollingElement.scrollHeight - window.innerHeight));
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await page.getByRole('button', { name: 'Review and submit', exact: true }).click();
  await page.getByText('Review your answers').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  check((await scrollTop()) === 0, at('the answer review before Submit opens at its top'), `scrollTop ${await scrollTop()}`);
  await shot(page, `${device}-student-2b-answer-review`);
  await page.getByRole('button', { name: 'Back to questions', exact: true }).click();
  await page.getByText(/Question 1 of \d+/).first().waitFor({ timeout: 30_000 });
  // A short window, so that question 2 is taller than the screen: a question
  // that fits sits at the top whatever the page does, and the check below
  // would pass without the behaviour it is here for.
  await page.setViewportSize({ width: DEVICES[device].viewport.width, height: 420 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Next →', exact: true }).click();
  await page.getByText(/Question 2 of \d+/).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(400);
  const room = await scrollRoom();
  check(room > 100, at('question 2 is taller than the window, so where it opens can be told'), `it can scroll ${room}px`);
  check((await scrollTop()) === 0, at('the next question opens at its top, not where Next was pressed'), `scrollTop ${await scrollTop()} of ${room}`);
  await page.context().close();

  // 3. Uma never started. The day has passed: she goes straight to the Retest at home.
  await storeAvailability(w.studentTest, availabilityRules.withClassTestDay(null, { classId: w.classes.s, dateKey: dayKey(-1) }));
  const missed = await studentPage(device, uma, w.studentTest);
  await waitForStage(missed, 'retest', 180_000);
  check(await missed.getByRole('button', { name: 'Start Retest' }).isEnabled(), at('a student who missed the Test is offered the Retest'));
  check(/did not take the Test in its class-time window, so you go straight to the Retest\. There are no corrections to do/.test(await textOf(missed.locator('[data-test-cycle-stage]'))), at('the card says why, and that there are no corrections'));
  check((await missed.locator('[data-test-cycle-phase="test"]').getAttribute('data-phase-status')) === 'missed' && /Not taken/.test(await textOf(missed.locator('[data-test-cycle-phase="test"]'))), at('the Test phase reads "Not taken"'));
  check((await missed.locator('[data-test-cycle-phase="corrections"]').getAttribute('data-phase-status')) === 'notRequired', at('Corrections are not required of a student with no answers to correct'));
  const retestBlock = await textOf(missed.locator('[data-schedule-block="followUp"]'));
  check(/Retest: Open now until \w{3}, \w{3} \d+, /.test(retestBlock) && /final due date/.test(retestBlock) && /You may take the Retest from home\./.test(retestBlock), at('the Retest\'s closing time and "from home" are on the card'), retestBlock);
  const missedText = await textOf(missed.locator('[data-test-cycle-stage]'));
  check(!/Corrections and the Retest from home/.test(missedText) && !/mostly the ones you missed/.test(missedText) && /your Retest covers every skill that was on it/.test(missedText), at('a student who missed the Test is not told about corrections or missed skills they do not have'), missedText.slice(-260));
  check((await missed.locator('[data-schedule-block="test"]').count()) === 0, at('the closed Test window is not shown to a student who can no longer take it'));
  await shot(missed, `${device}-student-3-missed-retest`);
  await audit(missed, at('missed-Test card'));
  const umaRecord = (await db.collection('testCycleRecords').doc(`${w.studentTest}__${uma}`).get()).data();
  const originalTest = await missed.evaluate(async ({ bridgeUrl, examSessionId, studentId }) => {
    const response = await fetch(`${bridgeUrl}/call/startSecureExamSession`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity: { as: 'student', studentId }, data: { examSessionId } }),
    });
    return response.status;
  }, { bridgeUrl: BRIDGE, examSessionId: umaRecord.test.examSessionId, studentId: uma });
  check(originalTest !== 200 && umaRecord.retest.withoutOriginal === true, at('the original Test can no longer be opened; the Retest is recorded as having no original'));

  // 4. The home window has ended: the Retest cannot be started.
  await storeAvailability(w.studentTest, availabilityRules.withFollowUpClose(
    availabilityRules.withClassTestDay(null, { classId: w.classes.s, dateKey: dayKey(-1) }),
    { mode: 'custom', closesAt: Date.now() - 60000 },
  ));
  await missed.reload();
  await waitForStage(missed, 'retest', 120_000);
  check(await missed.getByRole('button', { name: 'Retest window closed' }).isDisabled(), at('after the home window the Retest cannot be started'));
  check(/The Retest closed .*Ask your teacher if you need it reopened\./.test(await textOf(missed.locator('[data-test-cycle-stage]'))), at('the card says it closed and what to do'));
  await shot(missed, `${device}-student-4-home-window-closed`);
  // The teacher gives her longer; the card opens again.
  await asTeacher('updateTestCycleAvailability', { assignmentId: w.studentTest, action: 'setStudentFollowUpClose', studentId: uma, closesAt: Date.now() + DAY });
  await missed.reload();
  await waitForStage(missed, 'retest', 120_000);
  check(await missed.getByRole('button', { name: 'Start Retest' }).isEnabled(), at('a teacher\'s extension reopens the Retest for that student'));
  check(/extended for this student/.test(await textOf(missed.locator('[data-schedule-block="followUp"]'))), at('the card says the time was extended for them'));
  await missed.context().close();

  // 5. A student added on their own opens the assessment.
  const eli = await studentPage(device, w.students.eli[0], w.teacherTest);
  await waitForStage(eli, 'review', 120_000);
  check(true, at('a student added individually can open the Test Cycle'));
  await eli.context().close();
};

let exitCode = 0;
try {
  for (const device of RUN_DEVICES) {
    const w = world(device);
    // eslint-disable-next-line no-await-in-loop
    await seed(w);
    log(`fixture seeded for ${device}`);
    // eslint-disable-next-line no-await-in-loop
    await teacherJourney(device, w);
    // After the teacher's journey: the table now has the added class, a
    // student added individually and a grade set by hand, so it is at its widest.
    // eslint-disable-next-line no-await-in-loop
    await shellColumnCheck(device, w);
    // eslint-disable-next-line no-await-in-loop
    await studentJourney(device, w);
  }
} catch (error) {
  findings.push(`the journey stopped: ${error?.message || error}`);
  console.error(error);
  for (const context of contexts) {
    for (const page of context.pages()) {
      // eslint-disable-next-line no-await-in-loop
      await shot(page, 'stopped-here').catch(() => {});
    }
  }
} finally {
  await browser.close().catch(() => {});
  bridge.close();
  // The emulator first, by asking the CLI: a SIGKILL of its group would leave
  // the Java process holding the port for the next emulator run.
  await stopEmulator();
  killAll();
}

console.log(`\n${passes.length} passed, ${findings.length} findings. Screenshots: ${SHOTS}`);
if (findings.length) {
  console.log('\nFINDINGS');
  findings.forEach((finding) => console.log(` - ${finding}`));
  exitCode = 1;
}
process.exit(exitCode);
