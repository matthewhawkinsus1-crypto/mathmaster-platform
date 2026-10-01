/*
 * A SUBSTITUTION THAT LEAVES NO VARIABLE IS STILL THE STUDENT'S ARITHMETIC (#392).
 *
 * Inside a 3×3 reduction the reduced 2×2 may be solved by substitution. When
 * R₁ and R₂ are dependent or inconsistent, substituting the isolated
 * expression cancels the last variable:
 *
 *   9y − 15((3y − 9)/5) = 27
 *
 * Step Algebra cannot finish that equation — there is nothing left to isolate
 * — and the 2×2 used to hand the parent the statement IT computed ("0 = 0") as
 * the student's result, having distributed and collected on their behalf.
 *
 * Instead the student simplifies every side that is not already a number, the
 * values they type are checked against the true value of that side, and only
 * the statement they wrote ("27 = 27") reaches the parent's classification.
 * Nothing here computes a side FOR the student; the true value is only used
 * to judge what they typed, exactly like the elimination combination check.
 */
import { evaluate } from 'mathjs';
import { latexToExpression } from '../../algebra/algebraAstEngine.mjs';
import { exactNumberText, linearEquationForm } from './algebraicSystemsEngine.mjs';

const EPS = 1e-7;
const PLAIN_NUMBER = /^[-−]?\s*\d+(\.\d+)?(\s*\/\s*\d+)?$/;

const sideForm = (text, variables) => linearEquationForm(`${text} = 0`, variables);
const noVariableLeft = (form, variables) => Boolean(form) && variables.every((name) => Math.abs(form.coefficients[name]) < EPS);

/**
 * The two sides of a substituted equation in which every variable cancelled,
 * or null when a variable survives (a normal solve — Step Algebra owns it).
 *
 * R₁ and R₂ are written in standard form, so after substitution the variable
 * terms sit on one side and the other side is a number, shown as given. Should
 * variables ever appear on both sides and cancel only together, the statement
 * is asked for collected — `0 = ▢` — so the student still supplies the value.
 */
export const substitutedStatementSides = (equationText, variables = ['x', 'y']) => {
  const parts = String(equationText || '').split('=');
  if (parts.length !== 2) return null;
  const whole = linearEquationForm(String(equationText), variables);
  if (!noVariableLeft(whole, variables)) return null;
  const sides = parts.map((raw) => {
    const text = raw.trim();
    const form = sideForm(text, variables);
    if (!noVariableLeft(form, variables)) return null;
    return { text, value: -form.constant, given: PLAIN_NUMBER.test(text) };
  });
  if (sides.every(Boolean)) return { left: sides[0], right: sides[1], collected: false };
  return {
    left: { text: '0', value: 0, given: true },
    right: { text: '', value: whole.constant, given: false },
    collected: true,
  };
};

const parseEntry = (value) => {
  try {
    const numeric = Number(evaluate(latexToExpression(String(value ?? '').trim())));
    return Number.isFinite(numeric) ? numeric : NaN;
  } catch {
    return NaN;
  }
};

/**
 * Judge the student's simplified sides. Returns the statement in the
 * student's own numbers, and whether it is an identity or a contradiction,
 * only when every entered side is right.
 */
export const checkSubstitutedStatement = (sides, answers = {}) => {
  if (!sides) return { valid: false, statement: null, type: null, sides: {} };
  const judged = {};
  for (const key of ['left', 'right']) {
    const side = sides[key];
    if (side.given) {
      judged[key] = { correct: true, text: side.text };
      continue;
    }
    const value = parseEntry(answers[key]);
    const correct = Number.isFinite(value) && Math.abs(value - side.value) <= EPS * Math.max(1, Math.abs(side.value));
    judged[key] = { correct, text: correct ? exactNumberText(value) : null };
  }
  const valid = judged.left.correct && judged.right.correct;
  return {
    valid,
    sides: judged,
    statement: valid ? `${judged.left.text} = ${judged.right.text}` : null,
    type: valid ? (Math.abs(sides.left.value - sides.right.value) < EPS ? 'infinite' : 'none') : null,
  };
};

export const emptyStatementWork = (source = null) => ({ source, left: '', right: '', checked: false });
