// Three Live Challenge matches in a row on one student screen, in a real
// browser against a real Firestore.
//
// HOW TO RUN (one command, it starts everything):
//
//   node tests/browser/liveChallengeRepeatedMatches.mjs
//
// WHY THIS EXISTS. A class plays two or three matches in a period. The student
// screen used to keep the first one: the room snapshot guard compared round
// numbers without asking which room they belonged to, so a finished room A
// (round 9) rejected room B's lobby (round -1) as "older", and the student sat
// on A's "Challenge complete" over B's players. This plays A to the finish,
// then B, then C, on one mounted page — the harness mounts the student screen
// without a per-room key, so it exercises the screen's own reset as well as
// the snapshot guard — and refreshes mid-round to check an answered round
// stays answered.
//
// Same infrastructure as liveChallengeGame.mjs: the real component and snapshot
// watchers, the emulator, and callable stubs that write what the server would.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const PORT = Number(process.env.GAME_PORT || 5198);
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8182';
const ORIGIN = `http://localhost:${PORT}`;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const waitForHttp = async (url, attempts = 60) => {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return true;
    } catch { /* not up yet */ }
    await wait(500);
  }
  return false;
};

// Each child runs in its own process group so stopping it also stops what it
// started (the emulator's JVM, Vite's workers); killing only the npx wrapper
// leaves a stale emulator holding the port and the previous run's data.
const started = [];
const stopAll = () => {
  for (const child of started) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
  }
};
process.on('exit', stopAll);
// The Firebase CLI stops its emulator JVM on SIGINT; a SIGKILL to the CLI
// alone would orphan it. Ask nicely, wait for the port to close, then insist.
const shutdown = async () => {
  for (const child of started) { try { process.kill(-child.pid, 'SIGINT'); } catch { /* gone */ } }
  for (let i = 0; i < 20; i += 1) {
    try { await fetch(`http://${EMULATOR}/`); } catch { break; }
    await wait(250);
  }
  stopAll();
};

process.env.FIRESTORE_EMULATOR_HOST = EMULATOR;
const emulator = spawn(
  'npx',
  ['firebase', 'emulators:start', '--only', 'firestore', '--project', 'mathmaster-game-harness',
    '--config', path.join(here, 'emulator/firebase.json')],
  { cwd: path.join(here, 'emulator'), stdio: 'ignore', detached: true },
);
started.push(emulator);
if (!await waitForHttp(`http://${EMULATOR}/`)) { console.error('Firestore emulator did not start.'); process.exit(2); }
// Start from an empty database even if an earlier emulator is still running.
await fetch(`http://${EMULATOR}/emulator/v1/projects/mathmaster-game-harness/databases/(default)/documents`, { method: 'DELETE' });

const vite = spawn(
  'npx',
  ['vite', '--config', path.join(here, 'emulator/vite.config.mjs'), '--port', String(PORT), '--strictPort'],
  { cwd: repo, stdio: 'ignore', detached: true },
);
started.push(vite);
if (!await waitForHttp(`${ORIGIN}/`)) { console.error('Vite did not start.'); process.exit(2); }

const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'mathmaster-game-harness' });
const db = admin.firestore();
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));

// A real question from the seed bank, through the production issuability gate.
const seedDir = path.join(repo, 'functions/seeds/pathQuestionBank');
const pickQuestion = async () => {
  for (const file of readdirSync(seedDir).filter((name) => name.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(path.join(seedDir, file), 'utf8'));
    for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
      // eslint-disable-next-line no-await-in-loop
      const instantiated = await mathPath.instantiateQuestion(item, `repeatHarness|${item.id}`);
      if (!instantiated?.question || !mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
      // eslint-disable-next-line no-await-in-loop
      const plan = await mathPath.buildIssuePlan(instantiated.question);
      if (!plan?.issuable) continue;
      return { instantiated, plan };
    }
  }
  return null;
};
const picked = await pickQuestion();
if (!picked) { console.error('No issuable multiple-choice question in the seed bank.'); process.exit(2); }
const questionFor = (roomId, round) => ({
  ...mathPath.buildSanitizedQuestion(picked.instantiated.question, {
    questionInstanceId: `challenge_${roomId}_r${round + 1}`, attemptsAllowed: 1, attemptsUsed: 0, toolPayload: picked.plan.toolPayload,
  }),
  challengeRound: round,
});

const MATCHES = [
  { roomId: 'repeat-room-a', title: 'Period 3 — Match 1', playerKey: 'repeat-key-a', alias: 'Swift Otter', rival: 'Bright Heron' },
  { roomId: 'repeat-room-b', title: 'Period 3 — Match 2', playerKey: 'repeat-key-b', alias: 'Calm Falcon', rival: 'Quiet Lynx' },
  { roomId: 'repeat-room-c', title: 'Period 3 — Match 3', playerKey: 'repeat-key-c', alias: 'Bold Comet', rival: 'Tidy Moose' },
];
const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);

const seedLobby = async (match) => {
  await roomRef(match.roomId).set({
    schemaVersion: 2, roomId: match.roomId, title: match.title, status: 'lobby', roundCount: 3, roundSeconds: 30,
    currentRound: -1, roundVersion: 0, currentQuestion: null, roundState: null, scoringStrategyId: 'accuracyFirst',
  });
  // The rival has already joined; this student has not — the screen must join them.
  await roomRef(match.roomId).collection('players').doc(`${match.playerKey}-rival`).set({
    playerKey: `${match.playerKey}-rival`, alias: match.rival, joined: true, score: 0, correctCount: 0, roundsAnswered: 0, answeredRound: -1,
  });
};
const joinStudent = (match) => roomRef(match.roomId).collection('players').doc(match.playerKey).set({
  playerKey: match.playerKey, alias: match.alias, joined: true, score: 0, correctCount: 0, roundsAnswered: 0, answeredRound: -1,
});
const openRound = async (match, round) => {
  const startsAt = Date.now() - 100;
  await roomRef(match.roomId).set({
    status: 'running', roundState: 'open', currentRound: round, roundVersion: round + 1, roundToken: `${match.roomId}-token-${round}`,
    phase: 'answering', currentQuestion: questionFor(match.roomId, round),
    startsAt, endsAt: startsAt + 30_000, roundStartedAt: startsAt, roundEndsAt: startsAt + 30_000,
  }, { merge: true });
};
const finish = (match, scores) => Promise.all([
  roomRef(match.roomId).set({ status: 'finished', roundState: 'closed', currentQuestion: null, endsAt: null, roundEndsAt: null }, { merge: true }),
  roomRef(match.roomId).collection('players').doc(match.playerKey).set({ score: scores.self, correctCount: 3, roundsAnswered: 3 }, { merge: true }),
  roomRef(match.roomId).collection('players').doc(`${match.playerKey}-rival`).set({ score: scores.rival, correctCount: 1, roundsAnswered: 3 }, { merge: true }),
]);

// ---- the browser ------------------------------------------------------------
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext();
await context.route('**/*', (route) => (/^(http|ws)s?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(route.request().url()) ? route.continue() : route.abort()));
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

const gameUrl = `${ORIGIN}/tests/browser/liveChallengeGame.html?emulator=${EMULATOR}`;
const mount = (match) => page.evaluate((invite) => window.__mmGameMount(invite), {
  roomId: match.roomId, title: match.title, alias: match.alias, playerKey: match.playerKey, status: 'invited',
});
const screen = () => page.evaluate(() => (document.querySelector('[data-mm-game]')?.innerText || document.body.innerText || '').replace(/\s+/g, ' ').trim());
const calls = () => page.evaluate(() => window.__mmGameCalls || []);

const results = [];
const check = async (name, { contains = [], absent = [] } = {}, settleMs = 900) => {
  await wait(settleMs);
  const text = await screen();
  // innerText applies CSS text-transform, so labels are compared case-insensitively.
  const seen = text.toLowerCase();
  const problems = [
    ...contains.filter((needle) => !seen.includes(needle.toLowerCase())).map((needle) => `missing: ${needle}`),
    ...absent.filter((needle) => seen.includes(needle.toLowerCase())).map((needle) => `should not show: ${needle}`),
    ...pageErrors.splice(0).map((error) => `page error: ${error}`),
  ];
  results.push({ name, ok: problems.length === 0, problems, text: text.slice(0, 160) });
};

await page.goto(gameUrl, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__mmGameMount === 'function', { timeout: 30000 });

for (const [index, match] of MATCHES.entries()) {
  const previous = MATCHES[index - 1] || null;
  await seedLobby(match);
  // The invite moves to the next room exactly as liveChallengeInvites does.
  await mount(match);
  await check(`match ${index + 1}: lobby of the new room`, {
    contains: [match.title, match.alias],
    absent: ['Challenge complete', 'Final Standings', ...(previous ? [previous.title, previous.alias, previous.rival] : [])],
  });
  const joins = (await calls()).filter((entry) => entry.name === 'joinLiveChallenge' && entry.payload?.roomId === match.roomId);
  results.push({ name: `match ${index + 1}: the screen joins the new room`, ok: joins.length >= 1, problems: joins.length ? [] : ['no join call for the new room'], text: '' });
  await joinStudent(match);

  await openRound(match, 0);
  await check(`match ${index + 1}: round 1 opens`, { contains: ['Round 1 of 3'], absent: ['Challenge complete'] }, 1800);

  if (index === 1) {
    // Answer, then refresh: the round must stay answered, not reopen.
    // Choices render as role="radio" buttons.
    await page.evaluate(() => {
      document.querySelector('[data-mm-game] [role="radio"]')?.click();
    });
    await wait(300);
    await page.evaluate(() => {
      const lock = [...document.querySelectorAll('[data-mm-game] button')].find((button) => /lock in/i.test(button.innerText));
      lock?.click();
    });
    await check('match 2: answer recorded', { contains: ['Correct!'] }, 1500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.__mmGameMount === 'function', { timeout: 30000 });
    await mount(match);
    await check('match 2: after a refresh the answered round shows its result', { contains: ['Correct!'] }, 2500);
    const reopened = await page.evaluate(() => {
      const choice = document.querySelector('[data-mm-game] [role="radio"]');
      return Boolean(choice && !choice.disabled);
    });
    results.push({ name: 'match 2: the refreshed round does not reopen', ok: !reopened, problems: reopened ? ['the question reopened after a refresh'] : [], text: '' });
    // Another device, nothing in local storage: the public row still locks it.
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.__mmGameMount === 'function', { timeout: 30000 });
    await mount(match);
    await check('match 2: on a fresh device the round stays locked', {
      contains: ['Your answer for this round is recorded'],
    }, 2500);
    const lockable = await page.evaluate(() => {
      const choice = document.querySelector('[data-mm-game] [role="radio"]');
      return Boolean(choice && !choice.disabled);
    });
    results.push({ name: 'match 2: answer controls are disabled', ok: !lockable, problems: lockable ? ['the question reopened'] : [], text: '' });
    // Two refreshes after answering, and the round was still answered once.
    const answered = (await roomRef(match.roomId).collection('players').doc(match.playerKey).get()).data() || {};
    results.push({
      name: 'match 2: the refreshes never answered the round again',
      ok: Number(answered.roundsAnswered) === 1,
      problems: Number(answered.roundsAnswered) === 1 ? [] : [`roundsAnswered is ${answered.roundsAnswered}`],
      text: '',
    });
  }

  await finish(match, { self: 3000 + index * 100, rival: 1000 });
  await check(`match ${index + 1}: finish shows this match's standings`, {
    contains: ['Challenge complete', match.alias, (3000 + index * 100).toLocaleString()],
    absent: previous ? [previous.alias, previous.rival] : [],
  });
}


await browser.close();
await shutdown();

for (const row of results) {
  console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${row.name}`);
  if (row.text) console.log(`       "${row.text}"`);
  for (const problem of row.problems) console.log(`       -> ${problem}`);
}
const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
