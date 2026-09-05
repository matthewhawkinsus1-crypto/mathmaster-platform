export const MAX_ATTEMPTS_PER_QUESTION = 3;
const MAX_STORED_STEP_GRADES = 80;

const SIMPLE_CHOICE_TYPES = new Set([
  'multianswer',
  'multiplechoice',
  'multiple-choice',
  'singlechoice',
  'single-choice',
  'choice',
  'numberline',
]);

const choiceProfile = (field = {}) => String(
  field?.inputProfile
  ?? field?.inputMode
  ?? field?.type
  ?? '',
).trim().toLowerCase();

const isChoiceField = (field = {}) => (
  ['choice', 'multiplechoice', 'multiple-choice', 'select'].includes(choiceProfile(field))
);

const isRenderedAssignmentChoiceField = (field = {}) => (
  isChoiceField(field)
  || (Array.isArray(field?.options) && field.options.length > 1)
);

/**
 * A pure finite-choice question gets one submission, regardless of section.
 *
 * This is deliberately narrow: mixed tasks such as "choose a classification,
 * then justify it" keep the section's normal instructional attempt policy.
 * Construction tools that happen to contain internal choices are not treated
 * as multiple-choice questions.
 */
export const isChoiceOnlyQuestion = (question = {}) => {
  const type = String(question?.type || question?.toolId || '').trim().toLowerCase();
  const pathQuestionType = String(question?.questionType || '').trim().toLowerCase();
  const fields = [
    ...(Array.isArray(question.answerFields) ? question.answerFields : []),
    ...(Array.isArray(question.responseFields) ? question.responseFields : []),
    ...(Array.isArray(question.responses) ? question.responses.filter((field) => field && typeof field === 'object' && !Array.isArray(field)) : []),
  ];

  // My Math Path's generic secure field payload is questionType:"response".
  // Treat it as finite choice only when EVERY response is explicitly a choice.
  if (pathQuestionType === 'response' && fields.length > 0) {
    return fields.every(isChoiceField);
  }

  if (!SIMPLE_CHOICE_TYPES.has(type)) return false;
  if (type === 'numberline') return Array.isArray(question?.choices) && question.choices.length > 1;
  if (type !== 'multianswer') return true;
  return fields.length > 0 && fields.every(isRenderedAssignmentChoiceField);
};

export const resolveQuestionMaximumAttempts = ({
  question = {},
  maximumAttempts = null,
  activityPolicy = null,
} = {}) => {
  const requested = Math.max(
    1,
    Number(maximumAttempts ?? activityPolicy?.attempts ?? MAX_ATTEMPTS_PER_QUESTION)
      || MAX_ATTEMPTS_PER_QUESTION,
  );
  return isChoiceOnlyQuestion(question) ? 1 : requested;
};

export const resolveQuestionReplacementAllowed = ({
  question = {},
  activityPolicy = null,
  canGenerateFresh = false,
} = {}) => {
  if (activityPolicy?.allowReplacement !== true) return false;
  if (!isChoiceOnlyQuestion(question)) return true;
  return Boolean(canGenerateFresh);
};

export const emptyQuestionRecord = () => ({
  status: 'unattempted',
  attemptCount: 0,
  totalAttempts: 0,
  variantIndex: 0,
  timeSpent: 0,
  lastAttemptAt: null,
  questionDetails: '',
  lastResponseKey: '',
  stepGrades: [],
  partialCredit: 0,
  bestPartialCredit: 0,
  algebraState: null,
  partGrades: [],
  supportUsage: {
    modified: false,
    accommodations: [],
    modifications: [],
    hintUsed: false,
    teacherAssisted: false,
    scaffoldUsed: false,
    contextScaffoldUsed: false,
    remediationUsed: false,
    workedExampleUsed: false,
    calculatorUsed: false,
    isMathematicallyIndependent: true,
  },
});

const clampPercent = (value) =>
  Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

const compactStepStateKey = (value) => String(value || '')
  .replace(/\s+/g, '')
  .replace(/[−–—]/g, '-');

export const calculateStepPartialCredit = (stepGrades = [], variantIndex = 0) => {
  const currentSteps = (Array.isArray(stepGrades) ? stepGrades : []).filter(
    (step) => Number(step?.variantIndex) === Number(variantIndex),
  );
  if (!currentSteps.length) return 0;

  // A step rubric has one planned denominator. Taking a longer but valid route
  // must not make already-earned credit shrink, so extra steps do not keep
  // inflating the denominator. Also prevent cycling through the same equation
  // states from farming partial credit.
  const expectedTotal = currentSteps.reduce(
    (maximum, step) => Math.max(maximum, Math.max(0, Number(step?.expectedTotalPoints) || 0)),
    0,
  );
  const visitedStates = new Set();
  const firstBefore = compactStepStateKey(currentSteps[0]?.equationBefore);
  if (firstBefore) visitedStates.add(firstBefore);

  let earned = 0;
  let fallbackPossible = 0;
  currentSteps.forEach((step) => {
    const afterKey = compactStepStateKey(step?.equationAfter);
    const acceptedProductive = step?.accepted !== false && step?.productive !== false;
    const newState = !afterKey || !visitedStates.has(afterKey);
    if (acceptedProductive && newState) {
      earned += Math.max(0, Number(step?.earned) || 0);
      fallbackPossible += Math.max(0, Number(step?.possible) || 0);
    }
    if (afterKey) visitedStates.add(afterKey);
  });

  const possible = expectedTotal > 0 ? expectedTotal : fallbackPossible;
  const rawPercent = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  // Full correctness still requires finishing the problem. Partial work can
  // earn substantial credit, but never impersonates a correct final solution.
  return Math.min(90, clampPercent(rawPercent));
};

export const normalizeQuestionRecord = (record) => {
  if (!record) return emptyQuestionRecord();
  if (typeof record === 'string') {
    return {
      ...emptyQuestionRecord(),
      status: record,
      attemptCount: record === 'incorrect' || record === 'attempted' ? 1 : 0,
    };
  }

  const legacyStatus = record.status || 'unattempted';
  const status = legacyStatus === 'incorrect' ? 'attempted' : legacyStatus;
  const attemptCount = Number.isFinite(Number(record.attemptCount))
    ? Math.max(0, Number(record.attemptCount))
    : status === 'attempted'
      ? 1
      : status === 'expired'
        ? MAX_ATTEMPTS_PER_QUESTION
        : 0;
  const stepGrades = Array.isArray(record.stepGrades)
    ? record.stepGrades.slice(-MAX_STORED_STEP_GRADES)
    : [];

  return {
    ...emptyQuestionRecord(),
    ...record,
    status,
    attemptCount,
    totalAttempts: Number.isFinite(Number(record.totalAttempts))
      ? Math.max(0, Number(record.totalAttempts))
      : attemptCount,
    variantIndex: Number.isFinite(Number(record.variantIndex))
      ? Math.max(0, Number(record.variantIndex))
      : 0,
    timeSpent: Number.isFinite(Number(record.timeSpent))
      ? Math.max(0, Number(record.timeSpent))
      : 0,
    lastAttemptAt: record.lastAttemptAt || record.recordedAt || null,
    stepGrades,
    partialCredit: Math.max(
      clampPercent(record.partialCredit),
      calculateStepPartialCredit(stepGrades, record.variantIndex ?? 0),
    ),
    bestPartialCredit: Math.max(
      clampPercent(record.bestPartialCredit ?? record.partialCredit),
      calculateStepPartialCredit(stepGrades, record.variantIndex ?? 0),
    ),
    stepCreditVersion: Math.max(0, Number(record.stepCreditVersion) || 0),
    algebraState: record.algebraState || null,
    partGrades: Array.isArray(record.partGrades) ? record.partGrades.slice(0, 40) : [],
    supportUsage: {
      modified: Boolean(record.supportUsage?.modified),
      accommodations: Array.isArray(record.supportUsage?.accommodations) ? record.supportUsage.accommodations.slice(0, 20) : [],
      modifications: Array.isArray(record.supportUsage?.modifications) ? record.supportUsage.modifications.slice(0, 20) : [],
      hintUsed: Boolean(record.supportUsage?.hintUsed),
      teacherAssisted: Boolean(record.supportUsage?.teacherAssisted),
      scaffoldUsed: Boolean(record.supportUsage?.scaffoldUsed),
      contextScaffoldUsed: Boolean(record.supportUsage?.contextScaffoldUsed),
      remediationUsed: Boolean(record.supportUsage?.remediationUsed),
      workedExampleUsed: Boolean(record.supportUsage?.workedExampleUsed),
      calculatorUsed: Boolean(record.supportUsage?.calculatorUsed),
      isMathematicallyIndependent: record.supportUsage?.isMathematicallyIndependent !== false
        && !record.supportUsage?.hintUsed
        && !record.supportUsage?.teacherAssisted
        && !record.supportUsage?.scaffoldUsed
        && !record.supportUsage?.remediationUsed
        && !record.supportUsage?.workedExampleUsed,
    },
  };
};

export const getAttemptsRemaining = (
  record,
  maximumAttempts = MAX_ATTEMPTS_PER_QUESTION,
) => {
  const normalized = normalizeQuestionRecord(record);
  return Math.max(0, maximumAttempts - normalized.attemptCount);
};

export const recordQuestionStep = ({
  record,
  stepGrade,
  countsAttempt = false,
  statePatch = {},
  supportUsage = null,
  maximumAttempts = MAX_ATTEMPTS_PER_QUESTION,
}) => {
  const current = normalizeQuestionRecord(record);

  if (current.status === 'correct' || current.status === 'expired') {
    return {
      record: current,
      result: {
        status: current.status,
        remainingAttempts: getAttemptsRemaining(current, maximumAttempts),
        expired: current.status === 'expired',
        partialCredit: current.partialCredit,
      },
    };
  }

  const compactStep = {
    variantIndex: current.variantIndex,
    stepNumber:
      current.stepGrades.filter(
        (step) => Number(step.variantIndex) === Number(current.variantIndex),
      ).length + 1,
    kind: stepGrade?.kind || 'algebra-step',
    label: String(stepGrade?.label || 'Algebra step'),
    mode: stepGrade?.mode || 'rigorous',
    productive: Boolean(stepGrade?.productive),
    accepted: stepGrade?.accepted !== false,
    earned: Math.max(0, Number(stepGrade?.earned) || 0),
    possible: Math.max(0, Number(stepGrade?.possible) || 0),
    equationBefore: String(stepGrade?.equationBefore || ''),
    equationAfter: String(stepGrade?.equationAfter || ''),
    expectedTotalPoints: Math.max(
      0,
      Number(stepGrade?.expectedTotalPoints) || 0,
    ),
    recordedAt: new Date().toISOString(),
  };
  const stepGrades = [...current.stepGrades, compactStep].slice(
    -MAX_STORED_STEP_GRADES,
  );
  const attemptCount = Math.min(
    maximumAttempts,
    current.attemptCount + (countsAttempt ? 1 : 0),
  );
  const expired = countsAttempt && attemptCount >= maximumAttempts;
  const partialCredit = calculateStepPartialCredit(
    stepGrades,
    current.variantIndex,
  );
  const nextRecord = {
    ...current,
    ...statePatch,
    status: expired ? 'expired' : 'attempted',
    attemptCount,
    totalAttempts: current.totalAttempts + (countsAttempt ? 1 : 0),
    stepGrades,
    partialCredit,
    bestPartialCredit: Math.max(current.bestPartialCredit, partialCredit),
    stepCreditVersion: 2,
    supportUsage: supportUsage ? {
      modified: Boolean(supportUsage.modified),
      accommodations: Array.isArray(supportUsage.accommodations) ? supportUsage.accommodations.slice(0, 20) : [],
      modifications: Array.isArray(supportUsage.modifications) ? supportUsage.modifications.slice(0, 20) : [],
      hintUsed: Boolean(supportUsage.hintUsed),
      teacherAssisted: Boolean(supportUsage.teacherAssisted),
      scaffoldUsed: Boolean(supportUsage.scaffoldUsed),
      contextScaffoldUsed: Boolean(supportUsage.contextScaffoldUsed),
      remediationUsed: Boolean(supportUsage.remediationUsed),
      workedExampleUsed: Boolean(supportUsage.workedExampleUsed),
      calculatorUsed: Boolean(supportUsage.calculatorUsed),
      isMathematicallyIndependent: supportUsage.isMathematicallyIndependent !== false
        && !supportUsage.hintUsed
        && !supportUsage.teacherAssisted
        && !supportUsage.scaffoldUsed
        && !supportUsage.remediationUsed
        && !supportUsage.workedExampleUsed,
    } : current.supportUsage,
    lastAttemptAt: new Date().toISOString(),
  };

  return {
    record: nextRecord,
    result: {
      status: nextRecord.status,
      remainingAttempts: Math.max(0, maximumAttempts - attemptCount),
      expired,
      partialCredit,
    },
  };
};

export const recordQuestionAttempt = ({
  record,
  isCorrect,
  questionDetails = '',
  timeSpent = 0,
  parts = [],
  supportUsage = null,
  responseKey = '',
  partialCreditPercent = null,
  maximumAttempts = MAX_ATTEMPTS_PER_QUESTION,
}) => {
  const current = normalizeQuestionRecord(record);

  if (current.status === 'correct') {
    return {
      record: current,
      result: {
        isCorrect: true,
        status: 'correct',
        attemptCount: current.attemptCount,
        remainingAttempts: getAttemptsRemaining(current, maximumAttempts),
        expired: false,
        partialCredit: 100,
      },
    };
  }

  if (current.status === 'expired') {
    return {
      record: current,
      result: {
        isCorrect: false,
        status: 'expired',
        attemptCount: current.attemptCount,
        remainingAttempts: 0,
        expired: true,
        partialCredit: current.partialCredit,
      },
    };
  }

  const compactParts = Array.isArray(parts)
    ? parts.slice(0, 40).map((part, index) => {
        const weight = Number.isFinite(Number(part?.weight ?? part?.scoreWeight))
          && Number(part?.weight ?? part?.scoreWeight) > 0
          ? Math.min(20, Number(part?.weight ?? part?.scoreWeight))
          : 1;
        const suppliedCredit = Number(part?.credit);
        const credit = Number.isFinite(suppliedCredit)
          ? Math.max(0, Math.min(1, suppliedCredit))
          : (part?.isCorrect ? 1 : 0);
        return {
          id: String(part?.id ?? `part-${index + 1}`),
          label: String(part?.label || `Part ${index + 1}`),
          isComplete: Boolean(part?.isComplete),
          isCorrect: Boolean(part?.isCorrect),
          graded: part?.graded !== false,
          weight,
          credit,
          response: String(part?.response ?? '').slice(0, 240),
        };
      })
    : [];
  const scorableParts = compactParts.filter((part) => part.graded !== false);
  const totalPartWeight = scorableParts.reduce((total, part) => total + part.weight, 0);
  const earnedPartWeight = scorableParts.reduce(
    (total, part) => total + (part.isComplete ? part.credit * part.weight : 0),
    0,
  );
  const earnedPartPercent = totalPartWeight > 0
    ? Math.min(90, Math.round((earnedPartWeight / totalPartWeight) * 100))
    : 0;
  const suppliedPartialPercent = partialCreditPercent === null || partialCreditPercent === undefined
    ? 0
    : Math.min(90, clampPercent(partialCreditPercent));
  const attemptCount = Math.min(maximumAttempts, current.attemptCount + 1);
  const expired = !isCorrect && attemptCount >= maximumAttempts;
  const status = isCorrect ? 'correct' : expired ? 'expired' : 'attempted';
  const partialCredit = isCorrect ? 100 : Math.max(current.partialCredit, earnedPartPercent, suppliedPartialPercent);
  const nextRecord = {
    ...current,
    status,
    attemptCount,
    totalAttempts: current.totalAttempts + 1,
    timeSpent: Math.max(current.timeSpent, Number(timeSpent) || 0),
    questionDetails,
    lastResponseKey: String(responseKey || ''),
    partGrades: compactParts,
    partialCredit,
    bestPartialCredit: Math.max(current.bestPartialCredit, partialCredit),
    supportUsage: supportUsage ? {
      modified: Boolean(supportUsage.modified),
      accommodations: Array.isArray(supportUsage.accommodations) ? supportUsage.accommodations.slice(0, 20) : [],
      modifications: Array.isArray(supportUsage.modifications) ? supportUsage.modifications.slice(0, 20) : [],
      hintUsed: Boolean(supportUsage.hintUsed),
      teacherAssisted: Boolean(supportUsage.teacherAssisted),
      scaffoldUsed: Boolean(supportUsage.scaffoldUsed),
      contextScaffoldUsed: Boolean(supportUsage.contextScaffoldUsed),
      remediationUsed: Boolean(supportUsage.remediationUsed),
      workedExampleUsed: Boolean(supportUsage.workedExampleUsed),
      calculatorUsed: Boolean(supportUsage.calculatorUsed),
      isMathematicallyIndependent: supportUsage.isMathematicallyIndependent !== false
        && !supportUsage.hintUsed
        && !supportUsage.teacherAssisted
        && !supportUsage.scaffoldUsed
        && !supportUsage.remediationUsed
        && !supportUsage.workedExampleUsed,
    } : current.supportUsage,
    lastAttemptAt: new Date().toISOString(),
  };

  return {
    record: nextRecord,
    result: {
      isCorrect: Boolean(isCorrect),
      status,
      attemptCount,
      remainingAttempts: Math.max(0, maximumAttempts - attemptCount),
      expired,
      partialCredit,
      partGrades: compactParts,
      incorrectParts: compactParts
        .filter((part) => part.isComplete && !part.isCorrect)
        .map((part) => part.label),
    },
  };
};

export const requestReplacementQuestion = (record, options = {}) => {
  const current = normalizeQuestionRecord(record);
  if (current.status !== 'expired') return current;

  return {
    ...current,
    status: 'unattempted',
    attemptCount: 0,
    variantIndex: current.variantIndex + 1,
    questionDetails: '',
    lastResponseKey: '',
    partialCredit: 0,
    bestPartialCredit: options.clearBest === true ? 0 : current.bestPartialCredit,
    totalAttempts: options.clearHistory === true ? 0 : current.totalAttempts,
    stepGrades: options.clearHistory === true ? [] : current.stepGrades,
    algebraState: null,
    partGrades: [],
  };
};

export const getQuestionCredit = (record) => {
  const normalized = normalizeQuestionRecord(record);
  if (normalized.status === 'correct') return 1;
  return clampPercent(normalized.bestPartialCredit) / 100;
};

export const getQuestionCardState = (record) => {
  const normalized = normalizeQuestionRecord(record);
  const remainingAttempts = getAttemptsRemaining(normalized);
  const credit = getQuestionCredit(normalized);

  if (normalized.status === 'correct') {
    return {
      background: '#188038',
      color: '#fff',
      label: 'Correct',
    };
  }
  if (normalized.status === 'expired') {
    const percent = Math.round(credit * 100);
    return {
      background: percent >= 50 ? '#fbbc04' : '#c5221f',
      color: percent >= 50 ? '#3c2f00' : '#fff',
      label: percent >= 50 ? `${percent}% · Almost` : 'Incorrect',
    };
  }
  if (normalized.status === 'attempted') {
    return {
      background: credit >= 0.5 ? '#fbbc04' : '#f9ab00',
      color: '#3c2f00',
      label: credit > 0
        ? `${Math.round(credit * 100)}% partial · ${remainingAttempts} left`
        : `${remainingAttempts} ${remainingAttempts === 1 ? 'try' : 'tries'} left`,
    };
  }

  return {
    background: '#fff',
    color: '#202124',
    label: 'Not attempted',
  };
};
