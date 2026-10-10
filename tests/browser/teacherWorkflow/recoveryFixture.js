/*
 * A RECOVERY MATHMASTER COULD NOT FULLY GRADE — synthetic
 * (recoveryHoldJourneys.mjs). Opt-in: `&recovery=p0`.
 *
 * Algebra I — Period 1 has a DOL Recovery-ready lesson whose DOL is three
 * Question Family questions on three skills (weights 4 / 3 / 3). After three
 * students started their Recovery, the teacher re-tuned DOL Q3 (the
 * intercepts family's range), so every Q3 pin dealt before the edit names an
 * instance the family no longer produces — the PR #430 P0 scenario. Every
 * record below is produced by the REAL shared server code
 * (runSectionRecoveryAction: server-graded Practice, Start, Submit), so the
 * journeys read exactly what production stores:
 *
 *   910971  HELD: answered Q1 and Q2 correctly, Q3 could not be reproduced and
 *           was the only evidence for its skill. Waiting for the teacher.
 *   910972  IN PROGRESS: started before the edit. Their Q3 will not render on
 *           any device now; they answer Q1 and Q2 in the browser and submit.
 *   910973  COMPLETED, Q3 left out: on a second lesson whose Q3 shares Q1's
 *           skill, so the two graded questions were enough — 100%, recorded
 *           at the 90 cap over a 30 original.
 *   910974  COMPLETED UNDER THE OLD RULE on the second lesson: Q3 scored as 0
 *           with its weight counted (70%), exactly as main stored it — the
 *           record a teacher can now see and re-score.
 *
 * All invented. Nothing here reaches a Firebase project.
 */
import {
  RECOVERY_ACTION,
  RECOVERY_STATE,
  buildSectionRecoveryContext,
  nextRecoveryPracticeItem,
} from '../../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../../functions/shared/sectionRecoveryActions.mjs';
import { reproduceFamilyQuestionFromPin } from '../../../functions/shared/questionFamilyInstance.mjs';
import { planSeatAdditions } from '../../../functions/shared/questionGenerationIdentity.mjs';
import { getStoredAssignmentQuestions } from '../../../src/platform/contract/storedAssignmentV5.js';
import { projectCurrentAssignmentContent } from '../../../src/platform/assignments/currentContentProjection.js';
import { splitGradesBySection } from '../../../src/platform/teacher/gradeEvidence.js';

export const RECOVERY_CLASS_ID = 'c-alg1-p1';
export const RECOVERY_ASSIGNMENT_ID = 'a-recovery';
export const RECOVERY_ASSIGNMENT_TITLE = 'Linear Relationships — DOL Recovery Check';
export const RECOVERY_SHARED_ASSIGNMENT_ID = 'a-recovery-b';
export const RECOVERY_SHARED_ASSIGNMENT_TITLE = 'Two-Step Equations — DOL Recovery Check';
export const HELD_STUDENT_ID = '910971';
export const SUBMITTING_STUDENT_ID = '910972';
export const EXCLUDED_STUDENT_ID = '910973';
export const LEGACY_STUDENT_ID = '910974';

const DAY = 86_400_000;
const dateKey = (ms) => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const endOfDay = (ms) => new Date(new Date(ms).setHours(23, 59, 0, 0)).toISOString();

const question = (questionId, familyId, prompt, questionWeight, constraints = null) => ({
  questionId,
  id: questionId,
  type: 'multiAnswer',
  prompt,
  questionWeight,
  questionFamily: { id: familyId, ...(constraints ? { constraints } : {}) },
});

const lessonFor = ({ id, title, dol, now, studentIds }) => {
  const assignment = {
    id,
    title,
    schemaVersion: 5,
    assignmentType: 'notesClasswork',
    folder: 'Algebra I',
    contentVersion: 1,
    assignedClassIds: [RECOVERY_CLASS_ID],
    assignedClassPeriods: ['Period 1'],
    releaseAt: new Date(now - 8 * DAY).toISOString(),
    // The DOL's day is past, so Recovery is offered; the final submission
    // date — the Recovery end date — is still ahead.
    dueAt: endOfDay(now - 3 * DAY),
    lateDueAt: endOfDay(now + 5 * DAY),
    sections: [
      { id: 'dol', role: 'dol', title: 'DOL', questions: dol },
    ],
    dol: { enabled: true, instructionDate: dateKey(now - 3 * DAY), minutesBeforeEnd: 10, closeMinutesBeforeEnd: 5 },
    gradingPeriod: { id: 'mp2', label: '2nd Marking Period', order: 2 },
    createdAt: new Date(now - 9 * DAY).toISOString(),
  };
  assignment.generationSeats = { version: 1, byClassId: { [RECOVERY_CLASS_ID]: planSeatAdditions({ assignment, classId: RECOVERY_CLASS_ID, studentIds }) } };
  return assignment;
};

// The original DOL: only Q2 right (3 of 10 points of weight: 30%).
const ORIGINAL_TRACKER = (now) => ({
  0: { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(now - 3 * DAY).toISOString() },
  1: { status: 'correct', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(now - 3 * DAY).toISOString() },
  2: { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(now - 3 * DAY).toISOString() },
});

/** The answer each field of a pinned instance expects, as a student would type it. */
export const recoveryFieldAnswers = (assignment, item) => {
  const reproduced = reproduceFamilyQuestionFromPin({
    question: getStoredAssignmentQuestions(assignment)[item.storageIndex],
    assignmentId: assignment.id,
    storageIndex: item.storageIndex,
    pin: item.pin,
  });
  if (reproduced.error) return null;
  return (reproduced.question.answerFields || []).map((field) => ({ id: field.id, label: field.label, value: String(field.answer) }));
};

const responseFor = (assignment, item) => {
  const fields = recoveryFieldAnswers(assignment, item);
  return { kind: 'fields', type: 'multiAnswer', value: '', fields: fields.map((field) => ({ id: field.id, value: field.value, isComplete: true })) };
};

/** Context the way advanceSectionRecovery builds it (no attendance in the harness). */
export const recoveryContextFor = ({ assignment, gradeData, studentId, section = 'dol', schedule = null, nowValue, misconceptionRecords = null }) => {
  const questions = getStoredAssignmentQuestions(assignment);
  const entries = projectCurrentAssignmentContent(assignment).entries.filter((entry) => entry.logicalRole === section);
  const tracker = gradeData?.gradesByAssignment?.[assignment.id] || {};
  const original = splitGradesBySection({ tracker, assignment })[section] || {};
  return buildSectionRecoveryContext({
    assignment,
    section,
    sectionEntries: entries.map((entry) => ({ storageIndex: entry.storageIndex, question: questions[entry.storageIndex] })),
    questions,
    tracker,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted || 0, total: original.total || 0 },
    record: gradeData?.sectionRecoveryByAssignment?.[assignment.id]?.[section] || null,
    studentId,
    classId: gradeData?.classId || null,
    classPeriod: gradeData?.classPeriod || null,
    schedule,
    supportEvents: [],
    challengeCredit: gradeData?.warmupChallengeByAssignment?.[assignment.id] || null,
    studentProfile: gradeData?.profile || null,
    sectionModeFor: () => 'personalized',
    misconceptionRecords,
    nowValue,
  });
};

/** Practice to mastery (server-graded) and Start: the student's pinned plan. */
const startedRecord = ({ assignment, gradeData, studentId, now }) => {
  let record = null;
  for (let step = 0; step < 24; step += 1) {
    const context = recoveryContextFor({ assignment, gradeData: { ...gradeData, sectionRecoveryByAssignment: { [assignment.id]: { dol: record } } }, studentId, nowValue: now });
    if (context.eligibility.state !== RECOVERY_STATE.LOCKED) break;
    const item = nextRecoveryPracticeItem(context);
    record = runSectionRecoveryAction({
      context,
      action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: responseFor(assignment, item) },
      at: now - 2 * 3600_000 + step * 60_000,
    }).record;
  }
  const context = recoveryContextFor({ assignment, gradeData: { ...gradeData, sectionRecoveryByAssignment: { [assignment.id]: { dol: record } } }, studentId, nowValue: now });
  return runSectionRecoveryAction({ context, action: RECOVERY_ACTION.START, at: now - 90 * 60_000 }).record;
};

const submitted = ({ assignment, gradeData, studentId, record, now }) => {
  const context = recoveryContextFor({ assignment, gradeData: { ...gradeData, sectionRecoveryByAssignment: { [assignment.id]: { dol: record } } }, studentId, nowValue: now });
  // The student answered the two questions that still render.
  const responses = Object.fromEntries(record.plan.items.slice(0, 2).map((item) => [item.itemId, responseFor(assignment, item)]));
  return runSectionRecoveryAction({ context, action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: now - 60 * 60_000 }).record;
};

const retuneQ3 = (assignment, questionFamily) => ({
  ...assignment,
  sections: assignment.sections.map((section) => ({
    ...section,
    questions: section.questions.map((entry, index) => (index === 2 ? { ...entry, questionFamily } : entry)),
  })),
});

const studentRow = (id, firstName, lastName) => ({
  id,
  firstName,
  lastName,
  displayName: `${firstName} ${lastName}`,
  classId: RECOVERY_CLASS_ID,
  classPeriod: 'Period 1',
  assignedTeacherEmail: null,
  status: 'active',
  profile: {},
  gradesByAssignment: {},
  assignmentActivity: {},
  sisStudentId: id,
});

export const addRecoveryHoldScenario = ({ fixture, now, teacherEmail }) => {
  const people = [
    studentRow(HELD_STUDENT_ID, 'Imani', 'Sample'),
    studentRow(SUBMITTING_STUDENT_ID, 'Jonah', 'Example'),
    studentRow(EXCLUDED_STUDENT_ID, 'Kira', 'Placeholder'),
    studentRow(LEGACY_STUDENT_ID, 'Rosa', 'Mockup'),
  ].map((row) => ({ ...row, assignedTeacherEmail: teacherEmail }));
  const classmates = Object.entries(fixture)
    .filter(([path, data]) => path.startsWith('grades/') && path.split('/').length === 2 && data?.classId === RECOVERY_CLASS_ID)
    .map(([path]) => path.split('/')[1]);
  const studentIds = [...classmates, ...people.map((row) => row.id)];

  // Three skills: a two-step equation, zeros, intercepts.
  const distinct = lessonFor({
    id: RECOVERY_ASSIGNMENT_ID,
    title: RECOVERY_ASSIGNMENT_TITLE,
    now,
    studentIds,
    dol: [
      question('rd1', 'linear.twoStepEquation', 'Solve for x.', 4),
      question('rd2', 'functions.identifyZeros', 'Find the zeros.', 3),
      question('rd3', 'functions.identifyIntercepts', 'Find both intercepts.', 3),
    ],
  });
  // Q3 shares Q1's skill (both two-step equations).
  const shared = lessonFor({
    id: RECOVERY_SHARED_ASSIGNMENT_ID,
    title: RECOVERY_SHARED_ASSIGNMENT_TITLE,
    now,
    studentIds,
    dol: [
      question('rs1', 'linear.twoStepEquation', 'Solve for x.', 4),
      question('rs2', 'functions.identifyZeros', 'Find the zeros.', 3),
      question('rs3', 'linear.twoStepEquation', 'Solve for x.', 3),
    ],
  });

  const tracker = ORIGINAL_TRACKER(now);
  const gradeFor = (row) => ({ ...row, gradesByAssignment: { [RECOVERY_ASSIGNMENT_ID]: tracker, [RECOVERY_SHARED_ASSIGNMENT_ID]: tracker } });
  const [held, submitting, excluded, legacyRow] = people.map(gradeFor);

  // Every plan is dealt from the content as it was BEFORE the edit…
  const heldPlan = startedRecord({ assignment: distinct, gradeData: held, studentId: held.id, now });
  const submittingPlan = startedRecord({ assignment: distinct, gradeData: submitting, studentId: submitting.id, now });
  const excludedPlan = startedRecord({ assignment: shared, gradeData: excluded, studentId: excluded.id, now });
  const legacyPlan = startedRecord({ assignment: shared, gradeData: legacyRow, studentId: legacyRow.id, now });
  // …then the teacher re-tunes Q3, and what is stored is the edited lesson.
  const distinctNow = retuneQ3(distinct, { id: 'functions.identifyIntercepts', constraints: { interceptRange: [-6, 6] } });
  const sharedNow = retuneQ3(shared, { id: 'linear.twoStepEquation', constraints: { solutionRange: [30, 40] } });

  held.sectionRecoveryByAssignment = { [RECOVERY_ASSIGNMENT_ID]: { dol: submitted({ assignment: distinctNow, gradeData: held, studentId: held.id, record: heldPlan, now }) } };
  submitting.sectionRecoveryByAssignment = { [RECOVERY_ASSIGNMENT_ID]: { dol: submittingPlan } };
  excluded.sectionRecoveryByAssignment = { [RECOVERY_SHARED_ASSIGNMENT_ID]: { dol: submitted({ assignment: sharedNow, gradeData: excluded, studentId: excluded.id, record: excludedPlan, now }) } };
  // What main's SUBMIT stored for the same case before this policy.
  const answeredAt = new Date(now - 60 * 60_000).toISOString();
  legacyRow.sectionRecoveryByAssignment = {
    [RECOVERY_SHARED_ASSIGNMENT_ID]: {
      dol: {
        ...legacyPlan,
        status: 'completed',
        rawScore: 70,
        results: {
          r1: { isCorrect: true, credit: 1, weight: 4, graded: true, reason: null, answeredAt },
          r2: { isCorrect: true, credit: 1, weight: 3, graded: true, reason: null, answeredAt },
          r3: { isCorrect: false, credit: 0, weight: 3, graded: false, reason: 'question-unavailable', answeredAt },
        },
        originalScoreAtCompletion: 30,
        recordedScoreAtCompletion: 70,
        completedAt: answeredAt,
      },
    },
  };

  const { id: _distinctId, ...distinctDoc } = distinctNow;
  const { id: _sharedId, ...sharedDoc } = sharedNow;
  fixture[`assignments/${RECOVERY_ASSIGNMENT_ID}`] = distinctDoc;
  fixture[`assignments/${RECOVERY_SHARED_ASSIGNMENT_ID}`] = sharedDoc;
  [held, submitting, excluded, legacyRow].forEach(({ id, ...data }) => { fixture[`grades/${id}`] = data; });
  return fixture;
};

/*
 * TARGETED RECOVERY PRACTICE (student push J) — opt-in `&recovery=targeted`.
 *
 * 910975 missed DOL Q1 (two-step equation) and Q3 (intercepts) and got Q2
 * (zeros). The server classified the Q3 miss as "intercepts-swapped" (a
 * trusted evidence event, as ingestion stores it). Untargeted, Practice would
 * open on Q1; targeted, it opens on Q3 — a fresh intercepts question, never
 * the one missed.
 */
export const TARGETED_ASSIGNMENT_ID = 'a-recovery-targeted';
export const TARGETED_ASSIGNMENT_TITLE = 'Intercepts and Zeros — DOL Recovery Check';
export const TARGETED_STUDENT_ID = '910975';

export const addTargetedRecoveryScenario = ({ fixture, now, teacherEmail }) => {
  const row = { ...studentRow(TARGETED_STUDENT_ID, 'Tomas', 'Sample'), assignedTeacherEmail: teacherEmail };
  const classmates = Object.entries(fixture)
    .filter(([path, data]) => path.startsWith('grades/') && path.split('/').length === 2 && data?.classId === RECOVERY_CLASS_ID)
    .map(([path]) => path.split('/')[1]);
  const lesson = lessonFor({
    id: TARGETED_ASSIGNMENT_ID,
    title: TARGETED_ASSIGNMENT_TITLE,
    now,
    studentIds: [...classmates, row.id],
    dol: [
      question('rt1', 'linear.twoStepEquation', 'Solve for x.', 4),
      question('rt2', 'functions.identifyZeros', 'Find the zeros.', 3),
      question('rt3', 'functions.identifyIntercepts', 'Find both intercepts.', 3),
    ],
  });
  const { id: _id, ...lessonDoc } = lesson;
  fixture[`assignments/${TARGETED_ASSIGNMENT_ID}`] = lessonDoc;
  const { id: _studentId, ...grade } = { ...row, gradesByAssignment: { [TARGETED_ASSIGNMENT_ID]: ORIGINAL_TRACKER(now) } };
  fixture[`grades/${TARGETED_STUDENT_ID}`] = grade;
  fixture[`grades/${TARGETED_STUDENT_ID}/evidenceEvents/ev-targeted-q3`] = {
    source: { kind: 'assignment', assignmentId: TARGETED_ASSIGNMENT_ID, questionIndex: 2, activityRole: 'dol' },
    occurredAt: now - 3 * DAY,
    performance: {
      score: 0,
      isCorrect: false,
      misconceptionCodes: ['intercepts-swapped'],
      misconceptionEvidence: {
        source: 'server-grading',
        registryVersion: 1,
        classifier: 'family:functions.identifyIntercepts@1',
        classifierVersion: 1,
        findings: [{ code: 'intercepts-swapped', codeVersion: 1, parts: ['xIntercept', 'yIntercept'] }],
      },
    },
  };
  return fixture;
};
