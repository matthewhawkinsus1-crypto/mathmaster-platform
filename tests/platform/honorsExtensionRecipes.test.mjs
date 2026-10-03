/*
 * DETERMINISTIC (NO-AI) HONORS EXTENSIONS COME FROM VETTED RECIPES.
 *
 * Production: an Algebra I assignment whose core family is
 * linear.multipleRepresentations was given, by "Add Honors Extension Without
 * AI", an "Algebra II Honors extension" graphStory (familyId
 * honors-modeling-algebra2) that told the student to make a graph it never
 * drew and graded nothing but character counts. Two defects:
 *
 *   - the generator chose its course from the DESTINATION class profile and
 *     never looked at the assignment's course or concept, so content leaked
 *     across courses;
 *   - it was a generic free-response fallback, so it could not be self-graded
 *     and could not pass MathMaster's own Pre-Flight.
 *
 * The repair: a recipe registry keyed by the assignment's question family.
 * A recipe declares what it is anchored to, which courses it serves, the rich
 * family it builds, how much it raises DOK/difficulty, that it is
 * self-graded, and its version. No recipe → a structured "unavailable"
 * result and NO question, never a free-response fallback.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DETERMINISTIC_HONORS_SOURCE,
  HONORS_EXTENSION_CONTRACT_VERSION,
  HONORS_RECIPE_REGISTRY,
  HONORS_RECIPE_STATUS,
  HONORS_RECIPE_UNAVAILABLE,
  buildDeterministicHonorsExtension,
  certifyHonorsExtensionQuestion,
  defineHonorsRecipe,
  describeHonorsExtension,
  resolveHonorsAnchor,
  selectHonorsExtensionRecipe,
} from '../../src/platform/rigor/honorsExtensionRecipes.js';
import { inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import { isFamilyBackedQuestion, resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { planSeatAdditions, resolveGenerationAllocation, resolveLearnerSeat } from '../../functions/shared/questionGenerationIdentity.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { executableSource } from './helpers/sourceContract.mjs';
import { correctLinearBoardResponse } from './helpers/linearMultipleRepresentationsResponses.mjs';
import {
  PRODUCTION_LEGACY_HONORS_QUESTION,
  editorQuestionsOf,
  preflightEditorCandidate,
  publishLmrLesson,
  storedHonorsAssignment,
} from './helpers/honorsExtensionFixtures.mjs';

const lesson = publishLmrLesson();
const LESSON_QUESTIONS = lesson.questions;

const TWO_STEP_LESSON = Object.freeze([
  { questionId: 'ts-1', type: 'stepAlgebra', activityRole: 'classwork', standard: 'A.5A', alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary' }], dok: 2, prompt: 'Solve for x.', questionFamily: { id: 'linear.twoStepEquation', version: 1 } },
  { questionId: 'ts-2', type: 'stepAlgebra', activityRole: 'practice', standard: 'A.5A', alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary' }], dok: 2, prompt: 'Solve for x.', questionFamily: { id: 'linear.twoStepEquation', version: 1 } },
]);

const assertCertified = (question, label = 'extension') => {
  const certification = certifyHonorsExtensionQuestion(question);
  assert.deepEqual(certification.errors, [], label);
  assert.equal(certification.ok, true, label);
};

const ready = (result) => {
  assert.equal(result.status, HONORS_RECIPE_STATUS.READY, `expected a recipe, got ${result.code}: ${result.teacherMessage}`);
  return result;
};

test('the production case: an Algebra I MR lesson going to an "Algebra II" Honors class gets an Algebra I rich-tool extension', () => {
  const result = ready(buildDeterministicHonorsExtension({
    questions: LESSON_QUESTIONS,
    assignmentCourseId: 'algebra1',
    // The destination profile that produced the production defect.
    destinationCourseId: 'algebra2',
  }));
  const { question } = result;
  assert.equal(result.courseId, 'algebra1', 'the extension follows the assignment, not the destination profile');
  assert.equal(question.honorsEnrichment.courseId, 'algebra1');
  assert.doesNotMatch(JSON.stringify(question), /Algebra II|algebra2|honors-modeling/i, 'nothing Algebra II reaches the question');
  assert.notEqual(question.type, 'graphStory');
  assert.ok(result.notes.some((note) => /Algebra II/.test(note) && /Algebra I/.test(note)), 'the teacher is told the class profile and the assignment disagree');
});

test('1. an Algebra I assignment can never receive an Algebra II deterministic extension', () => {
  // Offered one registered recipe at a time, an Algebra I context selects it
  // only if that recipe serves Algebra I.
  for (const recipe of HONORS_RECIPE_REGISTRY) {
    const selection = selectHonorsExtensionRecipe({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1', registry: [recipe] });
    if (selection.status === HONORS_RECIPE_STATUS.READY) assert.ok(selection.recipe.supportedCourses.includes('algebra1'), recipe.id);
    else assert.equal(recipe.supportedCourses.includes('algebra1'), false, `${recipe.id} serves Algebra I but was refused: ${selection.code}`);
  }

  // A registry that ONLY has an Algebra II recipe on the very same family.
  const algebra2Only = defineHonorsRecipe({
    ...HONORS_RECIPE_REGISTRY[0],
    id: 'honors.test.algebra2Only',
    supportedCourses: ['algebra2'],
  });
  const refused = selectHonorsExtensionRecipe({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1', registry: [algebra2Only] });
  assert.equal(refused.status, HONORS_RECIPE_STATUS.UNAVAILABLE);
  assert.equal(refused.code, HONORS_RECIPE_UNAVAILABLE.COURSE_NOT_SUPPORTED);
  const built = buildDeterministicHonorsExtension({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1', destinationCourseId: 'algebra2', registry: [algebra2Only] });
  assert.equal(built.question, null, 'no question at all');

  // The anchor's own TEKS are checked too: Algebra II TEKS under an "Algebra I" label is a conflict, not a pass.
  const relabelled = LESSON_QUESTIONS.map((question) => ({
    ...question,
    standard: '2A.2A',
    alignments: [{ framework: 'teks', code: '2A.2A', role: 'primary' }],
  }));
  const conflict = selectHonorsExtensionRecipe({ questions: relabelled, assignmentCourseId: 'algebra1' });
  assert.equal(conflict.status, HONORS_RECIPE_STATUS.UNAVAILABLE);
  assert.equal(conflict.code, HONORS_RECIPE_UNAVAILABLE.COURSE_CONFLICT);

  // And an Algebra II assignment is not handed the Algebra I recipe either.
  const algebra2Assignment = selectHonorsExtensionRecipe({ questions: relabelled, assignmentCourseId: 'algebra2' });
  assert.equal(algebra2Assignment.status, HONORS_RECIPE_STATUS.UNAVAILABLE);
  assert.equal(algebra2Assignment.code, HONORS_RECIPE_UNAVAILABLE.COURSE_NOT_SUPPORTED);

  // An unknown course is never guessed into one.
  const unlabeled = LESSON_QUESTIONS.map((question) => ({ ...question, standard: undefined, alignments: [] }));
  assert.equal(selectHonorsExtensionRecipe({ questions: unlabeled, assignmentCourseId: null }).code, HONORS_RECIPE_UNAVAILABLE.COURSE_UNKNOWN);
  assert.equal(selectHonorsExtensionRecipe({ questions: unlabeled, assignmentCourseId: 'geometry' }).code, HONORS_RECIPE_UNAVAILABLE.COURSE_UNKNOWN);
});

test('every registered recipe declares what it is anchored to, its courses, its target family, its rigor increase, self-grading and a version', () => {
  assert.ok(HONORS_RECIPE_REGISTRY.length >= 1);
  for (const recipe of HONORS_RECIPE_REGISTRY) {
    assert.match(recipe.id, /^honors\./);
    assert.ok(Number.isInteger(recipe.version) && recipe.version >= 1, `${recipe.id} version`);
    assert.ok(recipe.anchor.familyIds.length >= 1, `${recipe.id} anchor family`);
    assert.ok(recipe.supportedCourses.length >= 1, `${recipe.id} courses`);
    assert.ok(recipe.target.familyId && recipe.target.toolId, `${recipe.id} target`);
    assert.ok(recipe.rigor.dok > recipe.rigor.baseline.dok, `${recipe.id} raises DOK`);
    assert.ok(recipe.rigor.difficultyBand > recipe.rigor.baseline.difficultyBand, `${recipe.id} raises difficulty`);
    assert.ok(recipe.rigor.increases.length >= 3, `${recipe.id} says how`);
    assert.equal(recipe.selfGraded, true, `${recipe.id} is self-graded`);
    assert.ok(Object.isFrozen(recipe), `${recipe.id} cannot be edited at runtime`);
  }
  // The registry refuses a recipe that cannot prove those things.
  const base = HONORS_RECIPE_REGISTRY[0];
  assert.throws(() => defineHonorsRecipe({ ...base, selfGraded: false }), /self-graded/);
  assert.throws(() => defineHonorsRecipe({ ...base, supportedCourses: [] }), /course/);
  assert.throws(() => defineHonorsRecipe({ ...base, rigor: { ...base.rigor, dok: base.rigor.baseline.dok } }), /DOK/);
  assert.throws(() => defineHonorsRecipe({ ...base, version: 0 }), /version/);
  assert.throws(() => defineHonorsRecipe({ ...base, anchor: { familyIds: [] } }), /anchor/);
});

test('the anchor is the assignment\'s own core family, not a stray warm-up or an Honors extension', () => {
  const anchor = resolveHonorsAnchor(LESSON_QUESTIONS);
  assert.equal(anchor.familyId, 'linear.multipleRepresentations');
  // A legacy extension or an excluded question never decides the concept.
  const withNoise = [...TWO_STEP_LESSON.map((question) => ({ ...question, teacherExcluded: true })), PRODUCTION_LEGACY_HONORS_QUESTION, ...LESSON_QUESTIONS];
  assert.equal(resolveHonorsAnchor(withNoise).familyId, 'linear.multipleRepresentations');
  // A static (non-family) board still names its concept.
  const staticBoard = { questionId: 's-1', type: 'representationBridge', mode: 'linearMultipleRepresentations', activityRole: 'classwork', standard: 'A.2B', source: { kind: 'slopeIntercept', equation: 'y = 2x + 1' } };
  assert.equal(resolveHonorsAnchor([staticBoard]).familyId, 'linear.multipleRepresentations');
});

test('2. linear.multipleRepresentations receives a self-graded rich-tool extension on the existing board and grader', () => {
  const { question, recipe } = ready(buildDeterministicHonorsExtension({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1' }));
  assert.equal(question.type, 'representationBridge');
  assert.equal(question.mode, 'linearMultipleRepresentations');
  assert.equal(isFamilyBackedQuestion(question), true, 'drawn from the platform family, one version per student');
  assert.equal(question.questionFamily.id, 'linear.multipleRepresentations');
  assert.equal(question.questionFamily.version, 1);
  assert.equal(question.questionFamily.constraints.scenarioStart, 'fromReading');
  assert.equal(question.questionFamily.constraints.slope, 'fraction');
  assert.ok(question.dok > 2 && question.difficultyBand > 2, 'above the lesson\'s own boards (DOK 2, band 2)');
  for (const key of ['independentQuantity', 'dependentQuantity', 'slopeMeaning', 'yInterceptMeaning', 'xInterceptMeaning', 'domain']) {
    assert.ok(question.context[key], `the board grades ${key}`);
  }

  // Thirty students, seated the way the teacher app seats a class: thirty
  // different versions, each marked by the SERVER exactly as the browser marks it.
  const students = Array.from({ length: 30 }, (_, index) => `student-${index + 1}`);
  const assignment = { id: 'asg-honors', schemaVersion: 5, assignedClassIds: ['p4'], sections: [{ id: 'cw', role: 'classwork', questions: [{ ...question, questionId: 'honors-ext' }] }] };
  assignment.generationSeats = { byClassId: { p4: planSeatAdditions({ assignment, classId: 'p4', studentIds: students }) } };
  const slot = assignment.sections[0].questions[0];
  const fingerprints = new Set();
  for (const studentId of students) {
    const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: 'p4' });
    const allocation = resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo, variant: 0 });
    const delivered = resolveFamilyQuestionInstance({ question: slot, assignmentId: assignment.id, allocation });
    assert.equal(delivered.error, null);
    fingerprints.add(delivered.instance.fingerprint);
    const browser = gradeToolWork({ toolId: 'representationBridge', question: delivered.question, work: correctLinearBoardResponse(delivered.question) });
    assert.equal(browser.isCorrect, true);
    const forGrading = resolveServerGradingQuestion({ assignment, question: slot, questionIndex: 0, variantIndex: 0, claimedDelivery: delivered.delivery, studentId, classId: 'p4' });
    assert.equal(forGrading.familyBacked, true);
    assert.equal(forGrading.question.familyInstance.fingerprint, delivered.instance.fingerprint, 'the server rebuilds the version the student saw');
    assert.equal(gradeServerResponse({ question: forGrading.question, response: browser.toolResponse }).isCorrect, true, 'the server marks it: self-graded, no teacher scoring');
  }
  assert.equal(fingerprints.size, 30);
  assert.equal(recipe.selfGraded, true);
});

test('3. the extension is not a graphStory, an open response, or any character-count free response', () => {
  const { question } = ready(buildDeterministicHonorsExtension({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1' }));
  assert.ok(!['graphStory', 'openResponse', 'response', 'freeResponse', 'shortAnswer', 'essay'].includes(question.type));
  for (const key of ['minimumScenarioCharacters', 'minimumExplanationCharacters', 'minimumCharacters', 'rubric']) {
    assert.equal(question[key], undefined, `${key} is not how an Honors extension is graded`);
  }
  assert.doesNotMatch(String(question.familyId || ''), /^honors-modeling-/, 'the grading family is the rich tool\'s, not a label');
  // The generic generator is gone from the platform, not merely unused.
  const rigorSource = executableSource(readFileSync(new URL('../../src/platform/rigor/courseRigor.js', import.meta.url), 'utf8'));
  // (inspectHonorsRigor still RECOGNISES teacher-authored graphStory questions;
  // what is gone is the code that CREATED one as the no-AI extension.)
  assert.doesNotMatch(rigorSource, /buildHonorsEnrichment|type:\s*['"]graphStory['"]|minimumScenarioCharacters|honors-modeling-/, 'courseRigor no longer writes a free-response extension');
  const recipeSource = executableSource(readFileSync(new URL('../../src/platform/rigor/honorsExtensionRecipes.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(recipeSource, /['"](?:graphStory|openResponse)['"]/, 'and the recipe module has no fallback type to reach for');
});

test('4. the generated extension passes the normal MathMaster Pre-Flight in the assignment it is added to', () => {
  const { question } = ready(buildDeterministicHonorsExtension({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1' }));
  assertCertified(question);
  const stored = storedHonorsAssignment({ ...question, questionId: 'honors-ext' });
  const model = preflightEditorCandidate(stored, editorQuestionsOf(stored));
  assert.deepEqual(model.errors, []);
  assert.equal(model.isValid, true);
  const storageIndex = editorQuestionsOf(stored).findIndex((entry) => entry.questionId === 'honors-ext');
  const slot = model.questionGeneration.slots.find((entry) => entry.questionIndex === storageIndex);
  assert.ok(slot?.familyBacked && slot.ready, 'the slot generates');
  assert.ok(slot.capacity >= 30, `a class's worth of versions (${slot.capacity})`);
});

test('5. a prompt that asks for a graph cannot pass without the graph / rich-tool contract', () => {
  // The production question itself, active.
  const certification = certifyHonorsExtensionQuestion(PRODUCTION_LEGACY_HONORS_QUESTION);
  assert.equal(certification.ok, false);
  assert.match(certification.errors.join('\n'), /refers to a graph in its prompt, but the question contains none/);
  const stored = storedHonorsAssignment(PRODUCTION_LEGACY_HONORS_QUESTION);
  const model = preflightEditorCandidate(stored, editorQuestionsOf(stored));
  assert.equal(model.isValid, false);
  assert.match(model.errors.join('\n'), /refers to a graph in its prompt, but the question contains none/);
  // The recipe's question with its board contract stripped out is refused too.
  const { question } = ready(buildDeterministicHonorsExtension({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1' }));
  const stripped = { ...question, questionFamily: undefined, source: undefined, prompt: `${question.prompt} Use the graph shown to check your work.` };
  assert.equal(certifyHonorsExtensionQuestion(stripped).ok, false);
});

test('6. an unsupported family gets a structured "no deterministic recipe" result and the assignment is not touched', () => {
  const before = JSON.parse(JSON.stringify(TWO_STEP_LESSON));
  const result = buildDeterministicHonorsExtension({ questions: TWO_STEP_LESSON, assignmentCourseId: 'algebra1', destinationCourseId: 'algebra1' });
  assert.equal(result.status, HONORS_RECIPE_STATUS.UNAVAILABLE);
  assert.equal(result.code, HONORS_RECIPE_UNAVAILABLE.NO_VETTED_RECIPE);
  assert.equal(result.question, null, 'no free-response fallback');
  assert.equal(result.anchorFamilyId, 'linear.twoStepEquation', 'it says which concept has no recipe');
  assert.match(result.teacherMessage, /vetted no-AI Honors extension is not yet available/i);
  assert.match(result.teacherMessage, /unchanged/i);
  assert.deepEqual(TWO_STEP_LESSON, before, 'the questions passed in are not mutated');

  const nothing = buildDeterministicHonorsExtension({ questions: [], assignmentCourseId: 'algebra1' });
  assert.equal(nothing.status, HONORS_RECIPE_STATUS.UNAVAILABLE);
  assert.equal(nothing.code, HONORS_RECIPE_UNAVAILABLE.NO_ANCHOR);
  assert.equal(nothing.question, null);
});

test('contract v2 metadata names the recipe, its version, the anchor family, and self-grading', () => {
  const { question, recipe, anchor } = ready(buildDeterministicHonorsExtension({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1' }));
  assert.equal(HONORS_EXTENSION_CONTRACT_VERSION, 2);
  assert.deepEqual(
    {
      generatedBy: question.honorsEnrichment.generatedBy,
      source: question.honorsEnrichment.source,
      contractVersion: question.honorsEnrichment.contractVersion,
      recipeId: question.honorsEnrichment.recipeId,
      recipeVersion: question.honorsEnrichment.recipeVersion,
      anchorFamilyId: question.honorsEnrichment.anchorFamilyId,
      gradingFamilyId: question.honorsEnrichment.gradingFamilyId,
      selfGraded: question.honorsEnrichment.selfGraded,
    },
    {
      generatedBy: 'MathMaster',
      source: DETERMINISTIC_HONORS_SOURCE,
      contractVersion: 2,
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      anchorFamilyId: 'linear.multipleRepresentations',
      gradingFamilyId: 'linear.multipleRepresentations',
      selfGraded: true,
    },
  );
  assert.equal(question.honorsEnrichment.anchorQuestionId, anchor.questionId);
  // Deterministic: the same lesson always yields the same extension.
  assert.deepEqual(buildDeterministicHonorsExtension({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1' }).question, question);
  // A different story is available on request (swapping), still from the same recipe.
  const other = ready(buildDeterministicHonorsExtension({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1', avoidStoryIds: [question.honorsEnrichment.storyId] })).question;
  assert.notEqual(other.honorsEnrichment.storyId, question.honorsEnrichment.storyId);
  assert.equal(other.honorsEnrichment.recipeId, recipe.id);
  assertCertified(other);
});

test('every story the recipe can tell passes certification', () => {
  const seen = [];
  for (;;) {
    const result = buildDeterministicHonorsExtension({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1', avoidStoryIds: seen, cycle: false });
    if (result.status !== HONORS_RECIPE_STATUS.READY) break;
    assertCertified(result.question, result.question.honorsEnrichment.storyId);
    seen.push(result.question.honorsEnrichment.storyId);
  }
  assert.ok(seen.length >= 3, `at least three vetted stories (${seen.join(', ')})`);
});

test('12. legacy deterministic v1 extensions are recognised; current v2 and AI-built extensions are told apart', () => {
  const legacy = describeHonorsExtension(PRODUCTION_LEGACY_HONORS_QUESTION);
  assert.equal(legacy.isDeterministic, true);
  assert.equal(legacy.isLegacy, true);
  assert.equal(legacy.contractVersion, 1);
  const { question } = ready(buildDeterministicHonorsExtension({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1' }));
  const current = describeHonorsExtension(question);
  assert.equal(current.isDeterministic, true);
  assert.equal(current.isLegacy, false);
  assert.equal(current.isCurrent, true);
  // A v2 record whose recipe was later revised is legacy too.
  assert.equal(describeHonorsExtension({ ...question, honorsEnrichment: { ...question.honorsEnrichment, recipeVersion: 0 } }).isLegacy, true);
  // An extension from the AI path is not a deterministic one, and a normal question is not an extension.
  assert.equal(describeHonorsExtension({ ...question, honorsEnrichment: { generatedBy: 'MathMaster AI' } }).isDeterministic, false);
  assert.equal(describeHonorsExtension(LESSON_QUESTIONS[0]).isHonorsExtension, false);
});

test('13. Honors rigor and CCMR rules are unchanged: the extension adds depth, never CCMR credit', () => {
  const { question } = ready(buildDeterministicHonorsExtension({ questions: LESSON_QUESTIONS, assignmentCourseId: 'algebra1' }));
  const report = inspectHonorsRigor([...LESSON_QUESTIONS, question]);
  for (const key of ['coreTeks', 'higherOrderReasoning', 'multipleRepresentations', 'justification', 'modelingApplication']) {
    assert.equal(report.checks[key], true, `the extension supplies ${key}`);
  }
  assert.equal(report.checks.ccmrEnrichment, false, 'a MathMaster depth extension is not authentic exam-style practice');
  assert.equal(report.isHonorsReady, false, 'so the full contract still needs audited CCMR Practice');
  assert.equal(inspectHonorsRigor([...LESSON_QUESTIONS, question], { ccmrTargetRequired: false }).isHonorsReady, true);

  const directSat = {
    type: 'response',
    activityRole: 'practice',
    dok: 2,
    prompt: 'If $f(x)=3x+4$, what is $f(12)$?',
    alignments: [
      { framework: 'teks', code: 'A.3C', role: 'primary' },
      { framework: 'digitalSAT', domainId: 'algebra', role: 'secondary', evidenceMode: 'direct' },
    ],
    assessmentContext: { framework: 'digitalSAT', examStyle: true },
    ccmrSource: { source: 'auditedBank', releaseTarget: 'ccmr-fidelity-v2.1-authentic-language' },
  };
  const withCcmr = inspectHonorsRigor([...LESSON_QUESTIONS, question, directSat]);
  assert.equal(withCcmr.checks.ccmrEnrichment, true);
  assert.equal(withCcmr.isHonorsReady, true);
});
