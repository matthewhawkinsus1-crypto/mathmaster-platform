/*
 * RECOVERY PRACTICE NEVER RUNS DRY WHILE A FRESH VERSION REMAINS.
 *
 * Recovery unlocks on 7 of the last 8 Practice questions right, so a student
 * who misses a few needs more than eight — and every one must be a version
 * they have never seen. On the Multiple Representations lesson's DOL (35
 * distinct "draining tank" versions) Practice stopped after about 17
 * questions: "There is no practice question to show right now", with the
 * Recovery still locked and more than a dozen versions never shown.
 *
 * The cause was the wrap rule in resolveFamilyQuestionInstance. Once a
 * student's requested index passed the end of the list, it RECONSTRUCTED their
 * earlier versions by replaying their earlier variants and excluded those.
 * Recovery had already passed the real history (every version shown, every
 * Practice item), so each replay — walked against that longer list — landed
 * on a version the student had NOT seen, and excluding them hid the rest of
 * the family. Recovery now says its history is complete, and the walk skips
 * exactly what was seen.
 *
 * Proven here through the same calls the student app and the
 * `advanceSectionRecovery` server action make, one Practice item at a time.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../src/platform/contract/assignmentSchemaV5.js';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { getSectionVariantMode } from '../../src/assignmentLifecycle.js';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { RECOVERY_ACTION, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { buildRecoveryAssessmentPlan } from '../../functions/shared/sectionRecoveryPlan.mjs';
import { reproduceFamilyQuestionFromPin, resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { RECOVERY_STATE } from '../../functions/shared/sectionRecoveryEligibility.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { correctLinearBoardResponse } from './helpers/linearMultipleRepresentationsResponses.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');

/** The teacher import + publish chain (App.jsx handleCreateAssignment). */
const publish = (text) => {
  const parsed = parseAssignmentBlueprintText(text);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), {});
  assert.equal(model.isValid, true);
  const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
  return rebuildV5SectionsFromQuestions(model.assignmentV5, questions);
};

const NOW = Date.parse('2026-10-06T15:00:00Z');
const CLASS = 'period-3';
const STUDENT = 'student-07';
const ROSTER = Array.from({ length: 28 }, (_, index) => `student-${String(index + 1).padStart(2, '0')}`);

// Taught Monday 10/5 (the Warm-Up and DOL are closed); the final submission
// date, which is the Recovery end date, is the next week.
const lesson = {
  id: 'asg-lmr-supply',
  schemaVersion: 5,
  title: 'Algebra I — Multiple Representations of Linear Equations',
  assignedClassIds: [CLASS],
  dueAt: '2026-10-09T23:59:00-05:00',
  lateDueAt: '2026-10-16T23:59:00-05:00',
  warmup: { instructionDate: '2026-10-05' },
  dol: { instructionDate: '2026-10-05' },
  sections: publish(read('docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json')),
};
lesson.generationSeats = { byClassId: { [CLASS]: planSeatAdditions({ assignment: lesson, classId: CLASS, studentIds: ROSTER }) } };

const questionsOf = (assignment) => getStoredAssignmentQuestions(assignment);
const entriesFor = (assignment, section) => questionsOf(assignment)
  .map((question, storageIndex) => ({ storageIndex, question }))
  .filter((entry) => entry.question.activityRole === section);

// Every question answered; the DOL board wrong. The student also asked for
// "New Question" three times on the candle board in Practice — the same
// story family as the DOL, so those versions count as seen too.
const trackerFor = (assignment, { practiceVariants = 3 } = {}) => Object.fromEntries(questionsOf(assignment).map((question, index) => {
  const missed = question.activityRole === 'dol' || question.activityRole === 'warmup';
  const variantIndex = question.questionId === 'lmr-pr-2' ? practiceVariants : 0;
  return [index, { status: missed ? 'expired' : 'correct', attemptCount: 1, totalAttempts: 1, variantIndex }];
}));

const contextFor = ({ assignment = lesson, section = 'dol', tracker = trackerFor(lesson), record = null, nowValue = NOW } = {}) => {
  const original = splitGradesBySection({ tracker, assignment })[section];
  return buildSectionRecoveryContext({
    assignment,
    section,
    sectionEntries: entriesFor(assignment, section),
    questions: questionsOf(assignment),
    tracker,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted, total: original.total },
    record,
    studentId: STUDENT,
    classId: CLASS,
    classPeriod: 'Period 3',
    supportEvents: [],
    sectionModeFor: (role) => getSectionVariantMode(assignment, role),
    nowValue,
  });
};

/** Every distinct version a question's family can produce (its fingerprints). */
const familyFingerprints = (assignment, storageIndex) => {
  const question = questionsOf(assignment)[storageIndex];
  const fingerprints = new Set();
  for (let index = 0; index < 2000; index += 1) {
    const result = resolveFamilyQuestionInstance({
      question,
      assignmentId: assignment.id,
      storageIndex,
      allocation: { seat: index, variant: 0, stride: 1, index, basis: 'preview' },
    });
    if (result.error || result.delivery.wrapped) break;
    fingerprints.add(result.delivery.fingerprint);
  }
  return fingerprints;
};

/**
 * A student practising until Practice has nothing left to give: each item the
 * browser deals is submitted to the server action, exactly as the runner does.
 * Every answer is a forfeit (recorded as incorrect), so mastery is never met
 * and Practice keeps going.
 */
const practiseUntilDry = ({ assignment = lesson, section = 'dol', tracker = trackerFor(lesson), limit = 120 } = {}) => {
  let record = null;
  const served = [];
  const seenAtStart = new Set(contextFor({ assignment, section, tracker }).seenFingerprints);
  for (let turn = 0; turn < limit; turn += 1) {
    const context = contextFor({ assignment, section, tracker, record });
    const item = nextRecoveryPracticeItem(context);
    if (!item) return { served, seenAtStart, record, lastContext: context };
    assert.equal(context.seenFingerprints.includes(item.pin.fingerprint), false, `item ${turn} is a version the student has not seen`);
    // The server rebuilds the question from the pin itself, exactly.
    const replayed = reproduceFamilyQuestionFromPin({
      question: context.questionsByIndex[item.storageIndex],
      assignmentId: assignment.id,
      storageIndex: item.storageIndex,
      pin: item.pin,
    });
    assert.equal(replayed.error ?? null, null, `item ${turn} replays from its pin`);
    const result = runSectionRecoveryAction({
      context,
      action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: item.pin, practiceIndex: item.practiceIndex, forfeit: true },
      at: NOW + turn * 60_000,
    });
    record = result.record;
    served.push(item.pin.fingerprint);
  }
  assert.fail('Practice never ran out');
  return null;
};

test('DOL Recovery Practice deals every version the student has not seen — not half of them', () => {
  const dolIndex = entriesFor(lesson, 'dol')[0].storageIndex;
  const family = familyFingerprints(lesson, dolIndex);
  assert.equal(family.size, 35, 'the draining-tank family has 35 distinct versions');

  const { served, seenAtStart } = practiseUntilDry();
  const seenInFamily = [...family].filter((fingerprint) => seenAtStart.has(fingerprint));
  assert.ok(seenInFamily.length >= 2, 'the original DOL and the candle Practice versions come out of the same family');
  assert.equal(new Set(served).size, served.length, 'no Practice question is ever repeated');
  served.forEach((fingerprint) => assert.ok(family.has(fingerprint)));
  assert.equal(
    served.length,
    family.size - seenInFamily.length,
    `Practice ran out after ${served.length} questions with ${family.size - seenInFamily.length} unseen versions in the family`,
  );
  assert.deepEqual(new Set([...served, ...seenInFamily]), family, 'when it runs out, the student really has seen every version');
});

/** The complete, correct board a student would submit for this version. */
const correctBoard = (question) => gradeToolWork({ toolId: 'representationBridge', question, work: correctLinearBoardResponse(question) }).toolResponse;

test('a student who struggles at first can still unlock the DOL Recovery — the server grades every board', () => {
  // Twelve misses, then seven complete boards right. Practice used to stop at
  // about seventeen questions, so the seventh right board was never dealt.
  let record = null;
  const tracker = trackerFor(lesson);
  for (let turn = 0; turn < 19; turn += 1) {
    const context = contextFor({ tracker, record });
    assert.equal(context.eligibility.state, RECOVERY_STATE.LOCKED, `still locked before question ${turn + 1}`);
    const item = nextRecoveryPracticeItem(context);
    assert.ok(item, `Practice question ${turn + 1} is available`);
    const { question } = reproduceFamilyQuestionFromPin({
      question: context.questionsByIndex[item.storageIndex],
      assignmentId: lesson.id,
      storageIndex: item.storageIndex,
      pin: item.pin,
    });
    const result = runSectionRecoveryAction({
      context,
      action: RECOVERY_ACTION.PRACTICE,
      payload: turn < 12
        ? { pin: item.pin, practiceIndex: item.practiceIndex, forfeit: true }
        : { pin: item.pin, practiceIndex: item.practiceIndex, response: correctBoard(question), supportUsage: {} },
      at: NOW + turn * 60_000,
    });
    assert.equal(result.response.isCorrect, turn >= 12, `question ${turn + 1} is marked by the server`);
    record = result.record;
  }
  assert.equal(record.status, 'unlocked', '7 of the last 8 right unlocks it');
  assert.equal(contextFor({ tracker, record }).eligibility.state, RECOVERY_STATE.UNLOCKED);
  assert.equal(new Set(record.practice.items.map((item) => item.key)).size, 19, 'nineteen different questions');
});

test('every Practice pin passes the server\'s ownership check, before and after the list wraps', () => {
  const { served, record } = practiseUntilDry();
  assert.ok(served.length > 20, 'the run reaches far past the point where requested indices wrap');
  // The server accepted every one (practiseUntilDry submits each), and its
  // record holds them all, in order, as distinct items.
  assert.deepEqual(record.practice.items.map((item) => item.key), served);
});

test('a Warm-Up Recovery from a small family gets three fresh questions for every student who has three left', () => {
  // One Warm-Up board from a story family with very few versions, so the
  // second and third Recovery questions request indices past the list's end
  // for nearly everyone in a class of 28.
  const small = {
    ...lesson,
    id: 'asg-small-warmup',
    sections: lesson.sections.map((section) => (section.role !== 'warmup' ? section : {
      ...section,
      questions: [{
        ...entriesFor(lesson, 'dol')[0].question,
        questionId: 'small-wu-1',
        activityRole: 'warmup',
        questionFamily: { id: 'linear.multipleRepresentations', version: 1, constraints: { given: 'scenario', rateRange: [2, 3], durationRange: [3, 6], startRange: [6, 18] } },
      }],
    })),
  };
  small.generationSeats = { byClassId: { [CLASS]: planSeatAdditions({ assignment: small, classId: CLASS, studentIds: ROSTER }) } };
  const warmupIndex = entriesFor(small, 'warmup')[0].storageIndex;
  const family = familyFingerprints(small, warmupIndex);
  assert.ok(family.size >= 4 && family.size < ROSTER.length, `a family smaller than the class (${family.size} versions)`);

  const tracker = trackerFor(small, { practiceVariants: 0 });
  let planned = 0;
  for (const studentId of ROSTER) {
    const original = splitGradesBySection({ tracker, assignment: small }).warmup;
    const context = buildSectionRecoveryContext({
      assignment: small,
      section: 'warmup',
      sectionEntries: entriesFor(small, 'warmup'),
      questions: questionsOf(small),
      tracker,
      sectionOriginal: { score: 0, attempted: original.attempted, total: original.total },
      studentId,
      classId: CLASS,
      supportEvents: [],
      sectionModeFor: (role) => getSectionVariantMode(small, role),
      nowValue: NOW,
    });
    const unseen = [...family].filter((fingerprint) => !context.seenFingerprints.includes(fingerprint));
    const plan = buildRecoveryAssessmentPlan({
      assignmentId: small.id,
      section: 'warmup',
      readySlots: context.readiness.readySlots,
      questionsByIndex: context.questionsByIndex,
      questionCount: 3,
      seatInfo: context.seatInfo,
      seenFingerprints: context.seenFingerprints,
    });
    if (unseen.length < 3) {
      // Honest, not stuck: there really are not three versions left.
      assert.equal(plan.error, 'all_instances_excluded', `${studentId}: only ${unseen.length} unseen`);
      continue;
    }
    assert.equal(plan.error, null, `${studentId}: ${unseen.length} versions unseen, and the plan failed (${plan.error})`);
    const fingerprints = plan.items.map((item) => item.pin.fingerprint);
    assert.equal(new Set(fingerprints).size, 3, `${studentId}: three different questions`);
    fingerprints.forEach((fingerprint) => assert.ok(unseen.includes(fingerprint), `${studentId}: none the student has seen`));
    planned += 1;
  }
  assert.ok(planned >= ROSTER.length - 2, `nearly every student had three versions left (${planned})`);
});

test('when there is truly nothing new left, the runner says who can help — not "nothing to show"', () => {
  const runner = componentSource('src/components/student/SectionRecoveryRunner.jsx');
  const empty = region(runner, 'data-recovery-practice-empty="true"', '</p>', 'empty Practice state');
  assert.match(empty, /no new practice questions left for this Recovery/);
  assert.match(empty, /Let your teacher know/);
  assert.doesNotMatch(executableSource(runner), /There is no practice question to show right now/);
});
