/*
 * A SIDE A STUDENT TYPES IS READ ON ITS OWN BEFORE STEP ALGEBRA ACCEPTS IT.
 *
 * After a balanced move, Step Algebra's simplification boxes take the
 * student's own simpler form of a side ("15" for 21 - 6), and Check compares
 * it with the side the move produced through expressionsEquivalent
 * (algebraAstEngine.mjs). That comparison reads the typed text only inside
 * "(typed) - (expected)", so a side readable only in that context passed:
 * "4)+(4" is 8 there. The step then committed the text as typed
 * (resolveEquationAfterStudentSimplification). Where QuestionEngine grades
 * each step, the step's grade threw on it inside the commit, and Check did
 * nothing at all; where no step is graded, the board held a side nothing
 * could read, and the server's replay refuses such a state
 * (step-state-unreadable), so every step after it went uncredited.
 *
 * Read here, as the commit writes it (latexToExpression) and as the server's
 * step replay reads a side (isSafeStudentExpression): plain algebra on its
 * own. Any size: a state beyond the replay's budget is declined there, kept
 * on the path a step without work takes, not refused, so size is no reason to
 * refuse it here. A side that cannot be read is told so, in the words
 * Simplify's own box uses (simplifyEngine.js unreadableSide), and is never
 * judged right or wrong: nothing is recorded and no try is spent.
 */
import { latexToExpression } from '../../algebraAstEngine.js';
import { isSafeStudentExpression } from '../../../functions/shared/serverGrading/stepAlgebraEquivalence.mjs';

const ANY_SIZE = Object.freeze({ nodes: Infinity, depth: Infinity, chain: Infinity, reciprocalChain: Infinity, reciprocals: Infinity });

/** Can this typed side be read on its own, as the step commits it and the server replays it? */
export const typedSideReadable = (typed) => {
  try {
    return isSafeStudentExpression(latexToExpression(typed), ANY_SIZE);
  } catch {
    return false;
  }
};

/** What the student is told; `sides` are the boxes' own names, "right side" or "left side" and "right side". */
export const unreadableSidesMessage = (sides = []) => {
  const names = sides.length ? sides.join(' and ') : 'side';
  return `MathMaster could not read what you typed for the ${names} yet. Enter only the expression for ${sides.length > 1 ? 'each' : 'that'} side, without an equals sign.`;
};
