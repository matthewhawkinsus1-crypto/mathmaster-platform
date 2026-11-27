// The discipline tracker's callables (functions/disciplineFunctions.js) only
// authorize, load and store: the rules are the pure shared module
// (disciplineTracker.test.mjs) and the form batch (disciplineFormBatch.test.mjs).
// These contracts pin what those cannot: who may call each one, that a tap
// is only for a student on the class's roster, that nothing is ever deleted,
// that a teacher's settings are their own, and that the collections stay
// server-only.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { functionsDeclaration } from './helpers/functionsBackendSource.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const CALLABLES = [
  'recordDisciplineIncident', 'voidDisciplineIncident', 'setDisciplineIncidentDetail', 'listDisciplineIncidents',
  'getDisciplineSettings', 'saveDisciplineSettings', 'submitDisciplineFormsNow', 'resolveDisciplineFormState',
  'queueFamilyMessages', 'resolveFamilyMessage', 'familyMessageOutbox', 'setFamilyMessagingMode',
];
const body = (name) => executableSource(functionsDeclaration(name));
const moduleSource = () => executableSource(readFileSync('functions/disciplineFunctions.js', 'utf8'));

test('every discipline callable is for a signed-in teacher, checked first', () => {
  for (const name of CALLABLES) {
    const source = body(name);
    const teacher = source.indexOf('await requireTeacher(request)');
    assert.ok(teacher > 0, `${name} requires a teacher`);
    const firstCollection = source.search(/\.collection\("discipline|disciplineIncidentAuthority\(|disciplineClassAuthority\(|submitDisciplineForms\(|familyOutbox\./);
    assert.ok(firstCollection > teacher, `${name} checks the teacher before anything else`);
  }
});

test('a class\'s violations are recorded, changed and read only by its teacher of record (or the root administrator)', () => {
  const authority = executableSource(functionsDeclaration('disciplineClassAuthority'));
  assert.match(authority, /const teacherOfRecord = String\(classData\.teacherOfRecord \|\| ""\)\.trim\(\)\.toLowerCase\(\);/);
  assert.match(authority, /if \(!isRootAdmin && \(!email \|\| teacherOfRecord !== email\)\) \{\s*throw new HttpsError\("permission-denied"/);
  assert.match(authority, /request\.auth\?\.token\?\.rootAdmin === true && authLib\.isRootAdminEmail\(email\)/);
  // An incident is checked through its own class.
  assert.match(executableSource(functionsDeclaration('disciplineIncidentAuthority')), /await disciplineClassAuthority\(db, request, snapshot\.data\(\)\?\.classId\)/);
  for (const name of ['voidDisciplineIncident', 'setDisciplineIncidentDetail']) {
    assert.match(body(name), /await disciplineIncidentAuthority\(db, request, request\.data\?\.incidentId\)/, name);
  }
  assert.match(body('resolveDisciplineFormState'), /await disciplineIncidentAuthority\(db, request, id\)/);
});

test('a tap is recorded once, for a student on that class\'s roster, at the server\'s time', () => {
  const source = body('recordDisciplineIncident');
  const roster = source.indexOf('if (!student.exists || student.data()?.classId !== authority.classId) {');
  const write = source.indexOf('transaction.create(ref, record)');
  assert.ok(roster > 0 && write > roster, 'the roster is checked before the write');
  assert.match(source, /const nowMs = Date\.now\(\);/);
  assert.match(source, /occurredAtMs: nowMs,/);
  assert.doesNotMatch(source, /request\.data\?\.(occurredAt|dateKey|teacherOfRecord)/, 'the browser does not choose the time or the owner');
  assert.match(source, /const ref = db\.collection\("disciplineIncidents"\)\.doc\(`\$\{authority\.classId\}_\$\{tapId\}`\);/);
  assert.match(source, /if \(existing\.exists\) return existing\.data\(\);/, 'a retried call records the tap once');
});

test('nothing is ever deleted: an undo marks the tap, and waits while it is being sent', () => {
  assert.doesNotMatch(moduleSource(), /\.delete\(\)|FieldValue\.delete|transaction\.delete|batch\.delete/);
  const source = body('voidDisciplineIncident');
  assert.match(source, /if \(data\.form\?\.state === "sending"\) \{\s*throw new HttpsError\("failed-precondition"/);
  assert.match(source, /voidedAtMs: Date\.now\(\), voidedAt: FieldValue\.serverTimestamp\(\), voidedByEmail: authority\.email/);
});

test('listing reads the caller\'s own classes, and settings are the caller\'s own', () => {
  const list = body('listDisciplineIncidents');
  assert.match(list, /const teacher = authority \? authority\.teacherOfRecord : callerEmail\(request\);/);
  assert.match(list, /\.where\("teacherOfRecord", "==", teacher\)/);
  for (const name of ['getDisciplineSettings', 'saveDisciplineSettings']) {
    assert.match(body(name), /collection\("disciplineSettings"\)\.doc\(email\)/, name);
    assert.match(body(name), /const email = callerEmail\(request\);/, name);
  }
  // The list query has its index.
  const indexes = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')).indexes;
  assert.ok(indexes.some((entry) => entry.collectionGroup === 'disciplineIncidents'
    && JSON.stringify(entry.fields.map((field) => field.fieldPath)) === '["teacherOfRecord","dateKey"]'));
});

test('Send now is scoped to the caller; the schedule sends everyone\'s due violations', () => {
  const now = body('submitDisciplineFormsNow');
  assert.match(now, /const teacherEmail = authority \? authority\.teacherOfRecord : callerEmail\(request\);/);
  assert.match(now, /submitDisciplineForms\(\{\s*db, logger, force: true,\s*scope: \{ teacherEmail,/);
  const scheduled = body('submitDisciplineFormsOnSchedule');
  assert.match(scheduled, /schedule: "every 10 minutes from 07:00 to 18:00",\s*timeZone: "America\/Chicago"/);
  assert.match(scheduled, /submitDisciplineForms\(\{ db: getFirestore\(\), logger \}\)/, 'due violations only (no force)');
});

test('family messages are queued only by the class\'s own teacher of record, not even the root administrator', () => {
  const source = body('queueFamilyMessages');
  const own = source.indexOf('if (authority.teacherOfRecord !== authority.email) {');
  const queue = source.indexOf('familyOutbox.queueFamilyMessages({');
  assert.ok(own > 0 && queue > own, 'checked before anything is queued');
  assert.match(source, /teacherEmail: authority\.email,/);
  assert.doesNotMatch(source, /request\.data\?\.(body|subject|teacherEmail|sisStudentId)/, 'the browser does not write the message or choose whose it is');
});

test('the extension\'s door is the caller\'s own messages only, and the switch is the root administrator\'s', () => {
  const source = body('familyMessageOutbox');
  assert.match(source, /const email = callerEmail\(request\);\s*if \(!email\) throw new HttpsError\("permission-denied"/);
  const calls = [...source.matchAll(/familyOutbox\.([A-Za-z]+)\(\{([^}]*)/g)];
  assert.equal(calls.length, 5, 'status, claim, start, release, report');
  calls.forEach(([, name, args]) => assert.match(args, /teacherEmail: email/, name));
  assert.doesNotMatch(source, /request\.data\?\.teacherEmail/);
  const settings = body('setFamilyMessagingMode');
  const admin = settings.indexOf('await requireRootAdmin(request);');
  assert.ok(admin > 0 && settings.indexOf('familyOutbox.saveMessagingSettings(') > admin);
  // The teacher's decisions are about their own messages too.
  assert.match(body('resolveFamilyMessage'), /teacherEmail: email, messageId:/);
  // The list carries the caller's messages and the switch.
  assert.match(body('listDisciplineIncidents'), /familyOutbox\.listFamilyMessages\(\{ db, teacherEmail: teacher,/);
  const indexes = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')).indexes;
  assert.ok(indexes.some((entry) => entry.collectionGroup === 'familyMessages'
    && JSON.stringify(entry.fields.map((field) => field.fieldPath)) === '["teacherOfRecord","dateKey"]'));
});

test('the discipline collections are server-only in the rules', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  for (const collection of ['disciplineIncidents', 'disciplineSettings', 'disciplineStatus', 'familyMessages']) {
    assert.match(rules, new RegExp(`match /${collection}/\\{[A-Za-z]+\\} \\{ allow read, write: if false; \\}`), collection);
  }
});
