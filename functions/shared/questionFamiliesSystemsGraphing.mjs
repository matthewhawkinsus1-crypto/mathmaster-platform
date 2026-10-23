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
 *   systems.graphical2x2         DOL: graph BOTH equations on the Systems
 *                                Workspace's construct form — two points on
 *                                each line, plotted by the student; nothing is
 *                                drawn for them — then say how many solutions
 *                                the system has and give the intersection.
 *                                The second equation is in standard form for
 *                                half a class. One, none and infinitely many
 *                                are balanced across a class.
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
  CONSTRAINT_POLICY,
  FAMILY_ISSUE,
  choiceDomain,
  choiceKnob,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  gcd,
  intDomain,
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
const CONSISTENCY = Object.freeze({
  one: 'Consistent, because it has at least one solution',
  none: 'Inconsistent, because it has no solution',
  infinite: 'Consistent, because it has at least one solution',
});
// The term with its reason, so the choice is not a coin toss between two
// words. The two wrong reasons are the two ways the words get swapped:
// "inconsistent" read as "not exactly one solution" (a system with infinitely
// many), and lines with the same slope taken for lines that agree.
const CONSISTENCY_OPTIONS = Object.freeze([
  CONSISTENCY.one,
  CONSISTENCY.none,
  'Inconsistent, because it does not have exactly one solution',
  'Consistent, because its lines have the same slope',
]);
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
    return { kind: 'fields', value, display: `${value.count}; ${solutionCase === 'none' ? 'inconsistent' : 'consistent'}` };
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
          { id: 'consistency', label: 'The system is …', type: 'choice', options: rotate(CONSISTENCY_OPTIONS, offset), answer: CONSISTENCY[solutionCase], inputProfile: 'choice' },
          { id: 'graph', label: 'Its graph is …', type: 'choice', options: rotate(SYSTEM_CASES.map((key) => PICTURE[key]), offset + 1), answer: PICTURE[solutionCase], inputProfile: 'choice' },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * systems.graphical2x2 — graph both lines, then read the system.
 *
 * Built from what the graph must show: for one solution an intersection
 * (x0, y0) inside the window and two different slopes through it; for none
 * two parallel lines at least two units apart; for infinitely many one line
 * written twice. Every line has whole-number slope and y-intercept, so it
 * passes through lattice points a student can plot on the −10..10 grid.
 *
 * HOW EACH EQUATION IS WRITTEN. The first in slope-intercept form. The
 * second in slope-intercept form or in standard form; for infinitely many
 * solutions its "slope-intercept" version is scaled (2y = 4x − 6), so the two
 * equations are never the same text and the student has to graph both to
 * see that they are one line. The workspace grades the lines in `system`;
 * Pre-Flight re-reads each equation the student is shown and refuses one that
 * is not that line (toolSchemas linearConstructErrors).
 * ------------------------------------------------------------------------- */

const GRAPH_WINDOW = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
const GRAPH_SLOPES = Object.freeze([-3, -2, -1, 1, 2, 3]);
export const GRAPHICAL_CASES = Object.freeze(['one', 'none', 'infinite', 'mixed']);
export const GRAPHICAL_FORMS = Object.freeze(['slopeIntercept', 'standard', 'mixed']);
const casesOf = (choice) => (choice === 'mixed' ? ['one', 'none', 'infinite'] : [choice]);
const formsOf = (choice) => (choice === 'mixed' ? ['slopeIntercept', 'standard'] : [choice]);

/** "ky = (km)x + kb" with a positive k — slope-intercept form, scaled. */
const scaledSlopeInterceptText = (m, b, k) => {
  const right = slopeInterceptText(k * m, k * b).replace(/^y = /, '');
  return `${k}y = ${right}`;
};

/** The second equation as the student sees it, and the line it must be. */
const secondEquation = ({ case: solutionCase, form, m2, b2, k }) => {
  if (form === 'standard') return standardFormDisplay(-k * m2, k, k * b2);
  return solutionCase === 'infinite' ? scaledSlopeInterceptText(m2, b2, k) : slopeInterceptText(m2, b2);
};

export const graphical2x2Family = defineQuestionFamily({
  id: 'systems.graphical2x2',
  version: 1,
  title: 'Solve a system by graphing both lines',
  skill: {
    objective: 'Graph a system of two linear equations by plotting points on each line, then determine whether it has one solution, no solution or infinitely many, and give the solution if there is exactly one.',
    alignments: ['A.3F', 'A.5C'],
    strand: 'systems',
  },
  difficulty: { band: 2, dok: 2 },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    solutionCase: choiceKnob('mixed', GRAPHICAL_CASES, { label: 'Solution case' }),
    secondForm: choiceKnob('mixed', GRAPHICAL_FORMS, { label: 'How the second equation is written' }),
  },
  conceptConstraints: ['solutionCase', 'secondForm'],
  // A mixed slot is balanced on the case first: a class of 30 gets 10 of each,
  // half of each with the second equation in standard form.
  strata: {
    balance: 'case',
    values: (c) => casesOf(c.solutionCase).flatMap((solutionCase) => formsOf(c.secondForm).map((form) => ({ case: solutionCase, form }))),
  },
  parameters: (c, stratum) => {
    if (!stratum) return {};
    // The scale the second equation is written with: never shown for a
    // plain slope-intercept equation, so it is 1 there and cannot make two
    // versions that look the same.
    const scales = stratum.case === 'infinite' ? [2, 3] : stratum.form === 'standard' ? [1, 2] : [1];
    const domains = { m1: choiceDomain(GRAPH_SLOPES), k: choiceDomain(scales) };
    if (stratum.case === 'one') {
      domains.m2 = choiceDomain(GRAPH_SLOPES);
      domains.x0 = intDomain(-5, 5);
      domains.y0 = intDomain(-5, 5);
    } else {
      domains.b1 = intDomain(-8, 8);
      if (stratum.case === 'none') domains.b2 = intDomain(-8, 8);
    }
    return domains;
  },
  derive: (params) => {
    const { case: solutionCase, m1, x0, y0 } = params;
    const b1 = solutionCase === 'one' ? y0 - m1 * x0 : params.b1;
    const m2 = solutionCase === 'one' ? params.m2 : m1;
    const b2 = solutionCase === 'one' ? y0 - m2 * x0 : solutionCase === 'none' ? params.b2 : b1;
    return { ...params, b1, m2, b2 };
  },
  rules: (values) => {
    const { case: solutionCase, form, m1, b1, m2, b2, k, x0, y0 } = values;
    const issues = [];
    // The case the two lines really make, read from the numbers alone.
    const made = m1 !== m2 ? 'one' : b1 !== b2 ? 'none' : 'infinite';
    if (made !== solutionCase) return [FAMILY_ISSUE.CASE_MISMATCH];
    if (solutionCase === 'one' && ((b2 - b1) / (m1 - m2) !== x0 || m1 * x0 + b1 !== y0)) return [FAMILY_ISSUE.CASE_MISMATCH];
    // Both y-intercepts on the grid, and parallel lines visibly apart.
    if (Math.abs(b1) > 8 || Math.abs(b2) > 8) issues.push(FAMILY_ISSUE.FEATURE_OUTSIDE_WINDOW);
    if (solutionCase === 'none' && Math.abs(b1 - b2) < 2) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    // Lines crossing ON the y-axis every time would teach a shortcut.
    if (solutionCase === 'one' && x0 === 0) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    // A standard-form equation must still be the second line, exactly.
    if (form === 'standard' && ![-k * m2, k, k * b2].every(Number.isInteger)) issues.push(FAMILY_ISSUE.INVALID_PARAMETERS);
    return issues;
  },
  graphWindow: (values) => ({
    window: { ...GRAPH_WINDOW },
    features: [
      [0, values.b1], [0, values.b2],
      ...(values.case === 'one' ? [[values.x0, values.y0]] : []),
    ],
  }),
  fingerprint: ({ case: solutionCase, form, m1, b1, m2, b2, k }) => fingerprintOf('systems.graphical2x2', [solutionCase, form, m1, b1, m2, b2, k]),
  answer: ({ case: solutionCase, x0, y0 }) => (solutionCase === 'one'
    ? { kind: 'system', value: { outcome: 'one', x: x0, y: y0 }, display: `(${shown(x0)}, ${shown(y0)})` }
    : { kind: 'system', value: { outcome: solutionCase }, display: COUNT[solutionCase] }),
  tools: {
    systemsWorkspace: (values, { authored }) => {
      const first = slopeInterceptText(values.m1, values.b1);
      const second = secondEquation(values);
      return {
        type: 'systemsWorkspace',
        mode: 'linear',
        interaction: 'construct',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { first: `$${first}$`, second: `$${second}$`, system: `$${first}$ and $${second}$` },
          fallback: `Graph both equations of the system $${first}$ and $${second}$. Then decide how many solutions it has, and give the solution if there is exactly one.`,
        }),
        studentActions: ['graphSystem'],
        system: { m1: values.m1, b1: values.b1, m2: values.m2, b2: values.b2 },
        equationLabels: [first, second],
        graph: { ...GRAPH_WINDOW, xStep: 2, yStep: 2 },
        snapStep: 1,
      };
    },
  },
  defaultTool: 'systemsWorkspace',
  instanceFields: ['system', 'equationLabels', 'graph', 'snapStep', 'interaction', 'mode'],
  recovery: { eligible: true },
  capabilities: {
    targetTool: { tool: 'systemsWorkspace', mode: 'linear', interaction: 'construct' },
    solutionCases: [...GRAPHICAL_CASES],
    secondForms: [...GRAPHICAL_FORMS],
    window: '−10..10 by −10..10, whole-number slopes and y-intercepts',
    independentVerification: 'the case recomputed from the slopes and intercepts; Pre-Flight re-reads every displayed equation as its graded line',
  },
});

export const SYSTEMS_GRAPHING_FAMILIES = Object.freeze([classifyByStructureFamily, graphical2x2Family]);
