/*
 * SOLVING SYSTEMS BY GRAPHING (A.3F, A.5C) — the Warm-Up and DOL families
 * behind the Algebra I lesson "Using Graphing to Solve Systems of Equations"
 * (Module 3, Topic 2, Lesson 1).
 *
 *   systems.classifyByStructure  DOL: two linear equations, the second in
 *                                standard form. Find each line's slope and
 *                                y-intercept, then say how many solutions the
 *                                system has, whether it is consistent or
 *                                inconsistent, and what its graph looks like.
 *                                One, none and infinitely many are balanced
 *                                across a class. multiAnswer.
 *
 * WHY THE SECOND EQUATION IS IN STANDARD FORM. Two slope-intercept equations
 * of the same line would be the same text, and "infinitely many" would be a
 * matter of noticing identical strings. Rewriting Ax + By = C is the work the
 * lesson's Talk the Talk asks for, and it is the same for every case, so the
 * form never hints at the answer.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  FAMILY_ISSUE,
  choiceDomain,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  gcd,
} from './questionFamilyContract.mjs';

const MINUS = '−';
const shown = (value) => (value < 0 ? `${MINUS}${-value}` : String(value));

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};

/** "3x", "−x", "x" */
const term = (coefficient, variable) => {
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `${MINUS}${variable}`;
  return `${shown(coefficient)}${variable}`;
};

/** "y = 2x − 3", "y = −x", "y = 4" — slope-intercept form as displayed. */
export const slopeInterceptText = (m, b) => {
  if (m === 0) return `y = ${shown(b)}`;
  const constant = b === 0 ? '' : ` ${b < 0 ? MINUS : '+'} ${Math.abs(b)}`;
  return `y = ${term(m, 'x')}${constant}`;
};

/** "4x − 2y = 6" — standard form as displayed, leading coefficient positive. */
export const standardFormDisplay = (A, B, C) => {
  const sign = A < 0 || (A === 0 && B < 0) ? -1 : 1;
  const [a, b, c] = [sign * A, sign * B, sign * C].map((value) => value + 0);
  const left = a === 0
    ? term(b, 'y')
    : `${term(a, 'x')}${b === 0 ? '' : ` ${b < 0 ? MINUS : '+'} ${term(Math.abs(b), 'y')}`}`;
  return `${left} = ${shown(c)}`;
};

export const SYSTEM_CASES = Object.freeze(['one', 'none', 'infinite']);
const COUNT = Object.freeze({ one: 'Exactly one solution', none: 'No solution', infinite: 'Infinitely many solutions' });
const CONSISTENCY = Object.freeze({ one: 'Consistent', none: 'Inconsistent', infinite: 'Consistent' });
const PICTURE = Object.freeze({
  one: 'Two lines that cross at exactly one point',
  none: 'Two parallel lines that never meet',
  infinite: 'One line — both equations graph the same line',
});

const SLOPES = Object.freeze([-4, -3, -2, -1, 1, 2, 3, 4]);
const INTERCEPTS = Object.freeze([-8, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 8]);
// The y-coefficient the second equation is written with: never 1, so the
// student always rewrites it.
const SCALES = Object.freeze([-3, -2, 2, 3, 4]);

export const classifyByStructureFamily = defineQuestionFamily({
  id: 'systems.classifyByStructure',
  version: 1,
  title: 'Classify a system from its slopes and y-intercepts',
  skill: {
    objective: 'Use the slope and the y-intercept of each equation to determine whether a system of two linear equations has one solution, no solution, or infinitely many solutions, and classify it as consistent or inconsistent.',
    alignments: ['A.3F', 'A.5C'],
    strand: 'systems',
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {},
  strata: { balance: 'case', values: () => SYSTEM_CASES.map((solutionCase) => ({ case: solutionCase })) },
  parameters: (c, stratum) => {
    const domains = {
      m1: choiceDomain(SLOPES),
      b1: choiceDomain(INTERCEPTS),
      scale: choiceDomain(SCALES),
    };
    if (stratum?.case === 'one') {
      domains.m2 = choiceDomain(SLOPES);
      domains.b2 = choiceDomain(INTERCEPTS);
    }
    if (stratum?.case === 'none') domains.b2 = choiceDomain(INTERCEPTS);
    return domains;
  },
  derive: ({ case: solutionCase, m1, b1, m2, b2, scale }) => {
    const slope2 = solutionCase === 'one' ? m2 : m1;
    const intercept2 = solutionCase === 'infinite' ? b1 : b2;
    // y = slope2·x + intercept2, times `scale`, with the x-term moved left:
    // −scale·slope2·x + scale·y = scale·intercept2.
    return { slope2, intercept2, A: -scale * slope2, B: scale, C: scale * intercept2 };
  },
  rules: ({ case: solutionCase, m1, b1, slope2, intercept2, A, B, C }) => {
    const issues = [];
    if (solutionCase === 'one' && slope2 === m1) issues.push(FAMILY_ISSUE.CASE_MISMATCH);
    if (solutionCase === 'none' && intercept2 === b1) issues.push(FAMILY_ISSUE.CASE_MISMATCH);
    // A one-solution system whose lines are perpendicular-looking twins of
    // each other (opposite slopes, same intercept) crosses on the y-axis
    // every time; keep some variety by refusing the same intercept.
    if (solutionCase === 'one' && intercept2 === b1) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    // The standard form is written in lowest terms only when the scale is
    // the whole common factor; a common factor left over is a different
    // (larger) way to write the same equation, which is fine, but a scale
    // that cancels to 1 would hand the student slope-intercept form.
    if ((gcd(gcd(A, B), C) || 1) === Math.abs(B) && Math.abs(B) === 1) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (Math.abs(A) > 16 || Math.abs(C) > 32) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  fingerprint: ({ m1, b1, A, B, C }) => fingerprintOf('systems.classifyByStructure', [m1, b1, A, B, C]),
  answer: ({ case: solutionCase, m1, b1, slope2, intercept2 }) => {
    const value = {
      m1: String(m1),
      b1: String(b1),
      m2: String(slope2),
      b2: String(intercept2),
      count: COUNT[solutionCase],
      consistency: CONSISTENCY[solutionCase],
      graph: PICTURE[solutionCase],
    };
    return { kind: 'fields', value, display: `${value.count}; ${value.consistency}` };
  },
  tools: {
    multiAnswer: ({ case: solutionCase, m1, b1, slope2, intercept2, A, B, C }, { authored }) => {
      const first = slopeInterceptText(m1, b1);
      const second = standardFormDisplay(A, B, C);
      const offset = m1 + b1 + A;
      const number = (id, label, answer) => ({ id, label, answer: String(answer), inputProfile: 'number', answerFormat: 'number', inputContract: { format: 'number' } });
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { first, second, system: `${first} and ${second}` },
          fallback: `Consider the system of equations ${first} and ${second}. Without graphing, use the slope and y-intercept of each equation to classify the system.`,
        }),
        answerFields: [
          number('m1', `Slope of ${first}`, m1),
          number('b1', `y-intercept of ${first}`, b1),
          number('m2', `Slope of ${second}`, slope2),
          number('b2', `y-intercept of ${second}`, intercept2),
          { id: 'count', label: 'How many solutions does the system have?', type: 'choice', options: rotate(SYSTEM_CASES.map((key) => COUNT[key]), offset), answer: COUNT[solutionCase], inputProfile: 'choice' },
          { id: 'consistency', label: 'The system is …', type: 'choice', options: rotate(['Consistent', 'Inconsistent'], offset), answer: CONSISTENCY[solutionCase], inputProfile: 'choice' },
          { id: 'graph', label: 'Its graph is …', type: 'choice', options: rotate(SYSTEM_CASES.map((key) => PICTURE[key]), offset + 1), answer: PICTURE[solutionCase], inputProfile: 'choice' },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recovery: { eligible: true },
});

export const SYSTEMS_GRAPHING_FAMILIES = Object.freeze([classifyByStructureFamily]);
