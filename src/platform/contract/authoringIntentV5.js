import { validateInstructionalScopeV5 } from '../curriculum/instructionalScope.js';
import { looksLikeFiniteSetNotation } from '../../../functions/shared/answerEquivalence.mjs';
import { normalizeStaticGraphPoints } from '../../graphPointUtils.js';
import {
  axisExpectedOptions,
  axisQuantityChoicesFromIntent,
  blankAxisGraphFromIntent,
} from './axisSetupIntent.js';
import { normalizeQuestionInteractionContracts } from '../interaction/interactionContract.js';
import {
  normalizeAssignmentV5,
  validateAssignmentV5,
} from './assignmentSchemaV5.js';

const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const normalizeToken = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
const ACTION_ALIASES = Object.freeze({
  solve: 'solveEquation', solveequation: 'solveEquation', answernumeric: 'solveEquation',
  solvebysteps: 'solveStepByStep', solvestepbystep: 'solveStepByStep', showsteps: 'solveStepByStep',
  fractionanswer: 'fractionAnswer', simplifyfraction: 'fractionAnswer',
  choosenumberline: 'chooseNumberLine', selectnumberline: 'chooseNumberLine',
  constructnumberline: 'constructInterval', graphinequality: 'constructInterval', constructinterval: 'constructInterval',
  writeinterval: 'writeInterval', intervalnotation: 'writeInterval',
  readgraph: 'readGraph', constructgraph: 'constructGraph', graphfunction: 'constructGraph',
  investigatefunction: 'investigateFunction', analyzegraph: 'analyzeGraph',
  analyzedomain: 'analyzeDomain', statedomain: 'stateDomain', domain: 'analyzeDomain',
  analyzerange: 'analyzeRange', staterange: 'stateRange', range: 'analyzeRange',
  analyzeincreasing: 'analyzeIncreasing', increasing: 'analyzeIncreasing',
  analyzedecreasing: 'analyzeDecreasing', decreasing: 'analyzeDecreasing',
  analyzeconstant: 'analyzeConstant', constant: 'analyzeConstant',
  analyzepositive: 'analyzePositive', positive: 'analyzePositive',
  analyzenegative: 'analyzeNegative', negative: 'analyzeNegative',
  findvertex: 'findVertex', vertex: 'findVertex', findxintercepts: 'findXIntercepts', xintercepts: 'findXIntercepts',
  findyintercept: 'findYIntercept', yintercept: 'findYIntercept', findmaximum: 'findMaximum', findminimum: 'findMinimum',
  solveforvariable: 'solveLiteral', solveliteral: 'solveLiteral',
  solvesystem: 'solveSystem', graphsystem: 'graphSystem', solveinequalitysystem: 'solveInequalitySystem', rowreduce: 'rowReduce',
  completetable: 'completeTable', readtable: 'readTable',
  orderedpair: 'stateOrderedPair', stateorderedpair: 'stateOrderedPair',
  multipleanswers: 'multipleResponses', multipleresponses: 'multipleResponses',
  identifyquantities: 'identifyQuantities', identifyvariables: 'identifyQuantities', configureaxes: 'configureAxes', labelaxes: 'configureAxes', choosescale: 'configureAxes', writeequation: 'writeEquation',
  classifycontinuity: 'classifyContinuity', classifyrelationship: 'classifyContinuity',
  matchgraphstostories: 'matchGraphsToStories', matchscenarios: 'matchGraphsToStories', comparegraphs: 'compareGraphs',
  writegraphstory: 'writeGraphStory', interpretpoint: 'interpretPointInContext', interpretpointincontext: 'interpretPointInContext',
  buildmapping: 'buildMapping', plotrelation: 'plotRelation', classifyfunction: 'classifyFunction', statefunctionstatus: 'classifyFunction',
  analyzesequence: 'analyzeSequence', classifysequence: 'analyzeSequence', findterm: 'findSequenceTerm',
  findsequenceterm: 'findSequenceTerm', findmissingterm: 'findMissingTerm', writerrecursive: 'writeRecursive',
  writerecursive: 'writeRecursive', writeexplicit: 'writeExplicit', comparesequences: 'compareSequences', partialsum: 'partialSum',
  connectrepresentations: 'connectRepresentations', matchrepresentation: 'connectRepresentations', findmismatch: 'findRepresentationMismatch',
  fitline: 'fitDataModel', fitmodel: 'fitDataModel', analyzedata: 'analyzeData', predictfrommodel: 'predictFromModel',
  inverse: 'findInverse', findinverse: 'findInverse', composition: 'composeFunctions', composefunctions: 'composeFunctions',
  parabolageometry: 'analyzeParabolaGeometry', focusdirectrix: 'analyzeParabolaGeometry',
  factorpolynomial: 'factorPolynomial', dividepolynomial: 'dividePolynomial', multiplypolynomials: 'multiplyPolynomials',
  solveinequality: 'solveInequality', signchart: 'solveInequality',
  complexoperations: 'complexOperations', complexplane: 'analyzeComplex',
  exponentiallog: 'exponentialLogBridge', solveexponential: 'solveExponential', solvelogarithmic: 'solveLogarithmic',
  transformfunction: 'analyzeTransformations', analyzetransformations: 'analyzeTransformations',
  graphline: 'constructLine', constructline: 'constructLine',
  interactivealgebra: 'stepAlgebra2', modelinglab: 'modelingLab',
});

const normalizeActions = (question = {}) => {
  const source = asArray(question.studentActions || question.actions || question.studentAction);
  const actions = source.map((entry) => ACTION_ALIASES[normalizeToken(entry)] || clean(entry)).filter(Boolean);
  return [...new Set(actions)];
};

const copyCommon = (source, target = {}) => {
  ['prompt','activityRole','dok','difficultyBand','calculator','assessmentContext','context','familyId','assessedConstruct','guidedNotes','guidedSteps','referenceInfo'].forEach((key) => {
    if (source[key] != null) target[key] = source[key];
  });
  // Canonical V5 questions keep the normalized mathematical intent that chose
  // their renderer. This lets MathMaster export/re-import its own assignments
  // without asking an outside AI to reconstruct intent from internal type ids.
  const studentActions = normalizeActions(source);
  if (studentActions.length) target.studentActions = studentActions;
  if (source.questionId) target.questionId = source.questionId;
  if (source.standard) target.standard = source.standard;
  if (source.primaryStandard) target.primaryStandard = source.primaryStandard;
  if (source.secondaryStandards) target.secondaryStandards = source.secondaryStandards;
  if (source.prerequisiteStandards) target.prerequisiteStandards = source.prerequisiteStandards;
  if (source.alignments) target.alignments = source.alignments;
  return target;
};

const answerOf = (q) => q.answer ?? q.expectedAnswer ?? q.response?.answer ?? q.answerModel?.answer;
const acceptedOf = (q) => q.acceptedAnswers ?? q.response?.acceptedAnswers ?? q.answerModel?.acceptedAnswers;

const coreFunctionSpec = (raw = {}) => {
  const f = isObject(raw) ? raw : {};
  const family = clean(f.family || f.type || 'linear');
  const type = family === 'line' ? 'linear' : family;
  if (type === 'linear') {
    const m = Number(f.m ?? f.slope ?? f.a ?? 1);
    const b = Number(f.b ?? f.intercept ?? f.k ?? 0);
    return { type: 'linear', m, b, ...(f.domain ? { domain: f.domain } : {}) };
  }
  const out = { type };
  ['a','h','k','base','p','orientation'].forEach((key) => { if (f[key] != null) out[key] = f[key]; });
  if (f.domain) out.domain = f.domain;
  return out;
};

const functionSpecFromIntentQuestion = (q = {}) => {
  const core = coreFunctionSpec(q.function || q.functionSpec || {});
  // V5 authors describe mathematics, not renderer storage. If they place a
  // structured domain beside the function rather than nesting it inside the
  // function, that is still enough mathematical intent for MathMaster to
  // restrict the graph. String domain answers remain grading content and are
  // never mistaken for a graph restriction.
  if (!core.domain && isObject(q.domain) && ('min' in q.domain || 'max' in q.domain)) {
    core.domain = q.domain;
  }
  return core;
};

const toolFunctionSpec = (raw = {}) => {
  const core = coreFunctionSpec(raw);
  if (core.type !== 'linear') return core;
  return { type: 'linear', a: core.m, h: 0, k: core.b, ...(core.domain ? { domain: core.domain } : {}) };
};

const staticFunctionSpec = (raw = {}) => {
  const core = coreFunctionSpec(raw);
  if (core.type === 'linear') return { type: 'line', m: core.m, b: core.b, ...(core.domain ? { domain: core.domain } : {}) };
  return core;
};

const graphFromIntent = (q = {}) => {
  if (isObject(q.graph)) return normalizeStaticGraphPoints(q.graph);
  if (isObject(q.visual?.graph)) return normalizeStaticGraphPoints(q.visual.graph);
  if (isObject(q.function) || isObject(q.functionSpec)) {
    return { functions: [staticFunctionSpec(q.function || q.functionSpec)] };
  }
  return undefined;
};

const analysisRequestsFromActions = (actions, q = {}) => {
  if ((!Array.isArray(actions) || actions.length === 0) && Array.isArray(q.analysisRequests) && q.analysisRequests.length) return q.analysisRequests;
  const notation = q.notation || q.response?.notation || 'interval';
  const map = [
    ['analyzeDomain','domain'], ['stateDomain','domain'], ['analyzeRange','range'], ['stateRange','range'],
    ['analyzeIncreasing','increasing'], ['analyzeDecreasing','decreasing'], ['analyzeConstant','constant'],
    ['analyzePositive','positive'], ['analyzeNegative','negative'],
  ];
  const requests = [];
  map.forEach(([action, kind]) => { if (actions.includes(action) && !requests.some((r) => r.kind === kind)) requests.push({ id: kind, kind, notation }); });
  const points = [
    ['findVertex','vertex','vertex'], ['findXIntercepts','xIntercepts','x-intercepts'], ['findYIntercept','yIntercept','y-intercept'],
    ['findMaximum','localMaximum','maximum'], ['findMinimum','localMinimum','minimum'],
  ];
  points.forEach(([action, feature, id]) => { if (actions.includes(action)) requests.push({ id, kind: 'point', feature }); });
  return requests;
};


const hasStudentFacingResponseFields = (q = {}) => {
  const fields = asArray(q.answerFields || q.responses || q.response?.fields);
  return fields.length > 0 && fields.every((field) => isObject(field) && clean(field.label || field.prompt));
};

const inferBinaryChoiceOptions = (field = {}) => {
  const label = clean(field.label || field.prompt).toLowerCase();
  const answer = clean(field.answer ?? field.acceptedAnswers?.[0]).toLowerCase();
  const patterns = [
    { options: ['yes', 'no'], pattern: /yes\s*(?:\/|or)\s*no|no\s*(?:\/|or)\s*yes/ },
    { options: ['true', 'false'], pattern: /true\s*(?:\/|or)\s*false|false\s*(?:\/|or)\s*true/ },
    { options: ['discrete', 'continuous'], pattern: /discrete\s*(?:\/|or)\s*continuous|continuous\s*(?:\/|or)\s*discrete/ },
    { options: ['finite', 'infinite'], pattern: /finite\s*(?:\/|or)\s*infinite|infinite\s*(?:\/|or)\s*finite/ },
  ];
  return patterns.find((entry) => entry.pattern.test(label) && entry.options.includes(answer))?.options || null;
};

const fieldFromIntent = (field, index) => {
  if (!isObject(field)) return field;
  const out = { ...field };
  out.id = out.id || `part-${index + 1}`;
  out.label = out.label || out.prompt || `Part ${index + 1}`;
  if (out.accepted != null && out.acceptedAnswers == null) out.acceptedAnswers = asArray(out.accepted);
  if (out.expected != null && out.answer == null) out.answer = out.expected;
  if (Array.isArray(out.options) && !out.type) out.type = 'choice';
  if (!out.type) {
    const inferredOptions = inferBinaryChoiceOptions(out);
    if (inferredOptions) {
      out.type = 'choice';
      out.options = inferredOptions;
    }
  }
  if (out.kind === 'text' && !out.type) out.type = 'text';
  if (!out.type) {
    const accepted = Array.isArray(out.acceptedAnswers) && out.acceptedAnswers.length
      ? out.acceptedAnswers
      : out.answer !== undefined
        ? [out.answer]
        : [];
    if (accepted.some((value) => looksLikeFiniteSetNotation(value))) {
      out.type = 'set';
      out.toolProfile = out.toolProfile || 'set';
    }
  }
  delete out.expected;
  delete out.accepted;
  delete out.prompt;
  delete out.kind;
  return out;
};

const promptQuadrant = (prompt = '') => {
  const match = String(prompt).match(/\bquadrant\s*(iv|iii|ii|i|4|3|2|1)\b/i);
  if (!match) return null;
  return ({ '1': 'I', i: 'I', '2': 'II', ii: 'II', '3': 'III', iii: 'III', '4': 'IV', iv: 'IV' })[match[1].toLowerCase()] || null;
};

const promptContainsCoordinatePair = (prompt = '') => /\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)/.test(String(prompt));

const normalizeConstraintBuilderConstraints = (q = {}, raw = []) => {
  const quadrant = promptQuadrant(q.prompt);
  const namesExactPoint = promptContainsCoordinatePair(q.prompt);
  return asArray(raw).map((constraint) => {
    if (!isObject(constraint)) return constraint;
    // If the task only says "the minimum is in Quadrant IV", an exact hidden
    // vertex such as (4,-3) over-constrains the student. Preserve an exact
    // vertex only when the prompt itself actually names a coordinate.
    if (constraint.kind === 'vertex' && quadrant && !namesExactPoint) {
      return {
        ...constraint,
        kind: 'vertexQuadrant',
        value: quadrant,
        label: constraint.label || `Vertex in Quadrant ${quadrant}`,
      };
    }
    return constraint;
  });
};

const normalizeGraphChoices = (choices = []) => asArray(choices).map((item, index) => {
  if (!isObject(item)) return item;
  const id = item.id || `g${index + 1}`;
  if (item.graph) return { ...item, id, graph: normalizeStaticGraphPoints(item.graph) };
  if (item.function || item.functionSpec) {
    return {
      id,
      ...(clean(item.label) ? { label: item.label } : {}),
      graph: { functions: [staticFunctionSpec(item.function || item.functionSpec)] },
    };
  }
  return { ...item, id };
});


const inferSingleEquationVariable = (equation = '') => {
  const symbols = [...new Set(String(equation || '').match(/[A-Za-z]/g) || [])]
    .filter((symbol) => !['e'].includes(symbol.toLowerCase()));
  return symbols.length === 1 ? symbols[0] : null;
};

const responseById = (q = {}, id = '') => asArray(q.responses || q.answerFields || q.response?.fields)
  .find((field) => isObject(field) && clean(field.id) === id);

const responseExpected = (q = {}, id = '') => {
  const field = responseById(q, id);
  if (!field) return undefined;
  if (Array.isArray(field.acceptedAnswers) && field.acceptedAnswers.length) return field.acceptedAnswers;
  return field.answer ?? field.expected;
};

const normalizeIntentTable = (table = {}) => {
  if (!isObject(table)) return null;
  const rawColumns = asArray(table.columns);
  const columns = rawColumns.map((column, index) => {
    if (isObject(column)) {
      const key = clean(column.key || column.id) || (index === 0 ? 'x' : index === 1 ? 'y' : `c${index + 1}`);
      return { ...column, key, label: column.label || column.name || key };
    }
    const label = clean(column) || (index === 0 ? 'x' : index === 1 ? 'f(x)' : `Column ${index + 1}`);
    return { key: index === 0 ? 'x' : index === 1 ? 'y' : `c${index + 1}`, label };
  });
  if (!columns.length) columns.push({ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' });
  if (columns.length === 1) columns.push({ key: 'y', label: 'f(x)' });

  const inputColumn = columns[0].key;
  const responseColumn = columns[columns.length - 1].key;
  const rows = asArray(table.rows);
  const xValues = rows.map((row) => {
    if (Array.isArray(row)) return row[0];
    if (isObject(row)) return row[inputColumn];
    return undefined;
  }).filter((value) => value !== undefined && value !== null && value !== '');

  const answers = {};
  if (Array.isArray(table.answers)) {
    table.answers.forEach((value, rowIndex) => {
      if (value !== undefined && value !== null && value !== '') answers[`${rowIndex}:${responseColumn}`] = value;
    });
  } else if (isObject(table.answers)) {
    Object.entries(table.answers).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') answers[key] = value;
    });
  }

  return { columns, xValues, answers, inputColumn, responseColumn };
};

const evaluateIntentFunction = (spec = {}, xValue) => {
  const x = Number(xValue);
  if (!Number.isFinite(x)) return null;
  const domain = isObject(spec.domain) ? spec.domain : {};
  const min = Number(domain.min);
  const max = Number(domain.max);
  if (Number.isFinite(min)) {
    const inclusive = domain.minInclusive !== false && domain.minClosed !== false;
    if (inclusive ? x < min : x <= min) return null;
  }
  if (Number.isFinite(max)) {
    const inclusive = domain.maxInclusive !== false && domain.maxClosed !== false;
    if (inclusive ? x > max : x >= max) return null;
  }

  const type = spec.type || 'linear';
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  if (type === 'linear' || type === 'line') {
    const m = Number(spec.m ?? spec.a ?? 1);
    const b = Number(spec.b ?? spec.k ?? 0);
    return m * x + b;
  }
  if (type === 'quadratic') return a * (x - h) ** 2 + k;
  if (type === 'absolute') return a * Math.abs(x - h) + k;
  if (type === 'cubic') return a * (x - h) ** 3 + k;
  if (type === 'cubeRoot') return a * Math.cbrt(x - h) + k;
  if (type === 'squareRoot') return x < h ? null : a * Math.sqrt(x - h) + k;
  if (type === 'exponential') return a * base ** (x - h) + k;
  if (type === 'logarithmic') return x <= h || base <= 0 || base === 1 ? null : a * (Math.log(x - h) / Math.log(base)) + k;
  if (type === 'rational') return Math.abs(x - h) <= 1e-12 ? null : a / (x - h) + k;
  return null;
};

const deriveTableAnswers = (functionSpec, tableInfo) => {
  if (!isObject(functionSpec) || !tableInfo?.xValues?.length) return {};
  const answers = {};
  tableInfo.xValues.forEach((x, rowIndex) => {
    const y = evaluateIntentFunction(functionSpec, x);
    if (Number.isFinite(y)) answers[`${rowIndex}:${tableInfo.responseColumn}`] = Number(y.toFixed(10));
  });
  return answers;
};

const expectedContinuity = (q = {}) => clean(
  q.continuity
  ?? q.answerModel?.continuity
  ?? responseExpected(q, 'continuity')
  ?? q.relationshipType,
).toLowerCase();

const expectedDomain = (q = {}) => q.correctDomain ?? q.answerModel?.domain ?? responseExpected(q, 'domain');
const expectedRange = (q = {}) => q.correctRange ?? q.answerModel?.range ?? responseExpected(q, 'range');
const expectedEquation = (q = {}) => q.correctEquation ?? q.answerModel?.equation ?? responseExpected(q, 'equation');

const functionNotationKeysFromPrompt = (prompt = '') => {
  const text = String(prompt || '');
  const direct = text.match(/\bequation\s+for\s+([A-Za-z])\s+in\s+terms\s+of\s+([A-Za-z])\b/i);
  const letPair = text.match(/\bLet\s+([A-Za-z])\s+represent\b[\s\S]{0,220}?\band\s+([A-Za-z])\s+represent\b/i);
  const explicit = text.match(/\b([A-Za-z])\(([A-Za-z])\)\b/);

  let output = null;
  let input = null;
  if (direct) {
    output = direct[1];
    input = direct[2];
  } else if (letPair) {
    input = letPair[1];
    output = letPair[2];
  } else if (explicit) {
    output = explicit[1];
    input = explicit[2];
  }

  if (!output || !input) return [];
  const label = `${output}(${input})`;
  return [{ label, command: label, ariaLabel: `Insert ${output} of ${input}` }];
};

const responseExpectedByIds = (q = {}, ids = []) => {
  for (const id of ids) {
    const expected = responseExpected(q, id);
    if (expected !== undefined) return expected;
  }
  return undefined;
};

const defaultDomainRangeNotation = (q = {}, continuity = '') => {
  if (clean(q.notation)) return clean(q.notation);
  if (clean(continuity).toLowerCase() === 'discrete') return 'set';
  // Algebra I TEKS introduce reasonable domain/range with inequalities. Interval
  // notation is intentionally deferred until later coursework unless the
  // author explicitly requests it.
  return clean(q.courseId).toLowerCase() === 'algebra1' ? 'inequality' : 'interval';
};

const functionWorkflowActions = new Set([
  'writeEquation','completeTable','constructGraph','stateDomain','analyzeDomain','stateRange','analyzeRange','classifyContinuity',
]);

const shouldCompileFunctionWorkflow = (q = {}, actions = []) => {
  if (!(isObject(q.function) || isObject(q.functionSpec) || isObject(q.table) || q.answerModel?.equation)) return false;
  const present = actions.filter((action) => functionWorkflowActions.has(action));
  if (present.length < 2) return false;
  if (actions.includes('readGraph') && !actions.includes('constructGraph') && !actions.includes('completeTable') && !actions.includes('writeEquation')) return false;
  return actions.includes('completeTable')
    || actions.includes('writeEquation')
    || (actions.includes('constructGraph') && present.some((action) => ['stateDomain','analyzeDomain','stateRange','analyzeRange','classifyContinuity'].includes(action)));
};

const latestStageSource = (workflow = [], preferredKinds = []) => {
  for (let index = workflow.length - 1; index >= 0; index -= 1) {
    if (!preferredKinds.length || preferredKinds.includes(workflow[index].kind)) return workflow[index].id;
  }
  return null;
};

const compileFunctionWorkflow = (q, actions) => {
  const publicFunctionSpec = isObject(q.function) || isObject(q.functionSpec)
    ? functionSpecFromIntentQuestion(q)
    : null;
  const tableInfo = normalizeIntentTable(q.table);
  const axis = isObject(q.axisRequirements) ? q.axisRequirements : {};
  const continuity = expectedContinuity(q);
  const graphMode = clean(q.graphMode || q.answerModel?.graphMode || continuity) || 'continuous';
  const workflow = [];
  const grading = {};

  if (actions.includes('identifyQuantities')) {
    workflow.push({
      id: 'quantities',
      kind: 'quantityRoles',
      prompt: q.quantitiesPrompt || 'Which quantity is the input, and which is the output?',
      quantities: asArray(q.quantities),
    });
    if (q.correctIndependentId && q.correctDependentId) {
      grading.quantities = {
        independent: q.correctIndependentId,
        dependent: q.correctDependentId,
      };
    }
  }

  if (actions.includes('configureAxes')) {
    const xAxis = isObject(axis.x) ? axis.x : {};
    const yAxis = isObject(axis.y) ? axis.y : {};
    const quantities = axisQuantityChoicesFromIntent(q, axis);
    const requireUnits = Boolean(clean(xAxis.unit) && clean(yAxis.unit));
    const requireScale = axis.requireScale !== false;

    workflow.push({
      id: 'axes',
      kind: 'axisSetup',
      prompt: q.axisPrompt || 'Label the x- and y-axes with the correct quantities and units, then choose a reasonable scale.',
      quantities,
      graph: blankAxisGraphFromIntent({
        question: q,
        functionSpec: publicFunctionSpec,
        tableInfo,
        evaluateFunction: evaluateIntentFunction,
      }),
      requireUnits,
      requireScale,
    });

    grading.axes = {
      xLabel: axisExpectedOptions(xAxis.label || quantities.find((item) => item?.id === q.correctIndependentId)?.label, axis.acceptedXLabels || xAxis.acceptedLabels),
      yLabel: axisExpectedOptions(yAxis.label || quantities.find((item) => item?.id === q.correctDependentId)?.label, axis.acceptedYLabels || yAxis.acceptedLabels),
      xUnit: axisExpectedOptions(xAxis.unit, axis.acceptedXUnits || xAxis.acceptedUnits),
      yUnit: axisExpectedOptions(yAxis.unit, axis.acceptedYUnits || yAxis.acceptedUnits),
      xStep: axisExpectedOptions(xAxis.countBy, axis.acceptedXSteps || xAxis.acceptedSteps),
      yStep: axisExpectedOptions(yAxis.countBy, axis.acceptedYSteps || yAxis.acceptedSteps),
      requireUnits,
      requireScale,
    };
  }

  if (actions.includes('writeEquation')) {
    workflow.push({
      id: 'equation',
      kind: 'equationInput',
      prompt: q.equationPrompt || 'Write the equation or function rule.',
      functionNotationKeys: functionNotationKeysFromPrompt(q.prompt),
    });
    const expected = expectedEquation(q);
    if (expected !== undefined) grading.equation = expected;
  }

  if (actions.includes('completeTable')) {
    const xValues = tableInfo?.xValues?.length
      ? tableInfo.xValues
      : asArray(q.tableXValues || q.answerModel?.tableXValues);
    const columns = tableInfo?.columns?.length ? tableInfo.columns : [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }];
    const stage = {
      id: 'table', kind: 'tableInput', prompt: q.tablePrompt || 'Complete the table of values.', xValues, columns,
      inputColumn: tableInfo?.inputColumn || columns[0]?.key || 'x',
      responseColumn: tableInfo?.responseColumn || columns[columns.length - 1]?.key || 'y',
    };
    if (actions.includes('writeEquation')) stage.source = { fromStage: 'equation' };
    workflow.push(stage);

    if (actions.includes('writeEquation')) {
      grading.table = { consistentWith: 'equation' };
    } else {
      const authored = tableInfo?.answers || {};
      const derived = publicFunctionSpec ? deriveTableAnswers(publicFunctionSpec, tableInfo || { xValues, responseColumn: stage.responseColumn }) : {};
      const values = Object.keys(derived).length ? derived : authored;
      if (Object.keys(values).length) grading.table = { values };
    }
  }

  // Continuity changes what "build the graph" means. Ask it BEFORE the
  // connection phase instead of after the finished graph, otherwise the
  // workspace itself gives the classification away: a connected curve tells a
  // student "continuous" before they have answered it.
  //
  // The graph follows the student's classification. A wrong classification is
  // scored on this stage; the downstream representation is then judged for
  // consistency with the student's decision, just like a table can correctly
  // follow a student's wrong equation without counting the same misconception
  // twice.
  const continuityBeforeGraph = actions.includes('constructGraph') && actions.includes('classifyContinuity');
  if (continuityBeforeGraph) {
    const stage = {
      id: 'continuity',
      kind: 'classification',
      prompt: q.continuityPrompt || 'Should this relationship be represented as discrete points or as a continuous graph?',
      choices: ['discrete', 'continuous'],
    };
    const source = latestStageSource(workflow, ['tableInput','equationInput']);
    if (source) stage.source = { fromStage: source };
    workflow.push(stage);
    if (continuity) grading.continuity = continuity;
  }

  if (actions.includes('constructGraph')) {
    const dynamicContinuity = continuityBeforeGraph;
    const discrete = !dynamicContinuity && graphMode === 'discrete';
    const stage = {
      id: 'graph',
      // A student-selected graph can be either point-only or connected at
      // runtime, so it uses the full graph workspace and lets the workflow
      // inject the student's continuity choice.
      kind: dynamicContinuity ? 'functionGraph' : (discrete ? 'coordinatePlot' : 'functionGraph'),
      prompt: q.graphPrompt || (dynamicContinuity
        ? 'Build the graph that matches your discrete-or-continuous decision.'
        : (discrete ? 'Plot the points for the relation.' : 'Construct the graph of the function.')),
      graphMode: dynamicContinuity ? 'studentSelected' : (discrete ? 'discrete' : 'continuous'),
      ...(dynamicContinuity ? { continuityStageId: 'continuity' } : {}),
      ...(isObject(q.graph) ? { graph: q.graph } : {}),
    };
    const source = latestStageSource(workflow, ['tableInput','equationInput']);
    if (source) stage.source = { fromStage: source };
    workflow.push(stage);
    if (source) grading.graph = { consistentWith: source, useStageVerdict: true };
  }

  const addSetStage = (id, kind, prompt, expected, notation, choices = []) => {
    const stage = { id, kind, prompt, notation };
    if (Array.isArray(choices) && choices.length) stage.choices = choices;
    const source = latestStageSource(workflow, ['functionGraph','coordinatePlot','tableInput','equationInput']);
    if (source) stage.source = { fromStage: source };
    workflow.push(stage);
    if (expected !== undefined) grading[id] = expected;
  };

  if (actions.some((action) => ['stateDomain','analyzeDomain'].includes(action))) {
    addSetStage('domain', 'domainInput', q.domainPrompt || 'State the domain.', expectedDomain(q), defaultDomainRangeNotation(q, continuity), q.domainChoices || q.answerModel?.domainChoices);
  }
  if (actions.some((action) => ['stateRange','analyzeRange'].includes(action))) {
    addSetStage('range', 'rangeInput', q.rangePrompt || 'State the range.', expectedRange(q), defaultDomainRangeNotation(q, continuity), q.rangeChoices || q.answerModel?.rangeChoices);
  }
  if (actions.includes('classifyContinuity') && !continuityBeforeGraph) {
    const stage = { id: 'continuity', kind: 'classification', prompt: q.continuityPrompt || 'Is the relationship discrete or continuous?', choices: ['discrete','continuous'] };
    const source = latestStageSource(workflow, ['functionGraph','coordinatePlot','tableInput','equationInput']);
    if (source) stage.source = { fromStage: source };
    workflow.push(stage);
    if (continuity) grading.continuity = continuity;
  }

  const type = actions.includes('constructGraph') ? 'functionGraph' : actions.includes('completeTable') ? 'table' : 'multiAnswer';
  const fixedTableAnswers = isObject(grading.table?.values) ? grading.table.values : null;
  const out = copyCommon(q, {
    type,
    workflow,
    grading,
    ...(publicFunctionSpec && !actions.includes('writeEquation') ? { functionSpec: publicFunctionSpec } : {}),
    ...(isObject(q.graph) ? { graph: q.graph } : {}),
    ...(fixedTableAnswers && Object.keys(fixedTableAnswers).length ? { tableAnswers: fixedTableAnswers } : {}),
  });
  return out;
};

const compileRelationshipModel = (q, actions) => {
  const relationship = q.relationship || q.model || {};
  const quantities = q.quantities || relationship.quantities;
  const out = copyCommon(q, {
    type: 'relationshipModel',
    scenario: q.scenario || relationship.scenario || q.context || q.prompt,
    quantities,
    correctIndependentId: q.correctIndependentId || relationship.correctIndependentId || relationship.independentId,
    correctDependentId: q.correctDependentId || relationship.correctDependentId || relationship.dependentId,
  });
  const ask = [];
  if (actions.includes('identifyQuantities')) ask.push('quantities');
  if (actions.includes('writeEquation')) ask.push('equation');
  if (actions.includes('completeTable')) ask.push('table');
  if (actions.includes('constructGraph')) ask.push('graph');
  if (actions.some((a) => ['stateDomain','analyzeDomain'].includes(a))) {
    const hasWords = responseById(q, 'domainWords');
    const hasInequality = responseById(q, 'domainInequalities') || responseById(q, 'domainInequality');
    if (hasWords) ask.push('domainWords');
    if (hasInequality) ask.push('domainInequality');
    if (!hasWords && !hasInequality) ask.push('domain');
  }
  if (actions.some((a) => ['stateRange','analyzeRange'].includes(a))) {
    const hasWords = responseById(q, 'rangeWords');
    const hasInequality = responseById(q, 'rangeInequalities') || responseById(q, 'rangeInequality');
    if (hasWords) ask.push('rangeWords');
    if (hasInequality) ask.push('rangeInequality');
    if (!hasWords && !hasInequality) ask.push('range');
  }
  if (actions.includes('classifyContinuity')) ask.push('continuity');
  // Axis labeling/scale is a distinct mathematical act handled by the
  // relationshipModel component itself. Do not route that question through the
  // generic function-modeling workflow, which intentionally has no axis-setup
  // stage and would silently drop the objective.
  if (!actions.includes('configureAxes') && (ask.length > 1 || actions.some((a) => ['writeEquation','completeTable','constructGraph','stateDomain','stateRange'].includes(a)))) {
    out.recipe = { name: 'functionModeling', ask: ask.length ? ask : ['quantities','equation','table','graph','domain','range','continuity'] };
  }
  const answerModel = q.answerModel || relationship.answerModel || {};
  out.correctEquation = q.correctEquation || answerModel.equation || relationship.equation || out.correctEquation;
  out.tableXValues = q.tableXValues || answerModel.tableXValues || relationship.tableXValues || out.tableXValues;
  out.graphMode = q.graphMode || answerModel.graphMode || relationship.graphMode;
  out.continuity = q.continuity || answerModel.continuity || relationship.continuity || q.relationshipType;
  out.correctDomain = q.correctDomain || answerModel.domain || relationship.domain;
  out.correctRange = q.correctRange || answerModel.range || relationship.range;
  out.correctDomainWords = responseExpectedByIds(q, ['domainWords']);
  out.correctDomainInequality = responseExpectedByIds(q, ['domainInequalities', 'domainInequality']);
  out.correctRangeWords = responseExpectedByIds(q, ['rangeWords']);
  out.correctRangeInequality = responseExpectedByIds(q, ['rangeInequalities', 'rangeInequality']);
  out.quantitiesPrompt = q.quantitiesPrompt || relationship.quantitiesPrompt;
  out.equationPrompt = q.equationPrompt || relationship.equationPrompt;
  out.tablePrompt = q.tablePrompt || relationship.tablePrompt;
  out.graphPrompt = q.graphPrompt || relationship.graphPrompt;
  out.domainPrompt = q.domainPrompt || relationship.domainPrompt;
  out.rangePrompt = q.rangePrompt || relationship.rangePrompt;
  out.continuityPrompt = q.continuityPrompt || relationship.continuityPrompt;
  out.domainChoices = q.domainChoices || answerModel.domainChoices || relationship.domainChoices;
  out.rangeChoices = q.rangeChoices || answerModel.rangeChoices || relationship.rangeChoices;
  out.notation = q.notation || answerModel.notation || defaultDomainRangeNotation(q, out.continuity);
  if (actions.includes('configureAxes')) {
    const axis = q.axisRequirements || relationship.axisRequirements || {};
    const xAxis = isObject(axis.x) ? axis.x : {};
    const yAxis = isObject(axis.y) ? axis.y : {};
    out.quantities = axisQuantityChoicesFromIntent({ ...q, quantities, correctIndependentId: out.correctIndependentId, correctDependentId: out.correctDependentId }, axis);
    out.axisSetup = {
      required: true,
      requireScale: axis.requireScale !== false,
      inputMode: axis.inputMode === 'type' ? 'type' : 'drag',
      applyToGraph: axis.applyToGraph !== false,
      hideGraphLabels: axis.hideGraphLabels !== false,
      hideGraphUnits: axis.hideGraphUnits !== false,
      hideGraphScale: axis.hideGraphScale !== false,
      ...(Array.isArray(axis.acceptedXLabels) ? { acceptedXLabels: axis.acceptedXLabels } : {}),
      ...(Array.isArray(axis.acceptedYLabels) ? { acceptedYLabels: axis.acceptedYLabels } : {}),
      ...(Array.isArray(axis.acceptedXUnits) ? { acceptedXUnits: axis.acceptedXUnits } : {}),
      ...(Array.isArray(axis.acceptedYUnits) ? { acceptedYUnits: axis.acceptedYUnits } : {}),
      ...((Array.isArray(axis.acceptedXSteps) || xAxis.countBy != null) ? { acceptedXSteps: axisExpectedOptions(xAxis.countBy, axis.acceptedXSteps || xAxis.acceptedSteps) } : {}),
      ...((Array.isArray(axis.acceptedYSteps) || yAxis.countBy != null) ? { acceptedYSteps: axisExpectedOptions(yAxis.countBy, axis.acceptedYSteps || yAxis.acceptedSteps) } : {}),
    };
  }
  out.graph = q.graph || relationship.graph;
  if (actions.includes('configureAxes') && !out.graph) {
    const functionSpec = isObject(q.function) || isObject(q.functionSpec)
      ? functionSpecFromIntentQuestion(q)
      : null;
    out.graph = blankAxisGraphFromIntent({
      question: q,
      functionSpec,
      tableInfo: normalizeIntentTable(q.table),
      evaluateFunction: evaluateIntentFunction,
    });
  }
  if (!actions.includes('writeEquation') && (isObject(q.function) || isObject(q.functionSpec))) {
    out.functionSpec = coreFunctionSpec(q.function || q.functionSpec);
  }
  if (q.relationshipType) out.relationshipType = q.relationshipType;
  if (q.requireRelationshipType != null) out.requireRelationshipType = q.requireRelationshipType;
  Object.keys(out).forEach((key) => out[key] === undefined && delete out[key]);
  return out;
};

const resolveIntentType = (q, actions) => {
  const hint = clean(q.toolHint || q.destination || q.intentType || q.questionType);
  if (hint) return hint;
  if (q.labDefinition || actions.includes('modelingLab')) return 'modelingLab';
  if (q.data || q.points && actions.some((a) => ['analyzeData','fitDataModel','predictFromModel'].includes(a))) return 'dataModelingLab';
  if (q.inverse || q.composition || actions.some((a) => ['findInverse','composeFunctions'].includes(a))) return 'inverseCompositionLab';
  if (q.parabola || actions.includes('analyzeParabolaGeometry')) return 'parabolaGeometryLab';
  if (q.polynomial || actions.some((a) => ['factorPolynomial','dividePolynomial','multiplyPolynomials'].includes(a))) return 'polynomialWorkshop';
  if (q.signChart || actions.includes('solveInequality')) return 'signSolutionAnalyzer';
  if (q.complex || q.z || actions.some((a) => ['complexOperations','analyzeComplex'].includes(a))) return 'complexPlaneLab';
  if (q.logarithm || q.exponentialLog || actions.some((a) => ['exponentialLogBridge','solveExponential','solveLogarithmic'].includes(a))) return 'exponentialLogBridge';
  if (q.transformation || actions.includes('analyzeTransformations')) return 'transformationsLab';
  if (q.representations || q.sets || actions.some((a) => ['connectRepresentations','findRepresentationMismatch'].includes(a))) return 'representationMatch';
  if (q.sequence || actions.some((a) => ['analyzeSequence','findSequenceTerm','findMissingTerm','writeRecursive','writeExplicit','compareSequences','partialSum'].includes(a))) return 'sequenceExplorer';
  // A source table that only asks the student to classify the relation should
  // stay a table. Do not invent a mapping diagram merely because normalized
  // pairs are also present for grading.
  if (
    q.table
    && (q.responses || q.answerFields || q.response?.fields)
    && !actions.includes('buildMapping')
    && !actions.includes('plotRelation')
  ) return 'multiAnswer';

  // Reading a continuous/public function graph is graph analysis, not a finite
  // relation-mapping exercise. Sample pairs may be present for authoring or
  // grading, but they must not replace the continuous graph the prompt asks
  // the student to inspect.
  if (
    actions.includes('readGraph')
    && hasStudentFacingResponseFields(q)
    && (q.graph || q.function || q.functionSpec || q.visual?.graph)
    && !actions.includes('buildMapping')
    && !actions.includes('plotRelation')
  ) return 'multiAnswer';

  if (q.relation || q.pairs || actions.some((a) => ['buildMapping','plotRelation','classifyFunction'].includes(a))) return 'relationMapping';
  if (actions.includes('sortIntoOwnGroups') || q.sortBoard || q.validSchemes) return 'openSortBoard';
  if (actions.includes('buildFunctionFromConstraints') || q.constraints && q.allowedFamilies) return 'constraintFunctionBuilder';
  if (actions.includes('matchGraphsToStories') || (q.stories && q.candidateGraphs)) return 'graphScenarioMatch';
  if (actions.includes('compareGraphs') || (q.graphs && q.comparisonFields)) return 'graphComparison';
  if (actions.includes('writeGraphStory')) return 'graphStory';
  if (actions.includes('interpretPointInContext')) return 'contextInterpretation';
  // A rich model that includes axis labeling must stay a composed workflow.
  // Routing it to the flat relationshipModel renderer drops equation/table/
  // graph/domain/range actions after the axis step.
  if (actions.includes('configureAxes') && shouldCompileFunctionWorkflow(q, actions)) return 'functionWorkflow';
  if (actions.some((a) => ['identifyQuantities','configureAxes','writeEquation','classifyContinuity'].includes(a)) && (q.quantities || q.relationship || q.scenario)) return 'relationshipModel';
  if (actions.includes('solveInequalitySystem') || actions.includes('graphSystem') || actions.includes('rowReduce')) return 'systemsWorkspace';
  if (actions.includes('solveSystem') || q.equations) return 'system';
  if (actions.includes('solveLiteral') || (q.solveFor && !actions.includes('solveEquation') && !actions.includes('solveStepByStep'))) return 'literal';
  if (actions.includes('solveStepByStep')) return 'stepAlgebra';
  if (actions.includes('stepAlgebra2')) return 'stepAlgebra2';
  if (actions.includes('constructLine') || q.lineIntent) return 'graphing2';
  if (shouldCompileFunctionWorkflow(q, actions)) return 'functionWorkflow';
  if (actions.includes('constructInterval') || actions.includes('writeInterval') || q.intervals) return 'intervalNumberLine';
  if (actions.includes('chooseNumberLine') || q.numberLineChoices) return 'numberLine';
  if (actions.includes('constructGraph')) return 'functionGraph';
  if (actions.includes('investigateFunction')) return 'functionInvestigation2';
  // When a displayed graph has authored response parts, preserve those exact
  // questions instead of sending the item to the old line-only slope/intercept
  // renderer. MultiAnswerGrader can show the graph and ask the authored
  // domain/range/classification fields without exposing an equation.
  if (
    actions.includes('readGraph')
    && hasStudentFacingResponseFields(q)
    && (q.graph || q.function || q.functionSpec || q.visual?.graph)
  ) return 'multiAnswer';
  if (
    (actions.includes('readGraph')
      || actions.some((a) => a.startsWith('analyze') || ['findVertex','findXIntercepts','findYIntercept','findMaximum','findMinimum'].includes(a)))
    && (q.function || q.functionSpec)
  ) return 'graphAnalysis';
  if (actions.includes('readGraph') && (q.graph || q.visual?.graph)) return 'multiAnswer';
  if (actions.includes('completeTable') || q.table?.answers) return 'table';
  if (actions.includes('stateOrderedPair')) return 'orderedPair';
  if (actions.includes('multipleResponses') || q.responses || q.answerFields) return 'multiAnswer';
  if (actions.includes('fractionAnswer')) return 'fraction';
  // The legacy one-box Algebra renderer is retired. All ordinary equation
  // solving now uses the balance workspace so the student must actually solve.
  if (actions.includes('solveEquation') || q.equation) return 'stepAlgebra';
  return null;
};

const compileOne = (q, index, repairs) => {
  if (!isObject(q)) throw new Error(`V5 question ${index + 1} must be an object.`);
  // Assignment V5 is the only authoring contract. Renderer types remain an
  // internal compiler decision and may never substitute for mathematical intent.
  const actions = normalizeActions(q);
  if (!actions.length) {
    throw new Error(`V5 question ${index + 1} is missing studentActions. Describe what the student must do instead of supplying a renderer type/toolId.`);
  }
  if (q.type || q.toolId) {
    repairs.push(`ignored internal type hint on V5 question ${index + 1}; compiled from studentActions instead`);
  }
  const type = resolveIntentType(q, actions);
  if (!type) throw new Error(`V5 question ${index + 1} does not contain enough mathematical intent to choose a student tool. Add studentActions and the needed mathematical data.`);
  let out;
  switch (type) {
    case 'algebra':
      out = copyCommon(q, { type, equation: q.equation || q.expression, answer: answerOf(q) });
      break;
    case 'fraction':
      out = copyCommon(q, { type, answer: answerOf(q), generator: q.generator });
      break;
    case 'numberLine':
      out = copyCommon(q, { type, choices: q.choices || q.numberLineChoices, answer: answerOf(q), min: q.min, max: q.max, step: q.step });
      break;
    case 'intervalNumberLine': {
      const ask = [];
      if (actions.includes('constructInterval')) ask.push('graph');
      if (actions.includes('writeInterval')) ask.push('interval');
      out = copyCommon(q, { type, inequalityText: q.inequalityText || q.inequality, intervals: q.intervals, ask: q.ask || (ask.length ? ask : ['graph','interval']), min: q.min, max: q.max, step: q.step });
      break;
    }
    case 'graphing':
      out = copyCommon(q, { type, graph: graphFromIntent(q), answer: answerOf(q), responseType: q.response?.kind });
      break;
    case 'functionWorkflow':
      out = compileFunctionWorkflow(q, actions);
      break;
    case 'functionGraph':
      out = copyCommon(q, { type, functionSpec: coreFunctionSpec(q.function || q.functionSpec), graph: normalizeStaticGraphPoints(q.graph), studentChoosesX: q.studentChoosesX ?? true, showCoordinates: q.showCoordinates });
      break;
    case 'functionInvestigation2': {
      const requests = analysisRequestsFromActions(actions, q);
      const kinds = requests.filter((r) => r.kind !== 'point').map((r) => r.kind);
      const mode = q.mode || (kinds.some((k) => ['domain','range'].includes(k)) ? 'domainRange' : kinds.some((k) => ['increasing','decreasing','constant','positive','negative'].includes(k)) ? 'behavior' : requests.some((r) => r.kind === 'point') ? 'intercepts' : 'features');
      out = copyCommon(q, { type, mode, function: toolFunctionSpec(q.function || q.functionSpec), analysisRequests: requests.length ? requests : undefined });
      break;
    }
    case 'graphAnalysis':
      out = copyCommon(q, { type, functionSpec: functionSpecFromIntentQuestion(q), analysisRequests: analysisRequestsFromActions(actions, q) });
      break;
    case 'stepAlgebra':
      out = copyCommon(q, {
        type,
        equation: q.equation,
        generator: q.generator,
        workspaceDifficulty: q.workspaceDifficulty,
        solveFor: q.solveFor || inferSingleEquationVariable(q.equation),
      });
      break;
    case 'literal':
      out = copyCommon(q, { type, equation: q.equation, solveFor: q.solveFor, answer: answerOf(q) });
      break;
    case 'system':
      out = copyCommon(q, { type, equations: q.equations, answer: answerOf(q), graph: normalizeStaticGraphPoints(q.graph), showGraph: q.showGraph });
      break;
    case 'table':
      out = copyCommon(q, { type, table: q.table, functionSpec: q.function ? coreFunctionSpec(q.function) : q.functionSpec });
      break;
    case 'orderedPair':
      out = copyCommon(q, { type, answer: answerOf(q) || q.point, graph: normalizeStaticGraphPoints(q.graph) });
      break;
    case 'multiAnswer': {
      const fields = q.answerFields || q.responses || q.response?.fields || [];
      const candidateGraphs = normalizeGraphChoices(q.candidateGraphs || q.graphs);
      out = copyCommon(q, {
        type,
        answerFields: fields.map(fieldFromIntent),
        table: q.table,
        graph: graphFromIntent(q),
        candidateGraphs: candidateGraphs.length ? candidateGraphs : undefined,
        visual: q.visual,
        mathDisplay: q.mathDisplay,
      });
      break;
    }
    case 'relationshipModel':
      out = compileRelationshipModel(q, actions);
      break;
    case 'graphScenarioMatch':
      out = copyCommon(q, { type, scenarios: q.scenarios || asArray(q.stories).map((story, i) => isObject(story) ? { id: story.id || `s${i + 1}`, title: story.title, description: story.description || story.text || story.prompt } : { id: `s${i + 1}`, description: story }), graphs: normalizeGraphChoices(q.graphs || q.candidateGraphs), correctMatches: q.correctMatches || q.matches });
      break;
    case 'graphComparison':
      out = copyCommon(q, { type, graphs: normalizeGraphChoices(q.graphs || q.candidateGraphs), fields: (q.fields || q.comparisonFields || q.responses || []).map(fieldFromIntent) });
      break;
    case 'graphStory':
      out = copyCommon(q, { type, graph: graphFromIntent(q), functionSpec: q.function ? coreFunctionSpec(q.function) : q.functionSpec, minimumScenarioCharacters: q.minimumScenarioCharacters, minimumExplanationCharacters: q.minimumExplanationCharacters });
      break;
    case 'contextInterpretation': {
      const target = isObject(q.target)
        ? q.target
        : Array.isArray(q.point)
          ? { kind: q.pointKind || 'arbitraryPoint', coordinates: q.point, ...(q.targetLabel ? { label: q.targetLabel } : {}) }
          : undefined;
      out = copyCommon(q, {
        type,
        scenario: q.scenario || q.context,
        quantityChoices: q.quantityChoices || q.quantities,
        quantities: isObject(q.quantities) ? q.quantities : undefined,
        target,
        responseMode: q.responseMode,
        requireQuantities: q.requireQuantities,
        requireUnits: q.requireUnits,
        requireValues: q.requireValues,
        applyResponseToGraph: q.applyResponseToGraph,
        requiredConcepts: q.requiredConcepts,
        sampleAnswer: q.sampleAnswer,
        graph: graphFromIntent(q),
        point: q.point,
        showGraph: q.showGraph,
      });
      break;
    }
    case 'relationMapping': {
      const rawFields = q.answerFields || q.responses || q.response?.fields || [];
      const answerFields = asArray(rawFields).map(fieldFromIntent);
      const ask = q.ask || [...new Set([
        actions.includes('buildMapping') && 'mapping',
        // When a relation is plotted from supplied ordered pairs, keep the
        // mapping-diagram spiral unless the author explicitly opts out.
        actions.includes('plotRelation') && q.includeMappingSpiral !== false && 'mapping',
        actions.includes('plotRelation') && 'plot',
        actions.some((action) => ['stateDomain','analyzeDomain'].includes(action)) && 'domain',
        actions.some((action) => ['stateRange','analyzeRange'].includes(action)) && 'range',
        actions.includes('classifyFunction') && !answerFields.length && 'isFunction',
      ].filter(Boolean))];
      out = copyCommon(q, {
        type,
        pairs: q.pairs || q.relation,
        ask,
        answerFields,
        plotEntryMode: q.plotEntryMode || 'manual',
        plotSnapStep: q.plotSnapStep,
      });
      break;
    }
    case 'modelingLab':
      out = copyCommon(q, { type, labDefinition: q.labDefinition || q.lab || q.modeling });
      break;
    case 'dataModelingLab': {
      const data = q.data || {};
      out = copyCommon(q, { type, mode: q.mode || (actions.includes('fitDataModel') ? 'lineFit' : actions.includes('predictFromModel') ? 'prediction' : 'full'), points: q.points || data.points, predictionX: q.predictionX ?? data.predictionX, predictionTolerance: q.predictionTolerance ?? data.predictionTolerance });
      break;
    }
    case 'inverseCompositionLab':
      out = copyCommon(q, { type, mode: q.mode || (actions.includes('composeFunctions') ? 'composition' : 'inverse'), f: toolFunctionSpec(q.f || q.function || q.inverse?.function), g: q.g ? toolFunctionSpec(q.g) : undefined, x: q.x, inverseBranch: q.inverseBranch });
      break;
    case 'systemsWorkspace':
      out = copyCommon(q, { type, mode: q.mode || (actions.includes('solveInequalitySystem') ? 'inequalities' : actions.includes('rowReduce') ? 'matrix' : q.linearQuadratic ? 'linearQuadratic' : 'linear'), system: q.system, inequalities: q.inequalities, matrix: q.matrix, linearQuadratic: q.linearQuadratic });
      break;
    case 'parabolaGeometryLab': {
      const p = q.parabola || {};
      out = copyCommon(q, { type, mode: q.mode || (p.focus || q.focus ? 'fromGeometry' : 'features'), h: q.h ?? p.h, k: q.k ?? p.k, p: q.p ?? p.p, orientation: q.orientation || p.orientation, focus: q.focus || p.focus, directrix: q.directrix || p.directrix });
      break;
    }
    case 'polynomialWorkshop': {
      const p = q.polynomial || {};
      const mode = q.mode || (actions.includes('dividePolynomial') ? 'division' : actions.includes('multiplyPolynomials') ? 'multiplyArea' : 'factorQuadratic');
      out = copyCommon(q, { type, mode, coefficients: q.coefficients || p.coefficients, leftBinomial: q.leftBinomial || p.leftBinomial, rightBinomial: q.rightBinomial || p.rightBinomial, dividend: q.dividend || p.dividend, divisor: q.divisor || p.divisor, roots: q.roots || p.roots, denominatorRoots: q.denominatorRoots || p.denominatorRoots });
      break;
    }
    case 'signSolutionAnalyzer': {
      const s = q.signChart || q.inequalityModel || {};
      out = copyCommon(q, { type, mode: q.mode || s.mode || 'polynomial', factors: q.factors || s.factors, denominatorFactors: q.denominatorFactors || s.denominatorFactors, relation: q.relation || s.relation, candidates: q.candidates || s.candidates, radicalEquation: q.radicalEquation || s.radicalEquation });
      break;
    }
    case 'sequenceExplorer': {
      let mode = q.mode;
      if (!mode) mode = actions.includes('findMissingTerm') ? 'missingTerm' : actions.includes('partialSum') ? 'partialSum' : actions.includes('compareSequences') ? 'compare' : actions.includes('writeRecursive') || actions.includes('writeExplicit') ? 'ruleBridge' : 'analyze';
      out = copyCommon(q, { type, mode, sequence: q.sequence, targetN: q.targetN, displayCount: q.displayCount, missingIndex: q.missingIndex, sumN: q.sumN, left: q.left, right: q.right, compareN: q.compareN, leftLabel: q.leftLabel, rightLabel: q.rightLabel });
      break;
    }
    case 'complexPlaneLab': {
      const c = q.complex || {};
      out = copyCommon(q, { type, mode: q.mode || c.mode || (actions.includes('complexOperations') ? 'operations' : 'features'), z: q.z || c.z, w: q.w || c.w, operation: q.operation || c.operation, exponent: q.exponent ?? c.exponent, quarterTurns: q.quarterTurns ?? c.quarterTurns, quadratic: q.quadratic || c.quadratic });
      break;
    }
    case 'exponentialLogBridge': {
      const e = q.exponentialLog || q.logarithm || {};
      out = copyCommon(q, { type, mode: q.mode || e.mode || (actions.includes('solveLogarithmic') ? 'solveLogarithmic' : actions.includes('solveExponential') ? 'solveExponential' : 'equivalentForms'), base: q.base ?? e.base, exponent: q.exponent ?? e.exponent, equation: q.equation || e.equation, function: q.function ? toolFunctionSpec(q.function) : e.function, x: q.x ?? e.x, y: q.y ?? e.y });
      break;
    }
    case 'transformationsLab': {
      const t = q.transformation || {};
      out = copyCommon(q, { type, mode: q.mode || t.mode || 'identify', family: q.family || t.family || q.function?.family || q.function?.type, function: q.function ? toolFunctionSpec(q.function) : t.function, target: q.target || t.target, parentPoint: q.parentPoint || t.parentPoint });
      break;
    }
    case 'representationMatch': {
      const r = q.representations || {};
      out = copyCommon(q, { type, mode: q.mode || r.mode || (actions.includes('findRepresentationMismatch') ? 'findMismatch' : 'completeSet'), targetId: q.targetId || r.targetId, sets: q.sets || r.sets, mixedSet: q.mixedSet || r.mixedSet, function: q.function ? toolFunctionSpec(q.function) : r.function, rows: q.rows || r.rows });
      break;
    }
    case 'openSortBoard': {
      const board = q.sortBoard || {};
      out = copyCommon(q, {
        type,
        items: q.items || board.items,
        validSchemes: q.validSchemes || board.validSchemes,
        minGroups: q.minGroups ?? board.minGroups,
        maxGroups: q.maxGroups ?? board.maxGroups,
        requireRationale: q.requireRationale ?? board.requireRationale,
        requireGroupNames: q.requireGroupNames ?? board.requireGroupNames,
        rationaleMinLength: q.rationaleMinLength ?? board.rationaleMinLength,
        hints: q.hints || board.hints,
      });
      break;
    }
    case 'constraintFunctionBuilder': {
      const builder = q.builder || {};
      out = copyCommon(q, {
        type,
        constraints: normalizeConstraintBuilderConstraints(q, q.constraints || builder.constraints),
        allowedFamilies: q.allowedFamilies || builder.allowedFamilies,
        initialModel: q.initialModel || builder.initialModel,
        graph: normalizeStaticGraphPoints(q.graph || builder.graph),
        hints: q.hints || builder.hints,
      });
      break;
    }
    case 'graphing2': {
      const l = q.lineIntent || q.line || {};
      let mode = q.mode || l.mode;
      if (!mode) mode = q.givenPoints || l.givenPoints ? 'throughPoints' : q.point || l.point ? 'pointSlope' : q.standardForm || l.standard ? 'standardForm' : q.orientation || l.orientation ? 'verticalHorizontal' : 'slopeIntercept';
      out = copyCommon(q, { type, mode, line: q.line || (mode === 'slopeIntercept' ? { m: q.m ?? l.m, b: q.b ?? l.b } : undefined), givenPoints: q.givenPoints || l.givenPoints, point: q.point || l.point, slope: q.slope ?? l.slope, standard: q.standardForm || l.standard, orientation: q.orientation || l.orientation, value: q.value ?? l.value });
      break;
    }
    case 'stepAlgebra2':
      out = copyCommon(q, { type, equation: q.equationModel || q.equation, mode: q.mode, workspaceDifficulty: q.workspaceDifficulty });
      break;
    default:
      throw new Error(`V5 question ${index + 1} selected unsupported destination ${type}.`);
  }
  Object.keys(out).forEach((key) => out[key] === undefined && delete out[key]);
  repairs.push(`compiled V5 question ${index + 1} intent → ${out.type}`);
  return out;
};

export const compileAuthoringIntentV5 = (input = {}) => {
  if (!isObject(input)) throw new Error('MathMaster Assignment V5 must be a JSON object.');
  if (Number(input.schemaVersion) !== 5) {
    throw new Error('Only schemaVersion 5 is accepted. V4 and earlier assignments are intentionally unsupported.');
  }
  if (!Array.isArray(input.sections) || input.sections.length === 0) {
    throw new Error('Assignment V5 requires a non-empty sections array. Legacy activities/questions containers are not accepted.');
  }

  const scope = validateInstructionalScopeV5(input);
  if (scope.errors.length) {
    throw new Error(`Instructional scope check failed:\n- ${scope.errors.join('\n- ')}`);
  }

  const repairs = [];
  const decisions = [];
  const assignment = { ...(input.assignment || {}) };

  const compileQuestions = (questions = [], role = null, sectionId = null, sectionTitle = null) => asArray(questions).map((question, index) => {
    const source = isObject(question)
      ? {
          ...question,
          activityRole: question.activityRole || role || 'classwork',
          sectionId: question.sectionId || sectionId || undefined,
          sectionTitle: question.sectionTitle || sectionTitle || undefined,
          courseId: question.courseId || assignment.courseId || undefined,
        }
      : question;
    const compiled = compileOne(source, index, repairs);
    const interactionSafe = normalizeQuestionInteractionContracts(compiled);
    decisions.push({
      index,
      sectionId,
      sectionRole: role,
      type: interactionSafe.type,
      actions: normalizeActions(source),
    });
    return interactionSafe;
  });

  const sections = input.sections.map((section, sectionIndex) => {
    const role = clean(section?.role).toLowerCase() || 'classwork';
    const id = clean(section?.id) || `section-${sectionIndex + 1}`;
    const title = clean(section?.title) || ({
      warmup: 'Warm-Up',
      classwork: 'Classwork',
      practice: 'Practice',
      dol: 'DOL',
      quiz: 'Quiz',
      test: 'Test',
    }[role] || 'Activity');
    return {
      ...section,
      id,
      role,
      title,
      questions: compileQuestions(section?.questions || [], role, id, title),
    };
  });

  const packageOut = normalizeAssignmentV5({
    ...input,
    schemaVersion: 5,
    assignment,
    sections,
  });

  delete packageOut.authoringIntent;
  delete packageOut.activities;
  delete packageOut.questions;
  delete packageOut.classroom;
  delete packageOut.lessonResources;

  const validation = validateAssignmentV5(packageOut);
  if (validation.errors.length) {
    throw new Error(`Assignment V5 validation failed:\n- ${validation.errors.join('\n- ')}`);
  }
  repairs.unshift('compiled Assignment V5 mathematical intent into canonical V5 renderer contracts');

  return {
    package: packageOut,
    repairs,
    decisions,
    warnings: validation.warnings,
  };
};

export const AUTHORING_INTENT_V5_ACTIONS = Object.freeze([
  'solveEquation','solveStepByStep','fractionAnswer','chooseNumberLine','constructInterval','writeInterval','readGraph','constructGraph',
  'investigateFunction','analyzeDomain','analyzeRange','analyzeIncreasing','analyzeDecreasing','analyzeConstant','analyzePositive','analyzeNegative',
  'findVertex','findXIntercepts','findYIntercept','findMaximum','findMinimum','solveLiteral','solveSystem','graphSystem','solveInequalitySystem','rowReduce',
  'completeTable','stateOrderedPair','multipleResponses','identifyQuantities','configureAxes','writeEquation','classifyContinuity','matchGraphsToStories','compareGraphs',
  'writeGraphStory','interpretPointInContext','buildMapping','plotRelation','classifyFunction','analyzeSequence','findSequenceTerm','findMissingTerm',
  'writeRecursive','writeExplicit','compareSequences','partialSum','connectRepresentations','findRepresentationMismatch','sortIntoOwnGroups','buildFunctionFromConstraints','analyzeData','fitDataModel','predictFromModel',
  'findInverse','composeFunctions','analyzeParabolaGeometry','factorPolynomial','dividePolynomial','multiplyPolynomials','solveInequality','complexOperations','analyzeComplex',
  'exponentialLogBridge','solveExponential','solveLogarithmic','analyzeTransformations','constructLine','modelingLab',
]);
