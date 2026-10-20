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

test('the mistake diagnosis starts loading at entry and is awaited before every grading transaction, never inside it', () => {
  // Started before the path's first await (so its cold import overlaps the
  // reads before the transaction), awaited after them and before the
  // transaction (so the transaction never meets an unloaded module).
  const overlapped = (source, label, { start = /const missEvidenceReady = secureExamItems\.loadMissEvidence\(\);/, wait = 'await missEvidenceReady;' } = {}) => {
    const started = source.search(start);
    const firstAwait = source.indexOf('await ');
    const awaited = source.indexOf(wait);
    const transaction = source.indexOf('db.runTransaction(');
    assert.ok(started >= 0, `${label}: starts the load`);
    assert.ok(started < firstAwait, `${label}: before the first await on the path`);
    assert.ok(awaited >= 0 && awaited < transaction, `${label}: awaited before its transaction`);
    assert.ok(source.indexOf(wait) === source.lastIndexOf(wait), `${label}: awaited once`);
  };
  overlapped(region(server, 'exports.submitSecureExamResponse = onCall(', '\n});\n', 'submit'), 'submitSecureExamResponse');
  overlapped(region(server, 'exports.finalizeSecureExam = onCall(', '\n});\n', 'finalize'), 'finalizeSecureExam');
  overlapped(region(server, 'async function autoFinalizeSecureSession(', '\n}\n', 'auto finalize'), 'autoFinalizeSecureSession');
  // Only a force-submit grades: no other proctor action starts the load.
  const proctor = region(server, 'exports.proctorExamAction = onCall(', '\n});\n', 'proctor');
  overlapped(proctor, 'proctorExamAction', {
    start: /const missEvidenceReady = String\(request\.data\?\.action \|\| ""\)\.trim\(\) === "forceSubmit" \? secureExamItems\.loadMissEvidence\(\) : null;/,
    wait: 'if (missEvidenceReady) await missEvidenceReady;',
  });
  // Nowhere is the load awaited at its call: every use is started, then awaited.
  assert.doesNotMatch(server, /await secureExamItems\.loadMissEvidence\(\)/);
  // Every caller that grades inside a transaction is one of those four.
  const graders = [...server.matchAll(/(?<!function )finalizeSecureSessionInTransaction\(transaction|secureExamItems\.buildResponseRecord\(/g)].length;
  assert.equal(graders, 4);
  const items = executableSource(readFileSync(new URL('../../functions/lib/secureExamItems.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(items.slice(0, items.indexOf('function loadMissEvidence')), /correctionMissDiagnosis/, 'not a module-level import');
  // A floating promise is safe only because the load never rejects.
  assert.match(region(items, 'function loadMissEvidence() {', '\n}\n', 'loadMissEvidence'), /import\('\.\.\/shared\/correctionMissDiagnosis\.mjs'\)\.catch\(\(\) => \{/);
});
