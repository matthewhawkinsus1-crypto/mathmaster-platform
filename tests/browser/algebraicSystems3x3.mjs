// ISSUE #341: 3×3 SUBSTITUTION + DRAG-ONLY STEP ALGEBRA PREVIEWS, IN A REAL BROWSER.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/algebraicSystems3x3.mjs
//
// Nothing here is typed that a student would not type. The 3×3 question is
// authored in the plain shape #341 asks for (no mode, no per-step metadata),
// opened through QuestionEngine exactly as App.jsx opens it, and solved with
// the real controls: embedded Step Algebra for every isolation, standard form
// and solve; the real token dragged (and select-then-placed) onto the real
// variables; the REAL 2×2 workflow for the reduced subsystem; the real
// verification cards.
//
// Journeys:
//
//   student-3x3        the whole solve, x + y + z = 6 / 2x - y + 3z = 9 /
//                      3x + 2y - z = 4 -> (1, 2, 3), with a leave-and-return
//                      or a full reload at every checkpoint #341 lists
//   preview-negated    Teacher Preview: isolating y puts -(…) into E2; the
//                      group must stay whole with the -1 offered to distribute
//   no-preview/*       Step Algebra -9x + 21 = 1 in Student View and Teacher
//                      Preview: selecting/typing does not preview; an actual
//                      drag and one-sided drop DO show a layout-neutral ghost
//                      preview; committed state changes only after both sides.
//
// Exit code 1 on any finding. Screenshots and a report of every observed value
// land in tests/browser/artifacts/algebraicSystems3x3/.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  balancedMove,
  cancelFactor,
  cancelTerm,
  chooseOperation,
  closeInlineModes,
  combineLikeTerms,
  distribute,
  mathState,
  rewriteTerm,
  setMathField,
  settle,
  simplifySide,
  typeOperand,
  visibleEquation,
} from './stepAlgebraDriver.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/algebraicSystems3x3');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const PAGE = `${ORIGIN}/tests/browser/algebraicSystems3x3.html`;

rmSync(ARTIFACTS, { recursive: true, force: true });
mkdirSync(ARTIFACTS, { recursive: true });

const launchOptions = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
else if (!process.env.PLAYWRIGHT_MODULE) launchOptions.executablePath = '/opt/pw-browsers/chromium';
const browser = await chromium.launch(launchOptions);

const findings = [];
const report = [];
const note = (journey, detail) => findings.push({ journey, detail });
let shotIndex = 0;
const shoot = (page, name) => page.screenshot({ path: path.join(ARTIFACTS, `${String(shotIndex += 1).padStart(2, '0')}-${name}.png`), fullPage: true });

/* ------------------------------------------------------------------ helpers */

const open = async (page, { scope = 'student', q = 0, fresh = true } = {}) => {
  await page.goto(`${PAGE}?scope=${scope}&q=${q}`);
  await page.waitForFunction(() => Boolean(window.__mm341));
  if (fresh) {
    await page.evaluate(() => window.__mm341.clearStorage());
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__mm341));
  }
  await settle(page, 600);
};

const reloadInPlace = async (page) => {
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__mm341));
  await page.waitForSelector('.mathmaster-reduction-workflow', { timeout: 20000 });
  await settle(page, 800);
};

/** Leave the question for another one and come back: a genuine remount. */
const leaveAndReturn = async (page) => {
  await page.evaluate(() => window.__mm341.go(1));
  await settle(page, 600);
  await page.evaluate(() => window.__mm341.go(0));
  await page.waitForSelector('.mathmaster-reduction-workflow', { timeout: 20000 });
  await settle(page, 800);
};

const reduction = async (page) => (await page.evaluate(() => window.__mm341.drafts()))[':work:tool']?.reduction || null;
/** Step Algebra reports completion after its own animation; wait for the draft to hold it. */
const reductionWhen = async (page, predicate, timeout = 8000) => {
  const started = Date.now();
  let state = await reduction(page);
  while (!predicate(state) && Date.now() - started < timeout) {
    await settle(page, 200);
    state = await reduction(page);
  }
  return state;
};
const workflow = (page) => page.locator('.mathmaster-reduction-workflow');
/** The Step Algebra embed that is on screen (a hidden, solved subsystem keeps none mounted). */
const solver = (page) => page.locator('.mathmaster-systems-embedded-step-algebra:visible').first();
const errorText = (page) => page.locator('.mathmaster-systems-substitution-feedback.is-error:visible').allInnerTexts();

const expect = (journey, condition, detail) => { if (!condition) note(journey, detail); return Boolean(condition); };

/** Run one step of a journey; a failure is recorded with a screenshot and ends the journey. */
const step = async (page, journey, name, action) => {
  try {
    await action();
    return true;
  } catch (error) {
    const where = (error.stack || '').split('\n').find((line) => /algebraicSystems3x3\.mjs|stepAlgebraDriver\.mjs/.test(line)) || '';
    note(journey, `${name}: ${error.message.split('\n')[0]} ${where.trim()}`);
    await shoot(page, `FAILED-${journey}-${name.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
    return false;
  }
};

const dragTokenOnto = async (page, token, target) => {
  await token.dragTo(target);
  await settle(page, 500);
};

/**
 * While a token is over a variable, that variable — and only that one — is
 * strongly highlighted. Checked by dispatching the same dragenter a real drag
 * produces, then leaving.
 */
const assertOnlyHoveredVariableHighlighted = async (page, journey, groupLabelPrefix, variable) => {
  const target = page.locator(`[aria-label^="${groupLabelPrefix}"] [data-variable="${variable}"]`).first();
  const handle = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', 'mathmaster-substitution:probe');
    return transfer;
  });
  await target.dispatchEvent('dragenter', { dataTransfer: handle });
  await settle(page, 120);
  const highlighted = await page.locator('.mathmaster-systems-variable-drop.is-drag-over').evaluateAll((elements) => elements.map((element) => `${element.closest('[role="group"]')?.getAttribute('aria-label')}|${element.dataset.variable}`));
  expect(journey, highlighted.length === 1 && highlighted[0].startsWith(groupLabelPrefix) && highlighted[0].endsWith(`|${variable}`), `drag-over highlight should be exactly the hovered ${variable}; saw ${JSON.stringify(highlighted)}`);
  await target.dispatchEvent('dragleave', { dataTransfer: handle });
  await settle(page, 80);
  return highlighted;
};

/* ------------------------------------------------------- 3×3 algebra steps */

/** x + y + z = 6  ->  x = -y - z + 6, with Step Algebra's own controls. */
const isolateXInEquationOne = async (page, journey) => {
  await page.locator('button[aria-label="Isolate x in Equation 1"]').click();
  const host = solver(page);
  await host.waitFor({ timeout: 15000 });
  // The embedded instance obeys the same no-preview rule as standalone Step Algebra.
  const before = await visibleEquation(host);
  await chooseOperation(page, host, 'Subtract');
  await typeOperand(page, host, 'y');
  await host.locator('button.algebra-pickup-button').click();
  await host.locator('[aria-label$="on the left side"]').first().click();
  await settle(page, 300);
  const oneSided = await visibleEquation(host);
  expect(journey, JSON.stringify(before) === JSON.stringify(oneSided), `embedded Step Algebra changed the equation after a one-sided placement: ${JSON.stringify(before)} -> ${JSON.stringify(oneSided)}`);
  await host.locator('[aria-label$="on the right side"]').first().click();
  await settle(page, 500);
  await cancelTerm(page, host, '- y');
  await balancedMove(page, host, 'Subtract', 'z');
  await cancelTerm(page, host, '- z');
  await page.locator('text=Isolated expression ready').waitFor({ timeout: 10000 });
};

const useFormAsToken = async (page) => {
  await page.locator('button', { hasText: 'Use this form as the token' }).click();
  await page.locator('.mathmaster-systems-substitution-token').waitFor({ timeout: 5000 });
};

/** R1: 2(-y - z + 6) - y + 3z = 9  ->  -3y + z = -3. */
const standardizeR1 = async (page, { pauseAfterDistribution = null } = {}) => {
  await page.locator('button', { hasText: 'Simplify R₁' }).click();
  await settle(page, 700);
  await distribute(page, solver(page));
  if (pauseAfterDistribution) await pauseAfterDistribution();
  const host = solver(page);
  await rewriteTerm(page, host, 'left', /^2 \(-y\)$/, '-2y');
  await rewriteTerm(page, host, 'left', /2 \(-z\)$/, '-2z');
  await rewriteTerm(page, host, 'left', /2 \(6\)$/, '12');
  await combineLikeTerms(page, host, 'left', /y$/, '-3y');
  await combineLikeTerms(page, host, 'left', /z$/, 'z');
  await closeInlineModes(page, host);
  await balancedMove(page, host, 'Subtract', '12');
  await cancelTerm(page, host, '- 12');
  await simplifySide(page, host, 'right', '-3');
};

/** R2: 3(-y - z + 6) + 2y - z = 4  ->  -y - 4z = -14. */
const standardizeR2 = async (page, { pauseAfterDistribution = null } = {}) => {
  const open = page.locator('button', { hasText: 'Simplify R₂' });
  if (await open.count()) await open.click();
  await settle(page, 700);
  await distribute(page, solver(page));
  if (pauseAfterDistribution) await pauseAfterDistribution();
  const host = solver(page);
  await rewriteTerm(page, host, 'left', /^3 \(-y\)$/, '-3y');
  await rewriteTerm(page, host, 'left', /3 \(-z\)$/, '-3z');
  await rewriteTerm(page, host, 'left', /3 \(6\)$/, '18');
  await combineLikeTerms(page, host, 'left', /y$/, '-y');
  await combineLikeTerms(page, host, 'left', /z$/, '-4z');
  await closeInlineModes(page, host);
  await balancedMove(page, host, 'Subtract', '18');
  await cancelTerm(page, host, '- 18');
  await simplifySide(page, host, 'right', '-14');
};

const subsystem = (page) => page.locator('.mathmaster-algebraic-subsystem');

/** Inside the REAL 2×2 workflow: isolate z in R1, substitute into R2, solve y, back-substitute, solve z. */
const solveReducedSubsystem = async (page, journey, { pauseMidSolve = null } = {}) => {
  const sub = subsystem(page);
  await sub.locator('button[aria-label="Isolate z in R₁"]').click();
  let host = solver(page);
  await host.waitFor({ timeout: 15000 });
  await balancedMove(page, host, 'Add', '3y');
  await cancelTerm(page, host, '+ 3 y');
  await sub.locator('text=Isolated expression ready').waitFor({ timeout: 10000 });
  await sub.locator('button', { hasText: 'Use this form as the token' }).click();
  const token = sub.locator('.mathmaster-systems-substitution-token');
  await token.waitFor();
  const tokenBox = await token.boundingBox();
  expect(journey, tokenBox && tokenBox.height <= 64 && tokenBox.width <= 320, `subsystem token is not compact: ${JSON.stringify(tokenBox)}`);
  await dragTokenOnto(page, token, sub.locator('[aria-label^="R₂: choose where"] [data-variable="z"]'));
  host = solver(page);
  await host.waitFor({ timeout: 15000 });
  if (pauseMidSolve) await pauseMidSolve();
  host = solver(page);
  // -y - 4(-3 + 3y) = -14
  await distribute(page, host);
  await rewriteTerm(page, host, 'left', /-4 \(-3\)|4 \(-3\)/, '12');
  await rewriteTerm(page, host, 'left', /4 \(3/, '-12y');
  await combineLikeTerms(page, host, 'left', /y$/, '-13y');
  await closeInlineModes(page, host);
  await balancedMove(page, host, 'Subtract', '12');
  await cancelTerm(page, host, '- 12');
  await simplifySide(page, host, 'right', '-26');
  await balancedMove(page, host, 'Divide by', '-13');
  await cancelFactor(page, host);
  await simplifySide(page, host, 'right', '2');
  // Back-substitute y = 2 into R1 and solve for z.
  const valueToken = sub.locator('.mathmaster-systems-substitution-token');
  await valueToken.waitFor({ timeout: 10000 });
  await valueToken.click();
  await sub.locator('[aria-label^="R₁: choose where the solved value"] [data-variable="y"]').click();
  await settle(page, 600);
  host = solver(page);
  await host.waitFor({ timeout: 15000 });
  await rewriteTerm(page, host, 'left', /3 \(2\)|3 \* 2/, '-6');
  await closeInlineModes(page, host);
  await balancedMove(page, host, 'Add', '6');
  await cancelTerm(page, host, '+ 6');
  await simplifySide(page, host, 'right', '3');
};

const placeValue = async (page, how, tokenLocator, targetLocator) => {
  if (how === 'drag') await dragTokenOnto(page, tokenLocator, targetLocator);
  else {
    await tokenLocator.click();
    await targetLocator.click();
    await settle(page, 300);
  }
};

/* ----------------------------------------------------------------- journey */

const runFull3x3 = async (context, scope) => {
  const journey = `${scope}-3x3`;
  const observed = { journey };
  const page = await context.newPage();
  page.on('pageerror', (error) => note(journey, `uncaught page error: ${error.message}`));
  await open(page, { scope });
  await page.waitForSelector('.mathmaster-reduction-workflow', { timeout: 20000 });

  const ok = await step(page, journey, 'initial view', async () => {
    observed.badge = await page.locator('text=Algebraic Systems (3×3 Substitution)').count();
    expect(journey, observed.badge === 1, 'the 3×3 question did not route to the 3×3 substitution workspace');
    observed.originals = await page.locator('.mathmaster-reduction-reference [data-equation-id]').count();
    expect(journey, observed.originals === 3, `expected three original equations in the reference column, saw ${observed.originals}`);
    expect(journey, !(await page.locator('button', { hasText: 'Elimination' }).count()), 'elimination was offered on a 3×3 system');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(journey, overflow <= 1, `page scrolls horizontally by ${overflow}px`);
    await shoot(page, `${scope}-01-initial`);
  });
  if (!ok) { report.push(observed); await page.close(); return; }

  if (!(await step(page, journey, 'isolate x in E1', async () => {
    await isolateXInEquationOne(page, journey);
    await shoot(page, `${scope}-02-isolated`);
  }))) { report.push(observed); await page.close(); return; }

  if (!(await step(page, journey, 'leave after isolating, return', async () => {
    await leaveAndReturn(page);
    expect(journey, await page.locator('text=Isolated expression ready').count(), 'isolation was lost on leave-and-return');
    await useFormAsToken(page);
    observed.token = await page.locator('.mathmaster-systems-substitution-token').getAttribute('aria-label');
    expect(journey, /-y - z \+ 6/.test(observed.token || ''), `token is not the student's isolated expression in plain notation: ${observed.token}`);
    const box = await page.locator('.mathmaster-systems-substitution-token').boundingBox();
    expect(journey, box && box.height <= 64 && box.width <= 320, `token is not compact: ${JSON.stringify(box)}`);
    // Nothing is pre-highlighted before the token is picked up.
    observed.preHighlighted = await page.locator('.mathmaster-systems-variable-drop.is-armed, .mathmaster-systems-variable-drop.is-drag-over').count();
    expect(journey, observed.preHighlighted === 0, `${observed.preHighlighted} variables were highlighted before the token was picked up`);
    await assertOnlyHoveredVariableHighlighted(page, journey, 'Equation 3: choose where', 'z');
  }))) { report.push(observed); await page.close(); return; }

  if (!(await step(page, journey, 'neutral rejections', async () => {
    const token = page.locator('.mathmaster-systems-substitution-token');
    await token.click();
    await page.locator('[aria-label^="Equation 2: choose where"] [data-variable="y"]').click();
    await settle(page, 300);
    expect(journey, (await errorText(page)).some((text) => /does not match the isolated equation/.test(text)), 'dropping the x-expression on y was not rejected');
    await page.locator('button', { hasText: 'Carry this equation over unchanged' }).first().click();
    await settle(page, 300);
    expect(journey, (await errorText(page)).some((text) => /still contains x/.test(text)), 'carrying over an equation that contains x was not rejected');
  }))) { report.push(observed); await page.close(); return; }

  if (!(await step(page, journey, 'universal Undo takes back one substitution target', async () => {
    await dragTokenOnto(page, page.locator('.mathmaster-systems-substitution-token'), page.locator('[aria-label^="Equation 2: choose where"] [data-variable="x"]'));
    expect(journey, (await reduction(page))?.targets?.E2, 'the first substitution was not recorded');
    await page.locator('button:visible', { hasText: 'Undo' }).first().click();
    await settle(page, 500);
    const undone = await reduction(page);
    expect(journey, !undone?.targets?.E2 && undone?.isolation?.tokenExpression, `Undo should take back only the E2 substitution: ${JSON.stringify(undone?.targets)}`);
    expect(journey, await page.locator('[aria-label^="Equation 2: choose where"]').count() === 1, 'Equation 2 did not return as a drop target after Undo');
  }))) { report.push(observed); await page.close(); return; }

  if (!(await step(page, journey, 'substitute into E2 by drag, then reload', async () => {
    await dragTokenOnto(page, page.locator('.mathmaster-systems-substitution-token'), page.locator('[aria-label^="Equation 2: choose where"] [data-variable="x"]'));
    const state = await reduction(page);
    observed.afterFirstTarget = state?.targets;
    expect(journey, state?.targets?.E2?.mode === 'substituted' && /2 \* \(-y - z \+ 6\)/.test(state.targets.E2.rawText), `E2 substitution not recorded: ${JSON.stringify(state?.targets)}`);
    expect(journey, await page.locator('.mathmaster-systems-substitution-token').count() === 1, 'the token must stay available for the second target');
    expect(journey, /Reduced equations 0 of 2/.test(await workflow(page).innerText()), 'progress should read Reduced equations 0 of 2');
    await shoot(page, `${scope}-03-one-target-substituted`);
    await reloadInPlace(page);
    const reloaded = await reduction(page);
    expect(journey, reloaded?.targets?.E2?.rawText === state?.targets?.E2?.rawText, 'the one completed target did not survive a reload');
    expect(journey, await page.locator('.mathmaster-systems-substitution-token').count() === 1, 'the token was lost across the reload');
  }))) { report.push(observed); await page.close(); return; }

  if (!(await step(page, journey, 'substitute into E3 by select-then-place', async () => {
    await placeValue(page, 'click', page.locator('.mathmaster-systems-substitution-token'), page.locator('[aria-label^="Equation 3: choose where"] [data-variable="x"]'));
    const state = await reduction(page);
    expect(journey, state?.targets?.E3?.mode === 'substituted', 'E3 substitution not recorded');
    expect(journey, !(await page.locator('.mathmaster-systems-substitution-token').count()), 'the token should retire once both targets have it');
  }))) { report.push(observed); await page.close(); return; }

  if (!(await step(page, journey, 'standardize R1 (leave mid-solve)', async () => {
    await standardizeR1(page, {
      pauseAfterDistribution: async () => {
        const mid = await mathState(solver(page));
        await leaveAndReturn(page);
        const back = await mathState(solver(page));
        expect(journey, mid === back, `Step Algebra work on R1 did not survive leave-and-return: ${mid} -> ${back}`);
      },
    });
    const state = await reductionWhen(page, (value) => value?.targets?.E2?.standardText);
    observed.r1 = state?.targets?.E2?.standardText;
    expect(journey, /-3\s*y\s*\+\s*z\s*=\s*-3/.test(observed.r1 || ''), `R1 standard form not recorded: ${observed.r1}`);
    await shoot(page, `${scope}-04-r1-standard-form`);
  }))) { report.push(observed); await page.close(); return; }

  if (!(await step(page, journey, 'standardize R2', async () => {
    await standardizeR2(page);
    const state = await reductionWhen(page, (value) => value?.targets?.E3?.standardText);
    observed.r2 = state?.targets?.E3?.standardText;
    expect(journey, /-\s*y\s*-\s*4\s*z\s*=\s*-14/.test(observed.r2 || ''), `R2 standard form not recorded: ${observed.r2}`);
    await subsystem(page).waitFor({ timeout: 10000 });
    observed.subsystemEquations = await subsystem(page).locator('.mathmaster-algebraic-subsystem-equation').allInnerTexts();
    expect(journey, observed.subsystemEquations.length === 2, `reduced subsystem should show two equations, saw ${observed.subsystemEquations.length}`);
    expect(journey, await page.locator('.mathmaster-reduction-reference [data-equation-id]').count() === 3, 'the originals must stay visible as reference once the subsystem appears');
    await shoot(page, `${scope}-05-reduced-subsystem`);
    await reloadInPlace(page);
    expect(journey, await subsystem(page).count() === 1 && await subsystem(page).isVisible(), 'the reduced subsystem did not come back after a reload');
  }))) { report.push(observed); await page.close(); return; }

  if (!(await step(page, journey, 'solve the reduced 2×2 with the real 2×2 workflow', async () => {
    await solveReducedSubsystem(page, journey, {
      pauseMidSolve: async () => {
        await leaveAndReturn(page);
        expect(journey, await solver(page).count(), 'the subsystem one-variable solve did not reopen after leave-and-return');
      },
    });
    await page.locator('.mathmaster-reduction-back-stage').waitFor({ timeout: 10000 });
    observed.valueChips = await page.locator('.mathmaster-reduction-value-chip').allInnerTexts();
    expect(journey, observed.valueChips.includes('y = 2') && observed.valueChips.includes('z = 3'), `solved values not shown: ${JSON.stringify(observed.valueChips)}`);
    expect(journey, !(await subsystem(page).isVisible()), 'the solved subsystem should collapse out of the way');
    await shoot(page, `${scope}-06-subsystem-solved`);
  }))) { report.push(observed); await page.close(); return; }

  if (!(await step(page, journey, 'back-substitute into the isolated relationship and solve x', async () => {
    const back = page.locator('.mathmaster-reduction-back-stage');
    const tokenFor = (name) => back.locator(`.mathmaster-systems-substitution-token[aria-label$="for ${name}"]`);
    const relation = back.locator('[aria-label^="Isolated relationship: place"]');
    await placeValue(page, 'click', tokenFor('y'), relation.locator('[data-variable="z"]'));
    expect(journey, (await errorText(page)).some((text) => /different variable/.test(text)), 'placing y on z was not rejected');
    await placeValue(page, 'drag', tokenFor('y'), relation.locator('[data-variable="y"]'));
    await reloadInPlace(page);
    await placeValue(page, 'click', page.locator('.mathmaster-reduction-back-stage .mathmaster-systems-substitution-token[aria-label$="for z"]'), page.locator('[aria-label^="Isolated relationship: place"] [data-variable="z"]'));
    const host = solver(page);
    await host.waitFor({ timeout: 15000 });
    observed.backSolveStart = await mathState(host);
    expect(journey, /x/.test(observed.backSolveStart || '') && /6/.test(observed.backSolveStart || ''), `back-substitution solve did not open on the relationship: ${observed.backSolveStart}`);
    // Not calculated for the student: x = -2 - 3 + 6 is still to simplify.
    expect(journey, !/^\s*x\s*=\s*1\s*$/.test(observed.backSolveStart || ''), 'the back-substitution result was calculated for the student');
    await combineLikeTerms(page, host, 'right', /\d$/, '1');
    await page.locator('.mathmaster-systems-verification-stage').waitFor({ timeout: 10000 });
    const state = await reductionWhen(page, (value) => value?.back?.solved);
    observed.back = state?.back;
    expect(journey, state?.back?.solved?.value === 1, `x not recorded as 1: ${JSON.stringify(state?.back)}`);
    await shoot(page, `${scope}-07-back-substituted`);
  }))) { report.push(observed); await page.close(); return; }

  if (!(await step(page, journey, 'verify in all three original equations', async () => {
    const verify = page.locator('.mathmaster-systems-verification-stage');
    const tokenFor = (name) => verify.locator(`.mathmaster-systems-substitution-token[aria-label$="for ${name}"]`);
    const card = (id) => verify.locator(`[data-verify-id="${id}"]`);
    // One wrong placement first: the guard still works here.
    await placeValue(page, 'click', tokenFor('x'), card('E1').locator('[data-variable="y"]'));
    expect(journey, (await errorText(page)).some((text) => /different variable/.test(text)), 'placing x on y during verification was not rejected');
    const sides = { E1: ['6', '6'], E2: ['9', '9'], E3: ['4', '4'] };
    for (const [id, [left, right]] of Object.entries(sides)) {
      for (const [index, name] of ['x', 'y', 'z'].entries()) {
        await placeValue(page, index % 2 ? 'click' : 'drag', tokenFor(name), card(id).locator(`[data-variable="${name}"]`));
      }
      if (id === 'E2') await leaveAndReturn(page);
      await setMathField(page, page.locator(`math-field[aria-label="Equation ${id.slice(1)} left side value"]`), left);
      await setMathField(page, page.locator(`math-field[aria-label="Equation ${id.slice(1)} right side value"]`), right);
      await card(id).locator('button', { hasText: `Check equation ${id.slice(1)}` }).click();
      await settle(page, 300);
      expect(journey, /Both sides check out/.test(await card(id).innerText()), `${id} did not verify`);
    }
    await shoot(page, `${scope}-08-verified`);
  }))) { report.push(observed); await page.close(); return; }

  await step(page, journey, 'check my work', async () => {
    await workflow(page).locator('button', { hasText: 'Check my work' }).click();
    await settle(page, 800);
    observed.result = await page.locator('text=Correct').count();
    expect(journey, observed.result > 0, 'the completed 3×3 was not graded correct');
    observed.triple = await page.locator('.mathmaster-reduction-ordered-triple').innerText();
    expect(journey, /\(1, 2, 3\)/.test(observed.triple), `ordered triple not shown as (1, 2, 3): ${observed.triple}`);
    await shoot(page, `${scope}-09-complete`);
  });
  report.push(observed);
  await page.close();
};

/** Reset Question clears the whole 3×3 workflow, nested drafts included. */
const runReset = async (context) => {
  const journey = 'student-reset';
  const page = await context.newPage();
  page.on('pageerror', (error) => note(journey, `uncaught page error: ${error.message}`));
  await open(page, { scope: 'student' });
  await page.waitForSelector('.mathmaster-reduction-workflow', { timeout: 20000 });
  const observed = { journey };
  await step(page, journey, 'reset after isolating and substituting', async () => {
    await isolateXInEquationOne(page, journey);
    await useFormAsToken(page);
    await placeValue(page, 'click', page.locator('.mathmaster-systems-substitution-token'), page.locator('[aria-label^="Equation 2: choose where"] [data-variable="x"]'));
    observed.before = Object.keys(await page.evaluate(() => window.__mm341.drafts()));
    // The harness mounts no ToastProvider, so the platform confirm falls back
    // to the native dialog; accept it the way a student confirms the reset.
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('button:visible', { hasText: 'Reset Question' }).first().click();
    await settle(page, 900);
    observed.after = await reduction(page);
    expect(journey, !observed.after?.source, `Reset Question left 3×3 work behind: ${JSON.stringify(observed.after)}`);
    expect(journey, await page.locator('button[aria-label="Isolate x in Equation 1"]').count() === 1, 'Reset Question did not return to the first decision');
    const nested = Object.entries(await page.evaluate(() => window.__mm341.drafts())).filter(([key, value]) => /reduction:isolate/.test(key) && value);
    expect(journey, nested.length === 0, `nested Step Algebra drafts survived Reset Question: ${JSON.stringify(nested.map(([key]) => key))}`);
    await shoot(page, 'student-reset');
  });
  report.push(observed);
  await page.close();
};

/** Teacher Preview: a subtracted substitution keeps its group and offers the -1 to the student. */
const runNegatedGroup = async (context) => {
  const journey = 'preview-negated-group';
  const page = await context.newPage();
  page.on('pageerror', (error) => note(journey, `uncaught page error: ${error.message}`));
  await open(page, { scope: 'teacherPreview' });
  await page.waitForSelector('.mathmaster-reduction-workflow', { timeout: 20000 });
  const observed = { journey };
  await step(page, journey, 'isolate y in E1 and substitute into E2', async () => {
    await page.locator('button[aria-label="Isolate y in Equation 1"]').click();
    const host = solver(page);
    await host.waitFor({ timeout: 15000 });
    await balancedMove(page, host, 'Subtract', 'x');
    await cancelTerm(page, host, '- x');
    await balancedMove(page, host, 'Subtract', 'z');
    await cancelTerm(page, host, '- z');
    await useFormAsToken(page);
    await placeValue(page, 'click', page.locator('.mathmaster-systems-substitution-token'), page.locator('[aria-label^="Equation 2: choose where"] [data-variable="y"]'));
    await page.locator('button', { hasText: 'Simplify R₁' }).click();
    await settle(page, 800);
    const standardizer = solver(page);
    observed.state = await mathState(standardizer);
    observed.factor = await standardizer.locator('.algebra-inline-factor-token').first().evaluate((element) => [...element.querySelectorAll('math-span, math-div')].map((math) => math.textContent).join(' ') || element.textContent).catch(() => '');
    expect(journey, /1\\left\(/.test(observed.state || ''), `the subtracted group was not kept whole: ${observed.state}`);
    expect(journey, /-\s*1|−\s*1/.test(observed.factor), `the -1 factor was not offered for distribution: ${JSON.stringify(observed.factor)}`);
    await shoot(page, 'preview-negated-group-kept-whole');
  });
  report.push(observed);
  await page.close();
};

/**
 * The global rule, on standalone Step Algebra: -9x + 21 = 1, subtract 21.
 * Hover (a real pointer drag) and one-sided placement leave the equation text
 * alone; placing the second side changes it once, to -9x + 21 - 21 = 1 - 21.
 */
const runNoPreview = async (context, scope) => {
  const journey = `no-preview-${scope}`;
  const page = await context.newPage();
  page.on('pageerror', (error) => note(journey, `uncaught page error: ${error.message}`));
  await open(page, { scope, q: 2 });
  const host = page.locator('[aria-label="Interactive algebra balance scale"]').locator('xpath=ancestor::section[1]');
  await host.waitFor({ timeout: 20000 });
  const observed = { journey };
  await step(page, journey, 'stage subtract 21 without changing the equation', async () => {
    const committed = await visibleEquation(host);
    const committedState = await mathState(host);
    observed.committed = committed;
    await chooseOperation(page, host, 'Subtract');
    expect(journey, JSON.stringify(await visibleEquation(host)) === JSON.stringify(committed), 'choosing Subtract changed the equation');
    await typeOperand(page, host, '21');
    expect(journey, JSON.stringify(await visibleEquation(host)) === JSON.stringify(committed), 'typing the operand changed the equation');
    expect(journey, await host.locator('.algebra-live-math-preview').count() === 0, 'typing alone showed a drag/drop preview');

    // A real pointer drag from the pick-up button over each side.
    const pickup = host.locator('button.algebra-pickup-button');
    const start = await pickup.boundingBox();
    const left = await host.locator('.algebra-equation-box').nth(0).boundingBox();
    const right = await host.locator('.algebra-equation-box').nth(1).boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(left.x + left.width * 0.55, left.y + left.height * 0.52, { steps: 12 });
    await settle(page, 250);
    observed.hoverCue = await host.locator('.algebra-placement-cue.is-hover, .algebra-term-placement-cue.is-hover').count();
    observed.hoverPreview = await host.locator('.algebra-live-math-preview.is-hover[data-preview-side="left"]').count();
    observed.hovering = await visibleEquation(host);
    expect(journey, JSON.stringify(observed.hovering) === JSON.stringify(committed), `hovering the left side changed committed equation text: ${JSON.stringify(observed.hovering)}`);
    expect(journey, observed.hoverCue > 0, 'no placement cue showed where the operation would land');
    expect(journey, observed.hoverPreview === 1, 'the mathematical drag preview did not appear over the left side');
    await shoot(page, `${journey}-1-hover-left`);
    await page.mouse.move(right.x + right.width * 0.45, right.y + right.height * 0.52, { steps: 12 });
    await settle(page, 200);
    expect(journey, JSON.stringify(await visibleEquation(host)) === JSON.stringify(committed), 'hovering the right side changed the equation');
    await page.mouse.move(left.x + left.width * 0.55, left.y + left.height * 0.52, { steps: 12 });
    await page.mouse.up();
    await settle(page, 400);

    observed.oneSided = await visibleEquation(host);
    observed.marker = await host.locator('.algebra-placement-marker').allInnerTexts();
    observed.stagedPreview = await host.locator('.algebra-live-math-preview.is-staged[data-preview-side="left"]').count();
    expect(journey, JSON.stringify(observed.oneSided) === JSON.stringify(committed), `placing on ONE side changed committed equation text: ${JSON.stringify(observed.oneSided)}`);
    expect(journey, (await mathState(host)) === committedState, 'the committed equation state changed after a one-sided placement');
    expect(journey, observed.stagedPreview === 1, 'the dropped operation did not remain visibly previewed on the staged side');
    expect(journey, observed.marker.some((text) => /21/.test(text) && /placed/.test(text)), `the placed side was not marked: ${JSON.stringify(observed.marker)}`);
    await shoot(page, `${journey}-2-one-side-placed`);

    await host.locator('[aria-label$="on the right side"]').first().click().catch(async () => {
      await host.locator('button.algebra-pickup-button').click();
      await host.locator('[aria-label$="on the right side"]').first().click();
    });
    await settle(page, 600);
    observed.committedMove = await visibleEquation(host);
    const text = observed.committedMove.join(' | ');
    expect(journey, (text.match(/21/g) || []).length >= 3, `after both sides were placed the unsimplified operation did not appear: ${text}`);
    await shoot(page, `${journey}-3-both-sides-placed`);
  });
  report.push(observed);
  await page.close();
};

/* -------------------------------------------------------------------- main */

// JOURNEYS=student-3x3,no-preview runs a subset while iterating locally.
const only = (process.env.JOURNEYS || '').split(',').map((value) => value.trim()).filter(Boolean);
const wanted = (name) => !only.length || only.some((prefix) => name.startsWith(prefix));
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
if (wanted('no-preview')) {
  await runNoPreview(context, 'student');
  await runNoPreview(context, 'teacherPreview');
}
if (wanted('preview-negated')) await runNegatedGroup(context);
if (wanted('student-3x3')) await runFull3x3(context, 'student');
if (wanted('teacherPreview-3x3')) await runFull3x3(context, 'teacherPreview');
if (wanted('student-reset')) await runReset(context);
await context.close();

// A Chromebook-width and a phone-width look at the finished workspace.
for (const [name, viewport] of wanted('layout') ? [['chromebook', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]] : []) {
  const responsive = await browser.newContext({ viewport });
  const page = await responsive.newPage();
  await open(page, { scope: 'student' });
  await page.waitForSelector('.mathmaster-reduction-workflow', { timeout: 20000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) note(`layout-${name}`, `page scrolls horizontally by ${overflow}px at ${viewport.width}px`);
  await shoot(page, `layout-${name}`);
  report.push({ journey: `layout-${name}`, overflow });
  await responsive.close();
}

await browser.close();

writeFileSync(path.join(ARTIFACTS, 'report.json'), `${JSON.stringify({ findings, journeys: report }, null, 2)}\n`);
for (const row of report) console.log(`${row.journey}: ${JSON.stringify(row).slice(0, 220)}`);
if (findings.length) {
  console.error(`\n${findings.length} finding(s):`);
  findings.forEach((finding) => console.error(`  [${finding.journey}] ${finding.detail}`));
  process.exit(1);
}
console.log(`\n#341 certification: ${report.length} journeys passed.`);
