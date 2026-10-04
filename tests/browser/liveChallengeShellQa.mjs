// The Live Challenge shell — host console, projector, student screens — played
// in real browsers against the REAL server.
//
// HOW TO RUN (one command; it starts the emulator, the bridge and Vite):
//
//   node tests/browser/liveChallengeShellQa.mjs
//   SHELL_QA_SCENARIOS=classic,adversarial node tests/browser/liveChallengeShellQa.mjs
//   SHELL_QA_SHOTS=/some/dir node tests/browser/liveChallengeShellQa.mjs   # where screenshots go
//   SHELL_QA_ENDURANCE_GAMES=2 …            # a shorter endurance run
//   SHELL_QA_HEAP_SNAPSHOT=1 …              # endurance: save the console's heap after
//                                           # each game (detached trees tagged
//                                           # DetachedTreeTag; open in DevTools)
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
//                  a late joiner, the teacher refreshing on the finished podium;
//                  an answer over a slow link settles before the round is
//                  force-closed (support/submissionSettled.mjs)
//   L launch       a class of 40 launching (6 real screens, 34 bots): a 6×
//                  CPU-throttled Chromebook, a tab frozen through zero, a
//                  student offline at zero, one who opens during the countdown,
//                  a listener that attaches after the round is running, and a
//                  screen whose launch diagnostics never get through — every
//                  one reaches the round from the room, answers, and its
//                  telemetry stays within budget
//   E big class    32 players on a 1366×768 projector at 100/125/150% zoom,
//                  phone and tablet layouts, reduced motion
//   F repeat       four games in a row (incl. a mode switch and a rush) with
//                  the same open screens: clean every time, nothing piling up
//   G endurance    five whole games in a row on the same screens — Standard,
//                  Rush (Correct Count), Rush (Grand Prix), Solver Race, Rush —
//                  with students solving in the browser: open listeners per
//                  page, heap/listeners/DOM after a forced GC, names, board
//                  against the stored result, rewards delivered exactly once
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
const { leaderboardOptionsFor } = await import(path.join(repo, 'functions/shared/liveChallengeScoring.mjs'));
const { generateRushQuestion } = await import(path.join(repo, 'functions/shared/graphFeatureGenerator.mjs'));
const { rushLockoutMs } = await import(path.join(repo, 'functions/shared/graphFeatureRushRules.mjs'));
const { unitX, unitY } = await import(path.join(repo, 'src/platform/liveChallenge/rushGraphModel.js'));
const { awaitSettledSubmission } = await import(path.join(here, 'support/submissionSettled.mjs'));

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
  launch: { classId: 'shell-qa-launch', name: 'Period 7 Algebra I', period: 'P7', course: 'algebra1', size: 40 },
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
// Any one-question round: a bank question by its expected choice, a Solver
// Race workspace by its final relation.
const botAnswerAny = async (roomId, studentId, { correct = true, humanElapsedMs = 2_000 } = {}) => {
  const room = await roomOf(roomId);
  const state = (await db.collection('liveChallengePrivate').doc(roomId).get()).data();
  const questionId = state.questionIds[room.currentRound];
  const authored = state.roundQuestions?.[room.currentRound] || (await db.collection('pathQuestionBank').doc(questionId).get()).data();
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${room.currentRound}|${questionId}`);
  const grading = (await mathPath.buildIssuePlan(instantiated.question)).privateGrading;
  const relation = grading?.definition?.expectedFinalRelation;
  const responsePayload = relation
    ? { raw: { finalRelation: correct ? relation : `${relation}+1` } }
    : { responses: Object.fromEntries((grading.fields || []).map((field) => [field.id, correct ? field.expected : '__not-an-answer__'])) };
  return botCall('submitLiveChallengeResponse', studentId, {
    roomId, roundIndex: room.currentRound, roundVersion: room.roundVersion, roundToken: room.roundToken, submissionId: randomUUID(), humanElapsedMs, responsePayload,
  });
};
const teacherCall = (name, data) => functionsIndex[name].run({ auth: authFor({ as: 'teacher', email: TEACHER }), data, rawRequest: { headers: {} } });

/* -------------------------------- browsers -------------------------------- */

const DEVICES = Object.freeze({
  chromebook: { viewport: { width: 1366, height: 768 } },
  projector: { viewport: { width: 1366, height: 768 } },
  zoom125: { viewport: { width: 1093, height: 614 } },
  zoom150: { viewport: { width: 911, height: 512 } },
  // A 1366×768 screen at reduced browser zoom shows more CSS pixels.
  zoom80: { viewport: { width: 1708, height: 960 } },
  zoom67: { viewport: { width: 2039, height: 1146 } },
  tabletLandscape: { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  phoneLandscape: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
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

// Waits use locators, never page.waitForSelector: the element handle that
// returns is held by the DevTools protocol until disposed, so each wait kept
// a whole setup panel alive and the endurance run measured the harness's leak
// instead of the console's.
const createClassic = async (teacher, { classKey = 'p3', rounds = 5, seconds = 20, passPlaces = 0 } = {}) => {
  await teacher.page.locator('text=Create a challenge').first().waitFor({ timeout: 30_000 });
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
const createRush = async (teacher, { classKey = 'p4', preset = 'Quick Algebra I', rounds = 1, seconds = 30, scoring = 'correctCount', passPlaces = null } = {}) => {
  await teacher.page.locator('text=Create a challenge').first().waitFor({ timeout: 30_000 });
  await selectInLabel(teacher, 'Class', CLASSES[classKey].classId);
  await selectInLabel(teacher, 'Game type', 'graphFeatureRush');
  await teacher.page.locator('text=Start from a preset').first().waitFor({ timeout: 15_000 });
  if (preset) await teacher.page.getByRole('button', { name: preset, exact: true }).click();
  await selectInLabel(teacher, 'Rounds', rounds);
  await selectInLabel(teacher, 'Time per round', seconds);
  await selectInLabel(teacher, 'Scoring', scoring);
  if (passPlaces !== null) await teacher.page.getByLabel('Practice Pass for').selectOption(String(passPlaces));
  await teacher.page.getByRole('button', { name: 'Create Lobby' }).click();
  if (!await waitForConsole(teacher, 'lobby', 30_000)) throw new Error('no rush lobby');
  return activeRoomId();
};
const createSolverRace = async (teacher, { classKey = 'p4', rounds = 5, seconds = 30, passPlaces = 0 } = {}) => {
  await teacher.page.locator('text=Create a challenge').first().waitFor({ timeout: 30_000 });
  await selectInLabel(teacher, 'Class', CLASSES[classKey].classId);
  await selectInLabel(teacher, 'Game type', 'solverRace');
  await selectInLabel(teacher, 'Race focus', 'linearEquation');
  await selectInLabel(teacher, 'Rounds', rounds);
  await selectInLabel(teacher, 'Time per round', seconds);
  await teacher.page.getByLabel('Practice Pass for').selectOption(String(passPlaces));
  await teacher.page.getByRole('button', { name: 'Create Lobby' }).click();
  if (!await waitForConsole(teacher, 'lobby', 30_000)) throw new Error('no Solver Race lobby');
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
  await teacher.page.locator('[data-mm-arena-stage]').first().waitFor({ timeout: 10_000 });
};
const toConsole = async (teacher) => {
  await teacher.page.getByRole('button', { name: 'Exit Projector View' }).click();
  await teacher.page.locator('[data-mm-host-console]').first().waitFor({ timeout: 10_000 });
};

/* ------------------------------ student actions ------------------------------ */

// Clicks the server's expected choice (or another one), then locks it in.
// Returns when the click lands, NOT when the answer reaches the server: a
// scenario that then moves the round on waits for submissionSettled first.
const answerInBrowser = async (handle, roomId, { correct = true } = {}) => {
  // Where this answer's call will appear in the page's own call record.
  handle.answerCallsFrom = await handle.page.evaluate(() => window.__mmBridgeCalls?.length || 0);
  const room = await roomOf(roomId);
  const fields = await expectedFor(roomId, room.currentRound);
  const expected = String(fields[0]?.expected ?? '');
  const choices = room.currentQuestion?.responseFields?.[0]?.choices || room.currentQuestion?.choices || [];
  let index = choices.findIndex((choice) => String(choice?.id ?? choice?.value) === expected);
  if (!correct) index = (Math.max(0, index) + 1) % Math.max(1, choices.length);
  await handle.page.locator('[data-mm-game] [role="radio"]').nth(Math.max(0, index)).click({ timeout: 5_000 });
  await handle.page.getByRole('button', { name: 'Lock In Answer' }).click({ timeout: 5_000 });
};

// The answer the last answerInBrowser locked in has reached the server and
// been accepted. Throws (never-sent / hung / refused / unrecorded) otherwise:
// see support/submissionSettled.mjs. Call it before anything that can make
// that answer stale, such as a forced close.
const submissionSettled = (handle, { timeoutMs = 15_000 } = {}) => awaitSettledSubmission({
  readClientCalls: () => handle.page.evaluate(() => (window.__mmBridgeCalls || []).map(({ name, payload, ok, error }) => ({ name, payload: { submissionId: payload?.submissionId }, ok, error }))),
  serverCalls: bridgeCalls,
  studentId: handle.studentId,
  fromIndex: handle.answerCallsFrom || 0,
  timeoutMs,
});

// A rush graph is solved the way a student does it: tap each target where it
// is drawn (or press "Does Not Exist"). The question is regenerated from the
// room's secret, exactly as the server grades it.
const rushQuestionOnScreen = async (handle, roomId) => {
  const attribute = await handle.page.locator('.mm-rush-graph-frame').getAttribute('data-question-index', { timeout: 1_500 }).catch(() => '');
  if (attribute === '' || attribute == null) return null;
  const secret = (await db.collection('liveChallengePrivate').doc(roomId).get()).data()?.graphFeatureRush;
  const room = await roomOf(roomId);
  if (!secret) return null;
  return generateRushQuestion({ seed: secret.seed, studentKey: handle.studentId, roundIndex: room.currentRound, questionIndex: Number(attribute), config: secret.config });
};
const tapRushGraph = async (handle, view, point) => {
  const box = await handle.page.locator('svg.mm-rush-graph').boundingBox();
  const x = box.x + unitX(view, point.x) * box.width;
  const y = box.y + unitY(view, point.y) * box.height;
  if (DEVICES[handle.device]?.hasTouch) await handle.page.touchscreen.tap(x, y);
  else await handle.page.mouse.click(x, y);
};
const solveRushUntil = async (handle, roomId, untilMs, { missEvery = 0 } = {}) => {
  let solved = 0;
  while (Date.now() < untilMs) {
    const question = await rushQuestionOnScreen(handle, roomId);
    if (!question) { await wait(250); continue; }
    if (missEvery && solved % missEvery === missEvery - 1) {
      await tapRushGraph(handle, question.view, { x: question.view.xMin + 0.02 * (question.view.xMax - question.view.xMin), y: question.view.yMax - 0.02 * (question.view.yMax - question.view.yMin) });
      await wait(rushLockoutMs(1) + 120);
    }
    if (!question.targets.length) await handle.page.getByRole('button', { name: 'Does Not Exist' }).click().catch(() => {});
    else for (const target of question.targets) { await tapRushGraph(handle, question.view, target); await wait(90); }
    try {
      await handle.page.waitForFunction((from) => document.querySelector('.mm-rush-graph-frame')?.getAttribute('data-question-index') !== String(from), question.questionIndex, { timeout: 3_000 });
      solved += 1;
    } catch { break; }
  }
  return solved;
};
// What a page's DOM is made of: elements counted by tag and class, so growth
// between two samples names what is piling up rather than a total.
const domCensus = (handle) => handle.page.evaluate(() => {
  const counts = {};
  for (const element of document.body.getElementsByTagName('*')) {
    const className = typeof element.className === 'string' ? element.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    const key = `${element.tagName.toLowerCase()}${className ? `.${className}` : ''}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
});
// DOM nodes no longer on the page but still held by something (after a
// forced GC), grouped by the detached subtree's root: a leak names itself.
const detachedCensus = async (handle) => {
  const session = await handle.context.newCDPSession(handle.page);
  try {
    await session.send('HeapProfiler.collectGarbage').catch(() => {});
    const { result: prototype } = await session.send('Runtime.evaluate', { expression: 'Node.prototype' });
    const { objects } = await session.send('Runtime.queryObjects', { prototypeObjectId: prototype.objectId });
    const { result } = await session.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      returnByValue: true,
      functionDeclaration: `function () {
        // Only nodes JavaScript has touched are listed, but that includes the
        // root of every detached tree something still holds.
        const roots = new Set();
        for (const node of this) {
          let connected = true;
          try { connected = node.isConnected; } catch { continue; }
          if (connected) continue;
          let root = node;
          while (root.parentNode) root = root.parentNode;
          if (root.nodeType === 9) continue;
          roots.add(root);
        }
        const sizeOf = (root) => {
          let count = 1;
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
          while (walker.nextNode()) count += 1;
          return count;
        };
        const describe = (root) => {
          if (root.nodeType !== 1) return root.nodeName + ' "' + String(root.textContent || '').replace(/\\s+/g, ' ').slice(0, 50) + '"';
          const attrs = [...root.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'role' || a.name === 'aria-label' || a.name === 'class').map((a) => a.name + '=' + a.value.slice(0, 30)).join(' ');
          return root.tagName.toLowerCase() + (attrs ? '[' + attrs + ']' : '') + ' "' + String(root.textContent || '').replace(/\\s+/g, ' ').slice(0, 60) + '"';
        };
        const groups = {};
        let detached = 0;
        const touched = new Map();
        for (const node of this) {
          let connected = true;
          try { connected = node.isConnected; } catch { continue; }
          if (connected || node.nodeType !== 1) continue;
          let root = node;
          while (root.parentNode) root = root.parentNode;
          const list = touched.get(root) || [];
          if (list.length < 12) list.push(node.tagName.toLowerCase() + (node.getAttribute('type') ? '[type=' + node.getAttribute('type') + ']' : '') + ' "' + String(node.textContent || node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').slice(0, 30) + '"');
          touched.set(root, list);
        }
        for (const root of roots) {
          const size = sizeOf(root);
          detached += size;
          const key = describe(root);
          groups[key] = groups[key] || { trees: 0, nodes: 0, touched: touched.get(root) || [] };
          groups[key].trees += 1;
          groups[key].nodes += size;
        }
        return { detached, top: Object.entries(groups).sort((a, b) => b[1].nodes - a[1].nodes).slice(0, 8) };
      }`,
    });
    await session.send('Runtime.releaseObject', { objectId: objects.objectId }).catch(() => {});
    return result.value;
  } finally {
    await session.detach().catch(() => {});
  }
};
const censusGrowth = (before = {}, after = {}) => Object.entries(after)
  .map(([key, count]) => [key, count - (before[key] || 0)])
  .filter(([, grown]) => grown > 0)
  .sort((left, right) => right[1] - left[1])
  .slice(0, 8);
// The Live Challenge listeners a page has open right now, by kind.
const watchersOf = (handle) => handle.page.evaluate(() => Object.fromEntries(Object.entries(window.__mmWatchers?.open || {}).filter(([, count]) => count > 0)));
const watcherTotal = (open) => Object.values(open).reduce((sum, count) => sum + count, 0);

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
  // s2 answers over a slow link (400 ms each way to the server), and the
  // teacher force-closes the round once that answer is in. Closing on the
  // line after the click raced the answer and lost whenever it arrived second
  // (PR #415, I-11); the slow link made that every run. The gate fails if the
  // answer is never sent, hangs, or is refused while the round is open.
  await s2.page.evaluate(() => { window.__mmBridgeDelayMs = 400; });
  await answerInBrowser(s2, roomId, { correct: true });
  try {
    const settled = await submissionSettled(s2);
    note(S, 'slow-link answer settled before the forced close', { ms: settled.server.ms });
  } catch (error) {
    finding(S, error.message);
  }
  await s2.page.evaluate(() => { window.__mmBridgeDelayMs = 0; });
  await teacherCall('closeLiveChallengeRound', { roomId, force: true, expectedRoundIndex: 0, expectedRoundVersion: r0.roundVersion });
  check(S, (await privatePlayer(roomId, ids[1])).answeredRound === 0, 'the server does not hold the answer s2 locked in before the close');
  check(S, await waitForStudentStage(s2, 'roundResults', 20_000), 's2 did not move from its answered round to the results');
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

  // A BACKGROUNDED TAB: the browser freezes s1 mid-round, and the round ends
  // while it sleeps. A HOST REFRESH mid-round: the console comes back to the
  // same round with the server's time left, and still closes it on time. A
  // STUDENT REFRESH AT THE BUZZER lands on the results.
  const freezer = await s1.context.newCDPSession(s1.page);
  await freezer.send('Page.setWebLifecycleState', { state: 'frozen' });
  await teacher.page.reload({ waitUntil: 'domcontentloaded' });
  check(S, await waitForConsole(teacher, 'roundActive', 20_000), 'a console refreshed mid-round lost the round in play');
  const shownLeft = Number(String(await attr(teacher, '[data-mm-host-console] [role="timer"]', 'aria-label') || '').match(/(\d+) seconds left/)?.[1]);
  const serverLeft = Math.ceil((ms(r1.endsAt || r1.roundEndsAt) - Date.now()) / 1000);
  check(S, Number.isFinite(shownLeft) && Math.abs(shownLeft - serverLeft) <= 2, `the refreshed console shows ${shownLeft} s left; the server's deadline is ${serverLeft} s away`);
  await wait(Math.max(0, ms(r1.endsAt || r1.roundEndsAt) - Date.now() - 400));
  await s2.page.reload({ waitUntil: 'domcontentloaded' });
  check(S, await waitForRoom(roomId, (room) => Number(room.currentRound) === 1 && room.roundState === 'closed', 20_000), 'the refreshed console did not close the round at its deadline');
  check(S, await waitForStudentStage(s2, 'roundResults', 20_000), 'a student who refreshed at the buzzer did not land on the results');
  await freezer.send('Page.setWebLifecycleState', { state: 'active' });
  check(S, await waitForStudentStage(s1, 'roundResults', 15_000), 'a frozen tab did not catch up to the results when it woke');
  check(S, !/seconds left/.test(String(await attr(s1, '[role="timer"]', 'aria-label') || '')), 'the woken tab still shows a running clock');
  await freezer.detach().catch(() => {});

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

// L — A CLASS OF 40 LAUNCHING: EVERY SCREEN REACHES THE ROUND FROM THE ROOM.
// The countdown is animation, not the source of truth: a screen that misses it
// (frozen, offline, slow, or not open yet) must still derive the running round
// from the durable room, play it, and report what it saw — and a screen whose
// diagnostics cannot be delivered must play exactly the same.
await run('launch', async (S) => {
  const ids = studentsOf('launch');
  const teacher = await openTeacher('chromebook');
  // Long rounds: a screen whose choices are disabled mid-round is then a
  // finding about the screen, never about the clock running out.
  const roomId = await createClassic(teacher, { classKey: 'launch', rounds: 5, seconds: 90 });
  const [normalId, slowId, frozenId, offlineId, countdownId, lateId] = ids;
  const bots = ids.slice(6);
  const normal = await openStudent(normalId, 'chromebook');
  const slow = await openStudent(slowId, 'chromebook');
  const frozen = await openStudent(frozenId, 'chromebook');
  const offline = await openStudent(offlineId, 'phone');
  // The normal screen's launch-only diagnostic batches never get through.
  let blockedLaunchReports = 0;
  await normal.page.route(`${BRIDGE}/call/calibrateLiveChallengeClock`, (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch { /* a preflight */ }
    if (body?.data?.launchReport && !body?.data?.quality) {
      blockedLaunchReports += 1;
      return route.abort('failed');
    }
    return route.continue();
  });
  // A slower Chromebook: six times less CPU for the whole game.
  const slowCpu = await slow.context.newCDPSession(slow.page);
  await slowCpu.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await Promise.all(bots.map((id) => botJoin(roomId, id)));
  for (const student of [normal, slow, frozen, offline]) check(S, await waitForText(student, 'You are in as', 20_000), `${student.studentId}: no lobby`);

  await primary(teacher, 'start').click();
  const r0 = await waitForRoom(roomId, (room) => room.status === 'running');
  const startsAtMs = ms(r0.startsAt);
  const at = (when, fn) => wait(when - Date.now()).then(fn);
  const freezer = await frozen.context.newCDPSession(frozen.page);
  let countdown = null;
  let late = null;
  try {
    await Promise.all([
      openStudent(countdownId, 'chromebook').then((handle) => { countdown = handle; }),
      at(startsAtMs - 1_500, () => freezer.send('Page.setWebLifecycleState', { state: 'frozen' })),
      at(startsAtMs + 2_000, () => freezer.send('Page.setWebLifecycleState', { state: 'active' })),
      at(startsAtMs - 400, () => offline.context.setOffline(true)),
      at(startsAtMs + 2_500, () => offline.context.setOffline(false)),
      at(startsAtMs + 1_500, () => openStudent(lateId, 'chromebook').then((handle) => { late = handle; })),
      ...bots.map((id, index) => at(startsAtMs + 200 + (index % 10) * 150, () => botAnswer(roomId, id, { correct: index % 4 !== 0, humanElapsedMs: 1_000 + index * 40 }))),
    ]);
    const screens = [normal, slow, frozen, offline, countdown, late];
    const roles = { [normalId]: 'diagnostics blocked', [slowId]: '6x CPU', [frozenId]: 'frozen through zero', [offlineId]: 'offline at zero', [countdownId]: 'opened during the countdown', [lateId]: 'opened after the start' };
    // What a screen shows, for a finding: the stage, the round's own clock and
    // countdown overlay, and whether its choices can be tapped.
    const screenState = (student) => student.page.evaluate(() => ({
      stage: document.querySelector('[data-mm-student-stage]')?.getAttribute('data-mm-student-stage') || null,
      timer: [...document.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label')).find((label) => /seconds/.test(label)) || null,
      overlay: document.querySelector('[data-mm-round-countdown]')?.getAttribute('data-mm-round-countdown') || null,
      choices: [...document.querySelectorAll('[data-mm-game] [role="radio"]')].map((node) => (node.disabled ? 'disabled' : 'enabled')),
      calibrations: (window.__mmBridgeCalls || []).filter((call) => call.name === 'calibrateLiveChallengeClock').map((call) => (call.ok ? 'ok' : call.error || 'pending')).slice(-6),
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
    })).catch((error) => ({ error: String(error) }));
    for (const student of screens) {
      check(S, await waitForStudentStage(student, 'roundActive', 20_000), `${student.studentId} (${roles[student.studentId]}) never reached round 1: ${JSON.stringify(await screenState(student))}`);
    }
    await shot(late, 'L01-late-listener-in-round');
    note(S, 'round 1 length (s)', (ms(r0.endsAt || r0.roundEndsAt) - startsAtMs) / 1000);
    // They all answer at once, as a class does, and each answer is in before
    // anything else happens. A screen on the round whose choices cannot be
    // tapped is a finding, never waited out.
    await Promise.all(screens.map(async (student, index) => {
      try {
        await answerInBrowser(student, roomId, { correct: index % 2 === 0 });
      } catch (error) {
        await shot(student, `L-fail-${student.studentId}`);
        finding(S, `${student.studentId} (${roles[student.studentId]}) could not answer on the round: ${String(error?.message || error).split('\n')[0]} — ${JSON.stringify(await screenState(student))}`);
        return;
      }
      try { await submissionSettled(student, { timeoutMs: 20_000 }); } catch (error) { finding(S, error.message); }
    }));
    check(S, await waitForRoom(roomId, (room) => room.roundState === 'closed', 25_000), 'the round did not close once all 40 answered');
    for (const student of screens) check(S, await waitForStudentStage(student, 'roundResults', 20_000), `${student.studentId} did not reach the results`);

    // What each screen reported, and what it cost.
    const keyOf = async (studentId) => (await privatePlayer(roomId, studentId)).playerKey;
    const diagnosticsOf = async (studentId) => (await roomRef(roomId).collection('diagnostics').doc(await keyOf(studentId)).get()).data() || {};
    for (const student of [slow, frozen, offline, countdown, late]) {
      const milestones = (await diagnosticsOf(student.studentId)).launchMilestones || {};
      for (const event of ['listener_attached', 'running_received', 'game_mounted']) check(S, milestones[event], `${student.studentId} did not report ${event}`);
    }
    const lateMilestones = (await diagnosticsOf(lateId)).launchMilestones || {};
    check(S, !lateMilestones.countdown_received, 'the late listener reported a countdown it never saw');
    const offlineMilestones = (await diagnosticsOf(offlineId)).launchMilestones || {};
    check(S, offlineMilestones.connection_lost && offlineMilestones.connection_restored, 'the student offline at zero did not report the loss and the return');
    check(S, blockedLaunchReports >= 1, 'the blocked screen never tried to send a launch batch, so nothing was proven');
    const launchOnly = (studentId) => bridgeCalls.filter((call) => call.name === 'calibrateLiveChallengeClock' && call.identity?.studentId === studentId && call.data?.launchReport && !call.data?.quality).length;
    const telemetry = Object.fromEntries(screens.map((student) => [student.studentId, launchOnly(student.studentId)]));
    note(S, 'launch-only diagnostic requests that reached the server, per screen', telemetry);
    note(S, 'launch-only diagnostic batches blocked on the normal screen', blockedLaunchReports);
    check(S, telemetry[slowId] <= 1 && telemetry[countdownId] <= 1, `an ordinary screen sent more than one launch-only diagnostic request: ${JSON.stringify(telemetry)}`);
    check(S, Object.values(telemetry).every((count) => count <= 3), `a disrupted screen sent more than three: ${JSON.stringify(telemetry)}`);
    const players = await publicPlayers(roomId);
    check(S, players.length === 40 && new Set(players.map((row) => row.id)).size === 40, `${players.length} public players for a class of 40`);
    check(S, players.every((row) => row.answeredRound === 0 && row.roundsAnswered === 1), 'not every player has exactly one answer for round 1');

    await teacher.page.getByRole('button', { name: 'End Game' }).click();
    await confirmDialog(teacher, 'End Game');
    await waitForRoom(roomId, (room) => room.status === 'finished', 30_000);
    for (const student of screens) check(S, await waitForStudentStage(student, 'completed', 20_000), `${student.studentId} did not reach the finished game`);
    consoleErrors(S, [teacher, ...screens]);
  } finally {
    // Whatever happened above, none of these pages (one CPU-throttled) may
    // keep running into the next scenario.
    await slowCpu.detach().catch(() => {});
    await freezer.detach().catch(() => {});
    await closeAll(teacher, normal, slow, frozen, offline, countdown, late);
  }
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
  for (const device of ['projector', 'zoom125', 'zoom150', 'zoom80', 'zoom67']) {
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
  // The same screens turned sideways, and a Chromebook at reduced zoom.
  for (const [student, device] of [[phone, 'phoneLandscape'], [tablet, 'tabletLandscape'], [tablet, 'zoom80'], [tablet, 'zoom67']]) {
    await student.page.setViewportSize(DEVICES[device].viewport);
    await wait(400);
    check(S, (await overflowX(student)) <= 0, `${device}: the results scroll sideways`);
    await shot(student, `E03-student-results-${device}`);
  }
  await phone.page.setViewportSize(DEVICES.smallPhone.viewport);
  await tablet.page.setViewportSize(DEVICES.ipad.viewport);
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await confirmDialog(teacher, 'End Game');
  await waitForRoom(roomId, (room) => room.status === 'finished', 30_000);
  check(S, await waitForArena(teacher, 'completed', 10_000), 'no podium');
  await shot(teacher, 'E04-projector-podium-32');
  // Under the podium only whole rows, and the note when anyone is left out —
  // at every projector size and zoom.
  for (const device of ['projector', 'zoom125', 'zoom150', 'zoom80', 'zoom67']) {
    await teacher.page.setViewportSize(DEVICES[device].viewport);
    await wait(600);
    const board = await teacher.page.evaluate(() => {
      const panel = document.querySelector('[data-mm-final-board]');
      const box = panel?.getBoundingClientRect();
      const rows = [...document.querySelectorAll('[aria-label="Final standings"] [data-mm-standing]')].map((row) => row.getBoundingClientRect());
      const inside = (rect) => Boolean(rect && box && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1 && rect.bottom <= window.innerHeight + 1);
      // The note sits under the rows, or — with no room under the podium —
      // in the podium's own heading.
      const noteNode = document.querySelector('[data-mm-final-more]');
      const noteRect = noteNode?.getBoundingClientRect() || null;
      const note = !noteNode ? null : noteNode.getAttribute('data-mm-final-more') === 'header'
        ? noteRect.top >= 0 && noteRect.bottom <= window.innerHeight + 1
        : inside(noteRect);
      return { rows: rows.length, whole: rows.filter(inside).length, note, where: noteNode?.getAttribute('data-mm-final-more') || null };
    });
    note(S, `final standings under the podium at ${device}`, board);
    check(S, board.whole === board.rows, `${device}: ${board.rows - board.whole} final standings row(s) cut off under the podium`);
    check(S, board.note === true, `${device}: "Everyone sees their own final place" is ${board.note === null ? 'missing' : 'cut off'}`);
    await shot(teacher, `E04-projector-podium-32-${device}`);
  }
  await teacher.page.setViewportSize(DEVICES.projector.viewport);
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

// G — ENDURANCE: FIVE WHOLE GAMES IN A ROW ON THE SAME SCREENS.
await run('endurance', async (S) => {
  const ids = studentsOf('p4');
  const teacher = await openTeacher('chromebook');
  const s1 = await openStudent(ids[0], 'chromebook');
  const s2 = await openStudent(ids[1], 'phone');
  const bots = ids.slice(2);
  const pages = [['teacher', teacher], ['s1', s1], ['s2', s2]];
  const samples = [];
  const sample = async (label) => {
    const row = { label };
    for (const [name, handle] of pages) row[name] = { ...(await metrics(handle)), watchers: await watchersOf(handle) };
    row.teacherCensus = await domCensus(teacher);
    row.teacherDetached = await detachedCensus(teacher);
    samples.push(row);
  };
  const games = [
    { label: 'game 1 · Standard', create: () => createClassic(teacher, { classKey: 'p4', rounds: 5, seconds: 20, passPlaces: 1 }) },
    { label: 'game 2 · Rush, Correct Count', create: () => createRush(teacher, { classKey: 'p4', rounds: 1, seconds: 30, scoring: 'correctCount', passPlaces: 1 }) },
    { label: 'game 3 · Rush, Grand Prix', create: () => createRush(teacher, { classKey: 'p4', rounds: 2, seconds: 30, scoring: 'grandPrix', passPlaces: 1 }) },
    { label: 'game 4 · Solver Race', create: () => createSolverRace(teacher, { classKey: 'p4', rounds: 5, seconds: 30, passPlaces: 1 }) },
    { label: 'game 5 · Rush again', create: () => createRush(teacher, { classKey: 'p4', rounds: 1, seconds: 30, scoring: 'grandPrix', passPlaces: 1 }) },
  ];
  const rooms = [];
  // SHELL_QA_ENDURANCE_GAMES=2 runs the first two, for a quick look.
  games.splice(Math.max(2, Number(process.env.SHELL_QA_ENDURANCE_GAMES) || games.length));
  for (const [index, game] of games.entries()) {
    if (index > 0) await teacher.page.getByRole('button', { name: 'New Challenge', exact: true }).click();
    const roomId = await game.create();
    rooms.push(roomId);
    for (const id of bots) await botJoin(roomId, id);
    for (const student of [s1, s2]) check(S, await waitForStudentStage(student, 'lobby', 20_000), `${game.label}: ${student.studentId} is not in the new lobby`);
    check(S, (await s1.page.locator('[data-mm-student-score]').count()) === 0, `${game.label}: the lobby shows a score from the last game`);
    if (index === 0) await sample('first lobby');
    await primary(teacher, 'start').click();
    let room = await waitForRoom(roomId, (value) => value.status === 'running');
    const rush = room.challengeMode === 'graphFeatureRush';
    const rounds = Number(room.roundCount) || 1;
    for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
      room = await waitForRoom(roomId, (value) => value.status === 'running' && Number(value.currentRound) === roundIndex && value.roundState !== 'closed', 20_000);
      if (!check(S, room, `${game.label}: round ${roundIndex + 1} never opened`)) break;
      await wait(Math.max(0, ms(room.startsAt) - Date.now()) + 300);
      if (rush) {
        const until = ms(room.endsAt || room.roundEndsAt) - 2_500;
        const solved = await Promise.all([solveRushUntil(s1, roomId, until), solveRushUntil(s2, roomId, until, { missEvery: 3 })]);
        note(S, `${game.label}: round ${roundIndex + 1} graphs solved in the browser (chromebook, phone)`, solved);
        check(S, solved[0] > 0 && solved[1] > 0, `${game.label}: a student could not solve a graph in round ${roundIndex + 1}`);
      } else {
        if (room.challengeMode === 'standard') {
          await answerInBrowser(s1, roomId, { correct: true });
          await answerInBrowser(s2, roomId, { correct: roundIndex % 2 === 0 });
        } else {
          await botAnswerAny(roomId, s1.studentId, { correct: true });
          await botAnswerAny(roomId, s2.studentId, { correct: roundIndex % 2 === 0 });
        }
        await Promise.all(bots.map((id, bot) => botAnswerAny(roomId, id, { correct: (bot + roundIndex) % 2 === 0 })));
      }
      await waitForRoom(roomId, (value) => value.roundState === 'closed' || value.status !== 'running', 60_000);
      for (const student of [s1, s2]) check(S, await waitForStudentStage(student, ['roundResults', 'completed'], 15_000), `${game.label}: ${student.studentId} has no results for round ${roundIndex + 1}`);
      if (index === 0 && roundIndex === 0) await sample('first round results');
      await primary(teacher, 'advance').click();
    }
    room = await waitForRoom(roomId, (value) => value.status === 'finished', 30_000);
    check(S, room, `${game.label}: the game did not finish`);
    for (const student of [s1, s2]) check(S, await waitForStudentStage(student, 'completed', 15_000), `${game.label}: ${student.studentId} has no final screen`);
    // The board every screen ranks from agrees with the stored result, ties included.
    let result = null;
    for (let tries = 0; tries < 30 && !result?.standings; tries += 1) { result = (await db.collection('liveChallengeMatchResults').doc(roomId).get()).data(); if (!result?.standings) await wait(300); }
    const board = challenge.publicLeaderboard((await publicPlayers(roomId)).filter((row) => row.joined), leaderboardOptionsFor(room?.scoringStrategyId));
    const stored = Object.fromEntries((result?.standings || []).filter((row) => row.playerKey).map((row) => [row.playerKey, row.rank]));
    check(S, board.length === ids.length && board.every((row) => stored[row.playerKey] === row.rank), `${game.label}: the board ${JSON.stringify(board.map((row) => [row.alias, row.rank]))} disagrees with the stored result ${JSON.stringify(result?.standings?.map((row) => [row.alias, row.rank]))}`);
    // Names on the teacher's console, on request; never a student id anywhere.
    const namesSwitch = teacher.page.locator('[data-mm-final-names]');
    if (check(S, await namesSwitch.waitFor({ timeout: 10_000 }).then(() => true, () => false), `${game.label}: the console offers no names for the final standings`)) {
      await namesSwitch.check();
      check(S, await waitForText(teacher, nameOf(ids[0]), 5_000), `${game.label}: the final standings do not name ${nameOf(ids[0])}`);
      await namesSwitch.uncheck();
    }
    for (const [name, handle] of pages) check(S, !(await textOf(handle)).includes(CLASSES.p4.classId), `${game.label}: ${name} shows a student id`);
    // Rewards: the Practice Pass for 1st reached exactly the winners, once.
    let grants = [];
    for (let tries = 0; tries < 30; tries += 1) {
      grants = (await db.collection('rewardGrants').where('source.id', '==', roomId).get()).docs.map((doc) => doc.data()).filter((grant) => grant.rewardCode === 'practicePass');
      if (grants.length) break;
      await wait(400);
    }
    const winners = (result?.standings || []).filter((row) => row.rank === 1 && row.roundsAnswered >= 1).map((row) => row.studentId).sort();
    check(S, JSON.stringify(grants.map((grant) => grant.studentId).sort()) === JSON.stringify(winners), `${game.label}: Practice Passes went to ${JSON.stringify(grants.map((grant) => grant.studentId))}, the winners were ${JSON.stringify(winners)}`);
    await wait(1_500);
    await sample(`after ${game.label}`);
    if (process.env.SHELL_QA_HEAP_SNAPSHOT) {
      // A heap snapshot of the console, for retainer paths (DevTools can open it).
      const session = await teacher.context.newCDPSession(teacher.page);
      const chunks = [];
      session.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) => chunks.push(chunk));
      await session.send('HeapProfiler.collectGarbage');
      // Tag every detached tree's root with an object of a findable class.
      const { result: prototype } = await session.send('Runtime.evaluate', { expression: 'Node.prototype' });
      const { objects } = await session.send('Runtime.queryObjects', { prototypeObjectId: prototype.objectId });
      await session.send('Runtime.callFunctionOn', {
        objectId: objects.objectId,
        functionDeclaration: `function () {
          class DetachedTreeTag {}
          for (const node of this) {
            let connected = true;
            try { connected = node.isConnected; } catch { continue; }
            if (connected) continue;
            let root = node;
            while (root.parentNode) root = root.parentNode;
            if (root.nodeType !== 9 && !root.__detachedTreeTag) root.__detachedTreeTag = new DetachedTreeTag();
          }
        }`,
      });
      await session.send('Runtime.releaseObject', { objectId: objects.objectId }).catch(() => {});
      await session.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
      writeFileSync(path.join(SHOTS, `teacher-after-game-${index + 1}.heapsnapshot`), chunks.join(''));
      await session.detach().catch(() => {});
    }
  }
  // Leaving the game: the student goes back to the dashboard.
  for (const student of [s1, s2]) await student.page.getByRole('button', { name: 'Back to Dashboard' }).last().click().catch(() => {});
  await wait(1_000);
  await sample('students left the final screen');
  const gamesDone = samples.filter((row) => row.label.startsWith('after game'));
  note(S, 'teacher console: what each game added to the DOM', gamesDone.slice(1).map((row, index) => ({ label: row.label, grew: censusGrowth(gamesDone[index].teacherCensus, row.teacherCensus) })));
  note(S, 'teacher console: DOM held after it left the page', gamesDone.map((row) => ({ label: row.label, ...row.teacherDetached })));
  samples.forEach((row) => { delete row.teacherCensus; delete row.teacherDetached; });
  note(S, 'page metrics and open Live Challenge listeners (after a forced GC)', samples);
  const after = samples.filter((row) => row.label.startsWith('after game'));
  for (const [name] of pages) {
    const open = after.map((row) => watcherTotal(row[name].watchers));
    check(S, open.every((count) => count === open[0]), `${name}: open listeners changed across games: ${JSON.stringify(open)}`);
    const [first, last] = [after[0][name], after[after.length - 1][name]];
    check(S, last.listeners <= first.listeners + 60, `${name}: event listeners grew from ${first.listeners} to ${last.listeners} over five games`);
    check(S, last.nodes <= first.nodes * 1.25 + 300, `${name}: DOM nodes grew from ${first.nodes} to ${last.nodes} over five games`);
    check(S, last.heapMb <= first.heapMb * 1.5 + 8, `${name}: the heap grew from ${first.heapMb} MB to ${last.heapMb} MB over five games`);
  }
  const left = samples[samples.length - 1];
  for (const name of ['s1', 's2']) check(S, watcherTotal(left[name].watchers) <= 1, `${name}: still listening after leaving the game: ${JSON.stringify(left[name].watchers)}`);
  check(S, new Set(rooms).size === games.length, 'a game reused a room');
  const stale = (await db.collection('liveChallengeRooms').where('teacherEmail', '==', TEACHER).get()).docs.filter((doc) => rooms.includes(doc.id) && !['finished', 'cancelled'].includes(doc.data().status));
  check(S, stale.length === 0, `games left open: ${stale.map((doc) => doc.id).join(', ')}`);
  consoleErrors(S, [teacher, s1, s2]);
  await closeAll(teacher, s1, s2);
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
  // The keyboard stays where the teacher puts it while the console updates
  // underneath (a student answers), and Tab never leaves the dialog.
  const dialog = teacher.page.getByRole('alertdialog');
  await dialog.waitFor({ timeout: 5_000 });
  const focused = () => teacher.page.evaluate(() => (document.activeElement?.textContent || '').trim());
  check(S, (await focused()) === 'Keep playing', `the dialog opened with focus on "${await focused()}"`);
  await teacher.page.keyboard.press('Tab');
  check(S, (await focused()) === 'End Round Now', `Tab moved focus to "${await focused()}"`);
  await botAnswer(roomId, ids[2], { correct: true }).catch(() => {});
  await wait(2_500);
  check(S, (await focused()) === 'End Round Now', `focus moved to "${await focused()}" while the console updated`);
  await teacher.page.keyboard.press('Tab');
  check(S, (await focused()) === 'Keep playing', `Tab left the dialog for "${await focused()}"`);
  await teacher.page.keyboard.press('Shift+Tab');
  check(S, (await focused()) === 'End Round Now', `Shift+Tab left the dialog for "${await focused()}"`);
  await teacher.page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 5_000 });
  await wait(600);
  check(S, (await roomOf(roomId)).roundState === 'open', '"Keep playing" (Escape) ended the round');
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
  scenarios: ONLY.length ? ONLY : ['classic', 'scoring', 'rush', 'reconnect', 'launch', 'big-class', 'repeat', 'endurance', 'adversarial'],
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
