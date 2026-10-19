// One student's Grades tab, in every state "Ways to raise your grade" and the
// row actions have to tell apart. Shared by the unit tests
// (studentWaysToRaise / studentGradeCenterActions) and the browser harness
// (tests/browser/studentGradesRaiseMain.jsx), so the screen measured in
// Chromium is built from exactly the data the tests reason about.
//
// Synthetic only: no real student, class or assignment.

export const CLASS_ID = 'class-raise';
export const STUDENT_ID = 'student-raise';
export const NOW = Date.parse('2026-09-09T12:00:00.000Z');

const lessonSections = () => [
  { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [{ id: 'w1' }, { id: 'w2' }] },
  { id: 'classwork', role: 'classwork', title: 'Classwork', questions: [{ id: 'c1', questionWeight: 2 }, { id: 'c2' }] },
  { id: 'practice', role: 'practice', title: 'Practice', questions: [{ id: 'p1' }, { id: 'p2' }] },
  { id: 'dol', role: 'dol', title: 'DOL', questions: [{ id: 'd1', questionWeight: 3 }] },
];

const lesson = (id, title, dueAt, lateDueAt, extra = {}) => ({
  id,
  title,
  schemaVersion: 5,
  assignedClassIds: [CLASS_ID],
  dueAt,
  lateDueAt,
  sections: lessonSections(),
  ...extra,
});

export const assignments = [
  // Past due, inside the late window, nothing recorded: Missing, still open.
  lesson('missing-open', 'Slope from Two Points', '2026-09-08T12:00:00.000Z', '2026-09-12T12:00:00.000Z'),
  // Past due, started, inside the late window: Late, in progress.
  lesson('late-progress', 'Graphing Linear Equations', '2026-09-08T12:00:00.000Z', '2026-09-12T12:00:00.000Z'),
  // On time, every question answered: Graded (still open).
  lesson('graded', 'Solving One-Step Equations', '2026-09-10T12:00:00.000Z', '2026-09-12T12:00:00.000Z'),
  // Answered, but the teacher is holding the grade: Pending Grade.
  lesson('pending', 'Writing Expressions', '2026-09-10T12:00:00.000Z', '2026-09-12T12:00:00.000Z'),
  // Excused by the teacher.
  lesson('excused', 'Order of Operations', '2026-09-08T12:00:00.000Z', '2026-09-12T12:00:00.000Z', {
    excusedStudentIds: [STUDENT_ID],
  }),
  // Closed with a recorded grade: frozen; only no-credit practice is left.
  lesson('closed', 'Integers on a Number Line', '2026-09-01T12:00:00.000Z', '2026-09-03T12:00:00.000Z'),
  // Not due yet, nothing recorded: Not Started.
  lesson('not-started', 'Two-Step Equations', '2026-09-15T12:00:00.000Z', '2026-09-17T12:00:00.000Z'),
  // Not released yet: Not Open Yet.
  lesson('locked', 'Inequalities', '2026-09-25T12:00:00.000Z', '2026-09-27T12:00:00.000Z', {
    releaseAt: '2026-09-20T12:00:00.000Z',
  }),
  // On time, partly done: In Progress (counted at its current score).
  lesson('in-progress', 'Distributive Property', '2026-09-14T12:00:00.000Z', '2026-09-16T12:00:00.000Z'),
  // A Test Cycle whose released result asks for corrections.
  {
    id: 'cycle',
    title: 'Unit 2 Test',
    schemaVersion: 5,
    assignedClassIds: [CLASS_ID],
    dueAt: '2026-09-20T12:00:00.000Z',
    lateDueAt: '2026-09-22T12:00:00.000Z',
    assessmentPolicy: { mode: 'testCycle' },
    sections: [{ id: 'review', role: 'review', questions: [{ questionId: 'r1' }, { questionId: 'r2' }] }],
  },
];

const correct = { status: 'correct', attemptCount: 1, totalAttempts: 1 };
const half = { status: 'expired', attemptCount: 3, totalAttempts: 3, bestPartialCredit: 50 };
const wrong = { status: 'expired', attemptCount: 3, totalAttempts: 3, bestPartialCredit: 0 };

// Storage order: w1 w2 c1 c2 p1 p2 d1 (weights 1 1 2 1 1 1 3 = 10).
export const tracker = {
  'late-progress': { 0: correct, 1: half },
  graded: { 0: correct, 1: correct, 2: correct, 3: half, 4: correct, 5: wrong, 6: correct },
  pending: { 0: correct, 1: correct, 2: correct, 3: correct, 4: correct, 5: correct, 6: correct },
  excused: { 0: correct },
  closed: { 0: correct, 1: correct, 2: half, 3: correct, 4: correct, 5: correct, 6: wrong },
  'in-progress': { 0: correct, 1: correct, 2: correct },
};

export const testCycleGrades = {
  cycle: { stage: 'corrections', originalTestGrade: 58, recordedGrade: 58, correctionsTotal: 3, correctionsCompleted: 0 },
};

export const recoverySummariesByAssignment = {
  // Unlocked DOL Recovery on an open, graded lesson.
  graded: [{ section: 'dol', label: 'DOL Recovery', state: 'unlocked', endsAtMs: Date.parse('2026-09-12T12:00:00.000Z') }],
  // Locked Warm-Up Recovery on the in-progress lesson.
  'in-progress': [
    { section: 'warmup', label: 'Warm-Up Recovery', state: 'locked', endsAtMs: Date.parse('2026-09-16T12:00:00.000Z') },
    // Finished Recoveries are not a way to raise anything.
    { section: 'dol', label: 'DOL Recovery', state: 'completed', endsAtMs: Date.parse('2026-09-16T12:00:00.000Z') },
  ],
  // Excused and pending work never offer a way, even with a Recovery summary.
  excused: [{ section: 'dol', label: 'DOL Recovery', state: 'unlocked', endsAtMs: Date.parse('2026-09-12T12:00:00.000Z') }],
  pending: [{ section: 'dol', label: 'DOL Recovery', state: 'unlocked', endsAtMs: Date.parse('2026-09-12T12:00:00.000Z') }],
};

// The shape App's studentPracticePassEligibleAssignments holds.
export const practicePassEligibleAssignments = [
  { assignmentId: 'not-started', title: 'Two-Step Equations', dueAt: '2026-09-15T12:00:00.000Z' },
  // Closed work is never offered here, whatever an upstream filter says.
  { assignmentId: 'closed', title: 'Integers on a Number Line', dueAt: '2026-09-01T12:00:00.000Z' },
];

export const gradeCenterOptions = (overrides = {}) => ({
  assignments,
  classId: CLASS_ID,
  classPeriod: 'Period 2',
  studentId: STUDENT_ID,
  courseLabel: 'Math 8',
  nowValue: NOW,
  tracker,
  testCycleGrades,
  providers: { assignmentHasHeldTeacherFeedback: (assignment) => assignment?.id === 'pending' },
  ...overrides,
});
