/*
 * LINEAR GRAPH FAMILIES: GRAPH A LINE, AND READ ITS KEY CHARACTERISTICS.
 *
 * Two platform families for the most common Algebra I Warm-Up shapes (A.3C):
 *
 *   linear.graphFromSlopeIntercept   the graphing tool (`graphing2`, mode
 *                                    slopeIntercept): "Graph g(x) = 3x − 8.
 *                                    Start at the y-intercept, then use the
 *                                    slope." The student plots the line.
 *   linear.keyCharacteristics        a typed-and-chosen board (`multiAnswer`):
 *                                    domain, range, both intercepts as ordered
 *                                    pairs, the slope, and whether the line
 *                                    increases or decreases.
 *
 * Each draws only the line — a slope n/d in lowest terms and a y-intercept —
 * and derives every answer, every distractor and the graph from it, so no key
 * can disagree with its question.
 *
 * WHY THEY EXIST. Recovery promises a fresh, equivalent, server-graded
 * question for every Warm-Up and DOL question (sectionRecoveryReadiness.mjs).
 * A static question cannot keep that promise on its own; with `recognize`
 * these families can pair with one (recoveryContent.mjs) and generate its
 * Recovery versions without the original ever changing. `recognize` reads the
 * static question's own line, so the original — and every other static
 * question in the assignment on the same line — is never dealt back.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt. Every version of a slot offers the
 * same keys on the student's keypad (fraction keys on an intercept that could
 * be a fraction), so the keypad cannot hint at the answer.
 *
 * Pure: no Firestore, no clock, no mathjs.
 */

import {
  FAMILY_ISSUE,
  choiceDomain,
  choiceKnob,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  gcd,
  intDomain,
  rangeKnob,
  reducedFraction,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => Number.isFinite(Number(value));

/** "3", "-2/3": an exact rational as an answer key writes it. */
const rationalText = (numerator, denominator) => {
  const { num, den } = reducedFraction(numerator, denominator);
  return den === 1 ? String(num) : `${num}/${den}`;
};

/** The same number for a prompt or a choice: a true minus sign. */
const displayRational = (numerator, denominator) => rationalText(numerator, denominator).replace(/^-/, MINUS);

/** "3x", "−x", "(2/3)x", "−(2/3)x" — the slope term as a textbook writes it. */
const slopeTerm = (n, d) => {
  if (d === 1) {
    if (n === 1) return 'x';
    if (n === -1) return `${MINUS}x`;
    return `${String(n).replace(/^-/, MINUS)}x`;
  }
  const size = `(${Math.abs(n)}/${d})x`;
  return n < 0 ? `${MINUS}${size}` : size;
};

/** " + 5", " − 8", "" */
const constantTerm = (value) => {
  if (value === 0) return '';
  return value > 0 ? ` + ${value}` : ` ${MINUS} ${Math.abs(value)}`;
};

/** "g(x) = 3x − 8" */
const functionText = (name, n, d, b) => `${name}(x) = ${slopeTerm(n, d)}${constantTerm(b)}`;

/*
 * Reading a static question's line. A slope may be stored as a number
 * (-0.6666666666666666) or as text ("-2/3"); either is read back to the
 * reduced fraction with a denominator of at most 12, or refused.
 */
const MAX_DENOMINATOR = 12;
export const readSlopeFraction = (value) => {
  const raw = clean(value).replace(/[−–]/g, '-');
  const match = /^(-?\d+)\s*\/\s*(\d+)$/.exec(raw);
  if (match) {
    const den = Number(match[2]);
    if (!den) return null;
    return reducedFraction(Number(match[1]), den);
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  for (let den = 1; den <= MAX_DENOMINATOR; den += 1) {
    const num = Math.round(numeric * den);
    if (Math.abs(num / den - numeric) < 1e-9) return reducedFraction(num, den);
  }
  return null;
};

/** "(0, -8)" -> [0, -8]; "(8/3, 0)" -> [8/3, 0]. */
const readPair = (value) => {
  const match = /^\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(clean(value).replace(/[−–]/g, '-'));
  if (!match) return null;
  const read = (part) => {
    const fraction = readSlopeFraction(part);
    return fraction ? fraction.num / fraction.den : null;
  };
  const pair = [read(match[1]), read(match[2])];
  return pair.every((entry) => entry !== null) ? pair : null;
};

const WINDOW = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
const SIGNS = Object.freeze({ any: [-1, 1], positive: [1], negative: [-1] });
const FUNCTION_NAMES = Object.freeze(['g', 'h', 'f', 'p', 'q']);

/** The slope parameters every line family here shares. */
const lineParameters = (c) => ({
  p: intDomain(c.slopeRange[0], c.slopeRange[1]),
  q: c.slope === 'fraction' ? intDomain(c.denominatorRange[0], c.denominatorRange[1]) : choiceDomain([1]),
  sign: choiceDomain(SIGNS[c.slopeSign] || SIGNS.any),
  // A line through the origin has the same point for both intercepts; it is a
  // special case, not this skill's ordinary question.
  b: intDomain(c.interceptRange[0], c.interceptRange[1], { exclude: [0] }),
});

const lineRules = ({ n, d }, c) => {
  const issues = [];
  // A fractional slope is written in lowest terms, and is genuinely fractional.
  if (d > 1 && gcd(Math.abs(n), d) !== 1) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
  if (c.slope === 'fraction' && d === 1) issues.push(FAMILY_ISSUE.UNINTENDED_INTEGER);
  return issues;
};

/* ---------------------------------------------------------------------------
 * linear.graphFromSlopeIntercept
 * ------------------------------------------------------------------------- */

export const graphFromSlopeInterceptFamily = defineQuestionFamily({
  id: 'linear.graphFromSlopeIntercept',
  version: 1,
  title: 'Graph a line from its slope-intercept equation',
  skill: {
    objective: 'Graph a linear function written in slope-intercept form by plotting its y-intercept and using its slope.',
    alignments: ['A.3C', 'A.3B'],
    strand: 'linear',
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {
    slope: choiceKnob('integer', ['integer', 'fraction'], { label: 'Slope' }),
    slopeSign: choiceKnob('any', Object.keys(SIGNS), { label: 'Slope sign' }),
    slopeRange: rangeKnob([1, 5], { limits: [1, 9], label: 'Slope size (numerator)' }),
    denominatorRange: rangeKnob([2, 4], { limits: [2, 6], label: 'Slope denominator (fractional slopes)' }),
    interceptRange: rangeKnob([-9, 9], { limits: [-9, 9], label: 'y-intercept range' }),
    functionName: choiceKnob('g', FUNCTION_NAMES, { label: 'Function name' }),
  },
  conceptConstraints: ['slope'],
  // Smaller slopes; still a line to plot from its y-intercept and slope.
  supportConstraints: {
    'reduce-complexity': { slopeRange: [1, 3] },
  },
  parameters: (c) => lineParameters(c),
  derive: ({ p, q, sign }) => ({ n: sign * p, d: q }),
  rules: (values, c) => lineRules(values, c),
  // The y-intercept and one slope step from it: the two points the prompt
  // tells the student to plot, both on the grid with room to click.
  graphWindow: ({ n, d, b }) => ({ window: { ...WINDOW }, features: [[0, b], [d, b + n]] }),
  // The function name is presentation: g(x) = 3x − 8 and h(x) = 3x − 8 are
  // one problem.
  fingerprint: ({ n, d, b }) => fingerprintOf('linear.graphFromSlopeIntercept', [n, d, b]),
  answer: ({ n, d, b }) => ({
    kind: 'line',
    value: { m: n / d, b, slope: rationalText(n, d) },
    display: `y = ${slopeTerm(n, d)}${constantTerm(b)}`,
  }),
  tools: {
    graphing2: ({ n, d, b }, { constraints: c, authored, graphWindow }) => {
      const equation = functionText(c.functionName, n, d, b);
      return {
        type: 'graphing2',
        mode: 'slopeIntercept',
        line: { m: n / d, b },
        graphBounds: graphWindow ? { ...graphWindow } : { ...WINDOW },
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { equation },
          fallback: `Graph the linear function ${equation}. Start at the y-intercept, then use the slope.`,
        }),
      };
    },
  },
  defaultTool: 'graphing2',
  difficultyFor: (c) => (c.slope === 'fraction' ? { band: 2, dok: 1 } : { band: 1, dok: 1 }),
  recognize: (question) => {
    if (clean(question?.type) !== 'graphing2' || clean(question?.mode) !== 'slopeIntercept') return null;
    const line = isObject(question?.line) ? question.line : null;
    if (!line || !finite(line.m) || !finite(line.b) || !Number.isInteger(Number(line.b))) return null;
    const slope = readSlopeFraction(line.m);
    if (!slope || slope.num === 0) return null;
    return {
      params: { p: Math.abs(slope.num), q: slope.den, sign: slope.num < 0 ? -1 : 1, b: Number(line.b) },
      constraints: { slope: slope.den === 1 ? 'integer' : 'fraction' },
    };
  },
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * linear.keyCharacteristics
 * ------------------------------------------------------------------------- */

const X_INTERCEPT_KINDS = Object.freeze(['any', 'integer', 'fraction']);
const DOMAIN_LABEL = 'Domain';
const ALL_REALS = 'All real numbers';
const BEHAVIOR_OPTIONS = Object.freeze(['Increasing', 'Decreasing', 'Constant']);

// Every version offers the same keys, whatever its numbers: an intercept or
// a slope MAY be a fraction, so the fraction key is always there.
const PAIR_SYMBOLS = Object.freeze(['(', ')', ',', 'a⁄b']);
const NUMBER_SYMBOLS = Object.freeze(['a⁄b']);

/** The x-intercept x0 = −b/m = −b·d/n as a reduced fraction. */
const xInterceptOf = ({ n, d, b }) => reducedFraction(-b * d, n);

export const keyCharacteristicsFamily = defineQuestionFamily({
  id: 'linear.keyCharacteristics',
  version: 1,
  title: 'Key characteristics of a line',
  skill: {
    objective: 'Determine the domain, range, intercepts, slope and increasing or decreasing behavior of a linear function from its equation and graph.',
    alignments: ['A.3C', 'A.2A', 'A.3B'],
    strand: 'linear',
  },
  difficulty: { band: 2, dok: 1 },
  constraints: {
    slope: choiceKnob('integer', ['integer', 'fraction'], { label: 'Slope' }),
    xIntercept: choiceKnob('any', X_INTERCEPT_KINDS, { label: 'x-intercept' }),
    slopeSign: choiceKnob('any', Object.keys(SIGNS), { label: 'Slope sign' }),
    slopeRange: rangeKnob([1, 5], { limits: [1, 9], label: 'Slope size (numerator)' }),
    denominatorRange: rangeKnob([2, 4], { limits: [2, 6], label: 'Slope denominator (fractional slopes)' }),
    interceptRange: rangeKnob([-9, 9], { limits: [-9, 9], label: 'y-intercept range' }),
    functionName: choiceKnob('g', FUNCTION_NAMES, { label: 'Function name' }),
  },
  conceptConstraints: ['slope', 'xIntercept'],
  supportConstraints: {
    'reduce-complexity': { slopeRange: [1, 3] },
  },
  parameters: (c) => lineParameters(c),
  derive: ({ p, q, sign, b }) => {
    const n = sign * p;
    const zero = xInterceptOf({ n, d: q, b });
    return { n, d: q, zeroNum: zero.num, zeroDen: zero.den, zero: zero.num / zero.den };
  },
  rules: (values, c) => {
    const issues = lineRules(values, c);
    if (c.xIntercept === 'integer' && values.zeroDen !== 1) issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
    if (c.xIntercept === 'fraction' && values.zeroDen === 1) issues.push(FAMILY_ISSUE.UNINTENDED_INTEGER);
    return issues;
  },
  // Both intercepts are on the graph the student reads.
  graphWindow: ({ b, zero }) => ({ window: { ...WINDOW }, features: [[zero, 0], [0, b]] }),
  fingerprint: ({ n, d, b }) => fingerprintOf('linear.keyCharacteristics', [n, d, b]),
  answer: (values) => ({
    kind: 'fields',
    value: keyCharacteristicAnswers(values),
    display: `slope ${rationalText(values.n, values.d)}; intercepts (${rationalText(values.zeroNum, values.zeroDen)}, 0) and (0, ${values.b})`,
  }),
  tools: {
    multiAnswer: (values, { constraints: c, authored, graphWindow }) => {
      const { n, d, b } = values;
      const equation = functionText(c.functionName, n, d, b);
      const answers = keyCharacteristicAnswers(values);
      const zeroDisplay = displayRational(values.zeroNum, values.zeroDen);
      const increasing = n > 0;
      const window = graphWindow ? { ...graphWindow } : { ...WINDOW };
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { equation },
          fallback: `Describe the key characteristics of ${equation}.`,
        }),
        graph: { ...window, functions: [{ type: 'line', m: n / d, b }] },
        answerFields: [
          {
            id: 'domain',
            label: DOMAIN_LABEL,
            type: 'choice',
            // Each wrong choice is a real misreading: the visible window, a
            // half-line from 0, a half-line from the x-intercept.
            options: [ALL_REALS, 'x ≥ 0', `x ${increasing ? '≥' : '≤'} ${zeroDisplay}`, `${MINUS}10 ≤ x ≤ 10`],
            answer: answers.domain,
            inputProfile: 'choice',
          },
          {
            id: 'range',
            label: 'Range',
            type: 'choice',
            options: [ALL_REALS, 'y ≥ 0', `y ${increasing ? '≥' : '≤'} ${String(b).replace(/^-/, MINUS)}`, `${MINUS}10 ≤ y ≤ 10`],
            answer: answers.range,
            inputProfile: 'choice',
          },
          {
            id: 'xint',
            label: 'x-intercept (as an ordered pair)',
            answer: answers.xint,
            answerFormat: 'orderedPair',
            inputProfile: 'orderedPair',
            requiredSymbols: [...PAIR_SYMBOLS],
            inputContract: { format: 'orderedPair', requiredSymbols: [...PAIR_SYMBOLS] },
          },
          {
            id: 'yint',
            label: 'y-intercept (as an ordered pair)',
            answer: answers.yint,
            answerFormat: 'orderedPair',
            inputProfile: 'orderedPair',
            requiredSymbols: [...PAIR_SYMBOLS],
            inputContract: { format: 'orderedPair', requiredSymbols: [...PAIR_SYMBOLS] },
          },
          {
            id: 'slope',
            label: 'Slope',
            answer: answers.slope,
            inputProfile: 'number',
            answerFormat: 'number',
            requiredSymbols: [...NUMBER_SYMBOLS],
            inputContract: { format: 'number', requiredSymbols: [...NUMBER_SYMBOLS] },
          },
          {
            id: 'behavior',
            label: 'Increasing or decreasing?',
            type: 'choice',
            options: [...BEHAVIOR_OPTIONS],
            answer: answers.behavior,
            inputProfile: 'choice',
          },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  difficultyFor: (c) => (c.slope === 'fraction' ? { band: 2, dok: 2 } : { band: 2, dok: 1 }),
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const fields = Array.isArray(question?.answerFields) ? question.answerFields : [];
    const byId = Object.fromEntries(fields.map((field) => [clean(field?.id), field]));
    if (!['domain', 'range', 'xint', 'yint', 'slope', 'behavior'].every((id) => byId[id])) return null;
    const slope = readSlopeFraction(byId.slope.answer);
    const yint = readPair(byId.yint.answer);
    const xint = readPair(byId.xint.answer);
    if (!slope || slope.num === 0 || !yint || !xint || yint[0] !== 0 || !Number.isInteger(yint[1]) || yint[1] === 0) return null;
    const b = yint[1];
    const zero = xInterceptOf({ n: slope.num, d: slope.den, b });
    // The static question's own key must describe one line, or it is not
    // this family's question.
    if (Math.abs(xint[0] - zero.num / zero.den) > 1e-9 || xint[1] !== 0) return null;
    return {
      params: { p: Math.abs(slope.num), q: slope.den, sign: slope.num < 0 ? -1 : 1, b },
      constraints: {
        slope: slope.den === 1 ? 'integer' : 'fraction',
        xIntercept: zero.den === 1 ? 'integer' : 'fraction',
      },
    };
  },
  recovery: { eligible: true },
});

/** Every field's key, from the line alone. */
function keyCharacteristicAnswers({ n, d, b, zeroNum, zeroDen }) {
  return {
    domain: ALL_REALS,
    range: ALL_REALS,
    xint: `(${rationalText(zeroNum, zeroDen)}, 0)`,
    yint: `(0, ${b})`,
    slope: rationalText(n, d),
    behavior: n > 0 ? 'Increasing' : 'Decreasing',
  };
}

export const LINEAR_GRAPH_FAMILIES = Object.freeze([
  graphFromSlopeInterceptFamily,
  keyCharacteristicsFamily,
]);
