/*
 * SYSTEMS OF TWO LINEAR EQUATIONS, SOLVED ALGEBRAICALLY — ALL THREE CASES.
 *
 *   systems.algebraic2x2  v1   a1·x + b1·y = c1,  a2·x + b2·y = c2
 *
 * The question opens the Systems Workspace's algebraic mode — the workspace
 * that already takes a student through substitution or elimination, an
 * embedded Step Algebra solve, back-substitution and verification, and, when
 * their own reduction reaches a statement with no variable (0 = 7, 0 = 0),
 * asks them to read it: true or false, no solution or infinitely many,
 * inconsistent or consistent-dependent. Its shared grader
 * (serverGrading/tools/systemsWorkspace/algebraic.mjs) decides which of those
 * rubrics applies from the AUTHORED equations, so the browser and the server
 * grade the same work the same way. This family supplies the equations.
 *
 * The existing systems.elimination and systems.substitution families are
 * untouched: they generate one-solution systems for the `system` and
 * `multiAnswer` tools, and their pins keep replaying.
 *
 * CONSTRUCTION, per case (exported, so the mutation tests can break each):
 *
 *   one       two equations through a chosen point (x0, y0) — an integer
 *             point, or with `solutionForm: "fraction"` a point with a
 *             genuinely fractional coordinate (halves, thirds, quarters),
 *             kept only when both equations still have whole-number
 *             coefficients and constants.
 *   none      the second equation is a multiple (×2, ×3, ×4, or negative)
 *             of the first on the left, with a constant that is NOT the same
 *             multiple: parallel, distinct lines.
 *   infinite  the second equation is that multiple of the whole first
 *             equation: the same line, written differently.
 *
 * Then, independently, the displayed system is classified exactly (the
 * determinant and the augmented minors, in rationals —
 * questionFamilyExact.classifyLinearSystem2x2), and a candidate is kept only
 * if that classification, and for one solution the exact intersection, is
 * what the constructor meant.
 *
 * METHOD FREEDOM. Unless the slot says "substitution" or "elimination", the
 * question is `studentChoice`: the student picks, and the grader marks the
 * mathematics — the shared grader never reads which method was used.
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
  rangeKnob,
} from './questionFamilyContract.mjs';
import {
  SYSTEM_CASE,
  add,
  classifyLinearSystem2x2,
  equals,
  isInteger,
  multiply,
  rational,
  rationalText,
  satisfiesRow,
  standardFormLatexExact,
  standardFormText,
  toNumber,
  toRational,
} from './questionFamilyExact.mjs';

export const SYSTEM_SOLUTION_CASE_CHOICES = Object.freeze(['one', 'none', 'infinite', 'mixed']);
export const SYSTEM_SOLUTION_FORM_CHOICES = Object.freeze(['integer', 'fraction']);
export const SYSTEM_METHODS = Object.freeze(['substitution', 'elimination', 'studentChoice']);

const VARIABLES = Object.freeze(['x', 'y']);
const CONSTANT_LIMIT = 60;
const COEFFICIENT_LIMIT = 12;
// The second equation of a special system is the first times one of these:
// never ±1, which would only repeat (or negate) the first equation's left side.
const MULTIPLIERS = Object.freeze([-4, -3, -2, 2, 3, 4]);
// The first equation's constant in a special system.
const SPECIAL_CONSTANTS = Object.freeze({ low: -24, high: 24 });
// Fractional coordinates: halves, thirds and quarters.
const FRACTION_DENOMINATORS = Object.freeze([2, 3, 4]);

const casesFor = (solutionCase) => (solutionCase === 'mixed'
  ? [SYSTEM_CASE.ONE, SYSTEM_CASE.NONE, SYSTEM_CASE.INFINITE]
  : [solutionCase]);

/** Every coordinate the slot allows: integers, and in fraction form also n/2, n/3, n/4 inside the range. */
const coordinateDomain = ([low, high], solutionForm) => {
  const values = [];
  for (let value = low; value <= high; value += 1) values.push(rational(value));
  if (solutionForm === 'fraction') {
    FRACTION_DENOMINATORS.forEach((denominator) => {
      for (let numerator = low * denominator; numerator <= high * denominator; numerator += 1) {
        const value = rational(numerator, denominator);
        if (!isInteger(value) && value.d === denominator) values.push(value);
      }
    });
  }
  return choiceDomain(values);
};

const lowestTerms = ({ a, b, c }) => [a, b, c].every(isInteger)
  && (gcd(gcd(toRational(a).n, toRational(b).n), toRational(c).n) || 1) === 1;

/*
 * THE CASE CONSTRUCTORS: the two rows, from the stratum's free numbers.
 */
export const SYSTEM_CASE_CONSTRUCTORS = Object.freeze({
  [SYSTEM_CASE.ONE]: ({ a1, b1, a2, b2, x0, y0 }) => [
    { a: a1, b: b1, c: add(multiply(a1, x0), multiply(b1, y0)) },
    { a: a2, b: b2, c: add(multiply(a2, x0), multiply(b2, y0)) },
  ],
  [SYSTEM_CASE.NONE]: ({ a1, b1, c1, k, c2 }) => [
    { a: a1, b: b1, c: c1 },
    { a: multiply(k, a1), b: multiply(k, b1), c: c2 },
  ],
  [SYSTEM_CASE.INFINITE]: ({ a1, b1, c1, k }) => [
    { a: a1, b: b1, c: c1 },
    { a: multiply(k, a1), b: multiply(k, b1), c: multiply(k, c1) },
  ],
});

const rowText = (row) => standardFormText(row, VARIABLES);

/** The exact key a built question carries. */
export const systemSolutionKey = (classified) => {
  if (classified.case === SYSTEM_CASE.NONE) return Object.freeze({ outcome: 'noSolution', classification: 'inconsistent', display: 'No solution' });
  if (classified.case === SYSTEM_CASE.INFINITE) {
    return Object.freeze({ outcome: 'infinite', classification: 'consistent-dependent', display: 'Infinitely many solutions' });
  }
  const x = rationalText(classified.solution.x);
  const y = rationalText(classified.solution.y);
  return Object.freeze({ outcome: 'point', x, y, classification: 'consistent-independent', display: `(${x}, ${y})` });
};

export const algebraicSystemFamily = defineQuestionFamily({
  id: 'systems.algebraic2x2',
  version: 1,
  title: 'System of two linear equations (algebraic: one, none or infinitely many)',
  skill: {
    objective: 'Solve a system of two linear equations in two variables by substitution or elimination, and recognise a system with no solution or infinitely many solutions.',
    alignments: ['A.5C'],
    strand: 'systems',
  },
  difficulty: { band: 3, dok: 2 },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    solutionCase: choiceKnob('one', SYSTEM_SOLUTION_CASE_CHOICES, { label: 'Solution case' }),
    solutionForm: choiceKnob('integer', SYSTEM_SOLUTION_FORM_CHOICES, { label: 'Intersection form (one-solution systems)' }),
    solutionRange: rangeKnob([-8, 8], { limits: [-20, 20], label: 'Solution range' }),
    coefficientRange: rangeKnob([-6, 6], { limits: [-12, 12], label: 'Coefficient range' }),
  },
  conceptConstraints: ['solutionCase', 'solutionForm'],
  strata: { values: (c) => casesFor(c.solutionCase).map((solutionCase) => ({ case: solutionCase })) },
  parameters: (c, stratum) => {
    if (!stratum) return {};
    const coefficient = intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] });
    if (stratum.case === SYSTEM_CASE.ONE) {
      const coordinate = coordinateDomain(c.solutionRange, c.solutionForm);
      return { a1: coefficient, b1: coefficient, a2: coefficient, b2: coefficient, x0: coordinate, y0: coordinate };
    }
    const domains = {
      a1: coefficient,
      b1: coefficient,
      c1: intDomain(SPECIAL_CONSTANTS.low, SPECIAL_CONSTANTS.high, { exclude: [0] }),
      k: choiceDomain(MULTIPLIERS),
    };
    if (stratum.case === SYSTEM_CASE.NONE) domains.c2 = intDomain(-CONSTANT_LIMIT, CONSTANT_LIMIT, { exclude: [0] });
    return domains;
  },
  // Smaller numbers only; the case and the intersection form are concepts.
  supportConstraints: {
    'reduce-complexity': { coefficientRange: [-4, 4], solutionRange: [-6, 6] },
  },
  derive: (params) => {
    const numbers = Object.fromEntries(Object.entries(params)
      .filter(([name]) => name !== 'case')
      .map(([name, value]) => [name, toRational(value)]));
    const rows = SYSTEM_CASE_CONSTRUCTORS[params.case](numbers);
    return {
      rows,
      point: params.case === SYSTEM_CASE.ONE ? { x: numbers.x0, y: numbers.y0 } : null,
    };
  },
  rules: (values, c) => {
    const { rows, point } = values;
    // The independent reading of the system as displayed.
    const verified = classifyLinearSystem2x2(rows);
    if (verified.degenerate || verified.case !== values.case) return [FAMILY_ISSUE.CASE_MISMATCH];
    if (verified.case === SYSTEM_CASE.ONE) {
      if (!equals(verified.solution.x, point.x) || !equals(verified.solution.y, point.y)) return [FAMILY_ISSUE.CASE_MISMATCH];
      if (!rows.every((row) => satisfiesRow(row, point))) return [FAMILY_ISSUE.CASE_MISMATCH];
    }
    const issues = [];
    // Whole-number equations, always; and each one-solution equation in
    // lowest terms (2x + 4y = 6 is x + 2y = 3 written larger).
    if (!rows.every((row) => [row.a, row.b, row.c].every(isInteger))) issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
    else if (values.case === SYSTEM_CASE.ONE && !rows.every(lowestTerms)) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    else if (values.case !== SYSTEM_CASE.ONE && !lowestTerms(rows[0])) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (rows.some((row) => Math.abs(toNumber(row.a)) > COEFFICIENT_LIMIT || Math.abs(toNumber(row.b)) > COEFFICIENT_LIMIT)) {
      issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    }
    if (rows.some((row) => Math.abs(toNumber(row.c)) > CONSTANT_LIMIT)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (values.case === SYSTEM_CASE.ONE) {
      const fractional = !isInteger(point.x) || !isInteger(point.y);
      if (c.solutionForm === 'integer' && fractional) issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
      if (c.solutionForm === 'fraction' && !fractional) issues.push(FAMILY_ISSUE.UNINTENDED_INTEGER);
    }
    return issues;
  },
  // A system is a SET of equations: the same two in the other order are the
  // same question. Rows are kept as displayed — the multiple in a special
  // system is part of the question.
  fingerprint: ({ rows }) => fingerprintOf('systems.algebraic2x2', rows.map(rowText).sort()),
  answer: ({ rows }) => {
    const key = systemSolutionKey(classifyLinearSystem2x2(rows));
    if (key.outcome !== 'point') return { kind: 'solutionSet', value: key.outcome, display: key.display };
    const exact = [key.x, key.y];
    return {
      kind: 'orderedPair',
      value: exact.map((value) => (isInteger(toRational(value)) ? toRational(value).n : value)),
      exact,
      display: key.display,
    };
  },
  tools: {
    systemsWorkspace: ({ rows }, { authored, constraints }) => {
      const equations = rows.map(rowText);
      const system = rows.map((row) => `$${standardFormLatexExact(row, VARIABLES)}$`).join(' and ');
      const special = constraints.solutionCase !== SYSTEM_CASE.ONE;
      return {
        type: 'systemsWorkspace',
        mode: 'algebraic',
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { system },
          fallback: special
            ? 'Solve the system. Decide whether it has one solution, no solution, or infinitely many solutions.'
            : 'Solve the system of equations.',
        }),
        studentActions: ['solveSystem'],
        variables: [...VARIABLES],
        equations,
        // The slot's instructional choice when it makes one; otherwise the
        // student chooses, and only the mathematics is graded.
        method: SYSTEM_METHODS.includes(authored.method) ? authored.method : 'studentChoice',
        requireVerification: authored.requireVerification !== false,
        askEfficiency: authored.askEfficiency === true,
        // A generated intersection is exact (13/7, never 1.857), and so is
        // its check: the shared grader matches each value to 1e-6 relative
        // instead of the hand-authored 2×2 screen's 0.05.
        exactSolution: true,
        solutionKey: systemSolutionKey(classifyLinearSystem2x2(rows)),
      };
    },
  },
  defaultTool: 'systemsWorkspace',
  instanceFields: ['solutionKey', 'equations', 'variables', 'exactSolution'],
  recovery: { eligible: true },
  capabilities: {
    targetTool: { tool: 'systemsWorkspace', mode: 'algebraic', methods: [...SYSTEM_METHODS], defaultMethod: 'studentChoice' },
    solutionCases: [...SYSTEM_SOLUTION_CASE_CHOICES],
    solutionForms: [...SYSTEM_SOLUTION_FORM_CHOICES],
    coefficientForms: ['integer'],
    exactArithmetic: true,
    independentVerification: 'questionFamilyExact.classifyLinearSystem2x2 (determinant and augmented minors) on the displayed rows',
  },
});

export const SYSTEMS_ALGEBRAIC_FAMILIES = Object.freeze([algebraicSystemFamily]);
