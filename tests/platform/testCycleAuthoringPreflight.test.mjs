import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  findSecureAnswerKeyLeaks,
  preflightTestCycle,
} from '../../functions/shared/testCyclePreflight.mjs';
import {
  normalizeAssignmentV5,
  validateAssignmentV5,
  V5_SECTION_ROLES,
} from '../../src/platform/contract/assignmentSchemaV5.js';
import { ACTIVITY_POLICIES, ACTIVITY_ROLES } from '../../src/platform/policies/activityPolicies.js';
import { assertCapability, componentSource, region } from './helpers/sourceContract.mjs';

const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const controls = componentSource('src/components/teacher/TestCycleControls.jsx');

/*
 * WHAT A TEST CYCLE MUST NOT BE ABLE TO PUBLISH, AND HOW A TEACHER ASSIGNS ONE.
 */

const family = (id, { generative = true } = {}) => ({
  id, ...(generative ? { generator: { parameters: { a: { min: 1, max: 9 } } } } : {}),
});
const issuable = (ids) => Object.fromEntries(ids.map((id) => [id, { issuable: true, reason: null }]));

const GOOD_BLUEPRINT = {
  blueprintId: 'unit3',
  targets: [
    { targetId: 't1', alignmentKey: 'texas:A.5A', questionCount: 2, anchor: true, familyIds: ['f1', 'f2', 'f3'] },
    { targetId: 't2', alignmentKey: 'texas:A.7C', questionCount: 2, familyIds: ['g1', 'g2', 'g3'] },
  ],
};
const GOOD_FAMILIES = ['f1', 'f2', 'f3', 'g1', 'g2', 'g3'].map((id) => family(id));
const GOOD_ASSIGNMENT = {
  schemaVersion: 5,
  assignment: { title: 'Unit 3', courseId: 'algebra1' },
  assessmentPolicy: { mode: 'testCycle' },
  testBlueprint: GOOD_BLUEPRINT,
  sections: [
    { role: 'review', questions: [{ questionId: 'r1' }] },
    { role: 'corrections', questions: [{ questionId: 'c1' }] },
  ],
};

const preflight = (overrides = {}) => preflightTestCycle({
  assignment: GOOD_ASSIGNMENT,
  blueprint: GOOD_BLUEPRINT,
  families: GOOD_FAMILIES,
  familyIssuability: issuable(['f1', 'f2', 'f3', 'g1', 'g2', 'g3']),
  ...overrides,
});

test('a well-formed Test Cycle passes preflight', () => {
  const result = preflight();
  assert.deepEqual(result.errors, []);
  assert.equal(result.blocked, false);
  assert.ok(result.checks.every((check) => check.passed), JSON.stringify(result.checks));
});

test('preflight blocks a Test Cycle that cannot issue enough equivalent secure coverage', () => {
  const thin = {
    blueprintId: 'unit3',
    targets: [{ targetId: 't1', alignmentKey: 'texas:A.5A', questionCount: 4, familyIds: ['f1'] }],
  };
  const result = preflight({ blueprint: thin, families: [family('f1')], familyIssuability: issuable(['f1']) });
  assert.equal(result.blocked, true);
  assert.ok(result.errors.some((error) => /distinct approved families/.test(error)));
  assert.equal(result.checks.find((check) => check.id === 'secureTestCoverage').passed, false);
});

test('preflight blocks a Test Cycle with no parallel coverage for a retest', () => {
  const fixed = {
    blueprintId: 'unit3',
    targets: [{ targetId: 't1', alignmentKey: 'texas:A.5A', questionCount: 1, familyIds: ['fixed'] }],
  };
  const result = preflight({
    blueprint: fixed,
    families: [family('fixed', { generative: false })],
    familyIssuability: issuable(['fixed']),
  });
  assert.equal(result.blocked, true);
  assert.ok(result.errors.some((error) => /no parallel coverage/.test(error)));
});

test('preflight blocks a family the server cannot privately grade', () => {
  const result = preflight({
    familyIssuability: { ...issuable(['f1', 'f2', 'f3', 'g1', 'g2']), g3: { issuable: false, reason: 'no_gradable_definition' } },
  });
  assert.equal(result.blocked, true);
  assert.ok(result.errors.some((error) => /cannot be privately graded/.test(error)));
  assert.equal(result.checks.find((check) => check.id === 'privateGrading').passed, false);
});

test('preflight blocks secure stages authored as client-visible questions', () => {
  const leaky = { ...GOOD_ASSIGNMENT, sections: [...GOOD_ASSIGNMENT.sections, { role: 'test', questions: [{ questionId: 'x' }] }] };
  const result = preflight({ assignment: leaky });
  assert.equal(result.blocked, true);
  assert.ok(result.errors.some((error) => /secure exam runtime/.test(error)));
  assert.equal(result.checks.find((check) => check.id === 'stageIsolation').passed, false);
});

test('preflight blocks an answer key serialized into the student-visible blueprint', () => {
  const leaky = {
    ...GOOD_BLUEPRINT,
    targets: [{ ...GOOD_BLUEPRINT.targets[0], sample: { expected: '3/4', accepted: ['0.75'] } }, GOOD_BLUEPRINT.targets[1]],
  };
  const leaks = findSecureAnswerKeyLeaks(leaky);
  assert.ok(leaks.length >= 2, JSON.stringify(leaks));
  const result = preflight({ blueprint: leaky });
  assert.equal(result.blocked, true);
  assert.ok(result.errors.some((error) => /Secure answer material/.test(error)));
});

test('preflight requires a Review section when the policy requires Review', () => {
  const noReview = { ...GOOD_ASSIGNMENT, sections: [{ role: 'corrections', questions: [{ questionId: 'c1' }] }] };
  const result = preflight({ assignment: noReview });
  assert.ok(result.errors.some((error) => /no review section/.test(error)));
});

test('preflight refuses to run on an assignment that is not a Test Cycle', () => {
  const result = preflightTestCycle({ assignment: { sections: [] }, policy: { mode: 'lesson' } });
  assert.equal(result.mode, null);
  assert.ok(result.errors.some((error) => /not a Test Cycle/.test(error)));
});

/* --- the V5 authoring contract -------------------------------------------- */

test('V5 carries the two instructional Test Cycle roles and not the secure ones', () => {
  assert.ok(V5_SECTION_ROLES.includes('review'));
  assert.ok(V5_SECTION_ROLES.includes('corrections'));
  // Both earn zero assessment points — the secure Test and Retest carry the
  // grade, and a review that counted would let a student raise a test grade
  // without taking a test.
  assert.equal(ACTIVITY_POLICIES[ACTIVITY_ROLES.REVIEW].grading.pointsPossible, 0);
  assert.equal(ACTIVITY_POLICIES[ACTIVITY_ROLES.CORRECTIONS].grading.pointsPossible, 0);
  assert.equal(ACTIVITY_POLICIES[ACTIVITY_ROLES.REVIEW].hintsAllowed, true);
  assert.equal(ACTIVITY_POLICIES[ACTIVITY_ROLES.CORRECTIONS].hintsAllowed, true);
});

test('a Test Cycle assignment normalizes its policy and blueprint, and validates', () => {
  const normalized = normalizeAssignmentV5(GOOD_ASSIGNMENT);
  assert.equal(normalized.assessmentPolicy.mode, 'testCycle');
  assert.equal(normalized.assessmentPolicy.passingScore, 70);
  assert.equal(normalized.assessmentPolicy.retest.maxRecordedGrade, 70);
  assert.equal(normalized.assessmentPolicy.retest.targetedWeakShare, 0.7);
  assert.equal(normalized.testBlueprint.totalQuestions, 4);
  assert.deepEqual(validateAssignmentV5(normalized).errors, []);
});

test('an ordinary assignment gains no assessment fields at all', () => {
  const plain = normalizeAssignmentV5({
    schemaVersion: 5,
    assignment: { title: 'Lesson', courseId: 'algebra1' },
    sections: [{ role: 'classwork', questions: [{ questionId: 'q1' }] }],
  });
  assert.equal('assessmentPolicy' in plain, false);
  assert.equal('testBlueprint' in plain, false);
});

test('V5 validation refuses a Test Cycle with a Test section or no blueprint', () => {
  const withTestSection = normalizeAssignmentV5({ ...GOOD_ASSIGNMENT, sections: [{ role: 'test', questions: [{ questionId: 'x' }] }] });
  const errors = validateAssignmentV5(withTestSection).errors;
  assert.ok(errors.some((error) => /cannot contain a "test" section/.test(error)));

  const noBlueprint = normalizeAssignmentV5({ ...GOOD_ASSIGNMENT, testBlueprint: null });
  assert.ok(validateAssignmentV5(noBlueprint).errors.some((error) => /requires a testBlueprint/.test(error)));

  const noFamilies = normalizeAssignmentV5({
    ...GOOD_ASSIGNMENT,
    testBlueprint: { blueprintId: 'b', targets: [{ targetId: 't', alignmentKey: 'texas:A.5A', questionCount: 1 }] },
  });
  assert.ok(validateAssignmentV5(noFamilies).errors.some((error) => /no approved generator family/.test(error)));
});

/* --- batch assignment ------------------------------------------------------ */

test('a teacher assigns a whole class in one action, not one session at a time', () => {
  const assign = region(
    functionsIndex,
    'exports.assignTestCycleSessions = onCall(',
    'exports.preflightTestCycleAssignment',
    'assignTestCycleSessions',
  );
  // A class, or a chosen set of students — never a single studentId argument.
  assert.match(assign, /where\("classId", "==", classId\)/);
  assert.match(assign, /studentIds/);
  assert.match(assign, /for \(const \[studentId, studentData\] of eligible\)/);
  // Each student gets their own plan and their own session.
  assert.match(assign, /buildSecureIssuancePlan/);
  assert.match(assign, /createCourseTestSession/);
  // And the whole batch is refused if preflight is blocked.
  assert.match(assign, /if \(preflight\.blocked\)/);
});

test('the teacher screen offers the class-wide action and the override controls', () => {
  assertCapability(
    controls,
    [/assignTestCycleSessions/],
    'the teacher must be able to open secure sessions for the class.',
  );
  assertCapability(controls, [/Open secure Test sessions for this class/], 'the class-wide action must be offered.');
  for (const action of ['waiveCorrections', 'unlockRetest', 'disableRetest', 'requireCorrections', 'resetSecureSession']) {
    assert.match(controls, new RegExp(`'${action}'`), `${action} must be an offered teacher control`);
  }
  // Preflight is shown before the assign button, not after a failed attempt.
  assert.match(controls, /Cannot be assigned securely yet/);
});
