// Class rewards, end to end, in a real browser against a real Firestore —
// the teacher's catalog editor and pending requests, and the student's My
// Rewards — at a Chromebook (1366×768) and a phone (390×844).
//
// HOW TO RUN (one command, it starts everything; it uses the emulator's fixed
// ports, so run one emulator suite at a time):
//
//   node tests/browser/classRewardsQa.mjs [screenshotDir]
//
// What is real: the screens (the app's own components), every Firestore read
// and listener (against the emulator), and every class reward transaction —
// a local server stands in for Cloud Functions' transport and calls
// functions/lib/classRewardStore.js, the module the callables call, against
// the same emulator. What is not: Firebase Auth (the harness passes the
// identity the callables would read from the token) and the Security Rules
// (tests/rules/classRewardsRules.test.mjs covers those).
//
// Exit code 0 means every check passed.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
// PLAYWRIGHT_MODULE, else the project's playwright (CI installs it), else
// the global install of a development container.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
  .catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const PORT = Number(process.env.CLASS_REWARDS_QA_PORT || 5198);
const API_PORT = Number(process.env.CLASS_REWARDS_QA_API_PORT || 5298);
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8182';
const ORIGIN = `http://localhost:${PORT}`;
const shots = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'mathmaster-class-rewards-qa'));
mkdirSync(shots, { recursive: true });

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const waitForHttp = async (url, attempts = 120) => {
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

const vite = spawn('npx', ['vite', '--config', path.join(here, 'classRewardsQa.vite.config.mjs'), '--port', String(PORT), '--strictPort'],
  { cwd: repo, stdio: 'ignore', detached: true });
started.push(vite);
if (!await waitForHttp(`${ORIGIN}/`)) { console.error('Vite did not start.'); process.exit(2); }

const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'mathmaster-game-harness' });
const db = admin.firestore();
const store = require(path.join(repo, 'functions/lib/classRewardStore.js'));
const { accountId } = await import(path.join(repo, 'functions/shared/classPoints.mjs'));

// ---------------------------------------------------------------------------
// The local stand-in for Cloud Functions' transport.
// ---------------------------------------------------------------------------
const TEACHER = 'ms.rivera@school.org';
const CLASS_ID = 'qa-class-p3';
const STUDENT = 'qa-ava';
const CLASSMATE = 'qa-ben';
const control = { dropResponses: 0, calls: [] };
const routes = {
  redeemClassReward: ({ studentId, payload }) => store.redeemClassReward(db, { studentId, ...payload }),
  saveClassRewardCatalog: ({ teacherEmail, payload }) => store.saveClassRewardCatalog(db, { ...payload, teacher: { email: teacherEmail } }),
  resolveClassRewardRequest: ({ teacherEmail, payload }) => store.resolveClassRewardRequest(db, { ...payload, teacher: { email: teacherEmail } }),
};
const api = http.createServer(async (request, response) => {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', 'content-type');
  if (request.method === 'OPTIONS') { response.end(); return; }
  const name = request.url.slice(1);
  let body = '';
  for await (const chunk of request) body += chunk;
  control.calls.push(name);
  try {
    const result = await routes[name](JSON.parse(body || '{}'));
    // The request committed, but its answer never reaches the browser.
    if (control.dropResponses > 0) { control.dropResponses -= 1; request.socket.destroy(); return; }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(result));
  } catch (error) {
    response.statusCode = 400;
    response.end(JSON.stringify({ error: { code: error.code || 'internal', message: error.message, details: error.detail || null } }));
  }
});
await new Promise((resolve) => { api.listen(API_PORT, resolve); });

// ---------------------------------------------------------------------------
// A class, two students with Class Points, and some growth/recognition badges.
// ---------------------------------------------------------------------------
const NOW = Date.now();
await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', name: 'Algebra I — Period 3' });
for (const [id, firstName, lastName, balance] of [[STUDENT, 'Ava', 'Martinez', 120], [CLASSMATE, 'Ben', 'Ortiz', 300]]) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('grades').doc(id).set({ classId: CLASS_ID, assignedTeacherEmail: TEACHER, firstName, lastName, gradesByAssignment: {} });
  // eslint-disable-next-line no-await-in-loop
  await db.collection('classPointAccounts').doc(accountId(id, CLASS_ID)).set({ studentId: id, classId: CLASS_ID, balance, lifetimeEarned: balance, lifetimeSpent: 0, authorizedTeacherEmails: [TEACHER], originTeacherEmail: TEACHER });
}
const badge = (code, sourceType, label, minutesAgo) => db.collection('rewardGrants').doc(`qa-badge-${code}`).set({
  grantId: `qa-badge-${code}`, rewardCode: 'badge', badgeCode: code, label, studentId: STUDENT, classId: CLASS_ID, status: 'available',
  source: { type: sourceType, id: `qa-${code}` }, awardedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
  reasonLabel: sourceType === 'liveChallenge' ? `Live Challenge — ${label}` : null, authorizedTeacherEmails: [TEACHER],
});
await badge('growth-retest', 'growth', 'Comeback on the retest', 3000);
await badge('mastery-5', 'growth', '5 skills mastered', 2000);
await badge('lc-mostImproved', 'liveChallenge', 'Most improved', 1000);
await badge('lc-somethingNew', 'liveChallenge', 'Quickest thinker', 900);

const checks = [];
const check = async (name, fn) => {
  try { await fn(); checks.push(['ok', name]); console.log(`ok   ${name}`); } catch (error) { checks.push(['FAIL', name, error.message]); console.log(`FAIL ${name}\n     ${error.message}`); }
};
const requestsOf = async (studentId) => (await db.collection('classRewardRequests').where('studentId', '==', studentId).get()).docs.map((entry) => entry.data());
const balanceOf = async (studentId) => (await db.collection('classPointAccounts').doc(accountId(studentId, CLASS_ID)).get()).data().balance;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const VIEWPORTS = { chromebook: { width: 1366, height: 768 }, phone: { width: 390, height: 844 } };
const url = (query) => `${ORIGIN}/tests/browser/classRewardsQa.html?api=http://localhost:${API_PORT}&emulator=${EMULATOR}&class=${CLASS_ID}&${query}`;
const noSideScroll = async (page, label) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${label}: page scrolls sideways by ${overflow}px`);
};
const smallTargets = async (page) => page.evaluate(() => [...document.querySelectorAll('button, summary, select, input, label.rw-choice')]
  .filter((element) => element.offsetParent !== null && !element.closest('.mm-toast-viewport') && element.type !== 'checkbox')
  .map((element) => ({ text: (element.textContent || element.getAttribute('aria-label') || element.tagName).trim().slice(0, 40), height: element.getBoundingClientRect().height }))
  .filter((entry) => entry.height < 43.5));
const errors = [];

// 1. TEACHER: build the list from suggestions; an academic item is refused.
const teacherPage = await (await browser.newContext({ viewport: VIEWPORTS.chromebook })).newPage();
teacherPage.setDefaultTimeout(20000);
teacherPage.on('pageerror', (error) => errors.push(`teacher: ${error.message}`));
await teacherPage.goto(url(`view=teacher&teacher=${encodeURIComponent(TEACHER)}`), { waitUntil: 'domcontentloaded', timeout: 180000 });
const editor = teacherPage.locator('[data-qa="class-reward-editor"]');
await editor.getByText('No class rewards yet').waitFor({ timeout: 60000 });
await check('an empty list opens the suggestions; each is one click', async () => {
  await editor.getByRole('button', { name: 'Add Choose your seat for a day' }).click();
  await editor.getByRole('button', { name: 'Add Music with headphones during independent work' }).click();
  await editor.getByRole('button', { name: 'Add Be the class DJ for the warm-up' }).click();
  assert.equal(await editor.locator('[data-qa="catalog-item"]').count(), 3);
  assert.equal(await editor.getByRole('button', { name: 'Add Choose your seat for a day' }).count(), 0, 'an added suggestion is not offered twice');
});
await teacherPage.screenshot({ path: path.join(shots, '01-teacher-editor-suggestions-chromebook.png'), fullPage: true });
await check('an item that touches grades is refused on the item, and Save is disabled', async () => {
  await editor.getByRole('button', { name: 'Add a reward' }).click();
  const last = editor.locator('[data-qa="catalog-item"]').last();
  await last.getByLabel('Reward name').fill('Homework-free night');
  await last.getByText(/mentions homework[\s\S]*can't change grades or required work/).waitFor();
  assert.equal(await editor.getByRole('button', { name: 'Save rewards' }).isDisabled(), true);
});
await teacherPage.screenshot({ path: path.join(shots, '02-teacher-editor-academic-refused-chromebook.png'), fullPage: true });
await editor.locator('[data-qa="catalog-item"]').last().getByRole('button', { name: 'Remove' }).click();
// The DJ reward is turned off: students must not see it.
await editor.locator('[data-qa="catalog-item"]').nth(2).getByLabel(/Students can use it/).uncheck();
await editor.getByRole('button', { name: 'Save rewards' }).dblclick();
await check('Save writes the list once, with no academic field, and the DJ reward off', async () => {
  await editor.getByText('Saved. Students see the new list now.').waitFor({ timeout: 10000 });
  const catalog = (await db.collection('classRewardCatalogs').doc(CLASS_ID).get()).data();
  assert.equal(catalog.revision, 1, 'a double click saved once');
  assert.deepEqual(catalog.items.map((item) => [item.itemId, item.active]), [['starter-seat', true], ['starter-music', true], ['starter-dj', false]]);
  assert.ok(!/grade|credit|assignment/i.test(JSON.stringify(Object.keys(catalog.items[0]))));
});

// 2. STUDENT: the shelf, a double-click spend, a weekly limit, a short balance.
const page = await (await browser.newContext({ viewport: VIEWPORTS.phone })).newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', (error) => errors.push(`student: ${error.message}`));
await page.goto(url(`view=student&student=${STUDENT}`), { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.getByRole('heading', { name: 'My Rewards' }).waitFor({ timeout: 60000 });
const shelf = page.locator('section[aria-labelledby="class-rewards-heading"]');
await check('My Rewards: Practice Pass first, then the class rewards (turned-off DJ hidden), cheapest first', async () => {
  await shelf.getByText('Choose your seat for a day').waitFor({ timeout: 15000 });
  const order = await page.evaluate(() => {
    const pass = document.getElementById('practice-pass-heading');
    const cr = document.getElementById('class-rewards-heading');
    return Boolean(pass.compareDocumentPosition(cr) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  assert.ok(order, 'the Practice Pass card comes first');
  const titles = await shelf.locator('[data-qa="class-reward-item"] .rw-row__title').allTextContents();
  assert.deepEqual(titles, ['Music with headphones during independent work', 'Choose your seat for a day']);
  assert.equal(await shelf.getByText('Be the class DJ for the warm-up').count(), 0);
});
await check('badges are grouped and named: growth, mastery, Live Challenge (an unknown code keeps its label)', async () => {
  for (const name of ['Growth and effort', 'Mastery', 'Live Challenge']) {
    // eslint-disable-next-line no-await-in-loop
    await page.getByRole('heading', { name, exact: true }).waitFor({ timeout: 10000 });
  }
  await page.getByText('Comeback on the retest').waitFor();
  await page.getByText('5 skills mastered').waitFor();
  await page.getByText('Most improved', { exact: true }).waitFor();
  await page.getByText('Quickest thinker').waitFor();
  assert.equal(await page.getByText('lc-somethingNew').count(), 0, 'no raw badge code on screen');
});
await page.screenshot({ path: path.join(shots, '03-student-my-rewards-phone.png'), fullPage: true });
await check('My Rewards at phone width: no sideways scroll, every control at least 44px', async () => {
  await noSideScroll(page, 'student phone');
  assert.deepEqual(await smallTargets(page), []);
});

const seatRow = shelf.locator('[data-qa="class-reward-item"]', { hasText: 'Choose your seat for a day' });
await seatRow.getByRole('button', { name: 'Use 50 points' }).click();
await check('the confirmation says the price, what is left, and that no grade changes', async () => {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('heading', { name: /Use 50 points on “Choose your seat for a day”\?/ }).waitFor();
  await dialog.getByText('Uses 50 Class Points.').waitFor();
  await dialog.getByText('You will have 70 Class Points left.').waitFor();
  await dialog.getByText('This does not change any grade or assignment.').waitFor();
});
await page.screenshot({ path: path.join(shots, '04-student-confirm-phone.png'), fullPage: true });
await page.getByRole('dialog').getByRole('button', { name: 'Use 50 points' }).dblclick();
await check('a double click spends once: one request, 50 points, one call', async () => {
  await page.getByText(/Done! Your teacher will see your request/).waitFor({ timeout: 10000 });
  assert.equal((await requestsOf(STUDENT)).length, 1);
  assert.equal(await balanceOf(STUDENT), 70);
  assert.equal(control.calls.filter((name) => name === 'redeemClassReward').length, 1, 'the second click never left the browser');
});
await page.screenshot({ path: path.join(shots, '05-student-request-sent-phone.png'), fullPage: true });
await page.getByRole('button', { name: 'Done' }).click();
await check('the shelf now says why the seat is unavailable, and shows the waiting request', async () => {
  await seatRow.getByText(/already used this one this week[\s\S]*Monday/).waitFor({ timeout: 10000 });
  assert.equal(await seatRow.getByRole('button', { name: 'Use 50 points' }).isDisabled(), true);
  await shelf.getByText('Waiting for your teacher').waitFor();
});

// A lost answer, then a retry: still one spend.
const musicRow = shelf.locator('[data-qa="class-reward-item"]', { hasText: 'Music with headphones' });
await musicRow.getByRole('button', { name: 'Use 40 points' }).click();
control.dropResponses = 1;
await page.getByRole('dialog').getByRole('button', { name: 'Use 40 points' }).click();
const sent = page.getByText(/is already with your teacher|Done! Your teacher will see/);
const transport = page.getByRole('alert').filter({ hasText: /never spend your points twice/ });
await Promise.race([sent.waitFor({ timeout: 15000 }), transport.waitFor({ timeout: 15000 })]);
if (!(await sent.isVisible())) {
  await page.screenshot({ path: path.join(shots, '06a-student-lost-answer-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Try again' }).click();
}
await check('a lost answer and a retry: one request, 40 points, the student told the truth', async () => {
  await sent.waitFor({ timeout: 10000 });
  assert.equal((await requestsOf(STUDENT)).length, 2);
  assert.equal(await balanceOf(STUDENT), 30);
});
await page.getByRole('button', { name: 'Done' }).click();
await check('with 30 points left, the music reward says how many more are needed', async () => {
  await musicRow.getByText('You need 10 more Class Points.').waitFor({ timeout: 10000 });
  assert.equal(await musicRow.getByRole('button', { name: 'Use 40 points' }).isDisabled(), true);
});
await page.screenshot({ path: path.join(shots, '06-student-limits-phone.png'), fullPage: true });

// A classmate's request too, so the teacher has two.
await store.redeemClassReward(db, { studentId: CLASSMATE, itemId: 'starter-seat', requestId: 'ben-1' });

// 3. TEACHER: fulfil one, decline one with a reason.
const panel = teacherPage.locator('[data-qa="class-reward-requests"]');
await check('the teacher sees every pending request, oldest first, by full name', async () => {
  await panel.getByText('3 requests waiting').waitFor({ timeout: 10000 });
  const names = await panel.locator('[data-qa="class-reward-request"] .rw-row__title').allTextContents();
  assert.deepEqual(names, ['Ava Martinez', 'Ava Martinez', 'Ben Ortiz']);
});
await teacherPage.screenshot({ path: path.join(shots, '07-teacher-requests-chromebook.png'), fullPage: true });
const avaSeat = panel.locator('[data-qa="class-reward-request"]', { hasText: 'Choose your seat for a day' }).filter({ hasText: 'Ava Martinez' });
await avaSeat.getByRole('button', { name: 'Fulfilled' }).dblclick();
await check('Fulfilled: once, and the points stay spent', async () => {
  await panel.getByText(/Marked Ava Martinez's “Choose your seat for a day” fulfilled/).waitFor({ timeout: 10000 });
  const seat = (await requestsOf(STUDENT)).find((entry) => entry.itemId === 'starter-seat');
  assert.equal(seat.status, 'fulfilled');
  assert.equal(await balanceOf(STUDENT), 30);
});
const avaMusic = panel.locator('[data-qa="class-reward-request"]', { hasText: 'Music with headphones' });
await avaMusic.getByRole('button', { name: 'Decline' }).click();
await check('Decline asks for a reason before it sends anything', async () => {
  await avaMusic.getByRole('button', { name: 'Decline and return 40 points' }).click();
  await avaMusic.getByText('Add a short reason. The student will see it.').waitFor();
  assert.equal(control.calls.filter((name) => name === 'resolveClassRewardRequest').length, 1, 'only the fulfil call so far');
});
await avaMusic.getByLabel(/Reason/).fill('Headphones are away for testing week');
await teacherPage.screenshot({ path: path.join(shots, '08-teacher-decline-chromebook.png'), fullPage: true });
await avaMusic.getByRole('button', { name: 'Decline and return 40 points' }).dblclick();
await check('Decline refunds once and the request leaves the list', async () => {
  await panel.getByText(/40 points were returned/).waitFor({ timeout: 10000 });
  await panel.getByText('1 request waiting').waitFor({ timeout: 10000 });
  assert.equal(await balanceOf(STUDENT), 70);
  const refunds = (await db.collection('classPointTransactions').where('studentId', '==', STUDENT).get()).docs.filter((entry) => entry.data().sourceType === 'rewardRefund');
  assert.equal(refunds.length, 1);
});
await teacherPage.setViewportSize(VIEWPORTS.phone);
await check('the teacher screens at phone width: no sideways scroll, every control at least 44px', async () => {
  await noSideScroll(teacherPage, 'teacher phone');
  assert.deepEqual(await smallTargets(teacherPage), []);
});
await teacherPage.screenshot({ path: path.join(shots, '09-teacher-phone.png'), fullPage: true });

// 4. STUDENT SEES IT LIVE.
await check('the student sees Done, the decline with the teacher\'s reason, and the points back — without a refresh', async () => {
  await shelf.getByText('Declined — points returned').waitFor({ timeout: 10000 });
  await shelf.getByText(/“Headphones are away for testing week”[\s\S]*40 points were given back/).waitFor();
  await shelf.getByText('Done', { exact: true }).waitFor();
  await page.locator('.rw-count--points').filter({ hasText: '70' }).waitFor({ timeout: 10000 });
  // 70 points again: the music reward (no weekly limit) is usable again.
  assert.equal(await musicRow.getByRole('button', { name: 'Use 40 points' }).isDisabled(), false);
});
await page.screenshot({ path: path.join(shots, '10-student-after-teacher-phone.png'), fullPage: true });
await page.setViewportSize(VIEWPORTS.chromebook);
await page.screenshot({ path: path.join(shots, '11-student-my-rewards-chromebook.png'), fullPage: true });
await check('My Rewards at Chromebook width: no sideways scroll', async () => { await noSideScroll(page, 'student chromebook'); });

// 5. TWO TABS: a save from a stale tab is refused, not silently applied.
const staleTab = await (await browser.newContext({ viewport: VIEWPORTS.chromebook })).newPage();
staleTab.on('pageerror', (error) => errors.push(`stale tab: ${error.message}`));
await staleTab.goto(url(`view=teacher&teacher=${encodeURIComponent(TEACHER)}`), { waitUntil: 'domcontentloaded', timeout: 180000 });
const staleEditor = staleTab.locator('[data-qa="class-reward-editor"]');
await staleEditor.locator('[data-qa="catalog-item"]').first().waitFor({ timeout: 60000 });
// The second tab starts editing first; then the first tab saves. (A tab with
// no edits simply takes the newer list from the listener — that is not stale.)
await staleEditor.locator('[data-qa="catalog-item"]').nth(1).getByLabel('Price (Class Points)').fill('45');
await teacherPage.setViewportSize(VIEWPORTS.chromebook);
await editor.locator('[data-qa="catalog-item"]').first().getByLabel('Price (Class Points)').fill('55');
await editor.getByRole('button', { name: 'Save rewards' }).click();
await editor.getByText('Saved. Students see the new list now.').waitFor({ timeout: 10000 });
await staleEditor.getByRole('button', { name: 'Save rewards' }).click();
await check('a save from a stale tab is refused and offers to reload the newer list', async () => {
  await staleEditor.getByText(/changed somewhere else/).waitFor({ timeout: 10000 });
  await staleEditor.getByRole('button', { name: 'Reload the newer list' }).waitFor();
  const catalog = (await db.collection('classRewardCatalogs').doc(CLASS_ID).get()).data();
  assert.equal(catalog.items.find((item) => item.itemId === 'starter-seat').cost, 55);
  assert.equal(catalog.items.find((item) => item.itemId === 'starter-music').cost, 40, 'the stale change was not applied');
});
await staleTab.screenshot({ path: path.join(shots, '12-teacher-stale-tab-chromebook.png'), fullPage: true });
await staleEditor.getByRole('button', { name: 'Reload the newer list' }).click();
await check('Reload brings in the newer list and clears the refusal', async () => {
  assert.equal(await staleEditor.locator('[data-qa="catalog-item"]').first().getByLabel('Price (Class Points)').inputValue(), '55');
  assert.equal(await staleEditor.getByText(/changed somewhere else/).count(), 0);
});

await check('no page threw an error', async () => { assert.deepEqual(errors, []); });

await browser.close();
api.close();
await shutdown();
const failed = checks.filter(([status]) => status === 'FAIL');
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed. Screenshots: ${shots}`);
process.exit(failed.length ? 1 : 0);
