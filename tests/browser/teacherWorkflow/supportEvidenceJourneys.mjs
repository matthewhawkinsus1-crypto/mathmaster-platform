// THE IEP / STUDENT SUPPORT EVIDENCE JOURNEYS, AGAINST THE REAL APP IN MEMORY.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/supportEvidenceJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1440x900,1024x768,768x1024;
//    ONLY=S1,T2 to run some journeys.)
//
// Same harness as journeys.mjs: the real App.jsx with `firebase/*` replaced by
// in-memory fakes, a synthetic school (fixture.js) — nothing can reach a
// Firebase project and no real student appears. Student journeys sign in one
// of the synthetic students with student custom-token claims
// (`?as=student&studentId=`).
//
// The fixture seeds `910002` ("Garza, Oakley") with a versioned support profile
// and evidence, and `910005` ("Price, Kai") with a pre-versioning profile and
// graded work with no timing — the "0 min" case the old report showed.
//
//   T1  the student drawer shows the profile in effect, MOD separate, counts
//   T2  one click records a staff support fact; a note after; "entered in error"
//   T3  service time is logged and summed against the plan's weekly figure
//   T4  the assignment hub's Supports layer: individual deadlines + evidence
//   T5  a new profile revision is saved without editing the old one
//   T6  the report: real assignments only, never "0 min", CSV, print
//   S1  the student sees their own due date (Home "Do this next", Resume,
//       Assignments, Grades, result, header) and Support tools; use is recorded
//   S2  reduced number of items (25%): the student is assigned 9 of 12, the
//       same 9 after a reload and on another device; "provided" is recorded
//       with target/original/assigned/actual; nothing names a program
//   T7  the teacher sees the configuration and "Fewer items · 9 of 12"
//       (S2/T7 seed their scenario with `&reduced=1`; nothing else changes)
//   S3  language supports with 25% fewer items: neutral Support tools under the
//       task (Translate shows the Spanish directions with the mathematics
//       intact, Vocabulary is bilingual, Break it down shows the steps, Help
//       me say it shows frames), never over the answer area; the same tools
//       in Work View; what was on screen is recorded once, use when opened
//   T8  the teacher sees Translation (from the language) and the records
//       (S3/T8 seed their scenario with `&eb=1`)
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/supportEvidence/ (git-ignored).

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { settle } from './journeyWaits.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/supportEvidence');
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
};

// Each action waits for its own target (the search filters as it is typed).
// The panel draws the profile at once and its counts once the student's
// records are read: each journey waits for what it reads of it.
const openStudent = async (page, search, name) => {
  await sidebar(page, 'Students');
  await page.getByPlaceholder('Search student or class').fill(search);
  await page.getByRole('button', { name }).first().click();
  const panel = page.locator('[data-student-support-evidence]');
  await panel.waitFor({ timeout: 20000 });
  return panel;
};
const drawerCount = (page) => page.locator('[data-student-profile-drawer]').count();

const journeys = {
  async T1(page) {
    const panel = await openStudent(page, 'Garza', 'Garza, Oakley');
    await settle(async () => {
      const shown = await text(panel);
      return /Revision 2 · effective/.test(shown) && /MOD · Reduced complexity/.test(shown)
        && /Individualized due dates: until the end of the next school day/.test(shown)
        && /1 staff record · 3 tool uses/.test(shown) && /30 min/.test(shown)
        && /Active · MOD/.test(await text(page.locator('tbody tr').filter({ hasText: 'Garza, Oakley' }).first()));
    });
    const said = await text(panel);
    expect('T1', /Revision 2 · effective/.test(said), `the revision in effect is named (${said.slice(0, 120)})`);
    expect('T1', /MOD · Reduced complexity/.test(said), 'the modification is shown separately as MOD');
    expect('T1', /Individualized due dates: until the end of the next school day/.test(said), 'the extra-time rule is stated');
    expect('T1', /1 staff record · 3 tool uses/.test(said), `a withdrawn mis-click is not counted (${said.match(/\d+ staff record[^·]*· \d+ tool uses?/)?.[0]})`);
    expect('T1', /30 min/.test(said), 'service minutes recorded this week');
    const roster = await text(page.locator('tbody tr').filter({ hasText: 'Garza, Oakley' }).first());
    expect('T1', /Active · MOD/.test(roster), `the roster flags supports and MOD (${roster.slice(0, 120)})`);
    await noSidewaysScroll('T1', page, 'student drawer');
  },

  async T2(page) {
    const panel = await openStudent(page, 'Garza', 'Garza, Oakley');
    const before = under(await db(page), 'grades/910002/supportEvidence/').length;
    await panel.getByRole('button', { name: 'Checked understanding' }).click();
    const status = () => text(panel.locator('[role="status"]').first());
    // The confirmation follows the write.
    await settle(async () => /Checked understanding · recorded/.test(await status()));
    expect('T2', /Checked understanding · recorded/.test(await text(panel.locator('[role="status"]').first())), 'the click confirms the time at once');
    const afterClick = under(await db(page), 'grades/910002/supportEvidence/');
    const recorded = afterClick.find(([key, value]) => value.supportId === 'check-for-understanding' && !key.endsWith('ev-check-1'));
    expect('T2', afterClick.length === before + 1, 'exactly one record was written');
    expect('T2', recorded && recorded[1].eventType === 'teacher-documented' && recorded[1].actorEmail === 'teacher@harness.example' && recorded[1].note === '' && recorded[1].questionIndex === null,
      `a staff fact with the teacher's name, no note required, no question (${JSON.stringify(recorded?.[1] || {}).slice(0, 200)})`);
    await panel.getByPlaceholder('Optional note (not required)').fill('Asked the student to explain the next step.');
    await panel.getByRole('button', { name: 'Add note' }).click();
    await settle(async () => {
      const shown = (await db(page))[recorded?.[0]];
      return shown?.note === 'Asked the student to explain the next step.' && shown?.noteAddedAt;
    });
    const noted = (await db(page))[recorded?.[0]];
    expect('T2', noted?.note === 'Asked the student to explain the next step.' && noted?.noteAddedAt, 'a note can be added after, with its own time');
    await panel.getByRole('button', { name: 'On-task prompt' }).click();
    // "Entered in error" withdraws the last record: wait until that is the prompt.
    await settle(async () => /On-task prompt · recorded/.test(await status()));
    await panel.getByRole('button', { name: 'Entered in error' }).click();
    // The correction is written, then the panel reads the records again.
    await settle(async () => under(await db(page), 'grades/910002/supportEvidence/').filter(([, value]) => value.voidsEventId && value.supportId === 'on-task-prompt').length === 2
      && /2 staff records · 3 tool uses/.test(await text(panel)));
    const corrections = under(await db(page), 'grades/910002/supportEvidence/').filter(([, value]) => value.voidsEventId && value.supportId === 'on-task-prompt');
    expect('T2', corrections.length === 2, `the mis-click is withdrawn by a correction record, not deleted (${corrections.length} corrections incl. the seeded one)`);
    const counts = await text(panel);
    expect('T2', /2 staff records · 3 tool uses/.test(counts), `counts include the new record and exclude the withdrawn one (${counts.match(/\d+ staff records?[^·]*· \d+ tool uses?/)?.[0]})`);
  },

  async T3(page) {
    const panel = await openStudent(page, 'Garza', 'Garza, Oakley');
    await panel.getByRole('button', { name: 'Log service time' }).click();
    const dialog = page.locator('[data-service-log]');
    await dialog.waitFor();
    expect('T3', /does not independently measure services or determine compliance/.test(await text(dialog)), 'the log says what it is not');
    await dialog.locator('input[type="number"]').fill('25');
    await dialog.getByRole('button', { name: 'Record service time' }).click();
    await settle(async () => {
      const shown = await text(dialog.locator('.tw-card').first());
      return /This week: 55 min recorded/.test(shown) && /profile expectation 100 min\/week; recorded this week 55 min/.test(shown);
    });
    const week = await text(dialog.locator('.tw-card').first());
    expect('T3', /This week: 55 min recorded/.test(week) && /profile expectation 100 min\/week; recorded this week 55 min/.test(week), `weekly total beside the plan's figure (${week})`);
    const entries = under(await db(page), 'grades/910002/supportServiceLog/');
    expect('T3', entries.some(([, value]) => value.minutes === 25 && value.createdByEmail === 'teacher@harness.example'), 'the entry is stored with its author');
    await page.keyboard.press('Escape');
    // The dialog closes; the drawer under it must not, and is given the 500 ms it always had to.
    await settle(async () => await page.locator('[data-service-log]').count() === 0);
    await settle(async () => await drawerCount(page) === 0, 500);
    expect('T3', await page.locator('[data-service-log]').count() === 0 && await page.locator('[data-student-profile-drawer]').count() === 1, 'Escape closes the dialog, not the drawer');
  },

  async T4(page) {
    await openStudent(page, 'Garza', 'Garza, Oakley');
    await page.locator('[data-student-profile-drawer]').getByRole('button', { name: /Linear Functions — Review/ }).first().click();
    const layer = page.locator('[data-assignment-supports]');
    await layer.waitFor({ timeout: 20000 });
    await layer.scrollIntoViewIfNeeded();
    const before = await text(layer);
    expect('T4', /2 students with a support profile/.test(before), 'both supported students are listed');
    expect('T4', /Individual deadlines on this assignment \(1\)/.test(before) && /extra time: until the end of the next school day/.test(before), 'the individualized deadline is listed');
    await layer.getByRole('button', { name: /Show support evidence/ }).click();
    // Each supported student's row fills in once their records are read.
    await settle(async () => {
      const shown = await text(layer);
      return /Garza, Oakley Standard/.test(shown) && /active time: 26 min/.test(shown) && /Read aloud: used 2×, available/.test(shown)
        && /Price, Kai Standard Record support .*active time: Not recorded/.test(shown);
    });
    const after = await text(layer);
    expect('T4', /Garza, Oakley Standard/.test(after), 'Standard: the configured modification changed no item of this lesson');
    expect('T4', /active time: 26 min/.test(after), 'server-timed active minutes are shown');
    expect('T4', /Read aloud: used 2×, available/.test(after), 'available and used are shown apart');
    expect('T4', /Price, Kai Standard Record support .*active time: Not recorded/.test(after), 'the pre-versioning student reads Not recorded, not 0 min');
    await noSidewaysScroll('T4', page, 'assignment hub');
    await layer.screenshot({ path: path.join(ARTIFACTS, `hub-supports-${page.viewportSize().width}.png`) });
  },

  async T5(page) {
    // Each action waits for its own target.
    await sidebar(page, 'Students');
    await page.getByPlaceholder('Search student or class').fill('Garza');
    await page.locator('tbody tr').filter({ hasText: 'Garza, Oakley' }).getByRole('button', { name: 'Open' }).click();
    // A student's detail page chooses its view from a tab list (TT27, fifth slice).
    await page.getByRole('tab', { name: 'Supports', exact: true }).click();
    const editor = page.locator('[data-support-profile-editor]');
    await editor.waitFor({ timeout: 20000 });
    const revisionsBefore = under(await db(page), 'grades/910002/supportProfileRevisions/');
    // Enabled once the editor has read the profile's history; the click waits for that.
    await editor.getByRole('button', { name: 'Record a change' }).click();
    const form = editor.locator('form');
    await form.getByPlaceholder(/IEP — annual review/).fill('ARD amendment (synthetic)');
    await form.getByLabel(/graph paper/i).check();
    await form.getByRole('button', { name: 'Save as a new revision' }).click();
    // The save writes the revision and the student's projection, then says so.
    await settle(async () => {
      const saved = await db(page);
      return under(saved, 'grades/910002/supportProfileRevisions/').length === revisionsBefore.length + 1
        && saved['grades/910002'].profile?.accommodations?.includes('graph-paper') && /Saved as a new revision/.test(await text(editor));
    });
    // An earlier revision that must not change, and source text that must not
    // reach the projection, are given the 2 s they always had.
    await settle(async () => {
      const saved = await db(page);
      return revisionsBefore.some(([key, value]) => JSON.stringify(saved[key]) !== JSON.stringify(value))
        || JSON.stringify(saved['grades/910002'].profile).includes('ARD amendment');
    }, 2000);
    const store = await db(page);
    const revisionsAfter = under(store, 'grades/910002/supportProfileRevisions/');
    expect('T5', revisionsAfter.length === revisionsBefore.length + 1, 'one new revision');
    revisionsBefore.forEach(([key, value]) => expect('T5', JSON.stringify(store[key]) === JSON.stringify(value), `${key} is unchanged`));
    const added = revisionsAfter.find(([key]) => !revisionsBefore.some(([old]) => old === key))?.[1];
    expect('T5', added?.revision === 3 && added?.sourceLabel === 'ARD amendment (synthetic)' && added?.createdByEmail === 'teacher@harness.example' && added?.createdAt, 'the revision records source, author and time');
    expect('T5', store['grades/910002'].profile?.accommodations?.includes('graph-paper') && store['grades/910002'].profile?.supportPlan?.windows?.length >= 1, 'the student-readable projection follows');
    expect('T5', !JSON.stringify(store['grades/910002'].profile).includes('ARD amendment'), 'the projection carries no privileged source text');
    expect('T5', /Saved as a new revision/.test(await text(editor)), 'the teacher is told it was saved as a new revision');
  },

  async T6(page) {
    const panel = await openStudent(page, 'Garza', 'Garza, Oakley');
    await panel.getByRole('button', { name: 'Support evidence report' }).click();
    const report = page.locator('[data-support-report]');
    await report.waitFor();
    await report.getByRole('button', { name: /Generate report/ }).click();
    await report.locator('#report-summary').waitFor({ timeout: 30000 });
    const said = await text(report);
    ['1. Student support profile', '2. Executive evidence summary', '3. Assignment evidence', '4. Support timeline', '5. Service / support summary', '6. Evidence legend', '7. Report limitations']
      .forEach((heading) => expect('T6', said.includes(heading), `section present: ${heading}`));
    expect('T6', !said.includes('Quadratics — Lesson 1'), 'an unassigned library copy never appears');
    expect('T6', !/\b0 min\b(?! service| server)/.test(said.replace(/\b0 min (service|server)[^\s]*/g, '')), 'no "0 min" for time that was not recorded');
    expect('T6', /not a compliance determination/.test(said), 'the report says it is a factual summary');
    expect('T6', /Standard \(grade-level\) and Modified work are never averaged together/.test(said), 'Standard and Modified are kept apart');
    const [download] = await Promise.all([page.waitForEvent('download'), report.getByRole('button', { name: 'CSV' }).click()]);
    expect('T6', /^MathMaster-support-evidence_910002_.*\.csv$/.test(download.suggestedFilename()), `CSV named by student and dates (${download.suggestedFilename()})`);
    const csv = readFileSync(await download.path(), 'utf8');
    expect('T6', csv.startsWith('Assignment,Assignment ID,Class due,Individualized due'), 'CSV header');
    await report.getByRole('button', { name: 'Expand all' }).click();
    await page.emulateMedia({ media: 'print' });
    await settle(() => page.evaluate(() => [...document.querySelectorAll('.se-report__controls')].every((element) => getComputedStyle(element).display === 'none')));
    const controlsHidden = await page.evaluate(() => [...document.querySelectorAll('.se-report__controls')].every((element) => getComputedStyle(element).display === 'none'));
    expect('T6', controlsHidden, 'printing hides the controls');
    await page.screenshot({ path: path.join(ARTIFACTS, `report-print-${page.viewportSize().width}.png`), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await noSidewaysScroll('T6', page, 'report');
    await report.getByRole('button', { name: 'Close' }).first().click();
    // The report closes; the drawer under it must not, and is given the 600 ms it always had to.
    await settle(async () => await report.count() === 0);
    await settle(async () => await drawerCount(page) === 0, 600);
    expect('T6', await page.locator('[data-student-profile-drawer]').count() === 1, 'closing the report returns to the drawer');
  },

  async S1(page) {
    // With questions the student app renders (fixture.js `?questions=real`): in the default lesson, `freeResponse`,
    // Continue opened QuestionEngine's "This question could not be displayed".
    await page.goto(`${PAGE}&as=student&studentId=910002&questions=real`, { timeout: 180000 });
    await page.getByText('Log Out').first().waitFor({ timeout: 120000 });

    // Every screen that names this student's due date names the SAME one: the
    // individualized date, never the class date a day earlier. The fixture's
    // next action is resuming Lesson 3 ('a-today'). Dates are compared as the
    // page prints them, so this holds in any browser time zone.
    const LESSON_3 = 'Systems of Equations — Lesson 3: Elimination';
    // "Due: <date>" on lists and results (one form since pass 3, NAV-18); the
    // primary "Do this next" card names an individualized date as "Your due date: <date>".
    const DUE = /\b(?:Due:|Your due date:) (\w{3} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M)/;
    // Home draws, then its "Do this next" card names the lesson and the student's own date.
    const homeReady = async () => {
      const card = await text(page.locator('section[aria-labelledby="what-now-heading"]'));
      return card.includes(LESSON_3) && DUE.test(card) && /Your due date: /.test(card);
    };
    await settle(async () => await homeReady() && (await text(page.locator('body'))).includes('Your due date'));
    const home = await text(page.locator('body'));
    expect('S1', home.includes('Your due date'), 'the dashboard shows the student their own due date');
    expect('S1', !/\b(IEP|504|modification|accommodation|inclusion)\b/i.test(home), 'nothing on the student\'s screen names a program or classification');

    const nextCard = await text(page.locator('section[aria-labelledby="what-now-heading"]'));
    const nextDue = nextCard.match(DUE)?.[1] || null;
    const classDue = await page.evaluate((iso) => new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }), (await db(page))['assignments/a-today']?.dueAt);
    expect('S1', nextCard.includes(LESSON_3) && Boolean(nextDue), `"Do this next" names Lesson 3 and a due date (${nextCard.slice(0, 160)})`);
    // Home shows one primary card for the work to resume (the separate Resume
    // card was a duplicate of it); that card names the date as the student's own.
    expect('S1', /Your due date: /.test(nextCard), `"Do this next" names the student's own due date (${nextCard.slice(0, 200)})`);
    expect('S1', nextDue !== classDue, `"Do this next" does not show the class due date (${classDue})`);
    // The screen a tab opens is the one its heading names ("My Assignments",
    // "My Grades"), so a row still on screen from the tab before is not read.
    const onScreen = async (heading) => await page.locator('h1', { hasText: heading }).count() > 0;
    const backToGrades = page.getByRole('button', { name: /^← Grades$|Back to My grades/ }).first();
    for (const tab of ['Assignments', 'Grades']) {
      await page.getByRole('link', { name: new RegExp(`^${tab}$`) }).first().click();
      const row = page.locator('article').filter({ hasText: LESSON_3 }).first();
      await settle(async () => await onScreen(`My ${tab}`) && (await text(row)).match(DUE)?.[1] === nextDue);
      const rowDue = (await text(row)).match(DUE)?.[1] || null;
      expect('S1', rowDue === nextDue, `${tab} tab shows the student's own due date (${rowDue}; expected ${nextDue})`);
      if (tab === 'Grades') {
        await row.getByRole('button', { name: 'See results' }).click();
        // The result page (its Back control is the way out), not the list under it.
        await settle(async () => await backToGrades.count() > 0 && (await text(page.locator('main').first())).match(DUE)?.[1] === nextDue);
        const resultDue = (await text(page.locator('main').first())).match(DUE)?.[1] || null;
        expect('S1', resultDue === nextDue, `the assignment result shows the student's own due date (${resultDue}; expected ${nextDue})`);
        // The result's Back control names its destination ("← Grades").
        await page.getByRole('button', { name: /^← Grades$|Back to My grades/ }).first().click();
        await settle(() => onScreen('My Grades'));
      }
    }
    await page.getByRole('link', { name: /^Home$/ }).first().click();
    await page.locator('section[aria-labelledby="what-now-heading"]').waitFor({ timeout: 20000 });
    // Its first resume button is the card's once the card names the lesson.
    await settle(homeReady);

    const before = Object.keys(await db(page)).filter((key) => key.startsWith('grades/910002/supportEvidence/') || key.startsWith('grades/910002/engagementMinutes/'));
    await page.getByRole('button', { name: /Continue|Resume|Open|Start/ }).first().click();
    await page.getByRole('button', { name: 'Read aloud' }).first().waitFor({ timeout: 60000 });
    // The assignment header names the student's own date. Phones and portrait
    // tablets hide the header (below) and show the navigator's chip instead.
    await settle(async () => {
      if (!(await page.locator('.mathmaster-assignment-header').isVisible())) return await page.locator('.mathmaster-assignment-status-chip').filter({ visible: true }).count() > 0;
      const shown = await text(page.locator('body'));
      return /Your due date: /.test(shown) && (!shown.includes(LESSON_3) || shown.match(/Your due date: (\w{3} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M)/)?.[1] === nextDue);
    });
    const header = await text(page.locator('body'));
    if (await page.locator('.mathmaster-assignment-header').isVisible()) {
      expect('S1', /Your due date: /.test(header), 'the assignment header shows the individualized due date');
      if (header.includes(LESSON_3)) {
        const headerDue = header.match(/Your due date: (\w{3} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M)/)?.[1] || null;
        expect('S1', headerDue === nextDue, `the header and "Do this next" name the same date (${headerDue}; ${nextDue})`);
      }
    } else {
      // Phones and portrait tablets hide the assignment header by design (the
      // dashboard above carries the date); Support tools move to the
      // navigator's chip ("More", or the most urgent status), which the
      // student opens (pass 3).
      const chip = page.locator('.mathmaster-assignment-status-chip').filter({ visible: true });
      if (await chip.count()) await chip.first().click();
    }
    const tools = page.locator('[data-student-support-tools]:visible');
    await settle(async () => await tools.count() === 1);
    expect('S1', await tools.count() === 1, `exactly one Support tools panel is reachable (${await tools.count()})`);
    await tools.getByRole('button', { name: /Support tools/ }).click();
    const toolText = await text(tools);
    expect('S1', /Read aloud/.test(toolText) && /Calculator/.test(toolText) && !/accommodat|IEP|modif/i.test(toolText), `neutral Support tools (${toolText})`);
    await page.mouse.move(300, 300);
    await page.mouse.move(340, 320);
    await page.getByRole('button', { name: 'Read aloud' }).first().click();
    // The records the assignment's launch and the click write, and the ledger's
    // minute (its engaged tick comes every 5 s).
    await settle(async () => {
      const kinds = Object.entries(await db(page))
        .filter(([key]) => (key.startsWith('grades/910002/supportEvidence/') || key.startsWith('grades/910002/engagementMinutes/')) && !before.includes(key))
        .map(([key, value]) => (key.includes('engagementMinutes') ? 'ledger' : `${value.eventType}:${value.supportId}`));
      return ['available:text-to-speech', 'used:text-to-speech', 'provided:extra-time', 'ledger'].every((kind) => kinds.includes(kind));
    });
    const store = await db(page);
    const created = Object.entries(store).filter(([key]) => (key.startsWith('grades/910002/supportEvidence/') || key.startsWith('grades/910002/engagementMinutes/')) && !before.includes(key));
    const kinds = created.map(([key, value]) => (key.includes('engagementMinutes') ? 'ledger' : `${value.eventType}:${value.supportId}`));
    expect('S1', kinds.includes('available:text-to-speech'), `Read aloud made available is recorded (${kinds.join(', ')})`);
    expect('S1', kinds.includes('used:text-to-speech'), 'Read aloud use is recorded');
    expect('S1', kinds.includes('provided:extra-time'), 'the individualized due date is recorded as provided');
    expect('S1', kinds.includes('ledger'), 'a server-timed active minute is recorded');
    created.forEach(([, value]) => {
      if (value.eventType) expect('S1', value.note === '' && value.actorEmail === null && value.source === 'automatic-telemetry', 'student records are platform telemetry only');
    });
    await noSidewaysScroll('S1', page, 'student assignment');
    await page.screenshot({ path: path.join(ARTIFACTS, `student-${page.viewportSize().width}.png`) });
  },

  async S2(page, context) {
    const STUDENT = '910950';
    const TITLE = 'Two-Step Equations — Practice Set';
    // Home draws the assignment's card (the one a locator below finds, with its
    // button) once it has the student's work: on a fresh start the card counts
    // the student's own items, and once the work is started "Do this next"
    // names it instead.
    const countsOwnItems = async (target) => /0 of 9 questions finished/.test(await text(target.locator('body')));
    const resumes = async (target) => (await text(target.locator('section[aria-labelledby="what-now-heading"]'))).includes(TITLE);
    const openReduced = async (target, reset, drawn) => {
      const base = `${ORIGIN}/tests/browser/teacherWorkflow/index.html?${reset ? 'reset=1&' : ''}reduced=1&as=student&studentId=${STUDENT}`;
      await target.goto(base, { timeout: 180000 });
      await target.getByText('Log Out').first().waitFor({ timeout: 120000 });
      await settle(() => drawn(target));
      return text(target.locator('body'));
    };
    // The question list fills in once the assignment has its items: wait until
    // it lists what `listed` expects.
    const shownQuestions = async (target, listed) => {
      const card = target.locator('article, section, li, div').filter({ hasText: TITLE }).filter({ has: target.getByRole('button', { name: /Start|Open|Continue|Resume/ }) }).last();
      await card.getByRole('button', { name: /Start|Open|Continue|Resume/ }).first().click();
      const picker = target.locator('select[aria-label="Choose a question"]').first();
      await picker.waitFor({ state: 'attached', timeout: 60000 });
      const options = () => picker.locator('option').evaluateAll((entries) => entries.map((option) => ({ value: Number(option.value), label: option.textContent.trim() })));
      await settle(async () => listed(await options()));
      return options();
    };
    const sameItems = (expected) => (options) => JSON.stringify(options.map((entry) => entry.value)) === JSON.stringify(expected.map((entry) => entry.value));
    const reducedRecords = async () => under(await db(page), `grades/${STUDENT}/supportEvidence/`).filter(([, value]) => value.supportId === 'reduced-item-count-same-rigor');

    const home = await openReduced(page, true, countsOwnItems);
    expect('S2', /0 of 9 questions finished/.test(home), `Home counts the student's own 9 items (${(home.match(/\d+ of \d+ questions? finished/g) || []).join('; ')})`);
    expect('S2', !/\b(IEP|504|modification|accommodation|reduced|fewer items)\b/i.test(home), 'nothing on the student\'s screen names a program, a classification or the reduction');
    const first = await shownQuestions(page, (options) => options.length === 9 && options.at(-1)?.label === 'Practice Q9');
    expect('S2', first.length === 9, `the student is assigned 9 of 12 (${first.length})`);
    expect('S2', first.at(-1)?.label === 'Practice Q9', `numbering counts the student's own items (${first.at(-1)?.label})`);
    const workspace = await text(page.locator('body'));
    expect('S2', !/\b(IEP|504|accommodation|reduced|fewer items)\b/i.test(workspace), 'the workspace names nothing either');
    // "Provided" is written once the projection applied; a second record, which
    // must not come, is given the 3 s it always had.
    await settle(async () => (await reducedRecords()).some(([, value]) => value.eventType === 'provided'));
    await settle(async () => (await reducedRecords()).length > 1, 3000);
    const records = under(await db(page), `grades/${STUDENT}/supportEvidence/`).map(([, value]) => value)
      .filter((value) => value.supportId === 'reduced-item-count-same-rigor');
    const provided = records.find((value) => value.eventType === 'provided');
    expect('S2', Boolean(provided), `"provided" is recorded once the projection applied (${records.map((value) => value.eventType).join(', ')})`);
    expect('S2', provided?.details?.originalCount === 12 && provided?.details?.assignedCount === 9 && provided?.details?.actualPercentTenths === 250 && provided?.details?.targetPercent === 25,
      `the record carries target/original/assigned/actual (${JSON.stringify(provided?.details || {})})`);
    expect('S2', provided?.source === 'automatic-telemetry' && provided?.note === '' && provided?.actorEmail === null, 'a platform record, never a staff fact');
    expect('S2', records.length === 1, `one record, not one per render (${records.length})`);

    // The same 9 after a reload on this Chromebook (no reset: the stored state)…
    await openReduced(page, false, resumes);
    const reloaded = await shownQuestions(page, sameItems(first));
    expect('S2', JSON.stringify(reloaded.map((entry) => entry.value)) === JSON.stringify(first.map((entry) => entry.value)), 'the same items after a reload');
    // A record the relaunch must not add is given the 1.5 s it always had (the
    // pause after the list appeared).
    await settle(async () => (await reducedRecords()).length > 1, 1500);
    const recordsAfterReload = under(await db(page), `grades/${STUDENT}/supportEvidence/`).filter(([, value]) => value.supportId === 'reduced-item-count-same-rigor');
    expect('S2', recordsAfterReload.length === 1, `a relaunch does not duplicate the record (${recordsAfterReload.length})`);
    // …and on another device (a fresh browser profile, nothing stored locally).
    const other = await newSchoolContext(context.browser(), { viewport: page.viewportSize() });
    const otherPage = await other.newPage();
    await openReduced(otherPage, true, countsOwnItems);
    const elsewhere = await shownQuestions(otherPage, sameItems(first));
    expect('S2', JSON.stringify(elsewhere.map((entry) => entry.value)) === JSON.stringify(first.map((entry) => entry.value)), 'the same items on another device');
    await other.close();
    await noSidewaysScroll('S2', page, 'reduced assignment');
    await page.screenshot({ path: path.join(ARTIFACTS, `reduced-student-${page.viewportSize().width}.png`) });
  },

  async S3(page) {
    const STUDENT = '910960';
    const TITLE = 'One-Variable Equations — Explain Your Thinking';
    await page.goto(`${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1&eb=1&as=student&studentId=${STUDENT}`, { timeout: 180000 });
    await page.getByText('Log Out').first().waitFor({ timeout: 120000 });
    // Home draws the assignment's card (the one the locator below finds) with the student's own count.
    await settle(async () => /0 of 3 questions finished/.test(await text(page.locator('body'))));
    const home = await text(page.locator('body'));
    expect('S3', /0 of 3 questions finished/.test(home), `25% fewer items still applies with language supports (${(home.match(/\d+ of \d+ questions? finished/g) || []).join('; ')})`);
    const card = page.locator('article, section, li, div').filter({ hasText: TITLE }).filter({ has: page.getByRole('button', { name: /Start|Open|Continue|Resume/ }) }).last();
    await card.getByRole('button', { name: /Start|Open|Continue|Resume/ }).first().click();
    const tray = page.locator('[data-student-support-tray="assignment"]').first();
    await tray.waitFor({ timeout: 60000 });
    // Where the tray's visible part ends, and where the work begins (below).
    const trayLayout = () => page.evaluate(() => {
      const trayElement = document.querySelector('[data-student-support-tray="assignment"]');
      const work = document.querySelector('.math-tool-workspace');
      let clip = null;
      for (let node = trayElement?.parentElement; node; node = node.parentElement) {
        const { overflowY } = getComputedStyle(node);
        if (['auto', 'scroll', 'hidden'].includes(overflowY) && node.scrollHeight > node.clientHeight) { clip = node; break; }
      }
      const trayRect = trayElement.getBoundingClientRect();
      const visibleBottom = clip ? Math.min(trayRect.bottom, clip.getBoundingClientRect().bottom) : trayRect.bottom;
      return { visibleBottom, workTop: work.getBoundingClientRect().top, clipped: Boolean(clip) };
    });
    // The tray offers its tools and the item's own steps, under the task, once
    // the workspace is drawn beneath it.
    await settle(async () => {
      const offered = await tray.locator('[data-support-tool]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-support-tool')));
      const shownSteps = await text(page.locator('[data-support-steps]').first());
      const placed = await trayLayout();
      return ['translate', 'vocabulary', 'say-it'].every((tool) => offered.includes(tool))
        && /Solve \dx = \d+ for x\./.test(shownSteps) && /Explain how you know\./.test(shownSteps) && placed.visibleBottom <= placed.workTop + 1;
    });
    const said = await text(page.locator('body'));
    expect('S3', !/\b(IEP|504|EB|emergent bilingual|accommodation|modification|ELL|LEP)\b/i.test(said), 'nothing on the student\'s screen names a program or a classification');
    const toolNames = await tray.locator('[data-support-tool]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-support-tool')));
    expect('S3', ['translate', 'vocabulary', 'say-it'].every((tool) => toolNames.includes(tool)), `Translate, Vocabulary and Help me say it are offered (${toolNames.join(', ')})`);
    const steps = await text(page.locator('[data-support-steps]').first());
    expect('S3', /Solve \dx = \d+ for x\./.test(steps) && /Explain how you know\./.test(steps), `Break it down shows the item's own steps (${steps})`);

    // The tray sits under the task, never over the work. On a phone it lives in
    // the task panel, which scrolls inside its own capped height, so what can
    // cover anything is the part of it that is actually visible.
    const layout = await trayLayout();
    expect('S3', layout.visibleBottom <= layout.workTop + 1, `the tray never covers the workspace (${JSON.stringify(layout)})`);

    await tray.locator('[data-support-tool="translate"]').click();
    const translated = await text(page.locator('[data-support-panel="translate"]').first());
    expect('S3', /Despeja x en \dx = \d+\./.test(translated) && /Explica cómo lo sabes\./.test(translated), `Translate shows the Spanish directions with the mathematics intact (${translated})`);
    await tray.locator('[data-support-tool="vocabulary"]').click();
    await page.locator('[data-support-panel="vocabulary"] dt').first().waitFor({ timeout: 20000 });
    const vocabulary = await text(page.locator('[data-support-panel="vocabulary"]').first());
    expect('S3', /solution/i.test(vocabulary) && /solución/.test(vocabulary), `Vocabulary is bilingual (${vocabulary.slice(0, 160)})`);
    await tray.locator('[data-support-tool="say-it"]').click();
    const frames = await text(page.locator('[data-support-panel="say-it"]').first());
    expect('S3', /I know _____ because _____\./.test(frames) && /Sé que _____ porque _____\./.test(frames), `Help me say it shows frames, never answers (${frames.slice(0, 160)})`);
    expect('S3', !/\b2\b/.test(frames), 'no frame carries a value');
    await noSidewaysScroll('S3', page, 'Support tools open');

    // The same tools in Work View.
    const enlarge = page.getByRole('button', { name: /Open Work View/ }).first();
    if (await enlarge.count()) {
      await enlarge.click();
      await page.locator('[data-work-view-supports]').first().click();
      const enlarged = page.locator('[data-student-support-tray="enlarged"]').first();
      await enlarged.waitFor({ timeout: 20000 });
      expect('S3', await enlarged.locator('[data-support-tool="translate"]').count() > 0, 'Work View carries the same Support tools');
      await page.getByRole('button', { name: /Close/ }).first().click();
    } else {
      expect('S3', false, 'the question offers Work View');
    }

    const recordedKinds = async () => under(await db(page), `grades/${STUDENT}/supportEvidence/`).map(([, value]) => `${value.eventType}:${value.supportId}`);
    await settle(async () => {
      const recorded = await recordedKinds();
      return ['available:translation', 'available:glossary-lookup', 'provided:chunked-directions', 'available:sentence-frames',
        'used:translation', 'used:glossary-lookup', 'used:sentence-frames', 'provided:reduced-item-count-same-rigor'].every((kind) => recorded.includes(kind));
    });
    // A "used" for an automatic support, and a second "available", must not
    // come: they are given the 2.5 s they always had.
    await settle(async () => {
      const recorded = await recordedKinds();
      return recorded.includes('used:chunked-directions') || recorded.filter((kind) => kind === 'available:translation').length > 1;
    }, 2500);
    const records = under(await db(page), `grades/${STUDENT}/supportEvidence/`).map(([, value]) => value);
    const kinds = records.map((value) => `${value.eventType}:${value.supportId}`);
    ['available:translation', 'available:glossary-lookup', 'provided:chunked-directions', 'available:sentence-frames',
      'used:translation', 'used:glossary-lookup', 'used:sentence-frames', 'provided:reduced-item-count-same-rigor']
      .forEach((kind) => expect('S3', kinds.includes(kind), `${kind} is recorded (${kinds.join(', ')})`));
    const translation = records.find((value) => value.eventType === 'available' && value.supportId === 'translation');
    expect('S3', translation?.details?.language === 'es' && translation?.details?.coverage === 'full' && translation?.details?.provider === 'curated',
      `translation records its language, coverage and source (${JSON.stringify(translation?.details || {})})`);
    expect('S3', !kinds.includes('used:chunked-directions'), 'an automatic support has no "used"');
    const availableTwice = kinds.filter((kind) => kind === 'available:translation').length;
    expect('S3', availableTwice === 1, `made-available is recorded once per assignment, not per render (${availableTwice})`);
    records.forEach((value) => expect('S3', value.note === '' && value.actorEmail === null && value.source === 'automatic-telemetry', 'platform telemetry only'));
    await page.screenshot({ path: path.join(ARTIFACTS, `language-student-${page.viewportSize().width}.png`) });
  },

  async T8(page) {
    const panel = await openStudent(page, 'Sam', 'Example, Sam');
    await settle(async () => {
      const shown = await text(panel);
      return /Translation · es/.test(shown) && /Vocabulary/.test(shown) && /Break it down/.test(shown);
    });
    const said = await text(panel);
    expect('T8', /Translation · es/.test(said), `the profile shows Translation from the language (${said.slice(0, 240)})`);
    expect('T8', /Vocabulary/.test(said) && /Break it down/.test(said), 'Vocabulary and Break it down are listed');
    await noSidewaysScroll('T8', page, 'student drawer (language)');
    await page.screenshot({ path: path.join(ARTIFACTS, `language-teacher-${page.viewportSize().width}.png`) });
  },

  async T7(page) {
    const panel = await openStudent(page, 'Rory', 'Sample, Rory');
    await settle(async () => /Fewer items, same rigor · 25% \(automatic\)/.test(await text(panel))
      && /Fewer items · 9 of 12/.test(await text(page.locator('[data-student-profile-drawer]').first())));
    const said = await text(panel);
    expect('T7', /Fewer items, same rigor · 25% \(automatic\)/.test(said), `the drawer shows the configuration (${said.slice(0, 200)})`);
    const drawer = await text(page.locator('[data-student-profile-drawer]').first());
    expect('T7', /Fewer items · 9 of 12/.test(drawer), 'the student\'s assignment row shows 9 of 12 items');
    await noSidewaysScroll('T7', page, 'student drawer (reduced)');
    await page.screenshot({ path: path.join(ARTIFACTS, `reduced-teacher-${page.viewportSize().width}.png`) });
  },
};

for (const viewport of VIEWPORTS) {
  for (const [name, run] of Object.entries(journeys)) {
    if (ONLY && !ONLY.includes(name)) continue;
    const context = await newSchoolContext(browser, { viewport, acceptDownloads: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    const unimplemented = watchUnimplementedCallables(page);
    const label = `${name} @ ${viewport.width}x${viewport.height}`;
    try {
      // A journey's first action waits for its own target.
      if (!name.startsWith('S')) {
        await page.goto(name === 'T7' ? `${PAGE}&reduced=1` : name === 'T8' ? `${PAGE}&eb=1` : PAGE, { timeout: 180000 });
        await page.getByText('Instructor Dashboard').first().waitFor({ timeout: 120000 });
      }
      const before = findings.length;
      await run(page, context);
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
