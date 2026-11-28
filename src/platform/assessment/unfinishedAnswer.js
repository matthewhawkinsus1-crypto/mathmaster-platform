/*
 * AN UNFINISHED ANSWER IN A SECURE FIELD ITEM AND ITS RELEASED REVIEW (#557, #558).
 *
 * The answer box refuses `12 +`, `4*` or `*38`: it is not finished, and the
 * box says so (functions/shared/typedEntryGuard.mjs typedEntryNotice). A test
 * still keeps such a draft and records it at the close, and the server never
 * marks it right.
 *
 * WHICH BOX TAKES WORDS. A box of words ("explain", "A+") takes `12 +` as
 * written: a choice, or a text box that names no math format. A text box that
 * does name one (a field authored with an answerFormat and no profile, which
 * mathPath.normalizeResponseFields issues as 'text') holds mathematics, so an
 * unfinished entry there is unfinished: its part is not answered on "Review
 * all parts, then submit" (RichQuestionRuntime.jsx), and the review says so.
 *
 * THE REVIEW. Read back in the released review, an unfinished entry is not an
 * answer the student finished. unfinishedReviewNote says so in the box's own
 * words: its sentence about what is unfinished, without its instruction to
 * finish it (the test is over). An entry that is only too long is another
 * refusal, not an unfinished answer, and gets no note.
 */
import { TYPED_ENTRY_PROBLEMS, typedEntryNotice, typedEntryProblem } from '../../../functions/shared/typedEntryGuard.mjs';
import { normalizeInteractionInputProfile } from '../interaction/interactionContract.js';

/** Does this secure response field take words, so `12 +` is written words? */
export const secureFieldTakesWords = (field = {}) => Boolean(field?.choices?.length)
  || ((normalizeInteractionInputProfile(field?.inputProfile) || 'text') === 'text'
    && !String(field?.answerFormat || field?.inputContract?.format || '').trim());

/** The box's sentence for an unfinished answer, or '' for any other. */
export const unfinishedReviewNote = (raw, field = null) => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  if (secureFieldTakesWords(field || {}) || typedEntryProblem(raw) !== TYPED_ENTRY_PROBLEMS.UNFINISHED) return '';
  const sentence = typedEntryNotice(raw, { tries: false });
  // "This answer is not finished: …." and then what to do, which a finished test has no use for.
  return sentence.split(/(?<=\.)\s+/)[0] || '';
};
