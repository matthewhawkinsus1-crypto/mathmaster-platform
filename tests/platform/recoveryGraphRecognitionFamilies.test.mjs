/*
 * RECOVERY V2 — THE DISTRICT DOL 1 REVIEW'S WARM-UP: FUNCTIONS RECOGNIZED
 * FROM THEIR GRAPHS (RC01's next shapes).
 *
 * The review's Warm-Up had Recovery for Q1 only (its Mapping Diagram). Its
 * other three questions are composed workflows, now each a family's
 * (functions/shared/questionFamiliesGraphRecognition.mjs):
 *
 *   q_section-1_1_2  sort four graphs: Linear / Quadratic / Exponential   functions.familySortFromGraphs
 *   q_section-1_1_3  the vertex of the parabola shown, chosen            quadratics.vertexChoiceFromGraph
 *   q_section-1_1_4  sort six exponential graphs: growth / decay          exponential.sortGrowthDecay
 *
 * These tests hold the families to what a student is owed — every version is
 * valid, its key worked out here from the curves it DRAWS (each model
 * evaluated at the grid's whole numbers; never read from the family), marked
 * right on the device and the server, and every wrong answer refused — and the
 * lesson to what the teacher was promised: Prepare Recovery makes the
 * review's Warm-Up ready.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { create, all } from 'mathjs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence, evaluateFamilyCandidate, measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { recoveryKeyResponses, serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { RECOVERY_MINIMUM_FRESH_VERSIONS, familyDifficultyFor } from '../../functions/shared/recoveryCertification.mjs';
import { flattenAssignmentQuestions } from '../../functions/shared/recoveryContentPlan.mjs';
import { buildRecoveryUpgradePreview } from '../../functions/shared/recoveryContentUpgrade.mjs';
import { recoverySourceQuestion, recoverySourceSignature } from '../../functions/shared/recoveryContent.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildFigureMatchResponse } from '../../functions/shared/toolMath/workflow/figureMatch.mjs';
import { composedWorkflowWork } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { gradeComposedWorkflowCheck } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { activeStages, readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { buildWorkflowAnswerState } from '../../src/platform/workflow/workflowAnswerState.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const math = create(all, {});
const LESSON = compileTeacherImport(readFileSync(new URL('../../teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json', import.meta.url), 'utf8'));
const questionIn = (questionId) => LESSON.questions.find((question) => question.questionId === questionId);

const SORT = getPlatformQuestionFamily('functions.familySortFromGraphs');
const VERTEX = getPlatformQuestionFamily('quadratics.vertexChoiceFromGraph');
const GROWTH = getPlatformQuestionFamily('exponential.sortGrowthDecay');
const FAMILIES = [SORT, VERTEX, GROWTH];
const LIVE = Object.freeze([
  { family: SORT, questionId: 'q_section-1_1_2', params: { rise: 2, riseB: 1, fall: -1, fallB: 3, h: 0, k: -4, base: 2 }, standard: 'A.3C' },
  { family: VERTEX, questionId: 'q_section-1_1_3', params: { a: 1, h: 2, s: 2 }, standard: 'A.7A' },
  { family: GROWTH, questionId: 'q_section-1_1_4', params: { growth: '1*2^x|1*3^x|3*2^x', decay: '8*0.5^x|12*0.25^x|15*0.5^x' }, standard: 'A.9D' },
]);
// Worked by hand. The sort: a rising line 2 × 7, a falling line 2 × 7, a
// parabola's vertex 3 × 4, a base 2: 4,704. The vertex: a = 1 with s = 1 or 2
// (h from −3 to 7, or −2 to 6), a = −1 with s = 1, 2 or 3 (h from −1 to 5 for
// s = 3): 11 + 9 + 11 + 9 + 7 = 47. Growth and decay: C(6, 3) × C(12, 3) =
// 20 × 220 = 4,400.
const COUNTS = Object.freeze({ [SORT.id]: 4704, [VERTEX.id]: 47, [GROWTH.id]: 4400 });
const SAMPLE = 240;

const valuesOf = (family) => resolveFamilyConstraints(family, {}).values;
const versionsOf = (family) => {
  const sequence = createFamilyInstanceSequence(family, valuesOf(family), 'graph-recognition-test');
  const count = family === VERTEX ? COUNTS[VERTEX.id] : SAMPLE;
  return Array.from({ length: count }, (_, index) => sequence.instanceAt(index)).filter(Boolean);
};
const build = (live, instance) => buildFamilyQuestion({
  family: live.family,
  instance,
  constraintValues: valuesOf(live.family),
  authored: recoverySourceQuestion(questionIn(live.questionId), { questionFamily: { id: live.family.id, version: 1, constraints: {} } }),
});

/* ---------------------------------------------------------------------------
 * The key, from the curves drawn: each model evaluated at whole numbers.
 * ------------------------------------------------------------------------- */

const at = (model, x) => math.evaluate(model, { x });
const xs = (graph) => Array.from({ length: graph.xMax - graph.xMin + 1 }, (_, index) => graph.xMin + index);
/** linear: equal first differences; quadratic: equal second differences; exponential: equal ratios. */
const familyDrawn = (model) => {
  const ys = [0, 1, 2, 3].map((x) => at(model, x));
  const first = ys.slice(1).map((y, index) => y - ys[index]);
  if (first.every((value) => Math.abs(value - first[0]) < 1e-9)) return 'linear';
  const second = first.slice(1).map((value, index) => value - first[index]);
  if (second.every((value) => Math.abs(value - second[0]) < 1e-9)) return 'quadratic';
  const ratios = ys.slice(1).map((y, index) => y / ys[index]);
  return ratios.every((value) => Math.abs(value - ratios[0]) < 1e-9) ? 'exponential' : 'unknown';
};
const growthDrawn = (model) => (at(model, 1) > at(model, 0) ? 'growth' : 'decay');
/** The curve shows on the grid: a whole-number x where it is inside the window. */
const shows = (graph) => xs(graph).some((x) => { const y = at(graph.model, x); return y >= graph.yMin && y <= graph.yMax; });
/** The turning point of a drawn parabola, and where it meets the x-axis, by whole numbers. */
const parabolaDrawn = (graph) => {
  const points = xs(graph).map((x) => [x, at(graph.model, x)]);
  const opensUp = at(graph.model, 100) > at(graph.model, 0);
  const vertex = points.reduce((best, point) => ((opensUp ? point[1] < best[1] : point[1] > best[1]) ? point : best));
  const zeros = points.filter(([, y]) => Math.abs(y) < 1e-9).map(([x]) => x);
  return { vertex, zeros };
};
const pointText = ([x, y]) => `(${x}, ${y})`;

const deviceMarks = (question, responses) => {
  const { workflow, grading } = readComposedQuestion(question);
  return buildWorkflowAnswerState({ question, stages: activeStages(workflow, responses), responses, grading }).isCorrect;
};
const serverMarks = (question, responses) => gradeServerResponse({ question, response: gradeComposedWorkflowCheck(question, composedWorkflowWork(responses)).toolResponse }).isCorrect;

/* ---------------------------------------------------------------------------
 * The families.
 * ------------------------------------------------------------------------- */

test('the three families are registered, recognize static questions, may serve Recovery, at the Warm-Up\'s rigor and standards', () => {
  LIVE.forEach((live) => {
    assert.equal(typeof live.family.recognize, 'function');
    assert.equal(live.family.recovery.eligible, true);
    assert.deepEqual([...live.family.skill.alignments], [live.standard]);
    const { dok, band } = familyDifficultyFor(live.family, valuesOf(live.family));
    const question = questionIn(live.questionId);
    assert.deepEqual([dok, band], [Number(question.dok), Number(question.difficultyBand)], live.questionId);
    assert.equal(measureFamilyCapacity(live.family, valuesOf(live.family)).capacity, COUNTS[live.family.id]);
  });
  const source = readFileSync(new URL('../../functions/shared/questionFamiliesGraphRecognition.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/^import [\s\S]*? from '([^']+)';$/gm)].map((match) => match[1]), ['./questionFamilyContract.mjs'], 'it imports only the family contract');
});

for (const live of LIVE.filter((entry) => entry.family !== VERTEX)) {
  test(`${live.family.id}: versions are valid and distinct, every figure shows and is keyed by the curve it draws, marked right on the device and the server, and every card moved to another category is refused`, () => {
    const instances = versionsOf(live.family);
    assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, instances.length);
    instances.forEach((instance) => {
      const question = build(live, instance);
      assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], instance.fingerprint);
      const [stage] = question.workflow;
      const key = Object.fromEntries(stage.items.map((item) => {
        assert.ok(shows(item.graph), `${item.graph.model} shows on the grid`);
        return [item.id, live.family === SORT ? familyDrawn(item.graph.model) : growthDrawn(item.graph.model)];
      }));
      assert.deepEqual(question.grading.sort.match, key, 'the key is what each curve draws');
      const counts = Object.values(key).reduce((tally, category) => ({ ...tally, [category]: (tally[category] || 0) + 1 }), {});
      assert.deepEqual(counts, live.family === SORT ? { linear: 2, quadratic: 1, exponential: 1 } : { growth: 3, decay: 3 }, 'the original\'s mix');
      const responses = { sort: buildFigureMatchResponse(stage, key) };
      assert.equal(deviceMarks(question, responses), true, 'on the device');
      assert.equal(serverMarks(question, responses), true, 'on the server');
      assert.deepEqual(Object.values(serverRecoveryKeyCheck(question, instance)), [true, true, true]);
      stage.items.forEach((item) => stage.categories.filter((category) => category.id !== key[item.id]).forEach((category) => {
        const wrong = { sort: buildFigureMatchResponse(stage, { ...key, [item.id]: category.id }) };
        assert.notEqual(serverMarks(question, wrong), true, `${item.graph.model} as ${category.id} on the server`);
        assert.notEqual(deviceMarks(question, wrong), true, `${item.graph.model} as ${category.id} on the device`);
      }));
      ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'answerKey'].forEach((field) => assert.equal(question[field], undefined));
    });
  });
}

test(`quadratics.vertexChoiceFromGraph: all ${COUNTS[VERTEX.id]} versions are valid and distinct, keyed by the turning point the parabola draws; the wrong choices are its x-intercepts and the vertex with both signs changed; the device and the server mark each one`, () => {
  const live = LIVE[1];
  const instances = versionsOf(VERTEX);
  assert.equal(instances.length, COUNTS[VERTEX.id]);
  assert.equal(new Set(instances.map((instance) => instance.fingerprint)).size, COUNTS[VERTEX.id]);
  instances.forEach((instance) => {
    const question = build(live, instance);
    assert.deepEqual(validateQuestionSemantics(question, { label: instance.fingerprint }).errors, [], instance.fingerprint);
    const [stage] = question.workflow;
    const graph = stage.previewOnGraph.graph;
    const { vertex, zeros } = parabolaDrawn(graph);
    assert.equal(zeros.length, 2, `${graph.model} crosses the x-axis twice on the grid`);
    assert.ok(vertex[1] >= graph.yMin && vertex[1] <= graph.yMax, 'the vertex is on the grid');
    const labels = stage.choices.map((choice) => choice.label);
    assert.deepEqual([...labels].sort(), [pointText(vertex), pointText([-vertex[0], -vertex[1]]), ...zeros.map((x) => pointText([x, 0]))].sort(), graph.model);
    const keyChoice = stage.choices.find((choice) => choice.label === pointText(vertex));
    assert.equal(question.grading.choice, keyChoice.id);
    assert.equal(deviceMarks(question, { choice: keyChoice.id }), true, 'on the device');
    assert.equal(serverMarks(question, { choice: keyChoice.id }), true, 'on the server');
    assert.deepEqual(Object.values(serverRecoveryKeyCheck(question, instance)), [true, true, true]);
    stage.choices.filter((choice) => choice !== keyChoice).forEach((choice) => {
      assert.notEqual(serverMarks(question, { choice: choice.id }), true, `${choice.label} on the server`);
      assert.notEqual(deviceMarks(question, { choice: choice.id }), true, `${choice.label} on the device`);
    });
    ['hints', 'steps', 'solution', 'workedSolution', 'solutionReview', 'answerKey'].forEach((field) => assert.equal(question[field], undefined));
  });
});

test('certification answers a composed version with its own key and refuses another', () => {
  LIVE.forEach((live) => {
    const [instance] = versionsOf(live.family);
    const question = build(live, instance);
    const responses = recoveryKeyResponses(question, instance);
    assert.equal(gradeServerResponse({ question, response: responses.right }).isCorrect, true, live.family.id);
    assert.notEqual(gradeServerResponse({ question, response: responses.wrong }).isCorrect, true, live.family.id);
  });
});

/* ---------------------------------------------------------------------------
 * The live questions.
 * ------------------------------------------------------------------------- */

const figuresOf = (question) => question.workflow[0].items.map((item) => `${item.graph.model}=${question.grading.sort.match[item.id]}`).sort();

for (const live of LIVE) {
  test(`${live.questionId}: recognized by ${live.family.id} at the same rigor, written as the lesson writes it`, () => {
    const question = questionIn(live.questionId);
    const recognized = live.family.recognize(question);
    assert.deepEqual(recognized, { params: live.params, constraints: {} });
    const evaluated = evaluateFamilyCandidate(live.family, valuesOf(live.family), recognized.params);
    assert.equal(evaluated.valid, true);
    const rebuilt = build(live, evaluated.instance);
    assert.deepEqual([rebuilt.type, rebuilt.prompt], [question.type, question.prompt]);
    if (live.family === VERTEX) {
      const own = question.workflow[0];
      const [stage] = rebuilt.workflow;
      assert.deepEqual(stage.previewOnGraph.graph, own.previewOnGraph.graph, 'the same window and parabola');
      assert.deepEqual(stage.choices.map((choice) => choice.label).sort(), own.choices.map((choice) => choice.label).sort(), 'the lesson\'s own choices');
      const keyLabel = (q) => q.workflow[0].choices.find((choice) => choice.id === q.grading.choice).label;
      assert.equal(keyLabel(rebuilt), keyLabel(question));
    } else {
      assert.deepEqual(figuresOf(rebuilt), figuresOf(question), 'the lesson\'s own figures, keyed alike');
      assert.deepEqual(rebuilt.workflow[0].categories, question.workflow[0].categories);
    }
    assert.ok(measureFamilyCapacity(live.family, valuesOf(live.family)).capacity - 1 >= RECOVERY_MINIMUM_FRESH_VERSIONS);
  });
}

const mutate = (base, change) => {
  const question = structuredClone(base);
  change(question);
  return question;
};

test('recognize refuses a question that is not exactly one of these, and every other question of the review', () => {
  const [sort, vertex, growth] = LIVE.map((live) => questionIn(live.questionId));
  const refused = [
    [SORT, 'a figure keyed to another family', mutate(sort, (q) => { const [first] = Object.keys(q.grading.sort.match); q.grading.sort.match[first] = 'quadratic'; })],
    [SORT, 'another window', mutate(sort, (q) => { q.workflow[0].items[0].graph.xMax = 8; })],
    [SORT, 'a third line in place of the parabola', mutate(sort, (q) => { const item = q.workflow[0].items.find((entry) => /\^2/.test(entry.graph.model)); item.graph.model = '3*x - 1'; q.grading.sort.match[item.id] = 'linear'; })],
    [SORT, 'another category list', mutate(sort, (q) => { q.workflow[0].categories.pop(); })],
    [VERTEX, 'an intercept as the key', mutate(vertex, (q) => { q.grading.choice = q.workflow[0].choices.find((choice) => choice.label === '(4, 0)').id; })],
    [VERTEX, 'another distractor', mutate(vertex, (q) => { q.workflow[0].choices[1].label = '(2, 4)'; })],
    [VERTEX, 'a parabola with no whole-number zeros', mutate(vertex, (q) => { q.workflow[0].previewOnGraph.graph.model = '1*(x - 2)^2 - 3'; })],
    [GROWTH, 'a growth curve keyed as decay', mutate(growth, (q) => { const item = q.workflow[0].items.find((entry) => entry.graph.model === '1*2^x'); q.grading.sort.match[item.id] = 'decay'; })],
    [GROWTH, 'four growth curves', mutate(growth, (q) => { const item = q.workflow[0].items.find((entry) => entry.graph.model === '8*0.5^x'); item.graph.model = '2*2^x'; q.grading.sort.match[item.id] = 'growth'; })],
  ];
  refused.forEach(([family, why, question]) => assert.equal(family.recognize(question), null, `${family.id}: ${why}`));
  LESSON.questions.forEach((question) => {
    FAMILIES.forEach((family) => {
      const own = LIVE.some((live) => live.questionId === question.questionId && live.family === family);
      if (!own) assert.equal(family.recognize(question), null, `${family.id}: ${question.questionId}`);
    });
  });
});

/* ---------------------------------------------------------------------------
 * What the teacher sees.
 * ------------------------------------------------------------------------- */

test('Prepare Recovery on the District DOL 1 review: Warm-Up Q2, Q3 and Q4 are added and the Warm-Up becomes ready; no question changes', () => {
  const assignment = {
    ...structuredClone(LESSON.model.assignmentV5),
    id: 'live-district-dol1',
    title: LESSON.model.assignmentV5.assignment.title,
    courseId: 'algebra1',
    assignedClassIds: ['class-a1'],
    assignmentRevision: 2,
  };
  const { report } = buildRecoveryUpgradePreview({ assignment, manifest: null, gradeSample: serverRecoveryKeyCheck, trackers: [], at: '2026-11-06T15:00:00.000Z' });
  const added = report.changes.map((change) => `${change.label}:${change.family.id}`);
  ['Warm-Up Q1:relations.mappingDiagram', 'Warm-Up Q2:functions.familySortFromGraphs', 'Warm-Up Q3:quadratics.vertexChoiceFromGraph', 'Warm-Up Q4:exponential.sortGrowthDecay']
    .forEach((entry) => assert.ok(added.includes(entry), `${entry}\n${added.join('\n')}`));
  assert.deepEqual(report.readiness.warmup, { before: 'unavailable', after: 'ready', message: null });
  report.changes.forEach((change) => assert.ok(change.freshVersions >= RECOVERY_MINIMUM_FRESH_VERSIONS, `${change.label}: ${change.freshVersions}`));
  assert.deepEqual(report.untouched.questions.map((entry) => entry.signature), flattenAssignmentQuestions(assignment).map(recoverySourceSignature));
});
