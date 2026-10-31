// The Live Challenge PROJECTOR and HOST CONSOLE, played in a real browser
// against the REAL server: nobody publicly last, the worked solution between
// rounds, recognitions on the podium, extended time, and the teacher's
// "Projector shows" choice.
//
// HOW TO RUN (one command; it starts the emulator, the bridge and Vite). The
// ports are shared with the other emulator suites, so run one at a time:
//
//   node tests/browser/liveChallengeProjectorPrivacyQa.mjs
//   PROJECTOR_QA_SHOTS=/some/dir …        # where screenshots go
//
// THE GAMES. A class of eight, all bot students answering through the real
// callables; the teacher's console and projector are the real components in
// Chromium. Student 8 has extended time on their support plan; student 7
// never answers, so they are last on every board.
//
// Every list is checked against the one public rule (publicStandingsRows):
// never a place tied with the class's last, never one or two players unshown
// (the lobby listed every alias; two would name each other), the top five at
// most.
//
//   1. Top 5 only (the default), 1366×768:
//      live board   five rows and "and 3 more players · everyone sees their
//                   own place on their device"; 7th and 8th never named
//      deadline     student 8 is still inside their extended time: the
//                   projector says "A few students are still finishing", not a
//                   frozen "Time!", and NOTHING on it (host strip included)
//                   says "extended" or "accommodation"; the round stays open,
//                   End Round Now works
//      results      the worked solution, large, with the round's table and
//                   the standings beside it, none cut off (LC03); Hide
//                   solution brings back the two tables side by side (five
//                   rows); 125% zoom and 1920×1080 too
//      podium       top three, then 4th and 5th only; recognitions by alias
//   2. Full standings, 1920×1080: the last-placed alias IS on the live board,
//      the results and under the podium; Play Again keeps the choice.
//   3. A table of four, one right: the live board, both results tables and
//      the podium show the winner only — three tied for last stay off.
//   4. Small games (LC22): five players, the live board, the results and the
//      podium show the top two (a third would leave 4th and 5th, and 4th could
//      name 5th); three players, nobody is named, and the podium has no steps.
//   5. A classic game scored by Grand Prix, chosen in the console (LC16): the
//      Scoring choice per game type (no Correct Count for Solver Race), Speed
//      influence hidden outside Accuracy First, Second Chance switched off with
//      its reason, the room created as Grand Prix at the default speed, first
//      place paid the engine's 15, and Play Again keeping the choice.
//
// NOTHING TOUCHES PRODUCTION: firebase.js is swapped for an emulator module,
// the browser blocks every non-local request, and the project id is
// throwaway. A QA tool, not part of the CI gate: it exits 1 when a check fails
// and writes findings.json beside the screenshots.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// PLAYWRIGHT_MODULE, else the project's playwright (CI installs it), else
// the global install of a development container.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const PROJECT = 'mathmaster-game-harness';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8182';
const VITE_PORT = Number(process.env.PROJECTOR_QA_VITE_PORT || 5198);
const BRIDGE_PORT = Number(process.env.PROJECTOR_QA_BRIDGE_PORT || 5299);
const ORIGIN = `http://localhost:${VITE_PORT}`;
const BRIDGE = `http://localhost:${BRIDGE_PORT}`;
const SHOTS = process.env.PROJECTOR_QA_SHOTS || path.join(repo, 'tests/browser/artifacts/live-challenge-projector');
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
const { leaderboardOptionsFor } = await import(path.join(repo, 'functions/shared/liveChallengeScoring.mjs'));
const { podiumRecognitionRows, publicStandingsRows } = await import(path.join(repo, 'src/platform/liveChallenge/liveChallengeProjectorModel.js'));
const { isMathSegment, splitMathSegments } = await import(path.join(repo, 'src/components/common/mathSegments.js'));

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
  if (!handler?.run) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 'not-found', message: `No callable ${name}` }));
    return;
  }
  try {
    const result = await handler.run({ auth: authFor(identity), data, rawRequest: { headers: {} } });
    bridgeCalls.push({ name, ok: true });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: result ?? null }));
  } catch (error) {
    bridgeCalls.push({ name, ok: false, code: error?.code, lifecycle: error?.details?.lifecycle || null });
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: error?.code || 'internal', message: error?.message || String(error), details: error?.details ?? null }));
  }
});
await new Promise((resolve) => bridge.listen(BRIDGE_PORT, resolve));

/*
 * VITE, with the harness's module swap inline (no config file): firebase.js
 * points at the emulator, and the Live Challenge service at the bridge service
 * plus the one read the console now makes that the bridge service does not
 * export (a round's published worked solution — the real read, against the
 * emulator; the student recap callable is re-exported only so the module graph
 * links, the teacher never calls it). Those two importers keep the real service.
 */
const realService = path.join(repo, 'src/platform/liveChallenge/liveChallengeService.js');
const bridgeService = path.join(here, 'emulator/liveChallengeBridgeService.js');
const VIRTUAL_SERVICE = '\0mm-projector-qa-service';
const { createServer } = await import('vite');
const { default: react } = await import('@vitejs/plugin-react');
const vite = await createServer({
  root: repo,
  configFile: false,
  logLevel: 'error',
  server: { port: VITE_PORT, strictPort: true },
  plugins: [
    {
      name: 'mm-projector-qa-swap',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (source === VIRTUAL_SERVICE) return VIRTUAL_SERVICE;
        if (!importer) return null;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (!resolved) return null;
        const id = path.resolve(resolved.id);
        if (id === path.join(repo, 'src/firebase.js')) return { ...resolved, id: path.join(here, 'emulator/firebaseEmulator.js') };
        if (id === realService && importer !== VIRTUAL_SERVICE && path.resolve(importer) !== bridgeService) return VIRTUAL_SERVICE;
        return resolved;
      },
      load(id) {
        if (id !== VIRTUAL_SERVICE) return null;
        return `export * from ${JSON.stringify(bridgeService)};\nexport { readLiveChallengeSolution, getLiveChallengeMatchRecap } from ${JSON.stringify(realService)};\n`;
      },
    },
    react(),
  ],
});
await vite.listen();
if (!await waitForHttp(`${ORIGIN}/`)) {
  console.error('Vite did not start.');
  process.exit(2);
}

/* ------------------------------ class and bank ------------------------------ */

const TEACHER = 'projector-qa-teacher@example.com';
const CLASS_ID = 'projector-qa-p5';
const FIRST = ['Ana', 'Ben', 'Cara', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana'];
const STUDENTS = FIRST.map((first, index) => ({
  id: `${CLASS_ID}-s0${index + 1}`,
  first,
  last: 'Student',
  // Student 8: extended time on their plan (the server reads grades/{id}.profile).
  ...(index === 7 ? { profile: { accommodations: ['extra-time'] } } : {}),
}));
const IDS = STUDENTS.map((student) => student.id);
const SILENT = IDS[6]; // never answers: last on every board
const EXTENDED = IDS[7];
await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: 'P5', name: 'Period 5 Algebra I' });
for (const student of STUDENTS) {
  await db.collection('grades').doc(student.id).set({
    assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: 'P5', firstName: student.first, lastName: student.last,
    ...(student.profile ? { profile: student.profile } : {}),
  });
}
const teacherProps = {
  email: TEACHER,
  classes: [{ classId: CLASS_ID, name: 'Period 5 Algebra I', period: 'P5', course: 'algebra1', status: 'active' }],
  allStudents: IDS.map((id) => ({ id, studentId: id, classId: CLASS_ID })),
};

// Gradable choice questions that carry an authored worked solution, so the
// results screen has one to show.
const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    const instantiated = await mathPath.instantiateQuestion(item, `projector-qa|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
    if (!Array.isArray(item.alignmentKeys) || !item.alignmentKeys.length) continue;
    const support = await mathPath.buildPrivateSupport(instantiated.question);
    if (!support?.solutionReview?.reasoning?.length) continue;
    if ((await mathPath.buildIssuePlan(instantiated.question)).issuable) bank.push(item);
    if (bank.length >= 30) break;
  }
  if (bank.length >= 30) break;
}
await Promise.all(bank.map((item) => db.collection('pathQuestionBank').doc(item.id).set({ ...item, courseId: 'algebra1', active: true })));
log(`seeded ${bank.length} questions with worked solutions`);

/* ------------------------------ server views ------------------------------ */

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const publicPlayers = async (roomId) => (await roomRef(roomId).collection('players').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
// The class's standings, ranked as the console ranks them (publicLeaderboard).
const standingsOf = async (roomId) => {
  const room = await roomOf(roomId);
  const board = challenge.publicLeaderboard(await publicPlayers(roomId), { activeRound: null, ...leaderboardOptionsFor(room.scoringStrategyId || null) });
  return [...board].sort((left, right) => (left.rank - right.rank) || ((left.position ?? 0) - (right.position ?? 0)));
};
const aliasOf = async (roomId, studentId) => {
  const key = (await db.collection('liveChallengePrivate').doc(roomId).collection('players').doc(studentId).get()).data()?.playerKey;
  return (await publicPlayers(roomId)).find((row) => row.playerKey === key || row.id === key)?.alias || null;
};

/* ---------------------------------- bots ---------------------------------- */

const teacherCall = (name, data) => functionsIndex[name].run({ auth: authFor({ as: 'teacher', email: TEACHER }), data, rawRequest: { headers: {} } });
const botCall = (name, studentId, data) => functionsIndex[name].run({ auth: authFor({ as: 'student', studentId }), data, rawRequest: { headers: {} } });
const expectedFor = async (roomId, roundIndex) => {
  const state = (await db.collection('liveChallengePrivate').doc(roomId).get()).data();
  const questionId = state.questionIds[roundIndex];
  const authored = state.roundQuestions?.[roundIndex] || (await db.collection('pathQuestionBank').doc(questionId).get()).data();
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${roundIndex}|${questionId}`);
  return (await mathPath.buildIssuePlan(instantiated.question)).privateGrading.fields;
};
const botAnswer = async (roomId, studentId, { correct = true, humanElapsedMs = 4_000 } = {}) => {
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

/* -------------------------------- browser -------------------------------- */

const VIEWPORTS = Object.freeze({
  projector: { width: 1366, height: 768 },
  zoom125: { width: 1093, height: 614 },
  hd: { width: 1920, height: 1080 },
});
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const findings = [];
const checks = [];
const finding = (problem) => { findings.push(problem); log(`  ✗ ${problem}`); };
const check = (condition, problem, passed = null) => {
  checks.push({ ok: Boolean(condition), what: passed || problem });
  if (!condition) finding(problem);
  else log(`  ✓ ${passed || problem}`);
  return Boolean(condition);
};
// "status of 400": the bridge answers a refused callable with 400, and the
// console's auto-close is refused while a student with extended time is still
// working (by design; it retries). Refusals are checked by name below.
const IGNORABLE_CONSOLE = /status of 400|ERR_FAILED|ERR_INTERNET_DISCONNECTED|net::|Failed to fetch|WebChannel|transport errored|Could not reach|math fonts could not be loaded|Download the React DevTools|offline|unavailable/i;

const openTeacher = async () => {
  const context = await browser.newContext({ viewport: VIEWPORTS.projector });
  await context.route('**/*', (route) => (/^(http|ws)s?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(route.request().url()) ? route.continue() : route.abort()));
  await context.addInitScript((props) => { window.__mmTeacherProps = props; }, teacherProps);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error' && !IGNORABLE_CONSOLE.test(message.text())) errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error?.message || error}`));
  await page.goto(`${ORIGIN}/tests/browser/graphFeatureRushTeacher.html?as=teacher&email=${encodeURIComponent(TEACHER)}&emulator=${EMULATOR}&bridge=${BRIDGE}`, { waitUntil: 'domcontentloaded' });
  return { page, context, errors };
};
const textOf = async (handle) => (await handle.page.locator('body').innerText()).replace(/\s+/g, ' ');
const waitForText = async (handle, needle, timeout = 15_000) => {
  try {
    await handle.page.waitForFunction((value) => document.body.innerText.replace(/\s+/g, ' ').toLowerCase().includes(value.toLowerCase()), needle, { timeout });
    return true;
  } catch { return false; }
};
const waitForAttr = async (handle, selector, name, expected, timeout = 15_000) => {
  try {
    await handle.page.waitForFunction(({ selector: target, name: key, expected: values }) => values.includes(document.querySelector(target)?.getAttribute(key)), { selector, name, expected: [].concat(expected) }, { timeout });
    return true;
  } catch { return false; }
};
const waitForArena = (handle, stage, timeout) => waitForAttr(handle, '[data-mm-arena-stage]', 'data-mm-arena-stage', stage, timeout);
const shot = async (handle, name) => {
  await handle.page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false, animations: 'disabled' }).catch(() => {});
  log(`  · screenshot ${name}.png`);
};
// The create panel re-renders as its class loads (a reload, a slow CI
// runner), which can detach a select mid-action: retry until the value holds.
const selectInLabel = async (handle, labelStart, value) => {
  const select = () => handle.page.locator('label').filter({ hasText: new RegExp(`^${labelStart}`) }).locator('select').first();
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await select().selectOption(String(value), { timeout: 5_000 });
      if (await select().inputValue({ timeout: 2_000 }) === String(value)) return;
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }
  throw lastError || new Error(`${labelStart} would not keep ${value}`);
};
// The board on screen after everyone answered: the round closes itself, so the
// live board may already have become the standings after the round.
const STANDINGS_ON_SCREEN = '[aria-label="Live standings"] [data-mm-standing], [aria-label="Standings after this round"] [data-mm-standing]';
const keysIn = (handle, selector) => handle.page.locator(selector).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-mm-standing') || node.getAttribute('data-mm-round-result')));
// How far each results panel's content runs past its box, in px: a panel is
// overflow:hidden, so anything past it is cut off (LC03: two tables share a column).
const panelsCutOff = (handle) => handle.page.locator('[data-mm-results-panel]').evaluateAll((nodes) => nodes.map((node) => node.scrollHeight - node.clientHeight));
const overflowX = (handle) => handle.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const confirmDialog = async (handle, label) => {
  const dialog = handle.page.getByRole('alertdialog');
  await dialog.waitFor({ timeout: 5_000 });
  await dialog.getByRole('button', { name: label, exact: true }).click();
};

const createClassic = async (teacher, { standingsDisplay = null, seconds = 20, scoring = null } = {}) => {
  // A console reopened on an ended room (a reload after Play Again was
  // cancelled) offers New Challenge first, as a teacher would see it.
  // The console may switch to it a moment after the create form showed, so
  // the form must hold for a second.
  const fresh = teacher.page.getByRole('button', { name: 'New Challenge', exact: true });
  const classSelect = teacher.page.locator('label').filter({ hasText: /^Class/ }).locator('select').first();
  for (let held = 0, waited = 0; held < 2 && waited < 120; waited += 1) {
    if (await fresh.isVisible().catch(() => false)) { await fresh.click().catch(() => {}); held = 0; }
    else held = await classSelect.isVisible().catch(() => false) ? held + 1 : 0;
    await wait(500);
  }
  await selectInLabel(teacher, 'Class', CLASS_ID);
  await selectInLabel(teacher, 'Game type', 'standard');
  if (scoring) await selectInLabel(teacher, 'Scoring', scoring);
  await selectInLabel(teacher, 'Rounds', 5);
  await selectInLabel(teacher, 'Time per round', seconds);
  // Off: a closing threshold would cut the class's deadline short once most
  // have answered, and the extended-time window with it.
  await selectInLabel(teacher, 'Round closing threshold', 'off');
  if (standingsDisplay) await selectInLabel(teacher, 'Projector shows', standingsDisplay);
  await teacher.page.getByRole('button', { name: 'Create Lobby' }).click();
  if (!await waitForAttr(teacher, '[data-mm-host-console]', 'data-mm-host-console', 'lobby', 30_000)) {
    await shot(teacher, `create-failed-${Date.now()}`);
    throw new Error(`no lobby after Create Lobby: ${JSON.stringify(bridgeCalls.slice(-3))}`);
  }
  return activeRoomId();
};
const toProjector = async (teacher) => {
  await teacher.page.getByRole('button', { name: 'Projector View' }).click();
  await teacher.page.locator('[data-mm-arena-stage]').first().waitFor({ timeout: 10_000 });
};
const startFromProjector = async (teacher, roomId) => {
  await teacher.page.getByRole('button', { name: 'Start Challenge' }).click();
  const running = await waitForRoom(roomId, (room) => room.status === 'running');
  if (!running) throw new Error('the game did not start');
  await wait(Math.max(0, ms(running.startsAt) - Date.now()) + 400);
  return roomOf(roomId);
};
// Everyone but the silent student answers; `skip` sits a round out too.
// Earlier students answer faster, so the order of the board is stable.
const playRound = async (roomId, { skip = [], wrong = [] } = {}) => {
  for (const [index, id] of IDS.entries()) {
    if (id === SILENT || skip.includes(id)) continue;
    await botAnswer(roomId, id, { correct: !wrong.includes(id), humanElapsedMs: 2_000 + index * 600 });
  }
};
const waitForDeadline = async (roomId, extraMs = 0) => {
  const room = await roomOf(roomId);
  await wait(Math.max(0, ms(room.endsAt) - Date.now()) + extraMs);
};

/* ============================ 1. TOP 5 (default) ============================ */

const teacher = await openTeacher();
try {
  log('▶ top 5 only (the default)');
  await teacher.page.locator('text=Create a challenge').first().waitFor({ timeout: 60_000 });
  const choice = teacher.page.locator('select[data-mm-standings-display]');
  check(await choice.inputValue() === 'topFew', 'the create panel does not default to Top 5 only', 'the create panel defaults to "Top 5 only (recommended)"');
  check(await teacher.page.locator('input[data-mm-recognitions-toggle]').isChecked(), 'Recognition awards are not on by default', 'Recognition awards are on by default');
  await teacher.page.locator('select[data-mm-standings-display]').scrollIntoViewIfNeeded();
  await shot(teacher, 'P00-create-panel');

  // Longer rounds: a round's time is fitted to its question, and the extended
  // window (half a round at 1.5×) must outlast the checks below.
  const roomId = await createClassic(teacher, { seconds: 60 });
  const created = await roomOf(roomId);
  check(created.standingsDisplay === 'topFew', `the room's standingsDisplay is ${created.standingsDisplay}`, 'the room is created with standingsDisplay topFew');
  for (const id of IDS) await botCall('joinLiveChallenge', id, { roomId });
  // Joining changes nothing public about extended time (a room field changing
  // with one student's join would name them); the round's opening says it.
  const afterJoin = await roomOf(roomId);
  check(afterJoin.extendedTimeInPlay === false && afterJoin.maxTimeMultiplier === undefined, 'joining with extended time changed the public room', 'joining with extended time leaves the public room unchanged');
  await toProjector(teacher);
  check(await waitForAttr(teacher, '[data-mm-lobby-count]', 'data-mm-lobby-count', '8', 15_000), 'the projector lobby does not count 8', 'the projector lobby counts 8 players');

  // ROUND 1 — student 8 sits it out inside their extended time.
  await startFromProjector(teacher, roomId);
  await playRound(roomId, { skip: [EXTENDED] });
  await wait(1_500);
  const silentAlias = await aliasOf(roomId, SILENT);
  const live = await standingsOf(roomId);
  // Student 8 has not answered yet either (extended time), so the bottom is
  // shared until round 2; every player tied for last counts as last.
  const lastRank = live[live.length - 1]?.rank;
  const lastAliases = live.filter((row) => row.rank === lastRank).map((row) => row.alias);
  check(lastAliases.includes(silentAlias), `the last place is ${lastAliases.join(', ')}, without the silent student (${silentAlias})`, `last place: ${lastAliases.join(', ')}`);
  const liveKeys = await keysIn(teacher, '[aria-label="Live standings"] [data-mm-standing]');
  check(liveKeys.length === 5, `the live board shows ${liveKeys.length} rows (expected 5)`, 'the live board shows five rows');
  check(JSON.stringify(liveKeys) === JSON.stringify(live.slice(0, 5).map((row) => row.playerKey)), 'the live board is not the top five', 'the live board is the server\'s top five');
  const liveRule = publicStandingsRows(created, live, { spaceForRows: 6 });
  check(JSON.stringify(liveKeys) === JSON.stringify(liveRule.rows.map((row) => row.playerKey)), 'the live board is not what the public rule allows', 'the live board is exactly what the public rule allows');
  check(liveRule.hiddenCount >= 3, `the live board leaves ${liveRule.hiddenCount} players unnamed`, 'the live board leaves three or more unnamed');
  check(await waitForText(teacher, 'and 3 more players · everyone sees their own place on their device', 3_000), 'the live board does not say "and 3 more players · everyone sees their own place on their device"', 'the live board says "and 3 more players · everyone sees their own place on their device"');
  let text = await textOf(teacher);
  check(!lastAliases.some((alias) => text.includes(alias)), 'the live board names a last-placed player', 'the live board never names the last-placed players');
  check(!live.slice(5).some((row) => text.includes(row.alias)), 'the live board names someone below 5th', 'nobody below 5th is named on the live board');
  await shot(teacher, 'P01-live-board');

  // THE CLASS'S DEADLINE PASSES with student 8 still inside their own.
  const open1 = await roomOf(roomId);
  const extendedEndsMs = ms(open1.startsAt) + (ms(open1.endsAt) - ms(open1.startsAt)) * 1.5;
  check(open1.extendedTimeInPlay === true, 'the round opened without extendedTimeInPlay', 'the round opened with extendedTimeInPlay (never who)');
  log(`  · round 1 lasts ${Math.round((ms(open1.endsAt) - ms(open1.startsAt)) / 1000)} s for the class, ${Math.round((extendedEndsMs - ms(open1.startsAt)) / 1000)} s with extended time`);
  await waitForDeadline(roomId, 1_800);
  check(await waitForAttr(teacher, '[data-mm-arena-clock]', 'data-mm-arena-clock', 'stillFinishing', 5_000), 'the projector shows a frozen clock while students with extended time finish', 'the projector says students are still finishing');
  check(await waitForText(teacher, 'A few students are still finishing — results in a moment', 2_000), 'the extended-time words are missing', 'the projector reads "A few students are still finishing — results in a moment"');
  text = await textOf(teacher);
  check(!text.includes('Time!'), 'the projector still shows "Time!" during extended time', 'no frozen "Time!"');
  const extendedAlias = await aliasOf(roomId, EXTENDED);
  const clockText = await teacher.page.locator('[data-mm-arena-clock="stillFinishing"]').first().innerText().catch(() => '');
  check(!IDS.some((id) => clockText.includes(id)) && !clockText.includes(extendedAlias), 'the projector says who has extended time', 'the projector never says who has extended time');
  // The whole projected screen — stage AND host strip — gives no reason.
  check(!/extended|accommodat|extra time|support plan/i.test(text), `the projector says why the round waits: "${(text.match(/[^.]*(extended|accommodat)[^.]*/i) || [''])[0].trim()}"`, 'nothing on the projector says "extended time" or "accommodation"');
  check(await teacher.page.locator('[data-mm-arena-host]').innerText().then((strip) => /Waiting for the last answers/.test(strip)).catch(() => false), 'the host strip does not read "Waiting for the last answers"', 'the host strip reads "Waiting for the last answers. End Round Now still works."');
  await shot(teacher, 'P02-extended-time');
  // Past the class's deadline and its arrival grace, inside student 8's own.
  await wait(1_500);
  if (Date.now() < extendedEndsMs - 1_000) {
    check((await roomOf(roomId)).roundState === 'open', 'the round closed on the class deadline while a student with extended time was working', 'the round waits for the student with extended time');
  } else {
    finding('the extended window was too short to check that the round waits (use longer rounds)');
  }
  const endRound = teacher.page.getByRole('button', { name: 'End Round Now' });
  check(await endRound.isVisible(), 'End Round Now is not offered during extended time', 'End Round Now is offered during extended time');
  await endRound.click();
  await confirmDialog(teacher, 'End Round Now');
  check(await waitForRoom(roomId, (room) => room.roundState === 'closed', 15_000), 'End Round Now did not close the round during extended time', 'End Round Now closes the round');

  // RESULTS — the worked solution, and still nobody below 5th.
  check(await waitForArena(teacher, 'roundResults', 10_000), 'the projector is not on the results', 'the projector shows the results');
  check(await waitForAttr(teacher, '[data-mm-projector-solution]', 'data-mm-projector-solution', ['ready', 'unavailable'], 15_000), 'no worked solution on the results screen', 'the results screen carries the worked solution');
  const solutionState = await teacher.page.locator('[data-mm-projector-solution]').first().getAttribute('data-mm-projector-solution');
  check(solutionState === 'ready', `the solution reads as ${solutionState}`, 'the worked solution is ready (published after the close)');
  const published = (await roomRef(roomId).collection('solutions').doc('0').get()).data();
  if (published?.solutionReview?.headline) {
    // Probe with a word of the headline's prose. The projector draws math with
    // KaTeX, so a headline that opens with math ("$1\ge 0$, so use the second
    // rule: 3.") is never on screen as its LaTeX source: probing "1\ge" failed
    // whenever the round drew that question. The prose is split off the way
    // MathText splits it, so every delimiter ($…$, $$…$$, \(…\), \[…\]) counts.
    const prose = splitMathSegments(published.solutionReview.headline).filter((segment) => !isMathSegment(segment)).join(' ');
    const word = (prose.match(/[A-Za-z]{4,}/) || prose.match(/[A-Za-z]{3,}/) || [])[0];
    const shown = await teacher.page.locator('[data-mm-projector-solution="ready"]').first().innerText().catch(() => '');
    check(word ? shown.includes(word) : shown.trim().length > 0, 'the projector does not show the published solution', 'the projector shows the published solution');
  }
  const fontPx = await teacher.page.locator('[data-mm-projector-solution="ready"] ol').first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize)).catch(() => 0);
  check(fontPx >= 18, `the solution's steps are ${fontPx}px at 1366×768`, `the solution's steps are ${fontPx}px at 1366×768`);
  const after1 = await standingsOf(roomId);
  const resultsKeys = await keysIn(teacher, '[aria-label="Standings after this round"] [data-mm-standing]');
  check(resultsKeys.length <= 5 && resultsKeys.length > 0, `the standings after the round show ${resultsKeys.length} rows`, `the standings after the round show ${resultsKeys.length} rows`);
  text = await textOf(teacher);
  check(!text.includes(silentAlias), 'the results name the last-placed player', 'the results never name the last-placed player');
  // By RANK, not by index: the results page carries two tables (LC03), and each
  // orders players who tie (several share 3rd) its own way, so a tied 3rd that
  // this list sorts sixth may rightly be the one a table shows.
  check(!after1.filter((row) => row.rank > 5).some((row) => text.includes(row.alias)), 'the results name someone ranked below 5th', 'nobody ranked below 5th is named on the results');
  check(await overflowX(teacher) <= 0, 'the results scroll sideways', 'no sideways scroll on the results');
  // LC03: with the solution on screen the round's table stays in view beside it
  // (no press of Hide solution), and nothing in either table is cut off.
  const besideKeys = await keysIn(teacher, '[data-mm-results-layout="solution"] [aria-label="Round results"] [data-mm-round-result]');
  check(besideKeys.length > 0 && besideKeys.length <= 5, `the round table beside the solution shows ${besideKeys.length} rows`, `the round's table stays in view beside the worked solution (${besideKeys.length} rows)`);
  let cutOff = await panelsCutOff(teacher);
  check(cutOff.length === 2 && cutOff.every((cut) => cut <= 1), `a table beside the solution is cut off at 1366×768 (${cutOff.join(', ')} px)`, 'neither table beside the solution is cut off at 1366×768');
  await shot(teacher, 'P03-results-solution');

  await teacher.page.setViewportSize(VIEWPORTS.zoom125);
  await wait(600);
  text = await textOf(teacher);
  check(!text.includes(silentAlias), 'the results at 125% name the last-placed player', 'the results at 125% never name the last-placed player');
  check(await overflowX(teacher) <= 0, 'the results scroll sideways at 125%', 'no sideways scroll at 125%');
  cutOff = await panelsCutOff(teacher);
  check(cutOff.length === 2 && cutOff.every((cut) => cut <= 1), `a table beside the solution is cut off at 125% (${cutOff.join(', ')} px)`, 'neither table beside the solution is cut off at 125%');
  const zoomKeys = await keysIn(teacher, '[data-mm-results-layout="solution"] [aria-label="Round results"] [data-mm-round-result]');
  check(zoomKeys.length >= 1 && zoomKeys.length <= besideKeys.length, `the round table beside the solution shows ${zoomKeys.length} rows at 125%, ${besideKeys.length} at 1366×768`, `a smaller screen shows no more rows (${zoomKeys.length} at 125%)`);
  await shot(teacher, 'P04-results-solution-125');
  await teacher.page.setViewportSize(VIEWPORTS.hd);
  await wait(600);
  text = await textOf(teacher);
  check(!text.includes(silentAlias), 'the results at 1920×1080 name the last-placed player (room for 10 rows, still top 5)', 'a big projector still shows only the top 5');
  cutOff = await panelsCutOff(teacher);
  check(cutOff.length === 2 && cutOff.every((cut) => cut <= 1), `a table beside the solution is cut off at 1920×1080 (${cutOff.join(', ')} px)`, 'neither table beside the solution is cut off at 1920×1080');
  // The fitting starts again when the screen grows: more rows than at 125%, and
  // never more than the public rule's top five.
  const bigKeys = await keysIn(teacher, '[data-mm-results-layout="solution"] [aria-label="Round results"] [data-mm-round-result]');
  check(bigKeys.length > zoomKeys.length && bigKeys.length <= 5, `the round table beside the solution shows ${bigKeys.length} rows at 1920×1080, ${zoomKeys.length} at 125%`, `a bigger screen shows more rows (${zoomKeys.length} at 125%, ${bigKeys.length} at 1920×1080)`);
  await shot(teacher, 'P05-results-solution-1080');
  await teacher.page.setViewportSize(VIEWPORTS.projector);
  await wait(400);

  await teacher.page.getByRole('button', { name: 'Hide solution' }).click();
  check(await waitForAttr(teacher, '[data-mm-results-layout]', 'data-mm-results-layout', 'tables', 3_000), 'Hide solution does not hide it', 'Hide solution brings back the round\'s table');
  const roundKeys = await keysIn(teacher, '[aria-label="Round results"] [data-mm-round-result]');
  check(roundKeys.length > 0 && roundKeys.length <= 5, `the round table shows ${roundKeys.length} rows`, `the round table shows ${roundKeys.length} rows`);
  text = await textOf(teacher);
  check(!text.includes(silentAlias), 'the round table names the last-placed player', 'the round table never names the last-placed player');
  check(text.includes('everyone sees their own place on their device'), 'the round table does not say everyone sees their own place', 'the tables say everyone sees their own place on their device');
  await shot(teacher, 'P06-results-tables');

  // The console (the teacher's own screen) shows the same worked solution.
  await teacher.page.getByRole('button', { name: 'Exit Projector View' }).click();
  check(await waitForAttr(teacher, '[data-mm-host-solution]', 'data-mm-host-solution', 'ready', 10_000), 'the console has no worked solution at results', 'the console shows the worked solution at results');
  await teacher.page.locator('[data-mm-host-solution]').first().scrollIntoViewIfNeeded();
  await shot(teacher, 'P06b-console-results-solution');
  await toProjector(teacher);

  // ROUND 2 — everyone but the silent student answers; then End Game.
  await teacher.page.locator('[data-mm-primary-action="advance"]').first().click();
  const r2 = await waitForRoom(roomId, (room) => Number(room.currentRound) === 1 && room.roundState === 'open', 15_000);
  check(r2, 'round 2 did not open', 'round 2 opens');
  await wait(Math.max(0, ms(r2.startsAt) - Date.now()) + 400);
  text = await textOf(teacher);
  check(!text.includes('Worked solution'), 'a worked solution is on screen during an open round', 'no worked solution while a round is open');
  await playRound(roomId);
  await waitForDeadline(roomId, 1_000);
  check(await waitForRoom(roomId, (room) => room.roundState === 'closed', 20_000), 'round 2 never closed', 'round 2 closes');
  check(await waitForArena(teacher, 'roundResults', 10_000), 'no round 2 results', 'round 2 results');
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await confirmDialog(teacher, 'End Game');
  const finished = await waitForRoom(roomId, (room) => room.status === 'finished' && Array.isArray(room.recognitions), 30_000)
    || await waitForRoom(roomId, (room) => room.status === 'finished', 5_000);
  check(finished, 'the game did not finish', 'the game finishes');
  check(await waitForArena(teacher, 'completed', 15_000), 'the projector is not on the podium', 'the projector shows the podium');
  await wait(1_500); // the podium's reveal animation
  const final = await standingsOf(roomId);
  text = await textOf(teacher);
  check(!text.includes(silentAlias), 'the podium screen names the last-placed player', 'the podium screen never names the last-placed player');
  // Below 5th, a player is named only for a recognition they earned
  // (positive and public by design) — never with a place.
  const recognized = new Set((finished?.recognitions || []).flatMap((entry) => entry.aliases || []));
  const placesShown = await teacher.page.locator('[data-mm-final-board] [data-mm-standing], [data-mm-podium]').evaluateAll((nodes) => nodes.map((node) => node.innerText));
  check(!final.slice(5).some((row) => placesShown.some((shown) => shown.includes(row.alias))), 'a player below 5th is shown with a place on the podium screen', 'nobody below 5th is shown with a place');
  check(!final.slice(5).some((row) => !recognized.has(row.alias) && text.includes(row.alias)), 'the podium screen names someone below 5th who earned no recognition', 'below 5th, only a recognition names anyone');
  const finalBoard = Number(await teacher.page.locator('[data-mm-final-board]').first().getAttribute('data-mm-final-board').catch(() => '0'));
  check(finalBoard <= 2, `${finalBoard} rows under the podium`, `${finalBoard} rows under the podium (4th and 5th at most)`);
  check(await teacher.page.locator('[data-mm-final-more]').count() > 0, 'the podium does not say everyone sees their own final place', 'the podium says everyone sees their own final place');
  const recognitions = podiumRecognitionRows(finished || {});
  log(`  · room.recognitions: ${JSON.stringify((finished?.recognitions || []).map((entry) => ({ id: entry.id, aliases: entry.aliases, classWide: entry.classWide })))}`);
  if (recognitions.length) {
    check(Number(await teacher.page.locator('[data-mm-recognitions]').first().getAttribute('data-mm-recognitions').catch(() => '0')) === recognitions.length, 'the podium does not show every recognition', `the podium shows ${recognitions.length} recognition(s)`);
    for (const entry of recognitions) check(text.includes(entry.label) && text.includes(entry.who), `the podium does not show "${entry.text}"`, `the podium shows "${entry.text}"`);
    const keys = (finished.recognitions || []).flatMap((entry) => entry.playerKeys || []);
    check(!keys.some((key) => text.includes(key)), 'a player key is on the projector', 'no player key on the projector');
  } else {
    check(Array.isArray(finished?.recognitions), 'the finished room carries no recognitions field', 'the room has a recognitions field (empty: nobody qualified)');
  }
  await shot(teacher, 'P07-podium');
  await teacher.page.setViewportSize(VIEWPORTS.zoom125);
  await wait(800);
  text = await textOf(teacher);
  check(!text.includes(silentAlias), 'the podium at 125% names the last-placed player', 'the podium at 125% never names the last-placed player');
  check(await overflowX(teacher) <= 0, 'the podium scrolls sideways at 125%', 'no sideways scroll on the podium at 125%');
  await shot(teacher, 'P08-podium-125');
  await teacher.page.setViewportSize(VIEWPORTS.projector);
  await wait(400);

  /* ========================= 2. FULL STANDINGS ========================= */

  log('▶ full standings (the teacher\'s opt-in)');
  await teacher.page.locator('[data-mm-arena-host] button', { hasText: 'New Challenge' }).first().click();
  const fullRoomId = await createClassic(teacher, { standingsDisplay: 'full' });
  check((await roomOf(fullRoomId)).standingsDisplay === 'full', 'the room did not keep "Full standings"', 'the room is created with standingsDisplay full');
  for (const id of IDS) await botCall('joinLiveChallenge', id, { roomId: fullRoomId });
  await teacher.page.setViewportSize(VIEWPORTS.hd);
  await toProjector(teacher);
  await waitForAttr(teacher, '[data-mm-lobby-count]', 'data-mm-lobby-count', '8', 15_000);
  await startFromProjector(teacher, fullRoomId);
  await playRound(fullRoomId);
  await wait(1_500);
  const fullSilent = await aliasOf(fullRoomId, SILENT);
  const fullLive = await standingsOf(fullRoomId);
  check(fullLive[fullLive.length - 1]?.alias === fullSilent, 'the silent student is not last in the full-standings game', 'the silent student is last');
  check(await waitForText(teacher, fullSilent, 5_000), 'full standings do not show the last-placed player on the live board', 'full standings show the last-placed player on the live board');
  check((await keysIn(teacher, '[aria-label="Live standings"] [data-mm-standing]')).length === 8, 'the full live board does not show all 8', 'the full live board shows all 8 at 1920×1080');
  await shot(teacher, 'F01-live-board-full');
  await waitForDeadline(fullRoomId, 1_000);
  await waitForRoom(fullRoomId, (room) => room.roundState === 'closed', 20_000);
  await waitForArena(teacher, 'roundResults', 10_000);
  // The worked solution is published a moment after the close; with it up the
  // round's table and the standings share the column beside it (LC03).
  check(await waitForAttr(teacher, '[data-mm-results-layout]', 'data-mm-results-layout', 'solution', 15_000), 'a full-standings game never shows the worked solution at its results', 'a full-standings game shows the worked solution at its results');
  await wait(800);
  check((await textOf(teacher)).includes(fullSilent), 'full standings do not show the last-placed player on the results', 'full standings show the last-placed player on the results');
  // …with the round's table beside the solution, neither cut off.
  const fullCut = await panelsCutOff(teacher);
  check(fullCut.length === 2 && fullCut.every((cut) => cut <= 1), `a full-standings table beside the solution is cut off at 1920×1080 (${fullCut.join(', ')} px)`, 'neither full-standings table beside the solution is cut off at 1920×1080');
  check((await keysIn(teacher, '[data-mm-results-layout="solution"] [aria-label="Round results"] [data-mm-round-result]')).length > 0, 'the round table is not beside the solution in a full-standings game', 'the round table stays beside the solution in a full-standings game');
  await shot(teacher, 'F02-results-full');
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await confirmDialog(teacher, 'End Game');
  await waitForRoom(fullRoomId, (room) => room.status === 'finished', 30_000);
  await waitForArena(teacher, 'completed', 15_000);
  await wait(1_500);
  // Full standings fill the space under the podium (past 5th) — how far
  // depends on the room left; the top-few rule would stop at two rows.
  const fullBoardRows = Number(await teacher.page.locator('[data-mm-final-board]').first().getAttribute('data-mm-final-board').catch(() => '0'));
  check(fullBoardRows > 2, `full standings show ${fullBoardRows} rows under the podium`, `full standings show ${fullBoardRows} rows under the podium (6th and below included)`);
  const fullFinal = await standingsOf(fullRoomId);
  const fullText = await textOf(teacher);
  check(fullFinal.slice(5).some((row) => fullText.includes(row.alias)), 'full standings name nobody below 5th on the podium screen', 'full standings name players below 5th on the podium screen');
  await shot(teacher, 'F03-podium-full');

  // PLAY AGAIN keeps the choice.
  await teacher.page.locator('[data-mm-primary-action="playAgain"]').first().click();
  const replayId = await (async () => {
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
      const id = await activeRoomId();
      if (id && id !== fullRoomId) return id;
      await wait(300);
    }
    return null;
  })();
  check(replayId, 'Play Again did not create a new room', 'Play Again creates a new room');
  if (replayId) {
    check((await roomOf(replayId)).standingsDisplay === 'full', 'Play Again dropped "Full standings"', 'Play Again keeps "Full standings"');
    await teacherCall('cancelLiveChallenge', { roomId: replayId }).catch(() => {});
  }

  // Remembered on this device.
  await teacher.page.reload({ waitUntil: 'domcontentloaded' });
  await teacher.page.locator('text=Create a challenge').first().waitFor({ timeout: 60_000 });
  check(await teacher.page.locator('select[data-mm-standings-display]').inputValue() === 'full', 'the choice is not remembered on this device', 'the choice is remembered on this device');
  /* ================= 3. A TABLE OF FOUR, ONE RIGHT ================= */

  // Three players tie for the last place: none of them is ever projected, and
  // "and 3 more players" is the only word about them.
  log('▶ a table of four, one right (ties at the bottom)');
  const tableId = await createClassic(teacher, { standingsDisplay: 'topFew' });
  const TABLE = IDS.slice(0, 4);
  for (const id of TABLE) await botCall('joinLiveChallenge', id, { roomId: tableId });
  await teacher.page.setViewportSize(VIEWPORTS.projector);
  await toProjector(teacher);
  await waitForAttr(teacher, '[data-mm-lobby-count]', 'data-mm-lobby-count', '4', 15_000);
  await startFromProjector(teacher, tableId);
  for (const [index, id] of TABLE.entries()) await botAnswer(tableId, id, { correct: index === 0, humanElapsedMs: 2_000 + index * 600 });
  await wait(1_500);
  const tableLive = await standingsOf(tableId);
  const tableWinner = tableLive.find((row) => row.rank === 1);
  const tableLast = tableLive.filter((row) => row.rank === tableLive[tableLive.length - 1].rank);
  check(tableLast.length === 3, `the table's bottom is ${tableLast.length} players (expected 3 tied)`, 'three players tie for last at the table');
  const tableLiveKeys = await keysIn(teacher, STANDINGS_ON_SCREEN);
  check(JSON.stringify(tableLiveKeys) === JSON.stringify([tableWinner?.playerKey]), `the table's live board shows ${tableLiveKeys.length} rows (expected the winner only)`, 'the table\'s live board shows the winner only');
  check(await waitForText(teacher, 'and 3 more players · everyone sees their own place on their device', 3_000), 'the table\'s live board does not say "and 3 more players"', 'the table\'s live board says "and 3 more players · everyone sees their own place on their device"');
  text = await textOf(teacher);
  check(!tableLast.some((row) => text.includes(row.alias)), 'the table\'s live board names a player tied for last', 'no player tied for last is named live');
  await shot(teacher, 'T01-table-live');
  await waitForDeadline(tableId, 1_000);
  check(await waitForRoom(tableId, (room) => room.roundState === 'closed', 20_000), 'the table\'s round never closed', 'the table\'s round closes');
  check(await waitForArena(teacher, 'roundResults', 10_000), 'no results for the table', 'the table\'s results');
  await wait(1_000);
  const tableStandingKeys = await keysIn(teacher, '[aria-label="Standings after this round"] [data-mm-standing]');
  check(JSON.stringify(tableStandingKeys) === JSON.stringify([tableWinner?.playerKey]), `the standings after the round show ${tableStandingKeys.length} rows (expected the winner only)`, 'the standings after the round show the winner only');
  text = await textOf(teacher);
  check(!tableLast.some((row) => text.includes(row.alias)), 'the table\'s results name a player tied for last', 'the results name nobody tied for last');
  await shot(teacher, 'T02-table-results');
  const hide = teacher.page.getByRole('button', { name: 'Hide solution' });
  if (await hide.isVisible().catch(() => false)) await hide.click();
  await wait(600);
  const tableRoundKeys = await keysIn(teacher, '[aria-label="Round results"] [data-mm-round-result]');
  check(tableRoundKeys.length === 1, `the table's round results show ${tableRoundKeys.length} rows (expected 1)`, 'the round\'s table shows the winner only (no "T-2nd … 0 pts" rows)');
  text = await textOf(teacher);
  check(!tableLast.some((row) => text.includes(row.alias)), 'the round\'s table names a player tied for last', 'the round\'s table names nobody tied for last');
  await shot(teacher, 'T03-table-round-table');
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await confirmDialog(teacher, 'End Game');
  await waitForRoom(tableId, (room) => room.status === 'finished', 30_000);
  check(await waitForArena(teacher, 'completed', 15_000), 'the table\'s podium did not show', 'the table\'s podium shows');
  await wait(1_500);
  const tablePodium = await teacher.page.locator('[data-mm-podium]').evaluateAll((nodes) => nodes.map((node) => node.innerText));
  const tableFinal = await standingsOf(tableId);
  const tableFinalLast = tableFinal.filter((row) => row.rank === tableFinal[tableFinal.length - 1].rank);
  check(tablePodium.length === 1 && tablePodium[0].includes(tableFinal[0].alias), `the table's podium has ${tablePodium.length} step(s)`, 'the table\'s podium shows the champion only');
  text = await textOf(teacher);
  const tableRecognized = new Set(((await roomOf(tableId)).recognitions || []).flatMap((entry) => entry.aliases || []));
  check(!tableFinalLast.some((row) => !tableRecognized.has(row.alias) && text.includes(row.alias)), 'the table\'s podium names a player tied for last', 'the table\'s podium names nobody tied for last (a recognition aside)');
  await shot(teacher, 'T04-table-podium');

  /* ================= 4. SMALL GAMES: FIVE, THEN THREE (LC22) ================= */

  // With 5 players the class used to see the top three. That left 4th and 5th,
  // and the 4th, finding three aliases on the projector and themselves 4th,
  // could name the 5th: the one alias that was neither on the board nor theirs.
  // The class now sees the top two. With three players nobody is named (3rd
  // and 2nd would each name the other), and with four only the winner.
  const smallGame = async ({ players, shown, tag }) => {
    log(`▶ a game of ${players} (the class sees ${shown === 0 ? 'nobody' : `the top ${shown}`})`);
    await teacher.page.locator('[data-mm-arena-host] button', { hasText: 'New Challenge' }).first().click();
    const gameId = await createClassic(teacher, { standingsDisplay: 'topFew' });
    const group = IDS.slice(0, players);
    for (const id of group) await botCall('joinLiveChallenge', id, { roomId: gameId });
    await toProjector(teacher);
    await waitForAttr(teacher, '[data-mm-lobby-count]', 'data-mm-lobby-count', String(players), 15_000);
    await startFromProjector(teacher, gameId);
    // Speed is scored in whole seconds of the server's time, so each place
    // needs an answer that arrives seconds after the one before.
    for (const id of group) {
      await botAnswer(gameId, id, { correct: true, humanElapsedMs: 0 });
      await wait(2_100);
    }
    const live = await standingsOf(gameId);
    const everyAlias = live.map((row) => row.alias);
    check(live.length === players && new Set(live.map((row) => row.rank)).size === players, `the ranks are ${live.map((row) => row.rank).join(',')}`, `${players} players, ${players} places`);
    const expectedKeys = live.slice(0, shown).map((row) => row.playerKey);
    const unlisted = live.slice(shown);
    const liveKeys = await keysIn(teacher, STANDINGS_ON_SCREEN);
    check(JSON.stringify(liveKeys) === JSON.stringify(expectedKeys), `the live board of ${players} shows ${liveKeys.length} rows (expected ${shown})`, `the live board of ${players} shows ${shown === 0 ? 'nobody' : `the top ${shown} only`}`);
    // The public rule, asked of the same standings: the board is what it allows.
    const rule = publicStandingsRows(created, live, { spaceForRows: 6 });
    check(JSON.stringify(liveKeys) === JSON.stringify(rule.rows.map((row) => row.playerKey)), `the board of ${players} is not what the public rule allows`, `the board of ${players} is exactly what the public rule allows`);
    const hidden = players - shown;
    check(hidden >= 3, `${hidden} players are left unshown`, `${hidden} players are left unshown, so none of them can name another`);
    const moreWords = shown === 0 ? `${players} players · everyone sees their own place on their device` : `and ${hidden} more players · everyone sees their own place on their device`;
    check(await waitForText(teacher, moreWords, 3_000), `the live board does not say "${moreWords}"`, `the live board says "${moreWords}"`);
    let gameText = await textOf(teacher);
    check(!unlisted.some((row) => gameText.includes(row.alias)), 'the live board names a player it leaves off', `the live board of ${players} names nobody it leaves off`);
    await shot(teacher, `${tag}01-live`);
    check(await waitForRoom(gameId, (room) => room.roundState === 'closed', 30_000), `the round of ${players} never closed`, `the round of ${players} closes once everyone has answered`);
    check(await waitForArena(teacher, 'roundResults', 10_000), `no results for the game of ${players}`, `the results of the game of ${players}`);
    await wait(1_200);
    const standingKeys = await keysIn(teacher, '[aria-label="Standings after this round"] [data-mm-standing]');
    check(JSON.stringify(standingKeys) === JSON.stringify(expectedKeys), `the standings after the round show ${standingKeys.length} rows (expected ${shown})`, `the standings after the round show ${shown === 0 ? 'nobody' : `the top ${shown} only`}`);
    const hideSolution = teacher.page.getByRole('button', { name: 'Hide solution' });
    if (await hideSolution.isVisible().catch(() => false)) await hideSolution.click();
    await wait(600);
    const roundKeys = await keysIn(teacher, '[aria-label="Round results"] [data-mm-round-result]');
    check(JSON.stringify(roundKeys) === JSON.stringify(expectedKeys), `the round's table shows ${roundKeys.length} rows (expected ${shown})`, `the round's table shows ${shown === 0 ? 'nobody' : `the top ${shown} only`}`);
    gameText = await textOf(teacher);
    check(!unlisted.some((row) => gameText.includes(row.alias)), 'the results name a player they leave off', `the results of ${players} name nobody they leave off`);
    await shot(teacher, `${tag}02-results`);
    await teacher.page.getByRole('button', { name: 'End Game' }).click();
    await confirmDialog(teacher, 'End Game');
    await waitForRoom(gameId, (room) => room.status === 'finished', 30_000);
    check(await waitForArena(teacher, 'completed', 15_000), `the game of ${players} has no podium screen`, `the game of ${players} shows its podium screen`);
    await wait(1_500);
    const steps = (await teacher.page.locator('[data-mm-podium]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-mm-podium')))).sort();
    const wanted = ['1', '2', '3'].slice(0, Math.min(shown, 3));
    check(JSON.stringify(steps) === JSON.stringify(wanted), `the podium of ${players} shows steps ${JSON.stringify(steps)}`, `the podium of ${players} shows ${wanted.length ? `steps ${wanted.join(', ')}` : 'no steps'}`);
    gameText = await textOf(teacher);
    const recognizedHere = new Set(((await roomOf(gameId)).recognitions || []).flatMap((entry) => entry.aliases || []));
    check(!unlisted.some((row) => !recognizedHere.has(row.alias) && gameText.includes(row.alias)), `the podium of ${players} names a player it leaves off`, `the podium of ${players} names nobody it leaves off (a recognition aside)`);
    check(everyAlias.length === players, 'the standings lost a player', `all ${players} players are in the standings`);
    await shot(teacher, `${tag}03-podium`);
  };
  await smallGame({ players: 5, shown: 2, tag: 'V' });
  await smallGame({ players: 3, shown: 0, tag: 'G' });
  await teacher.page.getByRole('button', { name: 'Exit Projector View' }).click().catch(() => {});

  /* ============ 5. A CLASSIC GAME SCORED BY GRAND PRIX, FROM THE CONSOLE (LC16) ============ */

  log('▶ a classic game scored by Grand Prix, chosen in the console');
  const optionsOf = (label) => teacher.page.locator('label').filter({ hasText: new RegExp(`^${label}`) }).locator('select').first().locator('option').evaluateAll((nodes) => nodes.map((node) => node.value));
  const fresh = teacher.page.getByRole('button', { name: 'New Challenge', exact: true });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
  await teacher.page.locator('text=Create a challenge').first().waitFor({ timeout: 30_000 });
  check(JSON.stringify(await optionsOf('Scoring')) === JSON.stringify(['accuracyFirst', 'grandPrix', 'correctCount']), `a Standard Challenge offers ${JSON.stringify(await optionsOf('Scoring'))}`, 'a Standard Challenge offers Accuracy First, Grand Prix and Correct Count');
  check(await teacher.page.locator('label').filter({ hasText: /^Speed influence/ }).count() === 1, 'Accuracy First does not show Speed influence', 'Accuracy First shows Speed influence');
  check(await teacher.page.locator('[data-mm-classic-scoring-help]').count() === 0, 'Accuracy First shows the scoring help', 'Accuracy First keeps its own points preview');
  await selectInLabel(teacher, 'Game type', 'solverRace');
  check(JSON.stringify(await optionsOf('Scoring')) === JSON.stringify(['accuracyFirst', 'grandPrix']), `a Solver Race offers ${JSON.stringify(await optionsOf('Scoring'))}`, 'a Solver Race offers Accuracy First and Grand Prix (no Correct Count)');
  await selectInLabel(teacher, 'Scoring', 'grandPrix');
  await selectInLabel(teacher, 'Game type', 'standard');
  // The choice was Grand Prix when the game type changed: Standard still has it.
  check(await teacher.page.locator('label').filter({ hasText: /^Scoring/ }).locator('select').first().inputValue() === 'grandPrix', 'the choice was lost when the game type changed', 'the Grand Prix choice holds across a change of game type');
  // Second Chance is Accuracy First's: turned on there, it is switched off (and
  // says why) under Correct Count, and is still off when the room is created
  // under Grand Prix although the setting was left on.
  await selectInLabel(teacher, 'Scoring', 'accuracyFirst');
  await selectInLabel(teacher, 'Second Chance', 'automatic');
  await selectInLabel(teacher, 'Scoring', 'correctCount');
  const secondChanceSelect = teacher.page.locator('label').filter({ hasText: /^Second Chance/ }).locator('select').first();
  check(await secondChanceSelect.isDisabled(), 'Second Chance is still offered under Correct Count', 'Second Chance is switched off under Correct Count');
  check(await secondChanceSelect.inputValue() === 'off', 'the Second Chance control shows Automatic under Correct Count', 'and shows Off, not a hidden Automatic');
  check((await textOf(teacher)).includes('Second Chance gives back points a student missed'), 'the control does not say why Second Chance is off', 'the control says why Second Chance is off');
  await selectInLabel(teacher, 'Scoring', 'grandPrix');
  check(await teacher.page.locator('label').filter({ hasText: /^Speed influence/ }).count() === 0, 'Grand Prix still shows Speed influence', 'Grand Prix hides Speed influence');
  const help = await teacher.page.locator('[data-mm-classic-scoring-help="grandPrix"]').first().innerText().catch(() => '');
  check(/How scoring works/.test(help) && /championship points/.test(help) && /1st 15, 2nd 12, 3rd 10/.test(help), `the Grand Prix help reads "${help.slice(0, 120)}"`, 'the Grand Prix help says what a round pays');
  await teacher.page.locator('[data-mm-classic-scoring-help]').first().scrollIntoViewIfNeeded().catch(() => {});
  await shot(teacher, 'S00-grand-prix-create');
  const gpId = await createClassic(teacher, { standingsDisplay: 'topFew', scoring: 'grandPrix' });
  const gpRoom = await roomOf(gpId);
  check(gpRoom.scoringStrategyId === 'grandPrix' && gpRoom.scoringMode === 'grandPrix', `the room is scored by ${gpRoom.scoringStrategyId}`, 'the room is created with scoringStrategyId grandPrix');
  check(gpRoom.speedInfluencePercent === 20, `the room's speed influence is ${gpRoom.speedInfluencePercent}`, 'the room carries the default speed influence (20), not a hidden control\'s');
  check(gpRoom.secondChanceMode === 'off', `the room's Second Chance is ${gpRoom.secondChanceMode}`, 'the room has Second Chance off');
  for (const id of IDS) await botCall('joinLiveChallenge', id, { roomId: gpId });
  check(await waitForText(teacher, 'Grand Prix', 10_000), 'the console never says Grand Prix', 'the console says the game is scored by Grand Prix');
  await toProjector(teacher);
  await waitForAttr(teacher, '[data-mm-lobby-count]', 'data-mm-lobby-count', '8', 15_000);
  await startFromProjector(teacher, gpId);
  await playRound(gpId);
  check(await waitForRoom(gpId, (room) => room.roundState === 'closed', 40_000), 'the Grand Prix round never closed', 'the Grand Prix round closes');
  check(await waitForArena(teacher, 'roundResults', 10_000), 'no results for the Grand Prix game', 'the Grand Prix results show');
  await wait(1_200);
  const gpHide = teacher.page.getByRole('button', { name: 'Hide solution' });
  if (await gpHide.isVisible().catch(() => false)) await gpHide.click();
  await wait(600);
  text = await textOf(teacher);
  check(/\+15\b/.test(text), 'the round results do not show first place its 15 championship points', 'the round results show first place +15 (championship points)');
  const gpRound = (await roomRef(gpId).collection('hostRounds').doc('0').get()).data();
  check(gpRound?.standings?.some((row) => row.rank === 1 && row.matchPointsAwarded === 15), 'the round did not award 15 to first place', 'first place earned 15 championship points (the engine\'s table)');
  await shot(teacher, 'S01-grand-prix-results');
  await teacher.page.getByRole('button', { name: 'End Game' }).click();
  await confirmDialog(teacher, 'End Game');
  await waitForRoom(gpId, (room) => room.status === 'finished', 30_000);
  await waitForArena(teacher, 'completed', 15_000);
  const gpResult = (await db.collection('liveChallengeMatchResults').doc(gpId).get()).data();
  check(gpResult?.scoringStrategyId === 'grandPrix', `the match result is scored by ${gpResult?.scoringStrategyId}`, 'the match result records Grand Prix');
  // PLAY AGAIN keeps the choice (as it keeps the projector choice above).
  await teacher.page.locator('[data-mm-primary-action="playAgain"]').first().click();
  const gpReplay = await (async () => {
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
      const id = await activeRoomId();
      if (id && id !== gpId) return id;
      await wait(300);
    }
    return null;
  })();
  check(gpReplay, 'Play Again did not create a new room', 'Play Again creates a new room');
  if (gpReplay) {
    const replayRoom = await roomOf(gpReplay);
    check(replayRoom.scoringStrategyId === 'grandPrix' && replayRoom.speedInfluencePercent === 20, `Play Again scored by ${replayRoom.scoringStrategyId}, speed ${replayRoom.speedInfluencePercent}`, 'Play Again keeps Grand Prix (and the default speed)');
    await teacherCall('cancelLiveChallenge', { roomId: gpReplay }).catch(() => {});
  }
  await teacher.page.getByRole('button', { name: 'Exit Projector View' }).click().catch(() => {});

  check(teacher.errors.length === 0, `console errors: ${teacher.errors.slice(0, 3).join(' | ')}`, 'no console errors');
  const refused = bridgeCalls.filter((call) => !call.ok);
  log(`  · refused callables: ${JSON.stringify(refused)}`);
  check(refused.every((call) => call.name === 'closeLiveChallengeRound' && ['extended_time', 'round_in_progress'].includes(call.lifecycle?.reason || call.lifecycle)), 'a callable failed for a reason other than a not-yet close', 'the only refusals are not-yet closes');
} catch (error) {
  finding(`threw: ${error?.stack || error}`);
  await shot(teacher, `crash-${Date.now()}`);
} finally {
  const leftover = await activeRoomId().catch(() => null);
  if (leftover) await teacherCall('cancelLiveChallenge', { roomId: leftover }).catch(() => {});
}

/* --------------------------------- report --------------------------------- */

writeFileSync(path.join(SHOTS, 'findings.json'), JSON.stringify({ findings, checks, screenshots: SHOTS }, null, 2));
log(findings.length ? `✗ ${findings.length} finding(s)` : `✓ no findings (${checks.length} checks)`);
await browser.close();
bridge.close();
await vite.close();
await stopAll();
process.exit(findings.length ? 1 : 0);
