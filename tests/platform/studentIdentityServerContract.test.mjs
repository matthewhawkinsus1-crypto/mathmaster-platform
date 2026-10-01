import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import * as identity from '../../functions/shared/studentIdentity.mjs';
import { buildInspectorModel } from '../../functions/shared/responseInspector.mjs';
import { publicStudentLabel } from '../../functions/shared/classPoints.mjs';
import { displayAliasForStudent } from '../../functions/shared/liveChallengeExperience.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

// The SERVER side of the student-name contract (functions/shared/studentIdentity.mjs).
//
// The defect this guards: the teacher roster projection dropped googleName —
// the only name some Classroom-linked legacy students have — and several
// server writers stored `displayName || studentId`, so teachers saw '101410'
// where a child's name belonged, and that id was then persisted as the name on
// support events, session summaries and recovery rows. The contract:
//
//   * the roster projection is the shared field list and the shared row builder;
//   * every server name copy is a real name or null — never the id;
//   * names are validated server-side wherever a person types one;
//   * a Classroom link never writes, or erases, a name from an unvalidated value;
//   * signing in never creates a nameless roster row;
//   * Firestore rules pin the server-owned identity fields on client writes.
//
// Synthetic names only.

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const server = read('functions/index.js');
const code = executableSource(server);
const callable = (name, end) => region(code, `exports.${name} = onCall(`, end, name);

const HISTORY_FIELDS = [
  'gradesByAssignment', 'assignmentActivity', 'supportUsageByAssignment',
  'dolGradesByAssignment', 'classworkGradesByAssignment', 'teacherGradeOverridesByAssignment',
  'testCycleGrades', 'sectionRecoveryByAssignment',
];

test('the teacher roster projection is the shared field list and the shared row builder', () => {
  const roster = callable('listSignInAccess', 'exports.createStudentAccount');
  assert.match(roster, /db\.collection\("grades"\)\.select\(\.\.\.identity\.TEACHER_ROSTER_SELECT_FIELDS\)\.get\(\)/);
  assert.match(roster, /identity\.buildTeacherRosterSummaryRow\(rosterDoc\.id,/);
  assert.match(roster, /\.sort\(identity\.compareStudentIdentities\)/);
  assert.match(roster, /const identity = await studentIdentity\(\);/);
  // No local name logic left to drift from the shared resolver.
  assert.doesNotMatch(roster, /sortParts|data\.displayName|data\.firstName/);
  // The callable keeps its teacher scoping and the connection-test exclusion.
  assert.match(roster, /rosterDoc\.id !== "test_connection"/);
  assert.match(roster, /isRootAdmin \|\| String\(rosterDoc\.data\(\)\?\.assignedTeacherEmail/);
  assert.match(code, /studentIdentityModule = await import\("\.\/shared\/studentIdentity\.mjs"\)/);
});

test('the shared row builder keeps a googleName-only legacy student named, and an unnamed one unnamed', () => {
  const legacy = identity.buildTeacherRosterSummaryRow('101410', {
    googleName: 'Quinn Samplewood', classId: 'class-a', classPeriod: 'Period 2', assignedTeacherEmail: 't@example.test',
  });
  assert.equal(legacy.displayName, 'Quinn Samplewood');
  assert.equal(legacy.nameMissing, false);
  const nameless = identity.buildTeacherRosterSummaryRow('101411', { displayName: '101411' });
  assert.equal(nameless.displayName, null);
  assert.equal(nameless.nameMissing, true);
});

test('no server name copy falls back to the student id', () => {
  // `studentName: x || studentId`, `displayName: x.name || id`, … anywhere.
  const idFallback = /\b(?:studentName|displayName|googleName|name)\s*:[^,\n}]*\|\|\s*(?:studentId|student\.id|student\.studentId|cleanStudentId|item\.studentId|student|id)\b\s*[,)\n}]/;
  assert.doesNotMatch(code, idFallback);
  const summaryLib = executableSource(read('functions/lib/studentSessionSummary.js'));
  assert.doesNotMatch(summaryLib, /studentName:[^\n]*\|\|\s*student\b/);
  assert.doesNotMatch(summaryLib, /gradeData\.displayName \|\| student/);

  // Every writer that keeps a name copy goes through studentNameForStorage.
  const copies = [
    ['inspectStudentResponse', region(code, 'exports.inspectStudentResponse = onCall(', 'exports.loadStudentCaseEvidence', 'inspectStudentResponse'), /displayName: identity\.studentNameForStorage\(studentIdentityRecord\(identity, studentId, student\)\)/],
    ['overrideStudentAssignmentGrade', region(code, 'exports.overrideStudentAssignmentGrade = onCall(', 'exports.awardClassPoints', 'overrideStudentAssignmentGrade'), /studentName: identity\.studentNameForStorage\(studentIdentityRecord\(identity, studentId, gradeData\)\)/],
    ['buildStudentRecoveryRow', region(code, 'async function buildStudentRecoveryRow(', 'exports.getStudentPersistenceRecoveryReport', 'buildStudentRecoveryRow'), /studentName: identity\.studentNameForStorage\(studentIdentityRecord\(identity, studentId, gradeData\)\)/],
    ['applyWorkspaceDraftRecovery', region(code, 'exports.applyWorkspaceDraftRecovery = onCall(', 'function normalizeTeamsSisStudentId', 'applyWorkspaceDraftRecovery'), /studentName: identity\.studentNameForStorage\(studentIdentityRecord\(identity, studentId, gradeData\)\)/],
  ];
  for (const [label, body, pattern] of copies) {
    assert.match(body, pattern, `${label} must store a real name or null, never the id`);
    assert.match(body, /const identity = await studentIdentity\(\);/, `${label} must load the shared resolver`);
  }
  // The presence archive hands the shared resolver to the CommonJS summary.
  const archive = region(code, 'async function archiveStudentPresenceSnapshot(', 'exports.archiveStudentPresenceSession', 'archive');
  assert.match(archive, /const names = await studentIdentity\(\);/);
  assert.match(archive, /buildMergedSessionSummary\(\{[^}]*\bnames,/);
});

test('the record handed to the resolver carries the identifiers and no attempt history', () => {
  const helper = region(code, 'function studentIdentityRecord(', 'let authorizationModule', 'studentIdentityRecord');
  const record = new Function(`${helper}; return studentIdentityRecord;`)()(identity, '101410', {
    googleName: 'Quinn Samplewood', sisStudentId: '5550101', gradesByAssignment: { a: {} }, assignmentActivity: {},
  });
  assert.deepEqual(record, { studentId: '101410', googleName: 'Quinn Samplewood', sisStudentId: '5550101' });
  assert.equal(identity.studentNameForStorage(record), 'Quinn Samplewood');
  assert.equal(identity.studentNameForStorage(new Function(`${helper}; return studentIdentityRecord;`)()(identity, '101410', { displayName: '101410' })), null);
});

test('session summaries keep a real name or null, never the id', () => {
  const { buildMergedSessionSummary } = require('../../functions/lib/studentSessionSummary.js');
  const base = { studentId: '101410', observedAt: 5_000, live: { assignmentId: 'A1', startedAt: 1_000, name: '101410' } };
  const names = { acceptStudentName: identity.acceptStudentName, studentNameForStorage: identity.studentNameForStorage };

  // The live tile carried the id; the roster has the Google name.
  const named = buildMergedSessionSummary({ ...base, names, gradeData: { googleName: 'Quinn Samplewood' } });
  assert.equal(named.studentName, 'Quinn Samplewood');
  // Nothing usable anywhere — including an id stored by an older build.
  const nameless = buildMergedSessionSummary({ ...base, names, gradeData: {}, previous: { studentName: '101410' } });
  assert.equal(nameless.studentName, null);
  // An earlier real name survives a later snapshot that has none.
  const kept = buildMergedSessionSummary({ ...base, names, gradeData: {}, previous: { studentName: 'Quinn Samplewood' } });
  assert.equal(kept.studentName, 'Quinn Samplewood');
  // A real live name wins.
  const live = buildMergedSessionSummary({ ...base, names, live: { ...base.live, name: 'Rowan Exampleton' }, gradeData: {} });
  assert.equal(live.studentName, 'Rowan Exampleton');
  // Without the resolver, nothing is copied — and certainly not the id.
  assert.equal(buildMergedSessionSummary({ ...base, gradeData: { displayName: 'Quinn Samplewood' } }).studentName, null);
});

test('the response inspector shows the name or "Name unavailable", and the id only as an id', () => {
  const model = (student) => buildInspectorModel({ assignment: { id: 'a1' }, question: {}, student, record: {} });
  assert.equal(model({ id: '101410', displayName: 'Rowan Exampleton' }).student.name, 'Rowan Exampleton');
  const nameless = model({ id: '101410', displayName: null }).student;
  assert.equal(nameless.name, identity.STUDENT_NAME_UNAVAILABLE);
  assert.equal(nameless.id, '101410');
  assert.equal(nameless.idLabel, 'ID 101410');
  assert.equal(model({ id: '101410', displayName: '101410' }).student.name, identity.STUDENT_NAME_UNAVAILABLE);
  assert.equal(model({ id: '101410', googleName: 'Quinn Samplewood' }).student.name, 'Quinn Samplewood');
});

test('class displays never show an id as a name, and keep their short formats', () => {
  assert.equal(publicStudentLabel({ studentId: '101410', displayName: '101410' }), 'A student');
  assert.equal(publicStudentLabel({ studentId: 'S12', firstName: 'S12' }), 'A student');
  assert.equal(publicStudentLabel({ studentId: '101410', googleName: 'Quinn Samplewood' }), 'Quinn S.');
  assert.equal(publicStudentLabel({ displayName: 'Samplewood, Quinn' }), 'Quinn S.');
  assert.equal(publicStudentLabel({ lastName: 'Samplewood' }), 'A student', 'a lone last name is never shown in full');

  const alias = (student, mode = 'firstLastInitial') => displayAliasForStudent({ student, mode, codeAlias: 'Prime Falcon 17' });
  assert.equal(alias({ studentId: '101410', displayName: '101410' }), 'Prime Falcon 17');
  assert.equal(alias({ studentId: 'S12', firstName: 'S12' }, 'firstName'), 'Prime Falcon 17');
  assert.equal(alias({ googleName: 'Quinn Samplewood' }), 'Quinn S.');
  assert.equal(alias({ displayName: 'Samplewood, Quinn' }, 'fullName'), 'Quinn Samplewood');
  // The award call site hands the id over with the record.
  assert.match(code, /points\.publicStudentLabel\(\{ \.\.\.studentRecord, studentId \}\)/);
});

test('names typed by a person are validated on the server', () => {
  const create = callable('createStudentAccount', 'exports.assignStudentToTeacher');
  const validation = create.indexOf('identity.validateStudentNameInput(');
  assert.ok(validation > 0, 'createStudentAccount must validate the name server-side');
  assert.match(create, /if \(!validatedName\.ok\) throw new HttpsError\("invalid-argument", validatedName\.error\);/);
  assert.ok(validation < create.indexOf('batch.set(rosterRef'), 'the name is validated before the roster row is written');
  // A request with no name at all is refused.
  assert.equal(identity.validateStudentNameInput({ firstName: '', lastName: '' }, { studentId: '101410' }).ok, false);
  assert.equal(identity.validateStudentNameInput({ firstName: '101410', lastName: 'Samplewood' }, { studentId: '101410' }).ok, false);

  const setName = callable('setStudentName', 'exports.retryLiveChallengeAchievementJobs');
  assert.match(setName, /await requireTeacher\(request\);/);
  assert.match(setName, /identity\.validateStudentNameInput\(/);
  assert.match(setName, /if \(!validatedName\.ok\) throw new HttpsError\("invalid-argument", validatedName\.error\);/);
});

test('setStudentName is authorized like setStudentSisId and writes only the name and its provenance', () => {
  const setName = callable('setStudentName', 'exports.retryLiveChallengeAchievementJobs');
  // Authorization: root admin, roster teacher, or the class's teacher of record.
  assert.match(setName, /request\.auth\?\.token\?\.rootAdmin === true && authLib\.isRootAdminEmail\(email\)/);
  assert.match(setName, /String\(student\.assignedTeacherEmail \|\| ""\)\.trim\(\)\.toLowerCase\(\) === email/);
  assert.match(setName, /teacherOfRecord \|\| ""\)\.trim\(\)\.toLowerCase\(\) === email/);
  assert.ok(setName.indexOf('permission-denied') < setName.indexOf('transaction.update('), 'authorization runs before the write');

  // The read is a field mask over identity and authorization fields only.
  assert.match(setName, /transaction\.getAll\(studentRef, \{ fieldMask: readMask \}\)/);
  assert.match(setName, /const readMask = \[\.\.\.identity\.STUDENT_IDENTITY_FIELDS, "assignedTeacherEmail", "classId", "sisStudentId", "status"\];/);
  assert.doesNotMatch(setName, /studentRef\.get\(\)|transaction\.get\(studentRef\)/);

  // The update touches exactly these keys.
  const update = region(setName, 'transaction.update(studentRef, {', '});', 'name update');
  const keys = [...update.matchAll(/^\s*(?:\.\.\.(\w+)|(\w+):)/gm)].map((match) => match[1] ? `...${match[1]}` : match[2]);
  assert.deepEqual(keys.sort(), ['...next', 'identityBackfill', 'nameUpdatedAt', 'nameUpdatedBy'].sort());
  assert.match(update, /identityBackfill: FieldValue\.delete\(\)/);
  const next = region(setName, 'const next = {', '};', 'next name');
  const nextKeys = [...next.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]);
  assert.deepEqual(nextKeys, ['firstName', 'lastName', 'displayName']);
  for (const field of HISTORY_FIELDS) assert.doesNotMatch(setName, new RegExp(`\\b${field}\\b`));

  // Audited in the same transaction.
  assert.match(setName, /transaction\.set\(auditRef, \{[\s\S]*action: "student_name_set",[\s\S]*target: studentId,[\s\S]*details: \{ previous, next \}/);
});

test('Classroom link callables never write — or erase — a name from an unvalidated value', () => {
  const single = callable('linkStudentToClassroom', 'exports.linkClassroomRosterBatch');
  const batch = callable('linkClassroomRosterBatch', 'exports.ensureClassroomTopics');
  for (const [label, body] of [['linkStudentToClassroom', single], ['linkClassroomRosterBatch', batch]]) {
    // In every write, the only literal googleName/googleEmail/name/email left
    // is the replaced-link cleanup; every other one is the validated helper.
    const writes = [...body.matchAll(/\.set\(\s*(?:[^,]*?,\s*)?\{[\s\S]*?\{ merge: true \}/g)].map(([text]) => text);
    assert.ok(writes.length >= 2, `${label}: expected its roster-link and grades writes`);
    const literal = writes.flatMap((write) => [...write.matchAll(/\b(googleName|googleEmail|name|email):\s*([^,\n]+)/g)])
      .filter(([, , value]) => !value.startsWith('FieldValue.delete()'));
    assert.deepEqual(literal.map(([text]) => text), [], `${label} must not copy a raw Classroom name or email`);
    assert.match(body, /classroomGoogleIdentityFields\([\s\S]*?\{ nameField: "googleName", emailField: "googleEmail" \},?\s*\)/);
    assert.match(body, /classroomGoogleIdentityFields\([\s\S]*?\{ nameField: "name", emailField: "email" \},?\s*\)/);
  }
  // The replaced-link safeguard is still there.
  assert.match(batch, /googleName: FieldValue\.delete\(\)/);

  // And the helper itself, run against the real resolver.
  const helper = region(code, 'function classroomGoogleIdentityFields(', 'exports.linkStudentToClassroom', 'helper');
  const DELETE = Symbol('delete');
  const fieldsFor = new Function('FieldValue', `${helper}; return classroomGoogleIdentityFields;`)({ delete: () => DELETE });
  const grades = { nameField: 'googleName', emailField: 'googleEmail' };
  const input = { studentId: '101410', googleUserId: 'g-quinn' };
  assert.deepEqual(fieldsFor(identity, { ...input, name: 'Quinn Samplewood', email: 'quinn@example.test' }, grades), {
    googleName: 'Quinn Samplewood', googleEmail: 'quinn@example.test',
  });
  // A blank, id or email "name" never overwrites the one on file…
  for (const name of ['', null, '101410', 'quinn@example.test', 'Student']) {
    assert.deepEqual(fieldsFor(identity, { ...input, name, email: '', previousGoogleUserId: 'g-quinn' }, grades), {});
  }
  // …unless the link moved the record to a different Google account.
  assert.deepEqual(fieldsFor(identity, { ...input, name: '', email: '', previousGoogleUserId: 'g-someone-else' }, grades), {
    googleName: DELETE, googleEmail: DELETE,
  });
});

test('studentSignIn creates the Auth user without the id as its display name', () => {
  const signIn = callable('studentSignIn', 'exports.resetStudentPasscode');
  assert.match(signIn, /await getAuth\(\)\.createUser\(\{ uid \}\);/);
  assert.doesNotMatch(signIn, /createUser\([^)]*displayName/);
});

test('signing in never creates a roster row', () => {
  const resolve = callable('resolveSignedInRole', 'exports.linkGoogleAccount');
  assert.doesNotMatch(resolve, /ensureStudentRecord|collection\("grades"\)[^;]*\.(?:set|create)\(/);
  assert.equal((resolve.match(/await readStudentRosterPresence\(db, /g) || []).length, 2, 'both student branches only read');
  assert.match(resolve, /if \(!record\.exists\) throw new HttpsError\("failed-precondition", STUDENT_NOT_ON_ROSTER_MESSAGE\);/);
  assert.match(resolve, /if \(!record\.exists\) return \{ role: null, needsLink: true, email \};/);
  const presence = region(code, 'async function readStudentRosterPresence(', 'const STUDENT_NOT_ON_ROSTER_MESSAGE', 'presence');
  assert.match(presence, /db\.getAll\([\s\S]*\{ fieldMask: \["classPeriod", "status"\] \}/);
  assert.doesNotMatch(presence, /\.(?:set|create|update)\(/);
  assert.doesNotMatch(code, /function ensureStudentRecord/);
});

test('unlinking a Google account never creates a ghost roster row', () => {
  const unlink = callable('unlinkStudentAccount', 'exports.issueClassJoinCode');
  assert.doesNotMatch(unlink, /collection\("grades"\)\.doc\(studentId\)\.set\(/);
  assert.match(unlink, /const rosterRow = await readStudentRosterPresence\(db, studentId\);\s*if \(rosterRow\.exists\) \{\s*await db\.collection\("grades"\)\.doc\(studentId\)\.update\(\{ linkedEmail: FieldValue\.delete\(\) \}\);/);
});

test('firestore.rules pins exactly the shared server-owned identity fields on client writes', () => {
  const rules = read('firestore.rules');
  const list = region(rules, 'function serverOwnedIdentityFields() {', '];', 'rules list');
  const fields = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...fields].sort(), [...identity.SERVER_OWNED_IDENTITY_FIELDS].sort());
  assert.match(rules, /function studentIdentityUnchanged\(\) \{\s*return !request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasAny\(serverOwnedIdentityFields\(\)\);/);
  assert.match(rules, /function studentIdentityAbsentOnClientCreate\(\) \{\s*return !request\.resource\.data\.keys\(\)\.hasAny\(serverOwnedIdentityFields\(\)\);/);
  const grades = region(rules, 'match /grades/{studentId} {', 'match /supportProfileRevisions/', 'grades rules');
  const update = region(grades, 'allow update:', 'allow create:', 'grades update');
  const create = region(grades, 'allow create:', 'allow delete:', 'grades create');
  assert.match(update, /&& studentIdentityUnchanged\(\)/);
  assert.match(create, /&& studentIdentityAbsentOnClientCreate\(\)/);
});
