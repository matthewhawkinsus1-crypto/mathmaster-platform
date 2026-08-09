// The finite set of mathematical interactions a question may compose.
//
// THIS FILE IS THE BOUNDARY. A question's `workflow` array chooses from these
// and nothing else. That restriction is what makes the composition safe: an
// authoring AI gets freedom of ARRANGEMENT without freedom of INVENTION, so a
// generated question can be validated completely before a student ever sees it.
// An unknown `kind` fails Preflight; it never renders as an empty box.
//
// Adding a primitive here is a deliberate act. Adding one because a single
// lesson wanted a slightly different worksheet is the mistake this whole layer
// exists to prevent — the test is whether the interaction is a distinct
// MATHEMATICAL act, not whether it is a distinct question.
//
// Each entry declares:
//   produces   what a completed stage yields, so a later stage can consume it
//   consumes   what kinds of upstream output it can be driven by
//   schema     the fields it accepts, validated strictly

export const STAGE_OUTPUT = Object.freeze({
  EQUATION: 'equation',
  TABLE: 'table',
  POINTS: 'points',
  GRAPH: 'graph',
  MAPPING: 'mapping',
  INTERVAL: 'interval',
  SET: 'set',
  CHOICE: 'choice',
  TEXT: 'text',
  ROLES: 'roles',
});

const stage = (id, definition) => [id, Object.freeze({ id, ...definition })];

export const INTERACTION_STAGES = Object.freeze(Object.fromEntries([
  stage('quantityRoles', {
    label: 'Identify the quantities',
    studentAction: 'Names which quantity is independent and which is dependent.',
    produces: STAGE_OUTPUT.ROLES,
    consumes: [],
    fields: { prompt: 'string', quantities: 'array', correctIndependentId: 'string', correctDependentId: 'string' },
  }),
  stage('equationInput', {
    label: 'Write the equation',
    studentAction: 'Writes a function or equation for the situation.',
    produces: STAGE_OUTPUT.EQUATION,
    consumes: [STAGE_OUTPUT.ROLES],
    fields: { prompt: 'string', placeholder: 'string' },
  }),
  stage('tableInput', {
    label: 'Complete the table',
    studentAction: 'Fills in the missing table values.',
    produces: STAGE_OUTPUT.TABLE,
    // Driven by the student's own equation where the question asks for it.
    consumes: [STAGE_OUTPUT.EQUATION],
    fields: { prompt: 'string', xValues: 'array', columns: 'array' },
  }),
  stage('coordinatePlot', {
    label: 'Plot the points',
    studentAction: 'Places ordered pairs on a coordinate plane.',
    produces: STAGE_OUTPUT.POINTS,
    consumes: [STAGE_OUTPUT.TABLE, STAGE_OUTPUT.EQUATION],
    fields: { prompt: 'string', graph: 'object', pairs: 'array' },
  }),
  stage('functionGraph', {
    label: 'Build the graph',
    studentAction: 'Constructs a continuous function graph.',
    produces: STAGE_OUTPUT.GRAPH,
    consumes: [STAGE_OUTPUT.EQUATION, STAGE_OUTPUT.TABLE],
    fields: { prompt: 'string', graph: 'object', graphMode: 'string' },
  }),
  stage('mappingDiagram', {
    label: 'Build the mapping diagram',
    studentAction: 'Draws the arrows from each input to its output.',
    produces: STAGE_OUTPUT.MAPPING,
    consumes: [STAGE_OUTPUT.POINTS],
    fields: { prompt: 'string', domainLabel: 'string', rangeLabel: 'string' },
  }),
  stage('numberLine', {
    label: 'Graph on a number line',
    studentAction: 'Shades intervals and places endpoints on a number line.',
    produces: STAGE_OUTPUT.INTERVAL,
    consumes: [],
    fields: { prompt: 'string', min: 'number', max: 'number', step: 'number' },
  }),
  stage('domainInput', {
    label: 'State the domain',
    studentAction: 'States the domain.',
    produces: STAGE_OUTPUT.SET,
    consumes: [STAGE_OUTPUT.GRAPH, STAGE_OUTPUT.POINTS, STAGE_OUTPUT.TABLE, STAGE_OUTPUT.EQUATION],
    fields: { prompt: 'string', notation: 'string' },
  }),
  stage('rangeInput', {
    label: 'State the range',
    studentAction: 'States the range.',
    produces: STAGE_OUTPUT.SET,
    consumes: [STAGE_OUTPUT.GRAPH, STAGE_OUTPUT.POINTS, STAGE_OUTPUT.TABLE, STAGE_OUTPUT.EQUATION],
    fields: { prompt: 'string', notation: 'string' },
  }),
  stage('intervalInput', {
    label: 'Write the interval',
    studentAction: 'Writes an interval or union in the requested notation.',
    produces: STAGE_OUTPUT.INTERVAL,
    consumes: [STAGE_OUTPUT.GRAPH, STAGE_OUTPUT.INTERVAL],
    fields: { prompt: 'string', notation: 'string' },
  }),
  stage('classification', {
    label: 'Classify',
    studentAction: 'Chooses between named categories.',
    produces: STAGE_OUTPUT.CHOICE,
    consumes: [STAGE_OUTPUT.GRAPH, STAGE_OUTPUT.TABLE, STAGE_OUTPUT.POINTS],
    fields: { prompt: 'string', choices: 'array' },
  }),
  stage('multipleChoice', {
    label: 'Choose an answer',
    studentAction: 'Selects one supplied option.',
    produces: STAGE_OUTPUT.CHOICE,
    consumes: [],
    fields: { prompt: 'string', choices: 'array' },
  }),
  stage('interpretation', {
    label: 'Interpret in context',
    studentAction: 'Explains what a value or feature means in the situation.',
    produces: STAGE_OUTPUT.TEXT,
    consumes: [STAGE_OUTPUT.EQUATION, STAGE_OUTPUT.GRAPH, STAGE_OUTPUT.TABLE],
    fields: { prompt: 'string', feature: 'string' },
  }),
  stage('shortResponse', {
    label: 'Short written answer',
    studentAction: 'Writes a short answer.',
    produces: STAGE_OUTPUT.TEXT,
    consumes: [],
    fields: { prompt: 'string' },
  }),
  stage('algebraWorkspace', {
    label: 'Solve on the balance workspace',
    studentAction: 'Performs balanced operations step by step.',
    produces: STAGE_OUTPUT.EQUATION,
    consumes: [STAGE_OUTPUT.EQUATION],
    fields: { prompt: 'string', equation: 'string', workspaceDifficulty: 'number' },
  }),
]));

export const STAGE_KINDS = Object.freeze(Object.keys(INTERACTION_STAGES));

// `graphConstruction` reads better in authored JSON than choosing between two
// graph primitives, so it is accepted and resolved by its mode. It is an alias,
// not a sixteenth primitive — the whitelist stays the whitelist.
const ALIASES = Object.freeze({
  graphConstruction: (raw) => (String(raw?.graphMode || '').toLowerCase() === 'discrete' ? 'coordinatePlot' : 'functionGraph'),
  scatterPlot: () => 'coordinatePlot',
  equationBuilder: () => 'equationInput',
});

export const resolveStageKind = (raw) => {
  const kind = String(raw?.kind || '');
  if (INTERACTION_STAGES[kind]) return kind;
  const alias = ALIASES[kind];
  return alias ? alias(raw) : null;
};

export const getStage = (kind) => INTERACTION_STAGES[kind] || null;

export const isKnownStageKind = (kind) => Boolean(INTERACTION_STAGES[kind] || ALIASES[kind]);

export const listStageAliases = () => Object.keys(ALIASES);
