/*
 * WHAT THE TRANSLATE AND VOCABULARY PANELS SHOW ON A SECURE ITEM.
 *
 * The secure tray (src/components/assessment/SecureSupportToolsTray.jsx) uses
 * the platform's own translation providers and glossary — the same content a
 * student meets on every assignment. Two things about that content are wrong
 * beside a test item, and this module is where they are decided:
 *
 *   VOCABULARY SHOWS THE WORD AND WHAT IT MEANS, NEVER AN EXAMPLE. Every
 *   glossary entry carries a worked example with real numbers — "A line that
 *   goes up 2 for every 1 to the right has slope 2", "If a model predicts 10
 *   and the actual value is 12, the residual is 2", "The graph of y = x² has
 *   its vertex at (0, 0)". On practice that helps; beside a test item that
 *   asks for a slope, a residual or a vertex it is the item worked for the
 *   student. A definition explains the word ("the change in y for each change
 *   in x"); the example applies it, so only the definition is shown.
 *
 *   AN AUTHORED TRANSLATION IS SHOWN AS THE TRANSLATION. On an assignment an
 *   authored translation replaces the prompt on screen, so the shared tray's
 *   panel offers the English original beside it. A secure item's prompt is
 *   never replaced, so that panel would show the English a second time while
 *   the evidence recorded a full translation as used. Here the panel shows the
 *   authored translation itself.
 *
 * Pure: no DOM, no network. The glossary and the translation arrive already
 * loaded.
 */
import { LANGUAGE_NAMES, TRANSLATION_COVERAGE, TRANSLATION_PROVIDER } from '../language/translationProviders.js';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const baseLanguage = (language) => clean(language).toLowerCase().split('-')[0];

/** "Spanish (Español)" for "es-MX"; the code itself when it has no name. */
export const secureLanguageName = (language) => LANGUAGE_NAMES[baseLanguage(language)] || clean(language).toUpperCase();

/**
 * The vocabulary entries for one item: term and definition, and for a
 * Spanish-language student the curated Spanish term and definition (the
 * bilingual pack the glossary carries). Nothing else of an entry — no
 * example, no picture hint, no spoken form — leaves this function.
 *
 * @param glossary  loadMathGlossary()'s result (id → entry)
 * @param termIds   the item's terms, from the support model (prompt words only)
 */
export const secureVocabularyEntries = (glossary, termIds = [], { language = null } = {}) => {
  const spanish = baseLanguage(language) === 'es';
  return (Array.isArray(termIds) ? termIds : [])
    .filter((id) => typeof id === 'string' && glossary && Object.prototype.hasOwnProperty.call(glossary, id))
    .map((id) => [id, glossary[id]])
    .filter(([, entry]) => clean(entry?.term) && clean(entry?.definition))
    .map(([id, entry]) => {
      const translated = spanish && clean(entry.es?.term) && clean(entry.es?.definition)
        ? { language: 'es', term: entry.es.term, definition: entry.es.definition }
        : null;
      return { id, term: entry.term, definition: entry.definition, translation: translated };
    });
};

/**
 * What the Translate panel shows, from a resolved translation
 * (translationProviders.js resolveTranslation), or null when there is nothing
 * to show.
 *
 *   authored  one line: the authored translation of the prompt
 *   curated   the prompt's sentences, translated where the pack covers them
 *             and marked English where it does not; a sentence that is only
 *             mathematics is not repeated unless it is the whole prompt
 */
export const secureTranslationView = (translation) => {
  if (!translation || typeof translation !== 'object') return null;
  const language = clean(translation.language);
  const coverage = translation.coverage;
  if (coverage !== TRANSLATION_COVERAGE.FULL && coverage !== TRANSLATION_COVERAGE.PARTIAL) return null;
  const view = { language, languageName: secureLanguageName(language), partial: coverage === TRANSLATION_COVERAGE.PARTIAL };
  if (translation.provider === TRANSLATION_PROVIDER.AUTHORED) {
    const text = clean(translation.text);
    return text ? { ...view, partial: false, lines: [{ text, translated: true, mathOnly: false }] } : null;
  }
  const sentences = Array.isArray(translation.sentences) ? translation.sentences : [];
  const lines = sentences
    .filter((sentence) => sentence && (!sentence.mathOnly || sentences.length === 1))
    .map((sentence) => ({ text: String(sentence.text ?? ''), translated: sentence.translated === true, mathOnly: sentence.mathOnly === true }))
    .filter((line) => line.text.trim());
  return lines.length ? { ...view, lines } : null;
};
