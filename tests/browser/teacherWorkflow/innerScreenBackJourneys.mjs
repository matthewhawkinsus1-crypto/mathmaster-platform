// THE SCREENS INSIDE A SCREEN: BACK, FORWARD AND A RELOAD STAY WHERE THE STUDENT IS (NV14).
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/innerScreenBackJourneys.mjs
//
//   (Also on the accessibility App harness, which shares this config.
//    TEACHER_HARNESS_ORIGIN=<origin> if not http://127.0.0.1:5188;
//    PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults are not installed; VIEWPORTS=1366x768,390x844 —
//    Chromebook, phone; ONLY=recovery,home,practice,corrections,review,tests.)
//
// The real App.jsx with `firebase/*` replaced by the in-memory fakes, opened
// at the harness origin's own paths (as appUrlJourneys.mjs does), so a reload
// is a real arrival. `&recovery=p0` gives Theo (910975) a DOL Recovery under
// way (recoveryFixture.js); `&innerScreens=1` gives his class a Test Cycle in
// Corrections and him two practice tests (innerScreensFixture.js).
//
// A Recovery opens over its result page, Corrections and the Test review
// inside the Test Cycle card, a practice test inside Tests & Exams. Before
// NV14 none had a history entry: Back left the whole page or card, and a
// reload lost the place.
//
//   recovery     Grades → result → Continue the Recovery. Back: the result
//                page, its panel and address. Forward: the Recovery. A reload:
//                still the Recovery. Back: the result page; Back: Grades.
//   home         The same Recovery opened from Home: Back lands on its result
//                page, not Home; Back again, Home.
//   practice     A locked Recovery's practice ("Practice for …", Theo has no
//                try yet on Two-Step Equations), opened from Home: Back, its
//                result page; Forward and a reload, its practice again — the
//                mode the panel offers, not a second try.
//   corrections  Assignments → the Test Cycle card → Corrections. Back: the
//                card, its heading focused, its address. Forward: Corrections.
//                A reload: still Corrections. Back: the card; Back: Assignments.
//   review       "Review my Test" from Corrections: Back returns to them, their
//                heading focused. From the card: Back returns to the card.
//   tests        Tests & Exams: Resume the SAT (listed second), then reload on
//                its start screen. The list comes back with the SAT first in
//                its group and its Resume focused — and nothing resumed by
//                itself: no full screen, no test. Enter opens it again.
//
// Every journey: no page errors, no callable the harness lacks, nothing
// scrolls sideways. Exit code 1 on any failure. Screenshots in
// tests/browser/artifacts/innerScreenBack/ (git-ignored).

import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';
import {
  CROSS_DEVICE_STUDENT_ID,
  RECOVERY_CROSS_DEVICE_ASSIGNMENT_ID,
  RECOVERY_CROSS_DEVICE_ASSIGNMENT_TITLE,
  RECOVERY_SHARED_ASSIGNMENT_ID,
  RECOVERY_SHARED_ASSIGNMENT_TITLE,
} from './recoveryFixture.js';
import {
  INNER_SCREENS_REVIEW_TITLE,
  INNER_SCREENS_SAT_TITLE,
  INNER_SCREENS_TEST_CYCLE_ID,
  INNER_SCREENS_TEST_CYCLE_TITLE,
} from './innerScreensFixture.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/innerScreenBack');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const VIEWPORTS = (process.env.VIEWPORTS || '1366x768,390x844')
  .split(',').map((entry) => entry.split('x').map(Number)).map(([width, height]) => ({ width, height }));
const QUERY = `recovery=p0&innerScreens=1&as=student&studentId=${CROSS_DEVICE_STUDENT_ID}`;
const RESULT_PATH = `/assignments/${RECOVERY_CROSS_DEVICE_ASSIGNMENT_ID}/results`;
const CARD_PATH = `/test-cycle/${INNER_SCREENS_TEST_CYCLE_ID}`;
// The workspace's background syncs are not faked by this harness (appUrlJourneys.mjs).
const BACKGROUND_CALLABLES = ['ingestStudentSubmissions', 'reconcileAssignmentActivityProjection', 'resolveWeeklyPathGoalSnapshot'];

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const failures = [];
let passed = 0;
const check = (where, ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${where}: ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (ok) passed += 1;
  else failures.push(`${where}: ${label}${detail ? ` (${detail})` : ''}`);
  return Boolean(ok);
};
const wanted = (name) => !ONLY || ONLY.includes(name);
const tagOf = (page) => `${page.viewportSize().width}x${page.viewportSize().height}`;
const shot = (page, name) => page.screenshot({ path: path.join(ARTIFACTS, `${name}-${tagOf(page)}.png`), fullPage: true });

/* ------------------------------------------------------------- devices */

const openDevice = async (where, viewport, firstPath) => {
  const context = await newSchoolContext(browser, { viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !/Download the React DevTools|favicon|not implemented in the harness/i.test(text)) errors.push(`console.error: ${text.slice(0, 300)}`);
  });
  const unimplemented = watchUnimplementedCallables(page);
  await page.goto(`${ORIGIN}${firstPath}?reset=1&${QUERY}`, { timeout: 300_000 });
  await page.getByText('Log Out').first().waitFor({ timeout: 180_000 });
  await page.waitForTimeout(800);
  return { where, context, page, errors, unimplemented };
};

const closeDevice = async (device) => {
  const { where, page } = device;
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(where, overflow <= 1, 'nothing scrolls sideways', `${overflow}px`);
  check(where, device.errors.length === 0, 'no page errors', device.errors.slice(0, 3).join(' | '));
  const unexpected = device.unimplemented().filter((name) => !BACKGROUND_CALLABLES.includes(name));
  check(where, unexpected.length === 0, 'every callable reached is implemented', unexpected.join(', '));
  await device.context.close();
};

/* ------------------------------------------------------------- reading the screen */

// What is on screen, read from the page, never from the history entry.
const screen = (page) => page.evaluate(() => {
  const visible = (element) => Boolean(element && element.getClientRects().length);
  const headings = [...document.querySelectorAll('h1')].filter(visible).map((element) => element.textContent.trim());
  return {
    path: window.location.pathname,
    headings,
    runner: [...document.querySelectorAll('[data-recovery-runner]')].filter(visible).map((element) => element.getAttribute('data-recovery-runner'))[0] || null,
    recoveryPanel: visible(document.querySelector('[data-section-recovery-panel]')),
    card: visible(document.querySelector('[data-test-cycle-stage]')),
    corrections: visible(document.querySelector('[data-test-cycle-corrections="working"]')),
    focused: (document.activeElement?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    focusedTag: document.activeElement?.tagName || null,
    fullscreen: Boolean(document.fullscreenElement),
  };
});
// Settle after a navigation: wait for what the screen should show, then a beat.
const settle = async (page, locator, ms = 30_000) => {
  await locator.first().waitFor({ timeout: ms }).catch(() => {});
  await page.waitForTimeout(600);
};
const resultPage = (page) => page.locator('[data-section-recovery-panel]');
const runner = (page) => page.locator('[data-recovery-runner="assessment"]');
const card = (page) => page.locator('[data-test-cycle-stage="corrections"]');
const corrections = (page) => page.locator('[data-test-cycle-corrections="working"]');
const reviewScreen = (page) => page.getByRole('heading', { level: 1, name: INNER_SCREENS_REVIEW_TITLE });

const onResultPage = async (where, page, label) => {
  const now = await screen(page);
  check(where, now.recoveryPanel && !now.runner, `${label}: the result page, its Recovery panel and no Recovery`, JSON.stringify(now));
  check(where, now.headings.includes(RECOVERY_CROSS_DEVICE_ASSIGNMENT_TITLE), `${label}: titled ${RECOVERY_CROSS_DEVICE_ASSIGNMENT_TITLE}`, now.headings.join(' | '));
  check(where, now.path === RESULT_PATH, `${label}: at ${RESULT_PATH}`, now.path);
};
const inRecovery = async (where, page, label) => {
  const now = await screen(page);
  check(where, now.runner === 'assessment' && !now.recoveryPanel, `${label}: the Recovery`, JSON.stringify(now));
  check(where, now.path === RESULT_PATH, `${label}: the result page's address`, now.path);
};
const onCard = async (where, page, label, { focus = true } = {}) => {
  const now = await screen(page);
  check(where, now.card && !now.corrections, `${label}: the Test Cycle card`, JSON.stringify(now));
  check(where, now.path === CARD_PATH, `${label}: at ${CARD_PATH}`, now.path);
  if (focus) check(where, now.focused === INNER_SCREENS_TEST_CYCLE_TITLE, `${label}: the card's heading has focus`, now.focused);
};
const inCorrections = async (where, page, label) => {
  const now = await screen(page);
  check(where, now.corrections && !now.card, `${label}: Corrections`, JSON.stringify(now));
  check(where, now.path === CARD_PATH, `${label}: the card's address`, now.path);
};

/* ------------------------------------------------------------- journeys */

const journeys = {
  async recovery(viewport) {
    const device = await openDevice(`recovery ${viewport.width}x${viewport.height}`, viewport, '/grades');
    const { where, page } = device;
    await settle(page, page.getByText(/My Grades/));
    const row = page.locator('article').filter({ has: page.getByRole('heading', { name: RECOVERY_CROSS_DEVICE_ASSIGNMENT_TITLE, exact: true }) }).first();
    await row.getByRole('button', { name: 'See results' }).click();
    await settle(page, resultPage(page));
    await onResultPage(where, page, 'from Grades');
    await page.locator('[data-section-recovery-panel] [data-recovery-section="dol"]').getByRole('button', { name: 'Continue Exit ticket Recovery' }).click();
    await settle(page, runner(page));
    await inRecovery(where, page, 'Continue');
    await shot(page, 'recovery-1-open');
    await page.goBack();
    await settle(page, resultPage(page));
    await onResultPage(where, page, 'Back from the Recovery');
    await page.goForward();
    await settle(page, runner(page));
    await inRecovery(where, page, 'Forward');
    await page.reload();
    await settle(page, runner(page), 60_000);
    await inRecovery(where, page, 'a reload inside the Recovery');
    await shot(page, 'recovery-2-reloaded');
    await page.goBack();
    await settle(page, resultPage(page));
    await onResultPage(where, page, 'Back after the reload');
    await page.goBack();
    await settle(page, page.getByText(/My Grades/));
    const grades = await screen(page);
    check(where, grades.path === '/grades' && grades.headings.includes('My Grades'), 'Back again: Grades, where the student came from', JSON.stringify(grades));
    await closeDevice(device);
  },

  async home(viewport) {
    const device = await openDevice(`home ${viewport.width}x${viewport.height}`, viewport, '/');
    const { where, page } = device;
    await settle(page, page.getByText(/Welcome, /));
    await page.getByRole('button', { name: 'Continue Exit ticket Recovery' }).first().click();
    await settle(page, runner(page));
    await inRecovery(where, page, 'Continue, from Home');
    await page.goBack();
    await settle(page, resultPage(page));
    await onResultPage(where, page, 'Back from a Recovery opened on Home');
    await page.goBack();
    await settle(page, page.getByText(/Welcome, /));
    const home = await screen(page);
    check(where, home.path === '/' && home.headings.some((heading) => heading.startsWith('Welcome,')), 'Back again: Home', JSON.stringify(home));
    await closeDevice(device);
  },

  async practice(viewport) {
    const device = await openDevice(`practice ${viewport.width}x${viewport.height}`, viewport, '/');
    const { where, page } = device;
    const practicePath = `/assignments/${RECOVERY_SHARED_ASSIGNMENT_ID}/results`;
    const practising = page.locator('[data-recovery-runner="practice"]');
    const inPractice = async (label) => {
      const now = await screen(page);
      check(where, now.runner === 'practice' && !now.recoveryPanel, `${label}: the Recovery's practice`, JSON.stringify(now));
      check(where, now.path === practicePath, `${label}: its result page's address`, now.path);
    };
    const onItsResultPage = async (label) => {
      const now = await screen(page);
      check(where, now.recoveryPanel && !now.runner && now.headings.includes(RECOVERY_SHARED_ASSIGNMENT_TITLE), `${label}: its result page`, JSON.stringify(now));
    };
    await settle(page, page.getByText(/Welcome, /));
    await page.locator('article').filter({ hasText: RECOVERY_SHARED_ASSIGNMENT_TITLE }).getByRole('button', { name: 'Practice for Exit ticket Recovery' }).first().click();
    await settle(page, practising);
    await inPractice('Practice for …, from Home');
    await page.goBack();
    await settle(page, resultPage(page));
    await onItsResultPage('Back from the practice');
    await page.goForward();
    await settle(page, practising);
    await inPractice('Forward');
    await page.reload();
    await settle(page, practising, 60_000);
    await inPractice('a reload inside the practice');
    await shot(page, 'practice-1-reloaded');
    await page.goBack();
    await settle(page, resultPage(page));
    await onItsResultPage('Back after the reload');
    await closeDevice(device);
  },

  async corrections(viewport) {
    const device = await openDevice(`corrections ${viewport.width}x${viewport.height}`, viewport, '/assignments');
    const { where, page } = device;
    await settle(page, page.getByText(INNER_SCREENS_TEST_CYCLE_TITLE));
    const row = page.getByText(INNER_SCREENS_TEST_CYCLE_TITLE, { exact: true }).first().locator('xpath=ancestor::*[.//button][1]');
    await row.getByRole('button').first().click();
    await settle(page, card(page));
    await onCard(where, page, 'opened from Assignments', { focus: false });
    await page.getByRole('button', { name: /^(Start|Continue) Corrections$/ }).click();
    await settle(page, corrections(page));
    await inCorrections(where, page, 'Start Corrections');
    await shot(page, 'corrections-1-open');
    await page.goBack();
    await settle(page, card(page));
    await onCard(where, page, 'Back from Corrections');
    await page.goForward();
    await settle(page, corrections(page));
    await inCorrections(where, page, 'Forward');
    await page.reload();
    await settle(page, corrections(page), 60_000);
    await inCorrections(where, page, 'a reload inside Corrections');
    await shot(page, 'corrections-2-reloaded');
    await page.goBack();
    await settle(page, card(page));
    await onCard(where, page, 'Back after the reload');
    await page.goBack();
    await settle(page, page.getByText(/My Assignments/));
    const list = await screen(page);
    check(where, list.path === '/assignments' && list.headings.includes('My Assignments'), 'Back again: Assignments, where the card was opened', JSON.stringify(list));
    await closeDevice(device);
  },

  async review(viewport) {
    const device = await openDevice(`review ${viewport.width}x${viewport.height}`, viewport, CARD_PATH);
    const { where, page } = device;
    await settle(page, card(page));
    await page.getByRole('button', { name: /^(Start|Continue) Corrections$/ }).click();
    await settle(page, corrections(page));
    // Offered above the question and again beside the skill's progress.
    await corrections(page).getByRole('button', { name: 'Review my Test' }).first().click();
    await settle(page, reviewScreen(page));
    const open = await screen(page);
    check(where, open.headings.includes(INNER_SCREENS_REVIEW_TITLE) && !open.corrections, '"Review my Test" from Corrections: the released Test', JSON.stringify(open));
    await shot(page, 'review-1-from-corrections');
    await page.goBack();
    await settle(page, corrections(page));
    await inCorrections(where, page, 'Back from the Test review');
    const returned = await screen(page);
    check(where, returned.focused === 'Solving linear equations', 'Back from the Test review: the corrections heading has focus', returned.focused);
    await page.goBack();
    await settle(page, card(page));
    await onCard(where, page, 'Back from Corrections');
    // From the card itself.
    await card(page).getByRole('button', { name: 'Review my Test' }).click();
    await settle(page, reviewScreen(page));
    check(where, (await screen(page)).headings.includes(INNER_SCREENS_REVIEW_TITLE), '"Review my Test" from the card: the released Test');
    await page.goBack();
    await settle(page, card(page));
    await onCard(where, page, 'Back from the Test review opened on the card');
    await closeDevice(device);
  },

  async tests(viewport) {
    const device = await openDevice(`tests ${viewport.width}x${viewport.height}`, viewport, '/tests');
    const { where, page } = device;
    const practice = page.locator('section[aria-labelledby="exam-group-simulations"]');
    await settle(page, practice.locator('article'));
    const before = await practice.locator('article strong').allInnerTexts();
    check(where, before[1] === INNER_SCREENS_SAT_TITLE, 'the SAT under way is listed second', before.join(' | '));
    await practice.locator('article').filter({ hasText: INNER_SCREENS_SAT_TITLE }).getByRole('button', { name: 'Resume' }).click();
    await settle(page, page.getByRole('button', { name: 'Resume test' }));
    check(where, (await screen(page)).headings.includes(INNER_SCREENS_SAT_TITLE), 'Resume: its start screen');
    await page.reload();
    await settle(page, practice.locator('article'), 60_000);
    await page.waitForTimeout(800);
    const after = await screen(page);
    const order = await practice.locator('article strong').allInnerTexts();
    check(where, after.path === '/tests' && after.headings.includes('Tests & Exams'), 'a reload mid-test: the Tests & Exams list', JSON.stringify(after));
    check(where, order[0] === INNER_SCREENS_SAT_TITLE, 'the test that was open is first in its group', order.join(' | '));
    const focusedRow = await page.evaluate(() => document.activeElement?.closest('article')?.querySelector('strong')?.textContent?.trim() || null);
    check(where, after.focused === 'Resume' && focusedRow === INNER_SCREENS_SAT_TITLE, 'its Resume has focus', `${after.focused} in ${focusedRow}`);
    check(where, !after.fullscreen && !(await page.getByRole('button', { name: 'Resume test' }).count()), 'nothing resumed by itself: no full screen, no test');
    await shot(page, 'tests-1-after-reload');
    await page.keyboard.press('Enter');
    await settle(page, page.getByRole('button', { name: 'Resume test' }));
    check(where, (await screen(page)).headings.includes(INNER_SCREENS_SAT_TITLE), 'Enter on it opens the test\'s start screen, where the student resumes it');
    await closeDevice(device);
  },
};

try {
  for (const viewport of VIEWPORTS) {
    for (const [name, journey] of Object.entries(journeys)) {
      if (!wanted(name)) continue;
      try {
        await journey(viewport);
      } catch (error) {
        check(`${name} ${viewport.width}x${viewport.height}`, false, 'the journey ran to the end', error?.stack?.split('\n').slice(0, 3).join(' ') || String(error));
      }
    }
  }
} finally {
  await browser.close();
}

console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  failures.forEach((failure) => console.error(`  FAIL ${failure}`));
  process.exit(1);
}
console.log('Inner-screen Back journeys: all checks passed.');
