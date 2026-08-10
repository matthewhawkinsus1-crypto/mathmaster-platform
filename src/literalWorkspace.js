// Solving a formula for one of its letters, on the balance.
//
// A literal equation is the same act as a numeric one — undo what was done to
// the variable you want, doing it to both sides — and a student who learns it
// as "type the rearranged expression" learns a different, weaker thing. So a
// literal question can be routed to the balance workspace, where the steps are
// the same steps and the operand happens to be a letter.
//
// This module only decides and translates. It renders nothing and grades
// nothing, which is why the routing decision can be tested without a browser.

import { latexToExpression } from './algebraAstEngine.js';

const text = (value) => String(value ?? '').trim();

// mathjs reads `bh` as one symbol called "bh", not as b times h, so a formula
// written the way formulas are written -- A = bh, y = mx + b, V = lwh -- never
// isolates anything. Authored formulas do use that notation, so runs of single
// lowercase letters are expanded into explicit products.
//
// Deliberately narrow. An uppercase or mixed run (SA, Area, V) is one quantity
// with a multi-letter name, and a known function or constant is neither, so
// both are left exactly as written. The rule is "lowercase letters standing
// together are separate variables", which is the convention the formulas
// themselves follow.
const RESERVED = new Set(['pi', 'sqrt', 'abs', 'exp', 'log', 'ln', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'mod', 'nthroot']);

// The run must stand alone: bounded by non-letters on both sides, so the "rea"
// inside "Area" is not a product of three variables.
export const expandImplicitProducts = (expression) => String(expression ?? '')
  .replace(/(?<![A-Za-z])[a-z]{2,3}(?![A-Za-z])/g, (run) => (RESERVED.has(run) ? run : run.split('').join('*')));

/** Every symbol the equation actually contains, once implicit products are explicit. */
export const literalSymbols = (expression) => [
  ...new Set(String(expression ?? '').match(/[A-Za-z][A-Za-z0-9_]*/g) || []),
].filter((name) => !RESERVED.has(name));

/**
 * Does this question want the workspace?
 *
 * Opt-in, never inferred. Every existing literal question expects the
 * type-the-answer grader, and quietly changing what a student is asked to do
 * because a field happened to parse would be a worse failure than not offering
 * the workspace at all.
 */
export const usesLiteralWorkspace = (question = {}) => {
  if (!question || question.type !== 'literal') return false;
  if (question.workspace === true || question.solveOnBalance === true) return true;
  return text(question.presentation).toLowerCase() === 'workspace';
};

/**
 * The equation, in the form the AST engine reads.
 *
 * Literal questions have carried three different field names across the life of
 * this codebase — `equation`, `equationLatex` and `formula`/`formulaLatex` — and
 * all three are still in assignments, so all three are read here rather than in
 * the component.
 */
export const readLiteralEquation = (question = {}) => {
  const candidates = [
    question.equationAscii, question.equation, question.formula,
    question.equationLatex, question.formulaLatex,
  ];
  const found = candidates.map(text).find((value) => value.includes('='));
  if (!found) return null;
  const expression = expandImplicitProducts(latexToExpression(found));
  return expression.split('=').length === 2 ? expression : null;
};

export const readLiteralVariable = (question = {}) => text(question.solveFor)
  || text(question.variable)
  || text(question.objective?.variable)
  || '';

/**
 * The workspace question, or null with the reason it cannot be built.
 *
 * A reason rather than a silent fallback: an authored question that asked for
 * the workspace and did not get it is a Preflight problem, not something to
 * paper over at render time.
 */
export const buildLiteralWorkspaceQuestion = (question = {}) => {
  const equation = readLiteralEquation(question);
  if (!equation) {
    return { question: null, reason: 'no equation with a single equals sign could be read from this question' };
  }
  const variable = readLiteralVariable(question);
  if (!variable) {
    return { question: null, reason: 'the question does not say which variable to solve for (`solveFor`)' };
  }
  if (!literalSymbols(equation).includes(variable)) {
    return { question: null, reason: `the equation does not contain "${variable}" as a symbol of its own` };
  }

  return {
    reason: null,
    question: {
      ...question,
      type: 'stepAlgebra',
      equation,
      solveFor: variable,
      objective: {
        kind: 'isolate',
        variable,
        // A rearranged formula is finished when the letter stands alone. There
        // is no arithmetic left to insist on, and demanding a "simplified"
        // form of A/b invites arguments about notation rather than algebra.
        simplifyRequired: false,
        ...(question.objective || {}),
      },
      // Literal work is symbolic by nature: the operand is a letter, and the
      // opposite side cannot be tidied into a number. Solving one on the most
      // guided level would mean the workspace doing the rearrangement.
      workspaceDifficulty: question.workspaceDifficulty ?? 3,
    },
  };
};
