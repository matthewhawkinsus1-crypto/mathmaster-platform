const clean = (value) => String(value ?? '').trim();
const normalize = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const GENERIC_FILLER_PATTERNS = [
  /^read (the )?(prompt|question)( carefully)?$/,
  /^read (the )?(prompt|question) and (identify|determine) what (must|needs to) be (entered|done|answered)$/,
  /^identify what (the question|prompt) (is asking|asks)$/,
  /^complete (the )?(current )?(response|response field|answer)$/,
  /^enter (your|the) (answer|response)$/,
  /^solve (the )?(problem|question)$/,
  /^work (the )?(problem|question)$/,
  /^think carefully$/,
  /^check (your|the) answer$/,
  /^check the response and revise (any )?(named )?incorrect part(s)?$/,
  /^use the graph$/,
  /^use the table$/,
];

const MATH_SIGNAL = /(variable|equation|function|input|output|domain|range|interval|slope|rate|intercept|vertex|maximum|minimum|asymptote|factor|term|coefficient|inverse|operation|substitut|ordered pair|coordinate|table|graph|axis|scale|discrete|continuous|mapping|relation|denominator|numerator|inequality|endpoint|open circle|closed circle|system|sequence|ratio|difference|quadratic|linear|exponential|absolute value|units?|x-value|y-value|zero|solution|expression|model|quantity|quantities|symmetr|increasing|decreasing|positive|negative)/i;

export const isMeaningfulGuidedInstruction = (text) => {
  const value = clean(text);
  if (!value) return false;
  const normalized = normalize(value);
  if (GENERIC_FILLER_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  return MATH_SIGNAL.test(value) || value.split(/\s+/).length >= 12;
};

const normalizeAuthoredStep = (raw, index) => {
  if (typeof raw === 'string') {
    return isMeaningfulGuidedInstruction(raw)
      ? { id: `guided-${index + 1}`, title: `Guidance ${index + 1}`, instruction: clean(raw) }
      : null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const instruction = clean(raw.instruction || raw.text || raw.note || raw.guidance);
  if (!isMeaningfulGuidedInstruction(instruction)) return null;
  return {
    id: clean(raw.id) || `guided-${index + 1}`,
    title: clean(raw.title) || clean(raw.label) || `Guidance ${index + 1}`,
    instruction,
    stageId: clean(raw.stageId || raw.stage) || null,
    stageKind: clean(raw.stageKind || raw.kind) || null,
  };
};

export const getAuthoredGuidedNotes = (question = {}) => {
  const rawSteps = Array.isArray(question?.guidedNotes?.steps)
    ? question.guidedNotes.steps
    : Array.isArray(question?.guidedSteps)
      ? question.guidedSteps
      : [];
  return rawSteps.map(normalizeAuthoredStep).filter(Boolean);
};

const stageGuidance = (stage = {}, question = {}) => {
  const kind = clean(stage.kind);
  const title = clean(stage.guidanceTitle) || clean(stage.prompt) || ({
    quantityRoles: 'Identify the quantities',
    axisSetup: 'Set up the axes',
    equationInput: 'Write the relationship',
    tableInput: 'Complete the table',
    functionGraph: 'Build the graph',
    coordinatePlot: 'Plot the ordered pairs',
    domainInput: 'Describe the domain',
    rangeInput: 'Describe the range',
    classification: 'Classify the relationship',
    intervalConstruction: 'Graph the interval',
    mappingDiagram: 'Build the mapping',
  }[kind] || 'Work the current math step');

  const notation = clean(stage.notation || question.notation).toLowerCase();
  const graphMode = clean(stage.graphMode || question.graphMode || question.continuity).toLowerCase();
  const guidanceByKind = {
    quantityRoles: 'Ask which quantity can be chosen or measured first. That quantity is the independent input; the quantity whose value changes because of it is the dependent output. Check the units to make sure the roles make sense.',
    axisSetup: 'Put the independent quantity on the horizontal axis and the dependent quantity on the vertical axis. Include units, then choose a count-by scale that reaches every needed value without crowding the graph.',
    equationInput: 'Translate the relationship into a rule using the independent quantity as the input. Identify any starting value and the rate or operation that changes the output, then check that the units on both sides of the equation agree.',
    tableInput: 'Use the function rule or equation from the problem (or the rule you created earlier). Substitute each displayed input and record the corresponding output. Keep exact fractions or decimals unless the problem explicitly tells you to round.',
    functionGraph: `Use the equation or validated table as the source of your graph. Plot accurate key points first${graphMode === 'continuous' ? ', then connect them with the appropriate continuous shape because values between the listed inputs are included' : ''}. Do not change a table value just to make the graph easier to draw.`,
    coordinatePlot: 'Treat each completed table row as an ordered pair (input, output). Plot every pair at its exact coordinate. Keep the points separate when the relationship is discrete; do not connect them unless the context says values between the points are meaningful.',
    domainInput: `Describe every allowable input value, not just the values that happen to be displayed. ${notation === 'set' ? 'For a discrete relationship, use set/roster notation or the provided discrete choice.' : 'For a continuous relationship, use interval notation or inequalities and pay attention to included versus excluded endpoints.'}`,
    rangeInput: `Describe every output value the relation can produce. ${notation === 'set' ? 'For discrete outputs, list or choose the actual attainable values/pattern.' : 'For continuous outputs, use interval notation or inequalities and use the graph to identify any highest, lowest, or excluded value.'}`,
    classification: 'Decide whether values between the displayed inputs are meaningful in the situation. Measurements such as time, distance, or volume can usually vary continuously; counts of whole objects such as tickets or students are discrete.',
    intervalConstruction: 'Place each endpoint at the boundary value. Use a closed circle when equality is included (≤ or ≥) and an open circle when it is excluded (< or >), then shade only the values that satisfy the inequality.',
    mappingDiagram: 'List each distinct input once on the left and each distinct output once on the right. Draw an arrow for every ordered pair. A relation is a function only if each input points to exactly one output.',
  };
  const instruction = clean(stage.guidance || stage.guidedNote) || guidanceByKind[kind];
  return instruction && isMeaningfulGuidedInstruction(instruction)
    ? { id: `stage-${clean(stage.id) || kind}`, title, instruction, stageId: clean(stage.id) || null, stageKind: kind || null }
    : null;
};

const typeGuidance = (question = {}) => {
  const type = clean(question.type || question.toolId);
  const specs = {
    stepAlgebra: [
      ['Choose the inverse operation', 'Identify the operation attached to the target variable. Apply the inverse operation to both sides so the equation stays balanced; do not simplify a side until the operation has actually been applied.'],
      ['Show the cancellation', 'Mark only the zero pair or identity pair created by your operation. Then simplify the remaining expression and repeat until the requested variable is isolated.'],
    ],
    algebra: [
      ['Plan the equation move', 'Identify the term or operation preventing the variable from being isolated. Use the inverse operation on both sides and keep equivalent expressions on the two sides of the equation.'],
    ],
    literal: [
      ['Isolate the requested variable', 'Treat every other letter as a known quantity. Undo addition/subtraction before multiplication/division when that keeps the algebra clean, and apply each operation to both sides of the equation.'],
    ],
    table: [
      ['Complete the table mathematically', 'Substitute each listed input into the rule and compute the matching output. Preserve exact fractions or decimals unless rounding is explicitly required, then check that the input-output pattern agrees with the rule.'],
    ],
    numberLine: [
      ['Build the inequality graph', 'Place the boundary value first. Use a closed endpoint for ≤ or ≥ and an open endpoint for < or >, then shade in the direction containing all values that satisfy the inequality.'],
    ],
    intervalNumberLine: [
      ['Build the interval', 'Match each bracket/parenthesis decision to the endpoint: included endpoints are closed and excluded endpoints are open. Shade between or away from the endpoints exactly as the inequalities require.'],
    ],
    relationMapping: [
      ['Track each input', 'Build the mapping from the ordered pairs. If one input is paired with two different outputs, the relation is not a function; repeated output values are allowed.'],
    ],
    graphAnalysis: [
      ['Read the graph by feature', 'For each requested attribute, identify the relevant x-values or y-values on the graph first. Use intercepts, turning points, and left-to-right behavior to support interval, domain, range, positive/negative, and extrema answers.'],
    ],
    functionGraph: [
      ['Use the function structure', 'Start with the key structural feature of the function family (such as an intercept, vertex, or asymptote), choose useful input values, and plot accurate points before connecting the graph.'],
      ['Check the requested attributes', 'Read domain, range, intercepts, extrema, and increasing/decreasing behavior from the graph you built. State intervals using x-values, not y-values.'],
    ],
    functionInvestigation: [
      ['Use the function structure', 'Locate the family’s key feature first, then generate enough accurate points to reveal the shape. Keep the graph consistent with any domain restriction or endpoint information in the prompt.'],
      ['Analyze the finished graph', 'Use the completed graph to identify domain, range, intercepts, extrema, and intervals. For increasing/decreasing/positive/negative behavior, report the x-values over which that behavior occurs.'],
    ],
    relationshipModel: [
      ['Connect the representations', 'Start with the independent and dependent quantities, then keep the same relationship consistent as you move through equation, table, graph, domain/range, and discrete/continuous classification. Later representations should come from the work you established earlier.'],
    ],
    graphScenarioMatch: [
      ['Match behavior to context', 'Compare what each axis represents, the starting value, whether the graph rises/falls/stays constant, and whether the situation is discrete or continuous. Match the full behavior, not just the overall direction.'],
    ],
    graphComparison: [
      ['Compare one feature at a time', 'Compare the graphs using specific mathematical features such as intercepts, symmetry, increasing/decreasing behavior, extrema, continuity, or shape. Use the feature named in the prompt as evidence for the comparison.'],
    ],
    openSortBoard: [
      ['Create a mathematical sorting rule', 'Choose a property that can be checked on every card, such as function/non-function, continuous/discrete, family, symmetry, or left-to-right behavior. Place every card consistently, then explain the property that defines each group.'],
    ],
    constraintFunctionBuilder: [
      ['Satisfy the constraints, not one secret equation', 'Translate each required characteristic into a feature of the function family. Adjust parameters until every listed constraint is true, then use the graph and equation together to verify the construction.'],
    ],
  };
  return (specs[type] || []).map(([title, instruction], index) => ({ id: `type-${type}-${index + 1}`, title, instruction }));
};

export const resolveGuidedNotes = (question = {}, { mode = 'automatic' } = {}) => {
  if (mode === 'off') return [];
  const authored = getAuthoredGuidedNotes(question);
  if (authored.length || mode === 'authoredOnly') return authored;

  const workflow = Array.isArray(question?.workflow) ? question.workflow : [];
  if (workflow.length) return workflow.map((stage) => stageGuidance(stage, question)).filter(Boolean);
  return typeGuidance(question).filter((step) => isMeaningfulGuidedInstruction(step.instruction));
};
