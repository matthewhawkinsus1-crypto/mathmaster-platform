// CAN A TEACHER SEE — AND NOT UNDO BY ACCIDENT — A REPLACED QUESTION, ON A
// PHONE, AN IPAD AND A CHROMEBOOK?
//
//   npx vite --config tests/browser/teacherWorkflow/vite.config.mjs &   # 127.0.0.1:5188, firebase faked
//   node tests/browser/questionEditorSupersession.mjs            # report
//   node tests/browser/questionEditorSupersession.mjs --write    # also record the findings fixture
//
// The REAL Assignment Question Editor is opened on a live assignment built in
// node from the certified lesson, the real recipe registry and the real
// history-safe swap: the original Honors extension retired at its index, its
// replacement appended and active. At each device size, a teacher:
//
//   SEES      the retired card says EXCLUDED and REPLACED, names the
//             replacement ("Replaced by Question N"), and offers a 44px
//             "Show Question N" that brings the replacement into view and
//             focus
//   IS REFUSED pressing Include on it: the card announces why (role=alert,
//             visible where they pressed), Include is aria-disabled, and
//             nothing changes — still excluded, the counts unchanged, no save
//   RESTORES  after excluding the replacement, Include works, the replacement
//             reads RETIRED REPLACEMENT, and the save writes exactly that,
//             with every question id, position and link intact
//   CANNOT SAVE two active versions (a record written before this guard):
//             both cards say so, and Save refuses with the reason
//
// and on every screen: nothing pushes the page sideways, and every control
// this feature added or changed is at least 44px tall.
//
// Findings go to tests/platform/fixtures/questionEditorSupersessionFindings.json,
// which tests/platform/questionEditorSupersessionFindings.test.mjs asserts is
// empty for all three devices.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const FINDINGS = path.join(repo, 'tests/platform/fixtures/questionEditorSupersessionFindings.json');
const SHOTS = process.env.SHOT_DIR || null;
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5188';
const WRITE = process.argv.includes('--write');
const MIN_TAP = 44;

export const DEVICES = Object.freeze([
  { id: 'phone-390', width: 390, height: 844, isMobile: true, hasTouch: true },
  { id: 'ipad-820', width: 820, height: 1180, isMobile: true, hasTouch: true },
  { id: 'chromebook-1366', width: 1366, height: 768, isMobile: false, hasTouch: false },
]);

/* ----------------------------- the fixtures ----------------------------- */

const { buildDeterministicHonorsExtension } = await import(`${repo}/src/platform/rigor/honorsExtensionRecipes.js`);
const { planHonorsExtensionSwap, withAppendedQuestionSections } = await import(`${repo}/src/platform/rigor/honorsExtensionSwap.js`);
const { canonicalV5PersistencePatch, getStoredAssignmentQuestions } = await import(`${repo}/src/platform/contract/storedAssignmentV5.js`);
const { preflightEditorCandidate, publishLmrLesson, storedHonorsAssignment } = await import(`${repo}/tests/platform/helpers/honorsExtensionFixtures.mjs`);

const extension = buildDeterministicHonorsExtension({ questions: publishLmrLesson().questions, assignmentCourseId: 'algebra1' }).question;
const original = { ...extension, questionId: 'honors-original' };
const stored = { ...storedHonorsAssignment(original), updatedAt: '2026-10-04T12:00:00.000Z' };
const plan = planHonorsExtensionSwap({
  questions: getStoredAssignmentQuestions(stored),
  questionId: original.questionId,
  assignmentCourseId: 'algebra1',
  protectHistory: true,
  mintQuestionId: () => 'honors-replacement',
});
const model = preflightEditorCandidate(withAppendedQuestionSections(stored, plan.appendedSections), plan.questions);
if (!model.isValid) throw new Error(`fixture swap does not pass Pre-Flight:\n${model.errors.join('\n')}`);
const swapped = { ...stored, ...canonicalV5PersistencePatch(model.assignmentV5) };
const swappedQuestions = getStoredAssignmentQuestions(swapped);
const ORIGINAL_NUMBER = swappedQuestions.findIndex((question) => question.questionId === 'honors-original') + 1;
const REPLACEMENT_NUMBER = swappedQuestions.findIndex((question) => question.questionId === 'honors-replacement') + 1;
// The same record as written by the Include defect: both versions active.
const conflicted = {
  ...swapped,
  sections: swapped.sections.map((section) => ({
    ...section,
    questions: section.questions.map((question) => (question.questionId === 'honors-original' ? { ...question, teacherExcluded: false } : question)),
  })),
};
const FIXTURES = { swap: swapped, conflict: conflicted };

/* ------------------------------ the checks ------------------------------ */

const card = (page, number) => page.locator(`[data-question-card="${number}"]`);
const buttonIn = (page, number, name) => card(page, number).getByRole('button', { name, exact: true });

const heightOf = async (locator) => (await locator.boundingBox())?.height ?? 0;
const inViewport = async (page, locator) => {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  return Boolean(box) && box.y < viewport.height && box.y + box.height > 0 && box.x < viewport.width && box.x + box.width > 0;
};
// `force` only skips Playwright's own "is it enabled" wait: an aria-disabled
// button still receives a real finger or click, which is exactly the press
// that must be explained rather than silently ignored.
const press = async (page, device, locator, { force = false } = {}) => {
  await locator.scrollIntoViewIfNeeded();
  if (device.hasTouch) await locator.tap({ force });
  else await locator.click({ force });
};

const certify = async (browser, device) => {
  const findings = [];
  const fail = (scenario, rule, detail) => findings.push({ device: device.id, scenario, rule, detail });
  const phaseless = async (run, scenario, rule) => {
    try {
      await run();
    } catch (error) {
      fail(scenario, rule, `could not be carried out: ${String(error?.message || error).split('\n')[0]}`);
    }
  };
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    deviceScaleFactor: device.isMobile ? 2 : 1,
  });
  await context.addInitScript((fixtures) => { window.__QUESTION_EDITOR_FIXTURES__ = fixtures; }, FIXTURES);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));

  const sideways = async (scenario) => {
    const overflow = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return {
        page: document.scrollingElement.scrollWidth - window.innerWidth,
        dialog: dialog ? dialog.getBoundingClientRect().right - window.innerWidth : 0,
        cards: [...document.querySelectorAll('[data-question-card]')].map((node) => node.scrollWidth - node.clientWidth).filter((excess) => excess > 1).length,
      };
    });
    if (overflow.page > 1) fail(scenario, 'SIDEWAYS', `the page scrolls ${overflow.page}px sideways`);
    if (overflow.dialog > 1) fail(scenario, 'SIDEWAYS', `the dialog runs ${overflow.dialog}px past the right edge`);
    if (overflow.cards) fail(scenario, 'SIDEWAYS', `${overflow.cards} question card(s) overflow horizontally`);
  };

  /* ---- swap: see it, be refused, jump to it, restore it, save it ---- */
  await page.goto(`${ORIGIN}/tests/browser/questionEditorSupersession.html?scenario=swap`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`[data-question-card="${REPLACEMENT_NUMBER}"]`, { timeout: 20000 });
  await sideways('swap');

  const retired = card(page, ORIGINAL_NUMBER);
  const replacement = card(page, REPLACEMENT_NUMBER);
  const retiredText = await retired.innerText();
  if (!/EXCLUDED/.test(retiredText) || !/REPLACED/.test(retiredText)) fail('swap', 'SEES', 'the retired card is not labelled EXCLUDED and REPLACED');
  if (!retiredText.includes(`Replaced by Question ${REPLACEMENT_NUMBER}.`)) fail('swap', 'SEES', `the retired card does not name Question ${REPLACEMENT_NUMBER} as its replacement`);
  if (!/REPLACEMENT/.test(await replacement.innerText()) || !(await replacement.innerText()).includes(`Replaces Question ${ORIGINAL_NUMBER}.`)) {
    fail('swap', 'SEES', 'the replacement card does not name what it replaced');
  }

  const include = buttonIn(page, ORIGINAL_NUMBER, 'Include');
  const show = buttonIn(page, ORIGINAL_NUMBER, `Show Question ${REPLACEMENT_NUMBER}`);
  for (const [label, locator] of [['Include', include], [`Show Question ${REPLACEMENT_NUMBER}`, show], ['Exclude (replacement)', buttonIn(page, REPLACEMENT_NUMBER, 'Exclude')]]) {
    await locator.scrollIntoViewIfNeeded();
    const height = await heightOf(locator);
    if (height < MIN_TAP) fail('swap', 'TAP', `${label} is ${Math.round(height)}px tall`);
  }
  if ((await include.getAttribute('aria-disabled')) !== 'true') fail('swap', 'REFUSED', 'Include is not marked aria-disabled while the replacement is active');

  const header = page.locator('strong', { hasText: /included · / }).first();
  const countsBefore = await header.innerText();
  await press(page, device, include, { force: true });
  const alert = retired.getByRole('alert');
  try {
    await alert.waitFor({ timeout: 3000 });
  } catch {
    fail('swap', 'REFUSED', 'pressing Include announced nothing on the card');
  }
  if (await alert.count()) {
    const text = await alert.innerText();
    if (!text.includes(`This question has an active replacement (Question ${REPLACEMENT_NUMBER}). Remove or retire the replacement before restoring this version.`)) {
      fail('swap', 'REFUSED', `the refusal does not explain itself: "${text.slice(0, 120)}"`);
    }
    await page.waitForTimeout(600);
    // The whole explanation, inside the dialog's scroll area — not under its footer.
    const fully = await page.evaluate(() => {
      const node = document.querySelector('[role="dialog"] [role="alert"]');
      const footer = document.querySelector('[role="dialog"] footer');
      if (!node || !footer) return false;
      const box = node.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= footer.getBoundingClientRect().top + 1;
    });
    if (!fully) fail('swap', 'REFUSED', 'the refusal is not fully visible where the teacher pressed (it runs under the footer or off screen)');
  }
  if (!/EXCLUDED/.test(await retired.innerText())) fail('swap', 'REFUSED', 'the refused Include changed the question anyway');
  if ((await header.innerText()) !== countsBefore) fail('swap', 'REFUSED', `the counts changed (${countsBefore} → ${await header.innerText()})`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${device.id}-refused.png`) });

  await phaseless(async () => {
    await press(page, device, show);
    await page.waitForTimeout(700);
    if (!(await inViewport(page, replacement))) fail('swap', 'SEES', `"Show Question ${REPLACEMENT_NUMBER}" did not bring the replacement into view`);
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-question-card'));
    if (focused !== String(REPLACEMENT_NUMBER)) fail('swap', 'SEES', `focus did not move to Question ${REPLACEMENT_NUMBER} (it is on ${focused || 'nothing'})`);
  }, 'swap', 'SEES');

  // A phase that cannot even be carried out (a control missing because an
  // earlier step already went wrong) is a finding, never a crash that hides
  // the findings before it.
  const phase = async (scenario, rule, run) => {
    try {
      await run();
    } catch (error) {
      fail(scenario, rule, `could not be carried out: ${String(error?.message || error).split('\n')[0]}`);
    }
  };

  await phase('restore', 'RESTORES', async () => {
    await press(page, device, buttonIn(page, REPLACEMENT_NUMBER, 'Exclude'));
    await press(page, device, buttonIn(page, ORIGINAL_NUMBER, 'Include'));
    if (/EXCLUDED/.test(await retired.innerText())) fail('swap', 'RESTORES', 'the original could not be included after its replacement was retired');
    if (!/RETIRED REPLACEMENT/.test(await replacement.innerText())) fail('swap', 'RESTORES', 'the retired replacement is not labelled RETIRED REPLACEMENT');
    await sideways('restore');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${device.id}-restored.png`) });
    await press(page, device, page.getByRole('button', { name: 'Save Assignment Questions', exact: true }));
  });
  try {
    await page.waitForFunction(() => window.__SAVES__?.length === 1, null, { timeout: 5000 });
    const [saved] = await page.evaluate(() => window.__SAVES__);
    const byId = new Map(saved.questions.map((question) => [question.questionId, question]));
    if (byId.get('honors-original')?.teacherExcluded === true) fail('restore', 'RESTORES', 'the save kept the original excluded');
    if (byId.get('honors-replacement')?.teacherExcluded !== true) fail('restore', 'RESTORES', 'the save did not retire the replacement');
    if (byId.get('honors-replacement')?.supersedesQuestionId !== 'honors-original') fail('restore', 'RESTORES', 'the save dropped the replacement\'s link');
    const savedIds = saved.questions.map((question) => question.questionId);
    if (JSON.stringify(savedIds) !== JSON.stringify(swappedQuestions.map((question) => question.questionId))) fail('restore', 'RESTORES', 'a question id or position changed');
  } catch {
    const shown = await page.locator('[role="dialog"]').innerText();
    fail('restore', 'RESTORES', `the restore did not save (${shown.match(/[^\n]*(?:cannot|could not|not be saved)[^\n]*/)?.[0] || 'no error shown'})`);
  }

  /* ---- conflict: a record written before the guard ---- */
  await page.goto(`${ORIGIN}/tests/browser/questionEditorSupersession.html?scenario=conflict`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`[data-question-card="${REPLACEMENT_NUMBER}"]`, { timeout: 20000 });
  await sideways('conflict');
  for (const number of [ORIGINAL_NUMBER, REPLACEMENT_NUMBER]) {
    if (!/2 VERSIONS ACTIVE/.test(await card(page, number).innerText())) fail('conflict', 'CANNOT SAVE', `Question ${number} does not say two versions are active`);
  }
  await phaseless(() => press(page, device, page.getByRole('button', { name: 'Save Assignment Questions', exact: true })), 'conflict', 'CANNOT SAVE');
  await page.waitForTimeout(800);
  const dialogText = await page.locator('[role="dialog"]').innerText();
  if (!/both active versions of the same question/.test(dialogText)) fail('conflict', 'CANNOT SAVE', 'Save gave no reason');
  // Save is in the footer, far from the cards: the refusal must bring the
  // first conflicting card — which explains itself — into view and focus.
  const firstConflict = card(page, Math.min(ORIGINAL_NUMBER, REPLACEMENT_NUMBER));
  if (!(await inViewport(page, firstConflict))) fail('conflict', 'CANNOT SAVE', 'Save refused without bringing the conflicting question into view');
  const conflictFocus = await page.evaluate(() => document.activeElement?.getAttribute('data-question-card'));
  if (conflictFocus !== String(Math.min(ORIGINAL_NUMBER, REPLACEMENT_NUMBER))) fail('conflict', 'CANNOT SAVE', `focus did not move to the first conflicting question (it is on ${conflictFocus || 'nothing'})`);
  if ((await page.evaluate(() => window.__SAVES__.length)) !== 0) fail('conflict', 'CANNOT SAVE', 'two active versions were saved');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${device.id}-conflict.png`) });

  errors.forEach((message) => fail('page', 'ERROR', message));
  await context.close();
  return findings;
};

const browser = await chromium.launch();
const results = [];
try {
  for (const device of DEVICES) {
    const findings = await certify(browser, device);
    results.push({ device: device.id, viewport: `${device.width}x${device.height}`, findings });
    console.log(`${device.id.padEnd(16)} ${findings.length ? `${findings.length} finding(s)` : 'clean'}`);
    findings.forEach((finding) => console.log(`  [${finding.scenario}] ${finding.rule}: ${finding.detail}`));
  }
} finally {
  await browser.close();
}

if (WRITE) {
  writeFileSync(FINDINGS, `${JSON.stringify({
    harness: 'tests/browser/questionEditorSupersession.mjs',
    checks: ['SEES', 'REFUSED', 'RESTORES', 'CANNOT SAVE', 'SIDEWAYS', 'TAP'],
    devices: results.map(({ device, viewport }) => ({ device, viewport })),
    findings: results.flatMap((result) => result.findings),
  }, null, 2)}\n`);
  console.log(`wrote ${path.relative(repo, FINDINGS)}`);
}
if (results.some((result) => result.findings.length)) process.exitCode = 1;
