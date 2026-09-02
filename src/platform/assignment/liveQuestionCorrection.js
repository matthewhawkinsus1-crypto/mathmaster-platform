import {
  normalizeQuestionRecord,
  resolveQuestionMaximumAttempts,
} from '../../attemptPolicy.js';
import { stableStringify } from '../../utils/idUtils.js';

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
