// Play a whole Live Challenge in a real browser and read every screen.
//
// HOW TO RUN (one command, it starts everything):
//
//   node tests/browser/liveChallengeGame.mjs
//   node tests/browser/liveChallengeGame.mjs --write     # refresh the fixture
//
// WHY THIS EXISTS. The render check covers the routing and the Warm-Up shell,
// but stops at "Opening Live Challenge…" because everything past that needs
// live room data. This supplies that data from the Firestore emulator, so the
// screens a student spends the whole activity looking at — the lobby, a round
// with its countdown, the leaderboard, the finish — are rendered and read
// rather than assumed.
//
// WHAT IS REAL: the component, the snapshot watchers, the question renderer,
// the shared scoring module, and Firestore itself.
// WHAT IS NOT: the callables. They need an authenticated student token with
// custom claims that a browser harness cannot mint, and their server logic is
// already covered by the platform suite. The stub writes the player document
// the real function would write, so the leaderboard updates for real.
//
// NOTHING TOUCHES PRODUCTION. The page is served by a Vite config that swaps
// src/firebase.js for an emulator-only module, the browser blocks every
// non-local request, and the emulator runs under a throwaway project id.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FINDINGS = path.join(repo, 'tests/platform/fixtures/liveChallengeGameFindings.json');
const WRITE = process.argv.includes('--write');
const PORT = Number(process.env.GAME_PORT || 5197);
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8181';
const ORIGIN = `http://localhost:${PORT}`;
const ROOM_ID = 'harness-room-1';
const PLAYER_KEY = 'harness-player-key';

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

const started = [];
const stopAll = () => { for (const child of started) { try { child.kill('SIGKILL'); } catch { /* gone */ } } };
process.on('exit', stopAll);

// ---- the emulator -----------------------------------------------------------
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR;
const emulator = spawn(
  'npx',
  ['firebase', 'emulators:start', '--only', 'firestore', '--project', 'mathmaster-game-harness',
    '--config', path.join(here, 'emulator/firebase.json')],
  { cwd: path.join(here, 'emulator'), stdio: 'ignore' },
);
started.push(emulator);
if (!await waitForHttp(`http://${EMULATOR}/`)) {
  console.error('Firestore emulator did not start.');
  process.exit(2);
}

// ---- the dev server ---------------------------------------------------------
const vite = spawn(
  'npx',
  ['vite', '--config', path.join(here, 'emulator/vite.config.mjs'), '--port', String(PORT), '--strictPort'],
  { cwd: repo, stdio: 'ignore' },
);
started.push(vite);
if (!await waitForHttp(`${ORIGIN}/`)) {
  console.error('Vite did not start.');
  process.exit(2);
}

// ---- seed the game ----------------------------------------------------------
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'mathmaster-game-harness' });
const db = admin.firestore();

// THE QUESTION IS BUILT BY THE REAL SERVER PIPELINE, not written here.
//
// The first version of this harness hand-wrote a question shape and then
// reported the `$` in its own prompt as a LaTeX leak. It was not a leak; it was
// a fake question that never went through the sanitizer, so the renderer was
// handed a field it does not treat as math. A harness that invents its input
// invents its findings.
//
// This does what issueNextQuestion does: instantiate a real seed-bank item,
// apply the production issuability gate, and sanitize. What the round renders
// is then what a student is actually handed.
const seedDir = path.join(repo, 'functions/seeds/pathQuestionBank');
const seedFiles = readdirSync(seedDir).filter((name) => name.endsWith('.json'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));

const pickIssuableQuestion = async () => {
  for (const file of seedFiles) {
    const parsed = JSON.parse(readFileSync(path.join(seedDir, file), 'utf8'));
    const items = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
    for (const item of items) {
      // eslint-disable-next-line no-await-in-loop
      const instantiated = await mathPath.instantiateQuestion(item, `gameHarness|${item.id}`);
      if (!instantiated?.question) continue;
      // The platform's own predicate for "this can be answered by choosing".
      // Guessing at a `type` string missed every question in the bank, because
      // most carry none — the shape is what decides.
      if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
      // eslint-disable-next-line no-await-in-loop
      const plan = await mathPath.buildIssuePlan(instantiated.question);
      if (!plan?.issuable) continue;
      return mathPath.buildSanitizedQuestion(instantiated.question, {
        questionInstanceId: `challenge_${ROOM_ID}_r1`,
        attemptsAllowed: 1,
        attemptsUsed: 0,
        toolPayload: plan.toolPayload,
      });
    }
  }
  return null;
};

const question = await pickIssuableQuestion();
if (!question) {
  console.error('No issuable multiple-choice question found in the seed bank; cannot run the game harness.');
  process.exit(2);
}
question.challengeRound = 0;

const roomRef = db.collection('liveChallengeRooms').doc(ROOM_ID);
const setRoom = (fields) => roomRef.set(fields, { merge: true });

await setRoom({
  schemaVersion: 2,
  roomId: ROOM_ID,
  title: 'Period 3 Warm-Up Challenge',
  status: 'lobby',
  roundCount: 2,
  roundSeconds: 30,
  currentRound: -1,
  currentQuestion: null,
  roundStartedAt: null,
  roundEndsAt: null,
  assignmentId: 'assignment-a',
});
await roomRef.collection('players').doc(PLAYER_KEY).set({
  playerKey: PLAYER_KEY, alias: 'Swift Otter', joined: true,
  score: 0, correctCount: 0, roundsAnswered: 0, streak: 0, answeredRound: -1,
});
await roomRef.collection('players').doc('other-player').set({
  playerKey: 'other-player', alias: 'Bright Heron', joined: true,
  score: 2000, correctCount: 2, roundsAnswered: 2, streak: 2, answeredRound: 1,
});

// ---- the browser ------------------------------------------------------------
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext();
const blocked = [];
await context.route('**/*', (route) => {
  const url = route.request().url();
  if (/^(http|ws)s?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) return route.continue();
  blocked.push(url);
  return route.abort();
});
const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e?.message || e)));

await page.goto(`${ORIGIN}/tests/browser/liveChallengeGame.html?emulator=${EMULATOR}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__mmGameMount === 'function', { timeout: 30000 });
await page.evaluate((invite) => window.__mmGameMount(invite), {
  roomId: ROOM_ID, title: 'Period 3 Warm-Up Challenge', alias: 'Swift Otter',
  playerKey: PLAYER_KEY, status: 'running', assignmentId: 'assignment-a',
});

const readScreen = () => page.evaluate(() => {
  const scope = document.querySelector('[data-mm-game]');
  return {
    crashed: Boolean(document.querySelector('[data-mm-crashed]')),
    crashText: document.querySelector('[data-mm-crashed]')?.textContent || '',
    text: (scope?.innerText || '').replace(/\s+/g, ' ').trim(),
    buttons: [...(scope?.querySelectorAll('button') || [])].map((b) => b.innerText.trim()).filter(Boolean),
    elements: scope ? scope.querySelectorAll('*').length : 0,
    // Absence of `$` is only good news if the mathematics is still there. A
    // prompt that silently rendered nothing would also contain no dollar sign.
    mathNodes: scope
      ? scope.querySelectorAll('math-span, math-div, math-field').length
      : 0,
  };
});

const findings = [];
const report = [];

const step = async (name, { mustContain = [], mustNotContain = [], mustHaveButton = null, mustRenderMath = false } = {}) => {
  consoleErrors.length = 0;
  pageErrors.length = 0;
  await wait(700);
  const seen = await readScreen();
  const problems = [];
  if (seen.crashed) problems.push(`threw while rendering: ${seen.crashText}`);
  if (pageErrors.length) problems.push(`uncaught error: ${pageErrors.join(' | ')}`);
  for (const error of consoleErrors) {
    // Network noise is expected: non-local requests are deliberately blocked,
    // and MathLive's font files are not served by the dev server. Neither says
    // anything about the product.
    if (/ERR_FAILED|net::|Failed to fetch|WebChannel|transport errored|Could not reach|math fonts could not be loaded/i.test(error)) continue;
    problems.push(`console error: ${error}`);
  }
  if (!seen.elements) problems.push('rendered blank');
  for (const needle of mustContain) if (!seen.text.includes(needle)) problems.push(`missing: ${needle}`);
  for (const needle of mustNotContain) if (seen.text.includes(needle)) problems.push(`forbidden text present: ${needle}`);
  if (mustHaveButton && !seen.buttons.some((b) => b.includes(mustHaveButton))) {
    problems.push(`missing button: ${mustHaveButton} (saw ${JSON.stringify(seen.buttons)})`);
  }
  if (mustRenderMath && !seen.mathNodes) {
    problems.push('the prompt contains mathematics but nothing rendered it');
  }
  report.push({ step: name, text: seen.text.slice(0, 150), buttons: seen.buttons, mathNodes: seen.mathNodes, problems });
  if (problems.length) findings.push({ step: name, problems });
};

// Raw LaTeX reaching the screen is the bug renderAudit exists for; a round
// prompt is rendered by the same components, so it is checked here too.
const NO_MARKUP = ['$', '\\frac', '\\left', 'undefined', 'NaN', '[object Object]'];

await step('lobby', {
  mustContain: ['Swift Otter', 'LOBBY'],
  mustNotContain: NO_MARKUP,
  mustHaveButton: 'Back to Warm-Up',
});

// Round 1 opens.
await setRoom({
  status: 'running', currentRound: 0, currentQuestion: question,
  roundStartedAt: Date.now(), roundEndsAt: Date.now() + 30000,
});
await step('round-1-open', {
  mustContain: ['Round 1 of 2'],
  mustNotContain: NO_MARKUP,
  mustHaveButton: 'Back to Warm-Up',
  mustRenderMath: true,
});

// The student answers.
// Answering for real: pick a choice, then lock it in. The submit stub writes
// the player document the server would write, so the leaderboard that appears
// afterwards is driven by Firestore rather than by the harness.
const answered = await page.evaluate(() => {
  const scope = document.querySelector('[data-mm-game]');
  const radio = scope?.querySelector('input[type="radio"]');
  if (radio) {
    radio.click();
  } else {
    // Choice-only questions render as a single field here. React does not see
    // a directly assigned .value, so the native setter is used and an input
    // event dispatched — otherwise "Lock In Answer" stays disabled and the
    // submit path is never exercised.
    const input = scope?.querySelector('input[type="text"], input[type="number"]');
    if (!input) return null;
    const setter = Object.getOwnPropertyDescriptor(
      input.type === 'number' ? window.HTMLInputElement.prototype : window.HTMLInputElement.prototype,
      'value',
    ).set;
    setter.call(input, '16');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return 'answered';
});
await new Promise((resolve) => { setTimeout(resolve, 300); });
const locked = await page.evaluate(() => {
  const scope = document.querySelector('[data-mm-game]');
  const lock = [...(scope?.querySelectorAll('button') || [])].find((b) => /lock in/i.test(b.innerText));
  if (!lock || lock.disabled) return false;
  lock.click();
  return true;
});
await step('round-1-answered', { mustNotContain: NO_MARKUP });
if (!locked) findings.push({ step: 'round-1-answered', problems: ['could not lock in an answer, so the submit path was never exercised'] });

// Round 2, then the finish.
await setRoom({
  currentRound: 1,
  currentQuestion: { ...question, questionInstanceId: `challenge_${ROOM_ID}_r2`, challengeRound: 1 },
  roundStartedAt: Date.now(), roundEndsAt: Date.now() + 30000,
});
await step('round-2-open', { mustContain: ['Round 2 of 2'], mustNotContain: NO_MARKUP, mustRenderMath: true });

await setRoom({ status: 'finished', currentQuestion: null, roundEndsAt: null });
await step('finished', {
  mustContain: ['Final Standings', 'Swift Otter'],
  mustNotContain: NO_MARKUP,
});

await setRoom({ status: 'cancelled' });
await step('cancelled', { mustContain: ['cancelled'], mustHaveButton: 'Back to Warm-Up' });

const calls = await page.evaluate(() => window.__mmGameCalls || []);
await browser.close();
stopAll();

for (const row of report) {
  console.log(`${(row.problems.length ? 'FAIL' : 'ok').padEnd(4)} ${row.step}`);
  if (row.text) console.log(`       "${row.text}"`);
  if (row.buttons.length) console.log(`       buttons: ${row.buttons.join(' | ')}`);
  if (row.mathNodes) console.log(`       math nodes rendered: ${row.mathNodes}`);
  for (const problem of row.problems) console.log(`       -> ${problem}`);
}
console.log(`\nclicked answer: ${answered === null ? 'none found' : answered}`);
console.log(`callables invoked: ${calls.map((c) => c.name).join(', ') || 'none'}`);
console.log(`blocked ${blocked.length} non-local request(s) — no production contact`);

if (WRITE) {
  writeFileSync(FINDINGS, `${JSON.stringify(findings, null, 2)}\n`);
  console.log(`wrote ${FINDINGS}`);
}
process.exit(findings.length ? 1 : 0);
