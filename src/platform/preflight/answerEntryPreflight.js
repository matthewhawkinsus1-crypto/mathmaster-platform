import {
  inferRequiredAnswerSymbols,
  resolveRequiredAnswerSymbols,
  unsupportedRequiredAnswerSymbols,
} from '../interaction/answerEntryTools.js';

const clean = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const MATH_SIGNAL = /[=<>≤≥≠+*/^()[\]{}\\∞π√∪∩∅]/;

const acceptedAnswersForField = (field = {}) => {
  if (Array.isArray(field.acceptedAnswers) && field.acceptedAnswers.length) return field.acceptedAnswers;
  if (field.expected !== undefined) return asArray(field.expected);
  if (field.expectedAnswer !== undefined) return asArray(field.expectedAnswer);
  if (field.answer !== undefined) return asArray(field.answer);
  if (field.correctAnswer !== undefined) return asArray(field.correctAnswer);
  return [];
};

const looksLikePlainLanguageAnswers = (answers = []) => {
  if (!answers.length) return false;
  return answers.every((value) => {
    const text = clean(value);
    if (!text || MATH_SIGNAL.test(text)) return false;
    return /[A-Za-z]/.test(text);
  });
};

const fieldKind = (field = {}) => {
  const type = clean(field.type || field.inputProfile || field.inputMode).toLowerCase();
  if (['choice', 'multiplechoice', 'multiple-choice', 'select', 'radio'].includes(type)) return 'choice';
  if (Array.isArray(field.options) && field.options.length) return 'choice';
  if (Array.isArray(field.choices) && field.choices.length) return 'choice';
  const answers = acceptedAnswersForField(field);
  if (['text', 'word', 'shortresponse', 'constructedresponse'].includes(type)) return 'text';
  if (field.inputMode === 'text') return 'text';
  if (!type && looksLikePlainLanguageAnswers(answers)) return 'text';
  return 'math';
};

const profileForField = (field = {}) => clean(
  field.toolProfile
  || field.inputProfile
  || field.inputContract?.profile
  || '',
).toLowerCase();

const formatForField = (field = {}) => clean(
  field.answerFormat
  || field.inputContract?.format
  || field.notation
  || field.inputMode
  || '',
);

const explicitRequiredSymbols = (field = {}) => [
  ...asArray(field.requiredSymbols),
  ...asArray(field.inputContract?.requiredSymbols),
].map(clean).filter(Boolean);

const fieldLabel = (field = {}, index = 0, collection = 'field') => (
  clean(field.label || field.id) || collection + '[' + index + ']'
);

const auditField = (field, { index, collection, label }) => {
  const errors = [];
  const warnings = [];
  if (!isObject(field)) return { errors: [label + ' ' + collection + '[' + index + '] must be an object.'], warnings };

  const answers = acceptedAnswersForField(field);
  const kind = fieldKind(field);
  const explicit = explicitRequiredSymbols(field);
  const unsupportedExplicit = unsupportedRequiredAnswerSymbols(explicit);
  const display = fieldLabel(field, index, collection);

  if (unsupportedExplicit.length) {
    errors.push(
      label + ' ' + collection + '[' + index + '] ("' + display + '") requires unsupported mobile answer symbol(s): '
      + unsupportedExplicit.join(', ')
      + '. Use a supported semantic answer format or a MathMaster interaction that can enter this notation.'
    );
  }

  if (kind === 'choice') return { errors, warnings };

  const inferred = inferRequiredAnswerSymbols(answers);
  if (kind === 'text') {
    const mathematical = inferred.filter((symbol) => !/^[A-Za-z]$/.test(symbol));
    if (mathematical.length) {
      errors.push(
        label + ' ' + collection + '[' + index + '] ("' + display + '") expects mathematical notation (
        + mathematical.join(', ')
        + ') but is configured as a plain text response. Use a mathematical input profile/answerFormat or explicit choice field.'
      );
    }
    return { errors, warnings };
  }

  const required = resolveRequiredAnswerSymbols({
    answerFormat: formatForField(field),
    toolProfile: profileForField(field),
    requiredSymbols: explicit,
    expectedAnswers: answers,
  });
  const unsupported = unsupportedRequiredAnswerSymbols(required);
  if (unsupported.length) {
    errors.push(
      label + ' ' + collection + '[' + index + '] ("' + display + '") cannot be entered with MathMaster mobile controls. '
      + 'Required but unsupported: ' + unsupported.join(', ') + '.'
    );
  }

  return { errors, warnings };
};

export const auditQuestionAnswerEntry = (question = {}, { label = 'Question' } = {}) => {
  const errors = [];
  const warnings = [];
  if (!isObject(question)) return { errors, warnings };

  const collections = [
    ['answerFields', Array.isArray(question.answerFields) ? question.answerFields : []],
    ['responseFields', Array.isArray(question.responseFields) ? question.responseFields : []],
  ];

  collections.forEach(([collection, fields]) => {
    fields.forEach((field, index) => {
      const result = auditField(field, { index, collection, label });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    });
  });

  const questionExplicit = [
    ...asArray(question.requiredSymbols),
    ...asArray(question.inputContract?.requiredSymbols),
  ].map(clean).filter(Boolean);
  const unsupportedQuestionSymbols = unsupportedRequiredAnswerSymbols(questionExplicit);
  if (unsupportedQuestionSymbols.length) {
    errors.push(
      label + ' requires unsupported mobile answer symbol(s): '
      + unsupportedQuestionSymbols.join(', ')
      + '. The assignment cannot be published until the interaction contract can enter them.'
    );
  }

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
};

export default auditQuestionAnswerEntry;
