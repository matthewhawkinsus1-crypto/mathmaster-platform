import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';
import { WORK_VIEW_INVENTORY, STAGE_3D_WORK_VIEW_IDS } from '../../src/tools/workViewInventory.js';
import { MOBILE_TOOL_PROFILES, auditMobileToolProfiles } from '../../src/platform/mobile/mobileToolProfiles.js';
import { TOOL_STATE_PERSISTENCE } from '../../src/tools/toolStatePersistence.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import {
  deriveLinearMultipleRepresentations,
  scoreLinearMultipleRepresentations,
} from '../../src/tools/representationBridge/linearMultipleRepresentationsMath.js';
import {
  REPRESENTATION_BRIDGE_STAGES,
  resolveRepresentationBridgeStageGate,
} from '../../src/tools/representationBridge/representationBridgeMath.js';

const source = (path) => readFileSync(path, 'utf8');

const boothFeeSource = { kind: 'table', rows: [{ x: 0, y: -20 }, { x: 2, y: -10 }, { x: 4, y: 0 }, { x: 6, y: 10 }] };
const boothFeeContext = {
  inputLabel: 'items sold', outputLabel: 'profit', inputUnit: 'items', outputUnit: 'dollars',
  rateUnit: 'dollars per item', rateMeaning: 'profit earned for each item sold',
  yInterceptMeaning: 'starting profit after paying the booth fee',
  zeroMeaning: 'number of items that must be sold to break even',
};

const buildV5 = (bridgeQuestion) => ({
  schemaVersion: 5,
  assignment: { title: 'Representation Bridge smoke', courseId: 'algebra1', assignmentType: 'notesClasswork' },
  sections: [{ role: 'classwork', questions: [{ standard: 'A.3C', prompt: 'Connect every representation of this linear relationship.', ...bridgeQuestion }] }],
});

// ---------------------------------------------------------------- authoring
test('a valid representationBridge V5 intent compiles to the registered tool type', () => {
  const v5 = buildV5({
    studentActions: ['connectLinearRepresentations'],
    source: boothFeeSource,
    context: boothFeeContext,
    requiredStages: ['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning'],
    requiredComparisons: 3,
    graphBounds: { xMin: -2, xMax: 8, yMin: -25, yMax: 15 },
    feedbackTiming: 'checkpoint',
  });
  const compiled = compileAuthoringIntentV5(v5);
  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.type, 'representationBridge');
  assert.equal(validateToolQuestion(question).isValid, true);
});

test('representationBridge is inferred from an authored table source when the action does not name the tool directly', () => {
  // Assignment V5 always requires studentActions describing intent (a renderer
  // shape alone is never enough) — but resolveIntentType's shape-based
  // fallback still fires when the authored action itself is not one that an
  // earlier, more specific branch already claims, exactly as it does for
  // linearTableWorkbench's own rows-shape fallback.
  const v5 = buildV5({ studentActions: ['describeLinearRelationship'], source: boothFeeSource, context: boothFeeContext });
  const compiled = compileAuthoringIntentV5(v5);
  assert.equal(compiled.package.sections[0].questions[0].type, 'representationBridge');
});

test('required fields survive the V5 compile round trip unchanged', () => {
  const authored = {
    studentActions: ['connectLinearRepresentations'],
    source: boothFeeSource,
    context: boothFeeContext,
    requiredStages: ['rateEvidence', 'generalForm', 'factoredForm', 'graph', 'meaning'],
    requiredComparisons: 3,
    graphBounds: { xMin: -2, xMax: 8, yMin: -25, yMax: 15 },
    feedbackTiming: 'guided',
  };
  const compiled = compileAuthoringIntentV5(buildV5(authored));
  const question = compiled.package.sections[0].questions[0];
  assert.deepEqual(question.source, authored.source);
  assert.deepEqual(question.context, authored.context);
  assert.deepEqual(question.requiredStages, authored.requiredStages);
  assert.equal(question.requiredComparisons, authored.requiredComparisons);
  assert.deepEqual(question.graphBounds, authored.graphBounds);
  assert.equal(question.feedbackTiming, authored.feedbackTiming);
});

// compileAuthoringIntentV5 itself only reshapes fields (case 'representationBridge'
// in the compile switch is a passthrough, exactly like linearTableWorkbench's);
// the actual "reject malformed content" gate for a registry tool is
// validateAssignmentQuestions, which runs validateToolQuestion on every
// MISSING_TOOL_IDS type as part of the real preflight pipeline.
test('preflight rejects a malformed source table', () => {
  const v5 = buildV5({ studentActions: ['connectLinearRepresentations'], source: { kind: 'table', rows: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } });
  const questions = compileAuthoringIntentV5(v5).package.sections[0].questions;
  assert.throws(() => validateAssignmentQuestions(questions), /at least three rows/);
});

test('preflight rejects a genuinely nonlinear source table', () => {
  const v5 = buildV5({
    studentActions: ['connectLinearRepresentations'],
    source: { kind: 'table', rows: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }, { x: 3, y: 9 }] },
  });
  const questions = compileAuthoringIntentV5(v5).package.sections[0].questions;
  assert.throws(() => validateAssignmentQuestions(questions), /genuinely linear/);
});

test('preflight rejects the factored/graph stages when the source table has zero slope', () => {
  const v5 = buildV5({
    studentActions: ['connectLinearRepresentations'],
    source: { kind: 'table', rows: [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }] },
    context: boothFeeContext,
  });
  const questions = compileAuthoringIntentV5(v5).package.sections[0].questions;
  assert.throws(() => validateAssignmentQuestions(questions), /nonzero derived slope/);
});

test('validateToolQuestion rejects an unsupported source kind rather than faking a fallback', () => {
  const result = validateToolQuestion({ toolId: 'representationBridge', mode: 'linear', source: { kind: 'equation', expression: 'y=2x' } });
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((message) => /source\.kind "table"/.test(message)));
});


test('checkpoint mode truly gates later stages and submitOnly does not reveal live correctness', () => {
  // The controls are bound to the lock...
  const componentSource = source('src/tools/representationBridge/RepresentationBridge.jsx');
  assert.match(componentSource, /disabled=\{stageBlocked\('generalForm'\)\}/);
  assert.match(componentSource, /disabled=\{stageBlocked\('factoredForm'\)\}/);
  assert.match(componentSource, /onPlot=\{stageBlocked\('graph'\) \? undefined : plotPoint\}/);
  assert.match(componentSource, /disabled=\{stageBlocked\('meaning'\)\}/);
  // ...and the lock, Submit's readiness and the highlight reveal are the stage
  // gate's (the rules moved out of the component so they can run here; the
  // wiring and the withheld-outcome rules are pinned in
  // tests/platform/representationBridgeOutcomePolicy.test.mjs).
  assert.match(componentSource, /const stageBlocked = \(stage\) => stageGate\.stageBlocked\(stage\);/);
  assert.match(componentSource, /const readyToSubmit = stageGate\.readyToSubmit;/);
  assert.match(componentSource, /const stageRevealAllowed = stageGate\.revealAllowed;/);

  // The behaviour, run: a practice checkpoint (outcomes shown).
  const gate = (stageChecks, parts, extra = {}) => resolveRepresentationBridgeStageGate({
    feedbackTiming: 'checkpoint', showImmediateFeedback: true, requiredStages: REPRESENTATION_BRIDGE_STAGES,
    stageChecks, parts, completion: {}, ...extra,
  });
  const allRight = Object.fromEntries(REPRESENTATION_BRIDGE_STAGES.map((stage) => [stage, true]));
  // A later stage waits for every earlier stage to be checked AND still right.
  assert.equal(gate({}, allRight).stageBlocked('generalForm'), true);
  assert.equal(gate({ rateEvidence: true }, allRight).stageBlocked('generalForm'), false);
  assert.equal(gate({ rateEvidence: true }, { ...allRight, rateEvidence: false }).stageBlocked('generalForm'), true, 'a stale check re-locks');
  // Submit waits for every required stage to be checked and still right.
  assert.equal(gate(allRight, allRight).readyToSubmit, true);
  assert.equal(gate(allRight, { ...allRight, graph: false }).readyToSubmit, false);
  // A checkpoint reveals a highlight only for a checked stage.
  assert.equal(gate({ generalForm: true }, allRight).revealAllowed('generalForm'), true);
  assert.equal(gate({}, allRight).revealAllowed('generalForm'), false);
  // submitOnly reveals nothing until submission feedback exists.
  assert.equal(gate({}, allRight, { feedbackTiming: 'submitOnly' }).revealAllowed('generalForm'), false);
  assert.equal(gate({}, allRight, { feedbackTiming: 'submitOnly', submissionFeedbackShown: true }).revealAllowed('generalForm'), true);
});

// -------------------------------------------------------------- platform wiring
test('representationBridge is registered in the Stage 3D Work View inventory', () => {
  assert.ok(TOOL_CATALOG_IDS.includes('representationBridge'));
  assert.equal(WORK_VIEW_INVENTORY.representationBridge.status, 'migrated');
  assert.equal(WORK_VIEW_INVENTORY.representationBridge.stage, '3D');
  assert.ok(STAGE_3D_WORK_VIEW_IDS.includes('representationBridge'));
});

test('representationBridge has a valid mobile interaction profile', () => {
  const audit = auditMobileToolProfiles();
  assert.deepEqual(audit.missing, []);
  assert.ok(MOBILE_TOOL_PROFILES.representationBridge);
  assert.ok(MOBILE_TOOL_PROFILES.representationBridge.interaction);
  assert.equal(MOBILE_TOOL_PROFILES.representationBridge.overflow, 'stack');
});

test('representationBridge declares a persistence contract that matches its own source', () => {
  const contract = TOOL_STATE_PERSISTENCE.representationBridge;
  assert.equal(contract.studentStatePersistence, 'draft-backed');
  const componentSource = source('src/tools/representationBridge/RepresentationBridge.jsx');
  [
    'tableEvidence', 'studentSlope', 'rateConclusion', 'generalM', 'generalB', 'generalEquation',
    'factoredA', 'factoredC', 'factoredEquation', 'graphPoints', 'meaningAssignments', 'stageChecks',
  ].forEach((field) => {
    assert.match(componentSource, new RegExp(`usePersistentToolState\\('${field}'`), `${field} must be draft-backed`);
  });
  // Active highlight is UI emphasis, not mathematical answer state, and is
  // explicitly allowed to skip persistence — it must stay in plain useState.
  assert.match(componentSource, /const \[activeHighlight, setActiveHighlight\] = useState\(/);
  assert.doesNotMatch(componentSource, /usePersistentToolState\('activeHighlight'/);
  assert.match(componentSource, /useMathUndoHistory\(\{/);
});

test('snapStep survives V5 compilation for representationBridge', () => {
  const v5 = buildV5({
    studentActions: ['connectLinearRepresentations'],
    source: boothFeeSource,
    context: boothFeeContext,
    snapStep: 0.25,
  });
  const compiled = compileAuthoringIntentV5(v5);
  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.snapStep, 0.25);
});

test('top-level domain without source.context survives V5 compile and is graded at runtime', () => {
  const v5 = buildV5({
    mode: 'linearMultipleRepresentations',
    studentActions: ['connectLinearRepresentations'],
    source: {
      kind: 'scenario',
      m: -2,
      b: 18,
      prompt: 'A water tank with 18 gallons drains at 2 gallons per minute.',
    },
    domain: '0 <= x <= 9',
  });
  const compiled = compileAuthoringIntentV5(v5);
  const question = compiled.package.sections[0].questions[0];
  assert.equal(question.domain, '0 <= x <= 9');
  assert.equal(question.context, undefined);

  // Runtime derivation
  const canonicalFacts = deriveLinearMultipleRepresentations(question);
  assert.equal(canonicalFacts.isValid, true);

  // Student response with correct answers for all parts except domain initially
  const responseWithoutDomain = {
    standardFormEquation: '2x + y = 18',
    slopeInterceptEquation: 'y = -2x + 18',
    pointSlopeEquation: 'y - 14 = -2(x - 2)',
    featureSlope: '-2',
    featureXIntercept: '(9, 0)',
    featureYIntercept: '(0, 18)',
    featurePoint1: '(2, 14)',
    featurePoint2: '(4, 10)',
    tableRows: [{ x: 0, y: 18 }, { x: 2, y: 14 }, { x: 4, y: 10 }, { x: 6, y: 6 }],
    graph1Points: [[9, 0], [0, 18]],
    graph2Points: [[0, 18], [1, 16]],
    graph3Points: [[2, 14], [3, 12]],
    contextDomain: '',
  };

  // Missing domain prevents full credit
  const scoreMissing = scoreLinearMultipleRepresentations(question, responseWithoutDomain);
  assert.equal(scoreMissing.parts.contextDomain, false);
  assert.equal(scoreMissing.isCorrect, false);

  // Wrong domain prevents full credit
  const scoreWrong = scoreLinearMultipleRepresentations(question, {
    ...responseWithoutDomain,
    contextDomain: '0 <= x <= 12',
  });
  assert.equal(scoreWrong.parts.contextDomain, false);
  assert.equal(scoreWrong.isCorrect, false);

  // Correct domain contributes to full credit
  const scoreCorrect = scoreLinearMultipleRepresentations(question, {
    ...responseWithoutDomain,
    contextDomain: '0 ≤ x ≤ 9',
  });
  assert.equal(scoreCorrect.parts.contextDomain, true);
  assert.equal(scoreCorrect.isCorrect, true);
  assert.equal(scoreCorrect.score, 1);
});
