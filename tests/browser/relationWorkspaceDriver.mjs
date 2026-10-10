/*
 * SOLVING A LINEAR EQUATION IN THE RELATION WORKSPACE, AS A STUDENT DOES.
 *
 * MultiRelationAlgebraCore (Step Algebra's relation workspace) is where a
 * generated equation that can have no solution or every real number opens.
 * This driver operates its real controls — Distribute, Combine like terms,
 * Rewrite / Simplify, the + − × ÷ dock with its placement menu, pair
 * cancellation, and the "No solution" / "All real numbers" conclusions — and
 * never touches the workspace's state directly.
 *
 * What to do next is decided from what the workspace SHOWS
 * (`[data-math-state]`), read here with mathjs — independently of the family
 * that generated the equation — the way a student reads the board:
 *
 *   1. distribute every bracket;
 *   2. tidy each side to a·x + b (combine like terms, or rewrite a side whose
 *      distributed products are still written out);
 *   3. move the variable term off the right side and cancel the zero pair;
 *   4. no variable left → the statement is true or false: declare the
 *      outcome; otherwise isolate the variable and finish exactly (7/3, never
 *      2.333).
 */
import { create, all } from 'mathjs';
import { latexToExpression } from '../../src/algebraAstEngine.js';

const math = create(all, { number: 'Fraction' });

export const settle = (page, ms = 300) => page.waitForTimeout(ms);

export const relationState = (page) => page.locator('[data-math-state]').first().getAttribute('data-math-state');

export const relationStatus = async (page) => (await page.locator('[role="status"]:visible').allInnerTexts()).join(' / ');

export const setMathField = async (page, field, value) => {
  await field.waitFor({ timeout: 10000 });
  await field.evaluate((element, next) => {
    element.setValue(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await settle(page, 200);
};

/** a·x + b for an expression in `variable`, exactly (mathjs fractions), or null if not linear. */
export const linearParts = (expression, variable = 'x') => {
  try {
    const node = math.parse(String(expression));
    const at = (value) => math.fraction(math.evaluate(node.toString(), { [variable]: math.fraction(value) }));
    const b = at(0);
    const a = math.subtract(at(1), b);
    const check = math.add(math.multiply(a, 2), b);
    if (!math.equal(at(2), check)) return null;
    return { a, b };
  } catch {
    return null;
  }
};

const fractionText = (value) => {
  const fraction = math.fraction(value);
  const sign = fraction.s < 0 ? '-' : '';
  return fraction.d === 1n || Number(fraction.d) === 1 ? `${sign}${fraction.n}` : `${sign}${fraction.n}/${fraction.d}`;
};
const isZero = (value) => math.equal(math.fraction(value), 0);

/** "3x - 25", "-x + 4", "x", "-7": what a student types for a·x + b. */
export const linearText = ({ a, b }, variable = 'x') => {
  const coefficient = (value) => {
    const text = fractionText(math.abs(value));
    if (text === '1') return '';
    return text.includes('/') ? `(${text})` : text;
  };
  const parts = [];
  if (!isZero(a)) parts.push(`${math.smaller(a, 0) ? '-' : ''}${coefficient(a)}${variable}`);
  if (!isZero(b) || !parts.length) {
    const magnitude = fractionText(math.abs(b));
    if (!parts.length) parts.push(`${math.smaller(b, 0) ? '-' : ''}${magnitude}`);
    else parts.push(`${math.smaller(b, 0) ? '-' : '+'} ${magnitude}`);
  }
  return parts.join(' ');
};

export const readSides = async (page) => {
  const text = await relationState(page);
  const [left, right] = String(text || '').split('=').map((side) => side.trim());
  return { text, left, right };
};

const termButtons = (page, side) => page.locator(`button[data-cancel-key="0:${side === 'left' ? 0 : 1}"]:visible`);
/**
 * Each term on a side as an expression, read from the LaTeX its MathLive
 * element renders — a term's text content flattens ½x into "12x" — and
 * falling back to the text for a term drawn without MathLive.
 */
const termTexts = async (page, side) => (await termButtons(page, side).evaluateAll((elements) => elements.map((element) => {
  const latex = [...element.querySelectorAll('math-span, math-div')].map((math) => math.textContent.trim()).join(' ');
  return { latex, text: element.textContent.trim() };
}))).map(({ latex, text }) => {
  if (!latex) return text;
  try {
    return latexToExpression(latex.replace(/^\+\s*/, ''));
  } catch {
    return text;
  }
});

const dock = (page, label) => page.locator('button:visible').filter({ hasText: new RegExp(`^.${label}$`) }).first();

/** Distribute every bracket through the Distribute panel: pick up, place on each term, commit. */
export const distributeAll = async (page, log = () => {}) => {
  for (let guard = 0; guard < 4; guard += 1) {
    const toggle = page.locator('button:visible').filter({ hasText: /^Distribute$/ }).first();
    if (!(await toggle.count())) return;
    await toggle.click();
    await settle(page, 300);
    const panel = page.locator('.relation-distribution-panel');
    const targets = await panel.locator('button[aria-label^="Place the multiplier on"]').count();
    for (let index = 0; index < targets; index += 1) {
      await panel.locator('button[aria-label^="Pick up the multiplier"]:visible').first().click();
      await settle(page, 150);
      await panel.locator('button[aria-label^="Place the multiplier on"]:visible:not([disabled])').first().click();
      await settle(page, 150);
    }
    await panel.locator('button:visible', { hasText: 'Commit distribution' }).first().click();
    await settle(page, 700);
    log(`distribute -> ${await relationState(page)}`);
  }
};

/** Combine like terms through the panel: the chosen terms, and the single term the student types. */
export const combineLikeTerms = async (page, labels, combined, log = () => {}) => {
  const toggle = page.locator('button:visible').filter({ hasText: /^Combine like terms$/ }).first();
  if (!(await page.locator('[aria-label$="select as a term to combine"]:visible').count())) {
    await toggle.click();
    await settle(page, 300);
  }
  for (const label of labels) {
    await page.locator(`[data-term-text="${label}"][aria-label$="select as a term to combine"]:visible`).first().click();
    await settle(page, 150);
  }
  await setMathField(page, page.locator('math-field[aria-label^="Enter the single term these selected terms combine to"]:visible').first(), combined);
  await page.keyboard.press('Enter');
  await settle(page, 700);
  log(`combine ${labels.join(' & ')} -> ${combined}: ${await relationState(page)}`);
};

/** Rewrite one whole side as an equivalent expression the student types. */
export const rewriteSide = async (page, side, value, log = () => {}) => {
  const open = page.locator('math-field[aria-label^="Equivalent expression"]:visible');
  if (!(await open.count())) {
    await page.locator('button:visible').filter({ hasText: /^Rewrite \/ Simplify$/ }).first().click();
    await settle(page, 300);
  }
  // While Rewrite is on, each side of the relation is one target: the span
  // around its expression (a side that is a quotient has no term tokens).
  const targets = page.locator('[data-algebra-route="relation"] span[style*="cursor: text"]');
  await targets.nth(side === 'left' ? 0 : 1).click();
  await settle(page, 300);
  await setMathField(page, page.locator('math-field[aria-label^="Equivalent expression"]:visible').first(), value);
  await page.keyboard.press('Enter');
  await settle(page, 700);
  log(`rewrite ${side} -> ${value}: ${await relationState(page)}`);
  // Rewrite mode stays on after a rewrite (with or without its bar showing)
  // and, while it is on, the workspace ignores placements. Close it, as a
  // student closes the rewrite bar before the next move.
  // (Once the equation is solved the workspace disables its tools: nothing
  // to close then.)
  const toggle = page.locator('button:visible').filter({ hasText: /^Rewrite \/ Simplify$/ }).first();
  if (await toggle.count() && await toggle.isEnabled()) {
    await toggle.click();
    await settle(page, 300);
  }
};

/** Close Combine like terms if it is open: its term tokens own clicks on the terms. (rewriteSide closes Rewrite itself.) */
const closeInline = async (page) => {
  const modes = [
    { toggle: /^Combine like terms$/, open: '[aria-label$="select as a term to combine"]:visible' },
  ];
  for (const mode of modes) {
    if (await page.locator(mode.open).count()) {
      await page.locator('button:visible').filter({ hasText: mode.toggle }).first().click();
      await settle(page, 250);
    }
  }
};

/** A balanced + − × ÷ placed on both sides (after the last term, or under each side), then committed. */
export const balanced = async (page, operation, operand, log = () => {}) => {
  await closeInline(page);
  const label = { add: 'Add', subtract: 'Subtract', multiply: 'Multiply by', divide: 'Divide by' }[operation];
  log(`${operation}: choose ${label}`);
  await dock(page, label).click();
  await settle(page, 250);
  log(`${operation}: type ${operand}`);
  await setMathField(page, page.locator(`math-field[aria-label="${operation} value"]:visible`).first(), operand);
  log(`${operation}: place`);
  if (operation === 'add' || operation === 'subtract') {
    for (const side of ['left', 'right']) {
      const terms = termButtons(page, side);
      await terms.nth((await terms.count()) - 1).click();
      await settle(page, 200);
      await page.locator('.multi-relation-placement-mini-menu button:visible', { hasText: 'After' }).first().click();
      await settle(page, 200);
    }
  } else {
    const title = operation === 'multiply' ? 'Place the multiplier on this expression' : 'Place the divisor beneath this expression';
    // A placed target keeps its title and toggles OFF if clicked again, so
    // only targets not yet placed are clicked.
    const unplaced = () => page.locator(`button[title="${title}"][aria-pressed="false"]:visible`);
    for (let guard = 0; guard < 6 && await unplaced().count(); guard += 1) {
      await unplaced().first().click();
      await settle(page, 200);
    }
  }
  await page.locator('button:visible', { hasText: 'Commit step' }).first().click();
  await settle(page, 800);
  log(`${operation} ${operand} -> ${await relationState(page)}`);
};

/** Cancel a zero pair on one side: the two terms whose texts the student matches. */
export const cancelPair = async (page, side, firstIndex, secondIndex, log = () => {}) => {
  const key = `0:${side === 'left' ? 0 : 1}`;
  await page.locator(`button[data-cancel-key="${key}"][data-cancel-index="${firstIndex}"]:visible`).first().click();
  await settle(page, 200);
  await page.locator(`button[data-cancel-key="${key}"][data-cancel-index="${secondIndex}"]:visible`).first().click();
  await settle(page, 800);
  log(`cancel ${side} #${firstIndex} with #${secondIndex} -> ${await relationState(page)}`);
};

/** Declare "No solution" / "All real numbers" through Other operations. */
export const declareOutcome = async (page, outcome, log = () => {}) => {
  const label = outcome === 'noSolution' ? 'No solution' : 'All real numbers';
  const button = page.locator('button:visible').filter({ hasText: new RegExp(`^${label}$`) }).first();
  if (!(await button.count())) {
    await page.locator('button:visible').filter({ hasText: /^Other operations/ }).first().click();
    await settle(page, 300);
  }
  await page.locator('button:visible').filter({ hasText: new RegExp(`^${label}$`) }).first().click();
  await settle(page, 800);
  log(`declare ${label} -> ${await relationState(page)} | ${await relationStatus(page)}`);
};

const termIsVariable = (text, variable) => new RegExp(variable).test(text);

/** Find two terms on a side that are opposite variable terms (or opposite constants). */
const oppositePair = async (page, side, variable, wantVariable) => {
  const texts = await termTexts(page, side);
  const parts = texts.map((text) => linearParts(text.replace(/\\left|\\right|~/g, '').replace(/\s+/g, ' '), variable));
  for (let first = 0; first < texts.length; first += 1) {
    for (let second = first + 1; second < texts.length; second += 1) {
      if (!parts[first] || !parts[second]) continue;
      if (wantVariable !== termIsVariable(texts[first], variable) || wantVariable !== termIsVariable(texts[second], variable)) continue;
      const sum = { a: math.add(parts[first].a, parts[second].a), b: math.add(parts[first].b, parts[second].b) };
      if (isZero(sum.a) && isZero(sum.b)) return [first, second];
    }
  }
  return null;
};

/**
 * Solve the relation workspace's equation to its end and return the outcome
 * the student declared or the value they isolated.
 */
export const solveLinearInRelationWorkspace = async (page, { variable = 'x', log = () => {} } = {}) => {
  await distributeAll(page, log);
  // Tidy each side to a·x + b.
  for (const side of ['left', 'right']) {
    const sides = await readSides(page);
    const expression = sides[side];
    const parts = linearParts(expression, variable);
    if (!parts) throw new Error(`the ${side} side is not linear: ${expression}`);
    const texts = await termTexts(page, side);
    if (texts.length <= 2 && !/\)\s*\(|\)\(/.test(expression)) continue;
    const labels = await page.locator('[aria-label$="select as a term to combine"]').evaluateAll((elements) => elements.map((element) => element.dataset.termText));
    const plain = !/\(/.test(expression);
    if (plain && texts.length === 3) {
      // Three plain terms: two of them are like terms. Combine them.
      await page.locator('button:visible').filter({ hasText: /^Combine like terms$/ }).first().click();
      await settle(page, 300);
      const offered = await page.locator('[aria-label$="select as a term to combine"]:visible').evaluateAll((elements) => elements.map((element) => element.dataset.termText));
      const variableTerms = offered.filter((label) => termIsVariable(label, variable));
      const constantTerms = offered.filter((label) => !termIsVariable(label, variable));
      const chosen = variableTerms.length >= 2 ? variableTerms : constantTerms;
      const combined = chosen.reduce((sum, label) => {
        const value = linearParts(label, variable);
        return { a: math.add(sum.a, value.a), b: math.add(sum.b, value.b) };
      }, { a: math.fraction(0), b: math.fraction(0) });
      await combineLikeTerms(page, chosen, linearText(combined, variable), log);
      void labels;
      continue;
    }
    // Products left by the distribution: rewrite the side as a·x + b.
    await rewriteSide(page, side, linearText(parts, variable), log);
  }
  // Move the variable term off the right side.
  let sides = await readSides(page);
  const right = linearParts(sides.right, variable);
  if (!isZero(right.a)) {
    const operand = linearText({ a: math.abs(right.a), b: math.fraction(0) }, variable);
    await balanced(page, math.larger(right.a, 0) ? 'subtract' : 'add', operand, log);
    const pairRight = await oppositePair(page, 'right', variable, true);
    if (!pairRight) throw new Error(`no zero pair to cancel on the right: ${await relationState(page)}`);
    await cancelPair(page, 'right', pairRight[0], pairRight[1], log);
    const pairLeft = await oppositePair(page, 'left', variable, true);
    if (pairLeft) {
      await cancelPair(page, 'left', pairLeft[0], pairLeft[1], log);
    } else {
      sides = await readSides(page);
      await rewriteSide(page, 'left', linearText(linearParts(sides.left, variable), variable), log);
    }
  }
  sides = await readSides(page);
  const left = linearParts(sides.left, variable);
  const rightNow = linearParts(sides.right, variable);
  if (isZero(left.a) && isZero(rightNow.a)) {
    const outcome = math.equal(left.b, rightNow.b) ? 'allReals' : 'noSolution';
    await declareOutcome(page, outcome, log);
    return { outcome };
  }
  // One solution: move the constant, then divide.
  if (!isZero(left.b)) {
    await balanced(page, math.larger(left.b, 0) ? 'subtract' : 'add', fractionText(math.abs(left.b)), log);
    const pair = await oppositePair(page, 'left', variable, false);
    if (pair) await cancelPair(page, 'left', pair[0], pair[1], log);
    sides = await readSides(page);
    await rewriteSide(page, 'right', linearText(linearParts(sides.right, variable), variable), log);
  }
  sides = await readSides(page);
  const coefficient = linearParts(sides.left, variable).a;
  if (!math.equal(coefficient, 1)) {
    await balanced(page, 'divide', fractionText(coefficient), log);
    await rewriteSide(page, 'left', variable, log);
    await settle(page, 600);
    // x = 48/(-6) is already a finished solve here (the workspace reads its
    // value and the question completes); only rewrite what is still open.
    if (!(await questionCompleted(page))) {
      sides = await readSides(page);
      await rewriteSide(page, 'right', fractionText(linearParts(sides.right, variable).b), log);
    }
  }
  sides = await readSides(page);
  return { outcome: 'value', value: fractionText(linearParts(sides.right, variable).b) };
};

/** Has QuestionEngine already recorded this question as complete? */
export const questionCompleted = async (page) => (await page.locator('text=This question is complete').count()) > 0;

export const submitSolvedEquation = async (page, log = () => {}) => {
  if (await questionCompleted(page)) {
    log('completed on its last step (no Submit needed)');
    return;
  }
  const submit = page.locator('button.mathmaster-bar-submit:visible').first();
  await submit.waitFor({ timeout: 10000 });
  await submit.click();
  await settle(page, 1500);
  log('submitted');
};
