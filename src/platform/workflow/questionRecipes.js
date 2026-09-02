// Recipes — the middle level between a primitive and a problem.
//
//   interaction primitive   graph, table, equation box, mapping diagram, …
//         ↓
//   question recipe         which interactions happen, in what order   ← here
//         ↓
//   problem parameters      numbers, functions, contexts, labels, units
//
// A recipe is not a new question type. `relationshipModel` and `relationMapping`
// stay as public concepts — a teacher and an authoring AI still think in terms
// of "Model a relationship" and "Mapping diagram" — and each is expressed here
// as a configuration of the same primitives. That is what lets one relation
// question ask for a plot, another for a mapping diagram, another for both, and
// none of them need a component of its own.
//
// The `ask` list is the parameter. It is the same idea the existing tools
// already use (`ask: ['mapping', 'domain', 'range', 'isFunction']`), lifted out
// of the tool so every recipe shares it.
//
// Pure: builds JSON, renders nothing, grades nothing.

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null && item !== '') : []);

const uniqueSorted = (values) => [...new Set(values)].sort((a, b) => a - b);
const normalizePair = (pair) => {
  const x = Number(Array.isArray(pair) ? pair[0] : pair?.x);
  const y = Number(Array.isArray(pair) ? pair[1] : pair?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};
const normalizedPairs = (pairs = []) => list(pairs).map(normalizePair).filter(Boolean);

/** A relation is a function unless one input is sent to two different outputs. */
export const relationIsFunction = (pairs = []) => {
  const seen = new Map();
  return normalizedPairs(pairs).every(([x, y]) => {
    if (!seen.has(x)) { seen.set(x, y); return true; }
    return seen.get(x) === y;
  });
};

// --- Function modelling (the public type `relationshipModel`) ----------------

const latestModelSource = (asked) => asked.has('graph') ? 'graph' : asked.has('table') ? 'table' : asked.has('equation') ? 'equation' : null;
const latestPreGraphModelSource = (asked) => asked.has('table') ? 'table' : asked.has('equation') ? 'equation' : null;

const FUNCTION_MODELING = {
  label: 'Model a relationship',
  publicType: 'relationshipModel',
  defaultAsk: ['quantities', 'equation', 'table', 'graph', 'domain', 'range', 'continuity'],
  stages: {
    quantities: (question) => ({
      id: 'quantities',
      kind: 'quantityRoles',
      prompt: question.quantitiesPrompt || 'Which quantity is the input, and which is the output?',
      quantities: list(question.quantities),
    }),
    equation: (question) => ({
      id: 'equation',
      kind: 'equationInput',
      prompt: question.equationPrompt || 'Write a function that models this situation.',
    }),
    table: (question, asked) => ({
      id: 'table',
      kind: 'tableInput',
      prompt: question.tablePrompt
        || (asked.has('equation') ? 'Complete the table using your function.' : 'Complete the table.'),
      xValues: list(question.tableXValues).length ? list(question.tableXValues) : [0, 1, 2, 3],
      // The table follows the student's OWN function whenever they wrote one.
      ...(asked.has('equation') ? { source: { fromStage: 'equation' } } : {}),
    }),
    graph: (question, asked) => ({
      id: 'graph',
      kind: 'graphConstruction',
      // If continuity is part of the student's work, their classification — not
      // the answer key — decides whether the graph is point-only or connected.
      graphMode: asked.has('continuity')
        ? 'studentSelected'
        : (question.graphMode || (question.continuity === 'discrete' ? 'discrete' : 'continuous')),
      ...(asked.has('continuity') ? { continuityStageId: 'continuity' } : {}),
      prompt: question.graphPrompt || 'Build the graph of the relationship.',
      ...(isObject(question.graph) ? { graph: question.graph } : {}),
      // Prefer the table because it contains the student's plotted values AND
      // carries lineage back to the equation. If there is no table, graph the
      // student's equation directly. Nothing here falls back to the answer key.
      ...(asked.has('table')
        ? { source: { fromStage: 'table' } }
        : (asked.has('equation') ? { source: { fromStage: 'equation' } } : {})),
    }),
    domain: (question, asked) => ({
      id: 'domain',
      kind: 'domainInput',
      prompt: question.domainPrompt || 'State a reasonable domain for this situation.',
      notation: question.notation || 'interval',
      ...(Array.isArray(question.domainChoices) && question.domainChoices.length ? { choices: question.domainChoices } : {}),
      ...(latestModelSource(asked) ? { source: { fromStage: latestModelSource(asked) } } : {}),
    }),
    domainWords: (question, asked) => ({
      id: 'domainWords',
      kind: Array.isArray(question.domainWordsChoices) && question.domainWordsChoices.length
        ? 'multipleChoice'
        : 'shortResponse',
      prompt: question.domainWordsPrompt || 'State the domain in words.',
      ...(Array.isArray(question.domainWordsChoices) && question.domainWordsChoices.length
        ? { choices: question.domainWordsChoices }
        : {}),
      ...(latestModelSource(asked) ? { source: { fromStage: latestModelSource(asked) } } : {}),
    }),
    domainInequality: (question, asked) => ({
      id: 'domainInequality',
      kind: 'domainInput',
      prompt: question.domainInequalityPrompt || 'Write the domain using inequalities.',
      notation: 'inequality',
      ...(latestModelSource(asked) ? { source: { fromStage: latestModelSource(asked) } } : {}),
    }),
    range: (question, asked) => ({
      id: 'range',
      kind: 'rangeInput',
      prompt: question.rangePrompt || 'State the range that goes with it.',
      notation: question.notation || 'interval',
      ...(Array.isArray(question.rangeChoices) && question.rangeChoices.length ? { choices: question.rangeChoices } : {}),
      ...(latestModelSource(asked) ? { source: { fromStage: latestModelSource(asked) } } : {}),
    }),
    rangeWords: (question, asked) => ({
      id: 'rangeWords',
      kind: Array.isArray(question.rangeWordsChoices) && question.rangeWordsChoices.length
        ? 'multipleChoice'
        : 'shortResponse',
      prompt: question.rangeWordsPrompt || 'State the range in words.',
      ...(Array.isArray(question.rangeWordsChoices) && question.rangeWordsChoices.length
        ? { choices: question.rangeWordsChoices }
        : {}),
      ...(latestModelSource(asked) ? { source: { fromStage: latestModelSource(asked) } } : {}),
    }),
    rangeInequality: (question, asked) => ({
      id: 'rangeInequality',
      kind: 'rangeInput',
      prompt: question.rangeInequalityPrompt || 'Write the range using inequalities.',
      notation: 'inequality',
      ...(latestModelSource(asked) ? { source: { fromStage: latestModelSource(asked) } } : {}),
    }),
    continuity: (question, asked) => ({
      id: 'continuity',
      kind: 'classification',
      prompt: question.continuityPrompt || 'Should this relationship be represented as discrete points or as a continuous graph?',
      choices: ['discrete', 'continuous'],
      ...(latestPreGraphModelSource(asked) ? { source: { fromStage: latestPreGraphModelSource(asked) } } : {}),
    }),
    interpretation: (question) => ({
      id: 'interpretation',
      kind: 'interpretation',
      prompt: question.interpretationPrompt || 'Explain what your model says about the situation.',
    }),
  },
  // Only what the authored fields already state, or what follows from them.
  // Nothing here invents an answer key.
  grading: (question, asked) => {
    const rules = {};
    if (asked.has('quantities') && question.correctIndependentId && question.correctDependentId) {
      rules.quantities = {
        independent: question.correctIndependentId,
        dependent: question.correctDependentId,
      };
    }
    if (asked.has('equation') && question.correctEquation) rules.equation = question.correctEquation;
    if (asked.has('table')) {
      if (asked.has('equation')) rules.table = { consistentWith: 'equation' };
      else if (isObject(question.tableAnswers)) rules.table = { values: question.tableAnswers };
    }
    if (asked.has('graph')) {
      if (asked.has('table')) rules.graph = { consistentWith: 'table', useStageVerdict: true };
      else if (asked.has('equation')) rules.graph = { consistentWith: 'equation', useStageVerdict: true };
    }
    if (asked.has('continuity') && question.continuity) rules.continuity = question.continuity;
    if (asked.has('domain') && question.correctDomain) rules.domain = question.correctDomain;
    if (asked.has('domainWords') && question.correctDomainWords) rules.domainWords = question.correctDomainWords;
    if (asked.has('domainInequality') && question.correctDomainInequality) rules.domainInequality = question.correctDomainInequality;
    if (asked.has('range') && question.correctRange) rules.range = question.correctRange;
    if (asked.has('rangeWords') && question.correctRangeWords) rules.rangeWords = question.correctRangeWords;
    if (asked.has('rangeInequality') && question.correctRangeInequality) rules.rangeInequality = question.correctRangeInequality;
    return rules;
  },
};

// --- Relation representations (the public type `relationMapping`) ------------

const RELATION_REPRESENTATIONS = {
  label: 'Represent a relation',
  publicType: 'relationMapping',
  defaultAsk: ['mapping', 'domain', 'range', 'isFunction'],
  stages: {
    mapping: (question) => ({
      id: 'mapping',
      kind: 'mappingDiagram',
      prompt: question.mappingPrompt || 'Build the mapping diagram for this relation.',
      domainLabel: question.domainLabel,
      rangeLabel: question.rangeLabel,
    }),
    plot: (question) => ({
      id: 'plot',
      kind: 'coordinatePlot',
      prompt: question.plotPrompt || 'Plot the ordered pairs.',
      pairs: list(question.pairs),
      ...(isObject(question.graph) ? { graph: question.graph } : {}),
    }),
    domain: (question) => ({
      id: 'domain',
      kind: 'domainInput',
      prompt: question.domainPrompt || 'List the domain of the relation.',
      notation: question.notation || 'set',
    }),
    range: (question) => ({
      id: 'range',
      kind: 'rangeInput',
      prompt: question.rangePrompt || 'List the range of the relation.',
      notation: question.notation || 'set',
    }),
    isFunction: (question) => ({
      id: 'isFunction',
      kind: 'classification',
      prompt: question.isFunctionPrompt || 'Is this relation a function?',
      choices: ['Yes', 'No'],
    }),
  },
  // A relation is given, so its domain, range and functionhood are facts about
  // the pairs rather than opinions. Deriving them is honest; the alternative is
  // asking the question and marking nothing.
  grading: (question, asked) => {
    const pairs = normalizedPairs(question.pairs);
    if (!pairs.length) return {};
    const rules = {};
    if (asked.has('mapping')) rules.mapping = { pairs };
    if (asked.has('plot')) rules.plot = { pairs };
    if (asked.has('domain')) rules.domain = { set: uniqueSorted(pairs.map(([x]) => x)) };
    if (asked.has('range')) rules.range = { set: uniqueSorted(pairs.map(([, y]) => y)) };
    if (asked.has('isFunction')) rules.isFunction = relationIsFunction(pairs) ? 'Yes' : 'No';
    return rules;
  },
};

export const RECIPES = Object.freeze({
  functionModeling: Object.freeze(FUNCTION_MODELING),
  relationRepresentations: Object.freeze(RELATION_REPRESENTATIONS),
});

export const RECIPE_NAMES = Object.freeze(Object.keys(RECIPES));

// Which recipe a public type uses when the question names none.
const RECIPE_FOR_TYPE = Object.freeze({
  relationshipModel: 'functionModeling',
  relationMapping: 'relationRepresentations',
});

export const getRecipe = (name) => RECIPES[name] || null;

/**
 * Read the `recipe` field, which may be a name or a name plus an `ask` list.
 */
export const readRecipeRequest = (question = {}) => {
  const raw = question?.recipe;
  if (!raw) return null;
  const name = typeof raw === 'string' ? raw : String(raw.name || raw.recipe || '');
  const resolved = name || RECIPE_FOR_TYPE[question.type] || '';
  const ask = list(isObject(raw) ? raw.ask : null).length
    ? list(raw.ask)
    : list(question.ask);
  return { name: resolved, ask, requested: name };
};

/**
 * Expand a recipe into a workflow and the grading rules that follow from the
 * question's own fields.
 *
 * Returns `{ workflow, grading, errors }`. Errors are for Preflight: an unknown
 * recipe or an unknown ask would otherwise produce a question that silently
 * skips the step the author asked for.
 */
export const expandRecipe = (question = {}, { label = 'Question' } = {}) => {
  const request = readRecipeRequest(question);
  if (!request) return null;

  const recipe = getRecipe(request.name);
  if (!recipe) {
    return {
      workflow: [],
      grading: {},
      errors: [
        `${label} names recipe "${request.requested || request.name || ''}", which does not exist. `
        + `The recipes are: ${RECIPE_NAMES.join(', ')}.`,
      ],
    };
  }

  const requestedAsk = request.ask.length ? request.ask : recipe.defaultAsk;
  const errors = [];
  const known = requestedAsk.filter((step) => {
    if (recipe.stages[step]) return true;
    errors.push(
      `${label} asks for "${step}", which recipe "${request.name}" does not have. `
      + `It offers: ${Object.keys(recipe.stages).join(', ')}.`,
    );
    return false;
  });

  const asked = new Set(known);
  const workflow = known.map((step) => recipe.stages[step](question, asked));
  const derived = recipe.grading(question, asked);

  return {
    workflow,
    // Anything the author wrote by hand wins over what was derived.
    grading: { ...derived, ...(isObject(question.grading) ? question.grading : {}) },
    errors,
    recipe: request.name,
  };
};
