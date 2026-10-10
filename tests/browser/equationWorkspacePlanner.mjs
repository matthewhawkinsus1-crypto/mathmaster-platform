/*
 * SOLVING A GENERATED LINEAR EQUATION IN STEP ALGEBRA'S EQUATION WORKSPACE.
 *
 * StepByStepAlgebraCore is where a one-solution slot opens (the same
 * workspace linear.multiStepEquation v1 uses). The moves are the shared
 * driver's (stepAlgebraDriver.mjs) — distribution tokens, Combine like terms,
 * the + − × ÷ rails with pick-up and placement, cancellation, the
 * simplification box — and what to do next is read from the board
 * (`[data-math-state]`), parsed here with mathjs, never from the family.
 */
import { latexToExpression } from '../../src/algebraAstEngine.js';
import {
  closeInlineModes,
  combineLikeTerms,
  distribute,
  rewriteTerm,
  setMathField,
  settle,
  simplifySide,
} from './stepAlgebraDriver.mjs';
import { linearParts, linearText } from './relationWorkspaceDriver.mjs';
import { create, all } from 'mathjs';

const math = create(all, { number: 'Fraction' });
const isZero = (value) => math.equal(math.fraction(value), 0);
const fractionText = (value) => {
  const fraction = math.fraction(value);
  const sign = fraction.s < 0 ? '-' : '';
  return Number(fraction.d) === 1 ? `${sign}${fraction.n}` : `${sign}${fraction.n}/${fraction.d}`;
};
const fractionLatex = (value) => {
  const fraction = math.fraction(value);
  const sign = fraction.s < 0 ? '-' : '';
  return Number(fraction.d) === 1 ? `${sign}${fraction.n}` : `${sign}\\frac{${fraction.n}}{${fraction.d}}`;
};

/**
 * The board right now, or null once the workspace has closed — an embedded
 * solve (Systems Workspace) closes itself the moment the variable stands
 * alone, so a read after a move must never wait for a board that is gone.
 */
const stateNow = (host) => host.locator('[data-math-state]').first().getAttribute('data-math-state', { timeout: 1500 }).catch(() => null);

/** The two sides on the board as engine expressions, or null once the workspace has closed. */
const sides = async (host) => {
  const latex = await stateNow(host);
  if (latex === null) return null;
  const [left, right] = String(latex).split('=').map((side) => latexToExpression(side.trim()));
  return { latex, left, right };
};

/** Each term on a side as LaTeX — what its MathLive element renders (aria-labels are spoken text). */
const sideTermLatex = (host, side) => host.locator('.algebra-equation-box').nth(side === 'left' ? 0 : 1)
  .locator('[data-term-index]')
  .evaluateAll((elements) => elements.map((element) => ({
    index: Number(element.getAttribute('data-term-index')),
    latex: [...element.querySelectorAll('math-span, math-div')].map((math) => math.textContent.trim()).join(' ') || element.textContent.trim(),
  })));

/**
 * Rewrite every product left written out as one term: what distribution
 * leaves ((3)(2x), (1/2)(−6)) and what back-substitution leaves (−6(−3)).
 * A number or bracket directly before a bracket is a product; (1/2)x and
 * 1/2 are already single terms.
 */
const WRITTEN_OUT_PRODUCT = /\)\s*\(|\d\s*\(|\*\s*\(/;
const rewriteProducts = async (page, host, side, variable, log) => {
  for (let guard = 0; guard < 6; guard += 1) {
    const terms = await sideTermLatex(host, side);
    const product = terms.find((term) => WRITTEN_OUT_PRODUCT.test(latexToExpression(term.latex.replace(/^\+\s*/, ''))));
    if (!product) return;
    const parts = linearParts(latexToExpression(product.latex.replace(/^\+\s*/, '')), variable);
    await rewriteTerm(page, host, side, product.index, linearText(parts, variable));
    log(`rewrite ${side} term ${product.latex} -> ${linearText(parts, variable)}: ${(await stateNow(host)) ?? '(closed)'}`);
  }
};

const combineSide = async (page, host, side, variable, log) => {
  // What each term IS, from the LaTeX it renders (a spoken label such as
  // "15 halves y" cannot be parsed); the terms are then selected by index.
  const terms = (await sideTermLatex(host, side)).map((term) => ({
    ...term,
    parts: linearParts(latexToExpression(term.latex.replace(/^\+\s*/, '')), variable),
  }));
  if (terms.some((term) => !term.parts)) throw new Error(`cannot read the ${side} side's terms: ${JSON.stringify(terms.map((term) => term.latex))}`);
  const variableTerms = terms.filter((term) => !isZero(term.parts.a));
  const constants = terms.filter((term) => isZero(term.parts.a));
  const group = variableTerms.length >= 2 ? variableTerms : constants.length >= 2 ? constants : null;
  if (!group) return false;
  const sum = group.reduce((total, term) => ({ a: math.add(total.a, term.parts.a), b: math.add(total.b, term.parts.b) }), { a: math.fraction(0), b: math.fraction(0) });
  await combineLikeTerms(page, host, side, group.map((term) => term.index), linearLatex(sum, variable));
  log(`combine ${side} ${group.map((term) => term.latex).join(' & ')} -> ${linearText(sum, variable)}: ${(await stateNow(host)) ?? '(closed)'}`);
  return true;
};

/**
 * + − × ÷ on both sides by select-then-place — the shared driver's move,
 * restricted to VISIBLE targets: the work history also carries "… on the
 * left side" labels once a step has been taken. Inline modes (Combine like
 * terms, Rewrite) own the board while open, so they are closed first.
 */
const balancedMove = async (page, host, label, operand) => {
  await closeInlineModes(page, host);
  await host.locator(`button[aria-label="Choose ${label} operation"]:visible`).first().click();
  await settle(page, 150);
  await setMathField(page, host.locator('math-field:visible').first(), operand);
  await host.locator('button.algebra-pickup-button:visible').first().click();
  await host.locator('[aria-label$="on the left side"]:visible').first().click();
  await settle(page, 250);
  await host.locator('[aria-label$="on the right side"]:visible').first().click();
  await settle(page, 500);
};

const rightBox = (host) => host.locator('.algebra-equation-box').nth(1);
const leftBox = (host) => host.locator('.algebra-equation-box').nth(0);

/**
 * Cancel the zero pair the last balanced move created inside one side: one
 * tap on either opposite term crosses out both. `variable` picks the pair of
 * variable terms (x and −x), otherwise the pair of constants.
 */
const cancelOn = async (page, host, side, variable, { variableTerms }, log) => {
  const box = side === 'left' ? leftBox(host) : rightBox(host);
  // The opposite terms become tappable a moment after the move lands.
  await box.locator('[aria-label$="select to cancel"]:visible').first().waitFor({ timeout: 4000 }).catch(() => {});
  // Source text of each term (its accessible name is spoken words).
  const labels = await box.locator('[aria-label$="select to cancel"]:visible').evaluateAll((elements) => elements.map((element) => element.dataset.termText));
  const wanted = labels.find((label) => new RegExp(variable).test(label) === variableTerms);
  if (!wanted) {
    log(`nothing to cancel on ${side}: ${JSON.stringify(labels)} | all: ${JSON.stringify(await host.locator('[aria-label$="select to cancel"]:visible').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label'))))}`);
    return false;
  }
  await box.locator(`[data-term-text="${wanted}"][aria-label$="select to cancel"]:visible`).first().click();
  await settle(page, 800);
  log(`cancel on ${side} (${wanted}): ${(await stateNow(host)) ?? '(closed)'}`);
  return true;
};

/**
 * Cross out every matching factor pair a multiplication or division left —
 * (2 · 25y)/(2 · 25) has two. One tap on a factor crosses out its partner
 * (both read aria-pressed="true"); a tap that lands while the board is still
 * settling is simply made again.
 */
const cancelMatchingFactors = async (page, host, log) => {
  const open = page.locator('[aria-label$="mark this factor for cancellation"][aria-pressed="false"]:visible');
  await open.first().waitFor({ timeout: 2500 }).catch(() => {});
  let taps = 0;
  for (let guard = 0; guard < 8 && (await open.count()) > 0; guard += 1) {
    await open.first().click();
    taps += 1;
    await settle(page, 700);
  }
  if (taps) log(`cancel ${taps === 1 ? 'the factor' : `${taps} factor pairs`}: ${(await stateNow(host)) ?? '(closed)'}`);
  return taps > 0;
};

const simplifyIfAsked = async (page, host, side, value, log) => {
  const field = host.locator(`math-field[aria-label="${side === 'left' ? 'Left side' : 'Right side'}: enter your simplification"]`);
  // The box opens a moment after the move's cancellations are done.
  await field.first().waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
  if (!(await field.count())) return false;
  await simplifySide(page, host, side, value);
  log(`simplify ${side} -> ${value}: ${(await stateNow(host)) ?? '(closed)'}`);
  return true;
};

/** A group the workspace offers to distribute — a numeric product such as −6(−3) has none. */
const offersDistribution = async (host) => (await host.locator('button.algebra-distribute-toggle, .algebra-inline-factor-token').count()) > 0;

export const solveLinearInEquationWorkspace = async (page, host, { variable = 'x', log = () => {} } = {}) => {
  await host.locator('[data-math-state]').first().waitFor({ timeout: 15000 });
  if (/\(/.test((await sides(host))?.latex || '')) {
    if (await offersDistribution(host)) {
      await distribute(page, host);
      log(`distribute: ${(await stateNow(host)) ?? '(closed)'}`);
    }
    for (const side of ['left', 'right']) await rewriteProducts(page, host, side, variable, log);
  }
  for (const side of ['left', 'right']) {
    while (await combineSide(page, host, side, variable, log)) { /* until each side is a·x + b */ }
  }
  // From here the board's committed state lags a pending move until its
  // cancellation and simplification are done, so what each side becomes is
  // computed from the values BEFORE the move — as a student would.
  const start = await sides(host);
  if (!start) throw new Error('the workspace closed before the equation was solved');
  let left = linearParts(start.left, variable);
  let right = linearParts(start.right, variable);
  if (!isZero(right.a)) {
    await balancedMove(page, host, math.larger(right.a, 0) ? 'Subtract' : 'Add', linearText({ a: math.abs(right.a), b: math.fraction(0) }, variable));
    log(`move the variable term (${linearText({ a: right.a, b: math.fraction(0) }, variable)})`);
    await cancelOn(page, host, 'right', variable, { variableTerms: true }, log);
    await simplifyIfAsked(page, host, 'right', fractionLatex(right.b), log);
    left = { a: math.subtract(left.a, right.a), b: left.b };
    right = { a: math.fraction(0), b: right.b };
    while (await combineSide(page, host, 'left', variable, log)) { /* 3x - x -> 2x */ }
  }
  if (!isZero(left.b)) {
    await balancedMove(page, host, math.larger(left.b, 0) ? 'Subtract' : 'Add', fractionLatex(math.abs(left.b)));
    log(`move the constant (${fractionText(left.b)})`);
    await cancelOn(page, host, 'left', variable, { variableTerms: false }, log);
    right = { a: math.fraction(0), b: math.subtract(right.b, left.b) };
    left = { a: left.a, b: math.fraction(0) };
    if (!(await simplifyIfAsked(page, host, 'right', fractionLatex(right.b), log))) {
      while (await combineSide(page, host, 'right', variable, log)) { /* -19 + 3 -> -16 */ }
    }
  }
  if (!math.equal(left.a, 1) && !math.isInteger(left.a)) {
    // A fractional coefficient: multiply by its reciprocal, then simplify
    // each side's product — (2)((1/2)x) is x, (2)(−1) is −2.
    const reciprocal = math.divide(1, left.a);
    await balancedMove(page, host, 'Multiply by', fractionLatex(reciprocal));
    log(`multiply by ${fractionText(reciprocal)}: ${(await stateNow(host)) ?? '(closed)'}`);
    right = { a: math.fraction(0), b: math.multiply(right.b, reciprocal) };
    left = { a: math.fraction(1), b: math.fraction(0) };
    // (2 · 1x)/2: the workspace asks for the matching factors to be crossed out.
    await cancelMatchingFactors(page, host, log);
    await simplifyIfAsked(page, host, 'left', variable, log);
    const current = (await simplifyIfAsked(page, host, 'right', fractionLatex(right.b), log)) ? null : await sides(host);
    if (current) {
      if (!math.equal(linearParts(current.right, variable).b, right.b) || /\(/.test(current.right)) {
        await rewriteTerm(page, host, 'right', 0, fractionLatex(right.b));
        log(`rewrite right -> ${fractionText(right.b)}: ${(await stateNow(host)) ?? '(closed)'}`);
      }
    }
    const now = await sides(host);
    if (now) {
      if (now.left.replace(/\s+/g, '') !== variable) {
        await rewriteTerm(page, host, 'left', 0, variable);
        log(`rewrite left -> ${variable}: ${(await stateNow(host)) ?? '(closed)'}`);
      }
    }
  }
  if (!math.equal(left.a, 1)) {
    await balancedMove(page, host, 'Divide by', fractionLatex(left.a));
    log(`divide by ${fractionText(left.a)}`);
    await cancelMatchingFactors(page, host, log);
    right = { a: math.fraction(0), b: math.divide(right.b, left.a) };
    await settle(page, 500);
    await simplifyIfAsked(page, host, 'right', fractionLatex(right.b), log);
  }
  await settle(page, 600);
  // An embedded solve (Systems Workspace) closes itself once the variable is
  // isolated: then there is no board left to read.
  const finished = await host.locator('[data-math-state]').first().getAttribute('data-math-state', { timeout: 2000 }).catch(() => null);
  log(`finished: ${finished ?? '(the workspace closed on the solved equation)'}`);
  return { latex: finished ?? `${variable} = ${fractionLatex(right.b)}`, value: fractionText(right.b), closed: finished === null };
};

/** a·v + b·w + c from an expression in two variables, exactly; null when it is not linear. */
const twoVariableParts = (expression, variable, other) => {
  try {
    const node = math.parse(String(expression));
    const at = (v, w) => math.fraction(math.evaluate(node.toString(), { [variable]: math.fraction(v), [other]: math.fraction(w) }));
    const c = at(0, 0);
    const a = math.subtract(at(1, 0), c);
    const b = math.subtract(at(0, 1), c);
    const check = math.add(math.add(math.multiply(a, 2), math.multiply(b, 3)), c);
    return math.equal(at(2, 3), check) ? { a, b, c } : null;
  } catch {
    return null;
  }
};

/** "-\frac{5}{2}y+3": a·w + c the way a student types it, in LaTeX. */
export const linearLatex = ({ a, b }, variable) => {
  const parts = [];
  if (!isZero(a)) {
    const magnitude = math.abs(math.fraction(a));
    parts.push(`${math.smaller(a, 0) ? '-' : ''}${math.equal(magnitude, 1) ? '' : fractionLatex(magnitude)}${variable}`);
  }
  if (!isZero(b) || !parts.length) {
    const magnitude = fractionLatex(math.abs(math.fraction(b)));
    parts.push(parts.length ? `${math.smaller(b, 0) ? '-' : '+'}${magnitude}` : `${math.smaller(b, 0) ? '-' : ''}${magnitude}`);
  }
  return parts.join('');
};

/**
 * Isolate `variable` in a two-variable equation a·v + b·w = c (the
 * Systems Workspace's substitution stage): move the other variable's term,
 * then divide by v's coefficient, simplifying each side when asked. Returns
 * the isolated expression as { a, b } — v = a·w + b — and whether it took a
 * division (the solver stops on (−6x − 3)/−1, unsimplified).
 */
export const isolateInEquationWorkspace = async (page, host, { variable, other, log = () => {} }) => {
  await host.locator('[data-math-state]').first().waitFor({ timeout: 15000 });
  const start = await sides(host);
  const left = twoVariableParts(start.left, variable, other);
  const right = twoVariableParts(start.right, variable, other);
  if (!left || !right || !isZero(right.a) || isZero(left.a)) throw new Error(`cannot plan isolating ${variable} in ${start.latex}`);
  // v's side keeps only v: the other variable's term and any constant move right.
  let expression = { a: right.b, b: right.c };
  if (!isZero(left.b)) {
    await balancedMove(page, host, math.larger(left.b, 0) ? 'Subtract' : 'Add', linearLatex({ a: math.abs(left.b), b: 0 }, other));
    log(`move the ${other} term (${linearLatex({ a: left.b, b: 0 }, other)})`);
    await cancelOn(page, host, 'left', other, { variableTerms: true }, log);
    expression = { a: math.subtract(expression.a, left.b), b: expression.b };
    await simplifyIfAsked(page, host, 'right', linearLatex(expression, other), log);
  }
  if (!isZero(left.c)) {
    await balancedMove(page, host, math.larger(left.c, 0) ? 'Subtract' : 'Add', fractionLatex(math.abs(left.c)));
    log(`move the constant (${fractionText(left.c)})`);
    await cancelOn(page, host, 'left', other, { variableTerms: false }, log);
    expression = { a: expression.a, b: math.subtract(expression.b, left.c) };
    await simplifyIfAsked(page, host, 'right', linearLatex(expression, other), log);
  }
  if (!math.equal(left.a, 1)) {
    await balancedMove(page, host, 'Divide by', fractionLatex(left.a));
    log(`divide by ${fractionText(left.a)}`);
    await cancelMatchingFactors(page, host, log);
    expression = { a: math.divide(expression.a, left.a), b: math.divide(expression.b, left.a) };
    await simplifyIfAsked(page, host, 'left', variable, log);
    await simplifyIfAsked(page, host, 'right', linearLatex(expression, other), log);
  }
  await settle(page, 600);
  const finished = await host.locator('[data-math-state]').first().getAttribute('data-math-state', { timeout: 2000 }).catch(() => null);
  log(`finished: ${finished ?? `(the workspace closed on ${variable} = ${linearLatex(expression, other)})`}`);
  return { ...expression, divided: !math.equal(left.a, 1) };
};
