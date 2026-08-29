import { FRAMEWORK_LABELS } from './assessmentCrosswalk.js';

// CCMR Fidelity V2
// ----------------
// The assessment layer now has an explicit progression model. "Strong" is no
// longer the end of the story: once a student demonstrates the direct format,
// the next visit is a harder challenge. After a challenge is passed the skill
// cools down instead of occupying recommendation space forever.

export const CCMR_STAGE = Object.freeze({
  NEW: 'new',
  BUILDING: 'building',
  CHALLENGE_READY: 'challenge_ready',
  ADVANCED_CHALLENGE: 'advanced_challenge',
  MAINTENANCE: 'maintenance',
});

export const CHALLENGE_TIER = Object.freeze({
  DIRECT: 1,
  CHALLENGE: 2,
  ADVANCED: 3,
});

export const CHALLENGE_TIER_LABELS = Object.freeze({
  [CHALLENGE_TIER.DIRECT]: 'Direct practice',
  [CHALLENGE_TIER.CHALLENGE]: 'Harder challenge',
  [CHALLENGE_TIER.ADVANCED]: 'Advanced challenge',
});

export const FRAMEWORK_EXPERIENCE = Object.freeze({
  digitalSAT: Object.freeze({
    shortLabel: 'DIGITAL SAT',
    responseSummary: '4-choice multiple choice or student-produced response',
    calculatorSummary: 'Desmos graphing calculator available',
    pacingSummary: 'About 95 seconds per question on the real test',
    fidelityNote: 'Questions are written to the College Board Math domain and skill, with SAT response-format and context rules.',
  }),
  act: Object.freeze({
    shortLabel: 'ACT MATH',
    responseSummary: '4-choice multiple choice',
    calculatorSummary: 'Permitted calculator; no formula sheet',
    pacingSummary: 'Designed for ACT pacing and efficient solution paths',
    fidelityNote: 'Questions are tied to ACT Mathematics College & Career Readiness Standards when an official CCRS code applies.',
  }),
  tsia2: Object.freeze({
    shortLabel: 'TSIA2 MATH',
    responseSummary: 'Placement-style multiple choice',
    calculatorSummary: 'Item-level/basic calculator only when permitted',
    pacingSummary: 'Untimed placement reasoning',
    fidelityNote: 'Questions are written to the TSIA2 Mathematics Test Specifications and emphasize placement-level reasoning.',
  }),
  asvab: Object.freeze({
    shortLabel: 'ASVAB MATH',
    responseSummary: '4-choice multiple choice',
    calculatorSummary: 'No calculator',
    pacingSummary: 'AR word-problem reasoning or MK direct mathematics',
    fidelityNote: 'Questions distinguish Arithmetic Reasoning (AR) from Mathematics Knowledge (MK) and are solvable without a calculator.',
  }),
});

const pct = (correct, attempts) => attempts > 0 ? correct / attempts : null;

export const assessmentTierStats = (evidence = null) => {
  const attempts = evidence?.tierDirectItemsAttempted || {};
  const correct = evidence?.tierDirectItemsCorrect || {};
  const passes = evidence?.tierSessionsPassed || {};
  return {
    tier1: {
      attempts: Number(attempts[1] || attempts['1'] || 0),
      correct: Number(correct[1] || correct['1'] || 0),
      accuracy: pct(Number(correct[1] || correct['1'] || 0), Number(attempts[1] || attempts['1'] || 0)),
      passes: Number(passes[1] || passes['1'] || 0),
    },
    tier2: {
      attempts: Number(attempts[2] || attempts['2'] || 0),
      correct: Number(correct[2] || correct['2'] || 0),
      accuracy: pct(Number(correct[2] || correct['2'] || 0), Number(attempts[2] || attempts['2'] || 0)),
      passes: Number(passes[2] || passes['2'] || 0),
    },
    tier3: {
      attempts: Number(attempts[3] || attempts['3'] || 0),
      correct: Number(correct[3] || correct['3'] || 0),
      accuracy: pct(Number(correct[3] || correct['3'] || 0), Number(attempts[3] || attempts['3'] || 0)),
      passes: Number(passes[3] || passes['3'] || 0),
    },
  };
};

export const resolveAssessmentPracticeStage = (evidence = null) => {
  const directItems = Number(evidence?.directItemsAttempted || 0);
  const proficiency = evidence?.proficiency == null ? null : Number(evidence.proficiency);
  const tiers = assessmentTierStats(evidence);

  if (tiers.tier3.passes > 0) {
    return {
      stage: CCMR_STAGE.MAINTENANCE,
      nextTier: CHALLENGE_TIER.ADVANCED,
      completed: true,
      label: 'Challenge complete',
      actionLabel: 'Practice again (maintenance)',
      explanation: 'You have already passed direct practice and an advanced challenge. This skill stays available, but MathMaster will recommend other needs first.',
    };
  }
  if (tiers.tier2.passes > 0) {
    return {
      stage: CCMR_STAGE.ADVANCED_CHALLENGE,
      nextTier: CHALLENGE_TIER.ADVANCED,
      completed: false,
      label: 'Challenge passed',
      actionLabel: 'Take advanced challenge',
      explanation: 'You passed the harder set. One advanced set can confirm that this skill transfers under greater demand.',
    };
  }
  if (tiers.tier1.passes > 0 || (directItems >= 5 && proficiency != null && proficiency >= 0.8)) {
    return {
      stage: CCMR_STAGE.CHALLENGE_READY,
      nextTier: CHALLENGE_TIER.CHALLENGE,
      completed: false,
      label: 'Direct practice complete',
      actionLabel: 'Take a harder challenge',
      explanation: 'You have shown the direct assessment format. The next set raises the difficulty instead of repeating the same level.',
    };
  }
  if (directItems > 0) {
    return {
      stage: CCMR_STAGE.BUILDING,
      nextTier: CHALLENGE_TIER.DIRECT,
      completed: false,
      label: 'In progress',
      actionLabel: 'Continue assessment practice',
      explanation: 'Keep building direct evidence in this assessment format before the harder challenge opens.',
    };
  }
  return {
    stage: CCMR_STAGE.NEW,
    nextTier: CHALLENGE_TIER.DIRECT,
    completed: false,
    label: 'Not started',
    actionLabel: 'Start assessment practice',
    explanation: 'This is your first direct practice in this assessment format.',
  };
};

export const describeChallengeTier = (tier, framework = null) => {
  const frameworkName = FRAMEWORK_LABELS[framework] || 'CCMR';
  if (Number(tier) >= CHALLENGE_TIER.ADVANCED) {
    return {
      label: 'Advanced challenge',
      shortLabel: 'ADVANCED CHALLENGE',
      explanation: `This ${frameworkName} set uses the most demanding published families for this skill.`,
    };
  }
  if (Number(tier) === CHALLENGE_TIER.CHALLENGE) {
    return {
      label: 'Harder challenge',
      shortLabel: 'CHALLENGE',
      explanation: `You already demonstrated the direct ${frameworkName} format, so this set raises the demand instead of repeating it.`,
    };
  }
  return {
    label: 'Direct practice',
    shortLabel: 'DIRECT PRACTICE',
    explanation: `This set builds direct ${frameworkName} evidence for the skill.`,
  };
};

export const assessmentItemTypeLabel = (question = {}) => {
  const format = String(question?.assessmentItemFormat || '').toLowerCase();
  if (format === 'studentproducedresponse') return 'Student-produced response';
  if (format === 'multiplechoice') return '4-choice multiple choice';
  return question?.choices?.length ? `${question.choices.length}-choice multiple choice` : 'Constructed response';
};

export const frameworkExperience = (framework) => FRAMEWORK_EXPERIENCE[framework] || null;
