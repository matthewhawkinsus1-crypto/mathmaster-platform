import {
  AUTHORING_INTENT_V5_ACTIONS as CORE_AUTHORING_INTENT_V5_ACTIONS,
  compileAuthoringIntentV5 as compileAuthoringIntentV5Core,
} from './authoringIntentV5Core.js';
import { validateToolQuestion } from '../../tools/toolSchemas.js';

export * from './authoringIntentV5Core.js';

const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const token = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const FUNCTION_OPERATION_ACTION_TOKENS = new Set([
  'operateonfunctions',
  'functionoperations',
  'operationsonfunctions',
]);

const CONSTRUCT_GRAPH_ACTION_TOKENS = new Set([
  'constructgraph',
  'graphfunction',
]);

const OPERATION_ALIASES = Object.freeze({
  add: 'sum',
  sum: 'sum',
  subtract: 'difference',
  difference: 'difference',
  multiply: 'product',
  product: 'product',
  divide: 'quotient',
  quotient: 'quotient',
  compose: 'composition',
  composition: 'composition',
});

const cloneValue = (value) => {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
};

const actionTokens = (question = {}) => asArray(
  question.studentActions || question.actions || question.studentAction,
).map(token).filter(Boolean);

const isFunctionOperationsIntent = (question = {}) => (
  isObject(question.functionOperations)
  || actionTokens(question).some((entry) => FUNCTION_OPERATION_ACTION_TOKENS.has(entry))
);

const isTransformationPlotIntent = (question = {}) => {
  if (!isObject(question.transformation)) return false;
  if (!actionTokens(question).some((entry) => CONSTRUCT_GRAPH_ACTION_TOKENS.has(entry))) return false;
  const sourcePoints = question.sourcePoints || question.transformation.sourcePoints;
  return Array.isArray(sourcePoints) && sourcePoints.length >= 2;
};

const prepareQuestionForCore = (question = {}) => {
  const prepared = cloneValue(question);

  if (isTransformationPlotIntent(question)
      && !question.mode
      && !question.transformation?.mode) {
    prepared.transformation = {
      ...(prepared.transformation || {}),
      mode: 'plotTransform',
    };
  }

  if (isFunctionOperationsIntent(question)) {
    // The legacy core does not know the new renderer yet. Give it a harmless,
    // platform-owned placeholder route so it can still normalize the common V5
    // metadata; the facade replaces that placeholder with the first-class tool
    // contract immediately after core compilation.
    prepared.toolHint = 'functionGraph';
    prepared.studentActions = ['constructGraph'];
    prepared.function = { family: 'linear', a: 1, h: 0, k: 0 };
  }

  return prepared;
};

const prepareInputForCore = (input = {}) => ({
  ...cloneValue(input),
  sections: asArray(input.sections).map((section) => ({
    ...cloneValue(section),
    questions: asArray(section?.questions).map(prepareQuestionForCore),
  })),
});

const normalizeFunctionSpec = (spec) => {
  if (!isObject(spec)) return spec;
  return {
    ...cloneValue(spec),
    type: spec.type || spec.family,
  };
};

const normalizeOperations = (value) => [...new Set(
  asArray(value)
    .map((entry) => OPERATION_ALIASES[token(entry)] || String(entry ?? '').trim())
    .filter(Boolean),
)];

const compileFunctionOperationsQuestion = (source = {}, placeholder = {}) => {
  const intent = isObject(source.functionOperations) ? source.functionOperations : {};
  const f = normalizeFunctionSpec(source.f || source.functions?.f || intent.f);
  const g = normalizeFunctionSpec(source.g || source.functions?.g || intent.g);
  const operations = normalizeOperations(source.operations || intent.operations || source.operation);
  const composeOrder = source.composeOrder || intent.composeOrder;
  const restrictions = source.restrictions || source.domainRestrictions || intent.restrictions;

  const {
    functionSpec: _placeholderFunction,
    graph: _placeholderGraph,
    studentChoosesX: _placeholderStudentChoosesX,
    showCoordinates: _placeholderShowCoordinates,
    ...common
  } = placeholder;

  const compiled = {
    ...common,
    type: 'functionOperationsLab',
    studentActions: ['operateOnFunctions'],
    f,
    g,
    operations,
    ...(composeOrder ? { composeOrder } : {}),
    ...(restrictions != null ? { restrictions: cloneValue(restrictions) } : {}),
  };

  const validation = validateToolQuestion(compiled);
  if (validation.errors.length) {
    throw new Error(`Function operations authoring intent is invalid:\n- ${validation.errors.join('\n- ')}`);
  }
  return compiled;
};

const applyFacadeContracts = (source, compiledResult) => {
  const compiledSections = asArray(compiledResult?.package?.sections);
  let functionOperationCount = 0;
  let transformationPlotCount = 0;

  asArray(source?.sections).forEach((sourceSection, sectionIndex) => {
    const compiledSection = compiledSections[sectionIndex];
    if (!compiledSection) return;

    asArray(sourceSection?.questions).forEach((sourceQuestion, questionIndex) => {
      const compiledQuestion = compiledSection.questions?.[questionIndex];
      if (!compiledQuestion) return;

      if (isTransformationPlotIntent(sourceQuestion)
          && !sourceQuestion.mode
          && !sourceQuestion.transformation?.mode
          && compiledQuestion.type === 'transformationsLab'
          && compiledQuestion.mode === 'plotTransform') {
        transformationPlotCount += 1;
      }

      if (!isFunctionOperationsIntent(sourceQuestion)) return;
      compiledSection.questions[questionIndex] = compileFunctionOperationsQuestion(sourceQuestion, compiledQuestion);
      functionOperationCount += 1;

      const decision = asArray(compiledResult.decisions).find((entry) => (
        entry?.sectionId === compiledSection.id && Number(entry?.index) === questionIndex
      ));
      if (decision) {
        decision.type = 'functionOperationsLab';
        decision.actions = ['operateOnFunctions'];
      }
    });
  });

  if (transformationPlotCount) {
    compiledResult.repairs?.push(`inferred transformationsLab plotTransform mode for ${transformationPlotCount} constructGraph question(s) with authored source geometry`);
  }
  if (functionOperationCount) {
    compiledResult.repairs?.push(`compiled ${functionOperationCount} operateOnFunctions question(s) into functionOperationsLab`);
  }
  return compiledResult;
};

export const compileAuthoringIntentV5 = (input = {}) => {
  const prepared = prepareInputForCore(input);
  const compiled = compileAuthoringIntentV5Core(prepared);
  return applyFacadeContracts(input, compiled);
};

export const AUTHORING_INTENT_V5_ACTIONS = Object.freeze([
  ...CORE_AUTHORING_INTENT_V5_ACTIONS,
  'operateOnFunctions',
]);
