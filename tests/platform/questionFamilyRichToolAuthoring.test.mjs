/*
 * ASSIGNMENT-LOCAL QUESTION FAMILIES ON RICH TOOLS, THROUGH THE REAL V5 CHAIN.
 *
 * The defect this pins: the V5 compiler kept `questionFamily: { scope:
 * "assignment" }` on a representationMatch / representationBridge question but
 * dropped its sibling `generator` — only the fraction, stepAlgebra and
 * multiAnswer branches listed `generator` themselves. Pre-Flight then saw a
 * declared local family with no template (`template_invalid: not_a_template`),
 * and the rich tool's own schema was run against the raw template ("{{m}}" is
 * not a slope: "Could not derive canonical line from source").
 *
 * The pipeline these tests hold is:
 *
 *   authored family template -> generator preserved through compile
 *     -> deterministic family instance -> the instance is validated
 *     -> the instance is server-graded
 *
 * Nothing here relaxes a check: a template whose generated versions are
 * invalid is still refused, by Pre-Flight, with the version that breaks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import {
  isFamilyBackedQuestion,
  reproduceFamilyQuestionFromPin,
  resolveFamilyQuestionInstance,
} from '../../functions/shared/questionFamilyInstance.mjs';
import {
  planSeatAdditions,
  resolveGenerationAllocation,
  resolveLearnerSeat,
} from '../../functions/shared/questionGenerationIdentity.mjs';
import { resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { serverResponseGradingSupport } from '../../functions/shared/serverGrading/gradingSupport.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { placeholdersUsed } from '../../functions/shared/pathQuestionGeneration.mjs';
import { correctLinearBoardResponse, oneWrongLinearBoardResponse } from './helpers/linearMultipleRepresentationsResponses.mjs';

const align = (code) => [{ framework: 'teks', code, role: 'primary' }];

const LMR_TEMPLATE = Object.freeze({
  questionId: 'fam-lmr',
  standard: 'A.2B',
  alignments: align('A.2B'),
  type: 'representationBridge',
  mode: 'linearMultipleRepresentations',
  studentActions: ['connectLinearRepresentations'],
  difficultyBand: 2,
  dok: 2,
  prompt: 'You are given the slope-intercept equation y = {{m}}x {{b|signed}}. Build every other representation of this same line, in any order you like.',
  source: { kind: 'slopeIntercept', equation: 'y = {{m}}x {{b|signed}}' },
  feedbackTiming: 'guided',
  graphBounds: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
  generator: {
    parameters: {
      m: { type: 'int', min: -3, max: 3, exclude: [0, 1, -1] },
      b: { type: 'int', min: -6, max: 6, exclude: [0] },
    },
    constraints: ['b % m == 0'],
  },
  questionFamily: { scope: 'assignment' },
});

const MATCH_TEMPLATE = Object.freeze({
  questionId: 'fam-match',
  standard: 'A.3C',
  alignments: align('A.3C'),
  type: 'representationMatch',
  studentActions: ['connectRepresentations'],
  difficultyBand: 1,
  dok: 2,
  prompt: 'Two different lines are hiding in these cards. Sort every card into the line it describes.',
  representations: {
    mode: 'linearConnections',
    task: 'group',
    cardKinds: ['slopeIntercept', 'graph', 'slope', 'yIntercept'],
    sets: [
      { id: 'line-a', slopeIntercept: 'y = {{m}}x {{b|signed}}', graphSpec: { type: 'linear', a: '{{m}}', h: 0, k: '{{b}}' }, slope: '{{m}}', yIntercept: [0, '{{b}}'] },
      { id: 'line-b', slopeIntercept: 'y = {{n}}x {{c|signed}}', graphSpec: { type: 'linear', a: '{{n}}', h: 0, k: '{{c}}' }, slope: '{{n}}', yIntercept: [0, '{{c}}'] },
    ],
    graphBounds: { xMin: -6, xMax: 6, yMin: -6, yMax: 6 },
  },
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 4 },
      b: { type: 'int', min: -4, max: 4, exclude: [0] },
      n: { type: 'int', min: -4, max: -2 },
      c: { type: 'int', min: -4, max: 4, exclude: [0] },
    },
    constraints: ['b != c'],
  },
  questionFamily: { scope: 'assignment' },
});

const BRIDGE_TEMPLATE = Object.freeze({
  questionId: 'fam-bridge',
  standard: 'A.3A',
  alignments: align('A.3A'),
  type: 'representationBridge',
  mode: 'linear',
  studentActions: ['connectLinearRepresentations'],
  difficultyBand: 2,
  dok: 2,
  prompt: 'The table shows a linear relationship. Show the rate is constant, then connect it to an equation and a graph.',
  source: { kind: 'table', rows: [{ x: 1, y: '{{y1}}' }, { x: 2, y: '{{y2}}' }, { x: 3, y: '{{y3}}' }, { x: 4, y: '{{y4}}' }] },
  // No meaning stage: that one needs an authored context (units, meanings).
  requiredStages: ['rateEvidence', 'generalForm', 'factoredForm', 'graph'],
  generator: {
    parameters: { m: { type: 'int', min: -4, max: 4, exclude: [0] }, b: { type: 'int', min: -6, max: 6 } },
    derived: { y1: 'm*1+b', y2: 'm*2+b', y3: 'm*3+b', y4: 'm*4+b' },
    constraints: ['b % m == 0'],
  },
  questionFamily: { scope: 'assignment' },
});

const assignmentWith = (questions, role = 'classwork', extra = {}) => ({
  schemaVersion: 5,
  assignment: { title: 'Rich-tool families', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{ id: role, role, title: role, questions: questions.map((question) => JSON.parse(JSON.stringify(question))) }],
  ...extra,
});

const compileOne = (template) => compileAuthoringIntentV5(assignmentWith([template])).package.sections[0].questions[0];

/** The teacher import + Pre-Flight review chain App.jsx runs. */
const importAndReview = (assignment) => {
  const parsed = parseAssignmentBlueprintText(JSON.stringify(assignment));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), { classSize: 12 });
  return { parsed, model };
};

test('1. an assignment-local family generator survives V5 compilation on every rich tool', () => {
  for (const template of [LMR_TEMPLATE, MATCH_TEMPLATE, BRIDGE_TEMPLATE]) {
    const compiled = compileOne(template);
    assert.deepEqual(compiled.questionFamily, { scope: 'assignment' }, `${template.questionId} keeps its opt-in`);
    assert.deepEqual(compiled.generator, template.generator, `${template.questionId} keeps its template generator`);
    assert.equal(compiled.type, template.type, `${template.questionId} compiles to ${template.type}`);
    // Every templated value is still a token in the compiled renderer contract.
    for (const name of placeholdersUsed({ ...template, generator: undefined, questionFamily: undefined })) {
      assert.ok(placeholdersUsed({ ...compiled, generator: undefined }).has(name), `${template.questionId} still carries {{${name}}}`);
    }
  }
});

test('2. a representationMatch local family compiles and passes the full import + Pre-Flight chain', () => {
  const { model, parsed } = importAndReview(assignmentWith([MATCH_TEMPLATE]));
  assert.ok(parsed.questions[0].generator, 'the import keeps the generator');
  assert.deepEqual(model.errors, []);
  assert.ok(!model.errors.some((error) => /not_a_template|template_invalid/.test(error)));
  const [slot] = model.questionGeneration.slots;
  assert.equal(slot.familyBacked, true);
  assert.equal(slot.scope, 'assignment');
  assert.equal(slot.ready, true);
});

test('3. a representationBridge (linear) local family compiles and passes the full import + Pre-Flight chain', () => {
  const { model } = importAndReview(assignmentWith([BRIDGE_TEMPLATE]));
  assert.deepEqual(model.errors, []);
  const [slot] = model.questionGeneration.slots;
  assert.equal(slot.familyBacked, true);
  assert.equal(slot.ready, true);
});

test('4. a linearMultipleRepresentations local family compiles and passes the full import + Pre-Flight chain', () => {
  const { model } = importAndReview(assignmentWith([LMR_TEMPLATE]));
  assert.deepEqual(model.errors, []);
  const [slot] = model.questionGeneration.slots;
  assert.equal(slot.familyBacked, true);
  assert.equal(slot.scope, 'assignment');
  assert.equal(slot.capacity, 20, 'm in {±2, ±3} with b a nonzero multiple of m inside [-6, 6]');
});

test('5. the family preview is resolved BEFORE the rich tool\'s own validation: the template is never judged as a question', () => {
  const [template] = flattenV5Sections(compileAuthoringIntentV5(assignmentWith([LMR_TEMPLATE])).package);
  // The raw template really is not a valid board on its own …
  assert.ok(validateToolQuestion(template).errors.some((error) => /derive canonical line/.test(error)));
  // … but the runtime contract judges the generated version and accepts it,
  assert.doesNotThrow(() => validateAssignmentQuestions([template], {}));
  // and returns the slot itself, still a template, for storage.
  assert.equal(validateAssignmentQuestions([template], {})[0], template);
  assert.equal(isFamilyBackedQuestion(validateAssignmentQuestions([template], {})[0]), true);

  // A template that cannot generate is refused with the family reason, not as a broken board.
  const broken = { ...template, generator: { ...template.generator, constraints: ['m > 100'] } };
  assert.throws(() => validateAssignmentQuestions([broken], {}), /references a Question Family that cannot generate questions \(family_has_no_valid_instances/);

  // A template valid at one preview but broken for other numbers is still caught,
  // by Pre-Flight's sample of generated versions — no check was weakened.
  const tooSmall = { ...LMR_TEMPLATE, graphBounds: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 } };
  const { model } = importAndReview(assignmentWith([tooSmall]));
  assert.equal(model.isValid, false);
  assert.ok(
    model.errors.some((error) => /generated versions would be refused/.test(error) && /graphBounds does not include/.test(error)),
    model.errors.join('\n'),
  );
});

test('6. every generated rich-tool version passes semantic validation and its tool schema', () => {
  for (const template of [LMR_TEMPLATE, MATCH_TEMPLATE, BRIDGE_TEMPLATE]) {
    const compiled = compileOne(template);
    for (let seat = 0; seat < 20; seat += 1) {
      const result = resolveFamilyQuestionInstance({ question: compiled, assignmentId: 'asg-semantic', allocation: { seat, variant: 0, stride: 20, index: seat, basis: 'seated' } });
      if (result.error) break;
      assert.equal(JSON.stringify(result.question).includes('{{'), false, `${template.questionId} seat ${seat}: no token reaches a student`);
      assert.equal(result.question.generator, undefined);
      assert.equal(result.question.questionFamily, undefined);
      assert.deepEqual(validateToolQuestion(result.question).errors, [], `${template.questionId} seat ${seat}`);
      assert.deepEqual(validateQuestionSemantics(result.question).errors, [], `${template.questionId} seat ${seat}`);
    }
  }
});

test('7. server grading: the server marks the rebuilt instance, never the template', async () => {
  const compiled = compileOne(LMR_TEMPLATE);
  assert.equal(serverResponseGradingSupport(compiled).supported, false);
  // A local template carries both a generator and the opt-in; either refusal
  // means "the stored template is not the delivered question".
  assert.ok(['family-template', 'generated-question'].includes(serverResponseGradingSupport(compiled).reason));

  const assignment = { id: 'asg-grade', schemaVersion: 5, assignedClassIds: ['c1'], sections: [{ id: 'classwork', role: 'classwork', questions: [compiled] }] };
  assignment.generationSeats = { byClassId: { c1: planSeatAdditions({ assignment, classId: 'c1', studentIds: ['s1', 's2', 's3'] }) } };
  const seatInfo = resolveLearnerSeat({ assignment, studentId: 's2', classId: 'c1' });
  const delivered = resolveFamilyQuestionInstance({ question: compiled, assignmentId: assignment.id, storageIndex: 0, allocation: resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo, variant: 0 }) });
  assert.equal(delivered.error, null);

  const right = gradeToolWork({ toolId: 'representationBridge', question: delivered.question, work: correctLinearBoardResponse(delivered.question) });
  assert.equal(right.isCorrect, true, 'the browser verdict');
  const wrong = gradeToolWork({ toolId: 'representationBridge', question: delivered.question, work: oneWrongLinearBoardResponse(delivered.question) });
  assert.equal(wrong.isCorrect, false);

  // The server rebuilds the instance from the pin and marks the same raw work.
  const forGrading = resolveServerGradingQuestion({ assignment, question: compiled, questionIndex: 0, variantIndex: 0, claimedDelivery: delivered.delivery, studentId: 's2', classId: 'c1' });
  assert.equal(forGrading.familyBacked, true);
  assert.ok(forGrading.question, forGrading.reason);
  assert.equal(forGrading.question.generator, undefined);
  assert.equal(gradeServerResponse({ question: forGrading.question, response: right.toolResponse }).isCorrect, true);
  assert.equal(gradeServerResponse({ question: forGrading.question, response: wrong.toolResponse }).isCorrect, false);
  // Another student's correct board is not this student's answer.
  const other = resolveFamilyQuestionInstance({ question: compiled, assignmentId: assignment.id, storageIndex: 0, allocation: resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo: resolveLearnerSeat({ assignment, studentId: 's1', classId: 'c1' }), variant: 0 }) });
  assert.notEqual(other.delivery.fingerprint, delivered.delivery.fingerprint);
  const borrowed = gradeToolWork({ toolId: 'representationBridge', question: other.question, work: correctLinearBoardResponse(other.question) });
  assert.equal(gradeServerResponse({ question: forGrading.question, response: borrowed.toolResponse }).isCorrect, false);
});

test('8. family identity and delivery pins survive compilation and recompilation', () => {
  const once = compileAuthoringIntentV5(assignmentWith([LMR_TEMPLATE, MATCH_TEMPLATE])).package;
  const twice = compileAuthoringIntentV5(once).package;
  const thrice = compileAuthoringIntentV5(twice).package;
  const pick = (pkg) => pkg.sections[0].questions.map(({ questionId, questionFamily, generator, type, mode }) => ({ questionId, questionFamily, generator, type, mode }));
  assert.deepEqual(pick(twice), pick(once), 'recompiling changes no family metadata');
  assert.deepEqual(pick(thrice), pick(once), 'and nothing accumulates');
  assert.deepEqual(twice.sections[0].questions, once.sections[0].questions, 'the whole compiled slot is a fixed point');

  // A pin written against the first compile replays against the third.
  once.sections[0].questions.forEach((question, storageIndex) => {
    const shown = resolveFamilyQuestionInstance({ question, assignmentId: 'asg-pin', storageIndex, allocation: { seat: 3, variant: 0, stride: 8, index: 3, basis: 'seated' } });
    const replay = reproduceFamilyQuestionFromPin({ question: thrice.sections[0].questions[storageIndex], assignmentId: 'asg-pin', storageIndex, pin: shown.delivery });
    assert.equal(replay.error, null, question.questionId);
    assert.equal(replay.instance.fingerprint, shown.delivery.fingerprint);
    assert.deepEqual(replay.question, shown.question);
  });
});

test('9. the same student gets the same generated question on every load and device', () => {
  const compiled = compileOne(LMR_TEMPLATE);
  const assignment = { id: 'asg-stable', schemaVersion: 5, sections: [{ id: 'classwork', role: 'classwork', questions: [compiled] }] };
  assignment.generationSeats = { byClassId: { c1: planSeatAdditions({ assignment, classId: 'c1', studentIds: ['ana', 'ben', 'cy'] }) } };
  const load = () => resolveFamilyQuestionInstance({
    question: compileOne(LMR_TEMPLATE),
    assignmentId: assignment.id,
    storageIndex: 0,
    allocation: resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo: resolveLearnerSeat({ assignment, studentId: 'ben', classId: 'c1' }), variant: 0 }),
  });
  const first = load();
  const second = load();
  assert.equal(first.delivery.fingerprint, second.delivery.fingerprint);
  assert.deepEqual(first.question, second.question);
});

test('10. classmates receive different valid versions', () => {
  const compiled = compileOne(LMR_TEMPLATE);
  const roster = Array.from({ length: 10 }, (_, index) => `student-${index}`);
  const assignment = { id: 'asg-class', schemaVersion: 5, sections: [{ id: 'classwork', role: 'classwork', questions: [compiled] }] };
  assignment.generationSeats = { byClassId: { c1: planSeatAdditions({ assignment, classId: 'c1', studentIds: roster }) } };
  const fingerprints = roster.map((studentId) => {
    const result = resolveFamilyQuestionInstance({
      question: compiled,
      assignmentId: assignment.id,
      storageIndex: 0,
      allocation: resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo: resolveLearnerSeat({ assignment, studentId, classId: 'c1' }), variant: 0 }),
    });
    assert.equal(result.error, null);
    assert.deepEqual(validateToolQuestion(result.question).errors, []);
    return result.delivery.fingerprint;
  });
  assert.equal(new Set(fingerprints).size, roster.length, 'ten students, ten different lines');
});

test('an edited template is judged as edited: no cached instance list outlives the template it was built from', () => {
  const original = compileOne(LMR_TEMPLATE);
  const first = resolveFamilyQuestionInstance({ question: original, assignmentId: 'asg-edit', allocation: { seat: 0, variant: 0, stride: 1, index: 0, basis: 'preview' } });
  assert.equal(first.error, null);
  // Same slot (same assignment, same questionId), same version, different numbers.
  const edited = { ...original, generator: { ...original.generator, parameters: { ...original.generator.parameters, b: { type: 'int', min: 7, max: 7 } } }, graphBounds: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, generatorVersion: undefined };
  edited.generator.constraints = ['b != 0'];
  const second = resolveFamilyQuestionInstance({ question: edited, assignmentId: 'asg-edit', allocation: { seat: 0, variant: 0, stride: 1, index: 0, basis: 'preview' } });
  assert.equal(second.error, null);
  assert.equal(second.instance.params.b, 7, 'the edited template\'s own instance, not the cached one');
  // And a template edited to generate nothing is refused, not served from cache.
  const impossible = { ...original, generator: { ...original.generator, constraints: ['m > 100'] } };
  assert.equal(resolveFamilyQuestionInstance({ question: impossible, assignmentId: 'asg-edit', allocation: { seat: 0, variant: 0, stride: 1, index: 0, basis: 'preview' } }).error, 'family_has_no_valid_instances');
});

test('a legacy question that never opted in compiles exactly as before: a stray generator is still not carried', () => {
  const { questionFamily: _omit, ...legacy } = LMR_TEMPLATE;
  const compiled = compileOne({ ...legacy, source: { kind: 'slopeIntercept', equation: 'y = 2x + 4' }, prompt: 'Build every representation.' });
  assert.equal(compiled.generator, undefined);
  assert.equal(compiled.questionFamily, undefined);
  assert.equal(isFamilyBackedQuestion(compiled), false);
});

test('a template whose tokens a tool cannot keep is refused at compile, by name — never half-compiled', () => {
  const lossy = { ...LMR_TEMPLATE, representationsNote: 'Slope {{m}}' };
  assert.throws(
    () => compileOne(lossy),
    /V5 question 1 is a Question Family template, but representationBridge does not keep the field\(s\) that use \{\{m\}\}/,
  );
  // A platform family's own {{tokens}} are the family's to fill: not checked.
  assert.doesNotThrow(() => compileAuthoringIntentV5(assignmentWith([{
    prompt: 'Solve {{equation}} for x.',
    studentActions: ['solveStepByStep'],
    questionFamily: { id: 'linear.twoStepEquation' },
    alignments: align('A.5A'),
  }])));
});

test('a templated function spec keeps its tokens through compile instead of becoming NaN', () => {
  const compiled = compileOne({
    questionId: 'fam-graph-match',
    standard: 'A.3C',
    alignments: align('A.3C'),
    studentActions: ['connectRepresentations'],
    prompt: 'Which graph matches the line?',
    representations: {
      mode: 'graphMatch',
      sets: [
        { id: 'a', equation: 'y = {{m}}x + 1', table: [], context: 'A' },
        { id: 'b', equation: 'y = -x + 2', table: [], context: 'B' },
      ],
    },
    function: { family: 'linear', m: '{{m}}', b: 1 },
    generator: { parameters: { m: { type: 'int', min: 2, max: 5 } } },
    questionFamily: { scope: 'assignment' },
  });
  assert.equal(compiled.function.a, '{{m}}');
  const built = resolveFamilyQuestionInstance({ question: compiled, assignmentId: 'asg', allocation: { seat: 0, variant: 0, stride: 1, index: 0, basis: 'preview' } });
  assert.equal(built.error, null);
  assert.equal(typeof built.question.function.a, 'number');
});
