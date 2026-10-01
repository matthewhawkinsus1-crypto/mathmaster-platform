// Play whole Graph Feature Rush games in real browsers, against the REAL server.
//
// HOW TO RUN (one command; it starts the emulator, the bridge and Vite):
//
//   node tests/browser/graphFeatureRushGame.mjs
//   RUSH_SHOTS=/some/dir node tests/browser/graphFeatureRushGame.mjs   # keep screenshots
//
// WHAT IS REAL. The student and teacher screens, the snapshot watchers, the
// Firestore emulator, and — unlike the other Live Challenge harnesses — every
// callable: each page posts its callables to a local bridge that runs the
// real handler under that page's identity (a teacher or a student auth
// context, as the integration tests build them), loaded from the
// deployed entry point (functions/platformEntry.js). So a tap is
// graded by the real transaction, a round closes through the real lifecycle,
// and every screen shows what the server actually wrote.
//
// HOW IT PLAYS. Black box: the driver reads which of a student's graphs is on
// screen (data-question-index), regenerates that graph from the room's private
// seed exactly as the server does, and taps where its features are DRAWN —
// with a mouse, a touchscreen or the keyboard — then reads the screen back.
//
// NOTHING TOUCHES PRODUCTION: firebase.js is swapped for an emulator module,
// the browsers block every non-local request, and the project id is throwaway.
// This is a QA tool, not part of the CI gate.

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
// The project the browsers' emulator module (emulator/firebaseEmulator.js) uses.
const PROJECT = 'mathmaster-game-harness';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8182';
const VITE_PORT = Number(process.env.RUSH_VITE_PORT || 5198);
const BRIDGE_PORT = Number(process.env.RUSH_BRIDGE_PORT || 5299);
const ORIGIN = `http://localhost:${VITE_PORT}`;
const BRIDGE = `http://localhost:${BRIDGE_PORT}`;
const SHOTS = process.env.RUSH_SHOTS || path.join(os.tmpdir(), 'graph-feature-rush-shots');
const ONLY = (process.env.RUSH_SCENARIOS || '').split(',').map((entry) => entry.trim()).filter(Boolean);
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

// Children run in their own process groups. The Firebase CLI starts the
// emulator's Java process in yet another group, so a kill would leave it
// holding its port: the CLI is asked to stop (SIGINT, which shuts its
// emulators down) and only then killed.
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
  await Promise.race([Promise.all(exited), wait(15_000)]);
  killAll();
};
process.on('exit', killAll);
process.on('SIGINT', () => { stopAll().finally(() => process.exit(130)); });

/* ------------------------------ the emulator ----------------------------- */

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

/* -------------------- the real server, behind a bridge -------------------- */

// The deployed entry point (functions/package.json "main"), so every callable
// a screen uses is served — some live in entry.js, not index.js.
const functionsIndex = require(path.join(repo, 'functions/platformEntry.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();
const { generateRushQuestion } = await import(path.join(repo, 'functions/shared/graphFeatureGenerator.mjs'));
const { unitX, unitY } = await import(path.join(repo, 'src/platform/liveChallenge/rushGraphModel.js'));
const { rushLockoutMs } = await import(path.join(repo, 'functions/shared/graphFeatureRushRules.mjs'));

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
  const started = Date.now();
  if (!handler?.run) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'not-found', message: `No callable ${name}` }));
    return;
  }
  try {
    const result = await handler.run({ auth: authFor(identity), data, rawRequest: { headers: {} } });
    bridgeCalls.push({ name, identity, ms: Date.now() - started, ok: true });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: result ?? null }));
  } catch (error) {
    bridgeCalls.push({ name, identity, ms: Date.now() - started, ok: false, code: error?.code });
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: error?.code || 'internal', message: error?.message || String(error), details: error?.details ?? null }));
  }
});
await new Promise((resolve) => bridge.listen(BRIDGE_PORT, resolve));

/* ------------------------------- the pages ------------------------------- */

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

/* -------------------------------- the class ------------------------------- */

const TEACHER = 'rush-qa-teacher@example.com';
const CLASSES = Object.freeze({
  pair: { classId: 'rush-qa-pair', name: 'Period 2 Algebra I', period: 'P2', course: 'algebra1', size: 2 },
  class: { classId: 'rush-qa-class', name: 'Period 5 Algebra II', period: 'P5', course: 'algebra2', size: 12 },
});
const studentsOf = (key) => Array.from({ length: CLASSES[key].size }, (_, index) => `${CLASSES[key].classId}-s${String(index + 1).padStart(2, '0')}`);

for (const entry of Object.values(CLASSES)) {
  await db.collection('classes').doc(entry.classId).set({ teacherOfRecord: TEACHER, status: 'active', course: entry.course, period: entry.period, name: entry.name });
}
for (const key of Object.keys(CLASSES)) {
  const batch = db.batch();
  studentsOf(key).forEach((studentId, index) => batch.set(db.collection('grades').doc(studentId), {
    assignedTeacherEmail: TEACHER, classId: CLASSES[key].classId, classPeriod: CLASSES[key].period, firstName: `Student${index + 1}`, lastName: key,
  }));
  await batch.commit();
}
const teacherProps = {
  email: TEACHER,
  classes: Object.values(CLASSES).map(({ classId, name, period, course }) => ({ classId, name, period, course, status: 'active' })),
  allStudents: Object.keys(CLASSES).flatMap((key) => studentsOf(key).map((id) => ({ id, studentId: id, classId: CLASSES[key].classId }))),
};

/* -------------------------------- browsers -------------------------------- */

const DEVICES = Object.freeze({
  chromebook: { viewport: { width: 1366, height: 768 } },
  desktop: { viewport: { width: 1920, height: 1080 } },
  ipad: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  ipadLandscape: { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
  phoneLandscape: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
  smallPhone: { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
});

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const findings = [];
const notes = [];
const finding = (scenario, problem) => { findings.push({ scenario, problem }); log(`  ✗ ${scenario}: ${problem}`); };
const check = (scenario, condition, problem) => { if (!condition) finding(scenario, problem); return Boolean(condition); };

const IGNORABLE_CONSOLE = /ERR_FAILED|net::|Failed to fetch|WebChannel|transport errored|Could not reach|math fonts could not be loaded|Download the React DevTools/i;

const openPage = async ({ device = 'chromebook', url, init = null, colorScheme = 'light', reducedMotion = 'no-preference' }) => {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme, reducedMotion });
  await context.route('**/*', (route) => {
    const target = route.request().url();
    if (/^(http|ws)s?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(target)) return route.continue();
    return route.abort();
  });
  if (init) await context.addInitScript(init.fn, init.arg);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error' && !IGNORABLE_CONSOLE.test(message.text())) errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error?.message || error}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { page, context, errors, device, touch: Boolean(DEVICES[device].hasTouch) };
};

const openStudent = async (studentId, device, options = {}) => {
  const handle = await openPage({ device, url: `${ORIGIN}/tests/browser/graphFeatureRushStudent.html?studentId=${encodeURIComponent(studentId)}&emulator=${EMULATOR}&bridge=${BRIDGE}`, ...options });
  return { ...handle, studentId };
};

const openTeacher = async (device = 'chromebook') => openPage({
  device,
  url: `${ORIGIN}/tests/browser/graphFeatureRushTeacher.html?as=teacher&email=${encodeURIComponent(TEACHER)}&emulator=${EMULATOR}&bridge=${BRIDGE}`,
  init: { fn: (props) => { window.__mmTeacherProps = props; }, arg: teacherProps },
});

const shot = async (handle, name) => {
  const file = path.join(SHOTS, `${name}.png`);
  // Animations finished: a shot taken mid-fade would show a graph greyed out.
  await handle.page.screenshot({ path: file, fullPage: false, animations: 'disabled' });
  return file;
};

const textOf = async (handle) => (await handle.page.locator('body').innerText()).replace(/\s+/g, ' ');

const waitForText = async (handle, needle, timeout = 15_000) => {
  try {
    // Case-insensitive: headings styled uppercase read back in capitals.
    await handle.page.waitForFunction((value) => document.body.innerText.replace(/\s+/g, ' ').toLowerCase().includes(value.toLowerCase()), needle, { timeout });
    return true;
  } catch {
    return false;
  }
};

/* ------------------------------ the server's view -------------------------- */

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const rushSecret = async (roomId) => (await db.collection('liveChallengePrivate').doc(roomId).get()).data()?.graphFeatureRush || null;
const privatePlayer = async (roomId, studentId) => (await db.collection('liveChallengePrivate').doc(roomId).collection('players').doc(studentId).get()).data() || {};
const publicPlayers = async (roomId) => (await roomRef(roomId).collection('players').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const activeRoomId = async () => (await db.collection('liveChallengeTeacherActive').doc(TEACHER).get()).data()?.roomId || null;

const questionOnScreen = async (student, roomId) => {
  const attribute = await student.page.locator('.mm-rush-graph-frame').getAttribute('data-question-index').catch(() => '');
  if (attribute === '' || attribute == null) return null;
  const index = Number(attribute);
  const secret = await rushSecret(roomId);
  const room = await roomOf(roomId);
  return generateRushQuestion({ seed: secret.seed, studentKey: student.studentId, roundIndex: room.currentRound, questionIndex: index, config: secret.config });
};

const graphPoint = async (student, view, point) => {
  const box = await student.page.locator('svg.mm-rush-graph').boundingBox();
  return { x: box.x + unitX(view, point.x) * box.width, y: box.y + unitY(view, point.y) * box.height };
};

const tapGraph = async (student, view, point) => {
  const at = await graphPoint(student, view, point);
  if (student.touch) await student.page.touchscreen.tap(at.x, at.y);
  else await student.page.mouse.click(at.x, at.y);
};

// A corner, where generated graphs never put a target.
const cornerOf = (view) => ({ x: view.xMin + 0.02 * (view.xMax - view.xMin), y: view.yMax - 0.02 * (view.yMax - view.yMin) });

const foundCount = (student) => student.page.locator('.mm-rush-found').count();
const doneCount = async (student) => Number((await student.page.locator('.mm-rush-done').innerText()).replace(/\D+/g, '')) || 0;

const waitForQuestionChange = async (student, from, timeout = 4_000) => {
  try {
    await student.page.waitForFunction((value) => {
      const frame = document.querySelector('.mm-rush-graph-frame');
      return frame && frame.getAttribute('data-question-index') !== String(value);
    }, from, { timeout });
    return true;
  } catch {
    return false;
  }
};

const waitForPlay = async (student, timeout = 20_000) => {
  try {
    await student.page.waitForFunction(() => {
      const frame = document.querySelector('.mm-rush-graph-frame');
      return frame && frame.getAttribute('data-question-index') !== '' && document.querySelector('svg.mm-rush-graph');
    }, null, { timeout });
    return true;
  } catch {
    return false;
  }
};

/**
 * Solve the graph on screen: optional wrong taps first, then every target (or
 * "Does Not Exist"). Returns what was on screen.
 */
const solveOne = async (student, roomId, { misses = 0, scenario }) => {
  const question = await questionOnScreen(student, roomId);
  if (!question) return null;
  for (let miss = 0; miss < misses; miss += 1) {
    await tapGraph(student, question.view, cornerOf(question.view));
    await wait(80);
    // A second miss in a row starts a short cooldown; let it pass.
    if (rushLockoutMs(miss + 1) > 0) await wait(rushLockoutMs(miss + 1) + 50);
  }
  if (!question.targets.length) {
    await student.page.getByRole('button', { name: 'Does Not Exist' }).click();
  } else {
    for (const target of question.targets) {
      await tapGraph(student, question.view, target);
      await wait(90);
    }
  }
  const moved = await waitForQuestionChange(student, question.questionIndex);
  if (scenario) check(scenario, moved, `${student.studentId}: graph ${question.questionIndex} (${question.feature}, ${question.family}) did not complete after its answer`);
  return question;
};

/* -------------------------------- teacher UI ------------------------------- */

const selectInLabel = async (handle, labelStart, value) => {
  const select = handle.page.locator('label').filter({ hasText: new RegExp(`^${labelStart}`) }).locator('select').first();
  await select.selectOption(String(value));
};

const createRush = async (teacher, { classKey, preset = null, rounds = 3, seconds = 30, scoring = 'grandPrix', passPlaces = 0 }) => {
  await teacher.page.waitForSelector('text=Create a challenge', { timeout: 20_000 });
  await selectInLabel(teacher, 'Class', CLASSES[classKey].classId);
  await selectInLabel(teacher, 'Game type', 'graphFeatureRush');
  await teacher.page.waitForSelector('text=Start from a preset', { timeout: 15_000 });
  if (preset) await teacher.page.getByRole('button', { name: preset, exact: true }).click();
  await selectInLabel(teacher, 'Rounds', rounds);
  await selectInLabel(teacher, 'Time per round', seconds);
  await selectInLabel(teacher, 'Scoring', scoring);
  // The shared Rewards choice, as on every Live Challenge.
  await teacher.page.getByLabel('Practice Pass for').selectOption(String(passPlaces));
  await teacher.page.getByRole('button', { name: 'Create Lobby' }).click();
  try {
    await teacher.page.waitForSelector('text=Players in lobby', { timeout: 20_000 });
  } catch {
    await shot(teacher, `create-failed-${Date.now()}`);
    const alert = await teacher.page.locator('[role="alert"]').allInnerTexts().catch(() => []);
    throw new Error(`no lobby after Create Lobby. Alerts: ${JSON.stringify(alert)}. Calls: ${JSON.stringify(bridgeCalls.slice(-5))}`);
  }
  return activeRoomId();
};

const startGame = async (teacher) => {
  await teacher.page.getByRole('button', { name: 'Start Challenge' }).click();
};

const waitForRoundClosed = async (roomId, roundIndex, timeout = 60_000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const room = await roomOf(roomId);
    if (room.status !== 'running' || (Number(room.currentRound) === roundIndex && room.roundState === 'closed')) return room;
    await wait(400);
  }
  return null;
};

const waitForRoundOpen = async (roomId, roundIndex, timeout = 20_000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const room = await roomOf(roomId);
    if (room.status === 'running' && Number(room.currentRound) === roundIndex && room.roundState !== 'closed') return room;
    await wait(250);
  }
  return null;
};

const playUntil = async (student, roomId, endsAtMs, { scenario, missEvery = 0, stopBeforeEndMs = 1_500 }) => {
  let solved = 0;
  while (Date.now() < endsAtMs - stopBeforeEndMs) {
    const misses = missEvery && solved % missEvery === missEvery - 1 ? 1 : 0;
    // eslint-disable-next-line no-await-in-loop
    const question = await solveOne(student, roomId, { misses, scenario });
    if (!question) break;
    solved += 1;
  }
  return solved;
};

const endsAtOf = (room) => (room.roundEndsAt?.toMillis?.() || room.endsAt?.toMillis?.() || 0);

const ordinal = (place) => {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${({ 1: 'st', 2: 'nd', 3: 'rd' })[place % 10] || 'th'}`;
};
// "1st of 10 this round" / "T-2nd of 10 this round", from the round's own result.
const roundPlaceText = async (roomId, roundIndex, playerKey) => {
  const summary = (await roomRef(roomId).collection('rounds').doc(String(roundIndex)).get()).data() || {};
  const row = (summary.standings || []).find((entry) => entry.playerKey === playerKey) || {};
  return `${row.tied ? 'T-' : ''}${ordinal(Number(row.rank) || 0)} of ${summary.fieldSize} this round`;
};

const run = async (name, scenario) => {
  if (ONLY.length && !ONLY.includes(name)) return;
  log(`▶ ${name}`);
  const before = findings.length;
  try {
    await scenario();
  } catch (error) {
    finding(name, `threw: ${error?.stack || error}`);
  }
  log(`${findings.length === before ? '✓' : '✗'} ${name}`);
};

/* ------------------------------- scenarios -------------------------------- */

// TWO PLAYERS, GRAND PRIX, THREE ROUNDS: mouse vs touch, misses, the cooldown,
// fast repeated taps, a refresh mid-round, the network dropping, a teacher
// refresh, last-second taps, round results and the final standings.
await run('two-player-grand-prix', async () => {
  const S = 'two-player-grand-prix';
  const [idA, idB] = studentsOf('pair');
  const teacher = await openTeacher('chromebook');
  const a = await openStudent(idA, 'chromebook');
  const b = await openStudent(idB, 'phone');
  const roomId = await createRush(teacher, { classKey: 'pair', preset: 'Quick Algebra I', rounds: 3, seconds: 30, scoring: 'grandPrix', passPlaces: 1 });
  check(S, roomId, 'no room was created');
  for (const student of [a, b]) check(S, await waitForText(student, 'You are in as'), `${student.studentId} never reached the lobby`);
  await shot(a, 'gp-lobby-chromebook');
  await shot(b, 'gp-lobby-phone');
  const lobbyRoom = await roomOf(roomId);
  check(S, lobbyRoom.challengeMode === 'graphFeatureRush' && lobbyRoom.scoringStrategyId === 'grandPrix', `room settings: ${lobbyRoom.challengeMode}/${lobbyRoom.scoringStrategyId}`);
  check(S, (await teacher.page.locator('text=Round closing threshold').count()) === 0, 'the teacher console offers a closing threshold a rush does not have');

  // ROUND 1 ----------------------------------------------------------------
  await startGame(teacher);
  let room = await waitForRoundOpen(roomId, 0);
  check(S, room, 'round 1 never opened');
  for (const student of [a, b]) check(S, await waitForPlay(student), `${student.studentId}: no graph in round 1`);
  await shot(a, 'gp-r1-start-chromebook');
  await shot(b, 'gp-r1-start-phone');

  // Hit, miss, miss (cooldown), then fast repeated taps on a found target.
  const first = await questionOnScreen(a, roomId);
  check(S, first, 'A: no question on screen');
  if (first?.targets.length > 1) {
    await tapGraph(a, first.view, first.targets[0]);
    await wait(150);
    check(S, (await foundCount(a)) === 1, 'A: a hit did not draw a found mark');
    check(S, /Found \(/.test(await textOf(a)), 'A: no "Found (x, y)" feedback');
    for (let index = 0; index < 5; index += 1) await tapGraph(a, first.view, first.targets[0]);
    await wait(150);
    check(S, (await foundCount(a)) === 1, 'A: tapping a found target again drew a second mark');
  }
  await tapGraph(a, first.view, cornerOf(first.view));
  await wait(120);
  check(S, /try again/i.test(await textOf(a)), 'A: a miss did not say "try again"');
  await tapGraph(a, first.view, cornerOf(first.view));
  await wait(120);
  check(S, (await a.page.locator('.mm-rush-cooldown').count()) === 1, 'A: two misses in a row did not start the cooldown');
  check(S, await a.page.getByRole('button', { name: 'Does Not Exist' }).isDisabled(), 'A: "Does Not Exist" was not paused during the cooldown');
  await shot(a, 'gp-r1-cooldown-chromebook');
  await wait(900);
  const afterCooldown = await questionOnScreen(a, roomId);
  for (const target of afterCooldown.targets) { await tapGraph(a, afterCooldown.view, target); await wait(90); }
  if (!afterCooldown.targets.length) await a.page.getByRole('button', { name: 'Does Not Exist' }).click();
  check(S, await waitForQuestionChange(a, afterCooldown.questionIndex), 'A: the first graph did not complete');

  // Keyboard play on the Chromebook: arrows to the target, Enter.
  const keyed = await questionOnScreen(a, roomId);
  if (keyed?.targets.length) {
    await a.page.locator('svg.mm-rush-graph').focus();
    for (const target of keyed.targets) {
      await a.page.keyboard.press('Home');
      const stepsX = Math.round(target.x / 0.5);
      const stepsY = Math.round(target.y / 0.5);
      for (let step = 0; step < Math.abs(stepsX); step += 1) await a.page.keyboard.press(stepsX > 0 ? 'ArrowRight' : 'ArrowLeft');
      for (let step = 0; step < Math.abs(stepsY); step += 1) await a.page.keyboard.press(stepsY > 0 ? 'ArrowUp' : 'ArrowDown');
      await a.page.keyboard.press('Enter');
      await wait(80);
    }
    check(S, await waitForQuestionChange(a, keyed.questionIndex), 'A: keyboard play did not complete a graph');
    await a.page.keyboard.press('ArrowRight');
    const spoken = await a.page.evaluate(() => ({
      active: `${document.activeElement?.tagName}.${document.activeElement?.getAttribute('class') || ''}`,
      regions: [...document.querySelectorAll('.mm-rush-visually-hidden')].map((node) => node.textContent),
    }));
    check(S, spoken.regions.some((text) => /Pointer at \(/.test(text)), `A: the keyboard cursor is not announced (${JSON.stringify(spoken)})`);
  } else if (keyed) {
    await a.page.getByRole('button', { name: 'Does Not Exist' }).click();
  }

  // B plays by touch, with a miss now and then.
  const endsAt = endsAtOf(room);
  const projector = { ...teacher };
  await Promise.all([
    playUntil(a, roomId, endsAt, { scenario: S }),
    playUntil(b, roomId, endsAt, { scenario: S, missEvery: 3 }),
    (async () => {
      await wait(4_000);
      await teacher.page.getByRole('button', { name: 'Projector View' }).click();
      await wait(1_200);
      await shot(projector, 'gp-r1-projector-race');
      check(S, (await teacher.page.locator('svg.mm-rush-graph').count()) === 0, 'the projector drew a student graph');
      check(S, !/\(−?\d+(\.\d+)?, −?\d+(\.\d+)?\)/.test(await textOf(teacher)), 'the projector shows coordinates');
      check(S, (await teacher.page.locator('text=Round closing threshold').count()) === 0, 'the projector offers a closing threshold');
      await shot(b, 'gp-r1-playing-phone');
      await shot(a, 'gp-r1-playing-chromebook');
    })(),
  ]);
  // The buzzer, then the host's automatic close.
  check(S, await waitForText(a, 'Time!', 6_000), 'A: no "Time!" at zero');
  room = await waitForRoundClosed(roomId, 0, 15_000);
  check(S, room?.roundState === 'closed', 'round 1 was not closed automatically after the deadline');
  for (const student of [a, b]) {
    check(S, await waitForText(student, 'Round 1 results', 10_000), `${student.studentId}: no round results screen`);
  }
  await shot(a, 'gp-r1-results-chromebook');
  await shot(b, 'gp-r1-results-phone');
  await shot(teacher, 'gp-r1-results-projector');
  // What the screens say matches what the server recorded.
  for (const student of [a, b]) {
    const record = await privatePlayer(roomId, student.studentId);
    const facts = (await publicPlayers(roomId)).find((row) => row.playerKey === record.playerKey)?.lastRound;
    check(S, facts && facts.roundIndex === 0, `${student.studentId}: no lastRound facts`);
    check(S, facts && await waitForText(student, `${facts.completed} graph`, 5_000), `${student.studentId}: results show a different graph count than the server's ${facts?.completed}`);
    check(S, facts && await waitForText(student, `+${facts.matchPointsAwarded} championship points`, 5_000), `${student.studentId}: results do not show +${facts?.matchPointsAwarded} championship points`);
  }

  // ROUND 2: a refresh mid-round, the network dropping, the teacher refreshing.
  await teacher.page.getByRole('button', { name: 'Next Round' }).click();
  room = await waitForRoundOpen(roomId, 1);
  check(S, room, 'round 2 never opened');
  for (const student of [a, b]) check(S, await waitForPlay(student), `${student.studentId}: no graph in round 2`);
  await solveOne(b, roomId, { scenario: S });
  const partial = await questionOnScreen(b, roomId);
  if (partial?.targets.length > 1) {
    await tapGraph(b, partial.view, partial.targets[0]);
    await wait(1_600); // the coalesced send goes out
  }
  const beforeRefresh = { index: partial?.questionIndex, found: await foundCount(b), done: await doneCount(b) };
  const clockBefore = await b.page.locator('.mm-rush-clock').innerText();
  await b.page.reload({ waitUntil: 'domcontentloaded' });
  check(S, await waitForPlay(b), 'B: no graph after a refresh');
  const afterRefresh = { index: Number(await b.page.locator('.mm-rush-graph-frame').getAttribute('data-question-index')), found: await foundCount(b), done: await doneCount(b) };
  check(S, afterRefresh.index === beforeRefresh.index, `B: refresh moved the graph from ${beforeRefresh.index} to ${afterRefresh.index}`);
  check(S, afterRefresh.found === beforeRefresh.found, `B: refresh changed found marks ${beforeRefresh.found} → ${afterRefresh.found}`);
  check(S, afterRefresh.done === beforeRefresh.done, `B: refresh changed the completed count ${beforeRefresh.done} → ${afterRefresh.done}`);
  const clockAfter = await b.page.locator('.mm-rush-clock').innerText();
  notes.push({ scenario: S, refreshClock: { before: clockBefore, after: clockAfter } });
  await shot(b, 'gp-r2-after-refresh-phone');

  // A goes offline: taps still answer at once and queue up; back online they land.
  await a.page.evaluate(() => { window.__mmBridgeOffline = true; });
  const offlineGraphs = [];
  for (let index = 0; index < 2; index += 1) offlineGraphs.push(await solveOne(a, roomId, { scenario: S }));
  await wait(1_800);
  check(S, /Reconnecting/.test(await textOf(a)), 'A: offline taps did not show "Reconnecting…"');
  await shot(a, 'gp-r2-offline-chromebook');
  const offlineDone = await doneCount(a);
  await a.page.evaluate(() => { window.__mmBridgeOffline = false; window.dispatchEvent(new Event('online')); });
  await wait(2_500);
  const recordA = await privatePlayer(roomId, idA);
  const roundTwoCompletions = Object.values(recordA.submissionReceipts || {}).filter((receipt) => receipt.roundIndex === 1 && receipt.completesQuestion).length;
  check(S, roundTwoCompletions === offlineDone, `A: after reconnecting the server has ${roundTwoCompletions} round-2 completions, the screen ${offlineDone}`);
  check(S, !/Reconnecting/.test(await textOf(a)), 'A: still "Reconnecting…" after the queue landed');

  // The teacher refreshes; the round still closes on time.
  await teacher.page.reload({ waitUntil: 'domcontentloaded' });
  const endsAt2 = endsAtOf(room);
  await Promise.all([
    playUntil(a, roomId, endsAt2, { scenario: S, missEvery: 4 }),
    playUntil(b, roomId, endsAt2, { scenario: S }),
  ]);
  room = await waitForRoundClosed(roomId, 1, 15_000);
  check(S, room?.roundState === 'closed', 'round 2 did not close after a teacher refresh');
  await teacher.page.getByRole('button', { name: /Resume Session|Projector View/ }).first().click().catch(() => {});

  // ROUND 3: last-second taps on a slow connection still count (arrival grace).
  await teacher.page.getByRole('button', { name: 'Next Round' }).click();
  room = await waitForRoundOpen(roomId, 2);
  check(S, room, 'round 3 never opened');
  for (const student of [a, b]) check(S, await waitForPlay(student), `${student.studentId}: no graph in round 3`);
  const endsAt3 = endsAtOf(room);
  await Promise.all([
    playUntil(a, roomId, endsAt3, { scenario: S, stopBeforeEndMs: 3_500 }),
    playUntil(b, roomId, endsAt3, { scenario: S, stopBeforeEndMs: 3_500 }),
  ]);
  await b.page.evaluate(() => { window.__mmBridgeDelayMs = 250; });
  while (Date.now() < endsAt3 - 1_200) await wait(100);
  const late = await questionOnScreen(b, roomId);
  if (late) {
    for (const target of late.targets) await tapGraph(b, late.view, target);
    if (!late.targets.length) await b.page.getByRole('button', { name: 'Does Not Exist' }).click();
  }
  const lateShown = await doneCount(b);
  room = await waitForRoundClosed(roomId, 2, 15_000);
  const recordB = await privatePlayer(roomId, idB);
  const lastRoundCompletions = Object.values(recordB.submissionReceipts || {}).filter((receipt) => receipt.roundIndex === 2 && receipt.completesQuestion).length;
  check(S, lastRoundCompletions === lateShown, `B: the server kept ${lastRoundCompletions} round-3 completions, the screen showed ${lateShown} at the buzzer`);
  await b.page.evaluate(() => { window.__mmBridgeDelayMs = 0; });

  // FINISH.
  await teacher.page.getByRole('button', { name: 'Finish & Show Final Standings' }).click();
  const until = Date.now() + 20_000;
  while (Date.now() < until && (await roomOf(roomId)).status !== 'finished') await wait(400);
  check(S, (await roomOf(roomId)).status === 'finished', 'the game did not finish');
  for (const student of [a, b]) check(S, await waitForText(student, 'Challenge complete', 15_000), `${student.studentId}: no final standings`);
  check(S, /championship points · \d+ graphs/.test(await textOf(a)), 'A: the final summary does not read in championship points and graphs');
  // Rewards through the shared Rewards choice: 1st place holds a Practice Pass.
  const standings = (await db.collection('liveChallengeMatchResults').doc(roomId).get()).data()?.standings || [];
  const firsts = standings.filter((row) => row.rank === 1).map((row) => row.studentId).sort();
  let passes = [];
  for (let tries = 0; tries < 30; tries += 1) {
    passes = (await db.collection('rewardGrants').where('source.id', '==', roomId).get()).docs
      .map((doc) => doc.data()).filter((grant) => grant.rewardCode === 'practicePass');
    if (passes.length >= firsts.length) break;
    await wait(500);
  }
  check(S, firsts.length >= 1 && JSON.stringify(passes.map((grant) => grant.studentId).sort()) === JSON.stringify(firsts), `Practice Passes went to ${JSON.stringify(passes.map((grant) => grant.studentId))}, 1st place was ${JSON.stringify(firsts)}`);
  await shot(a, 'gp-final-chromebook');
  await shot(b, 'gp-final-phone');
  await shot(teacher, 'gp-final-projector');
  await teacher.page.getByRole('button', { name: 'Exit Projector View' }).click().catch(() => {});
  check(S, await waitForText(teacher, 'By feature, hardest first', 20_000), 'the teacher report has no feature breakdown');
  await shot(teacher, 'gp-final-teacher-report');
  for (const handle of [teacher, a, b]) check(S, handle.errors.length === 0, `console errors on ${handle.device}: ${handle.errors.slice(0, 3).join(' | ')}`);
  await Promise.all([teacher, a, b].map((handle) => handle.context.close()));
});

// CORRECT COUNT, ONE ROUND, FOUR DEVICES, AND THE SAME CLASS'S NEXT GAME.
await run('correct-count-devices', async () => {
  const S = 'correct-count-devices';
  const ids = studentsOf('class').slice(0, 4);
  const teacher = await openTeacher('desktop');
  const students = await Promise.all([
    openStudent(ids[0], 'ipad'),
    openStudent(ids[1], 'phoneLandscape'),
    openStudent(ids[2], 'smallPhone', { colorScheme: 'dark' }),
    openStudent(ids[3], 'ipadLandscape', { reducedMotion: 'reduce' }),
  ]);
  const roomId = await createRush(teacher, { classKey: 'class', preset: 'Algebra II Mixed', rounds: 1, seconds: 30, scoring: 'correctCount' });
  for (const student of students) check(S, await waitForText(student, 'You are in as'), `${student.studentId}: no lobby`);
  await startGame(teacher);
  const room = await waitForRoundOpen(roomId, 0);
  for (const student of students) check(S, await waitForPlay(student), `${student.studentId}: no graph`);
  // Layout: the graph is square, on screen, and the controls are inside the viewport.
  for (const student of students) {
    const layout = await student.page.evaluate(() => {
      const svg = document.querySelector('svg.mm-rush-graph')?.getBoundingClientRect();
      const dne = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Does Not Exist'))?.getBoundingClientRect();
      const skip = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Skip')?.getBoundingClientRect();
      return { svg, dne, skip, width: window.innerWidth, height: window.innerHeight, scrollable: document.documentElement.scrollHeight > window.innerHeight + 2 };
    });
    const inside = (rect) => rect && rect.left >= 0 && rect.top >= 0 && rect.right <= layout.width + 0.5 && rect.bottom <= layout.height + 0.5;
    check(S, layout.svg && Math.abs(layout.svg.width - layout.svg.height) < 1, `${student.device}: the graph is not square`);
    check(S, inside(layout.svg), `${student.device}: the graph runs off screen`);
    check(S, inside(layout.dne) && inside(layout.skip), `${student.device}: a button is off screen`);
    check(S, layout.dne && layout.dne.height >= 44, `${student.device}: "Does Not Exist" is shorter than a 44px tap target`);
    check(S, layout.svg && layout.svg.width >= Math.min(layout.width, layout.height) * 0.5, `${student.device}: the graph is too small (${Math.round(layout.svg?.width)}px)`);
    notes.push({ scenario: S, device: student.device, graphPx: Math.round(layout.svg?.width || 0), viewport: `${layout.width}x${layout.height}` });
    await shot(student, `cc-playing-${student.device}`);
  }
  const endsAt = endsAtOf(room);
  await Promise.all(students.map((student, index) => playUntil(student, roomId, endsAt, { scenario: S, missEvery: index + 2 })));
  await waitForRoundClosed(roomId, 0, 15_000);
  for (const student of students) {
    check(S, await waitForText(student, 'Round 1 results', 10_000), `${student.studentId}: no results`);
    const record = await privatePlayer(roomId, student.studentId);
    // The standings line: their match total, in the room's own unit.
    const total = `${record.correctCount} ${record.correctCount === 1 ? 'graph' : 'graphs'} completed`;
    check(S, await waitForText(student, `Overall: `, 5_000) && await waitForText(student, total, 5_000), `${student.studentId}: results do not show the match total "${total}"`);
    await shot(student, `cc-results-${student.device}`);
  }
  await teacher.page.getByRole('button', { name: 'Finish & Show Final Standings' }).click();
  const until = Date.now() + 20_000;
  while (Date.now() < until && (await roomOf(roomId)).status !== 'finished') await wait(400);
  for (const student of students) check(S, await waitForText(student, 'graphs completed', 15_000), `${student.studentId}: final summary is not in graphs`);

  // The class's next game: a new lobby reaches every open screen.
  // Back to setup with this game's settings (Play Again would replay the same preset).
  await teacher.page.getByRole('button', { name: 'New Challenge', exact: true }).click();
  const nextRoom = await createRush(teacher, { classKey: 'class', preset: 'Intercept Sprint', rounds: 1, seconds: 30, scoring: 'correctCount' });
  check(S, nextRoom && nextRoom !== roomId, 'no new room');
  for (const student of students) check(S, await waitForText(student, 'You are in as', 15_000), `${student.studentId}: the next game's lobby never appeared`);
  check(S, !(await textOf(students[0])).includes('Challenge complete'), 'the previous game\'s final screen carried into the next lobby');
  // Students are in, so cancelling asks first.
  await teacher.page.getByRole('button', { name: 'Cancel Session' }).first().click();
  await teacher.page.getByRole('alertdialog').getByRole('button', { name: 'Cancel Session' }).click();
  for (const handle of [teacher, ...students]) check(S, handle.errors.length === 0, `console errors on ${handle.device}: ${handle.errors.slice(0, 3).join(' | ')}`);
  await Promise.all([teacher, ...students].map((handle) => handle.context.close()));
});

// A CLASS OF TWELVE TAPPING AT ONCE, GRAND PRIX: the field curve, and every
// screen agreeing with the server.
await run('class-of-twelve', async () => {
  const S = 'class-of-twelve';
  const ids = studentsOf('class');
  const teacher = await openTeacher('chromebook');
  const students = await Promise.all(ids.map((id, index) => openStudent(id, index % 2 ? 'phone' : 'chromebook')));
  const roomId = await createRush(teacher, { classKey: 'class', preset: 'Algebra II Mixed', rounds: 1, seconds: 30, scoring: 'grandPrix' });
  for (const student of students) check(S, await waitForText(student, 'You are in as', 20_000), `${student.studentId}: no lobby`);
  await startGame(teacher);
  const room = await waitForRoundOpen(roomId, 0);
  for (const student of students) check(S, await waitForPlay(student, 30_000), `${student.studentId}: no graph`);
  const endsAt = endsAtOf(room);
  // Two never tap: they joined but did not play.
  await Promise.all(students.slice(0, 10).map((student, index) => playUntil(student, roomId, endsAt, { scenario: S, missEvery: (index % 4) + 2 })));
  const closed = await waitForRoundClosed(roomId, 0, 20_000);
  check(S, closed?.roundState === 'closed', 'the round did not close');
  const rows = await publicPlayers(roomId);
  const ranked = rows.filter((row) => row.lastRound?.participated).sort((left, right) => left.lastRound.rank - right.lastRound.rank);
  check(S, ranked.length === 10, `${ranked.length} ranked players, expected 10`);
  check(S, ranked[0]?.lastRound.matchPointsAwarded === 12, `1st earned ${ranked[0]?.lastRound.matchPointsAwarded}, expected 12`);
  check(S, rows.filter((row) => row.lastRound && !row.lastRound.participated).every((row) => row.lastRound.matchPointsAwarded === 0), 'a player who never tapped earned points');
  // Every student's results card says what the server recorded for them:
  // their graphs, their place in the field and their points — or, for the
  // two who never tapped, no points.
  for (const student of students) {
    const record = await privatePlayer(roomId, student.studentId);
    const facts = rows.find((row) => row.playerKey === record.playerKey)?.lastRound;
    check(S, facts?.roundIndex === 0, `${student.studentId}: no lastRound facts`);
    if (!facts) continue;
    const graphs = `${facts.completed} ${facts.completed === 1 ? 'graph' : 'graphs'} completed`;
    check(S, await waitForText(student, graphs, 10_000), `${student.studentId}: results do not show the server's "${graphs}"`);
    if (facts.participated) {
      // Their place in the round, as the round's own result says it (a shared
      // place reads "T-2nd").
      const place = await roundPlaceText(roomId, 0, record.playerKey);
      check(S, await waitForText(student, place, 5_000), `${student.studentId}: results do not show "${place}"`);
      check(S, await waitForText(student, `+${facts.matchPointsAwarded} championship points`, 5_000), `${student.studentId}: results do not show +${facts.matchPointsAwarded} championship points`);
    } else {
      check(S, await waitForText(student, 'No championship points this round', 5_000), `${student.studentId}: a student who never tapped is not told they earned no points`);
    }
    notes.push({ scenario: S, student: student.studentId, completed: facts.completed, rank: facts.rank ?? null, points: facts.matchPointsAwarded });
  }
  await shot(students[0], 'class12-results-chromebook');
  await shot(teacher, 'class12-results-teacher');
  await teacher.page.getByRole('button', { name: 'Finish & Show Final Standings' }).click();
  for (const handle of [teacher, ...students]) check(S, handle.errors.length === 0, `console errors on ${handle.device}: ${handle.errors.slice(0, 3).join(' | ')}`);
  await Promise.all([teacher, ...students].map((handle) => handle.context.close()));
});

// THE TEACHER'S PRACTICE: the student's screen, graded locally, nothing written.
await run('teacher-practice', async () => {
  const S = 'teacher-practice';
  const teacher = await openTeacher('chromebook');
  await teacher.page.waitForSelector('text=Create a challenge', { timeout: 20_000 });
  await selectInLabel(teacher, 'Class', CLASSES.pair.classId);
  await selectInLabel(teacher, 'Game type', 'graphFeatureRush');
  await teacher.page.waitForSelector('text=Start from a preset', { timeout: 15_000 });
  // An impossible combination is explained before anything is created.
  await teacher.page.locator('label').filter({ hasText: /^Quadratic/ }).locator('input').uncheck();
  await teacher.page.locator('label').filter({ hasText: /^Absolute value/ }).locator('input').uncheck();
  await teacher.page.locator('label').filter({ hasText: /^vertex/ }).locator('input').check();
  check(S, await waitForText(teacher, 'Vertex questions', 3_000), 'no explanation for vertex without parabolas');
  check(S, await teacher.page.getByRole('button', { name: 'Create Lobby' }).isDisabled(), 'Create Lobby is enabled for an impossible game');
  await shot(teacher, 'practice-setup-problem');
  await teacher.page.getByRole('button', { name: 'Quick Algebra I', exact: true }).click();
  await teacher.page.getByRole('button', { name: 'Try it yourself first' }).click();
  const practiceRooms = (await db.collection('liveChallengeRooms').get()).size;
  check(S, await waitForPlay({ ...teacher }, 20_000), 'the practice round never showed a graph');
  const practice = { ...teacher, studentId: 'preview' };
  // Solve one graph using the practice's own question (read from the screen's data).
  await shot(teacher, 'practice-playing');
  check(S, (await db.collection('liveChallengeRooms').get()).size === practiceRooms, 'practice created a room');
  await practice.page.getByRole('button', { name: 'Close practice' }).click();
  check(S, await waitForText(teacher, 'Create a challenge', 5_000), 'closing practice did not return to setup');
  check(S, teacher.errors.length === 0, `console errors: ${teacher.errors.slice(0, 3).join(' | ')}`);
  await teacher.context.close();
});

// INSTANT FEEDBACK, MEASURED: from the pointerdown to the frame after the
// found or miss mark appears, on a Chromebook profile with the CPU slowed 4×.
await run('tap-latency', async () => {
  const S = 'tap-latency';
  const [id] = studentsOf('pair');
  const teacher = await openTeacher('chromebook');
  const student = await openStudent(id, 'chromebook');
  const cdp = await student.context.newCDPSession(student.page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const roomId = await createRush(teacher, { classKey: 'pair', preset: 'Algebra I Functions', rounds: 1, seconds: 30, scoring: 'correctCount' });
  check(S, await waitForText(student, 'You are in as'), 'no lobby');
  await startGame(teacher);
  const room = await waitForRoundOpen(roomId, 0);
  check(S, await waitForPlay(student), 'no graph');
  await student.page.evaluate(() => {
    window.__mmLatency = [];
    let pressedAt = null;
    document.addEventListener('pointerdown', (event) => { pressedAt = event.timeStamp; }, true);
    new MutationObserver(() => {
      if (pressedAt == null || !document.querySelector('.mm-rush-found-fresh, .mm-rush-miss')) return;
      const from = pressedAt;
      pressedAt = null;
      requestAnimationFrame(() => window.__mmLatency.push(performance.now() - from));
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await playUntil(student, roomId, endsAtOf(room), { scenario: S, missEvery: 3 });
  const samples = (await student.page.evaluate(() => window.__mmLatency)).sort((left, right) => left - right);
  const at = (fraction) => Math.round(samples[Math.min(samples.length - 1, Math.floor(samples.length * fraction))]);
  notes.push({ scenario: S, cpuSlowdown: 4, taps: samples.length, medianMs: at(0.5), p95Ms: at(0.95), maxMs: Math.round(samples.at(-1) || 0) });
  check(S, samples.length >= 10, `only ${samples.length} feedback samples`);
  check(S, at(0.95) < 150, `tap feedback p95 ${at(0.95)}ms on a 4× slower CPU`);
  await waitForRoundClosed(roomId, 0, 15_000);
  await teacher.page.getByRole('button', { name: 'Finish & Show Final Standings' }).click();
  await Promise.all([teacher, student].map((handle) => handle.context.close()));
});

/* --------------------------------- report --------------------------------- */

const summary = {
  findings,
  notes,
  bridge: {
    calls: bridgeCalls.length,
    byName: Object.fromEntries(Object.entries(bridgeCalls.reduce((counts, call) => ({ ...counts, [call.name]: (counts[call.name] || 0) + 1 }), {})).sort()),
    submitMs: (() => {
      const times = bridgeCalls.filter((call) => call.name === 'submitGraphFeatureRushAttempts' && call.ok).map((call) => call.ms).sort((a, b) => a - b);
      return times.length ? { count: times.length, median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)] } : null;
    })(),
  },
  screenshots: SHOTS,
};
writeFileSync(path.join(SHOTS, 'report.json'), JSON.stringify(summary, null, 2));
log(`${findings.length ? `${findings.length} finding(s)` : 'No findings'}. Screenshots and report: ${SHOTS}`);
await browser.close();
bridge.close();
await stopAll();
process.exit(findings.length ? 1 : 0);
