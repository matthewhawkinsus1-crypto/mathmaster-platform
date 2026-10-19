/*
 * DRIVING STEP ALGEBRA THE WAY A STUDENT DOES — SHARED BY THE BROWSER GATES.
 *
 * Every helper operates the real controls of StepByStepAlgebraCore inside a
 * given host element: the operation rail, the MathLive operand field, the
 * pick-up button and the two sides; the inline distribution tokens; the one
 * Simplify control (its highlighted parts, its box, its whole-side route) and
 * the Rewrite menu (student push Q); the cancellation
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
  // Simplify stays open after its commits and owns the board while it is;
  // a student closes it to reach the + − × ÷ rails.
  await closeInlineModes(page, host);
  await chooseOperation(page, host, label);
  await typeOperand(page, host, operand);
  await host.locator('button.algebra-pickup-button').click();
  await host.locator('[aria-label$="on the left side"]').first().click();
  await settle(page, 250);
  await host.locator('[aria-label$="on the right side"]').first().click();
  await settle(page, 500);
};

// Terms are found by their source text (data-term-text), not their accessible
// name: the name is spoken words ("plus 7, select to cancel") since job F.
/** The source text of every term that can be cancelled now ("+ 7", "- 2 x"). */
export const cancellationLabels = (host) => host.locator('[aria-label$="select to cancel"]').evaluateAll((elements) => elements.map((element) => element.dataset.termText));

/** A selector for one interactive term: its source text and what selecting it does. */
export const termSelector = (termText, interaction) => `[data-term-text="${termText}"][aria-label$="${interaction}"]`;

/** Cross out a cancelling term by its visible label ("- 12"), on either side. */
export const cancelTerm = async (page, host, termText) => {
  await host.locator(`[data-term-text="${termText}"][aria-label$="select to cancel"]`).first().click();
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

/** Open the one Simplify control (it highlights every simplifiable part). */
export const openSimplify = async (page, host) => {
  const toggle = host.locator('button.algebra-simplify-toggle').first();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
    await settle(page, 250);
  }
};

/** Open a Rewrite-menu tool (factor, split, reduce, arrange) by its kind. */
export const openRewriteTool = async (page, host, kind) => {
  const entry = host.locator(`.algebra-structure-toggle--${kind}`);
  if (!(await entry.count())) {
    await host.locator('button.algebra-rewrite-toggle').first().click();
    await settle(page, 150);
  }
  await host.locator(`.algebra-structure-toggle--${kind}`).first().click();
  await settle(page, 250);
};

/** The source text and index of every term on a side (the board's own tokens). */
const sideTerms = (host, side) => sideBox(host, side).locator('[data-term-index]').evaluateAll((elements) => elements.map((element) => ({
  index: Number(element.getAttribute('data-term-index')),
  text: element.dataset.termText,
})));

const matchingIndices = (terms, side, match) => {
  if (Array.isArray(match)) return match;
  if (typeof match === 'number') return [match];
  const found = terms.filter((entry) => match.test(entry.text)).map((entry) => entry.index);
  if (!found.length) throw new Error(`no ${side}-side term matches ${match}; terms are ${JSON.stringify(terms.map((entry) => entry.text))}`);
  return found;
};

const checkSimplifyBox = async (page, host, replacement) => {
  const box = host.locator('.mm-simplify-box').first();
  await box.waitFor({ timeout: 5000 });
  const field = box.locator('math-field');
  if (await field.count()) {
    await setMathField(page, field.first(), replacement);
    await box.locator('button.algebra-inline-commit', { hasText: 'Check' }).click();
  } else {
    // Parentheses after a plus, or a factor of 1: nothing to type.
    await box.locator('button.algebra-inline-commit').click();
  }
  await settle(page, 500);
};

/** Type a simpler version of a whole side (Simplify's free-form route). */
export const simplifyWholeSide = async (page, host, side, replacement) => {
  await openSimplify(page, host);
  await host.locator('.mm-simplify-side-choice', { hasText: `the ${side} side` }).first().click();
  await settle(page, 150);
  await setMathField(page, host.locator(`math-field[aria-label^="A simpler version of the ${side} side"]`).first(), replacement);
  await host.locator('button.mm-simplify-side-check').first().click();
  await settle(page, 500);
};

/**
 * Simplify one term (an index, or the first whose source text matches) to
 * the student's own result. A term that is a Simplify part (a product, a
 * fraction, a factor of 1) is chosen on the board and simplified in the box;
 * any other term is rewritten through the whole-side route, with the rest of
 * the side kept exactly as the board shows it.
 */
export const rewriteTerm = async (page, host, side, match, replacement) => {
  await openSimplify(page, host);
  const terms = await sideTerms(host, side);
  const [termIndex] = matchingIndices(terms, side, match);
  // The parts toolbar lists every part with its id: side, kind, term indices.
  const ids = await host.locator(`.mm-simplify-part[data-part-id^="${side}:"]`).evaluateAll((elements) => elements.map((element) => element.dataset.partId));
  const single = ids.find((id) => /:(product|fraction|unit|parentheses):/.test(id) && id.endsWith(`:${termIndex}`));
  if (single) {
    await host.locator(`.mm-simplify-part[data-part-id="${single}"]`).click();
    await settle(page, 200);
    await checkSimplifyBox(page, host, replacement);
    return;
  }
  const rebuilt = terms.map((entry, position) => {
    const text = entry.index === termIndex ? `+ (${replacement})` : entry.text;
    return position === 0 ? text.replace(/^\+\s*/, '') : (/^[+-]/.test(text) ? text : `+ ${text}`);
  }).join(' ');
  await simplifyWholeSide(page, host, side, rebuilt);
};

/** Combine like terms: the Simplify part holding these terms (indices, or every label matching), then the combined term. */
export const combineLikeTerms = async (page, host, side, match, combined) => {
  await openSimplify(page, host);
  const terms = await sideTerms(host, side);
  const wanted = matchingIndices(terms, side, match);
  const ids = await host.locator(`.mm-simplify-part[data-part-id^="${side}:likeTerms:"]`).evaluateAll((elements) => elements.map((element) => element.dataset.partId));
  const id = ids.find((entry) => {
    const indices = entry.split(':')[2].split('.').map(Number);
    return wanted.every((index) => indices.includes(index));
  });
  if (!id) throw new Error(`no like-terms part on the ${side} side holds terms ${JSON.stringify(wanted)}; parts are ${JSON.stringify(ids)}`);
  await host.locator(`.mm-simplify-part[data-part-id="${id}"]`).click();
  await settle(page, 200);
  await checkSimplifyBox(page, host, combined);
};

export const closeInlineModes = async (page, host) => {
  const toggle = host.locator('button.algebra-simplify-toggle').first();
  if (await toggle.count() && (await toggle.getAttribute('aria-expanded')) === 'true') {
    await toggle.click();
    await settle(page, 200);
  }
  const rewrite = host.locator('button.algebra-rewrite-toggle').first();
  if (await rewrite.count() && (await rewrite.getAttribute('aria-expanded')) === 'true') {
    await rewrite.click();
    await settle(page, 150);
  }
};

/**
 * Multiply out the products a substitution or a back-substitution left on the
 * board, as the student does: for each [pattern, value], the product part
 * whose term's source text matches is chosen in Simplify and the student's
 * product typed. Patterns with no matching product are skipped.
 */
export const simplifyProducts = async (page, host, products) => {
  for (const [match, value] of products) {
    await openSimplify(page, host);
    const ids = await host.locator('.mm-simplify-part[data-simplify-part="product"], .mm-simplify-part[data-simplify-part="unit"]').evaluateAll((elements) => elements.map((element) => element.dataset.partId));
    let chosen = null;
    for (const id of ids) {
      const [side, , indices] = id.split(':');
      const text = await sideBox(host, side).locator(`[data-term-index="${indices.split('.')[0]}"]`).first().getAttribute('data-term-text');
      if (match.test(text || '')) { chosen = id; break; }
    }
    if (!chosen) continue;
    await host.locator(`.mm-simplify-part[data-part-id="${chosen}"]`).click();
    await settle(page, 250);
    await checkSimplifyBox(page, host, value);
  }
  await closeInlineModes(page, host);
};

/**
 * Remove the parentheses on a side: after a plus sign nothing is typed; after
 * a minus sign the student chooses each term's new sign ('+' or '-', in the
 * order the terms are inside the parentheses), or 'flip' to change them all.
 */
export const removeParentheses = async (page, host, side, signs = []) => {
  await openSimplify(page, host);
  await host.locator(`.mm-simplify-part[data-simplify-part="parentheses"][data-part-id^="${side}:"]`).first().click();
  await settle(page, 250);
  const box = host.locator('.mm-simplify-box').first();
  const groups = box.locator('.mm-simplify-sign-group');
  // 'flip': what a student does after a minus sign — every term inside, read
  // off the board (data-sign-inside), changes sign.
  if (signs === 'flip') {
    const inside = await groups.evaluateAll((elements) => elements.map((element) => element.dataset.signInside));
    signs = inside.map((sign) => (sign === '-' ? '+' : '-'));
  }
  for (let index = 0; index < signs.length; index += 1) {
    await groups.nth(index).locator(`button[aria-label^="${signs[index] === '-' ? 'minus' : 'plus'} "]`).click();
    await settle(page, 80);
  }
  await box.locator('button.algebra-inline-commit').click();
  await settle(page, 600);
};
