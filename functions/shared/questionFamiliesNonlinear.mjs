/*
 * ABSOLUTE VALUE AND QUADRATIC FAMILIES.
 *
 * Graph-bearing families declare a `graphWindow` naming every feature the
 * student is asked to find. The engine refuses any instance whose vertex or
 * zero would sit outside that window (or on its border), so "the vertex is off
 * the screen" is a refused draw, not a question a student meets.
 */

import {
  FAMILY_ISSUE,
  choiceDomain,
  choiceKnob,
  coefficientTerm,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
  rangeKnob,
} from './questionFamilyContract.mjs';

/** "2x^2 - 8x + 3" — a quadratic in standard form. */
export const quadraticLatex = (a, b, c) => {
  const first = a === 1 ? 'x^2' : a === -1 ? '-x^2' : `${a}x^2`;
  const second = b === 0 ? '' : ` ${b < 0 ? '-' : '+'} ${coefficientTerm(Math.abs(b), 'x')}`;
  const third = c === 0 ? '' : ` ${c < 0 ? '-' : '+'} ${Math.abs(c)}`;
  return `${first}${second}${third}`;
};

/** "-2(x - 3)^2 + 5" — vertex form. */
export const vertexFormLatex = (a, h, k) => {
  const lead = a === 1 ? '' : a === -1 ? '-' : `${a}`;
  const inner = h === 0 ? 'x' : `x ${h > 0 ? '-' : '+'} ${Math.abs(h)}`;
  const shift = k === 0 ? '' : ` ${k < 0 ? '-' : '+'} ${Math.abs(k)}`;
  return `${lead}(${inner})^2${shift}`;
};

const QUADRATIC_WINDOW = Object.freeze({ xMin: -10, xMax: 10, yMin: -12, yMax: 12 });

/* ---------------------------------------------------------------------------
 * absoluteValue.solveEquation:  a|x - h| + k = c  ->  x = h ± d.
 * ------------------------------------------------------------------------- */

export const absoluteValueEquationFamily = defineQuestionFamily({
  id: 'absoluteValue.solveEquation',
  version: 1,
  title: 'Absolute value equation',
  skill: {
    objective: 'Solve an absolute value linear equation with two solutions.',
    alignments: ['A2.6E'],
    strand: 'absoluteValue',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {
    centerRange: rangeKnob([-8, 8], { limits: [-20, 20], label: 'Center (h) range' }),
    distanceRange: rangeKnob([1, 9], { limits: [1, 20], label: 'Distance to each solution' }),
    shiftRange: rangeKnob([-9, 9], { limits: [-25, 25], label: 'Outside constant range' }),
    coefficients: choiceKnob('oneToThree', ['one', 'oneToThree'], { label: 'Coefficient on the absolute value' }),
  },
  parameters: (c) => ({
    h: intDomain(c.centerRange[0], c.centerRange[1]),
    d: intDomain(Math.max(1, c.distanceRange[0]), c.distanceRange[1]),
    k: intDomain(c.shiftRange[0], c.shiftRange[1]),
    a: choiceDomain(c.coefficients === 'one' ? [1] : [1, 2, 3]),
  }),
  derive: ({ h, d, k, a }) => ({ rhs: a * d + k, low: h - d, high: h + d }),
  rules: ({ low, high, rhs, a, k }) => {
    const issues = [];
    if (Math.abs(low) > 25 || Math.abs(high) > 25 || Math.abs(rhs) > 60) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    // |x - h| = d with nothing else to undo is a one-step question.
    if (a === 1 && k === 0) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    return issues;
  },
  fingerprint: ({ a, h, k, rhs }) => fingerprintOf('absoluteValue.solveEquation', [a, h, k, rhs]),
  answer: ({ low, high }) => ({ kind: 'set', value: [low, high], display: `x = ${low} or x = ${high}` }),
  tools: {
    multiAnswer: ({ a, h, k, rhs, low, high }, { authored }) => {
      const lead = a === 1 ? '' : `${a}`;
      const inner = h === 0 ? 'x' : `x ${h > 0 ? '-' : '+'} ${Math.abs(h)}`;
      const shift = k === 0 ? '' : ` ${k < 0 ? '-' : '+'} ${Math.abs(k)}`;
      const equation = `$${lead}|${inner}|${shift} = ${rhs}$`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { equation },
          fallback: `Solve ${equation}. Enter the smaller solution first.`,
          mathSentence: equation,
        }),
        answerFields: [
          { id: 'smallerSolution', label: 'Smaller solution: $x$ =', answer: String(low), inputProfile: 'number' },
          { id: 'largerSolution', label: 'Larger solution: $x$ =', answer: String(high), inputProfile: 'number' },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * quadratics.identifyVertex:  vertex of y = ax^2 + bx + c, built from (h, k).
 * ------------------------------------------------------------------------- */

export const quadraticVertexFamily = defineQuestionFamily({
  id: 'quadratics.identifyVertex',
  version: 1,
  title: 'Vertex of a quadratic function',
  skill: {
    objective: 'Identify the vertex of a quadratic function.',
    alignments: ['A.7A'],
    strand: 'quadratics',
  },
  difficulty: { band: 2, dok: 1 },
  constraints: {
    vertexXRange: rangeKnob([-6, 6], { limits: [-9, 9], label: 'Vertex x range' }),
    vertexYRange: rangeKnob([-8, 8], { limits: [-11, 11], label: 'Vertex y range' }),
    leadingCoefficients: choiceKnob('small', ['unit', 'small'], { label: 'Leading coefficient' }),
    form: choiceKnob('standard', ['standard', 'vertex'], { label: 'Equation form' }),
  },
  parameters: (c) => ({
    h: intDomain(c.vertexXRange[0], c.vertexXRange[1]),
    k: intDomain(c.vertexYRange[0], c.vertexYRange[1]),
    a: choiceDomain(c.leadingCoefficients === 'unit' ? [-1, 1] : [-2, -1, 1, 2]),
  }),
  derive: ({ h, k, a }) => ({ b: -2 * a * h, c: a * h * h + k }),
  rules: ({ b, c }) => (Math.abs(b) > 40 || Math.abs(c) > 80 ? [FAMILY_ISSUE.VALUE_OUT_OF_RANGE] : []),
  graphWindow: ({ h, k }) => ({ window: QUADRATIC_WINDOW, features: [[h, k]] }),
  fingerprint: ({ a, b, c }) => fingerprintOf('quadratics.identifyVertex', [a, b, c]),
  answer: ({ h, k }) => ({ kind: 'orderedPair', value: [h, k], display: `(${h}, ${k})` }),
  tools: {
    multiAnswer: ({ a, b, c, h, k }, { authored, constraints }) => {
      const equation = constraints.form === 'vertex'
        ? `$y = ${vertexFormLatex(a, h, k)}$`
        : `$y = ${quadraticLatex(a, b, c)}$`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { equation },
          fallback: `Identify the vertex of ${equation}. Write it as an ordered pair.`,
          mathSentence: equation,
        }),
        answerFields: [{
          id: 'vertex',
          label: 'Vertex',
          answer: `(${h}, ${k})`,
          answerFormat: 'orderedPair',
          inputProfile: 'orderedPair',
        }],
      };
    },
  },
  defaultTool: 'multiAnswer',
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * functions.identifyZeros:  zeros of y = a(x - r1)(x - r2), shown expanded.
 * ------------------------------------------------------------------------- */

export const quadraticZerosFamily = defineQuestionFamily({
  id: 'functions.identifyZeros',
  version: 1,
  title: 'Zeros of a quadratic function',
  skill: {
    objective: 'Find the zeros of a quadratic function by factoring.',
    alignments: ['A.8A', 'A.7A'],
    strand: 'quadratics',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {
    zeroRange: rangeKnob([-8, 8], { limits: [-9, 9], label: 'Zero range' }),
    leadingCoefficients: choiceKnob('unit', ['unit', 'small'], { label: 'Leading coefficient' }),
  },
  parameters: (c) => ({
    r1: intDomain(c.zeroRange[0], c.zeroRange[1]),
    r2: intDomain(c.zeroRange[0], c.zeroRange[1]),
    a: choiceDomain(c.leadingCoefficients === 'unit' ? [-1, 1] : [-2, -1, 1, 2]),
  }),
  derive: ({ r1, r2, a }) => {
    const low = Math.min(r1, r2);
    const high = Math.max(r1, r2);
    const axis = (low + high) / 2;
    return {
      low,
      high,
      b: -a * (r1 + r2),
      c: a * r1 * r2,
      vertexX: axis,
      vertexY: a * (axis - r1) * (axis - r2),
    };
  },
  rules: ({ r1, r2, b, c }) => {
    const issues = [];
    // A double root is a different question ("one zero") with its own family.
    if (r1 === r2) issues.push(FAMILY_ISSUE.DUPLICATE_ROOT);
    // r1 > r2 describes the same function as r2 < r1; keep one ordering so the
    // two tuples are not both counted.
    if (r1 > r2) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (Math.abs(b) > 40 || Math.abs(c) > 80) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  graphWindow: ({ low, high, vertexX, vertexY }) => ({
    window: QUADRATIC_WINDOW,
    features: [[low, 0], [high, 0], [vertexX, vertexY]],
  }),
  fingerprint: ({ a, b, c }) => fingerprintOf('functions.identifyZeros', [a, b, c]),
  answer: ({ low, high }) => ({ kind: 'set', value: [low, high], display: `x = ${low} and x = ${high}` }),
  tools: {
    multiAnswer: ({ a, b, c, low, high }, { authored }) => {
      const equation = `$f(x) = ${quadraticLatex(a, b, c)}$`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { equation },
          fallback: `Find the zeros of ${equation}. Enter the smaller zero first.`,
          mathSentence: equation,
        }),
        answerFields: [
          { id: 'smallerZero', label: 'Smaller zero: $x$ =', answer: String(low), inputProfile: 'number' },
          { id: 'largerZero', label: 'Larger zero: $x$ =', answer: String(high), inputProfile: 'number' },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  recovery: { eligible: true },
});

export const NONLINEAR_FAMILIES = Object.freeze([
  absoluteValueEquationFamily,
  quadraticVertexFamily,
  quadraticZerosFamily,
]);
