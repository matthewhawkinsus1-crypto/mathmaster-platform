import { generateStableId, stableStringify } from '../../utils/idUtils.js';
import { uniqueDisplayTeks } from '../../utils/teksUtils.js';

export const LAB_TYPES = Object.freeze({
  OPTIMIZATION: 'optimization',
  TRAJECTORY: 'trajectory',
  POPULATION_GROWTH: 'populationGrowth',
  DATA_FITTING: 'dataFitting',
});

const VALID_LAB_TYPES = new Set(Object.values(LAB_TYPES));
const cloneJson = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const normalizeParameter = (parameter = {}, index = 0) => {
  const id = String(parameter.id || `parameter-${index + 1}`).trim();
  const min = finite(parameter.min, 0);
  const maxCandidate = finite(parameter.max, min + 100);
  const max = maxCandidate > min ? maxCandidate : min + 1;
  const stepCandidate = finite(parameter.step, 1);
  const step = stepCandidate > 0 ? stepCandidate : 1;
  const requestedDefault = finite(parameter.defaultValue, min);
  return {
    id,
    label: String(parameter.label || id),
    symbol: String(parameter.symbol || id),
    min,
    max,
    step,
    defaultValue: Math.max(min, Math.min(max, requestedDefault)),
    unit: String(parameter.unit || ''),
    description: String(parameter.description || ''),
  };
};

const normalizeConstraint = (constraint = {}, index = 0) => ({
  id: String(constraint.id || `constraint-${index + 1}`),
  expression: String(constraint.expression || '').trim(),
  label: String(constraint.label || constraint.id || `Constraint ${index + 1}`),
  penaltyMessage: String(constraint.penaltyMessage || 'Constraint violated.'),
});

const normalizeRubric = (rubric = {}) => {
  const weights = {
    modelAccuracyWeight: Math.max(0, finite(rubric.modelAccuracyWeight, 0.5)),
    hypothesisQualityWeight: Math.max(0, finite(rubric.hypothesisQualityWeight, 0.2)),
    writtenJustificationWeight: Math.max(0, finite(rubric.writtenJustificationWeight, 0.3)),
  };
  const sum = Object.values(weights).reduce((total, value) => total + value, 0) || 1;
  return {
    modelAccuracyWeight: weights.modelAccuracyWeight / sum,
    hypothesisQualityWeight: weights.hypothesisQualityWeight / sum,
    writtenJustificationWeight: weights.writtenJustificationWeight / sum,
    masteryThreshold: Math.max(0, Math.min(1, finite(rubric.masteryThreshold, 0.85))),
    minimumTrials: Math.max(1, Math.min(20, Math.round(finite(rubric.minimumTrials, 3)))),
    minimumHypothesisWords: Math.max(1, Math.min(200, Math.round(finite(rubric.minimumHypothesisWords, 8)))),
    minimumJustificationWords: Math.max(1, Math.min(500, Math.round(finite(rubric.minimumJustificationWords, 30)))),
  };
};

export const normalizeLabDefinition = (rawSpec, { includeEvaluation = false } = {}) => {
  const json = typeof rawSpec === 'string' ? JSON.parse(rawSpec) : rawSpec;
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new TypeError('A modeling lab definition must be a JSON object.');
  const labType = VALID_LAB_TYPES.has(json.labType) ? json.labType : LAB_TYPES.OPTIMIZATION;
  const seed = stableStringify({ title: json.title, labType, parameters: json.parameters, constraints: json.constraints, teksAlignments: json.teksAlignments });
  const requestedLabId = String(json.labId || '').trim();
  const labId = /^[A-Za-z0-9_-]{1,120}$/.test(requestedLabId) ? requestedLabId : generateStableId('lab', seed);
  const publicDefinition = {
    schemaVersion: 1,
    labId,
    title: String(json.title || 'Interactive Modeling Lab'),
    labType,
    teksAlignments: uniqueDisplayTeks(json.teksAlignments || json.teks || []),
    dokLevel: Math.max(3, Math.min(4, Math.round(finite(json.dokLevel ?? json.dok, 3)))),
    scenarioDescription: String(json.scenarioDescription || json.scenario || ''),
    guidingQuestion: String(json.guidingQuestion || 'Formulate a model, test it, and justify your conclusion.'),
    parameters: (Array.isArray(json.parameters) ? json.parameters : []).map(normalizeParameter),
    constraints: (Array.isArray(json.constraints) ? json.constraints : []).map(normalizeConstraint),
    display: cloneJson(json.display || {}),
    rubric: normalizeRubric(json.rubric),
  };

  if (!includeEvaluation) return publicDefinition;
  return {
    ...publicDefinition,
    evaluation: {
      objectiveExpression: String(json.evaluation?.objectiveExpression || json.modelEquations?.objectiveExpression || '').trim() || null,
      targetValue: Number.isFinite(Number(json.evaluation?.targetValue ?? json.rubric?.targetCriteria?.targetValue))
        ? Number(json.evaluation?.targetValue ?? json.rubric?.targetCriteria?.targetValue)
        : null,
      targetTolerance: Math.max(0, finite(json.evaluation?.targetTolerance ?? json.rubric?.targetCriteria?.targetTolerance, 0)),
      targetParameters: cloneJson(json.evaluation?.targetParameters || json.rubric?.targetCriteria?.targetParameters || {}),
    },
  };
};

export const validateLabDefinition = (lab = {}) => {
  const errors = [];
  const warnings = [];
  if (!lab || typeof lab !== 'object' || Array.isArray(lab)) return { isValid: false, errors: ['Lab definition must be an object.'], warnings };
  if (!lab.labId) errors.push('Lab definition is missing labId.');
  if (!VALID_LAB_TYPES.has(lab.labType)) errors.push(`Unsupported labType: ${lab.labType || '(missing)'}.`);
  if (![3, 4].includes(Number(lab.dokLevel))) errors.push('Modeling lab DOK must be 3 or 4.');
  if (!Array.isArray(lab.parameters) || lab.parameters.length < 1) errors.push('Modeling lab requires at least one parameter.');
  const ids = new Set();
  (lab.parameters || []).forEach((parameter, index) => {
    if (!parameter.id) errors.push(`Parameter ${index + 1} is missing id.`);
    else if (ids.has(parameter.id)) errors.push(`Duplicate parameter id: ${parameter.id}.`);
    else ids.add(parameter.id);
    if (!(Number(parameter.max) > Number(parameter.min))) errors.push(`Parameter ${parameter.id || index + 1} max must be greater than min.`);
    if (!(Number(parameter.step) > 0)) errors.push(`Parameter ${parameter.id || index + 1} step must be positive.`);
  });
  (lab.constraints || []).forEach((constraint, index) => {
    if (!constraint.expression) errors.push(`Constraint ${index + 1} is missing expression.`);
    if (/[;{}\[\]`]/.test(String(constraint.expression || ''))) errors.push(`Constraint ${index + 1} contains unsupported expression syntax.`);
  });
  if (!(lab.teksAlignments || []).length) warnings.push('Modeling lab has no TEKS alignment, so it cannot contribute standards mastery evidence.');
  return { isValid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
};
