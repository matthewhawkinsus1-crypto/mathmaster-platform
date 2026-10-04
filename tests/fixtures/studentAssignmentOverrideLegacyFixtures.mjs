// THE REAL LEGACY SHAPES of a student's controls on a shared assignment.
//
// Each student below is one shape some release of the platform actually wrote
// onto `assignments/{id}`, keyed by student id (functions/shared/
// studentAssignmentOverrides.mjs reads every one of them). One assignment
// carries them all. Shared by the unit suite
// (tests/platform/studentAssignmentOverrides.test.mjs) and the emulator
// rehearsal of the staged migration
// (scripts/rehearse-student-assignment-overrides-migration.mjs), so both
// prove the same fixtures.

export const CLASS_ID = 'class-a';
export const TEACHER = 'teacher.a@example.test';

export const LEGACY_V1_DUE_ONLY = 'S_V1'; // pre-rewrite attendance extension: `dueAt` was the final cutoff
export const LEGACY_V2_FULL_EXTENSION = 'S_V2'; // pre-#415: absence dates and the granting teacher on the shared doc
export const LEGACY_V3_STUB = 'S_V3'; // post-#415 stub
export const LEGACY_V4_FLAGS = 'S_V4'; // excused + reopened on the entry
export const LEGACY_V5_ARRAYS = 'S_V5'; // excusedStudentIds / reopenedStudentIds
export const LEGACY_V6_DOL_OBJECT = 'S_V6'; // DOL grant object + recovery audit (class-less entry id)
export const LEGACY_V7_DOL_NUMBER = 'S_V7'; // DOL grant as a bare number
export const LEGACY_V8_EVERYTHING = 'S_V8'; // every control at once
export const NO_CONTROLS = 'S_NONE';

export const ALL_STUDENTS = [
  LEGACY_V1_DUE_ONLY, LEGACY_V2_FULL_EXTENSION, LEGACY_V3_STUB, LEGACY_V4_FLAGS, LEGACY_V5_ARRAYS,
  LEGACY_V6_DOL_OBJECT, LEGACY_V7_DOL_NUMBER, LEGACY_V8_EVERYTHING, NO_CONTROLS,
];

export const legacyAssignment = () => ({
  id: 'A1',
  title: 'Systems of equations',
  assignedClassIds: [CLASS_ID],
  releaseAt: '2026-09-14T13:00:00.000Z',
  dueAt: '2026-09-18T23:59:59.000Z',
  lateDueAt: '2026-09-25T23:59:59.000Z',
  studentOverrides: {
    [LEGACY_V1_DUE_ONLY]: { dueAt: '2026-09-30' },
    [LEGACY_V2_FULL_EXTENSION]: {
      lateDueAt: '2026-10-02T23:59:59.000Z',
      extension: {
        dateKey: '2026-10-02', meetingsGranted: 2, meetingsRequested: 2, undetermined: [], resolved: [],
        sourceAbsenceDates: ['2026-09-15', '2026-09-16'], grantedByEmail: TEACHER, grantedAt: 1758000000000,
      },
    },
    [LEGACY_V3_STUB]: { lateDueAt: '2026-10-05T23:59:59.000Z', extension: { dateKey: '2026-10-05', grantedAt: 1758100000000 } },
    [LEGACY_V4_FLAGS]: { excused: true, reopened: true },
    [LEGACY_V8_EVERYTHING]: { lateDueAt: '2026-10-09T23:59:59.000Z', extension: { dateKey: '2026-10-09', grantedAt: 1758200000000 }, excused: true },
  },
  excusedStudentIds: [LEGACY_V5_ARRAYS],
  reopenedStudentIds: [LEGACY_V5_ARRAYS, LEGACY_V8_EVERYTHING],
  dol: {
    enabled: true,
    minutesBeforeEnd: 10,
    attemptGrantsByClassId: { [CLASS_ID]: { extraAttempts: 1, changedAt: '2026-09-16T15:00:00.000Z', changedBy: 'uid-t', reason: 'teacher-dol-recovery' } },
    attemptGrantsByStudentId: {
      [LEGACY_V6_DOL_OBJECT]: { extraAttempts: 2, changedAt: '2026-09-16T15:05:00.000Z', changedBy: 'uid-t', reason: 'teacher-dol-recovery' },
      [LEGACY_V7_DOL_NUMBER]: 3,
      [LEGACY_V8_EVERYTHING]: { extraAttempts: 1, changedAt: '2026-09-16T15:06:00.000Z', changedBy: 'uid-t', reason: 'teacher-dol-recovery' },
    },
    recoveryAudit: [
      {
        id: `grantAttempts:students:${LEGACY_V6_DOL_OBJECT}+${LEGACY_V8_EVERYTHING}:2026-09-16T15:05:00.000Z`,
        action: 'grantAttempts', section: 'dol',
        scope: { type: 'students', studentIds: [LEGACY_V6_DOL_OBJECT, LEGACY_V8_EVERYTHING], classId: null },
        previous: { extraAttemptsByStudent: { [LEGACY_V6_DOL_OBJECT]: 1, [LEGACY_V8_EVERYTHING]: 0 } },
        next: { extraAttemptsByStudent: { [LEGACY_V6_DOL_OBJECT]: 2, [LEGACY_V8_EVERYTHING]: 1 } },
        teacherId: 'uid-t', reason: null, at: '2026-09-16T15:05:00.000Z',
      },
      {
        id: `reopenWindow:class:${CLASS_ID}:2026-09-16T15:30:00.000Z`,
        action: 'reopenWindow', section: 'dol', scope: { type: 'class', classId: CLASS_ID },
        previous: null, next: { dateKey: '2026-09-16' }, teacherId: 'uid-t', reason: null, at: '2026-09-16T15:30:00.000Z',
      },
    ],
  },
});
