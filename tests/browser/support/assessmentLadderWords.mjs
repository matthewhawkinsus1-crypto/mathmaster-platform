/*
 * EVERY TEXT THE CLASSROOM FEEDBACK LADDER CAN PRODUCE, which an exit ticket
 * (DOL) or a test may not carry while an item can still be answered.
 *
 * tests/browser/assessmentLeakGates.mjs refuses each of them anywhere in a DOL
 * or test page's document (visible text, aria-labels, live regions, hidden
 * nodes). Its document includes the page's stylesheets: in development Vite
 * serves each one as a <style>, comments and all, so a CSS comment that
 * quotes the hint button fails the gate as surely as a leaked hint does.
 * tests/platform/stylesheetsQuoteNoLeakWords.test.mjs reads this same list to
 * refuse that in every stylesheet before a browser is started.
 */
import { MISCONCEPTION_STUDENT_MESSAGES } from '../../../functions/shared/misconceptionStudentMessages.mjs';
import { GENERIC_MISS_MESSAGES } from '../../../src/platform/supports/feedback/genericMissChecks.js';
import { FALLBACK_HINTS } from '../../../src/platform/supports/hints/questionHints.js';
import { PENDING_RUNG_TEXT } from '../../../src/platform/supports/hints/hintCopy.js';

// Authored supports (marked LEAKCHECK in the fixtures) and the ladder's own
// words.
export const LADDER_WORDS = Object.freeze(['LEAKCHECK', 'A hint is ready', 'Show a hint', 'See why it works', 'Worked solution', 'Why it works', 'Try a similar one', 'A similar problem, worked out', 'Let’s back up',
  // Student pass 3, Batch 4: the worked sibling after a miss, the diagnosis
  // rung, and the sentence beside every hint offer.
  'See a similar problem worked', 'What might have gone wrong', 'Hints never lower your grade', 'won\'t count toward unlocking',
  // Student pass 3, wave 6 (HELP-23): the pointer beside the fallbacks, and
  // every fallback (none may reach a DOL or test).
  'These hints are general', ...Object.values(FALLBACK_HINTS).flat(),
  // Hint-ladder timing: the line a rung shows while its tool loads.
  PENDING_RUNG_TEXT]);

// Every misconception and generic miss message.
export const MISS_MESSAGES = Object.freeze([...Object.values(MISCONCEPTION_STUDENT_MESSAGES), ...Object.values(GENERIC_MISS_MESSAGES)]);

/** Every text the leak gate refuses on a DOL or test page. */
export const ASSESSMENT_LEAK_TEXTS = Object.freeze([...LADDER_WORDS, ...MISS_MESSAGES]);
