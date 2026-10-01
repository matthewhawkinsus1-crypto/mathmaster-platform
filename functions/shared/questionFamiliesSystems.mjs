/*
 * SYSTEMS OF TWO LINEAR EQUATIONS.
 *
 * Every instance is built from its solution, so the answer key cannot disagree
 * with the equations, and every instance is checked for the two failures a
 * random draw produces: a parallel system (no solution) and a coincident one
 * (infinitely many). A family that MEANT to ask about those would be a
 * different family with its own rules.
 *
 * Equations are kept in lowest terms. 2x + 4y = 6 is x + 2y = 3 written
 * larger; if both were allowed they would count as two "different" questions
 * and the uniqueness guarantee would be a lie.
 */

import {
  FAMILY_ISSUE,
  booleanKnob,
  coefficientTerm,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  gcd,
  intDomain,
  rangeKnob,
} from './questionFamilyContract.mjs';

/** "3x - 2y = 7" — standard form as a student reads it. */
export const standardFormLatex = (a, b, c) => {
  const yTerm = coefficientTerm(Math.abs(b), 'y');
  return `${coefficientTerm(a, 'x')} ${b < 0 ? '-' : '+'} ${yTerm} = ${c}`;
};

/** "y = 3x - 2". */
export const slopeInterceptLatex = (m, k) => {
  const constant = k === 0 ? '' : k > 0 ? ` + ${k}` : ` - ${Math.abs(k)}`;
  return `y = ${coefficientTerm(m, 'x')}${constant}`;
};

/** Normalized key for ax + by = c: lowest terms, positive leading coefficient. */
const equationKey = (a, b, c) => {
  const divisor = gcd(gcd(a, b), c) || 1;
  const sign = a < 0 || (a === 0 && b < 0) ? -1 : 1;
  return `${(sign * a) / divisor + 0},${(sign * b) / divisor + 0},${(sign * c) / divisor + 0}`;
};

const lowestTerms = (a, b, c) => (gcd(gcd(a, b), c) || 1) === 1;

const systemGraph = (lines) => ({
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
  functions: lines.map((line, index) => ({ type: 'line', m: line.m, b: line.b, stroke: index === 0 ? '#1a73e8' : '#9334e6' })),
  ariaLabel: 'Graph of two linear equations with one intersection',
});

const systemFields = ({ authored, equationsLatex, solution, lines }) => {
  const showGraph = authored.showGraph === true;
  return {
    type: 'system',
    prompt: composeFamilyPrompt({
      authored: authored.prompt,
      tokens: { system: equationsLatex.map((equation) => `$${equation}$`).join(' and ') },
      fallback: 'Solve the system and enter the solution as an ordered pair $(x, y)$.',
    }),
    equationsLatex,
    solution,
    showEquations: authored.showEquations !== false,
    // An algebraic-method family does not hand the student the intersection
    // on a graph unless the assignment explicitly asks for one.
    showGraph,
    ...(showGraph ? { graph: systemGraph(lines) } : {}),
  };
};

const orderedPairFields = ({ authored, equationsLatex, solution }) => {
  const system = equationsLatex.map((equation) => `$${equation}$`).join(' and ');
  return {
    type: 'multiAnswer',
    prompt: composeFamilyPrompt({
      authored: authored.prompt,
      tokens: { system },
      fallback: `Solve the system ${system}. Write the solution as an ordered pair.`,
      mathSentence: system,
    }),
    answerFields: [{
      id: 'solution',
      label: '$(x, y)$ =',
      answer: `(${solution[0]}, ${solution[1]})`,
      answerFormat: 'orderedPair',
      inputProfile: 'orderedPair',
    }],
  };
};

/* ---------------------------------------------------------------------------
 * systems.elimination:  a1x + b1y = c1, a2x + b2y = c2.
 * ------------------------------------------------------------------------- */

export const eliminationSystemFamily = defineQuestionFamily({
  id: 'systems.elimination',
  version: 1,
  title: 'System of linear equations (elimination)',
  skill: {
    objective: 'Solve a system of two linear equations in standard form.',
    alignments: ['A.5C'],
    strand: 'systems',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {
    solutionRange: rangeKnob([-8, 8], { limits: [-20, 20], label: 'Solution range' }),
    coefficientRange: rangeKnob([-6, 6], { limits: [-12, 12], label: 'Coefficient range' }),
    // When true, one variable already has equal or opposite coefficients, so a
    // single addition or subtraction eliminates it (the introductory case).
    requireMatchingCoefficient: booleanKnob(false, { label: 'One variable eliminates directly' }),
  },
  parameters: (c) => ({
    x0: intDomain(c.solutionRange[0], c.solutionRange[1]),
    y0: intDomain(c.solutionRange[0], c.solutionRange[1]),
    a1: intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] }),
    b1: intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] }),
    a2: intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] }),
    b2: intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] }),
  }),
  derive: ({ x0, y0, a1, b1, a2, b2 }) => ({
    c1: a1 * x0 + b1 * y0,
    c2: a2 * x0 + b2 * y0,
    det: a1 * b2 - a2 * b1,
  }),
  rules: ({ a1, b1, c1, a2, b2, c2, det }, c) => {
    // Both lines pass through (x0, y0) by construction, so a zero determinant
    // means the SAME line twice, not two parallel ones.
    if (det === 0) return [FAMILY_ISSUE.COINCIDENT_SYSTEM];
    const issues = [];
    if (!lowestTerms(a1, b1, c1) || !lowestTerms(a2, b2, c2)) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (Math.abs(c1) > 60 || Math.abs(c2) > 60) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (c.requireMatchingCoefficient && !(Math.abs(a1) === Math.abs(a2) || Math.abs(b1) === Math.abs(b2))) {
      issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    }
    return issues;
  },
  // A system is a SET of equations: listing them in the other order is the
  // same system.
  fingerprint: ({ a1, b1, c1, a2, b2, c2 }) => fingerprintOf('systems.elimination', [
    equationKey(a1, b1, c1),
    equationKey(a2, b2, c2),
  ].sort()),
  answer: ({ x0, y0 }) => ({ kind: 'orderedPair', value: [x0, y0], display: `(${x0}, ${y0})` }),
  tools: {
    system: ({ x0, y0, a1, b1, c1, a2, b2, c2 }, { authored }) => systemFields({
      authored,
      equationsLatex: [standardFormLatex(a1, b1, c1), standardFormLatex(a2, b2, c2)],
      solution: [x0, y0],
      lines: [{ m: -a1 / b1, b: c1 / b1 }, { m: -a2 / b2, b: c2 / b2 }],
    }),
    multiAnswer: ({ x0, y0, a1, b1, c1, a2, b2, c2 }, { authored }) => orderedPairFields({
      authored,
      equationsLatex: [standardFormLatex(a1, b1, c1), standardFormLatex(a2, b2, c2)],
      solution: [x0, y0],
    }),
  },
  defaultTool: 'system',
  recovery: { eligible: true },
});

/* ---------------------------------------------------------------------------
 * systems.substitution:  y = mx + k, ax + by = c.
 * ------------------------------------------------------------------------- */

export const substitutionSystemFamily = defineQuestionFamily({
  id: 'systems.substitution',
  version: 1,
  title: 'System of linear equations (substitution)',
  skill: {
    objective: 'Solve a system of two linear equations when one equation is solved for y.',
    alignments: ['A.5C'],
    strand: 'systems',
  },
  difficulty: { band: 3, dok: 2 },
  constraints: {
    solutionRange: rangeKnob([-8, 8], { limits: [-20, 20], label: 'Solution range' }),
    slopeRange: rangeKnob([-5, 5], { limits: [-10, 10], label: 'Slope range' }),
    coefficientRange: rangeKnob([-6, 6], { limits: [-12, 12], label: 'Coefficient range' }),
  },
  parameters: (c) => ({
    x0: intDomain(c.solutionRange[0], c.solutionRange[1]),
    y0: intDomain(c.solutionRange[0], c.solutionRange[1]),
    m: intDomain(c.slopeRange[0], c.slopeRange[1], { exclude: [0] }),
    a: intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] }),
    b: intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] }),
  }),
  derive: ({ x0, y0, m, a, b }) => ({
    k: y0 - m * x0,
    c: a * x0 + b * y0,
    // -m·x + y = k against a·x + b·y = c.
    det: -m * b - a,
  }),
  rules: ({ a, b, c, k, det }) => {
    if (det === 0) return [FAMILY_ISSUE.COINCIDENT_SYSTEM];
    const issues = [];
    if (!lowestTerms(a, b, c)) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (Math.abs(k) > 25 || Math.abs(c) > 60) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  fingerprint: ({ m, k, a, b, c }) => fingerprintOf('systems.substitution', [`${m},${k}`, equationKey(a, b, c)]),
  answer: ({ x0, y0 }) => ({ kind: 'orderedPair', value: [x0, y0], display: `(${x0}, ${y0})` }),
  tools: {
    system: ({ x0, y0, m, k, a, b, c }, { authored }) => systemFields({
      authored,
      equationsLatex: [slopeInterceptLatex(m, k), standardFormLatex(a, b, c)],
      solution: [x0, y0],
      lines: [{ m, b: k }, { m: -a / b, b: c / b }],
    }),
    multiAnswer: ({ x0, y0, m, k, a, b, c }, { authored }) => orderedPairFields({
      authored,
      equationsLatex: [slopeInterceptLatex(m, k), standardFormLatex(a, b, c)],
      solution: [x0, y0],
    }),
  },
  defaultTool: 'system',
  recovery: { eligible: true },
});

export const SYSTEMS_FAMILIES = Object.freeze([
  eliminationSystemFamily,
  substitutionSystemFamily,
]);
