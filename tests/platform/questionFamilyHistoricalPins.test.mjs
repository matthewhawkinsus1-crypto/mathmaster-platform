/*
 * EVERY QUESTION FAMILY VERSION THAT HAS SHIPPED STILL PRODUCES WHAT IT DID.
 *
 * A delivery pin names a family instance by (family, version, slot, allocation
 * index, fingerprint), and every graded attempt, Recovery plan and canonical
 * record refers to one. A family version is therefore frozen the day it
 * ships: if the same slot and seat ever produced a different instance, an
 * authoritative pin would stop replaying (PR #430 contains that failure; it
 * must never be caused).
 *
 * tests/platform/fixtures/questionFamilyGolden.json is the record, written
 * from main at 9396a77 — before linear.multiStepEquation@2,
 * linear.twoStepEquation@2 and systems.algebraic2x2@1 existed — by
 * scripts/capture-question-family-golden.mjs. This suite recomputes it from
 * the current build and requires byte equality, then replays every recorded
 * pin through the three code paths that replay pins in production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { reproduceFamilyQuestionFromPin, resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { resolveFamilyQuestionForGrading } from '../../functions/shared/questionFamilyGrading.mjs';
import { planSeatAdditions, resolveGenerationAllocation, resolveLearnerSeat } from '../../functions/shared/questionGenerationIdentity.mjs';
import { rebuildFamilyQuestionFromPin } from '../../src/platform/generation/familyPinReplay.js';
import {
  GOLDEN_ASSIGNMENT_ID,
  GOLDEN_CLASS_ID,
  GOLDEN_STUDENTS,
  computeQuestionFamilyGoldenSnapshot,
  goldenSlotFor,
} from './helpers/questionFamilyGoldenSnapshot.mjs';

const golden = JSON.parse(readFileSync(new URL('./fixtures/questionFamilyGolden.json', import.meta.url), 'utf8'));
const recordedKeys = Object.keys(golden.families);

const familyFor = (key) => {
  const [id, version] = key.split('@');
  return getPlatformQuestionFamily(id, Number(version));
};

test('the record covers every family version that shipped before the special-case work', () => {
  assert.deepEqual(recordedKeys.sort(), [
    'absoluteValue.solveEquation@1',
    'functions.identifyIntercepts@1',
    'functions.identifyZeros@1',
    'linear.multiStepEquation@1',
    'linear.multipleRepresentations@1',
    'linear.representationSort@1',
    'linear.slopeFromPoints@1',
    'linear.twoStepEquation@1',
    'quadratics.identifyVertex@1',
    'systems.elimination@1',
    'systems.substitution@1',
  ]);
  recordedKeys.forEach((key) => assert.ok(familyFor(key), `${key} is still registered`));
});

test('every recorded family version produces byte-identical sequences, seat pins, built questions, Recovery pins and capacity', () => {
  // In fixture order, exactly as the capture computed it.
  const families = Object.keys(golden.families).map(familyFor);
  const current = computeQuestionFamilyGoldenSnapshot(families);
  Object.keys(golden.families).forEach((key) => {
    const recorded = golden.families[key];
    const now = current[key];
    assert.deepEqual(now.sequences, recorded.sequences, `${key}: the instance lists moved`);
    assert.deepEqual(now.support, recorded.support, `${key}: the reduce-complexity list moved`);
    assert.deepEqual(now.built, recorded.built, `${key}: a built question's bytes changed`);
    assert.deepEqual(now.recovery, recorded.recovery, `${key}: a Recovery pin moved`);
    assert.deepEqual(now.capacity, recorded.capacity, `${key}: the capacity Pre-Flight reports changed`);
    GOLDEN_STUDENTS.forEach((studentId) => {
      assert.deepEqual(now.seats[studentId], recorded.seats[studentId], `${key}: ${studentId}'s pins moved`);
    });
  });
});

test('every recorded pin replays: exact reproduction, the #430 rebuild, and the server\'s seat-verified grading resolver', () => {
  const families = Object.keys(golden.families).map(familyFor);
  const slots = families.map(goldenSlotFor);
  const assignment = {
    id: GOLDEN_ASSIGNMENT_ID,
    schemaVersion: 5,
    assignedClassIds: [GOLDEN_CLASS_ID],
    sections: [{ id: 'dol', role: 'dol', title: 'DOL', questions: slots }],
  };
  assignment.generationSeats = {
    version: 1,
    byClassId: { [GOLDEN_CLASS_ID]: planSeatAdditions({ assignment, classId: GOLDEN_CLASS_ID, studentIds: GOLDEN_STUDENTS }) },
  };
  let replayed = 0;
  Object.keys(golden.families).forEach((key, storageIndex) => {
    const question = slots[storageIndex];
    Object.entries(golden.families[key].seats).forEach(([studentId, pins]) => {
      pins.forEach((pin) => {
        const exact = reproduceFamilyQuestionFromPin({ question, assignmentId: GOLDEN_ASSIGNMENT_ID, storageIndex, pin });
        assert.equal(exact.error ?? null, null, `${key} ${studentId} v${pin.variant}: ${exact.error}`);
        assert.equal(exact.instance.fingerprint, pin.fingerprint);
        const rebuilt = rebuildFamilyQuestionFromPin({ question, assignmentId: GOLDEN_ASSIGNMENT_ID, storageIndex, pin });
        assert.equal(rebuilt?.instance.fingerprint, pin.fingerprint, `${key} ${studentId}: the #430 rebuild lands on the pin`);
        const grading = resolveFamilyQuestionForGrading({
          assignment,
          question,
          questionIndex: storageIndex,
          variantIndex: pin.variant,
          claimedDelivery: pin,
          studentId,
          classId: GOLDEN_CLASS_ID,
        });
        assert.equal(grading.reason, null, `${key} ${studentId} v${pin.variant}: the server refuses the pin (${grading.reason})`);
        assert.equal(grading.question.familyInstance.fingerprint, pin.fingerprint);
        replayed += 1;
      });
    });
    golden.families[key].recovery.flat().forEach((pin) => {
      const exact = reproduceFamilyQuestionFromPin({ question, assignmentId: GOLDEN_ASSIGNMENT_ID, storageIndex, pin });
      assert.equal(exact.instance?.fingerprint, pin.fingerprint, `${key}: a Recovery pin replays`);
      replayed += 1;
    });
  });
  assert.equal(replayed, recordedKeys.length * (GOLDEN_STUDENTS.length * 3 + 6));
});

test('an unpinned reference still means version 1, and lands on exactly the recorded pins', () => {
  const assignment = { id: GOLDEN_ASSIGNMENT_ID, assignedClassIds: [GOLDEN_CLASS_ID] };
  assignment.generationSeats = {
    version: 1,
    byClassId: { [GOLDEN_CLASS_ID]: planSeatAdditions({ assignment, classId: GOLDEN_CLASS_ID, studentIds: GOLDEN_STUDENTS }) },
  };
  for (const key of ['linear.twoStepEquation@1', 'linear.multiStepEquation@1', 'systems.elimination@1', 'systems.substitution@1']) {
    const family = familyFor(key);
    const unpinned = { ...goldenSlotFor(family), questionFamily: { id: family.id } };
    GOLDEN_STUDENTS.forEach((studentId) => {
      const seatInfo = resolveLearnerSeat({ assignment, studentId, classId: GOLDEN_CLASS_ID });
      const result = resolveFamilyQuestionInstance({
        question: unpinned,
        assignmentId: GOLDEN_ASSIGNMENT_ID,
        storageIndex: 0,
        allocation: resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo, variant: 0 }),
      });
      assert.equal(result.family.version, 1, `${key}: an unpinned slot never moves to a newer version`);
      assert.equal(result.delivery.fingerprint, golden.families[key].seats[studentId][0].fingerprint);
    });
  }
});
