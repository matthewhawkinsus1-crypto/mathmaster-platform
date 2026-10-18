// EXTRA TIME ON THE EXIT TICKET (DECISION D7) — IN THE REAL APP.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/dolExtraTimeJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1366x768,390x844.)
//
// The school is the harness fixture with `&d7=1&p3StartMin=40&p3EndMin=3`
// (fixture.js DOL_EXTRA_TIME): Period 3 ends in three minutes, so today's DOL
// (10 minutes, closing 5 before the bell) closed for the class two minutes
// ago. Student 910001 has the teacher's "extra time" box: 1.5× time on the
// DOL, so their exit ticket closes at the bell. (The fixture's 910002 and
// 910005 already had extra time; 910003 has no profile.)
//
//   X1  the student with extra time: today's DOL is still open on their
//       device, they read "Your exit ticket closes at H:MM — extra time."
//       with THEIR close (the Period 3 bell), not the class's, and the class
//       pack-up banner does not tell them to sign out mid-DOL.
//   X2  a classmate without extra time, at the same moment: the DOL is
//       closed, and the pack-up banner shows.
//   X3  the teacher's Live view lists the students still working with extra
//       time on the DOL — 910001 among them — counting down to the last close.
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/dolExtraTime/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/dolExtraTime');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const VIEWPORTS = (process.env.VIEWPORTS || '1366x768,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

// fixture.js DOL_EXTRA_TIME (not imported: fixture.js pulls in the app's
// browser modules).
const EXTENDED = '910001';
const CLASSMATE = '910003';
const LESSON = 'a-today';
const SCENARIO = 'd7=1&p3StartMin=40&p3EndMin=3&questions=real';
const PACK_UP = /Pack up and return your device/;
const EXTRA_TIME_LINE = /Your exit ticket closes at (\d{1,2}):(\d{2}) — extra time\./;

const findings = [];
const passed = [];
const squash = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const expect = (journey, condition, detail) => {
  if (!condition) findings.push({ journey, detail });
  return Boolean(condition);
};
const bodyText = async (page) => squash(await page.locator('body').innerText());
const shown = (page, pattern) => page.getByText(pattern).filter({ visible: true }).first();
const pathOf = (page) => new URL(page.url()).pathname;

// The Period 3 bell, as the school's schedule says it, in student words ("11:03").
const bellOf = (page) => page.evaluate(() => {
  const schedule = window.__mmHarnessStore.get('settings/classSchedule');
  const today = Object.values(schedule.modifiedSchedules || {})[0];
  const [hour, minute] = String(today.periods['Period 3'].end).split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')}`;
});

const run = async (viewport) => {
  const tag = `${viewport.width}x${viewport.height}`;
  const context = await newSchoolContext(browser, { viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // X3 first: seed the school as the teacher (reset), on Home's live class.
  await page.goto(`${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1&${SCENARIO}`, { timeout: 180_000 });
  await page.getByText('IN SESSION NOW').waitFor({ timeout: 60_000 });
  await page.getByRole('group', { name: 'Classes in session' }).getByRole('button', { name: /Algebra II — Period 3/ }).click().catch(() => {});
  await page.waitForTimeout(1500);
  const bell = await bellOf(page);
  const extendedName = await page.evaluate((id) => window.__mmHarnessStore.get(`grades/${id}`)?.displayName, EXTENDED);
  const classmateName = await page.evaluate((id) => window.__mmHarnessStore.get(`grades/${id}`)?.displayName, CLASSMATE);
  const chip = page.locator('[data-dol-extra-time]').filter({ visible: true }).first();
  if (expect(`X3 ${tag}`, await chip.count(), 'the live view shows no "DOL extra time" timer')) {
    const chipText = squash(await chip.innerText());
    const count = Number(await chip.getAttribute('data-dol-extra-time'));
    expect(`X3 ${tag}`, new RegExp(`^DOL extra time · ${count} students? · \\d+:\\d{2}$`).test(chipText), `the timer reads "${chipText}"`);
    const title = String(await chip.getAttribute('title'));
    expect(`X3 ${tag}`, /still working with extra time/.test(title) && title.includes(extendedName), `it does not name ${extendedName}: ${title}`);
    expect(`X3 ${tag}`, !title.includes(classmateName), `it names ${classmateName}, who has no extra time`);
    await chip.scrollIntoViewIfNeeded();
  }
  await page.screenshot({ path: path.join(ARTIFACTS, `X3-teacher-live-${tag}.png`) });

  // X1 — the student with extra time.
  await page.goto(`${ORIGIN}/assignments/${LESSON}/dol/1?${SCENARIO}&as=student&studentId=${EXTENDED}`, { timeout: 180_000 });
  await shown(page, /[Qq]uestion \d+ of \d+|RESULT SO FAR|Welcome, /).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const studentText = await bodyText(page);
  expect(`X1 ${tag}`, pathOf(page) === `/assignments/${LESSON}/dol/1`, `the DOL did not open for the student with extra time (at ${pathOf(page)})`);
  expect(`X1 ${tag}`, !/time is up|no new submission is allowed/i.test(studentText), 'the student with extra time is told the DOL has closed');
  const match = studentText.match(EXTRA_TIME_LINE);
  expect(`X1 ${tag}`, Boolean(match) && `${match[1]}:${match[2]}` === bell, `expected "Your exit ticket closes at ${bell} — extra time." — read ${match?.[0] || 'no extra-time line'}`);
  const line = page.getByText(EXTRA_TIME_LINE).first();
  if ((await line.count()) > 0) {
    await line.scrollIntoViewIfNeeded();
    const box = await line.boundingBox();
    expect(`X1 ${tag}`, Boolean(box && box.x >= 0 && box.x + box.width <= viewport.width + 1), `the line is clipped sideways: ${JSON.stringify(box)}`);
  }
  expect(`X1 ${tag}`, await page.locator('math-field, input[type="text"], textarea').filter({ visible: true }).count() > 0, 'no answer field: the DOL is not workable');
  expect(`X1 ${tag}`, !PACK_UP.test(studentText), 'the pack-up banner tells a student mid-DOL (on extra time) to sign out');
  await page.screenshot({ path: path.join(ARTIFACTS, `X1-student-extra-time-${tag}.png`) });

  // X2 — a classmate, same moment: the class window.
  await page.goto(`${ORIGIN}/assignments/${LESSON}/dol/1?${SCENARIO}&as=student&studentId=${CLASSMATE}`, { timeout: 180_000 });
  await shown(page, /[Qq]uestion \d+ of \d+|RESULT SO FAR|Welcome, /).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const classmateText = await bodyText(page);
  expect(`X2 ${tag}`, !EXTRA_TIME_LINE.test(classmateText), 'a classmate without extra time reads an extra-time line');
  expect(`X2 ${tag}`, pathOf(page) !== `/assignments/${LESSON}/dol/1` || /time is up|no new submission is allowed/i.test(classmateText),
    `the DOL is still open for a classmate without extra time (${pathOf(page)})`);
  expect(`X2 ${tag}`, PACK_UP.test(classmateText), 'the classmate does not see the class pack-up banner');
  await page.screenshot({ path: path.join(ARTIFACTS, `X2-classmate-${tag}.png`) });

  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);
  expect(`layout ${tag}`, overflow <= 1, `sideways scrolling (${overflow}px)`);
  expect(`errors ${tag}`, errors.length === 0, `page errors: ${errors.join(' | ')}`);
  passed.push(tag);
  await context.close();
};

for (const viewport of VIEWPORTS) {
  try {
    await run(viewport);
  } catch (error) {
    findings.push({ journey: `${viewport.width}x${viewport.height}`, detail: `threw: ${error.stack || error.message}` });
  }
}
await browser.close();

for (const tag of passed) console.log(`ran   ${tag}`);
for (const { journey, detail } of findings) console.log(`FAIL  ${journey}: ${detail}`);
console.log(findings.length ? `\n${findings.length} finding(s).` : '\nAll extra-time DOL journeys passed.');
process.exit(findings.length ? 1 : 0);
