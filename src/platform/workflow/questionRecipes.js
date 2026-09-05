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


// --- Function characteristics (the public type `graphAnalysis`) --------------
//
// One graph, read end to end: plot the table, decide what kind of function it
// is, find its intercepts and its extreme value, say where they are, and state
// the domain and range.
//
// WHY THIS IS ONE QUESTION AND NOT SEVEN. Each step is a different skill and
// deserves its own mark, which is what stages give. But they are not seven
// questions, because every one of them is about the SAME graph — and the graph
// is the student's own. Split into separate questions, each would have to
// either re-draw the graph for the student (handing them the first step) or
// make them plot it again.
//
// WHY "CONNECT THE POINTS" IS NOT A STEP. Drawing a curve through plotted
// points and naming the function family are the same act: you cannot connect
// them correctly without knowing which family it is. `model` asks for the
// family and the graph follows from it, which also means a wrong choice is
// visible — the curve misses the plotted points.
//
// WHY FINDING AND STATING ARE SEPARATE. Pointing at the vertex and reading off
// that it sits at (2, 9) are different skills. A student who can see the
// maximum but miscounts the gridlines has made one mistake, not two, and the
// split is what lets them be told which one.
//
// AUTHORING CONSTRAINTS, because these make the question unfair when missed:
//   - The extreme point must be IN the table, or the student is asked to click
//     a point they were never given. Derivation below refuses to guess it.
//   - Intercepts should be lattice points, or "click the x-intercept" has no
//     honest tolerance.
//   - Algebra I does not use interval notation, so domain and range default to
//     inequalities here rather than to intervals.

const FAMILY_CHOICES = ['Linear', 'Quadratic', 'Exponential'];
const EXTREME_CHOICES = ['Maximum', 'Minimum', 'Neither'];

const featureGraph = (question) => ({
  ...(isObject(question.graph) ? question.graph : { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }),
  points: normalizedPairs(question.pairs),
  ...(typeof question.correctEquation === 'string' && question.correctEquation.trim()
    ? { model: question.correctEquation.trim() }
    : {}),
});

/**
 * The turning point among the table's own points — or null.
 *
 * Refuses to answer when the extreme y sits at either end of the table, because
 * an endpoint is not a turning point: it is only the largest value SAMPLED, and
 * keying on it would mark a correct student wrong. An author whose vertex is
 * off the table must state `extreme.point` themselves.
 */
const turningPointFromTable = (pairs, kind) => {
  if (pairs.length < 3) return null;
  const ordered = [...pairs].sort((a, b) => a[0] - b[0]);
  const wantMax = kind === 'maximum';
  let bestIndex = 0;
  ordered.forEach(([, y], index) => {
    const [, best] = ordered[bestIndex];
    if (wantMax ? y > best : y < best) bestIndex = index;
  });
  if (bestIndex === 0 || bestIndex === ordered.length - 1) return null;
  return ordered[bestIndex];
};

const extremeKindOf = (question) => String(question?.extreme?.kind || '').toLowerCase();

/*
 * The intercept and extreme keys, derived ONCE.
 *
 * Both the stage builders and the grading rules read these, because they have
 * to agree: a quadratic whose key holds two x-intercepts while the stage lets
 * the student mark only one is unanswerable, and that is exactly the bug this
 * shared derivation exists to make impossible.
 *
 * Each returns null when nothing is certain, which leaves the stage unkeyed and
 * reported as "reviewed by your teacher" rather than marked against a guess.
 */
const xInterceptRule = (question) => {
  const authored = normalizedPairs(question.xIntercepts);
  if (authored.length) return { points: authored };
  if (question.xIntercepts === 'none' || question.hasNoXIntercept === true) return { none: true };
  // A table with no zero does NOT prove there is no x-intercept — the curve can
  // cross between two sampled points — so this stays unkeyed unless the author
  // says so. Only zeros actually present in the table are certain.
  const zeros = normalizedPairs(question.pairs).filter(([, y]) => y === 0);
  return zeros.length ? { points: zeros } : null;
};

const yInterceptRule = (question) => {
  const authored = normalizedPairs([question.yIntercept]);
  if (authored.length) return { points: authored };
  if (question.yIntercept === 'none' || question.hasNoYIntercept === true) return { none: true };
  // A table point at x = 0 IS the y-intercept, by definition rather than by
  // inference, so this one is always safe when the table has it.
  const atZero = normalizedPairs(question.pairs).filter(([x]) => x === 0);
  return atZero.length ? { points: atZero } : null;
};

const extremeRule = (question) => {
  const kind = extremeKindOf(question);
  if (!kind) return null;
  if (kind === 'neither') return { none: true };
  const authored = normalizedPairs([question.extreme?.point]);
  if (authored.length) return { points: authored };
  const turning = turningPointFromTable(normalizedPairs(question.pairs), kind);
  return turning ? { points: [turning] } : null;
};

/** How many marks the student is allowed, from the key itself. */
const markCount = (rule) => Math.max(1, list(rule?.points).length || 1);

const FUNCTION_CHARACTERISTICS = {
  label: 'Analyze a function graph',
  publicType: 'graphAnalysis',
  defaultAsk: [
    'plot', 'model',
    'xIntercept', 'yIntercept', 'extremeKind', 'extremePoint',
    'xInterceptValue', 'yInterceptValue', 'extremeValue',
    'domain', 'range',
  ],
  stages: {
    plot: (question) => ({
      id: 'plot',
      kind: 'coordinatePlot',
      prompt: question.plotPrompt || 'Plot the points from the table.',
      pairs: normalizedPairs(question.pairs),
      ...(isObject(question.graph) ? { graph: question.graph } : {}),
    }),
    model: (question, asked) => ({
      id: 'model',
      kind: 'classification',
      prompt: question.modelPrompt || 'What kind of function do these points make?',
      choices: list(question.familyChoices).length ? list(question.familyChoices) : FAMILY_CHOICES,
      ...(asked.has('plot') ? { source: { fromStage: 'plot' } } : {}),
    }),
    xIntercept: (question) => ({
      id: 'xIntercept',
      kind: 'graphFeatureSelect',
      prompt: question.xInterceptPrompt || 'Mark every x-intercept on the graph.',
      feature: 'xIntercept',
      graph: featureGraph(question),
      selectionCount: markCount(xInterceptRule(question)),
      allowNone: true,
    }),
    yIntercept: (question) => ({
      id: 'yIntercept',
      kind: 'graphFeatureSelect',
      prompt: question.yInterceptPrompt || 'Mark the y-intercept on the graph.',
      feature: 'yIntercept',
      graph: featureGraph(question),
      selectionCount: 1,
      allowNone: true,
    }),
    extremeKind: (question) => ({
      id: 'extremeKind',
      kind: 'classification',
      prompt: question.extremeKindPrompt || 'Does this graph have an extreme maximum, an extreme minimum, or neither?',
      choices: list(question.extremeChoices).length ? list(question.extremeChoices) : EXTREME_CHOICES,
    }),
    extremePoint: (question) => ({
      id: 'extremePoint',
      kind: 'graphFeatureSelect',
      prompt: question.extremePointPrompt || 'Mark that maximum or minimum on the graph.',
      feature: 'extremum',
      graph: featureGraph(question),
      selectionCount: 1,
      allowNone: true,
      noneLabel: 'This graph has neither',
    }),
    xInterceptValue: (question) => ({
      id: 'xInterceptValue',
      kind: 'pointInput',
      prompt: question.xInterceptValuePrompt || 'Write the x-intercept(s) as ordered pairs.',
      pointCount: markCount(xInterceptRule(question)),
      allowNone: true,
    }),
    yInterceptValue: (question) => ({
      id: 'yInterceptValue',
      kind: 'pointInput',
      prompt: question.yInterceptValuePrompt || 'Write the y-intercept as an ordered pair.',
      pointCount: 1,
      allowNone: true,
    }),
    extremeValue: (question) => ({
      id: 'extremeValue',
      kind: 'pointInput',
      prompt: question.extremeValuePrompt || 'Write the location of the maximum or minimum, or say it does not exist.',
      pointCount: 1,
      allowNone: true,
    }),
    domain: (question) => ({
      id: 'domain',
      kind: 'domainInput',
      prompt: question.domainPrompt || 'State the domain.',
      notation: question.notation || 'inequality',
      ...(list(question.domainChoices).length ? { choices: list(question.domainChoices) } : {}),
    }),
    range: (question) => ({
      id: 'range',
      kind: 'rangeInput',
      prompt: question.rangePrompt || 'State the range.',
      notation: question.notation || 'inequality',
      ...(list(question.rangeChoices).length ? { choices: list(question.rangeChoices) } : {}),
    }),
  },
  // Derived only where the authored fields make it certain. Everything else is
  // left unkeyed, which reports as "reviewed by your teacher" rather than
  // marking a correct student wrong against a guess.
  grading: (question, asked) => {
    const pairs = normalizedPairs(question.pairs);
    const rules = {};

    // The plotting surface marks itself: it was given the exact points to ask
    // for, so it knows which ones landed. Comparing a graph artifact with a
    // list of pairs here would just be a worse version of the same check.
    if (asked.has('plot') && pairs.length) rules.plot = { useStageVerdict: true };
    if (asked.has('model') && question.functionFamily) rules.model = String(question.functionFamily);

    const xRule = xInterceptRule(question);
    if (xRule) {
      if (asked.has('xIntercept')) rules.xIntercept = xRule;
      if (asked.has('xInterceptValue')) rules.xInterceptValue = xRule;
    }

    const yRule = yInterceptRule(question);
    if (yRule) {
      if (asked.has('yIntercept')) rules.yIntercept = yRule;
      if (asked.has('yInterceptValue')) rules.yInterceptValue = yRule;
    }

    const kind = extremeKindOf(question);
    if (asked.has('extremeKind') && kind) {
      rules.extremeKind = kind === 'maximum' ? 'Maximum' : kind === 'minimum' ? 'Minimum' : 'Neither';
    }
    const extreme = extremeRule(question);
    if (extreme) {
      if (asked.has('extremePoint')) rules.extremePoint = extreme;
      if (asked.has('extremeValue')) rules.extremeValue = extreme;
    }

    if (asked.has('domain') && question.correctDomain) rules.domain = question.correctDomain;
    if (asked.has('range') && question.correctRange) rules.range = question.correctRange;
    return rules;
  },
};

export const RECIPES = Object.freeze({
  functionModeling: Object.freeze(FUNCTION_MODELING),
  relationRepresentations: Object.freeze(RELATION_REPRESENTATIONS),
  functionCharacteristics: Object.freeze(FUNCTION_CHARACTERISTICS),
});

export const RECIPE_NAMES = Object.freeze(Object.keys(RECIPES));

// Which recipe a public type uses when the question names none.
const RECIPE_FOR_TYPE = Object.freeze({
  relationshipModel: 'functionModeling',
  relationMapping: 'relationRepresentations',
  graphAnalysis: 'functionCharacteristics',
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
