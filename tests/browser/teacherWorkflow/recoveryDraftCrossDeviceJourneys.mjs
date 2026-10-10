// SAVED RECOVERY ANSWERS FOLLOW THE STUDENT TO ANOTHER CHROMEBOOK — IN THE REAL APP.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/recoveryDraftCrossDeviceJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1366x768,390x844 —
//    Chromebook, phone; ONLY=cross,offline to run some journeys.)
//
// Same harness as recoveryHoldJourneys.mjs: the real App.jsx with `firebase/*`
// replaced by in-memory fakes, `&recovery=p0` adding recoveryFixture.js. Theo
// (910975) has an in-progress DOL Recovery whose three questions all render,
// dealt by the real shared server code. Each "device" is a browser context of
// its own — its own local storage — and the driver carries the server (the
// harness database) from one to the next, exactly as draftCrossDeviceJourneys
// does.
//
// The bug: answers the screen called "saved" lived only in that browser's
// localStorage, so the same Recovery opened on another Chromebook read
// "(0/3 saved)" and submitted responses:{} — graded 0.
//
//   cross    Chromebook 1 answers Q1 and Q2: each says "Answer saved to your
//            MathMaster account" only once the server copy
//            (studentWorkspaceDrafts/910975__a-recovery-c-recovery) has it, and
//            that copy holds the two typed answers and nothing that could
//            grade them. A fresh Chromebook 2 (no storage of its own) opens the
//            same Recovery: "(2/3 saved)", Q1/Q2 saved, Q1 shows the saved
//            answer. It answers Q3 and submits: every question graded correct
//            on the server, 100%.
//   offline  a Chromebook whose draft server is out of reach answers Q1: "saved
//            on this device only", never "saved to your account"; back online
//            it syncs, says so, and the server copy has it.
//
// At every viewport nothing scrolls sideways and the page raises no errors.
// Exit code 1 on any failure. Screenshots in
// tests/browser/artifacts/recoveryDraftCrossDevice/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';
import {
  CROSS_DEVICE_STUDENT_ID,
  RECOVERY_CROSS_DEVICE_ASSIGNMENT_ID,
  RECOVERY_CROSS_DEVICE_ASSIGNMENT_TITLE,
  recoveryFieldAnswers,
} from './recoveryFixture.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/recoveryDraftCrossDevice');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const VIEWPORTS = (process.env.VIEWPORTS || '1366x768,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));
const DB_KEY = 'mm-teacher-workflow-harness-db-v1';
const STUDENT = CROSS_DEVICE_STUDENT_ID;
const ASSIGNMENT = RECOVERY_CROSS_DEVICE_ASSIGNMENT_ID;
const DRAFT_DOC = `studentWorkspaceDrafts/${STUDENT}__${ASSIGNMENT}-recovery`;
const STUDENT_QUERY = `recovery=p0&as=student&studentId=${STUDENT}`;

// The student's words (SectionRecoveryRunner.jsx RECOVERY_SAVED_COPY).
const ACCOUNT_COPY = 'Answer saved to your MathMaster account — you can change it until you submit.';
const DEVICE_COPY = 'Answer saved on this device only — it will sync to your MathMaster account when you are back online.';
// Never a key anywhere in the server copy of a student's Recovery answers.
const LEAK_KEYS = ['answerKey', 'acceptedAnswers', 'answerFields', 'solution', 'gradingContract', 'isCorrect', 'expected', 'correctAnswer', 'correctAnswers', 'workedSolution', 'answer'];

// PRE-EXISTING, NOT THIS CHANGE'S (recoveryHoldJourneys.mjs says why): the
// two-step-equation family's answer field is called `solution`, and the
// assignment draft backup refuses that key. Reported as a note — but never
// about a Recovery answer, which must reach the server.
const KNOWN_PREEXISTING = /^console\.error: \[MathMaster draft sync\] The server backup will NOT store "[^"]+": forbidden-key at `solution`/;
const notes = new Set();

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);

const failures = [];
let passed = 0;
const squash = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const check = (where, ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${where}: ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (ok) passed += 1;
  else failures.push(`${where}: ${label}${detail ? ` (${detail})` : ''}`);
  return Boolean(ok);
};
const wanted = (name) => !ONLY || ONLY.includes(name);
const tagOf = (page) => `${page.viewportSize().width}x${page.viewportSize().height}`;
const shot = (page, name) => page.screenshot({ path: path.join(ARTIFACTS, `${name}-${tagOf(page)}.png`), fullPage: true });

/* ------------------------------------------------------------- devices */

/**
 * A Chromebook. `server`: the harness database as the previous device left
 * it; none means a freshly seeded school. Nothing else of the previous
 * device's comes along: a context of its own has no storage of its own.
 */
const openDevice = async (where, { viewport, server = null, params = '' }) => {
  const context = await newSchoolContext(browser, { viewport });
  if (server) {
    await context.addInitScript(([key, value]) => {
      // Once per tab: a reload keeps what this device has saved since.
      if (window.sessionStorage.getItem('mm-journey-server')) return;
      window.sessionStorage.setItem('mm-journey-server', '1');
      window.localStorage.setItem(key, value);
    }, [DB_KEY, server]);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !/Download the React DevTools|favicon/i.test(text)) errors.push(`console.error: ${text.slice(0, 300)}`);
  });
  const unimplemented = watchUnimplementedCallables(page);
  await page.goto(`${PAGE}?${server ? '' : 'reset=1&'}${STUDENT_QUERY}${params}`, { timeout: 300000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(600);
  return { where, context, page, errors, unimplemented };
};

const closeDevice = async (device) => {
  const { where } = device;
  // The draft guard refusing a Recovery answer is this change's failure, never a note.
  const aboutRecovery = device.errors.filter((error) => /forbidden-key/.test(error) && /recovery-answer/.test(error));
  check(where, aboutRecovery.length === 0, 'no draft guard error names a Recovery answer', aboutRecovery.join(' | '));
  device.errors.filter((error) => KNOWN_PREEXISTING.test(error) && !/recovery-answer/.test(error)).forEach((error) => notes.add(error.slice(0, 160)));
  const errors = device.errors.filter((error) => !(KNOWN_PREEXISTING.test(error) && !/recovery-answer/.test(error)));
  check(where, errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
  check(where, device.unimplemented().length === 0, 'every callable reached is implemented', device.unimplemented().join(', '));
  await device.context.close();
};

const harnessDb = async (page) => Object.fromEntries(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), DB_KEY));
const serverDb = (page) => page.evaluate((key) => window.localStorage.getItem(key), DB_KEY);
const recoveryRecord = (db) => db[`grades/${STUDENT}`]?.sectionRecoveryByAssignment?.[ASSIGNMENT]?.dol || null;
const assignmentFrom = (db) => ({ id: ASSIGNMENT, ...db[`assignments/${ASSIGNMENT}`] });
// The server copy of the student's Recovery answers, as stored.
const serverDraft = (page) => page.evaluate((doc) => window.__mmHarnessStore.get(doc) || null, DRAFT_DOC);
const waitForServer = async (page, test, ms = 20000) => {
  const deadline = Date.now() + ms;
  let draft = await serverDraft(page);
  while (!test(draft) && Date.now() < deadline) {
    await page.waitForTimeout(250);
    draft = await serverDraft(page);
  }
  return draft;
};
const entriesOf = (draft) => (draft?.entries || []).map((entry) => ({ ...entry, value: JSON.parse(entry.valueJson) }));
const itemOfKey = (key) => String(key).split(':').pop();

/* ------------------------------------------------------------- layout */

const noSidewaysScroll = async (where, page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(where, overflow <= 1, 'nothing scrolls sideways', `${overflow}px`);
};

/* ------------------------------------------------------------- student */

const openStudentGrades = async (page) => {
  const backToGrades = page.getByRole('button', { name: /^←\s*Grades$/ });
  const viewAllGrades = page.getByRole('button', { name: 'View All Grades' });
  if (await backToGrades.count()) await backToGrades.first().click();
  else if (await viewAllGrades.count()) await viewAllGrades.first().click();
  else await page.getByRole('button', { name: /^Grades$/ }).first().click();
  await page.waitForTimeout(500);
};
const gradeRow = (page, title) => page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).first();
const openRunner = async (page) => {
  await openStudentGrades(page);
  const row = gradeRow(page, RECOVERY_CROSS_DEVICE_ASSIGNMENT_TITLE);
  await row.waitFor({ timeout: 30000 });
  await row.getByRole('button', { name: 'View Results' }).click();
  const card = page.locator('[data-section-recovery-panel] [data-recovery-section="dol"]');
  await card.waitFor({ timeout: 30000 });
  await card.getByRole('button', { name: 'Continue DOL Recovery' }).click();
  const runner = page.locator('[data-recovery-runner="assessment"]');
  await runner.waitFor({ timeout: 30000 });
  return runner;
};

// Type each answer into its field the way a student does: MathLive for math,
// a text box for words. Returns what each box then holds — what the student
// typed, as the app reads it.
const answerQuestion = async (page, runner, answers) => {
  const fields = runner.locator('.mathmaster-multipart-fields > div');
  await fields.first().waitFor({ timeout: 30000 });
  const typed = [];
  for (const [index, answer] of answers.entries()) {
    const input = fields.nth(index).locator('math-field, input[type="text"]').first();
    await input.waitFor({ timeout: 10000 });
    if (await input.evaluate((element) => element.tagName === 'MATH-FIELD')) {
      await input.evaluate((element, value) => {
        element.setValue(value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }, answer.value);
    } else {
      await input.fill(answer.value);
    }
    typed.push(await input.evaluate((element) => element.value));
    await page.waitForTimeout(150);
  }
  await runner.locator('.mathmaster-bar-submit').click();
  return typed;
};
const itemButton = (runner, itemId) => runner.locator(`[data-recovery-item="${itemId}"]`);
const itemState = (runner, itemId) => itemButton(runner, itemId).getAttribute('data-recovery-item-state');
const savedWhere = (runner) => runner.locator('[data-recovery-saved-where]');
const waitForState = async (runner, itemId, state, ms = 20000) => {
  await runner.locator(`[data-recovery-item="${itemId}"][data-recovery-item-state="${state}"]`).waitFor({ timeout: ms });
};

// Every key anywhere in the stored document, the values inside each entry's
// valueJson included.
const allKeys = (value, out = new Set()) => {
  if (Array.isArray(value)) value.forEach((nested) => allKeys(nested, out));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      out.add(key);
      if (key === 'valueJson' && typeof nested === 'string') {
        try { allKeys(JSON.parse(nested), out); } catch { /* reported by the shape check */ }
      } else allKeys(nested, out);
    });
  }
  return out;
};
// Every answer value the stored entries carry.
const storedAnswerValues = (draft) => entriesOf(draft).flatMap((entry) => {
  const response = entry.value?.response;
  if (!response) return [];
  return [...(response.fields || []).map((field) => String(field.value ?? '')), String(response.value ?? '')].filter(Boolean);
});

/* ------------------------------------------------------------- journeys */

const journeys = {
  async cross(viewport) {
    const tag = `${viewport.width}x${viewport.height}`;
    /* ---------------- Chromebook 1: Q1 and Q2 */
    const one = await openDevice(`cross ${tag} Chromebook 1`, { viewport });
    let where = one.where;
    const before = await harnessDb(one.page);
    const assignment = assignmentFrom(before);
    const record = recoveryRecord(before);
    check(where, record?.status === 'inProgress' && record.plan.items.length === 3, 'Theo starts with an in-progress Recovery of three questions', `${record?.status} ${record?.plan?.items?.length}`);
    const [q1, q2, q3] = record.plan.items;
    const keyAnswers = record.plan.items.map((item) => recoveryFieldAnswers(assignment, item));
    check(where, keyAnswers.every(Boolean), 'every pin replays against the lesson (all three questions render)');
    check(where, !await serverDraft(one.page), 'no server copy of his answers yet');

    let runner = await openRunner(one.page);
    const typedBy = {};
    for (const [index, item] of [q1, q2].entries()) {
      await itemButton(runner, item.itemId).click();
      typedBy[item.itemId] = await answerQuestion(one.page, runner, keyAnswers[index]);
      await waitForState(runner, item.itemId, 'saved');
      const status = savedWhere(runner);
      await status.waitFor({ timeout: 10000 });
      check(where, await status.getAttribute('data-recovery-saved-where') === 'account' && squash(await status.innerText()) === ACCOUNT_COPY,
        `Q${index + 1} says "${ACCOUNT_COPY}"`, squash(await status.innerText()));
      check(where, await status.getAttribute('role') === 'status', `Q${index + 1}'s save is announced (role=status)`);
    }
    await noSidewaysScroll(where, one.page);
    await shot(one.page, 'cross-1-saved');

    const draft = await waitForServer(one.page, (doc) => (doc?.entries || []).length >= 2);
    const entries = entriesOf(draft);
    check(where, entries.length === 2, 'the server copy holds exactly the two answers', `${entries.length} entries`);
    check(where, entries.map((entry) => entry.key).sort().join() === [q1, q2].map((item) => `recovery-answer:dol:o1:${item.itemId}`).join(),
      'one entry per answered question, keyed recovery-answer:dol:o1:<item>', entries.map((entry) => entry.key).join());
    const keys = allKeys(draft);
    const leaked = LEAK_KEYS.filter((key) => keys.has(key));
    check(where, leaked.length === 0, 'no answer-key, solution or grading key anywhere in it', leaked.join(', '));
    const typedValues = new Set(Object.values(typedBy).flat());
    const stored = storedAnswerValues(draft);
    const foreign = stored.filter((value) => !typedValues.has(value));
    check(where, stored.length === 3 && foreign.length === 0, 'its only answer values are the ones Theo typed', `stored ${JSON.stringify(stored)}; typed ${JSON.stringify([...typedValues])}`);
    const q3Answers = keyAnswers[2].map((field) => field.value);
    const raw = JSON.stringify(draft);
    check(where, q3Answers.every((value) => !raw.includes(JSON.stringify(value).slice(1, -1))), 'nothing of Q3\'s answer is in it', q3Answers.join(', '));
    const labels = [...keyAnswers[0], ...keyAnswers[1]].map((field) => field.label).filter(Boolean);
    check(where, labels.every((label) => !raw.includes(label)), 'no question text (field labels) in it');
    check(where, draft.secure === false && draft.purpose === 'sectionRecoveryAnswers', 'it is a plain working draft, not a grade', `${draft.secure} ${draft.purpose}`);
    const server = await serverDb(one.page);
    await closeDevice(one);

    /* ---------------- Chromebook 2: fresh, the server only */
    const two = await openDevice(`cross ${tag} Chromebook 2`, { viewport, server });
    where = two.where;
    // This device's own Recovery answer copies (the runner's localStorage keys)
    // and question drafts: none, so whatever it shows came from the server.
    const ownCopies = await two.page.evaluate(() => Object.keys(localStorage).filter((key) => /^mathmaster:recovery-|~recovery~/.test(key)));
    check(where, ownCopies.length === 0, 'a fresh Chromebook: no Recovery answers of its own', ownCopies.join(', '));
    runner = await openRunner(two.page);
    const twoOfThree = runner.getByRole('button', { name: 'Submit DOL Recovery (2/3 saved)' });
    await twoOfThree.waitFor({ timeout: 20000 }).catch(() => {});
    check(where, await twoOfThree.count() === 1, 'Submit reads "(2/3 saved)"', squash(await runner.locator('button', { hasText: 'Submit DOL Recovery' }).first().innerText().catch(() => '')));
    check(where, await itemState(runner, q1.itemId) === 'saved' && await itemState(runner, q2.itemId) === 'saved', 'Q1 and Q2 are saved to his account', `${await itemState(runner, q1.itemId)} ${await itemState(runner, q2.itemId)}`);
    check(where, await itemState(runner, q3.itemId) === 'open', 'Q3 is still open', await itemState(runner, q3.itemId));
    await itemButton(runner, q1.itemId).click();
    const elsewhere = runner.locator(`[data-recovery-saved-elsewhere="${q1.itemId}"]`);
    await elsewhere.waitFor({ timeout: 10000 }).catch(() => {});
    const elsewhereText = squash(await elsewhere.innerText().catch(() => ''));
    check(where, elsewhereText.startsWith(`Your saved answer: ${typedBy[q1.itemId].join('; ')}.`), 'Q1 shows the answer he saved on the other Chromebook', elsewhereText);
    check(where, squash(await savedWhere(runner).innerText().catch(() => '')) === ACCOUNT_COPY, 'and that it is saved to his account');
    await noSidewaysScroll(where, two.page);
    await shot(two.page, 'cross-2-restored');

    await itemButton(runner, q3.itemId).click();
    await answerQuestion(two.page, runner, keyAnswers[2]);
    await waitForState(runner, q3.itemId, 'saved');
    const all = runner.getByRole('button', { name: 'Submit DOL Recovery (3/3 saved)' });
    check(where, await all.count() === 1, 'Submit reads "(3/3 saved)"');
    await all.click();
    await two.page.waitForTimeout(600);
    const anyway = two.page.getByRole('button', { name: 'Submit anyway' });
    const warned = await anyway.count() > 0;
    check(where, !warned, 'Submit does not warn about unanswered questions');
    if (warned) await anyway.first().click();
    const complete = two.page.locator('[data-recovery-runner="complete"]');
    await complete.waitFor({ timeout: 30000 });
    const completeText = squash(await complete.innerText());
    check(where, /Recovery\s*100%/.test(completeText), 'the result screen shows Recovery 100%', completeText.slice(0, 200));
    await noSidewaysScroll(where, two.page);
    await shot(two.page, 'cross-2-complete');

    const after = recoveryRecord(await harnessDb(two.page));
    check(where, after?.status === 'completed', 'stored: completed', after?.status);
    for (const [index, item] of [q1, q2, q3].entries()) {
      const result = after?.results?.[item.itemId] || {};
      check(where, result.status === 'correct' && result.credit === 1 && result.isCorrect === true,
        `Q${index + 1} graded correct on the server, with credit`, JSON.stringify(result));
      check(where, !/unanswered|no-answer/.test(JSON.stringify(result)), `Q${index + 1} was never unanswered`);
    }
    check(where, after?.rawScore === 100, 'stored: Recovery score 100', after?.rawScore);
    await closeDevice(two);
  },

  async offline(viewport) {
    const tag = `${viewport.width}x${viewport.height}`;
    const device = await openDevice(`offline ${tag}`, { viewport, params: '&offline=1' });
    const { where, page } = device;
    const record = recoveryRecord(await harnessDb(page));
    const [q1] = record.plan.items;
    const runner = await openRunner(page);
    // Watch the status line from the start: the account copy must never show.
    await page.evaluate((copy) => {
      window.__mmAccountCopySeen = false;
      new MutationObserver(() => {
        if ((document.querySelector('[data-recovery-saved-where]')?.textContent || '').includes(copy)) window.__mmAccountCopySeen = true;
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    }, ACCOUNT_COPY);
    await itemButton(runner, q1.itemId).click();
    await answerQuestion(page, runner, recoveryFieldAnswers(assignmentFrom(await harnessDb(page)), q1));
    await waitForState(runner, q1.itemId, 'device');
    const status = savedWhere(runner);
    check(where, await status.getAttribute('data-recovery-saved-where') === 'device' && squash(await status.innerText()) === DEVICE_COPY,
      `offline, Q1 says "${DEVICE_COPY}"`, squash(await status.innerText()));
    // Long enough for the first retries to fail too.
    await page.waitForTimeout(3000);
    check(where, await itemState(runner, q1.itemId) === 'device', 'still only on this device while offline', await itemState(runner, q1.itemId));
    check(where, !await page.evaluate(() => window.__mmAccountCopySeen), 'it never said "saved to your account" while offline');
    check(where, !await serverDraft(page), 'nothing reached the server');
    await noSidewaysScroll(where, page);
    await shot(page, 'offline-device-only');

    await page.evaluate(() => window.__mmHarnessStore.setOnline(true));
    await waitForState(runner, q1.itemId, 'saved');
    check(where, squash(await status.innerText()) === ACCOUNT_COPY && await status.getAttribute('data-recovery-saved-where') === 'account', `back online, Q1 says "${ACCOUNT_COPY}"`, squash(await status.innerText()));
    const draft = await waitForServer(page, (doc) => (doc?.entries || []).length >= 1);
    check(where, entriesOf(draft).map((entry) => itemOfKey(entry.key)).join() === q1.itemId, 'and the server copy has its answer', JSON.stringify(entriesOf(draft).map((entry) => entry.key)));
    await shot(page, 'offline-synced');
    await closeDevice(device);
  },
};

const started = Date.now();
for (const viewport of VIEWPORTS) {
  for (const [name, run] of Object.entries(journeys)) {
    if (!wanted(name)) continue;
    const where = `${name} ${viewport.width}x${viewport.height}`;
    const t0 = Date.now();
    try {
      await run(viewport);
      console.log(`ran ${where} in ${Math.round((Date.now() - t0) / 1000)} s`);
    } catch (error) {
      check(where, false, `threw ${String(error?.message || error).split('\n')[0]}`);
      console.log(`threw ${where}: ${String(error?.stack || error).split('\n').slice(0, 4).join(' | ')}`);
    }
  }
}
await browser.close();

if (notes.size) {
  console.log('\nPre-existing, outside this change (reported, not counted):');
  notes.forEach((note) => console.log(`  note ${note}`));
}
console.log(`\n${passed} checks passed in ${Math.round((Date.now() - started) / 1000)} s.`);
if (failures.length) {
  console.log(`\n${failures.length} failure(s):`);
  failures.forEach((failure) => console.log(`  FAIL ${failure}`));
  process.exit(1);
}
console.log('No findings: saved Recovery answers follow the student to any Chromebook.');
