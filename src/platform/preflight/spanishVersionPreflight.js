/*
 * SPANISH FOR THE TEACHER'S OWN HINTS AND WORKED SOLUTIONS — Pre-Flight ADVICE,
 * never a block (TT22).
 *
 * MathMaster translates its own sentences into Spanish, but a hint or a worked
 * solution a TEACHER wrote can be translated only by the teacher: 160 of 168
 * real hints are teacher-written, and a student who reads in Spanish pressed
 * Translate beside them and was told there was no translation. An item can now
 * carry the teacher's Spanish (authoredSupportText.js):
 *
 *   "translations": { "es": {
 *     "hints": ["…", "…"],
 *     "solutionReview": { "headline": "…", "reasoning": ["…"], "answerSummary": "…", "commonError": "…" }
 *   } }
 *
 * This says what is missing or unusable, so the teacher can ask for it:
 *
 *   hints missing   a teacher-written hint (on an activity that offers hints)
 *                   with no Spanish line
 *   review missing  a part of the teacher-written worked solution with none
 *   a problem       a line that cannot be shown, each its own message: it
 *                   changes the mathematics (the student would see the English,
 *                   the same rule as the prompt), or there are more hint lines
 *                   than hints (the extra ones are never shown)
 *
 * ADVISORY, like solutionReviewPreflight.js: a Needs Review warning would hide
 * the assignment from students over a language nobody in a class may use. One
 * message per kind for the whole assignment, listing the questions, because a
 * line per question for something nearly every item lacks would bury the rest of
 * Pre-Flight. Spanish only: it is the language MathMaster has a pack for, and
 * the one the platform's own sentences are translated into.
 */
import { getEffectiveActivityPolicy } from '../../../functions/shared/activityPolicies.mjs';
import { buildPrivateSupport } from '../../../functions/shared/pathSolutionSupport.mjs';
import { authoredTranslationEntry } from '../language/authoredTranslation.js';
import { authoredReviewParts, authoredReviewPartTranslation } from '../language/authoredSupportText.js';
import { comparableMathTokens, preservesMath } from '../language/mathSafeText.js';
import { questionHintAudit } from '../supports/hints/questionHints.js';

export const SPANISH = 'es';

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const usable = (value) => (typeof value === 'string' && clean(value) ? clean(value) : null);
const offersHints = (question) => getEffectiveActivityPolicy(question?.activityRole)?.hintsAllowed === true;

const numbersText = (numbers) => {
  const shown = numbers.slice(0, 12).join(', ');
  return numbers.length > 12 ? `${shown} and ${numbers.length - 12} more` : shown;
};

const safely = (read, fallback) => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

// Tokens one text has more of than the other, as a short phrase for the teacher.
const tokenDifference = (english, spanish) => {
  const left = comparableMathTokens(english);
  const right = comparableMathTokens(spanish, { language: SPANISH });
  const take = (from, other) => {
    const rest = [...other];
    return from.filter((token) => {
      const at = rest.indexOf(token);
      if (at === -1) return true;
      rest.splice(at, 1);
      return false;
    });
  };
  const leftOut = take(left, right);
  const added = take(right, left);
  const quoted = (tokens) => tokens.slice(0, 3).map((token) => `“${token}”`).join(', ');
  return [leftOut.length ? `leaves out ${quoted(leftOut)}` : '', added.length ? `adds ${quoted(added)}` : '']
    .filter(Boolean).join(' and ');
};

// In Spanish prose a lone y, o, a, e or u is a word ("and", "or", "to"), so a
// variable that is one of them is read as mathematics only inside $…$.
const LONE_WORD_LETTER = /^[yoaeuYOAEU]$/;

const doesNotKeepMath = (english, spanish) => {
  const difference = tokenDifference(english, spanish);
  const lostLetter = comparableMathTokens(english).some((token) => LONE_WORD_LETTER.test(token))
    && /(^|[^$\\\p{L}])[yoaeuYOAEU](?![\p{L}$])/u.test(spanish);
  const tip = lostLetter ? '. In Spanish prose a lone y, o, a, e or u reads as a word: write the variable inside $…$ (for example $y$) to keep it as mathematics' : '';
  return `the Spanish ${difference || 'does not keep the mathematics exactly'}, so students see the English instead. Keep every number, letter and symbol exactly as in the English${tip}`;
};

const reviewPartName = ({ path }) => {
  if (path[0] === 'reasoning') return `worked solution step ${path[1] + 1}`;
  return { headline: 'worked solution headline', answerSummary: 'worked solution answer summary', commonError: 'worked solution “Watch out” line' }[path[0]];
};

export const auditAssignmentSpanishVersions = (questions = [], { deliveredOnly = true } = {}) => {
  const hintsMissing = [];
  const reviewMissing = [];
  const problems = [];
  asArray(questions).forEach((question, index) => {
    if (!isObject(question)) return;
    if (deliveredOnly && question.teacherExcluded === true) return;
    const number = index + 1;
    const entry = authoredTranslationEntry(question, SPANISH);

    // Hints: only where the activity offers them, only the teacher's own, and
    // only the ones a student can be shown (a hint the answer guard drops has
    // its own note in Pre-Flight; its Spanish would never be read). Line N is
    // hint N of the teacher's list whether or not hint M before it is shown.
    const hints = offersHints(question) ? questionHintAudit(question).filter((hint) => hint.source === 'authored') : [];
    if (hints.length) {
      const lines = asArray(entry?.hints);
      let anyMissing = false;
      hints.forEach((hint, hintIndex) => {
        if (!hint.shown) return;
        const line = usable(lines[hintIndex]);
        if (!line) {
          anyMissing = true;
        } else if (!preservesMath(hint.text, line, { language: SPANISH, ignoreDelimiters: true })) {
          problems.push(`Question ${number}, hint ${hintIndex + 1}: ${doesNotKeepMath(hint.text, line)}.`);
        }
      });
      if (anyMissing) hintsMissing.push(number);
      if (lines.length > hints.length) {
        problems.push(`Question ${number}: translations.es.hints has ${lines.length} lines but the question has ${hints.length} hint${hints.length === 1 ? '' : 's'}; line ${hints.length + 1}${lines.length > hints.length + 1 ? ' onward is' : ' is'} never shown.`);
      }
    }

    // The worked solution: each part the teacher wrote.
    const parts = authoredReviewParts(safely(() => buildPrivateSupport(question).solutionReview, null));
    if (parts.length) {
      let anyMissing = false;
      parts.forEach((part) => {
        const line = authoredReviewPartTranslation(question, SPANISH, part.path);
        if (!line) {
          anyMissing = true;
        } else if (!preservesMath(part.text, line, { language: SPANISH, ignoreDelimiters: true })) {
          problems.push(`Question ${number}, ${reviewPartName(part)}: ${doesNotKeepMath(part.text, line)}.`);
        }
      });
      if (anyMissing) reviewMissing.push(number);
    }
  });

  const warnings = [];
  const questionsText = (numbers) => `${numbers.length === 1 ? 'Question' : `${numbers.length} questions —`} ${numbersText(numbers)}`;
  if (hintsMissing.length) {
    warnings.push(`${questionsText(hintsMissing)} ${hintsMissing.length === 1 ? 'has' : 'have'} hints with no Spanish version, so a student who reads in Spanish sees them in English only. Add translations.es.hints: one Spanish line for each hint, in the same order, with every number, letter and symbol exactly as in the English.`);
  }
  if (reviewMissing.length) {
    warnings.push(`${questionsText(reviewMissing)} ${reviewMissing.length === 1 ? 'has' : 'have'} a worked solution with no Spanish version, so a student who reads in Spanish sees it in English only. Add translations.es.solutionReview with the same fields (headline, reasoning, answerSummary, commonError), with every number, letter and symbol exactly as in the English.`);
  }
  warnings.push(...problems);
  return { warnings, hintsMissing, reviewMissing };
};

export default auditAssignmentSpanishVersions;
