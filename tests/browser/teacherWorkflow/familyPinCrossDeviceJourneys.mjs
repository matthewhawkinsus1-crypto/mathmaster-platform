// A PERSONALIZED QUESTION'S NUMBERS ACROSS CHROMEBOOKS, BEFORE THE FIRST
// SUBMIT, IN THE REAL APP (RT15, A2-76).
//
//   TEACHER_HARNESS_PORT=5383 npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   TEACHER_HARNESS_ORIGIN=http://127.0.0.1:5383 node tests/browser/teacherWorkflow/familyPinCrossDeviceJourneys.mjs
//
//   (PLAYWRIGHT_MODULE / CHROMIUM_PATH when the defaults are not installed;
//    ONLY=second,slow,... to run some journeys.)
//
// The real App.jsx with `firebase/*` replaced by the harness fakes, the lesson
// `?questions=family`: its first Classwork question is a Question Family slot
// (linear.slopeFromPoints), dealt by the student's seat. Each "device" is a
// browser context of its own, carrying the in-memory server from device to
// device as the student moves (draftCrossDeviceJourneys.mjs does the same).
//
// The student opens the question on Chromebook A before the teacher's app has
// seated them: a provisional seat. The teacher's app then seats the class (the
// driver writes the seat map the reconciler would), and the student opens the
// same question on Chromebook B, never having submitted it. Before RT15, B
// dealt the seated allocation: different numbers under the work the student
// started on A.
//
//   second    B shows A's numbers. Control: a device reading a server copy
//             without the pin (the old behaviour) shows different ones — so
//             the seat move really would have swapped them.
//   slow      B's read of the server copy takes 1.5 s: "Loading this
//             question…" until it lands, then A's numbers — never the seated
//             ones first.
//   stalled   the read never comes back in time (8 s): the question still
//             opens within the wait (FAMILY_PIN_SERVER_WAIT_MS), dealt as
//             before — the wait is bounded.
//   own       A, coming back after the seat move, keeps its own pin.
//
// Exit code 1 on any failure.

import { newSchoolContext } from './schoolClock.mjs';
import { learnerToken, resolveLearnerSeat } from '../../../functions/shared/questionGenerationIdentity.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const STUDENT = '910002';
const CLASS = 'c-alg2-p3';
const ASSIGNMENT = 'a-today';
const DOC = `studentWorkspaceDrafts/${STUDENT}__${ASSIGNMENT}`;
const DB_KEY = 'mm-teacher-workflow-harness-db-v1';
const PIN_PREFIX = 'mm.familyDelivery.v1';
const VIEWPORT = { width: 1366, height: 900 };
// The family question's authored prompt; its two points follow it, read out.
const FAMILY_PROMPT = /Find the slope\. the point/;

const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  return Boolean(ok);
};
const wanted = (name) => !ONLY || ONLY.includes(name);

/* ------------------------------------------------------------- devices */

const openDevice = async (label, { server = null, storageState = null, params = {} } = {}) => {
  const context = await newSchoolContext(browser, { viewport: VIEWPORT, ...(storageState ? { storageState } : {}) });
  if (server) {
    await context.addInitScript(([key, value]) => {
      if (window.sessionStorage.getItem('mm-journey-server')) return;
      window.sessionStorage.setItem('mm-journey-server', '1');
      window.localStorage.setItem(key, value);
    }, [DB_KEY, server]);
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${label}: page error ${error.message}`));
  const search = new URLSearchParams({ as: 'student', studentId: STUDENT, questions: 'family', ...params });
  if (!server && !storageState) search.set('reset', '1');
  await page.goto(`${PAGE}?${search}`, { timeout: 180000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(800);
  return { context, page };
};

const stageText = (page) => page.evaluate(() => (document.querySelector('.mathmaster-question-stage')?.innerText || '').replace(/\s+/g, ' '));

// The pin this device holds for the family question: what it showed.
const devicePins = (page) => page.evaluate(([prefix, student]) => Object.keys(window.localStorage)
  .filter((key) => key.startsWith(`${prefix}|${student}|`))
  .map((key) => JSON.parse(window.localStorage.getItem(key))), [PIN_PREFIX, STUDENT]);
const shownFingerprint = async (page, ms = 15000) => {
  const deadline = Date.now() + ms;
  let pins = await devicePins(page);
  while (!pins.length && Date.now() < deadline) {
    await page.waitForTimeout(150);
    pins = await devicePins(page);
  }
  return pins[0]?.fingerprint || null;
};

const openFamilyQuestion = async (page, { waitForQuestion = true } = {}) => {
  await page.getByRole('button', { name: /^(Continue|Resume Question|Start)/ }).first().click();
  if (!waitForQuestion) return;
  for (let step = 0; step < 6; step += 1) {
    const text = await stageText(page);
    if (FAMILY_PROMPT.test(text)) break;
    if (/Loading this question/.test(text)) { await page.waitForTimeout(300); continue; }
    const before = /Solve 2y = 10/.test(text);
    await page.getByRole('button', { name: before ? 'Next question' : 'Previous question' }).first().click();
    await page.waitForTimeout(600);
  }
  await page.waitForFunction((source) => new RegExp(source).test((document.querySelector('.mathmaster-question-stage')?.innerText || '').replace(/\s+/g, ' ')), FAMILY_PROMPT.source, { timeout: 30000 });
};

/* -------------------------------------------------------------- server */

const serverDb = (page) => page.evaluate((key) => window.localStorage.getItem(key), DB_KEY);
const serverPins = (page) => page.evaluate((doc) => window.__mmHarnessStore.get(doc)?.deliveryPins || [], DOC);
const waitForServerPin = async (page, ms = 15000) => {
  const deadline = Date.now() + ms;
  let pins = await serverPins(page);
  while (!pins.length && Date.now() < deadline) {
    await page.waitForTimeout(300);
    pins = await serverPins(page);
  }
  return pins;
};

// The server as the teacher's app leaves it after seating the class: this
// student holds a seat other than the provisional one their first device used.
const withSeatMoved = (db) => {
  const docs = JSON.parse(db);
  const entry = docs.find(([path]) => path === `assignments/${ASSIGNMENT}`);
  const assignment = { id: ASSIGNMENT, ...entry[1] };
  const provisional = resolveLearnerSeat({ assignment, studentId: STUDENT, classId: CLASS });
  const seat = (provisional.seat + 3) % 16;
  entry[1] = { ...entry[1], generationSeats: { version: 1, byClassId: { [CLASS]: { [learnerToken(ASSIGNMENT, STUDENT)]: seat } } } };
  return { db: JSON.stringify(docs), provisionalSeat: provisional.seat, seat };
};
// The same server with the draft copy's pins taken away: what a device read
// before RT15 (the control).
const withoutPins = (db) => {
  const docs = JSON.parse(db);
  const entry = docs.find(([path]) => path === DOC);
  if (entry) {
    const { deliveryPins: _pins, ...rest } = entry[1];
    entry[1] = rest;
  }
  return JSON.stringify(docs);
};

/* ------------------------------------------------------------ journeys */

const close = async (device) => { await device.context.close(); };

// Chromebook A, unseated: the question, its pin, and the server copy with it.
const onDeviceA = async () => {
  const a = await openDevice('A');
  await openFamilyQuestion(a.page);
  const fingerprint = await shownFingerprint(a.page);
  const pins = await waitForServerPin(a.page);
  check(Boolean(fingerprint), 'A shows the family question and pins it on the device', fingerprint || 'no pin');
  check(pins.length === 1 && pins[0].fingerprint === fingerprint, 'A\'s pin reaches the server copy before any Submit', JSON.stringify(pins.map((pin) => pin.fingerprint)));
  check(pins[0]?.basis === 'provisional', 'A dealt it from a provisional seat (the class is not seated yet)', pins[0]?.basis);
  const storageState = await a.context.storageState();
  const server = await serverDb(a.page);
  await close(a);
  return { fingerprint, server, storageState };
};

const journeySecond = async () => {
  console.log('\n— second: a second Chromebook shows A\'s numbers');
  const { fingerprint, server } = await onDeviceA();
  const moved = withSeatMoved(server);
  check(moved.seat !== moved.provisionalSeat, 'the teacher\'s app seats the student elsewhere', `provisional ${moved.provisionalSeat}, seat ${moved.seat}`);

  const control = await openDevice('control', { server: withoutPins(moved.db) });
  await openFamilyQuestion(control.page);
  const fresh = await shownFingerprint(control.page);
  check(fresh && fresh !== fingerprint, 'control: without the server\'s pin the moved seat deals different numbers', `${fresh} vs ${fingerprint}`);
  await close(control);

  const b = await openDevice('B', { server: moved.db });
  await openFamilyQuestion(b.page);
  const onB = await shownFingerprint(b.page);
  check(onB === fingerprint, 'B shows exactly the question A showed', `${onB} vs ${fingerprint}`);
  const text = await stageText(b.page);
  check(FAMILY_PROMPT.test(text), 'B is on the family question', text.slice(0, 120));
  const pins = await serverPins(b.page);
  check(pins.length === 1 && pins[0].fingerprint === fingerprint, 'the server copy still holds A\'s pin', JSON.stringify(pins.map((pin) => pin.fingerprint)));
  await close(b);
};

const journeySlow = async () => {
  console.log('\n— slow: the server copy lands 1.5 s late');
  const { fingerprint, server } = await onDeviceA();
  const moved = withSeatMoved(server);
  const b = await openDevice('B-slow', { server: moved.db, params: { draftReadMs: '1500' } });
  await openFamilyQuestion(b.page, { waitForQuestion: false });
  // Sampled from the click: what is on screen, and the first pin this device writes.
  let sawLoading = false;
  let firstPin = null;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !firstPin) {
    if (/Loading this question/.test(await stageText(b.page))) sawLoading = true;
    const pins = await devicePins(b.page);
    if (pins.length) firstPin = pins[0].fingerprint;
    else await b.page.waitForTimeout(50);
  }
  check(sawLoading, 'the question waits for the server copy ("Loading this question…")');
  check(firstPin === fingerprint, 'the first numbers B shows are A\'s — never the seated ones first', `${firstPin} vs ${fingerprint}`);
  await close(b);
};

const journeyStalled = async () => {
  console.log('\n— stalled: the server copy does not come back in time');
  const { server } = await onDeviceA();
  const moved = withSeatMoved(server);
  const b = await openDevice('B-stalled', { server: moved.db, params: { draftReadMs: '8000' } });
  const started = Date.now();
  await openFamilyQuestion(b.page);
  const opened = Date.now() - started;
  const shown = await shownFingerprint(b.page, 2000);
  check(Boolean(shown) && opened < 7000, 'the question still opens within the wait, dealt as before', `${opened} ms`);
  await close(b);
};

const journeyOwn = async () => {
  console.log('\n— own: A comes back after the seat move and keeps its own pin');
  const { fingerprint, server, storageState } = await onDeviceA();
  const moved = withSeatMoved(server);
  // The same Chromebook, its own storage, the server as it now stands.
  const comingBack = {
    ...storageState,
    origins: storageState.origins.map((origin) => ({
      ...origin,
      localStorage: origin.localStorage.map((item) => (item.name === DB_KEY ? { ...item, value: moved.db } : item)),
    })),
  };
  const a = await openDevice('A-again', { storageState: comingBack });
  await openFamilyQuestion(a.page);
  check(await shownFingerprint(a.page) === fingerprint, 'A shows the question it showed before');
  check(!/Loading this question/.test(await stageText(a.page)), 'and never waits for the server: it has its own pin');
  await close(a);
};

for (const [name, run] of [['second', journeySecond], ['slow', journeySlow], ['stalled', journeyStalled], ['own', journeyOwn]]) {
  if (!wanted(name)) continue;
  try {
    await run();
  } catch (error) {
    check(false, `${name} journey`, error?.stack || String(error));
  }
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s)` : '\nall family-pin journeys passed');
process.exit(failures.length ? 1 : 0);
