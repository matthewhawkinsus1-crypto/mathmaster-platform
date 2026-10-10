// Reusable visible-control driver for issue #390. Never injects solved state.
import { balancedMove, cancelFactor, setMathField, settle, simplifySide } from './stepAlgebraDriver.mjs';
const workflow = page => page.locator('.mathmaster-reduction-workflow');
const board = (page,key) => page.locator(`[data-round="${key}"]`);
const expect = (journey, condition, message) => { if (!condition) throw new Error(`${journey}: ${message}`); };
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


export { chooseVariable, choosePair, scaleEquation, combineRound, subsystemElimination, subsystemScale, subsystemCombine, divideOut, simplifyProducts, subsystemBackSubstitute, backSubstitute, verifyAll, solver };
