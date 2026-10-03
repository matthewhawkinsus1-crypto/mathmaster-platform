/*
 * TRANSLATION PROVIDERS — where translated content comes from, and how much.
 *
 * A language on a student's profile is not translated content on a screen.
 * This module answers, for one item in one language, what MathMaster can
 * actually show, and says so in a form the evidence can record:
 *
 *   full                 every sentence that has words is translated
 *   partial              some are; the rest stay in English, marked
 *   none                 nothing could be translated (an implementation gap)
 *   not-applicable       the item has no words to translate (only mathematics)
 *
 * PROVIDERS, in order — the first that can answer wins:
 *
 *   authored  question.translations[language] — written by a person with the
 *             item (src/studentSupport.js applies it to the prompt). Refused if
 *             its mathematics differs from the authored prompt.
 *   curated   a built-in language pack (./packs/<language>.js) of curated
 *             direction sentences; mathematics is carried through slots and
 *             never translated (./mathSafeText.js). Loaded on demand.
 *
 * There is deliberately NO machine-translation provider. Sending a student's
 * items to an external (paid) service is a privacy and cost decision, not an
 * implementation detail; a future provider plugs in here (registerProvider)
 * behind the same contract, after that decision is made.
 */
import { maskMath, preservesMath, splitSentences, unmaskMath } from './mathSafeText.js';
import { authoredTranslationEntry, authoredTranslationKeepsMath } from './authoredTranslation.js';

export const TRANSLATION_COVERAGE = Object.freeze({
  FULL: 'full',
  PARTIAL: 'partial',
  NONE: 'none',
  NOT_APPLICABLE: 'not-applicable',
});

export const TRANSLATION_PROVIDER = Object.freeze({
  AUTHORED: 'authored',
  CURATED: 'curated',
});

/** Why a language could not be provided (compact; recorded in evidence). */
export const TRANSLATION_GAP = Object.freeze({
  NO_RESOURCE: 'no-translation-resource',
  NO_PACK: 'no-language-pack',
  MATH_MISMATCH: 'math-mismatch',
  LOAD_FAILED: 'language-pack-failed',
});

export const LANGUAGE_NAMES = Object.freeze({
  es: 'Spanish (Español)',
  vi: 'Vietnamese (Tiếng Việt)',
  ar: 'Arabic (العربية)',
  zh: 'Chinese (中文)',
  fr: 'French (Français)',
  pt: 'Portuguese (Português)',
  ko: 'Korean (한국어)',
  ht: 'Haitian Creole (Kreyòl)',
  ru: 'Russian (Русский)',
  so: 'Somali (Soomaali)',
  sw: 'Swahili (Kiswahili)',
  tl: 'Tagalog',
  ur: 'Urdu (اردو)',
  hi: 'Hindi (हिन्दी)',
  ne: 'Nepali (नेपाली)',
  my: 'Burmese (မြန်မာ)',
  ps: 'Pashto (پښتو)',
  fa: 'Dari / Farsi (فارسی)',
});

const baseLanguage = (language) => String(language || '').trim().toLowerCase().split('-')[0];

// Built-in packs. Each is its own chunk: a student never downloads a pack for
// a language that is not theirs, and a student with no language support never
// downloads one at all.
const PACK_LOADERS = {
  es: () => import('./packs/es.js'),
};

export const hasCuratedPack = (language) => Boolean(PACK_LOADERS[baseLanguage(language)]);
export const curatedPackLanguages = () => Object.keys(PACK_LOADERS);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compile `[english, translated]` templates into matchers over masked text. */
export const compileTemplates = (pairs = []) => pairs.map(([english, translated]) => {
  const slots = [];
  const source = escapeRegExp(String(english).trim())
    .replace(/\\\{(\d+)\\\}/g, (match, slot) => { slots.push(Number(slot)); return '(⟦\\d+⟧)'; })
    .replace(/\s+/g, '\\s+');
  const first = source.charAt(0);
  const leading = /[A-Za-z]/.test(first) ? `[${first.toLowerCase()}${first.toUpperCase()}]` : first;
  return { pattern: new RegExp(`^${leading}${source.slice(1)}$`), slots, translated: String(translated) };
});

const packCache = new Map();
/** The compiled pack for a language, or null when there is none. */
export const loadLanguagePack = (language) => {
  const code = baseLanguage(language);
  const loader = PACK_LOADERS[code];
  if (!loader) return Promise.resolve(null);
  if (!packCache.has(code)) {
    packCache.set(code, loader().then((module) => {
      const pack = module.default || module;
      return {
        language: code,
        sentences: compileTemplates(pack.sentences),
        choices: compileTemplates(pack.choices),
      };
    }).catch((error) => { packCache.delete(code); throw error; }));
  }
  return packCache.get(code);
};

const applyTemplate = (templates, masked) => {
  const text = masked.trim();
  for (const template of templates) {
    const match = text.match(template.pattern);
    if (!match) continue;
    const bySlot = new Map(template.slots.map((slot, index) => [slot, match[index + 1]]));
    return template.translated.replace(/\{(\d+)\}/g, (whole, slot) => bySlot.get(Number(slot)) ?? whole);
  }
  return null;
};

const hasWords = (masked) => /[A-Za-zÀ-ÿ]{2,}/.test(masked.replace(/⟦\d+⟧/g, ' '));
const CHOICE_LABEL = /^(⟦(\d+)⟧\)\s*)([\s\S]*)$/;

/**
 * Translate one text with a compiled pack, sentence by sentence.
 * Returns `{ coverage, sentences: [{ source, text, translated }], text }`.
 */
export const translateWithPack = (input, pack, { language = pack?.language } = {}) => {
  const lines = String(input ?? '').split('\n');
  const out = [];
  let prose = 0;
  let translated = 0;
  const lineTexts = lines.map((line) => {
    if (!line.trim()) return line;
    const parts = splitSentences(line).map((sentence) => {
      const { masked, tokens } = maskMath(sentence);
      if (!hasWords(masked)) {
        out.push({ source: sentence, text: sentence, translated: false, mathOnly: true });
        return sentence;
      }
      prose += 1;
      let result = null;
      const label = masked.match(CHOICE_LABEL);
      if (label && /^[A-Ea-e]$/.test(tokens[Number(label[2])] || '')) {
        const body = applyTemplate(pack.choices, label[3]) ?? applyTemplate(pack.sentences, label[3]);
        if (body !== null) result = `${label[1]}${body}`;
      } else {
        result = applyTemplate(pack.sentences, masked) ?? applyTemplate(pack.choices, masked);
      }
      const restored = result === null ? null : unmaskMath(result, tokens);
      // Belt and braces: the mathematics must survive exactly.
      const safe = restored !== null && preservesMath(sentence, restored, { language });
      if (safe) translated += 1;
      out.push({ source: sentence, text: safe ? restored : sentence, translated: safe });
      return safe ? restored : sentence;
    });
    return parts.join(' ');
  });
  let coverage;
  if (!prose) coverage = TRANSLATION_COVERAGE.NOT_APPLICABLE;
  else if (translated === prose) coverage = TRANSLATION_COVERAGE.FULL;
  else if (translated > 0) coverage = TRANSLATION_COVERAGE.PARTIAL;
  else coverage = TRANSLATION_COVERAGE.NONE;
  return { coverage, sentences: out, text: lineTexts.join('\n'), translatedCount: translated, proseCount: prose };
};

/**
 * The authored translation of an item, when it exists and keeps the
 * mathematics. `original` is the authored English prompt.
 */
export const authoredTranslationOf = (question, language) => {
  const code = String(language || '').trim().toLowerCase();
  const entry = authoredTranslationEntry(question, code);
  if (!entry || typeof entry.prompt !== 'string' || !entry.prompt.trim()) return null;
  const original = typeof question?.authoredPrompt === 'string' ? question.authoredPrompt : String(question?.prompt ?? '');
  return {
    text: entry.prompt,
    original,
    keepsMath: authoredTranslationKeepsMath(original, entry.prompt, code),
  };
};

// Additional providers (a future reviewed service, a district glossary) plug in
// here with the same contract: ({ text, language, question }) => result | null.
const extraProviders = [];
export const registerTranslationProvider = (provider) => {
  if (provider && typeof provider.translate === 'function' && provider.id) extraProviders.push(provider);
};

/**
 * What MathMaster can show a student for one item in one language.
 *
 * Resolves to `{ coverage, provider, language, text, original, sentences, reason }`.
 * Never throws: a pack that fails to load is a recorded gap, not a crash.
 */
export const resolveTranslation = async ({ question = null, text = null, language } = {}) => {
  const code = String(language || '').trim().toLowerCase();
  const original = text ?? (typeof question?.authoredPrompt === 'string' ? question.authoredPrompt : String(question?.prompt ?? ''));
  const base = { language: code, original, provider: null, text: null, sentences: [], reason: null };
  if (!code) return { ...base, coverage: TRANSLATION_COVERAGE.NONE, reason: TRANSLATION_GAP.NO_PACK };

  const authored = question ? authoredTranslationOf(question, code) : null;
  if (authored?.keepsMath) {
    return { ...base, coverage: TRANSLATION_COVERAGE.FULL, provider: TRANSLATION_PROVIDER.AUTHORED, text: authored.text, original: authored.original };
  }

  for (const provider of extraProviders) {
    // eslint-disable-next-line no-await-in-loop
    const result = await Promise.resolve(provider.translate({ text: original, language: code, question })).catch(() => null);
    if (result && result.text && preservesMath(original, result.text, { language: code })) {
      return { ...base, coverage: result.coverage || TRANSLATION_COVERAGE.FULL, provider: provider.id, text: result.text };
    }
  }

  let pack = null;
  try {
    pack = await loadLanguagePack(code);
  } catch {
    return { ...base, coverage: TRANSLATION_COVERAGE.NONE, reason: TRANSLATION_GAP.LOAD_FAILED };
  }
  if (!pack) {
    return {
      ...base,
      coverage: TRANSLATION_COVERAGE.NONE,
      reason: authored && !authored.keepsMath ? TRANSLATION_GAP.MATH_MISMATCH : TRANSLATION_GAP.NO_PACK,
    };
  }
  const result = translateWithPack(original, pack, { language: code });
  if (result.coverage === TRANSLATION_COVERAGE.NOT_APPLICABLE) {
    return { ...base, coverage: result.coverage, provider: TRANSLATION_PROVIDER.CURATED, text: original, sentences: result.sentences };
  }
  if (result.coverage === TRANSLATION_COVERAGE.NONE) {
    return {
      ...base,
      coverage: result.coverage,
      sentences: result.sentences,
      reason: authored && !authored.keepsMath ? TRANSLATION_GAP.MATH_MISMATCH : TRANSLATION_GAP.NO_RESOURCE,
    };
  }
  return {
    ...base,
    coverage: result.coverage,
    provider: TRANSLATION_PROVIDER.CURATED,
    text: result.text,
    sentences: result.sentences,
  };
};
