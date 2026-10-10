// The student's CCMR plan feeds the weekly Path — conservatively.
//
// The teacher's Weekly Path setting has always said "Auto follows each
// student's own stated goal", and nothing implemented it. Now the saved plan
// (functions/shared/ccmrPlan.mjs) chooses which test's FORMAT a transfer slot
// practises. These tests hold the two promises that make that safe on a live
// platform:
//
//   * it never adds transfer work: which skills are transfer, and how many
//     transfer sessions the week holds, are decided by the evidence and the
//     teacher's expectation exactly as before;
//   * it only ever points at practice the secure bank can actually issue.

import test from 'node:test';
import assert from 'node:assert/strict';

import { INSTRUCTIONAL_BAND } from '../../src/platform/profile/studentLearningProfile.js';
import { PURPOSE, STUDENT_EXPLANATION, buildWeeklyRecommendations } from '../../src/platform/path/recommendationV2.js';
import {
  TRANSFER_FRAMEWORK_REASON, chooseTransferFramework, resolveTransferFrameworkPreference, transferExplanationFor,
} from '../../src/platform/path/weeklyTransferFramework.js';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { buildWeeklyPathPlan } from '../../src/platform/path/weeklyPathPlan.js';
import { buildWeeklyGoal } from '../../src/platform/path/weeklyPathGoal.js';

// Noon in Chicago, 7 October 2026.
const NOW = Date.parse('2026-10-07T17:00:00Z');
const CODES = ['A.5A', 'A.3A', 'A.9A', 'A.2C', 'A.6A', 'A.7A'];

// Course mastery is strong and the named exams' formats are behind it: the
// evidence shape diagnoseGaps reports as a CCMR transfer gap.
const profileWithGaps = (frameworks) => ({
  baseline: { established: true },
  instructionalBand: INSTRUCTIONAL_BAND.ON,
  difficultyProfile: { stableBand: 3 },
  dokProfile: {},
  courseMastery: 0.9,
  ccmrTransfer: Object.fromEntries(frameworks.map((framework) => [framework, { proficiency: 0.5, provisional: false }])),
  foundationGapDepth: 0,
});

const rows = CODES.map((code, index) => ({
  skillId: code, teksCode: code, score: 0.9 - index * 0.05, strand: code, representation: 'symbolic',
}));

const coverageFor = (byFramework) => ({
  schemaVersion: 2,
  frameworks: Object.fromEntries(Object.entries(byFramework).map(([framework, codes]) => [framework, {
    skills: Object.fromEntries(codes.map((code) => [code, { published: true }])),
    offWheel: {},
  }])),
});
const EVERYTHING = coverageFor({ digitalSAT: CODES, act: CODES, tsia2: CODES, asvab: CODES });

const plan = (goals, testDate = null, testFramework = null) => ({
  goals: goals.map((framework) => ({ framework })),
  testDate,
  testFramework,
});

const week = (extra = {}) => buildWeeklyRecommendations({
  rows,
  profile: profileWithGaps(['digitalSAT']),
  sessions: 4,
  honors: true,
  coverage: EVERYTHING,
  now: NOW,
  ...extra,
});

const transfer = (result) => result.sessions.filter((session) => session.purpose === PURPOSE.TRANSFER);
const shape = (result) => result.sessions.map((session) => `${session.skillId}:${session.purpose}`);

test('with no plan, transfer slots use the framework the evidence diagnosed, as before', () => {
  const result = week();
  assert.ok(transfer(result).length > 0, 'the fixture must contain transfer work');
  transfer(result).forEach((session) => {
    assert.equal(session.context, 'digitalSAT');
    assert.equal(session.transferFrameworkReason, TRANSFER_FRAMEWORK_REASON.EVIDENCE);
    assert.equal(session.studentExplanation, STUDENT_EXPLANATION[PURPOSE.TRANSFER]);
  });
  result.sessions.filter((session) => session.purpose !== PURPOSE.TRANSFER)
    .forEach((session) => assert.equal(session.context, 'course'));
});

test('on "Auto", the student\'s goal chooses the format of a transfer slot', () => {
  const result = week({ ccmrPlan: plan(['act']), teacherFramework: 'auto' });
  assert.ok(transfer(result).length > 0);
  transfer(result).forEach((session) => {
    assert.equal(session.context, 'act');
    assert.equal(session.transferFrameworkReason, TRANSFER_FRAMEWORK_REASON.GOAL);
    assert.equal(session.studentExplanation, 'You are preparing for the ACT, so this practice uses its format.');
  });
});

test('within 28 days of the test, that test\'s format comes first', () => {
  const gaps = profileWithGaps(['digitalSAT', 'act']);
  // ACT is a goal AND shows a gap; TSIA2 is the dated test.
  const soon = week({ profile: gaps, ccmrPlan: plan(['act', 'tsia2'], '2026-10-27', 'tsia2') });
  transfer(soon).forEach((session) => {
    assert.equal(session.context, 'tsia2');
    assert.equal(session.transferFrameworkReason, TRANSFER_FRAMEWORK_REASON.TEST_SOON);
    assert.equal(session.studentExplanation, 'Your TSIA2 is coming up, so this practice uses the TSIA2 format.');
  });
  // Forty days out the test is not close yet: the goal the evidence agrees with leads.
  const later = week({ profile: gaps, ccmrPlan: plan(['tsia2', 'act'], '2026-11-16', 'tsia2') });
  transfer(later).forEach((session) => {
    assert.equal(session.context, 'act');
    assert.equal(session.transferFrameworkReason, TRANSFER_FRAMEWORK_REASON.GOAL_WITH_GAP);
  });
  // Day 28 is still inside the window; day 29 is not.
  assert.equal(transfer(week({ profile: gaps, ccmrPlan: plan(['act', 'tsia2'], '2026-11-04', 'tsia2') }))[0].context, 'tsia2');
  assert.equal(transfer(week({ profile: gaps, ccmrPlan: plan(['act', 'tsia2'], '2026-11-05', 'tsia2') }))[0].context, 'act');
});

test('a test date that has passed no longer pulls the week toward it', () => {
  const result = week({ ccmrPlan: { ...plan(['act', 'tsia2']), testDate: '2026-10-01', testFramework: 'tsia2' } });
  transfer(result).forEach((session) => assert.equal(session.context, 'act'));
});

test('a teacher who picked a framework keeps it; the student\'s plan does not override the class setting', () => {
  const result = week({ ccmrPlan: plan(['act'], '2026-10-20', 'act'), teacherFramework: 'asvab' });
  transfer(result).forEach((session) => {
    assert.equal(session.context, 'asvab');
    assert.equal(session.transferFrameworkReason, TRANSFER_FRAMEWORK_REASON.TEACHER);
    assert.equal(session.studentExplanation, STUDENT_EXPLANATION[PURPOSE.TRANSFER]);
  });
  // Where the teacher's framework has no published practice for a skill, the
  // slot falls back to the evidence — never to the student's goal, which the
  // teacher's choice replaced.
  const preference = resolveTransferFrameworkPreference({
    teacherFramework: 'asvab', ccmrPlan: plan(['act'], '2026-10-20', 'act'), gapFrameworks: ['digitalSAT'], now: NOW,
  });
  assert.deepEqual(preference.order, [
    { framework: 'asvab', reason: TRANSFER_FRAMEWORK_REASON.TEACHER },
    { framework: 'digitalSAT', reason: TRANSFER_FRAMEWORK_REASON.EVIDENCE },
  ]);
  const partial = buildWeeklyRecommendations({
    rows,
    profile: profileWithGaps(['digitalSAT']),
    sessions: 6,
    honors: true,
    coverage: coverageFor({ digitalSAT: CODES, act: CODES, asvab: ['A.3A'] }),
    now: NOW,
    ccmrPlan: plan(['act']),
    teacherFramework: 'asvab',
  });
  const byCode = Object.fromEntries(partial.considered.filter((entry) => entry.purpose === PURPOSE.TRANSFER)
    .map((entry) => [entry.teksCode, entry.context]));
  assert.equal(byCode['A.3A'], 'asvab');
  assert.equal(byCode['A.5A'], 'digitalSAT');
});

test('a preference the bank cannot issue for that skill falls back to one it can', () => {
  // ACT practice is published for every skill except A.5A.
  const coverage = coverageFor({ digitalSAT: CODES, act: CODES.filter((code) => code !== 'A.5A') });
  const result = buildWeeklyRecommendations({
    rows, profile: profileWithGaps(['digitalSAT']), sessions: 6, honors: true, coverage, now: NOW, ccmrPlan: plan(['act']),
  });
  const byCode = Object.fromEntries(result.considered.filter((entry) => entry.purpose === PURPOSE.TRANSFER)
    .map((entry) => [entry.teksCode, entry.context]));
  assert.equal(byCode['A.5A'], 'digitalSAT', 'unpublished ACT practice is never offered');
  assert.equal(byCode['A.3A'], 'act');
});

test('a plan never adds transfer work: the same skills, the same purposes, the same count', () => {
  // SAT practice exists for two skills only, so only those two are transfer
  // work. ACT exists for everything — a plan that let ACT decide WHETHER a
  // skill is transfer work would turn the other four into transfer sessions.
  const coverage = coverageFor({ digitalSAT: ['A.5A', 'A.3A'], act: CODES, tsia2: CODES });
  for (const honors of [true, false]) {
    for (const sessions of [3, 4, 6]) {
      const base = { rows, profile: profileWithGaps(['digitalSAT']), sessions, honors, coverage, now: NOW };
      const without = buildWeeklyRecommendations(base);
      for (const ccmrPlan of [plan(['act']), plan(['tsia2', 'act'], '2026-10-20', 'tsia2')]) {
        const withPlan = buildWeeklyRecommendations({ ...base, ccmrPlan, teacherFramework: 'auto' });
        assert.deepEqual(shape(withPlan), shape(without), `honors=${honors} sessions=${sessions}`);
        assert.equal(transfer(withPlan).length, transfer(without).length);
        assert.deepEqual(
          withPlan.considered.filter((entry) => entry.purpose === PURPOSE.TRANSFER).map((entry) => entry.teksCode),
          without.considered.filter((entry) => entry.purpose === PURPOSE.TRANSFER).map((entry) => entry.teksCode),
        );
      }
    }
  }
});

test('when the teacher expects no CCMR work, a test next week still adds none', () => {
  const result = week({ allowTransfer: false, ccmrPlan: plan(['act'], '2026-10-12', 'act') });
  assert.equal(transfer(result).length, 0);
  assert.equal(result.considered.filter((entry) => entry.purpose === PURPOSE.TRANSFER).length, 0);
});

test('a student with no transfer gap gets no transfer slot from a plan alone', () => {
  const result = week({ profile: profileWithGaps([]), ccmrPlan: plan(['act'], '2026-10-12', 'act') });
  assert.equal(result.considered.filter((entry) => entry.purpose === PURPOSE.TRANSFER).length, 0);
});

test('the preference order is explicit and explainable', () => {
  const preference = resolveTransferFrameworkPreference({
    ccmrPlan: plan(['asvab', 'act', 'tsia2'], '2026-10-20', 'tsia2'),
    gapFrameworks: ['digitalSAT', 'act'],
    now: NOW,
  });
  assert.deepEqual(preference.order, [
    { framework: 'tsia2', reason: TRANSFER_FRAMEWORK_REASON.TEST_SOON },
    { framework: 'act', reason: TRANSFER_FRAMEWORK_REASON.GOAL_WITH_GAP },
    { framework: 'asvab', reason: TRANSFER_FRAMEWORK_REASON.GOAL },
    { framework: 'digitalSAT', reason: TRANSFER_FRAMEWORK_REASON.EVIDENCE },
  ]);
  assert.equal(preference.proximity.daysUntil, 13);
  assert.equal(chooseTransferFramework({ preference: { order: [] }, teksCode: 'A.5A', evidenceFramework: 'act' }).framework, 'act');
  assert.equal(chooseTransferFramework({ preference: { order: [] }, teksCode: 'A.5A' }), null);
  assert.equal(transferExplanationFor({ framework: 'act', reason: TRANSFER_FRAMEWORK_REASON.EVIDENCE }), null);
  assert.equal(transferExplanationFor({ framework: 'nope', reason: TRANSFER_FRAMEWORK_REASON.GOAL }), null);
});

test('end to end: the weekly goal\'s transfer slots and their swap options share the plan\'s format', () => {
  const now = Date.parse('2026-09-15T15:00:00Z');
  const options = buildStudentPathOptions({ student: {}, assignments: [], courseId: 'algebra1', nowValue: now });
  const built = buildWeeklyPathPlan({
    options,
    courseId: 'algebra1',
    profile: profileWithGaps(['digitalSAT']),
    sessions: 4,
    honors: true,
    ccmrPlan: plan(['act'], '2026-10-01', 'act'),
    ccmrFramework: 'auto',
    now,
  });
  const goal = buildWeeklyGoal({ plan: built, config: { ccmrExpectation: 'recommended' }, honors: true, courseId: 'algebra1', now });
  const transferSlots = goal.sessions.filter((session) => session.purpose === PURPOSE.TRANSFER);
  assert.ok(transferSlots.length > 0, 'an Honors week with a transfer gap holds transfer work');
  transferSlots.forEach((session) => {
    assert.equal(session.context, 'act');
    assert.match(session.studentExplanation, /ACT is coming up/);
    session.alternatives.forEach((alternative) => assert.equal(alternative.context, 'act',
      'swapping the skill must not silently swap the test format back'));
  });
});
