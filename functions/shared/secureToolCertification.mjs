/*
 * WHICH RICH TOOLS MAY RUN ON A SECURE TEST — DECLARED ONCE, AS DATA.
 *
 * A Test Cycle must be able to say, before a student sits down, whether every
 * question it will issue can actually be rendered, answered, recorded and
 * graded in the secure runtime. "Can this be graded?" was already answered by
 * the Path Tool Contract. "Can this be TAKEN securely?" was not answered
 * anywhere, and the gap was real: a graphing family passed preflight as
 * gradable, then reached the student as a bare "Answer" box and was scored 0.
 *
 * This module is the answer, per tool, instead of `if (tool === …)` scattered
 * through Test Cycle code. Every caller — preflight, issuance, the teacher
 * blueprint view, the certification suite — asks `certifySecureItem` and
 * reads the same verdict.
 *
 * WHAT A CERTIFICATION ASSERTS.
 *
 *   publicPrivateContract  a per-tool ALLOWLIST builds the browser payload and
 *                          the answer stays in a server-only definition
 *                          (pathToolContracts.mjs). Without this a tool cannot
 *                          be secure, however good its grader is.
 *   serializableResponse   the student's construction leaves the tool as plain
 *                          data the grader reads (points, intervals, the final
 *                          relation, the placement state) — never a verdict.
 *   serverGradeable        the server grades that data; nothing the browser
 *                          claims about correctness is read.
 *   modes                  secureTest / secureRetest / corrections /
 *                          teacherPreview — each certified separately.
 *   assistanceRemoved      the Category B material the secure payload loses
 *                          (questionRuntimePolicy.mjs), and the tool-level
 *                          settings forced for assessment (e.g. the algebra
 *                          workspace never auto-simplifies on a Test).
 *   devices                where the tool has been exercised at classroom
 *                          sizes. `phone` is claimed only where it was.
 *   calculator             whether the item needs the platform calculator.
 *
 * A tool that is NOT listed here is not certified, and preflight names it in a
 * teacher's words ("Target A.5C uses Transformations Lab, which has not been
 * certified for Secure Test mode") instead of letting Question 7 fail in front
 * of a student. Certifying another tool means writing its public/private
 * contract and adding it here — not adding a branch to the Test Cycle.
 *
 * Pure: no Firestore, no DOM.
 */

import { declaredToolId } from './legacyFieldGrading.mjs';
import { resolvePathToolId } from './pathToolContracts.mjs';
import { QUESTION_RUNTIME_MODES, isSecureRuntimeMode } from './questionRuntimePolicy.mjs';

const clean = (value) => String(value ?? '').trim();

export const SECURE_ITEM_MODES = Object.freeze([
  QUESTION_RUNTIME_MODES.SECURE_TEST,
  QUESTION_RUNTIME_MODES.SECURE_RETEST,
  QUESTION_RUNTIME_MODES.CORRECTIONS,
  'teacherPreview',
]);

const ALL_MODES = Object.freeze({
  secureTest: true,
  secureRetest: true,
  corrections: true,
  teacherPreview: true,
});

const BOTH_TOUCH = Object.freeze({ chromebook: true, ipad: true });

/*
 * SECURE-MODE SETTINGS A TOOL IS GIVEN, REGARDLESS OF AUTHORING.
 *
 * Applied to the PUBLIC payload on the server in a secure mode, after the
 * contract's allowlist and the assistance strip. Each is a Category B switch
 * that lives inside a tool's own configuration rather than in a hint key:
 * Step Algebra's support level 1 does the opposite-side arithmetic for the
 * student, which on a Test is the platform solving part of the item.
 */
const OPEN_ALGEBRA_WORKSPACE = Object.freeze({ workspaceDifficulty: 5, supportLevel: 5 });

/*
 * WHAT A STEP-BY-STEP ALGEBRA ITEM MEASURES ON A SECURE TEST.
 *
 * The workspace keeps an equation an equation: it refuses a rewrite or a
 * simplification that is not equivalent, and an invalid move, before applying
 * it. That is how the tool works, not feedback the secure policy can switch
 * off — but it means a student cannot record a wrong intermediate step. No
 * verdict is given on a committed move and the final answer is the student's;
 * the teacher is told what the item does and does not measure.
 */
const ALGEBRA_WORKSPACE_CAVEAT = 'The step-by-step workspace refuses a rewrite or simplification that is not equivalent, so the student\'s intermediate arithmetic is checked before the answer is recorded: the item measures choosing and completing the moves, not error-free arithmetic.';

/*
 * WHAT A FUNCTION INVESTIGATION ITEM MUST NOT CARRY ON A SECURE TEST.
 *
 * A point card states its x ("Plot the point where x = 2") so the student only
 * finds the height. Where the card names a feature the student has to LOCATE —
 * the vertex, an x-intercept, a zero, a maximum, a point placed by its distance
 * from the vertex or across the axis — that x is the answer: "Plot the
 * x-intercept: x = −5" leaves y = 0 to find. On a secure item those cards lose
 * their x, exactly as the workspace's own key points do (taskStatesX): the
 * card names the feature, the student places it, the server grades both
 * coordinates against its private definition.
 *
 * EXCEPT a card an inverse reflection reflects. The workspace locates each
 * reflected point from its source card's x; without it a reflected point can
 * never count as placed, and the item could never be recorded. On those items
 * the source's x is read from the equation shown, so it gives nothing away.
 */
const LOCATED_FEATURE = /\b(vertex|x-intercepts?|zeros?|roots?|maximum|minimum|turning point|axis|symmetric)\b/i;

const inverseSourceIds = (tool = {}) => new Set([
  ...(Array.isArray(tool.inverseReflection?.sourceTaskIds) ? tool.inverseReflection.sourceTaskIds : []),
  ...(Array.isArray(tool.analysisRequests) ? tool.analysisRequests.map((part) => part?.sourceTaskId) : []),
].filter(Boolean).map(String));

const secureFunctionInvestigation = (tool = {}) => {
  if (!Array.isArray(tool.pointTasks)) return tool;
  const sources = inverseSourceIds(tool);
  return {
    ...tool,
    pointTasks: tool.pointTasks.map((task) => {
      if (!task || typeof task !== 'object' || sources.has(String(task.id))) return task;
      if (!LOCATED_FEATURE.test(`${task.label || ''} ${task.prompt || ''}`)) return task;
      const { x: _statedX, ...located } = task;
      return located;
    }),
  };
};

/*
 * AN ITEM WHOSE OWN DEFINITION STATES THE ANSWER IS NOT A SECURE ITEM.
 *
 * The workspace needs the function it graphs, and a quadratic is authored in
 * vertex form {a, h, k}. Where the item SHOWS the equation in vertex form the
 * vertex is given, by design. Where it shows another form ("Graph
 * y = 2x² − 8x + 6 … identify the vertex and axis of symmetry") and asks for
 * the vertex or the axis, the payload's h and k are the answer — and that
 * family's flanking cards state x-values symmetric about it too. No secure
 * setting can remove what the workspace needs to draw, so such an item is
 * refused on a secure Test or Retest (preflight names it); Corrections, which
 * teach, still use it.
 */
const SHOWN_VERTEX_FORM = /\(\s*[a-z]\s*[-+][^()]*(?:\([^()]*\))?[^()]*\)\s*\^\s*\{?2/i;
const ASKS_VERTEX = /\b(vertex|axis|maximum|minimum|turning point)\b/i;

const functionInvestigationExposure = (question = {}) => {
  const spec = question.functionSpec || question.tool?.functionSpec;
  if (!spec || spec.type !== 'quadratic' || spec.h === undefined || spec.k === undefined) return null;
  const analysis = Array.isArray(question.analysisRequests) ? question.analysisRequests : (question.tool?.analysisRequests || []);
  const asksVertex = analysis.some((part) => ASKS_VERTEX.test(`${part?.label || ''} ${part?.prompt || ''}`)
    || ['vertex', 'localMaximum', 'localMinimum'].includes(String(part?.feature || '')));
  if (!asksVertex) return null;
  const shown = `${question.equationLatex || question.tool?.equationLatex || ''} ${question.prompt || question.tool?.prompt || ''}`;
  if (SHOWN_VERTEX_FORM.test(shown)) return null;
  return 'it asks for the vertex or axis of a parabola it does not show in vertex form, and the graph definition the workspace draws from carries that vertex';
};

/**
 * One entry per Path-contract tool that is certified for secure delivery.
 * `label` is what a teacher reads; `category` places it in the addendum's
 * Category A list of response/representation tools.
 */
export const SECURE_TOOL_CERTIFICATIONS = Object.freeze({
  graphing2: Object.freeze({
    label: 'Graphing',
    category: 'graphConstruction',
    representation: 'graph',
    responseShape: 'graphingConstruction',
    requiresGraphing: true,
    requiresCalculator: false,
    modes: ALL_MODES,
    devices: Object.freeze({ ...BOTH_TOUCH, phone: false }),
    secureSettings: Object.freeze({}),
  }),
  functionInvestigation: Object.freeze({
    label: 'Function Investigation (coordinate plane)',
    category: 'coordinatePlane',
    representation: 'graph',
    responseShape: 'graphWork',
    requiresGraphing: true,
    requiresCalculator: false,
    modes: ALL_MODES,
    devices: Object.freeze({ ...BOTH_TOUCH, phone: false }),
    // The workspace's own "check my point" affordance follows the activity's
    // hint permission (QuestionEngine selfCheckAllowed); nothing to force.
    secureSettings: Object.freeze({}),
    secureTransform: secureFunctionInvestigation,
    secureExposure: functionInvestigationExposure,
  }),
  systemsWorkspace: Object.freeze({
    label: 'Systems Workspace',
    category: 'systems',
    representation: 'multiple',
    responseShape: 'systemsWorkspace',
    requiresGraphing: true,
    requiresCalculator: false,
    modes: ALL_MODES,
    devices: Object.freeze({ ...BOTH_TOUCH, phone: false }),
    secureSettings: Object.freeze({}),
  }),
  stepAlgebra: Object.freeze({
    label: 'Step-by-step algebra workspace',
    category: 'algebraWorkspace',
    representation: 'symbolic',
    responseShape: 'finalEquationOrRelation',
    requiresGraphing: false,
    requiresCalculator: false,
    modes: ALL_MODES,
    devices: Object.freeze({ ...BOTH_TOUCH, phone: true }),
    secureSettings: OPEN_ALGEBRA_WORKSPACE,
    caveat: () => ALGEBRA_WORKSPACE_CAVEAT,
  }),
  algebra: Object.freeze({
    label: 'Algebra balance workspace',
    category: 'algebraWorkspace',
    representation: 'symbolic',
    responseShape: 'finalEquationOrValue',
    requiresGraphing: false,
    requiresCalculator: false,
    modes: ALL_MODES,
    devices: Object.freeze({ ...BOTH_TOUCH, phone: true }),
    secureSettings: OPEN_ALGEBRA_WORKSPACE,
    caveat: () => ALGEBRA_WORKSPACE_CAVEAT,
  }),
  intervalNumberLine: Object.freeze({
    label: 'Number line and intervals',
    category: 'numberLine',
    representation: 'graph',
    responseShape: 'intervals',
    requiresGraphing: false,
    requiresCalculator: false,
    modes: ALL_MODES,
    devices: Object.freeze({ ...BOTH_TOUCH, phone: true }),
    secureSettings: Object.freeze({}),
  }),
  relationMapping: Object.freeze({
    label: 'Mapping diagram',
    category: 'dragConnect',
    representation: 'multiple',
    responseShape: 'relation',
    requiresGraphing: false,
    requiresCalculator: false,
    modes: ALL_MODES,
    devices: Object.freeze({ ...BOTH_TOUCH, phone: true }),
    secureSettings: Object.freeze({}),
    // The diagram's nodes ARE the relation's distinct inputs and outputs —
    // drawing arrows needs them on screen. So an item that asks for the arrows
    // AND the domain or range lists those answers as the nodes. Not a key in
    // the payload; a property of the representation, said to the teacher.
    caveat: (question = {}) => {
      const ask = Array.isArray(question.ask) && question.ask.length ? question.ask.map(String) : ['mapping', 'domain', 'range'];
      return ask.includes('mapping') && (ask.includes('domain') || ask.includes('range'))
        ? 'Mapping diagram items show every input and output as a node, so asking for the domain or range as well as the arrows is not independent evidence of either.'
        : null;
    },
  }),
  dataModelingLab: Object.freeze({
    label: 'Data Modeling Lab (scatterplot and regression)',
    category: 'regressionData',
    representation: 'table',
    responseShape: 'dataModeling',
    requiresGraphing: true,
    requiresCalculator: true,
    modes: ALL_MODES,
    devices: Object.freeze({ ...BOTH_TOUCH, phone: false }),
    secureSettings: Object.freeze({}),
    // Technology the item provides on purpose: the lab computes regression,
    // r and residual error from the visible data, exactly as an approved
    // statistics calculator would. Category A where the standard assesses
    // using technology (A.4A "calculate, using technology, the correlation
    // coefficient"); a teacher told plainly where the blueprint withholds a
    // calculator.
    providesTechnology: 'regression, correlation and residual error',
  }),
  regressionCalculator: Object.freeze({
    label: 'Regression calculator',
    category: 'regressionData',
    representation: 'table',
    responseShape: 'regressionWorkflow',
    requiresGraphing: false,
    requiresCalculator: true,
    modes: ALL_MODES,
    devices: Object.freeze({ ...BOTH_TOUCH, phone: false }),
    secureSettings: Object.freeze({}),
    providesTechnology: 'linear regression and correlation',
  }),
  system: Object.freeze({
    label: 'Systems (ordered-pair response)',
    category: 'systems',
    representation: 'symbolic',
    responseShape: 'orderedPair',
    requiresGraphing: false,
    requiresCalculator: false,
    modes: ALL_MODES,
    devices: Object.freeze({ ...BOTH_TOUCH, phone: true }),
    secureSettings: Object.freeze({}),
  }),
  multiAnswer: Object.freeze({
    label: 'Structured multi-part response',
    category: 'multiPart',
    representation: 'multiple',
    responseShape: 'fields',
    requiresGraphing: false,
    requiresCalculator: false,
    modes: ALL_MODES,
    devices: Object.freeze({ ...BOTH_TOUCH, phone: true }),
    secureSettings: Object.freeze({}),
  }),
});

/*
 * Registry tools with no public/private contract yet. Listed so a teacher is
 * told WHY rather than "unknown tool", and so the certification suite can
 * prove nothing here is silently treated as certified. The reason is the same
 * for each: the browser payload has no allowlist, so the only safe thing the
 * secure runtime could send is the whole question, answer included.
 */
export const UNCERTIFIED_TOOL_REASON = 'has no public/private Path Tool Contract yet, so the secure runtime cannot send it without its answer.';

/** The tool a question or family declares, canonicalised where a contract exists. */
export const resolveSecureToolId = (question) => {
  const canonical = resolvePathToolId(question);
  if (canonical) return canonical;
  const declared = declaredToolId(question || {});
  return declared || null;
};

export const secureToolCertification = (toolId) => SECURE_TOOL_CERTIFICATIONS[clean(toolId)] || null;

export const isSecureToolCertified = (toolId, mode = QUESTION_RUNTIME_MODES.SECURE_TEST) => (
  secureToolCertification(toolId)?.modes?.[clean(mode)] === true
);

const TOOL_LABELS_FALLBACK = Object.freeze({
  transformationsLab: 'Transformations Lab',
  sequenceExplorer: 'Sequence Explorer',
  representationMatch: 'Representation Match',
  representationBridge: 'Representation Bridge',
  openSortBoard: 'Open Sort Board',
  linearTableWorkbench: 'Linear Table Workbench',
  polynomialWorkshop: 'Polynomial Workshop',
  parabolaGeometryLab: 'Parabola Geometry Lab',
  complexPlaneLab: 'Complex Plane Lab',
  exponentialLogBridge: 'Exponential ↔ Log Bridge',
  functionOperationsLab: 'Function Operations Workbench',
  inverseCompositionLab: 'Inverse & Composition Lab',
  signSolutionAnalyzer: 'Sign & Solution Analyzer',
  constraintFunctionBuilder: 'Constraint-Based Function Builder',
  expressionMeaning: 'Expression Meaning',
  stepAlgebra2: 'Solving Equations Step by Step',
  functionInvestigation2: 'Function Investigation',
});

export const secureToolLabel = (toolId) => (
  secureToolCertification(toolId)?.label || TOOL_LABELS_FALLBACK[clean(toolId)] || clean(toolId) || 'Response fields'
);

/**
 * The secure rendering contract of ONE question or family, for one mode.
 *
 *   { compatible, toolId, kind: 'fields' | 'richTool', label, reason, ... }
 *
 * A question that declares no tool is the field-graded kind every secure Test
 * has issued so far; it is compatible in every mode and renders through the
 * shared generic response renderer. A question that declares a tool is
 * compatible only if that tool is certified for the mode.
 */
export const certifySecureItem = (question, { mode = QUESTION_RUNTIME_MODES.SECURE_TEST } = {}) => {
  const toolId = resolveSecureToolId(question);
  if (!toolId) {
    return Object.freeze({
      compatible: true,
      kind: 'fields',
      toolId: null,
      label: 'Response fields',
      mode,
      requiresGraphing: false,
      requiresCalculator: false,
      serializableResponse: true,
      serverGradeable: true,
      devices: Object.freeze({ chromebook: true, ipad: true, phone: true }),
      reason: null,
    });
  }
  const certification = secureToolCertification(toolId);
  if (!certification) {
    return Object.freeze({
      compatible: false,
      kind: 'richTool',
      toolId,
      label: secureToolLabel(toolId),
      mode,
      serializableResponse: false,
      serverGradeable: false,
      reason: `${secureToolLabel(toolId)} ${UNCERTIFIED_TOOL_REASON}`,
    });
  }
  // An item can be refused on a secure Test where the tool is not: its own
  // definition would hand over the answer (secureExposure).
  const exposure = isSecureRuntimeMode(mode) && typeof certification.secureExposure === 'function'
    ? certification.secureExposure(question || {})
    : null;
  const certified = certification.modes[clean(mode)] === true && !exposure;
  return Object.freeze({
    compatible: certified,
    kind: 'richTool',
    toolId,
    label: certification.label,
    mode,
    category: certification.category,
    responseShape: certification.responseShape,
    requiresGraphing: certification.requiresGraphing,
    requiresCalculator: certification.requiresCalculator,
    serializableResponse: true,
    serverGradeable: true,
    devices: certification.devices,
    reason: certified ? null : exposure
      ? `This ${certification.label} item is not secure: ${exposure}.`
      : `${certification.label} has not been certified for ${mode} mode.`,
  });
};

/**
 * The settings a secure mode forces onto a tool's public payload.
 *
 * Non-secure modes return the payload untouched; so does a tool with nothing
 * to force. Never removes a Category A setting.
 */
export const applySecureToolSettings = (toolPayload, { secure = true } = {}) => {
  if (!secure || !toolPayload?.pathToolId) return toolPayload ?? null;
  const certification = secureToolCertification(toolPayload.pathToolId);
  const settings = certification?.secureSettings || {};
  const transform = typeof certification?.secureTransform === 'function' ? certification.secureTransform : null;
  if (!Object.keys(settings).length && !transform) return toolPayload;
  const tool = { ...toolPayload.tool, ...settings };
  return { ...toolPayload, tool: transform ? transform(tool) : tool };
};

/**
 * What a teacher should know about one secure item that does not block it.
 *
 * `blueprintCalculatorMode` is the Test's calculator setting: a tool that IS
 * technology (regression, correlation) on a Test that otherwise gives no
 * calculator deserves a sentence, not a refusal — the teacher may well intend
 * exactly that, as the standard often does.
 */
export const secureItemCaveats = (question, { blueprintCalculatorMode = 'questionSpecific' } = {}) => {
  const toolId = resolveSecureToolId(question);
  const certification = secureToolCertification(toolId);
  if (!certification) return [];
  const caveats = [];
  const fromTool = typeof certification.caveat === 'function' ? certification.caveat(question || {}) : null;
  if (fromTool) caveats.push(fromTool);
  if (certification.providesTechnology && clean(blueprintCalculatorMode) === 'none') {
    caveats.push(`${certification.label} computes ${certification.providesTechnology} for the student, although this Test provides no calculator.`);
  }
  return caveats;
};

/** The modes a Test Cycle family may be delivered in. */
export const SECURE_CYCLE_MODES = Object.freeze([
  QUESTION_RUNTIME_MODES.SECURE_TEST,
  QUESTION_RUNTIME_MODES.SECURE_RETEST,
  QUESTION_RUNTIME_MODES.CORRECTIONS,
]);

const uniqueStrings = (values) => [...new Set(values.filter(Boolean))];

/**
 * A FAMILY's secure rendering contract, from the instances it actually makes.
 *
 * A generator can change the tool between variants, so the server certifies a
 * sample of generated instances (`instances`); without them the family
 * document itself is certified. Every instance must be compatible for the
 * family to be: a Test that renders on nine draws in ten fails on the tenth.
 *
 *   { toolIds, labels, modes: { secureTest: { compatible, reasons } , … },
 *     requiresGraphing, requiresCalculator, devices }
 */
export const certifySecureFamily = (family, { instances = [] } = {}) => {
  const sources = (Array.isArray(instances) && instances.length ? instances : [family])
    .filter((entry) => entry && typeof entry === 'object');
  const toolIds = uniqueStrings(sources.map((entry) => resolveSecureToolId(entry) || 'fields'));
  const modes = {};
  SECURE_CYCLE_MODES.forEach((mode) => {
    const verdicts = sources.map((entry) => certifySecureItem(entry, { mode }));
    modes[mode] = Object.freeze({
      compatible: verdicts.length > 0 && verdicts.every((verdict) => verdict.compatible),
      reasons: uniqueStrings(verdicts.filter((verdict) => !verdict.compatible).map((verdict) => verdict.reason)),
    });
  });
  const certified = sources.map((entry) => certifySecureItem(entry));
  const devices = ['chromebook', 'ipad', 'phone'].reduce((all, device) => ({
    ...all,
    [device]: certified.every((verdict) => verdict.devices?.[device] === true),
  }), {});
  return Object.freeze({
    toolIds,
    labels: uniqueStrings(toolIds.map((toolId) => (toolId === 'fields' ? 'Response fields' : secureToolLabel(toolId)))),
    modes: Object.freeze(modes),
    requiresGraphing: certified.some((verdict) => verdict.requiresGraphing === true),
    requiresCalculator: certified.some((verdict) => verdict.requiresCalculator === true),
    devices: Object.freeze(devices),
  });
};

/** Every certified tool, for the teacher's blueprint view and the certification suite. */
export const listSecureToolCertifications = () => Object.entries(SECURE_TOOL_CERTIFICATIONS)
  .map(([toolId, certification]) => ({ toolId, ...certification }));
