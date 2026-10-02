// The rewards experience, end to end, in a real browser against a real
// Firestore — student and teacher, at phone, tablet and Chromebook sizes.
//
// HOW TO RUN (one command, it starts everything):
//
//   node tests/browser/rewardsQa.mjs [screenshotDir]
//
// What is real: the screens (rendered by the app's own components), every
// Firestore read and listener (against the emulator), and every reward
// transaction — a local server stands in for Cloud Functions' transport and
// calls functions/shared/rewardActionStore.mjs, the same module the callables
// call, against the same emulator. What is not: Firebase Auth (the harness
// passes the student/teacher identity the callables would read from the token).
//
// It walks the flows the rewards task requires — earn from a Challenge and a
// teacher, use a pass (double click included), refresh, history, an
// assignment that stops being eligible mid-dialog, a lost response and a
// retry, a teacher taking back and undoing, three Challenges in a row — and
// asserts the stored state after each. Exit code 0 means every check passed.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const PORT = Number(process.env.REWARDS_QA_PORT || 5197);
const API_PORT = Number(process.env.REWARDS_QA_API_PORT || 5299);
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8182';
const ORIGIN = `http://localhost:${PORT}`;
const shots = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'mathmaster-rewards-qa'));
mkdirSync(shots, { recursive: true });

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const waitForHttp = async (url, attempts = 80) => {
  for (let i = 0; i < attempts; i += 1) {
    try { const response = await fetch(url); if (response.status < 500) return true; } catch { /* not up */ }
    await wait(500);
  }
  return false;
};
const started = [];
const stopAll = () => {
  for (const child of started) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
  }
};
process.on('exit', stopAll);
const shutdown = async () => {
  for (const child of started) { try { process.kill(-child.pid, 'SIGINT'); } catch { /* gone */ } }
  for (let i = 0; i < 20; i += 1) {
    try { await fetch(`http://${EMULATOR}/`); } catch { break; }
    await wait(250);
  }
  stopAll();
};

process.env.FIRESTORE_EMULATOR_HOST = EMULATOR;
const emulator = spawn('npx', ['firebase', 'emulators:start', '--only', 'firestore', '--project', 'mathmaster-game-harness', '--config', path.join(here, 'emulator/firebase.json')],
  { cwd: path.join(here, 'emulator'), stdio: 'ignore', detached: true });
started.push(emulator);
if (!await waitForHttp(`http://${EMULATOR}/`)) { console.error('Firestore emulator did not start.'); process.exit(2); }
await fetch(`http://${EMULATOR}/emulator/v1/projects/mathmaster-game-harness/databases/(default)/documents`, { method: 'DELETE' });

const vite = spawn('npx', ['vite', '--config', path.join(here, 'emulator/vite.config.mjs'), '--port', String(PORT), '--strictPort'],
  { cwd: repo, stdio: 'ignore', detached: true });
started.push(vite);
if (!await waitForHttp(`${ORIGIN}/`)) { console.error('Vite did not start.'); process.exit(2); }

const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'mathmaster-game-harness' });
const db = admin.firestore();
const store = await import(path.join(repo, 'functions/shared/rewardActionStore.mjs'));
const delivery = await import(path.join(repo, 'functions/shared/liveChallengeClassPoints.mjs'));
const { buildMatchResult } = await import(path.join(repo, 'functions/shared/liveChallengeResults.mjs'));
const { runtimeIncludedQuestionIndicesForSection } = require(path.join(repo, 'functions/lib/assignmentRuntime.js'));

// ---------------------------------------------------------------------------
// The local stand-in for Cloud Functions' transport.
// ---------------------------------------------------------------------------
const TEACHER = 'ms.rivera@school.org';
const CLASS_ID = 'qa-class-p3';
const control = { dropResponses: 0, refuse: 0, beforeRedeem: null, calls: [] };
const assess = ({ assignment, classId }) => ({
  assignedToClass: (assignment.assignedClassIds || []).includes(classId),
  isTestCycleAssignment: false,
  practiceIndices: runtimeIncludedQuestionIndicesForSection(assignment, 'practice'),
});
const routes = {
  redeemPracticePass: ({ studentId, payload }) => store.redeemPracticePass(db, { studentId, assignmentId: payload.assignmentId, payWith: payload.payWith, preferredGrantId: payload.grantId, assess }),
  awardRewardGrant: ({ teacherEmail, payload }) => store.awardRewardGrant(db, { ...payload, teacher: { email: teacherEmail } }),
  revokeRewardGrant: ({ teacherEmail, payload }) => store.revokeRewardGrant(db, { ...payload, teacher: { email: teacherEmail } }),
  undoPracticePassRedemption: ({ teacherEmail, payload }) => store.undoPracticePassRedemption(db, { ...payload, teacher: { email: teacherEmail } }),
  getStudentRewards: ({ teacherEmail, payload }) => store.loadStudentRewardsForTeacher(db, { ...payload, teacher: { email: teacherEmail } }),
};
const api = http.createServer(async (request, response) => {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', 'content-type');
  if (request.method === 'OPTIONS') { response.end(); return; }
  const name = request.url.slice(1);
  let body = '';
  for await (const chunk of request) body += chunk;
  const input = JSON.parse(body || '{}');
  control.calls.push(name);
  if (control.refuse > 0) {
    control.refuse -= 1;
    response.statusCode = 503;
    response.end(JSON.stringify({ error: { code: 'unavailable', message: 'Service unavailable' } }));
    return;
  }
  try {
    if (name === 'redeemPracticePass' && control.beforeRedeem) {
      const hook = control.beforeRedeem;
      control.beforeRedeem = null;
      await hook();
    }
    const result = await routes[name](input);
    // The request committed, but its answer never reaches the browser.
    if (control.dropResponses > 0) { control.dropResponses -= 1; request.socket.destroy(); return; }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(result));
  } catch (error) {
    response.statusCode = 400;
    response.end(JSON.stringify({ error: { code: error.code || 'internal', message: error.message } }));
  }
});
await new Promise((resolve) => { api.listen(API_PORT, resolve); });

// ---------------------------------------------------------------------------
// A class, a student, three assignments and some rewards.
// ---------------------------------------------------------------------------
const STUDENT = 'qa-ava';
const RIVAL = 'qa-ben';
const DAY = 86_400_000;
const NOW = Date.now();
const lesson = (id, title, extra = {}) => db.collection('assignments').doc(id).set({
  title,
  schemaVersion: 5,
  assignedClassIds: [CLASS_ID],
  releaseAt: new Date(NOW - DAY).toISOString(),
  dueAt: new Date(NOW + 3 * DAY).toISOString(),
  sections: [
    { id: 'cw', role: 'classwork', questions: [{ id: `${id}-q1`, activityRole: 'classwork', prompt: 'x' }] },
    { id: 'pr', role: 'practice', questions: [{ id: `${id}-q2`, activityRole: 'practice', prompt: 'y' }, { id: `${id}-q3`, activityRole: 'practice', prompt: 'z' }] },
  ],
  ...extra,
});
await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', name: 'Algebra I — Period 3' });
for (const id of [STUDENT, RIVAL]) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('grades').doc(id).set({ classId: CLASS_ID, assignedTeacherEmail: TEACHER, displayName: id, gradesByAssignment: {} });
}
await lesson('qa-lesson-1', 'Lesson 2.3 — Slope from a Graph');
await lesson('qa-lesson-2', 'Lesson 2.4 — Slope-Intercept Form');
await lesson('qa-lesson-3', 'Lesson 2.5 — Point-Slope Form');
await lesson('qa-lesson-4', 'Lesson 2.6 — Standard Form');
await lesson('qa-quiz', 'Quiz 2 — Linear Functions', { sections: [{ id: 'q', role: 'quiz', questions: [] }, { id: 'pr', role: 'practice', questions: [{ id: 'qz', activityRole: 'practice' }] }] });
await db.collection('classPointAccounts').doc(`${STUDENT.length}:${STUDENT}:${CLASS_ID}`).set({ studentId: STUDENT, classId: CLASS_ID, balance: 140, lifetimeEarned: 140, lifetimeSpent: 0, authorizedTeacherEmails: [TEACHER], originTeacherEmail: TEACHER });

const POLICY = { rules: [
  { ruleId: 'challengeFinisher', criterion: { kind: 'participation', minAvailableRounds: 1 }, reward: { kind: 'classPoints', amount: 2 } },
  { ruleId: 'placementPracticePass', label: 'Live Challenge — 1st place', criterion: { kind: 'placement', maxRank: 1 }, reward: { kind: 'grant', rewardCode: 'practicePass', expiresInDays: 14 } },
  { ruleId: 'championBadge', label: 'Live Challenge — Champion', criterion: { kind: 'placement', maxRank: 1 }, reward: { kind: 'grant', rewardCode: 'badge', badgeCode: 'champion', label: 'Live Challenge Champion' } },
] };
const playMatch = async (roomId, title, winner, finalizedAtMs) => {
  const player = (studentId, score) => ({ studentId, joined: true, joinedAtRound: 0, score, correctCount: 1, roundsAnswered: 1, answeredRounds: [0], submissionReceipts: {} });
  const result = buildMatchResult({
    roomId, room: { classId: CLASS_ID, teacherEmail: TEACHER, roundCount: 1, currentRound: 0, title },
    privateState: { scheduledRoundCount: 1, questionIds: ['q0'] },
    players: [player(winner, 2400), player(winner === STUDENT ? RIVAL : STUDENT, 1200)],
    status: 'finished', finalizedAtMs,
  });
  await db.collection('liveChallengeMatchResults').doc(roomId).set({ ...result, studentIds: result.standings.map((entry) => entry.studentId), rewardPolicy: POLICY, effects: { rewards: 'done' } });
  // The finishing call, a host reconnect and the sweep: three deliveries.
  await Promise.all([1, 2, 3].map(() => delivery.processLiveChallengeMatchRewards(db, { matchResult: result, policy: POLICY })));
  return result;
};
const grantsOf = async (studentId) => (await db.collection('rewardGrants').where('studentId', '==', studentId).get()).docs.map((entry) => ({ id: entry.id, ...entry.data() }));
const statuses = async (studentId) => (await grantsOf(studentId)).filter((grant) => grant.rewardCode === 'practicePass').map((grant) => grant.status).sort();

const checks = [];
const check = async (name, fn) => {
  try { await fn(); checks.push(['ok', name]); console.log(`ok   ${name}`); } catch (error) { checks.push(['FAIL', name, error.message]); console.log(`FAIL ${name}\n     ${error.message}`); }
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const VIEWPORTS = { phone: { width: 390, height: 844 }, tablet: { width: 820, height: 1180 }, chromebook: { width: 1366, height: 768 } };
const url = (query) => `${ORIGIN}/tests/browser/rewardsQa.html?api=http://localhost:${API_PORT}&emulator=${EMULATOR}&class=${CLASS_ID}&${query}`;
const studentUrl = url(`view=student&student=${STUDENT}`);
const noSideScroll = async (page, label) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${label}: page scrolls sideways by ${overflow}px`);
};
const smallTargets = async (page) => page.evaluate(() => [...document.querySelectorAll('button, [role="button"], summary, select, input[type="radio"] + span, label.rw-choice')]
  // The app-wide toast's close control is not part of the rewards UI.
  .filter((element) => element.offsetParent !== null && !element.closest('.mm-toast-viewport'))
  .map((element) => ({ text: (element.textContent || element.getAttribute('aria-label') || element.tagName).trim().slice(0, 40), height: element.getBoundingClientRect().height }))
  .filter((entry) => entry.height < 43.5));

const page = await (await browser.newContext({ viewport: VIEWPORTS.chromebook })).newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

// 1. EARN: a teacher's pass, then a Challenge win, while the page is open.
await store.awardRewardGrant(db, { studentId: STUDENT, classId: CLASS_ID, rewardCode: 'practicePass', note: 'Helped a classmate all period', expiresInDays: 30, requestId: 'qa-1', teacher: { email: TEACHER } });
await page.goto(studentUrl, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.getByRole('heading', { name: 'My Rewards' }).waitFor();
await check('a reward earned before opening the page is counted, not re-announced as stale', async () => {
  await page.locator('.rw-count').first().filter({ hasText: '1' }).waitFor({ timeout: 10000 });
});
const firstMatch = await playMatch('qa-room-1', 'Friday Function Face-Off', STUDENT, NOW - 3000);
await check('a Challenge win appears at once, with a toast, and is delivered exactly once', async () => {
  await page.locator('.rw-count').first().filter({ hasText: '2' }).waitFor({ timeout: 10000 });
  await page.getByText(/You earned a Practice Pass in a Live Challenge!/).first().waitFor({ timeout: 10000 });
  assert.equal(await page.getByText(/You earned a Practice Pass in a Live Challenge!/).count(), 1, 'announced once');
  assert.deepEqual(await statuses(STUDENT), ['available', 'available']);
  assert.equal((await grantsOf(STUDENT)).filter((grant) => grant.rewardCode === 'badge').length, 1, 'one champion badge despite three deliveries');
  await page.locator('.rw-row__title', { hasText: 'Live Challenge Champion' }).waitFor();
});
await page.screenshot({ path: path.join(shots, '01-student-my-rewards-chromebook.png'), fullPage: true });

// 2. RESPONSIVE: no sideways scroll, no tiny targets, at every size.
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  // eslint-disable-next-line no-await-in-loop
  await page.setViewportSize(viewport);
  // eslint-disable-next-line no-await-in-loop
  await check(`My Rewards at ${name} width: no sideways scroll, every control at least 44px`, async () => {
    await noSideScroll(page, name);
    assert.deepEqual(await smallTargets(page), []);
  });
  // eslint-disable-next-line no-await-in-loop
  await page.screenshot({ path: path.join(shots, `02-student-my-rewards-${name}.png`), fullPage: true });
}
await page.emulateMedia({ colorScheme: 'dark' });
await page.screenshot({ path: path.join(shots, '02-student-my-rewards-chromebook-dark.png'), fullPage: true });
await page.emulateMedia({ colorScheme: 'light' });
await page.setViewportSize(VIEWPORTS.phone);

// 3. USE: the dialog lists only eligible work, confirms clearly, survives a double click.
await page.getByRole('button', { name: 'Use a Practice Pass' }).click();
await check('the dialog lists eligible assignments only (no quiz) and traps focus', async () => {
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const choices = await dialog.locator('label.rw-choice').allTextContents();
  assert.equal(choices.length, 4, choices.join(' | '));
  assert.ok(!choices.some((text) => /Quiz/.test(text)));
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
  assert.ok(await page.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)), 'focus stays in the dialog');
});
await page.screenshot({ path: path.join(shots, '03-use-dialog-choose-phone.png'), fullPage: true });
await page.getByRole('dialog').getByText('Lesson 2.3 — Slope from a Graph').click();
await page.getByRole('button', { name: 'Next' }).click();
await check('the confirmation says what will happen and what it costs', async () => {
  await page.getByRole('heading', { name: 'Use a Practice Pass on Lesson 2.3 — Slope from a Graph?' }).waitFor();
  await page.getByText('Uses 1 Practice Pass.').waitFor();
  await page.getByText(/Excused is not 100%/).waitFor();
});
await page.screenshot({ path: path.join(shots, '04-use-dialog-confirm-phone.png'), fullPage: true });
const confirm = page.getByRole('button', { name: 'Use 1 Practice Pass' });
await confirm.dblclick();
await check('a double click spends exactly one pass and the count drops at once', async () => {
  await page.getByText(/Done! Practice is excused for Lesson 2.3/).waitFor({ timeout: 10000 });
  assert.deepEqual(await statuses(STUDENT), ['available', 'redeemed']);
  assert.equal(control.calls.filter((name) => name === 'redeemPracticePass').length, 1, 'the second click never left the browser');
});
await page.screenshot({ path: path.join(shots, '05-use-dialog-done-phone.png'), fullPage: true });
await page.getByRole('button', { name: 'Done' }).click();
await check('the wallet shows the new count and what the pass did', async () => {
  await page.locator('.rw-count').first().filter({ hasText: '1' }).waitFor({ timeout: 10000 });
  await page.getByRole('heading', { name: 'Practice excused' }).waitFor();
  await page.getByText('Lesson 2.3 — Slope from a Graph').first().waitFor();
});

// 4. REFRESH: the state is the server's, not the page's.
await page.reload();
await check('after a refresh the count, the excused assignment and the badge are unchanged', async () => {
  await page.locator('.rw-count').first().filter({ hasText: '1' }).waitFor({ timeout: 10000 });
  await page.getByText('✓ Excused').waitFor();
  await page.locator('.rw-row__title', { hasText: 'Live Challenge Champion' }).waitFor();
  assert.equal(await page.locator('.mm-toast').count(), 0, 'nothing already announced is announced again');
});

// 5. HISTORY: opens on demand and keeps everything.
await page.getByText('Reward history').click();
await check('history lists the earned rewards and the use, with dates', async () => {
  await page.getByText(/Used on Lesson 2.3/).waitFor({ timeout: 10000 });
  assert.ok(await page.locator('.rw-chip', { hasText: 'Earned' }).count() >= 3);
});
await page.screenshot({ path: path.join(shots, '06-history-phone.png'), fullPage: true });

// 6. INELIGIBLE MID-DIALOG.
// (a) The browser can see it: Practice gets answered in another tab while
//     the confirm step is open. The dialog must say so, not go blank.
await page.getByRole('button', { name: 'Use a Practice Pass' }).click();
await page.getByRole('dialog').getByText('Lesson 2.4 — Slope-Intercept Form').click();
await page.getByRole('button', { name: 'Next' }).click();
await db.collection('grades').doc(STUDENT).update({ 'gradesByAssignment.qa-lesson-2': { 1: { totalAttempts: 1, status: 'correct' } } });
await check('an assignment that stops being eligible while confirming is explained, and cannot be spent on', async () => {
  await page.getByRole('alert').filter({ hasText: /can.t use a Practice Pass anymore[\s\S]*Nothing was used/ }).waitFor({ timeout: 10000 });
  assert.equal(await page.getByRole('button', { name: 'Use 1 Practice Pass' }).isDisabled(), true);
});
await page.screenshot({ path: path.join(shots, '07a-no-longer-eligible-phone.png'), fullPage: true });
await page.getByRole('button', { name: 'Back' }).click();
// (b) Only the server can see it: Practice is answered at the same moment
//     the request arrives.
await page.getByRole('dialog').getByText('Lesson 2.5 — Point-Slope Form').click();
await page.getByRole('button', { name: 'Next' }).click();
control.beforeRedeem = () => db.collection('grades').doc(STUDENT).update({ 'gradesByAssignment.qa-lesson-3': { 1: { totalAttempts: 1, status: 'correct' } } });
await page.getByRole('button', { name: 'Use 1 Practice Pass' }).click();
await check('a server refusal says why and that nothing was used; nothing was spent', async () => {
  await page.getByRole('alert').filter({ hasText: /already been recorded[\s\S]*Nothing was used/ }).waitFor({ timeout: 10000 });
  assert.deepEqual(await statuses(STUDENT), ['available', 'redeemed']);
});
await page.screenshot({ path: path.join(shots, '07b-refused-nothing-used-phone.png'), fullPage: true });
await page.getByRole('button', { name: 'Back' }).click();

// 7. NETWORK: refused at the door, then a lost answer after the commit.
await page.getByRole('dialog').getByText('Lesson 2.6 — Standard Form').click();
await page.getByRole('button', { name: 'Next' }).click();
control.refuse = 1;
await page.getByRole('button', { name: 'Use 1 Practice Pass' }).click();
await check('a failed request says retrying is safe; nothing was spent', async () => {
  await page.getByRole('alert').filter({ hasText: /never use two passes/ }).waitFor({ timeout: 10000 });
  assert.deepEqual(await statuses(STUDENT), ['available', 'redeemed']);
});
control.dropResponses = 1;
await page.getByRole('button', { name: 'Try again' }).click();
// The request commits but its answer is lost. Chrome may retry it on its own
// (a reset keep-alive connection); otherwise the student sees the transport
// error and presses Try again. Either way the retry is answered "already
// excused" — never a second spend.
const excusedMessage = page.getByText(/Practice is excused for Lesson 2.6[\s\S]*up to date/);
const transportError = page.getByRole('alert').filter({ hasText: /never use two passes/ });
await Promise.race([excusedMessage.waitFor({ timeout: 15000 }), transportError.waitFor({ timeout: 15000 })]);
if (!(await excusedMessage.isVisible())) await page.getByRole('button', { name: 'Try again' }).click();
await check('a lost answer, then a retry: one pass spent, the student told the truth', async () => {
  await excusedMessage.waitFor({ timeout: 10000 });
  assert.deepEqual(await statuses(STUDENT), ['redeemed', 'redeemed']);
  const excused = await db.collection('classPointRewardRedemptions').where('studentId', '==', STUDENT).get();
  assert.equal(excused.size, 2, 'Lesson 2.3 and Lesson 2.6, once each');
});
await page.getByRole('button', { name: 'Done' }).click();
await check('with no passes left, the card offers trading 100 points instead', async () => {
  await page.getByRole('button', { name: 'Trade 100 points for a pass' }).waitFor({ timeout: 10000 });
});
await page.screenshot({ path: path.join(shots, '08-no-passes-points-offer-phone.png'), fullPage: true });

// 8. TEACHER: see everything, give, take back, undo, diagnose.
const teacherPage = await (await browser.newContext({ viewport: VIEWPORTS.chromebook })).newPage();
teacherPage.on('pageerror', (error) => errors.push(`teacher: ${error.message}`));
await playMatch('qa-room-2', 'Monday Slope Sprint', RIVAL, NOW - 2000);
await playMatch('qa-room-3', 'Wednesday Graph Gauntlet', STUDENT, NOW - 1000);
await teacherPage.goto(url(`view=teacher&student=${STUDENT}&teacher=${encodeURIComponent(TEACHER)}`));
await check('the teacher sees ready, used and the Challenge explanation per match', async () => {
  await teacherPage.getByText(/Practice Pass(es)? ready/).waitFor({ timeout: 10000 });
  await teacherPage.getByText('Lesson 2.3 — Slope from a Graph').waitFor();
  await teacherPage.getByText('Live Challenge rewards — what was earned and why').click();
  await teacherPage.getByText('Monday Slope Sprint').waitFor();
  await teacherPage.getByText(/Finished 2nd/).first().waitFor();
});
await teacherPage.screenshot({ path: path.join(shots, '09-teacher-panel-chromebook.png'), fullPage: true });
await teacherPage.getByText(/^Give Ava a reward$/).click();
await teacherPage.getByLabel('Reward', { exact: true }).selectOption('badge');
await teacherPage.getByLabel('Badge name').fill('Great explainer');
await teacherPage.getByRole('button', { name: 'Give reward' }).dblclick();
await check('a teacher gives a badge once, even on a double click', async () => {
  await teacherPage.getByText('Badge given.').waitFor({ timeout: 10000 });
  assert.equal((await grantsOf(STUDENT)).filter((grant) => grant.label === 'Great explainer').length, 1);
});
const usedRow = teacherPage.locator('li.rw-row', { hasText: 'Lesson 2.3 — Slope from a Graph' }).first();
await usedRow.getByRole('button', { name: 'Undo' }).click();
await usedRow.getByLabel(/Reason/).fill('Meant to use it on Lesson 2.4');
await usedRow.getByRole('button', { name: 'Undo this use' }).click();
await check('undoing a use lifts the waiver and gives the student a pass back', async () => {
  await teacherPage.locator('li.rw-row', { hasText: 'Meant to use it on Lesson 2.4' }).getByText('Undone', { exact: true }).waitFor({ timeout: 10000 });
  const undone = (await db.collection('classPointRewardRedemptions').where('studentId', '==', STUDENT).get()).docs.map((entry) => entry.data()).find((entry) => entry.assignmentId === 'qa-lesson-1');
  assert.equal(undone.status, 'reversed');
  const passes = await statuses(STUDENT);
  assert.equal(passes.filter((status) => status === 'available').length, 2, 'the Wednesday win + the returned pass');
});
const passRow = teacherPage.locator('section[aria-label="Rewards ready to use"] li.rw-row', { hasText: 'Practice Pass' }).first();
await passRow.getByRole('button', { name: 'Take back' }).click();
await passRow.getByLabel(/Reason/).fill('Duplicate award');
await passRow.getByRole('button', { name: 'Take back' }).last().click();
await check('taking back a pass keeps it in history as taken back', async () => {
  await teacherPage.getByText('History: taken back, expired and Class Points').click();
  await teacherPage.getByText(/Duplicate award/).waitFor({ timeout: 10000 });
  assert.equal((await statuses(STUDENT)).filter((status) => status === 'revoked').length, 1);
});
await teacherPage.screenshot({ path: path.join(shots, '10-teacher-after-actions-chromebook.png'), fullPage: true });
await teacherPage.setViewportSize(VIEWPORTS.phone);
await check('the teacher panel works at phone width', async () => { await noSideScroll(teacherPage, 'teacher phone'); });
await teacherPage.screenshot({ path: path.join(shots, '11-teacher-panel-phone.png'), fullPage: true });

// 9. STUDENT SEES THE TEACHER'S CHANGES LIVE.
await check('the student wallet shows the returned pass and the new badge without a refresh', async () => {
  await page.locator('.rw-count').first().filter({ hasText: '1' }).waitFor({ timeout: 10000 });
  await page.locator('.rw-row__title', { hasText: 'Great explainer' }).waitFor({ timeout: 10000 });
  await page.getByText('🏅 New badge: Great explainer — from your teacher!').waitFor({ timeout: 10000 });
  assert.equal(await page.getByText('✓ Excused').count(), 1, 'Lesson 2.3 is no longer excused; 2.5 still is');
});
await page.screenshot({ path: path.join(shots, '12-student-after-teacher-phone.png'), fullPage: true });

// 10. CHALLENGE RESULTS: each match shows only its own rewards.
const challengePage = await (await browser.newContext({ viewport: VIEWPORTS.phone })).newPage();
for (const [room, expectPass] of [['qa-room-1', false], ['qa-room-2', false], ['qa-room-3', true]]) {
  // eslint-disable-next-line no-await-in-loop
  await challengePage.goto(url(`view=challenge&student=${STUDENT}&room=${room}`));
  // eslint-disable-next-line no-await-in-loop
  await check(`match ${room}: its results card shows its own rewards only`, async () => {
    await challengePage.getByRole('heading', { name: 'Rewards earned' }).waitFor();
    await challengePage.getByText(/\+2 Class Points/).waitFor({ timeout: 10000 });
    // Match 1's pass was used and its badge is held; the card reads the live
    // inventory, so a used pass is (correctly) no longer "in" the wallet.
    const card = challengePage.locator('section[aria-labelledby="challenge-rewards-heading"]');
    assert.equal(await card.getByText('Practice Pass', { exact: false }).count() > 0, expectPass);
  });
  // eslint-disable-next-line no-await-in-loop
  await challengePage.screenshot({ path: path.join(shots, `13-challenge-${room}-phone.png`), fullPage: true });
}
// A match that gave this student nothing says what it offered — so nobody
// waits for a reward that is not coming — and a match that offered no
// rewards shows no rewards card at all.
await challengePage.goto(url(`view=challenge&student=${STUDENT}&room=qa-room-none&offered=${encodeURIComponent('Top 3: Practice Pass each')}`));
await check('a match that gave this student nothing says what it offered', async () => {
  await challengePage.getByRole('heading', { name: 'Rewards earned' }).waitFor({ timeout: 10000 });
  await challengePage.getByText(/This game.s rewards: Top 3: Practice Pass each\./).waitFor({ timeout: 10000 });
});
await challengePage.screenshot({ path: path.join(shots, '13-challenge-nothing-earned-phone.png'), fullPage: true });
await challengePage.goto(url(`view=challenge&student=${STUDENT}&room=qa-room-none&offered=`));
await check('a match that offered no rewards shows no rewards card', async () => {
  await challengePage.locator('[data-qa="challenge-view"]').waitFor({ timeout: 10000 });
  await challengePage.waitForTimeout(1500);
  assert.equal(await challengePage.getByRole('heading', { name: 'Rewards earned' }).count(), 0);
});
await challengePage.goto(url('view=create'));
await challengePage.screenshot({ path: path.join(shots, '14-challenge-reward-choice-phone.png'), fullPage: true });

await check('no page threw an error', async () => { assert.deepEqual(errors, []); });
void firstMatch;

await browser.close();
api.close();
await shutdown();
const failed = checks.filter(([status]) => status === 'FAIL');
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed. Screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);
