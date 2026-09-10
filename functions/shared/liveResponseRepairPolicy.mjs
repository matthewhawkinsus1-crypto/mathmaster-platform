const CHOICE_PROFILES = new Set(['choice', 'multiplechoice', 'multiple-choice', 'select']);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};
const stableStringify = (value) => JSON.stringify(canonicalize(value));

const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

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
  'acceptedAnswers', 'answer', 'options', 'type', 'inputProfile', 'inputMode',
  'answerFormat', 'requiredSymbols', 'inputContract', 'toolProfile', 'notation',
  'placeholder', 'presentation',
]);

const withoutKeys = (value = {}, keys = new Set()) => Object.fromEntries(
  Object.entries(value).filter(([key]) => !keys.has(key)),
);

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

const workflowAsk = (question = {}) => {
  const recipeAsk = Array.isArray(question?.recipe?.ask) ? question.recipe.ask : [];
  const topLevelAsk = Array.isArray(question?.ask) ? question.ask : [];
  return (recipeAsk.length ? recipeAsk : topLevelAsk).map(String);
};

const isFunctionModelingQuestion = (question = {}) => {
  const type = String(question?.type || '').trim();
  const recipeName = typeof question?.recipe === 'string'
    ? question.recipe
    : String(question?.recipe?.name || question?.recipe?.recipe || '').trim();
  return type === 'relationshipModel' || recipeName === 'functionModeling';
};

const analyzeWorkflowWordChoiceRepair = (before = {}, after = {}) => {
  const changed = WORKFLOW_WORD_CHOICE_REPAIRS.filter(({ choiceKey }) => (
    stableStringify(before?.[choiceKey] ?? null) !== stableStringify(after?.[choiceKey] ?? null)
  ));
  if (!changed.length) return null;

  if (!isFunctionModelingQuestion(before) || !isFunctionModelingQuestion(after)) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'This repair changes workflow domain/range wording choices, but the live question is not a function-modeling relationship question.',
    };
  }

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

  return { safe: true, affectedFieldIds };
};

const safeFieldConversion = (before = {}, after = {}) => {
  if (String(before.id || '') !== String(after.id || '')) {
    return { safe: false, reason: 'Answer-field IDs cannot change after students begin work.' };
  }
  if (stableStringify(before) === stableStringify(after)) return { safe: true, changed: false };

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

  if (stableStringify(withoutKeys(before, RESPONSE_ENTRY_KEYS)) !== stableStringify(withoutKeys(after, RESPONSE_ENTRY_KEYS))) {
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

export const analyzeSafeResponseEntryRepair = (beforeQuestion = {}, afterQuestion = {}) => {
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

  return { safe: true, affectedFieldIds };
};
