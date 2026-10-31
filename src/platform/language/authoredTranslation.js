/*
 * AN ITEM'S AUTHORED TRANSLATION FOR A STUDENT'S LANGUAGE — one lookup and one
 * safety rule, read both where the assignment applies it to the question
 * (src/studentSupport.js) and where the Translate tool decides what the
 * student already sees (./translationProviders.js), so the two never
 * disagree. The exact tag first, then its base language: a student set to
 * "es-MX" gets the "es" translation in both places.
 *
 * What an entry can hold (the teacher writes it with the item):
 *   prompt, title, scenario     replace the item's own words on the student's
 *                               screen (studentSupport.js);
 *   hints[]                     the teacher's hints in the student's language,
 *                               line N for hint N (authoredSupportText.js);
 *   solutionReview              headline, reasoning[], answerSummary and
 *                               commonError of the worked solution
 *                               (authoredSupportText.js).
 * Every one of them is shown only if it carries the English's mathematics
 * exactly (the rule below); one that does not stays English.
 */
import { preservesMath } from './mathSafeText.js';

/** The key of `map` that names `language`: the exact tag first, then its base language. */
export const languageKeyIn = (map, language) => {
  const code = String(language || '').trim().toLowerCase();
  if (!code || !map || typeof map !== 'object' || Array.isArray(map)) return undefined;
  const keyFor = (wanted) => Object.keys(map).find((key) => key.toLowerCase() === wanted);
  return keyFor(code) ?? keyFor(code.split('-')[0]);
};

export const authoredTranslationEntry = (question, language) => {
  const translations = question?.translations;
  const key = languageKeyIn(translations, language);
  const entry = key === undefined ? null : translations[key];
  return entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : null;
};

/**
 * May this authored translation stand in for the authored prompt? Only if it
 * carries the prompt's mathematics exactly (mathSafeText.js preservesMath).
 * It is a person's own text, so a variable may be written "$y$" in it where the
 * English has "y": the delimiters are how it is written, not what it says, and
 * in Spanish prose a lone y is the word "and". Every authored line (a hint, a
 * worked-solution sentence) is held to the same rule.
 * An item with no authored prompt keeps its mathematics in the tool itself;
 * there is nothing in the prompt to contradict, so its translation is shown.
 */
export const authoredTranslationKeepsMath = (original, translated, language) => (
  !String(original ?? '').trim()
  || preservesMath(String(original ?? ''), String(translated ?? ''), { language, ignoreDelimiters: true })
);
