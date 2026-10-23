/*
 * SOLVING LINEAR INEQUALITIES (A.5B) — the Step Algebra family behind the
 * Warm-Up and DOL of "Modeling and Solving Linear Inequalities" (Module 3,
 * Topic 1, Lesson 3).
 *
 *   inequalities.solveLinear   Solve a linear inequality in one variable —
 *                              two steps, variables on both sides, or with the
 *                              distributive property — on Step Algebra's
 *                              relation workspace, then graph the solution on
 *                              its number line (in Algebra I the number line
 *                              is the representation the workspace asks for).
 *
 * THE REVERSAL IS THE POINT. Every version is built from its SOLVED form,
 * x R k with a whole-number boundary k, and a reversal flag. When the
 * coefficient left after collecting the variable on the left is negative, the
 * displayed relation is the reverse of R, so the student who divides by that
 * coefficient must reverse the symbol to reach x R k. A mixed slot is balanced
 * on the flag: half a class must reverse the symbol, and nothing in the
 * inequality says which half a student is in. The workspace refuses a step
 * that keeps the old symbol after multiplying or dividing by a negative.
 *
 * INDEPENDENTLY VERIFIED. The rules expand the DISPLAYED sides again
 * (questionFamilyExact.mjs) and require the solved relation, the boundary and
 * the reversal to be the ones intended; a candidate that disagrees is
 * refused (`case_mismatch`).
 *
 * The student does the mathematics. The shared grader compares the student's
 * solved relation, and their number-line graph, with the solution set of the
 * ORIGINAL inequality, exactly; a family writes no hint, step or answer into
 * the question.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract and the exact arithmetic the linear
 * families share.
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
  constTerm,
  divide,
  engineSide,
  equals,
  expandLinearSide,
  groupTerm,
  isInteger,
  isZero,
  latexSide,
  sideFingerprint,
  subtract,
  toNumber,
  toRational,
  xTerm,
} from './questionFamilyExact.mjs';

const VARIABLES = ['x', 'n', 'a', 'b', 'k', 'm', 'p', 't', 'w'];

export const SOLVED_RELATIONS = Object.freeze(['<', '<=', '>', '>=']);
const REVERSED = Object.freeze({ '<': '>', '<=': '>=', '>': '<', '>=': '<=' });
const RELATION_LATEX = Object.freeze({ '<': '<', '<=': '\\le', '>': '>', '>=': '\\ge' });
const RELATION_SHOWN = Object.freeze({ '<': '<', '<=': '≤', '>': '>', '>=': '≥' });

export const REVERSAL_CHOICES = Object.freeze(['required', 'none', 'mixed']);
export const STRUCTURE_CHOICES = Object.freeze([false, true, 'mixed']);

const MINUS = '−';
const CONSTANT_LIMIT = 80;

/*
 * The four layouts. `left` and `right` are the displayed term trees; the
 * parameters each one draws are listed in `draws`, and the rest of the right
 * side is derived from the boundary so the solved form is the one intended.
 */
export const INEQUALITY_SHAPES = Object.freeze({
  // −3x + 5 > 17
  twoStep: Object.freeze({ distribute: false, bothSides: false }),
  // 5x + 2 ≥ 3x − 10
  bothSides: Object.freeze({ distribute: false, bothSides: true }),
  // −4(x − 6) < 28
  distribute: Object.freeze({ distribute: true, bothSides: false }),
  // 2(x + 6) < 4x + 14
  distributeBothSides: Object.freeze({ distribute: true, bothSides: true }),
});

const shapesFor = (distribute, bothSides) => Object.keys(INEQUALITY_SHAPES).filter((name) => {
  const shape = INEQUALITY_SHAPES[name];
  return (distribute === 'mixed' || shape.distribute === distribute)
    && (bothSides === 'mixed' || shape.bothSides === bothSides);
});

const reversalsFor = (reversal) => (reversal === 'mixed' ? ['required', 'none'] : [reversal]);

/** The displayed trees, the relation shown, and what they were built to mean. */
const buildCandidate = (params) => {
  const { shape, relation, reversal, k } = params;
  const shown = reversal === 'required' ? REVERSED[relation] : relation;
  let leftTerms;
  let rightTerms;
  if (shape === 'twoStep') {
    leftTerms = [xTerm(params.a), constTerm(params.b)];
    rightTerms = [constTerm(params.a * k + params.b)];
  } else if (shape === 'bothSides') {
    leftTerms = [xTerm(params.a), constTerm(params.b)];
    rightTerms = [xTerm(params.d), constTerm((params.a - params.d) * k + params.b)];
  } else if (shape === 'distribute') {
    leftTerms = [groupTerm(params.m, [xTerm(1), constTerm(params.p)])];
    rightTerms = [constTerm(params.m * (k + params.p))];
  } else {
    leftTerms = [groupTerm(params.m, [xTerm(1), constTerm(params.p)])];
    rightTerms = [xTerm(params.d), constTerm(params.m * (k + params.p) - params.d * k)];
  }
  return { shape, relation, reversal, k, shown, leftTerms, rightTerms };
};

/*
 * The independent reading: from the displayed trees alone, the solved
 * relation and boundary a student reaches by collecting the variable on the
 * left, and whether that collection leaves a negative coefficient.
 */
export const solveDisplayedInequality = (leftTerms, rightTerms, shown) => {
  const left = expandLinearSide(leftTerms);
  const right = expandLinearSide(rightTerms);
  const coefficient = subtract(left.a, right.a);
  if (isZero(coefficient)) return null;
  const negative = toNumber(coefficient) < 0;
  return {
    coefficient,
    boundary: divide(subtract(right.b, left.b), coefficient),
    relation: negative ? REVERSED[shown] : shown,
    reversal: negative,
  };
};

const presentedConstants = (terms) => terms.flatMap((term) => {
  if (term.kind === 'c') return [term.value];
  if (term.kind === 'group') return presentedConstants(term.inner);
  return [];
});

/** The whole numbers of one sign, at least `minimum` in size, inside a range. */
const signedDomain = ([low, high], sign, { minimum = 1 } = {}) => {
  const values = [];
  for (let value = low; value <= high; value += 1) {
    if (Math.sign(value) === sign && Math.abs(value) >= minimum) values.push(value);
  }
  return choiceDomain(values);
};

const readable = (engineText) => engineText.replace(/\s*\*\s*(?=[A-Za-z(])/g, '');

export const solveLinearInequalityFamily = defineQuestionFamily({
  id: 'inequalities.solveLinear',
  version: 1,
  title: 'Solve a linear inequality and graph its solution',
  skill: {
    objective: 'Solve a linear inequality in one variable, including variables on both sides and the distributive property, reversing the inequality symbol when multiplying or dividing by a negative, and graph the solution on a number line.',
    alignments: ['A.5B', '7.10A'],
    strand: 'linear',
  },
  difficulty: { band: 3, dok: 2 },
  constraintPolicy: CONSTRAINT_POLICY.STRICT,
  constraints: {
    reversal: choiceKnob('mixed', REVERSAL_CHOICES, { label: 'Reverse the symbol (dividing by a negative)' }),
    distribute: choiceKnob('mixed', STRUCTURE_CHOICES, { label: 'Distributive property' }),
    bothSides: choiceKnob('mixed', STRUCTURE_CHOICES, { label: 'Variable on both sides' }),
    boundaryRange: rangeKnob([-9, 9], { limits: [-20, 20], label: 'Boundary range' }),
    coefficientRange: rangeKnob([-6, 6], { limits: [-12, 12], label: 'Coefficient range' }),
    constantRange: rangeKnob([-12, 12], { limits: [-30, 30], label: 'Constant range' }),
    variable: choiceKnob('x', VARIABLES, { label: 'Variable' }),
  },
  conceptConstraints: ['reversal', 'distribute', 'bothSides'],
  strata: {
    // A mixed slot is balanced on the reversal first: a class of 30 gets 15
    // versions that reverse the symbol and 15 that do not, across every
    // layout. The solved symbol is drawn per version (the engine balances at
    // most 16 strata, and 2 × 4 × 4 would be 32).
    balance: 'reversal',
    values: (c) => reversalsFor(c.reversal).flatMap((reversal) => shapesFor(c.distribute, c.bothSides)
      .map((shape) => ({ reversal, shape }))),
  },
  parameters: (c, stratum) => {
    if (!stratum) return {};
    const sign = stratum.reversal === 'required' ? -1 : 1;
    const domains = {
      k: intDomain(c.boundaryRange[0], c.boundaryRange[1]),
      relation: choiceDomain(SOLVED_RELATIONS),
    };
    const constant = intDomain(c.constantRange[0], c.constantRange[1], { exclude: [0] });
    if (stratum.shape === 'twoStep') {
      domains.a = signedDomain(c.coefficientRange, sign, { minimum: 2 });
      domains.b = constant;
    } else if (stratum.shape === 'bothSides') {
      domains.a = intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] });
      domains.d = intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] });
      domains.b = constant;
    } else if (stratum.shape === 'distribute') {
      domains.m = signedDomain(c.coefficientRange, sign, { minimum: 2 });
      domains.p = constant;
    } else {
      domains.m = intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [-1, 0, 1] });
      domains.d = intDomain(c.coefficientRange[0], c.coefficientRange[1], { exclude: [0] });
      domains.p = constant;
    }
    return domains;
  },
  derive: (params) => buildCandidate(params),
  rules: (values, c) => {
    const solved = solveDisplayedInequality(values.leftTerms, values.rightTerms, values.shown);
    if (!solved) return [FAMILY_ISSUE.DEGENERATE_INSTANCE];
    if (solved.relation !== values.relation || solved.reversal !== (values.reversal === 'required') || !equals(solved.boundary, values.k)) {
      return [FAMILY_ISSUE.CASE_MISMATCH];
    }
    const issues = [];
    if (!isInteger(solved.boundary)) issues.push(FAMILY_ISSUE.UNINTENDED_FRACTION);
    // Collecting the variable must leave a real division: a coefficient of
    // ±1 on a two-step or distributed version is a one-step inequality.
    const constants = [...presentedConstants(values.leftTerms), ...presentedConstants(values.rightTerms)];
    if (constants.some((value) => isZero(value))) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (constants.some((value) => Math.abs(toNumber(value)) > CONSTANT_LIMIT)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    const bound = Math.max(Math.abs(c.boundaryRange[0]), Math.abs(c.boundaryRange[1]));
    if (Math.abs(toNumber(solved.boundary)) > bound) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  // The displayed inequality: shape, symbol and every number — not the
  // letter, which is presentation.
  fingerprint: (values) => fingerprintOf('inequalities.solveLinear@1', [
    values.shape,
    values.shown,
    sideFingerprint(values.leftTerms),
    sideFingerprint(values.rightTerms),
  ]),
  answer: (values, constraints) => {
    const boundary = toRational(values.k).n;
    return {
      kind: 'inequality',
      value: `${constraints.variable} ${values.relation} ${boundary}`,
      relation: values.relation,
      boundary,
      display: `${constraints.variable} ${RELATION_SHOWN[values.relation]} ${boundary < 0 ? `${MINUS}${-boundary}` : boundary}`,
    };
  },
  tools: {
    stepAlgebra: (values, { authored, constraints }) => {
      const variable = constraints.variable;
      const engine = `${engineSide(values.leftTerms, variable)} ${values.shown} ${engineSide(values.rightTerms, variable)}`;
      const latex = `${latexSide(values.leftTerms, variable)} ${RELATION_LATEX[values.shown]} ${latexSide(values.rightTerms, variable)}`;
      const boundary = toRational(values.k).n;
      return {
        type: 'stepAlgebra',
        prompt: composeFamilyPrompt({
          authored: authored.prompt,
          tokens: { inequality: `$${latex}$` },
          fallback: `Solve $${latex}$. Then graph the solution.`,
        }),
        variable,
        solveFor: variable,
        // The relation workspace opens on this text; the number line graphs
        // the student's own solved relation.
        equation: engine,
        inequalityText: readable(engine),
        solutionKey: Object.freeze({
          outcome: 'inequality',
          relation: values.relation,
          value: String(boundary),
          display: `${variable} ${RELATION_SHOWN[values.relation]} ${boundary < 0 ? `${MINUS}${-boundary}` : boundary}`,
        }),
        mode: authored.mode || 'rigorous',
        workspaceDifficulty: authored.workspaceDifficulty ?? null,
        objective: authored.objective || {
          kind: 'isolate',
          variable,
          simplifyRequired: true,
          label: `Isolate ${variable}`,
        },
      };
    },
  },
  defaultTool: 'stepAlgebra',
  instanceFields: ['solutionKey', 'equation', 'equationLatex', 'equationAscii', 'initialEquation', 'inequality', 'inequalityText', 'leftExpression', 'rightExpression', 'generatedAnswer'],
  recovery: { eligible: true },
  capabilities: {
    targetTool: { tool: 'stepAlgebra', workspaces: ['relation'], representation: 'number line (Algebra I)' },
    reversal: [...REVERSAL_CHOICES],
    shapes: Object.keys(INEQUALITY_SHAPES),
    solvedRelations: [...SOLVED_RELATIONS],
    boundaryForms: ['integer'],
    exactArithmetic: true,
    independentVerification: 'solveDisplayedInequality on the displayed term trees (questionFamilyExact.expandLinearSide)',
  },
});

export const INEQUALITY_SOLVING_FAMILIES = Object.freeze([solveLinearInequalityFamily]);
