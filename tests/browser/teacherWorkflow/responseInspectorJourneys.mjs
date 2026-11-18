// THE RESPONSE INSPECTOR JOURNEYS, AGAINST THE REAL APP IN MEMORY (#249, #554 item 8).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/responseInspectorJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1440x900,390x844;
//    ONLY=R1,R2 to run some journeys.)
//
// Same harness as journeys.mjs, with `&inspector=1` (inspectorFixture.js):
// today's lesson answered and graded for "910003" (synthetic), its evidence
// stored as ingestion stores it, and the inspectStudentResponse fake running
// the real shared model (fakeFunctions.js).
//
//   R1  the gradebook: a student's work → "Inspect Response / Override Grade"
//       on each kind of question — typed boxes misread (a decimal comma), a
//       factored-form box answered with the key's value, a graph, a table and
//       a Step Algebra solve with its steps — each read field by field, never
//       as raw JSON, the reasons named, and focus back on the button after Close
//   R2  Live View: "Inspect answer" on the student's tile opens the same
//       inspector on the question they are on (Classwork Q1), without also
//       opening the student; a Walkthrough card offers it too; the projector
//       (Large room tiles) never does
//
// At each size: nothing scrolls the page sideways, nothing in the dialog is
// wider than it except the field comparison's own scrolling region, and the
// table has its column and row headers.
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/responseInspector/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';
import { INSPECTOR_STUDENT_ID } from './inspectorFixture.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/responseInspector');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1&inspector=1`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const VIEWPORTS = (process.env.VIEWPORTS || '1440x900,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));
const LESSON = 'Systems of Equations — Lesson 3: Elimination';

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const findings = [];
const passed = [];
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();
const expect = (journey, condition, detail) => {
  if (!condition) findings.push({ journey, detail });
  return Boolean(condition);
};
const inspectorDialog = (page) => page.getByRole('dialog', { name: 'Student Response Inspector' });

// The inspector loaded and drawn: its field comparison, or the reason it has none.
const openedInspector = async (page) => {
  const dialog = inspectorDialog(page);
  await dialog.waitFor({ timeout: 60_000 });
  await dialog.locator('[data-inspector-field-view]').waitFor({ timeout: 60_000 });
  return dialog;
};

// What a phone teacher meets: the page never scrolls sideways, and in the
// dialog only the field comparison's region is wider than its box.
const layoutFindings = async (page) => page.evaluate(() => {
  const problems = [];
  const root = document.scrollingElement || document.documentElement;
  if (root.scrollWidth > window.innerWidth + 1) problems.push(`the page scrolls sideways (${root.scrollWidth} > ${window.innerWidth})`);
  const panel = document.querySelector('[data-response-inspector]');
  if (!panel) return ['no inspector panel'];
  const box = panel.getBoundingClientRect();
  if (box.right > window.innerWidth + 1 || box.left < -1) problems.push(`the dialog is wider than the screen (${Math.round(box.left)}–${Math.round(box.right)})`);
  const region = panel.querySelector('[role="region"][aria-label="Field comparison"]');
  for (const element of panel.querySelectorAll('*')) {
    if (region && (element === region || region.contains(element))) continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    if (rect.right > box.right + 1 || rect.left < box.left - 1) {
      problems.push(`${element.tagName.toLowerCase()}${element.getAttribute('data-inspector-row') ? `[row ${element.getAttribute('data-inspector-row')}]` : ''} sticks out of the dialog: "${(element.textContent || '').trim().slice(0, 40)}"`);
      break;
    }
  }
  return problems;
});

// Headed by column and by row: the table a screen reader can read.
const tableFindings = async (dialog) => {
  const table = dialog.locator('[role="region"][aria-label="Field comparison"] table');
  if (!await table.count()) return ['no field comparison table'];
  const columns = await table.locator('thead th[scope="col"]').count();
  const rows = await table.locator('tbody tr').count();
  const rowHeaders = await table.locator('tbody th[scope="row"]').count();
  const cells = await table.locator('tbody tr').evaluateAll((entries) => entries.map((entry) => entry.children.length));
  const problems = [];
  if (columns < 3 || columns > 6) problems.push(`${columns} column headers`);
  if (!rows || rowHeaders !== rows) problems.push(`${rowHeaders} row headers for ${rows} rows`);
  if (cells.some((count) => count !== columns)) problems.push(`rows with ${cells.join(', ')} cells under ${columns} columns`);
  if (!await table.locator('caption').count()) problems.push('no caption');
  return problems;
};

const closeInspector = async (page, opener, journey, label) => {
  await inspectorDialog(page).getByRole('button', { name: 'Close', exact: true }).click();
  await inspectorDialog(page).waitFor({ state: 'detached', timeout: 10_000 });
  const focused = await opener.evaluate((element) => element === document.activeElement);
  expect(journey, focused, `${label}: focus is back on the control that opened the inspector`);
};

const shot = (page, name, viewport) => page.screenshot({ path: path.join(ARTIFACTS, `${name}-${viewport.width}.png`), fullPage: false }).catch(() => {});

// Home → the student's tile name → their drawer → today's lesson → Work.
const openStudentWork = async (page) => {
  const tile = page.locator(`[data-live-tile="${INSPECTOR_STUDENT_ID}"]`);
  await tile.waitFor({ timeout: 60_000 });
  await tile.getByRole('button').first().click();
  const drawer = page.locator('aside[aria-label^="Learning profile for"]');
  await drawer.waitFor({ timeout: 30_000 });
  await drawer.locator('li', { hasText: LESSON }).getByRole('button', { name: 'Work' }).click();
  await page.getByRole('button', { name: 'Inspect Response / Override Grade' }).first().waitFor({ timeout: 60_000 });
};
const inspectQuestion = (page, number, type) => page.locator('article', { hasText: `Question ${number} · ${type}` })
  .getByRole('button', { name: 'Inspect Response / Override Grade' });

const journeys = {
  async R1(page, viewport) {
    await openStudentWork(page);
    const cases = [
      { number: 2, type: 'multiAnswer', name: 'typed-boxes', reason: 'Read differently from how it was typed', shows: ['0,49', 'The grader does not read a comma as a decimal point.', 'To accept it, use Grant Credit for r² under Grading Actions.'] },
      { number: 3, type: 'multiAnswer', name: 'factored-form', reason: 'Same value as the key, but not accepted', shows: ['x^2+5x+6', 'this box asks for factored form.'] },
      { number: 4, type: 'graphing2', name: 'graph', heading: 'The submitted work', shows: ['(0, 1), (2, 5)', 'y = 2x + 1'] },
      { number: 5, type: 'table', name: 'table', shows: ['y, row 2 (x = 0)', 'y, row 4 (x = 2)'] },
      { number: 6, type: 'stepAlgebra', name: 'step-algebra', heading: 'Steps the student took', shows: ['Subtract 3 from both sides', '2 x + 3 = 7', 'Divide both sides by 2', 'Final equation'] },
    ];
    for (const entry of cases) {
      const opener = inspectQuestion(page, entry.number, entry.type);
      await opener.scrollIntoViewIfNeeded();
      await opener.click();
      const dialog = await openedInspector(page);
      const said = await text(dialog);
      if (entry.reason) expect('R1', said.includes(entry.reason), `${entry.name}: the reason "${entry.reason}" is named`);
      if (entry.heading) expect('R1', await dialog.getByRole('heading', { name: entry.heading }).count() === 1, `${entry.name}: "${entry.heading}" is a heading`);
      entry.shows.forEach((shown) => expect('R1', said.includes(shown), `${entry.name}: shows "${shown}"`));
      const raw = await dialog.locator('[data-inspector-field-view]').evaluate((view) => {
        const copy = view.cloneNode(true);
        copy.querySelectorAll('details').forEach((details) => details.remove());
        return copy.textContent || '';
      });
      expect('R1', !/\{"(?:points|equation|fields|kind)"/.test(raw), `${entry.name}: no raw JSON outside its details control`);
      (await tableFindings(dialog)).forEach((problem) => expect('R1', false, `${entry.name}: ${problem}`));
      (await layoutFindings(page)).forEach((problem) => expect('R1', false, `${entry.name}: ${problem}`));
      await shot(page, `gradebook-${entry.name}`, viewport);
      await dialog.getByRole('heading', { name: 'Why was this marked wrong?' }).evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
      await shot(page, `gradebook-${entry.name}-why`, viewport);
      await closeInspector(page, opener, 'R1', entry.name);
    }
  },

  async R2(page, viewport) {
    const tile = page.locator(`[data-live-tile="${INSPECTOR_STUDENT_ID}"]`);
    await tile.waitFor({ timeout: 60_000 });
    const opener = tile.locator(`[data-live-inspect="${INSPECTOR_STUDENT_ID}"]`);
    // The tile can draw before the class's assignments have loaded; the entry follows them.
    await opener.waitFor({ timeout: 30_000 }).catch(() => {});
    expect('R2', await opener.count() === 1, 'the tile of a student with an answer on their question offers the inspector');
    expect('R2', /Inspect the answer to Classwork Q1 for /.test(await opener.getAttribute('aria-label') || ''), 'the control is named for the question and the student');
    // A student whose current question has no answer yet is offered none.
    const unanswered = await page.locator('[data-live-tile]').evaluateAll((tiles) => tiles.filter((element) => !element.querySelector('[data-live-inspect]')).length);
    expect('R2', unanswered > 0, 'tiles with no answer on the current question offer no inspector');
    await opener.click();
    const dialog = await openedInspector(page);
    const said = await text(dialog);
    expect('R2', said.includes('Question a-today-c1'), `the inspector opened on the question the student is on (${said.slice(0, 160)})`);
    expect('R2', said.includes('Read differently from how it was typed'), 'the same reasons as from the gradebook');
    expect('R2', await page.locator('aside[aria-label^="Learning profile for"]').count() === 0, 'the click did not also open the student');
    (await tableFindings(dialog)).forEach((problem) => expect('R2', false, problem));
    (await layoutFindings(page)).forEach((problem) => expect('R2', false, problem));
    await shot(page, 'live-view', viewport);
    await closeInspector(page, opener, 'R2', 'Live View');

    // The projector: Large room tiles never offer it.
    await page.getByRole('button', { name: 'Large room tiles' }).click();
    await page.locator('[data-live-tile]').first().waitFor();
    expect('R2', await page.locator('[data-live-inspect]').count() === 0, 'Large room tiles (the projector) offer no inspector');
    await page.getByRole('button', { name: 'Large room tiles' }).click();

    // Walkthrough: the card for the same student, when it lists them.
    await page.getByRole('tab', { name: /^Walkthrough/ }).click();
    await page.getByRole('button', { name: /^All \(/ }).first().click();
    const card = page.locator(`[data-live-inspect="${INSPECTOR_STUDENT_ID}"]`);
    if (await card.count()) {
      await card.click();
      const fromWalkthrough = await openedInspector(page);
      expect('R2', (await text(fromWalkthrough)).includes('Question a-today-c1'), 'the Walkthrough card opens the same question');
      await closeInspector(page, card, 'R2', 'Walkthrough');
    } else {
      expect('R2', false, 'the Walkthrough card for the student offers the inspector');
    }
  },
};

for (const viewport of VIEWPORTS) {
  for (const [name, run] of Object.entries(journeys)) {
    if (ONLY && !ONLY.includes(name)) continue;
    const context = await newSchoolContext(browser, { viewport });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    const unimplemented = watchUnimplementedCallables(page);
    const label = `${name} @ ${viewport.width}x${viewport.height}`;
    try {
      await page.goto(PAGE, { timeout: 180_000 });
      await page.getByRole('heading', { name: 'Live Class', exact: true }).waitFor({ timeout: 180_000 });
      const before = findings.length;
      await run(page, viewport);
      expect(name, pageErrors.length === 0, `no page errors (${pageErrors.slice(0, 2).join(' | ')})`);
      expect(name, !unimplemented().length, `reached a callable the harness does not implement: ${unimplemented().join(', ')}`);
      if (findings.length === before) passed.push(label);
      else findings.slice(before).forEach((finding) => { finding.viewport = `${viewport.width}x${viewport.height}`; });
    } catch (error) {
      findings.push({ journey: name, viewport: `${viewport.width}x${viewport.height}`, detail: `threw: ${String(error.message || error).split('\n')[0]}` });
      await page.screenshot({ path: path.join(ARTIFACTS, `error-${name}-${viewport.width}.png`) }).catch(() => {});
    }
    await context.close();
    console.log(`${findings.some((finding) => finding.journey === name && finding.viewport === `${viewport.width}x${viewport.height}`) ? 'FAIL' : 'ok  '} ${label}`);
  }
}

await browser.close();
console.log(`\n${passed.length} journey runs passed.`);
if (findings.length) {
  console.log(`\n${findings.length} finding(s):`);
  findings.forEach((finding) => console.log(`- [${finding.journey} ${finding.viewport || ''}] ${finding.detail}`));
  process.exit(1);
}
