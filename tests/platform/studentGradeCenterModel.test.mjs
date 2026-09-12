import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  EXCLUSION_REASON,
  GRADE_STATUS,
  buildStudentGradeCenter,
  findGradeCenterEntry,
  gradeCountsTowardPeriod,
  resolveGradeStatus,
  summarizeGradeEntries,
} from '../../src/platform/student/studentGradeCenterModel.js';
import {
  FALLBACK_GRADING_PERIOD_ID,
  groupAssignmentsByGradingPeriod,
  gradingPeriodAssignmentPatch,
  normalizeGradingPeriodSettings,
  resolveAssignmentGradingPeriod,
} from '../../src/platform/student/gradingPeriods.js';
import { splitGrade, splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { executableSource } from './helpers/sourceContract.mjs';

const CLASS_ID = 'class-alg1-a';
const STUDENT = { classId: CLASS_ID, classPeriod: 'Period 3' };

// A four-section assignment, so every section grade in the Grade Center has
// something to be wrong about.
const lesson = (overrides = {}) => ({
  id: 'lesson-1',
  title: 'Functions & Domain/Range',
  schemaVersion: 5,
  assignedClassIds: [CLASS_ID],
  dueAt: '2026-09-08',
  lateDueAt: '2026-09-10',
  sections: [
    { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [{ id: 'w1' }, { id: 'w2' }] },
    { id: 'classwork', role: 'classwork', title: 'Classwork', questions: [{ id: 'c1', questionWeight: 2 }] },
    { id: 'practice', role: 'practice', title: 'Practice', questions: [{ id: 'p1' }] },
    { id: 'dol', role: 'dol', title: 'DOL', questions: [{ id: 'd1' }] },
  ],
  ...overrides,
});

const correct = { status: 'correct', attemptCount: 1, totalAttempts: 1 };
const halfCredit = { status: 'expired', attemptCount: 3, totalAttempts: 3, bestPartialCredit: 50 };
const untouched = { status: 'unattempted' };

const workedTracker = { 0: correct, 1: correct, 2: halfCredit, 3: correct, 4: correct };

const BEFORE_DUE = Date.parse('2026-09-05T12:00:00.000Z');
const AFTER_CLOSE = Date.parse('2026-09-20T12:00:00.000Z');

const build = (options = {}) => buildStudentGradeCenter({
  classId: CLASS_ID,
  classPeriod: STUDENT.classPeriod,
  studentId: 'student-1',
  nowValue: BEFORE_DUE,
  ...options,
});

/* 1. THE SECTION BREAKDOWN COMES FROM THE CANONICAL TRACKER. */

test('Grade Center section and overall grades are the canonical gradeEvidence numbers, not a second calculation', () => {
  const assignment = lesson();
  const gradeCenter = build({
    assignments: [assignment],
    tracker: { 'lesson-1': workedTracker },
  });
  const entry = findGradeCenterEntry(gradeCenter, 'lesson-1');

  assert.deepEqual(
    entry.sections,
    splitGradesBySection({ tracker: workedTracker, assignment }),
    'section grades must be splitGradesBySection() output, unchanged',
  );
  assert.equal(entry.overall.score, splitGrade({ tracker: workedTracker, assignment }).score);
  // Every section is present with its own evidence rather than borrowing the
  // assignment score.
  assert.equal(entry.sections.warmup.score, 100);
  assert.equal(entry.sections.classwork.score, 50);
  assert.equal(entry.sections.dol.score, 100);
});

test('the Grade Center model contains no grade arithmetic of its own', () => {
  const source = executableSource(
    readFileSync(new URL('../../src/platform/student/studentGradeCenterModel.js', import.meta.url), 'utf8'),
  );
  // It must READ the canonical grade functions...
  for (const canonical of ['splitGrade', 'splitGradesBySection', 'gradeWeightTotals']) {
    assert.match(source, new RegExp(`${canonical}\\(`), `must call ${canonical}()`);
  }
  // ...and must not reimplement question credit or question weighting.
  assert.doesNotMatch(source, /getQuestionCredit|normalizeQuestionWeight|bestPartialCredit/);
});

/* 2. HELD FEEDBACK IS PENDING, NEVER ZERO. */

test('work whose feedback a teacher is holding reads Pending Grade and is left out of the average', () => {
  const gradeCenter = build({
    assignments: [lesson()],
    tracker: { 'lesson-1': workedTracker },
    providers: { assignmentHasHeldTeacherFeedback: () => true },
  });
  const entry = findGradeCenterEntry(gradeCenter, 'lesson-1');

  assert.equal(entry.status, GRADE_STATUS.PENDING_GRADE);
  assert.equal(entry.statusLabel, 'Pending Grade');
  assert.equal(entry.displayGrade, null, 'held feedback must never be rendered as a number');
  assert.equal(entry.countsTowardPeriodGrade, false);
  assert.equal(entry.exclusionReason, EXCLUSION_REASON.FEEDBACK_HELD);
  assert.match(entry.exclusionText, /released/i);

  // And the summary says pending rather than folding a zero into the average.
  assert.equal(gradeCenter.currentSummary.pending, 1);
  assert.equal(gradeCenter.currentSummary.graded, 0);
  assert.equal(gradeCenter.currentSummary.score, null);
});

test('nothing attempted and nothing overdue is Not Started with no number attached', () => {
  const gradeCenter = build({ assignments: [lesson()], tracker: {} });
  const entry = findGradeCenterEntry(gradeCenter, 'lesson-1');

  assert.equal(entry.status, GRADE_STATUS.NOT_STARTED);
  assert.equal(entry.displayGrade, null);
  assert.equal(entry.exclusionReason, EXCLUSION_REASON.NO_EVIDENCE);
  assert.equal(gradeCenter.currentSummary.score, null, 'no graded work is not a 0% average');
});

test('overdue work with no evidence is Missing and still does not become a zero', () => {
  const gradeCenter = build({
    assignments: [lesson()],
    tracker: {},
    // After the regular due date, before the final late cutoff.
    nowValue: Date.parse('2026-09-09T12:00:00.000Z'),
  });
  const entry = findGradeCenterEntry(gradeCenter, 'lesson-1');

  assert.equal(entry.status, GRADE_STATUS.MISSING);
  assert.equal(entry.displayGrade, null);
  assert.equal(entry.countsTowardPeriodGrade, false);
  assert.equal(gradeCenter.currentSummary.missing, 1);
  assert.equal(gradeCenter.currentSummary.score, null);
});

/* 3. PRACTICE AFTER THE CLOSE CANNOT MOVE THE FROZEN GRADE. */

test('a closed assignment keeps its frozen recorded grade and offers practice beside it', () => {
  const gradeCenter = build({
    assignments: [lesson()],
    tracker: { 'lesson-1': workedTracker },
    nowValue: AFTER_CLOSE,
  });
  const entry = findGradeCenterEntry(gradeCenter, 'lesson-1');

  assert.equal(entry.frozen, true);
  assert.equal(entry.status, GRADE_STATUS.GRADED);
  assert.equal(entry.practiceAvailable, true);
  assert.equal(entry.displayGrade, splitGrade({ tracker: workedTracker, assignment: lesson() }).score);
  assert.equal(entry.countsTowardPeriodGrade, true, 'a closed grade is still a recorded grade');
});

test('post-close practice work cannot reach the Grade Center at all', () => {
  const assignment = lesson();
  const frozen = { ...workedTracker };
  const before = build({ assignments: [assignment], tracker: { 'lesson-1': frozen }, nowValue: AFTER_CLOSE });

  // What practice actually does: writes into a SEPARATE tracker. Everything in
  // it here is correct, which would raise the grade if it were ever read.
  const practiceTracker = { 'lesson-1': { 0: correct, 1: correct, 2: correct, 3: correct, 4: correct } };
  const after = buildStudentGradeCenter({
    classId: CLASS_ID,
    classPeriod: STUDENT.classPeriod,
    studentId: 'student-1',
    nowValue: AFTER_CLOSE,
    assignments: [assignment],
    tracker: { 'lesson-1': frozen },
    // There is no parameter that accepts it, so passing it changes nothing.
    ...practiceTracker,
  });

  assert.equal(
    findGradeCenterEntry(after, 'lesson-1').displayGrade,
    findGradeCenterEntry(before, 'lesson-1').displayGrade,
  );
  assert.deepEqual(frozen, workedTracker, 'the frozen tracker must not be mutated');

  // The isolation is structural: the model has no practice-tracker input.
  const source = executableSource(
    readFileSync(new URL('../../src/platform/student/studentGradeCenterModel.js', import.meta.url), 'utf8'),
  );
  assert.doesNotMatch(source, /practiceTracker/);
});

test('an assignment that closed with nothing recorded is Practice Only, not a permanent zero', () => {
  const gradeCenter = build({ assignments: [lesson()], tracker: {}, nowValue: AFTER_CLOSE });
  const entry = findGradeCenterEntry(gradeCenter, 'lesson-1');

  assert.equal(entry.status, GRADE_STATUS.PRACTICE_ONLY);
  assert.equal(entry.displayGrade, null);
  assert.equal(entry.countsTowardPeriodGrade, false);
  assert.equal(entry.exclusionReason, EXCLUSION_REASON.PRACTICE_ONLY);
  assert.equal(gradeCenter.currentSummary.score, null);
  assert.equal(gradeCenter.currentSummary.missing, 0, 'work with no recoverable credit is not filed as missing');
});

/* THE STATUS LADDER AND THE AGGREGATE POLICY, DIRECTLY. */

test('grade status is decided in one place, in priority order', () => {
  const open = { isPracticeOnly: false, isLate: false, isScheduled: false };
  const late = { isPracticeOnly: false, isLate: true };
  const closed = { isPracticeOnly: true };
  const some = { attempted: 1, total: 3 };
  const all = { attempted: 3, total: 3 };
  const none = { attempted: 0, total: 3 };

  assert.equal(resolveGradeStatus({ overall: all, lifecycle: open, excused: true }), GRADE_STATUS.EXCUSED);
  assert.equal(resolveGradeStatus({ overall: none, lifecycle: closed }), GRADE_STATUS.PRACTICE_ONLY);
  assert.equal(resolveGradeStatus({ overall: some, lifecycle: open, feedbackHeld: true }), GRADE_STATUS.PENDING_GRADE);
  assert.equal(resolveGradeStatus({ overall: some, lifecycle: closed }), GRADE_STATUS.GRADED);
  assert.equal(resolveGradeStatus({ overall: all, lifecycle: open }), GRADE_STATUS.GRADED);
  assert.equal(resolveGradeStatus({ overall: some, lifecycle: open }), GRADE_STATUS.IN_PROGRESS);
  assert.equal(resolveGradeStatus({ overall: some, lifecycle: late }), GRADE_STATUS.LATE);
  assert.equal(resolveGradeStatus({ overall: none, lifecycle: late }), GRADE_STATUS.MISSING);
  assert.equal(resolveGradeStatus({ overall: none, lifecycle: open }), GRADE_STATUS.NOT_STARTED);
  assert.equal(resolveGradeStatus({ overall: none, lifecycle: open, locked: true }), GRADE_STATUS.LOCKED);
  // Reopened is read from explicit teacher data; it never outranks a held grade.
  assert.equal(resolveGradeStatus({ overall: some, lifecycle: open, reopened: true }), GRADE_STATUS.REOPENED);
});

test('excused and reopened are read from explicit platform data and never inferred', () => {
  const excused = lesson({ excusedStudentIds: ['student-1'] });
  const gradeCenter = build({ assignments: [excused], tracker: { 'lesson-1': workedTracker } });
  const entry = findGradeCenterEntry(gradeCenter, 'lesson-1');
  assert.equal(entry.status, GRADE_STATUS.EXCUSED);
  assert.equal(entry.countsTowardPeriodGrade, false);

  // A different student's excusal is not this student's.
  const other = buildStudentGradeCenter({
    classId: CLASS_ID, classPeriod: STUDENT.classPeriod, studentId: 'student-2',
    nowValue: BEFORE_DUE, assignments: [excused], tracker: { 'lesson-1': workedTracker },
  });
  assert.notEqual(findGradeCenterEntry(other, 'lesson-1').status, GRADE_STATUS.EXCUSED);
});

test('the period grade totals MathMaster question weights instead of averaging percentages', () => {
  // One question worth 1, scored 100%. Three questions worth 1 each, scored 0%.
  const small = {
    id: 'small', title: 'Warm-Up only', schemaVersion: 5, assignedClassIds: [CLASS_ID],
    dueAt: '2026-09-08', lateDueAt: '2026-09-10',
    sections: [{ id: 's', role: 'classwork', title: 'Classwork', questions: [{ id: 'q1' }] }],
  };
  const large = {
    id: 'large', title: 'Investigation', schemaVersion: 5, assignedClassIds: [CLASS_ID],
    dueAt: '2026-09-08', lateDueAt: '2026-09-10',
    sections: [{ id: 's', role: 'classwork', title: 'Classwork', questions: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }] }],
  };
  const zero = { status: 'expired', attemptCount: 3, totalAttempts: 3, bestPartialCredit: 0 };

  const gradeCenter = build({
    assignments: [small, large],
    tracker: { small: { 0: correct }, large: { 0: zero, 1: zero, 2: zero } },
  });

  // Points: 1 earned of 4 possible = 25%. Averaging the two percentages would
  // have said 50%, which is the weighting policy MathMaster does not have.
  assert.equal(gradeCenter.currentSummary.score, 25);
  assert.equal(gradeCenter.currentSummary.graded, 2);
});

test('the aggregate refuses to count work it has no released evidence for', () => {
  assert.deepEqual(
    gradeCountsTowardPeriod({ status: GRADE_STATUS.PENDING_GRADE, overall: { attempted: 3 }, weights: { possibleWeight: 3 } }),
    { counts: false, reason: EXCLUSION_REASON.FEEDBACK_HELD },
  );
  assert.deepEqual(
    gradeCountsTowardPeriod({ status: GRADE_STATUS.MISSING, overall: { attempted: 0 }, weights: { possibleWeight: 3 } }),
    { counts: false, reason: EXCLUSION_REASON.NO_EVIDENCE },
  );
  assert.deepEqual(
    gradeCountsTowardPeriod({ status: GRADE_STATUS.GRADED, overall: { attempted: 3 }, weights: { possibleWeight: 3 } }),
    { counts: true, reason: null },
  );
  assert.equal(summarizeGradeEntries([]).score, null);
});

/* 7-9. MARKING PERIODS. */

const periodSettings = normalizeGradingPeriodSettings({
  periods: [
    { id: '2026-mp0', label: 'Marking Period 0', order: 1, archived: true },
    { id: '2026-mp1', label: 'Marking Period 1', order: 2 },
  ],
  currentPeriodId: '2026-mp1',
});

test('current and archived marking periods are grouped separately and both keep their work', () => {
  const past = lesson({
    id: 'lesson-0', title: 'Linear Systems', dueAt: '2026-08-10', lateDueAt: '2026-08-12',
    gradingPeriod: { id: '2026-mp0', label: 'Marking Period 0', order: 1 },
  });
  const current = lesson({ gradingPeriod: { id: '2026-mp1', label: 'Marking Period 1', order: 2 } });

  const gradeCenter = build({
    assignments: [past, current],
    tracker: { 'lesson-0': workedTracker, 'lesson-1': workedTracker },
    gradingPeriodSettings: periodSettings,
    nowValue: AFTER_CLOSE,
  });

  assert.equal(gradeCenter.currentPeriod.id, '2026-mp1');
  assert.equal(gradeCenter.periodGroups[0].period.id, '2026-mp1', 'the current period sorts first');
  assert.equal(gradeCenter.periodGroups[0].defaultOpen, true);

  const archivedGroup = gradeCenter.pastPeriodGroups.find((group) => group.period.id === '2026-mp0');
  assert.ok(archivedGroup, 'an archived marking period still appears');
  assert.equal(archivedGroup.period.archived, true);
  assert.equal(archivedGroup.defaultOpen, false, 'past periods collapse by default');
  assert.equal(archivedGroup.entries.length, 1, 'archiving a period never removes its work');
  assert.ok(archivedGroup.summary.score > 0, 'the archived period keeps a readable grade');
});

test('assignments with no gradingPeriod stay visible in the default current bucket', () => {
  const legacy = lesson({ id: 'legacy-1', title: 'Older assignment' });
  delete legacy.gradingPeriod;

  const withoutSettings = build({ assignments: [legacy], tracker: { 'legacy-1': workedTracker } });
  assert.equal(withoutSettings.periodGroups.length, 1);
  assert.equal(withoutSettings.periodGroups[0].period.id, FALLBACK_GRADING_PERIOD_ID);
  assert.equal(withoutSettings.periodGroups[0].period.isCurrent, true);
  assert.equal(withoutSettings.periodGroups[0].entries.length, 1);

  // With periods configured, an unstamped assignment joins the current one
  // rather than forming a second "current" group beside it.
  const withSettings = build({
    assignments: [legacy], tracker: { 'legacy-1': workedTracker }, gradingPeriodSettings: periodSettings,
  });
  assert.equal(withSettings.periodGroups.length, 1);
  assert.equal(withSettings.currentPeriod.id, '2026-mp1');
  assert.equal(resolveAssignmentGradingPeriod(legacy, periodSettings).isFallback, true);
});

test('marking-period history never reads or writes assignment.archived', () => {
  const archivedAssignment = lesson({
    archived: true,
    gradingPeriod: { id: '2026-mp0', label: 'Marking Period 0', order: 1 },
  });
  const grouped = groupAssignmentsByGradingPeriod([archivedAssignment], periodSettings);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].period.id, '2026-mp0');
  assert.equal(grouped[0].assignments.length, 1, 'an archived assignment is not a closed marking period');

  // The write a teacher's "move" action applies touches only gradingPeriod.
  assert.deepEqual(
    gradingPeriodAssignmentPatch({ id: '2026-mp1', label: 'Marking Period 1', order: 2 }),
    { gradingPeriod: { id: '2026-mp1', label: 'Marking Period 1', order: 2 } },
  );
  assert.deepEqual(gradingPeriodAssignmentPatch(null), { gradingPeriod: null });

  for (const file of ['gradingPeriods.js', 'studentGradeCenterModel.js']) {
    const source = executableSource(
      readFileSync(new URL(`../../src/platform/student/${file}`, import.meta.url), 'utf8'),
    );
    assert.doesNotMatch(source, /assignment\??\.archived/, `${file} must not read assignment.archived`);
  }
});

test('a current marking period that gets archived stops being current instead of stranding new work', () => {
  const settings = normalizeGradingPeriodSettings({
    periods: [
      { id: 'mp1', label: 'MP1', order: 1 },
      { id: 'mp2', label: 'MP2', order: 2, archived: true },
    ],
    currentPeriodId: 'mp2',
  });
  assert.equal(settings.currentPeriodId, 'mp1');

  // A current id pointing at a period that no longer exists falls back too.
  const orphaned = normalizeGradingPeriodSettings({
    periods: [{ id: 'mp1', label: 'MP1', order: 1 }],
    currentPeriodId: 'deleted',
  });
  assert.equal(orphaned.currentPeriodId, 'mp1');
});

test('the Grade Center only ever shows this student\'s own class assignments', () => {
  const otherClass = lesson({ id: 'other', assignedClassIds: ['class-someone-else'] });
  const gradeCenter = build({
    assignments: [lesson(), otherClass],
    tracker: { 'lesson-1': workedTracker, other: workedTracker },
  });
  assert.equal(findGradeCenterEntry(gradeCenter, 'other'), null);
  assert.equal(gradeCenter.entries.length, 1);
});
