/*
 * THE TEACHER SCREENS' ACCESSIBILITY SWEEP (2026-11-28): the teacher screens added this month, which the
 * student screens' certification had not swept, held to what the student screens are held to.
 *
 *   TEACHER_HARNESS_PORT=5188 npx vite --config tests/browser/accessibilityAppHarness.vite.config.mjs &
 *   node tests/browser/teacherScreensA11ySweep.mjs [--shard=i/n] [--only=screen,screen] [--modes=light,dark,forced]
 *
 * The real App.jsx in memory (firebase/* faked, the synthetic school: teacherWorkflow/), signed in as the synthetic
 * teacher, on the school's clock. Every screen below is opened the way a teacher opens it, at 1366×900 and on a
 * 390×844 touch phone, each in the light theme, the dark theme and forced colours (Windows High Contrast). In every
 * one of those, every scene is checked for:
 *
 *   axe        axe-core's WCAG 2.0 / 2.1 A and AA rules, over the scene (a modal is audited as itself).
 *   scroll     no horizontal page scroll (WCAG 1.4.10), and a dialog wider than the screen counts.
 *   target     every pointer target at least 24×24 px, or with the room the spacing exception asks for
 *              (WCAG 2.5.8; support/targetSize.mjs, the keyboard sweep's reading of it).
 *   keyboard   the Tab walk of the certification (accessibilityKeyboardReach.mjs): every control reached, none a
 *              trap, focus never lost to the page, every stop with a focus indicator that can be seen (in forced
 *              colours too, where a box-shadow ring is drawn as nothing), and not under something the page drew.
 *   dialog     a dialog takes focus when it opens, keeps Tab and Shift+Tab inside, closes on Escape and gives focus
 *              back to the control that opened it.
 *   text       at 200% browser text (Chromium's default font size doubled, as the large-text sweep does): no page
 *              scroll sideways, no text cut by its box, and no two controls drawn over each other (WCAG 1.4.4).
 *   live       a status or notice the screen shows after the teacher acts is in a live region that was already in
 *              the page (a polite region mounted with its text in it is not announced by every screen reader), or
 *              is an alert.
 *
 * A finding is a failure (exit 1) unless OWNER_DECISIONS lists it: a finding whose fix needs a decision from the
 * screen's owner, written down in docs/audits/2026-11-28-teacher-screens-a11y.md. The report (every finding, every
 * scene) is written to tests/browser/artifacts/teacher-a11y-sweep/report.json.
 *
 * Each item of the sweep is one screen at one size in one colour mode, on a page of its own, so --shard=i/n cuts the
 * items into CI jobs (support/sceneShards.mjs itemsOfShard). Nothing leaves localhost.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditAccessibility, settleForAudit } from './accessibilityAudit.mjs';
import { auditKeyboardReach } from './accessibilityKeyboardReach.mjs';
import { TEACHER_SCREENS, openTeacherApp } from './accessibilityTeacherScreens.mjs';
import { collectTargetBoxes, smallTargetsOf } from './support/targetSize.mjs';
import { itemsOfShard, parseShard } from './support/sceneShards.mjs';
import { newSchoolContext } from './teacherWorkflow/schoolClock.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/teacher-a11y-sweep');
const origins = { app: process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188' };
const arg = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

export const SWEEP_VIEWPORTS = [
  { id: 'desktop', width: 1366, height: 900 },
  { id: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true },
];
export const SWEEP_MODES = ['light', 'dark', 'forced'];

// ------------------------------------------------------------------------------------------------ the screens
const reused = (screenId, sceneIds) => {
  const screen = TEACHER_SCREENS.find((entry) => entry.id === screenId);
  if (!screen) throw new Error(`accessibilityTeacherScreens.mjs no longer has ${screenId}`);
  return sceneIds.map((id) => {
    const scene = screen.scenes.find((entry) => entry.id === id);
    if (!scene) throw new Error(`accessibilityTeacherScreens.mjs ${screenId} no longer has the scene ${id}`);
    return { id: id || 'page', run: scene.run, include: scene.include ?? screen.include ?? null };
  });
};
const main = (page) => page.getByRole('main');
const goTo = async (page, title) => {
  await page.locator('nav[aria-label="Teacher dashboard navigation"]').locator(`button[title="${title}"]`).evaluate((button) => button.click());
  await page.waitForTimeout(900);
};
const click = (locator) => locator.evaluate((element) => element.click());

// THE RESULTS, WITH THE SIGNALS AND THE WORKED EXAMPLES: the inspector school's 910003 has answered today's lesson
// (inspectorFixture.js). Three work-pattern facts are written beside Classwork Q2 as the student's page writes them
// (teacherSignalsJourneys.mjs S1, S2), and that answer is marked as one the student opened a worked example on
// (QuestionEngine's supportUsage.workedExampleUsed), so both panels have something in them.
const RESULTS_STUDENT = '910003';
const RESULTS_ASSIGNMENT = 'a-today';
const RESULTS_QUESTION = 2;
const seedSignals = (page) => page.evaluate(({ student, assignmentId, index }) => {
  const store = window.__mmHarnessStore;
  const base = { schemaVersion: 1, studentId: student, assignmentId, questionIndex: index, attemptNumber: 1, activityRole: 'classwork', duringClass: true, supports: [], recordedAt: Date.now() - 600_000 };
  store.set(`grades/${student}/attemptSignals/${assignmentId}__${index}__pasted__0`, { ...base, kind: 'pasted', partIndex: 0, partCount: 2 });
  store.set(`grades/${student}/attemptSignals/${assignmentId}__${index}__leftThenRight__0`, { ...base, kind: 'leftThenRight', awaySeconds: 40, partCount: 2 });
  store.set(`grades/${student}/attemptSignals/${assignmentId}__${index}__hardFirstTry__0`, { ...base, kind: 'hardFirstTry', difficultyBand: 3, partCount: 2 });
  const mark = (record) => ({ ...record, supportUsage: { ...(record?.supportUsage || {}), workedExampleUsed: true } });
  const detailPath = `grades/${student}/responseDetail/${assignmentId}`;
  const detail = store.get(detailPath);
  if (detail?.questions?.[index]) store.set(detailPath, { ...detail, questions: { ...detail.questions, [index]: mark(detail.questions[index]) } });
  const row = store.get(`grades/${student}`) || {};
  const tracker = row.gradesByAssignment?.[assignmentId] || {};
  if (tracker[index]) store.set(`grades/${student}`, { ...row, gradesByAssignment: { ...row.gradesByAssignment, [assignmentId]: { ...tracker, [index]: mark(tracker[index]) } } });
}, { student: RESULTS_STUDENT, assignmentId: RESULTS_ASSIGNMENT, index: RESULTS_QUESTION });
const openStudentResults = async (page) => {
  await seedSignals(page);
  await goTo(page, 'Home');
  const tile = page.locator(`[data-live-tile="${RESULTS_STUDENT}"]`).first();
  await tile.waitFor({ timeout: 60_000 });
  await click(tile.getByRole('button').first());
  const drawer = page.locator(`[data-student-profile-drawer="${RESULTS_STUDENT}"]`);
  await drawer.waitFor({ timeout: 30_000 });
  const row = drawer.locator('tr, li').filter({ hasText: 'Systems of Equations — Lesson 3: Elimination' }).filter({ has: page.getByRole('button', { name: 'Work', exact: true }) }).last();
  await click(row.getByRole('button', { name: 'Work', exact: true }).first());
  await page.locator(`[data-question-signals="${RESULTS_QUESTION}"]`).waitFor({ timeout: 30_000 });
  await page.locator('[data-worked-examples-by-skill="student"] [data-example-opened]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};
const openClassResults = async (page) => {
  await click(page.getByRole('button', { name: 'Back to class list' }));
  await page.locator('[data-worked-examples-by-skill="class"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};

// CASE REVIEW (the `conduct=1` school's Garza, Oakley, 910002: caseReviewJourneys.mjs): the drawer's "Open case
// review", built over every marking period, then the tabs this month added or changed.
const CASE_REVIEW = '[data-case-review]';
const openCaseReviewSelection = async (page) => {
  await goTo(page, 'Students');
  await page.getByPlaceholder('Search student or class').fill('Garza');
  await click(page.getByRole('button', { name: 'Garza, Oakley' }).first());
  const entry = page.locator('[data-case-review-entry]');
  await entry.waitFor({ timeout: 30_000 });
  await entry.getByRole('button', { name: 'Open case review' }).click();
  await page.locator(CASE_REVIEW).getByRole('button', { name: /^(Build|Rebuild) case review$/ }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(900);
};
const buildCaseReview = async (page) => {
  const review = page.locator(CASE_REVIEW);
  await review.getByLabel('Marking period').selectOption('all');
  await review.getByRole('button', { name: /^(Build|Rebuild) case review$/ }).click();
  await review.getByRole('button', { name: 'Change selection' }).waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('#cr-tab-summary')?.getAttribute('aria-selected') === 'true', null, { timeout: 30_000 });
  await page.waitForTimeout(900);
};
const caseTab = (key) => async (page) => {
  await page.locator(`${CASE_REVIEW} #cr-tab-${key}`).click();
  await page.locator(`${CASE_REVIEW} [data-case-tab="${key}"]`).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(700);
};

// GRADE EXPORT'S TEAMS SYNC: the disclosure opened, and its classes' state read.
const openTeamsSync = async (page) => {
  const review = page.locator('[aria-labelledby="grade-export-review-title"]');
  if (await review.count()) await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  const bar = page.getByRole('region', { name: 'Selected exports' });
  if (await bar.count()) await bar.getByRole('button', { name: 'Clear', exact: true }).click();
  const panel = page.locator('[data-teams-sync-panel]');
  await panel.waitFor({ timeout: 30_000 });
  if (!(await panel.evaluate((details) => details.open))) await click(panel.locator('summary'));
  await panel.locator('[data-teams-sync-class] input:not([disabled])').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(700);
};

// What each screen says after a teacher acts, and must say through a live region (the `live` check).
const teamsSaveSections = {
  label: 'TEAMS sync: Save sections',
  act: async (page) => {
    const card = page.locator('[data-teams-sync-class]').first();
    await card.locator('input').fill('15001/05');
    await card.getByRole('button', { name: 'Save sections' }).click();
  },
  text: /Linked to TEAMS 15001\/05\./,
};
// The student with no district ID (the harness's school has one) is given one: the screen's own notice says so.
const gradeExportSaveDistrictId = {
  label: 'Grade Export: Save ID',
  act: async (page) => {
    const field = main(page).locator('input[aria-label^="District student ID for"]').first();
    await field.fill('99887766');
    await field.locator('xpath=..').getByRole('button', { name: 'Save ID', exact: true }).click();
  },
  text: /99887766/,
};
const disciplineCopyReport = {
  label: 'Discipline Tracker: Copy report',
  act: async (page) => {
    const principal = page.locator('[data-discipline-principal]');
    if (!(await principal.evaluate((details) => details.open))) await click(principal.locator('summary'));
    await principal.getByRole('button', { name: 'Copy report' }).click();
  },
  text: /^(Report copied\.|Copy was blocked)/,
};
const caseReviewExport = {
  label: 'Case Review: an export',
  act: async (page) => page.locator(CASE_REVIEW).getByRole('button', { name: 'Assignments CSV' }).click(),
  text: /\S/,
  within: `${CASE_REVIEW} [data-case-tab="print"] .tw-row`,
};

const INSPECTOR = '[role="dialog"][aria-label="Student Response Inspector"]';
const closeButton = (dialog) => dialog.getByRole('button', { name: 'Close', exact: true });

// THE LIBRARY'S FOLDERS: a folder's ⋯ actions, opened from the keyboard, and the "+ New" folder dialog.
const FOLDER_ACTIONS = 'button[aria-label^="Folder actions for"]';
const FOLDER_DIALOG = '[role="dialog"]:has(input)';
const openFolderActions = async (page) => {
  const button = page.locator(FOLDER_ACTIONS).first();
  await button.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'New subfolder' }).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
};
// The fix's assertion: the button says the actions are open, Escape closes them and focus is back on the button.
const folderActionsByKeyboard = async (page, record) => {
  const button = page.locator(FOLDER_ACTIONS).first();
  record('keys', 'aria-expanded', 'Library folder actions', (await button.getAttribute('aria-expanded')) === 'true', 'the ⋯ button does not say its actions are open');
  await page.getByRole('button', { name: 'New subfolder' }).focus();
  await page.keyboard.press('Escape');
  const closed = await page.getByRole('button', { name: 'New subfolder' }).waitFor({ state: 'detached', timeout: 3_000 }).then(() => true).catch(() => false);
  record('keys', 'escape-closes', 'Library folder actions', closed, 'Escape did not close the folder actions');
  record('keys', 'focus-restored', 'Library folder actions', await button.evaluate((element) => element === document.activeElement), 'focus is not back on the ⋯ button after Escape');
  record('keys', 'aria-expanded', 'Library folder actions (closed)', (await button.getAttribute('aria-expanded')) === 'false', 'the ⋯ button does not say its actions are closed');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'New subfolder' }).waitFor({ timeout: 10_000 });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const left = await page.getByRole('button', { name: 'New subfolder' }).waitFor({ state: 'detached', timeout: 3_000 }).then(() => true).catch(() => false);
  record('keys', 'tab-closes', 'Library folder actions', left, 'Tab past the folder actions left them open, over the next folder');
  await button.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'New subfolder' }).waitFor({ timeout: 10_000 });
};
const openNewFolderDialog = async (page) => {
  const open = page.getByRole('button', { name: '+ New', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  await page.locator(FOLDER_DIALOG).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(500);
};

export const SWEEP_SCREENS = [
  { id: 'live-class', scenes: [
    { id: 'room', run: (page) => goTo(page, 'Home') },
    ...reused('teacher-live-class', ['walkthrough', 'attention']),
  ] },
  { id: 'results', query: '&inspector=1', scenes: [
    { id: 'student-signals-worked-examples', run: openStudentResults },
    { id: 'class-worked-examples', run: openClassResults },
  ] },
  { id: 'case-review', query: '&conduct=1', scenes: [
    { id: 'selection', run: openCaseReviewSelection, include: CASE_REVIEW, dialog: { selector: CASE_REVIEW, opener: (page) => page.locator('[data-case-review-entry]').getByRole('button', { name: 'Open case review' }) } },
    { id: 'summary', run: buildCaseReview, include: CASE_REVIEW },
    { id: 'signals', run: caseTab('signals'), include: CASE_REVIEW },
    { id: 'questions', run: caseTab('questions'), include: CASE_REVIEW },
    { id: 'conduct', run: caseTab('conduct'), include: CASE_REVIEW },
    { id: 'print', run: caseTab('print'), include: CASE_REVIEW, live: caseReviewExport },
  ] },
  { id: 'response-inspector', query: '&inspector=1', scenes: [
    { ...reused('teacher-response-inspector', ['gradebook'])[0], dialog: { selector: INSPECTOR, close: closeButton, opener: (page) => page.locator('article', { hasText: 'Question 2 · multiAnswer' }).getByRole('button', { name: 'Inspect Response / Override Grade' }) } },
    { ...reused('teacher-response-inspector', ['live'])[0], dialog: { selector: INSPECTOR, close: closeButton, opener: (page) => page.locator(`[data-live-inspect="${RESULTS_STUDENT}"]`).first() } },
  ] },
  { id: 'preflight', scenes: [
    ...reused('teacher-preflight', ['details', 'classes', 'delivery', 'check']).map((scene, index) => (index ? scene : { ...scene, dialog: { selector: '[aria-label="Lesson pre-flight review"]' } })),
  ] },
  { id: 'grade-export', scenes: [
    ...reused('teacher-grade-export', [null, 'review', 'selection', 'district-ids']).map((scene) => (scene.id === 'district-ids' ? { ...scene, live: gradeExportSaveDistrictId } : scene.id === 'review' ? { ...scene, dialog: { selector: '[aria-labelledby="grade-export-review-title"]', opener: (page) => main(page).locator('.tw-export-row__actions').getByRole('button', { name: 'Export', exact: true }).first() } } : scene)),
    { id: 'teams-sync', run: openTeamsSync, live: teamsSaveSections },
  ] },
  { id: 'discipline', query: '&conduct=1', scenes: [
    { id: 'page', run: async (page) => { await goTo(page, 'Discipline Tracker'); await page.getByRole('heading', { name: /^Discipline Tracker$/ }).first().waitFor({ timeout: 30_000 }); await page.waitForTimeout(900); } },
    { id: 'families-and-report', run: async (page) => {
      for (const summary of await main(page).locator('details.tw-disclosure > summary').all()) {
        if (!(await summary.evaluate((node) => node.parentElement.open))) await click(summary);
      }
      await page.waitForTimeout(700);
    }, live: disciplineCopyReport },
  ] },
  { id: 'library', scenes: [
    ...reused('teacher-library', [null]),
    { id: 'folder-actions', run: openFolderActions, assert: folderActionsByKeyboard },
    { id: 'folder-dialog', run: openNewFolderDialog, include: FOLDER_DIALOG, dialog: { selector: FOLDER_DIALOG, close: (dialog) => dialog.getByRole('button', { name: 'Cancel', exact: true }), opener: (page) => page.getByRole('button', { name: '+ New', exact: true }) } },
  ] },
];

// --------------------------------------------------------------------------------- owner decisions (not failures)
// A finding whose fix is a design decision for the screen's owner: listed in the audit, kept out of the exit code.
// Each entry: the screen, the check, a pattern over the finding's element, and why.
const KEEPS_DRAFT = 'Escape is off on purpose so a typed draft is not thrown away (accessibleDialog.test.mjs, PR #454 review S2/B2); its Close / Cancel button closes it and focus comes back. Whether Escape should close it while nothing is typed is the owner\'s call.';
export const OWNER_DECISIONS = [
  { screen: 'response-inspector', check: 'dialog', rule: 'escape-closes', element: /Student Response Inspector/, reason: KEEPS_DRAFT },
  { screen: 'library', check: 'dialog', rule: 'escape-closes', element: /\[role="dialog"\]:has\(input\)/, reason: KEEPS_DRAFT },
  { screen: 'preflight', check: 'dialog', rule: 'escape-closes', element: /Lesson pre-flight review/, reason: `${KEEPS_DRAFT} Closing the review discards the import, so the sweep leaves it open for its later steps.` },
];
const decisionFor = (finding) => OWNER_DECISIONS.find((entry) => entry.screen === finding.screen
  && entry.check === finding.check && (!entry.rule || entry.rule === finding.rule) && entry.element.test(finding.element));

// ------------------------------------------------------------------------------------------------- the checks
const LIVE = '[role="status"], [role="alert"], [role="log"], [aria-live]:not([aria-live="off"]), output';

const horizontalScroll = (page, include) => page.evaluate((selector) => {
  const out = [];
  const page = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (page > 1) {
    const culprits = [...document.body.querySelectorAll('*')].filter((element) => {
      const rect = element.getBoundingClientRect();
      const parent = element.parentElement?.getBoundingClientRect();
      return rect.width > 0 && rect.right > window.innerWidth + 1 && (!parent || parent.right <= window.innerWidth + 1);
    }).slice(0, 3).map((element) => `${element.tagName.toLowerCase()}.${String(element.className?.baseVal ?? element.className).split(' ')[0]} right=${Math.round(element.getBoundingClientRect().right)}`);
    out.push(`the page scrolls ${page}px sideways (${culprits.join('; ') || 'html'})`);
  }
  const root = selector && document.querySelector(selector);
  if (root) {
    const rect = root.getBoundingClientRect();
    if (rect.right > window.innerWidth + 1 || rect.left < -1) out.push(`${selector} runs past the screen (${Math.round(rect.left)}..${Math.round(rect.right)})`);
  }
  return out;
}, include);

// 200% text: what is cut by its own box, and controls drawn over each other.
const MEASURE_TEXT = (selector) => {
  const root = (selector && document.querySelector(selector)) || document.body;
  const EXEMPT = 'svg, canvas, [role="img"], math-field, .ML__container, [data-reflow-exempt], [aria-hidden="true"], .mathmaster-responsive-canvas, pre, code, .mm-skip-link';
  const visible = (element) => {
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      if (node.tagName === 'SUMMARY') break;
      if (node.parentElement?.tagName === 'DETAILS' && !node.parentElement.open) return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const srOnly = (element) => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'contents') continue;
      const rect = node.getBoundingClientRect();
      if ((style.clip && style.clip !== 'auto') || style.clipPath === 'inset(50%)' || (rect.width <= 1 && rect.height <= 1)) return true;
    }
    return false;
  };
  const ownText = (element) => [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent).join('').trim();
  const name = (element) => `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.split(' ')[0]}` : ''} "${(element.getAttribute('aria-label') || ownText(element) || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`;
  const scrollable = (node) => /(auto|scroll)/.test(getComputedStyle(node).overflowY + getComputedStyle(node).overflowX);
  const clipped = [];
  for (const element of root.querySelectorAll('*')) {
    if (element.closest(EXEMPT) || !visible(element) || srOnly(element) || !ownText(element)) continue;
    const rect = element.getBoundingClientRect();
    let escaped = getComputedStyle(element).position === 'fixed';
    for (let node = element.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      if (escaped) break;
      if (getComputedStyle(node).position === 'fixed') escaped = true;
      if (scrollable(node)) break;
      const style = getComputedStyle(node);
      if (!/hidden|clip/.test(style.overflowX + style.overflowY) || node === document.body) continue;
      const box = node.getBoundingClientRect();
      const outY = /hidden|clip/.test(style.overflowY) && (rect.bottom > box.bottom + 2 || rect.top < box.top - 2);
      const outX = /hidden|clip/.test(style.overflowX) && (rect.right > box.right + 2 || rect.left < box.left - 2) && style.textOverflow !== 'ellipsis' && getComputedStyle(element).textOverflow !== 'ellipsis';
      if (outY || outX) { clipped.push(`${name(element)} cut by ${name(node)}`); break; }
    }
    // A control's own label running out of it (a fixed height, nowrap).
    if (element.matches('button, a, summary, [role="tab"], label') && (element.scrollWidth - element.clientWidth > 2) && getComputedStyle(element).overflowX === 'visible' && getComputedStyle(element).textOverflow !== 'ellipsis') {
      clipped.push(`${name(element)} label runs ${element.scrollWidth - element.clientWidth}px past its box`);
    }
  }
  const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="tab"], [role="button"]';
  const controls = [...root.querySelectorAll(CONTROLS)].filter((element) => visible(element) && !srOnly(element) && !element.closest(EXEMPT));
  // A bar pinned over the page (sticky or fixed) is a layer content scrolls under, not a control drawn over another:
  // only two controls in the same layer are compared.
  const layerOf = (element) => {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/^(fixed|sticky)$/.test(style.position) || (style.position === 'absolute' && style.zIndex !== 'auto')) return node;
    }
    return null;
  };
  const boxes = controls.map((element) => ({ element, rect: element.getBoundingClientRect(), layer: layerOf(element) }));
  const overlapping = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]; const b = boxes[j];
      if (a.element.contains(b.element) || b.element.contains(a.element) || a.layer !== b.layer) continue;
      // A checkbox drawn inside its own label is the same control.
      if (a.element.labels && [...a.element.labels].some((label) => label.contains(b.element))) continue;
      const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (x > 2 && y > 2) overlapping.push(`${name(a.element)} and ${name(b.element)} overlap by ${Math.round(x)}×${Math.round(y)}`);
    }
  }
  return {
    rootFont: parseFloat(getComputedStyle(document.documentElement).fontSize),
    scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    clipped: [...new Set(clipped)], overlapping: [...new Set(overlapping)],
  };
};

// A target whose centre, on screen, hits something that is not it (nor inside it): under another layer.
const MARK_COVERED = (boxes) => boxes.map((box) => {
  const x = box.x + box.w / 2 - window.scrollX;
  const y = box.y + box.h / 2 - window.scrollY;
  if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return box;
  const hit = document.elementFromPoint(x, y);
  if (!hit) return box;
  for (let node = hit; node; node = node.parentElement) {
    const rect = node.getBoundingClientRect();
    if (Math.abs(rect.x + window.scrollX - box.x) < 1 && Math.abs(rect.y + window.scrollY - box.y) < 1 && Math.abs(rect.width - box.w) < 1 && Math.abs(rect.height - box.h) < 1) return box;
  }
  // A label measured for its checkbox: the hit is the label's text or the box itself.
  return hit.closest('label') ? box : { ...box, covered: true };
});

const setTextScale = async (cdp, scale) => {
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16 * scale, fixed: Math.round(13 * scale) } });
};

// Dialog: focus is inside it once it has opened; Tab and Shift+Tab stay in it; Escape closes it. Then the control that
// opens it (`opener`), pressed from the keyboard, opens it with focus inside, and Escape gives focus back to that
// control. Left open again, as the scene had it. (A scene opens its dialog with a programmatic click, which a teacher
// cannot do, so focus coming back is judged only on the keyboard's opening.)
// A dialog that keeps a typed draft does not close on Escape (accessibleDialog.test.mjs, PR #454 review): its `close`
// is the button a keyboard teacher presses instead, from which focus must come back all the same.
const checkDialog = async (page, { selector, opener = null, close = null }, record) => {
  const dialog = page.locator(selector);
  record('dialog', 'focus-on-open', selector, await dialog.evaluate((element) => element.contains(document.activeElement)), 'focus is not inside the dialog once it has opened');
  for (let index = 0; index < 25; index += 1) await page.keyboard.press('Tab');
  record('dialog', 'tab-stays-inside', selector, await dialog.evaluate((element) => element.contains(document.activeElement)), 'Tab took focus out of the dialog');
  for (let index = 0; index < 25; index += 1) await page.keyboard.press('Shift+Tab');
  record('dialog', 'shift-tab-stays-inside', selector, await dialog.evaluate((element) => element.contains(document.activeElement)), 'Shift+Tab took focus out of the dialog');
  const shut = async () => {
    await page.keyboard.press('Escape');
    let gone = await dialog.waitFor({ state: 'detached', timeout: close ? 1_500 : 5_000 }).then(() => true).catch(() => false);
    record('dialog', 'escape-closes', selector, gone, 'Escape did not close the dialog');
    if (!gone && close) {
      await close(dialog).focus();
      await page.keyboard.press('Enter');
      gone = await dialog.waitFor({ state: 'detached', timeout: 5_000 }).then(() => true).catch(() => false);
      record('dialog', 'close-button-closes', selector, gone, 'its close button, pressed from the keyboard, did not close the dialog');
    }
    return gone;
  };
  const closed = await shut();
  if (!closed || !opener) return;
  const button = opener(page);
  await button.waitFor({ timeout: 15_000 });
  await button.focus();
  await page.keyboard.press('Enter');
  if (!(await dialog.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false))) {
    record('dialog', 'opens-by-keyboard', selector, false, 'Enter on the control that opens it did not open the dialog');
    return;
  }
  await page.waitForTimeout(600);
  record('dialog', 'focus-on-open', `${selector} (opened by keyboard)`, await dialog.evaluate((element) => element.contains(document.activeElement)), 'focus is not inside the dialog once Enter has opened it');
  await shut();
  record('dialog', 'focus-restored', `${selector} (opened by keyboard)`, await button.evaluate((element) => element === document.activeElement).catch(() => false), 'focus did not go back to the control that opened the dialog');
  await button.focus();
  await page.keyboard.press('Enter');
  await dialog.waitFor({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(600);
};

const checkLive = async (page, live, record) => {
  await page.evaluate((selector) => {
    document.querySelectorAll(selector).forEach((element) => element.setAttribute('data-sweep-live-before', ''));
  }, LIVE);
  await live.act(page);
  const found = await page.waitForFunction(({ pattern, flags, within, selector }) => {
    const re = new RegExp(pattern, flags);
    const scope = (within && document.querySelector(within)) || document.body;
    const candidates = [...scope.querySelectorAll('*')].filter((element) => re.test((element.textContent || '').trim()) && ![...element.children].some((child) => re.test((child.textContent || '').trim())));
    const shown = candidates.filter((element) => element.getBoundingClientRect().height > 0 && (!within || !element.closest('button')));
    if (!shown.length) return null;
    return shown.map((element) => {
      const region = element.closest(selector);
      const kind = region ? (region.getAttribute('role') || `aria-live=${region.getAttribute('aria-live')}`) : null;
      return { text: element.textContent.trim().slice(0, 80), region: kind, before: Boolean(region?.hasAttribute('data-sweep-live-before')), alert: region?.getAttribute('role') === 'alert' || region?.getAttribute('aria-live') === 'assertive' };
    });
  }, { pattern: live.text.source, flags: live.text.flags, within: live.within || null, selector: LIVE }, { timeout: 20_000 }).then((handle) => handle.jsonValue()).catch(() => null);
  if (!found) { record('live', 'notice-shown', live.label, false, 'no notice appeared after the action'); return; }
  const announced = found.some((entry) => entry.region && (entry.before || entry.alert));
  const what = found[0];
  record('live', 'live-region', `${live.label}: "${what.text}"`, announced,
    what.region ? `the notice is a ${what.region} mounted with its text in it (not in the page before): screen readers may not announce it` : 'the notice is not in a live region');
};

// ---------------------------------------------------------------------------------------------------- the run
const ITEMS = SWEEP_SCREENS.flatMap((screen) => SWEEP_VIEWPORTS.flatMap((viewport) => SWEEP_MODES.map((mode) => ({ screen, viewport, mode }))));

const runSweep = async () => {
  const only = new Set((arg('only') || '').split(',').filter(Boolean));
  const modes = new Set((arg('modes') || SWEEP_MODES.join(',')).split(','));
  const viewports = new Set((arg('viewports') || SWEEP_VIEWPORTS.map((entry) => entry.id).join(',')).split(','));
  const checks = new Set((arg('checks') || 'axe,scroll,target,keyboard,dialog,text,live').split(','));
  const shard = parseShard(arg('shard'));
  const items = itemsOfShard(ITEMS, shard).filter((item) => (!only.size || only.has(item.screen.id)) && modes.has(item.mode) && viewports.has(item.viewport.id));
  mkdirSync(ARTIFACTS, { recursive: true });

  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const launchOptions = {};
  if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
  else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(launchOptions);

  const findings = [];
  const passes = [];
  const errors = [];
  const retried = [];
  const started = Date.now();
  // One item on a page of its own. Its findings, passes and errors are its own until it is kept.
  const runItem = async ({ screen, viewport, mode }) => {
    const findings = [];
    const passes = [];
    const errors = [];
    const itemStarted = Date.now();
    const context = await newSchoolContext(browser, {
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: Boolean(viewport.isMobile),
      hasTouch: Boolean(viewport.hasTouch),
      colorScheme: mode === 'dark' ? 'dark' : 'light',
      forcedColors: mode === 'forced' ? 'active' : 'none',
      reducedMotion: 'reduce',
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: origins.app }).catch(() => {});
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (/^(https?|wss?):\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    try {
      await openTeacherApp(page, origins, screen.query || '');
      for (const scene of screen.scenes) {
        const where = { screen: screen.id, scene: scene.id, viewport: viewport.id, mode };
        const tag = `${screen.id}/${scene.id} ${viewport.id} ${mode}`;
        const record = (check, rule, element, ok, detail) => {
          const entry = { ...where, check, rule, element, detail };
          if (ok) { passes.push(entry); return; }
          const decision = decisionFor(entry);
          findings.push({ ...entry, decision: decision?.reason || null });
          console.log(`${decision ? 'OWNER' : 'FAIL '} ${tag} ${check}/${rule} ${element} — ${detail}`);
        };
        try {
          await scene.run(page, origins);
        } catch (error) {
          errors.push(`${tag}: the scene did not open: ${error.message.split('\n')[0]}`);
          console.log(`ERROR ${tag}: the scene did not open: ${error.message.split('\n')[0]}`);
          break;
        }
        await settleForAudit(page);
        // First, before any other check moves focus: where the dialog put it when it opened.
        if (checks.has('dialog') && scene.dialog) await checkDialog(page, scene.dialog, record);
        // The scene's own assertions (a fix's), on the scene as it opened; each leaves the scene as it found it.
        if (scene.assert) await scene.assert(page, record);
        const include = scene.include || null;
        const name = `sweep-${screen.id}-${scene.id}-${mode}`;
        if (checks.has('axe')) {
          const result = await auditAccessibility(page, { name, viewport: viewport.id, include });
          const details = Object.values(result.details);
          for (const entry of details) {
            for (const example of entry.examples) record('axe', entry.ruleId, example.target, false, `${entry.help}${entry.targets.length > 1 ? ` (${entry.targets.length} nodes)` : ''}: ${example.summary.slice(0, 200)}`);
          }
          if (!details.length) record('axe', 'wcag21aa', include || 'page', true, '');
        }
        if (checks.has('scroll')) {
          const problems = await horizontalScroll(page, include);
          problems.forEach((problem) => record('scroll', '1.4.10', include || 'page', false, problem));
          if (!problems.length) record('scroll', '1.4.10', include || 'page', true, '');
        }
        if (checks.has('target')) {
          // A target under an open pop-up (the pop-up's own items lie over it) cannot be pressed: it is not measured.
          const boxes = await page.evaluate(collectTargetBoxes, { rootSelector: include || 'body' }).then((list) => page.evaluate(MARK_COVERED, list)).then((list) => list.filter((box) => !box.covered));
          const { failing } = smallTargetsOf(boxes);
          failing.forEach((box) => record('target', '2.5.8', `${box.tag}${box.className ? `.${box.className.split(' ')[0]}` : ''} "${box.name}"`, false, `${box.w}×${box.h} px with another target inside its 24 px circle`));
          if (!failing.length) record('target', '2.5.8', include || 'page', true, '');
        }
        if (checks.has('keyboard')) {
          const result = await auditKeyboardReach(page, { name, viewport: viewport.id, include });
          for (const entry of Object.values(result.details)) {
            for (const example of entry.examples) record('keyboard', entry.ruleId, example.target, false, `${entry.help}: ${example.summary.slice(0, 200)}`);
          }
          if (!Object.keys(result.details).length) record('keyboard', 'tab-walk', `${result.summary.stops} stops`, true, '');
          await page.evaluate(() => document.activeElement?.blur?.());
        }
        if (checks.has('text')) {
          await setTextScale(cdp, 2);
          await page.waitForTimeout(500);
          // From the top of every scroller, as the scene opened: the Tab walk scrolls, and a sticky bar over what was
          // scrolled under it is not two controls drawn over each other.
          await page.evaluate(() => { for (const element of [document.scrollingElement, ...document.querySelectorAll('*')]) if (element && element.scrollTop) element.scrollTop = 0; });
          await page.waitForTimeout(200);
          const result = await page.evaluate(MEASURE_TEXT, include);
          record('text', 'scaled', include || 'page', result.rootFont >= 31, `the root font is ${result.rootFont}px at 200% text: the setting did not reach the page`);
          if (result.scrollX > 1) record('text', '1.4.4-scroll', include || 'page', false, `at 200% text the page scrolls ${result.scrollX}px sideways`);
          result.clipped.slice(0, 12).forEach((entry) => record('text', '1.4.4-clipped', entry, false, 'cut off at 200% text'));
          result.overlapping.slice(0, 12).forEach((entry) => record('text', '1.4.4-overlap', entry, false, 'controls drawn over each other at 200% text'));
          if (result.scrollX <= 1 && !result.clipped.length && !result.overlapping.length) record('text', '1.4.4', include || 'page', true, '');
          await setTextScale(cdp, 1);
          await page.waitForTimeout(300);
        }
        if (checks.has('live') && scene.live) await checkLive(page, scene.live, record);
      }
      for (const message of pageErrors) errors.push(`${screen.id} ${viewport.id} ${mode}: page error: ${message}`);
    } catch (error) {
      errors.push(`${screen.id} ${viewport.id} ${mode}: ${error.message.split('\n')[0]}`);
      console.log(`ERROR ${screen.id} ${viewport.id} ${mode}: ${error.message.split('\n')[0]}`);
      await page.screenshot({ path: path.join(ARTIFACTS, `error-${screen.id}-${viewport.id}-${mode}.png`) }).catch(() => {});
    } finally {
      await context.close().catch(() => {});
    }
    console.log(`---- ${screen.id} ${viewport.id} ${mode}: ${Math.round((Date.now() - itemStarted) / 1000)}s`);
    return { findings, passes, errors };
  };

  try {
    for (const item of items) {
      let result = await runItem(item);
      // A scene that did not open (a click that timed out on a busy machine) is run once more, whole; a finding is
      // never run again. The retry is in the report.
      if (result.errors.length) {
        console.log(`RETRY ${item.screen.id} ${item.viewport.id} ${item.mode}: ${result.errors[0]}`);
        retried.push(`${item.screen.id} ${item.viewport.id} ${item.mode}: ${result.errors[0]}`);
        result = await runItem(item);
      }
      findings.push(...result.findings);
      passes.push(...result.passes);
      errors.push(...result.errors);
    }
  } finally {
    await browser.close();
  }
  const failing = findings.filter((entry) => !entry.decision);
  const report = {
    generatedAt: new Date().toISOString(),
    shard: shard ? `${shard.index}/${shard.count}` : 'all',
    items: items.map(({ screen, viewport, mode }) => `${screen.id} ${viewport.id} ${mode}`),
    seconds: Math.round((Date.now() - started) / 1000),
    passed: passes.length, findings, errors, retried,
  };
  writeFileSync(path.join(ARTIFACTS, `report${shard ? `-${shard.index}-of-${shard.count}` : ''}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${items.length} item(s), ${passes.length} passing check(s), ${failing.length} finding(s), ${findings.length - failing.length} for the owner, ${errors.length} error(s), ${report.seconds}s`);
  if (failing.length || errors.length || !items.length) process.exit(1);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runSweep();
