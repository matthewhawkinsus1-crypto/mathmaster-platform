import { getQuestionPrimaryTeksCodes, normalizeQuestionDifficulty } from './questionMetadata.js';
import { getTexasStandard, getTexasVerticalAlignment, getTexasVerticalPath } from './texasStandards.js';

const clampBand = (value) => Math.max(1, Math.min(5, Number(value) || 3));

export const resolveAdaptiveTargetBand = (question, studentProfile) => {
  const adaptive = studentProfile?.adaptiveInstruction;
  if (!adaptive) return normalizeQuestionDifficulty(question).generatorBand;
  const primaryCodes = getQuestionPrimaryTeksCodes(question);
  for (const code of primaryCodes) {
    const band = adaptive?.byTeks?.[code]?.generatorBand;
    if (band) return clampBand(band);
  }
  return clampBand(adaptive.generatorBand || normalizeQuestionDifficulty(question).generatorBand);
};

const nearestProfileKey = (profiles, targetBand) => {
  const keys = Object.keys(profiles || {}).map(Number).filter((value) => Number.isInteger(value) && value >= 1 && value <= 5);
  if (!keys.length) return null;
  return keys.sort((a, b) => Math.abs(a - targetBand) - Math.abs(b - targetBand) || a - b)[0];
};

const mergeQuestionOverride = (question, override) => {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return question;
  return {
    ...question,
    ...override,
    generator: override.generator ? { ...(question.generator || {}), ...override.generator } : question.generator,
    graph: override.graph ? { ...(question.graph || {}), ...override.graph } : question.graph,
    difficulty: override.difficulty ? { ...(question.difficulty || {}), ...override.difficulty } : question.difficulty,
    differentiation: question.differentiation,
  };
};

/**
 * ONE BAND DECISION, NOT TWO.
 *
 * `targetBandOverride` lets the assignment adaptation layer decide the band —
 * role-aware, bounded by the author's envelope, and with a reason a teacher can
 * read — while this function keeps doing the thing only it can do: render that
 * band using the author's own per-band content.
 *
 * Without an override the behaviour is byte-identical to before, so every
 * existing assignment and every existing test sees exactly what it always saw.
 */
export const applyAdaptiveDifferentiation = (question, studentProfile, { targetBandOverride = null } = {}) => {
  if (!question) return { question, targetBand: 3, applied: false };
  const mode = ['off', 'recommend', 'auto'].includes(question?.differentiation?.mode)
    ? question.differentiation.mode
    : 'recommend';
  const targetBand = Number.isFinite(Number(targetBandOverride))
    ? clampBand(targetBandOverride)
    : resolveAdaptiveTargetBand(question, studentProfile);
  const baseBand = normalizeQuestionDifficulty(question).generatorBand;

  if (mode !== 'auto') {
    return {
      question: {
        ...question,
        adaptiveMeta: {
          mode,
          targetBand,
          baseBand,
          applied: false,
        },
      },
      targetBand,
      applied: false,
    };
  }

  const profiles = question?.differentiation?.bandProfiles;
  const profileKey = nearestProfileKey(profiles, targetBand);
  const profile = profileKey == null ? null : profiles[String(profileKey)] || profiles[profileKey];
  const merged = mergeQuestionOverride(question, profile);

  return {
    question: {
      ...merged,
      adaptiveTargetBand: targetBand,
      adaptiveMeta: {
        mode,
        targetBand,
        baseBand,
        applied: Boolean(profile),
        appliedBandProfile: profileKey,
      },
    },
    targetBand,
    applied: Boolean(profile),
  };
};

export const chooseVariantsForAdaptiveBand = (variants, targetBand) => {
  if (!Array.isArray(variants) || !variants.length) return [];
  const tagged = variants.map((variant) => ({
    variant,
    band: Number(variant?.difficulty?.generatorBand ?? variant?.generatorBand),
  })).filter((item) => Number.isInteger(item.band) && item.band >= 1 && item.band <= 5);
  if (!tagged.length) return variants;
  const distance = Math.min(...tagged.map((item) => Math.abs(item.band - targetBand)));
  return tagged.filter((item) => Math.abs(item.band - targetBand) === distance).map((item) => item.variant);
};


// Build a transparent prior-course support plan without replacing the grade-level
// target. MathMaster only recommends vertical remediation after actual evidence of
// struggle; insufficient evidence stays at the current course/grade-level target.
export const resolvePrerequisiteSupportPath = (question, studentProfile) => {
  const targetTeks = getQuestionPrimaryTeksCodes(question);
  const targets = targetTeks.map((code) => getTexasStandard(code)).filter(Boolean);
  const needsSupport = targetTeks.filter((code) => {
    const key = studentProfile?.teks?.[code]?.performance?.key
      || studentProfile?.adaptiveInstruction?.byTeks?.[code]?.performanceLevel
      || 'insufficient';
    return key === 'didNotMeet' || key === 'approaches';
  });

  const supportStandards = [];
  const verticalPaths = needsSupport.map((code) => {
    getTexasVerticalAlignment(code).prior.forEach((standard) => {
      if (!supportStandards.some((item) => item.code === standard.code)) supportStandards.push(standard);
    });
    return {
      targetCode: code,
      levels: getTexasVerticalPath(code, { direction: 'prior', maxDepth: 4 }),
    };
  });

  return {
    targetTeks,
    targetCourseIds: [...new Set(targets.map((standard) => standard.courseId).filter(Boolean))],
    needsSupport,
    // Immediate prior-course standards are the only automatic/recommended first
    // intervention step. Deeper levels are exposed as a roadmap and should only
    // be used after evidence shows the immediate prerequisite is also weak.
    supportTeks: supportStandards.map((standard) => standard.code),
    supportCourseIds: [...new Set(supportStandards.map((standard) => standard.courseId).filter(Boolean))],
    supportStandards,
    verticalPaths,
    reason: supportStandards.length
      ? 'Prior-course TEKS are recommended as the first prerequisite-support step. Deeper grade-level links are available as a transparent roadmap, but the current-course TEKS remain the instructional target.'
      : 'No prior-course support is currently recommended from available mastery evidence.',
  };
};
