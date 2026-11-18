/*
 * THE ISOLATION BOX READS WHAT IS TYPED ON ITS OWN BEFORE IT TAKES IT.
 *
 * Once a variable is isolated (y = 7 - 2x), the Systems Workspace lets the
 * student write an equivalent, simpler expression and substitute that instead
 * ("Simplify first (optional)"), in a 2×2 (AlgebraicSystemMode.jsx) and in a
 * 3×3 reduction (SubstitutionReductionMode.jsx). The check was
 * expressionsEquivalent alone, which reads the typed text only inside
 * "(typed) - (isolated)": "7)-(2x" is 7 - 2x there, and "y=7-2x" passed too.
 * Either became the token the student drags into the other equation. The
 * first cannot be substituted at all, so the substitution quietly fell back to
 * the isolated form while the token still showed "7)-(2x"; the second
 * substituted as an equation inside an equation (3x + (y = 7 - 2x) = 9).
 *
 * The rule Step Algebra's simplification boxes follow (typedSide.js, commit
 * 58e0e2d9) applies here: the typed expression is read on its own first, as
 * the token is written (latexToExpression) and as the server reads a typed
 * side (isSafeStudentExpression). What cannot be read is told so in the words
 * Simplify's own box uses for one expression, is never judged equivalent or
 * not, records nothing and spends no try. Every expression that can be read
 * is judged exactly as before.
 */
import { expressionsEquivalent, latexToExpression } from '../../algebraAstEngine.js';
import { typedSideReadable } from '../../platform/algebra/typedSide.js';
import { SIMPLIFY_MESSAGES } from '../../platform/algebra/simplify/simplifyEngine.js';

/** "MathMaster could not read that yet. Enter one expression, without an equals sign." */
export const ISOLATION_UNREADABLE_MESSAGE = SIMPLIFY_MESSAGES.unreadable;

/**
 * The verdict on the optional rewrite of an isolated expression:
 *   { verdict: 'accepted', tokenExpression }  equivalent; the token to substitute
 *   { verdict: 'unreadable' }                 cannot be read on its own: nothing changes
 *   { verdict: 'notEquivalent' }              read, and not the same expression (or nothing typed)
 */
export const judgeIsolationSimplification = (draft, isolatedExpression, variable) => {
  const typed = String(draft ?? '').trim();
  if (!typed || !isolatedExpression) return { verdict: 'notEquivalent' };
  // Read first: the comparison below reads it only inside "(typed) - (isolated)".
  if (!typedSideReadable(typed)) return { verdict: 'unreadable' };
  if (!expressionsEquivalent(typed, isolatedExpression, variable)) return { verdict: 'notEquivalent' };
  let tokenExpression = typed;
  try {
    tokenExpression = latexToExpression(typed);
  } catch {
    // MathInput can return plain ASCII math already; it was read above.
  }
  return { verdict: 'accepted', tokenExpression };
};
