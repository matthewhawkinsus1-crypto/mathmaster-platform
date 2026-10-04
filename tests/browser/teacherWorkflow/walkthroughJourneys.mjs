// WALKTHROUGH OFFERS ONLY THE SELECTED CLASS'S LIVE WORK — AGAINST THE REAL APP.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/walkthroughJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1440x900,390x844.)
//
// Same harness as journeys.mjs: the real App.jsx with `firebase/*` replaced by
// in-memory fakes and a synthetic school (fixture.js). Period 3 is in session
// and two classes share it ("Algebra II — Period 3" and its Lab section).
// Beside the fixture's lessons this journey adds, through the harness store,
// assignments that must NOT be offered to the Period 3 class (last marking
// period, archived, not yet released, an authoring draft, another class's) and
// one that MUST be: overdue but still inside its late window.
//
//   W1  the Assignment and "Lesson to teach" selectors list exactly the class's
//       live work, today's lesson first and selected
//   W2  switching to the Lab class recomputes the list, the selection, and the
//       roster — no Period 3 student appears in the Lab's Walkthrough
//   W3  a class with no live work shows "No active assignments for …" and
//       nothing else
//   W4  a Live Teaching session ends when its lesson is archived, the saved
//       session is retired, and it does not come back after a reload
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/walkthrough/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/walkthrough');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const VIEWPORTS = (process.env.VIEWPORTS || '1440x900,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const findings = [];
const passed = [];
const expect = (label, condition, detail) => {
  if (condition) passed.push(label);
  else findings.push(`${label}: ${detail}`);
};

const ALG2 = 'Algebra II — Period 3';
const LAB = 'Algebra II Lab — Period 3';
const TODAY = 'Systems of Equations — Lesson 3: Elimination';
const YESTERDAY = 'Systems of Equations — Lesson 2: Substitution';
const OVERDUE = 'Walkthrough probe — overdue, still open';
const NOT_OFFERED = [
  'Walkthrough probe — last marking period',
  'Walkthrough probe — archived',
  'Walkthrough probe — not released yet',
  'Walkthrough probe — authoring draft',
  'Walkthrough probe — Algebra I class',
  'Linear Functions — Review', // fixture: closed last week
  'Unit 1 — Test Review', // fixture: 1st marking period
  'Quadratics — Lesson 1', // fixture: library, never assigned
];

// The probe assignments, built in the page so their dates are relative to the
// page's clock and every other field matches the fixture's lessons.
const addProbes = (page) => page.evaluate(() => {
  const store = window.__mmHarnessStore;
  const base = store.get('assignments/a-today');
  const DAY = 86_400_000;
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const open = { releaseAt: iso(now - 2 * DAY), dueAt: iso(now + 2 * DAY), lateDueAt: iso(now + 5 * DAY) };
  const mp1 = { id: 'mp1', label: '1st Marking Period', order: 1 };
  const probe = (id, title, extra) => store.set(`assignments/${id}`, {
    ...base, ...open, title, assignedClassIds: ['c-alg2-p3'], assignedClassPeriods: ['Period 3'],
    warmup: { enabled: false }, dol: { enabled: false }, ...extra,
  });
  probe('w-prior-mp', 'Walkthrough probe — last marking period', { gradingPeriod: mp1 });
  probe('w-archived', 'Walkthrough probe — archived', { archived: true });
  probe('w-future', 'Walkthrough probe — not released yet', { releaseAt: iso(now + DAY) });
  probe('w-draft', 'Walkthrough probe — authoring draft', { authoringState: 'incomplete' });
  probe('w-alg1', 'Walkthrough probe — Algebra I class', { assignedClassIds: ['c-alg1-p1'], assignedClassPeriods: ['Period 1'] });
  probe('w-overdue', 'Walkthrough probe — overdue, still open', { releaseAt: iso(now - 4 * DAY), dueAt: iso(now - DAY), lateDueAt: iso(now + 3 * DAY) });
});

const options = (page, label) => page.locator(`select[aria-label="${label}"] option`).evaluateAll(
  (nodes) => nodes.filter((node) => node.value && node.value !== 'all').map((node) => node.textContent.trim()),
);
const selectedText = (page, label) => page.locator(`select[aria-label="${label}"]`).evaluate((node) => node.selectedOptions[0]?.textContent.trim() || '');
const chooseClass = async (page, name) => {
  await page.getByRole('group', { name: 'Classes in session' }).getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(250);
};
const openWalkthrough = async (page) => {
  await page.getByRole('tab', { name: /^Walkthrough/ }).click();
  await page.waitForTimeout(200);
};
const liveSection = (page) => page.locator('#home-live-class');
const sameSet = (left, right) => left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);

for (const viewport of VIEWPORTS) {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${PAGE}?reset=1`);
  await page.getByRole('heading', { name: 'Live Class', exact: true }).waitFor({ timeout: 60_000 });
  await addProbes(page);
  await chooseClass(page, ALG2);
  await openWalkthrough(page);

  // ------------------------------------------------------------------ W1
  const offered = await options(page, 'Assignment');
  expect(`W1 ${tag} Assignment selector lists exactly the class's live work`, sameSet(offered, [TODAY, YESTERDAY, OVERDUE]), `offered ${JSON.stringify(offered)}`);
  expect(`W1 ${tag} nothing from another class, an earlier marking period, the archive, drafts or the future`, NOT_OFFERED.every((title) => !offered.includes(title)), `offered ${JSON.stringify(offered)}`);
  expect(`W1 ${tag} today's lesson is first and selected`, offered[0] === TODAY && (await selectedText(page, 'Assignment')) === TODAY, `first ${offered[0]}, selected ${await selectedText(page, 'Assignment')}`);
  expect(`W1 ${tag} overdue work still inside its late window is offered`, offered.includes(OVERDUE), 'overdue probe missing');
  const teachable = await options(page, 'Lesson to teach');
  expect(`W1 ${tag} "Lesson to teach" offers the same list`, sameSet(teachable, offered), `teachable ${JSON.stringify(teachable)}`);
  await liveSection(page).screenshot({ path: path.join(ARTIFACTS, `W1-${tag}-period3-walkthrough.png`) });

  // ------------------------------------------------------------------ W2
  const db = await page.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('mm-teacher-workflow-harness-db-v1'))));
  const namesIn = (classId) => Object.entries(db)
    .filter(([key, value]) => key.startsWith('grades/') && value?.classId === classId && value?.displayName)
    .map(([, value]) => value.displayName);
  const alg2Names = namesIn('c-alg2-p3');
  const alg2Only = alg2Names.filter((name) => !namesIn('c-lab-p3').includes(name));
  await chooseClass(page, LAB);
  const labOffered = await options(page, 'Assignment');
  expect(`W2 ${tag} switching class recomputes the list`, sameSet(labOffered, [TODAY]), `lab offered ${JSON.stringify(labOffered)}`);
  expect(`W2 ${tag} still in Walkthrough, on the Lab's lesson`, (await page.getByRole('tab', { name: /^Walkthrough/ }).getAttribute('aria-selected')) === 'true' && (await selectedText(page, 'Assignment')) === TODAY, `selected ${await selectedText(page, 'Assignment')}`);
  await page.getByRole('button', { name: /^All · / }).click().catch(() => {});
  const labText = await liveSection(page).innerText();
  const leaked = alg2Only.filter((name) => labText.includes(name));
  expect(`W2 ${tag} the Lab's Walkthrough roster has no Period 3 (Algebra II) student`, leaked.length === 0, `leaked ${JSON.stringify(leaked)}`);
  await liveSection(page).screenshot({ path: path.join(ARTIFACTS, `W2-${tag}-lab-walkthrough.png`) });

  // ------------------------------------------------------------------ W3
  await page.evaluate(() => window.__mmHarnessStore.update('assignments/a-today', { assignedClassIds: ['c-alg2-p3'] }));
  await page.waitForTimeout(300);
  const empty = liveSection(page).locator('[data-walkthrough-empty="no-active-work"]');
  expect(`W3 ${tag} a class with no live work says so`, (await empty.count()) === 1 && /No active assignments for Algebra II Lab — Period 3\./.test(await empty.innerText()), 'empty state missing');
  const emptyOffered = await options(page, 'Assignment');
  expect(`W3 ${tag} and offers nothing — no global fallback`, emptyOffered.length === 0, `offered ${JSON.stringify(emptyOffered)}`);
  await liveSection(page).screenshot({ path: path.join(ARTIFACTS, `W3-${tag}-empty.png`) });
  await page.evaluate(() => window.__mmHarnessStore.update('assignments/a-today', { assignedClassIds: ['c-alg2-p3', 'c-lab-p3'] }));

  // ------------------------------------------------------------------ W4
  await chooseClass(page, ALG2);
  await page.locator('select[aria-label="Lesson to teach"]').selectOption({ label: TODAY });
  await page.getByRole('button', { name: 'Teach This Lesson' }).click();
  await page.getByText(/LIVE TEACHING · Teacher exemplar/).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: /Back to Instructor Dashboard/i }).first().click();
  await page.getByText(`Teaching: ${TODAY}`).waitFor({ timeout: 15_000 });
  const sessionPath = await page.evaluate(() => window.__mmHarnessStore.paths('walkthroughSessions/')[0] || null);
  expect(`W4 ${tag} Live Teaching starts for the class the panel showed`, Boolean(sessionPath) && /c-alg2-p3/.test(sessionPath), `session ${sessionPath}`);
  await page.evaluate(() => window.__mmHarnessStore.update('assignments/a-today', { archived: true }));
  await page.waitForTimeout(500);
  expect(`W4 ${tag} archiving the lesson ends the live session`, (await page.getByText(`Teaching: ${TODAY}`).count()) === 0, 'still teaching an archived lesson');
  const retired = await page.evaluate((key) => window.__mmHarnessStore.get(key), sessionPath);
  expect(`W4 ${tag} the saved session is retired`, retired?.active === false, `active=${retired?.active}`);
  // A reload WITHOUT ?reset=1: the in-memory store survives (localStorage), as
  // production's Firestore would.
  await page.goto(PAGE);
  await page.getByRole('heading', { name: 'Live Class', exact: true }).waitFor({ timeout: 60_000 });
  await chooseClass(page, ALG2);
  await openWalkthrough(page);
  const afterReload = await options(page, 'Assignment');
  expect(`W4 ${tag} after a reload the stale lesson is not restored or offered`, (await page.getByText(`Teaching: ${TODAY}`).count()) === 0 && !afterReload.includes(TODAY), `offered ${JSON.stringify(afterReload)}`);
  await liveSection(page).screenshot({ path: path.join(ARTIFACTS, `W4-${tag}-after-reload.png`) });

  expect(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
passed.forEach((label) => console.log(`  ok   ${label}`));
findings.forEach((finding) => console.log(`  FAIL ${finding}`));
console.log(`\n${passed.length} passed, ${findings.length} failed. Screenshots: ${path.relative(repo, ARTIFACTS)}`);
if (findings.length) process.exitCode = 1;
