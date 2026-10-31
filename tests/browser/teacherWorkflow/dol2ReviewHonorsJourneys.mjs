// THE ALGEBRA II HONORS DOL #2 REVIEW, CREATED FOR A STANDARD AND AN HONORS
// CLASS THROUGH THE REAL APP.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/dol2ReviewHonorsJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN, PLAYWRIGHT_MODULE and CHROMIUM_PATH as in
//    journeys.mjs; DEVICES=desktop,chromebook,phone.)
//
// honorsCcmrJourneys.mjs proves the Honors version of a lesson whose CCMR
// Practice the bank supplies. This review carries its own: Practice 11-13 are
// audited Digital SAT items on the blueprint's standards, enough for the 15%
// share of its 18 Practice questions. A teacher imports it through the real
// creator, selects the Algebra II Lab (Standard) and Algebra II Period 3
// (Honors, `?honors=alg2`), and:
//
//   - Review prepares the Honors version and says it already contains audited
//     CCMR Practice that passes MathMaster's checks: nothing is replaced, and
//     Review is ready to create;
//   - the student preview shows the Standard and the Honors version, with no
//     Honors-only question in either;
//   - Create writes one Standard and one Honors assignment, each with every
//     question of the review and the same three audited items, the Honors
//     copy recording that its CCMR is ready.
//
// The page's hydrateAssignmentCcmr (fakeFunctions.js) is answered in node by
// the REAL server code, functions/lib/ccmrAssignmentBank.js. Every device
// checks: no sideways scrolling, and every control in the Honors panel, the
// preview's version switch and the footer at least 44px.
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/dol2ReviewHonors/ (git-ignored).

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const bank = createRequire(import.meta.url)(path.join(repo, 'functions/lib/ccmrAssignmentBank.js'));
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/dol2ReviewHonors');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1&honors=alg2`;
const MIN_TAP = 44;
// EVERY CHANGE TO THE REVIEW'S DRAFT RE-RUNS THE WHOLE PRE-FLIGHT on the page's main
// thread (LessonPreflightModal's preflightModel is a useMemo over the draft): the file
// import, each class checkbox, the Honors version. For this 40-question review that is
// 4.5-5.5 s on a free desktop core (measured in Node; 85% of it is question-family
// generation for the class-size uniqueness check), times how much slower the machine
// is. With the page's CPU slowed 6x the import took 55 s and each class checkbox 39-47 s,
// and the journey stopped on Playwright's 30 s default in 3 of 3 runs (CI08, D-6). A wait
// for that work gets that work's time, as a bound that is never reached on a quiet run.
const PREFLIGHT_MS = 300_000;

const LESSON_NAME ='District_DOL2_Absolute_Value_and_3x3_Systems_Review.json';
const LESSON_TEXT = readFileSync(path.join(repo, 'teacher-import-jsons/algebra2-honors-dol2', LESSON_NAME), 'utf8');
const LESSON = JSON.parse(LESSON_TEXT);
const LESSON_QUESTION_IDS = LESSON.sections.flatMap((section) => section.questions.map((question) => question.questionId));
const SAT_ITEMS = [
  'mm_sat_A2_2A_absolute-value-interval-maximum_v21',
  'mm_sat_A2_6E_challenge_sum_of_solutions_scaled_v21',
  'mm_sat_A2_6F_tolerance_context_v21',
];
const STANDARD_CLASS = { classId: 'c-lab-p3', name: 'Algebra II Lab — Period 3' };
const HONORS_CLASS = { classId: 'c-alg2-p3', name: 'Algebra II — Period 3' };

const DEVICES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'chromebook', viewport: { width: 1366, height: 768 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
].filter((device) => !process.env.DEVICES || process.env.DEVICES.split(',').includes(device.name));

const clone = (value) => JSON.parse(JSON.stringify(value));

// THE CALLABLE, ANSWERED BY THE SERVER'S OWN CODE, unchanged.
const auditedServer = () => {
  const state = { requests: [] };
  const serve = async (data = {}) => {
    const excludeDocumentIds = (Array.isArray(data.excludeDocumentIds) ? data.excludeDocumentIds : [])
      .filter((value) => typeof value === 'string' && value.trim())
      .slice(0, 100);
    state.requests.push({ includeCandidates: data.includeCandidates === true, ensurePracticeTarget: data.ensurePracticeTarget === true });
    return clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(data.assignment), {
      ensurePracticeTarget: data.ensurePracticeTarget === true,
      includeCandidates: data.includeCandidates === true,
      excludeDocumentIds,
    }));
  };
  return { state, serve };
};

const findings = [];
const passed = [];
const expect = (label, condition, detail) => {
  if (!condition) findings.push({ label, detail });
  return Boolean(condition);
};
const textOf = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim();
const until = async (page, predicate, arg, timeout = 30000) => page.waitForFunction(predicate, arg, { timeout });

const reviewDialog = (page) => page.locator('[aria-label="Lesson pre-flight review"]');
const honorsPanel = (page) => reviewDialog(page).locator('section[aria-label="Honors version"]');
const honorsState = (page) => honorsPanel(page).getAttribute('data-honors-version-state');
const waitForHonorsState = async (page, states) => until(page, (wanted) => {
  const state = document.querySelector('section[aria-label="Honors version"]')?.getAttribute('data-honors-version-state');
  return wanted.includes(state);
}, states, PREFLIGHT_MS);
const footerText = async (page) => textOf(reviewDialog(page).locator('footer'));
const assignmentPaths = (page) => page.evaluate(() => window.__mmHarnessStore.paths('assignments/'));
const storedAssignment = (page, pathName) => page.evaluate((target) => window.__mmHarnessStore.get(target), pathName);

const goToStep = async (page, label) => {
  await reviewDialog(page).getByRole('navigation', { name: 'Review steps' }).getByRole('button', { name: new RegExp(label) }).click();
  await page.waitForTimeout(250);
};

const checkLayout = async (page, label) => {
  const seen = await page.evaluate((minTap) => {
    const visible = (element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const scopes = [
      ...document.querySelectorAll('section[aria-label="Honors version"], [role="group"][aria-label="Which version to preview"], [aria-label="Lesson pre-flight review"] footer'),
    ];
    const small = scopes.flatMap((scope) => [...scope.querySelectorAll('button, summary, a[href], input, select')])
      .filter(visible)
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { label: (element.innerText || element.getAttribute('aria-label') || element.tagName).trim().slice(0, 50), width: Math.round(box.width), height: Math.round(box.height) };
      })
      .filter((entry) => entry.width < minTap || entry.height < minTap);
    const scroller = document.querySelector('[data-preflight-scroll]');
    return {
      pageOverflow: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
      reviewOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
      small,
    };
  }, MIN_TAP);
  expect(label, seen.pageOverflow <= 1, `no sideways scrolling on the page (${seen.pageOverflow}px)`);
  expect(label, seen.reviewOverflow <= 1, `no sideways scrolling inside Review (${seen.reviewOverflow}px)`);
  expect(label, !seen.small.length, `controls under ${MIN_TAP}px: ${JSON.stringify(seen.small)}`);
};

const createButton = async (page, device) => {
  if (device.name === 'phone') {
    await goToStep(page, 'Check');
    return reviewDialog(page).locator('footer').getByRole('button', { name: /^(Assign|Saving…)$/ });
  }
  return reviewDialog(page).locator('footer').getByRole('button', { name: /^(Create & Assign|Saving…)$/ });
};

const newAssignments = async (page, before) => {
  const after = await assignmentPaths(page);
  const added = after.filter((entry) => !before.includes(entry));
  return Promise.all(added.map(async (pathName) => ({ path: pathName, data: await storedAssignment(page, pathName) })));
};
const questionsOf = (assignment) => (assignment?.sections || []).flatMap((section) => section.questions || []);
const auditedIdsOf = (assignment) => questionsOf(assignment).filter((question) => question?.ccmrSource?.source === 'auditedBank').map((question) => question.ccmrSource.documentId);

const journey = async (page, device, server, label) => {
  // IMPORT the review and give it to a Standard and an Honors class.
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.getByText('IN SESSION NOW').waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
  await page.locator('nav, aside').getByRole('button', { name: /Assignments$/ }).first().click();
  const creator = page.locator('summary', { hasText: 'Create and Assign' }).first();
  await creator.waitFor({ timeout: 20000 });
  if (!(await creator.evaluate((summary) => summary.parentElement.open))) await creator.click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: LESSON_NAME, mimeType: 'application/json', buffer: Buffer.from(LESSON_TEXT) });
  await reviewDialog(page).waitFor({ timeout: PREFLIGHT_MS });
  await goToStep(page, 'Classes');
  for (const entry of [STANDARD_CLASS, HONORS_CLASS]) {
    await reviewDialog(page).locator('label', { hasText: entry.name }).locator('input[type="checkbox"]').check({ timeout: PREFLIGHT_MS });
  }
  await honorsPanel(page).waitFor({ timeout: PREFLIGHT_MS });

  // THE HONORS VERSION: its own audited CCMR passes, so nothing is replaced.
  await waitForHonorsState(page, ['ready', 'needsDecision', 'error', 'invalid']);
  const panel = await textOf(honorsPanel(page));
  expect(label, (await honorsState(page)) === 'ready', `the Honors version is ready (${await honorsState(page)}): ${panel.slice(0, 300)}`);
  expect(label, /Honors version checked\./.test(panel) && /already contains audited CCMR Practice that passes MathMaster’s checks/.test(panel), `Review says the review already carries its audited CCMR (${panel.slice(0, 240)})`);
  expect(label, (await honorsPanel(page).locator('[data-honors-ccmr-item]').count()) === 0, 'no Practice question is replaced for Honors');
  expect(label, server.state.requests.some((request) => request.includeCandidates && request.ensurePracticeTarget), 'the audited bank was asked for the Honors version');
  expect(label, /Ready to create/.test(await footerText(page)), `Review is ready to create (${(await footerText(page)).slice(0, 160)})`);
  await checkLayout(page, `${label} Honors panel`);
  await page.screenshot({ path: path.join(ARTIFACTS, `${label}-1-honors-ready.png`), fullPage: false });

  // THE PREVIEW: both versions, neither with an Honors-only question.
  await goToStep(page, 'Check');
  const preview = reviewDialog(page).locator('#preflight-student-preview');
  const versions = preview.getByRole('group', { name: 'Which version to preview' });
  await versions.waitFor({ timeout: PREFLIGHT_MS });
  expect(label, /What Standard classes receive\./.test(await textOf(versions)), 'the preview opens on the Standard version');
  await versions.getByRole('button', { name: 'Honors version' }).click();
  expect(label, (await versions.getByRole('button', { name: 'Honors version' }).getAttribute('aria-pressed')) === 'true', 'the Honors version can be previewed');
  expect(label, /What Honors classes receive/.test(await textOf(versions)), 'and is named as what Honors classes receive');
  const opener = preview.getByRole('button', { name: /Open the student preview/ });
  if (await opener.count()) await opener.click();
  // The student preview renders on the page's own thread: wait for it, not for 800 ms.
  await until(page, () => (document.querySelector('#preflight-student-preview')?.innerText || '').replace(/\s+/g, ' ').trim().length > 200, null, PREFLIGHT_MS).catch(() => {});
  const rendered = await preview.evaluate((element) => ({
    text: element.innerText.replace(/\s+/g, ' ').trim(),
    crashed: /Something went wrong|Could not render/i.test(element.innerText),
  }));
  expect(label, rendered.text.length > 200 && !rendered.crashed, `the Honors version renders for a student (${rendered.text.slice(0, 160)})`);
  expect(label, (await preview.locator('[data-preview-honors-only]').count()) === 0, 'no question is Honors-only');
  await checkLayout(page, `${label} preview`);
  await page.screenshot({ path: path.join(ARTIFACTS, `${label}-2-honors-preview.png`), fullPage: false });
  await versions.getByRole('button', { name: /^Standard version$/ }).click();
  await page.waitForTimeout(300);
  expect(label, (await versions.getByRole('button', { name: /^Standard version$/ }).getAttribute('aria-pressed')) === 'true', 'and back to the Standard version');

  // CREATE: one Standard and one Honors assignment, each the whole review.
  const before = await assignmentPaths(page);
  await (await createButton(page, device)).click({ timeout: PREFLIGHT_MS });
  await reviewDialog(page).waitFor({ state: 'detached', timeout: PREFLIGHT_MS });
  // Both assignments are stored (not "800 ms after the dialog closed").
  await until(page, (count) => window.__mmHarnessStore.paths('assignments/').length >= count, before.length + 2, PREFLIGHT_MS).catch(() => {});
  const created = await newAssignments(page, before);
  expect(label, created.length === 2, `exactly two assignments were created (${created.length})`);
  const standard = created.find((entry) => entry.data?.rigorVariant === 'standard')?.data;
  const honors = created.find((entry) => entry.data?.rigorVariant === 'honors')?.data;
  expect(label, standard && JSON.stringify(standard.assignedClassIds) === JSON.stringify([STANDARD_CLASS.classId]), 'the Standard copy goes to the Algebra II Lab');
  expect(label, honors && JSON.stringify(honors.assignedClassIds) === JSON.stringify([HONORS_CLASS.classId]), 'the Honors copy goes to Algebra II Period 3');
  expect(label, standard?.rigorVariantGroupId && standard.rigorVariantGroupId === honors?.rigorVariantGroupId, 'both copies share one variant group');
  for (const [name, copy] of [['Standard', standard], ['Honors', honors]]) {
    const ids = questionsOf(copy).map((question) => question.questionId);
    expect(label, JSON.stringify(ids) === JSON.stringify(LESSON_QUESTION_IDS), `the ${name} copy holds every question of the review, in order (${ids.length})`);
    expect(label, JSON.stringify(auditedIdsOf(copy)) === JSON.stringify(SAT_ITEMS), `the ${name} copy carries the review's three audited SAT items (${auditedIdsOf(copy).join(', ')})`);
  }
  expect(label, honors?.honorsCcmr?.status === 'ready' && (honors.honorsCcmr.sourced || []).length === 0, `the Honors copy records CCMR ready with nothing sourced (${JSON.stringify(honors?.honorsCcmr || null).slice(0, 200)})`);
  expect(label, honors?.honorsContractVersion === 1, 'the Honors copy carries the Honors contract');
  expect(label, standard?.courseProfile?.course === 'algebra2' && honors?.courseProfile?.courseLevel === 'honors', 'each copy names its course and level');
  await page.screenshot({ path: path.join(ARTIFACTS, `${label}-3-created.png`), fullPage: false });
};

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });
const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

for (const device of DEVICES) {
  const label = `dol2-review@${device.name}`;
  const context = await newSchoolContext(browser, { viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch });
  const page = await context.newPage();
  const server = auditedServer();
  await page.exposeFunction('__honorsCcmrServer', server.serve);
  await page.exposeFunction('__honorsCcmrRequests', () => server.state.requests.length);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const unimplemented = watchUnimplementedCallables(page);
  const before = findings.length;
  try {
    await journey(page, device, server, label);
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
console.log('The Algebra II Honors DOL #2 review creates a ready Standard and Honors version on every device.');
