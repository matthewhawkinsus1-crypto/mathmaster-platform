/*
 * EVERY VETTED HONORS RECIPE, CERTIFIED THE WAY A CLASS WILL USE IT.
 *
 * The registry is walked, never listed by hand: a recipe is certified the
 * moment it is registered, and a recipe that cannot pass is a red suite, not a
 * question in front of a student. For every recipe, every anchor it serves
 * and every story it can tell:
 *
 *   contract       it declares what it extends, for which course, what builds
 *                  and grades it, its version, self-grading, its rigor against
 *                  the anchor family's OWN declared rigor, and how it is harder;
 *                  it is never a free-response or teacher-scored question
 *   validity       renderer contract, semantic validation, question↔tool
 *                  contract and TEKS alignment (certifyHonorsExtensionQuestion)
 *   Pre-Flight     the whole lesson with the extension added passes the normal
 *                  Assignment V5 Pre-Flight, and the extension adds no warning
 *   a real class   30 seated students: 30 different, valid, reproducible
 *                  versions, each marked by the SERVER exactly as the browser
 *                  marks it — 100% when right, not credited with one card wrong
 *   every version  of every story keeps exactly one correct choice per meaning
 *                  and never states its own answers, under the ordinary and
 *                  the reduce-complexity profile
 *   Recovery       Recovery-ready, and a Recovery question is fresh (never the
 *                  version the student already saw) and server-graded
 *   unchanged      a recipe's built question is pinned to its version: the
 *                  certified #423 recipe builds exactly what it built before
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  HONORS_RECIPE_REGISTRY,
  HONORS_RECIPE_STATUS,
  buildDeterministicHonorsExtension,
  certifyHonorsExtensionQuestion,
  defineHonorsRecipe,
  describeHonorsExtension,
  strictCourseId,
  withHonorsExtension,
} from '../../src/platform/rigor/honorsExtensionRecipes.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import { auditQuestionToolContract } from '../../src/platform/contract/questionToolContract.js';
import { validateAlignments } from '../../src/platform/contract/alignments.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';
import {
  isFamilyBackedQuestion,
  reproduceFamilyQuestionFromPin,
  resolveFamilyQuestionInstance,
} from '../../functions/shared/questionFamilyInstance.mjs';
import { resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { planSeatAdditions, resolveGenerationAllocation, resolveLearnerSeat } from '../../functions/shared/questionGenerationIdentity.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { familyInstanceServerGradable } from '../../functions/shared/questionFamilyGrading.mjs';
import { assessRecoverySlot, assessSectionRecoveryReadiness } from '../../functions/shared/sectionRecoveryReadiness.mjs';
import { buildRecoveryAssessmentPlan } from '../../functions/shared/sectionRecoveryPlan.mjs';
import {
  deriveLinearMultipleRepresentations,
  validateContextField,
  validateDomainField,
} from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { correctLinearBoardResponse, oneWrongLinearBoardResponse } from './helpers/linearMultipleRepresentationsResponses.mjs';
import { anchorLessonFor, anchorLessonV5For } from './helpers/honorsRecipeLessons.mjs';
import { publishLmrLesson } from './helpers/honorsExtensionFixtures.mjs';

const CLASS_SIZE = 30;
const SUPPORT = 'reduce-complexity';
const FREE_RESPONSE_TYPES = Object.freeze(['graphStory', 'openResponse', 'response', 'freeResponse', 'shortAnswer', 'essay', 'explanation']);
const NON_TOOL_GRADING_FIELDS = Object.freeze(['minimumScenarioCharacters', 'minimumExplanationCharacters', 'minimumCharacters', 'minimumWords', 'rubric', 'manualScoring', 'teacherScored', 'requiresTeacherScoring']);

// Every (recipe, anchor family, course) the registry serves.
const SERVED = HONORS_RECIPE_REGISTRY.flatMap((recipe) => recipe.anchor.familyIds.flatMap((familyId) => (
  recipe.supportedCourses.map((courseId) => ({ recipe, familyId, courseId, label: `${recipe.id} ← ${familyId} (${courseId})` }))
)));

const build = ({ recipe, familyId, courseId }, storyId = null) => {
  const result = buildDeterministicHonorsExtension({ questions: anchorLessonFor(familyId, courseId), assignmentCourseId: courseId, storyId });
  assert.equal(result.status, HONORS_RECIPE_STATUS.READY, `${recipe.id}: ${result.code} ${result.teacherMessage}`);
  assert.equal(result.recipe.id, recipe.id, `a ${familyId} lesson in ${courseId} selects ${recipe.id}`);
  if (storyId) assert.equal(result.question.honorsEnrichment.storyId, storyId);
  return result;
};

const eachStory = (fn) => {
  for (const served of SERVED) {
    for (const story of served.recipe.stories) fn({ ...served, story, label: `${served.label} · ${story.id}` });
  }
};

/** The browser's verdict and the server's, from the same raw work; they must agree. */
const markBothWays = (question, work, label) => {
  const browser = gradeToolWork({ toolId: question.type, question, work });
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.isCorrect, browser.isCorrect, `${label}: the server agrees with the browser`);
  assert.equal(server.score, browser.score, `${label}: the server scores what the browser scored`);
  return { browser, server };
};

/** A class of `size` seated the way the teacher app seats one, with the extension as Classwork Q1. */
const seatedClass = (question, size = CLASS_SIZE) => {
  const students = Array.from({ length: size }, (_, index) => `student-${String(index + 1).padStart(2, '0')}`);
  const assignment = { id: `asg-${question.honorsEnrichment.recipeId}-${question.honorsEnrichment.storyId}`, schemaVersion: 5, assignedClassIds: ['p4'], sections: [{ id: 'cw', role: 'classwork', questions: [{ ...question, questionId: 'honors-ext' }] }] };
  assignment.generationSeats = { byClassId: { p4: planSeatAdditions({ assignment, classId: 'p4', studentIds: students }) } };
  return { assignment, students, slot: assignment.sections[0].questions[0] };
};

// The built question, minus its grade value (which the shared allocator owns),
// hashed with sorted keys: what a recipe@version+story writes into an assignment.
const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
};
const contentHash = (question) => {
  const { questionWeight: _weight, questionWeightBasis: _basis, ...content } = question;
  return createHash('sha256').update(JSON.stringify(sortKeys(content))).digest('hex').slice(0, 16);
};

/* ------------------------------------------------------------------------ */

test('5–6. every recipe declares its full contract, and none is free-response, character-counted or teacher-scored', () => {
  assert.ok(HONORS_RECIPE_REGISTRY.length >= 4, 'the registry has grown beyond the one #423 recipe');
  for (const recipe of HONORS_RECIPE_REGISTRY) {
    const label = recipe.id;
    assert.ok(Number.isInteger(recipe.version) && recipe.version >= 1, `${label}: version`);
    assert.equal(recipe.selfGraded, true, `${label}: self-graded`);
    assert.deepEqual(Object.keys(recipe.delivery).sort(), ['perStudentVersions', 'recoveryReady', 'serverGraded'], `${label}: delivery declared`);
    assert.equal(recipe.delivery.serverGraded, true, `${label}: server-graded`);
    assert.ok(recipe.supportedCourses.every((course) => ['algebra1', 'algebra2'].includes(course)), `${label}: courses are strict`);
    const target = getPlatformQuestionFamily(recipe.target.familyId, recipe.target.familyVersion);
    assert.ok(target && target.tools[recipe.target.toolId], `${label}: the target family fills the target tool`);
    assert.deepEqual(resolveFamilyConstraints(target, recipe.target.constraints).issues, [], `${label}: every constraint is one the family accepts`);
    assert.ok(!FREE_RESPONSE_TYPES.includes(recipe.target.toolId), `${label}: not a free-response tool`);
    for (const familyId of recipe.anchor.familyIds) {
      const anchor = getPlatformQuestionFamily(familyId);
      // The baseline IS the anchor family's own declared rigor: a recipe
      // cannot make its increase look larger by understating the lesson.
      assert.deepEqual(
        { dok: recipe.rigor.baseline.dok, band: recipe.rigor.baseline.difficultyBand },
        { dok: anchor.difficulty.dok, band: anchor.difficulty.band },
        `${label}: baseline is ${familyId}'s declared rigor`,
      );
    }
    assert.ok(recipe.rigor.dok > recipe.rigor.baseline.dok && recipe.rigor.difficultyBand > recipe.rigor.baseline.difficultyBand, `${label}: above the lesson`);
    assert.ok(recipe.rigor.dok >= target.difficulty.dok && recipe.rigor.difficultyBand >= target.difficulty.band, `${label}: at least the target family's own rigor`);
    assert.ok(recipe.rigor.increases.length >= 4, `${label}: says specifically how it is harder`);
    assert.ok(recipe.stories.length >= 3, `${label}: at least three vetted stories to swap between`);
  }
  // The definition gate refuses every way a recipe could overstate itself.
  const base = HONORS_RECIPE_REGISTRY[1];
  const refuse = (overrides, pattern) => assert.throws(() => defineHonorsRecipe({ ...base, id: 'honors.test.refused', ...overrides }), pattern);
  refuse({ rigor: { ...base.rigor, baseline: { dok: 0, difficultyBand: 1 } } }, /below what linear\.slopeFromPoints itself declares/);
  refuse({ target: { ...base.target, constraints: { ...base.target.constraints, slope: 'fractoin' } } }, /does not accept its constraints as written/);
  refuse({ target: { ...base.target, constraints: { ...base.target.constraints, scenarioStrat: 'fromReading' } } }, /constraint_unknown/);
  refuse({ target: { ...base.target, toolId: 'graphStory' } }, /cannot fill the graphStory tool/);
  refuse({ target: { ...base.target, familyId: 'honors.freeResponse' } }, /not a registered Question Family version/);
  refuse({ anchor: { familyIds: ['linear.slopeFromPointz'] } }, /is not a registered Question Family/);
  refuse({ question: { ...base.question, minimumExplanationCharacters: 45 } }, /not how an Honors extension is graded/);
  refuse({ question: { ...base.question, rubric: { points: 4 } } }, /not how an Honors extension is graded/);
  refuse({ delivery: { ...base.delivery, serverGraded: false } }, /serverGraded/);
  refuse({ delivery: undefined }, /delivery/);
  refuse({ stories: [base.stories[0], base.stories[0]] }, /story ids must be different/);
  eachStory((served) => {
    const { question } = build(served, served.story.id);
    assert.ok(!FREE_RESPONSE_TYPES.includes(question.type), `${served.label}: ${question.type} is not free-response`);
    NON_TOOL_GRADING_FIELDS.forEach((field) => assert.equal(question[field], undefined, `${served.label}: no ${field}`));
    assert.equal(isFamilyBackedQuestion(question), true, `${served.label}: family-backed`);
    assert.equal(question.honorsEnrichment.selfGraded, true);
    assert.equal(question.dok, served.recipe.rigor.dok);
    assert.equal(question.difficultyBand, served.recipe.rigor.difficultyBand);
    assert.doesNotMatch(String(question.familyId || ''), /^honors-modeling-/);
  });
});

test('7–8. every story of every recipe passes semantic validation, the question↔tool contract and TEKS alignment for its course', () => {
  eachStory((served) => {
    const { question } = build(served, served.story.id);
    const certification = certifyHonorsExtensionQuestion(question);
    assert.deepEqual(certification.errors, [], served.label);
    assert.deepEqual(validateQuestionSemantics(question, { label: 'Extension' }).errors, [], `${served.label}: semantics`);
    assert.deepEqual(auditQuestionToolContract(question, 0).filter((finding) => finding.severity === 'blocking'), [], `${served.label}: tool contract`);
    assert.deepEqual(validateAlignments(question, { label: 'Extension' }).errors, [], `${served.label}: alignments`);
    // Every TEKS the extension claims belongs to the course it is written for.
    const courses = new Set(question.alignments.map((entry) => (/^A2[.\s:-]/.test(entry.code) ? 'algebra2' : /^A[.\s:-]/.test(entry.code) ? 'algebra1' : 'other')));
    assert.deepEqual([...courses], [served.courseId], `${served.label}: TEKS course`);
    assert.equal(strictCourseId(question.honorsEnrichment.courseId), served.courseId);
  });
});

test('9. every recipe passes the whole-assignment Pre-Flight in its anchor lesson, and adds no warning of its own', () => {
  eachStory((served) => {
    const { question } = build(served, served.story.id);
    const lesson = anchorLessonV5For(served.familyId, served.courseId);
    const before = buildAssignmentV5PreflightModel(lesson);
    assert.deepEqual(before.errors, [], `${served.label}: the lesson itself is clean`);
    const model = buildAssignmentV5PreflightModel(withHonorsExtension(lesson, { ...question, questionId: 'honors-ext' }));
    assert.deepEqual(model.errors, [], served.label);
    assert.equal(model.isValid, true, served.label);
    const extensionIndex = model.questions.findIndex((entry) => entry.questionId === 'honors-ext');
    assert.ok(extensionIndex >= 0, `${served.label}: the extension is in the candidate`);
    const slot = model.questionGeneration.slots.find((entry) => entry.questionIndex === extensionIndex);
    assert.ok(slot?.familyBacked && slot.ready, `${served.label}: the slot generates`);
    assert.ok(slot.capacity >= CLASS_SIZE, `${served.label}: a class's worth of versions (${slot.capacity})`);
    const own = model.warnings.filter((warning) => new RegExp(`Question ${extensionIndex + 1}\\b`).test(warning));
    assert.deepEqual(own, [], `${served.label}: no Pre-Flight warning about the extension`);
  });
});

test('10–12. a seated class of 30 gets 30 different, valid, reproducible versions, each marked by the server exactly as the browser marks it', () => {
  eachStory((served) => {
    const { question } = build(served, served.story.id);
    const { assignment, students, slot } = seatedClass(question);
    const fingerprints = new Set();
    const prompts = new Set();
    const rates = new Set();
    for (const studentId of students) {
      const label = `${served.label} · ${studentId}`;
      const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: 'p4' });
      const allocation = resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo, variant: 0 });
      const delivered = resolveFamilyQuestionInstance({ question: slot, assignmentId: assignment.id, allocation });
      assert.equal(delivered.error, null, label);
      const version = delivered.question;
      // Valid as delivered.
      assert.deepEqual(validateToolQuestion({ ...version, toolId: version.type }).errors, [], label);
      assert.deepEqual(validateQuestionSemantics(version, { label: 'Version' }).errors, [], label);
      assert.equal(JSON.stringify(version).includes('{{'), false, `${label}: no unfilled token reaches the student`);
      assert.equal(familyInstanceServerGradable(version), true, `${label}: the server can mark it`);
      // Deterministic: the same seat always gets the same question, and the pin reproduces it.
      assert.deepEqual(resolveFamilyQuestionInstance({ question: slot, assignmentId: assignment.id, allocation }).question, version, `${label}: reproducible`);
      const reproduced = reproduceFamilyQuestionFromPin({ question: slot, assignmentId: assignment.id, storageIndex: 0, pin: delivered.delivery });
      assert.equal(reproduced.error, null, label);
      assert.equal(reproduced.instance.fingerprint, delivered.instance.fingerprint, `${label}: the pin reproduces the version`);
      fingerprints.add(delivered.instance.fingerprint);
      prompts.add(version.source.prompt);
      rates.add(`${delivered.instance.values.rate}/${delivered.instance.values.per}`);
      // Browser and server agree, on a correct board and on one wrong card.
      const right = markBothWays(version, correctLinearBoardResponse(version), label);
      assert.equal(right.browser.isCorrect, true, `${label}: a complete correct board is credited`);
      assert.equal(right.browser.score, 1, label);
      const forGrading = resolveServerGradingQuestion({ assignment, question: slot, questionIndex: 0, variantIndex: 0, claimedDelivery: delivered.delivery, studentId, classId: 'p4' });
      assert.equal(forGrading.familyBacked, true, label);
      assert.equal(forGrading.question.familyInstance.fingerprint, delivered.instance.fingerprint, `${label}: the server rebuilds the version the student saw`);
      assert.equal(gradeServerResponse({ question: forGrading.question, response: right.browser.toolResponse }).isCorrect, true, `${label}: the server marks it — no teacher scoring`);
      assert.equal(markBothWays(version, oneWrongLinearBoardResponse(version), label).browser.isCorrect, false, `${label}: one wrong card is not credited`);
    }
    assert.equal(fingerprints.size, CLASS_SIZE, `${served.label}: every student has their own version`);
    assert.equal(prompts.size, CLASS_SIZE, `${served.label}: and sees different numbers`);
    assert.ok(rates.size >= 4, `${served.label}: the rate itself varies across the class (${rates.size} rates)`);
  });
});

/** Every distinct version a slot can produce, under one support profile. */
const everyVersion = (question, support = null) => {
  const family = getPlatformQuestionFamily(question.questionFamily.id, question.questionFamily.version);
  const overrides = { ...question.questionFamily.constraints, ...(support ? family.supportConstraints[support] : {}) };
  const { values, issues } = resolveFamilyConstraints(family, overrides);
  assert.deepEqual(issues, []);
  const sequence = createFamilyInstanceSequence(family, values, `certify|${question.honorsEnrichment.recipeId}|${support || 'standard'}`);
  const { instances, complete } = sequence.exhaust();
  assert.equal(complete, true, 'the whole space was walked');
  return instances.map((instance) => ({ instance, version: buildFamilyQuestion({ family, instance, constraintValues: values, authored: { ...question, questionId: 'every-version' } }) }));
};

test('every version of every story keeps exactly one correct choice per meaning and never states its own answers — ordinary and reduce-complexity', () => {
  const credited = (key, entry) => entry.choices.filter((choice) => (key === 'domain'
    ? validateDomainField(choice, entry).isCorrect
    : validateContextField(choice, entry).valid));
  eachStory((served) => {
    const { question } = build(served, served.story.id);
    for (const support of [null, SUPPORT]) {
      const versions = everyVersion(question, support);
      assert.ok(versions.length >= (support ? 12 : CLASS_SIZE), `${served.label} ${support || 'standard'}: ${versions.length} versions`);
      for (const { instance, version } of versions) {
        const label = `${served.label} ${support || 'standard'} ${instance.fingerprint}`;
        assert.equal(JSON.stringify(version).includes('{{'), false, `${label}: no unfilled token`);
        const { b, zero, rate, per, readTime } = instance.values;
        const facts = deriveLinearMultipleRepresentations(version);
        assert.equal(facts.isValid, true, label);
        assert.equal(facts.yInterceptNumber, b, `${label}: the y-intercept is the starting amount`);
        assert.ok(per >= 2 && readTime > 0 && readTime < zero, `${label}: a rate per several units and a reading before it runs out`);
        if (!support) {
          assert.ok(facts.slopeFraction.d >= 2 && facts.slopeFraction.n < 0, `${label}: a negative, genuinely fractional rate`);
          assert.equal(rate % per === 0, false, label);
          // Under the ordinary profile no story number can coincide with an answer.
          const shown = `${version.prompt} ${version.source.prompt}`;
          assert.doesNotMatch(shown, new RegExp(`\\b${b}\\b`), `${label}: the starting amount (${b}) is for the student to find`);
          assert.doesNotMatch(shown, new RegExp(`\\b${zero}\\b`), `${label}: so is the time it runs out (${zero})`);
        } else {
          assert.equal(facts.slopeFraction.d, 1, `${label}: the accommodation keeps a whole-number unit rate`);
        }
        for (const [key, entry] of Object.entries(version.context)) {
          assert.equal(credited(key, entry).length, 1, `${label} ${key}: exactly one choice is correct`);
          assert.equal(new Set(entry.choices).size, entry.choices.length, `${label} ${key}: no two choices read the same`);
        }
      }
    }
  });
});

test('reduce-complexity: 30 supported students still get valid, server-graded versions of every recipe — the support never weakens the others', () => {
  eachStory((served) => {
    const { question } = build(served, served.story.id);
    const ordinary = resolveFamilyConstraints(getPlatformQuestionFamily('linear.multipleRepresentations', 1), question.questionFamily.constraints).values;
    assert.equal(ordinary.slope, 'fraction', `${served.label}: the class keeps its fractional rates`);
    const slot = { ...question, questionId: 'honors-support' };
    for (let seat = 0; seat < CLASS_SIZE; seat += 1) {
      const label = `${served.label} · supported seat ${seat}`;
      const delivered = resolveFamilyQuestionInstance({ question: slot, assignmentId: 'asg-support', allocation: { seat, variant: 0, stride: CLASS_SIZE, index: seat, basis: 'seated' }, support: SUPPORT });
      assert.equal(delivered.error, null, label);
      assert.equal(delivered.delivery.support, SUPPORT);
      const version = delivered.question;
      assert.deepEqual(validateToolQuestion({ ...version, toolId: version.type }).errors, [], label);
      assert.equal(deriveLinearMultipleRepresentations(version).slopeFraction.d, 1, `${label}: whole-number unit rate`);
      // The server rebuilds the supported version from its pin, and marks it.
      const reproduced = reproduceFamilyQuestionFromPin({ question: slot, assignmentId: 'asg-support', storageIndex: 0, pin: delivered.delivery });
      assert.equal(reproduced.instance.fingerprint, delivered.instance.fingerprint, label);
      const right = markBothWays(reproduced.question, correctLinearBoardResponse(reproduced.question), label);
      assert.equal(right.server.isCorrect, true, label);
    }
  });
});

test('Recovery: every recipe is Recovery-ready, and each student\'s Recovery question is fresh and marked by the server', () => {
  for (const served of SERVED) {
    const { question } = build(served);
    const slot = { ...question, questionId: 'honors-ext', activityRole: 'dol' };
    assert.equal(served.recipe.delivery.recoveryReady, true);
    const readiness = assessRecoverySlot({ assignmentId: 'asg-recovery', question: slot, storageIndex: 0, label: 'DOL Q1' });
    assert.equal(readiness.ready, true, `${served.label}: ${JSON.stringify(readiness.issues)}`);
    const section = assessSectionRecoveryReadiness({ assignmentId: 'asg-recovery', section: 'dol', entries: [{ storageIndex: 0, question: slot }] });
    assert.equal(section.ready, true, served.label);

    const { assignment, students } = seatedClass(question);
    for (const studentId of students) {
      const label = `${served.label} · ${studentId}`;
      const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: 'p4' });
      const original = resolveFamilyQuestionInstance({ question: slot, assignmentId: assignment.id, allocation: resolveGenerationAllocation({ seatInfo, variant: 0 }) });
      const plan = buildRecoveryAssessmentPlan({
        assignmentId: assignment.id,
        section: 'dol',
        readySlots: section.readySlots,
        questionsByIndex: { 0: slot },
        seatInfo,
        seenFingerprints: [original.instance.fingerprint],
      });
      assert.equal(plan.error, null, label);
      assert.equal(plan.items.length, 1);
      const [item] = plan.items;
      assert.notEqual(item.pin.fingerprint, original.instance.fingerprint, `${label}: never the version already seen`);
      const rebuilt = reproduceFamilyQuestionFromPin({ question: slot, assignmentId: assignment.id, storageIndex: 0, pin: item.pin });
      assert.equal(rebuilt.error, null, label);
      const marked = markBothWays(rebuilt.question, correctLinearBoardResponse(rebuilt.question), label);
      assert.equal(marked.server.isCorrect, true, `${label}: the Recovery question is server-graded`);
    }
  }
});

/*
 * A recipe's question is a pure function of (recipe, version, story). Stored
 * extensions say which recipe and version wrote them, and the editor treats
 * one as current only while that pair is still registered — so changing what
 * a recipe builds WITHOUT bumping its version would make every stored
 * extension claim to be current when it is not. Changing a hash below means:
 * bump that recipe's version (stored copies then offer "Replace with Current
 * Honors Extension") and update the hash.
 *
 * The three honors.linear.multipleRepresentations.rateFromReading hashes were
 * captured from PR #423's merge (e51792d), before any recipe was added: the
 * certified recipe builds exactly what it built then.
 */
const PINNED_CONTENT = Object.freeze({
  'honors.linear.multipleRepresentations.rateFromReading@1': { tank: 'ba0678ba4e5b25c5', battery: '910c1a22615d93a9', candle: '965eee1fd0115953' },
  'honors.linear.slopeFromPoints.rateOfChange@1': { balloon: '415d9e01e84a105a', hourglass: 'c29d06d6adbc41db', snowDepth: '8ef99a77a0c78c63' },
  'honors.functions.identifyIntercepts.interceptsInContext@1': { elevator: '40cfd6bcb17dddc5', cooler: '73ef441c458038fb', boatFuel: '7d124fbb266e6fc4' },
  'honors.linear.representationSort.buildFromReading@1': { generator: 'a746ea637d1a39f6', floodStage: '8e06f416dc9bc6aa', printerFilament: '16655fcbed66c3ed' },
});

test('16. a recipe builds exactly what its version promises — and the certified #423 recipe is unchanged', () => {
  const r0 = HONORS_RECIPE_REGISTRY.find((recipe) => recipe.id === 'honors.linear.multipleRepresentations.rateFromReading');
  assert.equal(r0?.version, 1, 'the certified recipe keeps its id and version');
  const lesson = publishLmrLesson().questions;
  const seen = {};
  for (const recipe of HONORS_RECIPE_REGISTRY) {
    const key = `${recipe.id}@${recipe.version}`;
    assert.ok(PINNED_CONTENT[key], `${key} has a pinned content hash per story`);
    for (const story of recipe.stories) {
      const served = SERVED.find((entry) => entry.recipe === recipe);
      const { question } = recipe === r0
        // The production case exactly as #423 pinned it: the certified lesson,
        // published to a class whose profile says Algebra II.
        ? buildDeterministicHonorsExtension({ questions: lesson, assignmentCourseId: 'algebra1', destinationCourseId: 'algebra2', storyId: story.id })
        : build(served, story.id);
      (seen[key] ||= {})[story.id] = contentHash(question);
      assert.equal(describeHonorsExtension(question).isCurrent, true, `${key} ${story.id}: current`);
    }
  }
  assert.deepEqual(seen, PINNED_CONTENT);
});
