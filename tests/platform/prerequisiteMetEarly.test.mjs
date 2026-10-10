/*
 * A PREREQUISITE MET EARLY OPENS A SCHEDULED LESSON.
 *
 * The release model (src/assignmentLifecycle.js prerequisiteAccess): an
 * assignment with a prerequisite opens when the prerequisite's Classwork is
 * complete (score 100) OR at its release date, whichever comes first. Every
 * assignment-level gate already let `prerequisiteMet` through a future release;
 * getSectionAccessState did not, so Classwork/Practice read "opens later" and
 * entry had no section to land on (docs/handoffs/STUDENT_PUSH_C_HOME_GRADES.md,
 * "Prerequisite met early").
 *
 * Client side: the section state, and the dashboard reading it.
 * Server side: the completion grade the deadline finalizer writes is the one
 * that opens it, and ingestion's own section check agrees the section is open.
 * The table-driven proof that nothing else moved is
 * sectionAccessPrerequisiteEquivalence.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assignmentIsForStudent, getAssignmentLifecycle, getDOLState, getIncludedQuestionIndices,
  getSectionAccessState, getWarmupState, prerequisiteAccess, questionIsIncluded,
} from '../../src/assignmentLifecycle.js';
import { buildStudentDashboardModel } from '../../src/studentDashboardModel.js';
import { SECTION_STATE } from '../../src/platform/student/lessonSections.js';
import { normalizeQuestionRecord } from '../../src/attemptPolicy.js';
import { matchesSmartView } from '../../src/assignmentSmartViews.js';
import { buildResponseCheckpointAction } from '../../src/platform/performance/responseCheckpoint.js';
import {
  buildCheckpointFinalization,
  decideCheckpointFinalization,
} from '../../functions/shared/responseCheckpointFinalizer.mjs';
import { CHECKPOINT_STATUS } from '../../functions/shared/responseCheckpointSchema.mjs';
import { captureSectionAccessProof, resolveLiveSectionAccess } from '../../functions/shared/submissionEnvelope.mjs';
import { sectionWasOpenAtCapture } from '../../functions/shared/studentSubmissionDisposition.mjs';

const CLASS_ID = 'class-a';
const CLASS_PERIOD = 'Period 3';
// The dependent lesson releases a week after "now"; its prerequisite is A1.
const NOW = Date.parse('2026-09-23T15:00:00Z');
const RELEASE = '2026-09-30T13:00:00Z';
const MET = { A1: { score: 100, completionPercent: 100 } };
const UNMET = { A1: { score: 60, completionPercent: 60 } };

const dependent = (patch = {}) => ({
  id: 'B1',
  title: 'B1',
  schemaVersion: 5,
  assignedClassIds: [CLASS_ID],
  prerequisiteAssignmentId: 'A1',
  releaseAt: RELEASE,
  dueAt: '2026-10-07T22:00:00Z',
  lateDueAt: '2026-10-14T22:00:00Z',
  sections: [
    { id: 'classwork', role: 'classwork', questions: [{ type: 'algebra', prompt: 'CW', equationLatex: 'x=1', activityRole: 'classwork' }] },
    { id: 'practice', role: 'practice', questions: [{ type: 'algebra', prompt: 'P', equationLatex: 'x=2', activityRole: 'practice' }] },
  ],
  ...patch,
});
const sectionState = (assignment, role, extra = {}) => getSectionAccessState({
  assignment, activityRole: role, classId: CLASS_ID, classPeriod: CLASS_PERIOD, nowValue: NOW, ...extra,
});

/* --------------------------------------------------------------------------
 * Client: the section state
 * ------------------------------------------------------------------------ */

test('a met prerequisite opens Classwork and Practice before the release date', () => {
  const assignment = dependent();
  assert.equal(prerequisiteAccess({ assignment, classworkGradesByAssignment: MET, nowValue: NOW }).reason, 'prerequisiteMet');
  for (const role of ['classwork', 'practice']) {
    const state = sectionState(assignment, role, { classworkGradesByAssignment: MET });
    assert.equal(state.status, 'open', role);
    assert.equal(state.isOpen, true, role);
    assert.equal(state.openedByPrerequisite, true, role);
    // The lifecycle is not rewritten: early work is still before release, so
    // nothing becomes credit-eligible or moves a due/close date.
    assert.equal(state.lifecycle.isScheduled, true);
    assert.equal(state.lifecycle.creditEligible, false);
  }
});

test('an unmet, absent or unread prerequisite still waits for the release date', () => {
  const cases = [
    ['unmet', dependent(), { classworkGradesByAssignment: UNMET }],
    ['no grades passed (teacher view, preview)', dependent(), {}],
    ['empty grades', dependent(), { classworkGradesByAssignment: {} }],
    // Without a prerequisite, the release date is the only way in — another
    // assignment's 100 cannot open it.
    ['no prerequisite', dependent({ prerequisiteAssignmentId: null }), { classworkGradesByAssignment: MET }],
  ];
  for (const [label, assignment, extra] of cases) {
    const state = sectionState(assignment, 'classwork', extra);
    assert.equal(state.status, 'scheduled', label);
    assert.equal(state.isOpen, false, label);
    assert.equal('openedByPrerequisite' in state, false, label);
  }
});

test('opened early, the teacher lock still decides: locked stays locked, a class override opens it', () => {
  const locked = dependent({ sectionAccess: { practice: { defaultState: 'closed', overridesByClassId: {} } } });
  const practice = sectionState(locked, 'practice', { classworkGradesByAssignment: MET });
  assert.equal(practice.status, 'closed');
  assert.equal(practice.isOpen, false);
  assert.equal(sectionState(locked, 'classwork', { classworkGradesByAssignment: MET }).isOpen, true);

  const overridden = dependent({
    sectionAccess: { practice: { defaultState: 'closed', overridesByClassId: { [CLASS_ID]: { state: 'open', changedAt: '2026-09-22T15:00:00Z' } } } },
  });
  assert.equal(sectionState(overridden, 'practice', { classworkGradesByAssignment: MET }).isOpen, true);
  // The override belongs to its class only.
  assert.equal(getSectionAccessState({
    assignment: overridden, activityRole: 'practice', classId: 'class-b', nowValue: NOW, classworkGradesByAssignment: MET,
  }).isOpen, false);
});

test('once released, the prerequisite changes nothing about the section', () => {
  const afterRelease = Date.parse('2026-10-01T15:00:00Z');
  for (const grades of [MET, UNMET, undefined]) {
    const state = getSectionAccessState({
      assignment: dependent(), activityRole: 'classwork', classId: CLASS_ID, nowValue: afterRelease, classworkGradesByAssignment: grades,
    });
    assert.equal(state.status, 'open');
    assert.equal('openedByPrerequisite' in state, false);
  }
});

/* --------------------------------------------------------------------------
 * Client: the dashboard's Today rule reading it
 * ------------------------------------------------------------------------ */

const PROVIDERS = {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  prerequisiteAccess,
  calculateGrade: () => 0,
  getDOLState,
  getWarmupState,
  getIncludedQuestionIndices,
  normalizeQuestionRecord,
  questionIsIncluded,
  assignmentHasHeldTeacherFeedback: () => false,
  matchesSmartView,
};
const dashboardEntry = ({ getSectionAccessState: provider }) => buildStudentDashboardModel({
  assignments: [dependent()],
  classId: CLASS_ID,
  classPeriod: CLASS_PERIOD,
  nowValue: NOW,
  classworkGradesByAssignment: MET,
  providers: { ...PROVIDERS, getSectionAccessState: provider },
}).allEntries.find((entry) => entry.assignment.id === 'B1');

test('Home: with the student\'s grades wired in, the early-opened lesson is workable', () => {
  // The App.jsx provider wiring this fix needs: the student's own grades.
  const wired = dashboardEntry({
    getSectionAccessState: (args) => getSectionAccessState({ ...args, classworkGradesByAssignment: MET }),
  });
  assert.equal(wired.lesson.sections.find((section) => section.role === 'classwork').state, SECTION_STATE.OPEN);
  assert.equal(wired.actionable, true);

  // Unwired, the provider still says "scheduled" — the reported bug: the
  // assignment gate passes, the section lock does not.
  const unwired = dashboardEntry({ getSectionAccessState });
  assert.notEqual(unwired.lesson.sections.find((section) => section.role === 'classwork').state, SECTION_STATE.OPEN);
  assert.equal(unwired.actionable, false);
});

/* --------------------------------------------------------------------------
 * Server: the finalizer's completion grade opens it; ingestion agrees
 * ------------------------------------------------------------------------ */

const DAY = '2026-09-14';
const SCHEDULE = {
  version: 2,
  daySchedules: { A: { periods: { [CLASS_PERIOD]: { enabled: true, start: '10:00', end: '10:50' } } } },
  weeklyDayTypes: { 1: 'A' },
  dayTypeOverrides: { [DAY]: 'A' },
  modifiedSchedules: {},
};
const classworkQuestion = {
  questionId: 'q-classwork-1',
  type: 'multiAnswer',
  activityRole: 'classwork',
  prompt: 'Give the slope and the intercept.',
  answerFields: [{ id: 'slope', answer: '3' }, { id: 'intercept', answer: '-2' }],
};
const prerequisiteAssignment = {
  id: 'A1',
  schemaVersion: 5,
  assignedClassIds: [CLASS_ID],
  dueAt: '2026-09-20',
  lateDueAt: '2026-09-21',
  sections: [{ id: 's-classwork', role: 'classwork', questions: [classworkQuestion] }],
};
const gradeDocument = {
  studentId: 'S1042',
  classId: CLASS_ID,
  classPeriod: CLASS_PERIOD,
  gradesByAssignment: {},
  assignmentActivity: { A1: { totalTimeSeconds: 1200 } },
};
const checkpointFor = (assignmentId, question, questionIndex) => {
  const capturedAt = Date.parse('2026-09-14T15:05:00Z');
  const action = buildResponseCheckpointAction({
    identity: {
      studentId: 'S1042',
      assignmentId,
      questionIndex,
      questionId: question.questionId,
      variantIndex: 0,
      generationKey: `${assignmentId}|S1042|${questionIndex}|variant:0`,
    },
    question,
    activityRole: 'classwork',
    answerState: {
      isComplete: true,
      responseKey: '{}',
      parts: [{ id: 'slope', response: '3', isComplete: true }, { id: 'intercept', response: '-2', isComplete: true }],
    },
    revision: 1,
    finalizeAt: new Date(capturedAt + 60_000).toISOString(),
    finalizationReason: 'warmup-close',
    finalizationContext: { classId: CLASS_ID, classPeriod: CLASS_PERIOD },
    previousTotalAttempts: 0,
    capturedAt,
  });
  assert.ok(action, 'the client refused to build a checkpoint for this fixture');
  return { ...action.payload, classId: CLASS_ID, serverAcknowledgedAt: new Date(capturedAt), status: CHECKPOINT_STATUS.ACTIVE };
};
const decide = ({ assignment, question, questionIndex, grade, now }) => decideCheckpointFinalization({
  checkpoint: checkpointFor(assignment.id, question, questionIndex),
  assignment,
  gradeDocument: grade,
  gradeDocumentId: 'S1042',
  question: { ...question, activityRole: 'classwork' },
  schedule: SCHEDULE,
  classPeriod: CLASS_PERIOD,
  now,
});

test('server: the Classwork grade the deadline finalizer writes is what opens the dependent lesson early', () => {
  const finalizedAt = Date.parse('2026-09-22T06:00:00Z');
  const decision = decide({ assignment: prerequisiteAssignment, question: classworkQuestion, questionIndex: 0, grade: gradeDocument, now: finalizedAt });
  assert.equal(decision.action, 'finalize', decision.reason);
  const finalization = buildCheckpointFinalization({
    checkpoint: checkpointFor('A1', classworkQuestion, 0),
    assignment: prerequisiteAssignment,
    question: classworkQuestion,
    decision,
    gradeDocument,
    classworkIndices: [0],
    occurredAt: finalizedAt,
  });
  assert.equal(finalization.classworkGrade?.score, 100);

  const grades = { A1: finalization.classworkGrade };
  const state = sectionState(dependent(), 'classwork', { classworkGradesByAssignment: grades });
  assert.equal(state.isOpen, true);
  assert.equal(state.openedByPrerequisite, true);
  // Before that grade existed, the same student saw it scheduled.
  assert.equal(sectionState(dependent(), 'classwork', { classworkGradesByAssignment: {} }).status, 'scheduled');
});

test('server: ingestion\'s live section check and the capture proof agree the early-opened section is open', () => {
  const capturedAt = NOW;
  const variants = [
    ['default open', dependent()],
    ['authored closed', dependent({ sectionAccess: { classwork: { defaultState: 'closed', overridesByClassId: {} } } })],
    ['authored closed, opened for this class', dependent({
      sectionAccess: { classwork: { defaultState: 'closed', overridesByClassId: { [CLASS_ID]: { state: 'open', changedAt: '2026-09-22T15:00:00Z' } } } },
    })],
    ['closed for this class', dependent({
      sectionAccess: { classwork: { overridesByClassId: { [CLASS_ID]: { state: 'closed', changedAt: '2026-09-22T15:00:00Z' } } } },
    })],
  ];
  for (const [label, assignment] of variants) {
    const client = sectionState(assignment, 'classwork', { classworkGradesByAssignment: MET, nowValue: capturedAt });
    const live = resolveLiveSectionAccess({ assignment, activityRole: 'classwork', classId: CLASS_ID });
    // The server has no release gate of its own on sections; once the
    // prerequisite opens the lesson the two sides read the same teacher lock.
    assert.equal(client.isOpen, live.isOpen, label);
    assert.equal(client.status, live.status, label);
    const proof = captureSectionAccessProof({ sectionAccess: client, capturedAt });
    assert.equal(sectionWasOpenAtCapture({ capturedSectionAccess: proof, liveSectionAccess: live, capturedAt }), live.isOpen, label);
  }
});

test('server: the finalizer\'s close decision for the dependent lesson does not read the prerequisite', () => {
  const question = { ...classworkQuestion, questionId: 'q-b1-classwork' };
  const assignment = dependent({ sections: [{ id: 's-classwork', role: 'classwork', questions: [question] }] });
  // Before release, inside the late window, and after the final close: the
  // close is the assignment's own final deadline every time.
  const expected = [
    [NOW, 'reschedule'],
    [Date.parse('2026-10-08T12:00:00Z'), 'reschedule'],
    [Date.parse('2026-10-16T12:00:00Z'), 'finalize'],
  ];
  for (const [now, action] of expected) {
    const met = decide({ assignment, question, questionIndex: 0, grade: { ...gradeDocument, classworkGradesByAssignment: MET }, now });
    const unmet = decide({ assignment, question, questionIndex: 0, grade: { ...gradeDocument, classworkGradesByAssignment: UNMET }, now });
    assert.equal(met.action, action, `${new Date(now).toISOString()}: ${met.reason}`);
    assert.equal(met.reason, 'assignment-final-deadline');
    assert.deepEqual(met, unmet);
  }
});
