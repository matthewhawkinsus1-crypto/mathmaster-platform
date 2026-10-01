// The Live Challenge shell — host console, projector, student screens — played
// in real browsers against the REAL server.
//
// HOW TO RUN (one command; it starts the emulator, the bridge and Vite):
//
//   node tests/browser/liveChallengeShellQa.mjs
//   SHELL_QA_SCENARIOS=classic,adversarial node tests/browser/liveChallengeShellQa.mjs
//   SHELL_QA_SHOTS=/some/dir node tests/browser/liveChallengeShellQa.mjs   # where screenshots go
//
// WHAT IS REAL. The teacher's console and projector, the students' screens,
// the snapshot watchers, the Firestore emulator and every callable: each page
// posts its callables to a local bridge that runs the real handler from the
// deployed entry point (functions/platformEntry.js) under that page's identity.
// Bot students (a big class, late joiners) call the same handlers directly.
//
// WHAT IT CHECKS, scenario by scenario (each check names what it saw):
//   A classic      a whole Standard Challenge on a Chromebook, a phone and an
//                  iPad: lobby by name, 3-2-1-GO in step on projector and
//                  student, the round closing itself (deadline and everyone
//                  answered), results that agree with the server everywhere,
//                  a double-clicked Next Round, refreshes, End Game with its
//                  confirmation, the podium, rewards delivered once, Play Again
//                  moving every screen into the new lobby
//   B scoring      Grand Prix and Correct Count read as what they are; ties
//   C rush         Graph Feature Rush inside the shell: countdown, no graph on
//                  the projector, results from the round's own document
//   D reconnect    offline and back, a second device, a student who goes quiet,
//                  a late joiner, the teacher refreshing on the finished podium
//   E big class    32 players on a 1366×768 projector at 100/125/150% zoom,
//                  phone and tablet layouts, reduced motion
//   F repeat       four games in a row (incl. a mode switch and a rush) with
//                  the same open screens: clean every time, nothing piling up
//   adversarial    double Start, two host tabs, End Round Now / End Game /
//                  Cancel confirmations, End Game during the countdown, an
//                  answer during the countdown, a refresh mid-countdown
//
// NOTHING TOUCHES PRODUCTION: firebase.js is swapped for an emulator module,
// the browsers block every non-local request, and the project id is
// throwaway. This is a QA tool, not part of the CI gate. It exits 1 when any
// check fails and writes findings.json beside the screenshots.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const PROJECT = 'mathmaster-game-harness';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8182';
const VITE_PORT = Number(process.env.SHELL_QA_VITE_PORT || 5198);
const BRIDGE_PORT = Number(process.env.SHELL_QA_BRIDGE_PORT || 5299);
const ORIGIN = `http://localhost:${VITE_PORT}`;
const BRIDGE = `http://localhost:${BRIDGE_PORT}`;
const SHOTS = process.env.SHELL_QA_SHOTS || path.join(repo, 'tests/browser/artifacts/live-challenge-shell');
const ONLY = (process.env.SHELL_QA_SCENARIOS || '').split(',').map((entry) => entry.trim()).filter(Boolean);
mkdirSync(SHOTS, { recursive: true });

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const log = (...parts) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);

const waitForHttp = async (url, attempts = 80) => {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return true;
    } catch { /* not up yet */ }
    await wait(500);
  }
  return false;
};

// Children run in their own process groups; see graphFeatureRushGame.mjs for
// why the emulator's CLI is asked to stop before it is killed.
const started = [];
const killAll = () => {
  for (const child of started) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  }
};
const stopAll = async () => {
  const exited = started.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once('exit', resolve);
  }));
  for (const child of started) {
    try { process.kill(-child.pid, 'SIGINT'); } catch { /* gone */ }
  }
  await Promise.race([Promise.all(exited), wait(10_000)]);
  killAll();
};
process.on('exit', killAll);

/* ------------------------------ the emulator ------------------------------ */

process.env.FIRESTORE_EMULATOR_HOST = EMULATOR;
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });
if (!await waitForHttp(`http://${EMULATOR}/`, 2)) {
  const emulator = spawn(
    'npx',
    ['firebase', 'emulators:start', '--only', 'firestore', '--project', PROJECT, '--config', path.join(here, 'emulator/firebase.json')],
    { cwd: path.join(here, 'emulator'), stdio: 'ignore', detached: true },
  );
  started.push(emulator);
  if (!await waitForHttp(`http://${EMULATOR}/`)) {
    console.error('Firestore emulator did not start.');
    process.exit(2);
  }
}
await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

/* -------------------- the real server, behind a bridge -------------------- */

const functionsIndex = require(path.join(repo, 'functions/platformEntry.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const challenge = await import(path.join(repo, 'functions/shared/liveChallenge.mjs'));
const { PRESENCE_FRESH_MS } = await import(path.join(repo, 'functions/shared/liveChallengePresence.mjs'));
// What a results screen should say, from the same model the screens use.
const { roundPlacementSentence, roundResultsView } = await import(path.join(repo, 'src/platform/liveChallenge/challengeStandingsModel.js'));

const authFor = (identity = {}) => (identity.as === 'teacher'
  ? { uid: `${identity.email}-uid`, token: { role: 'teacher', email: identity.email, email_verified: true } }
  : { uid: `${identity.studentId}-uid`, token: { role: 'student', studentId: identity.studentId, email: `${identity.studentId}@example.com`, email_verified: true } });

const bridgeCalls = [];
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
  const at = Date.now();
  if (!handler?.run) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'not-found', message: `No callable ${name}` }));
    return;
  }
  try {
    const result = await handler.run({ auth: authFor(identity), data, rawRequest: { headers: {} } });
    bridgeCalls.push({ name, identity, data, at, ms: Date.now() - at, ok: true });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: result ?? null }));
  } catch (error) {
    bridgeCalls.push({ name, identity, data, at, ms: Date.now() - at, ok: false, code: error?.code, lifecycle: error?.details?.lifecycle || null });
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: error?.code || 'internal', message: error?.message || String(error), details: error?.details ?? null }));
  }
});
await new Promise((resolve) => bridge.listen(BRIDGE_PORT, resolve));

const vite = spawn(
  'npx',
  ['vite', '--config', path.join(here, 'emulator/vite.bridge.config.mjs'), '--port', String(VITE_PORT), '--strictPort'],
  { cwd: repo, stdio: 'ignore', detached: true },
);
started.push(vite);
if (!await waitForHttp(`${ORIGIN}/`)) {
  console.error('Vite did not start.');
  process.exit(2);
}

/* ------------------------------ class and bank ------------------------------ */

const TEACHER = 'shell-qa-teacher@example.com';
const FIRST = ['Ana', 'Ben', 'Cara', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivy', 'Jon', 'Kai', 'Lia', 'Max', 'Nia', 'Oli', 'Pia'];
const LAST = ['Rivera', 'Tran', 'Lopez', 'Patel', 'Brooks', 'Kim', 'Ortiz', 'Sato', 'Chen', 'Reyes'];
const CLASSES = Object.freeze({
  p3: { classId: 'shell-qa-p3', name: 'Period 3 Algebra I', period: 'P3', course: 'algebra1', size: 6 },
  p4: { classId: 'shell-qa-p4', name: 'Period 4 Algebra I', period: 'P4', course: 'algebra1', size: 4 },
  big: { classId: 'shell-qa-big', name: 'Period 6 Algebra I', period: 'P6', course: 'algebra1', size: 32 },
});
const studentsOf = (key) => Array.from({ length: CLASSES[key].size }, (_, index) => `${CLASSES[key].classId}-s${String(index + 1).padStart(2, '0')}`);
const nameOf = (studentId) => {
  const index = Number(studentId.slice(-2)) - 1;
  return `${FIRST[index % FIRST.length]} ${LAST[(index + studentId.length) % LAST.length]}`;
};
for (const entry of Object.values(CLASSES)) {
  await db.collection('classes').doc(entry.classId).set({ teacherOfRecord: TEACHER, status: 'active', course: entry.course, period: entry.period, name: entry.name });
}
for (const key of Object.keys(CLASSES)) {
  const batch = db.batch();
  studentsOf(key).forEach((studentId) => {
    const [firstName, lastName] = nameOf(studentId).split(' ');
    batch.set(db.collection('grades').doc(studentId), { assignedTeacherEmail: TEACHER, classId: CLASSES[key].classId, classPeriod: CLASSES[key].period, firstName, lastName });
  });
  await batch.commit();
}
const teacherProps = {
  email: TEACHER,
  classes: Object.values(CLASSES).map(({ classId, name, period, course }) => ({ classId, name, period, course, status: 'active' })),
  allStudents: Object.keys(CLASSES).flatMap((key) => studentsOf(key).map((id) => ({ id, studentId: id, classId: CLASSES[key].classId }))),
};

// Gradable choice questions, so a browser answers by clicking and a bot by
// sending the server's own expected value.
const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    const instantiated = await mathPath.instantiateQuestion(item, `shell-qa|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
    if (!Array.isArray(item.alignmentKeys) || !item.alignmentKeys.length) continue;
    if ((await mathPath.buildIssuePlan(instantiated.question)).issuable) bank.push(item);
    if (bank.length >= 30) break;
  }
  if (bank.length >= 30) break;
}
await Promise.all(bank.map((item) => db.collection('pathQuestionBank').doc(item.id).set({ ...item, courseId: 'algebra1', active: true })));
log(`seeded ${bank.length} questions`);

/* ------------------------------ server views ------------------------------ */

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const publicPlayers = async (roomId) => (await roomRef(roomId).collection('players').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const roundDoc = async (roomId, roundIndex) => (await roomRef(roomId).collection('rounds').doc(String(roundIndex)).get()).data() || null;
const privatePlayer = async (roomId, studentId) => (await db.collection('liveChallengePrivate').doc(roomId).collection('players').doc(studentId).get()).data() || {};
const activeRoomId = async () => (await db.collection('liveChallengeTeacherActive').doc(TEACHER).get()).data()?.roomId || null;
const ms = (value) => value?.toMillis?.() || 0;
const waitForRoom = async (roomId, predicate, timeout = 30_000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const room = await roomOf(roomId);
    if (predicate(room)) return room;
    await wait(200);
  }
  return null;
};
const ordinal = (place) => {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${({ 1: 'st', 2: 'nd', 3: 'rd' })[place % 10] || 'th'}`;
};

/* ---------------------------------- bots ---------------------------------- */

const studentRequest = (studentId, data) => ({ auth: authFor({ as: 'student', studentId }), data, rawRequest: { headers: {} } });
const botCall = (name, studentId, data) => functionsIndex[name].run(studentRequest(studentId, data));
const botJoin = (roomId, studentId) => botCall('joinLiveChallenge', studentId, { roomId });
const expectedFor = async (roomId, roundIndex) => {
  const state = (await db.collection('liveChallengePrivate').doc(roomId).get()).data();
  const questionId = state.questionIds[roundIndex];
  const authored = state.roundQuestions?.[roundIndex] || (await db.collection('pathQuestionBank').doc(questionId).get()).data();
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${roundIndex}|${questionId}`);
  return (await mathPath.buildIssuePlan(instantiated.question)).privateGrading.fields;
};
const botAnswer = async (roomId, studentId, { correct = true, humanElapsedMs = 2_000 } = {}) => {
  const room = await roomOf(roomId);
  const fields = await expectedFor(roomId, room.currentRound);
  return botCall('submitLiveChallengeResponse', studentId, {
    roomId,
    roundIndex: room.currentRound,
    roundVersion: room.roundVersion,
    roundToken: room.roundToken,
    submissionId: randomUUID(),
    humanElapsedMs,
    responsePayload: { responses: Object.fromEntries(fields.map((field) => [field.id, correct ? field.expected : '__not-an-answer__'])) },
  });
};
const teacherCall = (name, data) => functionsIndex[name].run({ auth: authFor({ as: 'teacher', email: TEACHER }), data, rawRequest: { headers: {} } });

/* -------------------------------- browsers -------------------------------- */

const DEVICES = Object.freeze({
  chromebook: { viewport: { width: 1366, height: 768 } },
  projector: { viewport: { width: 1366, height: 768 } },
  zoom125: { viewport: { width: 1093, height: 614 } },
  zoom150: { viewport: { width: 911, height: 512 } },
  desktop: { viewport: { width: 1920, height: 1080 } },
  ipad: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
  smallPhone: { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
});
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const findings = [];
const notes = [];
const finding = (scenario, problem) => { findings.push({ scenario, problem }); log(`  ✗ ${scenario}: ${problem}`); };
const check = (scenario, condition, problem) => { if (!condition) finding(scenario, problem); return Boolean(condition); };
const note = (scenario, label, value) => { notes.push({ scenario, label, value }); log(`  · ${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`); };

const IGNORABLE_CONSOLE = /ERR_FAILED|ERR_INTERNET_DISCONNECTED|net::|Failed to fetch|WebChannel|transport errored|Could not reach|math fonts could not be loaded|Download the React DevTools|offline|unavailable/i;

// React reports every commit to the DevTools hook; counting them is how a
// re-render storm shows up.
const commitCounter = () => {
  window.__mmCommits = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    isDisabled: false,
    inject(renderer) { this.renderers.set(this.renderers.size + 1, renderer); return this.renderers.size; },
    onCommitFiberRoot() { window.__mmCommits += 1; },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
    on() {},
    off() {},
    sub() { return () => {}; },
  };
};

const openPage = async ({ device = 'chromebook', url, init = null, reducedMotion = 'no-preference' }) => {
  const context = await browser.newContext({ ...DEVICES[device], reducedMotion });
  await context.route('**/*', (route) => (/^(http|ws)s?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(route.request().url()) ? route.continue() : route.abort()));
  await context.addInitScript(commitCounter);
  if (init) await context.addInitScript(init.fn, init.arg);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error' && !IGNORABLE_CONSOLE.test(message.text())) errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error?.message || error}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { page, context, errors, device };
};
const studentUrl = (studentId) => `${ORIGIN}/tests/browser/graphFeatureRushStudent.html?studentId=${encodeURIComponent(studentId)}&emulator=${EMULATOR}&bridge=${BRIDGE}`;
const openStudent = async (studentId, device = 'chromebook', options = {}) => ({ ...(await openPage({ device, url: studentUrl(studentId), ...options })), studentId });
const openTeacher = async (device = 'chromebook') => openPage({
  device,
  url: `${ORIGIN}/tests/browser/graphFeatureRushTeacher.html?as=teacher&email=${encodeURIComponent(TEACHER)}&emulator=${EMULATOR}&bridge=${BRIDGE}`,
  init: { fn: (props) => { window.__mmTeacherProps = props; }, arg: teacherProps },
});
const textOf = async (handle) => (await handle.page.locator('body').innerText()).replace(/\s+/g, ' ');
const waitForText = async (handle, needle, timeout = 15_000) => {
  try {
    await handle.page.waitForFunction((value) => document.body.innerText.replace(/\s+/g, ' ').toLowerCase().includes(value.toLowerCase()), needle, { timeout });
    return true;
  } catch { return false; }
};
const attr = async (handle, selector, name) => handle.page.locator(selector).first().getAttribute(name, { timeout: 2_000 }).catch(() => null);
const waitForAttr = async (handle, selector, name, expected, timeout = 15_000) => {
  try {
    await handle.page.waitForFunction(({ selector: target, name: key, expected: values }) => {
      const value = document.querySelector(target)?.getAttribute(key);
      return values.includes(value);
    }, { selector, name, expected: [].concat(expected) }, { timeout });
    return true;
  } catch { return false; }
};
const waitForStudentStage = (handle, stage, timeout) => waitForAttr(handle, '[data-mm-student-stage]', 'data-mm-student-stage', stage, timeout);
const waitForArena = (handle, stage, timeout) => waitForAttr(handle, '[data-mm-arena-stage]', 'data-mm-arena-stage', stage, timeout);
const waitForConsole = (handle, stage, timeout) => waitForAttr(handle, '[data-mm-host-console]', 'data-mm-host-console', stage, timeout);
const shot = async (handle, name) => {
  await handle.page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false, animations: 'disabled' }).catch(() => {});
};
const selectInLabel = async (handle, labelStart, value) => {
  await handle.page.locator('label').filter({ hasText: new RegExp(`^${labelStart}`) }).locator('select').first().selectOption(String(value));
};
const overflowX = (handle) => handle.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const metrics = async (handle) => {
  const session = await handle.context.newCDPSession(handle.page);
  await session.send('HeapProfiler.collectGarbage').catch(() => {});
  await session.send('Performance.enable');
  const { metrics: list } = await session.send('Performance.getMetrics');
  const byName = Object.fromEntries(list.map((entry) => [entry.name, entry.value]));
  await session.detach().catch(() => {});
  return {
    heapMb: Math.round((byName.JSHeapUsedSize || 0) / 1e5) / 10,
    listeners: byName.JSEventListeners,
    nodes: byName.Nodes,
    scriptMs: Math.round((byName.ScriptDuration || 0) * 1000),
    commits: await handle.page.evaluate(() => window.__mmCommits || 0),
  };
};
const closeAll = (...handles) => Promise.all(handles.flat().filter(Boolean).map((handle) => handle.context.close().catch(() => {})));

/* ------------------------------ teacher actions ------------------------------ */

const createClassic = async (teacher, { classKey = 'p3', rounds = 5, seconds = 20, passPlaces = 0 } = {}) => {
  await teacher.page.waitForSelector('text=Create a challenge', { timeout: 30_000 });
  await selectInLabel(teacher, 'Class', CLASSES[classKey].classId);
  await selectInLabel(teacher, 'Game type', 'standard');
  await selectInLabel(teacher, 'Rounds', rounds);
  await selectInLabel(teacher, 'Time per round', seconds);
  await teacher.page.getByLabel('Practice Pass for').selectOption(String(passPlaces));
  await teacher.page.getByRole('button', { name: 'Create Lobby' }).click();
  if (!await waitForConsole(teacher, 'lobby', 30_000)) {
    await shot(teacher, `create-failed-${Date.now()}`);
    throw new Error(`no lobby after Create Lobby: ${JSON.stringify(bridgeCalls.slice(-3).map((call) => [call.name, call.code]))}`);
  }
  return activeRoomId();
};
const createRush = async (teacher, { classKey = 'p4', preset = 'Quick Algebra I', rounds = 1, seconds = 30, scoring = 'correctCount' } = {}) => {
  await teacher.page.waitForSelector('text=Create a challenge', { timeout: 30_000 });
  await selectInLabel(teacher, 'Class', CLASSES[classKey].classId);
  await selectInLabel(teacher, 'Game type', 'graphFeatureRush');
  await teacher.page.waitForSelector('text=Start from a preset', { timeout: 15_000 });
  if (preset) await teacher.page.getByRole('button', { name: preset, exact: true }).click();
  await selectInLabel(teacher, 'Rounds', rounds);
  await selectInLabel(teacher, 'Time per round', seconds);
  await selectInLabel(teacher, 'Scoring', scoring);
  await teacher.page.getByRole('button', { name: 'Create Lobby' }).click();
  if (!await waitForConsole(teacher, 'lobby', 30_000)) throw new Error('no rush lobby');
  return activeRoomId();
};
const primary = (handle, command) => handle.page.locator(`[data-mm-primary-action="${command}"]`).first();
const confirmDialog = async (handle, label) => {
  const dialog = handle.page.getByRole('alertdialog');
  await dialog.waitFor({ timeout: 5_000 });
  await dialog.getByRole('button', { name: label, exact: true }).click();
};
const dismissDialog = async (handle) => {
  const dialog = handle.page.getByRole('alertdialog');
  await dialog.waitFor({ timeout: 5_000 });
  await dialog.locator('button').first().click();
};
const toProjector = async (teacher) => {
  await teacher.page.getByRole('button', { name: 'Projector View' }).click();
  await teacher.page.waitForSelector('[data-mm-arena-stage]', { timeout: 10_000 });
};
const toConsole = async (teacher) => {
  await teacher.page.getByRole('button', { name: 'Exit Projector View' }).click();
  await teacher.page.waitForSelector('[data-mm-host-console]', { timeout: 10_000 });
};

/* ------------------------------ student actions ------------------------------ */

// Clicks the server's expected choice (or another one), then locks it in.
const answerInBrowser = async (handle, roomId, { correct = true } = {}) => {
  const room = await roomOf(roomId);
  const fields = await expectedFor(roomId, room.currentRound);
  const expected = String(fields[0]?.expected ?? '');
  const choices = room.currentQuestion?.responseFields?.[0]?.choices || room.currentQuestion?.choices || [];
  let index = choices.findIndex((choice) => String(choice?.id ?? choice?.value) === expected);
  if (!correct) index = (Math.max(0, index) + 1) % Math.max(1, choices.length);
  await handle.page.locator('[data-mm-game] [role="radio"]').nth(Math.max(0, index)).click({ timeout: 5_000 });
  await handle.page.getByRole('button', { name: 'Lock In Answer' }).click({ timeout: 5_000 });
};

/* ------------------------------ run a scenario ------------------------------ */

const run = async (name, scenario) => {
  if (ONLY.length && !ONLY.includes(name)) return;
  log(`▶ ${name}`);
  const before = findings.length;
  try {
    await scenario(name);
  } catch (error) {
    finding(name, `threw: ${error?.stack || error}`);
  }
  // Leave no game running for the next scenario.
  const leftover = await activeRoomId();
  if (leftover) await teacherCall('cancelLiveChallenge', { roomId: leftover }).catch(() => {});
  log(`${findings.length === before ? '✓' : '✗'} ${name}`);
};

const consoleErrors = (S, handles) => {
  for (const handle of handles) check(S, handle.errors.length === 0, `console errors on ${handle.device}${handle.studentId ? ` (${handle.studentId})` : ''}: ${handle.errors.slice(0, 3).join(' | ')}`);
};

/* ================================ scenarios ================================ */

// A — A WHOLE STANDARD CHALLENGE.
await run('classic', async (S) => {
  const ids = studentsOf('p3');
  const teacher = await openTeacher('chromebook');
  const roomId = await createClassic(teacher, { classKey: 'p3', rounds: 5, seconds: 20, passPlaces: 3 });
  check(S, roomId, 'no room');

  // LOBBY. Before anyone is in: Start waits for the first student, and the
  // console names who has not joined.
  check(S, await primary(teacher, 'start').isDisabled(), 'Start is enabled with nobody in the lobby');
  check(S, await waitForText(teacher, 'Not joined yet:', 10_000), 'the console does not say who has not joined');
  const names = ids.map(nameOf);
  check(S, await waitForText(teacher, names[0], 10_000), `the console roster does not name ${names[0]}`);
  const s1 = await openStudent(ids[0], 'chromebook');
  const s2 = await openStudent(ids[1], 'phone');
  const s3 = await openStudent(ids[2], 'ipad');
  for (const id of ids.slice(3)) await botJoin(roomId, id);
  for (const student of [s1, s2, s3]) check(S, await waitForText(student, 'You are in as', 20_000), `${student.studentId}: no lobby card`);
  check(S, await waitForText(s1, 'Waiting for your teacher to start', 5_000), 'the lobby does not say what happens next');
  check(S, await waitForText(s1, 'Top 3:', 5_000), 'the lobby does not say what placement earns');
  check(S, await waitForText(teacher, '6 of 6 joined', 15_000), 'the console roster does not count everyone in');
  check(S, !(await primary(teacher, 'start').isDisabled()), 'Start stays disabled with the class in');
  await shot(teacher, 'A01-console-lobby');
  await shot(s1, 'A01-student-lobby-chromebook');
  await shot(s2, 'A01-student-lobby-phone');

  await toProjector(teacher);
  check(S, (await attr(teacher, '[data-mm-lobby-count]', 'data-mm-lobby-count')) === '6', 'the projector lobby does not count 6');
  const projectorText = await textOf(teacher);
  check(S, !names.some((name) => projectorText.includes(name)), 'the projector shows a student\'s real name');
  await shot(teacher, 'A02-projector-lobby');

  // START: one countdown, in step everywhere.
  await teacher.page.getByRole('button', { name: 'Start Challenge' }).click();
  const r0 = await waitForRoom(roomId, (room) => room.status === 'running');
  check(S, r0, 'the game did not start');
  const leadMs = ms(r0.startsAt) - Date.now();
  note(S, 'countdown lead at first look (ms)', leadMs);
  check(S, leadMs > 1_500, `the round started almost at once (${leadMs} ms of countdown left)`);
  const steps = [];
  for (let index = 0; index < 6 && Date.now() < ms(r0.startsAt) - 150; index += 1) {
    const [arena, student] = await Promise.all([
      attr(teacher, '[data-mm-countdown]', 'data-mm-countdown'),
      attr(s1, '[data-mm-round-countdown] [data-mm-countdown]', 'data-mm-countdown'),
    ]);
    steps.push([arena, student]);
    await wait(420);
  }
  note(S, 'countdown samples [projector, student]', steps);
  check(S, steps.length >= 2 && steps.every(([arena, student]) => arena && student), 'a countdown is missing on the projector or a student');
  check(S, steps.every(([arena, student]) => !arena || !student || Math.abs(Number(arena) - Number(student)) <= 1), 'projector and student countdowns disagree by more than a step');
  check(S, steps.filter(([arena, student]) => arena === student).length >= Math.ceil(steps.length / 2), 'projector and student countdowns are mostly out of step');
  check(S, (await s1.page.locator('[data-mm-game] [role="radio"]').first().isVisible().catch(() => false)) === false, 'the question is visible before GO');
  await shot(teacher, 'A03-projector-countdown');
  await shot(s1, 'A03-student-countdown');
  await wait(Math.max(0, ms(r0.startsAt) - Date.now()) + 300);
  check(S, await waitForStudentStage(s1, 'roundActive', 5_000), 'the student is not playing after GO');

  // RE-RENDERS. Before this work a student's screen committed ~29 times a
  // second during an open round with one classmate reporting progress (the
  // whole question engine included). Measure the same moment.
  const progress = setInterval(() => {
    roomOf(roomId).then((room) => botCall('reportLiveChallengeProgress', ids[5], {
      roomId, roundIndex: room.currentRound, roundVersion: room.roundVersion, roundToken: room.roundToken, provisionalPoints: Math.floor(Math.random() * 400),
    })).catch(() => {});
  }, 900);
  const renderBefore = await metrics(s1);
  await wait(4_000);
  const renderAfter = await metrics(s1);
  clearInterval(progress);
  const commitsPerSecond = (renderAfter.commits - renderBefore.commits) / 4;
  note(S, 'student commits per second in an open round (one classmate reporting progress)', commitsPerSecond);
  check(S, commitsPerSecond <= 10, `a student's screen re-renders ${commitsPerSecond} times a second during a round`);

  // ROUND 1: some answer, some do not; the deadline closes it.
  await answerInBrowser(s1, roomId, { correct: true });
  await answerInBrowser(s2, roomId, { correct: false });
  await botAnswer(roomId, ids[3], { correct: true });
  await botAnswer(roomId, ids[4], { correct: true, humanElapsedMs: 9_000 });
  check(S, await waitForText(s1, 'Round complete for you', 8_000), 'a student who answered is not told they finished early');
  check(S, await waitForAttr(teacher, '[data-mm-locked-in]', 'data-mm-locked-in', '4', 8_000), 'the projector does not count 4 locked in');
  await shot(teacher, 'A04-projector-round');
  await shot(s1, 'A04-student-finished-early');
  const room1 = await roomOf(roomId);
  await wait(Math.max(0, ms(room1.endsAt) - Date.now()) + 300);
  check(S, await waitForText(s3, 'Time is up! The results are coming.', 4_000), 'a student who did not answer is not told results are coming');
  await shot(s3, 'A05-student-timeup-ipad');
  const closed1 = await waitForRoom(roomId, (room) => room.roundState === 'closed', 15_000);
  check(S, closed1, 'round 1 never closed itself');
  if (closed1) {
    const lag = ms(closed1.roundClosedAt) - ms(room1.endsAt);
    note(S, 'round 1 closed after the deadline (ms)', lag);
    check(S, lag >= 750 && lag < 8_000, `round 1 closed ${lag} ms after the deadline (expected after the grace, within seconds)`);
  }
  const summary1 = await roundDoc(roomId, 0);
  check(S, Array.isArray(summary1?.standingsAfterRound), 'round 1 has no standings in its result');
  for (const student of [s1, s2, s3]) {
    check(S, await waitForStudentStage(student, 'roundResults', 10_000), `${student.studentId}: no results screen`);
    const key = (await privatePlayer(roomId, student.studentId)).playerKey;
    const view = roundResultsView({ summary: summary1, selfKey: key });
    const expected = roundPlacementSentence(view?.self, view?.fieldSize);
    check(S, await waitForText(student, expected, 6_000), `${student.studentId}: the results do not say "${expected}"`);
    const standing = summary1?.standingsAfterRound?.find((entry) => entry.playerKey === key);
    if (standing) check(S, await waitForText(student, `Overall: ${standing.tied ? 'tied for ' : ''}${ordinal(standing.rank)}`, 4_000), `${student.studentId}: the overall place is not ${ordinal(standing.rank)}`);
  }
  check(S, await waitForArena(teacher, 'roundResults', 5_000), 'the projector is not on the results');
  const arenaRows = await teacher.page.locator('[aria-label="Standings after this round"] [data-mm-standing]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-mm-standing')));
  const serverOrder = (summary1?.standingsAfterRound || []).map((row) => row.playerKey).slice(0, arenaRows.length);
  check(S, arenaRows.length > 0 && JSON.stringify(arenaRows) === JSON.stringify(serverOrder), `the projector standings are not the server's (${arenaRows.length} rows)`);
  const boardText = await textOf(teacher);
  check(S, !/\b0 0 0 0\b/.test(boardText), 'the projector board reads as a row of zeros');
  const roundOrder = await teacher.page.locator('[aria-label="Round results"] [data-mm-round-result]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-mm-round-result')));
  const expectedRoundOrder = roundResultsView({ summary: summary1 }).rows.map((row) => row.playerKey).slice(0, roundOrder.length);
  check(S, roundOrder.length > 0 && JSON.stringify(roundOrder) === JSON.stringify(expectedRoundOrder), 'the projector round table is not in the round\'s order');
  const shownPoints = roundResultsView({ summary: summary1 }).rows.filter((row) => row.participated).map((row) => row.roundPoints);
  check(S, shownPoints.every((points, index) => index === 0 || points <= shownPoints[index - 1]), 'a per-response round table shows a smaller number above a bigger one');
  await shot(teacher, 'A06-projector-results');
  await shot(s1, 'A06-student-results-chromebook');
  await shot(s2, 'A06-student-results-phone');

  // NEXT ROUND, pressed twice: one round opens.
  const next = primary(teacher, 'advance');
  await next.click();
  await next.click({ timeout: 800 }).catch(() => {});
  const r1 = await waitForRoom(roomId, (room) => Number(room.currentRound) === 1 && room.roundState === 'open', 15_000);
  check(S, r1 && r1.roundVersion === 2, `a double Next Round opened round ${r1?.currentRound} version ${r1?.roundVersion}`);
  await wait(1_500);
  check(S, Number((await roomOf(roomId)).currentRound) === 1, 'a second round was skipped');
  await wait(Math.max(0, ms(r1.startsAt) - Date.now()) + 300);

  // ROUND 2: everyone answers early; it closes without waiting for the clock.
  await Promise.all([
    answerInBrowser(s1, roomId, { correct: true }),
    answerInBrowser(s2, roomId, { correct: true }),
    answerInBrowser(s3, roomId, { correct: false }),
    botAnswer(roomId, ids[3], { correct: false }),
    botAnswer(roomId, ids[4], { correct: true }),
    botAnswer(roomId, ids[5], { correct: true }),
  ]);
  const closed2 = await waitForRoom(roomId, (room) => room.roundState === 'closed', 12_000);
  check(S, closed2 && ms(closed2.roundClosedAt) < ms(r1.endsAt), 'a round everyone answered did not close early');
  for (const student of [s1, s2, s3]) check(S, await waitForStudentStage(student, 'roundResults', 10_000), `${student.studentId}: no results after an early close`);
  await shot(teacher, 'A07-projector-results-movement');

  // A STUDENT REFRESHES ON THE RESULTS: the same results.
  const before = (await textOf(s1)).match(/You (placed|tied for) \S+ of \d+/)?.[0] || null;
  await s1.page.reload({ waitUntil: 'domcontentloaded' });
  check(S, await waitForStudentStage(s1, 'roundResults', 15_000), 'a refresh on the results lost the results');
  check(S, before && await waitForText(s1, before, 8_000), `after a refresh the results no longer say "${before}"`);

  // ROUND 3 with the TEACHER REFRESHING mid-round: the console comes back and still closes it.
  await primary(teacher, 'advance').click();
  const r2 = await waitForRoom(roomId, (room) => Number(room.currentRound) === 2 && room.roundState === 'open', 15_000);
  check(S, r2, 'round 3 never opened');
  await toConsole(teacher);
  await teacher.page.reload({ waitUntil: 'domcontentloaded' });
  check(S, await waitForText(teacher, 'Reconnected to your live game', 15_000), 'a refreshed console does not say it reconnected');
  check(S, await waitForConsole(teacher, ['countdown', 'roundActive', 'roundLocked'], 10_000), 'the refreshed console is not on the round');
  await shot(teacher, 'A08-console-after-refresh');
  await wait(Math.max(0, ms(r2.startsAt) - Date.now()) + 300);
  await botAnswer(roomId, ids[3], { correct: true });
  const closed3 = await waitForRoom(roomId, (room) => room.roundState === 'closed', 40_000);
  check(S, closed3, 'after a teacher refresh the round never closed');

  // END GAME, asked first.
  await primary(teacher, 'advance').click();
  await waitForRoom(roomId, (room) => Number(room.currentRound) === 3 && room.roundState === 'open', 15_000);
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await dismissDialog(teacher);
  await wait(800);
  check(S, (await roomOf(roomId)).status === 'running', '"Keep playing" ended the game anyway');
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await shot(teacher, 'A09-console-end-game-confirm');
  await confirmDialog(teacher, 'End Game');
  const finished = await waitForRoom(roomId, (room) => room.status === 'finished', 30_000);
  check(S, finished, 'End Game did not finish the game');

  // THE END: the podium, each student's place, rewards once.
  const result = (await db.collection('liveChallengeMatchResults').doc(roomId).get()).data();
  for (const student of [s1, s2, s3]) {
    check(S, await waitForStudentStage(student, 'completed', 15_000), `${student.studentId}: no final screen`);
    const standing = result?.standings?.find((row) => row.studentId === student.studentId);
    if (standing?.rank) check(S, await waitForText(student, `${standing.tied ? 'T-' : ''}${ordinal(standing.rank)} ${standing.tied ? `tied for ${ordinal(standing.rank)} ` : ''}of`, 6_000), `${student.studentId}: the final card does not show ${ordinal(standing.rank)}`);
    if (standing) check(S, await waitForText(student, `${standing.score.toLocaleString()} points`, 6_000), `${student.studentId}: the final card does not show ${standing.score} points`);
  }
  await toProjector(teacher);
  check(S, await waitForArena(teacher, 'completed', 5_000), 'the projector is not on the podium');
  check(S, await waitForText(teacher, 'Champion', 5_000), 'the podium has no champion');
  await shot(teacher, 'A10-projector-podium');
  await shot(s1, 'A10-student-final-chromebook');
  await shot(s2, 'A10-student-final-phone');
  let grants = [];
  for (let tries = 0; tries < 30; tries += 1) {
    grants = (await db.collection('rewardGrants').where('source.id', '==', roomId).get()).docs.map((doc) => doc.data()).filter((grant) => grant.rewardCode === 'practicePass');
    if (grants.length) break;
    await wait(500);
  }
  const podium = (result?.standings || []).filter((row) => row.rank && row.rank <= 3 && row.roundsAnswered >= 1).map((row) => row.studentId).sort();
  check(S, JSON.stringify(grants.map((grant) => grant.studentId).sort()) === JSON.stringify(podium), `Practice Passes went to ${JSON.stringify(grants.map((grant) => grant.studentId))}, the top 3 were ${JSON.stringify(podium)}`);
  check(S, new Set(grants.map((grant) => grant.studentId)).size === grants.length, 'a student was rewarded twice');

  // PLAY AGAIN: a new lobby, and every open screen follows into it.
  await primary(teacher, 'playAgain').click();
  const replayId = await (async () => {
    for (let tries = 0; tries < 60; tries += 1) {
      const active = await activeRoomId();
      if (active && active !== roomId) return active;
      await wait(500);
    }
    return null;
  })();
  check(S, replayId, 'Play Again made no new room');
  for (const student of [s1, s2, s3]) {
    check(S, await waitForStudentStage(student, 'lobby', 20_000), `${student.studentId}: did not move into the new lobby`);
    check(S, !(await textOf(student)).includes('Challenge complete'), `${student.studentId}: the last game's final screen carried over`);
  }
  check(S, await waitForArena(teacher, 'lobby', 15_000), 'the projector did not open the new lobby');
  const replayRoom = await roomOf(replayId);
  const oldRoom = await roomOf(roomId);
  check(S, replayRoom.roundCount === oldRoom.roundCount && replayRoom.roundSeconds === oldRoom.roundSeconds, 'Play Again changed the game settings');
  check(S, JSON.stringify(replayRoom.rewardSummary) === JSON.stringify(oldRoom.rewardSummary), 'Play Again dropped the rewards');
  await shot(s1, 'A11-student-play-again-lobby');
  consoleErrors(S, [teacher, s1, s2, s3]);
  await closeAll(teacher, s1, s2, s3);
});

// B — WHAT THE NUMBERS MEAN: Correct Count with ties, and Grand Prix.
await run('scoring', async (S) => {
  const ids = studentsOf('p4');
  // Correct Count (set through the API; the console reads the room's own strategy).
  const created = await teacherCall('createLiveChallenge', { classId: CLASSES.p4.classId, courseId: 'algebra1', standardCode: 'mixed', questionStyle: 'noTools', roundCount: 5, roundSeconds: 30, scoringStrategyId: 'correctCount' });
  const roomId = created.roomId;
  const teacher = await openTeacher('chromebook');
  check(S, await waitForConsole(teacher, 'lobby', 20_000), 'the console did not open the API-made lobby');
  const s1 = await openStudent(ids[0], 'chromebook');
  for (const id of ids.slice(1)) await botJoin(roomId, id);
  check(S, await waitForText(s1, 'You are in as', 15_000), 'no lobby');
  await primary(teacher, 'start').click();
  const r0 = await waitForRoom(roomId, (room) => room.status === 'running');
  await wait(Math.max(0, ms(r0.startsAt) - Date.now()) + 300);
  // Two correct, two wrong: a tie for first and a tie below it.
  await answerInBrowser(s1, roomId, { correct: true });
  await botAnswer(roomId, ids[1], { correct: true });
  await botAnswer(roomId, ids[2], { correct: false });
  await botAnswer(roomId, ids[3], { correct: false });
  await waitForRoom(roomId, (room) => room.roundState === 'closed', 15_000);
  check(S, await waitForStudentStage(s1, 'roundResults', 10_000), 'no results');
  check(S, await waitForText(s1, 'You tied for 1st of', 6_000), 'a shared first place does not say "tied"');
  check(S, await waitForText(s1, 'correct answer', 6_000), 'Correct Count does not read in correct answers');
  check(S, await waitForText(teacher, 'T-1', 6_000), 'the console board does not mark the tie T-1');
  await shot(teacher, 'B01-console-correct-count-ties');
  await shot(s1, 'B01-student-correct-count-ties');
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await confirmDialog(teacher, 'End Game');
  await waitForRoom(roomId, (room) => room.status === 'finished', 30_000);
  check(S, await waitForText(s1, 'correct answers', 10_000) || await waitForText(s1, 'correct answer', 2_000), 'the final card does not count correct answers');
  await primary(teacher, 'newChallenge').isVisible().catch(() => false);
  await teacher.page.getByRole('button', { name: 'New Challenge', exact: true }).click();

  // Grand Prix: the round's points and the championship total are never confused.
  const gp = await teacherCall('createLiveChallenge', { classId: CLASSES.p4.classId, courseId: 'algebra1', standardCode: 'mixed', questionStyle: 'noTools', roundCount: 5, roundSeconds: 30, scoringStrategyId: 'grandPrix' });
  check(S, await waitForStudentStage(s1, 'lobby', 20_000), 'the student did not follow into the Grand Prix lobby');
  await teacher.page.reload({ waitUntil: 'domcontentloaded' });
  check(S, await waitForConsole(teacher, 'lobby', 20_000), 'the console did not reopen the Grand Prix lobby');
  for (const id of ids.slice(1)) await botJoin(gp.roomId, id);
  await primary(teacher, 'start').click();
  const g0 = await waitForRoom(gp.roomId, (room) => room.status === 'running');
  await wait(Math.max(0, ms(g0.startsAt) - Date.now()) + 300);
  await answerInBrowser(s1, gp.roomId, { correct: true });
  await botAnswer(gp.roomId, ids[1], { correct: true, humanElapsedMs: 9_000 });
  await botAnswer(gp.roomId, ids[2], { correct: false });
  await botAnswer(gp.roomId, ids[3], { correct: true, humanElapsedMs: 15_000 });
  await waitForRoom(gp.roomId, (room) => room.roundState === 'closed', 15_000);
  check(S, await waitForStudentStage(s1, 'roundResults', 10_000), 'no Grand Prix results');
  const summary = await roundDoc(gp.roomId, 0);
  const key = (await privatePlayer(gp.roomId, ids[0])).playerKey;
  const mine = summary?.standings?.find((row) => row.playerKey === key);
  check(S, mine && await waitForText(s1, `+${mine.matchPointsAwarded} championship points`, 6_000), `the student is not told +${mine?.matchPointsAwarded} championship points`);
  check(S, await waitForText(s1, 'points this round', 4_000) || await waitForText(s1, 'round points', 1_000), 'the round\'s own points are not named as the round\'s');
  await toProjector(teacher);
  check(S, await waitForText(teacher, 'Round results · championship points', 6_000), 'the projector does not say the round earned championship points');
  await shot(teacher, 'B02-projector-grand-prix-results');
  await shot(s1, 'B02-student-grand-prix-results');
  consoleErrors(S, [teacher, s1]);
  await closeAll(teacher, s1);
});

// C — GRAPH FEATURE RUSH INSIDE THE SHELL (the rush harness plays it in depth).
await run('rush', async (S) => {
  const ids = studentsOf('p4');
  const teacher = await openTeacher('chromebook');
  const roomId = await createRush(teacher, { classKey: 'p4', rounds: 1, seconds: 30, scoring: 'grandPrix' });
  const s1 = await openStudent(ids[0], 'chromebook');
  const s2 = await openStudent(ids[1], 'phone');
  for (const id of ids.slice(2)) await botJoin(roomId, id);
  for (const student of [s1, s2]) check(S, await waitForText(student, 'You are in as', 15_000), `${student.studentId}: no lobby`);
  check(S, await waitForText(s1, 'Graph Feature Rush', 5_000), 'the lobby does not name the game');
  await toProjector(teacher);
  await teacher.page.getByRole('button', { name: 'Start Challenge' }).click();
  const r0 = await waitForRoom(roomId, (room) => room.status === 'running');
  check(S, await waitForAttr(s1, '.mm-rush-count', 'data-mm-countdown', ['3', '2', '1'], 6_000), 'the rush "Get ready" has no 3-2-1');
  check(S, await waitForArena(teacher, 'countdown', 3_000), 'the projector shows no countdown');
  await shot(s1, 'C01-rush-countdown-student');
  await wait(Math.max(0, ms(r0.startsAt) - Date.now()) + 1_000);
  check(S, (await teacher.page.locator('svg.mm-rush-graph').count()) === 0, 'the projector drew a student\'s graph');
  check(S, await waitForText(teacher, 'Live race', 5_000), 'the projector does not show the race');
  await shot(teacher, 'C02-rush-projector-race');
  await waitForRoom(roomId, (room) => room.roundState === 'closed', 45_000);
  for (const student of [s1, s2]) {
    check(S, await waitForStudentStage(student, 'roundResults', 10_000), `${student.studentId}: no rush results`);
    check(S, await waitForText(student, 'Round 1 results', 5_000), `${student.studentId}: the results are not titled`);
    check(S, await waitForText(student, 'No championship points this round', 5_000) || await waitForText(student, 'championship points', 1_000), `${student.studentId}: the rush results do not speak championship points`);
  }
  check(S, await waitForArena(teacher, 'roundResults', 5_000), 'the projector is not on the rush results');
  await shot(s1, 'C03-rush-results-student');
  await shot(teacher, 'C03-rush-results-projector');
  await primary(teacher, 'advance').click();
  await waitForRoom(roomId, (room) => room.status === 'finished', 20_000);
  for (const student of [s1, s2]) check(S, await waitForStudentStage(student, 'completed', 15_000), `${student.studentId}: no final screen`);
  consoleErrors(S, [teacher, s1, s2]);
  await closeAll(teacher, s1, s2);
});

// D — RECONNECTS, A SECOND DEVICE, GOING QUIET, A LATE JOINER, A REFRESHED PODIUM.
await run('reconnect', async (S) => {
  const ids = studentsOf('p3');
  const teacher = await openTeacher('chromebook');
  const roomId = await createClassic(teacher, { classKey: 'p3', rounds: 5, seconds: 30 });
  const s1 = await openStudent(ids[0], 'chromebook');
  const s2 = await openStudent(ids[1], 'chromebook');
  const s2Again = await openStudent(ids[1], 'phone');
  await botJoin(roomId, ids[2]);
  await botJoin(roomId, ids[3]);
  for (const student of [s1, s2, s2Again]) check(S, await waitForText(student, 'You are in as', 15_000), `${student.studentId}: no lobby`);
  // Two game screens heard for the same student: the console says so.
  check(S, await waitForText(teacher, '2 devices', 20_000), 'a student on two devices is not shown as such');
  await shot(teacher, 'D01-console-two-devices');

  await primary(teacher, 'start').click();
  const r0 = await waitForRoom(roomId, (room) => room.status === 'running');
  await wait(Math.max(0, ms(r0.startsAt) - Date.now()) + 300);

  // OFFLINE AND BACK: the screen says so, and catches up with what it missed.
  await s1.context.setOffline(true);
  check(S, await waitForText(s1, 'Offline', 6_000), 'an offline student is not told');
  await shot(s1, 'D02-student-offline');
  await botAnswer(roomId, ids[2], { correct: true });
  await botAnswer(roomId, ids[3], { correct: true });
  await answerInBrowser(s2, roomId, { correct: true });
  await teacherCall('closeLiveChallengeRound', { roomId, force: true, expectedRoundIndex: 0, expectedRoundVersion: r0.roundVersion });
  await s1.context.setOffline(false);
  check(S, await waitForStudentStage(s1, 'roundResults', 20_000), 'back online, the student did not catch up to the results');
  check(S, !(await textOf(s1)).includes('Offline'), 'still "Offline" after reconnecting');

  // GOING QUIET: no heartbeat for two minutes reads as "No signal", by name.
  const quietKey = (await privatePlayer(roomId, ids[3])).playerKey;
  await roomRef(roomId).collection('diagnostics').doc(quietKey).set({ connectionUpdatedAt: admin.firestore.Timestamp.fromMillis(Date.now() - PRESENCE_FRESH_MS - 60_000), sessions: {} }, { merge: true });
  check(S, await waitForText(teacher, 'No signal', 20_000), 'a student who went quiet is not shown as "No signal"');
  await shot(teacher, 'D03-console-no-signal');

  // A LATE JOINER walks in on round 2.
  await primary(teacher, 'advance').click();
  const r1 = await waitForRoom(roomId, (room) => Number(room.currentRound) === 1 && room.roundState === 'open', 15_000);
  await wait(Math.max(0, ms(r1.startsAt) - Date.now()) + 300);
  const late = await openStudent(ids[4], 'phone');
  check(S, await waitForText(late, 'You joined during round 2', 20_000), 'a late joiner is not told they play from this round');
  await shot(late, 'D04-student-late-join');
  check(S, (await privatePlayer(roomId, ids[4])).joinedAtRound === 1, 'the server did not record the round the late joiner walked in on');

  // THE PODIUM SURVIVES A TEACHER REFRESH.
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await confirmDialog(teacher, 'End Game');
  await waitForRoom(roomId, (room) => room.status === 'finished', 30_000);
  check(S, await waitForConsole(teacher, 'completed', 10_000), 'the console is not on the finished game');
  await teacher.page.reload({ waitUntil: 'domcontentloaded' });
  check(S, await waitForConsole(teacher, 'completed', 20_000), 'a refresh lost the finished game\'s results');
  check(S, await waitForText(teacher, 'Challenge complete', 5_000), 'the refreshed console does not show the finished game');
  await shot(teacher, 'D05-console-finished-after-refresh');
  // The heartbeat stops once the game is over.
  const callsBefore = bridgeCalls.filter((call) => call.name === 'calibrateLiveChallengeClock' && call.identity?.studentId === ids[0]).length;
  await wait(4_000);
  const callsAfter = bridgeCalls.filter((call) => call.name === 'calibrateLiveChallengeClock' && call.identity?.studentId === ids[0]).length;
  check(S, callsAfter === callsBefore, `a finished game's screen kept calibrating (${callsAfter - callsBefore} calls in 4 s)`);
  consoleErrors(S, [teacher, s2, s2Again, late]);
  await closeAll(teacher, s1, s2, s2Again, late);
});

// E — A CLASS OF 32 ON A 1366×768 PROJECTOR, ZOOMED; PHONES AND TABLETS; REDUCED MOTION.
await run('big-class', async (S) => {
  const ids = studentsOf('big');
  const teacher = await openTeacher('projector');
  const roomId = await createClassic(teacher, { classKey: 'big', rounds: 5, seconds: 20 });
  const phone = await openStudent(ids[0], 'smallPhone', { reducedMotion: 'reduce' });
  const tablet = await openStudent(ids[1], 'ipad');
  for (const id of ids.slice(2)) await botJoin(roomId, id);
  check(S, await waitForText(phone, 'You are in as', 15_000), 'no lobby on a small phone');
  await toProjector(teacher);
  check(S, await waitForAttr(teacher, '[data-mm-lobby-count]', 'data-mm-lobby-count', '32', 15_000), 'the projector lobby does not count 32');
  check(S, (await overflowX(teacher)) <= 0, 'the projector lobby scrolls sideways at 1366×768');
  await shot(teacher, 'E01-projector-lobby-32');
  await teacher.page.getByRole('button', { name: 'Start Challenge' }).click();
  const r0 = await waitForRoom(roomId, (room) => room.status === 'running');
  await wait(Math.max(0, ms(r0.startsAt) - Date.now()) + 300);
  await answerInBrowser(phone, roomId, { correct: true });
  await Promise.all(ids.slice(2).map((id, index) => botAnswer(roomId, id, { correct: index % 3 !== 0, humanElapsedMs: 1_000 + index * 300 })));
  await answerInBrowser(tablet, roomId, { correct: false });
  await waitForRoom(roomId, (room) => room.roundState === 'closed', 20_000);
  check(S, await waitForArena(teacher, 'roundResults', 10_000), 'no projector results for 32');
  check(S, await waitForText(teacher, 'more players', 5_000), 'a 32-player board does not say how many more are playing');
  for (const device of ['projector', 'zoom125', 'zoom150']) {
    await teacher.page.setViewportSize(DEVICES[device].viewport);
    await wait(500);
    check(S, (await overflowX(teacher)) <= 0, `the projector results scroll sideways at ${device}`);
    const visible = await teacher.page.evaluate(() => {
      const rows = [...document.querySelectorAll('[aria-label="Standings after this round"] [data-mm-standing]')];
      return rows.filter((row) => { const rect = row.getBoundingClientRect(); return rect.bottom <= window.innerHeight && rect.top >= 0; }).length;
    });
    note(S, `standings rows fully visible at ${device}`, visible);
    check(S, visible >= 3, `only ${visible} standings rows are visible at ${device}`);
    await shot(teacher, `E02-projector-results-${device}`);
  }
  await teacher.page.setViewportSize(DEVICES.projector.viewport);
  for (const student of [phone, tablet]) {
    check(S, await waitForStudentStage(student, 'roundResults', 10_000), `${student.device}: no results`);
    check(S, (await overflowX(student)) <= 0, `${student.device}: the results scroll sideways`);
    await shot(student, `E03-student-results-${student.device}`);
  }
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await confirmDialog(teacher, 'End Game');
  await waitForRoom(roomId, (room) => room.status === 'finished', 30_000);
  check(S, await waitForArena(teacher, 'completed', 10_000), 'no podium');
  await shot(teacher, 'E04-projector-podium-32');
  check(S, await waitForStudentStage(phone, 'completed', 10_000), 'no final screen on the phone');
  const confetti = await phone.page.evaluate(() => {
    const node = document.querySelector('.mm-shell-confetti');
    return node ? getComputedStyle(node).display : 'absent';
  });
  check(S, confetti === 'none' || confetti === 'absent', `reduced motion still shows confetti (${confetti})`);
  check(S, (await overflowX(phone)) <= 0, 'the final card scrolls sideways on a small phone');
  await shot(phone, 'E05-student-final-small-phone');
  consoleErrors(S, [teacher, phone, tablet]);
  await closeAll(teacher, phone, tablet);
});

// F — FOUR GAMES IN A ROW WITH THE SAME OPEN SCREENS.
await run('repeat', async (S) => {
  const ids = studentsOf('p4');
  const teacher = await openTeacher('chromebook');
  const s1 = await openStudent(ids[0], 'chromebook');
  const samples = [];
  const playOne = async (roomId, label) => {
    for (const id of ids.slice(1)) await botJoin(roomId, id);
    check(S, await waitForStudentStage(s1, 'lobby', 20_000), `${label}: the student is not in the new lobby`);
    check(S, (await s1.page.locator('[data-mm-student-score]').count()) === 0, `${label}: the lobby shows a score from the last game`);
    await primary(teacher, 'start').click();
    const room = await waitForRoom(roomId, (value) => value.status === 'running');
    await wait(Math.max(0, ms(room.startsAt) - Date.now()) + 300);
    const challengeMode = room.challengeMode;
    if (challengeMode !== 'graphFeatureRush') {
      await answerInBrowser(s1, roomId, { correct: true });
      await Promise.all(ids.slice(1).map((id) => botAnswer(roomId, id, { correct: true })));
    }
    await waitForRoom(roomId, (value) => value.roundState === 'closed', 45_000);
    check(S, await waitForStudentStage(s1, 'roundResults', 10_000), `${label}: no results`);
    const board = await publicPlayers(roomId);
    if (challengeMode !== 'graphFeatureRush') check(S, board.filter((row) => row.joined).every((row) => row.score > 0), `${label}: a player who answered correctly has 0 points`);
    await teacher.page.getByRole('button', { name: 'End Game' }).click();
    await confirmDialog(teacher, 'End Game');
    await waitForRoom(roomId, (value) => value.status === 'finished', 30_000);
    check(S, await waitForStudentStage(s1, 'completed', 15_000), `${label}: no final screen`);
    samples.push({ label, ...(await metrics(s1)) });
  };
  // 1: a standard game.
  const first = await createClassic(teacher, { classKey: 'p4', rounds: 5, seconds: 20 });
  await playOne(first, 'game 1 (standard)');
  // 2: Play Again.
  await primary(teacher, 'playAgain').click();
  const second = await (async () => { for (let tries = 0; tries < 60; tries += 1) { const active = await activeRoomId(); if (active && active !== first) return active; await wait(500); } return null; })();
  check(S, second, 'Play Again made no new room');
  await playOne(second, 'game 2 (play again)');
  // 3: a rush (New Challenge, a different mode).
  await teacher.page.getByRole('button', { name: 'New Challenge', exact: true }).click();
  const third = await createRush(teacher, { classKey: 'p4', rounds: 1, seconds: 30, scoring: 'correctCount' });
  await playOne(third, 'game 3 (rush)');
  // 4: back to a standard game.
  await teacher.page.getByRole('button', { name: 'New Challenge', exact: true }).click();
  const fourth = await createClassic(teacher, { classKey: 'p4', rounds: 5, seconds: 20 });
  await playOne(fourth, 'game 4 (standard)');
  note(S, 'student page after each game', samples);
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  if (firstSample && lastSample) {
    check(S, lastSample.listeners <= firstSample.listeners * 1.5 + 40, `event listeners grew from ${firstSample.listeners} to ${lastSample.listeners} over four games`);
    check(S, lastSample.nodes <= firstSample.nodes * 1.5 + 400, `DOM nodes grew from ${firstSample.nodes} to ${lastSample.nodes} over four games`);
  }
  check(S, new Set([first, second, third, fourth]).size === 4, 'a game reused a room');
  consoleErrors(S, [teacher, s1]);
  await closeAll(teacher, s1);
});

// ADVERSARIAL — DOUBLE PRESSES, TWO HOST TABS, CONFIRMATIONS, EARLY ANSWERS.
await run('adversarial', async (S) => {
  const ids = studentsOf('p4');
  const teacher = await openTeacher('chromebook');
  // A long round: the steps below must happen while it is still in play.
  const roomId = await createClassic(teacher, { classKey: 'p4', rounds: 5, seconds: 60 });
  const s1 = await openStudent(ids[0], 'chromebook');
  for (const id of ids.slice(1)) await botJoin(roomId, id);
  check(S, await waitForText(s1, 'You are in as', 15_000), 'no lobby');
  // A second host tab on the same game.
  const teacher2 = await openTeacher('desktop');
  check(S, await waitForConsole(teacher2, 'lobby', 20_000), 'a second host tab does not open the live game');
  // START pressed three times across two tabs: one round.
  await Promise.all([
    primary(teacher, 'start').click().catch(() => {}),
    primary(teacher, 'start').click({ timeout: 500 }).catch(() => {}),
    primary(teacher2, 'start').click().catch(() => {}),
  ]);
  const r0 = await waitForRoom(roomId, (room) => room.status === 'running');
  await wait(1_000);
  check(S, (await roomOf(roomId)).roundVersion === 1, `Start pressed three times opened ${(await roomOf(roomId)).roundVersion} rounds`);
  // An answer during the countdown is refused and records nothing.
  const early = await botAnswer(roomId, ids[1], { correct: true }).then(() => null, (error) => error);
  check(S, early, 'an answer during the countdown was accepted');
  check(S, (await privatePlayer(roomId, ids[1])).answeredRound === -1, 'an answer during the countdown was recorded');
  // A refresh mid-countdown picks the countdown up where the server is.
  await s1.page.reload({ waitUntil: 'domcontentloaded' });
  const step = await (async () => {
    for (let tries = 0; tries < 20; tries += 1) {
      const value = await attr(s1, '[data-mm-round-countdown] [data-mm-countdown]', 'data-mm-countdown');
      if (value) return value;
      if (Date.now() > ms(r0.startsAt)) return 'started';
      await wait(100);
    }
    return null;
  })();
  note(S, 'countdown step after a refresh', step);
  check(S, step === 'started' || step === 'go' || Number(step) <= Math.ceil((ms(r0.startsAt) - Date.now() + 1_000) / 1000), 'a refresh restarted the countdown');
  await wait(Math.max(0, ms(r0.startsAt) - Date.now()) + 300);
  // END ROUND NOW: asked first; "Keep playing" keeps playing.
  check(S, await waitForConsole(teacher, 'roundActive', 10_000), `the console is not on the round in play (${await attr(teacher, '[data-mm-host-console]', 'data-mm-host-console')})`);
  await shot(teacher, 'X00-console-round-in-play');
  note(S, 'console text in play', (await textOf(teacher)).slice(0, 600));
  await teacher.page.getByRole('button', { name: 'End Round Now' }).click({ timeout: 8_000 });
  await dismissDialog(teacher);
  await wait(600);
  check(S, (await roomOf(roomId)).roundState === 'open', '"Keep playing" ended the round');
  await teacher.page.getByRole('button', { name: 'End Round Now' }).click();
  await confirmDialog(teacher, 'End Round Now');
  check(S, await waitForRoom(roomId, (room) => room.roundState === 'closed', 10_000), 'End Round Now did not end the round');
  check(S, await waitForConsole(teacher2, 'roundResults', 10_000), 'the second host tab is not on the results');
  // NEXT ROUND from both tabs at once: one round.
  await Promise.all([primary(teacher, 'advance').click().catch(() => {}), primary(teacher2, 'advance').click().catch(() => {})]);
  await waitForRoom(roomId, (room) => Number(room.currentRound) === 1, 15_000);
  await wait(1_500);
  const afterNext = await roomOf(roomId);
  check(S, Number(afterNext.currentRound) === 1 && afterNext.roundVersion === 2, `Next Round from two tabs moved to round ${afterNext.currentRound} v${afterNext.roundVersion}`);
  // END GAME during the countdown.
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await confirmDialog(teacher, 'End Game');
  check(S, await waitForRoom(roomId, (room) => room.status === 'finished', 20_000), 'End Game during a countdown did not finish');
  check(S, await waitForStudentStage(s1, 'completed', 15_000), 'the student did not reach the final screen');
  await shot(s1, 'X01-student-final-after-countdown-end');
  // CANCEL A JOINED LOBBY: asked first; students are told.
  await teacher.page.getByRole('button', { name: 'New Challenge', exact: true }).click();
  const lobbyId = await createClassic(teacher, { classKey: 'p4', rounds: 5, seconds: 20 });
  check(S, await waitForStudentStage(s1, 'lobby', 20_000), 'the student did not reach the new lobby');
  await teacher.page.getByRole('button', { name: 'Cancel Session' }).first().click();
  await dismissDialog(teacher);
  await wait(600);
  check(S, (await roomOf(lobbyId)).status === 'lobby', '"Keep the lobby" cancelled it');
  await teacher.page.getByRole('button', { name: 'Cancel Session' }).first().click();
  await confirmDialog(teacher, 'Cancel Session');
  check(S, await waitForRoom(lobbyId, (room) => room.status === 'cancelled', 10_000), 'Cancel Session did not cancel');
  check(S, await waitForText(s1, 'This challenge was cancelled.', 10_000), 'the student is not told the challenge was cancelled');
  await shot(s1, 'X02-student-cancelled');
  consoleErrors(S, [teacher, teacher2, s1]);
  await closeAll(teacher, teacher2, s1);
});

/* --------------------------------- report --------------------------------- */

const summary = {
  scenarios: ONLY.length ? ONLY : ['classic', 'scoring', 'rush', 'reconnect', 'big-class', 'repeat', 'adversarial'],
  findings,
  notes,
  callables: Object.entries(bridgeCalls.reduce((totals, call) => {
    const entry = totals[call.name] || { calls: 0, failures: 0, slowestMs: 0 };
    entry.calls += 1;
    if (!call.ok) entry.failures += 1;
    entry.slowestMs = Math.max(entry.slowestMs, call.ms);
    totals[call.name] = entry;
    return totals;
  }, {})).sort((left, right) => right[1].calls - left[1].calls),
  screenshots: SHOTS,
};
writeFileSync(path.join(SHOTS, 'findings.json'), JSON.stringify(summary, null, 2));
log(findings.length ? `✗ ${findings.length} finding(s)` : '✓ no findings');
await browser.close();
bridge.close();
await stopAll();
process.exit(findings.length ? 1 : 0);
