// EVERY TEACHER SURFACE COUNTS THE STUDENT'S OWN ITEMS.
//
// With a reduced-item-count accommodation, the items it omits are not this
// student's work: never a zero, never "missing", never "not attempted", never
// what keeps an assignment "in progress". The gradebook, Grade Export (TEAMS),
// the hub/drawer progress, the parent brief, Student Case Review, Recovery and
// the live monitor all read the same resolver (functions/shared/
// reducedWorkload.mjs) through the student's own `profile`. A student without
// the support is unchanged, byte for byte.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { studentOmittedIndices } from '../../functions/shared/reducedWorkload.mjs';
import { normalizeStudentProfile } from '../../src/studentSupport.js';
import { canonicalPresentedAssignmentGrade, canonicalPresentedSectionGrade } from '../../src/platform/grading/canonicalGradeProjection.js';
import { PROGRESS_STATE, studentAssignmentProgress } from '../../src/platform/teacher/assignmentProgress.js';
import { projectProgressBriefGrades } from '../../src/platform/teacher/parentContactCenter.js';
import { QUESTION_OUTCOME, analyzeAssignmentQuestions, summarizeQuestionOutcomes } from '../../src/platform/caseReview/attemptAnalysis.js';
import { projectSectionRecoveryForAssignment } from '../../src/platform/grading/sectionRecoveryGrades.js';
import { LIVE_FLAGS, classifyLiveStudent, countQuestionStates, encodeQuestionStates } from '../../src/livePresence.js';
import { WALKTHROUGH_STATUS, buildWalkthroughMonitor } from '../../src/platform/teacher/walkthroughMonitor.js';
import { buildTeacherAssignmentWorksheetModel } from '../../src/platform/resources/teacherAssignmentWorksheetExport.js';

const ID = 'reduced-item-count-same-rigor';
let n = 0;
const q = (standard, extra = {}) => { n += 1; return { questionId: `tq${n}`, type: 'multiAnswer', prompt: 'Find x.', answerFields: [{ id: 'a', answer: '1' }], standard, dok: 2, ...extra }; };
const lesson = () => ({
  id: 'T-LESSON',
  schemaVersion: 5,
  title: 'Synthetic',
  dueAt: '2026-10-08',
  sections: [
    { id: 'c', role: 'classwork', questions: Array.from({ length: 8 }, (_, i) => q(i % 2 ? 'A.5A' : 'A.5B')) },
    { id: 'p', role: 'practice', questions: Array.from({ length: 8 }, (_, i) => q(i % 2 ? 'A.5A' : 'A.5B')) },
    { id: 'd', role: 'dol', questions: [q('A.5A'), q('A.5A'), q('A.5B'), q('A.5B')] },
  ],
});
// Teacher roster rows carry the normalized profile (supportPlan passed through).
const reducedProfile = normalizeStudentProfile(buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17',
    accommodations: [{ id: ID, params: { itemReduction: { mode: 'percent', value: 25 } }, appliesTo: [] }],
    modifications: [],
  }],
  todayKey: '2026-10-01',
}), { nowValue: Date.parse('2026-10-01T15:00:00Z') });

const allIndices = (assignment) => assignment.sections.flatMap((section) => section.questions).map((_, index) => index);
const correct = (indices) => Object.fromEntries(indices.map((index) => [index, {
  status: 'correct', partialCredit: 100, bestPartialCredit: 100, attemptCount: 1, totalAttempts: 1, lastAttemptAt: '2026-10-05T15:00:00.000Z',
}]));

const setup = () => {
  const assignment = lesson();
  const omitted = studentOmittedIndices({ assignment, profile: reducedProfile });
  const required = allIndices(assignment).filter((index) => !omitted.has(index));
  const student = { id: 'S1', classId: 'C1', profile: reducedProfile, gradesByAssignment: { [assignment.id]: correct(required) } };
  return { assignment, omitted, required, student };
};

test('the gradebook and Grade Export grade the student\'s own items: all done is 100, not a zero per omitted item', () => {
  const { assignment, omitted, required, student } = setup();
  assert.equal(omitted.size, 5);
  assert.equal(canonicalPresentedAssignmentGrade({ student, assignment }), 100);
  assert.equal(canonicalPresentedSectionGrade({ student, assignment, sectionKey: 'classwork' }), 100);
  assert.equal(canonicalPresentedSectionGrade({ student, assignment, sectionKey: 'practice' }), 100);
  // The same records graded without the profile: the omitted items read as zeros.
  const unaware = { ...student, profile: {} };
  assert.ok(canonicalPresentedAssignmentGrade({ student: unaware, assignment }) < 100);
  // With a Practice Pass too: Practice excused, the rest still the student's own items.
  assert.equal(canonicalPresentedAssignmentGrade({ student, assignment, practicePassRedeemed: true }), 100);
  assert.equal(required.length, 15);
});

test('progress is complete when every required item is answered, and says "15 of 20"', () => {
  const { assignment, student } = setup();
  const progress = studentAssignmentProgress({ student, assignment });
  assert.equal(progress.state, PROGRESS_STATE.COMPLETE);
  assert.equal(progress.total, 15);
  assert.equal(progress.reducedFrom, 20);
  assert.equal(progress.attempted, 15);
});

test('a parent brief never lists an omitted item as missing or the assignment as incomplete', () => {
  const { assignment, student } = setup();
  const { omitted } = setup();
  const [row] = projectProgressBriefGrades({ student, assignments: [assignment] });
  assert.equal(row.status, 'complete');
  const practiceOmitted = [8, 9, 10, 11, 12, 13, 14, 15].filter((index) => omitted.has(index)).length;
  assert.ok(practiceOmitted > 0);
  assert.equal(row.sectionGrades.practice.total, 8 - practiceOmitted);
  assert.equal(row.sectionGrades.practice.reducedFrom, 8);
});

test('Student Case Review: an omitted item is "not required", never "not attempted" or "skipped"', () => {
  const { assignment, omitted, student } = setup();
  const { questions } = analyzeAssignmentQuestions({ assignment, student });
  questions.forEach((row) => {
    if (omitted.has(row.storageIndex ?? row.index)) assert.equal(row.outcome, QUESTION_OUTCOME.NOT_REQUIRED, `row ${row.number}`);
  });
  assert.ok(!questions.some((row) => row.outcome === QUESTION_OUTCOME.SKIPPED));
  const summary = summarizeQuestionOutcomes(questions);
  assert.equal(summary.notRequired, 5);
  assert.equal(summary.notAttempted, 0);
});

test('a Recovery or Live Challenge never credits an item the accommodation omitted', () => {
  const { assignment, omitted } = setup();
  const dolIndices = [16, 17, 18, 19];
  const dolOmitted = dolIndices.filter((index) => omitted.has(index));
  const tracker = correct(dolIndices.filter((index) => !omitted.has(index)).slice(0, 1));
  const recoveryByAssignment = {
    [assignment.id]: { dol: { status: 'completed', rawScore: 100, recordedScore: 90, cap: 90, type: 'practice-recovery', completedAt: '2026-10-06T15:00:00.000Z' } },
  };
  const projected = projectSectionRecoveryForAssignment({ tracker, assignment, recoveryByAssignment, supportProfile: reducedProfile }).tracker || {};
  dolOmitted.forEach((index) => assert.equal(projected[index], undefined, `omitted DOL item ${index} gains no record`));
});

test('live monitor: an omitted item is "n", not work still to do, and pace compares the student\'s own share', () => {
  const states = encodeQuestionStates({ 0: { status: 'correct' }, 1: { status: 'correct' } }, [0, 1, 2, 3], { notRequired: new Set([2, 3]) });
  assert.equal(states, 'ccnn');
  const counts = countQuestionStates(states);
  assert.equal(counts.untouched, 0);
  assert.equal(counts.notRequired, 2);

  const now = Date.parse('2026-10-05T15:00:00Z');
  const live = (questionStates) => ({
    id: 'S', liveStatus: { assignmentId: 'A', questionStates, updatedAt: now - 1000, lastInteractionAt: now - 1000, pageVisible: true },
  });
  const classStats = { medianAnswered: 8, meanAccuracy: 90, activeCount: 10, idleShare: 0 };
  // 6 of their 6 required items, in a 10-item lesson: not behind the median of 8.
  const reduced = classifyLiveStudent(live('ccccccnnnn'), { classStats, nowValue: now });
  assert.ok(!reduced.flags.includes(LIVE_FLAGS.BEHIND_PACE));
  // A classmate with 5 of 10 answered is behind, exactly as before.
  const classmate = classifyLiveStudent(live('ccccc.....'), { classStats, nowValue: now });
  assert.ok(classmate.flags.includes(LIVE_FLAGS.BEHIND_PACE));
});

test('walkthrough: a teacher question this student does not have reads as done', () => {
  const now = Date.parse('2026-10-05T15:00:00Z');
  const monitor = buildWalkthroughMonitor({
    students: [{
      id: 'S1',
      firstName: 'Ana',
      liveStatus: {
        assignmentId: 'A', activityRole: 'classwork', sectionQuestionIndex: 0,
        classworkQuestionStates: 'cn..', updatedAt: now - 1000, lastInteractionAt: now - 1000, pageVisible: true,
      },
    }],
    assignmentId: 'A',
    teacherQuestionIndex: 1,
    nowValue: now,
  });
  const row = [...(monitor.rows || monitor.all || [])].find((entry) => entry.id === 'S1' || entry.student?.id === 'S1')
    || monitor.done?.[0];
  assert.equal(row.status, WALKTHROUGH_STATUS.DONE);
  assert.match(row.reason, /Not required/);
});

test('a per-student printed worksheet holds that student\'s own items', () => {
  const { assignment, omitted, student } = setup();
  const model = buildTeacherAssignmentWorksheetModel({ assignment, student });
  const printed = model.sections.flatMap((section) => section.questions);
  assert.equal(printed.length, 20 - omitted.size);
  // A classmate's worksheet (no support) prints all 20.
  const classmate = buildTeacherAssignmentWorksheetModel({ assignment, student: { ...student, id: 'S9', profile: {} } });
  assert.equal(classmate.sections.flatMap((section) => section.questions).length, 20);
});

test('a student without the support is unchanged everywhere', () => {
  const assignment = lesson();
  const indices = allIndices(assignment).slice(0, 10);
  const plain = { id: 'S2', classId: 'C1', profile: normalizeStudentProfile({}), gradesByAssignment: { [assignment.id]: correct(indices) } };
  const bare = { ...plain, profile: null };
  assert.deepEqual(studentAssignmentProgress({ student: plain, assignment }), studentAssignmentProgress({ student: bare, assignment }));
  assert.equal(canonicalPresentedAssignmentGrade({ student: plain, assignment }), canonicalPresentedAssignmentGrade({ student: bare, assignment }));
  const { questions } = analyzeAssignmentQuestions({ assignment, student: plain });
  assert.ok(!questions.some((row) => row.outcome === QUESTION_OUTCOME.NOT_REQUIRED));
});
