import {
  normalizeQuestionRecord,
  resolveQuestionMaximumAttempts,
} from '../../attemptPolicy.js';
import { stableStringify } from '../../utils/idUtils.js';
import { getDomainRangeAcceptedAnswers } from '../../interactiveGraphEngine.js';
import { pathAnalysisTextMatches } from '../../../functions/shared/pathToolContracts.mjs';
import { analyzeSafeResponseEntryRepair } from '../../../functions/shared/liveResponseRepairPolicy.mjs';
import { readComposedQuestion } from '../workflow/questionWorkflow.js';
import { gradeWorkflow } from '../workflow/workflowGrading.js';

export const questionFingerprint = (question) => stableStringify(question ?? null);

export const analyzeResponseEntryRepair = (beforeQuestion = {}, afterQuestion = {}) => {
  const result = analyzeSafeResponseEntryRepair(beforeQuestion, afterQuestion);
  if (!result.safe) return result;
  return {
    ...result,
    questionId: beforeQuestion.questionId,
    beforeFingerprint: questionFingerprint(beforeQuestion),
  };
};

const compactRepairHistory = (history, entry) => [
  ...(Array.isArray(history) ? history : []),
  entry,
].slice(-20);

export const repairQuestionRecordForLiveCorrection = ({
  record,
  question,
  affectedFieldIds = [],
  correctedAt = new Date().toISOString(),
} = {}) => {
  if (!record || !affectedFieldIds.length) return record;
  const current = normalizeQuestionRecord(record);
  const hadActivity = Number(current.totalAttempts || current.attemptCount || 0) > 0
    || current.status === 'correct'
    || current.status === 'expired'
    || Number(current.bestPartialCredit || 0) > 0;
  if (!hadActivity || current.status === 'correct') return record;

  const affected = new Set(affectedFieldIds.map(String));
  let creditedFieldIds = [];
  const partGrades = current.partGrades.map((part) => {
    if (!affected.has(String(part.id)) || !part.isComplete || part.isCorrect) return part;
    creditedFieldIds.push(String(part.id));
    return {
      ...part,
      isCorrect: true,
      liveCorrectionCredit: true,
    };
  });

  const allPartsComplete = partGrades.length > 0 && partGrades.every((part) => part.isComplete);
  const allPartsCorrect = allPartsComplete && partGrades.every((part) => part.isCorrect);
  const recomputedPartPercent = partGrades.length
    ? Math.min(90, Math.round((partGrades.filter((part) => part.isComplete && part.isCorrect).length / partGrades.length) * 100))
    : 0;

  const maximumAttempts = resolveQuestionMaximumAttempts({ question });
  const needsRepairRetry = current.status === 'expired' || current.attemptCount >= maximumAttempts;
  const attemptCount = allPartsCorrect
    ? current.attemptCount
    : needsRepairRetry
      ? Math.max(0, maximumAttempts - 1)
      : current.attemptCount;
  const status = allPartsCorrect
    ? 'correct'
    : current.status === 'expired'
      ? 'attempted'
      : current.status;

  const bestPartialCredit = allPartsCorrect
    ? 100
    : Math.max(current.bestPartialCredit, recomputedPartPercent);
  const partialCredit = allPartsCorrect
    ? 100
    : Math.max(current.partialCredit, recomputedPartPercent);

  return {
    ...current,
    status,
    attemptCount,
    partialCredit,
    bestPartialCredit,
    partGrades,
    liveCorrectionHistory: compactRepairHistory(current.liveCorrectionHistory, {
      kind: 'response-entry-repair',
      questionId: question?.questionId || null,
      affectedFieldIds: affectedFieldIds.map(String),
      creditedFieldIds,
      correctedAt,
      preservedTotalAttempts: current.totalAttempts,
      grantedRepairRetry: !allPartsCorrect && needsRepairRetry,
    }),
  };
};

export const repairAssignmentTrackerForLiveCorrections = ({
  assignmentTracker = {},
  questions = [],
  repairs = [],
  correctedAt = new Date().toISOString(),
} = {}) => {
  const next = { ...(assignmentTracker || {}) };
  repairs.forEach((repair) => {
    const index = Number(repair?.questionIndex);
    if (!Number.isInteger(index) || index < 0 || index >= questions.length) return;
    const record = next[index];
    if (!record) return;
    next[index] = repairQuestionRecordForLiveCorrection({
      record,
      question: questions[index],
      affectedFieldIds: repair.affectedFieldIds || [],
      correctedAt,
    });
  });
  return next;
};



const parseStoredWorkflowResponses = (record = {}) => {
  const raw = String(record?.lastResponseKey || '').trim();
  if (!raw || (!raw.startsWith('{') && !raw.startsWith('['))) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Re-evaluate the LAST stored workflow response with the current fractional
 * rubric. This is intentionally monotonic: deploying a more granular rubric
 * can recognize work the old coarse rubric missed, but it can never take away
 * credit a student already earned.
 */
export const repairQuestionRecordForGranularWorkflowCredit = ({
  record,
  question,
  correctedAt = new Date().toISOString(),
} = {}) => {
  if (!record || !question) return record;
  const current = normalizeQuestionRecord(record);
  if (current.status === 'unattempted') return record;

  const composed = readComposedQuestion(question);
  if (!composed.composed || !composed.workflow.length) return record;
  const responses = parseStoredWorkflowResponses(current);
  if (!responses) return record;

  const evaluation = gradeWorkflow({
    stages: composed.workflow,
    responses,
    grading: composed.grading,
  });
  const evaluatedPartial = evaluation.isCorrect
    ? 100
    : Math.max(0, Math.min(90, Number(evaluation.partialCreditPercent) || 0));
  if (evaluatedPartial <= Number(current.bestPartialCredit || 0)) return record;

  const oldParts = new Map((current.partGrades || []).map((part) => [String(part.id), part]));
  const partGrades = (evaluation.parts || []).slice(0, 40).map((part, index) => ({
    id: String(part?.id ?? `part-${index + 1}`),
    label: String(part?.label || `Part ${index + 1}`),
    isComplete: Boolean(part?.isComplete),
    isCorrect: Boolean(part?.isCorrect),
    graded: part?.graded !== false,
    weight: Number.isFinite(Number(part?.weight)) && Number(part.weight) > 0 ? Number(part.weight) : 1,
    credit: Number.isFinite(Number(part?.credit))
      ? Math.max(0, Math.min(1, Number(part.credit)))
      : (part?.isCorrect ? 1 : 0),
    response: String(oldParts.get(String(part?.id))?.response ?? '').slice(0, 240),
    granularCreditRegraded: true,
  }));

  return {
    ...current,
    status: evaluation.isCorrect ? 'correct' : current.status,
    partialCredit: Math.max(Number(current.partialCredit || 0), evaluatedPartial),
    bestPartialCredit: Math.max(Number(current.bestPartialCredit || 0), evaluatedPartial),
    partGrades,
    partialCreditRegradeHistory: compactRepairHistory(current.partialCreditRegradeHistory, {
      kind: 'granular-workflow-credit-v1',
      questionId: question.questionId || null,
      previousBestPartialCredit: Number(current.bestPartialCredit || 0),
      newBestPartialCredit: Math.max(Number(current.bestPartialCredit || 0), evaluatedPartial),
      correctedAt,
      preservedTotalAttempts: current.totalAttempts,
    }),
  };
};

export const repairAssignmentTrackerForGranularWorkflowCredit = ({
  assignmentTracker = {},
  questions = [],
  questionIndices = [],
  correctedAt = new Date().toISOString(),
} = {}) => {
  let changed = false;
  const next = { ...(assignmentTracker || {}) };
  (Array.isArray(questionIndices) ? questionIndices : []).forEach((rawIndex) => {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= questions.length) return;
    const record = next[index];
    if (!record) return;
    const repaired = repairQuestionRecordForGranularWorkflowCredit({
      record,
      question: questions[index],
      correctedAt,
    });
    if (repaired !== record) {
      next[index] = repaired;
      changed = true;
    }
  });
  return changed ? next : assignmentTracker;
};

const currentGraderAnalysisRequests = (question = {}) => (
  Array.isArray(question.analysisRequests) ? question.analysisRequests : []
);

const acceptedAnswersForCurrentGrader = (question = {}, request = {}) => {
  const authored = [
    ...(Array.isArray(request.acceptedAnswers) ? request.acceptedAnswers : []),
    ...(Array.isArray(request.expected) ? request.expected : request.expected != null ? [request.expected] : []),
  ].filter((value) => value !== undefined && value !== null && String(value).trim() !== '');
  if (authored.length) return authored;

  if (!['domain', 'range'].includes(String(request.kind || ''))) return [];
  if (!question.functionSpec || typeof question.functionSpec !== 'object') return [];
  return getDomainRangeAcceptedAnswers(
    question.functionSpec,
    request.kind,
    request.notation || 'interval',
  );
};

/**
 * Repair a stored graph-analysis record after MathMaster's grader becomes more
 * mathematically permissive/correct.
 *
 * This is deliberately monotonic:
 * - a previously-correct part is never changed;
 * - a stored response is upgraded only if the CURRENT shared grader proves it
 *   correct against the CURRENT question;
 * - credit can increase but never decrease;
 * - total attempt history is preserved;
 * - if another part is still wrong after the repair, an exhausted student gets
 *   one usable retry instead of paying for the platform defect.
 *
 * Generated/variant questions are intentionally excluded because their old
 * instantiated function may differ from today's base authoring envelope.
 */
export const repairQuestionRecordForCurrentGrader = ({
  record,
  question,
  correctedAt = new Date().toISOString(),
} = {}) => {
  if (!record || !question || String(question.type || '') !== 'graphAnalysis') return record;
  if (question.generator || (Array.isArray(question.variants) && question.variants.length)) return record;

  const current = normalizeQuestionRecord(record);
  if (current.status === 'correct' || !Array.isArray(current.partGrades) || !current.partGrades.length) {
    return record;
  }

  const requestsById = new Map(
    currentGraderAnalysisRequests(question).map((request) => [String(request?.id || ''), request]),
  );
  const upgradedPartIds = [];

  const partGrades = current.partGrades.map((part) => {
    if (part?.isCorrect || !part?.isComplete || !String(part?.response || '').trim()) return part;
    const request = requestsById.get(String(part?.id || ''));
    if (!request || !['domain', 'range'].includes(String(request.kind || ''))) return part;

    const acceptedAnswers = acceptedAnswersForCurrentGrader(question, request);
    if (!acceptedAnswers.length) return part;

    const nowCorrect = pathAnalysisTextMatches(
      part.response,
      acceptedAnswers,
      {
        kind: request.kind,
        notation: request.notation || 'interval',
        tolerance: 1e-6,
      },
    );
    if (!nowCorrect) return part;

    upgradedPartIds.push(String(part.id));
    return {
      ...part,
      isCorrect: true,
      graderCorrectionCredit: true,
    };
  });

  if (!upgradedPartIds.length) return record;

  const allPartsComplete = partGrades.length > 0 && partGrades.every((part) => part.isComplete);
  const allPartsCorrect = allPartsComplete && partGrades.every((part) => part.isCorrect);
  const recomputedPartPercent = partGrades.length
    ? Math.min(
        90,
        Math.round(
          (partGrades.filter((part) => part.isComplete && part.isCorrect).length / partGrades.length) * 100,
        ),
      )
    : 0;

  const maximumAttempts = resolveQuestionMaximumAttempts({ question });
  const needsRepairRetry = current.status === 'expired' || current.attemptCount >= maximumAttempts;
  const attemptCount = allPartsCorrect
    ? current.attemptCount
    : needsRepairRetry
      ? Math.max(0, maximumAttempts - 1)
      : current.attemptCount;
  const status = allPartsCorrect
    ? 'correct'
    : current.status === 'expired'
      ? 'attempted'
      : current.status;
  const partialCredit = allPartsCorrect
    ? 100
    : Math.max(current.partialCredit, recomputedPartPercent);
  const bestPartialCredit = allPartsCorrect
    ? 100
    : Math.max(current.bestPartialCredit, recomputedPartPercent);

  return {
    ...current,
    status,
    attemptCount,
    partialCredit,
    bestPartialCredit,
    partGrades,
    graderCorrectionHistory: compactRepairHistory(current.graderCorrectionHistory, {
      kind: 'semantic-inequality-equivalence-v1',
      questionId: question.questionId || null,
      upgradedPartIds,
      correctedAt,
      preservedTotalAttempts: current.totalAttempts,
      grantedRepairRetry: !allPartsCorrect && needsRepairRetry,
    }),
  };
};

export const repairAssignmentTrackerForCurrentGrader = ({
  assignmentTracker = {},
  questions = [],
  correctedAt = new Date().toISOString(),
} = {}) => {
  let changed = false;
  const next = { ...(assignmentTracker || {}) };

  questions.forEach((question, index) => {
    const record = next[index];
    if (!record) return;
    const repaired = repairQuestionRecordForCurrentGrader({
      record,
      question,
      correctedAt,
    });
    if (repaired !== record) {
      next[index] = repaired;
      changed = true;
    }
  });

  return changed ? next : assignmentTracker;
};
