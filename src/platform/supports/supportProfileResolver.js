/*
 * Phase 4 — Student Support System.
 *
 * The distinction this file exists to protect:
 *   Accommodation  changes HOW a student accesses grade-level content.
 *                  Mastery thresholds and grade-level expectations are unchanged.
 *   Modification   changes WHAT the student is expected to learn, or lowers the
 *                  grade-level standard. Routes to the SPED modified-curriculum
 *                  report and is excluded from standard mastery aggregation.
 *
 * Adaptive branching and prerequisite diagnostics in My Math Path are
 * instructional remediation, NOT formal curriculum modification, and must never
 * set `modification.isModifiedCurriculum`.
 */

export const ACCOMMODATION_TYPES = {
  // Presentation
  TEXT_TO_SPEECH: 'textToSpeech',
  SPANISH_TRANSLATION: 'spanishTranslation',
  GLOSSARY_LOOKUP: 'glossaryLookup',
  HIGH_CONTRAST: 'highContrast',
  LARGE_FONT: 'largeFont',

  // Response / execution
  CALCULATOR_ALLOWED: 'calculatorAllowed',
  CALCULATOR_OVERRIDE_COMPUTATION: 'calculatorOverrideComputation',
  GRAPHIC_ORGANIZER: 'graphicOrganizer',
  REDUCED_ANSWER_CHOICES: 'reducedAnswerChoices',

  // Timing / pacing
  EXTENDED_TIME: 'extendedTime',
  EXTRA_ATTEMPTS: 'extraAttempts',
};

export const MODIFICATION_TYPES = {
  OFF_GRADE_TEKS: 'offGradeTeks',
  REDUCED_DOK_CAP: 'reducedDokCap',
  SIMPLIFIED_CONSTRUCT: 'simplifiedConstruct',
};

/** Normalizes a raw support record from a SIS / IEP export into a stable shape. */
export const normalizeStudentSupportProfile = (rawProfile = {}) => ({
  studentId: rawProfile.studentId || 'unknown',
  programEligibility: {
    sped: Boolean(rawProfile.programEligibility?.sped),
    section504: Boolean(rawProfile.programEligibility?.section504),
    emergentBilingual: Boolean(rawProfile.programEligibility?.emergentBilingual),
    ebLanguage: rawProfile.programEligibility?.ebLanguage || 'es',
  },
  accommodations: {
    textToSpeech: Boolean(rawProfile.accommodations?.textToSpeech),
    spanishTranslation: Boolean(rawProfile.accommodations?.spanishTranslation),
    glossaryLookup: Boolean(rawProfile.accommodations?.glossaryLookup),
    highContrast: Boolean(rawProfile.accommodations?.highContrast),
    calculator: Boolean(rawProfile.accommodations?.calculator),
    calculatorOverrideComputation: Boolean(rawProfile.accommodations?.calculatorOverrideComputation),
    graphicOrganizer: Boolean(rawProfile.accommodations?.graphicOrganizer),
    reducedChoices: Boolean(rawProfile.accommodations?.reducedChoices),
    // Clamped: a malformed import must not hand a student a 100x timer or a
    // multiplier below 1, which would take time away from them.
    extendedTimeMultiplier: Math.min(4, Math.max(1, Number(rawProfile.accommodations?.extendedTimeMultiplier) || 1)),
    extraAttempts: Math.min(10, Math.max(0, Number(rawProfile.accommodations?.extraAttempts) || 0)),
  },
  modification: {
    isModifiedCurriculum: Boolean(rawProfile.modification?.isModifiedCurriculum),
    modifiedTeksCode: rawProfile.modification?.modifiedTeksCode || null,
    maxDokCap: Number.isFinite(Number(rawProfile.modification?.maxDokCap))
      ? Math.min(4, Math.max(1, Number(rawProfile.modification.maxDokCap)))
      : null,
  },
  metadata: {
    updatedAt: rawProfile.metadata?.updatedAt || Date.now(),
    authorizedBy: rawProfile.metadata?.authorizedBy || 'System Import',
  },
});

/**
 * Resolves which supports actually apply to one question in one activity.
 *
 * The calculator rule is the load-bearing one: when the question's assessed
 * construct IS computation, a calculator would replace the very skill being
 * measured, so it is withheld unless the IEP explicitly authorizes the
 * override.
 */
export const resolveActiveSupports = ({ profile, questionSpec, activityRole } = {}) => {
  const normalized = normalizeStudentSupportProfile(profile);
  const applicable = [];

  if (normalized.accommodations.textToSpeech) {
    applicable.push({ type: ACCOMMODATION_TYPES.TEXT_TO_SPEECH, presented: true });
  }

  if (normalized.programEligibility.emergentBilingual && normalized.accommodations.spanishTranslation) {
    applicable.push({
      type: ACCOMMODATION_TYPES.SPANISH_TRANSLATION,
      language: normalized.programEligibility.ebLanguage,
      presented: true,
    });
  }

  if (normalized.accommodations.glossaryLookup) {
    applicable.push({ type: ACCOMMODATION_TYPES.GLOSSARY_LOOKUP, presented: true });
  }

  if (normalized.accommodations.calculator) {
    const isComputation = questionSpec?.assessedConstruct === 'computation';
    if (!isComputation || normalized.accommodations.calculatorOverrideComputation) {
      applicable.push({
        type: ACCOMMODATION_TYPES.CALCULATOR_ALLOWED,
        presented: true,
        overrodeComputationBlock: isComputation,
      });
    }
  }

  if (normalized.accommodations.graphicOrganizer && questionSpec?.context?.scenario) {
    applicable.push({ type: ACCOMMODATION_TYPES.GRAPHIC_ORGANIZER, presented: true });
  }

  if (normalized.accommodations.reducedChoices) {
    applicable.push({ type: ACCOMMODATION_TYPES.REDUCED_ANSWER_CHOICES, presented: true });
  }

  return {
    studentId: normalized.studentId,
    activityRole: activityRole || null,
    isModified: normalized.modification.isModifiedCurriculum,
    modifiedTeksCode: normalized.modification.modifiedTeksCode,
    applicableSupports: applicable,
    timeMultiplier: normalized.accommodations.extendedTimeMultiplier,
    extraAttempts: normalized.accommodations.extraAttempts,
  };
};
