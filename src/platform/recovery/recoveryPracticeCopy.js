/*
 * RECOVERY PRACTICE SAYS WHAT COUNTS (student pass 3, HELP-4).
 *
 * The Recovery gate counts a practice question only when it was answered
 * without help (practiceMastery.mjs `independent`; the server reads the
 * attempt's support use with attemptWasIndependent). A student who used a hint
 * and answered correctly saw "Correct! Nice work." while the meter did not
 * move, and nothing had ever said a hint would do that. Now:
 *
 *   - the hint offers say so (hintCopy.js RECOVERY_HINT_COST_SENTENCE),
 *   - the meter carries its rule (recoveryMeterRule), and
 *   - a correct answer given with help says it did not count
 *     (recoveryPracticeOutcomeMessage).
 */
import { attemptWasIndependent } from '../../../functions/shared/sectionRecoveryService.mjs';

const count = (value, fallback) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

/** The meter's rule, beside the meter. */
export const recoveryMeterRule = ({ requiredCorrect, windowSize } = {}) => {
  const window = count(windowSize, null);
  const required = count(requiredCorrect, null);
  const bar = required && window
    ? `Get ${required} of your last ${window} practice questions right to unlock it.`
    : 'Get enough of your recent practice questions right to unlock it.';
  return `${bar} A question counts only when you answer it without a hint or a worked example.`;
};

export const RECOVERY_PRACTICE_CORRECT = 'Correct! Nice work.';
export const RECOVERY_PRACTICE_CORRECT_WITH_HELP = 'Correct! You used help on this one, so it does not count toward unlocking. Try the next one on your own.';
export const RECOVERY_PRACTICE_MISSED = 'Not quite. That one still counts as practice — review it, then try a fresh question.';

/** What a graded Recovery practice answer says. */
export const recoveryPracticeOutcomeMessage = ({ isCorrect = false, supportUsage = {} } = {}) => {
  if (!isCorrect) return RECOVERY_PRACTICE_MISSED;
  return attemptWasIndependent(supportUsage || {}) ? RECOVERY_PRACTICE_CORRECT : RECOVERY_PRACTICE_CORRECT_WITH_HELP;
};
