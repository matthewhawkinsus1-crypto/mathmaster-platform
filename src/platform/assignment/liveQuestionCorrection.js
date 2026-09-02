import {
  normalizeQuestionRecord,
  resolveQuestionMaximumAttempts,
} from '../../attemptPolicy.js';
import { stableStringify } from '../../utils/idUtils.js';
import { getDomainRangeAcceptedAnswers } from '../../interactiveGraphEngine.js';
import { pathAnalysisTextMatches } from '../../../functions/shared/pathToolContracts.mjs';

const CHOICE_PROFILES = new Set(['choice', 'multiplechoice', 'multiple-choice', 'select']);

const normalizeText = (value) => String(value ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const answerCandidates = (field = {}) => [
  ...(field.answer !== undefined && field.answer !== null ? [field.answer] : []),
  ...(Array.isArray(field.acceptedAnswers) ? field.acceptedAnswers : []),
].map((value) => String(value ?? '').trim()).filter(Boolean);

const isChoiceField = (field = {}) => {
  const profile = String(field.inputProfile ?? field.inputMode ?? field.type ?? '').trim().toLowerCase();
  return CHOICE_PROFILES.has(profile) || (Array.isArray(field.options) && field.options.length > 1);
};

const looksLikePlainLanguage = (value) => {
  const text = String(value ?? '').trim();
  return Boolean(text) && /[A-Za-z]/.test(text) && !/[=<>≤≥≠+*/^()[\]{}\\∞π√∪∩]/.test(text);
};

const RESPONSE_ENTRY_KEYS = new Set([
  'acceptedAnswers',
  'answer',
  'options',
  'type',
  'inputProfile',
  'inputMode',
  'answerFormat',
  'requiredSymbols',
  'inputContract',
  'toolProfile',
  'notation',
  'placeholder',
  'presentation',
]);

const withoutKeys = (value = {}, keys = new Set()) => Object.fromEntries(
  Object.entries(value).filter(([key]) => !keys.has(key)),
);

export const questionFingerprint = (question) => stableStringify(question ?? null);

const sameOutsideAnswerFields = (before = {}, after = {}) => {
  const strip = (question) => {
    const copy = { ...question };
    delete copy.answerFields;
    return copy;
  };
  return stableStringify(strip(before)) === stableStringify(strip(after));
};

const WORKFLOW_WORD_CHOICE_REPAIRS = Object.freeze([
  { choiceKey: 'domainWordsChoices', correctKey: 'correctDomainWords', stageId: 'domainWords', askKey: 'domainWords' },
  { choiceKey: 'rangeWordsChoices', correctKey: 'correctRangeWords', stageId: 'rangeWords', askKey: 'rangeWords' },
]);

const workflowAsk = (question = {}) => (
  Array.isArray(question?.recipe?.ask) ? question.recipe.ask.map(String) : []
);

const analyzeWorkflowWordChoiceRepair = (before = {}, after = {}) => {
  if (String(before?.type || '') !== 'relationshipModel' || String(after?.type || '') !== 'relationshipModel') {
    return null;
  }

  const changed = WORKFLOW_WORD_CHOICE_REPAIRS.filter(({ choiceKey }) => (
    stableStringify(before?.[choiceKey] ?? null) !== stableStringify(after?.[choiceKey] ?? null)
  ));
  if (!changed.length) return null;

  const stripChoiceKeys = (question) => {
    const copy = { ...question };
    WORKFLOW_WORD_CHOICE_REPAIRS.forEach(({ choiceKey }) => { delete copy[choiceKey]; });
    return copy;
  };
  if (stableStringify(stripChoiceKeys(before)) !== stableStringify(stripChoiceKeys(after))) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'A workflow live repair may only add controlled choices to existing domain/range wording stages. The mathematical task and all other fields must stay unchanged.',
    };
  }

  const ask = new Set(workflowAsk(before));
  const affectedFieldIds = [];
  for (const config of changed) {
    if (!ask.has(config.askKey)) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `Workflow stage “${config.stageId}” is not part of this live question, so choices cannot be added for it.`,
      };
    }

    const beforeChoices = Array.isArray(before?.[config.choiceKey])
      ? before[config.choiceKey].map((value) => String(value ?? '').trim()).filter(Boolean)
      : [];
    if (beforeChoices.length) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `Workflow stage “${config.stageId}” already had finite choices; a live repair cannot rewrite those choices after student activity begins.`,
      };
    }

    const oldCandidates = Array.isArray(before?.[config.correctKey])
      ? before[config.correctKey].map((value) => String(value ?? '').trim()).filter(Boolean)
      : [];
    if (!oldCandidates.length || !oldCandidates.every(looksLikePlainLanguage)) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `Workflow stage “${config.stageId}” is not a keyed plain-language response, so MathMaster will not convert it live.`,
      };
    }

    const options = Array.isArray(after?.[config.choiceKey])
      ? after[config.choiceKey].map((value) => String(value ?? '').trim()).filter(Boolean)
      : [];
    if (options.length < 2) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `Workflow stage “${config.stageId}” needs at least two finite choices.`,
      };
    }

    const oldNormalized = new Set(oldCandidates.map(normalizeText));
    const oldCorrectOptions = options.filter((option) => oldNormalized.has(normalizeText(option)));
    if (oldCorrectOptions.length !== 1) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `Workflow stage “${config.stageId}” must contain exactly one previously accepted correct wording among its choices.`,
      };
    }
    affectedFieldIds.push(config.stageId);
  }

  return {
    safe: true,
    affectedFieldIds,
    questionId: before.questionId,
    beforeFingerprint: questionFingerprint(before),
  };
};

const safeFieldConversion = (before = {}, after = {}) => {
  if (String(before.id || '') !== String(after.id || '')) {
    return { safe: false, reason: 'Answer-field IDs cannot change after students begin work.' };
  }
  if (stableStringify(before) === stableStringify(after)) {
    return { safe: true, changed: false };
  }

  if (isChoiceField(before)) {
    return { safe: false, reason: `Field “${before.label || before.id}” is already a choice field; live repair cannot rewrite its answer meaning.` };
  }
  if (!isChoiceField(after)) {
    return { safe: false, reason: `Field “${before.label || before.id}” must be converted to a finite choice response for a safe live repair.` };
  }

  const oldCandidates = answerCandidates(before);
  if (!oldCandidates.length || !oldCandidates.every(looksLikePlainLanguage)) {
    return { safe: false, reason: `Field “${before.label || before.id}” is not a plain-language keyed response, so MathMaster will not rewrite it after student activity begins.` };
  }

  const beforeMeaning = withoutKeys(before, RESPONSE_ENTRY_KEYS);
  const afterMeaning = withoutKeys(after, RESPONSE_ENTRY_KEYS);
  if (stableStringify(beforeMeaning) !== stableStringify(afterMeaning)) {
    return { safe: false, reason: `Field “${before.label || before.id}” changed more than its response-entry controls.` };
  }

  const options = Array.isArray(after.options)
    ? after.options.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];
  const answer = String(after.answer ?? '').trim();
  if (options.length < 2 || !answer) {
    return { safe: false, reason: `Field “${before.label || before.id}” needs at least two choices and one keyed correct choice.` };
  }

  const oldNormalized = new Set(oldCandidates.map(normalizeText));
  if (!oldNormalized.has(normalizeText(answer))) {
    return { safe: false, reason: `Field “${before.label || before.id}” changed the keyed mathematical meaning instead of only changing how students respond.` };
  }
  if (!options.some((option) => normalizeText(option) === normalizeText(answer))) {
    return { safe: false, reason: `Field “${before.label || before.id}” does not include its keyed answer among the choices.` };
  }

  const oldCorrectOptions = options.filter((option) => oldNormalized.has(normalizeText(option)));
  if (oldCorrectOptions.length !== 1) {
    return {
      safe: false,
      reason: `Field “${before.label || before.id}” must contain exactly one of the previously accepted correct wordings so students do not see multiple correct choices.`,
    };
  }

  return { safe: true, changed: true };
};

export const analyzeResponseEntryRepair = (beforeQuestion = {}, afterQuestion = {}) => {
  if (!beforeQuestion?.questionId || beforeQuestion.questionId !== afterQuestion?.questionId) {
    return { safe: false, affectedFieldIds: [], reason: 'The question ID must stay exactly the same.' };
  }

  const workflowRepair = analyzeWorkflowWordChoiceRepair(beforeQuestion, afterQuestion);
  if (workflowRepair) return workflowRepair;

  if (!sameOutsideAnswerFields(beforeQuestion, afterQuestion)) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'A live repair may change response-entry fields only. Prompt, graph/table, standards, tool type, order, and mathematical task must stay unchanged.',
    };
  }

  const beforeFields = Array.isArray(beforeQuestion.answerFields) ? beforeQuestion.answerFields : [];
  const afterFields = Array.isArray(afterQuestion.answerFields) ? afterQuestion.answerFields : [];
  if (!beforeFields.length || beforeFields.length !== afterFields.length) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'A live repair cannot add, remove, or reorder answer fields on a question students already received.',
    };
  }

  const affectedFieldIds = [];
  for (let index = 0; index < beforeFields.length; index += 1) {
    const result = safeFieldConversion(beforeFields[index], afterFields[index]);
    if (!result.safe) return { safe: false, affectedFieldIds: [], reason: result.reason };
    if (result.changed) affectedFieldIds.push(String(beforeFields[index].id));
  }

  if (!affectedFieldIds.length) {
    return { safe: false, affectedFieldIds: [], reason: 'No eligible plain-language response field was converted to a choice.' };
  }

  return {
    safe: true,
    affectedFieldIds,
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
