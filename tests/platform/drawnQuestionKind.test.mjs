/*
 * WHAT THE STUDENT APP DRAWS AND WHAT A TEACHER MAY PUBLISH ARE ONE RULE.
 *
 * QuestionEngine draws a question by its workflow, else by the registry tool its toolId and then its type names, else
 * by its own module for its type, else it shows the panel "This question could not be displayed". The assignment
 * validator, which every teacher path that writes question content runs, judged `toolId || type` instead: a core type
 * in toolId over a type the app does not draw ({ type: 'freeResponse', toolId: 'multiAnswer' }, or toolId 'literal')
 * passed it, and nothing after it stops one. Both now read src/platform/question/drawnQuestionKind.js. This holds:
 *
 *   the rule       enumerated from the registry's own loaders and QuestionEngine's own switch, never by hand
 *   the engine     QuestionEngine takes its route from the rule, and its switch draws exactly the rule's types
 *   the validator  refuses what the rule draws nothing for, naming the question, its type and its toolId; judges
 *                  the tool it does draw; and still accepts every type the app draws and every real lesson
 *   every version  a student is given one version of a question: the stored question repaired as the student player
 *                  repairs it, then one of its variants, or one version of a variant family. Every one is judged,
 *                  and a refusal names the version (studentQuestionVersions.js)
 *   real content   for every question of the lessons in teacher-import-jsons, the district DOL 2 drafts and the demo
 *                  bank, every version the validator judges draws, and what QuestionEngine renders and draws for a
 *                  student, by the rule and by its dispatch read from its source, is one of them
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { DRAWN_QUESTION_ROUTE, QUESTION_ENGINE_TYPES, drawnQuestionKind } from '../../src/platform/question/drawnQuestionKind.js';
import { CORE_QUESTION_TYPES, parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { TOOL_CATALOG } from '../../src/tools/toolCatalog.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { withShuffledSortCards } from '../../src/platform/workflow/sortCardOrder.js';
import { resolveFamilyPreviewInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { repairQuestionForCurrentRuntime } from '../../src/platform/assignments/assignmentRuntimeRepair.js';
import { studentQuestionVersions } from '../../src/platform/question/studentQuestionVersions.js';
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
const UNDRAWN = /could not be displayed/;
const refusal = (questions) => {
  try { validateAssignmentQuestions(questions); } catch (error) { return error.message; }
  return null;
};

const LESSON_FILES = readdirSync(new URL('teacher-import-jsons/', repo), { recursive: true }).map(String)
  .filter((file) => file.endsWith('.json')).sort().map((file) => `teacher-import-jsons/${file}`);
// The district DOL 2: every question an assignment-local family of 48 authored variants.
const DOL2_FILES = ['assignment.json', 'makeup-practice.json', 'makeup-honors-ready.json'].map((file) => `drafts/district-dol2/${file}`);
const students = (count) => Array.from({ length: count }, (_, seat) => `drawn-kind|student-${seat}|0`);

// QuestionEngine's dispatch as its source declares it: a composed question, else a registry loader its toolId and
// then its type names (the registry's own object lookup), else a case of its switch, else the panel.
const LOADERS = Object.fromEntries(REGISTRY_TOOL_IDS.map((toolId) => [toolId, { toolId }]));
const engineDispatch = (question) => {
  if (readComposedQuestion(question).composed) return 'workflow';
  const tool = LOADERS[question?.toolId] || LOADERS[question?.type];
  if (tool) return `tool:${tool.toolId}`;
  return SWITCH_CASES.includes(question?.type) && question.type !== PREPARATION_FAILURE ? `type:${question.type}` : 'panel';
};
// The question QuestionEngine renders for one student: the stored question as the student player hands it over
// (repaired for the current runtime whatever the grading mode: App.jsx, prepareAssignmentForRuntime), repaired again
// by QuestionEngine outside server grading, generated, set in its context, its sort cards dealt.
const playerQuestion = (question) => repairQuestionForCurrentRuntime(question, { source: 'activeAssignmentPlayer' }).question;
const rendered = (question, serverGraded = false, key = `drawn-kind|${question.questionId}|0`) => withShuffledSortCards(
  normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(playerQuestion(question), { serverGraded }), key)),
);

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

test('the validator refuses a question the app draws nothing for, naming it, its type and its toolId', () => {
  const prompt = 'What is 3 + 4?';
  for (const toolId of ['multiAnswer', 'literal']) {
    const message = refusal([{ questionId: 'q1', type: 'multiAnswer', prompt }, { questionId: 'q2', type: 'freeResponse', toolId, prompt }]);
    assert.ok(message, `{ type: 'freeResponse', toolId: '${toolId}' } is refused`);
    assert.match(message, new RegExp(`^Question 2 has type freeResponse and toolId ${toolId}: `));
    assert.match(message, UNDRAWN);
    assert.match(message, new RegExp(`Use type ${toolId}\\.$`));
  }
  // Every core type behind toolId, enumerated.
  for (const toolId of QUESTION_ENGINE_TYPES) assert.match(refusal([{ type: 'freeResponse', toolId, prompt }]) || '', UNDRAWN, toolId);
  assert.match(refusal([{ toolId: 'multiAnswer', prompt }]) || '', /^Question 1 has toolId multiAnswer and no type: .*could not be displayed/);
  assert.match(refusal([{ type: 'functionCharacteristics', prompt }]) || '', /^Question 1 has type functionCharacteristics and no workflow: MathMaster draws functionCharacteristics only as the steps of a workflow/);
  // A family slot is judged on the version a student is given.
  const local = {
    questionId: 'local-1', type: 'freeResponse', toolId: 'multiAnswer', prompt: 'What is {{a}} + {{b}}?',
    generator: { parameters: { a: { min: 1, max: 5 }, b: { min: 1, max: 5 } }, derived: { ans: 'a + b' } },
    answerFields: [{ id: 'answer', answer: '{{ans}}' }],
    questionFamily: { scope: 'assignment' },
  };
  assert.match(refusal([local]) || '', /^Question 1 has type freeResponse and toolId multiAnswer in its generated version: .*could not be displayed/);
});

test('a teacher\'s import that carries the pair is refused by the validator and by Pre-Flight; the same file drawable imports', () => {
  // Only a MathMaster portable export keeps each question's type and toolId: other V5 is compiled from studentActions.
  const lesson = parseAssignmentBlueprintText(read('teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations.json')).assignmentV5;
  const portable = { ...structuredClone(lesson), portableContract: { kind: 'mathmasterCanonicalAssignmentV5', version: 1 } };
  const target = portable.sections.flatMap((section) => section.questions).find((question) => question.type === 'multiAnswer' && !question.questionFamily);
  const position = portable.sections.flatMap((section) => section.questions).indexOf(target) + 1;
  const imported = (pair) => {
    const copy = structuredClone(portable);
    Object.assign(copy.sections.flatMap((section) => section.questions).find((question) => question.questionId === target.questionId), pair);
    const parsed = parseAssignmentBlueprintText(JSON.stringify(copy));
    assert.ok(parsed.repairs.some((repair) => /portable export/.test(repair)), 'read as a portable export, not recompiled');
    return parsed;
  };
  const drawable = imported({ type: 'multiAnswer' });
  assert.doesNotThrow(() => validateAssignmentQuestions(drawable.questions, { variantMode: drawable.assignmentV5.variantPolicy?.mode }));
  assert.deepEqual(buildAssignmentV5PreflightModel(drawable.assignmentV5).errors, []);
  for (const toolId of ['multiAnswer', 'literal']) {
    const parsed = imported({ type: 'freeResponse', toolId });
    const carried = parsed.questions.find((question) => question.questionId === target.questionId);
    assert.deepEqual([carried.type, carried.toolId], ['freeResponse', toolId], 'the import keeps the pair');
    assert.throws(() => validateAssignmentQuestions(parsed.questions), new RegExp(`^Error: Question ${position} has type freeResponse and toolId ${toolId}: .*could not be displayed`));
    const preflight = buildAssignmentV5PreflightModel(parsed.assignmentV5);
    assert.ok(preflight.errors.some((error) => new RegExp(`^Question ${position} has type freeResponse and toolId ${toolId}: `).test(error)), preflight.errors.join(' | '));
  }
});

test('the validator judges the tool or type that is drawn, as well as the name it always judged', () => {
  // graphing2 behind a core toolId opens Graphing; its board is judged as one.
  assert.match(refusal([{ type: 'graphing2', toolId: 'multiAnswer', prompt: 'Graph the line.' }]) || '', /^Question 1 \(graphing2\) is invalid: /);
  assert.match(refusal([{ type: 'fraction', toolId: 'multiAnswer', prompt: 'p', answer: 'three quarters' }]) || '', /fraction answer "three quarters" is not a number/);
  assert.match(refusal([{ type: 'modelingLab', toolId: 'multiAnswer', prompt: 'p' }]) || '', /modelingLab is missing labDefinition/);
  // The name judged before is still judged: a fraction toolId's key, a tool type's board inside a workflow.
  assert.match(refusal([{ type: 'multiAnswer', toolId: 'fraction', prompt: 'p', answer: 'three quarters' }]) || '', /fraction answer "three quarters"/);
  const stage = { kind: 'classification', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
  assert.match(refusal([{ type: 'graphing2', workflow: [stage], prompt: 'Graph the line.' }]) || '', /^Question 1 \(graphing2\) is invalid: /);
});

const STAGE = Object.freeze({ id: 's1', kind: 'classification', prompt: 'Which is it?', choices: [{ id: 'a', label: 'Increasing' }, { id: 'b', label: 'Decreasing' }] });
const withVariants = (...variants) => ({ questionId: 'q1', type: 'multiAnswer', prompt: 'What is 3 + 4?', answerFields: [{ id: 'answer', answer: '7' }], variants });
const kindsShown = (question, count = 40) => sorted(new Set(students(count).map((key) => drawn(rendered(question, false, key)))));

test('each variant is judged as the version a student is given, and a refusal names it', () => {
  // A question with variants is never shown as itself: each student is given one variant spread over it.
  const pair = withVariants({ prompt: 'What is 3 + 5?' }, { type: 'freeResponse', toolId: 'multiAnswer', prompt: 'What is 3 + 6?' });
  assert.match(refusal([pair]) || '', /^Question 1 has type freeResponse and toolId multiAnswer in its variant 2 of 2: MathMaster draws a question by its type unless its toolId names an interactive tool, and freeResponse is not a type it draws, so students given that variant would see "This question could not be displayed" instead of a question\. Use type multiAnswer\.$/);
  assert.deepEqual(kindsShown(pair), ['panel', 'type:multiAnswer'], 'students are given that variant, and see the panel');
  assert.match(refusal([withVariants({ type: 'freeResponse', prompt: 'What is 3 + 5?' }, { prompt: 'What is 3 + 6?' })]) || '',
    /^Question 1 has type freeResponse in its variant 1 of 2: freeResponse is not a type MathMaster draws, so students given that variant would see/);
  // A variant that opens a tool is judged as that tool, and a variant's own key as its own.
  assert.match(refusal([withVariants({ prompt: 'a' }, { type: 'graphing2', prompt: 'Graph y = 2x.' })]) || '', /^Question 1 \(graphing2\) is invalid in its variant 2 of 2: /);
  assert.match(refusal([{ questionId: 'q3', type: 'fraction', prompt: 'p', answer: '3/4', variants: [{ answer: '1/2' }, { answer: 'three quarters' }] }]) || '',
    /^Question 1 fraction answer "three quarters" in its variant 2 of 2 is not a number/);
  // Through the import: a portable export with one bad variant, refused by the validator and by Pre-Flight.
  const lesson = parseAssignmentBlueprintText(read('teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations.json')).assignmentV5;
  const portable = { ...structuredClone(lesson), portableContract: { kind: 'mathmasterCanonicalAssignmentV5', version: 1 } };
  const flat = portable.sections.flatMap((section) => section.questions);
  const target = flat.find((question) => question.type === 'multiAnswer' && !question.questionFamily);
  target.variants = [{ prompt: `${target.prompt} (version A)` }, { type: 'freeResponse', toolId: 'multiAnswer', prompt: `${target.prompt} (version B)` }];
  const parsed = parseAssignmentBlueprintText(JSON.stringify(portable));
  const expected = new RegExp(`^Question ${flat.indexOf(target) + 1} has type freeResponse and toolId multiAnswer in its variant 2 of 2: `);
  assert.match(refusal(parsed.questions) || '', expected);
  assert.ok(buildAssignmentV5PreflightModel(parsed.assignmentV5).errors.some((error) => expected.test(error)), 'Pre-Flight shows it');
});

test('a composed type whose workflow is only in its variants is accepted: every student is given a workflow', () => {
  // Accepted before 328bd638, and QuestionEngine draws each variant as a workflow; the stored question alone has
  // none, but it is never what a student is given.
  const composed = { questionId: 'q2', type: 'functionCharacteristics', prompt: 'Describe the function.', variants: [{ prompt: 'Describe f.', workflow: [STAGE] }, { prompt: 'Describe g.', workflow: [STAGE] }] };
  assert.equal(drawn(composed), 'panel', 'the stored question alone draws nothing');
  assert.equal(refusal([composed]), null);
  assert.deepEqual(kindsShown(composed, 12), ['workflow']);
  // One variant without it is refused, by its name.
  assert.match(refusal([{ ...composed, variants: [composed.variants[0], { prompt: 'Describe h.' }] }]) || '',
    /^Question 1 has type functionCharacteristics in its variant 2 of 2 and no workflow: /);
});

test('every version of a variant family is judged, not only its first preview', () => {
  // The district DOL 2's question 1 is an assignment-local family of 48 authored variants; one carries the pair.
  const source = JSON.parse(read('drafts/district-dol2/assignment.json'));
  const q1 = source.sections[0].questions[0];
  assert.equal(q1.variants.length, 48);
  Object.assign(q1.variants[7], { type: 'freeResponse', toolId: 'multiAnswer' });
  const parsed = parseAssignmentBlueprintText(JSON.stringify(source));
  const slot = parsed.questions.find((question) => question.questionId === q1.questionId);
  assert.equal(drawn(resolveFamilyPreviewInstance(slot).question), 'type:multiAnswer', 'its first preview draws');
  // Students are dealt that version: one preview seat lands on it.
  assert.ok(Array.from({ length: 48 }, (_, index) => drawn(resolveFamilyPreviewInstance(slot, { index }).question)).includes('panel'));
  const expected = /^Question 1 has type freeResponse and toolId multiAnswer in its variant 8 of 48: .*students given that variant would see "This question could not be displayed"/;
  assert.match(refusal(parsed.questions) || '', expected);
  assert.ok(buildAssignmentV5PreflightModel(parsed.assignmentV5).errors.some((error) => expected.test(error)), 'Pre-Flight shows it');
  // Each of the 48 is a version the validator judges, built as the family deals it.
  const { versions } = studentQuestionVersions(slot);
  assert.equal(versions.length, 48);
  assert.deepEqual(versions.map(({ question }) => drawn(question)).map((kind, index) => (kind === 'panel' ? index : null)).filter((index) => index !== null), [7]);
});

test('a stored type the runtime repair rescues is judged as the student player draws it, at import as in Pre-Flight', () => {
  // The student player repairs every stored question before QuestionEngine, whatever the grading mode, and
  // Pre-Flight judges that view: a stepAlgebra2 question in linearIntercepts mode opens Step Algebra, its type
  // read without case and its toolId kept.
  const repairable = { questionId: 'q1', type: 'StepAlgebra2', toolId: 'multiAnswer', mode: 'linearIntercepts', equation: '2x + 4y = 8', prompt: 'Find both intercepts of 2x + 4y = 8.' };
  for (const serverGraded of [false, true]) assert.equal(drawn(rendered(repairable, serverGraded)), 'type:stepAlgebra', `server graded: ${serverGraded}`);
  assert.equal(refusal([repairable]), null);
  const lesson = parseAssignmentBlueprintText(read('teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations.json')).assignmentV5;
  const portable = { ...structuredClone(lesson), portableContract: { kind: 'mathmasterCanonicalAssignmentV5', version: 1 } };
  const flat = portable.sections.flatMap((section) => section.questions);
  const target = flat.find((question) => question.type === 'multiAnswer' && !question.questionFamily);
  Object.assign(target, { type: 'StepAlgebra2', toolId: 'multiAnswer', mode: 'linearIntercepts', equation: '2x + 4y = 8' });
  const parsed = parseAssignmentBlueprintText(JSON.stringify(portable));
  assert.doesNotThrow(() => validateAssignmentQuestions(parsed.questions, { variantMode: parsed.assignmentV5.variantPolicy?.mode }), 'the import check');
  const about = new RegExp(`^Question ${flat.indexOf(target) + 1}\\b`);
  assert.deepEqual(buildAssignmentV5PreflightModel(parsed.assignmentV5).errors.filter((error) => about.test(error)), [], 'and Pre-Flight agree');
  // A version is never repaired on its own: QuestionEngine repairs the stored question before it deals a variant,
  // so the same fields in a variant draw nothing for the students given it.
  const { questionId: _id, prompt: _prompt, ...fields } = repairable;
  const inVariant = withVariants({ prompt: 'What is 3 + 5?' }, fields);
  assert.match(refusal([inVariant]) || '', /^Question 1 has type StepAlgebra2 and toolId multiAnswer in its variant 2 of 2: /);
  assert.ok(kindsShown(inVariant).includes('panel'));
});

test('every type the app draws stays accepted, and so does every real lesson', () => {
  for (const type of [...REGISTRY_TOOL_IDS, ...QUESTION_ENGINE_TYPES]) {
    const message = refusal([{ questionId: 'q1', type, prompt: 'p' }]) || '';
    assert.doesNotMatch(message, UNDRAWN, `${type}: ${message}`);
    assert.doesNotMatch(refusal([{ questionId: 'q1', type, toolId: type, prompt: 'p' }]) || '', UNDRAWN, type);
  }
  // A type with no content check of its own is accepted outright.
  for (const type of QUESTION_ENGINE_TYPES.filter((entry) => entry !== 'modelingLab')) assert.equal(refusal([{ type, prompt: 'p' }]), null, type);
  for (const file of [...LESSON_FILES, ...DOL2_FILES]) {
    const parsed = parseAssignmentBlueprintText(read(file));
    assert.doesNotThrow(() => validateAssignmentQuestions(parsed.questions, { variantMode: parsed.assignmentV5?.variantPolicy?.mode }), file);
  }
});

test('for every real question, every version the validator judges draws, and QuestionEngine draws one of them for each student', (t) => {
  const questions = [
    ...[...LESSON_FILES, ...DOL2_FILES].flatMap((file) => parseAssignmentBlueprintText(read(file)).questions.map((question) => ({ file, question }))),
    ...JSON.parse(read('src/demo/demoAssignmentBank.json')).flatMap((assignment) => assignment.questions.map((question) => ({ file: `demo ${assignment.id}`, question }))),
  ];
  assert.ok(questions.length > 1390, `${questions.length} questions`);
  const seen = new Set();
  let versionCount = 0;
  let manyVersions = 0;
  for (const { file, question } of questions) {
    const label = `${file} ${question.questionId}`;
    const { versions, error } = studentQuestionVersions(question);
    assert.equal(error, null, label);
    const judged = new Set(versions.map(({ question: version }) => drawn(version)));
    assert.ok(versions.length > 0 && !judged.has('panel'), `${label}: ${[...judged].join(', ')}`);
    versionCount += versions.length;
    if (versions.length > 1) manyVersions += 1;
    // One student where there is one version, six where there are several.
    for (const key of students(versions.length > 1 ? 6 : 1).map((student) => `${student}|${question.questionId}`)) {
      const engineQuestion = rendered(question, false, key);
      const kind = drawn(engineQuestion);
      assert.ok(judged.has(kind), `${label}: QuestionEngine draws ${kind}, which the validator judged none of (${[...judged].join(', ')})`);
      assert.equal(engineDispatch(engineQuestion), kind, `${label}: and its own dispatch draws it`);
      // Under server grading QuestionEngine skips its own repair; the student player's has already run.
      assert.equal(drawn(rendered(question, true, key)), kind, label);
      seen.add(kind);
    }
  }
  t.diagnostic(`${questions.length} questions, ${versionCount} versions judged, ${manyVersions} questions with more than one`);
  // Every route, and most of what the content uses, is exercised, and the variant families are walked.
  for (const route of ['workflow', 'tool:', 'type:']) assert.ok([...seen].some((kind) => kind.startsWith(route)), route);
  assert.ok(seen.size >= 20, [...seen].join(', '));
  // The DOL 2 drafts' 33 variant families, 48 authored versions each.
  assert.ok(manyVersions >= 33 && versionCount > questions.length + 1500, `${manyVersions} questions with versions, ${versionCount} versions`);
});

test('a browser harness that swaps a registry tool swaps one the catalogue names, and its questions are drawn as it', () => {
  // The module recovery harness put its crash probe in the registry under an id
  // of its own; the rule names a registry tool only by the catalogue's ids, so
  // the probe was drawn as the "could not be displayed" panel and
  // moduleRecoveryLock.mjs never met the failure it checks (CI on 4d429447).
  // So a harness that swaps a tool must swap a catalogue tool, and every
  // question it mounts must be drawn as that tool: a question that does not
  // name it (by toolId or type) mounts something else, and the journey checks
  // nothing it meant to. Read from the repository, wherever the test runs.
  const sources = (dir) => readdirSync(new URL(dir, repo), { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory()
      ? (entry.name === 'artifacts' ? [] : sources(`${dir}${entry.name}/`))
      : (/\.(jsx?|mjs)$/.test(entry.name) ? [`${dir}${entry.name}`] : [])
  ));
  const swapped = sources('tests/browser/').flatMap((file) => {
    const text = read(file);
    return [
      ...[...text.matchAll(/TOOL_REGISTRY\.([A-Za-z0-9_$]+)\s*=(?!=)/g)].map((match) => ({ file, text, id: match[1] })),
      ...[...text.matchAll(/TOOL_REGISTRY\[\s*['"]([^'"]+)['"]\s*\]\s*=(?!=)/g)].map((match) => ({ file, text, id: match[1] })),
    ];
  });
  assert.ok(swapped.some(({ file }) => file.endsWith('moduleRecoveryLockMain.jsx')), 'the module recovery harness swaps a registry tool');
  for (const { file, text, id } of swapped) {
    assert.ok(Object.prototype.hasOwnProperty.call(TOOL_CATALOG, id), `${file} puts a tool in the registry as "${id}", which the catalogue does not name, so it is drawn as no tool`);
    // Each question literal the harness writes, one to a line: its type and toolId.
    const questions = text.split('\n')
      .map((line) => line.match(/\{\s*type:\s*'([^']+)'(.*)$/))
      .filter(Boolean)
      .map(([, type, rest]) => ({ type, ...(rest.match(/toolId:\s*'([^']+)'/) ? { toolId: rest.match(/toolId:\s*'([^']+)'/)[1] } : {}) }));
    assert.ok(questions.length > 0, `${file}: no question it mounts was found`);
    for (const question of questions) {
      const kind = drawnQuestionKind(question);
      assert.ok(kind?.route === DRAWN_QUESTION_ROUTE.REGISTRY_TOOL && kind.toolId === id, `${file}: ${JSON.stringify(question)} is drawn as ${JSON.stringify(kind)}, not as the swapped tool ${id}`);
    }
  }
});
