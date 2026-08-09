import { validateAnalysisRequests } from '../../analysisRequestCatalog.js';

// One description of every question type, used for two things at once: the
// authoring contract an AI reads, and the semantic validation that rejects a
// question the renderer could not usefully display.
//
// They must come from the same place. The failure this fixes was a contract
// that listed `graphAnalysis` as a legal type name while saying nothing about
// how to build one, and a validator that accepted `{ type: 'graphAnalysis',
// prompt: 'A graph falls from left to right…' }` because the type name was
// spelled correctly. An AI reading that contract has no way to know it is
// supposed to supply a functionSpec, so it describes the graph in prose instead
// of rendering one.
//
// `representation` is what the student actually sees, and drives both the
// source-fidelity guidance and the Preflight representation audit.

const has = (value) => value !== undefined && value !== null && value !== '';
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const get = (question, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), question);

export const REPRESENTATIONS = Object.freeze({
  GRAPH: 'graph',
  NUMBER_LINE: 'numberLine',
  TABLE: 'table',
  MAPPING: 'mapping',
  ORDERED_PAIRS: 'orderedPairs',
  SYMBOLIC: 'symbolic',
  TEXT: 'text',
  INTERACTIVE: 'interactive',
});

const requires = (path, message) => ({ path, message });

export const QUESTION_TYPE_CATALOG = Object.freeze({
  algebra: {
    label: 'Equation solving',
    representation: REPRESENTATIONS.SYMBOLIC,
    purpose: 'Solve a one- or multi-step equation for a single value.',
    useWhen: ['The student computes a numeric answer to an equation.'],
    doNotUseWhen: ['The task is to read something off a graph, table or number line.'],
    required: [requires('prompt', 'needs a prompt')],
    optional: ['equationLatex', 'answer', 'generator'],
    example: {
      type: 'algebra', prompt: 'Solve for x.', equationLatex: '3x + 6 = 21',
      answer: 5, generator: { solutionRange: [-9, 9], coefficientRange: [2, 9] },
    },
  },

  fraction: {
    label: 'Fraction answer',
    representation: REPRESENTATIONS.SYMBOLIC,
    purpose: 'Answer with a fraction in lowest terms.',
    useWhen: ['The expected answer is a fraction rather than a decimal.'],
    doNotUseWhen: ['A decimal or whole number is acceptable — use algebra instead.'],
    required: [requires('prompt', 'needs a prompt')],
    optional: ['answer', 'generator'],
    example: { type: 'fraction', prompt: 'Simplify.', answer: '3/4' },
  },

  numberLine: {
    label: 'Number line selection',
    representation: REPRESENTATIONS.NUMBER_LINE,
    purpose: 'Choose the number line that matches a statement, or read a value off one.',
    useWhen: ['The student picks between number-line pictures.'],
    doNotUseWhen: [
      'The student should build an interval with open/closed endpoints — use `intervalNumberLine`.',
    ],
    required: [requires('choices', 'needs a `choices` array of number-line options')],
    validate: (question) => (nonEmptyArray(question.choices) ? [] : ['`choices` must be a non-empty array']),
    optional: ['answer', 'min', 'max', 'step'],
    example: {
      type: 'numberLine', prompt: 'Which number line shows x = -2?',
      choices: [{ id: 'a', points: [-2] }, { id: 'b', points: [2] }], answer: 'a',
    },
  },

  intervalNumberLine: {
    label: 'Interval number line',
    representation: REPRESENTATIONS.NUMBER_LINE,
    purpose: 'Move between an inequality, its interval notation and its number-line picture.',
    useWhen: [
      'The lesson teaches inequality notation, interval notation, or graphing on a number line.',
      'The student must place open or closed endpoints, rays, bounded segments, or a union.',
    ],
    doNotUseWhen: ['The answer is a single value with no inequality — use algebra.'],
    required: [requires('intervals', 'needs an `intervals` array describing the correct graph')],
    validate: (question) => {
      const errors = [];
      if (!nonEmptyArray(question.intervals)) {
        errors.push('`intervals` must be a non-empty array');
        return errors;
      }
      question.intervals.forEach((interval, index) => {
        if (!isObject(interval)) { errors.push(`intervals[${index}] must be an object`); return; }
        const lower = interval.min ?? interval.from;
        const upper = interval.max ?? interval.to;
        const unboundedLow = lower === null || lower === '-inf' || lower === undefined;
        const unboundedHigh = upper === null || upper === 'inf' || upper === undefined;
        if (unboundedLow && unboundedHigh) errors.push(`intervals[${index}] must bound at least one end`);
        if (!unboundedLow && !unboundedHigh && Number(lower) > Number(upper)) {
          errors.push(`intervals[${index}] has min greater than max`);
        }
      });
      return errors;
    },
    optional: ['prompt', 'min', 'max', 'step', 'ask', 'inequalityText'],
    // THE ONE MISTAKE THIS TYPE INVITES.
    // `min` and `max` on the QUESTION are the number line's viewport — how much
    // of the line the student can see. `min` and `max` inside an INTERVAL are
    // mathematical endpoints. They are different things, and using the viewport
    // bounds as endpoints turns a ray into a segment: an item that wrote
    // `x ≤ -4 or x > 2` and then encoded [-8, -4] and [2, 8] would have marked
    // a correct student wrong and an incorrect one right.
    //
    // Use `null` for an unbounded end. Preflight now compares `inequalityText`
    // with `intervals` and rejects the mismatch.
    notes: [
      'Question-level `min`/`max` are display bounds only. They never define an answer.',
      'An unbounded end is `null` (or "-inf"/"inf"), never the edge of the viewport.',
      'Infinity is never included, so an infinite end always takes a round bracket.',
    ],
    example: {
      type: 'intervalNumberLine',
      prompt: 'Graph -3 ≤ x < 5, then write it in interval notation.',
      inequalityText: '-3 ≤ x < 5',
      intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }],
      ask: ['graph', 'interval'],
      min: -8, max: 8,
    },
    // A second example, because the ray/union case is the one that goes wrong.
    unboundedExample: {
      type: 'intervalNumberLine',
      prompt: 'Graph x ≤ -4 or x > 2, then write the compound inequality in interval notation.',
      inequalityText: 'x ≤ -4 or x > 2',
      intervals: [
        { min: null, max: -4, minClosed: false, maxClosed: true },
        { min: 2, max: null, minClosed: false, maxClosed: false },
      ],
      ask: ['graph', 'interval'],
      min: -8, max: 8,
    },
  },

  graphing: {
    label: 'Read a displayed graph',
    representation: REPRESENTATIONS.GRAPH,
    purpose: 'Show a rendered graph and ask a question about it.',
    useWhen: ['The source material shows a graph the student must read.'],
    doNotUseWhen: ['You would have to describe the graph in words — that means you have no graph.'],
    required: [requires('graph', 'needs a `graph` object with functions, points or segments')],
    validate: (question) => {
      const graph = question.graph || question.visual;
      if (!isObject(graph)) return ['`graph` must be an object describing what to draw'];
      const drawable = nonEmptyArray(graph.functions) || nonEmptyArray(graph.points) || nonEmptyArray(graph.segments);
      return drawable ? [] : ['`graph` must contain at least one of: functions, points, segments'];
    },
    optional: ['answer', 'visual'],
    example: {
      type: 'graphing', prompt: 'What is the y-intercept of the line shown?',
      graph: { functions: [{ type: 'line', m: 2, b: -3 }], xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
      answer: -3,
    },
  },

  functionGraph: {
    label: 'Construct a graph',
    representation: REPRESENTATIONS.GRAPH,
    purpose: 'The student plots points and draws the curve of a given function.',
    useWhen: ['The task is to graph a function, including on a restricted domain.'],
    doNotUseWhen: ['The graph is given and the student only reads it — use `graphing` or `graphAnalysis`.'],
    required: [requires('functionSpec.type', 'needs `functionSpec.type`, for example { "type": "linear", "m": 2, "b": -3 } or { "type": "quadratic", "a": 1, "h": 2, "k": -3 }')],
    optional: ['graph', 'pointTasks', 'endpointRequirements', 'studentChoosesX', 'includeUndefinedChecks'],
    example: {
      type: 'functionGraph', prompt: 'Graph y = 2x - 3 for x ≥ -3, then state the range.',
      functionSpec: { type: 'linear', m: 2, b: -3, domain: { min: -3 } },
      graph: { xMin: -8, xMax: 8, yMin: -10, yMax: 10 },
    },
  },

  functionInvestigation: {
    label: 'Investigate a function graph',
    representation: REPRESENTATIONS.GRAPH,
    purpose: 'Construct or examine a graph and report several of its features at once.',
    useWhen: ['One graph should yield domain, range, intercepts and behaviour together.'],
    doNotUseWhen: ['You only need one feature — use graphAnalysis with a single request.'],
    required: [requires('functionSpec.type', 'needs `functionSpec.type`, for example { "type": "quadratic", "a": 1, "h": 2, "k": -3 }')],
    // analysisRequests is optional here, but when supplied it goes through the
    // same renderer as graphAnalysis and needs the same legal kinds.
    validate: (question) => validateAnalysisRequests(question.analysisRequests),
    optional: ['analysisRequests', 'graph', 'pointTasks'],
    example: {
      type: 'functionInvestigation', prompt: 'Investigate this function.',
      functionSpec: { type: 'quadratic', a: 1, h: 2, k: -3 },
      analysisRequests: [{ id: 'd', kind: 'domain' }, { id: 'r', kind: 'range' }],
    },
  },

  graphAnalysis: {
    label: 'Analyse a displayed graph',
    representation: REPRESENTATIONS.GRAPH,
    purpose: 'Render a real graph and ask for domain, range, increasing/decreasing/constant intervals, where the function is positive or negative, or named features.',
    useWhen: [
      'The source shows a graph and asks for domain and range.',
      'The source asks where a graph is increasing, decreasing, positive or negative.',
      'You want one graph to carry several sub-answers instead of several prose questions.',
    ],
    doNotUseWhen: [
      'You are about to describe the graph in the prompt instead of supplying one. If you catch yourself writing "a graph that falls from left to right", stop and build the functionSpec.',
    ],
    required: [
      requires('functionSpec.type', 'needs `functionSpec.type` — this type renders a real graph, it does not describe one'),
      requires('analysisRequests', 'needs `analysisRequests`, for example [{ "id": "d", "kind": "domain" }]'),
    ],
    validate: (question) => {
      const errors = [];
      if (!nonEmptyArray(question.analysisRequests)) {
        errors.push('`analysisRequests` must be a non-empty array');
        return errors;
      }
      // `point` on its own used to pass here, then rendered a click target with
      // no locatable feature — an unanswerable question that validated cleanly.
      errors.push(...validateAnalysisRequests(question.analysisRequests));
      return errors;
    },
    optional: ['graph', 'notation', 'showEquation', 'equationLatex'],
    example: {
      type: 'graphAnalysis',
      prompt: 'Use the graph to answer each part.',
      functionSpec: { type: 'quadratic', a: -1, h: 1, k: 4 },
      graph: { xMin: -6, xMax: 6, yMin: -6, yMax: 6 },
      analysisRequests: [
        { id: 'domain', kind: 'domain', notation: 'interval' },
        { id: 'range', kind: 'range', notation: 'interval' },
        { id: 'inc', kind: 'increasing', notation: 'interval' },
        { id: 'dec', kind: 'decreasing', notation: 'interval' },
      ],
    },
  },

  stepAlgebra: {
    label: 'Step-by-step solving',
    representation: REPRESENTATIONS.SYMBOLIC,
    purpose: 'The student performs each solving step and the platform records the work.',
    useWhen: ['The process matters as much as the answer.'],
    doNotUseWhen: ['You only need the final value — use algebra.'],
    required: [requires('prompt', 'needs a prompt')],
    optional: ['equationLatex', 'equation', 'generator'],
    example: { type: 'stepAlgebra', prompt: 'Solve step by step.', equationLatex: '3x + 6 = 21' },
  },

  literal: {
    label: 'Literal equation',
    representation: REPRESENTATIONS.SYMBOLIC,
    purpose: 'Rearrange a formula to isolate a named variable.',
    useWhen: ['The answer is an expression, not a number.'],
    doNotUseWhen: ['The answer is numeric.'],
    required: [requires('prompt', 'needs a prompt'), requires('answer', 'needs the expected expression in `answer`')],
    optional: ['equationLatex', 'solveFor'],
    example: { type: 'literal', prompt: 'Solve for h.', equationLatex: 'A = bh', answer: 'A/b', solveFor: 'h' },
  },

  system: {
    label: 'System of equations',
    representation: REPRESENTATIONS.SYMBOLIC,
    purpose: 'Solve a system and give the solution pair.',
    useWhen: ['Two equations must be solved together.'],
    doNotUseWhen: ['The system should be solved graphically — use the systemsWorkspace tool.'],
    required: [requires('equationsLatex', 'needs an `equationsLatex` array of the equations')],
    validate: (question) => (nonEmptyArray(question.equationsLatex)
      ? []
      : ['`equationsLatex` must be a non-empty array of equation strings']),
    optional: ['answer', 'graph'],
    example: {
      type: 'system', prompt: 'Solve the system.',
      equationsLatex: ['y = 2x + 1', 'y = -x + 7'], answer: { x: 2, y: 5 },
    },
  },

  table: {
    label: 'Table completion',
    representation: REPRESENTATIONS.TABLE,
    purpose: 'The student fills blank cells in a table of values.',
    useWhen: ['The source shows a table the student completes or reads.'],
    doNotUseWhen: ['You would describe the table in prose instead of supplying it.'],
    required: [
      requires('table.columns', 'needs `table.columns`, an array of { key, label }'),
      requires('table.rows', 'needs `table.rows`, an array of objects keyed by column key'),
      requires('table.answers', 'needs `table.answers`, keyed "rowIndex:columnKey" — these are the blanks'),
    ],
    validate: (question) => {
      const errors = [];
      const table = question.table;
      if (!nonEmptyArray(table.columns)) errors.push('`table.columns` must be a non-empty array of { key, label }');
      if (!nonEmptyArray(table.rows)) errors.push('`table.rows` must be a non-empty array');
      const answers = table.answers;
      if (!isObject(answers) || !Object.keys(answers).length) {
        errors.push('`table.answers` must have at least one blank, keyed "rowIndex:columnKey" such as "0:y"');
        return errors;
      }
      const keys = (table.columns || []).map((column) => column?.key);
      Object.keys(answers).forEach((key) => {
        const [rowIndex, columnKey] = String(key).split(':');
        if (!/^\d+$/.test(rowIndex) || !keys.includes(columnKey)) {
          errors.push(`\`table.answers\` key "${key}" must be "rowIndex:columnKey" using a key from table.columns (${keys.join(', ')})`);
        } else if (Number(rowIndex) >= (table.rows || []).length) {
          errors.push(`\`table.answers\` key "${key}" points past the end of table.rows`);
        }
      });
      return errors;
    },
    optional: ['functionSpec'],
    example: {
      type: 'table', prompt: 'Complete the table for y = 2x + 1.',
      table: {
        columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }],
        rows: [{ x: -1, y: -1 }, { x: 0, y: null }, { x: 1, y: 3 }, { x: 2, y: null }],
        answers: { '1:y': 1, '3:y': 5 },
      },
    },
  },

  orderedPair: {
    label: 'Ordered pair',
    representation: REPRESENTATIONS.ORDERED_PAIRS,
    purpose: 'Answer with a coordinate pair.',
    useWhen: ['The expected answer is a point.'],
    doNotUseWhen: ['The student should plot the point — use graphing or functionGraph.'],
    required: [requires('prompt', 'needs a prompt')],
    optional: ['answer', 'coordinates', 'graph'],
    example: { type: 'orderedPair', prompt: 'Where do the lines meet?', answer: [2, 5] },
  },

  multiAnswer: {
    label: 'Several answers in one question',
    representation: REPRESENTATIONS.SYMBOLIC,
    purpose: 'Collect several labelled responses to one stimulus.',
    useWhen: ['One graph, table or scenario should produce several answers.'],
    doNotUseWhen: ['There is only one thing to answer.'],
    required: [requires('answerFields', 'needs an `answerFields` array — note the name, `fields` is not read')],
    validate: (question) => {
      if (!nonEmptyArray(question.answerFields)) {
        return ['`answerFields` must be a non-empty array, for example [{ "id": "domain", "label": "Domain", "answer": "[-3, 5)" }]'];
      }
      const errors = [];
      question.answerFields.forEach((field, index) => {
        if (!isObject(field)) { errors.push(`answerFields[${index}] must be an object`); return; }
        if (!has(field.id)) errors.push(`answerFields[${index}] needs an id`);
        if (!has(field.label)) errors.push(`answerFields[${index}] needs a label`);
        if (!has(field.answer) && !nonEmptyArray(field.acceptedAnswers)) {
          errors.push(`answerFields[${index}] needs an \`answer\` or an \`acceptedAnswers\` array`);
        }
      });
      return errors;
    },
    optional: ['mathDisplay', 'graph', 'visual'],
    example: {
      type: 'multiAnswer', prompt: 'Use the graph to complete each part.',
      graph: { functions: [{ type: 'quadratic', a: 1, h: 0, k: -4 }], xMin: -6, xMax: 6, yMin: -6, yMax: 6 },
      answerFields: [
        { id: 'domain', label: 'Domain', answer: '(-∞, ∞)' },
        { id: 'range', label: 'Range', answer: '[-4, ∞)' },
      ],
    },
  },

  relationshipModel: {
    label: 'Model a relationship',
    representation: REPRESENTATIONS.INTERACTIVE,
    purpose: 'From a scenario, decide which quantity is independent and which is dependent, and how they are related.',
    useWhen: ['The lesson is about identifying variables and relationship type in a real context.'],
    doNotUseWhen: ['You just want a text answer about a context — that is not what this renders.'],
    required: [
      requires('scenario', 'needs a `scenario` describing the situation'),
      requires('quantities', 'needs a `quantities` array of { id, label } the student picks from'),
      requires('correctIndependentId', 'needs `correctIndependentId`'),
      requires('correctDependentId', 'needs `correctDependentId`'),
    ],
    validate: (question) => {
      const errors = [];
      if (!nonEmptyArray(question.quantities)) {
        errors.push('`quantities` must be a non-empty array');
        return errors;
      }
      const ids = question.quantities.map((quantity) => quantity?.id);
      if (!ids.includes(question.correctIndependentId)) errors.push('`correctIndependentId` must match one of the quantity ids');
      if (!ids.includes(question.correctDependentId)) errors.push('`correctDependentId` must match one of the quantity ids');
      return errors;
    },
    optional: ['relationshipType', 'requireRelationshipType', 'graph', 'axisSetup'],
    example: {
      type: 'relationshipModel',
      prompt: 'Identify the variables in this situation.',
      scenario: 'A pool fills at a steady rate.',
      quantities: [{ id: 'time', label: 'Time (minutes)' }, { id: 'volume', label: 'Water in the pool (litres)' }],
      correctIndependentId: 'time', correctDependentId: 'volume',
    },
  },

  graphScenarioMatch: {
    label: 'Match graphs to scenarios',
    representation: REPRESENTATIONS.GRAPH,
    purpose: 'Drag each scenario onto the graph that tells its story.',
    useWhen: ['Several situations must be matched to several graphs.'],
    doNotUseWhen: ['There is only one graph.'],
    required: [
      requires('graphs', 'needs a `graphs` array'),
      requires('scenarios', 'needs a `scenarios` array'),
      requires('correctMatches', 'needs `correctMatches`'),
    ],
    validate: (question) => {
      const errors = [];
      if (!nonEmptyArray(question.graphs)) errors.push('`graphs` must be a non-empty array');
      if (!nonEmptyArray(question.scenarios)) errors.push('`scenarios` must be a non-empty array');
      if (!has(question.correctMatches)) errors.push('`correctMatches` is required');
      return errors;
    },
    optional: [],
    example: {
      type: 'graphScenarioMatch', prompt: 'Match each story to its graph.',
      graphs: [{ id: 'g1', functions: [{ type: 'line', m: 2, b: 0 }] }, { id: 'g2', functions: [{ type: 'line', m: -2, b: 8 }] }],
      scenarios: [{ id: 's1', text: 'Water fills steadily.' }, { id: 's2', text: 'Water drains steadily.' }],
      correctMatches: { s1: 'g1', s2: 'g2' },
    },
  },

  graphComparison: {
    label: 'Compare graphs',
    representation: REPRESENTATIONS.GRAPH,
    purpose: 'Show two or more graphs side by side and ask what differs.',
    useWhen: ['The point is the comparison between graphs.'],
    doNotUseWhen: ['One graph is enough.'],
    required: [requires('graphs', 'needs a `graphs` array'), requires('fields', 'needs `fields` for the answers')],
    validate: (question) => {
      const errors = [];
      if (!nonEmptyArray(question.graphs)) errors.push('`graphs` must be a non-empty array');
      if (!nonEmptyArray(question.fields)) errors.push('`fields` must be a non-empty array');
      return errors;
    },
    optional: [],
    example: {
      type: 'graphComparison', prompt: 'Compare the two lines.',
      graphs: [{ id: 'a', functions: [{ type: 'line', m: 2, b: 0 }] }, { id: 'b', functions: [{ type: 'line', m: 2, b: 3 }] }],
      fields: [{ id: 'diff', label: 'What changed?', answer: 'the y-intercept' }],
    },
  },

  graphStory: {
    label: 'Write a graph story',
    representation: REPRESENTATIONS.GRAPH,
    purpose: 'The student writes a situation that a given graph could describe.',
    useWhen: ['The skill is explaining a graph in words.'],
    doNotUseWhen: ['You want a computed answer.'],
    required: [requires('prompt', 'needs a prompt')],
    optional: ['graph', 'functionSpec', 'minimumScenarioCharacters', 'minimumExplanationCharacters'],
    example: {
      type: 'graphStory', prompt: 'Describe a situation this graph could show.',
      graph: { functions: [{ type: 'line', m: -1, b: 6 }], xMin: 0, xMax: 8, yMin: 0, yMax: 8 },
    },
  },

  contextInterpretation: {
    label: 'Interpret a point in context',
    representation: REPRESENTATIONS.GRAPH,
    purpose: 'Given a scenario and its graph, say what one specific point means in the situation.',
    useWhen: ['The student must explain the meaning of a coordinate in a real context.'],
    doNotUseWhen: [
      'You want a general "answer this word problem" question. This type is specifically the interpret-a-point interface and nothing else.',
      'The task is notation conversion, interval notation, or any question with no scenario and no point.',
    ],
    required: [
      requires('scenario', 'needs a `scenario`'),
      requires('quantityChoices', 'needs `quantityChoices` for what x and y mean'),
    ],
    validate: (question) => {
      const errors = [];
      if (!has(question.scenario)) errors.push('`scenario` is required — this type interprets a point inside a real situation');
      if (!isObject(question.quantityChoices) && !nonEmptyArray(question.quantityChoices)) {
        errors.push('`quantityChoices` is required so the student can say what each coordinate represents');
      }
      return errors;
    },
    optional: ['graph', 'showGraph', 'point'],
    example: {
      type: 'contextInterpretation',
      prompt: 'What does the point (3, 45) mean here?',
      scenario: 'A car travels at a steady speed.',
      quantityChoices: { x: ['hours driven', 'litres of fuel'], y: ['kilometres travelled', 'cost'] },
      graph: { functions: [{ type: 'line', m: 15, b: 0 }], xMin: 0, xMax: 8, yMin: 0, yMax: 80 },
    },
  },

  relationMapping: {
    label: 'Mapping diagram',
    representation: REPRESENTATIONS.MAPPING,
    purpose: 'Represent a relation as a mapping diagram: domain values on the left, range values on the right, arrows between them.',
    useWhen: [
      'The lesson asks students to represent a relation with a mapping diagram.',
      'The lesson uses a mapping diagram to decide whether a relation is a function.',
    ],
    doNotUseWhen: ['The relation should be plotted — use graphing.'],
    required: [requires('pairs', 'needs a `pairs` array of the relation')],
    validate: (question) => {
      if (!nonEmptyArray(question.pairs)) {
        return ['`pairs` must be a non-empty array of [x, y] pairs, for example [[-2, 3], [1, 2]]'];
      }
      const errors = [];
      question.pairs.forEach((pair, index) => {
        if (!Array.isArray(pair) || pair.length !== 2) errors.push(`pairs[${index}] must be a two-element [x, y] array`);
      });
      return errors;
    },
    optional: ['prompt', 'ask', 'domainLabel', 'rangeLabel'],
    example: {
      type: 'relationMapping',
      prompt: 'Build the mapping diagram for this relation, then state its domain and range.',
      pairs: [[-2, 3], [1, 2], [3, -1], [-4, -3]],
      ask: ['mapping', 'domain', 'range', 'isFunction'],
    },
  },

  modelingLab: {
    label: 'Modeling lab',
    representation: REPRESENTATIONS.INTERACTIVE,
    purpose: 'An open modelling task where the student manipulates parameters and predicts outcomes.',
    useWhen: ['The task is DOK 3 or 4 open modelling.'],
    doNotUseWhen: ['The task has one right answer — use a simpler type.'],
    required: [requires('labDefinition', 'needs a `labDefinition`')],
    validate: (question) => {
      if (!isObject(question.labDefinition)) return ['`labDefinition` must be an object'];
      if (!nonEmptyArray(question.labDefinition.parameters)) return ['`labDefinition.parameters` must have at least one entry'];
      return [];
    },
    optional: ['dok'],
    example: {
      type: 'modelingLab', prompt: 'Model the population.', dok: 3,
      labDefinition: {
        scenario: 'A town grows each year.',
        parameters: [{ id: 'rate', label: 'Growth rate', min: 0.01, max: 0.2, step: 0.01 }],
        targets: [{ id: 'p2030', prompt: 'Predict the 2030 population.' }],
      },
    },
  },
});

export const CATALOGUED_TYPES = Object.freeze(Object.keys(QUESTION_TYPE_CATALOG));

export const getTypeEntry = (type) => QUESTION_TYPE_CATALOG[type] || null;

// The representation a question actually puts in front of a student. Used by
// the Preflight audit to notice that a graph-heavy source produced no graphs.
export const getQuestionRepresentation = (question = {}) => {
  const type = question?.toolId || question?.type;
  const entry = getTypeEntry(type);
  if (entry) {
    // A type that can carry a graph but was not given one is not a graph question.
    if (entry.representation === REPRESENTATIONS.GRAPH) {
      const hasGraph = isObject(question.graph) || isObject(question.visual)
        || has(get(question, 'functionSpec.type')) || nonEmptyArray(question.graphs);
      if (!hasGraph) return REPRESENTATIONS.TEXT;
    }
    if (entry.representation === REPRESENTATIONS.SYMBOLIC && isObject(question.graph)) {
      return REPRESENTATIONS.GRAPH;
    }
    if (entry.representation === REPRESENTATIONS.SYMBOLIC && isObject(question.table)) {
      return REPRESENTATIONS.TABLE;
    }
    return entry.representation;
  }
  // Interactive tools all render their own workspace.
  return type ? REPRESENTATIONS.INTERACTIVE : REPRESENTATIONS.TEXT;
};
