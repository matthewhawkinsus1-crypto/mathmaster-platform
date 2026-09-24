/*
 * DRIVING STEP ALGEBRA THE WAY A STUDENT DOES — SHARED BY THE BROWSER GATES.
 *
 * Every helper operates the real controls of StepByStepAlgebraCore inside a
 * given host element: the operation rail, the MathLive operand field, the
 * pick-up button and the two sides; the inline distribution tokens; the
 * Rewrite / Simplify and Combine like terms term tokens; the cancellation
 * terms and the required-simplification box. Nothing here computes algebra
 * for the student — the driver types exactly what a student would type, and
 * each helper waits for Step Algebra to accept it.
 */

export const settle = (page, ms = 250) => page.waitForTimeout(ms);

/** Put a value into a real MathLive field and let MathInput hear it. */
export const setMathField = async (page, field, value) => {
  await field.waitFor({ timeout: 10000 });
  await field.evaluate((element, next) => {
    element.setValue(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await settle(page, 180);
};

export const mathState = (host) => host.locator('[data-math-state]').first().getAttribute('data-math-state');

/**
 * What the student can SEE on each side: the LaTeX every MathLive element in
 * the side's expression is rendering, plus the term tokens' own labels. The
 * equation is unchanged exactly when this is unchanged.
 */
export const visibleEquation = (host) => host.locator('.algebra-expression-anchor').evaluateAll((anchors) => anchors.map((anchor) => (
  [...anchor.querySelectorAll('math-span, math-div')].map((element) => element.textContent.trim()).join(' ')
)));

const sideBox = (host, side) => host.locator('.algebra-equation-box').nth(side === 'left' ? 0 : 1);

export const chooseOperation = async (page, host, label) => {
  await host.locator(`button[aria-label="Choose ${label} operation"]`).first().click();
  await settle(page, 150);
};

export const typeOperand = (page, host, operand) => setMathField(page, host.locator('math-field').first(), operand);

/** + − × ÷ on both sides by select-then-place, then wait for the pending move. */
export const balancedMove = async (page, host, label, operand) => {
  await chooseOperation(page, host, label);
  await typeOperand(page, host, operand);
  await host.locator('button.algebra-pickup-button').click();
  await host.locator('[aria-label$="on the left side"]').first().click();
  await settle(page, 250);
  await host.locator('[aria-label$="on the right side"]').first().click();
  await settle(page, 500);
};

export const cancellationLabels = (host) => host.locator('[aria-label$="select to cancel"]').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));

/** Cross out a cancelling term by its visible label ("- 12"), on either side. */
export const cancelTerm = async (page, host, termText) => {
  await host.locator(`[aria-label="${termText}, select to cancel"]`).first().click();
  await settle(page, 700);
};

/** Cross out a matching factor in a quotient (−13y over −13): the first cancellable factor. */
export const cancelFactor = async (page, host) => {
  await host.locator('[aria-label$="mark this factor for cancellation"]').first().click();
  await settle(page, 800);
};

/** Required (or optional) simplification after a balanced move. */
export const simplifySide = async (page, host, side, value) => {
  const label = side === 'left' ? 'Left side' : 'Right side';
  await setMathField(page, host.locator(`math-field[aria-label="${label}: enter your simplification"]`), value);
  await host.locator('button.algebra-check-simplification').click();
  await settle(page, 600);
};

export const sideTermLabels = (host, side) => sideBox(host, side).locator('[data-term-index]').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label') || element.textContent.trim()));

/** Apply the inline distribution: pick up the factor, place it on every term, commit. */
export const distribute = async (page, host) => {
  if (!(await host.locator('.algebra-inline-factor-token').count())) {
    await host.locator('button.algebra-distribute-toggle').click();
    await settle(page, 250);
  }
  await host.locator('.algebra-inline-factor-token').first().click();
  const targets = host.locator('.algebra-inline-distribution-target');
  const count = await targets.count();
  for (let index = 0; index < count; index += 1) {
    await targets.nth(index).click();
    await settle(page, 120);
  }
  await host.locator('button', { hasText: 'Commit distribution' }).click();
  await settle(page, 600);
};

async function openInlineMode(page, host, buttonText, labelSuffix) {
  if (await host.locator(`[aria-label$="${labelSuffix}"]`).count()) return;
  await host.locator('button', { hasText: buttonText }).first().click();
  await settle(page, 250);
}

const REWRITE_SUFFIX = 'select as the term you want to rewrite';
const COMBINE_SUFFIX = 'select as a term to combine';

/** Term indices on a side whose token label matches (labels exist once an inline mode is open). */
const matchingTerms = async (host, side, suffix, match) => {
  const labels = await sideBox(host, side).locator(`[data-term-index][aria-label$="${suffix}"]`).evaluateAll((elements) => elements.map((element) => ({
    index: Number(element.getAttribute('data-term-index')),
    text: element.getAttribute('aria-label').replace(/, select as .*$/, ''),
  })));
  if (Array.isArray(match)) return match;
  if (typeof match === 'number') return [match];
  const found = labels.filter((entry) => match.test(entry.text)).map((entry) => entry.index);
  if (!found.length) throw new Error(`no ${side}-side term matches ${match}; terms are ${JSON.stringify(labels.map((entry) => entry.text))}`);
  return found;
};

/** Rewrite / Simplify one term (an index, or the first whose label matches) as the student's equivalent. */
export const rewriteTerm = async (page, host, side, match, replacement) => {
  await openInlineMode(page, host, 'Rewrite / Simplify', REWRITE_SUFFIX);
  const [termIndex] = await matchingTerms(host, side, REWRITE_SUFFIX, match);
  const term = sideBox(host, side).locator(`[data-term-index="${termIndex}"][aria-label$="${REWRITE_SUFFIX}"]`);
  const field = host.locator(`math-field[aria-label="Equivalent form for the selected ${side} side term"]`);
  await term.click();
  if (!(await field.isVisible().catch(() => false))) {
    await settle(page, 300);
    if (!(await field.isVisible().catch(() => false))) await term.click();
  }
  await field.waitFor({ timeout: 5000 }).catch(async (error) => {
    const pressed = await sideBox(host, side).locator('[aria-pressed="true"]').count();
    const status = await host.locator('[role="status"]').allInnerTexts();
    throw new Error(`rewrite field never opened for term ${termIndex} (${pressed} pressed; status ${JSON.stringify(status)}): ${error.message.split('\n')[0]}`);
  });
  await setMathField(page, field, replacement);
  await host.locator('button.algebra-inline-commit', { hasText: 'Check' }).first().click();
  await settle(page, 500);
};

/** Combine like terms: select the terms (indices, or every label matching), type the combined term. */
export const combineLikeTerms = async (page, host, side, match, combined) => {
  await openInlineMode(page, host, 'Combine like terms', COMBINE_SUFFIX);
  const termIndices = await matchingTerms(host, side, COMBINE_SUFFIX, match);
  for (const index of termIndices) {
    await sideBox(host, side).locator(`[data-term-index="${index}"][aria-label$="${COMBINE_SUFFIX}"]`).click();
    await settle(page, 120);
  }
  await setMathField(page, host.locator('math-field[aria-label="Enter the single term these selected terms combine to"]'), combined);
  await host.locator('button.algebra-inline-commit', { hasText: 'Check' }).first().click();
  await settle(page, 500);
};

export const closeInlineModes = async (page, host) => {
  for (const text of ['Rewrite / Simplify', 'Combine like terms']) {
    const button = host.locator('button', { hasText: text }).first();
    if (await button.count() && (await button.getAttribute('aria-expanded')) === 'true') {
      await button.click();
      await settle(page, 200);
    }
  }
  const close = host.locator('button[aria-label="Close Rewrite / Simplify"]');
  if (await close.count()) { await close.first().click(); await settle(page, 200); }
};
