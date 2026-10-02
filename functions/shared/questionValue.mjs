/*
 * WHAT A QUESTION IS WORTH IN THE GRADE — DECIDED ONCE, WHEN IT IS CREATED.
 *
 * MathMaster already has exactly one grade-value contract, and this module
 * does not add a second: `question.questionWeight`, a RELATIVE value on one
 * absolute scale (×1 is one standard single-response question; valid 0.25–20),
 * read by every grade calculation in the platform — the browser's
 * weightedQuestionTotals (src/platform/grading/questionWeights.js), the
 * server's (functions/lib/questionWeights.js), Classroom passback, Grade
 * Transfer and Recovery (sectionRecoveryService.recoveryQuestionWeight). A
 * question without one has always counted ×1, and still does.
 *
 * What was missing is the VALUE ITSELF. A V5 author had to type a weight on
 * every question (the compiler then dropped it), or every question counted ×1:
 * a one-click choice and an eleven-part Multiple Representations board were
 * worth the same. This module measures the work a question assesses and turns
 * it into a value, deterministically:
 *
 *   1. WHAT IS GRADED. The question is resolved to the grading surface (and
 *      mode) the server grades it as — resolveGradingSurfaceId, the delivered
 *      question, each tool's own resolveMode — so the allocator and the grader
 *      can never disagree about which tool a question is.
 *   2. HOW MUCH WORK. A light structural profile per surface lists the
 *      independently assessed pieces of student work, each of one kind:
 *
 *        select     choose, match, place or sort        0.5 unit
 *        respond    type a value: number, point, slope  1 unit
 *        construct  build a representation: an equation
 *                   in a named form, a table, a graph,
 *                   a solved equation shown step by step  2 units
 *        explain    a written interpretation             2 units
 *        connect    a graded check that the student's own
 *                   representations agree               0.5 unit
 *
 *      Read from STRUCTURE only — cards, fields, stages, modes — never from the
 *      numbers in the question. A Question Family slot is measured on its fixed
 *      preview instance, so every student's version of one slot has the same
 *      value whatever numbers it drew.
 *   3. THE VALUE. value = √units, to the nearest quarter, never below ×1 and
 *      never above ×8. Diminishing returns are deliberate: a sixteen-unit board
 *      is worth four standard questions, not sixteen, so one large item cannot
 *      swamp an assignment — the same scale MathMaster's weight review already
 *      teaches (2.5–4 for substantial multipart construction, 8 at most).
 *
 * WHAT IT DOES NOT DO. It never applies a section multiplier: Warm-Up,
 * Classwork, Practice and DOL already reach the SIS as separate Grade Transfer
 * columns that a teacher weights in the gradebook, so a "DOL counts more"
 * factor here would weight the DOL twice. It never reads `scoreWeight`, which
 * splits a question's own credit among its parts; the question's value is
 * separate, so the two cannot double-count. And it never runs at read time:
 * values are stamped when a question is CREATED (questionValueAllocation in
 * the creation paths), so the browser, the server, a refresh, another device
 * and a Recovery all read one stored number.
 *
 * Pure and light: no Firestore, no clock, no mathjs.
 */

import { GRADING_MANIFEST, resolveGradingSurfaceId, COMPOSED_WORKFLOW_SURFACE } from './serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from './serverGrading/gradingAuthority.mjs';
import { resolveToolMode } from './serverGrading/toolGraderDefinition.mjs';
import { deliveredQuestionForGrading } from './serverGrading/deliveredQuestion.mjs';
import { expandRecipe } from './questionRecipes.mjs';
import { resolveStageKind } from './toolMath/workflow/interactionStages.mjs';
import {
  LINE_BEARING_CARD_IDS,
  gradedContextFields,
  resolveRequiredCards,
} from './toolMath/representationBridge/linearMultipleRepresentationsCards.mjs';
import { isFamilyBackedQuestion, resolveFamilyPreviewInstance } from './questionFamilyInstance.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();

/* ---------------------------------------------------------------------------
 * The scale. The bounds are the grade contract's own (questionWeights.js).
 * ------------------------------------------------------------------------- */

export const QUESTION_VALUE_RULE = 'workload-v1';
export const MIN_QUESTION_VALUE = 0.25;
export const MAX_QUESTION_VALUE = 20;
export const STANDARD_QUESTION_VALUE = 1;
// The automatic value's range: at least one standard question, and never more
// than the most an approved AI weight review may assign.
export const MIN_AUTO_QUESTION_VALUE = 1;
export const MAX_AUTO_QUESTION_VALUE = 8;

/** Who set a question's value. Stored on the question as `questionWeightBasis.source`. */
export const QUESTION_VALUE_SOURCE = Object.freeze({
  // Written in the assignment JSON by its author (a teacher or an AI author).
  AUTHOR: 'author',
  // Set by a teacher on an existing assignment (the value control, or an
  // approved AI weight review).
  TEACHER: 'teacher',
  // Allocated by MathMaster from the assessed work, when the question was created.
  AUTO: 'auto',
  // MathMaster could not measure the work, so the question counts as one
  // standard question. Pre-Flight says so.
  DEFAULT: 'default',
});

const EXPLICIT_SOURCES = new Set([QUESTION_VALUE_SOURCE.AUTHOR, QUESTION_VALUE_SOURCE.TEACHER]);

export const WORK_KIND = Object.freeze({
  SELECT: 'select',
  RESPOND: 'respond',
  CONSTRUCT: 'construct',
  EXPLAIN: 'explain',
  CONNECT: 'connect',
});

export const WORK_UNITS = Object.freeze({
  [WORK_KIND.SELECT]: 0.5,
  [WORK_KIND.RESPOND]: 1,
  [WORK_KIND.CONSTRUCT]: 2,
  [WORK_KIND.EXPLAIN]: 2,
  [WORK_KIND.CONNECT]: 0.5,
});

const roundQuarter = (value) => Math.round(value * 4) / 4;
const roundUnits = (value) => Math.round(value * 100) / 100;

/** One assessed piece of work, `count` times. */
const work = (kind, label, count = 1) => {
  const times = Math.max(0, Math.floor(Number(count) || 0));
  return Array.from({ length: times }, () => Object.freeze({ kind, label }));
};
const select = (label, count = 1) => work(WORK_KIND.SELECT, label, count);
const respond = (label, count = 1) => work(WORK_KIND.RESPOND, label, count);
const construct = (label, count = 1) => work(WORK_KIND.CONSTRUCT, label, count);
const explain = (label, count = 1) => work(WORK_KIND.EXPLAIN, label, count);
const connect = (label, count = 1) => work(WORK_KIND.CONNECT, label, count);

const isChoiceField = (field) => (
  clean(field?.type) === 'choice' || clean(field?.inputProfile) === 'choice' || list(field?.options).length > 1
);
const fieldWork = (fields, label) => list(fields).filter(isObject).flatMap((field) => (
  isChoiceField(field) ? select(field.label || label) : respond(field.label || label)
));

/* ---------------------------------------------------------------------------
 * Composed workflows: one entry per stage the student is asked to do.
 * ------------------------------------------------------------------------- */

const STAGE_WORK = Object.freeze({
  quantityRoles: () => select('Independent and dependent quantities', 2),
  axisSetup: (stage) => [...select('Axis labels and units', 2), ...(stage?.requireScale ? respond('Axis scale', 2) : [])],
  equationInput: () => construct('Equation'),
  tableInput: () => construct('Table'),
  coordinatePlot: () => construct('Plotted points'),
  functionGraph: () => construct('Graph'),
  graphFeatureSelect: (stage) => select('Graph feature', Math.max(1, Number(stage?.selectionCount) || 1)),
  pointInput: (stage) => respond('Point', Math.max(1, Number(stage?.pointCount) || 1)),
  figureMatch: (stage) => select('Figure category', Math.max(1, list(stage?.items).length)),
  mappingDiagram: () => construct('Mapping diagram'),
  numberLine: () => construct('Number line'),
  domainInput: (stage) => (list(stage?.choices).length ? select('Domain') : respond('Domain')),
  rangeInput: (stage) => (list(stage?.choices).length ? select('Range') : respond('Range')),
  valueSet: (stage) => (list(stage?.choices).length ? select('Values') : respond('Values')),
  intervalInput: (stage) => (list(stage?.choices).length ? select('Interval') : respond('Interval')),
  classification: () => select('Classification'),
  multipleChoice: () => select('Choice'),
  interpretation: () => explain('Interpretation'),
  shortResponse: () => explain('Written response'),
  algebraWorkspace: () => construct('Solve step by step'),
});

const stageWork = (stage) => {
  const kind = resolveStageKind(stage);
  const builder = kind ? STAGE_WORK[kind] : null;
  return builder ? builder(stage) : respond('Stage');
};

/*
 * A stage shown only for one answer to an earlier stage is one branch of a
 * choice the student makes. A student takes ONE branch, so each controller's
 * branches count once, at the largest branch: "Is there an x-intercept? → Yes
 * → where is it, what is it" is the work a student who finds one does, and a
 * Discrete/Continuous pair of domain stages is one domain answer, not two.
 */
const workflowWork = (stages) => {
  const items = [];
  const branches = new Map();
  list(stages).filter(isObject).forEach((stage) => {
    const rule = isObject(stage.showWhen) ? stage.showWhen : null;
    if (!rule) {
      items.push(...stageWork(stage));
      return;
    }
    const controller = clean(rule.stage);
    const value = JSON.stringify(Array.isArray(rule.is) ? [...rule.is].map(String).sort() : String(rule.is ?? ''));
    if (!branches.has(controller)) branches.set(controller, new Map());
    const byValue = branches.get(controller);
    byValue.set(value, [...(byValue.get(value) || []), ...stageWork(stage)]);
  });
  branches.forEach((byValue) => {
    let widest = [];
    byValue.forEach((branchItems) => {
      if (unitsOf(branchItems) > unitsOf(widest)) widest = branchItems;
    });
    items.push(...widest);
  });
  return items;
};

const composedStages = (question) => {
  if (list(question?.workflow).length) return question.workflow;
  try {
    return list(expandRecipe(question)?.workflow);
  } catch {
    return [];
  }
};

/* ---------------------------------------------------------------------------
 * The Multiple Representations board and the linear Representation Bridge.
 * ------------------------------------------------------------------------- */

const LMR_CARD_WORK = Object.freeze({
  standardForm: () => construct('Standard form'),
  slopeIntercept: () => construct('Slope-intercept form'),
  pointSlope: () => construct('Point-slope form'),
  slope: () => respond('Slope'),
  xIntercept: () => respond('x-intercept'),
  yIntercept: () => respond('y-intercept'),
  twoPoints: () => respond('A point on the line', 2),
  table: () => construct('Table of values'),
  graphIntercepts: () => construct('Graph from the intercepts'),
  graphSlopeIntercept: () => construct('Graph from slope-intercept form'),
  graphPointSlope: () => construct('Graph from point-slope form'),
});

const linearMultipleRepresentationsWork = (question) => {
  const required = resolveRequiredCards(question);
  const items = required.flatMap((card) => (LMR_CARD_WORK[card] ? LMR_CARD_WORK[card]() : []));
  const context = question?.source?.context || question?.context || {};
  gradedContextFields(question).forEach(({ key }) => {
    const entry = key === 'domain' ? (context.domain ?? question.domain) : context[key];
    const label = `Context: ${key}`;
    items.push(...(isObject(entry) && list(entry.choices).length > 1 ? select(label) : respond(label)));
  });
  // Mirrors crossRepresentationConsistencyFor: graded when two or more of the
  // board's line-bearing representations can be compared.
  const requiredSet = new Set(required);
  const comparable = LINE_BEARING_CARD_IDS.filter((card) => requiredSet.has(card)).length
    + (question?.source?.kind === 'twoPoints' ? 1 : 0);
  if (comparable >= 2) items.push(...connect('Every part describes the same line'));
  return items;
};

// representationBridgeMath.REPRESENTATION_BRIDGE_STAGES (heavy module; kept
// equal by tests/platform/questionValue.test.mjs).
export const LINEAR_BRIDGE_STAGES = Object.freeze(['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning']);

const linearBridgeWork = (question) => {
  const authored = list(question?.requiredStages).filter((stage) => LINEAR_BRIDGE_STAGES.includes(stage));
  const stages = authored.length ? [...new Set(authored)] : [...LINEAR_BRIDGE_STAGES];
  const rows = list(question?.source?.rows).length;
  const pairs = Math.max(1, (rows * (rows - 1)) / 2);
  const comparisons = Math.max(1, Math.min(Number(question?.requiredComparisons) || 3, pairs));
  const items = [];
  stages.forEach((stage) => {
    if (stage === 'rateEvidence') {
      items.push(...respond('Rate between two rows', comparisons), ...respond('Slope'), ...select('Is the rate constant?'));
    }
    if (stage === 'generalForm') items.push(...construct('Slope-intercept equation'));
    if (stage === 'factoredForm') items.push(...construct('Factored equation'));
    if (stage === 'graph') items.push(...construct('Graph'));
    if (stage === 'meaning') items.push(...select('Meaning in context', 9));
  });
  if (['generalForm', 'factoredForm', 'graph'].filter((stage) => stages.includes(stage)).length >= 2) {
    items.push(...connect('The representations agree'));
  }
  return items;
};

/* ---------------------------------------------------------------------------
 * Representation Match. Its sort grades one aggregated "pairings" part, but
 * every card the student places is a decision, so the cards are counted.
 * ------------------------------------------------------------------------- */

// representationMath.LINEAR_CARD_KINDS (heavy module; kept equal by tests).
export const LINEAR_CONNECTION_CARD_KINDS = Object.freeze([
  'slopeIntercept', 'factoredLinear', 'pointSlope', 'standard', 'graph', 'slope', 'point', 'xIntercept', 'yIntercept', 'context', 'table',
]);

const hasCardValue = (set, kind) => {
  const value = kind === 'graph' ? set?.graphSpec : set?.[kind];
  if (value == null) return false;
  if (kind === 'table') return Array.isArray(value) ? value.length >= 2 : isObject(value);
  if (Array.isArray(value)) return value.length === 2;
  if (typeof value === 'object') return true;
  return clean(value) !== '';
};

const representationMatchWork = (question, mode) => {
  if (mode === 'completeSet') return select('Matching representation', 3);
  if (mode === 'linearConnections') {
    if (question?.task === 'findMismatch') {
      return [...select('Card that does not belong'), ...(list(question.correctionOptions).length ? select('Correction') : [])];
    }
    const kinds = list(question?.cardKinds).length ? question.cardKinds : LINEAR_CONNECTION_CARD_KINDS;
    const cards = list(question?.sets).reduce((total, set) => total + kinds.filter((kind) => hasCardValue(set, kind)).length, 0);
    return select('Card placed with its line', Math.max(1, cards));
  }
  return select('Choice');
};

/* ---------------------------------------------------------------------------
 * Every grading surface. A surface missing here is measured by the generic
 * structural reader below, and tests/platform/questionValue.test.mjs fails if
 * a surface of the grading manifest has neither — exactly how the grading
 * coverage gate keeps a new tool from silently inheriting client grading.
 * ------------------------------------------------------------------------- */

const graphWorkspaceWork = (question, mode) => {
  const items = [];
  if (mode !== 'analysis') items.push(...construct('Graph'));
  if (mode === 'inverseReflection' && question?.inverseReflection?.requireInverseSketch !== false) items.push(...construct('Inverse sketch'));
  const requests = list(question?.analysisRequests);
  requests.forEach((request) => {
    const kind = clean(request?.kind);
    if (['point', 'inversePoint'].includes(kind) && clean(request?.inputMode) !== 'input') items.push(...select('Point on the graph'));
    else items.push(...respond(`Graph feature: ${kind || 'value'}`));
  });
  if (mode === 'analysis' && !requests.length) items.push(...respond('Vertex'));
  return items;
};

const stepAlgebraWork = (question) => {
  const items = [];
  const source = `${clean(question?.equation)} ${clean(question?.inequalityText)} ${clean(question?.leftExpression)} ${clean(question?.rightExpression)}`;
  if (clean(question?.mode) === 'linearIntercepts') {
    items.push(...respond('x-intercept'), ...respond('y-intercept'));
  } else {
    items.push(...construct('Solve step by step'));
    const inequality = /[<>≤≥]/.test(source) || clean(question?.inequalityText);
    if (inequality && question?.representSolution !== false) items.push(...construct('Represent the solution set'));
  }
  items.push(...respond('Follow-up question', list(question?.algebraPrompts).length));
  return items;
};

const dataModelingWork = (question, mode) => {
  const fit = () => construct('Model fit');
  const association = () => select('Association', 3);
  const prediction = () => [...respond('Prediction'), ...select('Prediction type')];
  switch (mode) {
    case 'lineFit': return [...fit(), ...(question?.predictionX != null ? prediction() : [])];
    case 'linearFit': case 'quadraticFit': case 'exponentialFit': return fit();
    case 'linearFitPrediction': case 'quadraticFitPrediction': case 'exponentialFitPrediction': case 'squareRootFitPrediction':
      return [...fit(), ...prediction()];
    case 'association': return association();
    case 'correlation': return [...respond('Correlation coefficient'), ...select('Interpretation', 2)];
    case 'prediction': return prediction();
    case 'modelCompare': return select('Better model');
    default: return [...fit(), ...association(), ...select('Better model'), ...prediction()];
  }
};

const systemsWorkspaceWork = (question, mode) => {
  const equations = list(question?.equations).length || 2;
  switch (mode) {
    case 'matrix': case 'matrix3':
      return [...select('Classification'), ...construct('Row-reduce'), ...respond('Solution')];
    case 'linearQuadratic':
      return [...select('Number of intersections'), ...respond('Intersection points')];
    case 'inequalities': {
      const constraints = list(question?.expectedConstraints).length || list(question?.inequalities).length || list(question?.modeling?.expectedConstraints).length || 1;
      if (question?.studentBuild || question?.reasoning || question?.modeling) {
        return [
          ...construct('Graph each inequality', constraints),
          ...(question?.modeling ? construct('Write each inequality', constraints) : []),
          ...select('Solution region'),
          ...select('Test point', 2),
          ...(question?.askVertices ? construct('Vertices') : []),
        ];
      }
      return [...construct('Graph each inequality', constraints), ...select('Boundary style and shading', 2 * constraints)];
    }
    case 'spatial':
      return fieldWork(question?.answerFields, 'Interpretation');
    case 'algebraic':
      return [
        ...construct('Solve the system', Math.max(1, equations - 1)),
        ...(question?.requireVerification === false ? [] : respond('Verify each equation', equations)),
      ];
    default: {
      const system = question?.system || {};
      const unique = system.m1 == null || system.m2 == null || Number(system.m1) !== Number(system.m2);
      return [...select('Classification'), ...(unique ? respond('Solution') : [])];
    }
  }
};

const sequenceWork = (question, mode) => {
  switch (mode) {
    case 'ruleBridge': return respond('Rule', 3);
    case 'fullBridge': {
      const actions = new Set(list(question?.studentActions).map(clean));
      const items = [];
      if (actions.has('buildSequenceTable')) items.push(...construct('Sequence table'));
      if (actions.has('plotSequence')) items.push(...construct('Sequence graph'));
      if (actions.has('analyzeSequence')) items.push(...select('Kind of sequence'), ...respond('Common change'));
      if (actions.has('writeExplicit')) items.push(...respond('Explicit rule'));
      if (actions.has('writeRecursive')) items.push(...respond('Recursive rule', 2));
      if (actions.has('findSequenceTerm')) items.push(...respond('Term'));
      return items.length ? items : respond('Model');
    }
    case 'missingTerm': return [...respond('Missing term'), ...select('Kind of sequence')];
    case 'partialSum': return respond('Sum', 2);
    case 'compare': return [
      ...(list(question?.studentActions).includes('plotSequence') ? construct('Graph each sequence', 2) : []),
      ...select('Comparison'),
      ...respond('Difference'),
    ];
    default: return [...select('Kind of sequence'), ...respond('Common change'), ...respond('Term')];
  }
};

const linearTableWork = (question, mode) => {
  const rows = list(question?.rows).length;
  const pairs = Math.max(1, (rows * (rows - 1)) / 2);
  const comparisons = Math.max(1, Math.min(Number(question?.requiredComparisons) || 3, pairs));
  const items = [...respond('Rate between two rows', comparisons), ...select('Is the rate constant?')];
  if (mode === 'repairValue') items.push(...select('Row that breaks the pattern'), ...respond('Corrected value'));
  if (mode === 'deriveEquation') items.push(...respond('Slope'), ...respond('Intercept'), ...construct('Equation'));
  return items;
};

const SURFACE_WORK = Object.freeze({
  // Ordinary question types.
  literal: () => respond('Answer'),
  multiAnswer: (question) => fieldWork(question?.answerFields, 'Answer'),
  orderedPair: () => respond('Ordered pair'),
  system: () => construct('Solve the system'),
  table: () => construct('Table'),
  fraction: () => respond('Answer'),
  numberLine: () => select('Point on the number line'),
  // Question surfaces.
  stepAlgebra: (question) => stepAlgebraWork(question),
  algebra: (question) => stepAlgebraWork(question),
  literalWorkspace: () => construct('Solve step by step'),
  [COMPOSED_WORKFLOW_SURFACE]: (question) => workflowWork(composedStages(question)),
  modelingLab: () => [...construct('Model'), ...explain('Hypothesis'), ...explain('Justification')],
  // Structured types.
  graphing: () => [...respond('Slope'), ...respond('Intercept')],
  graphScenarioMatch: (question) => select('Scenario matched to its graph', Math.max(1, list(question?.scenarios).length)),
  graphComparison: (question) => list(question?.fields).filter(isObject).flatMap((field) => (
    isChoiceField(field) ? select(field.label || 'Comparison') : explain(field.label || 'Comparison')
  )),
  graphStory: (question, mode) => [
    ...explain('Story'),
    ...respond('Quantities', 2),
    ...respond('Axis labels and units', 2),
    ...(mode === 'sketch' ? construct('Sketch') : []),
    ...explain('Explanation'),
  ],
  contextInterpretation: (question) => {
    const responseMode = clean(question?.responseMode);
    if (responseMode === 'open') return explain('Meaning in context');
    const values = question?.requireValues === false ? [] : respond('Value', 2);
    const units = question?.requireUnits === false ? [] : respond('Unit', 2);
    const quantities = responseMode === 'guided' || question?.requireQuantities === false ? [] : select('Quantity', 2);
    const items = [...quantities, ...values, ...units];
    return items.length ? items : explain('Meaning in context');
  },
  relationshipModel: (question) => {
    const items = [];
    if (question?.requireQuantityRoles !== false) items.push(...select('Independent and dependent quantities', 2));
    if (question?.relationshipType || question?.requireRelationshipType) items.push(...select('Relationship type'));
    if (question?.axisSetup?.required) {
      items.push(...(clean(question.axisSetup.inputMode) === 'drag' ? select('Axis label or unit', 4) : respond('Axis label or unit', 4)));
      if (question.axisSetup.requireScale) items.push(...respond('Axis scale', 2));
    }
    if (question?.origin?.required) {
      const originMode = clean(question.origin.mode || question.origin.responseMode) || 'open';
      if (originMode === 'builder') items.push(...select('Origin quantity', 2), ...respond('Origin value or unit', 4));
      else if (originMode === 'guided') items.push(...respond('Origin value or unit', 4));
      else items.push(...explain('Meaning of the origin'));
    }
    return items;
  },
  functionGraph: graphWorkspaceWork,
  functionInvestigation: graphWorkspaceWork,
  graphAnalysis: graphWorkspaceWork,
  // Registry tools.
  dataModelingLab: dataModelingWork,
  regressionCalculator: (question) => [
    ...construct('Data table'),
    ...construct('Regression'),
    ...connect('Correlation'),
    ...(question?.requireInterpretation === false ? [] : select('Interpretation', 2)),
  ],
  inverseCompositionLab: (question, mode) => {
    if (mode === 'deriveInverse') return construct('Derive the inverse');
    if (mode === 'composition') return respond('Composition', 2);
    if (mode === 'inverse') return respond('Inverse');
    if (mode === 'restriction') return [...select('Domain restriction'), ...respond('Inverse')];
    return [...respond('Composition', 2), ...respond('Inverse'), ...(clean(question?.f?.type) === 'quadratic' ? select('Domain restriction') : [])];
  },
  functionOperationsLab: (question) => {
    const operations = list(question?.operations).length ? question.operations : ['sum', 'difference', 'product', 'quotient'];
    return [...respond('Operation', operations.length), ...(operations.includes('quotient') ? respond('Quotient restriction') : [])];
  },
  systemsWorkspace: systemsWorkspaceWork,
  parabolaGeometryLab: (question, mode) => {
    if (mode === 'equidistance') return [...respond('Distance', 2), ...select('On the parabola?')];
    if (mode === 'fromGeometry') return respond('Vertex form value', 3);
    if (mode === 'equation') return [...respond('Coefficient'), ...select('Opening')];
    return respond('Feature', 4);
  },
  polynomialWorkshop: (question, mode) => {
    if (mode === 'factorZero') return [...respond('Value'), ...select('Is it a factor?')];
    if (mode === 'multiplyArea') return [...construct('Area model'), ...respond('Expanded form')];
    if (mode === 'factorQuadratic') return respond('Factor', 2);
    if (mode === 'division') return respond('Quotient and remainder', 2);
    if (mode === 'graphConnection') return select('Graph feature', 2);
    return select('Feature');
  },
  signSolutionAnalyzer: (question, mode) => {
    if (mode === 'radicalCheck') return select('Candidate valid?', Math.max(1, list(question?.candidates).length || 2));
    const critical = list(question?.factors).length + list(question?.denominatorFactors).length;
    return select('Sign of each interval', Math.max(2, critical + 1));
  },
  sequenceExplorer: sequenceWork,
  complexPlaneLab: (question, mode) => {
    if (mode === 'operations') return respond('Result part', 2);
    if (mode === 'division') return respond('Step', 4);
    if (mode === 'powers') return respond('Power', 3);
    if (mode === 'rotation') return [...respond('Result part', 2), ...select('Rotation')];
    if (mode === 'quadraticRoots') return respond('Root', 2);
    return respond('Feature', 3);
  },
  exponentialLogBridge: (question, mode) => (mode === 'inverse'
    ? [...respond('Inverse', 2), ...select('Domain side')]
    : respond('Equivalent form or solution', 2)),
  transformationsLab: (question, mode) => {
    if (mode === 'match') return construct('Transformed graph');
    if (mode === 'identify') return respond('Transformation parameter', 3);
    if (mode === 'pointMap') return respond('Image point', 2);
    if (mode === 'plotTransform') return construct('Transformed figure');
    if (mode === 'describe') return [...select('Transformation', 6), ...respond('Amount', 4)];
    return respond('Anchor point', 2);
  },
  representationMatch: representationMatchWork,
  functionInvestigation2: (question, mode) => {
    if (mode === 'domainRange') return select('Domain or range', 2);
    if (mode === 'intercepts') return respond('Intercepts', 2);
    if (mode === 'behavior' || mode === 'compare') return select('Behavior');
    const family = clean(question?.function?.type || question?.function?.family);
    return [
      ...respond('Anchor point', 2),
      ...(['logarithmic', 'rational'].includes(family) ? respond('Vertical asymptote') : []),
      ...(['exponential', 'rational'].includes(family) ? respond('Horizontal asymptote') : []),
    ];
  },
  graphing2: () => construct('Graph the line'),
  stepAlgebra2: (question, mode) => (mode === 'linearIntercepts' ? respond('Intercept', 2) : construct('Rewrite step by step')),
  intervalNumberLine: (question) => {
    const ask = list(question?.ask).length ? question.ask : ['graph', 'interval'];
    return [
      ...(ask.includes('graph') ? construct('Number line graph') : []),
      ...(ask.includes('interval') ? respond('Interval') : []),
      ...(ask.includes('inequality') ? respond('Inequality') : []),
    ];
  },
  relationMapping: (question) => {
    const ask = list(question?.ask).length ? question.ask : ['mapping', 'domain', 'range'];
    return [
      ...(ask.includes('plot') ? construct('Plot the relation') : []),
      ...(ask.includes('mapping') ? construct('Mapping diagram') : []),
      ...(ask.includes('domain') ? respond('Domain') : []),
      ...(ask.includes('range') ? respond('Range') : []),
      ...(ask.includes('isFunction') ? select('Is it a function?') : []),
      ...fieldWork(question?.answerFields, 'Answer'),
    ];
  },
  openSortBoard: (question, mode) => [
    ...select('Card sorted', Math.max(1, list(question?.items).length)),
    ...(mode === 'controlled' ? [] : explain('Group rationale')),
  ],
  constraintFunctionBuilder: (question) => [
    ...construct('Function that meets the constraints'),
    ...connect('Constraint met', list(question?.constraints).length),
  ],
  linearTableWorkbench: linearTableWork,
  expressionMeaning: (question) => select('Meaning, unit or role', 3 * Math.max(1, list(question?.expressions).length)),
  representationBridge: (question, mode) => (mode === 'linearMultipleRepresentations'
    ? linearMultipleRepresentationsWork(question)
    : linearBridgeWork(question)),
});

/** Surfaces the profiles cover, for the coverage test. */
export const QUESTION_WORK_SURFACES = Object.freeze(Object.keys(SURFACE_WORK));

/*
 * The generic reader, for a surface without a profile: the structures every
 * renderer shares. A question with none of them is NOT measured — it is not
 * guessed at — and keeps the standard value with source `default`, which
 * Pre-Flight reports.
 */
const genericWork = (question) => {
  const stages = composedStages(question);
  if (stages.length) return workflowWork(stages);
  const fields = list(question?.answerFields).length ? question.answerFields : list(question?.fields);
  if (fields.length) return fieldWork(fields, 'Answer');
  return [];
};

export const unitsOf = (items) => roundUnits(list(items).reduce((total, item) => total + (WORK_UNITS[item?.kind] || 0), 0));

/** "3 constructions, 4 short answers and 1 check" — what a teacher reads. */
const KIND_WORDS = Object.freeze({
  select: ['choice', 'choices'],
  respond: ['short answer', 'short answers'],
  construct: ['construction', 'constructions'],
  explain: ['written explanation', 'written explanations'],
  connect: ['consistency check', 'consistency checks'],
});

export const describeWorkCounts = (items) => {
  const counts = {};
  list(items).forEach((item) => { counts[item.kind] = (counts[item.kind] || 0) + 1; });
  const parts = Object.values(WORK_KIND)
    .filter((kind) => counts[kind])
    .map((kind) => `${counts[kind]} ${KIND_WORDS[kind][counts[kind] === 1 ? 0 : 1]}`);
  if (!parts.length) return 'no graded work';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

/* ---------------------------------------------------------------------------
 * Measuring one question.
 * ------------------------------------------------------------------------- */

const declarationMode = (declaration, question) => {
  if (!declaration || declaration.kind !== 'tool') return null;
  try {
    return resolveToolMode(declaration, question);
  } catch {
    return null;
  }
};

const nonGradedSurface = (declaration, mode) => {
  if (!declaration) return false;
  if (declaration.kind === 'tool') return declaration.modes?.[mode]?.authority === GRADING_AUTHORITY.NON_GRADED;
  return declaration.authority === GRADING_AUTHORITY.NON_GRADED;
};

/**
 * The assessed work in one question.
 *
 *   { surfaceId, mode, items, units, measured, gradable, reason, family }
 *
 * `measured: false` means MathMaster could not read the question's work (an
 * unknown surface with no shared structure, or a family that cannot generate)
 * — never a guess. A Question Family slot is measured on its fixed preview
 * instance: the same for every student, whatever numbers they draw.
 */
export const describeQuestionWork = (question) => {
  if (!isObject(question)) return { surfaceId: null, mode: null, items: [], units: 0, measured: false, gradable: false, reason: 'not-a-question' };
  let family = null;
  let subject = question;
  if (isFamilyBackedQuestion(question)) {
    const preview = resolveFamilyPreviewInstance(question);
    if (preview.error) {
      return { surfaceId: null, mode: null, items: [], units: 0, measured: false, gradable: false, reason: 'family-unresolved', family: { error: preview.error } };
    }
    family = { id: preview.family.id, version: preview.family.version, scope: preview.family.scope };
    subject = preview.question;
  }
  let delivered = subject;
  try {
    delivered = deliveredQuestionForGrading(subject) || subject;
  } catch {
    delivered = subject;
  }
  const surfaceId = resolveGradingSurfaceId(delivered);
  const declaration = surfaceId ? GRADING_MANIFEST[surfaceId] || null : null;
  const mode = declarationMode(declaration, delivered);
  if (nonGradedSurface(declaration, mode)) {
    return { surfaceId, mode, items: [], units: 0, measured: true, gradable: false, reason: 'non-graded', family };
  }
  const profile = surfaceId ? SURFACE_WORK[surfaceId] : null;
  let items = [];
  try {
    items = profile ? profile(delivered, mode) : genericWork(delivered);
  } catch {
    items = [];
  }
  if (!items.length && profile) items = genericWork(delivered);
  if (!items.length) {
    return { surfaceId, mode, items: [], units: 0, measured: false, gradable: Boolean(declaration), reason: profile ? 'no-graded-work-found' : 'unknown-surface', family };
  }
  return { surfaceId, mode, items, units: unitsOf(items), measured: true, gradable: true, reason: null, family };
};

/** Work units -> value: √units to the nearest quarter, within [×1, ×8]. */
export const valueForWorkUnits = (units) => {
  const numeric = Number(units);
  if (!Number.isFinite(numeric) || numeric <= 0) return STANDARD_QUESTION_VALUE;
  return Math.max(MIN_AUTO_QUESTION_VALUE, Math.min(MAX_AUTO_QUESTION_VALUE, roundQuarter(Math.sqrt(numeric))));
};

/**
 * The value MathMaster would give this question. Never reads an existing
 * `questionWeight`: this is the estimate an explicit value is compared with.
 */
export const estimateQuestionValue = (question) => {
  const described = describeQuestionWork(question);
  const value = described.measured && described.units > 0 ? valueForWorkUnits(described.units) : STANDARD_QUESTION_VALUE;
  return {
    ...described,
    value,
    rule: QUESTION_VALUE_RULE,
    source: described.measured && described.units > 0 ? QUESTION_VALUE_SOURCE.AUTO : QUESTION_VALUE_SOURCE.DEFAULT,
    summary: describeWorkCounts(described.items),
  };
};

/* ---------------------------------------------------------------------------
 * Explicit values, and what is stored.
 * ------------------------------------------------------------------------- */

const TEMPLATE_TOKEN = /\{\{[^}]*\}\}/;

/**
 * What the question's own `questionWeight` says.
 *
 *   { present: false }                                 none written
 *   { present: true, valid: true, value }              a usable value
 *   { present: true, valid: false, raw, problem }      written, but unusable:
 *     'not-a-number' | 'not-positive' | 'below-minimum' | 'above-maximum'
 *     | 'templated' (a Question Family placeholder: a value per student)
 *
 * A present-but-invalid value is never replaced: it is a teacher's or an
 * author's decision gone wrong, and Pre-Flight reports it instead.
 */
export const explicitQuestionValue = (question) => {
  const raw = question?.questionWeight;
  if (raw === undefined || raw === null || raw === '') return { present: false };
  if (typeof raw === 'string' && TEMPLATE_TOKEN.test(raw)) return { present: true, valid: false, raw, problem: 'templated' };
  if (typeof raw !== 'number' && typeof raw !== 'string') return { present: true, valid: false, raw, problem: 'not-a-number' };
  const value = Number(raw);
  if (!Number.isFinite(value) || (typeof raw === 'string' && !raw.trim())) return { present: true, valid: false, raw, problem: 'not-a-number' };
  if (value <= 0) return { present: true, valid: false, raw, problem: 'not-positive' };
  if (value < MIN_QUESTION_VALUE) return { present: true, valid: false, raw, problem: 'below-minimum' };
  if (value > MAX_QUESTION_VALUE) return { present: true, valid: false, raw, problem: 'above-maximum' };
  return { present: true, valid: true, value };
};

/** Who set the stored value, read the same way everywhere. */
export const questionValueBasis = (question) => {
  const basis = isObject(question?.questionWeightBasis) ? question.questionWeightBasis : null;
  const explicit = explicitQuestionValue(question);
  if (!explicit.present) return { source: null, legacy: true };
  const source = clean(basis?.source);
  if (Object.values(QUESTION_VALUE_SOURCE).includes(source)) {
    return {
      source,
      rule: clean(basis.rule) || null,
      units: Number.isFinite(Number(basis.units)) ? Number(basis.units) : null,
      explicit: EXPLICIT_SOURCES.has(source),
    };
  }
  // A value with no record of who set it was written by the author.
  return { source: QUESTION_VALUE_SOURCE.AUTHOR, rule: null, units: null, explicit: true, inferred: true };
};

const autoBasis = (estimate) => Object.freeze({
  source: estimate.source,
  rule: QUESTION_VALUE_RULE,
  units: estimate.units,
});

/**
 * THE ALLOCATION FOR ONE QUESTION, AT CREATION.
 *
 *   explicit valid value   kept exactly; recorded as the author's (or as
 *                          whoever the existing basis names)
 *   explicit bad value     left as written, for Pre-Flight to report — never
 *                          silently replaced by an automatic one
 *   no value               the automatic value, with its basis
 *
 * Idempotent: a question that already has a value comes back unchanged (the
 * same object), so re-importing, recompiling or allocating twice can never
 * move a value. Only a missing value is ever filled.
 */
export const allocateQuestionValue = (question) => {
  if (!isObject(question)) return question;
  const explicit = explicitQuestionValue(question);
  if (explicit.present) {
    if (!explicit.valid || isObject(question.questionWeightBasis)) return question;
    return { ...question, questionWeightBasis: Object.freeze({ source: QUESTION_VALUE_SOURCE.AUTHOR }) };
  }
  const estimate = estimateQuestionValue(question);
  return { ...question, questionWeight: estimate.value, questionWeightBasis: autoBasis(estimate) };
};

/** Every question of a V5 assignment ({ sections: [{ questions }] }), filled where missing. */
export const allocateAssignmentQuestionValues = (assignment) => {
  if (!isObject(assignment) || !Array.isArray(assignment.sections)) return assignment;
  let changed = false;
  const sections = assignment.sections.map((section) => {
    if (!isObject(section) || !Array.isArray(section.questions)) return section;
    let sectionChanged = false;
    const questions = section.questions.map((question) => {
      const next = allocateQuestionValue(question);
      if (next !== question) sectionChanged = true;
      return next;
    });
    if (!sectionChanged) return section;
    changed = true;
    return { ...section, questions };
  });
  return changed ? { ...assignment, sections } : assignment;
};

/** A flat question list, filled where missing. */
export const allocateQuestionListValues = (questions) => (
  Array.isArray(questions) ? questions.map(allocateQuestionValue) : questions
);

/*
 * A REPAIR CHANGES CONTENT, NEVER THE GRADE VALUE.
 *
 * A repaired or replacement question keeps the value — and the record of who
 * set it — of the question it replaces, whatever the replacement carried. A
 * value changes only through the value control (or an approved weight
 * review), where the platform recalculates live grades openly. This is the
 * rule the live repair pack always applied (liveRepairPack.js); every other
 * repair path now applies it through here.
 */
export const carryQuestionValue = (original, replacement) => {
  if (!isObject(replacement)) return replacement;
  const next = { ...replacement };
  ['questionWeight', 'questionWeightBasis'].forEach((field) => {
    if (isObject(original) && Object.prototype.hasOwnProperty.call(original, field)) next[field] = original[field];
    else delete next[field];
  });
  return next;
};

/*
 * A DIFFERENT QUESTION IN THE SAME PLACE.
 *
 * When the platform swaps a question for a different one (an audited CCMR
 * Practice item for an Honors destination), an explicit value the author or
 * teacher wrote for that place in the grade stays with it; an automatic value
 * does not, because it measured the old question's work — the new question
 * keeps the automatic value measured from its own.
 */
export const keepExplicitQuestionValue = (original, replacement) => {
  if (!isObject(replacement)) return replacement;
  const basis = questionValueBasis(original);
  if (!basis.explicit || !explicitQuestionValue(original).valid) return replacement;
  const next = { ...replacement, questionWeight: original.questionWeight };
  if (isObject(original.questionWeightBasis)) next.questionWeightBasis = original.questionWeightBasis;
  else delete next.questionWeightBasis;
  return next;
};

/**
 * One sentence a teacher reads about a question's value: where it came from,
 * and for an automatic value, what work it counts.
 */
export const describeQuestionValue = (question) => {
  const basis = questionValueBasis(question);
  const explicit = explicitQuestionValue(question);
  const value = explicit.valid ? explicit.value : STANDARD_QUESTION_VALUE;
  if (basis.legacy) {
    return { value, source: null, sentence: 'No value was set when this question was created, so it counts as one standard question (×1).' };
  }
  if (!explicit.valid) {
    return { value, source: basis.source, sentence: `The value written for this question (${JSON.stringify(explicit.raw)}) is not usable; it must be a number from ${MIN_QUESTION_VALUE} to ${MAX_QUESTION_VALUE}.` };
  }
  if (basis.source === QUESTION_VALUE_SOURCE.AUTO) {
    return { value, source: basis.source, sentence: `Automatic value ×${value}: ${estimateQuestionValue(question).summary}.` };
  }
  if (basis.source === QUESTION_VALUE_SOURCE.DEFAULT) {
    return { value, source: basis.source, sentence: 'MathMaster could not measure this question\'s work, so it counts as one standard question (×1).' };
  }
  if (basis.source === QUESTION_VALUE_SOURCE.TEACHER) {
    return { value, source: basis.source, sentence: `Value ×${value} set by a teacher.` };
  }
  return { value, source: basis.source, sentence: `Value ×${value} set by the assignment's author.` };
};

/** A teacher set this value in the editor or an approved weight review. */
export const teacherQuestionValue = (question, value) => ({
  ...question,
  questionWeight: value,
  questionWeightBasis: Object.freeze({ source: QUESTION_VALUE_SOURCE.TEACHER }),
});
