// REMOVE A LESSON FROM TEAMS, IN GRADE EXPORT (the owner, 2026-11-27).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/teamsRemovalJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1440x900,390x844.)
//
// The real App.jsx with `firebase/*` replaced by the in-memory fakes; the
// TEAMS sync callables run the real pure server module
// (functions/shared/teamsSyncServer.mjs). The MathMaster extension's side
// (reading TEAMS and applying each batch) is played here, through the same
// teamsSyncStep callable the extension calls, against a TEAMS gradebook
// kept in this script.
//
//   T1  Link Period 1 to TEAMS 15001/01 and Send now; the extension creates
//       each lesson section's TEAMS assignment, and one gets two grades.
//   T2  Remove a lesson from TEAMS: "Remove from TEAMS" asks again before
//       anything is recorded; once recorded, the lesson waits for the sync,
//       and it is still listed for Grade Export.
//   T3  The sync finds two grades in it: it is not removed. Grade Export
//       says so, and "Remove with its grades" works only once 2 is typed.
//   T4  The next sync removes it from TEAMS; Grade Export says "Removed from
//       TEAMS". A later sync does not create it again.
//   T5  "Send to TEAMS again" takes it off the list; the next sync creates
//       its TEAMS assignment once more.
//
// At each size: nothing scrolls the page sideways, and no page error.
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/teamsRemoval/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/teamsRemoval');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const BASE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const VIEWPORTS = (process.env.VIEWPORTS || '1440x900,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const CLASS = 'c-alg1-p1';
const P1 = 'Algebra I — Period 1';
const SECTION = '15001/01';

const findings = [];
const passed = [];
const squash = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const text = async (locator) => squash(await locator.innerText());
const expect = (journey, condition, detail) => {
  if (!condition) findings.push({ journey, detail });
  return Boolean(condition);
};
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const shot = (page, name) => page.screenshot({ path: path.join(ARTIFACTS, `${name}-${page.viewportSize().width}.png`), fullPage: false }).catch(() => {});
const sidebar = async (page, name) => {
  const nav = page.locator('nav, aside').getByRole('button', { name: new RegExp(`${name}(\\s*\\(\\d+\\))?$`) }).first();
  if (!(await nav.isVisible().catch(() => false))) {
    // A phone keeps the sidebar behind its menu button.
    const menu = page.getByRole('button', { name: /menu|navigation/i }).first();
    if (await menu.isVisible().catch(() => false)) { await menu.click(); await settle(page, 400); }
  }
  await nav.click();
  await settle(page, 1500);
};

// The extension's side: a TEAMS gradebook held here, read back and changed
// as TEAMS would, through the teamsSyncStep callable the extension calls.
const teams = { columns: [], cells: {}, nextId: 1 };
const readback = (sisIds) => ({
  markingPeriods: [{ id: 'MP3', start: '2026-01-01', end: '2027-06-30' }],
  roster: sisIds.map((sisStudentId) => ({ sisStudentId, enteredOn: '2026-01-01' })),
  columns: teams.columns.map((column) => ({ ...column })),
  cells: structuredClone(teams.cells),
});
const step = (page, data) => page.evaluate(async (payload) => {
  const { httpsCallable } = await import('/tests/browser/teacherWorkflow/fakeFunctions.js');
  return (await httpsCallable(null, 'teamsSyncStep')(payload)).data;
}, data);
// One sync, as the extension runs it: step, apply, report, until done.
const syncOnce = async (page, sisIds) => {
  let outcomes = [];
  for (let round = 0; round < 8; round += 1) {
    const response = await step(page, { classId: CLASS, runnerId: 'journey-runner-0001', readbacks: { [SECTION]: readback(sisIds) }, outcomes });
    if (response.status !== 'work') return response;
    outcomes = response.ops.map((op) => {
      if (op.type === 'createColumn') {
        const id = `T${teams.nextId++}`;
        teams.columns.push({ id, name: op.spec.name, category: op.spec.category, markingPeriod: op.spec.markingPeriod, assignedDate: op.spec.assignedDate, dueDate: op.spec.dueDate, weight: op.spec.weight });
        teams.cells[id] = {};
        return { opId: op.opId, ok: true, columnId: id };
      }
      if (op.type === 'deleteColumn') {
        teams.columns = teams.columns.filter((column) => column.id !== op.columnId);
        delete teams.cells[op.columnId];
        return { opId: op.opId, ok: true };
      }
      if (op.type === 'setWeight') { teams.columns.find((column) => column.id === op.columnId).weight = op.weight; return { opId: op.opId, ok: true }; }
      if (op.type === 'setColumnDates') { Object.assign(teams.columns.find((column) => column.id === op.columnId), { assignedDate: op.assignedDate, dueDate: op.dueDate }); return { opId: op.opId, ok: true }; }
      // An import: "id,grade" lines.
      op.importFile.body.split(/\r?\n/).filter(Boolean).forEach((line) => {
        const [sis, grade] = line.split(',');
        if (grade !== '') teams.cells[op.columnId][sis] = Number(grade);
      });
      return { opId: op.opId, ok: true, errors: [] };
    });
  }
  return { status: 'unfinished' };
};
const classState = (page) => page.evaluate((id) => JSON.parse(localStorage.getItem('mm-teacher-workflow-harness-db-v1')).find(([key]) => key === `teamsSyncClasses/${id}`)?.[1] || null, CLASS);

const card = (page) => page.locator(`[data-teams-sync-class="${CLASS}"]`);
const openPanel = async (page) => {
  await sidebar(page, 'Grade Export');
  const panel = page.locator('[data-teams-sync-panel]');
  await panel.waitFor({ timeout: 30000 });
  if (!(await page.evaluate(() => document.querySelector('[data-teams-sync-panel]')?.open === true))) await panel.locator('summary').first().click();
  await card(page).getByRole('textbox', { name: 'TEAMS section(s)' }).waitFor();
  await page.waitForFunction((id) => !/Checking…/.test(document.querySelector(`[data-teams-sync-class="${id}"]`)?.innerText || 'Checking…'), CLASS, { timeout: 20000 });
};
const openRemovals = async (page) => {
  const removals = card(page).locator('[data-teams-sync-removals]');
  await removals.waitFor({ timeout: 10000 });
  if (!(await page.evaluate((id) => document.querySelector(`[data-teams-sync-class="${id}"] [data-teams-sync-removals]`)?.open === true, CLASS))) await removals.locator('summary').click();
  await settle(page, 300);
  return removals;
};

const run = async (page, viewport) => {
  // T1 ------------------------------------------------------------------------
  await openPanel(page);
  await card(page).getByRole('textbox', { name: 'TEAMS section(s)' }).fill(SECTION);
  await card(page).getByRole('button', { name: 'Save sections' }).click();
  await card(page).getByText(`Linked to TEAMS ${SECTION}.`).waitFor({ timeout: 10000 });
  const send = card(page).getByRole('button', { name: 'Send now' });
  await page.waitForFunction((id) => !document.querySelector(`[data-teams-sync-class="${id}"] button.tw-btn--primary`)?.disabled, CLASS, { timeout: 30000 });
  await send.click();
  await card(page).getByText(/Sent \d+ lesson sections? for/).waitFor({ timeout: 10000 });
  const published = (await classState(page))?.targets || [];
  expect('T1', published.length > 0, `lesson sections were sent to the sync (${published.length})`);
  const sisIds = [...new Set(published.flatMap((target) => [...(target.rows || []), ...(target.withheld || []), ...(target.excused || [])].map((row) => row.sisStudentId)))];
  let response = await syncOnce(page, sisIds);
  expect('T1', response.status === 'done' && teams.columns.length === published.length, `the extension created one TEAMS assignment per lesson section (${teams.columns.length} of ${published.length}, ${response.status})`);
  const chosenTarget = published[0];
  const chosenColumn = teams.columns.find((column) => column.name === chosenTarget.name);
  // Grades in it, as TEAMS holds them: the ones the sync sent, and two typed in TEAMS.
  [sisIds[0] || '1000001', sisIds[1] || '1000002'].forEach((sis, index) => { teams.cells[chosenColumn.id][sis] = 80 + index; });
  const graded = Object.values(teams.cells[chosenColumn.id]).filter((value) => value !== '' && value !== null).length;

  // T2 ------------------------------------------------------------------------
  let removals = await openRemovals(page);
  const select = removals.getByRole('combobox', { name: 'Lesson' });
  await select.selectOption(chosenTarget.key);
  await removals.getByRole('button', { name: 'Remove from TEAMS' }).click();
  expect('T2', !(await classState(page))?.removals?.[chosenTarget.key], 'the first press records nothing');
  await removals.getByRole('button', { name: 'Yes, remove from TEAMS' }).click();
  await card(page).getByText(/Marked to remove from TEAMS\. The lesson stays in MathMaster\./).waitFor({ timeout: 10000 });
  expect('T2', Boolean((await classState(page))?.removals?.[chosenTarget.key]), 'the removal is kept on the class');
  const item = removals.locator(`[data-teams-removal="${chosenTarget.key}"]`);
  expect('T2', /Waiting for the next sync/.test(await text(item)), `it waits for the sync (${await text(item)})`);
  expect('T2', !(await select.locator(`option[value="${chosenTarget.key}"]`).count()), 'it is no longer offered for removal');
  await shot(page, 'T2-removed-waiting');

  // T3 ------------------------------------------------------------------------
  response = await syncOnce(page, sisIds);
  expect('T3', teams.columns.some((column) => column.id === chosenColumn.id), 'an assignment with grades is not removed yet');
  // Reopened without ?reset=1, so the school (and the sync state) stays.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByText('IN SESSION NOW').waitFor({ timeout: 60000 });
  await openPanel(page);
  removals = await openRemovals(page);
  const waitingItem = removals.locator(`[data-teams-removal="${chosenTarget.key}"]`);
  const waitingText = await text(waitingItem);
  expect('T3', /Has grades in TEAMS/.test(waitingText) && waitingText.includes(`${graded} grades.`), `Grade Export says it has ${graded} grades (${waitingText})`);
  const confirm = waitingItem.getByRole('textbox', { name: `Type ${graded} to remove its ${graded} TEAMS grades with it` });
  const removeWithGrades = waitingItem.getByRole('button', { name: 'Remove with its grades' });
  await confirm.fill(String(graded + 1));
  expect('T3', await removeWithGrades.isDisabled(), 'a wrong number does not confirm');
  await confirm.fill(String(graded));
  expect('T3', !(await removeWithGrades.isDisabled()), 'the right number does');
  await shot(page, 'T3-confirm');
  await removeWithGrades.click();
  await card(page).getByText(/Confirmed\. The extension removes it from TEAMS on its next sync\./).waitFor({ timeout: 10000 });
  expect('T3', (await classState(page))?.removals?.[chosenTarget.key]?.confirmedGradeCount === graded, 'the confirmed count is kept');

  // T4 ------------------------------------------------------------------------
  response = await syncOnce(page, sisIds);
  expect('T4', !teams.columns.some((column) => column.id === chosenColumn.id), 'the next sync removes it from TEAMS');
  response = await syncOnce(page, sisIds);
  expect('T4', !teams.columns.some((column) => column.name === chosenTarget.name), 'a later sync does not create it again');
  // Reopened without ?reset=1, so the school (and the sync state) stays.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByText('IN SESSION NOW').waitFor({ timeout: 60000 });
  await openPanel(page);
  removals = await openRemovals(page);
  const doneText = await text(removals.locator(`[data-teams-removal="${chosenTarget.key}"]`));
  expect('T4', /Removed from TEAMS\./.test(doneText), `Grade Export says it was removed (${doneText})`);
  await shot(page, 'T4-removed');

  // T5 ------------------------------------------------------------------------
  await removals.locator(`[data-teams-removal="${chosenTarget.key}"]`).getByRole('button', { name: 'Send to TEAMS again' }).click();
  await card(page).getByText(/Sent to TEAMS again\./).waitFor({ timeout: 10000 });
  expect('T5', !(await removals.locator(`[data-teams-removal="${chosenTarget.key}"]`).count()), 'it leaves the removed list');
  response = await syncOnce(page, sisIds);
  expect('T5', teams.columns.filter((column) => column.name === chosenTarget.name).length === 1, 'the next sync creates its TEAMS assignment once more');

  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
  expect('T5', overflow <= 1, `no sideways scrolling at ${viewport.width}px (${overflow}px)`);
};

for (const viewport of VIEWPORTS) {
  teams.columns = []; teams.cells = {}; teams.nextId = 1;
  const context = await newSchoolContext(browser, { viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const unimplemented = watchUnimplementedCallables(page);
  const label = `teams-removal@${viewport.width}`;
  const before = findings.length;
  try {
    await page.goto(`${BASE}?reset=1`, { waitUntil: 'domcontentloaded' });
    await page.getByText('IN SESSION NOW').waitFor({ timeout: 60000 });
    await settle(page, 800);
    await run(page, viewport);
    expect(label, !unimplemented().length, `reached a callable the harness does not implement: ${unimplemented().join(', ')}`);
  } catch (error) {
    const where = await card(page).innerText({ timeout: 2000 }).catch(() => '(no class card)');
    findings.push({ journey: label, detail: `stopped: ${error.message.split('\n')[0]} — ${squash(where).slice(0, 600)}` });
    await shot(page, 'stopped');
  }
  errors.forEach((message) => findings.push({ journey: label, detail: `page error: ${message}` }));
  if (findings.length === before) passed.push(label);
  await context.close();
}
await browser.close();

console.log(`passed: ${passed.join(', ') || 'none'}`);
if (findings.length) {
  console.log(`\n${findings.length} finding(s):`);
  findings.forEach(({ journey, detail }) => console.log(`  [${journey}] ${detail}`));
  process.exit(1);
}
console.log('All Remove from TEAMS journeys passed.');
