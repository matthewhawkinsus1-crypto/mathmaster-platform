/*
 * WHAT A HINT COSTS, SAID THE SAME WAY EVERYWHERE ONE IS OFFERED
 * (student pass 3, HELP-17 and D5).
 *
 * Students avoided hints for fear of losing points. A hint never changes a
 * score — the grade is the attempt's status and best partial credit only
 * (attemptPolicy.mjs) — but each place said something different: "Using one is
 * noted with your attempt", "Recorded for your teacher", "Recorded for your
 * teacher, like a hint". One honest sentence now: what it does not cost, and
 * who sees it.
 *
 * THE ONE EXCEPTION (HELP-4). In Recovery practice an item answered with help
 * does not count toward unlocking the Recovery (practiceMastery.mjs counts only
 * independent items), so there the sentence says that instead.
 */
import { HINT_COST } from '../../student/studentWords.js';

// The sentence is the student word list's (studentWords.js).
export const HINT_COST_SENTENCE = HINT_COST;

export const RECOVERY_HINT_COST_SENTENCE = "Hints help you learn, but this question then won't count toward unlocking.";

/** The sentence for a host: its own (Recovery's), else the platform's. */
export const hintCostSentence = (override = null) => {
  const text = typeof override === 'string' ? override.trim() : '';
  return text || HINT_COST_SENTENCE;
};

// The graph's "Check my points" is recorded exactly like a hint, so it says so.
export const selfCheckCostSentence = (override = null) => `This counts as a hint. ${hintCostSentence(override)}`;
