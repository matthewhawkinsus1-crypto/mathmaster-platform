// Worked solution review for stepAlgebra2 (contract: ../toolSolutionReview.js, textOnlyReview).
//
// WHAT THE SHARED GRADER CALLS CORRECT
// (functions/shared/serverGrading/tools/stepAlgebra2.mjs). After runtime repair
// two views are still graded on this tool, both with one right answer:
//
//   default            the ax + b = c balance solver. The grader replays the
//                      student's moves on the question's own {a, b, c} (or the
//                      screen's 3x + 6 = 21) and is satisfied by x alone with
//                      the value (c − b) / a. The review states the two moves
//                      the screen's own hints teach — undo the constant, then
//                      divide by a — computed with the solver's engine
//                      (applyLegacySolverOperation), written the way the
//                      screen writes an equation.
//   rewriteLinearForm  rewrite the question's line as y = a(x − c) (target
//                      "factoredLinear") or, for any other target, y = mx + b.
//                      The line's Ax + By = C is read with the tool's own
//                      reader (resolveStandardCoefficients) from the equation
//                      the screen opens (buildInitialEquationState); slope,
//                      intercepts and the factored form are exact fractions.
//
// Every answer is then handed back to the grader itself, as the work a student
// following the review submits; anything it does not mark correct makes the
// whole review null. linearIntercepts is not graded by this tool (the repair
// moves it to the mature engine), so it has no review here.
//
// Null — never a guess — when:
//   - default: the equation is not three finite numbers, a is 0 (no unique
//     solution), a move would need a number the student cannot type in the
//     solver's number box (more than 6 decimal places), or a value the screen
//     would show is not exact (a rounded decimal);
//   - rewrite: the equation cannot be opened or read as a line in x and y, the
//     line has no y-term (x = k), a factored target with slope 0 (no a(x − c)
//     exists), or a coefficient that is not a fraction with a small
//     denominator.
import stepAlgebra2Grader, {
  LEGACY_SOLVER_DEFAULT_EQUATION,
  applyLegacySolverOperation,
  legacySolverWork,
  resolveRewriteTargetForm,
  rewriteLinearFormWork,
} from '../../../../functions/shared/serverGrading/tools/stepAlgebra2.mjs';
import { exactFractionText } from '../toolMath.js';
import {
  buildInitialEquationState,
  describeRewriteGap,
  formatEquationLatex,
} from '../../stepAlgebra2/rewriteLinearFormMath.js';
import { resolveStandardCoefficients } from '../../stepAlgebra2/linearInterceptsMath.js';

export const implemented = true;

const MINUS = '−';
const signed = (text) => String(text).replace(/^-/, MINUS);
const nearly = (left, right) => Math.abs(Number(left) - Number(right)) <= 1e-9;
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The grader's own verdict on a piece of work: correct and complete, or not. */
const graderAccepts = (question, work) => {
  try {
    const result = stepAlgebra2Grader.grade(question, work);
    return Boolean(result?.graded && result.isCorrect && result.isComplete);
  } catch {
    return false;
  }
};

/*
 * An exact value as the screen prints it (exactFractionText: 5, -5, 20/9), or
 * null when that text would be a rounded decimal rather than the value.
 */
const exactText = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) >= 1e9) return null;
  const text = exactFractionText(number);
  const match = /^(-?\d+)(?:\/(\d+))?$/.exec(text);
  if (!match) return null;
  const parsed = Number(match[1]) / Number(match[2] || 1);
  return Math.abs(parsed - number) <= 1e-9 * Math.max(1, Math.abs(number)) ? text : null;
};

/* ── default: the ax + b = c balance solver ─────────────────────────────── */

// A number the student types into the solver's number box, as typed.
const typedOperand = (value) => {
  const text = String(value);
  return /^\d+(?:\.\d{1,6})?$/.test(text) ? text : null;
};

// StepAlgebra2.jsx's formatEquation, word for word: the equation as the
// student saw it on the solver ("3x + 6 = 21", "(5/2)x − 1 = 4", "x = 20/9").
const coefficientText = (a) => {
  const magnitude = exactText(Math.abs(a));
  if (magnitude == null) return null;
  if (nearly(a, 1)) return '';
  return `${a < 0 ? MINUS : ''}${magnitude.includes('/') ? `(${magnitude})` : magnitude}`;
};
const formatLegacyEquation = ({ a, b, c }) => {
  const coefficient = nearly(a, -1) ? MINUS : coefficientText(a);
  const constant = exactText(Math.abs(b));
  const right = exactText(c);
  if (coefficient == null || constant == null || right == null) return null;
  if (nearly(b, 0)) return `${coefficient}x = ${signed(right)}`;
  return `${coefficient}x ${b >= 0 ? '+' : MINUS} ${constant} = ${signed(right)}`;
};

// The screen opens 3x + 6 = 21 when the question authors no equation — for a
// stepAlgebra2 question. An object that does not say it is one has no equation
// to explain, so the default is not invented for it.
const isStepAlgebra2Question = (question) => question.toolId === 'stepAlgebra2' || question.type === 'stepAlgebra2';

const legacyEquationOf = (question) => {
  if (!question.equation && !isStepAlgebra2Question(question)) return null;
  const original = question.equation || LEGACY_SOLVER_DEFAULT_EQUATION;
  if (!isObject(original)) return null;
  const { a, b, c } = original;
  if (![a, b, c].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  // The grader has no solution for a = 0 (no x-term to isolate).
  if (Math.abs(a) <= 1e-12) return null;
  return { a, b, c };
};

const buildSolverReview = (question) => {
  const original = legacyEquationOf(question);
  if (!original) return null;
  const { a, b, c } = original;
  const startText = formatLegacyEquation(original);
  const solution = (c - b) / a;
  const solutionText = exactText(solution);
  if (!startText || solutionText == null) return null;

  const steps = nearly(a, 1) && nearly(b, 0)
    ? [`The equation already reads ${startText}: x is alone, so no move is needed.`]
    : [`Start with ${startText}. Undo what is done to x in reverse order, and do every move to both sides so the equation stays balanced.`];
  const moves = [];
  let state = { ...original };

  if (!nearly(b, 0)) {
    const operation = b > 0 ? 'subtract' : 'add';
    const operand = Math.abs(b);
    const typed = typedOperand(operand);
    const constant = exactText(operand);
    if (!typed || constant == null) return null;
    state = applyLegacySolverOperation(state, operation, operand);
    const after = formatLegacyEquation(state);
    if (!after) return null;
    moves.push({ operation, operand, summary: `${b > 0 ? 'Subtract' : 'Add'} ${typed}` });
    steps.push(b > 0
      ? `${constant} is added to the x-term, so subtract ${typed} from both sides: ${after}.`
      : `${constant} is subtracted from the x-term, so add ${typed} to both sides: ${after}.`);
  }

  if (!nearly(a, 1)) {
    const typed = typedOperand(Math.abs(a));
    const magnitude = exactText(Math.abs(a));
    if (!typed || magnitude == null) return null;
    const divisor = `${a < 0 ? MINUS : ''}${typed}`;
    const alias = magnitude === typed ? '' : ` (that is, ${a < 0 ? MINUS : ''}${magnitude})`;
    state = applyLegacySolverOperation(state, 'divide', a);
    const after = formatLegacyEquation(state);
    if (!after) return null;
    moves.push({ operation: 'divide', operand: a, summary: `divide by ${divisor}` });
    steps.push(`x is multiplied by ${divisor}${alias}, so divide both sides by ${divisor}: ${after}.`);
  }

  // The moves the review states, replayed by the grader on this question.
  if (!graderAccepts(question, legacySolverWork(moves))) return null;

  // Substituting back: a(x) + b = c, written as the solver writes numbers.
  const x = signed(solutionText);
  const coefficient = nearly(a, -1) ? `${MINUS}1` : coefficientText(a);
  const product = coefficient === '' ? x : `${coefficient}(${x})`;
  const constant = exactText(Math.abs(b));
  const productValue = exactText(c - b);
  const rightValue = exactText(c);
  if (constant == null || productValue == null || rightValue == null) return null;
  const right = signed(rightValue);
  const sign = b >= 0 ? '+' : MINUS;
  const chain = nearly(b, 0)
    ? (coefficient === '' ? [x] : [product, right])
    : coefficient === ''
      ? [`${x} ${sign} ${constant}`, right]
      : [`${product} ${sign} ${constant}`, `${signed(productValue)} ${sign} ${constant}`, right];

  return {
    title: 'Equation solution',
    items: [
      { label: 'Solution', value: `x = ${x}` },
      { label: 'Balanced moves', value: moves.length ? moves.map((move) => move.summary).join(', then ').replace(/^./, (first) => first.toUpperCase()) : 'None needed' },
    ],
    steps,
    why: chain.length > 1
      ? `Substitute x = ${x} into ${startText}: ${chain.join(' = ')}, the right side. Every move changed both sides the same way, so x = ${x} solves the original equation.`
      : `The equation is already x = ${x}.`,
    note: null,
  };
};

/* ── rewriteLinearForm: y = a(x − c) or y = mx + b ──────────────────────── */

// Exact fractions { n, d } with d > 0, small enough to read.
const gcd = (left, right) => {
  let [a, b] = [Math.abs(left), Math.abs(right)];
  while (b) [a, b] = [b, a % b];
  return a || 1;
};
const fraction = (n, d) => {
  if (!d || !Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return null;
  const sign = d < 0 ? -1 : 1;
  const divisor = gcd(n, d);
  const result = { n: (sign * n) / divisor || 0, d: (sign * d) / divisor };
  return Math.abs(result.n) <= 1e6 && result.d <= 1e4 ? result : null;
};
const fractionOf = (value) => {
  const text = exactText(value);
  const match = text == null ? null : /^(-?\d+)(?:\/(\d+))?$/.exec(text);
  return match ? fraction(Number(match[1]), Number(match[2] || 1)) : null;
};
const negate = (value) => (value ? fraction(-value.n, value.d) : null);
const divide = (left, right) => (left && right && right.n !== 0 ? fraction(left.n * right.d, left.d * right.n) : null);
const isOne = (value) => value.n === 1 && value.d === 1;
const negateIfNegative = (value) => (value.n < 0 ? negate(value) : value);

// LaTeX: 5, -5, \frac{5}{2}, -\frac{5}{2}.
const latex = (value) => (value.d === 1 ? String(value.n) : `${value.n < 0 ? '-' : ''}\\frac{${Math.abs(value.n)}}{${value.d}}`);
const latexFactor = (value) => (value.n < 0 || value.d !== 1 ? `\\left(${latex(value)}\\right)` : latex(value));
// A variable's coefficient: x, -x, 3x, \frac{5}{2}x.
const latexTerm = (value, variable) => {
  if (Math.abs(value.n) === 1 && value.d === 1) return `${value.n < 0 ? '-' : ''}${variable}`;
  return `${latex(value)}${variable}`;
};
// mx + b in LaTeX, zero terms left out.
const latexLinear = (slope, intercept) => {
  const pieces = [];
  if (slope.n !== 0) pieces.push(latexTerm(slope, 'x'));
  if (intercept.n !== 0) {
    if (!pieces.length) pieces.push(latex(intercept));
    else pieces.push(`${intercept.n < 0 ? '-' : '+'} ${latex(negateIfNegative(intercept))}`);
  }
  return pieces.length ? pieces.join(' ') : '0';
};

// The same right sides as plain expressions, for the grader: (-5/2)x + 3, 5(x - 4).
const plain = (value) => (value.d === 1 ? String(value.n) : `${value.n}/${value.d}`);
const plainSlopeIntercept = (slope, intercept) => {
  const pieces = [];
  if (slope.n !== 0) {
    pieces.push(Math.abs(slope.n) === 1 && slope.d === 1 ? `${slope.n < 0 ? '-' : ''}x` : slope.d === 1 ? `${slope.n}x` : `(${plain(slope)})x`);
  }
  if (intercept.n !== 0) {
    if (!pieces.length) pieces.push(plain(intercept));
    else pieces.push(`${intercept.n < 0 ? '-' : '+'} ${plain(negateIfNegative(intercept))}`);
  }
  return pieces.length ? pieces.join(' ') : '0';
};
// x − c, with c = 0 written x − 0 (the grader's factored form needs the group).
const groupText = (root, render) => `x ${root.n >= 0 ? '-' : '+'} ${render(negateIfNegative(root))}`;
const plainFactored = (slope, root) => `${slope.d === 1 ? String(slope.n) : `(${plain(slope)})`}(${groupText(root, plain)})`;
const latexFactored = (slope, root) => `${latex(slope)}\\left(${groupText(root, latex)}\\right)`;

const originalLatex = (original) => {
  try {
    // The workspace's own LaTeX for the equation, without mathjs's `~` spacing
    // (5~x would show as "5 x").
    const text = String(formatEquationLatex(original) || '').replace(/~\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) return text;
  } catch {
    // fall through to the plain sides
  }
  return `${original.left} = ${original.right}`;
};

const buildRewriteReview = (question) => {
  const factoredTarget = resolveRewriteTargetForm(question) === 'factoredLinear';
  let original;
  try {
    original = buildInitialEquationState(question);
  } catch {
    return null;
  }
  if (!original || typeof original.left !== 'string' || typeof original.right !== 'string') return null;

  // The line as Ax + By = C, read from the equation the screen opens.
  const standard = resolveStandardCoefficients({ equation: `${original.left} = ${original.right}` });
  if (!standard) return null;
  const [A, B, C] = [standard.A, standard.B, standard.C].map(fractionOf);
  if (!A || !B || !C || B.n === 0) return null;
  const slope = divide(negate(A), B);
  const intercept = divide(C, B);
  if (!slope || !intercept) return null;
  if (factoredTarget && slope.n === 0) return null;
  // c in y = a(x − c) is where the line meets the x-axis: −b / m.
  const root = factoredTarget ? divide(negate(intercept), slope) : null;
  if (factoredTarget && !root) return null;

  const objective = factoredTarget
    ? { kind: 'factoredLinear', variable: 'y', targetForm: 'factoredLinear', requireSimplifiedFinalForm: false }
    : { kind: 'slopeIntercept', variable: 'y', targetForm: 'slopeIntercept', requireSimplifiedFinalForm: true };
  const gapOf = (equation, kind) => {
    try {
      return describeRewriteGap({ left: equation.left, right: equation.right, variable: 'y', objective: { ...objective, kind } });
    } catch {
      return 'unreadable';
    }
  };
  const alreadyFinished = gapOf(original, objective.kind) === null;
  // What the original still needs before it reads y = mx + b: nothing, only
  // its right side rewritten (y is already alone), or y collected and isolated.
  const slopeInterceptGap = gapOf(original, 'slopeIntercept');
  const alreadySlopeIntercept = slopeInterceptGap === null;
  const yAlreadyAlone = slopeInterceptGap === 'needsSimplification' && isOne(B);

  const startLatex = originalLatex(original);
  const slopeInterceptLatex = `y = ${latexLinear(slope, intercept)}`;
  const answerLatex = alreadyFinished
    ? startLatex
    : factoredTarget ? `y = ${latexFactored(slope, root)}` : slopeInterceptLatex;
  const answerRight = alreadyFinished
    ? original.right
    : factoredTarget ? plainFactored(slope, root) : plainSlopeIntercept(slope, intercept);
  const answerLeft = alreadyFinished ? original.left : 'y';

  // The equation the review ends on, submitted as the screen submits it.
  const finished = { left: answerLeft, right: answerRight };
  if (!graderAccepts(question, rewriteLinearFormWork(finished, [{ after: finished }]))) return null;

  const formName = factoredTarget ? 'factored linear form, y = a(x − c)' : 'slope-intercept form, y = mx + b';
  const steps = [];
  if (alreadyFinished) {
    steps.push(factoredTarget
      ? `The equation $${startLatex}$ already has y alone on the left and the right side written as a number times (x − c), with a = $${latex(slope)}$ and c = $${latex(root)}$.`
      : `The equation $${startLatex}$ already has y alone on the left and the right side written as mx + b, with m = $${latex(slope)}$ and b = $${latex(intercept)}$.`);
  } else {
    steps.push(`Start with $${startLatex}$. The goal is ${formName}.`);
    if (alreadySlopeIntercept) {
      steps.push(`y is already alone on the left: $${slopeInterceptLatex}$, so the slope is $${latex(slope)}$ and the y-intercept is $${latex(intercept)}$.`);
    } else if (yAlreadyAlone) {
      steps.push(`y is already alone on the left. Rewrite the right side as an x-term plus a constant (distribute, split the fraction and cancel common factors as needed): $${slopeInterceptLatex}$.`);
    } else if (isOne(B)) {
      steps.push(`Get y alone on the left: move every other term to the right side by doing the same to both sides (distribute and combine like terms if needed): $${slopeInterceptLatex}$.`);
    } else {
      steps.push(`Collect the y-term on the left and everything else on the right, doing the same to both sides (distribute and combine like terms if needed): $${latexTerm(B, 'y')} = ${latexLinear(negate(A), C)}$.`);
      steps.push(`Divide both sides by $${latex(B)}$ — every term on the right — and write each piece in lowest terms: $${slopeInterceptLatex}$.`);
    }
    if (factoredTarget) {
      steps.push(intercept.n === 0
        ? `Factor the slope $${latex(slope)}$ out of the right side. The constant term is 0, so $x - 0$ is left in the parentheses: $${answerLatex}$.`
        : `Factor the slope $${latex(slope)}$ out of both terms. Since $${latex(intercept)} \\div ${latexFactor(slope)} = ${latex(negate(root))}$, the right side is $${latexFactored(slope, root)}$: $${answerLatex}$.`);
    } else if (!alreadySlopeIntercept) {
      steps.push(`That is y = mx + b with slope m = $${latex(slope)}$ and y-intercept b = $${latex(intercept)}$.`);
    }
  }

  const items = factoredTarget
    ? [
      { label: 'Factored linear form', value: `$${answerLatex}$` },
      { label: 'a (the slope)', value: `$${latex(slope)}$` },
      { label: 'c (the x-intercept)', value: `$${latex(root)}$` },
    ]
    : [
      { label: 'Slope-intercept form', value: `$${answerLatex}$` },
      { label: 'Slope m', value: `$${latex(slope)}$` },
      { label: 'y-intercept b', value: `$${latex(intercept)}$` },
    ];

  const why = factoredTarget
    ? `Distribute to check: $${latexFactored(slope, root)} = ${latexLinear(slope, intercept)}$, so $${answerLatex}$ is $${slopeInterceptLatex}$ — the original equation solved for y, the same line. At x = $${latex(root)}$ the factor in parentheses is 0, so y = 0: c is where the line crosses the x-axis.`
    : isOne(B)
      ? `$${answerLatex}$ is the original equation with its terms moved and simplified, so it is the same line. At x = 0 it gives y = $${latex(intercept)}$, the y-intercept.`
      : `Multiplying both sides of $${slopeInterceptLatex}$ by $${latex(B)}$ gives back $${latexTerm(B, 'y')} = ${latexLinear(negate(A), C)}$, the original equation with its terms moved and simplified, so it is the same line. At x = 0 it gives y = $${latex(intercept)}$, the y-intercept.`;

  const note = factoredTarget && !alreadyFinished && slope.d === 1 && Math.abs(slope.n) === 1
    ? `The ${slope.n < 0 ? '−1' : '1'} in front of the parentheses is written out: factored form is a number times (x − c).`
    : null;

  return {
    title: factoredTarget ? 'Factored-form solution' : 'Slope-intercept solution',
    items,
    steps,
    why,
    note,
  };
};

export const buildStepAlgebra2Review = (question) => {
  if (!isObject(question)) return null;
  try {
    // The view the grader marks for this question (exact `mode`, like the screen).
    const support = stepAlgebra2Grader.support(question);
    if (!support?.supported) return null;
    if (support.mode === 'default') return buildSolverReview(question);
    if (support.mode === 'rewriteLinearForm') return buildRewriteReview(question);
    return null;
  } catch {
    return null;
  }
};

export default buildStepAlgebra2Review;
