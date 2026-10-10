// Drive a whole Test Cycle, as a teacher and as students, in real browsers,
// against the REAL Cloud Functions.
//
// HOW TO RUN (one command; it starts the emulator, the bridge and Vite):
//
//   npm run test:test-cycle-lifecycle        (node tests/browser/testCycleLifecycleQa.mjs)
//   QA_SHOTS=/some/dir node tests/browser/testCycleLifecycleQa.mjs   # keep screenshots
//
// It needs Java (the Firestore emulator), functions/node_modules and Chromium,
// and takes about five minutes. It exits 1 on any finding.
//
// WHAT IS REAL. The student card, the secure exam container and question
// player, corrections, the teacher's results panel and the teacher preview —
// the production components — with every callable posted to a local bridge
// that runs the real handler from functions/platformEntry.js against the
// Firestore emulator under the page's identity. Review completion is written
// the way ingestion writes it (the canonical tracker), because Review is the
// ordinary lesson runtime, certified elsewhere.
//
// WHAT IT CHECKS, as a teacher and a student would notice it:
//   - the Review gate on screen AND against a direct call from the page;
//   - the card follows the server without a reload (Review done, results
//     released, retest opened);
//   - an untimed Test shows no clock and is not called the SAT;
//   - skip, flag and go back: every answer is a saved draft until Submit;
//     answers survive going offline and a reload; the review before Submit
//     names the questions with no answer;
//   - release from the results panel; corrections with real tries; the
//     retest; the capped recorded grade, explained;
//   - the teacher preview's stages and real secure items, writing nothing;
//   - no sideways scroll, a reachable action, readable disabled controls, at
//     Chromebook, iPad and phone widths, light and dark.
//
// NOTHING TOUCHES PRODUCTION: firebase.js is swapped for an emulator module,
// the browsers block every non-local request, and the project id is throwaway.
// This is a QA tool, not part of the CI gate: no CI job has the emulator, the
// functions' dependencies and Chromium together, and the emulator suites
// (test:challenge-finish, test:test-cycle-certification) already hold its
// server-side journey on every push.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
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
const VITE_PORT = Number(process.env.QA_VITE_PORT || 5196);
const BRIDGE_PORT = Number(process.env.QA_BRIDGE_PORT || 5297);
const ORIGIN = `http://localhost:${VITE_PORT}`;
const BRIDGE = `http://localhost:${BRIDGE_PORT}`;
const SHOTS = process.env.QA_SHOTS || path.join(os.tmpdir(), 'test-cycle-lifecycle-qa');
mkdirSync(SHOTS, { recursive: true });

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const log = (...parts) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);
const findings = [];
const passes = [];
const check = (ok, label, detail = '') => {
  (ok ? passes : findings).push(detail ? `${label} — ${detail}` : label);
  log(ok ? 'PASS' : 'FAIL', label, detail);
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
// SIGKILL on the npx group leaves the emulator's Java process running (the
// Firebase CLI never gets to stop it), and the next run would reuse it with
// this run's students already past Review. Ask the CLI to stop it instead.
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
// Every run starts from an empty database, whether or not the emulator was
// already running.
await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

const functionsIndex = require(path.join(repo, 'functions/platformEntry.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();
const fixture = await import(path.join(repo, 'tests/fixtures/testCycleCertificationFixture.mjs'));

const authFor = (identity = {}) => (identity.as === 'teacher'
  ? { uid: `${identity.email}-uid`, token: { role: 'teacher', email: identity.email, email_verified: true } }
  : { uid: `${identity.studentId}-uid`, token: { role: 'student', studentId: identity.studentId } });

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

const PREFIX = 'qa_';
const TEACHER = 'qa.teacher@desotoisd.org';
const CLASS_ID = 'qa-class-period-2';
const ASSIGNMENT_ID = 'qa-unit-3-test-cycle';
const STUDENTS = { failer: 'QA_FAILER', passer: 'QA_PASSER', skipper: 'QA_SKIPPER' };
const families = fixture.certFamilies().map((family) => ({ ...family, id: family.id.replace(/^cert_/, PREFIX), familyId: String(family.familyId).replace(/^cert_/, PREFIX) }));
const blueprint = (() => {
  const source = fixture.certBlueprint();
  delete source.timeLimitSeconds; // UNTIMED, as most classroom Tests are.
  source.blueprintId = `${PREFIX}blueprint`;
  source.title = 'Unit 3 Test — Linear and Exponential Models';
  source.targets = source.targets.map((target) => ({ ...target, familyIds: target.familyIds.map((id) => id.replace(/^cert_/, PREFIX)) }));
  return source;
})();

const seed = async () => {
  await Promise.all(families.map(({ id, ...fields }) => db.collection('pathQuestionBank').doc(id).set(fields)));
  await db.collection('classes').doc(CLASS_ID).set({ name: 'Algebra I — Period 2', period: 'Period 2', teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
  for (const [label, studentId] of Object.entries(STUDENTS)) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('grades').doc(studentId).set({
      displayName: `QA ${label}`, classId: CLASS_ID, classPeriod: 'Period 2', assignedTeacherEmail: TEACHER, status: 'active', gradesByAssignment: {},
    });
  }
  const assignment = fixture.certAssignment({ classIds: [CLASS_ID] });
  await db.collection('assignments').doc(ASSIGNMENT_ID).set({
    ...assignment,
    id: ASSIGNMENT_ID,
    title: 'Unit 3 Test Cycle',
    testBlueprint: blueprint,
    sections: assignment.sections.filter((section) => section.role === 'review'),
  });
};

const completeReview = (studentId) => db.collection('grades').doc(studentId).set({
  gradesByAssignment: { [ASSIGNMENT_ID]: { 0: { status: 'correct', totalAttempts: 1 }, 1: { status: 'attempted', totalAttempts: 1 } } },
}, { merge: true });

/* -------------------------------- browsers ------------------------------- */

const DEVICES = {
  chromebook: { viewport: { width: 1366, height: 768 } },
  ipad: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const contexts = [];
const open = async ({ query, device = 'chromebook', theme = 'light' }) => {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme });
  contexts.push(context);
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://localhost') || url.startsWith('ws://localhost') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => findings.push(`page error (${query}): ${error.message}`));
  await page.goto(`${ORIGIN}/tests/browser/testCycleLifecycleQa.html?${query}&bridge=${encodeURIComponent(BRIDGE)}&emulator=${EMULATOR}${theme === 'dark' ? '&theme=dark' : ''}`, { timeout: 180_000 });
  return page;
};
const studentPage = (studentId, options = {}) => open({ ...options, query: `view=student&as=student&studentId=${studentId}&assignmentId=${ASSIGNMENT_ID}` });
const teacherPage = (options = {}) => open({ ...options, query: `view=teacher&as=teacher&email=${encodeURIComponent(TEACHER)}&assignmentId=${ASSIGNMENT_ID}&classId=${CLASS_ID}` });

let shotIndex = 0;
const shot = async (page, name) => {
  shotIndex += 1;
  const file = path.join(SHOTS, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};

const waitForStage = async (page, stage, timeout = 20_000) => {
  await page.waitForFunction((expected) => document.querySelector('[data-test-cycle-stage]')?.getAttribute('data-test-cycle-stage') === expected, stage, { timeout });
};

/* Layout + contrast, measured the way a student meets them. */
const audit = async (page, label) => {
  const result = await page.evaluate(() => {
    const parse = (value) => (value.match(/[\d.]+/g) || []).map(Number);
    const luminance = ([r, g, b]) => {
      const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const effectiveBackground = (element) => {
      for (let node = element; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        const parts = parse(color);
        if (parts.length >= 3 && (parts.length < 4 || parts[3] > 0.5)) return parts.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const buttons = [...document.querySelectorAll('button')].filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map((button) => ({
      text: (button.textContent || '').trim().slice(0, 40),
      disabled: button.disabled,
      contrast: ratio(parse(getComputedStyle(button).color).slice(0, 3), effectiveBackground(button)),
      bottom: button.getBoundingClientRect().bottom,
    }));
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
      buttons,
    };
  });
  check(result.overflow <= 1, `${label}: no sideways scroll`, `overflow ${result.overflow}px`);
  const unreadable = result.buttons.filter((button) => button.contrast < (button.disabled ? 3 : 4.5));
  check(unreadable.length === 0, `${label}: every visible button is readable`, unreadable.map((button) => `"${button.text}" ${button.contrast.toFixed(2)}:1${button.disabled ? ' (disabled)' : ''}`).join('; '));
  return result;
};

const answerFromHeading = async (page, selector) => {
  const prompt = await page.locator(selector).first().innerText();
  return fixture.certAnswerFromPrompt(prompt);
};
// A Corrections question: its prompt is the line that asks for the sum.
const answerFromPrompt = async (page) => {
  const prompt = await page.getByText(fixture.CERT_PROMPT_PATTERN).first().innerText({ timeout: 30_000 });
  return fixture.certAnswerFromPrompt(prompt);
};

/*
 * A TYPED ANSWER: the math editor (MathLive's math-field, named by its field
 * label) where the item uses one, a text box otherwise. Typing is real
 * keystrokes, as in tests/browser/secureExamNavigation.mjs.
 */
const fillAnswer = async (page, value, label = 'Sum') => {
  const math = page.locator(`math-field[aria-label^="${label}"]`).first();
  if (await math.count()) {
    await math.focus();
    await math.evaluate((element) => element.executeCommand?.('selectAll'));
    await page.keyboard.type(String(value));
    return;
  }
  await page.getByLabel(label, { exact: true }).first().fill(String(value));
};
const answerValue = async (page, label = 'Sum') => {
  const math = page.locator(`math-field[aria-label^="${label}"]`).first();
  if (await math.count()) return math.evaluate((element) => element.value);
  return page.getByLabel(label, { exact: true }).first().inputValue();
};

/*
 * THE SECURE TEST SCREEN: skip, flag and go back, every answer a saved draft
 * until Submit (SecureExamContainer). `answerAndMove` types the answer, waits
 * for "Saved", then moves on — or, on the last question, opens the review.
 */
const atQuestion = (page, ordinal) => page.waitForFunction((n) => document.querySelector('[data-secure-navigator-toggle]')?.textContent.includes(`Question ${n} of`), ordinal, { timeout: 30_000 });
const waitSaved = (page) => page.waitForSelector('[data-secure-save-state="saved"]', { timeout: 15_000 });
const answerAndMove = async (page, answer, { last = false } = {}) => {
  await page.getByText('Secure exam question').first().waitFor({ timeout: 30_000 });
  await fillAnswer(page, answer);
  await waitSaved(page);
  await page.locator(last ? '[data-secure-nav="review"]' : '[data-secure-nav="next"]').click();
};
const submitFromReview = async (page) => {
  await page.waitForSelector('[data-secure-review="submit"]', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Submit test' }).click();
};

/* ------------------------------- journeys -------------------------------- */

try {
  await seed();
  log('fixture seeded');

  // 1. Before anything: the student meets Review, with the Test locked and why.
  const student = await studentPage(STUDENTS.failer);
  await waitForStage(student, 'review', 120_000);
  check(await student.getByText('Complete Review to unlock Test.').isVisible(), 'student: the locked Test says how to unlock it');
  check(await student.getByText(/Test is not timed/).isVisible(), 'student: the card says the Test is untimed');
  check(await student.getByText(/can never lower it/).isVisible(), 'student: the retest policy is stated on the card');
  await shot(student, 'student-review-locked');
  await audit(student, 'student review card (chromebook, light)');

  // 2. A bypass attempt from the page itself: call the secure start directly.
  const teacher = await teacherPage();
  await teacher.getByRole('button', { name: /Open secure Test sessions/ }).click();
  await teacher.getByText(/Secure Test sessions: 3 opened/).waitFor({ timeout: 60_000 });
  await shot(teacher, 'teacher-sessions-opened');
  const sessionId = (await db.collection('testCycleRecords').doc(`${ASSIGNMENT_ID}__${STUDENTS.skipper}`).get()).data().test.examSessionId;
  const bypass = await student.evaluate(async ({ bridgeUrl, examSessionId }) => {
    const response = await fetch(`${bridgeUrl}/call/startSecureExamSession`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity: { as: 'student', studentId: 'QA_SKIPPER' }, data: { examSessionId } }),
    });
    return { status: response.status, body: await response.json() };
  }, { bridgeUrl: BRIDGE, examSessionId: sessionId });
  check(bypass.status !== 200, 'bypass: starting the Test before Review is refused by the server', bypass.body?.message);
  const finalizeBypass = await student.evaluate(async ({ bridgeUrl, examSessionId }) => {
    const response = await fetch(`${bridgeUrl}/call/finalizeSecureExam`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity: { as: 'student', studentId: 'QA_SKIPPER' }, data: { examSessionId } }),
    });
    return { status: response.status, body: await response.json() };
  }, { bridgeUrl: BRIDGE, examSessionId: sessionId });
  check(finalizeBypass.status !== 200, 'bypass: "submitting" the unopened Test to skip Review is refused', finalizeBypass.body?.message);

  // 3. Review finishes (as ingestion records it) — the open card follows, no reload.
  await completeReview(STUDENTS.failer);
  await waitForStage(student, 'test');
  check(await student.getByText('Test unlocked — your Review is complete.').isVisible(), 'student: the card turns to the Test by itself when Review lands');
  await shot(student, 'student-test-unlocked');

  // 4. The secure Test: untimed, not the SAT, answers saved, offline + reload survive.
  await student.getByRole('button', { name: 'Start Test' }).click();
  await student.getByRole('heading', { name: /Unit 3 Test/ }).waitFor();
  // The screen asks the student's list where the test stands before it states any time.
  await student.locator('[data-secure-start-rules]').waitFor({ timeout: 15_000 });
  check(await student.getByText('This test is not timed. Take the time you need.').isVisible(), 'secure start: says it is untimed');
  check((await student.getByText('Digital SAT').count()) === 0, 'secure start: not called the SAT');
  await shot(student, 'secure-start-screen');
  await student.getByRole('button', { name: 'Start Test' }).click();
  await student.getByText('Secure exam question').waitFor();
  check((await student.getByText('Untimed').count()) > 0, 'secure header: shows Untimed, no countdown');
  check((await student.getByText('Reference sheet available').count()) === 0, 'secure header: no SAT reference-sheet claim');
  const legend = (await student.locator('legend').first().innerText()).trim();
  check(legend === 'Sum', 'secure question: the answer label reads as authored (no stray comma)', legend);
  const total = Number(fixture.CERT_TOTAL_QUESTIONS);
  const answerOne = async (correct, options) => {
    const answer = correct ? await answerFromHeading(student, 'h1') : fixture.CERT_WRONG_ANSWER;
    await answerAndMove(student, answer, options);
  };
  for (let index = 0; index < 4; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await answerOne(index < 2);
    // eslint-disable-next-line no-await-in-loop
    await atQuestion(student, index + 2);
  }
  await student.getByText('Secure exam question').first().waitFor();
  await shot(student, 'secure-question-saved');
  await audit(student, 'secure question (chromebook, light)');

  // Offline: the answer is kept on the device and the screen says so.
  await student.evaluate(() => { window.__mmBridgeOffline = true; });
  const offlineAnswer = await answerFromHeading(student, 'h1');
  await fillAnswer(student, offlineAnswer);
  await student.getByText(/Offline|Not saved yet/).waitFor({ timeout: 15_000 });
  check(true, 'secure: an offline save is reported, not swallowed');
  await shot(student, 'secure-offline-kept-on-device');
  // Reload mid-Test while still offline locally: reopening restores the typed answer.
  await student.evaluate(() => { window.__mmBridgeOffline = false; });
  await student.reload();
  await waitForStage(student, 'test', 60_000);
  check(await student.getByRole('button', { name: 'Resume Test' }).isVisible(), 'after reload: the card offers Resume Test');
  await student.getByRole('button', { name: 'Resume Test' }).click();
  await student.getByRole('button', { name: /Resume (Test|test)/ }).click();
  await atQuestion(student, 5);
  await student.getByText('Secure exam question').first().waitFor();
  await student.waitForFunction(() => document.querySelector('math-field')?.value || document.querySelector('[data-secure-answer-editor]')?.value, null, { timeout: 15_000 }).catch(() => {});
  check(String(await answerValue(student)) === String(offlineAnswer), 'after reload: the answer typed offline is restored', `${await answerValue(student)} vs ${offlineAnswer}`);
  await waitSaved(student);

  // Submit asks first: the review before submitting names the questions with no answer.
  await student.locator('[data-secure-nav="review"]').click();
  await student.waitForSelector('[data-secure-review="submit"]');
  const reviewText = await student.locator('[data-secure-review="submit"]').innerText();
  check(/count as zero/.test(reviewText) && /not opened yet/.test(reviewText), 'submit: the review first names the questions with no answer', reviewText.replace(/\s+/g, ' ').slice(0, 160));
  await shot(student, 'secure-submit-review');
  await student.getByRole('button', { name: 'Back to questions' }).click();
  await atQuestion(student, 5);
  // Finish honestly: 10 correct of 25 in total (40%) — two of the first four,
  // the restored offline answer, and seven more.
  await student.locator('[data-secure-nav="next"]').click();
  for (let index = 5; index < total; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await atQuestion(student, index + 1);
    // eslint-disable-next-line no-await-in-loop
    await answerOne(index < 12, { last: index === total - 1 });
  }
  await submitFromReview(student);
  await student.getByRole('heading', { name: 'Test submitted' }).waitFor({ timeout: 30_000 });
  await shot(student, 'secure-test-submitted');
  await student.getByRole('button', { name: 'Back to my assessment' }).click();
  await waitForStage(student, 'awaitingRelease');
  // Before release the card must read the same for a student who failed as for
  // one who passed: no score, nothing "required", corrections still undecided.
  // (The phase names and the retest policy sentence are on every student's card.)
  const waitingDetail = await student.locator('[data-test-cycle-stage]').innerText();
  check(
    !/\b40%|\bRequired\b|\bfail/i.test(waitingDetail) && /Decided after your teacher releases/.test(waitingDetail),
    'student: before release nothing hints at failing',
    waitingDetail.replace(/\s+/g, ' ').slice(0, 160),
  );
  await audit(student, 'student awaiting release (chromebook, light)');

  // 5. Teacher: one action releases everyone who submitted.
  await teacher.getByRole('button', { name: 'Refresh' }).click();
  await teacher.getByRole('button', { name: /Release 1 Test result/ }).waitFor({ timeout: 20_000 });
  await shot(teacher, 'teacher-release-ready');
  await audit(teacher, 'teacher results (chromebook, light)');
  await teacher.getByRole('button', { name: /Release 1 Test result/ }).click();
  await teacher.getByRole('button', { name: 'Release Test results' }).click();
  await teacher.getByText(/Released 1 Test result/).waitFor({ timeout: 30_000 });
  await shot(teacher, 'teacher-released');

  // The student's open card follows the release.
  await waitForStage(student, 'corrections', 30_000);
  check(await student.getByText(/passing is 70%/).isVisible(), 'student: corrections say why (score against passing)');
  await shot(student, 'student-corrections-required');

  // 6. Corrections: a wrong answer keeps the same question with tries left.
  await student.getByRole('button', { name: /Start Corrections|Continue Corrections/ }).click();
  await student.getByRole('button', { name: 'Check my answer' }).waitFor({ timeout: 30_000 });
  await fillAnswer(student, fixture.CERT_WRONG_ANSWER);
  await student.getByRole('button', { name: 'Check my answer' }).click();
  await student.getByText(/tries left on this question/).waitFor();
  check(true, 'corrections: a wrong answer keeps the question, with tries left');
  const correctionHeader = await student.locator('section').first().innerText();
  check(/You missed \d+ Test question/.test(correctionHeader) && !/texas:|no specific error pattern/i.test(correctionHeader),
    'corrections: the reason is in a student\'s words, with no standard codes', correctionHeader.replace(/\s+/g, ' ').slice(0, 160));
  await shot(student, 'corrections-try-again');
  for (let guard = 0; guard < 40; guard += 1) {
    // eslint-disable-next-line no-await-in-loop
    if ((await student.locator('[data-test-cycle-stage]').count()) > 0) break;
    // eslint-disable-next-line no-await-in-loop
    const answer = await answerFromPrompt(student);
    // eslint-disable-next-line no-await-in-loop
    await fillAnswer(student, answer);
    // eslint-disable-next-line no-await-in-loop
    await student.getByRole('button', { name: /Check my answer/ }).click();
    // eslint-disable-next-line no-await-in-loop
    await wait(600);
    // eslint-disable-next-line no-await-in-loop
    const next = student.getByRole('button', { name: 'Next practice question' });
    // eslint-disable-next-line no-await-in-loop
    if (await next.isVisible().catch(() => false)) await next.click();
    // eslint-disable-next-line no-await-in-loop
    await wait(400);
  }
  await waitForStage(student, 'retest', 30_000);
  check(true, 'student: finishing corrections opens the retest');
  await shot(student, 'student-retest-unlocked');

  // 7. The retest, then its release: 21/25 = 84 raw, recorded at the 70 cap.
  await student.getByRole('button', { name: 'Start Retest' }).click();
  await student.getByRole('button', { name: /Start (Retest|Test)/ }).click();
  for (let index = 0; index < total; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await atQuestion(student, index + 1);
    // eslint-disable-next-line no-await-in-loop
    await answerOne(index < 21, { last: index === total - 1 });
  }
  await submitFromReview(student);
  await student.getByRole('heading', { name: /submitted/i }).waitFor({ timeout: 30_000 });
  await student.getByRole('button', { name: 'Back to my assessment' }).click();
  await teacher.getByRole('button', { name: 'Refresh' }).click();
  await teacher.getByRole('button', { name: /Release 1 retest result/ }).click();
  await teacher.getByRole('button', { name: 'Release retest results' }).click();
  await teacher.getByText(/Released 1 retest result/).waitFor({ timeout: 30_000 });
  await waitForStage(student, 'complete', 30_000);
  const finalCard = await student.locator('[data-test-cycle-stage]').innerText();
  check(/Original Test\s*40%/.test(finalCard) && /84% raw/.test(finalCard) && /Recorded grade\s*70%/.test(finalCard), 'student: 40 → retest 84 raw → recorded 70, all shown', finalCard.replace(/\s+/g, ' ').slice(0, 220));
  await shot(student, 'student-complete-capped');
  await shot(teacher, 'teacher-complete');
  const lockAttempt = await teacher.evaluate(async ({ bridgeUrl, email }) => {
    const response = await fetch(`${bridgeUrl}/call/updateTestCyclePolicy`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity: { as: 'teacher', email }, data: { assignmentId: 'qa-unit-3-test-cycle', policy: { maxRecordedGrade: 90 } } }),
    });
    return { status: response.status, body: await response.json() };
  }, { bridgeUrl: BRIDGE, email: TEACHER });
  check(lockAttempt.status !== 200, 'teacher: the cap cannot be changed after a retest is released', lockAttempt.body?.message);

  // 8. Teacher preview: every stage, real items, nothing written.
  const sessionsBefore = (await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT_ID).get()).size;
  await teacher.getByRole('button', { name: 'Preview as student' }).click();
  await teacher.getByText(/nothing here is saved/).waitFor();
  for (const label of ['Review (Test locked)', 'Test unlocked', 'Corrections', 'Retest graded', 'Not open yet', 'Paused']) {
    // eslint-disable-next-line no-await-in-loop
    await teacher.getByRole('button', { name: label, exact: true }).click();
    // eslint-disable-next-line no-await-in-loop
    await shot(teacher, `preview-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`);
  }
  await teacher.getByRole('button', { name: 'Test unlocked', exact: true }).click();
  await teacher.getByRole('button', { name: 'Start Test' }).click();
  await teacher.getByText('Secure exam question').first().waitFor({ timeout: 60_000 });
  const previewAnswer = await answerFromHeading(teacher, '[data-preview-device] h1');
  await fillAnswer(teacher, previewAnswer);
  await teacher.getByRole('button', { name: 'Record answer & continue' }).click();
  await teacher.getByText('The secure grader accepts this answer.').waitFor();
  check(true, 'preview: real secure items, graded by the real grader');
  await shot(teacher, 'preview-secure-item-graded');
  const sessionsAfter = (await db.collection('examSessions').where('courseTest.assignmentId', '==', ASSIGNMENT_ID).get()).size;
  check(sessionsAfter === sessionsBefore, 'preview: no secure session was created', `${sessionsBefore} → ${sessionsAfter}`);

  // 9. Devices and dark mode: the passing student's card at each width.
  await completeReview(STUDENTS.passer);
  for (const device of ['chromebook', 'ipad', 'phone']) {
    for (const theme of ['light', 'dark']) {
      // eslint-disable-next-line no-await-in-loop
      const page = await studentPage(STUDENTS.passer, { device, theme });
      // eslint-disable-next-line no-await-in-loop
      await waitForStage(page, 'test', 120_000);
      // eslint-disable-next-line no-await-in-loop
      const measured = await audit(page, `student test card (${device}, ${theme})`);
      // The first device starts the Test; every later one must offer to resume it.
      const action = measured.buttons.find((button) => /^(Start|Resume) Test$/.test(button.text));
      check(Boolean(action), `${device}/${theme}: Start/Resume Test is on screen`, action?.text);
      // eslint-disable-next-line no-await-in-loop
      await shot(page, `device-${device}-${theme}-card`);
      // eslint-disable-next-line no-await-in-loop
      await page.getByRole('button', { name: /^(Start|Resume) Test$/ }).click();
      // eslint-disable-next-line no-await-in-loop
      await page.getByRole('button', { name: /Start Test|Resume Test/ }).click();
      // eslint-disable-next-line no-await-in-loop
      await page.getByText('Secure exam question').first().waitFor({ timeout: 60_000 });
      // eslint-disable-next-line no-await-in-loop
      await audit(page, `secure question (${device}, ${theme})`);
      // eslint-disable-next-line no-await-in-loop
      await shot(page, `device-${device}-${theme}-secure`);
      // eslint-disable-next-line no-await-in-loop
      await page.context().close();
    }
  }
  // 10. A Test locked for review is on the teacher's table as needing them, and
  //     unlocking it from the row lets the student continue.
  const passerRecord = (await db.collection('testCycleRecords').doc(`${ASSIGNMENT_ID}__${STUDENTS.passer}`).get()).data();
  const lockResult = await teacher.evaluate(async ({ bridgeUrl, examSessionId, email }) => {
    const response = await fetch(`${bridgeUrl}/call/proctorExamAction`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identity: { as: 'teacher', email }, data: { examSessionId, action: 'lock' } }),
    });
    return response.status;
  }, { bridgeUrl: BRIDGE, examSessionId: passerRecord.test.examSessionId, email: TEACHER });
  check(lockResult === 200, 'teacher: a Test in progress can be locked for review');
  if (await teacher.getByRole('button', { name: 'Close preview' }).isVisible().catch(() => false)) {
    await teacher.getByRole('button', { name: 'Close preview' }).click();
  }
  await teacher.getByRole('button', { name: 'Refresh' }).click();
  await teacher.getByText('Needs attention — Test locked').first().waitFor({ timeout: 20_000 });
  check(true, 'teacher: a locked Test reads "Needs attention", not "Testing now"');
  await shot(teacher, 'teacher-needs-attention');
  const lockedRow = teacher.locator('tr', { hasText: 'QA passer' });
  await lockedRow.getByText('Actions').click();
  await lockedRow.getByRole('button', { name: 'Unlock the locked Test' }).click();
  await teacher.getByText(/Unlock the locked Test done/).waitFor({ timeout: 20_000 });
  const unlockedStatus = (await db.collection('examSessions').doc(passerRecord.test.examSessionId).get()).data()?.status;
  check(unlockedStatus === 'in_progress', 'teacher: unlocking from the row lets the student continue', unlockedStatus);

  for (const theme of ['dark']) {
    // eslint-disable-next-line no-await-in-loop
    const page = await teacherPage({ theme, device: 'ipad' });
    // eslint-disable-next-line no-await-in-loop
    await page.getByText(/Retest policy/).waitFor({ timeout: 60_000 });
    // eslint-disable-next-line no-await-in-loop
    await audit(page, `teacher results (ipad, ${theme})`);
    // eslint-disable-next-line no-await-in-loop
    await shot(page, `teacher-results-ipad-${theme}`);
  }
} catch (error) {
  findings.push(`journey aborted: ${error.message}`);
  log('ABORTED', error.stack || error.message);
} finally {
  writeFileSync(path.join(SHOTS, 'report.json'), JSON.stringify({ passes, findings }, null, 2));
  log(`\n${passes.length} checks passed, ${findings.length} findings. Screenshots: ${SHOTS}`);
  findings.forEach((finding) => log('FINDING', finding));
  await Promise.all(contexts.map((context) => context.close().catch(() => {})));
  await browser.close();
  bridge.close();
  await stopEmulator();
  killAll();
  process.exit(findings.length ? 1 : 0);
}
