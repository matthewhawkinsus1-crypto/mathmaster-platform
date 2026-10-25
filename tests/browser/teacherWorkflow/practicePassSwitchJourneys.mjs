// THE "ALLOW PRACTICE PASSES" SWITCH, IN THE REAL ASSIGNMENT REVIEW (LC23).
//
//   TEACHER_HARNESS_PORT=5188 node_modules/.bin/vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/practicePassSwitchJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN, PLAYWRIGHT_MODULE and CHROMIUM_PATH as in
//    journeys.mjs; DEVICES=desktop,phone.)
//
// A teacher imports a small lesson through the real creator and opens Review.
// On the Delivery step there is a "Practice Passes" checkbox, ticked, in the
// words the reward catalog uses. Unticked, the lesson is saved to the Library,
// and the stored assignment carries exactly `rewardPolicy.practicePassEligible:
// false` (the field the server and the wallet already read) and nothing else
// of the policy. Then, through the real "Review / Edit Setup":
//
//   - the saved assignment opens with the box UNTICKED (the stored choice, not
//     the default), saving it ticked again removes the "no" (no `false`, and no
//     explicit "yes" written in its place), and no second copy is created;
//   - unticking it again and saving writes the "no" again;
//   - saving without touching the box leaves the stored policy exactly as it is.
//
// Every device checks the box is a real tap target (at least 44px), that the
// switch fits the review's width and that the page does not scroll sideways.
// (At phone width the Delivery step's "Question versions by section" fieldset
// is wider than the screen, and was before the switch existed: the review
// scrolls sideways there, so the switch is measured by itself.) The page is the
// app with `firebase/*` replaced by in-memory fakes: nothing can reach a
// Firebase project.
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/practicePassSwitch/ (git-ignored).

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';
import { REWARD_DEFINITIONS } from '../../../functions/shared/rewardGrants.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/practicePassSwitch');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1`;
const MIN_TAP = 44;
// Every change to the review's draft re-runs the whole Pre-Flight on the page's
// main thread (see dol2ReviewHonorsJourneys.mjs): a wait for that work gets that
// work's time, as a bound that is never reached on a quiet machine.
const PREFLIGHT_MS = 300_000;

const LESSON_NAME = 'L1_Day1_Interval_Domain_Range.json';
const LESSON_TEXT = readFileSync(path.join(repo, 'teacher-import-jsons/algebra2-honors-module1', LESSON_NAME), 'utf8');
const LESSON_TITLE = JSON.parse(LESSON_TEXT).assignment.title;

const DEVICES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
].filter((device) => !process.env.DEVICES || process.env.DEVICES.split(',').includes(device.name));

const findings = [];
const passed = [];
const expect = (label, condition, detail) => {
  if (!condition) findings.push({ label, detail });
  return Boolean(condition);
};
const textOf = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();
const until = async (page, predicate, arg, timeout = 30000) => page.waitForFunction(predicate, arg, { timeout });

const reviewDialog = (page) => page.locator('[aria-label="Lesson pre-flight review"]');
const assignmentPaths = (page) => page.evaluate(() => window.__mmHarnessStore.paths('assignments/'));
const storedAssignment = (page, pathName) => page.evaluate((target) => window.__mmHarnessStore.get(target), pathName);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const goToStep = async (page, label) => {
  await reviewDialog(page).getByRole('navigation', { name: 'Review steps' }).getByRole('button', { name: new RegExp(label) }).click();
  await page.waitForTimeout(250);
};

const passSwitch = (page) => reviewDialog(page).locator('[data-preflight-practice-passes]');
const passBox = (page) => passSwitch(page).locator('input[type="checkbox"]');

// The Delivery step, with the switch in view; what it must look and be like.
const openSwitch = async (page, label) => {
  await goToStep(page, 'Delivery');
  await passSwitch(page).waitFor({ timeout: PREFLIGHT_MS });
  await passSwitch(page).scrollIntoViewIfNeeded();
  const seen = await page.evaluate(() => {
    const mine = document.querySelector('[data-preflight-practice-passes]');
    const box = mine?.querySelector('input[type="checkbox"]');
    const row = box?.closest('label');
    const scroller = document.querySelector('[data-preflight-scroll]');
    const limit = scroller.getBoundingClientRect().right;
    // Anything of the switch's own that reaches past the review's right edge.
    const cutOff = mine ? [mine, ...mine.querySelectorAll('*')].filter((element) => element.getBoundingClientRect().right > limit + 1).length : -1;
    return {
      rowHeight: row ? Math.round(row.getBoundingClientRect().height) : 0,
      cutOff,
      pageOverflow: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
    };
  });
  expect(label, seen.rowHeight >= MIN_TAP, `the box's row is a tap target (${seen.rowHeight}px)`);
  // The Delivery step's "Question versions by section" fieldset is wider than a
  // phone (pre-existing, not this switch's), so the switch is measured by itself.
  expect(label, seen.cutOff === 0, `the switch fits inside the review's width (${seen.cutOff} of its parts reach past the right edge)`);
  expect(label, seen.pageOverflow <= 1, `no sideways scrolling on the page (${seen.pageOverflow}px)`);
};

// The primary button, wherever this device keeps it.
const saveButton = async (page, device, names) => {
  if (device.name === 'phone') {
    await goToStep(page, 'Check');
    return reviewDialog(page).locator('footer').getByRole('button', { name: names.phone });
  }
  return reviewDialog(page).locator('footer').getByRole('button', { name: names.desktop });
};

const openSetupOf = async (page, title) => {
  // A lesson saved to the Library sits in the folded "Library copies" group.
  const menu = page.getByRole('button', { name: `More actions for ${title}` }).first();
  if (!(await menu.isVisible().catch(() => false))) {
    const group = page.locator('summary', { hasText: 'Library copies' }).first();
    await group.scrollIntoViewIfNeeded();
    if (!(await group.evaluate((summary) => summary.parentElement.open))) await group.click();
  }
  await menu.scrollIntoViewIfNeeded();
  await menu.click();
  await page.getByRole('menuitem', { name: 'Review / Edit Setup' }).first().click();
  await reviewDialog(page).waitFor({ timeout: PREFLIGHT_MS });
};

// Save Setup, and wait until the stored assignment is no longer what it was.
const saveSetup = async (page, device, pathName, before) => {
  await (await saveButton(page, device, { desktop: /^(Save Setup|Saving…)$/, phone: /^(Save Setup|Saving…)$/ })).click({ timeout: PREFLIGHT_MS });
  await reviewDialog(page).waitFor({ state: 'detached', timeout: PREFLIGHT_MS });
  await until(page, ([target, was]) => JSON.stringify(window.__mmHarnessStore.get(target)) !== was, [pathName, JSON.stringify(before)], 60000).catch(() => {});
  return storedAssignment(page, pathName);
};

const journey = async (page, device, label) => {
  // IMPORT the lesson through the real creator; Review opens.
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.getByText('IN SESSION NOW').waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
  await page.locator('nav, aside').getByRole('button', { name: /Assignments$/ }).first().click();
  const creator = page.locator('summary', { hasText: 'Create and Assign' }).first();
  await creator.waitFor({ timeout: 20000 });
  if (!(await creator.evaluate((summary) => summary.parentElement.open))) await creator.click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: LESSON_NAME, mimeType: 'application/json', buffer: Buffer.from(LESSON_TEXT) });
  await reviewDialog(page).waitFor({ timeout: PREFLIGHT_MS });

  // THE SWITCH: on the Delivery step, ticked, in the catalog's words.
  await openSwitch(page, `${label} new`);
  expect(label, (await passSwitch(page).count()) === 1, 'there is one Practice Passes switch');
  expect(label, await passBox(page).isChecked(), 'passes are allowed by default');
  const words = await textOf(passSwitch(page));
  expect(label, words.includes(REWARD_DEFINITIONS.practicePass.teacherDescription), `it says what a pass is in the catalog's words (${words.slice(0, 200)})`);
  expect(label, words.includes(REWARD_DEFINITIONS.practicePass.gradeEffect), 'and what it does to the grade, in the catalog\'s words');
  await page.screenshot({ path: path.join(ARTIFACTS, `${label}-1-switch-on.png`), fullPage: false });

  // UNTICK, and save the lesson to the Library.
  await passBox(page).uncheck({ timeout: PREFLIGHT_MS });
  expect(label, !(await passBox(page).isChecked()), 'the box can be unticked');
  await page.screenshot({ path: path.join(ARTIFACTS, `${label}-2-switch-off.png`), fullPage: false });
  const before = await assignmentPaths(page);
  await (await saveButton(page, device, { desktop: /^(Save to Library|Saving…)$/, phone: /^(Save|Saving…)$/ })).click({ timeout: PREFLIGHT_MS });
  await reviewDialog(page).waitFor({ state: 'detached', timeout: PREFLIGHT_MS });
  await until(page, (count) => window.__mmHarnessStore.paths('assignments/').length > count, before.length, PREFLIGHT_MS).catch(() => {});
  const after = await assignmentPaths(page);
  const added = after.filter((entry) => !before.includes(entry));
  expect(label, added.length === 1, `one assignment was saved (${added.length})`);
  const pathName = added[0];
  const saved = await storedAssignment(page, pathName);
  expect(label, saved?.title === LESSON_TITLE, `it is the lesson that was imported (${saved?.title})`);
  expect(label, same(saved?.rewardPolicy, { practicePassEligible: false }), `the stored policy is exactly the "no" (${JSON.stringify(saved?.rewardPolicy)})`);

  // REVIEW / EDIT SETUP: the stored choice is what opens, not the default.
  await openSetupOf(page, LESSON_TITLE);
  await openSwitch(page, `${label} edit 1`);
  expect(label, !(await passBox(page).isChecked()), 'the saved assignment opens with passes off, as it was saved');
  await page.screenshot({ path: path.join(ARTIFACTS, `${label}-3-edit-off.png`), fullPage: false });

  // Saving without touching the box leaves the policy exactly as it is.
  const untouched = await saveSetup(page, device, pathName, saved);
  expect(label, same(untouched?.rewardPolicy, { practicePassEligible: false }), `saving without touching the box leaves the "no" (${JSON.stringify(untouched?.rewardPolicy)})`);

  // TICK it again and save: the "no" is removed, and nothing is written in its place.
  await openSetupOf(page, LESSON_TITLE);
  await openSwitch(page, `${label} edit 2`);
  expect(label, !(await passBox(page).isChecked()), 'it still opens with passes off');
  await passBox(page).check({ timeout: PREFLIGHT_MS });
  expect(label, await passBox(page).isChecked(), 'the box can be ticked');
  const allowed = await saveSetup(page, device, pathName, untouched);
  expect(label, allowed?.rewardPolicy?.practicePassEligible === undefined, `turning passes back on removes the "no" (${JSON.stringify(allowed?.rewardPolicy)})`);
  expect(label, allowed?.rewardPolicy === undefined || same(allowed.rewardPolicy, {}), `and writes no "yes" in its place (${JSON.stringify(allowed?.rewardPolicy)})`);
  expect(label, allowed?.title === LESSON_TITLE && (await assignmentPaths(page)).length === after.length, 'the same assignment was updated, not copied');

  // UNTICK it again and save: the "no" is written again.
  await openSetupOf(page, LESSON_TITLE);
  await openSwitch(page, `${label} edit 3`);
  expect(label, await passBox(page).isChecked(), 'it now opens with passes on');
  await passBox(page).uncheck({ timeout: PREFLIGHT_MS });
  const off = await saveSetup(page, device, pathName, allowed);
  expect(label, off?.rewardPolicy?.practicePassEligible === false, `unticking it again writes the "no" (${JSON.stringify(off?.rewardPolicy)})`);
  await page.screenshot({ path: path.join(ARTIFACTS, `${label}-4-saved-again.png`), fullPage: false });
};

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });
const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

for (const device of DEVICES) {
  const label = `practice-pass-switch@${device.name}`;
  const context = await newSchoolContext(browser, { viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const unimplemented = watchUnimplementedCallables(page);
  const before = findings.length;
  try {
    await journey(page, device, label);
    expect(label, !unimplemented().length, `reached a callable the harness does not implement: ${unimplemented().join(', ')}`);
  } catch (error) {
    findings.push({ label, detail: `stopped: ${error.message.split('\n')[0]}` });
    await page.screenshot({ path: path.join(ARTIFACTS, `${label}-stopped.png`), fullPage: false }).catch(() => {});
  }
  errors.forEach((message) => findings.push({ label, detail: `page error: ${message}` }));
  if (findings.length === before) passed.push(label);
  await context.close();
}
await browser.close();

console.log(`passed: ${passed.join(', ') || 'none'}`);
if (findings.length) {
  console.log(`\n${findings.length} finding(s):`);
  findings.forEach(({ label, detail }) => console.log(`  [${label}] ${detail}`));
  process.exit(1);
}
console.log('The Practice Passes switch is saved, reopened and changed through the real Assignment Review on every device.');
