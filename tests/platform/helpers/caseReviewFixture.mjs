// A synthetic school for the Student Case Review tests. Every name, id, email
// and score here is invented; nothing comes from production.
//
// Student A (S920001, "Avery Sample") covers, in one marking period:
//   high completion / low DOL · repeated retries · attempts exhausted · strong
//   improvement after retry · Standard + Modified work · individualized extra
//   time · missing historical engagement · support evidence present · a late
//   assignment · Practice Mode · an attendance extension · an imported
//   gradebook with matched, unmatched and missing items and no weights.
// Student B (S920002, "Blake Sample") covers: incomplete assignments, no support
//   profile (support evidence absent / not recorded), and per-attempt evidence
//   that could not be loaded.

import { buildSupportProjection } from '../../../functions/shared/supportProfileModel.mjs';
import { epochMinuteOf } from '../../../functions/shared/supportEvidenceModel.mjs';

export const NOW = Date.parse('2026-10-12T15:00:00Z');
export const TEACHER = 'teacher.case@example.test';
export const settings = {
  periods: [{ id: 'mp1', label: '1st Marking Period', order: 1, archived: true }, { id: 'mp2', label: '2nd Marking Period', order: 2 }],
  currentPeriodId: 'mp2',
};
const MP2 = { id: 'mp2', label: '2nd Marking Period', order: 2 };

const q = (id, role, code, extra = {}) => ({ questionId: id, activityRole: role, type: 'algebra', prompt: `Prompt ${id}`, standards: { primary: [code] }, ...extra });
const lesson = (id, title, dueAt, extra = {}) => ({
  id,
  title,
  schemaVersion: 5,
  assignedClassIds: ['class-a'],
  releaseAt: `${dueAt}T08:00:00-05:00`,
  dueAt,
  gradingPeriod: MP2,
  sections: [
    { id: `${id}-wu`, role: 'warmup', questions: [q(`${id}-w1`, 'warmup', 'A.3A')] },
    { id: `${id}-cw`, role: 'classwork', questions: [q(`${id}-c1`, 'classwork', 'A.3A'), q(`${id}-c2`, 'classwork', 'A.3A'), q(`${id}-c3`, 'classwork', 'A.3C')] },
    { id: `${id}-pr`, role: 'practice', questions: [q(`${id}-p1`, 'practice', 'A.3B'), q(`${id}-p2`, 'practice', 'A.3B')] },
    { id: `${id}-dl`, role: 'dol', questions: [q(`${id}-d1`, 'dol', 'A.3A'), q(`${id}-d2`, 'dol', 'A.3C')] },
  ],
  ...extra,
});
// Storage indices for every lesson: w1 0 · c1 1, c2 2, c3 3 · p1 4, p2 5 · d1 6, d2 7.

const extensionGrantedAt = Date.parse('2026-10-07T16:00:00Z');
export const assignments = [
  lesson('L1', 'Lesson 1 — Slope (synthetic)', '2026-09-15'),
  lesson('L2', 'Lesson 2 — Intercepts (synthetic)', '2026-09-22'),
  lesson('L3', 'Lesson 3 — Writing equations (synthetic)', '2026-09-29'),
  lesson('L4', 'Lesson 4 — Systems (synthetic)', '2026-10-06', { lateDueAt: '2026-10-10' }),
  lesson('L5', 'Lesson 5 — Inequalities (synthetic)', '2026-10-08', {
    studentOverrides: { S920001: { lateDueAt: '2026-10-15', extension: { dateKey: '2026-10-07', meetingsGranted: 2, grantedAt: extensionGrantedAt, grantedByEmail: TEACHER } } },
  }),
  lesson('L6', 'Lesson 6 — Functions (synthetic)', '2026-10-01'),
  { ...lesson('LIB', 'Lesson 1 — Slope (synthetic)', '2026-09-15'), assignedClassIds: [] },
];

const at = (iso) => new Date(iso).toISOString();
const record = (status, attemptCount, totalAttempts, iso, extra = {}) => ({
  status, attemptCount, totalAttempts, variantIndex: 0, partialCredit: status === 'correct' ? 100 : 0, bestPartialCredit: status === 'correct' ? 100 : 0,
  lastAttemptAt: at(iso), academicOccurredAt: at(iso), submissionOrigin: 'server-ingestion', ...extra,
});

// --- Student A ---------------------------------------------------------------------------------

const rev = {
  id: 'rev-a1', revisionId: 'rev-a1', revision: 1, status: 'active', effectiveStart: '2026-08-17', effectiveEnd: null,
  sourceLabel: 'IEP — annual review (synthetic)', createdByEmail: TEACHER, createdAtMs: Date.parse('2026-08-17T14:00:00Z'),
  inclusionStatus: false,
  accommodations: [
    { id: 'extra-time', params: { dueDateExtension: { mode: 'school-days', value: 1 } }, appliesTo: [] },
    { id: 'text-to-speech', params: {}, appliesTo: [] },
    { id: 'check-for-understanding', params: {}, appliesTo: [] },
    { id: 'repeat-instructions', params: {}, appliesTo: [] },
  ],
  modifications: [{ id: 'reduce-complexity', params: {}, appliesTo: [] }],
  serviceExpectations: [{ serviceType: 'inclusion-support', minutesPerWeek: 60 }],
};

export const studentA = {
  id: 'S920001',
  sisStudentId: '920001',
  classId: 'class-a',
  firstName: 'Avery',
  lastName: 'Sample',
  displayName: 'Avery Sample',
  assignedTeacherEmail: TEACHER,
  profile: buildSupportProjection({ revisions: [rev], todayKey: '2026-10-12' }),
  gradesByAssignment: {
    // High instruction, low DOL; retries that end correct; exhausted DOL.
    L1: {
      0: record('correct', 1, 1, '2026-09-15T14:05:00Z'),
      1: record('correct', 1, 1, '2026-09-15T14:10:00Z'),
      2: record('correct', 3, 3, '2026-09-15T14:20:00Z'),
      3: record('correct', 2, 2, '2026-09-15T14:30:00Z'),
      4: record('correct', 1, 1, '2026-09-15T14:35:00Z', { supportUsage: { calculatorUsed: true } }),
      5: record('correct', 1, 1, '2026-09-15T14:40:00Z'),
      6: record('expired', 1, 1, '2026-09-15T14:50:00Z'),
      7: record('expired', 1, 1, '2026-09-15T14:52:00Z'),
    },
    L2: {
      0: record('correct', 1, 1, '2026-09-22T14:05:00Z'),
      1: record('correct', 3, 3, '2026-09-22T14:15:00Z'),
      2: record('correct', 2, 2, '2026-09-22T14:20:00Z'),
      3: record('expired', 3, 3, '2026-09-22T14:30:00Z', { partialCredit: 40, bestPartialCredit: 40, partGrades: [{ id: 'yint', label: 'y-intercept', isComplete: true, isCorrect: false }, { id: 'slope', label: 'slope', isComplete: true, isCorrect: true }] }),
      4: record('correct', 2, 2, '2026-09-23T15:35:00Z'),
      5: record('correct', 1, 1, '2026-09-22T14:40:00Z'),
      6: record('correct', 1, 1, '2026-09-22T14:50:00Z'),
      7: record('expired', 1, 1, '2026-09-22T14:52:00Z'),
    },
    // Modified work, all first-attempt correct (records older than server ingestion).
    L3: Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((index) => [index, { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100, lastAttemptAt: at(`2026-09-29T14:${10 + index}:00Z`) }])),
    // Completed after the individualized due date (extra time moves due to Oct 7).
    L4: Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((index) => [index, record('correct', 1, 1, `2026-10-08T15:${10 + index}:00Z`)])),
    // In progress, still open under the attendance extension.
    L5: { 1: record('attempted', 1, 1, '2026-10-08T14:10:00Z') },
  },
  assignmentActivity: { L1: { totalTimeSeconds: 0 }, L4: { totalTimeSeconds: 900 } },
};

const ev = (assignmentId, questionIndex, attemptNumber, isCorrect, iso, extra = {}) => ({
  eventKey: `ev-${assignmentId}-${questionIndex}-${attemptNumber}`,
  occurredAt: Date.parse(iso),
  alignmentKeys: ['texas:A.3A'],
  questionSnapshot: { questionId: `${assignmentId}-${questionIndex}`, questionType: 'algebra', variantIndex: 0 },
  source: { kind: 'assignment', assignmentId, activityRole: questionIndex === 0 ? 'warmup' : questionIndex <= 3 ? 'classwork' : questionIndex <= 5 ? 'practice' : 'dol', questionIndex },
  performance: { attemptNumber, isCorrect, partialCredit: isCorrect ? 100 : 0, status: isCorrect ? 'correct' : 'attempted' },
  supportUsage: { calculatorUsed: false },
  ...extra,
});

// Per-attempt events exist for L1 and L2 (server-ingested work).
export const caseEvidenceA = {
  schemaVersion: 1,
  attemptEvents: [
    ev('L1', 0, 1, true, '2026-09-15T14:05:00Z'),
    ev('L1', 1, 1, true, '2026-09-15T14:10:00Z'),
    ev('L1', 2, 1, false, '2026-09-15T14:12:00Z'), ev('L1', 2, 2, false, '2026-09-15T14:15:00Z'), ev('L1', 2, 3, true, '2026-09-15T14:20:00Z'),
    ev('L1', 3, 1, false, '2026-09-15T14:25:00Z'), ev('L1', 3, 2, true, '2026-09-15T14:30:00Z'),
    ev('L1', 4, 1, true, '2026-09-15T14:35:00Z', { supportUsage: { calculatorUsed: true } }),
    ev('L1', 5, 1, true, '2026-09-15T14:40:00Z'),
    ev('L1', 6, 1, false, '2026-09-15T14:50:00Z'),
    ev('L1', 7, 1, false, '2026-09-15T14:52:00Z'),
    ev('L2', 0, 1, true, '2026-09-22T14:05:00Z'),
    ev('L2', 1, 1, false, '2026-09-22T14:08:00Z'), ev('L2', 1, 2, false, '2026-09-22T14:10:00Z'), ev('L2', 1, 3, true, '2026-09-22T14:15:00Z'),
    ev('L2', 2, 1, false, '2026-09-22T14:18:00Z'), ev('L2', 2, 2, true, '2026-09-22T14:20:00Z'),
    ev('L2', 3, 1, false, '2026-09-22T14:24:00Z'), ev('L2', 3, 2, false, '2026-09-22T14:27:00Z'), ev('L2', 3, 3, false, '2026-09-22T14:30:00Z'),
    // Practice question 4: incorrect in class, corrected the next day (a return).
    ev('L2', 4, 1, false, '2026-09-22T14:33:00Z'), ev('L2', 4, 2, true, '2026-09-23T15:35:00Z'),
    ev('L2', 5, 1, true, '2026-09-22T14:40:00Z'),
    ev('L2', 6, 1, true, '2026-09-22T14:50:00Z'),
    ev('L2', 7, 1, false, '2026-09-22T14:52:00Z'),
  ],
  receipts: { L4: { total: 9, accepted: 8, notCountedAfterClose: 1, lastNotCountedAtMs: Date.parse('2026-10-11T15:00:00Z'), notCountedSectionClosed: 0, practicePassExcused: 0, other: 0 } },
  practice: { L1: { questionsPracticed: 2, attempts: 3, correct: 1, questionIndexes: [6, 7], lastPracticeAtMs: Date.parse('2026-09-20T23:00:00Z'), clock: 'student-device' } },
  overrideAudits: [{ at: Date.parse('2026-09-24T19:00:00Z'), assignmentId: 'L2', questionIndex: 3, previousScore: 40, newScore: 40, reason: 'Partial credit awarded', note: '', actorEmail: TEACHER }],
  truncated: { events: false, audits: false },
};

const minute0 = epochMinuteOf(Date.parse('2026-09-22T14:00:00Z'));
export const engagementA = [
  { assignmentId: 'L2', utcDay: 1, minutes: [...Array.from({ length: 25 }, (_, index) => minute0 + index), ...Array.from({ length: 10 }, (_, index) => minute0 + 60 * 25 + index)] },
];

const sev = (overrides) => ({ id: `se-${Math.random().toString(36).slice(2)}`, studentId: 'S920001', classId: 'class-a', classification: 'accommodation', actorType: 'student', source: 'automatic-telemetry', ...overrides });
export const evidenceA = [
  sev({ assignmentId: 'L2', supportId: 'text-to-speech', eventType: 'available', occurredAtMs: Date.parse('2026-09-22T14:00:00Z') }),
  sev({ assignmentId: 'L2', supportId: 'text-to-speech', eventType: 'used', questionIndex: 1, occurredAtMs: Date.parse('2026-09-22T14:07:00Z') }),
  sev({ assignmentId: 'L3', supportId: 'reduce-complexity', classification: 'modification', eventType: 'provided', actorType: 'system', questionIndex: 1, occurredAtMs: Date.parse('2026-09-29T14:00:00Z') }),
  sev({ id: 'staff-cfu', assignmentId: 'L2', supportId: 'check-for-understanding', eventType: 'teacher-documented', actorType: 'teacher', actorEmail: TEACHER, source: 'teacher-click', occurredAtMs: Date.parse('2026-09-22T14:30:00Z') }),
];
export const serviceLogA = [
  { id: 'svc-1', dateKey: '2026-09-23', minutes: 30, serviceType: 'inclusion-support', providerRole: 'inclusion-teacher', createdByEmail: TEACHER },
];
export const exportSnapshotsA = [
  { classId: 'class-a', assignmentId: 'L1', sectionKey: 'classwork', createdAt: '2026-09-16T12:00:00Z', uploadConfirmedAt: '2026-09-16T13:00:00Z', rows: [{ studentId: 'S920001', sisStudentId: '920001', grade: 100 }], withheld: [] },
  { classId: 'class-a', assignmentId: 'L1', sectionKey: 'dol', createdAt: '2026-09-16T12:00:00Z', uploadConfirmedAt: null, rows: [{ studentId: 'S920001', sisStudentId: '920001', grade: 0 }], withheld: [] },
  { classId: 'class-a', assignmentId: 'L2', sectionKey: 'classwork', createdAt: '2026-09-23T12:00:00Z', uploadConfirmedAt: null, rows: [{ studentId: 'S920001', sisStudentId: '920001', grade: 70 }], withheld: [] },
];
export const sessionSummariesA = [
  { id: 'sess-1', studentId: 'S920001', assignmentId: 'L1', startedAt: Date.parse('2026-09-15T14:01:00Z'), endedAt: Date.parse('2026-09-15T14:55:00Z'), activeSeconds: 0, answered: 8, correct: 6 },
];

// An imported gradebook: two items match the export, one differs, one is not
// MathMaster's, Lesson 3 is absent, and there are no category weights.
export const sisSnapshotA = {
  source: { fileName: 'gradebook-synthetic.csv', layout: 'wide' },
  importedAtMs: NOW - 3600000,
  importedByEmail: TEACHER,
  matchedBy: 'sis-id',
  items: [
    { name: 'Lesson 1 - Classwork', category: 'Daily', score: 100, scoreText: '100', scoreKind: 'number', pointsPossible: 100, weight: null, excused: false, blank: false },
    { name: 'Lesson 1 DOL', category: 'Daily', score: 0, scoreText: '0', scoreKind: 'number', pointsPossible: 100, weight: null, excused: false, blank: false },
    { name: 'Lesson 2 Classwork', category: 'Daily', score: 60, scoreText: '60', scoreKind: 'number', pointsPossible: 100, weight: null, excused: false, blank: false },
    { name: 'Quiz 2 (paper)', category: 'Major', score: 72, scoreText: '72', scoreKind: 'number', pointsPossible: 100, weight: null, excused: false, blank: false },
  ],
  categories: [{ name: 'Daily', weight: null }, { name: 'Major', weight: null }],
  categoryAverages: [],
  officialAverage: 71,
};

// --- Student B ---------------------------------------------------------------------------------

export const studentB = {
  id: 'S920002',
  classId: 'class-a',
  firstName: 'Blake',
  lastName: 'Sample',
  displayName: 'Blake Sample',
  assignedTeacherEmail: TEACHER,
  profile: {},
  gradesByAssignment: {
    L1: { 1: { status: 'correct', attemptCount: 1, totalAttempts: 1, lastAttemptAt: at('2026-09-15T14:10:00Z') }, 2: { status: 'attempted', attemptCount: 1, totalAttempts: 1, lastAttemptAt: at('2026-09-15T14:12:00Z') } },
    L2: { 1: { status: 'correct', attemptCount: 2, totalAttempts: 2, lastAttemptAt: at('2026-09-22T14:12:00Z') } },
  },
  assignmentActivity: {},
};

export const caseInputs = (overrides = {}) => ({
  student: studentA,
  studentName: 'Avery Sample',
  classRecord: { classId: 'class-a', name: 'Algebra I — Period 2 (synthetic)' },
  assignments,
  gradingPeriodSettings: settings,
  selection: { gradingPeriodId: 'mp2', gradingPeriodLabel: '2nd Marking Period' },
  revisions: [rev],
  evidence: evidenceA,
  serviceLog: serviceLogA,
  engagement: engagementA,
  supportSignals: [],
  sessionSummaries: sessionSummariesA,
  exportSnapshots: exportSnapshotsA,
  practicePassKeys: [],
  caseEvidence: caseEvidenceA,
  sisSnapshot: sisSnapshotA,
  nowValue: NOW,
  generatedByEmail: TEACHER,
  ...overrides,
});
