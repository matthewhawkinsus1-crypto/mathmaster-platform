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
//   S1  the student sees their own due date and Support tools; use is recorded
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/supportEvidence/ (git-ignored).

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const openStudent = async (page, search, name) => {
  await sidebar(page, 'Students');
  await page.waitForTimeout(1200);
  await page.getByPlaceholder('Search student or class').fill(search);
  await page.waitForTimeout(700);
  await page.getByRole('button', { name }).first().click();
  const panel = page.locator('[data-student-support-evidence]');
  await panel.waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  return panel;
};

const journeys = {
  async T1(page) {
    const panel = await openStudent(page, 'Garza', 'Garza, Oakley');
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
    await page.waitForTimeout(1200);
    expect('T2', /Checked understanding · recorded/.test(await text(panel.locator('[role="status"]').first())), 'the click confirms the time at once');
    const afterClick = under(await db(page), 'grades/910002/supportEvidence/');
    const recorded = afterClick.find(([key, value]) => value.supportId === 'check-for-understanding' && !key.endsWith('ev-check-1'));
    expect('T2', afterClick.length === before + 1, 'exactly one record was written');
    expect('T2', recorded && recorded[1].eventType === 'teacher-documented' && recorded[1].actorEmail === 'teacher@harness.example' && recorded[1].note === '' && recorded[1].questionIndex === null,
      `a staff fact with the teacher's name, no note required, no question (${JSON.stringify(recorded?.[1] || {}).slice(0, 200)})`);
    await panel.getByPlaceholder('Optional note (not required)').fill('Asked the student to explain the next step.');
    await panel.getByRole('button', { name: 'Add note' }).click();
    await page.waitForTimeout(1000);
    const noted = (await db(page))[recorded?.[0]];
    expect('T2', noted?.note === 'Asked the student to explain the next step.' && noted?.noteAddedAt, 'a note can be added after, with its own time');
    await panel.getByRole('button', { name: 'On-task prompt' }).click();
    await page.waitForTimeout(1000);
    await panel.getByRole('button', { name: 'Entered in error' }).click();
    await page.waitForTimeout(1500);
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
    await page.waitForTimeout(1200);
    const week = await text(dialog.locator('.tw-card').first());
    expect('T3', /This week: 55 min recorded/.test(week) && /profile expectation 100 min\/week; recorded this week 55 min/.test(week), `weekly total beside the plan's figure (${week})`);
    const entries = under(await db(page), 'grades/910002/supportServiceLog/');
    expect('T3', entries.some(([, value]) => value.minutes === 25 && value.createdByEmail === 'teacher@harness.example'), 'the entry is stored with its author');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
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
    await page.waitForTimeout(2500);
    const after = await text(layer);
    expect('T4', /Garza, Oakley Standard/.test(after), 'Standard: the configured modification changed no item of this lesson');
    expect('T4', /active time: 26 min/.test(after), 'server-timed active minutes are shown');
    expect('T4', /Read aloud: used 2×, available/.test(after), 'available and used are shown apart');
    expect('T4', /Price, Kai Standard Record support .*active time: Not recorded/.test(after), 'the pre-versioning student reads Not recorded, not 0 min');
    await noSidewaysScroll('T4', page, 'assignment hub');
    await layer.screenshot({ path: path.join(ARTIFACTS, `hub-supports-${page.viewportSize().width}.png`) });
  },

  async T5(page) {
    await sidebar(page, 'Students');
    await page.waitForTimeout(1200);
    await page.getByPlaceholder('Search student or class').fill('Garza');
    await page.waitForTimeout(700);
    await page.locator('tbody tr').filter({ hasText: 'Garza, Oakley' }).getByRole('button', { name: 'Open' }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Supports', exact: true }).click();
    const editor = page.locator('[data-support-profile-editor]');
    await editor.waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    const revisionsBefore = under(await db(page), 'grades/910002/supportProfileRevisions/');
    await editor.getByRole('button', { name: 'Record a change' }).click();
    const form = editor.locator('form');
    await form.getByPlaceholder(/IEP — annual review/).fill('ARD amendment (synthetic)');
    await form.getByLabel(/graph paper/i).check();
    await form.getByRole('button', { name: 'Save as a new revision' }).click();
    await page.waitForTimeout(2000);
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
    await page.waitForTimeout(400);
    const controlsHidden = await page.evaluate(() => [...document.querySelectorAll('.se-report__controls')].every((element) => getComputedStyle(element).display === 'none'));
    expect('T6', controlsHidden, 'printing hides the controls');
    await page.screenshot({ path: path.join(ARTIFACTS, `report-print-${page.viewportSize().width}.png`), fullPage: true });
    await page.emulateMedia({ media: 'screen' });
    await noSidewaysScroll('T6', page, 'report');
    await report.getByRole('button', { name: 'Close' }).first().click();
    await page.waitForTimeout(600);
    expect('T6', await page.locator('[data-student-profile-drawer]').count() === 1, 'closing the report returns to the drawer');
  },

  async S1(page) {
    await page.goto(`${PAGE}&as=student&studentId=910002`, { timeout: 180000 });
    await page.getByText('Log Out').first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(3000);
    const home = await text(page.locator('body'));
    expect('S1', home.includes('Your due date'), 'the dashboard shows the student their own due date');
    expect('S1', !/\b(IEP|504|modification|accommodation|inclusion)\b/i.test(home), 'nothing on the student\'s screen names a program or classification');
    const before = Object.keys(await db(page)).filter((key) => key.startsWith('grades/910002/supportEvidence/') || key.startsWith('grades/910002/engagementMinutes/'));
    await page.getByRole('button', { name: /Continue|Resume|Open|Start/ }).first().click();
    await page.getByRole('button', { name: 'Read aloud' }).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(2000);
    const header = await text(page.locator('body'));
    if (await page.locator('.mathmaster-assignment-header').isVisible()) {
      expect('S1', /Your due date: /.test(header), 'the assignment header shows the individualized due date');
    } else {
      // Phones and portrait tablets hide the assignment header by design (the
      // dashboard above carries the date); Support tools move to the expanded
      // navigator, which the student opens with "Show progress".
      const show = page.getByRole('button', { name: 'Show progress' });
      if (await show.count()) await show.first().click();
      await page.waitForTimeout(600);
    }
    const tools = page.locator('[data-student-support-tools]:visible');
    expect('S1', await tools.count() === 1, `exactly one Support tools panel is reachable (${await tools.count()})`);
    await tools.getByRole('button', { name: /Support tools/ }).click();
    const toolText = await text(tools);
    expect('S1', /Read aloud/.test(toolText) && /Calculator/.test(toolText) && !/accommodat|IEP|modif/i.test(toolText), `neutral Support tools (${toolText})`);
    await page.mouse.move(300, 300);
    await page.mouse.move(340, 320);
    await page.getByRole('button', { name: 'Read aloud' }).first().click();
    await page.waitForTimeout(7000);
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
};

for (const viewport of VIEWPORTS) {
  for (const [name, run] of Object.entries(journeys)) {
    if (ONLY && !ONLY.includes(name)) continue;
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    const label = `${name} @ ${viewport.width}x${viewport.height}`;
    try {
      if (name !== 'S1') {
        await page.goto(PAGE, { timeout: 180000 });
        await page.getByText('Instructor Dashboard').first().waitFor({ timeout: 120000 });
        await page.waitForTimeout(2500);
      }
      const before = findings.length;
      await run(page);
      expect(name, pageErrors.length === 0, `no page errors (${pageErrors.slice(0, 2).join(' | ')})`);
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
