export const MAX_ATTEMPTS_PER_QUESTION = 3;
const MAX_STORED_STEP_GRADES = 80;

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
    modified: false, accommodations: [], modifications: [],
    scaffoldUsed: false, hintUsed: false, contextScaffoldUsed: false,
    calculatorUsed: false, isMathematicallyIndependent: true,
  },
});

const clampPercent = (value) =>
  Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

/**
 * Separates *access* support from *mathematical* support on an attempt.
 *
 * A calculator or a context/word-problem scaffold changes how a student reaches
 * the mathematics; it does not do the mathematics for them, so an attempt using
 * them is still independent evidence of the skill. A hint or a step scaffold
 * does supply mathematical reasoning, so it is not. `isMathematicallyIndependent`
 * is what mastery weighting reads, which keeps an accommodation from silently
 * depressing a student's mastery score the way a modification would.
 */
const deriveAssistanceFlags = (supportUsage = {}) => {
  const scaffoldUsed = Boolean(supportUsage?.scaffoldUsed);
  const hintUsed = Boolean(supportUsage?.hintUsed);
  return {
    scaffoldUsed,
    hintUsed,
    contextScaffoldUsed: Boolean(supportUsage?.contextScaffoldUsed),
    calculatorUsed: Boolean(supportUsage?.calculatorUsed),
    isMathematicallyIndependent: !scaffoldUsed && !hintUsed,
  };
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
    partialCredit: clampPercent(record.partialCredit),
    bestPartialCredit: clampPercent(
      record.bestPartialCredit ?? record.partialCredit,
    ),
    algebraState: record.algebraState || null,
    partGrades: Array.isArray(record.partGrades) ? record.partGrades.slice(0, 40) : [],
    supportUsage: {
      modified: Boolean(record.supportUsage?.modified),
      accommodations: Array.isArray(record.supportUsage?.accommodations) ? record.supportUsage.accommodations.slice(0, 20) : [],
      modifications: Array.isArray(record.supportUsage?.modifications) ? record.supportUsage.modifications.slice(0, 20) : [],
      ...deriveAssistanceFlags(record.supportUsage),
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

const calculateVariantPartialCredit = (stepGrades, variantIndex) => {
  const currentSteps = stepGrades.filter(
    (step) => Number(step.variantIndex) === Number(variantIndex),
  );
  const earned = currentSteps.reduce(
    (total, step) => total + Math.max(0, Number(step.earned) || 0),
    0,
  );
  const recordedPossible = currentSteps.reduce(
    (total, step) => total + Math.max(0, Number(step.possible) || 0),
    0,
  );
  const expectedTotal = currentSteps.reduce(
    (maximum, step) =>
      Math.max(maximum, Math.max(0, Number(step.expectedTotalPoints) || 0)),
    0,
  );
  const possible = Math.max(recordedPossible, expectedTotal);
  const rawPercent = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  return Math.min(90, rawPercent);
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
  const partialCredit = calculateVariantPartialCredit(
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
    supportUsage: supportUsage ? {
      modified: Boolean(supportUsage.modified),
      accommodations: Array.isArray(supportUsage.accommodations) ? supportUsage.accommodations.slice(0, 20) : [],
      modifications: Array.isArray(supportUsage.modifications) ? supportUsage.modifications.slice(0, 20) : [],
      ...deriveAssistanceFlags(supportUsage),
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
    ? parts.slice(0, 40).map((part, index) => ({
        id: String(part?.id ?? `part-${index + 1}`),
        label: String(part?.label || `Part ${index + 1}`),
        isComplete: Boolean(part?.isComplete),
        isCorrect: Boolean(part?.isCorrect),
        response: String(part?.response ?? '').slice(0, 240),
      }))
    : [];
  const completedParts = compactParts.filter((part) => part.isComplete);
  const correctParts = completedParts.filter((part) => part.isCorrect);
  const earnedPartPercent = compactParts.length
    ? Math.min(90, Math.round((correctParts.length / compactParts.length) * 100))
    : 0;
  const attemptCount = Math.min(maximumAttempts, current.attemptCount + 1);
  const expired = !isCorrect && attemptCount >= maximumAttempts;
  const status = isCorrect ? 'correct' : expired ? 'expired' : 'attempted';
  // The Batch A-D tools grade themselves and report one score, so they can pass
  // `partialCreditPercent` directly instead of synthesising fake response parts
  // just to make the parts-based percentage come out right.
  const toolReportedPercent = Number.isFinite(Number(partialCreditPercent))
    ? clampPercent(partialCreditPercent)
    : null;
  const partialCredit = isCorrect
    ? 100
    : Math.max(current.partialCredit, toolReportedPercent ?? earnedPartPercent);
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
      ...deriveAssistanceFlags(supportUsage),
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
      label: percent >= 50 ? `${percent}% · Almost` : 'Incorrect · Try again',
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
