// STUDENT PRIVACY ON SHARED ASSIGNMENTS (PR #407 deep dive F-PRIV-1).
//
// `assignments/{id}` is readable by every signed-in user and every student's
// device received the whole collection. Until this change:
//   - an attendance extension published the student's absence dates, meeting
//     counts and the granting teacher on that shared document;
//   - Duplicate and the content-release callable copied every student's
//     overrides and every class's DOL/Warm-Up runtime state into the copy
//     (and Duplicate failed outright for any assignment with an extension,
//     because the create rule refuses `studentOverrides`);
//   - permanently deleting a student left their overrides behind.
// These tests pin the rule (functions/shared/assignmentPrivacy.mjs) and the
// places that must apply it. Rules behaviour is in
// tests/rules/assignmentPrivacyRules.test.mjs (emulator).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  ATTENDANCE_EXTENSION_GRANTS_COLLECTION,
  SECTION_RUNTIME_STATE_FIELDS,
  SHARED_EXTENSION_KEYS,
  assignmentInstanceStatePaths,
  buildExtensionGrantRecord,
  extensionNeedsMinimizing,
  legacyExtensionGrantId,
  planAssignmentPrivacyMigration,
  planStudentRemovalFromAssignment,
  sanitizeExtensionDetails,
  sharedExtensionStub,
  stripAssignmentInstanceState,
} from '../../functions/shared/assignmentPrivacy.mjs';
import {
  mergeStudentAssignments,
  priorWorkAssignmentIds,
  workedAssignmentKey,
} from '../../src/platform/assignments/studentAssignmentScope.js';
import { analyzeAssignmentCompletion } from '../../src/platform/caseReview/completionAnalysis.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const { prepareContentRelease } = require('../../functions/lib/assignmentContentVersion.js');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// An extension exactly as the teacher's browser built it before this change
// (src/platform/attendance/extensionReconciliation.js buildStudentExtensionPatch).
const legacyExtension = {
  dateKey: '2026-10-08',
  meetingsGranted: 2,
  meetingsRequested: 2,
  undetermined: [],
  resolved: true,
  sourceAbsenceDates: ['2026-10-01', '2026-10-02'],
  grantedByEmail: 'teacher.a@example.test',
  grantedAt: 1759300000000,
};

test('the shared document keeps only the deadline stub — no absence dates, counts or teacher', () => {
  assert.deepEqual(SHARED_EXTENSION_KEYS, ['dateKey', 'grantedAt']);
  const stub = sharedExtensionStub({ dateKey: legacyExtension.dateKey, grantedAt: legacyExtension.grantedAt });
  assert.deepEqual(stub, { dateKey: '2026-10-08', grantedAt: 1759300000000 });
  assert.equal(extensionNeedsMinimizing(stub), false);
  assert.equal(extensionNeedsMinimizing(legacyExtension), true);
  assert.equal(extensionNeedsMinimizing({ dateKey: '2026-10-08', grantedAt: 1, grantedByEmail: 'x@y.z' }), true);
});

test('extension details are an allow-list: unknown keys and malformed values never reach a record', () => {
  const clean = sanitizeExtensionDetails({
    ...legacyExtension,
    note: 'medical appointment',
    sourceAbsenceDates: ['2026-10-02', 'not-a-date', '2026-10-01', '2026-10-01'],
    meetingsGranted: -3,
    resolved: [],
  });
  assert.deepEqual(Object.keys(clean).sort(), ['dateKey', 'meetingsGranted', 'meetingsRequested', 'resolved', 'sourceAbsenceDates', 'undetermined']);
  assert.deepEqual(clean.sourceAbsenceDates, ['2026-10-01', '2026-10-02']);
  assert.equal(clean.meetingsGranted, null);
  assert.equal(clean.resolved, false);
  assert.equal('note' in clean, false);
});

test('a grant record keeps every detail and names who may read it', () => {
  const record = buildExtensionGrantRecord({
    studentId: 'S_A',
    classId: 'class-a',
    assignmentId: 'a1',
    details: legacyExtension,
    lateDueAt: '2026-10-09T04:59:59.999Z',
    previousCutoffMs: 1759100000000,
    grantedByEmail: 'Teacher.A@Example.test ',
    teacherOfRecordEmail: 'teacher.a@example.test',
    grantedAtMs: 1759300000000,
  });
  assert.deepEqual(record.sourceAbsenceDates, ['2026-10-01', '2026-10-02']);
  assert.equal(record.meetingsGranted, 2);
  assert.equal(record.grantedByEmail, 'teacher.a@example.test');
  assert.deepEqual(record.authorizedTeacherEmails, ['teacher.a@example.test']);
  assert.equal(record.lateDueAt, '2026-10-09T04:59:59.999Z');
  assert.equal(ATTENDANCE_EXTENSION_GRANTS_COLLECTION, 'attendanceExtensionGrants');
});

test('migration: every key that leaves the shared document lands in the private record first', () => {
  const assignment = {
    studentOverrides: {
      S_A: { lateDueAt: '2026-10-09T04:59:59.999Z', extension: { ...legacyExtension, unexpectedKey: 'kept verbatim' } },
      S_B: { lateDueAt: '2026-10-09T04:59:59.999Z', extension: { dateKey: '2026-10-08', grantedAt: 5 } },
      S_C: { excused: true },
    },
  };
  const plan = planAssignmentPrivacyMigration({
    assignmentId: 'a1',
    assignment,
    studentsById: { S_A: { classId: 'class-a', assignedTeacherEmail: 'teacher.b@example.test' } },
  });
  assert.equal(plan.alreadyMinimal, 1, 'a stub is left alone');
  assert.equal(plan.minimize.length, 1);
  const [entry] = plan.minimize;
  assert.equal(entry.studentId, 'S_A');
  assert.equal(entry.grantId, legacyExtensionGrantId('a1'));
  assert.equal(entry.createGrant, true);
  assert.deepEqual(entry.stub, { dateKey: '2026-10-08', grantedAt: 1759300000000 });
  // Nothing discarded: the verbatim original, every key, is in the record.
  Object.keys(assignment.studentOverrides.S_A.extension).forEach((key) => {
    assert.deepEqual(entry.grantRecord.legacyExtension[key], assignment.studentOverrides.S_A.extension[key], key);
  });
  assert.equal(entry.grantRecord.lateDueAt, '2026-10-09T04:59:59.999Z');
  assert.deepEqual(entry.grantRecord.authorizedTeacherEmails, ['teacher.a@example.test', 'teacher.b@example.test']);
});

test('migration is idempotent: an already-stubbed document plans nothing; an existing record is never rewritten', () => {
  const stubbed = { studentOverrides: { S_A: { lateDueAt: 'x', extension: sharedExtensionStub({ dateKey: '2026-10-08', grantedAt: 1 }) } } };
  assert.equal(planAssignmentPrivacyMigration({ assignmentId: 'a1', assignment: stubbed }).minimize.length, 0);
  const partial = planAssignmentPrivacyMigration({
    assignmentId: 'a1',
    assignment: { studentOverrides: { S_A: { lateDueAt: 'x', extension: legacyExtension } } },
    existingGrantIds: new Set([`S_A/${legacyExtensionGrantId('a1')}`]),
  });
  assert.equal(partial.minimize[0].createGrant, false, 'a re-run after a partial write still strips, but keeps the record it already wrote');
});

test('a copy of an assignment carries its content and none of its instance state', () => {
  const timestamp = { toDate: () => new Date('2026-09-10T00:00:00Z') };
  const source = {
    title: 'Lesson',
    sections: [{ id: 's1' }],
    lessonResources: { generatedAt: timestamp },
    studentOverrides: { S_A: { lateDueAt: 'x', extension: legacyExtension } },
    generationSeats: { version: 1, byClassId: { 'class-a': { lt0123456789abcdef: 0 } } },
    dol: {
      enabled: true,
      minutesBeforeEnd: 10,
      instructionDatesByClassPeriod: { 'Period 1': '2026-10-01' },
      attemptGrantsByStudentId: { S_A: { extraAttempts: 1 } },
      attemptGrantsByClassId: { 'class-a': { extraAttempts: 1 } },
      recoveryAudit: [{ action: 'grant' }],
      recoveryByClassId: { 'class-a': {} },
      earlyUnlocksByClassId: { 'class-a': {} },
      earlyUnlocks: { 'Period 1': true },
      closedByClassId: { 'class-a': true },
      closedByClassPeriod: { 'Period 1': true },
      instructionDatesByClassId: { 'class-a': '2026-10-02' },
      scheduledInstructionDatesByClassId: { 'class-a': '2026-10-01' },
    },
    warmup: {
      enabled: true,
      minutesBeforeStart: 7,
      liveChallenge: { enabled: true, roundCount: 5 },
      closedByClassId: { 'class-a': true },
      autoCloseByClassId: { 'class-a': true },
      instructionDatesByClassId: { 'class-a': '2026-10-02' },
    },
    sectionAccess: { practice: { defaultState: 'closed', overridesByClassId: { 'class-a': 'open' }, overridesByClassPeriod: {} } },
  };
  assert.ok(assignmentInstanceStatePaths(source).length > 10);
  const copy = stripAssignmentInstanceState(source);
  assert.deepEqual(assignmentInstanceStatePaths(copy), []);
  // Spelled out, so the check does not depend on the list it is checking.
  assert.equal(copy.studentOverrides, undefined);
  assert.equal(copy.generationSeats, undefined);
  ['attemptGrantsByStudentId', 'recoveryAudit', 'closedByClassId', 'earlyUnlocksByClassId', 'instructionDatesByClassId'].forEach((key) => {
    assert.equal(copy.dol[key], undefined, `dol.${key}`);
  });
  ['closedByClassId', 'autoCloseByClassId', 'instructionDatesByClassId'].forEach((key) => {
    assert.equal(copy.warmup[key], undefined, `warmup.${key}`);
  });
  assert.deepEqual(copy.sectionAccess.practice.overridesByClassId, {});
  // Authored configuration is kept.
  assert.equal(copy.dol.minutesBeforeEnd, 10);
  assert.deepEqual(copy.dol.instructionDatesByClassPeriod, { 'Period 1': '2026-10-01' });
  assert.deepEqual(copy.warmup.liveChallenge, { enabled: true, roundCount: 5 });
  assert.equal(copy.sectionAccess.practice.defaultState, 'closed');
  // Values are not cloned: a Firestore Timestamp survives.
  assert.equal(copy.lessonResources.generatedAt, timestamp);
  // The source is not mutated.
  assert.ok(source.studentOverrides.S_A);
});

test('every per-class or per-student DOL/Warm-Up key the recovery model writes is in the strip list', () => {
  // Read the writer, so a new runtime map added there fails here until it is
  // classified — rather than silently travelling into copies.
  const writer = executableSource(read('src/platform/assessment/assessmentRecovery.js'));
  const runtimeKeys = [...new Set([...writer.matchAll(/\bdol\??\.([A-Za-z]+(?:ByClassId|ByStudentId|ByClassPeriod|Audit))\b/g)].map((match) => match[1]))];
  assert.ok(runtimeKeys.length >= 5, `found ${runtimeKeys.join(', ')}`);
  const stripped = new Set(SECTION_RUNTIME_STATE_FIELDS.dol);
  // instructionDatesByClassPeriod is AUTHORED (the teacher's schedule per period), not runtime state.
  runtimeKeys.filter((key) => key !== 'instructionDatesByClassPeriod').forEach((key) => {
    assert.ok(stripped.has(key), `dol.${key} is written per class/student by the recovery model but would be copied into a duplicate`);
  });
});

test('a content release refuses to be built without the filter, and is built without instance state', () => {
  const sourceAssignment = { id: 'v1', schemaVersion: 5, sections: [], assignmentRevision: 1, studentOverrides: { S_A: { lateDueAt: 'x' } } };
  const reviewedAssignment = { ...sourceAssignment, dol: { enabled: true, closedByClassId: { c: true }, minutesBeforeEnd: 10 } };
  assert.throws(() => prepareContentRelease({ sourceAssignment, reviewedAssignment, familyId: 'f', nextVersion: 2, actorUid: 'u' }), /instance-state filter/);
  const { release } = prepareContentRelease({
    sourceAssignment, reviewedAssignment, familyId: 'f', nextVersion: 2, actorUid: 'u', stripInstanceState: stripAssignmentInstanceState,
  });
  assert.equal('studentOverrides' in release, false);
  assert.equal('closedByClassId' in release.dol, false);
  assert.equal(release.dol.minutesBeforeEnd, 10);
});

test('permanently deleting a student removes their entries from shared assignments; the audit keeps the action, not the id', () => {
  const assignment = {
    studentOverrides: { S_A: { lateDueAt: 'x', extension: legacyExtension }, S_B: { lateDueAt: 'y' } },
    dol: {
      attemptGrantsByStudentId: { S_A: { extraAttempts: 1 }, S_B: { extraAttempts: 2 } },
      recoveryAudit: [
        { action: 'grant-attempts', scope: { type: 'students', studentIds: ['S_A', 'S_B'] }, previous: { extraAttemptsByStudent: { S_A: 0 } }, next: { extraAttemptsByStudent: { S_A: 1 } } },
        { action: 'close-window', scope: { type: 'class', classId: 'class-a' } },
      ],
    },
  };
  const plan = planStudentRemovalFromAssignment({ assignment, studentId: 'S_A', receipt: 'abc123' });
  assert.deepEqual(plan.deletePaths, [['studentOverrides', 'S_A'], ['dol', 'attemptGrantsByStudentId', 'S_A']]);
  assert.deepEqual(plan.recoveryAudit[0].scope.studentIds, ['deleted-student:abc123', 'S_B']);
  assert.deepEqual(plan.recoveryAudit[0].next.extraAttemptsByStudent, { 'deleted-student:abc123': 1 });
  // An entry that never named students gains no fields (Firestore refuses undefined).
  assert.deepEqual(plan.recoveryAudit[1], assignment.dol.recoveryAudit[1]);
  assert.equal(JSON.stringify(plan.recoveryAudit).includes('"S_A"'), false);
  // A student with no entries changes nothing.
  assert.deepEqual(planStudentRemovalFromAssignment({ assignment, studentId: 'S_Z', receipt: 'r' }), { deletePaths: [], recoveryAudit: null });
});

test('a student device reads its class plus earlier-class work by id, each once', () => {
  assert.deepEqual(
    priorWorkAssignmentIds({ gradesByAssignment: { a1: {}, a9: {}, a4: {} }, loadedIds: ['a1'], extraIds: ['a7', ''] }),
    ['a4', 'a7', 'a9'],
  );
  assert.equal(workedAssignmentKey({ b: {}, a: {} }), 'a|b');
  const merged = mergeStudentAssignments(
    [{ id: 'a1', title: 'live', dueAt: '2026-10-02' }],
    [{ id: 'a1', title: 'stale' }, { id: 'a0', title: 'earlier class', dueAt: '2026-09-01' }],
  );
  assert.deepEqual(merged.map((entry) => `${entry.id}:${entry.title}`), ['a0:earlier class', 'a1:live']);
});

test('the case review reads why a deadline moved from the private grants, oldest first', () => {
  const row = { assignmentId: 'a1', status: 'complete', attendanceFinalAtMs: 1760000000000 };
  const completion = analyzeAssignmentCompletion({
    row,
    studentOverride: { lateDueAt: '2026-10-09T04:59:59.999Z', extension: { dateKey: '2026-10-08', grantedAt: 3 } },
    extensionGrants: [
      { assignmentId: 'a1', grantedAtMs: 2000, meetingsGranted: 2, lateDueAt: '2026-10-09T04:59:59.999Z' },
      { assignmentId: 'a1', grantedAtMs: 1000, meetingsGranted: 1, lateDueAt: '2026-10-08T04:59:59.999Z' },
      { assignmentId: 'other', grantedAtMs: 9000, meetingsGranted: 9 },
    ],
  });
  const extension = completion.reopened.attendanceExtension;
  assert.equal(extension.source, 'grant-history');
  assert.deepEqual(extension.grants.map((grant) => grant.meetingsGranted), [1, 2]);
  assert.equal(extension.meetingsGranted, 2);
  assert.equal(extension.grantedAtMs, 2000);
  // Not yet migrated: the stub's legacy details are the fallback.
  const legacy = analyzeAssignmentCompletion({ row, studentOverride: { lateDueAt: 'x', extension: legacyExtension }, extensionGrants: [] });
  assert.equal(legacy.reopened.attendanceExtension.meetingsGranted, 2);
  assert.equal(legacy.reopened.attendanceExtension.source, 'assignment-stub');
});

// --- Wiring: the places that must apply the rule. Anchored to the code that
// does the work, not to names anywhere in a large file (AGENTS.md).

test('the extension callable writes the stub to the shared document and the details to a private grant', () => {
  const callable = executableSource(region(read('functions/index.js'), 'exports.applyStudentAttendanceExtension', 'function trustedResponseInspectionEvidence', 'applyStudentAttendanceExtension'));
  assert.match(callable, /new FieldPath\("studentOverrides", studentId, "extension"\), privacy\.sharedExtensionStub\(/);
  assert.match(callable, /gradeRef\.collection\(privacy\.ATTENDANCE_EXTENSION_GRANTS_COLLECTION\)\.doc\(\)/);
  assert.match(callable, /privacy\.buildExtensionGrantRecord\(/);
  // The browser's object is never spread onto the shared document again.
  assert.doesNotMatch(callable, /\.\.\.extension,/);
});

test('permanent deletion and the content release apply the rule', () => {
  const index = read('functions/index.js');
  const deletion = executableSource(region(index, 'exports.permanentlyDeleteStudent', '// --- OAuth connect flow', 'permanentlyDeleteStudent'));
  assert.match(deletion, /await removeStudentFromAssignmentDocuments\(db, studentId, receipt, deleted\)/);
  const release = executableSource(region(index, 'exports.createAssignmentContentVersion', 'transaction.set(releaseRef, release)', 'createAssignmentContentVersion'));
  assert.match(release, /stripInstanceState: stripAssignmentInstanceState/);
});

test('App: a student listens to their class; Duplicate copies no instance state', () => {
  const app = read('src/App.jsx');
  assert.match(app, /import \{ stripAssignmentInstanceState \} from '\.\.\/functions\/shared\/assignmentPrivacy\.mjs';/);
  const duplicate = executableSource(region(app, 'const handleDuplicateAssignment', 'const handleToggleArchiveAssignment', 'handleDuplicateAssignment'));
  assert.match(duplicate, /\} = stripAssignmentInstanceState\(assignment\);/);
  const listener = executableSource(region(app, 'const studentClassAssignmentsRef = useRef', 'const studentWorkedAssignmentKey', 'assignment listener'));
  // The student branch subscribes to its class and returns before the
  // whole-collection listener is reached.
  const studentBranch = region(listener, "if (user.role === 'student') {", 'const unsubscribe = onSnapshot(', 'student branch');
  assert.match(studentBranch, /return subscribeStudentClassAssignments\(\{/);
  assert.match(studentBranch, /classId: user\.classId/);
  const hydrate = executableSource(region(app, 'const hydrateSession = async', 'hydrateSession();', 'hydrateSession'));
  const studentHydrate = hydrate.slice(hydrate.indexOf("if (session.role !== 'student'"));
  assert.match(studentHydrate, /await fetchStudentAssignments\(\{/);
  assert.doesNotMatch(studentHydrate, /fetchAssignments\(\)/, 'a student session never reads the whole collection');
});
