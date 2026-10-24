/*
 * A TEST DAY THE CLASS SAT STAYS A CLOSED WINDOW — the server wiring (student
 * pass 3, wave 7, item 2; docs/handoffs/STUDENT_PASS3_SERVER_FOLLOWUPS.md).
 *
 * Wave 7 recorded the sitting and read it nowhere. The owner decided
 * (2026-10-20, W7-6 decision 1, option b): THE TEACHER DECIDES. The teacher's
 * panel names a sitting recorded on a stranded day, and only the teacher's
 * `countClassSitting` copies its times onto the class's window. Pinned here:
 * the write happens only after a fresh Test start and can never fail it; the
 * collection is read only by id, by the panel and by that action; and no
 * window resolver takes a sitting (it reads the teacher's `held` decision).
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

test('the teacher decides: a sitting is read only by id, by the panel and by countClassSitting; no resolver takes one', () => {
  // Named four times: the create, the panel's read of stranded days, the
  // action's read, and the one lookup that finds them to delete them (TC04).
  const uses = server.split('TEST_CYCLE_CLASS_SITTINGS').length - 1;
  assert.equal(uses, 4, 'the create, the panel, the count action, the delete cleanup');
  assert.doesNotMatch(server, /testCycleClassSittings/, 'never named as a literal path either');
  // Never queried to decide anything: every read names one document. The one
  // lookup by assignment is the cleanup's, and it is held to its own contract below.
  const cleanup = region(server, 'async function classSittingRefsOf(', '\n}\n', 'classSittingRefsOf');
  [...server.replace(cleanup, '').matchAll(/collection\((?:shared\.schedule|sched)\.TEST_CYCLE_CLASS_SITTINGS\)([^;\n]*)/g)].forEach(([, rest]) => {
    assert.match(rest, /^\.doc\(/, `read by id: ${rest}`);
  });
  const panel = region(server, 'async function teacherTestCycleSchedule(', 'const lateDue = shared.schedule.defaultFollowUpClose(assignment, timeZone);', 'teacherTestCycleSchedule');
  assert.match(panel, /const sittingIdOf = \(\{ classId, test \}\) => \(test\.stranded\s*\? shared\.schedule\.classSittingId\(\{ assignmentId, classId, dateKey: test\.dateKey \}\)/, 'only a stranded day\'s sitting is read');
  assert.match(panel, /sitting: sitting && Number\(classSittings\.get\(classId\)\?\.waiting\) > 0/, 'offered only while somebody waits on it');
  const count = region(server, 'action === "countClassSitting"', '} else if (action === "extendClassWindow")', 'countClassSitting');
  assert.match(count, /if \(!window \|\| window\.source !== "bellSchedule" \|\| window\.resolved \|\| !sched\.isDateKey\(window\.dateKey\)\)/, 'only a day that no longer resolves');
  assert.match(count, /const sittingId = sched\.classSittingId\(\{ assignmentId, classId, dateKey: window\.dateKey \}\);/);
  assert.match(count, /edit = \(current\) => sched\.withClassSittingHeld\(current, \{ classId, windowId, opensAt: sitting\.opensAt, closesAt: sitting\.closesAt, by: actor, at: now \}\);/);
  // The only writer of a held day.
  assert.equal(server.split('withClassSittingHeld(').length - 1, 1);
  // Every resolver call passes the same arguments as before: no sittings.
  [...server.matchAll(/resolve(?:ClassWindows|StudentTestCycleSchedule)\(\{[^}]*\}\)/g)].forEach(([call]) => assert.doesNotMatch(call, /sittings?\b/, call));
  const shared = executableSource(readFileSync(new URL('../../functions/shared/testCycleAvailability.mjs', import.meta.url), 'utf8'));
  const resolver = region(shared, 'export const resolveClassWindows = (', '\n};\n', 'resolveClassWindows');
  assert.doesNotMatch(resolver.replace(/heldFromSitting/g, ''), /sitting/i, 'reads the teacher\'s held decision, never a sitting');
  // The held decision is used for a day the bell schedule gives no times the
  // class could have sat: one that does not resolve, or whose A/B day was set
  // only after it had met (TC01).
  assert.match(resolver, /if \(\(!day\.resolved \|\| dayTypeSetLate\) && window\.held\) \{/);
});

test('TC04: deleting an assignment deletes the class sittings recorded for it, found by the assignment and read for nothing else', () => {
  // The lookup returns references only (select() reads no field), for exactly one assignment.
  const cleanup = region(server, 'async function classSittingRefsOf(', '\n}\n', 'classSittingRefsOf');
  assert.match(cleanup, /\.where\("assignmentId", "==", String\(assignmentId\)\)\.select\(\)\.get\(\);/);
  assert.match(cleanup, /return snapshot\.docs\.map\(\(sittingSnapshot\) => sittingSnapshot\.ref\);/);
  // Called from one place: the delete branch of manageAssignmentLifecycle, which only deletes them.
  assert.equal(server.split('classSittingRefsOf(').length - 1, 2, 'its definition and one call');
  const lifecycle = region(server, 'exports.manageAssignmentLifecycle = onCall(', '\n});\n', 'manageAssignmentLifecycle');
  const deleteBranch = lifecycle.slice(lifecycle.indexOf('const writes = [];'));
  assert.match(deleteBranch, /const sittingRefs = await classSittingRefsOf\(db, ref\.id\);\s*sittingRefs\.forEach\(\(sittingRef\) => writes\.push\(\(batch\) => batch\.delete\(sittingRef\)\)\);/);
  // Before the assignment itself goes, like the rest of the scaffolding: a failed group leaves
  // the assignment in place for the teacher to delete again.
  assert.ok(deleteBranch.indexOf('classSittingRefsOf(') < deleteBranch.indexOf('await ref.delete();'));
  assert.match(deleteBranch, /removedClassSittings: sittingRefs\.length,/);
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
