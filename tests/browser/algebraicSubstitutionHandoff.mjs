// ISSUE #334: DOES CLASSWORK Q2 REACH STEP ALGEBRA? ASKED OF A REAL BROWSER.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/algebraicSubstitutionHandoff.mjs
//
// Five fixes to this handoff passed their unit tests and failed in class,
// because each test typed its own token string. This driver types nothing the
// platform would not: it isolates x with Step Algebra's own controls, lets the
// workspace build the token from whatever Step Algebra reports, and drops that
// token on x in Equation 2 — then requires the embedded one-variable solve to
// open on an equation equivalent to 3(-3 + 2y) + 5y = 24, with the
// distribution still left for the student.
//
// Journeys, because each failed or could fail for a different reason:
//
//   student-fresh            isolate -> token -> HTML5 drag onto x -> solver
//   student-leave-return     Q2 -> Q1 -> Q2 must come back to the open solver
//   student-old-draft        the exact draft recorded on the broken build
//                            (token already made), reloaded, then dropped
//   student-old-draft-simplify  the same draft before the token was made, taking
//                            the optional "Simplify first" route the error
//                            message recommends
//   preview-fresh            Teacher Preview, select-then-place instead of drag,
//                            including a wrong destination first
//   preview-old-draft        the broken draft under the teacher-preview key
//
// Exit code 1 on any finding. Screenshots and a report of every observed value
// land in tests/browser/artifacts/algebraicSubstitutionHandoff/.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { latexToExpression } from '../../src/algebraAstEngine.js';
import { linearEquationCoefficients } from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/algebraicSubstitutionHandoff');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const PAGE = `${ORIGIN}/tests/browser/algebraicSubstitutionHandoff.html`;
const CAPTURE = JSON.parse(readFileSync(path.join(repo, 'tests/platform/fixtures/classworkQ2RuntimeCapture.json'), 'utf8'));
const BROKEN_DRAFT = CAPTURE.persistedDraft;

mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const findings = [];
const report = [];
const note = (journey, detail) => findings.push({ journey, detail });

/* ------------------------------------------------------------------ helpers */

const openFresh = async (page, { scope = 'student', seed = null } = {}) => {
  const url = `${PAGE}?scope=${scope}`;
  await page.goto(url);
  await page.waitForFunction(() => Boolean(window.__mmHandoff));
  await page.evaluate(() => window.__mmHandoff.clearStorage());
  if (seed) {
    await page.evaluate((records) => {
      Object.entries(records).forEach(([suffix, value]) => window.__mmHandoff.seedDraft(suffix, value));
    }, seed);
  }
  // A reload re-evaluates every module, so only what is really in storage can
  // come back — the same as a student opening the assignment the next day.
  await page.reload();
  await page.waitForSelector('.mathmaster-algebraic-system-workflow', { timeout: 20000 });
  await page.waitForTimeout(300);
};

const solver = (page) => page.locator('.mathmaster-systems-embedded-step-algebra');
const workTrailChips = (page) => page.locator('.mathmaster-systems-completed-chip').allInnerTexts();
const errorFeedback = (page) => page.locator('.mathmaster-systems-substitution-feedback.is-error').allInnerTexts();

/** Isolate x in Equation 1 with Step Algebra's own controls: +2y on both sides, cancel the zero pair. */
const isolateXWithStepAlgebra = async (page) => {
  await page.locator('button', { hasText: 'Isolate x' }).first().click();
  const host = solver(page);
  await host.waitFor({ timeout: 15000 });
  await host.locator('button[aria-label="Choose Add operation"]').first().click();
  const operand = host.locator('math-field').first();
  await operand.waitFor();
  // Real MathLive field; the student typed 2y.
  await operand.evaluate((field, value) => {
    field.setValue(value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }, CAPTURE.studentOperand);
  await page.waitForTimeout(250);
  await host.locator('button.algebra-pickup-button').click();
  await host.locator('[aria-label$="on the left side"]').first().click();
  await page.waitForTimeout(400);
  await host.locator('[aria-label$="on the right side"]').first().click();
  await page.waitForTimeout(600);
  // The added 2y term, selected to cancel against -2y.
  await host.locator('[aria-label^="+ 2"][aria-label$="select to cancel"]').first().click();
  await page.locator('text=Isolated expression ready').waitFor({ timeout: 10000 });
};

const useIsolatedFormAsToken = async (page) => {
  await page.locator('button', { hasText: 'Use this form as the token' }).click();
  await page.locator('.mathmaster-systems-substitution-token').waitFor({ timeout: 5000 });
};

const equationTwoVariable = (page, variable) => page.locator(`[aria-label^="Equation 2: choose where"] [data-variable="${variable}"]`);

const dropTokenOnEquationTwoX = async (page, how) => {
  const token = page.locator('.mathmaster-systems-substitution-token');
  if (how === 'drag') {
    await token.dragTo(equationTwoVariable(page, 'x'));
  } else {
    await token.click();
    await equationTwoVariable(page, 'x').click();
  }
  await page.waitForTimeout(900);
};

/**
 * THE ACCEPTANCE CHECK. The one-variable Step Algebra solve for y is on screen,
 * on an equation equivalent to 3(-3 + 2y) + 5y = 24, and it has not been
 * solved or distributed for the student.
 */
const assertStepAlgebraOpenedForY = async (page, journey) => {
  const observed = { journey };
  observed.errors = await errorFeedback(page);
  if (observed.errors.length) note(journey, `substitution error shown: ${observed.errors.join(' | ')}`);

  const host = solver(page);
  if (!(await host.count())) {
    note(journey, 'the embedded Step Algebra solve did not open after the drop');
    report.push(observed);
    return observed;
  }
  observed.solverHeading = (await host.locator('> div').first().innerText()).trim();
  if (!/solve for y/i.test(observed.solverHeading)) note(journey, `solver is not solving for y: "${observed.solverHeading}"`);

  const drafts = await page.evaluate(() => window.__mmHandoff.drafts());
  observed.substitution = drafts[':work:tool']?.substitution || null;
  observed.isolation = drafts[':work:tool']?.isolation || null;
  const stored = observed.substitution?.equationText;
  const storedCoefficients = stored ? linearEquationCoefficients(stored, ['x', 'y']) : null;
  if (observed.substitution?.targetVariable !== 'x' || observed.substitution?.targetEquationIndex !== 1) {
    note(journey, `substitution not recorded on x in Equation 2: ${JSON.stringify(observed.substitution)}`);
  }
  if (!storedCoefficients || storedCoefficients.a !== 0 || storedCoefficients.b !== 11 || storedCoefficients.c !== 33) {
    note(journey, `stored reduced equation is not 3(-3 + 2y) + 5y = 24: ${stored}`);
  }

  observed.solverState = await host.locator('[data-math-state]').first().getAttribute('data-math-state');
  const onScreen = linearEquationCoefficients(latexToExpression(observed.solverState), ['x', 'y']);
  if (!onScreen || onScreen.a !== 0 || onScreen.b !== 11 || onScreen.c !== 33) {
    note(journey, `Step Algebra shows an equation that is not 3(-3 + 2y) + 5y = 24: ${observed.solverState}`);
  }
  // Not auto-solved: the grouped expression is still there, and distributing
  // it is offered to the student as their own move.
  observed.distributionOffered = await host.locator('[aria-label^="Pick up the factor"]').count();
  if (!/\\left\(/.test(observed.solverState || '') || !observed.distributionOffered) {
    note(journey, `the substituted group was not left for the student to distribute (state ${observed.solverState})`);
  }

  observed.workTrail = await workTrailChips(page);
  if (observed.workTrail.some((chip) => chip.includes('~'))) note(journey, `work trail shows LaTeX spacing: ${JSON.stringify(observed.workTrail)}`);
  report.push(observed);
  return observed;
};

const assertTokenIsPlainMath = async (page, journey) => {
  const label = await page.locator('.mathmaster-systems-substitution-token').getAttribute('aria-label');
  const chips = await workTrailChips(page);
  if (/~/.test(label || '')) note(journey, `token carries LaTeX spacing: ${label}`);
  if (chips.some((chip) => chip.includes('~'))) note(journey, `isolation chip carries LaTeX spacing: ${JSON.stringify(chips)}`);
};

const shoot = (page, name) => page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: true });

/* ----------------------------------------------------------------- journeys */

const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (error) => note('page', `uncaught page error: ${error.message}`));

// 1. Student View, fresh question state, real HTML5 drag.
await openFresh(page, { scope: 'student' });
await isolateXWithStepAlgebra(page);
await useIsolatedFormAsToken(page);
await assertTokenIsPlainMath(page, 'student-fresh');
await dropTokenOnEquationTwoX(page, 'drag');
await assertStepAlgebraOpenedForY(page, 'student-fresh');
await shoot(page, 'student-fresh');

// 2. Leave Q2 and come back: a genuine remount of the workspace.
await page.evaluate(() => window.__mmHandoff.go(0));
await page.waitForTimeout(600);
await page.evaluate(() => window.__mmHandoff.go(1));
await page.waitForSelector('.mathmaster-algebraic-system-workflow', { timeout: 15000 });
await page.waitForTimeout(600);
await assertStepAlgebraOpenedForY(page, 'student-leave-return');
await shoot(page, 'student-leave-return');

// 3. The exact draft recorded on the broken build, token already created.
await openFresh(page, { scope: 'student', seed: BROKEN_DRAFT });
await assertTokenIsPlainMath(page, 'student-old-draft');
await dropTokenOnEquationTwoX(page, 'drag');
await assertStepAlgebraOpenedForY(page, 'student-old-draft');
await shoot(page, 'student-old-draft');

// 4. The same draft one step earlier (token not yet made), taking the optional
//    "Simplify first" route with a correct rewrite.
{
  const workTool = BROKEN_DRAFT[':work:tool'];
  const beforeToken = {
    ...BROKEN_DRAFT,
    ':work:tool': { ...workTool, isolation: { ...workTool.isolation, tokenExpression: null } },
  };
  await openFresh(page, { scope: 'student', seed: beforeToken });
  await page.locator('button', { hasText: 'Simplify first (optional)' }).click();
  const field = page.locator('math-field[aria-label="Optional simplified expression for the substitution token"]');
  await field.waitFor();
  await field.evaluate((element) => {
    element.setValue('2y-3');
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  await page.locator('button', { hasText: 'Check and use my simplification' }).click();
  await page.waitForTimeout(400);
  if (await page.locator('text=That rewrite is not equivalent').count()) {
    note('student-old-draft-simplify', 'a correct rewrite 2y - 3 was rejected as not equivalent');
  } else {
    await dropTokenOnEquationTwoX(page, 'click');
    await assertStepAlgebraOpenedForY(page, 'student-old-draft-simplify');
  }
  await shoot(page, 'student-old-draft-simplify');
}

// 5. Teacher Preview, fresh, select-then-place (the touch/keyboard route),
//    trying a wrong destination first so the guard is proven to still work.
await openFresh(page, { scope: 'teacherPreview' });
await isolateXWithStepAlgebra(page);
await useIsolatedFormAsToken(page);
await assertTokenIsPlainMath(page, 'preview-fresh');
await page.locator('.mathmaster-systems-substitution-token').click();
await equationTwoVariable(page, 'y').click();
await page.waitForTimeout(400);
if (!(await errorFeedback(page)).some((text) => /does not match the isolated equation/.test(text))) {
  note('preview-fresh', 'dropping the x-expression on y was not rejected');
}
await dropTokenOnEquationTwoX(page, 'click');
await assertStepAlgebraOpenedForY(page, 'preview-fresh');
await shoot(page, 'preview-fresh');

// 6. Teacher Preview holding the broken draft under its own key.
await openFresh(page, { scope: 'teacherPreview', seed: BROKEN_DRAFT });
await assertTokenIsPlainMath(page, 'preview-old-draft');
await dropTokenOnEquationTwoX(page, 'drag');
await assertStepAlgebraOpenedForY(page, 'preview-old-draft');
await shoot(page, 'preview-old-draft');

await browser.close();

writeFileSync(path.join(ARTIFACTS, 'report.json'), `${JSON.stringify({ findings, journeys: report }, null, 2)}\n`);
for (const row of report) {
  console.log(`${row.journey}: ${row.solverHeading || '(no solver)'} · ${row.solverState || '-'} · distribution offered: ${Boolean(row.distributionOffered)}`);
}
if (findings.length) {
  console.error(`\n${findings.length} finding(s):`);
  findings.forEach((finding) => console.error(`  [${finding.journey}] ${finding.detail}`));
  process.exit(1);
}
console.log(`\nClasswork Q2 substitution handoff: ${report.length} journeys reached the one-variable Step Algebra solve.`);
