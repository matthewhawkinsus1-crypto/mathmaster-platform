import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditRetestInstanceReuse,
  buildSecureIssuancePlan,
  nextPlanEntry,
  planRequiresLiveGeneration,
  planSeedKey,
} from '../../functions/shared/testCycleIssuance.mjs';
import {
  blueprintEquivalenceSignature,
  describeFamily,
  targetFamilyCoverage,
} from '../../functions/shared/testCycleBlueprint.mjs';

/*
 * INDIVIDUALIZED SECURE TESTS, WITHOUT A LIVE MODEL IN THE ROOM.
 *
 * Two claims are made about secure delivery and both are checked here rather
 * than asserted in prose:
 *
 *   1. Two students get DIFFERENT generated instances of the SAME test.
 *   2. Nothing about delivery needs a live AI call.
 */

const family = (id, { generative = true } = {}) => ({
  id,
  ...(generative ? { generator: { parameters: { a: { min: 1, max: 9 } } } } : {}),
});

const BLUEPRINT = {
  blueprintId: 'unit3',
  version: 2,
  title: 'Unit 3 Test',
  targets: [
    { targetId: 't1', alignmentKey: 'texas:A.5A', dok: 2, difficultyBand: 3, questionCount: 3, weight: 2, anchor: true, familyIds: ['f1', 'f2', 'f3', 'f4', 'f5'] },
    { targetId: 't2', alignmentKey: 'texas:A.7C', dok: 3, difficultyBand: 4, questionCount: 2, anchor: true, familyIds: ['g1', 'g2', 'g3', 'g4'] },
    { targetId: 't3', alignmentKey: 'texas:A.9B', dok: 2, difficultyBand: 2, questionCount: 2, familyIds: ['h1', 'h2', 'h3', 'h4'] },
  ],
};
const FAMILIES = ['f1', 'f2', 'f3', 'f4', 'f5', 'g1', 'g2', 'g3', 'g4', 'h1', 'h2', 'h3', 'h4'].map((id) => family(id));

const planFor = (studentId, overrides = {}) => buildSecureIssuancePlan({
  blueprint: BLUEPRINT, families: FAMILIES, studentId, assignmentId: 'A1', ...overrides,
});

test('two students receive different generated instances of the same blueprint', () => {
  const a = planFor('STUDENT_A');
  const b = planFor('STUDENT_B');

  assert.equal(a.totalQuestions, 7);
  assert.equal(b.totalQuestions, 7);
  // Different draws: at least one slot differs in family or in seed.
  const differs = a.entries.some((entry, index) => (
    entry.familyId !== b.entries[index].familyId || entry.seedKey !== b.entries[index].seedKey
  ));
  assert.ok(differs, 'two students must not sit byte-identical secure tests');
  // No seed is shared, so no two students can be handed identical numbers.
  const sharedSeeds = a.entries.map((entry) => entry.seedKey)
    .filter((seed) => b.entries.some((entry) => entry.seedKey === seed));
  assert.deepEqual(sharedSeeds, []);
});

test('blueprint equivalence survives the individualization', () => {
  const a = planFor('STUDENT_A');
  const b = planFor('STUDENT_B');
  // What the plan may NOT change: what is assessed, at what depth, at what
  // difficulty, in what representation, with what weight.
  const signature = (plan) => plan.entries.map((entry) => [
    entry.alignmentKey, `dok${entry.dok}`, `band${entry.difficultyBand}`, entry.representation,
    entry.toolId || 'noTool', `w${entry.weight}`, entry.anchor ? 'anchor' : 'targeted',
  ].join('|'));
  assert.deepEqual(signature(a), signature(b));
  assert.deepEqual(signature(a), blueprintEquivalenceSignature(BLUEPRINT));
});

test('no live generation is required during secure issuance', () => {
  const plan = planFor('STUDENT_A');
  // Every slot already names an approved family and a concrete seed, so
  // issuance has nothing left to decide and nothing to ask a model.
  assert.equal(planRequiresLiveGeneration(plan), false);
  assert.equal(plan.requiresLiveGeneration, false);
  assert.deepEqual(plan.unfilledSlots, []);
  for (const entry of plan.entries) {
    assert.ok(entry.familyId, 'every slot names a family before the student starts');
    assert.ok(entry.seedKey, 'every slot names a seed before the student starts');
  }
});

test('an incomplete plan is the one thing that would require live generation, and it is reported', () => {
  const plan = buildSecureIssuancePlan({
    blueprint: BLUEPRINT,
    families: [family('f1')],
    studentId: 'STUDENT_A',
    assignmentId: 'A1',
  });
  assert.ok(plan.unfilledSlots.length > 0);
  assert.equal(planRequiresLiveGeneration(plan), true, 'preflight must refuse to publish this');
});

test('the plan is deterministic, so it can be audited and re-derived', () => {
  assert.deepEqual(planFor('STUDENT_A'), planFor('STUDENT_A'));
  assert.equal(
    planSeedKey({ assignmentId: 'A1', blueprintId: 'unit3', blueprintVersion: 2, stage: 'test', studentId: 'STUDENT_A', attempt: 1 }),
    planFor('STUDENT_A').planId,
  );
});

test('a reset secure session draws a genuinely different plan', () => {
  const first = planFor('STUDENT_A', { attempt: 1 });
  const second = planFor('STUDENT_A', { attempt: 2 });
  assert.notEqual(first.planId, second.planId);
  const shared = first.entries.map((entry) => entry.seedKey)
    .filter((seed) => second.entries.some((entry) => entry.seedKey === seed));
  assert.deepEqual(shared, [], 'a reset must not hand back the questions the student already saw');
});

test('a retest never reuses the original question instances', () => {
  const testPlan = planFor('STUDENT_A');
  const issuedTest = testPlan.entries.map((entry, index) => ({ ...entry, questionInstanceId: `examq_${index}` }));
  const retestPlan = planFor('STUDENT_A', {
    stage: 'retest',
    avoidFamilyIds: issuedTest.map((entry) => entry.familyId),
    avoidInstanceIds: issuedTest.map((entry) => entry.questionInstanceId),
  });

  const audit = auditRetestInstanceReuse(retestPlan, issuedTest);
  assert.deepEqual(audit.violations, []);
  assert.equal(audit.clean, true);

  // No reused seed means no reused generated instance, even where the family
  // had to repeat.
  for (const entry of retestPlan.entries) {
    assert.ok(!issuedTest.some((original) => original.seedKey === entry.seedKey));
  }
  assert.deepEqual(retestPlan.forbiddenInstanceIds, issuedTest.map((entry) => entry.questionInstanceId));
});

test('family reuse is avoided while parallel families remain, and labelled when it cannot be', () => {
  const testPlan = planFor('STUDENT_A');
  const retestPlan = planFor('STUDENT_A', {
    stage: 'retest',
    avoidFamilyIds: testPlan.entries.map((entry) => entry.familyId),
  });
  for (const entry of retestPlan.entries) {
    const reused = testPlan.entries.some((original) => original.familyId === entry.familyId);
    // Either it is a family the student has not met, or the plan says out loud
    // that it is minting a fresh parallel variant of one they have.
    assert.ok(!reused || entry.freshParallelVariant === true);
  }

  // With only one family available, reuse is mathematically necessary — and a
  // generative family can still produce a genuinely fresh variant.
  const single = buildSecureIssuancePlan({
    blueprint: { blueprintId: 'b', targets: [{ targetId: 't', alignmentKey: 'texas:A.5A', questionCount: 1, familyIds: ['only'] }] },
    families: [family('only')],
    studentId: 'STUDENT_A',
    assignmentId: 'A1',
    stage: 'retest',
    avoidFamilyIds: ['only'],
  });
  assert.equal(single.entries[0].familyId, 'only');
  assert.equal(single.entries[0].freshParallelVariant, true);
});

test('a family that cannot vary is not treated as parallel coverage', () => {
  assert.equal(describeFamily(family('fixed', { generative: false })).generative, false);
  assert.equal(describeFamily(family('varies')).generative, true);

  const coverage = targetFamilyCoverage(
    { blueprintId: 'b', targets: [{ targetId: 't', alignmentKey: 'texas:A.5A', questionCount: 1, familyIds: ['fixed'] }] },
    [family('fixed', { generative: false })],
  );
  assert.equal(coverage[0].sufficientForTest, true);
  assert.equal(coverage[0].sufficientForRetest, false, 'one fixed family cannot supply a fresh retest item');
});

test('questions are served in blueprint order, one at a time', () => {
  const plan = planFor('STUDENT_A');
  assert.equal(nextPlanEntry(plan, []).slotId, plan.entries[0].slotId);
  assert.equal(nextPlanEntry(plan, [plan.entries[0].slotId]).slotId, plan.entries[1].slotId);
  assert.equal(nextPlanEntry(plan, plan.entries.map((entry) => entry.slotId)), null);
});
