import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPerformanceProfile } from '../../functions/shared/testCycleCorrections.mjs';
import {
  buildRetestBlueprint,
  resolveRetestQuestionCount,
  retestRigorIsPreserved,
} from '../../functions/shared/testCycleRetest.mjs';
import { buildSecureIssuancePlan } from '../../functions/shared/testCycleIssuance.mjs';
import { normalizeTestBlueprint } from '../../functions/shared/testCycleBlueprint.mjs';

/*
 * THE RETEST: ABOUT 70% WEAK SKILLS, ABOUT 30% ANCHOR COVERAGE.
 *
 * The anchor share is the part that is easy to lose and expensive to lose: it
 * is what stops a student replacing a comprehensive Test grade by passing three
 * questions about the one narrow skill they missed.
 */

const POLICY = { mode: 'testCycle' };

const BLUEPRINT = {
  blueprintId: 'unit3',
  title: 'Unit 3 Test',
  targets: [
    { targetId: 't1', alignmentKey: 'texas:A.5A', dok: 2, difficultyBand: 3, questionCount: 4, anchor: true, familyIds: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] },
    { targetId: 't2', alignmentKey: 'texas:A.7C', dok: 3, difficultyBand: 4, questionCount: 3, anchor: true, familyIds: ['g1', 'g2', 'g3', 'g4', 'g5'] },
    { targetId: 't3', alignmentKey: 'texas:A.9B', dok: 2, difficultyBand: 2, questionCount: 3, familyIds: ['h1', 'h2', 'h3', 'h4', 'h5'] },
  ],
};

const responsesWhere = (missedTargetIds) => normalizeTestBlueprint(BLUEPRINT).targets.flatMap((target) => (
  Array.from({ length: target.questionCount }, (unused, index) => ({
    targetId: target.targetId,
    slotId: `${target.targetId}#${index + 1}`,
    familyId: `${target.targetId}-fam-${index + 1}`,
    questionInstanceId: `${target.targetId}-inst-${index + 1}`,
    score: missedTargetIds.includes(target.targetId) ? 0 : 1,
    isCorrect: !missedTargetIds.includes(target.targetId),
  }))
));

const retestFor = (missedTargetIds, policy = POLICY) => buildRetestBlueprint({
  blueprint: BLUEPRINT,
  profile: buildPerformanceProfile({ blueprint: BLUEPRINT, responses: responsesWhere(missedTargetIds) }),
  policy,
});

test('the retest targets weak skills and still covers anchors', () => {
  const { blueprint, audit } = retestFor(['t3']);
  assert.ok(audit.targetedQuestionCount > 0, 'the missed skill is re-asked');
  assert.ok(audit.anchorQuestionCount > 0, 'and the rest of the test is still represented');
  assert.deepEqual(audit.targetedTargetIds, ['t3']);
  assert.deepEqual(audit.anchorTargetIds.sort(), ['t1', 't2']);
  // Roughly 70/30, allowing for rounding on a small test.
  assert.ok(Math.abs(audit.actualWeakShare - 0.7) <= 0.2, `weak share was ${audit.actualWeakShare}`);
  assert.ok(Math.abs(audit.actualAnchorShare - 0.3) <= 0.2, `anchor share was ${audit.actualAnchorShare}`);
  assert.equal(blueprint.totalQuestions, audit.questionCount);
});

test('one tiny missed skill cannot buy back a whole comprehensive Test grade', () => {
  // The failure this prevents: a retest that is only the one missed skill.
  const { audit } = retestFor(['t3']);
  assert.ok(audit.anchorQuestionCount >= 1, 'at least one anchor question, whatever rounding says');
  const targetedOnly = audit.targetedQuestionCount === audit.questionCount;
  assert.equal(targetedOnly, false);
});

test('the retest is shorter than or equal to the original Test by default', () => {
  const { audit } = retestFor(['t1', 't3']);
  assert.ok(audit.questionCount <= audit.originalQuestionCount, `${audit.questionCount} vs ${audit.originalQuestionCount}`);
  assert.equal(audit.shorterThanOriginal, true);
  assert.equal(resolveRetestQuestionCount({ originalTotal: 10, policy: POLICY }), 6);
});

test('a teacher can make the retest longer, but only by saying so', () => {
  const clamped = resolveRetestQuestionCount({ originalTotal: 10, policy: { mode: 'testCycle', retest: { questionCount: 20 } } });
  assert.equal(clamped, 10, 'a longer retest is clamped to the Test length unless explicitly allowed');
  const allowed = resolveRetestQuestionCount({
    originalTotal: 10,
    policy: { mode: 'testCycle', retest: { questionCount: 20, allowLongerThanTest: true } },
  });
  assert.equal(allowed, 20);
});

test('the retest preserves the original blueprint rigor', () => {
  const { blueprint } = retestFor(['t2', 't3']);
  const check = retestRigorIsPreserved(BLUEPRINT, blueprint);
  assert.deepEqual(check.violations, []);
  assert.equal(check.preserved, true);

  // Every retest target inherits the original DOK/difficulty/representation.
  const original = Object.fromEntries(normalizeTestBlueprint(BLUEPRINT).targets.map((target) => [target.targetId, target]));
  for (const target of blueprint.targets) {
    const source = original[target.sourceTargetId];
    assert.equal(target.dok, source.dok);
    assert.equal(target.difficultyBand, source.difficultyBand);
    assert.equal(target.representation, source.representation);
  }
});

test('a retest lowered in rigor is reported, not quietly accepted', () => {
  const easier = {
    blueprintId: 'unit3-retest',
    targets: [{ targetId: 'targeted-t2', sourceTargetId: 't2', alignmentKey: 'texas:A.7C', dok: 1, difficultyBand: 1, questionCount: 2, familyIds: ['g1'] }],
  };
  const check = retestRigorIsPreserved(BLUEPRINT, easier);
  assert.equal(check.preserved, false);
  assert.deepEqual(check.violations.map((violation) => violation.reason).sort(), ['difficulty_lowered', 'dok_lowered']);
});

test('the retest carries what the student already met, so issuance can avoid it', () => {
  const { audit } = retestFor(['t3']);
  assert.deepEqual(audit.avoidFamilyIds.sort(), ['t3-fam-1', 't3-fam-2', 't3-fam-3']);
  assert.deepEqual(audit.avoidInstanceIds.sort(), ['t3-inst-1', 't3-inst-2', 't3-inst-3']);
});

test('unseen families are offered first, so avoiding a repeat usually costs nothing', () => {
  const { blueprint } = retestFor(['t3']);
  const targeted = blueprint.targets.find((target) => target.sourceTargetId === 't3');
  // Nothing this student saw is at the front of the family list.
  assert.equal(targeted.familyIds[0], 'h1');
});

test('the generated retest issues a complete plan with no live generation', () => {
  const { blueprint, audit } = retestFor(['t1', 't3']);
  const families = [...new Set(blueprint.targets.flatMap((target) => target.familyIds))]
    .map((id) => ({ id, generator: { parameters: { a: { min: 1, max: 9 } } } }));
  const plan = buildSecureIssuancePlan({
    blueprint,
    families,
    studentId: 'S1',
    assignmentId: 'A1',
    stage: 'retest',
    avoidFamilyIds: audit.avoidFamilyIds,
    avoidInstanceIds: audit.avoidInstanceIds,
  });
  assert.deepEqual(plan.unfilledSlots, []);
  assert.equal(plan.requiresLiveGeneration, false);
  assert.equal(plan.totalQuestions, audit.questionCount);
  assert.equal(plan.stage, 'retest');
});

test('a student who missed nothing still gets an anchor-covered retest rather than an empty one', () => {
  const { audit } = retestFor([]);
  assert.ok(audit.questionCount > 0);
  assert.equal(audit.targetedQuestionCount, 0);
  assert.equal(audit.anchorQuestionCount, audit.questionCount);
});
