/*
 * SOLVING A RADICAL EQUATION IN THE RELATION WORKSPACE, AS A STUDENT DOES.
 *
 * A student emulator: it works only through the workspace's real controls —
 * the + − × ÷ dock with its placement menu, pair cancellation, Simplify, the
 * Raise / Factor / Zero-product tools, the candidate check cards and the final
 * solution set — and never touches the workspace's state. What it types is
 * worked out from the equation the workspace SHOWS, with the same exact
 * rational model the grader uses.
 *
 * Every helper takes the Playwright `page` and the equation's `shape`
 * (functions/shared/toolMath/algebra-relations/radicalEquationShape.mjs).
 */
import {
  rational, rationalEquals, rationalToText, rationalToNumber, solveRadicalShape, radicalSidesAt, parseRadicalEquation,
} from '../../functions/shared/toolMath/algebra-relations/radicalEquationShape.mjs';
import { cancelPair, relationState, relationStatus, rewriteSide, settle, setMathField } from './relationWorkspaceDriver.mjs';

// --- exact arithmetic on { n, d } ------------------------------------------------------------

const Q = rational;
const sub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => Q(a.n * b.n, a.d * b.d);
const div = (a, b) => Q(a.n * b.d, a.d * b.n);
const neg = (a) => Q(-a.n, a.d);
const isZero = (a) => a.n === 0;
const isNeg = (a) => a.n < 0;
const abs = (a) => (isNeg(a) ? neg(a) : a);
const pow = (a, k) => { let out = Q(1); for (let i = 0; i < k; i += 1) out = mul(out, a); return out; };
const ONE = Q(1);

/** "5", "1/4", "-3/2": a number as a student types it. */
export const numberText = (value) => rationalToText(value);

/** a·v + b as typed text ("3x - 25", "-x + 4", "x", "-7", "x/2" never: coefficients are written (1/2)x). */
export const linearText = (a, b, v = 'x') => {
  const parts = [];
  if (!isZero(a)) {
    const mag = abs(a);
    const coefficient = rationalEquals(mag, ONE) ? '' : mag.d === 1 ? numberText(mag) : `(${numberText(mag)})`;
    parts.push(`${isNeg(a) ? '-' : ''}${coefficient}${v}`);
  }
  if (!isZero(b) || !parts.length) {
    const magnitude = numberText(abs(b));
    if (!parts.length) parts.push(`${isNeg(b) ? '-' : ''}${magnitude}`);
    else parts.push(`${isNeg(b) ? '-' : '+'} ${magnitude}`);
  }
  return parts.join(' ');
};

/** A x^2 + B x + C as typed text, zero terms omitted. */
export const quadraticText = (A, B, C, v = 'x') => {
  const terms = [];
  const push = (coefficient, body) => {
    if (isZero(coefficient)) return;
    const mag = abs(coefficient);
    const lead = body && rationalEquals(mag, ONE) ? '' : mag.d === 1 ? numberText(mag) : `(${numberText(mag)})`;
    const sign = isNeg(coefficient) ? '-' : '+';
    terms.push({ sign, text: `${lead}${body}` });
  };
  push(A, `${v}^2`);
  push(B, v);
  push(C, '');
  if (!terms.length) return '0';
  return terms.map((term, index) => (index === 0 ? `${term.sign === '-' ? '-' : ''}${term.text}` : ` ${term.sign} ${term.text}`)).join('');
};

// --- UI primitives -------------------------------------------------------------------------------

export const fillAria = (page, label, value) => setMathField(page, page.locator(`math-field[aria-label="${label}"]:visible`).first(), value);

const tool = (page, id) => page.locator(`[data-algebra-tool="${id}"]:visible`).first();
export const openTool = async (page, id) => {
  if (!(await tool(page, id).count())) {
    await page.locator('button:visible').filter({ hasText: /^Other operations/ }).first().click();
    await settle(page, 300);
  }
  await tool(page, id).click();
  await settle(page, 400);
};

/** Activate a split branch (A = 0, B = 1) the way a student does: click it. */
export const activateBranch = async (page, branchIndex) => {
  const letter = String.fromCharCode(65 + branchIndex);
  const label = page.getByText(new RegExp(`^Branch ${letter} · click to work here$`)).first();
  if (await label.count()) {
    await label.click();
    await settle(page, 500);
  }
};

/** A balanced + − × ÷ on ONE branch (placed after the last term of each side), then committed. */
export const branchBalanced = async (page, branchIndex, operation, operand) => {
  const symbol = { add: 'Add', subtract: 'Subtract', multiply: 'Multiply by', divide: 'Divide by' }[operation];
  await page.locator('button:visible').filter({ hasText: new RegExp(`^.${symbol}$`) }).first().click();
  await settle(page, 250);
  // A busy machine upgrades a MathLive field late; wait for it rather than fail a solve on a slow second.
  await page.locator(`math-field[aria-label="${operation} value"]:visible`).first().waitFor({ timeout: 45000 });
  await setMathField(page, page.locator(`math-field[aria-label="${operation} value"]:visible`).first(), operand);
  if (operation === 'add' || operation === 'subtract') {
    for (const side of [0, 1]) {
      const terms = page.locator(`button[data-cancel-key="${branchIndex}:${side}"]:visible`);
      await terms.nth((await terms.count()) - 1).click();
      await settle(page, 200);
      await page.locator('.multi-relation-placement-mini-menu button:visible', { hasText: 'After' }).first().click();
      await settle(page, 200);
    }
  } else {
    await placeWhole(page, branchIndex, operation === 'multiply' ? 'Place the multiplier on this expression' : 'Place the divisor beneath this expression');
  }
  await page.locator('button:visible', { hasText: 'Commit step' }).first().click();
  await settle(page, 800);
};

export const branchCancel = async (page, branchIndex, side, first, second) => {
  const key = `${branchIndex}:${side === 'left' ? 0 : 1}`;
  await page.locator(`button[data-cancel-key="${key}"][data-cancel-index="${first}"]:visible`).first().click();
  await settle(page, 200);
  await page.locator(`button[data-cancel-key="${key}"][data-cancel-index="${second}"]:visible`).first().click();
  await settle(page, 800);
};

// --- The solve -----------------------------------------------------------------------------------

/** Re-read the shape from what the workspace shows (the original equation, before any step). */
export const shapeOnScreen = async (page, variable = 'x') => {
  const text = await relationState(page);
  const parsed = parseRadicalEquation(text, { variable });
  if (!parsed.ok) throw new Error(`the workspace shows an equation outside the radical model: ${text} (${parsed.reason})`);
  return parsed.shape;
};

const radicandText = (shape) => linearText(shape.radicand.m, shape.radicand.b, shape.variable);
const radicalText = (shape) => (shape.index === 2 ? `sqrt(${radicandText(shape)})` : `nthRoot(${radicandText(shape)},${shape.index})`);

/** Phase 1: undo what surrounds the radical, one balanced step at a time, then tidy the other side. */
export const isolateRadical = async (page, shape, log = () => {}) => {
  const v = shape.variable;
  const side = shape.radicalSide;
  const carrier = shape[side];
  const outside = carrier.c0; // a constant added to the radical
  const alpha = shape.alpha;
  if (!isZero(carrier.c1)) throw new Error('the driver isolates a radical with outside constants only');
  const otherSide = side === 'left' ? 'right' : 'left';
  let other = shape[otherSide];
  let otherConst = other.c0;
  const otherLinear = other.c1;

  if (!isZero(outside)) {
    await clickDock(page, isNeg(outside) ? 'add' : 'subtract', numberText(abs(outside)));
    await placeAfterLast(page, 0);
    await commit(page);
    // [radical, +c, -c] (or [radical, -c, +c]): cancel the pair.
    await cancelPair(page, side, 1, 2, () => {});
    otherConst = sub(otherConst, outside);
    log(`isolate: moved ${numberText(outside)} -> ${await relationState(page)}`);
    await rewriteSide(page, otherSide, linearText(otherLinear, otherConst, v), () => {});
    log(`isolate: tidy other side -> ${await relationState(page)}`);
  }
  if (!rationalEquals(alpha, ONE)) {
    await clickDock(page, 'divide', numberText(alpha));
    await placeWhole(page);
    await commit(page);
    await rewriteSide(page, side, radicalText(shape), () => {});
    const quotient = div(otherConst, alpha);
    const quotientLinear = div(otherLinear, alpha);
    await rewriteSide(page, otherSide, linearText(quotientLinear, quotient, v), () => {});
    log(`isolate: divided by ${numberText(alpha)} -> ${await relationState(page)}`);
  }
};

const clickDock = async (page, operation, operand) => {
  const symbol = { add: 'Add', subtract: 'Subtract', multiply: 'Multiply by', divide: 'Divide by' }[operation];
  await page.locator('button:visible').filter({ hasText: new RegExp(`^.${symbol}$`) }).first().click();
  await settle(page, 250);
  await page.locator(`math-field[aria-label="${operation} value"]:visible`).first().waitFor({ timeout: 45000 });
  await setMathField(page, page.locator(`math-field[aria-label="${operation} value"]:visible`).first(), operand);
};
const placeAfterLast = async (page, branchIndex) => {
  for (const side of [0, 1]) {
    const terms = page.locator(`button[data-cancel-key="${branchIndex}:${side}"]:visible`);
    await terms.nth((await terms.count()) - 1).click();
    await settle(page, 200);
    await page.locator('.multi-relation-placement-mini-menu button:visible', { hasText: 'After' }).first().click();
    await settle(page, 200);
  }
};
// The targets for ONE branch only: every branch of a split carries its own, and a
// divide placed on a branch the student did not choose is a different step.
const placeWhole = async (page, branchIndex = 0, title = 'Place the divisor beneath this expression') => {
  const unplaced = () => page.locator('.multi-relation-branch-slot').nth(branchIndex).locator(`button[title="${title}"][aria-pressed="false"]:visible`);
  for (let guard = 0; guard < 8 && await unplaced().count(); guard += 1) {
    await unplaced().first().click();
    await settle(page, 200);
  }
};
const commit = async (page) => {
  await page.locator('button:visible', { hasText: 'Commit step' }).first().click();
  await settle(page, 800);
};

const POWER_BUTTON = { 2: /^Square$/, 3: /^Cube$/, 4: /^4th power$/, 5: /^5th power$/ };

/** Phase 2: raise both sides to the root's index, writing the resulting equation. */
export const raiseBothSides = async (page, shape, log = () => {}, { power = shape.index } = {}) => {
  const { r, s } = shape.isolated;
  await openTool(page, 'raisePower');
  await page.locator('[data-relation-tool="raisePower"] button', { hasText: POWER_BUTTON[power] }).click();
  await settle(page, 300);
  // The radical side becomes the radicand; the other side becomes its n-th power.
  const powered = shape.index === 2 && !isZero(r)
    ? quadraticText(mul(r, r), mul(mul(Q(2), r), s), mul(s, s), shape.variable)
    : numberText(pow(s, shape.index));
  const radical = radicandText(shape);
  const leftText = shape.radicalSide === 'left' ? radical : powered;
  const rightText = shape.radicalSide === 'left' ? powered : radical;
  await fillAria(page, 'Left side after raising to the power', leftText);
  await fillAria(page, 'Right side after raising to the power', rightText);
  await page.locator('button:visible', { hasText: 'Check and apply' }).click();
  await settle(page, 900);
  log(`raise ${power}: ${await relationState(page)} | ${(await relationStatus(page)).slice(0, 80)}`);
};

/** Phase 3a: a linear equation  m·v + b = K  -> v = value. */
export const solveLinear = async (page, shape, log = () => {}) => {
  const { m, b } = shape.radicand;
  const K = pow(shape.isolated.s, shape.index);
  let rightValue = K;
  // The radical side is the left or right; after the raise the radicand sits on its side.
  const side = shape.radicalSide;
  const other = side === 'left' ? 'right' : 'left';
  if (!isZero(b)) {
    await clickDock(page, isNeg(b) ? 'add' : 'subtract', numberText(abs(b)));
    await placeAfterLast(page, 0);
    await commit(page);
    await cancelPair(page, side, 1, 2, () => {});
    rightValue = sub(K, b);
    await rewriteSide(page, other, numberText(rightValue), () => {});
    log(`linear: moved ${numberText(b)} -> ${await relationState(page)}`);
  }
  if (!rationalEquals(m, ONE)) {
    await clickDock(page, 'divide', numberText(m));
    await placeWhole(page);
    await commit(page);
    await rewriteSide(page, side, shape.variable, () => {});
    await rewriteSide(page, other, numberText(div(rightValue, m)), () => {});
    log(`linear: divided by ${numberText(m)} -> ${await relationState(page)}`);
  }
};

/** Linear factor text for the root n/d:  d·v − n  (a bare v for the root 0). */
const factorFor = (root, v) => {
  const d = Q(root.d);
  const n = Q(root.n);
  const lead = rationalEquals(d, ONE) ? v : `${numberText(d)}${v}`;
  if (isZero(n)) return lead;
  return `${lead} ${isNeg(n) ? '+' : '-'} ${numberText(abs(n))}`;
};

/** Phase 3b: a quadratic. Standard form, factor, zero-product, then each branch. */
export const solveQuadratic = async (page, shape, expected, log = () => {}) => {
  const v = shape.variable;
  const { m, b } = shape.radicand;
  const { r, s } = shape.isolated;
  const A = mul(r, r);
  const B = sub(mul(mul(Q(2), r), s), m);
  const C = sub(mul(s, s), b);
  const radicandSide = shape.radicalSide;
  const powerSide = radicandSide === 'left' ? 'right' : 'left';
  // Move the radicand across so one side is 0.
  await clickDock(page, 'subtract', radicandText(shape));
  await placeAfterLast(page, 0);
  await commit(page);
  await rewriteSide(page, radicandSide, '0', () => {});
  await rewriteSide(page, powerSide, quadraticText(A, B, C, v), () => {});
  log(`quadratic standard form -> ${await relationState(page)}`);

  // Factor: A(x - p)(x - q), the roots read from the exact solution.
  const roots = expected.candidates;
  const factors = roots.length === 1
    ? [`(${factorFor(roots[0], v)})^2`]
    : roots.map((root) => `(${factorFor(root, v)})`);
  const leading = div(A, roots.reduce((product, root) => mul(product, Q(root.d)), ONE));
  const lead = rationalEquals(leading, ONE) || roots.length === 1 && rationalEquals(A, ONE) ? '' : `${numberText(leading)}`;
  const factored = `${lead}${factors.join('')}`;
  await openTool(page, 'factor');
  await fillAria(page, 'Factored form', factored);
  await page.locator('button:visible', { hasText: 'Check factoring' }).click();
  await settle(page, 900);
  log(`factor ${factored} -> ${await relationState(page)} | ${(await relationStatus(page)).slice(0, 80)}`);

  // Zero-product: one equation per distinct factor.
  await openTool(page, 'zeroProduct');
  const rows = roots.map((root) => factorFor(root, v));
  for (let index = 0; index < rows.length; index += 1) {
    await fillAria(page, `Equation ${index + 1} left side`, rows[index]);
    await fillAria(page, `Equation ${index + 1} right side`, '0');
  }
  if (rows.length === 1) await page.locator('button:visible', { hasText: 'Remove the last' }).first().click();
  await settle(page, 200);
  await page.locator('button:visible', { hasText: /^Check$/ }).click();
  await settle(page, 900);
  log(`zero product -> ${await relationState(page)}`);

  // Solve each branch.
  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    const n = Q(root.n);
    const d = Q(root.d);
    if (rationalEquals(d, ONE) && isZero(n)) continue; // x = 0 already
    if (roots.length > 1) await activateBranch(page, index);
    // d·v − n = 0  ->  add n
    await branchBalanced(page, index, isNeg(n) ? 'subtract' : 'add', numberText(abs(n)));
    if (!isZero(n)) await branchCancel(page, index, 'left', 1, 2);
    await rewriteSide(page, 'right', numberText(n), () => {});
    if (!rationalEquals(d, ONE)) {
      await branchBalanced(page, index, 'divide', numberText(d));
      await rewriteSide(page, 'left', v, () => {});
      await rewriteSide(page, 'right', numberText(div(n, d)), () => {});
    }
    log(`branch ${index} solved -> ${await relationState(page)}`);
  }
};

/** Phase 4: substitute each candidate into BOTH sides of the original, decide, record. */
export const checkCandidates = async (page, shape, expected, log = () => {}, { decide = null } = {}) => {
  for (const candidate of expected.candidates) {
    const key = numberText(candidate);
    const sides = radicalSidesAt(shape, candidate);
    const truth = expected.genuine.some((genuine) => rationalEquals(genuine, candidate)) ? 'valid' : 'extraneous';
    const card = page.locator(`.radical-candidate-check[data-candidate="${key}"]`);
    await card.scrollIntoViewIfNeeded();
    await settle(page, 400);
    await setMathField(page, card.locator('math-field').nth(0), numberText(sides.left));
    await setMathField(page, card.locator('math-field').nth(1), numberText(sides.right));
    const choice = decide ? decide(candidate, truth) : truth;
    await card.locator('button', { hasText: choice === 'valid' ? 'Valid solution' : 'Extraneous' }).click();
    await settle(page, 200);
    await card.locator('button', { hasText: 'Record this check' }).click();
    await settle(page, 500);
    log(`check ${key}: ${numberText(sides.left)} vs ${numberText(sides.right)} -> ${choice}`);
  }
};

/** Phase 5: the final solution set (values, or "No real solution"). */
export const recordSolutionSet = async (page, values, log = () => {}) => {
  const panel = page.locator('.radical-solution-set');
  await panel.scrollIntoViewIfNeeded();
  await settle(page, 400);
  if (!values.length) {
    await panel.locator('button', { hasText: 'No real solution' }).click();
  } else {
    for (let index = 0; index < values.length; index += 1) {
      if (index > 0) {
        await panel.locator('button', { hasText: 'Add another solution' }).click();
        await settle(page, 200);
      }
      await setMathField(page, panel.locator('math-field').nth(index), values[index]);
    }
  }
  await panel.locator('button', { hasText: 'Record solution set' }).click();
  await settle(page, 600);
  log(`solution set: ${values.length ? values.join(', ') : 'no real solution'}`);
};

/** The "No solution" conclusion, as a student asks for it (Other operations). */
export const claimNoSolution = async (page, log = () => {}) => {
  await openTool(page, 'noSolution');
  await settle(page, 500);
  log(`claim no solution -> ${await relationState(page)} | ${(await relationStatus(page)).slice(0, 90)}`);
};

/** Submit through the host's own button. */
export const submitAnswer = async (page) => {
  const button = page.locator('button:visible', { hasText: /^Submit/ }).first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await settle(page, 1200);
};

/**
 * A whole honest solve, end to end. Returns what the student did so a caller can check it.
 * `finish` — what to do at the end: 'submit' (default) or 'stop' (leave the work as it stands).
 */
export const solveRadical = async (page, { variable = 'x', log = () => {}, decide = null, setValues = null, stopAfter = null } = {}) => {
  const shape = await shapeOnScreen(page, variable);
  const expected = solveRadicalShape(shape);
  if (!expected.ok) throw new Error(`outside the verified scope: ${expected.reason}`);
  if (expected.structuralNoSolution && stopAfter === 'structural') return { shape, expected };

  await isolateRadical(page, shape, log);
  if (stopAfter === 'isolated') return { shape, expected };
  await raiseBothSides(page, shape, log);
  if (stopAfter === 'raised') return { shape, expected };
  if (shape.index === 2 && !isZero(shape.isolated.r)) await solveQuadratic(page, shape, expected, log);
  else await solveLinear(page, shape, log);
  if (stopAfter === 'solved') return { shape, expected };
  await settle(page, 500);
  await checkCandidates(page, shape, expected, log, { decide });
  if (stopAfter === 'checked') return { shape, expected };
  const values = setValues || expected.genuine.map(numberText);
  await recordSolutionSet(page, values, log);
  return { shape, expected };
};

export { relationState, relationStatus, settle, rationalToNumber, solveRadicalShape, radicalSidesAt, rationalEquals, rationalToText };
