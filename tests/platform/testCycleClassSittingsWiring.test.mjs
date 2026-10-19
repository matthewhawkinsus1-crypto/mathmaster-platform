/*
 * A TEST DAY THE CLASS SAT STAYS A CLOSED WINDOW — the server wiring (student
 * pass 3, wave 7, item 2; docs/handoffs/STUDENT_PASS3_SERVER_FOLLOWUPS.md).
 *
 * RECORD-ONLY in wave 7: the first fresh Test start writes the sitting and
 * nothing reads it (an owner decision decides whether anything ever may; see
 * the handoff). The record is proved in testCycleAvailability.test.mjs and
 * against the emulator in testCycleCertification scenario M. Pinned here:
 * the write happens only after a fresh Test start, can never fail it, and is
 * the only place the collection is touched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';

const server = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));

test('a fresh Test start records the class sitting after it is committed, and never for a Retest or a resume', () => {
  const start = region(server, 'exports.startSecureExamSession = onCall(', '\n});\n', 'startSecureExamSession');
  assert.match(start, /\n\s*entry = await assertCourseTestEntryAllowed\(db, entrySession, studentId\);/);
  const record = region(start, 'if (entry?.schedule', '\n  }\n', 'the sitting write');
  assert.match(record, /entry\.isRetest === false && entrySession\.status === "not_started" && session\.status === "in_progress"/);
  assert.match(record, /await recordClassTestSitting\(db, entry\.shared, \{ assignmentId: entry\.assignmentId, schedule: entry\.schedule \}\);/);
  // After the transaction that starts the Test, not inside it.
  assert.ok(start.indexOf('await recordClassTestSitting(') > start.indexOf('const session = await db.runTransaction('));
  // The gate hands back the schedule it already resolved for the check.
  const gate = region(server, 'async function assertCourseTestEntryAllowed(', '\n}\n', 'assertCourseTestEntryAllowed');
  assert.match(gate, /return \{ shared, assignmentId: String\(courseTest\.assignmentId\), isRetest, schedule \};/);
});

test('the write is create-if-absent and a failure is logged, never thrown', () => {
  const write = region(server, 'async function recordClassTestSitting(', '\n}\n', 'recordClassTestSitting');
  assert.match(write, /\.doc\(sitting\.id\)\.create\(sitting\.data\)/);
  assert.doesNotMatch(write, /\.set\(/, 'never overwrites the first sitting');
  assert.match(write, /\} catch \(error\) \{[\s\S]*return null;\n\s*\}/);
  assert.doesNotMatch(write, /throw /);
});

test('record-only: nothing on the server reads a sitting, and no window resolver takes one', () => {
  // The collection is named in exactly one write and nowhere else.
  const uses = server.split('TEST_CYCLE_CLASS_SITTINGS').length - 1;
  assert.equal(uses, 1, 'one reference: the create in recordClassTestSitting');
  assert.doesNotMatch(server, /testCycleClassSittings/, 'never named as a literal path either');
  // Every resolver call passes the same arguments as before: no sittings.
  [...server.matchAll(/resolve(?:ClassWindows|StudentTestCycleSchedule)\(\{[^}]*\}\)/g)].forEach(([call]) => assert.doesNotMatch(call, /sittings/, call));
  const shared = executableSource(readFileSync(new URL('../../functions/shared/testCycleAvailability.mjs', import.meta.url), 'utf8'));
  const resolver = region(shared, 'export const resolveClassWindows = (', '\n};\n', 'resolveClassWindows');
  assert.doesNotMatch(resolver, /sitting/i);
});

test('the mistake diagnosis is loaded before every transaction that grades, never inside it', () => {
  const preload = 'await secureExamItems.loadMissEvidence();';
  const before = (source, label) => {
    const at = source.indexOf(preload);
    assert.ok(at >= 0, `${label}: loads it`);
    assert.ok(at < source.indexOf('db.runTransaction('), `${label}: before its transaction`);
  };
  before(region(server, 'exports.submitSecureExamResponse = onCall(', '\n});\n', 'submit'), 'submitSecureExamResponse');
  before(region(server, 'exports.finalizeSecureExam = onCall(', '\n});\n', 'finalize'), 'finalizeSecureExam');
  before(region(server, 'async function autoFinalizeSecureSession(', '\n}\n', 'auto finalize'), 'autoFinalizeSecureSession');
  const proctor = region(server, 'exports.proctorExamAction = onCall(', '\n});\n', 'proctor');
  const at = proctor.indexOf('if (action === "forceSubmit") await secureExamItems.loadMissEvidence();');
  assert.ok(at >= 0 && at < proctor.indexOf('db.runTransaction('), 'proctorExamAction: before a force-submit\'s transaction');
  // Every caller that grades inside a transaction is one of those four.
  const graders = [...server.matchAll(/(?<!function )finalizeSecureSessionInTransaction\(transaction|secureExamItems\.buildResponseRecord\(/g)].length;
  assert.equal(graders, 4);
  const items = executableSource(readFileSync(new URL('../../functions/lib/secureExamItems.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(items.slice(0, items.indexOf('function loadMissEvidence')), /correctionMissDiagnosis/, 'not a module-level import');
});
