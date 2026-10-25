/*
 * A TEACHER'S OWN SPANISH FOR THE HINTS AND THE WORKED SOLUTION (TT22).
 *
 * The prompt could always be written in the student's language
 * (`question.translations.es.prompt`, applied by studentSupport.js). The words
 * a student reads AFTER that — the teacher's hints and the worked solution —
 * had no such path: 160 of 168 real hints are teacher-written, the curated
 * Spanish pack knows only the platform's own sentences, and the Translate button
 * beside a hint said "No Spanish translation for this text yet." An entry now
 * carries them too:
 *
 *   translations: { es: {
 *     hints: ["…", "…"],                       line N is hint N
 *     solutionReview: { headline, reasoning: ["…"], answerSummary, commonError },
 *   } }
 *
 * "Hint N" is the Nth teacher-written hint the student's ladder offers, in the
 * order the ladder reads them (supportHints, hints, hint), empty ones left out
 * (questionHints.js authoredHintTexts). A student sees the Spanish when they
 * press Translate beside that text, exactly as for a platform sentence: the
 * hint stays in English until they ask, so nothing is hidden from a student who
 * reads both.
 *
 * THE SAME RULE AS THE PROMPT: a line is shown only if it carries the English's
 * mathematics exactly (mathSafeText.js preservesMath, through
 * translationProviders.js). A hint whose numbers or letters differ stays
 * English: a Spanish hint about a different equation would be a different hint.
 * This module only FINDS what the teacher wrote; the provider decides whether
 * it may be shown.
 */
import { authoredTranslationEntry, authoredTranslationKeepsMath, languageKeyIn } from './authoredTranslation.js';

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const usableLine = (value) => (typeof value === 'string' && clean(value) ? clean(value) : null);

/** The worked-solution fields a translation can carry, in the order a student reads them. */
export const TRANSLATABLE_REVIEW_FIELDS = Object.freeze(['headline', 'reasoning', 'answerSummary', 'commonError']);

/**
 * Line `index` of every language's `hints` list, as `{ language: text }`.
 * Only a language that wrote a line there is in the map.
 */
export const authoredHintTranslations = (question, index) => {
  const found = {};
  const translations = question?.translations;
  if (!isObject(translations)) return found;
  Object.keys(translations).forEach((language) => {
    const entry = translations[language];
    const line = Array.isArray(entry?.hints) ? usableLine(entry.hints[index]) : null;
    if (line) found[language] = line;
  });
  return found;
};

/** The line for one student's language out of a `{ language: text }` map (exact tag, then base language), or null. */
export const authoredLineFor = (byLanguage, language) => {
  const key = languageKeyIn(byLanguage, language);
  return key === undefined ? null : usableLine(byLanguage[key]);
};

/** The teacher's version of one worked-solution field, or null. `index` picks a line of `reasoning`. */
const reviewLine = (entry, field, index) => {
  const review = entry?.solutionReview;
  if (!isObject(review)) return null;
  return usableLine(field === 'reasoning' ? (Array.isArray(review.reasoning) ? review.reasoning[index] : null) : review[field]);
};

/**
 * The worked solution a student asked to translate, in the teacher's words.
 *
 *   parts    the review's speech parts in order, `{ text, path }`; a part with a
 *            `path` ([field] or ['reasoning', n]) is the teacher's own text and
 *            has a counterpart to look for; the rest (a tool's steps, the
 *            legacy review) have none
 *   leading  text that comes before them and has no counterpart (the part-by-part
 *            lines of a multi-answer question)
 *
 * Each part whose Spanish carries its English's mathematics is replaced; every
 * other part stays English, so one wrong line costs a student that line, not the
 * solution. `null` when no part could be replaced. Coverage is `full` only when
 * every sentence of the text was the teacher's Spanish; otherwise `partial`, and
 * the student is told some sentences are still in English.
 *
 * `verified` says every sentence in the text has been held to the rule one at a
 * time, so the provider does not read the whole again. It could not do so
 * fairly: the English sentences left in a partial text would be read as Spanish
 * prose, where a lone English "y" is the word "and" and "loses" the variable.
 */
export const authoredReviewTranslation = ({ question, parts = [], language, leading = '' } = {}) => {
  const entry = authoredTranslationEntry(question, language);
  if (!entry || !isObject(entry.solutionReview)) return null;
  let replaced = 0;
  const texts = (Array.isArray(parts) ? parts : []).map((part) => {
    if (!Array.isArray(part?.path)) return part.text;
    const candidate = reviewLine(entry, part.path[0], part.path[1]);
    if (candidate && authoredTranslationKeepsMath(part.text, candidate, language)) {
      replaced += 1;
      return candidate;
    }
    return part.text;
  });
  if (!replaced) return null;
  const text = [leading, ...texts].map(clean).filter(Boolean).join(' ');
  return { text, coverage: replaced === parts.length && !clean(leading) ? 'full' : 'partial', verified: true };
};

/**
 * The teacher-written worked-solution texts of a question that a Spanish version
 * would cover, in reading order: `[{ text, path }]`. The same parts the worked
 * solution reads aloud (closedQuestionReview.js), without a tool's or the legacy
 * review's own lines. `review` is the question's authored review in the Path
 * shape (pathSolutionSupport.mjs buildPrivateSupport().solutionReview).
 */
export const authoredReviewParts = (review) => {
  if (!isObject(review)) return [];
  const parts = [];
  if (clean(review.headline)) parts.push({ text: clean(review.headline), path: ['headline'] });
  (Array.isArray(review.reasoning) ? review.reasoning : []).forEach((line, index) => {
    if (clean(line)) parts.push({ text: clean(line), path: ['reasoning', index] });
  });
  if (clean(review.answerSummary)) parts.push({ text: clean(review.answerSummary), path: ['answerSummary'] });
  if (clean(review.commonError)) parts.push({ text: clean(review.commonError), path: ['commonError'] });
  return parts;
};

/** The teacher's Spanish (or other language) for one authored review part, or null. */
export const authoredReviewPartTranslation = (question, language, path) => {
  const entry = authoredTranslationEntry(question, language);
  return entry ? reviewLine(entry, path[0], path[1]) : null;
};
