/*
 * LINEAR EQUATIONS WITH SPECIAL CASES, DISTRIBUTION AND EXACT FRACTIONS.
 *
 *   linear.multiStepEquation  v2   variables on both sides; one solution, no
 *                                  solution, every real number, or a mix
 *   linear.twoStepEquation    v2   a·x + b = c and a(x + b) = c, with
 *                                  rational coefficients or answers
 *
 * WHY NEW VERSIONS AND NOT NEW KNOBS ON v1. A v1 slot already in front of
 * students resolves its constraints with "fallback": an unknown knob is
 * reported and ignored. A slot that asked v1 for `solutionCase: "none"`
 * (the #429 coverage report names that knob) has therefore been handing out
 * ONE-solution equations, with pins. Teaching v1 the knob would turn those
 * pins into different questions. So v1 is untouched — byte for byte, which
 * tests/platform/questionFamilyHistoricalPins.test.mjs proves against a
 * snapshot taken before this file existed — and the new mathematics ships as
 * v2, which an assignment opts into with `"version": 2`. An unpinned slot
 * still means v1.
 *
 * WHAT v2 GUARANTEES.
 *
 *   - Strict constraints: a misspelled `solutionCase`, `distribute: "yes"` or
 *     a range out of bounds is a resolution error, never a silent default.
 *   - Every candidate is built by a CASE CONSTRUCTOR (the right side that
 *     makes the case) and then classified again, independently, from the
 *     equation that is actually displayed (questionFamilyExact.mjs). A
 *     candidate whose displayed equation is not the intended case — a
 *     "one solution" whose variable terms happen to cancel, an "identity"
 *     with a constant off — is refused (`case_mismatch`).
 *   - The same SHAPES serve every case, so in a mixed slot the structure of
 *     the equation says nothing about its answer: `5x + 3 - 2x = 3x + 3` and
 *     `5x + 3 - 2x = 3x + 1` look alike until the student does the algebra.
 *   - A mixed slot is balanced: the strata are (case × shape) and the engine
 *     interleaves them, so a class of 30 gets exactly 10 of each case.
 *   - Exact: coefficients, constants and answers are rationals; a fraction is
 *     never turned into a decimal. "x = 7/3" is the key, not 2.333….
 *
 * THE STUDENT DOES THE MATHEMATICS on Step Algebra's own workspaces. A slot
 * that can produce a special case opens the relation workspace, whose
 * "No solution" and "All real numbers" conclusions are accepted only once the
 * student's own algebra has left a statement with no variable (7 = 2, 3 = 3);
 * the shared server grader then compares that conclusion with the solution
 * set of the ORIGINAL equation. A one-solution slot opens the same equation
 * workspace v1 does.
 */

import {
  CONSTRAINT_POLICY,
  FAMILY_ISSUE,
  choiceDomain,
  choiceKnob,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
  rangeKnob,
} from './questionFamilyContract.mjs';
import {
  LINEAR_CASE,
  add,
  absolute,
  classifyLinearEquation,
  constTerm,
  engineSide,
  equals,
  groupTerm,
  isInteger,
  isZero,
  latexSide,
  multiply,
  rational,
  rationalLatex,
  rationalText,
  sideFingerprint,
  subtract,
  toNumber,
  toRational,
  xTerm,
} from './questionFamilyExact.mjs';

const VARIABLES = ['x', 'n', 'a', 'b', 'k', 'm', 'p', 't', 'w', 'y'];

export const SOLUTION_CASE_CHOICES = Object.freeze(['one', 'none', 'infinite', 'mixed']);
export const DISTRIBUTE_CHOICES = Object.freeze([false, true, 'mixed']);
export const NUMBER_FORM_CHOICES = Object.freeze(['integer', 'fraction']);

/** The largest denominator a fractional answer may have: a student can still check it by hand. */
export const MAX_ANSWER_DENOMINATOR = 12;
const CONSTANT_LIMIT = 80;
const COEFFICIENT_LIMIT = 20;

/*
 * Fractional coefficients: the halves, thirds and quarters a classroom uses.
 * The coefficient range bounds them by sign and size: [2, 6] keeps the
 * positive ones, [-8, 8] keeps all of them. Never an integer: in fraction
 * form at least one coefficient a student sees is a genuine fraction.
 */
const FRACTION_COEFFICIENTS = Object.freeze([
  [1, 2], [3, 2], [5, 2], [1, 3], [2, 3], [4, 3], [5, 3], [1, 4], [3, 4], [5, 4],
].flatMap(([n, d]) => [rational(n, d), rational(-n, d)]));

const fractionsWithin = ([low, high]) => {
  const magnitude = Math.max(Math.abs(low), Math.abs(high));
  return FRACTION_COEFFICIENTS.filter((value) => {
    const number = toNumber(value);
    if (low > 0 && number < 0) return false;
    if (high < 0 && number > 0) return false;
    return Math.abs(number) <= magnitude;
  });
};

const nonzeroIntegers = ([low, high], exclude = []) => intDomain(low, high, { exclude: [0, ...exclude] });

/* ---------------------------------------------------------------------------
 * Shapes. Each one says how its three numbers p, q, r are laid out on the
 * left side, and — by its OWN algebra, never by expanding the tree — what
 * that side simplifies to (A·x + B). The case constructors build on that
 * simplification; questionFamilyExact.mjs re-derives it from the tree and the
 * rules require the two to agree.
 * ------------------------------------------------------------------------- */

export const MULTI_STEP_SHAPES = Object.freeze({
  // 5x + 3 − 2x = …    like terms in x
  likeTerms: Object.freeze({
    distribute: false,
    roles: Object.freeze({ p: 'coefficient', q: 'constant', r: 'coefficient' }),
    left: ({ p, q, r }) => [xTerm(p), constTerm(q), xTerm(r)],
    simplified: ({ p, q, r }) => ({ A: add(p, r), B: toRational(q) }),
  }),
  // 4x + 9 − 2 = …     like constants
  constants: Object.freeze({
    distribute: false,
    roles: Object.freeze({ p: 'coefficient', q: 'constant', r: 'constant' }),
    left: ({ p, q, r }) => [xTerm(p), constTerm(q), constTerm(r)],
    simplified: ({ p, q, r }) => ({ A: toRational(p), B: add(q, r) }),
  }),
  // 3(x + 2) + 1 = …   distribute, then a constant
  distributeConstant: Object.freeze({
    distribute: true,
    roles: Object.freeze({ p: 'multiplier', q: 'constant', r: 'constant' }),
    left: ({ p, q, r }) => [groupTerm(p, [xTerm(1), constTerm(q)]), constTerm(r)],
    simplified: ({ p, q, r }) => ({ A: toRational(p), B: add(multiply(p, q), r) }),
  }),
  // −2(x − 3) + 5x = … distribute, then like terms
  distributeLikeTerms: Object.freeze({
    distribute: true,
    roles: Object.freeze({ p: 'multiplier', q: 'constant', r: 'coefficient' }),
    left: ({ p, q, r }) => [groupTerm(p, [xTerm(1), constTerm(q)]), xTerm(r)],
    simplified: ({ p, q, r }) => ({ A: add(p, r), B: multiply(p, q) }),
  }),
});

const shapesFor = (distribute, table) => Object.keys(table).filter((name) => (
  distribute === 'mixed' ? true : table[name].distribute === distribute
));

/*
 * THE CASE CONSTRUCTORS: the right side s·x + t that makes each case, from
 * the left side's A·x + B. Exported so the mutation tests can break each one
 * and watch the independent check refuse every candidate it builds.
 *
 *   one       s ≠ A. Integer answers are built FROM the answer (t = B + (A − s)x),
 *             so the key cannot disagree with the question; fractional
 *             answers come from a free t and are checked to be fractions.
 *   none      s = A, so the variable terms cancel; t ≠ B, so the constants
 *             that remain conflict (7 = 2).
 *   infinite  s = A and t = B: both sides are the same expression once
 *             simplified, though they are never written the same way.
 */
export const MULTI_STEP_CASE_CONSTRUCTORS = Object.freeze({
  [LINEAR_CASE.ONE]: ({ A, B, s, t, x }) => (x !== null
    ? { s, t: add(B, multiply(subtract(A, s), x)) }
    : { s, t }),
  [LINEAR_CASE.NONE]: ({ A, t }) => ({ s: A, t }),
  [LINEAR_CASE.INFINITE]: ({ A, B }) => ({ s: A, t: B }),
});

const casesFor = (solutionCase) => (solutionCase === 'mixed'
  ? [LINEAR_CASE.ONE, LINEAR_CASE.NONE, LINEAR_CASE.INFINITE]
  : [solutionCase]);

/** Coefficients a student sees (every number in front of x or a bracket). */
const presentedCoefficients = (terms) => terms.flatMap((term) => {
  if (term.kind === 'x') return [term.coef];
  if (term.kind === 'group') return [term.mult, ...presentedCoefficients(term.inner).filter((value) => !equals(value, 1))];
  return [];
});
const presentedConstants = (terms) => terms.flatMap((term) => {
  if (term.kind === 'c') return [term.value];
  if (term.kind === 'group') return presentedConstants(term.inner);
  return [];
});

/** The exact key a built question carries: what a correct final answer says. */
export const linearSolutionKey = (classified) => {
  if (classified.case === LINEAR_CASE.NONE) return Object.freeze({ outcome: 'noSolution', display: 'No solution' });
  if (classified.case === LINEAR_CASE.INFINITE) return Object.freeze({ outcome: 'allReals', display: 'All real numbers' });
  return Object.freeze({
    outcome: 'value',
    value: rationalText(classified.solution),
    latex: rationalLatex(classified.solution),
    display: rationalText(classified.solution),
  });
};

/*
 * The checks every candidate passes, shared by both families. `values` holds
 * the displayed trees; `intended` is what the constructor meant.
 */
const verifyLinearCandidate = ({ values, constraints, intendedSolution = null }) => {
  const verified = classifyLinearEquation(values.leftTerms, values.rightTerms);
  if (verified.case !== values.case) return [FAMILY_ISSUE.CASE_MISMATCH];
  if (!equals(verified.simplified.A, values.A) || !equals(verified.simplified.B, values.B)) return [FAMILY_ISSUE.CASE_MISMATCH];
  const issues = [];
  if (verified.case === LINEAR_CASE.ONE) {
    const solution = verified.solution;
    if (intendedSolution !== null && !equals(solution, intendedSolution)) return [FAMILY_ISSUE.CASE_MISMATCH];
    if (constraints.solutionForm === 'integer' && !isInteger(solution)) issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
    if (constraints.solutionForm === 'fraction') {
      if (isInteger(solution)) issues.push(FAMILY_ISSUE.UNINTENDED_INTEGER);
      if (solution.d > MAX_ANSWER_DENOMINATOR) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    }
    const bound = Math.max(Math.abs(constraints.solutionRange[0]), Math.abs(constraints.solutionRange[1]));
    if (Math.abs(toNumber(solution)) > bound) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
  }
  const coefficients = [...presentedCoefficients(values.leftTerms), ...presentedCoefficients(values.rightTerms)];
  const constants = [...presentedConstants(values.leftTerms), ...presentedConstants(values.rightTerms)];
  if (constraints.coefficientForm === 'integer' && coefficients.some((value) => !isInteger(value))) {
    issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
  }
  if (constraints.coefficientForm === 'fraction') {
    // Rational coefficients, whole-number constants: the equation a student
    // clears by multiplying through by a common denominator.
    if (coefficients.every((value) => isInteger(value))) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (constants.some((value) => !isInteger(value))) issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
  }
  if (constants.some((value) => Math.abs(toNumber(value)) > CONSTANT_LIMIT)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
  if ([verified.simplified.A, verified.simplified.C].some((value) => Math.abs(toNumber(value)) > COEFFICIENT_LIMIT)) {
    issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
  }
  return issues;
};

const linearAnswer = (values, constraints) => {
  const key = linearSolutionKey(classifyLinearEquation(values.leftTerms, values.rightTerms));
  if (key.outcome !== 'value') return { kind: 'solutionSet', value: key.outcome, display: key.display };
  const solution = toRational(key.value);
  return {
    kind: 'number',
    // An integer answer keeps v1's numeric shape; a fraction stays exact text.
    value: isInteger(solution) ? solution.n : key.value,
    exact: key.value,
    display: `${constraints.variable} = ${key.value}`,
  };
};

/** The Step Algebra question, from the displayed trees. */
const stepAlgebraQuestion = ({ values, constraints, authored, offersSpecialOutcomes }) => {
  const variable = constraints.variable;
  const left = engineSide(values.leftTerms, variable);
  const right = engineSide(values.rightTerms, variable);
  const latex = `${latexSide(values.leftTerms, variable)} = ${latexSide(values.rightTerms, variable)}`;
  const key = linearSolutionKey(classifyLinearEquation(values.leftTerms, values.rightTerms));
  const integerAnswer = key.outcome === 'value' && isInteger(toRational(key.value));
  return {
    type: 'stepAlgebra',
    prompt: composeFamilyPrompt({
      authored: authored.prompt,
      tokens: { equation: `$${latex}$` },
      fallback: offersSpecialOutcomes
        ? `Solve for $${variable}$. If no value of $${variable}$ makes the equation true, or every value does, say so.`
        : `Solve for $${variable}$.`,
    }),
    variable,
    leftExpression: left,
    rightExpression: right,
    equation: `${left} = ${right}`,
    // An integer answer keeps v1's numeric key, so every path that marks a
    // family instance by its generated answer marks this one the same way.
    // A fraction or a special case has no numeric key: the shared grader
    // marks it against the ORIGINAL equation, exactly.
    ...(integerAnswer ? { generatedAnswer: toRational(key.value).n } : {}),
    solutionKey: key,
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
    // The relation workspace is the one whose "No solution" and "All real
    // numbers" conclusions exist. Every instance of a slot that CAN be a
    // special case opens it — including that slot's one-solution instances,
    // so the workspace never tells a student which case they drew.
    ...(offersSpecialOutcomes ? { relationWorkspace: true } : {}),
  };
};

// Instance fields an authored slot must never pre-fill: a stale key or
// equation copied into the template would otherwise survive the merge.
const STEP_ALGEBRA_INSTANCE_FIELDS = Object.freeze([
  'generatedAnswer', 'solutionKey', 'leftExpression', 'rightExpression', 'equation', 'equationLatex', 'equationAscii', 'initialEquation',
]);

const linearCapabilities = ({ solutionCases, shapes }) => ({
  targetTool: { tool: 'stepAlgebra', workspaces: solutionCases.length > 1 ? ['equation', 'relation'] : ['equation'] },
  solutionCases,
  solutionForms: [...NUMBER_FORM_CHOICES],
  coefficientForms: [...NUMBER_FORM_CHOICES],
  distribute: [...DISTRIBUTE_CHOICES],
  shapes,
  exactArithmetic: true,
  independentVerification: 'questionFamilyExact.classifyLinearEquation on the displayed equation',
});

/* ---------------------------------------------------------------------------
 * linear.multiStepEquation v2
 * ------------------------------------------------------------------------- */

const multiStepParameters = (c, stratum) => {
  if (!stratum) return {};
  const shape = MULTI_STEP_SHAPES[stratum.shape];
  if (!shape) return {};
  const fraction = c.coefficientForm === 'fraction';
  const coefficient = fraction
    ? choiceDomain([...fractionsWithin(c.coefficientRange), ...nonzeroIntegers(c.coefficientRange).values])
    : nonzeroIntegers(c.coefficientRange);
  const lead = fraction
    ? choiceDomain(fractionsWithin(c.coefficientRange))
    : shape.roles.p === 'multiplier'
      // A multiplier of 1 is not a distribution; -1 is (−(x − 4)).
      ? nonzeroIntegers(c.coefficientRange, [1])
      : nonzeroIntegers(c.coefficientRange);
  const constant = nonzeroIntegers(c.constantRange);
  const domains = {
    p: lead,
    q: constant,
    r: shape.roles.r === 'coefficient' ? coefficient : constant,
  };
  if (stratum.case === LINEAR_CASE.ONE) {
    domains.s = coefficient;
    if (c.solutionForm === 'integer') domains.x = intDomain(c.solutionRange[0], c.solutionRange[1]);
    else domains.t = constant;
  }
  if (stratum.case === LINEAR_CASE.NONE) domains.t = constant;
  return domains;
};

const multiStepDerive = (params, c) => {
  const shape = MULTI_STEP_SHAPES[params.shape];
  const p = toRational(params.p);
  const q = toRational(params.q);
  const r = toRational(params.r);
  const { A, B } = shape.simplified({ p, q, r });
  const intendedSolution = params.case === LINEAR_CASE.ONE && params.x !== undefined ? toRational(params.x) : null;
  const right = MULTI_STEP_CASE_CONSTRUCTORS[params.case]({
    A,
    B,
    s: params.s === undefined ? null : toRational(params.s),
    t: params.t === undefined ? null : toRational(params.t),
    x: intendedSolution,
  });
  return {
    A,
    B,
    s: right.s,
    t: right.t,
    intendedSolution,
    leftTerms: shape.left({ p, q, r }),
    rightTerms: [xTerm(right.s), constTerm(right.t)],
    solutionForm: c.solutionForm,
  };
};

export const multiStepEquationV2Family = defineQuestionFamily({
  id: 'linear.multiStepEquation',
  version: 2,
  title: 'Linear equation with variables on both sides (special cases)',
  skill: {
    objective: 'Solve a linear equation with the variable on both sides, including equations with no solution or infinitely many solutions.',
    alignments: ['A.5A', '8.8C'],
    strand: 'linear',
  },
  difficulty: { band: 3, dok: 2 },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    solutionCase: choiceKnob('one', SOLUTION_CASE_CHOICES, { label: 'Solution case' }),
    distribute: choiceKnob(false, DISTRIBUTE_CHOICES, { label: 'Distributive property' }),
    solutionForm: choiceKnob('integer', NUMBER_FORM_CHOICES, { label: 'Answer form (one-solution equations)' }),
    coefficientForm: choiceKnob('integer', NUMBER_FORM_CHOICES, { label: 'Coefficient form' }),
    solutionRange: rangeKnob([-10, 10], { limits: [-30, 30], label: 'Solution range' }),
    coefficientRange: rangeKnob([-8, 8], { limits: [-15, 15], label: 'Coefficient range' }),
    constantRange: rangeKnob([-15, 15], { limits: [-40, 40], label: 'Constant range' }),
    variable: choiceKnob('x', VARIABLES, { label: 'Variable' }),
  },
  conceptConstraints: ['solutionCase', 'distribute', 'solutionForm', 'coefficientForm'],
  strata: {
    values: (c) => casesFor(c.solutionCase).flatMap((solutionCase) => shapesFor(c.distribute, MULTI_STEP_SHAPES)
      .map((shape) => ({ case: solutionCase, shape }))),
  },
  parameters: multiStepParameters,
  // Smaller numbers only. The case, the distribution and the number forms
  // are concept constraints and cannot be touched by a support.
  supportConstraints: {
    'reduce-complexity': { coefficientRange: [-6, 6], constantRange: [-10, 10], solutionRange: [-6, 6] },
  },
  derive: multiStepDerive,
  rules: (values, c) => {
    const issues = verifyLinearCandidate({ values, constraints: c, intendedSolution: values.intendedSolution });
    if (issues.includes(FAMILY_ISSUE.CASE_MISMATCH)) return issues;
    // Both sides keep the variable and a constant after simplifying:
    // "variables on both sides", and nothing hidden behind a zero.
    if (isZero(values.A) || isZero(values.s)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (isZero(values.B) || isZero(values.t)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    // A like-terms shape whose two x terms cancel on the left is a
    // different exercise (and would read as "one side has no variable").
    return issues;
  },
  // The displayed equation, shape and every number — not the letter, which
  // is presentation. A solution case is a property of the numbers, so
  // instances of different strata can never share a fingerprint.
  fingerprint: (values) => fingerprintOf('linear.multiStepEquation@2', [
    values.shape,
    sideFingerprint(values.leftTerms),
    sideFingerprint(values.rightTerms),
  ]),
  answer: linearAnswer,
  tools: {
    stepAlgebra: (values, { authored, constraints }) => stepAlgebraQuestion({
      values,
      constraints,
      authored,
      offersSpecialOutcomes: constraints.solutionCase !== LINEAR_CASE.ONE,
    }),
  },
  defaultTool: 'stepAlgebra',
  instanceFields: STEP_ALGEBRA_INSTANCE_FIELDS,
  recovery: { eligible: true },
  capabilities: linearCapabilities({ solutionCases: [...SOLUTION_CASE_CHOICES], shapes: Object.keys(MULTI_STEP_SHAPES) }),
});

/* ---------------------------------------------------------------------------
 * linear.twoStepEquation v2
 *
 * a·x + b = c with a ≠ 0 always has exactly one solution, so this family has
 * no solutionCase: asking for one is a resolution error that names the
 * family's real constraints. What v2 adds is the A.5A distributive case and
 * exact rational numbers.
 * ------------------------------------------------------------------------- */

export const TWO_STEP_SHAPES = Object.freeze({
  // 3x + 5 = 20
  plain: Object.freeze({
    distribute: false,
    left: ({ p, q }) => [xTerm(p), constTerm(q)],
    simplified: ({ p, q }) => ({ A: toRational(p), B: toRational(q) }),
  }),
  // 3(x + 5) = 24
  distribute: Object.freeze({
    distribute: true,
    left: ({ p, q }) => [groupTerm(p, [xTerm(1), constTerm(q)])],
    simplified: ({ p, q }) => ({ A: toRational(p), B: multiply(p, q) }),
  }),
});

export const twoStepEquationV2Family = defineQuestionFamily({
  id: 'linear.twoStepEquation',
  version: 2,
  title: 'Two-step linear equation (distribution and fractions)',
  skill: {
    objective: 'Solve a two-step linear equation in one variable, including one that needs the distributive property or has rational numbers.',
    alignments: ['A.5A', '7.11A'],
    strand: 'linear',
  },
  difficulty: { band: 2, dok: 1 },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    distribute: choiceKnob(false, DISTRIBUTE_CHOICES, { label: 'Distributive property' }),
    solutionForm: choiceKnob('integer', NUMBER_FORM_CHOICES, { label: 'Answer form' }),
    coefficientForm: choiceKnob('integer', NUMBER_FORM_CHOICES, { label: 'Coefficient form' }),
    solutionRange: rangeKnob([-10, 10], { limits: [-40, 40], label: 'Solution range' }),
    coefficientRange: rangeKnob([-9, 9], { limits: [-20, 20], label: 'Coefficient range' }),
    constantRange: rangeKnob([-15, 15], { limits: [-50, 50], label: 'Constant range' }),
    variable: choiceKnob('x', VARIABLES, { label: 'Variable' }),
  },
  conceptConstraints: ['distribute', 'solutionForm', 'coefficientForm'],
  strata: {
    values: (c) => shapesFor(c.distribute, TWO_STEP_SHAPES).map((shape) => ({ case: LINEAR_CASE.ONE, shape })),
  },
  parameters: (c, stratum) => {
    if (!stratum || !TWO_STEP_SHAPES[stratum.shape]) return {};
    const domains = {
      // 0 is not an equation in x; ±1 makes it a one-step equation in disguise.
      p: c.coefficientForm === 'fraction' ? choiceDomain(fractionsWithin(c.coefficientRange)) : nonzeroIntegers(c.coefficientRange, [1, -1]),
      q: nonzeroIntegers(c.constantRange),
    };
    if (c.solutionForm === 'integer') domains.x = intDomain(c.solutionRange[0], c.solutionRange[1]);
    else domains.t = nonzeroIntegers(c.constantRange);
    return domains;
  },
  // The same narrowing v1 applies: smaller, positive coefficients and
  // constants. The task stays a two-step equation in the same forms.
  supportConstraints: {
    'reduce-complexity': { coefficientRange: [2, 6], constantRange: [-8, 8], solutionRange: [-6, 6] },
  },
  derive: (params, c) => {
    const shape = TWO_STEP_SHAPES[params.shape];
    const p = toRational(params.p);
    const q = toRational(params.q);
    const { A, B } = shape.simplified({ p, q });
    const intendedSolution = params.x === undefined ? null : toRational(params.x);
    const t = intendedSolution !== null ? add(multiply(A, intendedSolution), B) : toRational(params.t);
    return {
      A,
      B,
      s: rational(0),
      t,
      intendedSolution,
      leftTerms: shape.left({ p, q }),
      rightTerms: [constTerm(t)],
      solutionForm: c.solutionForm,
    };
  },
  rules: (values, c) => {
    const issues = verifyLinearCandidate({ values, constraints: c, intendedSolution: values.intendedSolution });
    if (issues.includes(FAMILY_ISSUE.CASE_MISMATCH)) return issues;
    if (isZero(values.t)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    // v1's bound on the right side, so a reduced or default slot stays a
    // pencil-and-paper equation.
    if (Math.abs(toNumber(values.t)) > 150) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (Math.abs(toNumber(absolute(values.B))) > CONSTANT_LIMIT) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  fingerprint: (values) => fingerprintOf('linear.twoStepEquation@2', [
    values.shape,
    sideFingerprint(values.leftTerms),
    sideFingerprint(values.rightTerms),
  ]),
  answer: linearAnswer,
  tools: {
    stepAlgebra: (values, { authored, constraints }) => stepAlgebraQuestion({ values, constraints, authored, offersSpecialOutcomes: false }),
  },
  defaultTool: 'stepAlgebra',
  instanceFields: STEP_ALGEBRA_INSTANCE_FIELDS,
  recovery: { eligible: true },
  capabilities: {
    ...linearCapabilities({ solutionCases: ['one'], shapes: Object.keys(TWO_STEP_SHAPES) }),
    solutionCases: ['one'],
    notes: 'a·x + b = c with a ≠ 0 has exactly one solution, so this family has no solutionCase; use linear.multiStepEquation v2 for no-solution and identity equations.',
  },
});

export const LINEAR_CASE_FAMILIES = Object.freeze([
  multiStepEquationV2Family,
  twoStepEquationV2Family,
]);
