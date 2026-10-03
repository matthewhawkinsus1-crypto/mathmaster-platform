/*
 * AN ITEM'S AUTHORED TRANSLATION FOR A STUDENT'S LANGUAGE — one lookup and one
 * safety rule, read both where the assignment applies it to the question
 * (src/studentSupport.js) and where the Translate tool decides what the
 * student already sees (./translationProviders.js), so the two never
 * disagree. The exact tag first, then its base language: a student set to
 * "es-MX" gets the "es" translation in both places.
 */
import { preservesMath } from './mathSafeText.js';

export const authoredTranslationEntry = (question, language) => {
  const code = String(language || '').trim().toLowerCase();
  const translations = question?.translations;
  if (!code || !translations || typeof translations !== 'object' || Array.isArray(translations)) return null;
  const keyFor = (wanted) => Object.keys(translations).find((key) => key.toLowerCase() === wanted);
  const key = keyFor(code) ?? keyFor(code.split('-')[0]);
  const entry = key === undefined ? null : translations[key];
  return entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : null;
};

/**
 * May this authored translation stand in for the authored prompt? Only if it
 * carries the prompt's mathematics exactly (mathSafeText.js preservesMath).
 * An item with no authored prompt keeps its mathematics in the tool itself;
 * there is nothing in the prompt to contradict, so its translation is shown.
 */
export const authoredTranslationKeepsMath = (original, translated, language) => (
  !String(original ?? '').trim() || preservesMath(String(original ?? ''), String(translated ?? ''), { language })
);
