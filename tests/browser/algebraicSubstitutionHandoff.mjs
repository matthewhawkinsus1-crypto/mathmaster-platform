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

const openFresh = async (page, { scope = 'student', seed = null, questionIndex = 1 } = {}) => {
  const url = `${PAGE}?scope=${scope}&q=${questionIndex}`;
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

/**
 * PR #336 visual contract. Distribution for a substituted system must happen
 * on the balance equation itself — never in the old standalone distribution
 * card. While the inline mode owns the equation, the balance operation rails
 * must also be hidden so the student has one clear workspace.
 */
const assertStableEquationFit = async (page, journey) => {
  const content = solver(page).locator('.algebra-expression-fit-content').first();
  const samples = [];
  for (let index = 0; index < 5; index += 1) {
    if (index) await page.waitForTimeout(120);
    samples.push(await content.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        width: box.width,
        x: box.x,
      };
    }));
  }
  const spread = (key) => Math.max(...samples.map((sample) => sample[key])) - Math.min(...samples.map((sample) => sample[key]));
  const fontSpread = spread('fontSize');
  const widthSpread = spread('width');
  const xSpread = spread('x');
  if (fontSpread > 0.5 || widthSpread > 1.5 || xSpread > 1.5) {
    note(journey, `equation auto-fit is visually pulsing: ${JSON.stringify({ fontSpread, widthSpread, xSpread, samples })}`);
  }
  return { fontSpread, widthSpread, xSpread };
};

const assertInlineDistributionWorkspace = async (page, journey) => {
  const host = solver(page);
  const stage = host.locator('.algebra-equation-stage');
  const observed = {
    inlineFactorTokens: await stage.locator('.algebra-inline-factor-token').count(),
    inlineTargets: await stage.locator('.algebra-inline-distribution-target').count(),
    legacyDistributionPanels: await host.locator('.algebra-distribution-tool').count(),
    operationRails: await host.locator('.algebra-rail').count(),
  };
  if (observed.inlineFactorTokens !== 1) {
    note(journey, `expected one inline factor token inside the equation, saw ${observed.inlineFactorTokens}`);
  }
  if (observed.inlineTargets !== 2) {
    note(journey, `expected two inline distribution targets inside the equation, saw ${observed.inlineTargets}`);
  }
  if (observed.legacyDistributionPanels) {
    note(journey, `legacy standalone distribution panel is still visible (${observed.legacyDistributionPanels})`);
  }
  if (observed.operationRails) {
    note(journey, `balance operation rails should be hidden during inline distribution, saw ${observed.operationRails}`);
  }

  observed.sideFits = await stage.locator('.algebra-expression-anchor').evaluateAll((anchors) => anchors.map((anchor) => {
    const viewport = anchor.querySelector('.algebra-expression-fit-viewport');
    const content = anchor.querySelector('.algebra-expression-fit-content');
    if (!viewport || !content) return { fits: false, viewportWidth: 0, contentWidth: 0 };
    const viewportBox = viewport.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    return {
      fits: contentBox.width <= viewportBox.width + 2,
      viewportWidth: Math.round(viewportBox.width),
      contentWidth: Math.round(contentBox.width),
      fontSize: Number.parseFloat(getComputedStyle(content).fontSize),
    };
  }));
  observed.sideFits.forEach((fit, index) => {
    if (!fit.fits) note(journey, `equation side ${index + 1} is clipped instead of fit: ${JSON.stringify(fit)}`);
  });
  return observed;
};

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

// 7. PR #336 direct-manipulation acceptance: prove the exact screen the
//    teacher requested, then actually perform the distribution and open the
//    inline Rewrite / Simplify interaction. These screenshots are the visual
//    release evidence for the workflow.
await openFresh(page, { scope: 'teacherPreview' });
await isolateXWithStepAlgebra(page);
await useIsolatedFormAsToken(page);
await dropTokenOnEquationTwoX(page, 'click');
await assertStepAlgebraOpenedForY(page, 'preview-inline-workspace');
const inlineObserved = await assertInlineDistributionWorkspace(page, 'preview-inline-workspace');
const inlineHost = solver(page);
// Force the equation close to its fit boundary, where the old ResizeObserver
// feedback loop visibly bounced the numbers larger/smaller.
const originalViewport = page.viewportSize();
await page.setViewportSize({ width: 900, height: Math.max(820, originalViewport?.height || 900) });
await page.waitForTimeout(350);
inlineObserved.stability = await assertStableEquationFit(page, 'preview-inline-workspace');
const distributionFontSize = Number.parseFloat(await inlineHost.locator('.algebra-expression-fit-content').first().evaluate((element) => getComputedStyle(element).fontSize));
await shoot(page, 'inline-distribution-open');

// Compare the exact same equation with distribution mode closed. The typography
// should remain visually stable; direct-manipulation mode may remove operation
// chrome, but it must not make the mathematics suddenly tiny.
await inlineHost.locator('button', { hasText: 'Distribute' }).click();
await page.waitForTimeout(250);
const regularFontSize = Number.parseFloat(await inlineHost.locator('.algebra-expression-fit-content').first().evaluate((element) => getComputedStyle(element).fontSize));
if (Math.abs(regularFontSize - distributionFontSize) > 2) {
  note('preview-inline-workspace', `distribution typography changed too much: regular ${regularFontSize}px vs distribution ${distributionFontSize}px`);
}
await shoot(page, 'inline-regular-equation');
await inlineHost.locator('button', { hasText: 'Distribute' }).click();
await page.waitForTimeout(250);


const factor = inlineHost.locator('.algebra-inline-factor-token');
await factor.click();
const targets = inlineHost.locator('.algebra-inline-distribution-target');
await targets.nth(0).click();
await targets.nth(1).click();
await page.waitForTimeout(250);
const commitInline = inlineHost.locator('button', { hasText: 'Commit distribution' });
if (!(await commitInline.count())) {
  note('preview-inline-workspace', 'Commit distribution did not appear after the factor was placed on both terms');
} else {
  await shoot(page, 'inline-distribution-ready-to-commit');
  await commitInline.click();
  await page.waitForTimeout(450);
  await shoot(page, 'inline-distribution-committed');

  const stateAfterDistribution = await inlineHost.locator('[data-math-state]').first().getAttribute('data-math-state');
  if (!stateAfterDistribution || /-9|6\s*y/.test(stateAfterDistribution)) {
    note('preview-inline-workspace', `distribution auto-simplified a product: ${stateAfterDistribution}`);
  }
  if (!/3/.test(stateAfterDistribution || '') || !/2/.test(stateAfterDistribution || '')) {
    note('preview-inline-workspace', `distributed products are not visibly preserved for student work: ${stateAfterDistribution}`);
  }

  await inlineHost.locator('button', { hasText: 'Rewrite / Simplify' }).click();
  await page.waitForTimeout(200);
  const rewritePanelCount = await inlineHost.locator('.algebra-rewrite-tool').count();
  const selectableTerms = await inlineHost.locator('[aria-label$="select as the term you want to rewrite"]').count();
  const railsInRewriteMode = await inlineHost.locator('.algebra-rail').count();
  if (rewritePanelCount) note('preview-inline-workspace', 'legacy Rewrite / Simplify panel opened instead of inline term mode');
  if (selectableTerms < 3) note('preview-inline-workspace', `expected neutral inline term tokens, saw only ${selectableTerms}`);
  if (railsInRewriteMode) note('preview-inline-workspace', `operation rails remained visible in inline rewrite mode (${railsInRewriteMode})`);
  await shoot(page, 'inline-rewrite-mode');
}
report.push({ journey: 'preview-inline-ui', ...inlineObserved });

// 8. Uniformity contract: the back-substitution Step Algebra instance must use
// the same inline Rewrite / Simplify interaction as the first one-variable
// solve. Seed only the already-completed upstream systems state; the embedded
// back-sub solver itself is mounted fresh.
{
  const workTool = BROKEN_DRAFT[':work:tool'];
  const backSubSeed = {
    ':work:tool': {
      ...workTool,
      selection: { equationIndex: 0, variable: 'x' },
      isolation: {
        ...workTool.isolation,
        expression: '-3 + 2y',
        tokenExpression: '-3 + 2y',
      },
      substitution: {
        targetVariable: 'x',
        targetEquationIndex: 1,
        equationText: '3*(-3 + 2*y) + 5*y = 24',
      },
      firstSolved: { variable: 'y', value: 3 },
      backSub: { equationIndex: 0 },
      secondSolved: { variable: null, value: null },
    },
  };
  await openFresh(page, { scope: 'teacherPreview', seed: backSubSeed });
  const backHost = solver(page);
  await backHost.waitFor({ timeout: 15000 });
  await backHost.locator('button', { hasText: 'Rewrite / Simplify' }).click();
  await page.waitForTimeout(250);
  const legacyRewrite = await backHost.locator('.algebra-rewrite-tool').count();
  const inlineTerms = await backHost.locator('[aria-label$="select as the term you want to rewrite"]').count();
  const backRails = await backHost.locator('.algebra-rail').count();
  if (legacyRewrite) note('preview-backsub-uniform', 'back-substitution opened the legacy Rewrite / Simplify panel');
  if (inlineTerms < 2) note('preview-backsub-uniform', `back-substitution did not expose inline term tokens (${inlineTerms})`);
  if (backRails) note('preview-backsub-uniform', `operation rails remained visible while inline rewrite owned back-substitution (${backRails})`);
  await shoot(page, 'inline-backsub-rewrite-mode');
}

// 9. Exact symbolic-value contract. This recreates the live system from the
// teacher screenshot at the point where x = 20/9 has been solved. The parent
// systems workflow must carry that exact expression into the token, work
// history, and back-substitution equation instead of decimalizing it.
{
  const exactSeed = {
    ':work:tool': {
      method: 'substitution',
      selection: { equationIndex: 0, variable: 'y' },
      isolation: {
        expression: '(7 - 2*x)/(-1)',
        tokenExpression: '2*x - 7',
        simplificationDraft: '2x - 7',
        simplifying: false,
        simplificationChecked: true,
        simplificationValid: true,
      },
      substitution: {
        targetVariable: 'y',
        targetEquationIndex: 1,
        equationText: '-3*x - 3*(2*x - 7) = 1',
      },
      multipliers: { 0: '1', 1: '1' },
      appliedMultipliers: { 0: false, 1: false },
      multiplierWork: {
        0: { active: false, a: '', b: '', c: '', checked: false, valid: false },
        1: { active: false, a: '', b: '', c: '', checked: false, valid: false },
      },
      combination: {
        operation: null,
        attempts: 0,
        coefficients: null,
        text: null,
        pendingCoefficients: null,
        cancelledRows: { 0: false, 1: false },
      },
      firstSolved: { variable: 'x', value: 20 / 9, expression: '20/9' },
      specialCase: null,
      backSub: { equationIndex: null },
      secondSolved: { variable: null, value: null, expression: null },
      verification: {
        0: { placed: {}, leftAnswer: '', rightAnswer: '', checked: false, valid: false },
        1: { placed: {}, leftAnswer: '', rightAnswer: '', checked: false, valid: false },
      },
      methodEfficiencyReason: '',
    },
  };
  await openFresh(page, { scope: 'teacherPreview', seed: exactSeed, questionIndex: 2 });
  const exactToken = page.locator('.mathmaster-systems-substitution-token');
  await exactToken.waitFor({ timeout: 10000 });
  const exactTokenLabel = await exactToken.getAttribute('aria-label');
  if (!/20\/9/.test(exactTokenLabel || '')) {
    note('preview-exact-fraction', `back-substitution token lost exact 20/9 form: ${exactTokenLabel}`);
  }
  if (/2\.222/.test(exactTokenLabel || '')) {
    note('preview-exact-fraction', `back-substitution token exposed decimal approximation: ${exactTokenLabel}`);
  }

  const exactChips = await workTrailChips(page);
  const chipText = exactChips.join(' | ');
  if (!/20\s*\/\s*9/.test(chipText)) {
    note('preview-exact-fraction', `work trail does not preserve x = 20/9: ${chipText}`);
  }
  if (!/2\s*x\s*-\s*7/.test(chipText.replace(/·/g, ''))) {
    note('preview-exact-fraction', `work trail does not show the student's simplified y = 2x - 7 form: ${chipText}`);
  }
  if (/2\.222|\*|\(\(\(/.test(chipText)) {
    note('preview-exact-fraction', `work trail exposes decimal or machine syntax: ${chipText}`);
  }
  await shoot(page, 'exact-fraction-backsub-token');

  await exactToken.click();
  await page.locator('[aria-label^="Equation 2: choose where"] [data-variable="x"]').click();
  await page.waitForTimeout(600);
  const exactBackHost = solver(page);
  await exactBackHost.waitFor({ timeout: 10000 });
  const exactBackState = await exactBackHost.locator('[data-math-state]').first().getAttribute('data-math-state');
  if (/2\.222/.test(exactBackState || '')) {
    note('preview-exact-fraction', `back-substitution equation decimalized 20/9: ${exactBackState}`);
  }
  if (!/20/.test(exactBackState || '') || !/9/.test(exactBackState || '')) {
    note('preview-exact-fraction', `back-substitution equation lost exact fraction structure: ${exactBackState}`);
  }
  await shoot(page, 'exact-fraction-backsub-equation');
}

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
