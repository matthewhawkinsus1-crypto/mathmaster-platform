// What a student is actually entitled to, in one shape.
//
// THE PROBLEM THIS SOLVES. Before this module there were nine different
// representations of a student's supports in the repository, and the two that
// mattered could not read each other:
//
//   LEGACY FLAT   { inclusionStatus, accommodations: ['text-to-speech', ...],
//                   modifications: [...], translationLanguage }
//                 The only shape ever persisted (grades/{id}.profile), written
//                 by the teacher UI, consumed by assignments.
//
//   STRUCTURED    { programEligibility: {...}, accommodations: { textToSpeech:
//                   true, extendedTimeMultiplier: 1.5, extraAttempts: 2, ... },
//                   modification: {...} }
//                 The better-designed shape, produced by the SIS/IEP importer,
//                 consumed by nothing. Numeric supports — extended time, extra
//                 attempts — exist ONLY here, which is why neither of them did
//                 anything.
//
// The two even disagreed about words: a district column `extra_time` became
// `extendedTimeMultiplier`, while the teacher UI's `'extra-time'` meant "turn
// off the idle timer". Same phrase, two meanings, no translation between them.
//
// This module is the translation. It is an ADAPTER, not a migration: both
// stored shapes keep working, and every consumer asks this one function what a
// student is entitled to. A student must not lose an accommodation because
// they walked into a different part of the platform.
//
// It lives in functions/shared/ because the SERVER has to be the authority.
// An entitlement that changes attempts, grading, or mastery cannot be decided
// by the browser.
//
// THE VERSIONED PROFILE. Since support profiles became dated revisions
// (supportProfileModel.mjs), the stored flat keys describe only the revision
// current when the profile was last SAVED. This adapter therefore reads a
// versioned profile through supportProfileModel.mjs effectiveFlatSupportProfile
// — the same function src/studentSupport.js normalizeStudentProfile uses — so
// a future-dated revision switches on (and an inactive one off) on My Math Path
// on the same day it does on an assignment. It is a bridge, not a third
// resolver: the structured SIS shape below is the only thing it reads itself.

import { effectiveFlatSupportProfile, translationLanguageOf } from './supportProfileModel.mjs';

/** Legacy kebab-case accommodation ids, as the teacher UI writes them. */
export const LEGACY_ACCOMMODATIONS = Object.freeze({
  TEXT_TO_SPEECH: 'text-to-speech',
  EXTRA_TIME: 'extra-time',
  NO_COUNTDOWN: 'no-countdown',
  DISABLE_IDLE_TIMER: 'disable-idle-timer',
  VISUAL_CHUNKING: 'visual-chunking',
  HIGH_CONTRAST: 'high-contrast',
  LARGE_TEXT: 'large-text',
  DECLUTTER: 'declutter-ui',
  CALCULATOR: 'calculator',
  CALCULATOR_OVERRIDE: 'calculator-override-computation',
  ALGEBRA_AUTO_APPLY: 'algebra-auto-apply',
  GLOSSARY: 'glossary-lookup',
  GRAPHIC_ORGANIZER: 'graphic-organizer',
  REDUCED_CHOICES: 'reduced-choices',
  EXTRA_ATTEMPTS: 'extra-attempts',
  CHUNKED_DIRECTIONS: 'chunked-directions',
  SENTENCE_FRAMES: 'sentence-frames',
});

/**
 * Canonical support ids.
 *
 * ACCESS supports change how a student reaches the mathematics. They must
 * never reduce mastery credit — a student who had the prompt read aloud still
 * did the mathematics.
 *
 * SCAFFOLD supports help perform the reasoning. Those are NOT entitlements and
 * are not listed here; they are recorded per attempt in `supportUsage`.
 */
export const SUPPORT = Object.freeze({
  TEXT_TO_SPEECH: 'textToSpeech',
  TRANSLATION: 'translation',
  GLOSSARY: 'glossary',
  HIGH_CONTRAST: 'highContrast',
  LARGE_TEXT: 'largeText',
  VISUAL_CHUNKING: 'visualChunking',
  DECLUTTER: 'declutter',
  GRAPHIC_ORGANIZER: 'graphicOrganizer',
  CALCULATOR: 'calculator',
  REDUCED_CHOICES: 'reducedChoices',
  EXTENDED_TIME: 'extendedTime',
  EXTRA_ATTEMPTS: 'extraAttempts',
  ALGEBRA_AUTO_APPLY: 'algebraAutoApply',
  CHUNKED_DIRECTIONS: 'chunkedDirections',
  SENTENCE_FRAMES: 'sentenceFrames',
});

/**
 * Canonical support → the catalog id evidence and reports use
 * (functions/shared/supportCatalog.mjs). The one place the two vocabularies
 * meet, so a Path delivery record and an assignment record name a support the
 * same way.
 */
export const CATALOG_ID_FOR_SUPPORT = Object.freeze({
  [SUPPORT.TEXT_TO_SPEECH]: 'text-to-speech',
  [SUPPORT.TRANSLATION]: 'translation',
  [SUPPORT.GLOSSARY]: 'glossary-lookup',
  [SUPPORT.HIGH_CONTRAST]: 'high-contrast',
  [SUPPORT.LARGE_TEXT]: 'large-text',
  [SUPPORT.VISUAL_CHUNKING]: 'visual-chunking',
  [SUPPORT.DECLUTTER]: 'declutter-ui',
  [SUPPORT.GRAPHIC_ORGANIZER]: 'graphic-organizer',
  [SUPPORT.CALCULATOR]: 'calculator',
  [SUPPORT.REDUCED_CHOICES]: 'reduced-choices',
  [SUPPORT.EXTENDED_TIME]: 'extra-time',
  [SUPPORT.EXTRA_ATTEMPTS]: 'extra-attempts',
  [SUPPORT.ALGEBRA_AUTO_APPLY]: 'algebra-auto-apply',
  [SUPPORT.CHUNKED_DIRECTIONS]: 'chunked-directions',
  [SUPPORT.SENTENCE_FRAMES]: 'sentence-frames',
});

export const SUPPORT_FOR_CATALOG_ID = Object.freeze(Object.fromEntries(
  Object.entries(CATALOG_ID_FOR_SUPPORT).map(([support, catalogId]) => [catalogId, support]),
));

/**
 * Every canonical support that is ACCESS rather than mathematical help.
 *
 * This set is the reason the whole module exists. Using one of these must not
 * make a student's evidence look dependent: an EB student reading the question
 * in Spanish did the same mathematics as everyone else.
 */
export const ACCESS_SUPPORTS = Object.freeze(new Set([
  SUPPORT.TEXT_TO_SPEECH, SUPPORT.TRANSLATION, SUPPORT.GLOSSARY,
  SUPPORT.HIGH_CONTRAST, SUPPORT.LARGE_TEXT, SUPPORT.VISUAL_CHUNKING,
  SUPPORT.DECLUTTER, SUPPORT.GRAPHIC_ORGANIZER, SUPPORT.EXTENDED_TIME,
  SUPPORT.EXTRA_ATTEMPTS, SUPPORT.CALCULATOR, SUPPORT.REDUCED_CHOICES,
  // Language access: the words around the task, never the task.
  SUPPORT.CHUNKED_DIRECTIONS, SUPPORT.SENTENCE_FRAMES,
]));

/**
 * Supports that change the mathematical demand and therefore DO bear on how
 * strong the evidence is. `algebraAutoApply` performs an algebraic step the
 * student chose but did not carry out, which is a different claim from "solved
 * it".
 */
export const CONSTRUCT_AFFECTING_SUPPORTS = Object.freeze(new Set([
  SUPPORT.ALGEBRA_AUTO_APPLY,
]));

const list = (value) => (Array.isArray(value) ? value : []);
const bool = (value) => value === true;
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/** Does this look like the structured SIS/IEP shape rather than the flat one? */
const isStructured = (profile) => Boolean(
  profile
  && typeof profile === 'object'
  && profile.accommodations
  && !Array.isArray(profile.accommodations)
  && typeof profile.accommodations === 'object',
);

/**
 * Resolve a stored profile — in EITHER shape — into one entitlement record.
 *
 * Never throws and never returns null: an absent, malformed or half-written
 * profile resolves to "no entitlements", which is the safe direction. A
 * student cannot be given a support by a broken document, and a missing
 * document cannot crash a session.
 */
export const resolveSupportEntitlements = (rawProfile = null, { nowValue = Date.now() } = {}) => {
  const stored = rawProfile && typeof rawProfile === 'object' && !Array.isArray(rawProfile) ? rawProfile : {};
  const structured = isStructured(stored);
  // A flat or versioned profile is read through the shared effective view
  // (header); only the structured SIS shape is read directly.
  const profile = structured ? stored : effectiveFlatSupportProfile(stored, { nowValue });

  const flatAccommodations = new Set(list(profile.accommodations).map((entry) => String(entry)));
  const flatModifications = new Set(list(profile.modifications).map((entry) => String(entry)));
  // Inclusion status is a blanket presentation entitlement in the legacy model.
  const inclusion = bool(profile.inclusionStatus);

  const has = (legacyId, structuredValue) => (structured ? bool(structuredValue) : flatAccommodations.has(legacyId));

  const accommodations = structured ? (profile.accommodations || {}) : {};

  const translationLanguage = structured
    ? (bool(accommodations.spanishTranslation)
      ? (profile.programEligibility?.ebLanguage || 'es')
      : null)
    : translationLanguageOf(profile.translationLanguage);

  const granted = {
    [SUPPORT.TEXT_TO_SPEECH]: has(LEGACY_ACCOMMODATIONS.TEXT_TO_SPEECH, accommodations.textToSpeech),
    [SUPPORT.TRANSLATION]: Boolean(translationLanguage && translationLanguage !== 'en'),
    [SUPPORT.GLOSSARY]: has(LEGACY_ACCOMMODATIONS.GLOSSARY, accommodations.glossaryLookup),
    [SUPPORT.HIGH_CONTRAST]: inclusion || has(LEGACY_ACCOMMODATIONS.HIGH_CONTRAST, accommodations.highContrast),
    [SUPPORT.LARGE_TEXT]: inclusion || has(LEGACY_ACCOMMODATIONS.LARGE_TEXT, accommodations.largeFont ?? accommodations.largeText),
    [SUPPORT.VISUAL_CHUNKING]: inclusion || has(LEGACY_ACCOMMODATIONS.VISUAL_CHUNKING, accommodations.visualChunking),
    [SUPPORT.DECLUTTER]: inclusion || has(LEGACY_ACCOMMODATIONS.DECLUTTER, accommodations.declutter),
    [SUPPORT.GRAPHIC_ORGANIZER]: has(LEGACY_ACCOMMODATIONS.GRAPHIC_ORGANIZER, accommodations.graphicOrganizer),
    [SUPPORT.CALCULATOR]: has(LEGACY_ACCOMMODATIONS.CALCULATOR, accommodations.calculator),
    [SUPPORT.REDUCED_CHOICES]: has(LEGACY_ACCOMMODATIONS.REDUCED_CHOICES, accommodations.reducedChoices),
    // `algebra-auto-apply` is an explicit accommodation and deliberately NOT
    // implied by inclusion status: a student with large text should not
    // silently acquire an algebra shortcut nobody assigned them.
    [SUPPORT.ALGEBRA_AUTO_APPLY]: has(LEGACY_ACCOMMODATIONS.ALGEBRA_AUTO_APPLY, accommodations.algebraAutoApply),
    [SUPPORT.CHUNKED_DIRECTIONS]: has(LEGACY_ACCOMMODATIONS.CHUNKED_DIRECTIONS, accommodations.chunkedDirections),
    [SUPPORT.SENTENCE_FRAMES]: has(LEGACY_ACCOMMODATIONS.SENTENCE_FRAMES, accommodations.sentenceFrames),
  };

  // Numeric supports. In the legacy shape these are presence-only, so a
  // teacher who ticks the box gets the conservative default rather than
  // nothing at all — which is what happened before.
  const extendedTimeMultiplier = structured
    ? clamp(accommodations.extendedTimeMultiplier, 1, 4, 1)
    : (flatAccommodations.has(LEGACY_ACCOMMODATIONS.EXTRA_TIME) || inclusion ? 1.5 : 1);

  const extraAttempts = structured
    ? clamp(accommodations.extraAttempts, 0, 10, 0)
    : (flatAccommodations.has(LEGACY_ACCOMMODATIONS.EXTRA_ATTEMPTS) ? 1 : 0);

  granted[SUPPORT.EXTENDED_TIME] = extendedTimeMultiplier > 1;
  granted[SUPPORT.EXTRA_ATTEMPTS] = extraAttempts > 0;

  // A MODIFICATION changes what the student is expected to learn. It is kept
  // strictly apart from accommodation: adaptive prerequisite remediation is
  // instructional routing and must never set this.
  const modification = structured
    ? {
      isModifiedCurriculum: bool(profile.modification?.isModifiedCurriculum),
      modifiedTeksCode: profile.modification?.modifiedTeksCode || null,
      maxDokCap: Number.isFinite(Number(profile.modification?.maxDokCap))
        ? clamp(profile.modification.maxDokCap, 1, 4, null)
        : null,
    }
    : {
      isModifiedCurriculum: flatModifications.size > 0,
      modifiedTeksCode: null,
      maxDokCap: null,
      legacyModifications: [...flatModifications],
    };

  return {
    // Which stored shape this came from, so a report can say so rather than
    // guess.
    sourceShape: structured ? 'structured' : 'legacy',
    hasProfile: structured || inclusion || flatAccommodations.size > 0 || flatModifications.size > 0 || Boolean(translationLanguage),
    programEligibility: {
      sped: structured ? bool(profile.programEligibility?.sped) : inclusion,
      section504: structured ? bool(profile.programEligibility?.section504) : false,
      emergentBilingual: structured
        ? bool(profile.programEligibility?.emergentBilingual)
        : Boolean(translationLanguage && translationLanguage !== 'en'),
      ebLanguage: translationLanguage || null,
    },
    granted,
    translationLanguage,
    extendedTimeMultiplier,
    extraAttempts,
    modification,
    /** Every canonical support this student is authorized for. */
    authorized: Object.entries(granted).filter(([, on]) => on).map(([id]) => id),
  };
};

/** Is this support authorized for this student? */
export const isSupportAuthorized = (entitlements, supportId) => Boolean(entitlements?.granted?.[supportId]);

/**
 * How many attempts this student gets on one Path question.
 *
 * `baseAttempts` is the pedagogical figure the activity decided — 1 for a
 * diagnostic or a retention probe, 3 for practice. Extra attempts are ADDED to
 * it rather than replacing it, so an accommodation cannot accidentally shorten
 * a student's runway, and a diagnostic stays a diagnostic (one question, one
 * look) unless a real authorization says otherwise.
 */
export const attemptsWithEntitlements = (baseAttempts, entitlements, { allowOnDiagnostic = false } = {}) => {
  const base = Math.max(1, Number(baseAttempts) || 1);
  const extra = Math.max(0, Number(entitlements?.extraAttempts) || 0);
  if (!extra) return base;
  // A one-attempt task is one-attempt BY DESIGN: it is asking whether the
  // student can do this unaided right now. Extending it changes what is being
  // measured rather than how the student accesses it.
  if (base === 1 && !allowOnDiagnostic) return base;
  return Math.min(10, base + extra);
};

/**
 * The supports that are APPLICABLE to one particular question.
 *
 * Authorized is not the same as applicable. A calculator accommodation does
 * not apply to a question whose assessed construct IS the computation; reduced
 * choices do not apply to a question with no choices to reduce. Reporting
 * "presented: false" for a support that could never apply here is noise, and
 * worse, it makes a compliance report cry wolf.
 */
export const applicableSupports = (entitlements, question = {}, { calculatorAllowedByPolicy = null } = {}) => {
  if (!entitlements?.authorized?.length) return [];
  const hasChoices = Array.isArray(question.choices) && question.choices.length > 2;
  const assessesComputation = String(question.assessedConstruct || '').toLowerCase().includes('computation');

  return entitlements.authorized.filter((supportId) => {
    if (supportId === SUPPORT.REDUCED_CHOICES) return hasChoices;
    if (supportId === SUPPORT.CALCULATOR) {
      if (calculatorAllowedByPolicy === false) return false;
      // The construct rule: an accommodation may provide access, but it may
      // not replace the very thing being assessed.
      return !assessesComputation;
    }
    // Extended time is about the activity, not the item.
    if (supportId === SUPPORT.EXTENDED_TIME) return true;
    return true;
  });
};

/**
 * Fold a client's report of what it actually RENDERED and what the student
 * USED into the authorized set.
 *
 * The split matters. "Authorized" and "applicable" are server facts. "Was the
 * button actually on the screen" and "did the student press it" are facts only
 * the browser can observe — but the browser is not trusted to invent them: a
 * support the student was never authorized for cannot be reported as presented
 * or used, so a modified client cannot manufacture a compliance record or an
 * excuse.
 */
export const reconcileSupportDelivery = ({
  entitlements,
  applicable = [],
  clientPresented = [],
  clientUsed = [],
} = {}) => {
  const authorized = new Set(entitlements?.authorized || []);
  const applicableSet = new Set(applicable);
  const presented = [...new Set(list(clientPresented).map(String))].filter((id) => applicableSet.has(id));
  const used = [...new Set(list(clientUsed).map(String))].filter((id) => presented.includes(id));

  return {
    authorized: [...authorized],
    applicable: [...applicableSet],
    presented,
    used,
    // Authorized, applicable to this question, and yet nothing rendered it.
    // This is the compliance signal: it means a tool could not honour a
    // support the student is entitled to, and somebody needs to know.
    authorizedButNotPresented: [...applicableSet].filter((id) => !presented.includes(id)),
    // A client claiming a support it was never granted. Recorded rather than
    // silently dropped, because it means either a bug or a tampered client.
    rejectedClaims: [...new Set([...list(clientPresented), ...list(clientUsed)].map(String))]
      .filter((id) => !authorized.has(id)),
  };
};

/**
 * Does using this support reduce the claim that the student did the
 * mathematics independently?
 *
 * Access supports: no. This is the rule the product brief is most explicit
 * about — do not classify an EB student using translation, or a student using
 * text-to-speech, as mathematically dependent.
 */
export const reducesMathematicalIndependence = (supportId) => (
  CONSTRUCT_AFFECTING_SUPPORTS.has(supportId)
);

export default resolveSupportEntitlements;
