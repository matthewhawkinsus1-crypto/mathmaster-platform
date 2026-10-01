// THE STUDENT CASE REVIEW JOURNEYS, AGAINST THE REAL APP IN MEMORY.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/caseReviewJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1440x900,1366x768,1024x768,768x1024;
//    ONLY=C1,C2 to run some journeys.)
//
// Same harness as journeys.mjs and supportEvidenceJourneys.mjs: the real
// App.jsx with `firebase/*` replaced by in-memory fakes and a synthetic school
// (fixture.js) — nothing can reach a Firebase project and no real student
// appears. The fixture gives "Garza, Oakley" (910002, synthetic) PR #401's
// versioned support profile and evidence, plus per-attempt history on last
// week's and yesterday's lessons, Practice Mode after a lesson closed, an
// answer not counted after the final cutoff, and session summaries. The
// `loadStudentCaseEvidence` fake runs the real request validation,
// authorization and projection (functions/shared/caseReviewEvidence.mjs).
//
//   C1  drawer → deep dive (code loads only now) → build: real assignments
//       only, every tab renders, nothing scrolls sideways
//   C2  Grades → Assignment → Question → Back → Back: place and scroll kept;
//       Escape under the Response Inspector does nothing; Escape on top closes
//       to the drawer
//   C3  official gradebook: a synthetic CSV, one student kept, compared, a
//       match confirmed, saved (only that student's rows), contribution
//       reconstructed from the file's own weights
//   C4  narrative facts with provenance and sources, no forbidden conclusion;
//       what needs attention, and a drill from it
//   C5  print (12 sections, teacher-authored next steps, only the case review
//       on paper) and CSV / JSON exports
//   C6  the student sees none of it and loads none of its code
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/caseReview/ (git-ignored).

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { narrativeViolations } from '../../../src/platform/caseReview/narrativeGuard.js';
import { PRINT_SECTIONS, TEACHER_AUTHORED_LABEL } from '../../../src/platform/caseReview/caseReviewExport.js';
import { watchUnimplementedCallables } from './journeyChecks.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/caseReview');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const VIEWPORTS = (process.env.VIEWPORTS || '1440x900,1366x768,1024x768,768x1024')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const findings = [];
const passed = [];
const squash = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const text = async (locator) => squash(await locator.innerText());
const expect = (journey, condition, detail) => {
  if (!condition) findings.push({ journey, detail });
  return Boolean(condition);
};
const db = (page) => page.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('mm-teacher-workflow-harness-db-v1'))));
const under = (store, prefix) => Object.entries(store).filter(([key]) => key.startsWith(prefix));
const sidebar = (page, name) => page.locator('nav, aside').getByRole('button', { name: new RegExp(`${name}$`) }).first().click();
const noSidewaysScroll = async (journey, page, where) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(journey, overflow <= 1, `${where}: no sideways scroll (${overflow}px)`);
  const shell = await page.evaluate(() => {
    const element = document.querySelector('[data-case-review]');
    return element ? element.scrollWidth - element.clientWidth : 0;
  });
  expect(journey, shell <= 1, `${where}: the case review fits its window (${shell}px)`);
};
const shot = (page, name) => page.screenshot({ path: path.join(ARTIFACTS, `${name}-${page.viewportSize().width}.png`) });

const TAB_KEYS = ['summary', 'grades', 'questions', 'skills', 'dol', 'completion', 'supports', 'timeline', 'gradebook', 'facts', 'attention', 'print'];

const openDrawer = async (page) => {
  await sidebar(page, 'Students');
  await page.waitForTimeout(1200);
  await page.getByPlaceholder('Search student or class').fill('Garza');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Garza, Oakley' }).first().click();
  const entry = page.locator('[data-case-review-entry]');
  await entry.waitFor({ timeout: 20000 });
  return entry;
};
const openCaseReview = async (page, { entry: open = null } = {}) => {
  const entry = open || await openDrawer(page);
  await entry.getByRole('button', { name: 'Open case review' }).click();
  const review = page.locator('[data-case-review]');
  await review.waitFor({ timeout: 30000 });
  return review;
};
const build = async (page, review, { period = null } = {}) => {
  // After a build the selection folds away; "Change selection" brings it back.
  const change = review.getByRole('button', { name: 'Change selection' });
  if (await change.count()) await change.click();
  if (period) await review.getByLabel('Marking period').selectOption(period);
  await review.getByRole('button', { name: /^(Build|Rebuild) case review$/ }).click();
  await review.getByRole('tablist').waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
};
const tab = async (page, review, name) => {
  await review.getByRole('tab', { name }).click();
  await page.waitForTimeout(350);
};
const panel = (review, key) => review.locator(`[data-case-tab="${key}"]`);
const crumbs = (review) => text(review.locator('nav.cr-crumbs'));

// A synthetic gradebook export: a title row, one row per student, category and
// weight rows, and the official average. 910099 is another (synthetic) student
// whose row must be dropped before anything is shown or saved.
const GRADEBOOK_CSV = [
  'Gradebook export (synthetic school),,,,,,',
  'Student ID,Student Name,Linear Functions Review WU,Linear Functions Review CW,Linear Functions Review DOL,Unit Quiz 3,Cycle Average',
  'Category,,Daily,Daily,Daily,Major,',
  'Weight,,40,40,40,60,',
  '910002,"Garza, Oakley",100,50,100,85,84.3',
  '910099,"Other, Synthetic",90,90,90,90,90',
].join('\r\n');
const uploadGradebook = async (review) => review.locator('input[type="file"]').setInputFiles({
  name: 'gradebook-synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(GRADEBOOK_CSV, 'utf8'),
});

const journeys = {
  async C1(page) {
    const requested = [];
    page.on('request', (request) => requested.push(request.url()));
    const entry = await openDrawer(page);
    expect('C1', !requested.some((url) => url.includes('/caseReview/')), 'opening the drawer loads no case review code');
    const review = await openCaseReview(page, { entry });
    expect('C1', requested.some((url) => url.includes('/caseReview/StudentCaseReviewView')), 'the case review code loads when it is opened');
    const header = await text(review.locator('header'));
    expect('C1', /Garza, Oakley · ID 910002/.test(header), `the student is named (${header.slice(0, 160)})`);
    expect('C1', /Choose the marking period/.test(await text(review)), 'nothing is read until the teacher builds');
    await build(page, review, { period: 'all' });
    const summary = await text(panel(review, 'summary'));
    expect('C1', /\b4 assigned in this selection/.test(summary), `the four lessons given to this class (${summary.match(/\d+ assigned in this selection/)?.[0]})`);
    expect('C1', /not a compliance determination and not a diagnosis/.test(await text(review.locator('header'))), 'the case review says what it is not');
    expect('C1', !/could not be loaded/.test(await text(review)), 'per-attempt records loaded through the callable');
    for (const key of TAB_KEYS) {
      await review.locator(`#cr-tab-${key}`).click();
      await page.waitForTimeout(400);
      const visible = await panel(review, key).isVisible();
      expect('C1', visible, `the ${key} tab renders`);
      const said = await text(panel(review, key));
      expect('C1', !said.includes('Quadratics — Lesson 1'), `${key}: an unassigned library copy never appears`);
      expect('C1', !/\bNaN\b|undefined|\[object Object\]/.test(said), `${key}: no broken values (${said.match(/.{0,40}(?:NaN|undefined|\[object Object\]).{0,40}/)?.[0]})`);
      await noSidewaysScroll('C1', page, `${key} tab`);
      await shot(page, `tab-${key}`);
    }
    const skills = await text(panel(review, 'skills'));
    expect('C1', /A\.5C/.test(skills) && /A\.5A/.test(skills), 'skills come from the questions\' own standards');
    const completion = await text(panel(review, 'completion'));
    expect('C1', /Unit 1 — Test Review/.test(completion) && /2 q · 1 correct/.test(completion), `Practice Mode after the close is shown with its counts (${completion.match(/Unit 1 — Test Review.{0,200}/)?.[0]})`);
    expect('C1', /1 answer not counted \(after the final cutoff\)/.test(completion), 'the answer that arrived after the final cutoff is shown, not counted');
    const supports = await text(panel(review, 'supports'));
    expect('C1', /Revision 2/.test(supports) && /read aloud/i.test(supports) && /Staff documented/.test(supports), 'PR #401\'s support records are reused');
    expect('C1', await panel(review, 'timeline').locator('[data-timeline-kind]').count() > 5, 'the timeline lists recorded events');
  },

  async C2(page) {
    const review = await openCaseReview(page);
    await build(page, review);
    await tab(page, review, 'Grades');
    // Open every contribution detail (the tab is then longer than any screen),
    // then scroll so the row sits just below the top edge: the teacher is
    // part-way down the tab, and the click itself needs no further scrolling.
    const details = panel(review, 'grades').locator('details[data-case-grade-detail]');
    for (let index = 0; index < await details.count(); index += 1) await details.nth(index).locator('summary').click();
    const body = review.locator('.cr-body');
    await body.evaluate((element) => {
      const row = element.querySelector('[data-case-assignment="a-lastweek"]');
      element.scrollTop = Math.max(0, row.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop - 24);
    });
    await page.waitForTimeout(200);
    const scrolled = await body.evaluate((element) => element.scrollTop);
    expect('C2', scrolled > 0, `the Grades tab is scrolled before drilling in (${scrolled})`);
    await review.locator('[data-case-assignment="a-lastweek"]').getByRole('button', { name: 'Linear Functions — Review' }).click();
    const assignment = review.locator('[data-case-assignment-detail="a-lastweek"]');
    await assignment.waitFor({ timeout: 10000 });
    expect('C2', (await crumbs(review)).endsWith('Garza, Oakley › Case review › Questions & attempts › Linear Functions — Review'), `breadcrumb at the assignment (${await crumbs(review)})`);
    await assignment.locator('[data-case-question="2"]').getByRole('button').first().click();
    const question = review.locator('[data-case-question-detail="2"]');
    await question.waitFor({ timeout: 10000 });
    const detail = await text(question);
    expect('C2', /Not correct after all available attempts/.test(detail), 'the outcome is stated');
    expect('C2', await question.locator('tbody tr').count() === 3, 'three attempts, each its own row');
    expect('C2', /A\.5C/.test(detail), 'the question\'s own standard');
    expect('C2', /Error pattern not determinable from stored evidence\./.test(detail), 'no error pattern is invented');
    expect('C2', !/Solve the system|What is y\?/.test(detail), 'the question text and its answer are not on the main report');
    expect('C2', (await crumbs(review)).endsWith('› Linear Functions — Review › Classwork Q2'), `breadcrumb at the question (${await crumbs(review)})`);
    await shot(page, 'question-detail');

    // The Response Inspector opens above; Escape there leaves the case review alone.
    await question.getByRole('button', { name: 'Open Response Inspector (latest attempt)' }).click();
    const inspector = page.getByRole('dialog', { name: 'Student Response Inspector' });
    await inspector.waitFor({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    expect('C2', await review.isVisible() && await question.isVisible(), 'Escape under the Response Inspector does not close the case review');
    await inspector.getByRole('button', { name: 'Close' }).click();
    await page.waitForTimeout(400);
    expect('C2', await inspector.count() === 0 && await question.isVisible(), 'closing the inspector returns to the same question');

    await review.locator('[data-case-back]').click();
    await assignment.waitFor({ timeout: 5000 });
    expect('C2', await question.count() === 0, 'Back returns to the assignment');
    await review.locator('[data-case-back]').click();
    await panel(review, 'grades').waitFor({ timeout: 5000 });
    const restored = await body.evaluate((element) => element.scrollTop);
    expect('C2', Math.abs(restored - scrolled) <= 2, `Back returns to the Grades tab where the teacher left it (scroll ${restored}, was ${scrolled})`);
    expect('C2', await details.evaluateAll((elements) => elements.every((element) => element.open)), 'the details the teacher opened are still open');
    await review.locator('[data-case-back]').click();
    await page.waitForTimeout(300);
    expect('C2', await panel(review, 'summary').isVisible(), 'Back walks the trail to the summary');
    const backLabel = await text(review.locator('[data-case-back]'));
    expect('C2', backLabel === 'Back to student', `at the start of the trail Back returns to the student (${backLabel})`);
    await review.locator('[data-case-back]').click();
    await page.waitForTimeout(500);
    expect('C2', await page.locator('[data-case-review]').count() === 0 && await page.locator('[data-student-profile-drawer]').count() === 1, 'Back to student closes to the drawer');

    // Escape on top closes the case review, and only the case review.
    const again = await openCaseReview(page, { entry: page.locator('[data-case-review-entry]') });
    await again.waitFor();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    expect('C2', await page.locator('[data-case-review]').count() === 0 && await page.locator('[data-student-profile-drawer]').count() === 1, 'Escape closes the case review and keeps the drawer');
  },

  async C3(page) {
    const studentRecords = (store) => JSON.stringify(Object.entries(store)
      .filter(([key]) => (key === 'grades/910002' || key.startsWith('grades/910002/')) && !key.includes('/sisGradebookSnapshots/'))
      .sort(([a], [b]) => a.localeCompare(b)));
    const recordsBefore = studentRecords(await db(page));
    const review = await openCaseReview(page);
    await build(page, review);
    await tab(page, review, 'Official gradebook');
    const gradebook = panel(review, 'gradebook');
    await uploadGradebook(gradebook);
    const preview = gradebook.locator('[data-case-sis-preview]');
    await preview.waitFor({ timeout: 10000 });
    const previewText = await text(preview);
    expect('C3', /one row per student/.test(previewText) && /1 other student row dropped/.test(previewText), `the layout and the dropped row are stated (${previewText.slice(0, 200)})`);
    expect('C3', /4 items for this student · official average 84\.3/.test(previewText), 'the student\'s items and official average');
    expect('C3', !/Other, Synthetic|910099/.test(await text(review)), 'no other student\'s name or id is shown');
    await preview.getByRole('button', { name: 'Compare with MathMaster' }).click();
    const table = gradebook.locator('[data-case-reconciliation]');
    await table.waitFor({ timeout: 10000 });
    const statuses = await table.locator('[data-sis-status]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-sis-status')));
    expect('C3', statuses.filter((status) => status === 'match').length === 3, `Warm-Up, Classwork and DOL match the exported grades (${statuses.join(', ')})`);
    expect('C3', statuses.includes('unmatched-sis-item'), 'an item MathMaster did not produce is listed as such');
    const contribution = await text(gradebook.locator('[data-case-official-contribution]'));
    expect('C3', /Daily/.test(contribution) && /Major/.test(contribution) && !/will not guess/.test(contribution), `the file's own weights reproduce its average, so the breakdown is shown (${contribution.slice(0, 220)})`);
    await shot(page, 'gradebook-reconciliation');

    // The teacher says what "Unit Quiz 3" is.
    await table.getByLabel('MathMaster match for Unit Quiz 3').selectOption({ label: 'Systems of Equations — Lesson 2: Substitution — Classwork' });
    await page.waitForTimeout(400);
    const quizRow = await text(table.locator('tr', { hasText: 'Unit Quiz 3' }));
    expect('C3', /Confirmed by you/.test(quizRow), `a confirmed match is labelled (${quizRow})`);

    // Save the one-student snapshot with the case file.
    const before = under(await db(page), 'grades/910002/sisGradebookSnapshots/').length;
    await uploadGradebook(gradebook);
    await gradebook.locator('[data-case-sis-preview]').getByRole('button', { name: 'Compare and save with this case file' }).click();
    await page.waitForTimeout(1200);
    const saved = under(await db(page), 'grades/910002/sisGradebookSnapshots/');
    expect('C3', saved.length === before + 1, 'one snapshot is saved');
    const document = saved[saved.length - 1]?.[1] || {};
    expect('C3', document.studentId === '910002' && document.items?.length === 4 && document.importedByEmail === 'teacher@harness.example' && document.importedAt, 'the saved snapshot holds this student\'s items, the teacher and the time');
    expect('C3', !/Other, Synthetic|910099/.test(JSON.stringify(document)), 'nothing about any other student is saved');
    expect('C3', document.confirmedMatches?.['Unit Quiz 3']?.assignmentId === 'a-yesterday', 'the teacher\'s confirmed match is saved with it');
    expect('C3', studentRecords(await db(page)) === recordsBefore, 'importing, comparing and saving changed no grade or record of the student');

    await build(page, review);
    await tab(page, review, 'Official gradebook');
    const savedList = await text(panel(review, 'gradebook'));
    expect('C3', /Saved snapshots for this student/.test(savedList) && /gradebook-synthetic\.csv/.test(savedList), 'the saved snapshot is offered after a rebuild');
    await panel(review, 'gradebook').getByRole('button', { name: 'Compare', exact: true }).first().click();
    await page.waitForTimeout(500);
    expect('C3', /Saved with this case file/.test(await text(panel(review, 'gradebook'))), 'the saved snapshot can be compared again');
    await noSidewaysScroll('C3', page, 'gradebook tab');
  },

  async C4(page) {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
    const review = await openCaseReview(page);
    await build(page, review, { period: 'all' });
    await tab(page, review, 'Narrative facts');
    const facts = panel(review, 'facts').locator('[data-fact-key]');
    const count = await facts.count();
    expect('C4', count >= 6, `facts are offered (${count})`);
    expect('C4', await panel(review, 'facts').locator('[data-fact-key] .cr-prov').count() === count, 'every fact shows how it is known');
    const texts = await facts.locator('.cr-fact__text').allInnerTexts();
    texts.forEach((sentence) => {
      const violations = narrativeViolations(sentence);
      expect('C4', violations.length === 0, `no forbidden conclusion: "${sentence}" (${violations.map((entry) => entry.id).join(', ')})`);
    });
    const withSources = panel(review, 'facts').locator('[data-fact-key] details').first();
    await withSources.locator('summary').click();
    expect('C4', /grades\/\{student\}|Assignment instances|Question records/.test(await text(withSources)), 'a fact opens to the records it came from');
    expect('C4', /What this case review never states/.test(await text(panel(review, 'facts'))), 'the conclusions it never draws are listed');
    await panel(review, 'facts').getByRole('button', { name: 'Copy all facts' }).click();
    await page.waitForTimeout(300);
    expect('C4', /All facts copied\.|Copying is blocked/.test(await text(panel(review, 'facts').locator('[role="status"]'))), 'copying reports what happened');
    await shot(page, 'narrative-facts');

    await tab(page, review, 'What needs attention?');
    const attention = await text(panel(review, 'attention'));
    const exhausted = Number(attention.match(/Questions not correct after all available attempts \((\d+)\)/)?.[1] || 0);
    expect('C4', exhausted >= 2, `questions whose attempts ran out are listed (${exhausted})`);
    expect('C4', /What to address first.*A\.5C/.test(attention), 'the systems standard is first to address, by the stated rule');
    expect('C4', /it does not diagnose the student/.test(attention), 'the list says it is not a diagnosis');
    await panel(review, 'attention').locator('table').last().getByRole('button').first().click();
    await review.locator('[data-case-question-detail]').waitFor({ timeout: 5000 });
    await review.locator('[data-case-back]').click();
    await page.waitForTimeout(300);
    expect('C4', await panel(review, 'attention').isVisible(), 'Back returns from the question to the attention list');
    await noSidewaysScroll('C4', page, 'attention tab');
  },

  async C5(page) {
    const review = await openCaseReview(page);
    await build(page, review);
    await tab(page, review, 'Print & export');
    const printTab = panel(review, 'print');
    const steps = 'Reteach elimination with two worked examples (synthetic note).';
    await printTab.getByLabel('Teacher-entered next steps (optional)').fill(steps);
    const preview = await text(printTab.locator('.cr-print-preview'));
    PRINT_SECTIONS.forEach((section) => expect('C5', preview.includes(section.title), `preview has "${section.title}"`));
    expect('C5', preview.includes(TEACHER_AUTHORED_LABEL) && preview.includes(steps), 'the next steps print last, labelled as the teacher\'s');

    const save = async (button) => {
      const [download] = await Promise.all([page.waitForEvent('download'), printTab.getByRole('button', { name: button }).click()]);
      return { name: download.suggestedFilename(), body: readFileSync(await download.path(), 'utf8') };
    };
    const assignments = await save('Assignments CSV');
    expect('C5', /^MathMaster-case-review_910002_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}_assignments\.csv$/.test(assignments.name), `CSV named by student and dates (${assignments.name})`);
    expect('C5', assignments.body.startsWith('Assignment,Assignment ID,Type,'), 'assignments CSV header');
    const questions = await save('Questions CSV');
    const questionHeader = questions.body.split('\r\n')[0];
    expect('C5', /Attempt 1,Attempt 2,Attempt 3/.test(questionHeader) && !/Expected|Response|Answer/.test(questionHeader), `questions CSV has attempts, no answers (${questionHeader.slice(0, 120)})`);
    expect('C5', !/Solve 2x \+ 3 = 11|Solve the system/.test(questions.body), 'no question text or answer key in the questions CSV');
    const facts = await save('Facts CSV');
    expect('C5', facts.body.startsWith('Fact,Category,How known,Sources,Limitation'), 'facts CSV header');
    const json = await save('JSON (full case file)');
    const parsed = JSON.parse(json.body);
    expect('C5', parsed.meta?.studentId === '910002' && parsed.teacherEnteredNextSteps?.label === TEACHER_AUTHORED_LABEL && parsed.teacherEnteredNextSteps?.text === steps, 'the JSON carries the case file and the labelled next steps');
    expect('C5', !json.body.includes('"expected"') && !json.body.includes('Solve 5x'), 'no answer key in the JSON');

    // Print: only the case review, black on white, on as many pages as it needs.
    await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls += 1; }; });
    await printTab.getByRole('button', { name: 'Print / Save PDF' }).click();
    await page.waitForTimeout(500);
    expect('C5', await page.evaluate(() => window.__printCalls) === 1, 'the browser print dialog is asked for once');
    expect('C5', await page.locator('body > .cr-print-root').count() === 1, 'the print copy is on the page while printing');
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(300);
    const printed = await page.evaluate(() => ({
      app: getComputedStyle(document.getElementById('root')).display,
      copy: getComputedStyle(document.querySelector('.cr-print-root')).display,
      text: document.querySelector('.cr-print-root').innerText,
    }));
    expect('C5', printed.app === 'none' && printed.copy === 'block', `only the case review prints (app ${printed.app}, copy ${printed.copy})`);
    PRINT_SECTIONS.forEach((section) => expect('C5', printed.text.includes(section.title), `printed "${section.title}"`));
    await page.screenshot({ path: path.join(ARTIFACTS, `print-${page.viewportSize().width}.png`), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.waitForTimeout(300);
    expect('C5', await page.locator('.cr-print-root').count() === 0 && !(await page.evaluate(() => document.body.classList.contains('cr-printing'))), 'after printing the print copy is removed');
    expect('C5', await printTab.isVisible(), 'the teacher is still on the print tab');
  },

  async C6(page) {
    const requested = [];
    page.on('request', (request) => requested.push(request.url()));
    await page.goto(`${PAGE}&as=student&studentId=910002`, { timeout: 180000 });
    await page.getByText('Log Out').first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(3000);
    const home = await text(page.locator('body'));
    expect('C6', !/case review|Academic evidence|deep dive|Narrative facts|gradebook snapshot/i.test(home), 'nothing of the case review is on the student\'s screen');
    expect('C6', !requested.some((url) => url.includes('/caseReview/')), 'no case review code is loaded for a student');
    expect('C6', await page.locator('[data-case-review], [data-case-review-entry]').count() === 0, 'no case review element exists');
  },
};

for (const viewport of VIEWPORTS) {
  for (const [name, run] of Object.entries(journeys)) {
    if (ONLY && !ONLY.includes(name)) continue;
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    const unimplemented = watchUnimplementedCallables(page);
    const label = `${name} @ ${viewport.width}x${viewport.height}`;
    try {
      if (name !== 'C6') {
        await page.goto(PAGE, { timeout: 180000 });
        await page.getByText('Instructor Dashboard').first().waitFor({ timeout: 120000 });
        await page.waitForTimeout(2500);
      }
      const before = findings.length;
      await run(page);
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
