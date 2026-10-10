/*
 * TARGETED RECOVERY PRACTICE (student push, job J; job A's wave-2 note).
 *
 * Recovery Practice is chosen by the student's STORED, server-trusted
 * misconception codes (functions/shared/recoveryMisconceptionTargeting.mjs):
 * the questions they made a diagnosed error on lead the rotation, and within
 * a family whose classifier models that error the item is a version in which
 * the error is visible. Proven through the same calls the server action
 * makes:
 *
 *   - only trusted evidence of THIS assignment and section counts (a bare
 *     code list, another assignment, another section's question: ignored);
 *   - the targeted item is never a copy of a question the student has seen;
 *   - it is a pin the server accepts and grades exactly like any other;
 *   - with no evidence, Practice is dealt exactly as before;
 *   - the gates (eligibility, mastery, coverage) are unchanged;
 *   - the server reads the evidence and the runner shows the server's deal.
 *
 * Mutation-checked (each went red, then was restored):
 *   - orderSlotsForFocus returned the slots unchanged → "a diagnosed question
 *     leads the rotation" fails;
 *   - the candidate loop in buildRecoveryPracticeItem was removed → "the
 *     dealt version shows the student's error" fails (students whose own
 *     version hides it);
 *   - recoveryMisconceptionFocus skipped the trust gate (read
 *     performance.misconceptionCodes) → "only trusted evidence counts" fails;
 *   - the runner's settle() ignored the server item → the runner contract fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { getSectionVariantMode } from '../../src/assignmentLifecycle.js';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { RECOVERY_ACTION, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { buildRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryPlan.mjs';
import { MISCONCEPTION_EVIDENCE_SOURCE, MISCONCEPTION_REGISTRY_VERSION } from '../../functions/shared/misconceptionCodes.mjs';
import { gradeFamilyInstanceResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  instanceExposesMisconception,
  orderSlotsForFocus,
  recoveryMisconceptionFocus,
} from '../../functions/shared/recoveryMisconceptionTargeting.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');

/** A stored V5 document that passes Pre-Flight (as questionGenerationPreflight.test.mjs). */
const publish = (document) => {
  const model = buildAssignmentV5PreflightModel(document, { classSize: 30 });
  assert.equal(model.isValid, true, model.errors.join('\n'));
  return document.sections;
};

const NOW = Date.parse('2026-10-06T15:00:00Z');
const CLASS = 'period-3';
const ROSTER = Array.from({ length: 28 }, (_, index) => `student-${String(index + 1).padStart(2, '0')}`);

// The repository's Question Family Recovery sample, with a slope question
// added to its DOL (two-step equation, system, slope).
const sample = JSON.parse(read('SAMPLE_QUESTION_FAMILY_RECOVERY.json'));
const slopeSlot = sample.sections.find((section) => section.role === 'classwork').questions.find((question) => question.questionId === 'classwork-slope');
sample.sections.find((section) => section.role === 'dol').questions.push({ ...slopeSlot, questionId: 'dol-slope' });

const lesson = {
  id: 'asg-targeted-recovery',
  schemaVersion: 5,
  title: 'Targeted Recovery',
  assignedClassIds: [CLASS],
  dueAt: '2026-10-09T23:59:00-05:00',
  lateDueAt: '2026-10-16T23:59:00-05:00',
  warmup: { instructionDate: '2026-10-05' },
  dol: { instructionDate: '2026-10-05' },
  variantPolicy: sample.variantPolicy,
  gradingPolicy: sample.gradingPolicy,
  sections: publish(sample),
};
lesson.generationSeats = { byClassId: { [CLASS]: planSeatAdditions({ assignment: lesson, classId: CLASS, studentIds: ROSTER }) } };

const questions = getStoredAssignmentQuestions(lesson);
const dolEntries = questions.map((question, storageIndex) => ({ storageIndex, question })).filter((entry) => entry.question.activityRole === 'dol');
const SLOPE_INDEX = dolEntries.find((entry) => entry.question.questionId === 'dol-slope').storageIndex;
const TWO_STEP_INDEX = dolEntries.find((entry) => entry.question.questionId === 'dol-two-step').storageIndex;
const tracker = Object.fromEntries(questions.map((question, index) => [index, {
  status: question.activityRole === 'dol' ? 'expired' : 'correct', attemptCount: 1, totalAttempts: 1, variantIndex: 0,
}]));

/** A stored attempt evidence event, as ingestion writes it (attemptEvidenceEvent.mjs). */
const attemptEvent = ({ assignmentId = lesson.id, questionIndex, code, classifier, occurredAt = NOW - 86_400_000, trusted = true }) => ({
  source: { kind: 'assignment', assignmentId, questionIndex },
  occurredAt,
  performance: trusted ? {
    misconceptionCodes: [code],
    misconceptionEvidence: {
      source: MISCONCEPTION_EVIDENCE_SOURCE,
      registryVersion: MISCONCEPTION_REGISTRY_VERSION,
      classifier,
      classifierVersion: 1,
      findings: [{ code, codeVersion: 1, parts: [] }],
    },
  } : { misconceptionCodes: [code] },
});
const SLOPE_CLASSIFIER = 'family:linear.slopeFromPoints@1';
const slopeMiss = (overrides = {}) => attemptEvent({ questionIndex: SLOPE_INDEX, code: 'slope-run-over-rise', classifier: SLOPE_CLASSIFIER, ...overrides });

const contextFor = ({ studentId, record = null, misconceptionRecords = null }) => {
  const original = splitGradesBySection({ tracker, assignment: lesson }).dol;
  return buildSectionRecoveryContext({
    assignment: lesson,
    section: 'dol',
    sectionEntries: dolEntries,
    questions,
    tracker,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted, total: original.total },
    record,
    studentId,
    classId: CLASS,
    classPeriod: 'Period 3',
    supportEvents: [],
    sectionModeFor: (role) => getSectionVariantMode(lesson, role),
    misconceptionRecords,
    nowValue: NOW,
  });
};

const valuesOf = (context, item) => reproduceFamilyQuestionFromPin({
  question: context.questionsByIndex[item.storageIndex],
  assignmentId: lesson.id,
  storageIndex: item.storageIndex,
  pin: item.pin,
});

test('only trusted evidence of this assignment and this section counts, most recent first', () => {
  const focus = recoveryMisconceptionFocus({
    records: [
      slopeMiss(),
      slopeMiss({ code: 'slope-sign-reversed', occurredAt: NOW }),
      // A bare code list (a browser could write one): not evidence.
      attemptEvent({ questionIndex: TWO_STEP_INDEX, code: 'inverse-operation-sign', classifier: 'family:linear.twoStepEquation@1', trusted: false }),
      // Another assignment.
      slopeMiss({ assignmentId: 'another-assignment', code: 'slope-sign-reversed' }),
      // A question outside the DOL.
      attemptEvent({ questionIndex: 0, code: 'intercepts-swapped', classifier: 'family:functions.identifyIntercepts@1' }),
      // A Recovery record of the other section.
      { ...slopeMiss({ code: 'slope-sign-reversed' }), source: { kind: 'recoveryPractice', assignmentId: lesson.id, section: 'warmup', storageIndex: TWO_STEP_INDEX } },
      // A forged classifier/code pairing is refused by the trust gate.
      attemptEvent({ questionIndex: TWO_STEP_INDEX, code: 'vertex-x-sign-reversed', classifier: SLOPE_CLASSIFIER }),
    ],
    assignmentId: lesson.id,
    section: 'dol',
    sectionStorageIndices: dolEntries.map((entry) => entry.storageIndex),
  });
  assert.deepEqual(focus, { [SLOPE_INDEX]: ['slope-sign-reversed', 'slope-run-over-rise'] });
});

test('a diagnosed question leads the Practice rotation; every ready question still follows', () => {
  const plain = contextFor({ studentId: 'student-07' });
  const targeted = contextFor({ studentId: 'student-07', misconceptionRecords: [slopeMiss()] });
  const slots = plain.readiness.readySlots.filter((slot) => slot.ready);
  assert.notEqual(slots[0].storageIndex, SLOPE_INDEX, 'untargeted, the slope question is not first');
  assert.equal(nextRecoveryPracticeItem(plain).storageIndex, slots[0].storageIndex);
  assert.equal(nextRecoveryPracticeItem(targeted).storageIndex, SLOPE_INDEX, 'targeted, the question with the diagnosed error is first');
  const ordered = orderSlotsForFocus(slots, targeted.misconceptionFocus);
  assert.deepEqual(ordered.map((slot) => slot.storageIndex).sort(), slots.map((slot) => slot.storageIndex).sort(), 'the same questions: coverage is unchanged');
  // The gates are the same either way.
  assert.deepEqual(targeted.eligibility, plain.eligibility);
  assert.deepEqual(targeted.mastery, plain.mastery);
  assert.deepEqual(targeted.requiredCoverage, plain.requiredCoverage);
  assert.deepEqual(targeted.seenFingerprints, plain.seenFingerprints);
});

test('the dealt version shows the student\'s error, is never a version they have seen, and is a pin the server accepts', () => {
  for (const studentId of ROSTER) {
    const targeted = contextFor({ studentId, misconceptionRecords: [slopeMiss()] });
    const item = nextRecoveryPracticeItem(targeted);
    assert.equal(item.storageIndex, SLOPE_INDEX);
    assert.equal(targeted.seenFingerprints.includes(item.pin.fingerprint), false, `${studentId}: never a copy of a question already shown`);
    const replayed = valuesOf(targeted, item);
    assert.equal(replayed.error ?? null, null);
    const { rise, run } = replayed.instance.values;
    // Independent check of "visible": run/rise differs from rise/run, from its opposite, and from −run/rise.
    const slope = rise / run;
    assert.ok(rise !== 0 && Math.abs(rise) !== Math.abs(run) && run / rise !== slope, `${studentId}: the version makes run-over-rise visible (rise ${rise}, run ${run})`);
    assert.equal(instanceExposesMisconception({ familyKey: 'linear.slopeFromPoints@1', values: replayed.instance.values, codes: ['slope-run-over-rise'] }), true);

    // The server accepts and grades the targeted pin like any other.
    const result = runSectionRecoveryAction({
      context: targeted,
      action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: { kind: 'fields', fields: [{ id: 'slope', value: String(slope) }] } },
      at: NOW,
    });
    assert.equal(typeof result.response.isCorrect, 'boolean');
    const graded = gradeFamilyInstanceResponse({ question: replayed.question, response: { kind: 'fields', fields: [{ id: 'slope', value: String(slope) }] } });
    assert.equal(result.response.isCorrect, graded.isCorrect === true, 'graded exactly as the grader grades it');
    // The next item comes back from the server, and is not this one.
    assert.ok(result.response.nextPracticeItem?.pin?.fingerprint);
    assert.notEqual(result.response.nextPracticeItem.pin.fingerprint, item.pin.fingerprint);
  }
});

test('a student whose own next version hides the error gets one that shows it', () => {
  // The slope question alone, for every student and the first 40 Practice
  // positions: wherever the untargeted version has |rise| = |run| (run over
  // rise would look right), the targeted deal is a different, unseen version
  // that shows the error.
  let replaced = 0;
  let positions = 0;
  for (const studentId of ROSTER) {
    const context = contextFor({ studentId });
    const slopeSlots = context.readiness.readySlots.filter((slot) => slot.ready && slot.storageIndex === SLOPE_INDEX);
    for (let practiceIndex = 0; practiceIndex < 40; practiceIndex += 1) {
      const args = {
        assignmentId: lesson.id,
        section: 'dol',
        readySlots: slopeSlots,
        questionsByIndex: context.questionsByIndex,
        practiceIndex,
        seatInfo: context.seatInfo,
        seenFingerprints: context.seenFingerprints,
      };
      const plain = buildRecoveryPracticeItem(args);
      const targeted = buildRecoveryPracticeItem({ ...args, misconceptionFocus: { [SLOPE_INDEX]: ['slope-run-over-rise'] } });
      if (plain.error || targeted.error) continue;
      positions += 1;
      const before = plain.question.familyInstance ? valuesOf(context, plain).instance.values : null;
      const after = valuesOf(context, targeted).instance.values;
      assert.equal(context.seenFingerprints.includes(targeted.pin.fingerprint), false);
      assert.notEqual(Math.abs(after.rise), Math.abs(after.run), `${studentId} #${practiceIndex}: the dealt version shows the error`);
      if (before && Math.abs(before.rise) === Math.abs(before.run)) {
        assert.notEqual(targeted.pin.fingerprint, plain.pin.fingerprint);
        replaced += 1;
      } else {
        assert.equal(targeted.pin.fingerprint, plain.pin.fingerprint, 'a version that already shows the error is kept');
      }
    }
  }
  assert.ok(positions > 500);
  assert.ok(replaced > 0, `versions that hide the error were replaced (${replaced} of ${positions})`);
});

test('with no stored evidence, Practice is dealt exactly as before', () => {
  for (const studentId of ROSTER.slice(0, 6)) {
    const before = contextFor({ studentId });
    const empty = contextFor({ studentId, misconceptionRecords: [] });
    assert.deepEqual(nextRecoveryPracticeItem(empty), nextRecoveryPracticeItem(before));
  }
});

test('the server reads the evidence and passes it in; the runner shows the server\'s deal', () => {
  const index = executableSource(read('functions/index.js'));
  const callable = region(index, 'exports.advanceSectionRecovery = onCall', 'exports.resolveHeldSectionRecovery');
  assert.match(callable, /const misconceptionRecords = RECOVERY_ACTIONS_WITH_TARGETING\.has\(action\)\s*\?\s*await readRecoveryMisconceptionRecords\(/);
  assert.match(callable, /buildSectionRecoveryContext\(\{[\s\S]*?\n\s*misconceptionRecords,\n[\s\S]*?\}\);/);
  const reader = region(index, 'async function readRecoveryMisconceptionRecords', '\n}\n');
  assert.match(reader, /collection\("evidenceEvents"\)\.where\("source\.assignmentId", "==", assignmentId\)/);
  assert.match(reader, /collection\(recoveryEvidenceCollection\)\.where\("source\.assignmentId", "==", assignmentId\)/);
  assert.match(reader, /catch \(error\)[\s\S]*return null;/, 'a failed read deals untargeted Practice');

  const runner = executableSource(read('src/components/student/SectionRecoveryRunner.jsx'));
  assert.match(runner, /import \{[^}]*\bfetchSectionRecoveryStatus\b[^}]*\} from '\.\.\/\.\.\/services\/sectionRecoveryService\.js';/);
  const practice = region(runner, 'function PracticeRunner(', 'function AssessmentRunner(');
  assert.match(practice, /fetchSectionRecoveryStatus\(\{ assignmentId: assignment\.id, section: entry\.section \}\)\s*\.then\(\(status\) => settle\(status\?\.nextPracticeItem\)\)/);
  assert.match(practice, /setItem\(dealt \|\| entry\.nextPracticeItem \|\| null\);/);
  assert.match(practice, /nextDealtRef\.current = dealtItem\(result\?\.nextPracticeItem\);/);
  assert.match(practice, /!dealing && !serverDealt && !outcome/, 'the record does not replace a server-dealt item');
  // With no next item on the record there is nothing to deal: the empty
  // state shows at once, never after a wait on the callable (CI on #464:
  // a hanging callable hid "no new practice questions left").
  assert.match(practice, /useState\(Boolean\(entry\.nextPracticeItem\)\)/);
  assert.match(practice, /if \(!entry\.nextPracticeItem\) \{ settle\(null\); return undefined; \}/);
});
