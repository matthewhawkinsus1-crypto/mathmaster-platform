import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import graphingGrader from '../../functions/shared/serverGrading/tools/graphing.mjs';
import graphScenarioMatchGrader from '../../functions/shared/serverGrading/tools/graphScenarioMatch.mjs';
import graphComparisonGrader from '../../functions/shared/serverGrading/tools/graphComparison.mjs';
import graphStoryGrader from '../../functions/shared/serverGrading/tools/graphStory.mjs';
import contextInterpretationGrader from '../../functions/shared/serverGrading/tools/contextInterpretation.mjs';
import relationshipModelGrader from '../../functions/shared/serverGrading/tools/relationshipModel.mjs';
import {
  GRADING_MANIFEST,
  STRUCTURED_TYPE_DECLARATIONS,
  resolveGradingSurfaceId,
} from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import {
  gradeServerResponse,
  serverResponseGradingSupport,
} from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_GRADERS } from '../../functions/shared/serverGrading/toolGraders.mjs';
import {
  NON_WORK_KEYS,
  TOOL_RESPONSE_LIMITS,
  boundToolWork,
  canonicalToolWorkJson,
} from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import * as movedScenarioUtils from '../../functions/shared/toolMath/scenario/scenarioResponseUtils.mjs';
import * as movedContextUtils from '../../functions/shared/toolMath/scenario/contextInterpretationUtils.mjs';
import {
  FREE_TEXT_LIMITS,
  fieldResponsesWork,
  freeText,
  freeTextWork,
  pointMeaningWork,
  readPointMeaningWork,
  readRelationshipModelWork,
  relationshipModelWork,
  scenarioMatchWork,
} from '../../functions/shared/toolMath/scenario/scenarioWork.mjs';
import {
  SKETCH_LIMITS,
  compactSketchStrokes,
  graphStoryRequiresSketch,
  graphStoryWork,
  isQualifyingStroke,
  readGraphStoryText,
} from '../../functions/shared/toolMath/scenario/graphStoryMath.mjs';
import {
  relationshipModelRequirements,
  relationshipOriginConfig,
} from '../../functions/shared/toolMath/scenario/relationshipModelMath.mjs';
import * as srcScenarioUtils from '../../src/scenarioResponseUtils.js';
import * as srcContextUtils from '../../src/contextInterpretationUtils.js';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { answerStateFromSharedGrading } from '../../src/platform/grading/sharedAnswerState.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * SERVER-AUTHORITATIVE GRADING PARITY FOR THE SIX SCENARIO QUESTION TYPES.
 *
 *   graphing              src/GraphLine.jsx
 *   graphScenarioMatch    src/GraphScenarioMatch.jsx
 *   graphComparison       src/GraphComparison.jsx
 *   graphStory            src/GraphStory.jsx
 *   contextInterpretation src/ContextInterpretation.jsx (+ PointMeaningBuilder)
 *   relationshipModel     src/RelationshipModel.jsx (standalone)
 *
 * Each screen reports its answerState from functions/shared/serverGrading/
 * tools/<type>.mjs through gradeToolCheck; the server runs the same grader over
 * the serialized response. These tests prove:
 *
 *   1. the grader IS the screen's old verdict, extracted check-for-check: a
 *      frozen copy of each component's inline logic (the LEGACY ORACLES below,
 *      copied from the pre-extraction source) agrees with it part-for-part on
 *      every fixture — except the documented graphing key fix;
 *   2. the browser path (gradeToolCheck) and the server path
 *      (gradeServerResponse over JSON-round-tripped bytes) agree exactly;
 *   3. the verdict is a function of the work and the KEY: correct work against
 *      an altered key is marked wrong;
 *   4. the work is student work only, bounded, and tamper-tolerant.
 */

const read = (file) => fs.readFileSync(file, 'utf8');
const code = (file) => executableSource(read(file));

// ---------------------------------------------------------------------------
// LEGACY ORACLES — frozen copies of each component's inline Check before the
// extraction. Only grading lines are copied; never edit these to make a test
// pass.
// ---------------------------------------------------------------------------
const { matchesAcceptedText, matchesConceptGroups } = srcScenarioUtils;
const { buildContextInterpretationParts } = srcContextUtils;

// src/GraphLine.jsx
const legacyGraphLine = (question, { slope, intercept }) => {
  const { m, b } = question;
  const parts = [
    { id: 'slope', label: 'Slope', isComplete: slope !== '', isCorrect: slope !== '' && Number(slope) === m, response: slope },
    { id: 'intercept', label: 'Y-intercept', isComplete: intercept !== '', isCorrect: intercept !== '' && Number(intercept) === b, response: intercept },
  ];
  const isComplete = parts.every((part) => part.isComplete);
  return { isComplete, isCorrect: isComplete && parts.every((part) => part.isCorrect), parts };
};

// src/GraphScenarioMatch.jsx
const legacyScenarioMatch = (question, matches) => {
  const scenarios = Array.isArray(question.scenarios) ? question.scenarios.filter((item) => item?.id) : [];
  const correctMatches = question.correctMatches || Object.fromEntries(scenarios.map((scenario) => [scenario.id, scenario.graphId]));
  const parts = scenarios.map((scenario) => ({
    id: `match:${scenario.id}`,
    label: scenario.title || scenario.id,
    isComplete: Boolean(matches[scenario.id]),
    isCorrect: matches[scenario.id] === correctMatches[scenario.id],
    response: matches[scenario.id] || '',
  }));
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  return { isComplete, isCorrect: isComplete && parts.every((part) => part.isCorrect), parts };
};

// src/GraphComparison.jsx
const legacyGraphComparison = (question, responses) => {
  const fields = Array.isArray(question.fields) ? question.fields.filter((item) => item?.id) : [];
  const parts = fields.map((field) => {
    const response = String(responses[field.id] ?? '');
    const isComplete = response.trim() !== '';
    const isCorrect = field.type === 'choice'
      ? matchesAcceptedText(response, field.acceptedAnswers || [field.answer])
      : matchesConceptGroups(response, field.requiredConcepts || field.requiredConceptGroups || []);
    return { id: field.id, label: field.label || field.id, isComplete, isCorrect: isComplete && isCorrect, response };
  });
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  return { isComplete, isCorrect: isComplete && parts.every((part) => part.isCorrect), parts };
};

// src/GraphStory.jsx
const legacyGraphStory = (question, values) => {
  const hasSourceGraph = Boolean(question?.graph && typeof question.graph === 'object');
  const requireSketch = question.requireSketch === true || !hasSourceGraph;
  const parts = [
    { id: 'scenario', label: 'Scenario', isComplete: values.scenario.trim().length >= Number(question.minimumScenarioCharacters || 20), isCorrect: values.scenario.trim().length >= Number(question.minimumScenarioCharacters || 20), response: values.scenario },
    { id: 'independent', label: 'Independent quantity', isComplete: Boolean(values.independent.trim()), isCorrect: Boolean(values.independent.trim()), response: values.independent },
    { id: 'dependent', label: 'Dependent quantity', isComplete: Boolean(values.dependent.trim()), isCorrect: Boolean(values.dependent.trim()), response: values.dependent },
    { id: 'axis-labels', label: 'Axis labels and units', isComplete: [values.xLabel, values.xUnit, values.yLabel, values.yUnit].every((value) => value.trim()), isCorrect: [values.xLabel, values.xUnit, values.yLabel, values.yUnit].every((value) => value.trim()), response: `${values.xLabel} (${values.xUnit}); ${values.yLabel} (${values.yUnit})` },
    ...(requireSketch ? [{ id: 'graph-sketch', label: 'Graph sketch', isComplete: values.strokes.some((stroke) => stroke.length >= 3), isCorrect: values.strokes.some((stroke) => stroke.length >= 3), response: `${values.strokes.length} stroke(s)` }] : []),
    { id: 'explanation', label: 'Explanation of the graph', isComplete: values.explanation.trim().length >= Number(question.minimumExplanationCharacters || 20), isCorrect: values.explanation.trim().length >= Number(question.minimumExplanationCharacters || 20), response: values.explanation },
  ];
  const isComplete = parts.every((part) => part.isComplete);
  return { isComplete, isCorrect: isComplete, parts };
};
// GraphStory's old response-key compaction.
const legacyCompactStroke = (stroke) => stroke.filter((_, index) => index % 4 === 0).slice(0, 60);

// src/ContextInterpretation.jsx
const legacyContextInterpretation = (question, values) => {
  const parts = buildContextInterpretationParts(values, question, { prefix: 'meaning' });
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  return { isComplete, isCorrect: isComplete && parts.every((part) => part.isCorrect), parts };
};

// src/RelationshipModel.jsx
const legacyRelationshipModel = (question, values) => {
  const quantities = Array.isArray(question.quantities) ? question.quantities.filter((item) => item?.id) : [];
  const axisSetup = question.axisSetup && typeof question.axisSetup === 'object' ? question.axisSetup : {};
  const requirements = {
    quantities: question.requireQuantityRoles !== false,
    continuity: Boolean(question.relationshipType || question.requireRelationshipType),
    axes: Boolean(axisSetup.required),
    scale: Boolean(axisSetup.requireScale),
    origin: Boolean(question.origin?.required),
  };
  const originMode = ['builder', 'guided', 'open'].includes(question.origin?.responseMode) ? question.origin.responseMode : 'open';
  const originConfig = requirements.origin
    ? {
        ...question.origin,
        responseMode: originMode,
        target: question.origin?.target || { kind: 'startingPoint', coordinates: question.origin?.coordinates || question.origin?.point || [] },
        quantities: question.origin?.quantities || {
          x: {
            id: question.correctIndependentId,
            name: (question.quantities || []).find((item) => item?.id === question.correctIndependentId)?.label || '',
            unit: (question.quantities || []).find((item) => item?.id === question.correctIndependentId)?.unit || '',
            acceptedUnits: axisSetup.acceptedXUnits || [],
          },
          y: {
            id: question.correctDependentId,
            name: (question.quantities || []).find((item) => item?.id === question.correctDependentId)?.label || '',
            unit: (question.quantities || []).find((item) => item?.id === question.correctDependentId)?.unit || '',
            acceptedUnits: axisSetup.acceptedYUnits || [],
          },
        },
        applyResponseToGraph: question.origin?.applyResponseToGraph !== false,
        quantityChoices: question.quantities || [],
      }
    : null;
  const quantityById = Object.fromEntries(quantities.map((item) => [item.id, item]));
  const acceptedXLabels = axisSetup.acceptedXLabels || [quantityById[question.correctIndependentId]?.label];
  const acceptedYLabels = axisSetup.acceptedYLabels || [quantityById[question.correctDependentId]?.label];
  const acceptedXUnits = axisSetup.acceptedXUnits || [quantityById[question.correctIndependentId]?.unit];
  const acceptedYUnits = axisSetup.acceptedYUnits || [quantityById[question.correctDependentId]?.unit];
  const acceptedXSteps = (axisSetup.acceptedXSteps || []).map(String);
  const acceptedYSteps = (axisSetup.acceptedYSteps || []).map(String);
  const parts = [];
  if (requirements.quantities) {
    parts.push({ id: 'independent', label: 'Independent quantity', isComplete: Boolean(values.independentId), isCorrect: values.independentId === question.correctIndependentId, response: quantityById[values.independentId]?.label || '' });
    parts.push({ id: 'dependent', label: 'Dependent quantity', isComplete: Boolean(values.dependentId), isCorrect: values.dependentId === question.correctDependentId, response: quantityById[values.dependentId]?.label || '' });
  }
  if (requirements.continuity) {
    parts.push({ id: 'relationship-type', label: 'Discrete or continuous relationship', isComplete: Boolean(values.relationshipType), isCorrect: values.relationshipType === question.relationshipType, response: values.relationshipType });
  }
  if (requirements.axes) {
    parts.push({ id: 'x-label', label: 'X-axis quantity', isComplete: Boolean(values.xLabel.trim()), isCorrect: matchesAcceptedText(values.xLabel, acceptedXLabels), response: values.xLabel });
    parts.push({ id: 'x-unit', label: 'X-axis unit', isComplete: Boolean(values.xUnit.trim()), isCorrect: matchesAcceptedText(values.xUnit, acceptedXUnits), response: values.xUnit });
    parts.push({ id: 'y-label', label: 'Y-axis quantity', isComplete: Boolean(values.yLabel.trim()), isCorrect: matchesAcceptedText(values.yLabel, acceptedYLabels), response: values.yLabel });
    parts.push({ id: 'y-unit', label: 'Y-axis unit', isComplete: Boolean(values.yUnit.trim()), isCorrect: matchesAcceptedText(values.yUnit, acceptedYUnits), response: values.yUnit });
  }
  if (requirements.scale) {
    parts.push({ id: 'x-step', label: 'Reasonable x-axis scale', isComplete: Boolean(String(values.xStep).trim()), isCorrect: acceptedXSteps.length ? acceptedXSteps.includes(String(values.xStep).trim()) : Number(values.xStep) > 0, response: values.xStep });
    parts.push({ id: 'y-step', label: 'Reasonable y-axis scale', isComplete: Boolean(String(values.yStep).trim()), isCorrect: acceptedYSteps.length ? acceptedYSteps.includes(String(values.yStep).trim()) : Number(values.yStep) > 0, response: values.yStep });
  }
  if (requirements.origin) {
    if (originMode === 'open') {
      parts.push({ id: 'origin', label: 'Meaning of the starting point', isComplete: Boolean(values.originMeaning.trim()), isCorrect: matchesConceptGroups(values.originMeaning, question.origin?.requiredConcepts || []), response: values.originMeaning });
    } else {
      parts.push(...buildContextInterpretationParts(values.pointMeaning, originConfig, { prefix: 'origin' }));
    }
  }
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  return { isComplete, isCorrect: isComplete && parts.every((part) => part.isCorrect), parts };
};

// ---------------------------------------------------------------------------
// Shared assertions
// ---------------------------------------------------------------------------

/** Browser path and server path over the same work; asserts they agree exactly. */
const gradeBoth = (grader, question, work) => {
  const browser = gradeToolCheck(grader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces a tool response');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, `graded (${server.reason})`);
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  if (browser.graded) assert.equal(server.surfaceId, grader.toolId);
  return { ...browser, mode: server.mode };
};

const partView = (part) => [String(part.id), String(part.label), Boolean(part.isComplete), part.isCorrect === true, String(part.response ?? '').slice(0, 240)];

/** The extracted grader reproduces the component's old verdict part-for-part. */
const assertMatchesLegacy = (result, legacy, label) => {
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.isComplete, legacy.isComplete, `${label}: isComplete`);
  assert.equal(result.isCorrect, legacy.isCorrect, `${label}: isCorrect`);
  assert.deepEqual(result.parts.map(partView), legacy.parts.map(partView), `${label}: parts`);
  const legacyScore = legacy.isCorrect ? 1 : (legacy.parts.length ? legacy.parts.filter((part) => part.isCorrect).length / legacy.parts.length : 0);
  assert.ok(Math.abs(result.score - legacyScore) < 1e-12, `${label}: score ${result.score} vs ${legacyScore}`);
};

const assertCleanWork = (work, label) => {
  const bounded = boundToolWork(work);
  assert.deepEqual(bounded.dropped, [], `${label}: realistic work must not use a NON_WORK_KEYS name`);
  assert.equal(bounded.truncated, false, `${label}: realistic work must not be truncated`);
  assert.ok(canonicalToolWorkJson(work).length <= TOOL_RESPONSE_LIMITS.maxJsonLength, `${label}: under the size limit`);
};

const INJECTED = { isCorrect: true, score: 1, expected: 'anything', checks: [true], correct: true, answerKey: 'x', solution: 'y' };

/** A tampered response: extra verdict/key claims are dropped and change nothing. */
const assertInjectionIgnored = (grader, question, work) => {
  const clean = gradeBoth(grader, question, work);
  const tampered = gradeBoth(grader, question, { ...work, ...INJECTED });
  assert.deepEqual(
    [tampered.isCorrect, tampered.isComplete, tampered.score, tampered.parts],
    [clean.isCorrect, clean.isComplete, clean.score, clean.parts],
  );
  assert.deepEqual(boundToolWork({ ...work, ...INJECTED }).dropped.sort(), Object.keys(INJECTED).sort());
};

/** Non-object and oversize work is never graded — on either path. */
const assertRefusesMalformed = (grader, question) => {
  for (const work of [null, undefined, 'a string', 42, ['an', 'array'], true]) {
    const result = gradeToolCheck(grader, question, work);
    assert.equal(result.graded, false, `work ${JSON.stringify(work)} must not be graded`);
    assert.equal(result.isCorrect, false);
    assert.equal(result.isComplete, false);
  }
  const huge = { junk: Array.from({ length: 120 }, (_, index) => `${index}`.padEnd(1000, 'x')) };
  const oversize = gradeToolCheck(grader, question, huge);
  assert.equal(oversize.graded, false);
  assert.equal(oversize.reason, 'oversize-response');
  assert.equal(oversize.toolResponse.oversize, true);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(oversize.toolResponse)) });
  assert.equal(server.graded, false);
  assert.equal(server.reason, 'oversize-response');
};

// ---------------------------------------------------------------------------
// Declarations: every mode SHARED, every mode resolution = the screen's routing
// ---------------------------------------------------------------------------

const TYPES = {
  graphing: { grader: graphingGrader, modes: ['lineFeatures'], component: 'src/GraphLine.jsx' },
  graphScenarioMatch: { grader: graphScenarioMatchGrader, modes: ['matchBoard'], component: 'src/GraphScenarioMatch.jsx' },
  graphComparison: { grader: graphComparisonGrader, modes: ['compare'], component: 'src/GraphComparison.jsx' },
  graphStory: { grader: graphStoryGrader, modes: ['sourceGraph', 'sketch'], component: 'src/GraphStory.jsx' },
  contextInterpretation: { grader: contextInterpretationGrader, modes: ['builder', 'guided', 'open'], component: 'src/ContextInterpretation.jsx' },
  relationshipModel: { grader: relationshipModelGrader, modes: ['standalone'], component: 'src/RelationshipModel.jsx' },
};

test('every scenario type is a structured surface whose every mode is shared-server graded, with no drift', () => {
  Object.entries(TYPES).forEach(([type, { grader, modes }]) => {
    const declaration = STRUCTURED_TYPE_DECLARATIONS[type];
    assert.equal(GRADING_MANIFEST[type], declaration, `${type} is the manifest's declaration`);
    assert.equal(TOOL_GRADERS[type], grader, `${type} is the registry's grader`);
    assert.equal(grader.declaration, declaration);
    assert.equal(grader.toolId, type);
    assert.equal(declaration.contractVersion, 1);
    assert.deepEqual(Object.keys(declaration.modes).sort(), [...modes].sort());
    modes.forEach((mode) => assert.equal(declaration.modes[mode].authority, GRADING_AUTHORITY.SHARED_SERVER, `${type}.${mode}`));
    assert.deepEqual([...grader.problems], []);
    assert.equal(serverResponseGradingSupport({ type }).supported, true, `${type} is server-gradable`);
  });
});

test('single-view screens resolve one mode whatever question.mode says — and never read question.mode', () => {
  ['graphing', 'graphScenarioMatch', 'graphComparison', 'relationshipModel'].forEach((type) => {
    const { modes, component } = TYPES[type];
    [{}, { mode: '' }, { mode: 'default' }, { mode: 'open' }, { mode: modes[0] }, { mode: 'sketch' }].forEach((question) => {
      assert.equal(resolveToolMode(STRUCTURED_TYPE_DECLARATIONS[type], { type, ...question }), modes[0], `${type} ${JSON.stringify(question)}`);
    });
    assert.doesNotMatch(code(component), /\.mode\b/, `${component} must not start routing on question.mode without its declaration following`);
  });
});

test('graphStory mode resolution is the screen\'s own sketch rule', () => {
  const declaration = STRUCTURED_TYPE_DECLARATIONS.graphStory;
  const questions = [
    {},
    { graph: { functions: [] } },
    { graph: { functions: [] }, requireSketch: true },
    { graph: { functions: [] }, requireSketch: 'true' },
    { graph: 'not an object' },
    { graph: null, requireSketch: false },
    { requireSketch: false },
    { mode: 'sourceGraph' },
    { mode: 'sketch', graph: {} },
  ];
  questions.forEach((question) => {
    const expected = graphStoryRequiresSketch(question) ? 'sketch' : 'sourceGraph';
    assert.equal(resolveToolMode(declaration, { type: 'graphStory', ...question }), expected, JSON.stringify(question));
  });
  assert.equal(resolveToolMode(declaration, { type: 'graphStory', graph: {} }), 'sourceGraph');
  assert.equal(resolveToolMode(declaration, { type: 'graphStory' }), 'sketch');
  // The screen renders (and requires) the sketch from the same helper.
  const source = code('src/GraphStory.jsx');
  assert.match(source, /const requireSketch = graphStoryRequiresSketch\(question\);/);
  assert.match(source, /\{requireSketch && <section/);
});

test('contextInterpretation mode resolution is exactly PointMeaningBuilder\'s responseMode', () => {
  const declaration = STRUCTURED_TYPE_DECLARATIONS.contextInterpretation;
  const responseModes = [undefined, null, '', 'builder', 'guided', 'open', ' open', 'Open', 'OPEN', 'free', 5, ['open']];
  responseModes.forEach((responseMode) => {
    const question = { type: 'contextInterpretation', responseMode };
    assert.equal(
      resolveToolMode(declaration, question),
      movedContextUtils.normalizeInterpretationConfig(question).responseMode,
      `responseMode ${JSON.stringify(responseMode)}`,
    );
  });
  // question.mode is not what the screen routes on.
  assert.equal(resolveToolMode(declaration, { type: 'contextInterpretation', mode: 'open' }), 'builder');
  const builder = code('src/PointMeaningBuilder.jsx');
  assert.match(builder, /const config = normalizeInterpretationConfig\(rawConfig\);/);
  assert.match(builder, /if \(config\.responseMode === 'open'\)/);
});

test('a relationshipModel with a recipe or workflow is a composed workflow, not this surface', () => {
  assert.equal(resolveGradingSurfaceId({ type: 'relationshipModel', quantities: [] }), 'relationshipModel');
  assert.equal(resolveGradingSurfaceId({ type: 'relationshipModel', recipe: { name: 'functionModeling', ask: ['quantities'] } }), 'composedWorkflow');
  assert.equal(resolveGradingSurfaceId({ type: 'relationshipModel', workflow: [{ kind: 'quantityRoles' }] }), 'composedWorkflow');
});

// ---------------------------------------------------------------------------
// The moved helpers: verbatim, and the old src paths still resolve to them
// ---------------------------------------------------------------------------

test('the scenario helpers moved to functions/shared and the src paths re-export the same functions', () => {
  ['normalizeResponseText', 'matchesAcceptedText', 'matchesConceptGroups', 'stableStringify'].forEach((name) => {
    assert.equal(typeof movedScenarioUtils[name], 'function');
    assert.equal(srcScenarioUtils[name], movedScenarioUtils[name], name);
  });
  ['EMPTY_POINT_MEANING', 'normalizeInterpretationConfig', 'buildContextInterpretationParts', 'buildNaturalMeaning', 'buildInterpretationGraph'].forEach((name) => {
    assert.ok(movedContextUtils[name], name);
    assert.equal(srcContextUtils[name], movedContextUtils[name], name);
  });
  assert.match(read('src/scenarioResponseUtils.js'), /^export \* from '\.\.\/functions\/shared\/toolMath\/scenario\/scenarioResponseUtils\.mjs';$/m);
  assert.match(read('src/contextInterpretationUtils.js'), /^export \* from '\.\.\/functions\/shared\/toolMath\/scenario\/contextInterpretationUtils\.mjs';$/m);
});

// ---------------------------------------------------------------------------
// Every screen reports ONLY the shared grader's verdict
// ---------------------------------------------------------------------------

const WIRING = {
  'src/GraphLine.jsx': { grader: 'graphingGrader', tool: 'graphing', work: /const work = useMemo\(\(\) => \(\{ slope, intercept \}\), \[slope, intercept\]\);/ },
  'src/GraphScenarioMatch.jsx': { grader: 'graphScenarioMatchGrader', tool: 'graphScenarioMatch', work: /const work = useMemo\(\(\) => scenarioMatchWork\(matches\), \[matches\]\);/ },
  'src/GraphComparison.jsx': { grader: 'graphComparisonGrader', tool: 'graphComparison', work: /const work = useMemo\(\(\) => fieldResponsesWork\(responses\), \[responses\]\);/ },
  'src/GraphStory.jsx': { grader: 'graphStoryGrader', tool: 'graphStory', work: /const work = useMemo\(\(\) => graphStoryWork\(values\), \[values\]\);/ },
  'src/ContextInterpretation.jsx': { grader: 'contextInterpretationGrader', tool: 'contextInterpretation', work: /const work = useMemo\(\(\) => pointMeaningWork\(values\), \[values\]\);/ },
  'src/RelationshipModel.jsx': { grader: 'relationshipModelGrader', tool: 'relationshipModel', work: /const work = useMemo\(\(\) => relationshipModelWork\(values\), \[values\]\);/ },
};

test('each screen grades its own work through gradeToolCheck and reports answerStateFromSharedGrading — no inline verdict', () => {
  Object.entries(WIRING).forEach(([file, { grader, tool, work }]) => {
    const source = code(file);
    const escapedTool = tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(source, new RegExp(`^import ${grader} from '\\.\\./functions/shared/serverGrading/tools/${escapedTool}\\.mjs';$`, 'm'), `${file} imports its grader`);
    assert.match(source, /^import \{ gradeToolCheck \} from '\.\/tools\/shared\/sharedToolGrading\.js';$/m, `${file} imports gradeToolCheck`);
    assert.match(source, /^import \{ answerStateFromSharedGrading \} from '\.\/platform\/grading\/sharedAnswerState\.js';$/m, `${file} imports answerStateFromSharedGrading`);
    const wiring = region(source, 'const work = useMemo(', 'onUndoStateChange?.(', `${file} grading`);
    assert.match(wiring, work, `${file} builds its work from its own state`);
    assert.match(wiring, new RegExp(`const grading = useMemo\\(\\(\\) => gradeToolCheck\\(${grader}, question, work\\), \\[question, work\\]\\);`), `${file} grades that work with its grader`);
    assert.match(wiring, /onStateChange\(answerStateFromSharedGrading\(grading, \{ questionDetails \}\)\);/, `${file} reports the shared verdict`);
    // The verdict code is gone from the screen.
    assert.doesNotMatch(source, /\bisCorrect\s*:/, `${file} must not build a verdict inline`);
    assert.doesNotMatch(source, /\bisComplete\s*:/, `${file} must not build completeness inline`);
    assert.doesNotMatch(source, /\b(matchesAcceptedText|matchesConceptGroups|buildContextInterpretationParts)\(/, `${file} must not run a grading check inline`);
    assert.doesNotMatch(source, /correctMatches|correctIndependentId|acceptedX|requiredConcepts/, `${file} must not read answer-key fields`);
  });
});

test('answerState comes from the shared result: completeness gates Submit, credit and parts are the grader\'s', () => {
  const question = { type: 'graphing', m: 2, b: -3 };
  const partial = gradeToolCheck(graphingGrader, question, { slope: '2', intercept: '3' });
  const state = answerStateFromSharedGrading(partial, { questionDetails: 'details' });
  assert.equal(state.isComplete, true);
  assert.equal(state.isCorrect, false);
  assert.equal(state.partialCreditPercent, 50);
  assert.equal(state.questionDetails, 'details');
  assert.equal(state.responseKey, partial.toolResponse.value);
  assert.equal(state.toolResponse.kind, 'tool');
  assert.equal(state.toolResponse.toolId, 'graphing');
  assert.deepEqual(state.parts, partial.parts);
  const empty = answerStateFromSharedGrading(gradeToolCheck(graphingGrader, question, { slope: '', intercept: '' }));
  assert.equal(empty.isComplete, false, 'blank work cannot be submitted or auto-submitted');
  const refused = answerStateFromSharedGrading(gradeToolCheck(graphingGrader, question, 'not work'));
  assert.equal(refused.isComplete, false);
  assert.equal(refused.partialCreditPercent, null);
});

// ===========================================================================
// graphing — lineFeatures
// ===========================================================================

const LINE = { type: 'graphing', m: 2, b: -3, prompt: 'Identify the slope and the y-intercept.' };
const LINE_FRACTION = { type: 'graphing', m: 0.5, b: 1.25 };
const LINE_ZERO = { type: 'graphing', m: 0, b: 0 };
const lineWork = (slope, intercept) => ({ slope, intercept });

test('graphing: correct, incorrect, partial and incomplete work match the old screen part-for-part', () => {
  const fixtures = [
    [LINE, lineWork('2', '-3'), true],
    [LINE, lineWork('-3', '2'), false],
    [LINE, lineWork('2', '3'), false],
    [LINE, lineWork('2', ''), false],
    [LINE, lineWork('', ''), false],
    [LINE, lineWork('2.0', '-3.00'), true],
    [LINE, lineWork('+2', '-3e0'), true],
    [LINE, lineWork(' 2 ', '-3'), true],
    [LINE, lineWork('2.0000001', '-3'), false],
    [LINE_FRACTION, lineWork('0.5', '1.25'), true],
    [LINE_FRACTION, lineWork('.5', '1.250'), true],
    // The box is a number input: "1/2" is not a number it reports.
    [LINE_FRACTION, lineWork('1/2', '1.25'), false],
    [LINE_ZERO, lineWork('0', '-0'), true],
    // A space is not blank to the old screen, and Number(' ') is 0.
    [LINE_ZERO, lineWork(' ', '0'), true],
  ];
  fixtures.forEach(([question, work, correct]) => {
    const result = gradeBoth(graphingGrader, question, work);
    assertMatchesLegacy(result, legacyGraphLine(question, work), `${JSON.stringify(question)} ${JSON.stringify(work)}`);
    assert.equal(result.isCorrect, correct, JSON.stringify(work));
    assertCleanWork(work, 'graphing');
  });
  const half = gradeBoth(graphingGrader, LINE, lineWork('2', '3'));
  assert.equal(half.score, 0.5);
  assert.deepEqual(half.parts.map((part) => part.isCorrect), [true, false]);
  const incomplete = gradeBoth(graphingGrader, LINE, lineWork('2', ''));
  assert.equal(incomplete.isComplete, false);
  assert.equal(incomplete.score, 0.5, 'an explicit check on incomplete work is still graded');
});

test('graphing: the verdict depends on the key — correct work against an altered key is wrong', () => {
  assert.equal(gradeBoth(graphingGrader, LINE, lineWork('2', '-3')).isCorrect, true);
  assert.equal(gradeBoth(graphingGrader, { ...LINE, b: 3 }, lineWork('2', '-3')).isCorrect, false);
  assert.equal(gradeBoth(graphingGrader, { ...LINE, m: -2 }, lineWork('2', '-3')).isCorrect, false);
});

test('graphing: tampered and malformed work is read as typed text or refused', () => {
  // Numbers are what a student could have typed.
  assert.equal(gradeBoth(graphingGrader, LINE, { slope: 2, intercept: -3 }).isCorrect, true);
  // Anything else is blank.
  const odd = gradeBoth(graphingGrader, LINE, { slope: { value: 2 }, intercept: [-3] });
  assert.equal(odd.isComplete, false);
  assert.equal(odd.isCorrect, false);
  assert.equal(gradeBoth(graphingGrader, LINE, { slope: true, intercept: null }).isComplete, false);
  assert.equal(gradeBoth(graphingGrader, LINE, {}).isComplete, false);
  assertInjectionIgnored(graphingGrader, LINE, lineWork('2', '1'));
  assertRefusesMalformed(graphingGrader, LINE);
});

test('graphing: a generated (per-student) line is graded on the device and refused by the server', () => {
  const generated = { type: 'graphing', m: 4, b: 1, generator: { kind: 'lineGraph' } };
  const browser = gradeToolCheck(graphingGrader, generated, lineWork('4', '1'));
  assert.equal(browser.isCorrect, true);
  const server = gradeServerResponse({ question: generated, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, false);
  assert.equal(server.reason, 'generated-question');
});

/*
 * BEHAVIOR CHANGE (documented in the grader): the catalog / V5 shape authors a
 * graph with one line and no m/b. The old screen compared every entry with
 * `undefined`, so these items could never be marked correct.
 */
const CATALOG_LINE = {
  type: 'graphing',
  prompt: 'What is the y-intercept of the line shown?',
  graph: { functions: [{ type: 'line', m: 2, b: -3 }], xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
  answer: -3,
};

test('graphing: an item with no authored m/b is keyed by the single line its graph shows (was never correct)', () => {
  const before = legacyGraphLine(CATALOG_LINE, lineWork('2', '-3'));
  assert.equal(before.isCorrect, false, 'pinned: the old screen could not mark this correct');
  const after = gradeBoth(graphingGrader, CATALOG_LINE, lineWork('2', '-3'));
  assert.equal(after.isCorrect, true);
  assert.equal(gradeBoth(graphingGrader, CATALOG_LINE, lineWork('2', '3')).score, 0.5);
  assert.equal(gradeBoth(graphingGrader, CATALOG_LINE, lineWork('-3', '2')).isCorrect, false);
  // A visual of type graph is what the screen shows when there is no `graph`.
  const visual = { type: 'graphing', visual: { type: 'graph', functions: [{ type: 'line', m: -1, b: 4 }] } };
  assert.equal(gradeBoth(graphingGrader, visual, lineWork('-1', '4')).isCorrect, true);
  // An authored numeric string was also never matchable.
  assert.equal(legacyGraphLine({ type: 'graphing', m: '2', b: '-3' }, lineWork('2', '-3')).isCorrect, false);
  assert.equal(gradeBoth(graphingGrader, { type: 'graphing', m: '2', b: '-3' }, lineWork('2', '-3')).isCorrect, true);
});

test('graphing: an authored key always wins, and an ambiguous graph still has no key', () => {
  // Authored m/b are the key exactly as before, even when the graph disagrees.
  const authored = { ...CATALOG_LINE, m: 5, b: 1 };
  assertMatchesLegacy(gradeBoth(graphingGrader, authored, lineWork('5', '1')), legacyGraphLine(authored, lineWork('5', '1')), 'authored over graph');
  assert.equal(gradeBoth(graphingGrader, authored, lineWork('2', '-3')).isCorrect, false);
  // Per field: an authored slope keeps its key; only the missing intercept is read from the line.
  assert.equal(gradeBoth(graphingGrader, { ...CATALOG_LINE, m: 2 }, lineWork('2', '-3')).isCorrect, true);
  const unkeyed = [
    { type: 'graphing' },
    { type: 'graphing', graph: { functions: [{ type: 'line', m: 2, b: -3 }, { type: 'line', m: 1, b: 0 }] } },
    { type: 'graphing', graph: { functions: [{ type: 'quadratic', a: 1, b: 2, c: 3 }] } },
    { type: 'graphing', graph: { functions: [{ type: 'line', m: 2 }] } },
    { type: 'graphing', graph: { functions: [{ type: 'line', m: 2, b: -3 }], line: { m: 1, b: 1 } } },
    { type: 'graphing', graph: { functions: [{ type: 'line', m: 2, b: -3 }], m: 4 } },
    { type: 'graphing', m: 'two', b: null },
  ];
  unkeyed.forEach((question) => {
    ['0', '1', '2', '-3'].forEach((slope) => ['0', '1', '-3'].forEach((intercept) => {
      const result = gradeBoth(graphingGrader, question, lineWork(slope, intercept));
      assert.equal(result.isCorrect, false, `${JSON.stringify(question)} has no key`);
      // Same as the old screen for the unauthored-default and ambiguous shapes.
      if (question.m === undefined || typeof question.m === 'number') assertMatchesLegacy(result, legacyGraphLine(question, lineWork(slope, intercept)), JSON.stringify(question));
    }));
  });
});

// ===========================================================================
// graphScenarioMatch — matchBoard
// ===========================================================================

const MATCH = {
  type: 'graphScenarioMatch',
  prompt: 'Match each story to its graph.',
  graphs: [{ id: 'g1', graph: {} }, { id: 'g2', graph: {} }, { id: 'g3', graph: {} }],
  scenarios: [{ id: 's1', title: 'Fills' }, { id: 's2', title: 'Drains' }, { id: 's3' }],
  correctMatches: { s1: 'g1', s2: 'g2', s3: 'g3' },
};
// No correctMatches: each scenario's own graphId is the key.
const MATCH_BY_GRAPH_ID = {
  type: 'graphScenarioMatch',
  graphs: [{ id: 'a', graph: {} }, { id: 'b', graph: {} }],
  scenarios: [{ id: 'one', graphId: 'b' }, { id: 'two', graphId: 'a' }],
};

test('graphScenarioMatch: correct, swapped, partial and incomplete boards match the old screen', () => {
  const boards = [
    [MATCH, { s1: 'g1', s2: 'g2', s3: 'g3' }, true],
    [MATCH, { s3: 'g3', s1: 'g1', s2: 'g2' }, true],
    [MATCH, { s1: 'g2', s2: 'g1', s3: 'g3' }, false],
    [MATCH, { s1: 'g1' }, false],
    [MATCH, {}, false],
    [MATCH_BY_GRAPH_ID, { one: 'b', two: 'a' }, true],
    [MATCH_BY_GRAPH_ID, { one: 'a', two: 'b' }, false],
  ];
  boards.forEach(([question, matches, correct]) => {
    const work = scenarioMatchWork(matches);
    const result = gradeBoth(graphScenarioMatchGrader, question, work);
    assertMatchesLegacy(result, legacyScenarioMatch(question, matches), JSON.stringify(matches));
    assert.equal(result.isCorrect, correct, JSON.stringify(matches));
    assertCleanWork(work, 'graphScenarioMatch');
  });
  const oneOfThree = gradeBoth(graphScenarioMatchGrader, MATCH, scenarioMatchWork({ s1: 'g1', s2: 'g3', s3: 'g2' }));
  assert.equal(oneOfThree.isComplete, true);
  assert.ok(Math.abs(oneOfThree.score - 1 / 3) < 1e-12);
  // The order the student made the matches in is not part of the work.
  assert.deepEqual(scenarioMatchWork({ s3: 'g3', s1: 'g1' }), scenarioMatchWork({ s1: 'g1', s3: 'g3' }));
});

test('graphScenarioMatch: graded against the key, not the graph bank — a trimmed or reordered bank changes nothing', () => {
  const matches = { s1: 'g1', s2: 'g2', s3: 'g3' };
  const trimmed = { ...MATCH, graphs: MATCH.graphs.slice(0, 2) };
  const reordered = { ...MATCH, graphs: [...MATCH.graphs].reverse(), scenarios: [...MATCH.scenarios].reverse() };
  const base = gradeBoth(graphScenarioMatchGrader, MATCH, scenarioMatchWork(matches));
  assert.equal(gradeBoth(graphScenarioMatchGrader, trimmed, scenarioMatchWork(matches)).isCorrect, base.isCorrect);
  assert.equal(gradeBoth(graphScenarioMatchGrader, reordered, scenarioMatchWork(matches)).isCorrect, true);
});

test('graphScenarioMatch: an altered key marks the same board wrong', () => {
  const work = scenarioMatchWork({ s1: 'g1', s2: 'g2', s3: 'g3' });
  assert.equal(gradeBoth(graphScenarioMatchGrader, MATCH, work).isCorrect, true);
  const altered = { ...MATCH, correctMatches: { s1: 'g2', s2: 'g1', s3: 'g3' } };
  const result = gradeBoth(graphScenarioMatchGrader, altered, work);
  assert.equal(result.isCorrect, false);
  assert.deepEqual(result.parts.map((part) => part.isCorrect), [false, false, true]);
});

test('graphScenarioMatch: authored ids that collide with verdict keys survive the response contract', () => {
  const question = {
    type: 'graphScenarioMatch',
    graphs: [{ id: 'expected', graph: {} }, { id: 'score', graph: {} }],
    scenarios: [{ id: 'correct' }, { id: 'feedback' }],
    correctMatches: { correct: 'expected', feedback: 'score' },
  };
  const work = scenarioMatchWork({ correct: 'expected', feedback: 'score' });
  assertCleanWork(work, 'colliding ids');
  assert.equal(gradeBoth(graphScenarioMatchGrader, question, work).isCorrect, true);
});

test('graphScenarioMatch: tampered entries are ignored; malformed work is refused', () => {
  const question = MATCH;
  // First entry for a scenario wins; junk entries are skipped.
  const tampered = {
    matches: [
      { scenarioId: 's1', graphId: 'g1' },
      { scenarioId: 's1', graphId: 'g9' },
      { scenarioId: 's2', graphId: { id: 'g2' } },
      { scenarioId: null, graphId: 'g3' },
      'g3',
      { scenarioId: 's3', graphId: 'g3', isCorrect: true },
    ],
  };
  const result = gradeBoth(graphScenarioMatchGrader, question, tampered);
  assert.deepEqual(result.parts.map((part) => [part.id, part.isComplete, part.isCorrect]), [['match:s1', true, true], ['match:s2', false, false], ['match:s3', true, true]]);
  assert.equal(gradeBoth(graphScenarioMatchGrader, question, { matches: { s1: 'g1' } }).isComplete, false);
  assertInjectionIgnored(graphScenarioMatchGrader, question, scenarioMatchWork({ s1: 'g1', s2: 'g3' }));
  assertRefusesMalformed(graphScenarioMatchGrader, question);
  // Only a scenario's OWN match counts (the old screen read inherited ones).
  const prototypeId = { type: 'graphScenarioMatch', graphs: [{ id: 'g1', graph: {} }], scenarios: [{ id: 'constructor' }], correctMatches: { constructor: 'g1' } };
  assert.equal(gradeBoth(graphScenarioMatchGrader, prototypeId, scenarioMatchWork({})).isComplete, false);
  assert.equal(gradeBoth(graphScenarioMatchGrader, prototypeId, scenarioMatchWork({ constructor: 'g1' })).isCorrect, true);
});

test('graphScenarioMatch: an unauthored key cannot be satisfied by matching, exactly as before', () => {
  const unkeyed = { type: 'graphScenarioMatch', graphs: [{ id: 'g1', graph: {} }], scenarios: [{ id: 's1' }] };
  const matched = gradeBoth(graphScenarioMatchGrader, unkeyed, scenarioMatchWork({ s1: 'g1' }));
  assertMatchesLegacy(matched, legacyScenarioMatch(unkeyed, { s1: 'g1' }), 'unkeyed');
  assert.equal(matched.isCorrect, false);
  const noScenarios = gradeBoth(graphScenarioMatchGrader, { type: 'graphScenarioMatch' }, scenarioMatchWork({}));
  assert.equal(noScenarios.isComplete, false);
  assert.equal(noScenarios.isCorrect, false);
});

// ===========================================================================
// graphComparison — compare
// ===========================================================================

const COMPARE = {
  type: 'graphComparison',
  prompt: 'Compare the two lines.',
  graphs: [{ id: 'a', label: 'Graph A', graph: {} }, { id: 'b', label: 'Graph B', graph: {} }],
  fields: [
    { id: 'steeper', label: 'Which is steeper?', type: 'choice', options: ['a', 'b', 'same'], answer: 'same' },
    { id: 'higher', type: 'choice', options: [{ value: 'a', label: 'Graph A' }, { value: 'b', label: 'Graph B' }], acceptedAnswers: ['b', 'Graph B'] },
    { id: 'diff', label: 'What changed?', requiredConcepts: [['y-intercept', 'intercept', 'starting value'], ['3', 'three']] },
    { id: 'how', requiredConceptGroups: [{ anyOf: ['up', 'shift'] }] },
  ],
};
const compareState = (overrides = {}) => ({ steeper: 'same', higher: 'b', diff: 'The y-intercept went up by 3.', how: 'It shifts up.', ...overrides });

test('graphComparison: correct, wrong, partial and incomplete responses match the old screen', () => {
  const fixtures = [
    [compareState(), true],
    // Equivalent forms the old normalization accepts.
    [compareState({ steeper: 'SAME', higher: 'graph b', diff: 'Its intercept is three more', how: 'a SHIFT' }), true],
    [compareState({ steeper: ' same ', higher: "Graph B's" }), false],
    [compareState({ steeper: 'a' }), false],
    [compareState({ diff: 'The slope is the same.' }), false],
    [compareState({ how: '' }), false],
    [{}, false],
  ];
  fixtures.forEach(([state, correct]) => {
    const work = fieldResponsesWork(state);
    const result = gradeBoth(graphComparisonGrader, COMPARE, work);
    assertMatchesLegacy(result, legacyGraphComparison(COMPARE, state), JSON.stringify(state));
    assert.equal(result.isCorrect, correct, JSON.stringify(state));
    assertCleanWork(work, 'graphComparison');
  });
  const half = gradeBoth(graphComparisonGrader, COMPARE, fieldResponsesWork(compareState({ steeper: 'a', diff: 'nothing' })));
  assert.equal(half.isComplete, true);
  assert.equal(half.score, 0.5);
});

test('graphComparison: a choice is graded against its key, never the options list', () => {
  const trimmed = { ...COMPARE, fields: COMPARE.fields.map((field) => (field.options ? { ...field, options: field.options.slice(0, 1).reverse() } : field)) };
  assert.equal(gradeBoth(graphComparisonGrader, trimmed, fieldResponsesWork(compareState())).isCorrect, true);
  assert.equal(gradeBoth(graphComparisonGrader, { ...COMPARE, fields: COMPARE.fields.map((field) => ({ ...field, options: [] })) }, fieldResponsesWork(compareState())).isCorrect, true);
});

test('graphComparison: an altered key marks the same responses wrong', () => {
  const work = fieldResponsesWork(compareState());
  assert.equal(gradeBoth(graphComparisonGrader, COMPARE, work).isCorrect, true);
  const altered = { ...COMPARE, fields: COMPARE.fields.map((field) => (field.id === 'steeper' ? { ...field, answer: 'a' } : field.id === 'diff' ? { ...field, requiredConcepts: ['slope'] } : field)) };
  const result = gradeBoth(graphComparisonGrader, altered, work);
  assert.equal(result.isCorrect, false);
  assert.deepEqual(result.parts.map((part) => part.isCorrect), [false, true, false, true]);
});

test('graphComparison: KNOWN CONTENT DEFECT kept at parity — an untyped field with no concepts accepts any text', () => {
  // The type catalog's own example.
  const catalog = { type: 'graphComparison', graphs: [], fields: [{ id: 'diff', label: 'What changed?', answer: 'the y-intercept' }] };
  ['the y-intercept', 'anything at all', 'x'].forEach((text) => {
    const result = gradeBoth(graphComparisonGrader, catalog, fieldResponsesWork({ diff: text }));
    assertMatchesLegacy(result, legacyGraphComparison(catalog, { diff: text }), text);
    assert.equal(result.isCorrect, true, 'pinned: credit is not silently changed — Pre-Flight must require concepts');
  });
  assert.equal(gradeBoth(graphComparisonGrader, catalog, fieldResponsesWork({ diff: '   ' })).isCorrect, false);
});

test('graphComparison: field ids that collide with verdict keys survive; tampered and malformed work is handled', () => {
  const colliding = { type: 'graphComparison', fields: [{ id: 'feedback', type: 'choice', answer: 'yes' }, { id: 'score', requiredConcepts: ['slope'] }] };
  const state = { feedback: 'yes', score: 'the slope doubles' };
  assertCleanWork(fieldResponsesWork(state), 'colliding field ids');
  assert.equal(gradeBoth(graphComparisonGrader, colliding, fieldResponsesWork(state)).isCorrect, true);
  // First entry wins; non-text values are blank. (An array of STRINGS is the
  // chunked form of long free text, so it is text — see the free-text test.)
  const tampered = { responses: [{ fieldId: 'feedback', text: 'yes' }, { fieldId: 'feedback', text: 'no' }, { fieldId: 'score', text: [1, 'slope'] }] };
  const result = gradeBoth(graphComparisonGrader, colliding, tampered);
  assert.deepEqual(result.parts.map((part) => [part.isComplete, part.isCorrect]), [[true, true], [false, false]]);
  assert.equal(gradeBoth(graphComparisonGrader, colliding, { responses: [{ fieldId: 'feedback', text: 'yes' }, { fieldId: 'score', text: { slope: 'slope' } }] }).isComplete, false);
  assert.equal(gradeBoth(graphComparisonGrader, colliding, { responses: { feedback: 'yes' } }).isComplete, false);
  assertInjectionIgnored(graphComparisonGrader, COMPARE, fieldResponsesWork(compareState({ steeper: 'a' })));
  assertRefusesMalformed(graphComparisonGrader, COMPARE);
  const unauthored = gradeBoth(graphComparisonGrader, { type: 'graphComparison' }, fieldResponsesWork({ a: 'x' }));
  assert.equal(unauthored.isComplete, false, 'no fields: nothing can be submitted, as before');
});

// ===========================================================================
// graphStory — sourceGraph / sketch
// ===========================================================================

const STORY_SKETCH = { type: 'graphStory', prompt: 'Write a scenario and sketch it.' };
const STORY_SOURCE = { type: 'graphStory', prompt: 'Tell this graph\'s story.', graph: { functions: [{ type: 'line', m: -1, b: 6 }] } };
const STORY_SOURCE_SKETCH = { ...STORY_SOURCE, requireSketch: true };
const STORY_MINIMUMS = { ...STORY_SOURCE, minimumScenarioCharacters: 40, minimumExplanationCharacters: 5 };

const stroke = (count, offset = 0) => Array.from({ length: count }, (_, index) => ({ x: 50.37 + index * 6.13 + offset, y: 370.91 - index * 2.71 }));
const storyState = (overrides = {}) => ({
  scenario: 'A bucket leaks water at a steady rate for six minutes.',
  independent: 'time',
  dependent: 'water left',
  xLabel: 'Time',
  xUnit: 'minutes',
  yLabel: 'Water',
  yUnit: 'litres',
  explanation: 'The line falls one litre each minute until it is empty.',
  strokes: [stroke(12)],
  ...overrides,
});

test('graphStory: completion verdicts match the old screen in both modes', () => {
  const fixtures = [
    [STORY_SKETCH, storyState(), true],
    [STORY_SKETCH, storyState({ strokes: [] }), false],
    [STORY_SKETCH, storyState({ strokes: [stroke(2), stroke(1)] }), false],
    [STORY_SKETCH, storyState({ strokes: [stroke(1), stroke(3)] }), true],
    [STORY_SKETCH, storyState({ scenario: 'Too short.' }), false],
    [STORY_SKETCH, storyState({ xUnit: '  ' }), false],
    [STORY_SOURCE, storyState({ strokes: [] }), true],
    [STORY_SOURCE, storyState({ explanation: '                     x' }), false],
    [STORY_SOURCE_SKETCH, storyState({ strokes: [] }), false],
    [STORY_SOURCE_SKETCH, storyState(), true],
    [STORY_MINIMUMS, storyState({ explanation: 'Fall' }), false],
    [STORY_MINIMUMS, storyState({ explanation: 'Falls' }), true],
    [STORY_MINIMUMS, storyState({ scenario: 'x'.repeat(40), explanation: 'Falls.' }), true],
    // `|| 20`: a zero minimum means the default.
    [{ ...STORY_SOURCE, minimumScenarioCharacters: 0 }, storyState({ scenario: 'short story here' }), false],
    [{ type: 'graphStory' }, storyState(), true],
  ];
  fixtures.forEach(([question, state, complete]) => {
    const work = graphStoryWork(state);
    const result = gradeBoth(graphStoryGrader, question, work);
    assertMatchesLegacy(result, legacyGraphStory(question, state), `${JSON.stringify(question)} ${state.scenario}`);
    assert.equal(result.isComplete, complete);
    assert.equal(result.isCorrect, complete, 'completion credit: correct exactly when complete');
    assertCleanWork(work, 'graphStory');
  });
  const partial = gradeBoth(graphStoryGrader, STORY_SKETCH, graphStoryWork(storyState({ strokes: [], scenario: '' })));
  assert.ok(Math.abs(partial.score - 4 / 6) < 1e-12, 'four of six parts present');
});

test('graphStory: the bounded sketch preserves the >= 3 point rule the old response key destroyed', () => {
  // The old compaction kept every fourth point: a 3-point stroke became 1 point.
  assert.equal(legacyCompactStroke(stroke(3)).length, 1);
  assert.equal(legacyCompactStroke(stroke(11)).length, 3);
  [1, 2, 3, 4, 11, 24, 25, 400].forEach((count) => {
    const [compacted] = compactSketchStrokes([stroke(count)]);
    assert.equal(isQualifyingStroke(compacted), count >= 3, `${count}-point stroke`);
    assert.equal(compacted.length, Math.min(count, SKETCH_LIMITS.maxPointsPerStroke));
    // Both ends survive, in whole viewBox units.
    assert.deepEqual(compacted[0], [Math.round(stroke(count)[0].x), Math.round(stroke(count)[0].y)]);
    assert.deepEqual(compacted.at(-1), [Math.round(stroke(count).at(-1).x), Math.round(stroke(count).at(-1).y)]);
  });
  // More strokes than the cap: the one qualifying stroke is kept, wherever it was drawn.
  const taps = Array.from({ length: 60 }, (_, index) => stroke(1, index));
  for (const strokes of [[...taps, stroke(3)], [stroke(3), ...taps], [...taps.slice(0, 30), stroke(5), ...taps.slice(30)]]) {
    const compacted = compactSketchStrokes(strokes);
    assert.equal(compacted.length, SKETCH_LIMITS.maxStrokes);
    assert.equal(compacted.some(isQualifyingStroke), true);
    const state = storyState({ strokes });
    assert.equal(gradeBoth(graphStoryGrader, STORY_SKETCH, graphStoryWork(state)).isComplete, legacyGraphStory(STORY_SKETCH, state).isComplete);
  }
  assert.equal(compactSketchStrokes(taps).some(isQualifyingStroke), false);
});

test('graphStory: maximal realistic work stays inside the response limits', () => {
  const long = (letter) => `${letter} `.repeat(500).slice(0, TOOL_RESPONSE_LIMITS.maxStringLength);
  const strokes = Array.from({ length: 80 }, (_, index) => Array.from({ length: 500 }, (__, point) => ({ x: 44 + ((point * 7 + index) % 632) + 0.123, y: 44 + ((point * 3 + index) % 332) + 0.987 })));
  const state = {
    scenario: long('s'), independent: long('i'), dependent: long('d'), xLabel: long('x'), xUnit: long('u'),
    yLabel: long('y'), yUnit: long('v'), explanation: long('e'), strokes,
  };
  const work = graphStoryWork(state);
  assertCleanWork(work, 'maximal graph story');
  const result = gradeBoth(graphStoryGrader, STORY_SKETCH, work);
  assert.equal(result.graded, true);
  assert.equal(result.isComplete, true);
  // The two textareas at the free-text cap, beside every short field at the
  // per-string limit and the largest sketch, still fit.
  const capped = graphStoryWork({ ...state, scenario: 's'.repeat(FREE_TEXT_LIMITS.maxLength), explanation: 'e'.repeat(FREE_TEXT_LIMITS.maxLength) });
  assertCleanWork(capped, 'graph story at the free-text cap');
  assert.equal(gradeBoth(graphStoryGrader, STORY_SKETCH, capped).isComplete, true);
  // Even when every character of both textareas is one JSON must escape, the
  // work beside the largest sketch can still be graded and submitted.
  const escaped = '"\n'.repeat(FREE_TEXT_LIMITS.maxLength / 2);
  const escapeHeavy = graphStoryWork({ ...storyState({ strokes }), scenario: escaped, explanation: escaped });
  assertCleanWork(escapeHeavy, 'escape-heavy graph story at the cap');
  assert.equal(gradeBoth(graphStoryGrader, STORY_SKETCH, escapeHeavy).isComplete, true);
  // Free text beyond the cap is cut there (documented), never by the contract mid-grade.
  const overlong = graphStoryWork(storyState({ explanation: 'z'.repeat(5000) }));
  assert.equal(boundToolWork(overlong).truncated, false);
  assert.equal(readGraphStoryText(overlong).explanation.length, FREE_TEXT_LIMITS.maxLength);
});

test('graphStory: tampered sketches and fields are read conservatively; malformed work is refused', () => {
  const work = graphStoryWork(storyState());
  const badStrokes = [
    'xyz',
    [[1, 2], [3, 4], 'p'],
    [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }],
    [[1, 2], [3, Number.NaN], [5, 6]],
    [[1, 2, 3]],
  ];
  const tampered = gradeBoth(graphStoryGrader, STORY_SKETCH, { ...work, strokes: badStrokes });
  assert.equal(tampered.parts.find((part) => part.id === 'graph-sketch').isComplete, false);
  assert.equal(gradeBoth(graphStoryGrader, STORY_SKETCH, { ...work, strokes: 'many' }).isComplete, false);
  assert.equal(gradeBoth(graphStoryGrader, STORY_SKETCH, { ...work, scenario: { text: 'a'.repeat(40) } }).isComplete, false);
  assertInjectionIgnored(graphStoryGrader, STORY_SKETCH, work);
  assertRefusesMalformed(graphStoryGrader, STORY_SKETCH);
});

// ===========================================================================
// contextInterpretation — builder / guided / open
// ===========================================================================

const POINT = {
  type: 'contextInterpretation',
  prompt: 'What does the highlighted point mean?',
  scenario: 'A car travels at a steady speed.',
  target: { kind: 'arbitraryPoint', coordinates: [3, 45] },
  quantities: {
    x: { id: 'time', name: 'Time', unit: 'hours', acceptedUnits: ['hours', 'hr', 'h'] },
    y: { id: 'distance', name: 'Distance', unit: 'kilometres', acceptedNames: ['distance travelled'], acceptedUnits: ['km', 'kilometres'] },
  },
};
const POINT_GUIDED = { ...POINT, responseMode: 'guided' };
const POINT_OPEN = { ...POINT, responseMode: 'open', requiredConcepts: [['3 hours', 'three hours'], ['45', 'forty-five'], ['km', 'kilometres']] };
const meaning = (overrides = {}) => ({ xQuantityId: 'time', xValue: '3', xUnit: 'hours', yQuantityId: 'distance', yValue: '45', yUnit: 'km', openText: '', ...overrides });

test('contextInterpretation: every mode matches the old screen part-for-part', () => {
  const fixtures = [
    [POINT, meaning(), true],
    [POINT, meaning({ xValue: '3.0', yValue: '45.000000001', xUnit: 'HR', yQuantityId: 'Distance Travelled' }), true],
    [POINT, meaning({ xQuantityId: 'distance', yQuantityId: 'time' }), false],
    [POINT, meaning({ xValue: '45', yValue: '3' }), false],
    [POINT, meaning({ yValue: '45.0001' }), false],
    [POINT, meaning({ yUnit: 'miles' }), false],
    [POINT, meaning({ xUnit: '' }), false],
    [POINT, meaning({ xQuantityId: '', xValue: '', xUnit: '', yQuantityId: '', yValue: '', yUnit: '' }), false],
    [{ ...POINT, requireUnits: false, requireQuantities: false }, meaning({ xUnit: '', yUnit: 'parsecs', xQuantityId: '' }), true],
    [{ ...POINT, requireValues: false }, meaning({ xValue: '', yValue: '' }), true],
    [POINT_GUIDED, meaning({ xQuantityId: '', yQuantityId: '' }), true],
    [POINT_GUIDED, meaning({ xQuantityId: 'distance', yUnit: 'kilometres' }), true],
    [POINT_GUIDED, meaning({ xValue: '4' }), false],
    [POINT_OPEN, meaning({ openText: 'After three hours the car has gone 45 km.' }), true],
    [POINT_OPEN, meaning({ openText: 'After 3 hours the car has gone forty-five kilometres.' }), true],
    [POINT_OPEN, meaning({ openText: 'After 3 hours the car stopped.' }), false],
    [POINT_OPEN, meaning({ openText: '' }), false],
    // `coordinates` beside the config is read when there is no target.
    [{ ...POINT, target: undefined, coordinates: [3, 45] }, meaning(), true],
  ];
  fixtures.forEach(([question, values, correct]) => {
    const work = pointMeaningWork(values);
    const result = gradeBoth(contextInterpretationGrader, question, work);
    assertMatchesLegacy(result, legacyContextInterpretation(question, values), `${question.responseMode || 'builder'} ${JSON.stringify(values)}`);
    assert.equal(result.isCorrect, correct, JSON.stringify(values));
    assert.equal(result.mode, movedContextUtils.normalizeInterpretationConfig(question).responseMode);
    assertCleanWork(work, 'contextInterpretation');
  });
  const builderPartial = gradeBoth(contextInterpretationGrader, POINT, pointMeaningWork(meaning({ yValue: '40', yUnit: 'miles' })));
  assert.equal(builderPartial.parts.length, 6);
  assert.ok(Math.abs(builderPartial.score - 4 / 6) < 1e-12);
});

test('contextInterpretation: an altered key marks the same interpretation wrong', () => {
  const work = pointMeaningWork(meaning());
  assert.equal(gradeBoth(contextInterpretationGrader, POINT, work).isCorrect, true);
  assert.equal(gradeBoth(contextInterpretationGrader, { ...POINT, target: { coordinates: [3, 50] } }, work).isCorrect, false);
  assert.equal(gradeBoth(contextInterpretationGrader, { ...POINT, quantities: { ...POINT.quantities, x: { ...POINT.quantities.x, id: 'fuel', acceptedNames: [] } } }, work).isCorrect, false);
  assert.equal(gradeBoth(contextInterpretationGrader, { ...POINT_OPEN, requiredConcepts: ['50'] }, pointMeaningWork(meaning({ openText: 'After 3 hours it has gone 45 km.' }))).isCorrect, false);
});

test('contextInterpretation: KNOWN CONTENT DRIFT kept at parity — catalog `point` / object quantityChoices items cannot be fully correct', () => {
  const catalog = {
    type: 'contextInterpretation',
    prompt: 'What does the point (3, 45) mean here?',
    scenario: 'A car travels at a steady speed.',
    point: [3, 45],
    quantityChoices: { x: ['hours driven', 'litres of fuel'], y: ['kilometres travelled', 'cost'] },
  };
  const values = meaning({ xQuantityId: 'x', yQuantityId: 'y', xUnit: 'hours', yUnit: 'km' });
  const result = gradeBoth(contextInterpretationGrader, catalog, pointMeaningWork(values));
  assertMatchesLegacy(result, legacyContextInterpretation(catalog, values), 'catalog shape');
  assert.equal(result.isCorrect, false, 'pinned: values and units have no key in this shape');
  assert.deepEqual(result.parts.filter((part) => part.isCorrect).map((part) => part.id), ['meaning-x-quantity', 'meaning-y-quantity']);
  // Unauthored defaults: the only quantity ids are 'x' and 'y', and nothing else has a key.
  const unauthored = gradeBoth(contextInterpretationGrader, { type: 'contextInterpretation' }, pointMeaningWork(values));
  assertMatchesLegacy(unauthored, legacyContextInterpretation({ type: 'contextInterpretation' }, values), 'unauthored');
  assert.equal(unauthored.isCorrect, false);
  // Open mode with no concepts accepts any text (content defect, parity).
  assert.equal(gradeBoth(contextInterpretationGrader, { type: 'contextInterpretation', responseMode: 'open' }, pointMeaningWork(meaning({ openText: 'whatever' }))).isCorrect, true);
});

test('contextInterpretation: tampered and malformed work', () => {
  const numbers = gradeBoth(contextInterpretationGrader, POINT, { ...pointMeaningWork(meaning()), xValue: 3, yValue: 45 });
  assert.equal(numbers.isCorrect, true, 'a number is what the student could have typed');
  const objects = gradeBoth(contextInterpretationGrader, POINT, { ...pointMeaningWork(meaning()), xQuantityId: { id: 'time' }, yValue: [45] });
  assert.deepEqual(objects.parts.filter((part) => !part.isComplete).map((part) => part.id), ['meaning-x-quantity', 'meaning-y-value']);
  assertInjectionIgnored(contextInterpretationGrader, POINT, pointMeaningWork(meaning({ yUnit: 'miles' })));
  assertRefusesMalformed(contextInterpretationGrader, POINT);
  assertCleanWork(pointMeaningWork(meaning({ openText: 'o'.repeat(1000) })), 'maximal open text');
});

// ===========================================================================
// relationshipModel — standalone
// ===========================================================================

const POOL_QUANTITIES = [
  { id: 'time', label: 'Time', unit: 'minutes' },
  { id: 'volume', label: 'Water in the pool', unit: 'litres' },
  { id: 'rate', label: 'Fill rate' },
];
const MODEL = {
  type: 'relationshipModel',
  prompt: 'Identify and describe the relationship.',
  scenario: 'A pool fills at 5 litres per minute from empty.',
  quantities: POOL_QUANTITIES,
  correctIndependentId: 'time',
  correctDependentId: 'volume',
  relationshipType: 'continuous',
  axisSetup: {
    required: true,
    requireScale: true,
    acceptedXSteps: [1, 2, 5],
    acceptedYLabels: ['volume', 'water in the pool'],
    acceptedXUnits: ['minutes', 'min'],
    acceptedYUnits: ['litres', 'liters', 'L'],
  },
  origin: { required: true, responseMode: 'builder', coordinates: [0, 0] },
};
const MODEL_OPEN_ORIGIN = { ...MODEL, origin: { required: true, requiredConcepts: [['empty', '0 litres', 'zero litres'], ['start', 'beginning', '0 minutes']] } };
const MODEL_MINIMAL = { type: 'relationshipModel', quantities: POOL_QUANTITIES, correctIndependentId: 'time', correctDependentId: 'volume' };
const modelState = (overrides = {}) => ({
  independentId: 'time',
  dependentId: 'volume',
  relationshipType: 'continuous',
  xLabel: 'Time',
  xUnit: 'minutes',
  yLabel: 'Volume',
  yUnit: 'litres',
  xStep: '5',
  yStep: '10',
  originMeaning: '',
  pointMeaning: { xQuantityId: 'time', xValue: '0', xUnit: 'minutes', yQuantityId: 'volume', yValue: '0', yUnit: 'litres', openText: '' },
  ...overrides,
});

test('relationshipModel: every section matches the old screen part-for-part', () => {
  const fixtures = [
    [MODEL, modelState(), true],
    [MODEL, modelState({ xLabel: ' time ', yLabel: 'WATER IN THE POOL', xUnit: 'Min', yUnit: 'Liters', xStep: ' 2 ', yStep: '2.5' }), true],
    [MODEL, modelState({ xUnit: 'hours' }), false],
    [MODEL, modelState({ independentId: 'volume', dependentId: 'time' }), false],
    [MODEL, modelState({ relationshipType: 'discrete' }), false],
    [MODEL, modelState({ xStep: '3' }), false],
    [MODEL, modelState({ yStep: '-1' }), false],
    [MODEL, modelState({ yStep: '' }), false],
    [MODEL, modelState({ pointMeaning: { ...modelState().pointMeaning, yValue: '5' } }), false],
    [MODEL, modelState({ pointMeaning: { ...modelState().pointMeaning, xUnit: 'seconds' } }), false],
    [{ ...MODEL, origin: { ...MODEL.origin, responseMode: 'guided' } }, modelState({ pointMeaning: { ...modelState().pointMeaning, xQuantityId: '' } }), true],
    [MODEL_OPEN_ORIGIN, modelState({ originMeaning: 'At the start the pool is empty.' }), true],
    [MODEL_OPEN_ORIGIN, modelState({ originMeaning: 'At 0 minutes there are zero litres.' }), true],
    [MODEL_OPEN_ORIGIN, modelState({ originMeaning: 'The pool is full.' }), false],
    [MODEL_MINIMAL, modelState(), true],
    [MODEL_MINIMAL, modelState({ dependentId: '' }), false],
    [{ ...MODEL_MINIMAL, requireQuantityRoles: false }, modelState(), false],
  ];
  fixtures.forEach(([question, values, correct]) => {
    const work = relationshipModelWork(values);
    const result = gradeBoth(relationshipModelGrader, question, work);
    assertMatchesLegacy(result, legacyRelationshipModel(question, values), JSON.stringify(values));
    assert.equal(result.isCorrect, correct, JSON.stringify(values));
    assertCleanWork(work, 'relationshipModel');
  });
  const partial = gradeBoth(relationshipModelGrader, MODEL, relationshipModelWork(modelState({ relationshipType: 'discrete', xStep: '3' })));
  assert.equal(partial.parts.length, 15);
  assert.ok(Math.abs(partial.score - 13 / 15) < 1e-12);
  // No parts at all: nothing to submit, exactly as before.
  const nothing = gradeBoth(relationshipModelGrader, { ...MODEL_MINIMAL, requireQuantityRoles: false }, relationshipModelWork(modelState()));
  assert.equal(nothing.isComplete, false);
});

test('relationshipModel: the screen and the grader derive sections and the origin config from one helper', () => {
  assert.deepEqual(relationshipModelRequirements(MODEL), { quantities: true, continuity: true, axes: true, scale: true, origin: true });
  assert.deepEqual(relationshipOriginConfig(MODEL).quantities.x, { id: 'time', name: 'Time', unit: 'minutes', acceptedUnits: ['minutes', 'min'] });
  assert.equal(relationshipOriginConfig(MODEL_MINIMAL), null);
  const source = code('src/RelationshipModel.jsx');
  assert.match(source, /const requirements = useMemo\(\(\) => relationshipModelRequirements\(question\), \[question\]\);/);
  assert.match(source, /const originConfig = useMemo\(\(\) => relationshipOriginConfig\(question\), \[question\]\);/);
  assert.match(source, /const originMode = relationshipOriginMode\(question\);/);
  assert.match(source, /config=\{originConfig\}/);
});

/*
 * BEHAVIOR CHANGE (documented in relationshipModelMath.mjs): a derived origin
 * config used `acceptedUnits: []` when no accepted units were authored, which
 * blocked the fallback to the quantity's own unit — the origin unit parts could
 * never be correct.
 */
test('relationshipModel: derived origin unit parts accept the quantity\'s own unit (were never correct)', () => {
  const derived = { ...MODEL_MINIMAL, origin: { required: true, responseMode: 'builder', coordinates: [0, 0] } };
  const values = modelState();
  const before = legacyRelationshipModel(derived, values);
  assert.deepEqual(before.parts.filter((part) => !part.isCorrect).map((part) => part.id), ['origin-x-unit', 'origin-y-unit'], 'pinned: the old screen could not mark these correct');
  const after = gradeBoth(relationshipModelGrader, derived, relationshipModelWork(values));
  assert.equal(after.isCorrect, true);
  assert.equal('acceptedUnits' in relationshipOriginConfig(derived).quantities.x, false);
  // The unit is still checked: a different unit is wrong.
  const wrongUnit = gradeBoth(relationshipModelGrader, derived, relationshipModelWork(modelState({ pointMeaning: { ...values.pointMeaning, yUnit: 'gallons' } })));
  assert.deepEqual(wrongUnit.parts.filter((part) => !part.isCorrect).map((part) => part.id), ['origin-y-unit']);
  // Every other part is exactly the old screen's verdict.
  assert.deepEqual(
    after.parts.filter((part) => !part.id.endsWith('-unit')).map(partView),
    before.parts.filter((part) => !part.id.endsWith('-unit')).map(partView),
  );
  // Authored accepted units are used exactly as before — including an explicit empty list.
  const explicitEmpty = { ...derived, axisSetup: { acceptedXUnits: [] } };
  const legacyEmpty = legacyRelationshipModel(explicitEmpty, values);
  const sharedEmpty = gradeBoth(relationshipModelGrader, explicitEmpty, relationshipModelWork(values));
  assert.deepEqual(
    sharedEmpty.parts.filter((part) => part.id === 'origin-x-unit').map(partView),
    legacyEmpty.parts.filter((part) => part.id === 'origin-x-unit').map(partView),
  );
  // A quantity with no unit still has no key.
  const unitless = { ...derived, correctIndependentId: 'rate' };
  const unitlessResult = gradeBoth(relationshipModelGrader, unitless, relationshipModelWork(modelState({ independentId: 'rate', pointMeaning: { ...values.pointMeaning, xQuantityId: 'rate', xUnit: 'litres per minute' } })));
  assert.equal(unitlessResult.parts.find((part) => part.id === 'origin-x-unit').isCorrect, false);
});

test('relationshipModel: an altered key marks the same model wrong', () => {
  const work = relationshipModelWork(modelState());
  assert.equal(gradeBoth(relationshipModelGrader, MODEL, work).isCorrect, true);
  assert.equal(gradeBoth(relationshipModelGrader, { ...MODEL, correctIndependentId: 'rate' }, work).isCorrect, false);
  assert.equal(gradeBoth(relationshipModelGrader, { ...MODEL, relationshipType: 'discrete' }, work).isCorrect, false);
  assert.equal(gradeBoth(relationshipModelGrader, { ...MODEL, axisSetup: { ...MODEL.axisSetup, acceptedXSteps: [10] } }, work).isCorrect, false);
  assert.equal(gradeBoth(relationshipModelGrader, { ...MODEL, origin: { ...MODEL.origin, coordinates: [0, 100] } }, work).isCorrect, false);
});

test('relationshipModel: KNOWN CONTENT DEFECTS kept at parity — unwinnable parts stay unwinnable', () => {
  // requireRelationshipType with no relationshipType compares with undefined.
  const noType = { ...MODEL_MINIMAL, requireRelationshipType: true };
  ['discrete', 'continuous'].forEach((relationshipType) => {
    const values = modelState({ relationshipType });
    const result = gradeBoth(relationshipModelGrader, noType, relationshipModelWork(values));
    assertMatchesLegacy(result, legacyRelationshipModel(noType, values), relationshipType);
    assert.equal(result.isCorrect, false);
  });
  // A correct quantity with no unit, axes required, no accepted units.
  const unitless = { ...MODEL_MINIMAL, correctIndependentId: 'rate', axisSetup: { required: true } };
  const values = modelState({ independentId: 'rate', xLabel: 'Fill rate', xUnit: 'litres per minute' });
  const result = gradeBoth(relationshipModelGrader, unitless, relationshipModelWork(values));
  assertMatchesLegacy(result, legacyRelationshipModel(unitless, values), 'unitless');
  assert.equal(result.parts.find((part) => part.id === 'x-unit').isCorrect, false);
});

test('relationshipModel: tampered and malformed work; authored oddities that crashed the screen are now read', () => {
  const work = relationshipModelWork(modelState());
  const odd = gradeBoth(relationshipModelGrader, MODEL, { ...work, independentId: ['time'], xStep: 5, pointMeaning: 'all of it' });
  assert.equal(odd.parts.find((part) => part.id === 'independent').isComplete, false);
  assert.equal(odd.parts.find((part) => part.id === 'x-step').isCorrect, true, 'a number is what the student could have typed');
  assert.equal(odd.parts.filter((part) => part.id.startsWith('origin-')).every((part) => !part.isComplete), true);
  assertInjectionIgnored(relationshipModelGrader, MODEL, relationshipModelWork(modelState({ relationshipType: 'discrete' })));
  assertRefusesMalformed(relationshipModelGrader, MODEL);
  // A lone accepted step (the old `.map` crashed) is a one-item list.
  const loneStep = { ...MODEL_MINIMAL, axisSetup: { requireScale: true, acceptedXSteps: 5, acceptedYSteps: 0 } };
  const lone = gradeBoth(relationshipModelGrader, loneStep, relationshipModelWork(modelState({ xStep: '5', yStep: '7' })));
  assert.deepEqual(lone.parts.filter((part) => part.id.endsWith('step')).map((part) => part.isCorrect), [true, true]);
  // Non-array quantities (the old `.find` crashed) leave the origin without names.
  const objectQuantities = { ...MODEL, quantities: { time: 'Time' } };
  assert.equal(gradeBoth(relationshipModelGrader, objectQuantities, work).graded, true);
  // Maximal text everywhere stays inside the limits.
  const long = 'm'.repeat(TOOL_RESPONSE_LIMITS.maxStringLength);
  const maximal = relationshipModelWork(Object.fromEntries([...Object.keys(modelState()).map((key) => [key, long]), ['pointMeaning', Object.fromEntries(Object.keys(modelState().pointMeaning).map((key) => [key, long]))]]));
  assertCleanWork(maximal, 'maximal relationship model');
});

// ---------------------------------------------------------------------------
// Free text is graded whole (up to the cap), exactly as the screens graded it
// ---------------------------------------------------------------------------

/*
 * The response contract cuts every string at maxStringLength (1,000). The old
 * screens graded the WHOLE textarea, so a concept written after the 1,000th
 * character — or a graph story minimum above 1,000 — must still count. Long
 * free text therefore travels as chunks (scenarioWork.mjs freeTextWork).
 */
test('free text past the contract\'s per-string limit is graded whole, as the old screens graded it', () => {
  const filler = 'I looked carefully at both graphs before writing this. '.repeat(30);
  assert.ok(filler.length > TOOL_RESPONSE_LIMITS.maxStringLength + 500);

  // graphComparison: each required concept appears only after character 1,000.
  const comparisonState = compareState({ diff: `${filler}The intercept rose by 3.`, how: `${filler}It shifts up.` });
  const comparisonWork = fieldResponsesWork(comparisonState);
  assertCleanWork(comparisonWork, 'long comparison');
  const comparison = gradeBoth(graphComparisonGrader, COMPARE, comparisonWork);
  assertMatchesLegacy(comparison, legacyGraphComparison(COMPARE, comparisonState), 'long comparison');
  assert.equal(comparison.isCorrect, true);
  // Meaningful: the first 1,000 characters alone would have been marked wrong.
  const cut = compareState({ diff: comparisonState.diff.slice(0, 1000), how: comparisonState.how.slice(0, 1000) });
  assert.equal(legacyGraphComparison(COMPARE, cut).isCorrect, false);

  // contextInterpretation, open mode.
  const openValues = meaning({ openText: `${filler}After three hours the car has gone 45 km.` });
  const open = gradeBoth(contextInterpretationGrader, POINT_OPEN, pointMeaningWork(openValues));
  assertMatchesLegacy(open, legacyContextInterpretation(POINT_OPEN, openValues), 'long open interpretation');
  assert.equal(open.isCorrect, true);
  assertCleanWork(pointMeaningWork(openValues), 'long open interpretation');

  // relationshipModel, open origin.
  const originValues = modelState({ originMeaning: `${filler}At the start the pool is empty.` });
  const origin = gradeBoth(relationshipModelGrader, MODEL_OPEN_ORIGIN, relationshipModelWork(originValues));
  assertMatchesLegacy(origin, legacyRelationshipModel(MODEL_OPEN_ORIGIN, originValues), 'long origin meaning');
  assert.equal(origin.isCorrect, true);
  assertCleanWork(relationshipModelWork(originValues), 'long origin meaning');

  // graphStory: an authored minimum above 1,000 characters is measured on the whole text.
  const longMinimum = { ...STORY_SOURCE, minimumExplanationCharacters: 1500 };
  [1400, 1500, 1600].forEach((length) => {
    const state = storyState({ explanation: 'w'.repeat(length) });
    const story = gradeBoth(graphStoryGrader, longMinimum, graphStoryWork(state));
    assertMatchesLegacy(story, legacyGraphStory(longMinimum, state), `${length}-character explanation`);
    assert.equal(story.isComplete, length >= 1500);
  });
});

test('free text round-trips exactly up to the cap, in chunks the contract never cuts', () => {
  [0, 1, 999, 1000, 1001, 2500, FREE_TEXT_LIMITS.maxLength].forEach((length) => {
    const text = Array.from({ length }, (_, index) => 'ab "c\n'[index % 6]).join('');
    const written = freeTextWork(text);
    assert.equal(typeof written === 'string', length <= FREE_TEXT_LIMITS.chunkLength, `${length}: a short text stays a plain string`);
    const bounded = boundToolWork({ text: written });
    assert.equal(bounded.truncated, false, `${length}: no chunk exceeds the contract's string limit`);
    assert.equal(freeText(JSON.parse(JSON.stringify(bounded.work.text))), text, `${length}: exact round trip`);
  });
  // Beyond the cap the text is cut at the cap — the one documented loss.
  assert.equal(freeText(freeTextWork('q'.repeat(9000))).length, FREE_TEXT_LIMITS.maxLength);
  assert.equal(FREE_TEXT_LIMITS.chunkLength, TOOL_RESPONSE_LIMITS.maxStringLength);
  // Readers join chunks for free-text fields only; a short field never reads an array.
  assert.equal(readPointMeaningWork({ openText: ['ab', 'cd'], xUnit: ['h', 'r'] }).openText, 'abcd');
  assert.equal(readPointMeaningWork({ openText: ['ab', 'cd'], xUnit: ['h', 'r'] }).xUnit, '');
  assert.equal(readRelationshipModelWork({ originMeaning: ['x', 'y'], independentId: ['time'] }).originMeaning, 'xy');
  assert.equal(readRelationshipModelWork({ originMeaning: ['x', 'y'], independentId: ['time'] }).independentId, '');
  assert.equal(readGraphStoryText({ scenario: ['a', 'b'], independent: ['t'] }).scenario, 'ab');
  assert.equal(readGraphStoryText({ scenario: ['a', 'b'], independent: ['t'] }).independent, '');
  // Realistic maximal work with the free text at the cap stays inside the response limits.
  assertCleanWork(relationshipModelWork(modelState({ originMeaning: 'o'.repeat(FREE_TEXT_LIMITS.maxLength) })), 'origin meaning at the cap');
  assertCleanWork(pointMeaningWork(meaning({ openText: 'o'.repeat(FREE_TEXT_LIMITS.maxLength) })), 'open interpretation at the cap');
  assertCleanWork(fieldResponsesWork(Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, 't'.repeat(FREE_TEXT_LIMITS.maxLength)]))), 'four comparison fields at the cap');
});

// ---------------------------------------------------------------------------
// The response contract never carries answer-key material for these types
// ---------------------------------------------------------------------------

test('no work builder emits a NON_WORK_KEYS name, at any depth', () => {
  const keysDeep = (value, out = new Set()) => {
    if (Array.isArray(value)) value.forEach((entry) => keysDeep(entry, out));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, entry]) => { out.add(key); keysDeep(entry, out); });
    return out;
  };
  const works = [
    lineWork('1', '2'),
    scenarioMatchWork({ s1: 'g1' }),
    fieldResponsesWork({ a: 'b' }),
    graphStoryWork(storyState()),
    pointMeaningWork(meaning()),
    relationshipModelWork(modelState()),
  ];
  works.forEach((work) => {
    const keys = [...keysDeep(work)];
    assert.deepEqual(keys.filter((key) => NON_WORK_KEYS.includes(key)), [], JSON.stringify(keys));
  });
});
