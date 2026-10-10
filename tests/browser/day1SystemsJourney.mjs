// ISSUE #361: THE DAY 1 3×3 LESSON, SOLVED THE WAY A STUDENT SOLVES IT.
//
//   npx vite --host 127.0.0.1 --port 5199 --strictPort &
//   AUDIT_ORIGIN=http://127.0.0.1:5199 node tests/browser/day1SystemsJourney.mjs
//
//   (PLAYWRIGHT_MODULE=<path to playwright/index.mjs> and CHROMIUM_PATH=<chrome>
//    when the defaults below are not installed.)
//
// The live assignment's own questions (day1SystemsJourneyQuestions.json),
// mounted through QuestionEngine by day1SystemsJourneyMain.jsx, solved with
// the real controls — every scale factor, product, sign, cancellation and
// combined term typed or chosen, every Step Algebra move made — through to a
// graded submission:
//
//   classwork-elimination   CW2, the guided solve: eliminate y from two pairs
//                           that need no scaling; the reduced 2×2 by
//                           elimination WITH a scale factor; back-substitute;
//                           verify in all three originals. A reload in the
//                           middle of round 2 must reopen exactly there.
//   practice-scaling        PR3 ("requires thoughtful scaling"): every pair
//                           needs a factor. Unsolvable by elimination before
//                           #361 — the scale-factor field never appeared.
//   dol-scaling             The DOL, under DOL rules, through a route whose
//                           second round needs a factor (the only kind of
//                           second round this system has).
//   three-plane-choice      CW1: the chosen interpretation is visibly chosen.
//
// On every screen: no student-facing "token", no product previewed in a
// placeholder, finished rounds still on the page, and the reduced 2×2 names
// its equations R₁ and R₂. Exit code 1 on any finding; screenshots in
// tests/browser/artifacts/day1SystemsJourney/.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  balancedMove,
  cancelFactor,
  cancelTerm,
  closeInlineModes,
  combineLikeTerms,
  setMathField,
  settle,
  simplifySide,
} from './stepAlgebraDriver.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const ARTIFACTS = path.join(repo, 'tests/browser/artifacts/day1SystemsJourney');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';
const PAGE = `${ORIGIN}/tests/browser/day1SystemsJourney.html`;

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
const expect = (journey, condition, detail) => { if (!condition) note(journey, detail); return Boolean(condition); };

const step = async (page, journey, name, action) => {
  try {
    await action();
    return true;
  } catch (error) {
    const where = (error.stack || '').split('\n').find((line) => /day1SystemsJourney\.mjs|stepAlgebraDriver\.mjs/.test(line)) || '';
    note(journey, `${name}: ${error.message.split('\n')[0]} ${where.trim()}`);
    await shoot(page, `FAILED-${journey}-${name.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
    return false;
  }
};

/* ------------------------------------------------------------ navigation */

const open = async (page, section, index, { fresh = false } = {}) => {
  await page.goto(`${PAGE}?s=${section}&q=${index}`);
  await page.waitForFunction(() => Boolean(window.__mm361));
  if (fresh) {
    await page.evaluate(() => window.__mm361.clearStorage());
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__mm361));
  }
  await settle(page, 900);
};

const reloadInPlace = async (page) => {
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__mm361));
  await page.waitForSelector('.mathmaster-reduction-workflow', { timeout: 20000 });
  await settle(page, 900);
};

/* ------------------------------------------------- what every screen owes */

const studentText = (page) => page.evaluate(() => {
  const root = document.querySelector('.mathmaster-reduction-layout') || document.body;
  const labels = [...root.querySelectorAll('[aria-label], [title], [placeholder]')].map((element) => [
    element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('placeholder'),
  ].filter(Boolean).join(' '));
  return `${root.innerText}\n${labels.join('\n')}`;
});

const auditScreen = async (page, journey, where) => {
  const text = await studentText(page);
  expect(journey, !/\btokens?\b/i.test(text), `${where}: student-facing text says "token": ${(text.match(/.{0,50}\btokens?\b.{0,30}/i) || [''])[0]}`);
};

/* ------------------------------------------------------ the 3×3 rounds */

const workflow = (page) => page.locator('.mathmaster-reduction-workflow');
const board = (page, roundKey) => page.locator(`.mathmaster-elim-round[data-round="${roundKey}"]`);

const chooseVariable = async (page, variable) => {
  await workflow(page).locator(`button[aria-label="Eliminate ${variable}"]`).first().click();
  await settle(page, 400);
};
const choosePair = async (page, label) => {
  await workflow(page).getByRole('button', { name: label, exact: true }).first().click();
  await settle(page, 500);
};

/** Scale one equation of a round: open its editor, type and apply the factor, distribute term by term, check. */
const scaleEquation = async (page, roundKey, equationLabel, factor, products, journey) => {
  const round = board(page, roundKey);
  await round.locator(`button[aria-label="Scale ${equationLabel}"]`).click();
  await settle(page, 300);
  const factorField = round.locator(`math-field[aria-label="Scale factor for ${equationLabel}"]`);
  // The regression #361 is about: this field must exist, and must still exist after the next render.
  await factorField.waitFor({ timeout: 4000 });
  await settle(page, 300);
  expect(journey, await factorField.isVisible(), `${roundKey}: the scale factor field for ${equationLabel} vanished after opening`);
  await setMathField(page, factorField, factor);
  await round.getByRole('button', { name: 'Apply this factor' }).click();
  await settle(page, 400);
  for (const [key, value] of Object.entries(products)) {
    const label = key === 'constant' ? `Scaled right side for ${equationLabel}` : `Scaled ${key} term for ${equationLabel}`;
    const field = round.locator(`math-field[aria-label="${label}"]`);
    const placeholder = await field.getAttribute('placeholder');
    expect(journey, !placeholder || !placeholder.replace(/\\text\{|\}/g, '').includes(value.replace(/^-/, '')) || placeholder.includes('term') || placeholder.includes('value'),
      `${roundKey}: the placeholder of ${label} previews the product (${placeholder})`);
    await setMathField(page, field, value);
  }
  await round.getByRole('button', { name: 'Check my scaled terms' }).click();
  await settle(page, 500);
  expect(journey, (await round.locator('.mathmaster-elim-badge').allInnerTexts()).some((text) => text.includes(factor)),
    `${roundKey}: ${equationLabel} does not show its ·${factor} after the products were checked`);
};

/** Choose + or −, mark both target terms, type the combined row, check. */
const combineRound = async (page, roundKey, operation, [labelA, labelB], variable, terms, journey) => {
  const round = board(page, roundKey);
  const operationLabel = operation === 'add' ? `Add ${labelB} to ${labelA}` : `Subtract ${labelB} from ${labelA}`;
  await round.locator(`button[aria-label="${operationLabel}"]`).click();
  await settle(page, 400);
  const marks = round.locator(`button[aria-label^="Mark the ${variable} term"]`);
  expect(journey, (await marks.count()) === 2, `${roundKey}: expected two ${variable} terms to mark, found ${await marks.count()}`);
  await marks.first().click();
  await settle(page, 250);
  await round.locator(`button[aria-label^="Mark the ${variable} term"]`).first().click();
  await settle(page, 500);
  for (const [key, value] of Object.entries(terms)) {
    const label = key === 'constant' ? 'Combined right side' : `Combined ${key} term`;
    await setMathField(page, round.locator(`math-field[aria-label="${label}"]`), value);
  }
  await round.getByRole('button', { name: 'Check my combination' }).click();
  await settle(page, 700);
  expect(journey, await round.evaluate((element) => element.classList.contains('is-complete')), `${roundKey}: the round did not complete`);
};

/* ------------------------------------------------------ the reduced 2×2 */

const subsystem = (page) => page.locator('.mathmaster-reduction-subsystem');
const solver = (page) => page.locator('.mathmaster-systems-embedded-step-algebra:visible').first();

const subsystemElimination = async (page, variable, journey) => {
  const sub = subsystem(page);
  await sub.getByRole('button', { name: 'Elimination', exact: true }).click();
  await settle(page, 500);
  await sub.getByRole('button', { name: `Eliminate ${variable}`, exact: true }).click();
  await settle(page, 500);
  const trail = await sub.locator('.mathmaster-systems-work-trail-steps').innerText();
  expect(journey, !/Verify/.test(trail), `reduced 2×2 still shows its own Verify step: ${trail.replace(/\s+/g, ' ')}`);
};

// The reduced 2×2 is drawn with the same board as a 3×3 pair round: "Scale"
// under the row's label, the factor field and its distribution under that
// row, + / − beside the second row, both cancelling terms marked in place,
// and what remains typed on the line under the rule (no Confirm press).
const subsystemScale = async (page, rName, factor, products, journey) => {
  const sub = subsystem(page);
  await sub.locator(`button[aria-label="Scale ${rName}"]`).click();
  await settle(page, 300);
  await setMathField(page, sub.locator(`math-field[aria-label="Scale factor for ${rName}"]`), factor);
  await sub.getByRole('button', { name: 'Apply this factor' }).click();
  await settle(page, 500);
  for (const [key, value] of Object.entries(products)) {
    const label = key === 'constant' ? `Scaled right side for ${rName}` : `Scaled ${key} term for ${rName}`;
    const field = sub.locator(`math-field[aria-label="${label}"]`);
    const placeholder = String(await field.getAttribute('placeholder') || '');
    expect(journey, !placeholder.includes(value), `2×2: the placeholder of ${label} is the answer itself (${placeholder})`);
    await setMathField(page, field, value);
  }
  await sub.getByRole('button', { name: 'Check my scaled terms' }).click();
  await settle(page, 500);
  expect(journey, (await sub.locator('.mathmaster-elim-badge').allInnerTexts()).some((text) => text.includes(factor)),
    `2×2: ${rName} does not show its ·${factor} after the products were checked`);
};

const subsystemCombine = async (page, operation, variable, coefficient, rightSide) => {
  const sub = subsystem(page);
  await sub.locator(`button[aria-label="${operation === 'add' ? 'Add R₂ to R₁' : 'Subtract R₂ from R₁'}"]`).click();
  await settle(page, 500);
  await sub.locator('button[aria-label^="Mark the "][aria-pressed="false"]').first().click();
  await settle(page, 200);
  await sub.locator('button[aria-label^="Mark the "][aria-pressed="false"]').first().click();
  await settle(page, 500);
  await setMathField(page, sub.locator(`math-field[aria-label="Combined ${variable} term"]`), coefficient);
  await setMathField(page, sub.locator('math-field[aria-label="Combined right side"]'), rightSide);
  await sub.getByRole('button', { name: 'Check my combination' }).click();
  await settle(page, 900);
};

/** "3z = 12" -> z = 4: divide, cancel, simplify the right side. */
const divideOut = async (page, divisor, result) => {
  const host = solver(page);
  await balancedMove(page, host, 'Divide by', divisor);
  await cancelFactor(page, host);
  // 3/3 on the right is its own matching pair; 12/3 is arithmetic to simplify.
  const rightFactors = host.locator('.algebra-equation-box').nth(1).locator('[aria-label$="mark this factor for cancellation"]');
  if (await rightFactors.count()) {
    await rightFactors.first().click();
    await settle(page, 800);
  }
  if (await host.locator('math-field[aria-label="Right side: enter your simplification"]').count()) {
    await simplifySide(page, host, 'right', result);
  }
};

/** Every "a * b" product Step Algebra shows after a substitution, multiplied out by the student. */
const simplifyProducts = async (page, host, products) => {
  const PRODUCT = 'select to multiply its numbers';
  for (const [match, value] of products) {
    if (!(await host.locator(`[aria-label$="${PRODUCT}"]`).count())) {
      const toggle = host.locator('button', { hasText: 'Simplify arithmetic' }).first();
      if (!(await toggle.count())) return;
      await toggle.click();
      await settle(page, 250);
    }
    const term = host.locator(`[aria-label$="${PRODUCT}"]`).filter({ hasText: '' });
    const labels = await term.evaluateAll((elements) => elements.map((element) => element.dataset.termText));
    const index = labels.findIndex((label) => match.test(label));
    if (index < 0) continue;
    await term.nth(index).click();
    await settle(page, 250);
    await setMathField(page, host.locator('math-field[aria-label="Enter the product of these numbers"]'), value);
    await host.getByRole('button', { name: 'Check', exact: true }).first().click();
    await settle(page, 500);
  }
  const toggle = host.locator('button', { hasText: 'Simplify arithmetic' }).first();
  if (await toggle.count() && (await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
  await settle(page, 200);
};

/** Back-substitute the 2×2's first value into R₁ or R₂ by select-then-place. */
const subsystemBackSubstitute = async (page, value, rIndex, variable) => {
  const sub = subsystem(page);
  await sub.locator(`button[aria-label="Pick up the solved value ${value}"]`).click();
  await settle(page, 200);
  await sub.locator('.mathmaster-systems-backsub-equations > div').nth(rIndex)
    .locator(`button[aria-label="Variable ${variable}. Place the selected value or expression here"]`).click();
  await settle(page, 900);
};

/* ------------------------------------------- back-substitute + verify */

const placeValue = async (page, scopeLocator, variable) => {
  await workflow(page).locator(`button[aria-label^="Pick up solved value"][aria-label$="for ${variable}"]`).first().click();
  await settle(page, 150);
  await scopeLocator.locator(`button[aria-label="Variable ${variable}. Place the selected value or expression here"]`).first().click();
  await settle(page, 350);
};

const backSubstitute = async (page, destinationId, knownVariables) => {
  const destination = page.locator(`[data-destination-id="${destinationId}"]`);
  for (const variable of knownVariables) await placeValue(page, destination, variable);
  await settle(page, 900);
};

// #369: a solved value is placed on its variable ONCE and goes into every
// original equation that has that variable, and a side that is already a
// number is shown as given — so three placements, then one simplified side
// per equation. Every equation is still simplified and checked on its own.
const verifyAll = async (page, journey, sides) => {
  const cards = page.locator('[data-verify-id]');
  for (const variable of ['x', 'y', 'z']) {
    const open = cards.filter({ has: page.locator(`button[aria-label="Variable ${variable}. Place the selected value or expression here"]`) });
    await placeValue(page, open.first(), variable);
  }
  const substituted = await cards.filter({ hasText: 'Values substituted' }).count();
  expect(journey, substituted === sides.length, `three placements substituted into ${substituted} of ${sides.length} original equations`);
  for (const [index, [left, right]] of sides.entries()) {
    const card = page.locator(`[data-verify-id="E${index + 1}"]`);
    await setMathField(page, card.locator(`math-field[aria-label="Equation ${index + 1} left side value"]`), left);
    const rightField = card.locator(`math-field[aria-label="Equation ${index + 1} right side value"]`);
    const givenRight = card.locator('[data-given-side="right"]');
    expect(journey, (await rightField.count()) === 0 && (await givenRight.count()) === 1, `equation ${index + 1}: the right side ${right} is a number but still has to be retyped`);
    if (await rightField.count()) await setMathField(page, rightField, right);
    await card.getByRole('button', { name: `Check equation ${index + 1}` }).click();
    await settle(page, 400);
  }
};

const submitAndGrade = async (page, questionId) => {
  await workflow(page).getByRole('button', { name: 'Check my work' }).first().click();
  await settle(page, 1200);
  const grades = await page.evaluate(() => window.__mm361.grades());
  return grades.filter((grade) => grade.questionId === questionId).pop() || null;
};

/* ============================================================ journeys */

async function classworkElimination(context) {
  const journey = 'classwork-elimination';
  const page = await context.newPage();
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page, 'classwork', 1, { fresh: true });

  await step(page, journey, 'round 1: eliminate y from E1 and E2 by adding', async () => {
    await chooseVariable(page, 'y');
    await choosePair(page, 'Equation 1 and Equation 2');
    await auditScreen(page, journey, 'round 1 open');
    await combineRound(page, 'round1', 'add', ['Equation 1', 'Equation 2'], 'y', { x: 'x', z: '3z', constant: '18' }, journey);
  });
  await step(page, journey, 'round 2 part-way, then a reload', async () => {
    await choosePair(page, 'Equation 2 and Equation 3');
    await board(page, 'round2').locator('button[aria-label="Add Equation 3 to Equation 2"]').click();
    await settle(page, 400);
    await board(page, 'round2').locator('button[aria-label^="Mark the y term"]').first().click();
    await settle(page, 1500);
    await reloadInPlace(page);
    const marked = await board(page, 'round2').locator('button[aria-label^="Unmark the y term"]').count();
    expect(journey, marked === 1, `after a reload round 2 should reopen with one y term marked; found ${marked}`);
    expect(journey, await board(page, 'round1').evaluate((element) => element.classList.contains('is-complete')), 'after a reload round 1 is not shown as finished work');
    await board(page, 'round2').locator('button[aria-label^="Mark the y term"]').first().click();
    await settle(page, 400);
    for (const [label, value] of [['Combined x term', '2x'], ['Combined z term', '3z'], ['Combined right side', '21']]) {
      await setMathField(page, board(page, 'round2').locator(`math-field[aria-label="${label}"]`), value);
    }
    await board(page, 'round2').getByRole('button', { name: 'Check my combination' }).click();
    await settle(page, 900);
  });
  await step(page, journey, 'both rounds stay on the page as written work', async () => {
    const complete = await page.locator('.mathmaster-elim-round.is-complete').count();
    expect(journey, complete === 2, `expected both finished rounds on the page, found ${complete}`);
    await shoot(page, 'cw2-rounds-written');
  });
  await step(page, journey, 'reduced 2×2 by elimination, with a scale factor on R₁', async () => {
    // R₁: x + 3z = 18, R₂: 2x + 3z = 21. Eliminate x: 2·R₁ − R₂ → 3z = 15.
    await subsystemElimination(page, 'x', journey);
    await subsystemScale(page, 'R₁', '2', { x: '2x', z: '6z', constant: '36' }, journey);
    await auditScreen(page, journey, 'reduced 2×2 scaling');
    await subsystemCombine(page, 'subtract', 'z', '3', '15');
    await divideOut(page, '3', '5');
  });
  await step(page, journey, 'reduced 2×2 back-substitution: z = 5 into R₁', async () => {
    await subsystemBackSubstitute(page, '5', 0, 'z');
    const host = solver(page);
    // x + 3(5) = 18 → "x + 15 = 18" after Step Algebra's own display; subtract 15.
    await balancedMove(page, host, 'Subtract', '15');
    await cancelTerm(page, host, '- 15');
    await simplifySide(page, host, 'right', '3');
  });
  await step(page, journey, 'the solved 2×2 folds away but can be reopened', async () => {
    const summary = page.locator('.mathmaster-reduction-subsystem-solved');
    await summary.waitFor({ timeout: 8000 });
    expect(journey, /x = 3/.test(await summary.innerText()) && /z = 5/.test(await summary.innerText()), `solved summary: ${await summary.innerText()}`);
    await summary.getByRole('button', { name: 'Show my 2×2 work' }).click();
    await settle(page, 300);
    expect(journey, await subsystem(page).isVisible(), 'Show my 2×2 work did not reveal the 2×2');
    await summary.getByRole('button', { name: 'Hide my 2×2 work' }).click();
    await settle(page, 300);
  });
  await step(page, journey, 'back-substitute into E2 and solve for y', async () => {
    await backSubstitute(page, 'E2', ['x', 'z']);
    const host = solver(page);
    await combineLikeTerms(page, host, 'left', /^(-3|\+ 5)$/, '2');
    await closeInlineModes(page, host);
    await balancedMove(page, host, 'Subtract', '2');
    await cancelTerm(page, host, '- 2');
    await simplifySide(page, host, 'right', '1');
  });
  await step(page, journey, 'verify (3, 1, 5) and submit', async () => {
    await verifyAll(page, journey, [['15', '15'], ['3', '3'], ['18', '18']]);
    await auditScreen(page, journey, 'verification');
    const grade = await submitAndGrade(page, '3x3-d1-cw-2');
    report.push({ journey, grade: grade && { isCorrect: grade.isCorrect, solution: grade.details?.solution } });
    expect(journey, grade?.isCorrect === true, `CW2 was not graded correct: ${JSON.stringify(grade && { isCorrect: grade.isCorrect, solution: grade.details?.solution })}`);
    await shoot(page, 'cw2-complete');
  });
  await page.close();
}

async function practiceScaling(context) {
  const journey = 'practice-scaling';
  const page = await context.newPage();
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page, 'practice', 2, { fresh: true });
  // 2x + 3y − z = 9 · 3x − 2y + 2z = −3 · x + 4y + 3z = 6  →  (1, 2, −1)
  await step(page, journey, 'round 1: 2·E1 + E2 eliminates z', async () => {
    await chooseVariable(page, 'z');
    await choosePair(page, 'Equation 1 and Equation 2');
    await board(page, 'round1').locator('button[aria-label="Add Equation 2 to Equation 1"]').click();
    await settle(page, 300);
    const error = await board(page, 'round1').locator('.mathmaster-systems-substitution-feedback.is-error').innerText().catch(() => '');
    expect(journey, /still has a z term/.test(error), `adding unscaled equations should say the z term remains: "${error}"`);
    await shoot(page, 'pr3-needs-scaling');
    await scaleEquation(page, 'round1', 'Equation 1', '2', { x: '4x', y: '6y', z: '-2z', constant: '18' }, journey);
    await combineRound(page, 'round1', 'add', ['Equation 1', 'Equation 2'], 'z', { x: '7x', y: '4y', constant: '15' }, journey);
  });
  await step(page, journey, 'round 2: 3·E2 − 2·E3 eliminates z', async () => {
    await choosePair(page, 'Equation 2 and Equation 3');
    await scaleEquation(page, 'round2', 'Equation 2', '3', { x: '9x', y: '-6y', z: '6z', constant: '-9' }, journey);
    await scaleEquation(page, 'round2', 'Equation 3', '2', { x: '2x', y: '8y', z: '6z', constant: '12' }, journey);
    await shoot(page, 'pr3-round2-scaled');
    await combineRound(page, 'round2', 'subtract', ['Equation 2', 'Equation 3'], 'z', { x: '7x', y: '-14y', constant: '-21' }, journey);
    await shoot(page, 'pr3-rounds-written');
  });
  await step(page, journey, 'reduced 2×2: R₁ − R₂ eliminates x → 18y = 36', async () => {
    await subsystemElimination(page, 'x', journey);
    await subsystemCombine(page, 'subtract', 'y', '18', '36');
    await divideOut(page, '18', '2');
  });
  await step(page, journey, 'reduced 2×2 back-substitution: y = 2 into R₁', async () => {
    await subsystemBackSubstitute(page, '2', 0, 'y');
    const host = solver(page);
    await simplifyProducts(page, host, [[/^\+ 4 \* 2$/, '8']]);
    await balancedMove(page, host, 'Subtract', '8');
    await cancelTerm(page, host, '- 8');
    await simplifySide(page, host, 'right', '7');
    await divideOut(page, '7', '1');
  });
  await step(page, journey, 'back-substitute into E1 and solve for z', async () => {
    await backSubstitute(page, 'E1', ['x', 'y']);
    const host = solver(page);
    await simplifyProducts(page, host, [[/^2 \* 1$/, '2'], [/^\+ 3 \* 2$/, '6']]);
    await combineLikeTerms(page, host, 'left', /^(2|\+ 6)$/, '8');
    await closeInlineModes(page, host);
    await balancedMove(page, host, 'Subtract', '8');
    await cancelTerm(page, host, '- 8');
    await simplifySide(page, host, 'right', '1');
    await divideOut(page, '-1', '-1');
  });
  await step(page, journey, 'verify (1, 2, −1) and submit', async () => {
    await verifyAll(page, journey, [['9', '9'], ['-3', '-3'], ['6', '6']]);
    const grade = await submitAndGrade(page, '3x3-d1-pr-3');
    report.push({ journey, grade: grade && { isCorrect: grade.isCorrect, solution: grade.details?.solution } });
    expect(journey, grade?.isCorrect === true, `PR3 was not graded correct: ${JSON.stringify(grade && { isCorrect: grade.isCorrect, solution: grade.details?.solution })}`);
    await shoot(page, 'pr3-complete');
  });
  await page.close();
}

async function dolScaling(context) {
  const journey = 'dol-scaling';
  const page = await context.newPage();
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page, 'dol', 0, { fresh: true });
  // x + y + z = 3 · 2x − y + 3z = 16 · −x + 2y + z = −1  →  (1, −2, 4)
  await step(page, journey, 'round 1: E1 + E2 eliminates y', async () => {
    await chooseVariable(page, 'y');
    await choosePair(page, 'Equation 1 and Equation 2');
    await combineRound(page, 'round1', 'add', ['Equation 1', 'Equation 2'], 'y', { x: '3x', z: '4z', constant: '19' }, journey);
  });
  await step(page, journey, 'round 2: 2·E1 − E3 eliminates y', async () => {
    await choosePair(page, 'Equation 1 and Equation 3');
    await scaleEquation(page, 'round2', 'Equation 1', '2', { x: '2x', y: '2y', z: '2z', constant: '6' }, journey);
    await combineRound(page, 'round2', 'subtract', ['Equation 1', 'Equation 3'], 'y', { x: '3x', z: 'z', constant: '7' }, journey);
  });
  await step(page, journey, 'reduced 2×2: R₁ − R₂ eliminates x → 3z = 12', async () => {
    await subsystemElimination(page, 'x', journey);
    await subsystemCombine(page, 'subtract', 'z', '3', '12');
    await divideOut(page, '3', '4');
  });
  await step(page, journey, 'reduced 2×2 back-substitution: z = 4 into R₂', async () => {
    await subsystemBackSubstitute(page, '4', 1, 'z');
    const host = solver(page);
    await balancedMove(page, host, 'Subtract', '4');
    await cancelTerm(page, host, '- 4');
    await simplifySide(page, host, 'right', '3');
    await divideOut(page, '3', '1');
  });
  await step(page, journey, 'back-substitute into E1 and solve for y', async () => {
    await backSubstitute(page, 'E1', ['x', 'z']);
    const host = solver(page);
    await combineLikeTerms(page, host, 'left', /^(1|\+ 4)$/, '5');
    await closeInlineModes(page, host);
    await balancedMove(page, host, 'Subtract', '5');
    await cancelTerm(page, host, '- 5');
    await simplifySide(page, host, 'right', '-2');
  });
  await step(page, journey, 'verify (1, −2, 4) and submit under DOL rules', async () => {
    await verifyAll(page, journey, [['3', '3'], ['16', '16'], ['-1', '-1']]);
    const grade = await submitAndGrade(page, '3x3-d1-dol-1');
    report.push({ journey, grade: grade && { isCorrect: grade.isCorrect, solution: grade.details?.solution } });
    expect(journey, grade?.isCorrect === true, `DOL 1 was not graded correct: ${JSON.stringify(grade && { isCorrect: grade.isCorrect, solution: grade.details?.solution })}`);
    const pill = await page.locator('.mathmaster-reduction-workflow').innerText();
    expect(journey, !/\bCorrect\b/.test(pill), 'the DOL showed immediate correctness feedback');
    await shoot(page, 'dol-complete');
  });
  await page.close();
}

async function threePlaneChoice(context) {
  const journey = 'three-plane-choice';
  const page = await context.newPage();
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page, 'classwork', 0, { fresh: true });
  await step(page, journey, 'the chosen interpretation is visibly chosen', async () => {
    const option = page.getByRole('radio', { name: 'A point that lies on all three planes.' });
    const before = await option.evaluate((element) => getComputedStyle(element).backgroundColor);
    await option.click();
    await settle(page, 300);
    const after = await option.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(journey, (await option.getAttribute('aria-checked')) === 'true', 'the chosen option is not aria-checked');
    expect(journey, before !== after, `choosing an option does not change how it looks (${before} → ${after})`);
    const others = await page.locator('.mathmaster-threeplane-choice[aria-checked="true"]').count();
    expect(journey, others === 1, `exactly one option should be chosen, found ${others}`);
    await shoot(page, 'cw1-choice');
  });
  await page.close();
}

const context = await browser.newContext();
for (const journey of [threePlaneChoice, classworkElimination, practiceScaling, dolScaling]) {
  await journey(context);
}
await browser.close();

writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify({ findings, report }, null, 2));
if (findings.length) {
  console.error(`${findings.length} finding(s):`);
  findings.forEach((finding) => console.error(` - [${finding.journey}] ${finding.detail}`));
  process.exit(1);
}
console.log(`day1 systems journey: all journeys passed. ${JSON.stringify(report)}`);
