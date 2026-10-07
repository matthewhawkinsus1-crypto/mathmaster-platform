// A student's Live Challenge screen as a teaching tool, played in real
// browsers against the REAL server: nobody publicly last, worked solutions at
// the right moment, a missed-round notice after a reconnect, extended time and
// Read aloud, and a final card that leads with what the student did.
//
// HOW TO RUN (one command; it starts the emulator, the bridge and Vite). The
// ports are shared with the other Live Challenge harnesses, so hold the lock:
//
//   flock /tmp/mm-emulator.lock node tests/browser/liveChallengeTeachingQa.mjs
//   TEACHING_QA_SHOTS=/some/dir …        # where screenshots go
//
// THE GAME. A Standard Challenge, three rounds of 20 s, Second Chance on, in a
// class of five: Ana on a Chromebook (1366×768) and Ben on a phone (390×844)
// in real browsers — Ben with extended time and text-to-speech on his support
// plan — and three bot classmates who answer every round correctly through
// the same callables. Ana wins; Ben misses round 1, is away for round 2,
// answers round 3 inside his extended time after the class's clock has run
// out, and gets round 1 back as a Second Chance. Then:
//
//   round      no board, no rank and no place under the question (both sizes);
//              Ben's Read aloud speaks the prompt; Ben's own clock outlasts
//              the class's and his late answer is accepted
//   results    round 1's solution is HELD (it is coming back as a Second
//              Chance); round 3's results show a worked solution; the replay's
//              results show round 1's solution
//   reconnect  Ben comes back after round 2 closed without him and is told so
//              once, in words, and can dismiss it
//   final      Ana's card leads with her podium place (confetti); Ben's leads
//              with what he did and shows his place as a private line; both
//              say what the game counts for; the recap lists their rounds
//
// The driver plays the teacher through the real callables (no console), so
// it closes each round itself once everyone who will answer has.
//
// NOTHING TOUCHES PRODUCTION: firebase.js is swapped for an emulator module,
// the browsers block every non-local request, and the project id is
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
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const PROJECT = 'mathmaster-game-harness';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8182';
const VITE_PORT = Number(process.env.TEACHING_QA_VITE_PORT || 5198);
const BRIDGE_PORT = Number(process.env.TEACHING_QA_BRIDGE_PORT || 5299);
const ORIGIN = `http://localhost:${VITE_PORT}`;
const BRIDGE = `http://localhost:${BRIDGE_PORT}`;
const SHOTS = process.env.TEACHING_QA_SHOTS || path.join(repo, 'tests/browser/artifacts/live-challenge-teaching');
const ROUND_SECONDS = 20;
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

const authFor = (identity = {}) => (identity.as === 'teacher'
  ? { uid: `${identity.email}-uid`, token: { role: 'teacher', email: identity.email, email_verified: true } }
  : { uid: `${identity.studentId}-uid`, token: { role: 'student', studentId: identity.studentId, email: `${identity.studentId}@example.com`, email_verified: true } });

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
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: result ?? null }));
  } catch (error) {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: error?.code || 'internal', message: error?.message || String(error), details: error?.details ?? null }));
  }
});
await new Promise((resolve) => bridge.listen(BRIDGE_PORT, resolve));

const vite = spawn(
  'npx',
  ['vite', '--config', path.join(here, 'liveChallengeTeachingQa.vite.config.mjs'), '--port', String(VITE_PORT), '--strictPort'],
  { cwd: repo, stdio: 'ignore', detached: true },
);
started.push(vite);
if (!await waitForHttp(`${ORIGIN}/`)) {
  console.error('Vite did not start.');
  process.exit(2);
}

/* ------------------------------ class and bank ------------------------------ */

const TEACHER = 'teaching-qa-teacher@example.com';
const CLASS_ID = 'teaching-qa-p2';
const STUDENTS = [
  { id: `${CLASS_ID}-s01`, first: 'Ana', last: 'Rivera' },
  // Extended time and text-to-speech on his plan (the server reads the first,
  // the screen the second — as App passes user.profile).
  { id: `${CLASS_ID}-s02`, first: 'Ben', last: 'Tran', profile: { accommodations: ['extra-time', 'text-to-speech'] } },
  { id: `${CLASS_ID}-s03`, first: 'Cara', last: 'Lopez' },
  { id: `${CLASS_ID}-s04`, first: 'Dev', last: 'Patel' },
  { id: `${CLASS_ID}-s05`, first: 'Eli', last: 'Brooks' },
];
const [ANA, BEN, ...BOTS] = STUDENTS.map((student) => student.id);
await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: 'P2', name: 'Period 2 Algebra I' });
for (const student of STUDENTS) {
  await db.collection('grades').doc(student.id).set({
    assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: 'P2', firstName: student.first, lastName: student.last,
    ...(student.profile ? { profile: student.profile } : {}),
  });
}

// Gradable choice questions, so a browser answers by clicking and a bot by
// sending the server's own expected value.
const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    const instantiated = await mathPath.instantiateQuestion(item, `teaching-qa|${item.id}`);
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
const teacherCall = (name, data) => functionsIndex[name].run({ auth: authFor({ as: 'teacher', email: TEACHER }), data, rawRequest: { headers: {} } });
const botCall = (name, studentId, data) => functionsIndex[name].run({ auth: authFor({ as: 'student', studentId }), data, rawRequest: { headers: {} } });
const expectedFor = async (roomId, roundIndex) => {
  const state = (await db.collection('liveChallengePrivate').doc(roomId).get()).data();
  const questionId = state.questionIds[roundIndex];
  const authored = state.roundQuestions?.[roundIndex] || (await db.collection('pathQuestionBank').doc(questionId).get()).data();
  const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${roundIndex}|${questionId}`);
  return (await mathPath.buildIssuePlan(instantiated.question)).privateGrading.fields;
};
const botAnswer = async (roomId, studentId, { correct = true, humanElapsedMs = 6_000 } = {}) => {
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

/* -------------------------------- browsers -------------------------------- */

const DEVICES = Object.freeze({
  chromebook: { viewport: { width: 1366, height: 768 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
});
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const findings = [];
const checks = [];
const finding = (problem) => { findings.push(problem); log(`  ✗ ${problem}`); };
const check = (condition, problem, passed = null) => {
  checks.push({ ok: Boolean(condition), what: passed || problem });
  if (!condition) finding(problem);
  else log(`  ✓ ${passed || problem.replace(/^no |^the /, '')}`);
  return Boolean(condition);
};
const IGNORABLE_CONSOLE = /ERR_FAILED|ERR_INTERNET_DISCONNECTED|net::|Failed to fetch|WebChannel|transport errored|Could not reach|math fonts could not be loaded|Download the React DevTools|offline|unavailable/i;

// Speech is recorded, not played: the check is what the screen asked to read.
const recordSpeech = () => {
  window.__mmSpoken = [];
  if (!window.speechSynthesis) return;
  window.speechSynthesis.speak = (utterance) => { window.__mmSpoken.push(String(utterance?.text || '')); };
  window.speechSynthesis.cancel = () => { window.__mmSpoken.push('<cancel>'); };
};

const studentUrl = (studentId, accommodations = []) => `${ORIGIN}/tests/browser/liveChallengeTeachingQaStudent.html?studentId=${encodeURIComponent(studentId)}&emulator=${EMULATOR}&bridge=${BRIDGE}${accommodations.length ? `&accommodations=${accommodations.join(',')}` : ''}`;
const openStudent = async (studentId, device, accommodations = []) => {
  const context = await browser.newContext({ ...DEVICES[device] });
  await context.route('**/*', (route) => (/^(http|ws)s?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(route.request().url()) ? route.continue() : route.abort()));
  await context.addInitScript(recordSpeech);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error' && !IGNORABLE_CONSOLE.test(message.text())) errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error?.message || error}`));
  await page.goto(studentUrl(studentId, accommodations), { waitUntil: 'domcontentloaded' });
  return { page, context, errors, device, studentId };
};
const textOf = async (handle) => (await handle.page.locator('body').innerText()).replace(/\s+/g, ' ');
const waitForText = async (handle, needle, timeout = 15_000) => {
  try {
    await handle.page.waitForFunction((value) => document.body.innerText.replace(/\s+/g, ' ').toLowerCase().includes(value.toLowerCase()), needle, { timeout });
    return true;
  } catch { return false; }
};
const waitForSelector = async (handle, selector, timeout = 15_000) => {
  try { await handle.page.locator(selector).first().waitFor({ timeout }); return true; } catch { return false; }
};
const waitForStage = async (handle, stage, timeout = 20_000) => {
  try {
    await handle.page.waitForFunction((value) => document.querySelector('[data-mm-student-stage]')?.getAttribute('data-mm-student-stage') === value, stage, { timeout });
    return true;
  } catch { return false; }
};
const shot = async (handle, name, { fullPage = false } = {}) => {
  await handle.page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage, animations: 'disabled' }).catch(() => {});
  log(`  · shot ${name}.png`);
};
const overflowX = (handle) => handle.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
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
// What sits under the question while a round is open: nothing that ranks.
const roundShowsNoRank = async (handle, label) => {
  const text = await textOf(handle);
  check(!/Top 5/.test(text), `${label}: a "Top 5" board is under the question`, `${label}: no board under the question`);
  check(!/Rank #|#\d+ ·|You: [T#]/.test(text), `${label}: a rank is on the round screen`, `${label}: no rank on the round screen`);
  check(!/\b\d+(st|nd|rd|th) of \d+/.test(text), `${label}: a place ("Nth of M") is on the round screen`, `${label}: no place on the round screen`);
};
const closeRound = async (roomId) => {
  const room = await roomOf(roomId);
  await teacherCall('closeLiveChallengeRound', { roomId, force: true, expectedRoundIndex: room.currentRound, expectedRoundVersion: room.roundVersion });
  return waitForRoom(roomId, (next) => next.roundState === 'closed' || next.status === 'finished', 15_000);
};
const advance = async (roomId) => {
  const room = await roomOf(roomId);
  await teacherCall('advanceLiveChallenge', { roomId, expectedRoundIndex: room.currentRound, expectedRoundVersion: room.roundVersion });
  return waitForRoom(roomId, (next) => next.status === 'finished' || (next.currentRound !== room.currentRound && next.roundState !== 'closed'), 20_000);
};
const untilGo = async (room) => { await wait(Math.max(0, ms(room.startsAt) - Date.now()) + 1_200); };

/* ================================ the game ================================ */

let ana = null;
let ben = null;
try {
  const created = await teacherCall('createLiveChallenge', {
    classId: CLASS_ID, courseId: 'algebra1', standardCode: 'mixed', questionStyle: 'noTools',
    roundCount: 3, roundSeconds: ROUND_SECONDS, secondChanceMode: 'automatic',
  });
  const roomId = created.roomId;
  log(`room ${roomId}`);
  ana = await openStudent(ANA, 'chromebook');
  ben = await openStudent(BEN, 'phone', ['text-to-speech']);
  for (const id of BOTS) await botCall('joinLiveChallenge', id, { roomId });
  check(await waitForText(ana, 'You are in as', 20_000) && await waitForText(ben, 'You are in as', 20_000), 'no lobby on both screens', 'both students in the lobby');
  await wait(1_500); // both joins land

  /* ---- round 1: no rank under the question; Read aloud; Ben misses it ---- */
  await teacherCall('startLiveChallenge', { roomId });
  let room = await waitForRoom(roomId, (next) => next.status === 'running');
  await untilGo(room);
  check(await waitForStage(ana, 'roundActive', 10_000), 'Ana never reached the round', 'Ana reached round 1');
  await roundShowsNoRank(ana, 'round 1, Ana (1366)');
  await roundShowsNoRank(ben, 'round 1, Ben (390)');
  await shot(ana, 'S01-round-open-1366');
  await shot(ben, 'S01-round-open-390');
  // Read aloud: Ben's plan grants it; Ana's does not.
  check(await ana.page.locator('[data-mm-read-aloud]').count() === 0, 'Ana (no text-to-speech on her plan) was offered Read aloud', 'Read aloud is not offered without the accommodation');
  const readAloud = ben.page.locator('[data-mm-read-aloud]');
  if (check(await readAloud.count() === 1, 'Ben (text-to-speech on his plan) has no Read aloud button', 'Read aloud is offered to Ben')) {
    await readAloud.click();
    const spoken = await ben.page.evaluate(() => window.__mmSpoken.filter((entry) => entry !== '<cancel>'));
    const prompt = String(room.currentQuestion?.prompt || '').slice(0, 12);
    check(spoken.length === 1 && spoken[0].length > 0, `Read aloud spoke nothing (${JSON.stringify(spoken)})`, `Read aloud spoke the prompt ("${spoken[0]?.slice(0, 50)}…", prompt starts "${prompt}")`);
  }
  // Ben's extended time is his own: his screen says so, Ana's does not.
  check(await ben.page.locator('[data-mm-extended-time]').count() === 1, 'Ben\'s screen does not say his extra time is on', 'Ben\'s screen says his extra time is on');
  check(await ana.page.locator('[data-mm-extended-time]').count() === 0, 'Ana\'s screen claims extra time', 'Ana\'s clock is the class\'s');
  await answerInBrowser(ana, roomId, { correct: true });
  await answerInBrowser(ben, roomId, { correct: false });
  for (const id of BOTS) await botAnswer(roomId, id, { correct: true });
  check(await waitForText(ana, 'Correct!', 10_000), 'Ana got no feedback on her answer', 'Ana got her own feedback');
  const anaFeedback = await textOf(ana);
  check(!/Rank #/.test(anaFeedback), 'the answer feedback carries "Rank #"', 'the answer feedback carries points, never a rank');
  await roundShowsNoRank(ana, 'round 1 after answering, Ana');
  await shot(ana, 'S02-answered-feedback-1366');
  await closeRound(roomId);

  /* ---- round 1 results: its solution is HELD (it is coming back) ---- */
  check(await waitForStage(ana, 'roundResults', 15_000), 'Ana never reached round 1 results', 'Ana reached round 1 results');
  check(await waitForSelector(ana, '[data-mm-round-solution="held"]', 8_000), 'round 1 results do not say the solution is held for the Second Chance', 'round 1\'s solution is held (it may come back)');
  check(await ana.page.locator('[data-mm-round-solution="ready"]').count() === 0, 'round 1\'s worked solution showed while a Second Chance of it may come', 'no worked solution for round 1 yet');
  await shot(ana, 'S03-results-solution-held-1366');
  await waitForStage(ben, 'roundResults', 10_000);
  await shot(ben, 'S03-results-solution-held-390');

  /* ---- round 2: Ben is away ---- */
  await ben.context.setOffline(true);
  room = await advance(roomId);
  await untilGo(room);
  await answerInBrowser(ana, roomId, { correct: true });
  for (const id of BOTS) await botAnswer(roomId, id, { correct: true });
  await wait(1_000);
  await closeRound(roomId);
  check(await waitForStage(ana, 'roundResults', 15_000), 'Ana never reached round 2 results', 'Ana reached round 2 results');

  /* ---- round 3: Ben is back, is told about round 2, and plays in his own time ---- */
  room = await advance(roomId);
  await ben.context.setOffline(false);
  const notice = await waitForSelector(ben, '[data-mm-missed-rounds]', 25_000);
  if (check(notice, 'Ben came back after round 2 closed without him and was not told', 'Ben is told round 2 closed while he was away')) {
    const words = await ben.page.locator('[data-mm-missed-rounds]').innerText();
    check(/Round 2 closed while you were away/.test(words) && !/Round 1/.test(words), `the notice says the wrong thing: "${words}"`, `the notice reads "${words.replace(/\s+/g, ' ').replace('Got it', '').trim()}"`);
    await shot(ben, 'S04-reconnect-missed-round-390');
  }
  await untilGo(room);
  const clocks = {
    ben: await ben.page.locator('[aria-label$="seconds left"]').first().getAttribute('aria-label').catch(() => null),
    ana: await ana.page.locator('[aria-label$="seconds left"]').first().getAttribute('aria-label').catch(() => null),
  };
  check(parseInt(clocks.ben, 10) > parseInt(clocks.ana, 10) + 4, `Ben's clock is not his own (${JSON.stringify(clocks)})`, `Ben's clock runs to his own deadline (${clocks.ben} vs Ana's ${clocks.ana})`);
  // Ana and two classmates answer; the third does not. Three of five stays
  // under the closing threshold, so the class's clock is not shortened and
  // the round runs to its deadline (an answered-out class shortens every
  // clock, extended ones with it — see the report).
  await answerInBrowser(ana, roomId, { correct: true });
  for (const id of BOTS.slice(0, 2)) await botAnswer(roomId, id, { correct: true });
  if (notice) {
    await ben.page.getByRole('button', { name: 'Got it' }).click();
    check(await ben.page.locator('[data-mm-missed-rounds]').count() === 0, 'the missed-round notice cannot be dismissed', 'the missed-round notice is dismissed with "Got it"');
  }
  // The class's clock runs out; Ben's does not.
  await wait(Math.max(0, ms(room.roundEndsAt) - Date.now()) + 2_500);
  const benAfterDeadline = await textOf(ben);
  check(!/Time is up/.test(benAfterDeadline), 'Ben\'s round said "Time is up" at the class\'s deadline', 'Ben\'s round is still open after the class\'s deadline');
  check(await ben.page.locator('[data-mm-game] [role="radio"]').first().isEnabled().catch(() => false), 'Ben cannot answer after the class\'s deadline', 'Ben can still answer inside his extended time');
  await roundShowsNoRank(ben, 'round 3 in extended time, Ben');
  await shot(ben, 'S05-extended-time-after-class-deadline-390');
  await answerInBrowser(ben, roomId, { correct: true });
  check(await waitForText(ben, 'Correct!', 10_000), 'Ben\'s answer inside his extended time was not accepted', 'Ben\'s answer inside his extended time was accepted');
  await closeRound(roomId);

  /* ---- round 3 results: a worked solution (round 3 will not come back) ---- */
  check(await waitForStage(ana, 'roundResults', 15_000), 'Ana never reached round 3 results', 'Ana reached round 3 results');
  check(await waitForSelector(ana, '[data-mm-round-solution="ready"]', 10_000), 'round 3 results show no worked solution', 'round 3 results show the worked solution');
  await ana.page.locator('[data-mm-round-solution="ready"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await shot(ana, 'S06-results-worked-solution-1366');
  await waitForStage(ben, 'roundResults', 10_000);
  await ben.page.locator('[data-mm-round-solution="ready"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await shot(ben, 'S06-results-worked-solution-390');

  /* ---- Second Chance rounds, then the end ---- */
  for (let replay = 0; replay < 4; replay += 1) {
    room = await advance(roomId);
    if (!room || room.status === 'finished') break;
    await untilGo(room);
    check(await ben.page.locator('[data-mm-round-solution]').count() === 0, 'a solution is on Ben\'s screen during an open Second Chance round', 'no solution during the open Second Chance round');
    await roundShowsNoRank(ben, `Second Chance ${replay + 1}, Ben`);
    await shot(ben, `S07-second-chance-open-${replay + 1}-390`);
    await answerInBrowser(ben, roomId, { correct: true }).catch(() => {});
    await answerInBrowser(ana, roomId, { correct: true }).catch(() => {});
    for (const id of BOTS) await botAnswer(roomId, id, { correct: true }).catch(() => {});
    await wait(1_000);
    await closeRound(roomId);
    await waitForStage(ben, 'roundResults', 15_000);
    check(await waitForSelector(ben, '[data-mm-round-solution="ready"]', 10_000), `the Second Chance ${replay + 1} results show no worked solution`, `the Second Chance ${replay + 1} results show the worked solution`);
    await ben.page.locator('[data-mm-round-solution="ready"]').first().scrollIntoViewIfNeeded().catch(() => {});
    await shot(ben, `S08-second-chance-solution-${replay + 1}-390`);
  }
  if ((await roomOf(roomId)).status !== 'finished') {
    await teacherCall('finishLiveChallenge', { roomId }).catch(async () => advance(roomId));
  }
  room = await waitForRoom(roomId, (next) => next.status === 'finished', 20_000);
  check(room, 'the game never finished', 'the game finished');

  /* ---- the final cards ---- */
  check(await waitForStage(ana, 'completed', 20_000) && await waitForStage(ben, 'completed', 20_000), 'a final screen is missing', 'both final screens');
  check(await waitForSelector(ana, '[data-mm-final-headline]', 15_000) && await waitForSelector(ben, '[data-mm-final-headline]', 15_000), 'a final place never loaded', 'both final places loaded');
  const anaHeadline = await ana.page.locator('[data-mm-final-headline]').getAttribute('data-mm-final-headline');
  const benHeadline = await ben.page.locator('[data-mm-final-headline]').getAttribute('data-mm-final-headline');
  check(anaHeadline === 'place', `Ana (podium) leads with "${anaHeadline}", not her place`, 'Ana\'s podium finish leads with her place');
  check(benHeadline === 'effort', `Ben (not on the podium) leads with "${benHeadline}"`, 'Ben\'s card leads with what he did');
  const benFinal = await textOf(ben);
  check(/Your place: .* of 5/.test(benFinal), 'Ben\'s quiet place line is missing', 'Ben\'s place is a quiet line under what he did');
  // In a class of five every place is on the public top five, so the card
  // must not promise that only Ben sees his (finalPlaceIsPrivate).
  check(!/only you see this/.test(benFinal), 'Ben\'s card calls a place on the public top five private', 'no false privacy promise for a top-five place');
  check(/Game points are just for the game — they don’t change any grade\./.test(benFinal), 'the final card does not say what the game counts for', 'the final card says game points change no grade');
  check(!/does not change your assignment grade/.test(benFinal), 'the old, false grade sentence is still on the card', 'the old grade sentence is gone');
  check(await ana.page.locator('.mm-shell-confetti').count() === 1, 'the podium finish has no confetti', 'confetti on the podium');
  check(await ben.page.locator('.mm-shell-confetti').count() === 0, 'confetti for a finish off the podium', 'no confetti off the podium');
  const recapShown = await waitForSelector(ben, '[data-mm-student-recap]', 15_000);
  check(recapShown, 'Ben\'s recap never appeared', 'Ben\'s own recap lists his rounds');
  if (recapShown) {
    const rounds = await ben.page.locator('[data-mm-recap-round]').evaluateAll((items) => items.map((item) => item.getAttribute('data-mm-recap-round')));
    note('Ben\'s recap rounds', rounds);
    check(rounds.includes('none'), 'Ben\'s recap does not show the round he missed as "No answer"', 'the recap shows his missed round as "No answer"');
  }
  check(await ben.page.locator('[data-mm-rewards-slot]').count() === 1, 'the rewards slot is not on the final card', 'the rewards slot is on the final card');
  for (const handle of [ana, ben]) check(await overflowX(handle) <= 1, `${handle.device}: the final screen scrolls sideways`, `${handle.device}: no sideways scroll`);
  // The recap's worked solutions, in view (MathLive typesets on screen).
  const lastRound = ben.page.locator('[data-mm-recap-round]').last();
  await lastRound.scrollIntoViewIfNeeded().catch(() => {});
  await wait(800);
  await shot(ben, 'S11-recap-solution-in-view-390');
  await ben.page.evaluate(() => window.scrollTo(0, 0));
  await wait(300);
  await shot(ana, 'S09-final-podium-1366');
  await shot(ben, 'S09-final-not-podium-390');
  await shot(ana, 'S10-final-podium-1366-full', { fullPage: true });
  await shot(ben, 'S10-final-not-podium-390-full', { fullPage: true });
  for (const handle of [ana, ben]) check(handle.errors.length === 0, `console errors on ${handle.device}: ${handle.errors.slice(0, 3).join(' | ')}`, `${handle.device}: no console errors`);
} catch (error) {
  finding(`threw: ${error?.stack || error}`);
}

function note(label, value) { log(`  · ${label}: ${JSON.stringify(value)}`); }

for (const handle of [ana, ben]) await handle?.context.close().catch(() => {});
await browser.close();
writeFileSync(path.join(SHOTS, 'findings.json'), JSON.stringify({ findings, checks }, null, 2));
log(findings.length ? `${findings.length} finding(s); screenshots in ${SHOTS}` : `all ${checks.length} checks passed; screenshots in ${SHOTS}`);
bridge.close();
await stopAll();
process.exit(findings.length ? 1 : 0);
