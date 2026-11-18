/*
 * WHAT THE STUDENT APP DRAWS FOR A QUESTION IS ONE RULE.
 *
 * QuestionEngine draws a question by its workflow, else by the registry tool its toolId and then its type names, else
 * by its own module for its type, else it shows the panel "This question could not be displayed". That decision is
 * src/platform/question/drawnQuestionKind.js, pure, so what decides whether a teacher may publish a question can read
 * the very rule QuestionEngine draws it by. This holds:
 *
 *   the rule       enumerated from the registry's own loaders and QuestionEngine's own switch, never by hand
 *   the engine     QuestionEngine takes its route from the rule, and its switch draws exactly the rule's types
 *   real content   for every question of every lesson in teacher-import-jsons and the demo bank, the rule on the
 *                  question as authored (or a family slot's preview) is the rule on the question QuestionEngine
 *                  renders, which is what QuestionEngine's dispatch, read from its source, draws
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { DRAWN_QUESTION_ROUTE, QUESTION_ENGINE_TYPES, drawnQuestionKind } from '../../src/platform/question/drawnQuestionKind.js';
import { CORE_QUESTION_TYPES, parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { TOOL_CATALOG } from '../../src/tools/toolCatalog.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { withShuffledSortCards } from '../../src/platform/workflow/sortCardOrder.js';
import { isFamilyBackedQuestion, resolveFamilyPreviewInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const repo = new URL('../../', import.meta.url);
const read = (file) => readFileSync(new URL(file, repo), 'utf8');
const engine = executableSource(read('src/QuestionEngine.jsx'));
const sorted = (values) => [...values].sort();

// The registry QuestionEngine mounts a tool from: its loaders, by id.
const REGISTRY_TOOL_IDS = [...region(executableSource(read('src/tools/toolRegistry.js')), 'const TOOL_LOADERS = {', '};', 'the registry\'s loaders')
  .matchAll(/^\s+(\w+): \(\) => import\(/gm)].map((match) => match[1]);
// What QuestionEngine draws by its type: every case of its switch, before the default that is the panel.
const SWITCH = region(engine, 'switch (processedQuestion.type) {', 'This question could not be displayed', 'the type switch');
const SWITCH_CASES = [...SWITCH.matchAll(/\bcase '(\w+)':/g)].map((match) => match[1]);
// The placeholder for a question that could not be prepared: not a question type (drawnQuestionKind.js).
const PREPARATION_FAILURE = 'platformQuestionError';

const kindOf = (kind) => (!kind ? 'panel'
  : kind.route === DRAWN_QUESTION_ROUTE.WORKFLOW ? 'workflow'
    : kind.route === DRAWN_QUESTION_ROUTE.REGISTRY_TOOL ? `tool:${kind.toolId}` : `type:${kind.type}`);
const drawn = (question) => kindOf(drawnQuestionKind(question));

const LESSON_FILES = readdirSync(new URL('teacher-import-jsons/', repo), { recursive: true }).map(String)
  .filter((file) => file.endsWith('.json')).sort().map((file) => `teacher-import-jsons/${file}`);

// QuestionEngine's dispatch as its source declares it: a composed question, else a registry loader its toolId and
// then its type names (the registry's own object lookup), else a case of its switch, else the panel.
const LOADERS = Object.fromEntries(REGISTRY_TOOL_IDS.map((toolId) => [toolId, { toolId }]));
const engineDispatch = (question) => {
  if (readComposedQuestion(question).composed) return 'workflow';
  const tool = LOADERS[question?.toolId] || LOADERS[question?.type];
  if (tool) return `tool:${tool.toolId}`;
  return SWITCH_CASES.includes(question?.type) && question.type !== PREPARATION_FAILURE ? `type:${question.type}` : 'panel';
};
// The question QuestionEngine renders: runtime-repaired, generated, set in its context, its sort cards dealt.
const rendered = (question, serverGraded = false) => withShuffledSortCards(normalizeContextualQuestion(generateQuestion(
  prepareQuestionForRuntimeRouting(question, { serverGraded }), `drawn-kind|${question.questionId}|0`,
)));

test('the registry the rule reads is the registry QuestionEngine mounts, and the switch draws the rule\'s types', () => {
  assert.ok(REGISTRY_TOOL_IDS.length >= 25, `the loader parser broke: ${REGISTRY_TOOL_IDS.length}`);
  assert.deepEqual(sorted(Object.keys(TOOL_CATALOG)), sorted(REGISTRY_TOOL_IDS));
  assert.ok(SWITCH_CASES.length >= 15, `the switch parser broke: ${SWITCH_CASES.length}`);
  assert.deepEqual(sorted(SWITCH_CASES.filter((type) => type !== PREPARATION_FAILURE)), sorted(QUESTION_ENGINE_TYPES));
  // The placeholder replaces the whole work area before any module is drawn, so the switch never reaches it.
  const body = region(engine, '{resolutionFailurePanel || (', '{renderModule()}', 'the work area');
  assert.match(body, /<fieldset/, 'the work area is drawn only when there is no placeholder');
  // Every core type the switch does not draw is a composed type: drawn as the steps of a workflow, never by name.
  const workflowOnly = CORE_QUESTION_TYPES.filter((type) => !QUESTION_ENGINE_TYPES.includes(type));
  assert.deepEqual(sorted(workflowOnly), ['figureMatch', 'functionCharacteristics', 'graphChoicePreview']);
});

test('QuestionEngine takes its route from the rule: workflow, then the registry tool it names, then its own module', () => {
  assert.match(engine, /const drawnKind = useMemo\(\(\) => drawnQuestionKind\(processedQuestion\), \[processedQuestion\]\);/);
  assert.match(engine, /const isComposed = drawnKind\?\.route === DRAWN_QUESTION_ROUTE\.WORKFLOW;/);
  // The only tool lookup is the tool the rule names: nothing can mount a tool by another reading of toolId or type.
  const lookups = [...engine.matchAll(/getToolDefinition\(([^)]*)\)/g)].map((match) => match[1]);
  assert.deepEqual(lookups, ['drawnKind.toolId']);
  assert.match(engine, /drawnKind\?\.route === DRAWN_QUESTION_ROUTE\.REGISTRY_TOOL \? getToolDefinition\(drawnKind\.toolId\) : null/);
  const renderModule = region(engine, 'const renderModule = () => {', 'This question could not be displayed', 'renderModule');
  const order = ['if (isComposed) {', 'if (missingToolDefinition) {', 'switch (processedQuestion.type) {'].map((needle) => renderModule.indexOf(needle));
  assert.ok(order.every((at) => at >= 0) && order[0] < order[1] && order[1] < order[2], `renderModule's routes, in order: ${order}`);
  assert.match(renderModule.slice(order[0]), /^if \(isComposed\) \{\s*return \(\s*<ToolRuntimeProvider[\s\S]*?<WorkflowRunner/);
  assert.match(SWITCH, /default:\s*return \(\s*<div data-question-type=/, 'the switch\'s default is the panel');
});

test('the rule, for every registry tool and every type QuestionEngine draws', () => {
  REGISTRY_TOOL_IDS.forEach((toolId, index) => {
    assert.equal(drawn({ type: toolId }), `tool:${toolId}`);
    assert.equal(drawn({ type: 'freeResponse', toolId }), `tool:${toolId}`);
    // toolId first, over a type that names another tool or a core type; a toolId the registry does not know falls
    // through to a tool the type names.
    const another = REGISTRY_TOOL_IDS[(index + 1) % REGISTRY_TOOL_IDS.length];
    assert.equal(drawn({ type: another, toolId }), `tool:${toolId}`, `toolId ${toolId} over type ${another}`);
    assert.equal(drawn({ type: 'multiAnswer', toolId }), `tool:${toolId}`);
    assert.equal(drawn({ type: toolId, toolId: 'multiAnswer' }), `tool:${toolId}`);
  });
  for (const type of QUESTION_ENGINE_TYPES) {
    assert.equal(drawn({ type }), `type:${type}`);
    assert.equal(drawn({ type, toolId: 'notARegistryTool' }), `type:${type}`);
    // A core type in toolId is not a route: the question is drawn by its type.
    assert.equal(drawn({ type: 'freeResponse', toolId: type }), 'panel', `freeResponse behind toolId ${type}`);
    assert.equal(drawn({ toolId: type }), 'panel', `toolId ${type} with no type`);
  }
  // A workflow, authored or expanded from a recipe, beats every other route, the registry included.
  const stage = { kind: 'classification', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
  assert.equal(drawn({ type: 'graphing2', toolId: 'graphing2', workflow: [stage] }), 'workflow');
  assert.equal(drawn({ type: 'relationMapping', recipe: 'relationRepresentations' }), 'workflow');
  assert.equal(drawn({ type: 'relationMapping' }), 'tool:relationMapping');
  for (const type of ['functionCharacteristics', 'figureMatch', 'graphChoicePreview']) {
    assert.equal(drawn({ type }), 'panel', `${type} with no workflow`);
    assert.equal(drawn({ type, workflow: [stage] }), 'workflow');
  }
  // Exactly as the switch compares: no trimming, no case folding, no Object properties as tools.
  for (const question of [null, [], 'multiAnswer', {}, { type: PREPARATION_FAILURE }, { type: 'freeResponse' }, { type: ' multiAnswer' },
    { type: 'MultiAnswer' }, { type: ['multiAnswer'] }, { type: 'toString' }, { type: '__proto__' }, { type: 'constructor' }]) {
    assert.equal(drawn(question), 'panel', JSON.stringify(question));
  }
  assert.equal(drawn({ type: 'multiAnswer', toolId: 'constructor' }), 'type:multiAnswer');
  assert.equal(drawn({ type: 'multiAnswer', toolId: 'hasOwnProperty' }), 'type:multiAnswer');
});

test('for every real question, the rule on the question as authored is the rule on what QuestionEngine renders and draws', () => {
  const questions = [
    ...LESSON_FILES.flatMap((file) => parseAssignmentBlueprintText(read(file)).questions.map((question) => ({ file, question }))),
    ...JSON.parse(read('src/demo/demoAssignmentBank.json')).flatMap((assignment) => assignment.questions.map((question) => ({ file: `demo ${assignment.id}`, question }))),
  ];
  assert.ok(questions.length > 1300, `${questions.length} questions`);
  const seen = new Set();
  for (const { file, question } of questions) {
    const label = `${file} ${question.questionId}`;
    const judged = isFamilyBackedQuestion(question) ? resolveFamilyPreviewInstance(question).question : question;
    const authoredView = drawn(judged);
    const engineQuestion = rendered(question);
    assert.notEqual(authoredView, 'panel', label);
    assert.equal(drawn(engineQuestion), authoredView, `${label}: the question as authored is drawn as the engine renders it`);
    assert.equal(engineDispatch(engineQuestion), authoredView, `${label}: and the engine's own dispatch draws it`);
    // Under server grading the runtime repair is skipped; the kind does not move.
    assert.equal(drawn(rendered(question, true)), drawn(engineQuestion), label);
    seen.add(authoredView);
  }
  // Every route, and most of what the content uses, is exercised.
  for (const route of ['workflow', 'tool:', 'type:']) assert.ok([...seen].some((kind) => kind.startsWith(route)), route);
  assert.ok(seen.size >= 20, [...seen].join(', '));
});
