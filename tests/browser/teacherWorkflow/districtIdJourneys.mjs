// CORRECTING A DISTRICT ID TYPED WRONG AT ACCOUNT CREATION — TEACHER TO TEAMS FILE.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/districtIdJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1440x900,390x844.)
//
// The real App.jsx with `firebase/*` replaced by the in-memory fakes — nothing
// can reach a Firebase project. setStudentSisId is faked with the SHARED rules
// the callable runs (functions/shared/studentDistrictId.mjs): digits only, the
// teacher of record, the duplicate rule, an audit entry with the previous ID.
//
// The school is fixture.js with `&district=wrong`: Marisol Testerling
// (invented) was created under the number she typed, 111111. Her real
// district ID is 222222. She has graded work, a PIN, a linked Google account
// and a Classroom match, and last week's lesson already went to TEAMS — and
// was confirmed uploaded — under 111111.
//
//   D1  Student Access: she reads "MathMaster ID 111111", district ID the
//       same; Edit district ID explains what changes and what does not; a
//       number another student answers to is refused, writing nothing; 222222
//       is saved with the confirmation the teacher asked for; only the
//       district ID fields changed, by the callable, never a browser write.
//   D2  A reload still shows 222222 — it is stored, not screen state.
//   D3  Grade Export: last week's lesson reads "District ID corrected";
//       "Download last file" warns that the copy still says 111111; the
//       changes-only update sends 222222 in every section file and says to
//       overwrite; an unexported lesson exports 222222, never 111111.
//   D4  Grade Export's own district ID list: a valid-looking wrong ID is
//       corrected there too; 222222 is refused for a second student.
//   D5  She signs in to the same account and her work is all there.
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/districtId/ (git-ignored).

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

import { DISTRICT_ID_CORRECTION as CASE, TEACHER_EMAIL } from './fixture.js';
import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/districtId');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const BASE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html`;
const VIEWPORTS = (process.env.VIEWPORTS || '1440x900')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const ACCOUNT = CASE.accountId;
const DISTRICT = CASE.districtId;
const LABEL = `${CASE.lastName}, ${CASE.firstName} · ID ${ACCOUNT}`;
const P1 = 'Algebra I — Period 1';
// The only fields setStudentSisId may change on grades/{id}.
const DISTRICT_ID_FIELDS = new Set(['sisStudentId', 'sisStudentIdVerifiedAt', 'sisStudentIdVerifiedBy', 'updatedAt']);

const findings = [];
const passed = [];
const squash = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const text = async (locator) => squash(await locator.innerText());
const expect = (journey, condition, detail) => {
  if (!condition) findings.push({ journey, detail });
  return Boolean(condition);
};
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const store = (page) => page.evaluate(() => Object.fromEntries(JSON.parse(localStorage.getItem('mm-teacher-workflow-harness-db-v1'))));
const stats = (page) => page.evaluate(() => window.__mmHarnessStore?.stats?.() || {});
const shot = (page, name) => page.screenshot({ path: path.join(ARTIFACTS, `${name}-${page.viewportSize().width}.png`), fullPage: false }).catch(() => {});
const sidebar = async (page, name) => {
  await page.locator('nav, aside').getByRole('button', { name: new RegExp(`${name}(\\s*\\(\\d+\\))?$`) }).first().click();
  await settle(page, 1500);
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

// Minimal ZIP reader (stored/deflated entries), as journeys.mjs uses.
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
const csvFiles = (entries) => [...entries.entries()].filter(([name]) => name.endsWith('.csv'));
const download = async (page, click) => {
  const [file] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: file.suggestedFilename(), entries: zipEntries(readFileSync(await file.path())) };
};
const exportFrom = async (page, trigger, onReview = null) => {
  await trigger.click();
  const review = page.locator('.tw-review');
  await review.waitFor();
  await onReview?.(await text(review));
  const file = await download(page, () => review.getByRole('button', { name: 'Download ZIP' }).click());
  await settle(page, 900);
  return file;
};

const accessSection = (page) => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Student sign-in' }) });
const findInAccess = async (page, needle) => {
  await page.getByRole('searchbox', { name: 'Search students' }).fill(needle);
  await settle(page, 400);
  return text(accessSection(page));
};
const exportClass = async (page, name) => {
  await page.getByRole('group', { name: 'Classes' }).getByRole('button', { name, exact: true }).click();
  await settle(page, 600);
};
const exportRow = (page, title) => page.locator('.tw-class-group', { hasText: P1 }).locator('.tw-export-row', { hasText: title });
const statusText = async (page) => text(page.locator('[role="status"]').first()).catch(() => '');

// ---------------------------------------------------------------- the journey

const run = async (page, context, viewport) => {
  const wide = viewport.width >= 900;
  const before = await store(page);
  const accountBefore = before[`grades/${ACCOUNT}`];
  expect('setup', accountBefore?.sisStudentId === ACCOUNT, `the fixture's student starts with district ID ${ACCOUNT} (${accountBefore?.sisStudentId})`);

  // D1 ------------------------------------------------------------------------
  await sidebar(page, 'Student Access');
  const intro = await text(page.locator('body'));
  expect('D1', /Each student has a MathMaster ID — they sign in with it, and all of their work stays attached to it — and a district ID, the only number grade exports to TEAMS use\./.test(intro), 'Student Access says which ID is for what');
  let row = await findInAccess(page, ACCOUNT);
  expect('D1', row.includes(`${CASE.lastName}, ${CASE.firstName} · MathMaster ID ${ACCOUNT}`), `her row names her MathMaster ID (${row.slice(0, 200)})`);
  expect('D1', row.includes('District ID: same as the MathMaster ID'), 'before: her district ID is the same number');
  expect('D1', /PIN set/i.test(row) && /Google linked/i.test(row), 'before: PIN set and Google linked');
  await shot(page, 'D1-access-before');

  const edit = page.getByRole('button', { name: `Edit district ID for ${LABEL}` });
  if (!expect('D1', await edit.count() === 1, '"Edit district ID" is offered on her row')) return;
  await edit.click();
  const form = page.getByRole('form', { name: `Edit district ID for ${LABEL}` });
  await form.waitFor();
  const formText = await text(form);
  for (const phrase of [
    `MathMaster account ID ${ACCOUNT}`, `Current district ID ${ACCOUNT}`,
    'does not create a new MathMaster student', 'does not move, copy or delete any work, grades or history',
    'does not change the student’s MathMaster account ID or how they sign in', 'changes only the number future grade exports use',
  ]) expect('D1', formText.includes(phrase), `the editor says "${phrase}"`);
  const save = form.getByRole('button', { name: 'Save district ID' });
  expect('D1', await save.isDisabled(), 'Save waits for a number');
  await shot(page, 'D1-editor');

  // A number another student answers to is refused — and writes nothing.
  const classmateId = Object.keys(before)
    .filter((key) => /^grades\/\d+$/.test(key) && before[key].classId === CASE.classId && key !== `grades/${ACCOUNT}`)
    .map((key) => key.split('/')[1])
    .sort()[0];
  const input = form.getByRole('textbox', { name: 'Correct district student ID' });
  await input.fill(classmateId);
  await save.click();
  const refusal = await text(form.getByRole('alert')).catch(() => '');
  expect('D1', refusal.includes(`${classmateId} is another MathMaster student's account ID`) && refusal.includes('Nothing was changed'), `a number another student answers to is refused (${refusal})`);
  expect('D1', same((await store(page))[`grades/${ACCOUNT}`], accountBefore), 'the refusal wrote nothing');

  // Letters cannot even be typed; the box keeps digits only.
  await input.fill('22a2-22');
  expect('D1', await input.inputValue() === '22222', 'the box keeps digits only');

  await input.fill(DISTRICT);
  const preview = await text(form).catch(() => '');
  expect('D1', preview.includes(`Future grade exports will use district ID ${DISTRICT} instead of district ID ${ACCOUNT}.`), 'the change is previewed before it is saved');
  await save.click();
  await page.getByRole('status').filter({ hasText: 'District ID updated' }).waitFor({ timeout: 10000 });
  await settle(page, 1200);
  const confirmation = await text(page.getByRole('status').filter({ hasText: 'District ID updated' }));
  expect('D1', confirmation.startsWith(`District ID updated for ${LABEL}. The student’s MathMaster account, work, and grades were not changed. Future grade exports will use ${DISTRICT}.`), `the confirmation (${confirmation.slice(0, 220)})`);
  expect('D1', confirmation.includes(`under old district ID ${ACCOUNT}`), 'the confirmation says what MathMaster cannot undo in TEAMS');
  row = await findInAccess(page, ACCOUNT);
  expect('D1', row.includes(`District ID ${DISTRICT} · MathMaster account ID and district ID differ. Grade exports use the verified district ID.`), `after: the calm "they differ" note (${row.slice(0, 260)})`);
  expect('D1', row.includes(`MathMaster ID ${ACCOUNT}`), 'after: her MathMaster ID is unchanged');
  await shot(page, 'D1-access-after');

  const after = await store(page);
  const account = after[`grades/${ACCOUNT}`] || {};
  expect('D1', after[`grades/${DISTRICT}`] === undefined, `no second student: grades/${DISTRICT} does not exist`);
  expect('D1', account.sisStudentId === DISTRICT && account.sisStudentIdVerifiedBy === TEACHER_EMAIL && account.sisStudentIdVerifiedAt, 'grades/111111 holds district ID 222222, verified by the teacher');
  const changed = [...new Set([...Object.keys(accountBefore), ...Object.keys(account)])]
    .filter((field) => !same(accountBefore[field], account[field]));
  expect('D1', changed.every((field) => DISTRICT_ID_FIELDS.has(field)), `only district ID fields changed on grades/${ACCOUNT} (${changed.join(', ')})`);
  for (const key of [
    `studentCredentials/${ACCOUNT}`, `studentAliases/${ACCOUNT}`, `studentDirectory/${CASE.email}`, `classroomRosterLinks/${CASE.courseId}__${ACCOUNT}`,
  ]) expect('D1', same(after[key], before[key]) && after[key], `${key.split('/')[0]} is untouched`);
  const otherChanges = Object.keys(before)
    .filter((key) => key.startsWith('grades/') && key !== `grades/${ACCOUNT}` && !same(before[key], after[key]));
  expect('D1', otherChanges.length === 0, `no other student changed (${otherChanges.slice(0, 4).join(', ')})`);
  const audits = Object.values(after).filter((value) => value?.action === 'sis_student_id_set' && value?.target === ACCOUNT);
  expect('D1', audits.length === 1 && audits[0].details?.previous?.sisStudentId === ACCOUNT && audits[0].details?.next?.sisStudentId === DISTRICT, 'one audit entry, with the previous and the new district ID');
  const harness = await stats(page);
  expect('D1', (harness.callables?.setStudentSisId || 0) === 2, `the change went through setStudentSisId (${harness.callables?.setStudentSisId} calls: one refused, one saved)`);
  const browserWrites = (harness.clientWrites || []).filter((entry) => /sisStudentId/.test(JSON.stringify(entry.payload || '')));
  expect('D1', browserWrites.length === 0, `the browser never wrote a district ID itself (${browserWrites.length})`);

  // D2 ------------------------------------------------------------------------
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByText('IN SESSION NOW').waitFor({ timeout: 30000 });
  await settle(page, 800);
  await sidebar(page, 'Student Access');
  row = await findInAccess(page, ACCOUNT);
  expect('D2', row.includes(`District ID ${DISTRICT}`) && row.includes(`MathMaster ID ${ACCOUNT}`), `after a reload Student Access still shows district ID ${DISTRICT}`);

  // D3 ------------------------------------------------------------------------
  await sidebar(page, 'Grade Export');
  await exportClass(page, P1);
  const lastWeek = exportRow(page, 'Linear Functions — Review');
  const lastWeekText = await text(lastWeek);
  // Four section rows moved (one per file); no grade did — and it says so.
  expect('D3', /Changed since export · 4/.test(lastWeekText) && /District ID corrected for 1 student since .+ — export again so TEAMS gets their grades under the corrected ID\./.test(lastWeekText), `last week's lesson says why it changed (${lastWeekText.slice(0, 400)})`);
  expect('D3', !/grades? changed or newly finalized/.test(lastWeekText), 'an unchanged grade is not called a changed one');
  await shot(page, 'D3-export-before');

  const copy = await download(page, () => lastWeek.getByRole('button', { name: 'Download last file' }).click());
  await settle(page, 600);
  expect('D3', csvFiles(copy.entries).every(([, body]) => body.includes(`${ACCOUNT},`)), 'the downloaded copy is the exact old file (still 111111)');
  const copyMessage = await statusText(page);
  expect('D3', copyMessage.includes('This copy still uses the district ID it was made with') && copyMessage.includes(`district ID ${ACCOUNT} → ${DISTRICT}`), `the teacher is warned about the old copy (${copyMessage.slice(0, 200)})`);

  const update = await exportFrom(page, lastWeek.getByRole('button', { name: /Export changes/ }), (review) => {
    expect('D3', new RegExp(`Corrected since the last export for 1 student: (?:${CASE.firstName} ${CASE.lastName}|${CASE.lastName}, ${CASE.firstName}) \\(district ID ${ACCOUNT} → ${DISTRICT}\\)\\. This file sends their grades under the corrected ID\\.`).test(review), `the review step names the correction (${review.slice(-400)})`);
    expect('D3', /Answer YES to “Overwrite existing grades\?”/.test(review), 'the update overwrites in TEAMS');
  });
  const updateCsvs = csvFiles(update.entries);
  expect('D3', updateCsvs.length === 4, `four section files (${updateCsvs.map(([name]) => name).join(', ')})`);
  updateCsvs.forEach(([name, body]) => {
    const lines = body.trim().split(/\r?\n/);
    expect('D3', lines.length === 1 && new RegExp(`^${DISTRICT},\\d+$`).test(lines[0]), `${name}: only her row, under ${DISTRICT} (${JSON.stringify(lines)})`);
  });
  expect('D3', update.name.endsWith('_UPDATE.zip'), `an update package (${update.name})`);
  expect('D3', (update.entries.get('MANIFEST.txt') || '').includes(`District ID corrected since the last export: ${ACCOUNT} → ${DISTRICT}`), 'the manifest records the correction');

  const slope = await exportFrom(page, exportRow(page, 'Slope Foundations').getByRole('button', { name: /^Export$/ }));
  const slopeLines = csvFiles(slope.entries).flatMap(([, body]) => body.trim().split(/\r?\n/));
  expect('D3', slopeLines.filter((line) => line.startsWith(`${DISTRICT},`)).length === 4, `an unexported lesson sends ${DISTRICT} in all four section files`);
  expect('D3', !slopeLines.some((line) => line.startsWith(`${ACCOUNT},`)), `and never ${ACCOUNT}`);
  const snapshots = Object.entries(await store(page)).filter(([key]) => key.startsWith('gradeTransferSnapshots/')).map(([, value]) => value);
  const hers = snapshots.flatMap((snapshot) => (snapshot.rows || []).filter((entry) => entry.studentId === ACCOUNT).map((entry) => entry.sisStudentId));
  expect('D3', hers.filter((value) => value === DISTRICT).length === 8 && hers.filter((value) => value === ACCOUNT).length === 4, `export history: Monday's 4 files keep 111111, the 8 new ones say 222222 (${hers.join(',')})`);
  await shot(page, 'D3-export-after');

  // D4 ------------------------------------------------------------------------
  const list = page.locator('details[data-district-id-list]');
  await list.locator('summary').click();
  await settle(page, 300);
  const listText = await text(list);
  expect('D4', listText.includes(`District ID ${DISTRICT} · MathMaster account ID and district ID differ.`), 'the district ID list shows her corrected ID');
  const other = Object.keys(before)
    .filter((key) => /^grades\/\d+$/.test(key) && before[key].classId === CASE.classId && key !== `grades/${ACCOUNT}` && key !== `grades/${classmateId}`)
    .map((key) => key.split('/')[1])
    .sort()[0];
  const otherLabel = `${before[`grades/${other}`].lastName}, ${before[`grades/${other}`].firstName} · ID ${other}`;
  await list.getByRole('button', { name: `Edit district ID for ${otherLabel}` }).click();
  const otherForm = page.getByRole('form', { name: `Edit district ID for ${otherLabel}` });
  await otherForm.waitFor();
  const otherBefore = (await store(page))[`grades/${other}`];
  await otherForm.getByRole('textbox', { name: 'Correct district student ID' }).fill(DISTRICT);
  await otherForm.getByRole('button', { name: 'Save district ID' }).click();
  await settle(page, 800);
  const duplicate = await text(otherForm.getByRole('alert')).catch(() => '');
  expect('D4', duplicate.includes(`District ID ${DISTRICT} already belongs to another MathMaster student`) && !duplicate.includes(CASE.firstName), `${DISTRICT} is refused for a second student, naming no one (${duplicate})`);
  expect('D4', same((await store(page))[`grades/${other}`], otherBefore), 'the refusal wrote nothing');
  const corrected = `33${other.slice(2)}`;
  await otherForm.getByRole('textbox', { name: 'Correct district student ID' }).fill(corrected);
  await otherForm.getByRole('button', { name: 'Save district ID' }).click();
  await page.getByRole('status').filter({ hasText: 'District ID updated' }).waitFor({ timeout: 10000 });
  await settle(page, 1200);
  expect('D4', (await statusText(page)).includes(`Future grade exports will use ${corrected}.`), 'Grade Export corrects a valid-looking wrong ID too');
  expect('D4', (await store(page))[`grades/${other}`]?.sisStudentId === corrected, `grades/${other} holds ${corrected}`);
  expect('D4', /District ID corrected for 1 student since/.test(await text(exportRow(page, 'Slope Foundations'))), 'the exported lesson now flags that correction');
  await shot(page, 'D4-district-list');

  // Nothing on these screens is wider than the screen.
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
  expect('D4', overflow <= 1, `no sideways scrolling at ${viewport.width}px (${overflow}px)`);

  // D5 ------------------------------------------------------------------------
  if (!wide) return;
  const studentPage = await context.newPage();
  const studentErrors = [];
  studentPage.on('pageerror', (error) => studentErrors.push(error.message));
  await studentPage.goto(`${BASE}?as=student&studentId=${ACCOUNT}`, { timeout: 180000 });
  await studentPage.getByText('Log Out').first().waitFor({ timeout: 120000 });
  await settle(studentPage, 2500);
  const home = await text(studentPage.locator('body'));
  expect('D5', home.includes(`Welcome, ${CASE.firstName} ${CASE.lastName}`), `she signs in to the same account (${home.slice(0, 160)})`);
  // Her graded work is all still hers: My Grades lists both lessons, graded.
  await studentPage.getByRole('button', { name: /^Grades$/ }).first().click();
  await settle(studentPage, 1500);
  const grades = await text(studentPage.locator('body'));
  expect('D5', /Slope Foundations .*?\d+% GRADED/.test(grades) && /Linear Functions — Review .*?\d+% GRADED/.test(grades), `her graded work is all there (${grades.slice(0, 300)})`);
  expect('D5', !home.includes(DISTRICT) && !grades.includes(DISTRICT), 'her own screens do not show the district ID');
  expect('D5', studentErrors.length === 0, `no page errors on her screen (${studentErrors.slice(0, 2).join(' | ')})`);
  await shot(studentPage, 'D5-student');
  await studentPage.close();
};

for (const viewport of VIEWPORTS) {
  const context = await newSchoolContext(browser, { viewport, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const unimplemented = watchUnimplementedCallables(page);
  const label = `district-id@${viewport.width}`;
  const before = findings.length;
  try {
    await page.goto(`${BASE}?reset=1&district=wrong`, { waitUntil: 'domcontentloaded' });
    await page.getByText('IN SESSION NOW').waitFor({ timeout: 30000 });
    await settle(page, 800);
    await run(page, context, viewport);
    expect(label, !unimplemented().length, `reached a callable the harness does not implement: ${unimplemented().join(', ')}`);
  } catch (error) {
    findings.push({ journey: label, detail: `stopped: ${error.message.split('\n')[0]}` });
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
console.log('All district ID journeys passed.');
