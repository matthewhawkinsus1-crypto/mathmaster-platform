/*
 * WHO MAY WRITE WHAT ON `grades/{studentId}`.
 *
 * The grade document is the canonical store for a student's academic record:
 * the question records every grade is computed from, the projections the
 * server derives from them, and the signals that decide when a grade reaches
 * Google Classroom. Server grading (#412) made the server's verdict correct;
 * this list is what makes it STAY the server's verdict once written.
 *
 * firestore.rules cannot import this module, so the rule restates it and a
 * parity test keeps the two equal (tests/platform/gradeDocumentAuthority.test.mjs).
 * The emulator suite (tests/rules/gradeAuthorityRules.test.mjs) iterates these
 * lists, so a field added here is attacked there automatically.
 *
 * Pure. Imported by tests and documentation; nothing here runs in production.
 */

/*
 * THE ONLY FIELD A STUDENT'S OWN DEVICE MAY CHANGE.
 *
 * `assignmentActivity` is engagement time, which only the browser can measure
 * (Student Persistence V3: "the browser saves engagement and activity state").
 * It is not a grade. It is grade-ADJACENT: the Classwork completion rule's
 * minimum-engagement term reads its `totalTimeSeconds`, so it is listed with
 * that caveat in the PR that introduced this module rather than hidden.
 *
 * The student rule is an allow-list built from exactly this: every other
 * field — present, future, or misspelled — is refused to a student's client.
 */
export const STUDENT_CLIENT_OWNED_GRADE_FIELDS = Object.freeze(['assignmentActivity']);

/*
 * AUTHORITATIVE GRADE STATE, AND ITS ONLY WRITERS.
 *
 * Every one of these is written by an Admin SDK path (rules bypassed). The
 * teacher of record's client keeps the write authority it had for the repair
 * flows it runs (current-grader credit repair, live question corrections,
 * Repair from Library, assignment deletion) on the first group; the second
 * group is refused to every client, teachers and the root administrator
 * included.
 */
export const SERVER_OWNED_GRADE_FIELDS = Object.freeze([
  // Canonical question records: status, attempts, credit, parts, submission
  // identity. Written by ingestStudentSubmissions, the checkpoint finalizer,
  // Response Inspector replay and content upgrades. Read by Classroom
  // passback, the Grade Center, the teacher gradebook, Grade Transfer, and
  // ingestion's own attempt policy.
  'gradesByAssignment',
  // Classwork completion; opens the next assignment through prerequisiteAccess.
  'classworkGradesByAssignment',
  // The DOL section projection per instructional date.
  'dolGradesByAssignment',
  // Accumulated accommodations/modifications; the gradebook's MOD marking.
  'supportUsageByAssignment',
  // Passback control: choose the Classroom stage (final, due-checkpoint,
  // assessment release) and force a retry.
  'classroomReleaseSignals',
  // Receipts the passback triggers write after Google Classroom accepts a grade.
  'classroomSyncStatusByAssignment',
  'classroomSectionSyncStatusByAssignment',
]);

/* Refused to every client, including the teacher of record (pinned since earlier PRs). */
export const SERVER_ONLY_GRADE_FIELDS = Object.freeze([
  'testCycleGrades',
  'teacherGradeOverridesByAssignment',
  'sectionRecoveryByAssignment',
  'warmupChallengeByAssignment',
]);

/*
 * A row a student creates for themselves must not be born holding grade state:
 * each of these is absent or an empty map on a student's create.
 */
export const GRADE_FIELDS_EMPTY_ON_STUDENT_CREATE = Object.freeze([
  ...SERVER_OWNED_GRADE_FIELDS,
  ...SERVER_ONLY_GRADE_FIELDS,
]);

/*
 * EVERYTHING A ROW A STUDENT CREATES FOR THEMSELVES MAY CONTAIN.
 *
 * The update rule's allow-list, for the one moment there is no prior document
 * to diff against: the roster placement a student create has always carried
 * (pinned by the update rule from then on), the support-profile slot (which
 * must be empty), the client-owned engagement field, and the grade maps above
 * (which must be empty). Any other field — a projection added later, a
 * misspelling, a name nothing reads yet — is refused on create too.
 */
export const STUDENT_CREATE_FIELDS = Object.freeze([
  'classId', 'classPeriod', 'assignedTeacherEmail', 'status', 'profile',
  ...STUDENT_CLIENT_OWNED_GRADE_FIELDS,
  ...GRADE_FIELDS_EMPTY_ON_STUDENT_CREATE,
]);
