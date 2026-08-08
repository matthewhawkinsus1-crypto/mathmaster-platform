import { MISSING_TOOL_IDS, validateToolQuestion } from '../../tools/toolSchemas.js';

const LEGACY_QUESTION_TYPES = new Set([
  'algebra', 'fraction', 'numberLine', 'graphing', 'functionGraph',
  'functionInvestigation', 'graphAnalysis', 'stepAlgebra', 'literal',
  'system', 'table', 'orderedPair', 'multiAnswer', 'relationshipModel',
  'graphScenarioMatch', 'graphComparison', 'graphStory', 'contextInterpretation',
  'modelingLab',
]);
const MISSING_TOOLS = new Set(MISSING_TOOL_IDS);

export const isKnownQuestionType = (value) => LEGACY_QUESTION_TYPES.has(value) || MISSING_TOOLS.has(value);

export const validateQuestionDefinition = (question = {}) => {
  const errors = [];
  const warnings = [];
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    return { isValid: false, errors: ['Question must be an object.'], warnings };
  }
  const type = String(question.toolId || question.type || question.questionType || '');
  if (!type) errors.push('Question is missing type/toolId.');
  else if (!isKnownQuestionType(type)) errors.push(`Unsupported question type/toolId: ${type}.`);
  if (question.schemaVersion != null && Number(question.schemaVersion) !== 1) errors.push('Question schemaVersion must be 1.');
  if (!question.questionId) warnings.push('Question has no stable questionId.');
  if (!question.familyId) warnings.push('Question has no familyId.');
  if (question.difficultyBand != null && (!Number.isInteger(Number(question.difficultyBand)) || Number(question.difficultyBand) < 1 || Number(question.difficultyBand) > 5)) {
    errors.push('difficultyBand must be an integer from 1 through 5.');
  }
  if (question.responseFields != null && !Array.isArray(question.responseFields)) errors.push('responseFields must be an array when supplied.');
  if (MISSING_TOOLS.has(type)) {
    const toolValidation = validateToolQuestion({ ...question, toolId: type });
    errors.push(...toolValidation.errors);
    warnings.push(...toolValidation.warnings);
  }
  warnings.push(...(Array.isArray(question.normalizationWarnings) ? question.normalizationWarnings : []));
  return { isValid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
};
