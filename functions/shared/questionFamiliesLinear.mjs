/*
 * LINEAR FAMILIES.
 *
 * Each family below generates a QUESTION. None of them supplies steps, hints or
 * a worked solution: Step Algebra receives exactly the fields the platform's
 * original `stepLinearEquation` generator produced (leftExpression,
 * rightExpression, equation, generatedAnswer), so the workspace a student
 * solves in is the one they already know, no more and no less revealing.
 */

import {
  FAMILY_ISSUE,
  booleanKnob,
  choiceKnob,
  coefficientTerm,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  fractionText,
  gcd,
  intDomain,
  rangeKnob,
  reducedFraction,
  signedConstant,
} from './questionFamilyContract.mjs';

const VARIABLES = ['x', 'n', 'a', 'b', 'k', 'm', 'p', 't', 'w', 'y'];

/** "3x + 5" — a linear expression as a student reads it. */
const linearLatex = (coefficient, constant, variable) => `${coefficientTerm(coefficient, variable)}${signedConstant(constant)}`;

/** "3 * x + 5" — the same expression in the form the algebra engine parses. */
const stepExpression = (coefficient, constant, variable) => (
  constant === 0
    ? `${coefficient} * ${variable}`
    : `${coefficient} * ${variable} ${constant >= 0 ? '+' : '-'} ${Math.abs(constant)}`
);

const stepAlgebraFields = ({ authored, variable, left, right, solution, prompt }) => ({
  type: 'stepAlgebra',
  prompt,
  variable,
  leftExpression: left,
  rightExpression: right,
  equation: `${left} = ${right}`,
  generatedAnswer: solution,
  // Carried exactly as the original generator carried them, so a family-backed
  // question opens the same workspace mode a legacy one did.
  mode: authored.mode || 'rigorous',
  workspaceDifficulty: authored.workspaceDifficulty ?? null,
  microQuestions: authored.microQuestions ?? true,
  allowModeToggle: authored.allowModeToggle ?? false,
  objective: authored.objective || {
    kind: 'isolate',
    variable,
    simplifyRequired: true,
    label: `Isolate ${variable} and simplify`,
  },
});

/* ---------------------------------------------------------------------------
 * linear.twoStepEquation:  a·x + b = c, integer solution.
 * ------------------------------------------------------------------------- */

export const twoStepEquationFamily = defineQuestionFamily({
  id: 'linear.twoStepEquation',
  version: 1,
  title: 'Two-step linear equation',
  skill: {
    objective: 'Solve a two-step linear equation in one variable.',
    alignments: ['A.5A', '7.11A'],
    strand: 'linear',
  },
  difficulty: { band: 2, dok: 1 },
  constraints: {
    solutionRange: rangeKnob([-10, 10], { limits: [-40, 40], label: 'Solution range' }),
    coefficientRange: rangeKnob([-9, 9], { limits: [-20, 20], label: 'Coefficient range' }),
    constantRange: rangeKnob([-15, 15], { limits: [-50, 50], label: 'Constant range' }),
    variable: choiceKnob('x', VARIABLES, { label: 'Variable' }),
  },
  parameters: (c) => ({
    x: intDomain(c.solutionRange[0], c.solutionRange[1]),
    // 0 is not an equation in x; ±1 makes it a one-step equation in disguise.
    a: intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0, 1, -1] }),
    b: intDomain(c.constantRange[0], c.constantRange[1], { exclude: [0] }),
  }),
  // The same narrowing the legacy stepLinearEquation generator applied for a
  // reduce-complexity modification: smaller, positive coefficients and
  // constants. The task stays a two-step equation.
  supportConstraints: {
    'reduce-complexity': { coefficientRange: [2, 6], constantRange: [-8, 8], solutionRange: [-6, 6] },
  },
  derive: ({ x, a, b }) => ({ c: a * x + b }),
  rules: ({ c }) => (Math.abs(c) > 150 ? [FAMILY_ISSUE.VALUE_OUT_OF_RANGE] : []),
  // The variable letter is presentation: 3x + 5 = 20 and 3n + 5 = 20 are one
  // problem, so the letter is deliberately not in the fingerprint.
  fingerprint: ({ a, b, c }) => fingerprintOf('linear.twoStepEquation', [a, b, c]),
  answer: ({ x }, c) => ({ kind: 'number', value: x, display: `${c.variable} = ${x}` }),
  tools: {
    stepAlgebra: ({ x, a, b, c }, { authored, constraints }) => {
      const variable = constraints.variable;
      return stepAlgebraFields({
        authored,
        variable,
        left: stepExpression(a, b, variable),
        right: String(c),
        solution: x,
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { equation: `$${linearLatex(a, b, variable)} = ${c}$` },
          fallback: `Solve for $${variable}$.`,
        }),
      });
    },
    multiAnswer: ({ x, a, b, c }, { authored, constraints }) => {
      const variable = constraints.variable;
      const equation = `$${linearLatex(a, b, variable)} = ${c}$`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { equation },
          fallback: `Solve ${equation} for $${variable}$.`,
          mathSentence: equation,
        }),
        answerFields: [{ id: 'solution', label: `${variable} =`, answer: String(x), inputProfile: 'number' }],
      };
    },
  },
  defaultTool: 'stepAlgebra',
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * linear.multiStepEquation:  a·x + b = c·x + d, variables on both sides.
 * ------------------------------------------------------------------------- */

const sideKey = (coefficient, constant) => `${coefficient},${constant}`;

export const multiStepEquationFamily = defineQuestionFamily({
  id: 'linear.multiStepEquation',
  version: 1,
  title: 'Linear equation with variables on both sides',
  skill: {
    objective: 'Solve a linear equation with the variable on both sides.',
    alignments: ['A.5A', '8.8C'],
    strand: 'linear',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {
    solutionRange: rangeKnob([-10, 10], { limits: [-30, 30], label: 'Solution range' }),
    coefficientRange: rangeKnob([-8, 8], { limits: [-15, 15], label: 'Coefficient range' }),
    constantRange: rangeKnob([-15, 15], { limits: [-40, 40], label: 'Constant range' }),
    variable: choiceKnob('x', VARIABLES, { label: 'Variable' }),
  },
  parameters: (c) => ({
    x: intDomain(c.solutionRange[0], c.solutionRange[1]),
    a: intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] }),
    cc: intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] }),
    b: intDomain(c.constantRange[0], c.constantRange[1], { exclude: [0] }),
  }),
  supportConstraints: {
    'reduce-complexity': { coefficientRange: [-6, 6], constantRange: [-10, 10], solutionRange: [-6, 6] },
  },
  derive: ({ x, a, cc, b }) => ({ d: a * x + b - cc * x }),
  rules: ({ a, cc, d }) => {
    const issues = [];
    // a = c leaves b = d (every x) or b != d (no x). Neither is this skill.
    if (a === cc) issues.push(FAMILY_ISSUE.NO_SOLUTION);
    // d = 0 hides a constant term; keep both sides genuinely two-term.
    if (d === 0) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (Math.abs(d) > 80) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  // ax + b = cx + d and cx + d = ax + b are the same equation read backwards,
  // so the two sides are put in a fixed order before fingerprinting.
  fingerprint: ({ a, b, cc, d }) => {
    const sides = [sideKey(a, b), sideKey(cc, d)].sort();
    return fingerprintOf('linear.multiStepEquation', sides);
  },
  answer: ({ x }, c) => ({ kind: 'number', value: x, display: `${c.variable} = ${x}` }),
  tools: {
    stepAlgebra: ({ x, a, b, cc, d }, { authored, constraints }) => {
      const variable = constraints.variable;
      return stepAlgebraFields({
        authored,
        variable,
        left: stepExpression(a, b, variable),
        right: stepExpression(cc, d, variable),
        solution: x,
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { equation: `$${linearLatex(a, b, variable)} = ${linearLatex(cc, d, variable)}$` },
          fallback: `Solve for $${variable}$.`,
        }),
      });
    },
    multiAnswer: ({ x, a, b, cc, d }, { authored, constraints }) => {
      const variable = constraints.variable;
      const equation = `$${linearLatex(a, b, variable)} = ${linearLatex(cc, d, variable)}$`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { equation },
          fallback: `Solve ${equation} for $${variable}$.`,
          mathSentence: equation,
        }),
        answerFields: [{ id: 'solution', label: `${variable} =`, answer: String(x), inputProfile: 'number' }],
      };
    },
  },
  defaultTool: 'stepAlgebra',
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * linear.slopeFromPoints:  slope of the line through two points.
 * ------------------------------------------------------------------------- */

const SLOPE_FORMS = ['integer', 'fraction', 'any'];

export const slopeFromPointsFamily = defineQuestionFamily({
  id: 'linear.slopeFromPoints',
  version: 1,
  title: 'Slope from two points',
  skill: {
    objective: 'Determine the slope of a line from two points.',
    alignments: ['A.3A'],
    strand: 'linear',
  },
  difficulty: { band: 2, dok: 1 },
  constraints: {
    coordinateRange: rangeKnob([-8, 8], { limits: [-20, 20], label: 'Coordinate range' }),
    // integer: whole-number slopes only. fraction: non-integer slopes only.
    // any: either, which is what most Algebra I practice wants.
    slopeForm: choiceKnob('any', SLOPE_FORMS, { label: 'Slope form' }),
    allowZeroSlope: booleanKnob(false, { label: 'Allow horizontal lines' }),
  },
  parameters: (c) => ({
    x1: intDomain(c.coordinateRange[0], c.coordinateRange[1]),
    y1: intDomain(c.coordinateRange[0], c.coordinateRange[1]),
    x2: intDomain(c.coordinateRange[0], c.coordinateRange[1]),
    y2: intDomain(c.coordinateRange[0], c.coordinateRange[1]),
  }),
  derive: ({ x1, y1, x2, y2 }) => {
    const slope = reducedFraction(y2 - y1, x2 - x1);
    return { rise: y2 - y1, run: x2 - x1, slopeNum: slope.num, slopeDen: slope.den };
  },
  rules: ({ run, rise, slopeNum, slopeDen }, c) => {
    const issues = [];
    // A vertical line has no slope; that is a different question.
    if (run === 0) return [FAMILY_ISSUE.DIVIDE_BY_ZERO];
    if (rise === 0 && !c.allowZeroSlope) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (c.slopeForm === 'integer' && slopeDen !== 1) issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
    if (c.slopeForm === 'fraction' && slopeDen === 1) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (Math.abs(slopeNum / slopeDen) > 10 || slopeDen > 10) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  // "The line through A and B" is the line through B and A.
  fingerprint: ({ x1, y1, x2, y2 }) => {
    const points = [`${x1},${y1}`, `${x2},${y2}`].sort();
    return fingerprintOf('linear.slopeFromPoints', points);
  },
  answer: ({ slopeNum, slopeDen }) => ({
    kind: 'number',
    value: slopeNum / slopeDen,
    display: fractionText({ num: slopeNum, den: slopeDen }),
  }),
  tools: {
    multiAnswer: ({ x1, y1, x2, y2, slopeNum, slopeDen }, { authored }) => {
      const points = `$(${x1}, ${y1})$ and $(${x2}, ${y2})$`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { points },
          fallback: `Find the slope of the line that passes through ${points}.`,
          mathSentence: points,
        }),
        answerFields: [{
          id: 'slope',
          label: 'Slope $m$ =',
          answer: fractionText({ num: slopeNum, den: slopeDen }),
          // The platform's response contract reads "-3/4" as an expression,
          // and the expression keypad is the one that can enter it.
          inputProfile: slopeDen === 1 ? 'number' : 'expression',
        }],
      };
    },
  },
  defaultTool: 'multiAnswer',
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * functions.identifyIntercepts:  intercepts of Ax + By = C.
 *
 * Built from the intercepts, not from A, B and C, so every instance has
 * integer intercepts by construction — an instance with an x-intercept of
 * 7/3 is a different (harder) question and is not generated here.
 * ------------------------------------------------------------------------- */

export const interceptsFamily = defineQuestionFamily({
  id: 'functions.identifyIntercepts',
  version: 1,
  title: 'Intercepts of a line in standard form',
  skill: {
    objective: 'Identify the x- and y-intercepts of a linear function.',
    alignments: ['A.3C'],
    strand: 'linear',
  },
  difficulty: { band: 2, dok: 1 },
  constraints: {
    interceptRange: rangeKnob([-9, 9], { limits: [-20, 20], label: 'Intercept range' }),
  },
  parameters: (c) => ({
    p: intDomain(c.interceptRange[0], c.interceptRange[1], { exclude: [0] }),
    q: intDomain(c.interceptRange[0], c.interceptRange[1], { exclude: [0] }),
  }),
  derive: ({ p, q }) => {
    // The line through (p, 0) and (0, q): qx + py = pq, in lowest terms with a
    // positive x-coefficient.
    const divisor = gcd(gcd(q, p), p * q) || 1;
    const sign = q < 0 ? -1 : 1;
    return { A: (sign * q) / divisor + 0, B: (sign * p) / divisor + 0, C: (sign * p * q) / divisor + 0 };
  },
  rules: ({ A, B, C }) => {
    const issues = [];
    if (Math.abs(C) > 120 || Math.abs(A) > 20 || Math.abs(B) > 20) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  graphWindow: ({ p, q }) => ({
    window: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
    features: [[p, 0], [0, q]],
  }),
  fingerprint: ({ A, B, C }) => fingerprintOf('functions.identifyIntercepts', [A, B, C]),
  answer: ({ p, q }) => ({ kind: 'points', value: { xIntercept: [p, 0], yIntercept: [0, q] }, display: `(${p}, 0) and (0, ${q})` }),
  tools: {
    multiAnswer: ({ p, q, A, B, C }, { authored }) => {
      const equation = `$${coefficientTerm(A, 'x')}${B < 0 ? ' - ' : ' + '}${coefficientTerm(Math.abs(B), 'y')} = ${C}$`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { equation },
          fallback: `Find the $x$-intercept and the $y$-intercept of ${equation}. Write each as an ordered pair.`,
          mathSentence: equation,
        }),
        answerFields: [
          { id: 'xIntercept', label: '$x$-intercept', answer: `(${p}, 0)`, answerFormat: 'orderedPair', inputProfile: 'orderedPair' },
          { id: 'yIntercept', label: '$y$-intercept', answer: `(0, ${q})`, answerFormat: 'orderedPair', inputProfile: 'orderedPair' },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  recovery: { eligible: true },
});

export const LINEAR_FAMILIES = Object.freeze([
  twoStepEquationFamily,
  multiStepEquationFamily,
  slopeFromPointsFamily,
  interceptsFamily,
]);
