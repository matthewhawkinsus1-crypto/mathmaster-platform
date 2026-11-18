// THE TEACHER-WORKFLOW SCENARIOS, RUN AGAINST THE REAL APP IN MEMORY.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/journeys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed; VIEWPORTS=1440x900,1024x768;
//    ONLY=B,H to run some journeys.)
//
// Every scenario from CLAUDE_TEACHER_WORKFLOW_TASK.md, driven through the real
// App.jsx with `firebase/*` replaced by the harness fakes (nothing can reach a
// Firebase project; the school is synthetic — see fixture.js). Each journey
// reseeds the school relative to now, so "Period 3 is in session" and "the DOL
// opens near the end of Period 3" always hold.
//
//   A  today's class -> today's lesson -> progress -> grades -> Live view
//   B  fire drill: open the DOL now, +5 min, close now, reopen — one class only
//   C  classwork runs long: move the DOL to the next class day and back
//   D  current work first; earlier marking periods folded but reachable
//   E  an assignment reaches grades, work, live and export without hunting
//   F  a student's grade -> the assignment -> the underlying work
//   G  export ONE class only
//   H  export Monday, a grade changes, export the same assignment again
//   I  the file is lost: download the exact file again
//   J  export selected classes, not every class
//   K  an assignment's "Export grades" arrives pre-scoped
//   +  a partial save failure stops the download and retries safely
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/teacherWorkflow/ (git-ignored).

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/teacherWorkflow');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const VIEWPORTS = (process.env.VIEWPORTS || '1440x900,1024x768')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

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

// Waits until `ready()` holds, for at most `timeout` ms, and returns either way:
// it never throws. The checks here used to follow fixed pauses (0.3–1.5 s); on
// a loaded machine the screen was not there yet, and a correct app failed.
// Before a check the driver now waits for what that check reads, and the check
// then reads it again itself: an app that never gets there still fails, with
// the check's own message, about `timeout` ms later.
const SETTLE_MS = 10_000;
const settle = async (ready, timeout = SETTLE_MS) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    let timer;
    const outOfTime = new Promise((resolve) => { timer = setTimeout(resolve, Math.max(0, deadline - Date.now()), false); });
    const held = await Promise.race([Promise.resolve().then(ready).then(Boolean, () => false), outOfTime]);
    clearTimeout(timer);
    if (held) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
};

// Minimal ZIP reader (stored/deflated entries) so an export's contents can be
// checked without another dependency.
const zipEntries = (buffer) => {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    const raw = buffer.subarray(start, start + size);
    entries.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'));
    offset = start + size;
  }
  return entries;
};

const harnessDb = (page) => page.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('mm-teacher-workflow-harness-db-v1'))));
const sidebar = (page, name) => page.locator('nav, aside').getByRole('button', { name: new RegExp(`${name}$`) }).first().click();
const confirm = async (page) => {
  const dialog = page.getByRole('alertdialog').last();
  await dialog.waitFor({ timeout: 5000 });
  const said = await text(dialog);
  const buttons = dialog.getByRole('button');
  await buttons.nth((await buttons.count()) - 1).click();
  return said;
};
const homeDol = (page) => page.locator('section[aria-labelledby="home-class-now"] [data-section="dol"]').first();
const dolSays = async (page, pattern) => pattern.test(await text(homeDol(page)));

const journeys = {
  async A(page) {
    await sidebar(page, 'Classes');
    await page.getByRole('button', { name: /Algebra II — Period 3/ }).first().click();
    expect('A', await page.getByText("Today's lessons").count() > 0, 'class page has today’s lessons');
    const todaysLesson = page.locator('[data-lesson-group="today"]').first();
    expect('A', (await text(todaysLesson)).includes('Lesson 3: Elimination'), 'today’s lesson is first on the class page');
    await todaysLesson.getByRole('button', { name: 'Details' }).click();
    const hub = page.locator('[data-assignment-hub]');
    await hub.waitFor();
    await hub.getByRole('button', { name: /Show progress for/ }).click();
    await settle(async () => {
      const shown = await text(hub.locator('section[aria-labelledby="assignment-hub-progress"]'));
      return /3 IN PROGRESS/i.test(shown) && /5 NOT STARTED/i.test(shown);
    });
    const progress = await text(hub.locator('section[aria-labelledby="assignment-hub-progress"]'));
    expect('A', /3 IN PROGRESS/i.test(progress) && /5 NOT STARTED/i.test(progress), `hub shows progress on demand (${progress.slice(0, 120)})`);
    await hub.getByRole('button', { name: /^Grades/ }).click();
    // The gradebook draws, then selects the assignment it was opened on.
    await settle(async () => (await page.locator('select[aria-label="Gradebook assignment"]').inputValue()) === 'a-today'
      && (await page.locator('table tbody tr').count()) >= 8);
    expect('A', (await page.locator('select[aria-label="Gradebook assignment"]').inputValue()) === 'a-today', 'Grades opened on this assignment');
    expect('A', (await page.locator('table tbody tr').count()) >= 8, 'Grades table lists the class');
    await page.locator('section[aria-label="Assignment and class summary"]').getByRole('button', { name: 'Live view' }).click();
    await settle(async () => (await page.locator('#home-live-class select').filter({ hasText: 'Any assignment' }).first().inputValue()) === 'a-today');
    expect('A', (await page.locator('#home-live-class select').filter({ hasText: 'Any assignment' }).first().inputValue()) === 'a-today', 'Live view focused on the assignment');
  },

  async B(page) {
    const lab = async () => {
      const inSession = page.getByRole('group', { name: 'Classes in session' });
      await inSession.getByRole('button', { name: /Lab/ }).click();
      await settle(() => dolSays(page, /Opens automatically/));
      const said = await text(homeDol(page));
      const period3 = inSession.getByRole('button', { name: 'Algebra II — Period 3', exact: true });
      await period3.click();
      // Back on Period 3 before the journey goes on to the store.
      await settle(async () => (await period3.getAttribute('aria-pressed')) === 'true');
      return said;
    };
    await settle(() => dolSays(page, /Opens automatically/));
    expect('B', /Opens automatically/.test(await text(homeDol(page))), 'DOL waits for its automatic time');
    await homeDol(page).getByRole('button', { name: 'Open now' }).click();
    await confirm(page);
    await settle(async () => {
      const shown = await text(homeDol(page));
      return /Open · opened early by teacher/.test(shown) && /Automatic schedule: .* today/.test(shown);
    });
    const opened = await text(homeDol(page));
    expect('B', /Open · opened early by teacher/.test(opened), `Open now opens the DOL (${opened.slice(0, 120)})`);
    expect('B', !/Moved by teacher/.test(opened), 'opening early on its own day is not reported as a move');
    expect('B', /Automatic schedule: .* today/.test(opened), 'the automatic schedule stays visible');
    await homeDol(page).getByRole('button', { name: '+5 min' }).click();
    await confirm(page);
    await settle(() => dolSays(page, /teacher window until/));
    expect('B', /teacher window until/.test(await text(homeDol(page))), '+5 min extends the window');
    await homeDol(page).getByRole('button', { name: 'Close now' }).click();
    await confirm(page);
    await settle(() => dolSays(page, /Closed by teacher at/));
    const closed = await text(homeDol(page));
    expect('B', /Closed by teacher at/.test(closed) && !/reopen window has ended/.test(closed), `Close now closes it (${closed.slice(0, 140)})`);
    await homeDol(page).getByRole('button', { name: /Reopen DOL/ }).click();
    const reopenSaid = await confirm(page);
    expect('B', /both the close and the reopen stay on record/.test(reopenSaid), 'reopen after a close is an audited teacher window');
    await settle(() => dolSays(page, /Open · teacher window until/));
    expect('B', /Open · teacher window until/.test(await text(homeDol(page))), 'the DOL is open again');
    expect('B', /Opens automatically/.test(await lab()), 'the other class in the same period is untouched');
    const dol = (await harnessDb(page))['assignments/a-today'].dol;
    expect('B', (dol.recoveryAudit || []).map((entry) => entry.action).join('>') === 'unlockEarly>extendWindow>closeWindow>reopenWindow', 'every change is in the audit trail');
    expect('B', dol.scheduledInstructionDatesByClassId === undefined, 'no false "original day" is recorded');
  },

  async C(page) {
    await homeDol(page).getByRole('button', { name: 'Not today…' }).click();
    await homeDol(page).getByRole('button', { name: 'Move DOL' }).click();
    await confirm(page);
    await settle(async () => {
      const shown = await text(homeDol(page));
      return /Scheduled for/.test(shown) && /Moved by teacher — originally/.test(shown) && /Open today/.test(shown);
    });
    const moved = await text(homeDol(page));
    expect('C', /Scheduled for/.test(moved) && /Moved by teacher — originally/.test(moved), 'moved DOL shows the new day and the original');
    expect('C', /Open today/.test(moved), '"Open today" stays available after a move');
    await homeDol(page).getByRole('button', { name: 'Back to scheduled day' }).click();
    await confirm(page);
    await settle(() => dolSays(page, /Opens automatically/));
    expect('C', /Opens automatically/.test(await text(homeDol(page))), 'back on its automatic schedule');
    const dol = (await harnessDb(page))['assignments/a-today'].dol;
    expect('C', JSON.stringify(dol.instructionDatesByClassId || {}) === '{}' && JSON.stringify(dol.scheduledInstructionDatesByClassId || {}) === '{}', 'the original schedule is restored exactly');
  },

  async D(page) {
    const assignmentGroups = () => page.locator('[data-assignment-group]').evaluateAll((elements) => elements.map((element) => `${element.dataset.assignmentGroup}:${element.tagName === 'DETAILS' ? (element.open ? 'open' : 'folded') : 'shown'}`));
    const currentCards = () => page.locator('[data-assignment-group="current"] [data-assignment-card]').evaluateAll((elements) => elements.map((element) => element.dataset.assignmentCard));
    await sidebar(page, 'Assignments');
    await settle(async () => {
      const shown = await assignmentGroups();
      return shown[0] === 'current:shown' && shown.includes('closed:mp2:folded') && shown.includes('closed:mp1:folded')
        && (await currentCards()).join(',') === 'a-yesterday,a-today,a-p5';
    });
    const groups = await assignmentGroups();
    expect('D', groups[0] === 'current:shown', `current work leads the Assignments tab (${groups.join(', ')})`);
    expect('D', groups.includes('closed:mp2:folded') && groups.includes('closed:mp1:folded'), 'closed work folds by marking period');
    const current = await currentCards();
    expect('D', current.join(',') === 'a-yesterday,a-today,a-p5', `current work is due soonest first (${current.join(',')})`);
    await page.locator('[data-assignment-group="closed:mp1"] > summary').click();
    await settle(() => page.locator('[data-assignment-card="a-mp1"]').isVisible());
    expect('D', await page.locator('[data-assignment-card="a-mp1"]').isVisible(), 'last marking period is one click away');
    await sidebar(page, 'Grades');
    await settle(async () => await page.locator('section[aria-labelledby="gradebook-choose-class"]').count() === 1);
    expect('D', await page.locator('section[aria-labelledby="gradebook-choose-class"]').count() === 1, 'Grades asks which class when none is chosen');
    await page.locator('section[aria-labelledby="gradebook-choose-class"]').getByRole('button').first().click();
    // The gradebook draws, then selects the assignment it opens on.
    await settle(async () => (await page.locator('select[aria-label="Gradebook assignment"]').inputValue()) === 'a-yesterday');
    expect('D', (await page.locator('select[aria-label="Gradebook assignment"]').inputValue()) === 'a-yesterday', 'the gradebook opens on the open assignment due soonest');
    await sidebar(page, 'Grade Export');
    // A row it must not list cannot be waited for: wait until it lists its
    // rows and has loaded their export history, then look for that row.
    await settle(async () => (await page.locator('.tw-export-row').count()) > 0
      && (await page.getByText('Loading export history…').count()) === 0);
    expect('D', (await page.locator('.tw-export-row', { hasText: 'Unit 1 — Test Review' }).count()) === 0, 'Grade Export starts on the current marking period');
    await page.locator('select.tw-select').first().selectOption('mp1');
    await settle(async () => (await page.locator('.tw-export-row', { hasText: 'Unit 1 — Test Review' }).count()) === 1);
    expect('D', (await page.locator('.tw-export-row', { hasText: 'Unit 1 — Test Review' }).count()) === 1, 'an earlier marking period is one choice away');
  },

  async E(page) {
    await page.getByRole('button', { name: /Find/ }).first().click();
    // The palette clears its query as it opens; type once it has. It clears it
    // in the same run of effects that moves focus into its box (its dialog's
    // effect runs just before its own), so focus in the box means it has.
    await settle(() => page.getByPlaceholder('Student, class, assignment or TEKS code').evaluate((box) => box === document.activeElement));
    await page.getByPlaceholder('Student, class, assignment or TEKS code').fill('Substitution');
    await page.locator('[role="listbox"] [role="option"]').first().waitFor({ timeout: 5000 });
    // Scoped to the palette: the Live Teaching <select> has an <option> with the same title.
    await page.locator('[role="listbox"]').getByRole('option', { name: /Systems of Equations — Lesson 2: Substitution/ }).first().click();
    const hub = page.locator('[data-assignment-hub]');
    await hub.waitFor();
    for (const name of [/^Grades/, 'Live view', 'Export grades', 'View as student']) {
      expect('E', await hub.getByRole('button', { name }).count() === 1, `hub offers ${name}`);
    }
    await hub.locator('summary', { hasText: 'More…' }).click();
    const box = await hub.getByRole('button', { name: 'Dates & classes' }).boundingBox();
    expect('E', box && box.x >= 0 && box.x + box.width <= page.viewportSize().width, '"More…" actions are on screen');
    await hub.getByRole('button', { name: 'Dates & classes' }).click();
    const card = page.locator('[data-assignment-card="a-yesterday"]');
    await settle(() => card.getByRole('button', { name: 'Save Dates' }).isVisible());
    expect('E', await card.getByRole('button', { name: 'Save Dates' }).isVisible(), '"Dates & classes" brings the card into view');
  },

  async F(page) {
    await page.locator('section[aria-labelledby="home-class-now"]').getByRole('button', { name: 'Details' }).first().click();
    const hub = page.locator('[data-assignment-hub]');
    await hub.waitFor();
    await hub.getByRole('button', { name: /Stuck/ }).click();
    await hub.locator('section[aria-labelledby="assignment-hub-live"] .tw-link').first().click();
    const drawer = page.locator('aside[aria-label^="Learning profile for"]');
    // Which drawer is drawn on top, where the student's opens.
    const onTop = async () => {
      const box = await drawer.boundingBox();
      return page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('aside')?.getAttribute('aria-label') || '', { x: box.x + box.width / 2, y: box.y + 60 });
    };
    await settle(async () => (await onTop()).startsWith('Learning profile for'));
    const top = await onTop();
    expect('F', top.startsWith('Learning profile for'), 'a student opened from the hub is on top of it');
    await drawer.locator('li', { hasText: 'Linear Functions — Review' }).getByRole('button', { name: 'Work' }).click();
    await settle(async () => /· Linear Functions — Review/.test(await text(page.locator('h3', { hasText: '·' }).first()))
      && await page.getByRole('button', { name: 'View Student Work' }).count() > 0);
    expect('F', /· Linear Functions — Review/.test(await text(page.locator('h3', { hasText: '·' }).first())), 'student -> assignment -> work');
    expect('F', await page.getByRole('button', { name: 'View Student Work' }).count() > 0, 'each question links to the student’s work');
  },

  async G(page, context) {
    await sidebar(page, 'Classes');
    await page.getByRole('button', { name: /Algebra I — Period 1/ }).first().click();
    await page.getByRole('button', { name: 'Export grades' }).click();
    await settle(async () => (await page.locator('.tw-class-group__header strong').allInnerTexts()).join('|') === 'Algebra I — Period 1');
    const classes = await page.locator('.tw-class-group__header strong').allInnerTexts();
    expect('G', classes.join('|') === 'Algebra I — Period 1', `only this class is in scope (${classes.join('|')})`);
    const file = await exportFrom(page, page.locator('.tw-export-row', { hasText: 'Slope Foundations' }).getByRole('button', { name: /^Export$/ }));
    expect('G', file.name.startsWith('MathMaster-grades_Algebra-I-Period-1_Slope-Foundations_'), `ZIP is named by class and assignment (${file.name})`);
    const folders = [...new Set([...file.entries.keys()].filter((name) => name.includes('/')).map((name) => name.split('/')[0]))];
    expect('G', folders.length === 1 && folders[0].startsWith('Period1_SlopeFoundations'), 'the ZIP holds only this class’s lesson');
    const csv = file.entries.get(`${folders[0]}/Classwork.csv`) || '';
    const lines = csv.trim().split(/\r?\n/);
    expect('G', lines.length === 6 && lines.every((line) => /^\d+,\d+$/.test(line)), `CSV rows are district id, grade — nothing else (${JSON.stringify(lines.slice(0, 2))})`);
    context.slopeZip = file;
  },

  async H(page) {
    await sidebar(page, 'Grade Export');
    const row = () => page.locator('.tw-class-group', { hasText: 'Algebra II — Period 3' }).locator('.tw-export-row', { hasText: 'Linear Functions — Review' });
    // The row is drawn at once; what it says of Monday's export comes with the export history.
    await settle(async () => /Changed since export · 1/.test(await text(row())));
    expect('H', /Changed since export · 1/.test(await text(row())), 'a grade changed after Monday’s export is flagged');
    const file = await exportFrom(page, row().getByRole('button', { name: /Export again/ }), (review) => {
      expect('H', /Answer YES to “Overwrite existing grades\?”/.test(review), 're-export tells the teacher to overwrite in TEAMS');
    });
    expect('H', file.name.endsWith('_REEXPORT.zip'), 'the re-export is labelled');
    expect('H', /Overwrite existing grades\?”: YES/.test(file.entries.get('MANIFEST.txt') || ''), 'the manifest says overwrite');
    await settle(async () => /Exported .* exported 2 times/.test(await text(row())));
    expect('H', /Exported .* exported 2 times/.test(await text(row())), 'the history shows the second export');
  },

  async I(page) {
    await sidebar(page, 'Grade Export');
    // Nothing here reads the screen: the click below waits for "Download last
    // file", which the export history brings, and the counts are the store's.
    const row = page.locator('.tw-class-group', { hasText: 'Algebra II — Period 3' }).locator('.tw-export-row', { hasText: 'Linear Functions — Review' });
    const before = Object.keys(await harnessDb(page)).filter((key) => key.startsWith('gradeTransferSnapshots/')).length;
    const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', { name: 'Download last file' }).click()]);
    const entries = zipEntries(readFileSync(await download.path()));
    const after = Object.keys(await harnessDb(page)).filter((key) => key.startsWith('gradeTransferSnapshots/')).length;
    expect('I', download.suggestedFilename().endsWith('_COPY.zip') && entries.size === 5, 'the last file comes back as a copy');
    expect('I', before === after, 'downloading a copy records nothing new');
  },

  async J(page) {
    await sidebar(page, 'Grade Export');
    const chips = page.getByRole('group', { name: 'Classes' });
    await chips.getByRole('button', { name: 'Algebra I — Period 1' }).click();
    await chips.getByRole('button', { name: 'Algebra II — Period 3', exact: true }).click();
    await settle(async () => (await page.locator('.tw-class-group__header strong').allInnerTexts()).sort().join('|') === 'Algebra I — Period 1|Algebra II — Period 3');
    const classes = await page.locator('.tw-class-group__header strong').allInnerTexts();
    expect('J', classes.sort().join('|') === 'Algebra I — Period 1|Algebra II — Period 3', `only the chosen classes (${classes.join('|')})`);
    // A class offers "Select all" once its export history is in: wait for it in each.
    await settle(async () => {
      const groups = page.locator('.tw-class-group');
      return await groups.count() > 0 && await groups.getByRole('button', { name: /Select all/ }).count() === await groups.count();
    });
    for (const group of await page.locator('.tw-class-group').all()) {
      const button = group.getByRole('button', { name: /Select all/ });
      if (await button.count() && await button.isEnabled()) await button.click();
    }
    const file = await exportFrom(page, page.locator('.tw-selection-bar').getByRole('button', { name: /Review export/ }), (review) => {
      expect('J', /for the 4 files sent before and NO for the 8 new ones/.test(review), `mixed package says which files overwrite (${review.slice(0, 400)})`);
    });
    const folders = [...new Set([...file.entries.keys()].filter((name) => name.includes('/')).map((name) => name.split('/')[0]))];
    expect('J', folders.every((folder) => /^Period(1|3)_/.test(folder)) && folders.length === 3, `ZIP holds only the chosen classes (${folders.join(', ')})`);
  },

  async K(page) {
    await sidebar(page, 'Assignments');
    await page.locator('[data-assignment-group="closed:mp2"] > summary').click();
    await page.getByRole('button', { name: 'Linear Functions — Review', exact: true }).first().click();
    const hub = page.locator('[data-assignment-hub]');
    await hub.waitFor();
    const order = await hub.locator('.tw-drawer__body > section, .tw-drawer__body > details').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-labelledby') || element.tagName));
    expect('K', order[0] === 'assignment-hub-progress', `a closed lesson leads with its grades (${order.join(', ')})`);
    await hub.getByRole('group', { name: 'Class' }).getByRole('button', { name: 'Algebra I — Period 1' }).click();
    await hub.getByRole('button', { name: 'Export grades' }).click();
    await settle(async () => await page.locator('.tw-export-row').count() === 1
      && (await page.locator('.tw-class-group__header strong').allInnerTexts()).join('|') === 'Algebra I — Period 1'
      && /Assignment: Linear Functions — Review/.test(await text(page.locator('[aria-label="Export scope"]'))));
    const rows = await page.locator('.tw-export-row').count();
    const classes = await page.locator('.tw-class-group__header strong').allInnerTexts();
    expect('K', rows === 1 && classes.join('|') === 'Algebra I — Period 1', 'Export arrives on exactly this class and assignment');
    expect('K', /Assignment: Linear Functions — Review/.test(await text(page.locator('[aria-label="Export scope"]'))), 'the scope names the assignment');
  },

  async retry(page) {
    await sidebar(page, 'Grade Export');
    let downloads = 0;
    page.on('download', () => { downloads += 1; });
    await page.evaluate(() => { window.__mmHarness.failNextPersists = 1; });
    const row = () => page.locator('.tw-class-group', { hasText: 'Algebra I — Period 1' }).locator('.tw-export-row', { hasText: 'Slope Foundations' });
    // Enabled once the export history is in; the click waits for that.
    await row().getByRole('button', { name: /^Export$/ }).click();
    await page.locator('.tw-review').getByRole('button', { name: 'Download ZIP' }).click();
    await settle(async () => /Nothing was downloaded/.test(await text(page.locator('[role="status"]').first())));
    // A download that must not come cannot be waited for: once the screen has
    // answered, the driver still gives one the time it always did (900 ms here,
    // 1200 ms below), so these checks are no weaker than before.
    await page.waitForEvent('download', { timeout: 900 }).catch(() => {});
    expect('retry', downloads === 0 && /Nothing was downloaded/.test(await text(page.locator('[role="status"]').first())), 'a failed save stops the download and says so');
    await page.locator('.tw-review').getByRole('button', { name: 'Download ZIP' }).click();
    await settle(async () => downloads === 1 && /exported 1 time/.test(await text(row())));
    await page.waitForEvent('download', { timeout: 1200 }).catch(() => {});
    expect('retry', downloads === 1, 'the retry downloads once');
    expect('retry', /exported 1 time/.test(await text(row())), 'a retry is the same export');
  },
};

async function exportFrom(page, trigger, onReview = null) {
  await trigger.click();
  const review = page.locator('.tw-review');
  await review.waitFor();
  onReview?.(await text(review));
  const [download] = await Promise.all([page.waitForEvent('download'), review.getByRole('button', { name: 'Download ZIP' }).click()]);
  // The export is over when its review closes: the app closes it once the
  // export history holds the new file.
  await settle(async () => await review.count() === 0);
  return { name: download.suggestedFilename(), entries: zipEntries(readFileSync(await download.path())) };
}

for (const viewport of VIEWPORTS) {
  for (const [name, run] of Object.entries(journeys).filter(([key]) => !ONLY || ONLY.includes(key))) {
    const context = await newSchoolContext(browser, { viewport, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const unimplemented = watchUnimplementedCallables(page);
    const label = `${name}@${viewport.width}`;
    try {
      await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
      await page.getByText('IN SESSION NOW').waitFor({ timeout: 30000 });
      const before = findings.length;
      await run(page, {});
      const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
      expect(name, overflow <= 1, `no sideways scrolling at ${viewport.width}px (${overflow}px)`);
      expect(name, !unimplemented().length, `reached a callable the harness does not implement: ${unimplemented().join(', ')}`);
      if (findings.length === before) passed.push(label);
    } catch (error) {
      findings.push({ journey: label, detail: `stopped: ${error.message.split('\n')[0]}` });
    }
    errors.forEach((message) => findings.push({ journey: label, detail: `page error: ${message}` }));
    await page.screenshot({ path: path.join(ARTIFACTS, `${label}.png`) }).catch(() => {});
    await context.close();
  }
}
await browser.close();

console.log(`passed: ${passed.join(', ') || 'none'}`);
if (findings.length) {
  console.log(`\n${findings.length} finding(s):`);
  findings.forEach(({ journey, detail }) => console.log(`  [${journey}] ${detail}`));
  process.exit(1);
}
console.log('All teacher-workflow journeys passed.');
