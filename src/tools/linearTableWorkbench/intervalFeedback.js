/*
 * WHAT A WRONG RECORDED INTERVAL SAYS (walkthrough 2026-10-22, Algebra I
 * DOL #3 Review PR 3 and PR 5).
 *
 * Every wrong interval got "Recheck subtraction order and signs before
 * changing anything else." The lesson's authored mistake is the rate written
 * as Δy alone when x jumps by 2, 3 or 4: the subtraction and the signs were
 * right, the fix is to divide by Δx — and on a constant-rate item the slip
 * makes the rates look different and flips the conclusion to "nonlinear".
 * When Δx and Δy are right, the student's own numbers say which slip it is.
 * The message uses only what the student typed and the grader's per-field
 * verdict: it never states a correct value.
 */
import { parseNumericAnswer } from '../../../functions/shared/toolMath/shared/toolMath.mjs';

const close = (left, right) => left !== null && right !== null && Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(right));

export const intervalMissMessage = ({ entry = {}, check = {} } = {}) => {
  const rows = `Row ${Number(entry.i) + 1} → Row ${Number(entry.j) + 1}`;
  if (check.dxCorrect === false || check.dyCorrect === false) {
    const fields = [check.dxCorrect === false ? 'Δx' : null, check.dyCorrect === false ? 'Δy' : null].filter(Boolean).join(' and ');
    return `Check ${rows}: ${fields}. Subtract the earlier row from the later one, the same way for x and for y, and watch the signs.`;
  }
  if (check.rateCorrect === false) {
    const dx = parseNumericAnswer(entry.dx);
    const dy = parseNumericAnswer(entry.dy);
    const rate = parseNumericAnswer(entry.rate);
    if (dx !== null && !close(dx, 1) && close(rate, dy)) {
      return `Check ${rows}: the rate of change is Δy ÷ Δx. You wrote Δy itself, but x changes by ${entry.dx} here, so divide by it.`;
    }
    if (dx !== null && dy !== null && dy !== 0 && close(rate, dx / dy) && !close(dx / dy, dy / dx)) {
      return `Check ${rows}: the rate of change is Δy ÷ Δx, the change in y over the change in x, not Δx ÷ Δy.`;
    }
    return `Check ${rows}: the rate of change is Δy ÷ Δx. Your Δx and Δy are right; recheck the division.`;
  }
  return `Check ${rows}: the interval entries.`;
};
