/*
 * SOLVING LINEAR EQUATIONS (A.5A) — the Warm-Up family behind the Algebra I
 * lesson "Solving Linear Equations" (Module 3, Topic 1, Lesson 1).
 *
 *   equations.verifySolution   Is x = k a solution of ax + b = cx + d?
 *                              Substitute k into each side, write the value
 *                              of each side, and decide. multiAnswer.
 *
 * The lesson opens by building equations from x = 2 and checking them by
 * substitution ("Equation Creation", Activity 1.1 Question 1), and every later
 * lesson in the module checks a solution the same way — in both equations of
 * a system. This family asks that check with fresh numbers.
 *
 * BALANCED CASES. Half the versions of a slot are true (k is the solution)
 * and half are false (the solution is a different whole number), balanced
 * across a class by `strata`, so "yes" is never the safe guess and a student
 * cannot learn the verdict from a neighbour.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution. The prompt names the equation and the value to test; the values
 * of the two sides are the student's to compute.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports only the family contract.
 */

import {
  FAMILY_ISSUE,
  choiceDomain,
  choiceKnob,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
} from './questionFamilyContract.mjs';

const MINUS = '−';

/** A number as a prompt writes it (a true minus sign). */
const shown = (value) => (value < 0 ? `${MINUS}${-value}` : String(value));

/** "3x", "−x", "x" — a variable term as a textbook writes it. */
const variableTerm = (coefficient, variable) => {
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `${MINUS}${variable}`;
  return `${shown(coefficient)}${variable}`;
};

/**
 * One side of the equation as displayed. `constantFirst` writes "18 − 5x"
 * (as Harper's equation does) instead of "−5x + 18".
 */
export const sideText = (coefficient, constant, variable, constantFirst) => {
  const term = variableTerm(coefficient, variable);
  if (constant === 0) return term;
  if (constantFirst) {
    const sign = coefficient < 0 ? MINUS : '+';
    return `${shown(constant)} ${sign} ${variableTerm(Math.abs(coefficient), variable)}`;
  }
  return `${term} ${constant < 0 ? MINUS : '+'} ${Math.abs(constant)}`;
};

const VERDICT_YES = 'Yes — both sides have the same value.';
const VERDICT_NO = 'No — the two sides have different values.';
const VERDICT_UNKNOWN = 'You cannot tell without solving the equation first.';
export const VERIFY_VERDICTS = Object.freeze([VERDICT_YES, VERDICT_NO, VERDICT_UNKNOWN]);

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};

const VARIABLES = Object.freeze(['x', 'n', 'a', 'm', 't']);
const COEFFICIENT_LIMIT = 7;
const CONSTANT_LIMIT = 30;
const SIDE_VALUE_LIMIT = 60;
// The test value is never 0 (substituting 0 only reads the constants) and
// never far from it: this is a mental-arithmetic check, not a calculator one.
const TEST_VALUES = Object.freeze([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
// How far the real solution sits from the tested value in a false version.
const MISSES = Object.freeze([-3, -2, -1, 1, 2, 3]);
// How each side is written: [left constant first, right constant first].
const LAYOUTS = Object.freeze([[false, false], [false, true], [true, false]]);

export const verifySolutionFamily = defineQuestionFamily({
  id: 'equations.verifySolution',
  version: 1,
  title: 'Check a solution by substitution',
  skill: {
    objective: 'Decide whether a value is a solution of a linear equation with the variable on both sides by substituting it into each side and comparing the two values.',
    alignments: ['A.5A', '8.8C'],
    strand: 'linear',
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {
    variable: choiceKnob('x', VARIABLES, { label: 'Variable letter' }),
  },
  // Half the class tests a true value, half a false one.
  strata: { balance: 'verdict', values: () => [{ verdict: 'solution' }, { verdict: 'notSolution' }] },
  parameters: (c, stratum) => ({
    a: intDomain(-COEFFICIENT_LIMIT, COEFFICIENT_LIMIT, { exclude: [0] }),
    b: intDomain(-CONSTANT_LIMIT, CONSTANT_LIMIT, { exclude: [0] }),
    cc: intDomain(-COEFFICIENT_LIMIT, COEFFICIENT_LIMIT, { exclude: [0] }),
    k: choiceDomain(TEST_VALUES),
    miss: stratum?.verdict === 'notSolution' ? choiceDomain(MISSES) : choiceDomain([0]),
    layout: intDomain(0, LAYOUTS.length - 1),
  }),
  // The equation is built from its real solution s, so its one solution is
  // a whole number by construction: a·s + b = cc·s + d.
  derive: ({ a, b, cc, k, miss }) => {
    const solution = k + miss;
    const d = a * solution + b - cc * solution;
    return { solution, d, left: a * k + b, right: cc * k + d };
  },
  rules: ({ a, cc, d, left, right, solution, verdict }) => {
    const issues = [];
    // The same coefficient on both sides is a special case (no or every
    // solution), not this skill's question.
    if (a === cc) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (d === 0 || Math.abs(d) > CONSTANT_LIMIT) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    if (Math.abs(left) > SIDE_VALUE_LIMIT || Math.abs(right) > SIDE_VALUE_LIMIT) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    // A false version must really be false, and a true one really true.
    if ((verdict === 'solution') !== (left === right)) issues.push(FAMILY_ISSUE.CASE_MISMATCH);
    if (verdict === 'notSolution' && solution === 0) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    return issues;
  },
  // Which side is written constant-first is presentation, and so is the
  // variable letter: the same equation and test value are one problem.
  fingerprint: ({ a, b, cc, d, k }) => fingerprintOf('equations.verifySolution', [a, b, cc, d, k]),
  answer: ({ left, right }) => {
    const value = { left: String(left), right: String(right), verdict: left === right ? VERDICT_YES : VERDICT_NO };
    return { kind: 'fields', value, display: `${value.left}; ${value.right}; ${value.verdict}` };
  },
  tools: {
    multiAnswer: ({ a, b, cc, d, k, left, right, layout }, { authored, constraints: c }) => {
      const variable = c.variable;
      const [leftFirst, rightFirst] = LAYOUTS[layout] || LAYOUTS[0];
      const leftText = sideText(a, b, variable, leftFirst);
      const rightText = sideText(cc, d, variable, rightFirst);
      const equation = `${leftText} = ${rightText}`;
      const test = `${variable} = ${shown(k)}`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          tokens: { equation, value: test },
          fallback: `Is ${test} a solution of ${equation}? Substitute ${test} into each side of the equation, then decide.`,
        }),
        answerFields: [
          {
            id: 'left',
            label: `Value of the left side, ${leftText}, when ${test}`,
            answer: String(left),
            inputProfile: 'number',
            answerFormat: 'number',
            inputContract: { format: 'number' },
          },
          {
            id: 'right',
            label: `Value of the right side, ${rightText}, when ${test}`,
            answer: String(right),
            inputProfile: 'number',
            answerFormat: 'number',
            inputContract: { format: 'number' },
          },
          {
            id: 'verdict',
            label: `Is ${test} a solution of the equation?`,
            type: 'choice',
            options: rotate([...VERIFY_VERDICTS], a + cc + k),
            answer: left === right ? VERDICT_YES : VERDICT_NO,
            inputProfile: 'choice',
          },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: ['answerFields', 'responses'],
  recovery: { eligible: true },
});

export const SOLVING_EQUATION_FAMILIES = Object.freeze([verifySolutionFamily]);
