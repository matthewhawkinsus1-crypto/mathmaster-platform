// THE HONORS VERSION IN ASSIGNMENT REVIEW, THROUGH THE REAL APP.
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &
//   node tests/browser/teacherWorkflow/honorsCcmrJourneys.mjs
//
//   (TEACHER_HARNESS_ORIGIN, PLAYWRIGHT_MODULE and CHROMIUM_PATH as in
//    journeys.mjs; DEVICES=desktop,chromebook,phone; ONLY=ready,exhausted,error.)
//
// Production: a teacher finished Assignment Review for Algebra I M2 T2
// Lesson 2 with an Honors class selected, pressed Create Assignment, and got
// "The audited CCMR enrichment did not pass MathMaster's assignment checks:
// Question 24 refers to a graph in its prompt, but the question contains
// none." The Honors version is now prepared, proven and previewed in Review,
// and Create publishes exactly that version or nothing. Each journey imports
// that lesson through the real creator, gives it Honors depth the way the
// teacher did (an AI repair, here an outside-AI file), selects a Standard and
// an Honors class (`?honors=1` makes Period 5 Honors), and then:
//
//   ready      the bank offers the production item first, as the server did.
//              Review skips it and shows its actual failure, uses a validated
//              item on the same TEKS, previews it as a student, swaps one on
//              request, keeps everything through a failed save (nothing
//              written), and Create writes one Standard and one Honors
//              assignment holding exactly the questions previewed.
//   exhausted  nothing in the bank passes: Create waits for the teacher, and
//              keeping the authored Practice is recorded on the Honors copy.
//   error      the callable fails once: "Try again" prepares the version.
//
// The audited bank ships with the Functions, so the page's
// hydrateAssignmentCcmr (fakeFunctions.js) is answered in node by the REAL
// server code, functions/lib/ccmrAssignmentBank.js, on exactly what the page
// sent. Every device checks: no sideways scrolling, and every control in the
// Honors panel, the preview's version switch and the footer at least 44px.
//
// Exit code 1 on any finding. Screenshots in
// tests/browser/artifacts/honorsCcmr/ (git-ignored).

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText } from '../../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../../src/platform/preflight/assignmentV5PreflightModel.js';
import { buildDeterministicHonorsExtension } from '../../../src/platform/rigor/honorsExtensionRecipes.js';
import { watchUnimplementedCallables } from './journeyChecks.mjs';
import { newSchoolContext } from './schoolClock.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const bank = createRequire(import.meta.url)(path.join(repo, 'functions/lib/ccmrAssignmentBank.js'));
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/honorsCcmr');
const ORIGIN = process.env.TEACHER_HARNESS_ORIGIN || 'http://127.0.0.1:5188';
const PAGE = `${ORIGIN}/tests/browser/teacherWorkflow/index.html?reset=1&honors=1`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const MIN_TAP = 44;

const LESSON_NAME = 'L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json';
const LESSON_TEXT = readFileSync(path.join(repo, 'teacher-import-jsons/algebra1-module2-topic2', LESSON_NAME), 'utf8');
const PRODUCTION_ITEM = 'mm_sat_A_3E_5_intercept-change_v21';
const STANDARD_CLASS = { classId: 'c-alg1-p1', name: 'Algebra I — Period 1' };
const HONORS_CLASS = { classId: 'c-alg1-p5', name: 'Algebra I — Period 5' };

const DEVICES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'chromebook', viewport: { width: 1366, height: 768 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
].filter((device) => !process.env.DEVICES || process.env.DEVICES.split(',').includes(device.name));

const clone = (value) => JSON.parse(JSON.stringify(value));
const documentIdOf = (intent) => intent?.ccmrSource?.documentId || null;

// THE LESSON AS REVIEW HOLDS IT, built in node by the code the page runs: the
// import's bank pass (no direct exam claims here, so nothing changes), the V5
// compile, and Review's reviewed object. Its sections are what the page sends.
const reviewedLesson = (() => {
  const imported = bank.replaceDirectCcmrQuestionsWithAuditedBank(JSON.parse(LESSON_TEXT), { ensurePracticeTarget: false }).assignment;
  const parsed = parseAssignmentBlueprintText(JSON.stringify(imported));
  return buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {})).assignmentV5;
})();
const LESSON_QUESTION_COUNT = reviewedLesson.sections.reduce((total, section) => total + section.questions.length, 0);
const PRACTICE_INDEX = reviewedLesson.sections.findIndex((section) => section.role === 'practice');
const AUTHORED_PRACTICE_IDS = reviewedLesson.sections[PRACTICE_INDEX].questions.map((question) => question.questionId);

// THE TEACHER'S HONORS DEPTH. Lesson 2 lacks justification and modeling for
// Honors and has no built-in recipe, so the teacher used an AI repair. This is
// the file an outside AI returns: the reviewed lesson with one Honors question
// added to Classwork (the vetted Multiple Representations extension), which
// Review's own safety gate accepts and separates out as the Honors extension.
const honorsDepthFile = (() => {
  const lmr = buildAssignmentV5PreflightModel(parseAssignmentBlueprintText(readFileSync(path.join(repo, 'docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json'), 'utf8')).assignmentV5);
  const built = buildDeterministicHonorsExtension({ questions: lmr.questions, assignmentCourseId: 'algebra1' });
  if (built.status !== 'ready') throw new Error('The Multiple Representations extension is not available to build the Honors depth file.');
  const extension = { ...built.question };
  delete extension.sectionId;
  const repaired = clone(reviewedLesson);
  repaired.sections.find((section) => section.role === 'classwork').questions.push(extension);
  return { name: 'honors-depth-from-ai.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(repaired)) };
})();

// THE CALLABLE, ANSWERED BY THE SERVER'S OWN CODE. `ready` and `error` offer
// the production item first at its place, as the deployed server chose it;
// `exhausted` offers only that item, so nothing passes.
const auditedServer = (scenario) => {
  const state = { requests: [], failNext: scenario === 'error' ? 1 : 0 };
  const serve = async (data = {}) => {
    const excludeDocumentIds = (Array.isArray(data.excludeDocumentIds) ? data.excludeDocumentIds : [])
      .filter((value) => typeof value === 'string' && value.trim())
      .slice(0, 100);
    state.requests.push({ includeCandidates: data.includeCandidates === true, ensurePracticeTarget: data.ensurePracticeTarget === true, excludeDocumentIds });
    // Review's Honors request (import asks for candidates too, without a target).
    if (data.includeCandidates === true && data.ensurePracticeTarget === true && state.failNext > 0) {
      state.failNext -= 1;
      // What functions/index.js throws when the bank pass fails.
      return { error: { code: 'internal', message: 'MathMaster could not prepare audited CCMR Practice for this assignment.' } };
    }
    const result = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(data.assignment), {
      ensurePracticeTarget: data.ensurePracticeTarget === true,
      includeCandidates: data.includeCandidates === true,
      excludeDocumentIds,
    }));
    const slots = result.audit?.plan?.slots || [];
    const production = slots.find((slot) => slot.candidates.some((intent) => documentIdOf(intent) === PRODUCTION_ITEM));
    if (scenario === 'exhausted') {
      slots.forEach((slot) => { slot.candidates = slot === production ? slot.candidates.filter((intent) => documentIdOf(intent) === PRODUCTION_ITEM) : []; });
    } else if (production) {
      production.candidates.sort((left, right) => Number(documentIdOf(right) === PRODUCTION_ITEM) - Number(documentIdOf(left) === PRODUCTION_ITEM));
      result.audit.plan.slots = [production, ...slots.filter((slot) => slot !== production)];
    }
    return result;
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
}, states, 60000);
const sourcedIds = (page) => honorsPanel(page).locator('[data-honors-ccmr-item]').evaluateAll((items) => items.map((item) => item.getAttribute('data-honors-ccmr-item')));
const footerText = async (page) => textOf(reviewDialog(page).locator('footer'));
const assignmentPaths = (page) => page.evaluate(() => window.__mmHarnessStore.paths('assignments/'));
const storedAssignment = (page, pathName) => page.evaluate((target) => window.__mmHarnessStore.get(target), pathName);

const goToStep = async (page, label) => {
  await reviewDialog(page).getByRole('navigation', { name: 'Review steps' }).getByRole('button', { name: new RegExp(label) }).click();
  await page.waitForTimeout(250);
};

// Layout: the page never scrolls sideways, and the controls this change adds
// (and the footer that creates) are thumb-sized.
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

/** Import the lesson, add Honors depth, select a Standard and an Honors class. */
const openHonorsReview = async (page) => {
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await page.getByText('IN SESSION NOW').waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
  await page.locator('nav, aside').getByRole('button', { name: /Assignments$/ }).first().click();
  const creator = page.locator('summary', { hasText: 'Create and Assign' }).first();
  await creator.waitFor({ timeout: 20000 });
  if (!(await creator.evaluate((summary) => summary.parentElement.open))) await creator.click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: LESSON_NAME, mimeType: 'application/json', buffer: Buffer.from(LESSON_TEXT) });
  await reviewDialog(page).waitFor({ timeout: 60000 });

  await goToStep(page, 'Classes');
  for (const entry of [STANDARD_CLASS, HONORS_CLASS]) {
    await reviewDialog(page).locator('label', { hasText: entry.name }).locator('input[type="checkbox"]').check();
  }
  await honorsPanel(page).waitFor({ timeout: 20000 });
  await reviewDialog(page).locator('input[type="file"][accept=".json,application/json"]').setInputFiles(honorsDepthFile);
  await reviewDialog(page).getByText(/repaired the Honors depth requirements/).waitFor({ timeout: 30000 });
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

const SCENARIOS = {
  async ready(page, device, server, label) {
    await openHonorsReview(page);
    await waitForHonorsState(page, ['ready', 'needsDecision', 'error', 'invalid']);
    expect(label, (await honorsState(page)) === 'ready', `the Honors version is ready (${await honorsState(page)}): ${(await textOf(honorsPanel(page))).slice(0, 300)}`);
    const first = await sourcedIds(page);
    expect(label, first.length >= 1, `audited CCMR Practice is listed (${first.join(', ')})`);
    expect(label, !first.includes(PRODUCTION_ITEM), 'the item that failed Create in production is not used');
    const skipped = honorsPanel(page).locator(`[data-honors-ccmr-skipped-item="${PRODUCTION_ITEM}"]`);
    expect(label, (await skipped.count()) === 1, 'the production item is listed as checked and not used');
    if (await skipped.count()) {
      await honorsPanel(page).locator('details[data-honors-ccmr-skipped] summary').click();
      const said = await textOf(skipped);
      expect(label, /refers to a graph in its prompt, but the question contains none/.test(said), `with its actual failure (${said.slice(0, 200)})`);
      expect(label, /The graph of/.test(said), 'and its actual prompt');
    }
    expect(label, /Ready to create/.test(await footerText(page)), `Review is ready to create (${(await footerText(page)).slice(0, 160)})`);
    await checkLayout(page, `${label} Honors panel`);
    await page.screenshot({ path: path.join(ARTIFACTS, `${label}-1-honors-ready.png`), fullPage: false });

    // PREVIEW: the audited item, as a student sees it in the Honors version.
    await honorsPanel(page).locator(`[data-honors-ccmr-item="${first[0]}"]`).getByRole('button', { name: 'Preview as a student' }).click();
    const preview = reviewDialog(page).locator('#preflight-student-preview');
    await preview.locator('[data-preview-honors-only]').waitFor({ timeout: 20000 });
    const badge = await textOf(preview.locator('[data-preview-honors-only]'));
    expect(label, badge.includes(first[0]) && /Honors only · Audited CCMR/.test(badge), `the preview names the audited item (${badge})`);
    expect(label, (await preview.getByRole('button', { name: 'Honors version' }).getAttribute('aria-pressed')) === 'true', 'the preview shows the Honors version');
    await page.waitForTimeout(500);
    const rendered = await preview.evaluate((element) => ({
      text: element.innerText.replace(/\s+/g, ' ').trim(),
      crashed: /Something went wrong|Could not render/i.test(element.innerText),
      tables: element.querySelectorAll('table').length,
    }));
    expect(label, rendered.text.length > 120 && !rendered.crashed, `the audited question renders for the student (${rendered.text.slice(0, 160)})`);
    await checkLayout(page, `${label} preview`);
    await page.screenshot({ path: path.join(ARTIFACTS, `${label}-2-honors-preview.png`), fullPage: false });
    await preview.getByRole('button', { name: /^Standard version$/ }).click();
    await page.waitForTimeout(300);
    expect(label, (await preview.locator('[data-preview-honors-only]').count()) === 0, 'the Standard preview carries no Honors-only item');
    if (device.name === 'phone') await goToStep(page, 'Classes');

    // "USE A DIFFERENT AUDITED ITEM": asked again without it, proven again.
    const requestsBefore = server.state.requests.length;
    await honorsPanel(page).locator(`[data-honors-ccmr-item="${first[0]}"]`).getByRole('button', { name: 'Use a different audited item' }).click();
    await until(page, (count) => window.__honorsCcmrRequests?.() > count, requestsBefore).catch(() => {});
    await waitForHonorsState(page, ['ready', 'needsDecision', 'error', 'invalid']);
    const asked = server.state.requests.slice(requestsBefore);
    expect(label, asked.some((request) => request.includeCandidates && request.excludeDocumentIds.includes(first[0])), `the bank was asked again without ${first[0]}`);
    expect(label, (await honorsState(page)) === 'ready', `still ready after the swap (${await honorsState(page)})`);
    const swapped = await sourcedIds(page);
    expect(label, !swapped.includes(first[0]) && swapped.length === first.length, `the set-aside item is replaced (${first.join(', ')} → ${swapped.join(', ')})`);
    expect(label, /set aside at your request/.test(await textOf(honorsPanel(page))), 'the set-aside item can be offered again');
    await checkLayout(page, `${label} after swap`);

    // A SAVE THAT FAILS writes nothing and keeps the review as it was.
    const before = await assignmentPaths(page);
    await page.evaluate(() => window.__mmHarnessStore.failNextBatchCommit('The connection dropped while saving.'));
    await (await createButton(page, device)).click();
    await page.getByText('Could not create assignment').first().waitFor({ timeout: 20000 });
    const toast = await textOf(page.getByText(/Nothing was created/).first());
    expect(label, /Your review is still open with every choice kept/.test(toast), `the failure says nothing was created (${toast.slice(0, 200)})`);
    expect(label, (await newAssignments(page, before)).length === 0, 'a failed save leaves no assignment behind');
    expect(label, await reviewDialog(page).isVisible(), 'the review stays open');
    if (device.name === 'phone') await goToStep(page, 'Classes');
    expect(label, (await honorsState(page)) === 'ready' && JSON.stringify(await sourcedIds(page)) === JSON.stringify(swapped), 'the prepared Honors version is kept');
    expect(label, await reviewDialog(page).locator('label', { hasText: HONORS_CLASS.name }).locator('input[type="checkbox"]').isChecked(), 'the class choices are kept');
    await page.screenshot({ path: path.join(ARTIFACTS, `${label}-3-failed-save.png`), fullPage: false });

    // CREATE AGAIN: one Standard and one Honors assignment, exactly as previewed.
    await (await createButton(page, device)).click();
    await reviewDialog(page).waitFor({ state: 'detached', timeout: 30000 });
    await page.waitForTimeout(800);
    const created = await newAssignments(page, before);
    expect(label, created.length === 2, `exactly two assignments were created (${created.length})`);
    const standard = created.find((entry) => entry.data?.rigorVariant === 'standard')?.data;
    const honors = created.find((entry) => entry.data?.rigorVariant === 'honors')?.data;
    expect(label, standard && JSON.stringify(standard.assignedClassIds) === JSON.stringify([STANDARD_CLASS.classId]), 'the Standard copy goes to the Standard class');
    expect(label, honors && JSON.stringify(honors.assignedClassIds) === JSON.stringify([HONORS_CLASS.classId]), 'the Honors copy goes to the Honors class');
    expect(label, standard?.rigorVariantGroupId && standard.rigorVariantGroupId === honors?.rigorVariantGroupId, 'both copies share one variant group');
    expect(label, questionsOf(standard).length === LESSON_QUESTION_COUNT && auditedIdsOf(standard).length === 0, `the Standard copy is the lesson as written (${questionsOf(standard).length} questions)`);
    const standardPractice = (standard?.sections || []).find((section) => section.role === 'practice')?.questions.map((question) => question.questionId) || [];
    expect(label, JSON.stringify(standardPractice) === JSON.stringify(AUTHORED_PRACTICE_IDS), 'the Standard copy keeps the authored Practice');
    expect(label, JSON.stringify(auditedIdsOf(honors).sort()) === JSON.stringify([...swapped].sort()), `the Honors copy holds exactly the audited items previewed (${auditedIdsOf(honors).join(', ')})`);
    expect(label, !auditedIdsOf(honors).includes(PRODUCTION_ITEM), 'the failing item never reaches students');
    expect(label, questionsOf(honors).length === LESSON_QUESTION_COUNT + 1, `the Honors copy adds only the Honors extension (${questionsOf(honors).length} questions)`);
    expect(label, honors?.honorsCcmr?.status === 'ready' && JSON.stringify(honors.honorsCcmr.sourced.map((entry) => entry.documentId).sort()) === JSON.stringify([...swapped].sort()), `the Honors copy records its audited items (${JSON.stringify(honors?.honorsCcmr || null).slice(0, 200)})`);
    expect(label, (honors?.honorsCcmr?.skippedDocumentIds || []).includes(PRODUCTION_ITEM), 'and the item that was checked and not used');
    await page.screenshot({ path: path.join(ARTIFACTS, `${label}-4-created.png`), fullPage: false });
  },

  async exhausted(page, device, server, label) {
    await openHonorsReview(page);
    await waitForHonorsState(page, ['ready', 'needsDecision', 'error', 'invalid']);
    expect(label, (await honorsState(page)) === 'needsDecision', `the teacher is asked to decide (${await honorsState(page)})`);
    const panel = await textOf(honorsPanel(page));
    expect(label, /No audited CCMR Practice item passed MathMaster’s checks/.test(panel), 'Review says no audited item passed');
    expect(label, /Nothing has been created and your review is kept/.test(panel), 'and that nothing was created');
    expect(label, (await honorsPanel(page).locator(`[data-honors-ccmr-skipped-item="${PRODUCTION_ITEM}"]`).count()) === 1, 'the failing item is shown');
    const create = await createButton(page, device);
    expect(label, await create.isDisabled(), 'Create waits for the decision');
    if (device.name === 'phone') await goToStep(page, 'Classes');
    await checkLayout(page, `${label} decision`);
    await page.screenshot({ path: path.join(ARTIFACTS, `${label}-1-decision.png`), fullPage: false });

    await honorsPanel(page).getByRole('button', { name: 'Keep the authored Practice for Honors' }).click();
    await waitForHonorsState(page, ['keptAuthored']);
    expect(label, /Ready to create/.test(await footerText(page)), `Review is ready once the teacher decides (${(await footerText(page)).slice(0, 160)})`);
    await checkLayout(page, `${label} kept`);
    const before = await assignmentPaths(page);
    await (await createButton(page, device)).click();
    await reviewDialog(page).waitFor({ state: 'detached', timeout: 30000 });
    await page.waitForTimeout(800);
    const created = await newAssignments(page, before);
    expect(label, created.length === 2, `exactly two assignments were created (${created.length})`);
    const honors = created.find((entry) => entry.data?.rigorVariant === 'honors')?.data;
    expect(label, honors?.honorsCcmr?.status === 'keptAuthored' && honors.honorsCcmr.teacherDecision === 'keepAuthoredPractice', `the teacher's decision is recorded (${JSON.stringify(honors?.honorsCcmr || null).slice(0, 200)})`);
    expect(label, auditedIdsOf(honors).length === 0 && questionsOf(honors).length === LESSON_QUESTION_COUNT + 1, 'the Honors copy keeps the authored Practice and its extension');
  },

  async error(page, device, server, label) {
    await openHonorsReview(page);
    await waitForHonorsState(page, ['ready', 'needsDecision', 'error', 'invalid']);
    expect(label, (await honorsState(page)) === 'error', `a failed bank call is shown (${await honorsState(page)})`);
    const panel = await textOf(honorsPanel(page));
    expect(label, /MathMaster could not prepare the Honors version\./.test(panel) && /your review is kept/.test(panel), `with what happened (${panel.slice(0, 200)})`);
    expect(label, !/Ready to create/.test(await footerText(page)), 'Create waits');
    await checkLayout(page, `${label} error`);
    await honorsPanel(page).getByRole('button', { name: 'Try again' }).click();
    await waitForHonorsState(page, ['ready', 'needsDecision', 'invalid']);
    expect(label, (await honorsState(page)) === 'ready', `"Try again" prepares the Honors version (${await honorsState(page)})`);
    expect(label, /Ready to create/.test(await footerText(page)), 'and Review is ready to create');
  },
};

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });
const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

for (const device of DEVICES) {
  for (const [scenario, run] of Object.entries(SCENARIOS).filter(([key]) => !ONLY || ONLY.includes(key))) {
    const label = `${scenario}@${device.name}`;
    const context = await newSchoolContext(browser, { viewport: device.viewport, isMobile: device.isMobile, hasTouch: device.hasTouch });
    const page = await context.newPage();
    const server = auditedServer(scenario);
    await page.exposeFunction('__honorsCcmrServer', server.serve);
    await page.exposeFunction('__honorsCcmrRequests', () => server.state.requests.length);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const unimplemented = watchUnimplementedCallables(page);
    const before = findings.length;
    try {
      await run(page, device, server, label);
      expect(label, !unimplemented().length, `reached a callable the harness does not implement: ${unimplemented().join(', ')}`);
    } catch (error) {
      findings.push({ label, detail: `stopped: ${error.message.split('\n')[0]}` });
      await page.screenshot({ path: path.join(ARTIFACTS, `${label}-stopped.png`), fullPage: false }).catch(() => {});
    }
    errors.forEach((message) => findings.push({ label, detail: `page error: ${message}` }));
    if (findings.length === before) passed.push(label);
    await context.close();
  }
}
await browser.close();

console.log(`passed: ${passed.join(', ') || 'none'}`);
if (findings.length) {
  console.log(`\n${findings.length} finding(s):`);
  findings.forEach(({ label, detail }) => console.log(`  [${label}] ${detail}`));
  process.exit(1);
}
console.log('All Honors CCMR review journeys passed.');
