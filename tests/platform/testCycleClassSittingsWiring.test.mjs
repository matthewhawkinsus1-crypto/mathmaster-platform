/*
 * A TEST DAY THE CLASS SAT STAYS A CLOSED WINDOW — the server wiring (student
 * pass 3, wave 7, item 2; docs/handoffs/STUDENT_PASS3_SERVER_FOLLOWUPS.md).
 *
 * The rule is pure and proved in testCycleAvailability.test.mjs; the real
 * callables are run against the emulator in testCycleCertification scenario
 * M (the first start records the sitting; the day stops resolving; the absent
 * student is missed; the teacher row is closed). What those cannot see
 * without running every path is that EVERY reader of a class's windows is
 * handed the sittings, and that the write can never fail a start. That is
 * pinned here, bound to the statement that does the work.
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

test('every reader of a class\'s windows is handed its recorded sittings', () => {
  const student = region(server, 'async function studentTestCycleSchedule(', '\n}\n', 'studentTestCycleSchedule');
  assert.match(student, /const sittings = followsBell\s*\? await classTestSittingsIfNeeded\(db, shared, \{/);
  assert.match(student, /assignment, classId, classPeriod, schedule, studentAvailability, now, timeZone, sittings,/);
  assert.match(student, /classId: classId \|\| null,/);
  const teacher = region(server, 'async function teacherTestCycleSchedule(', 'const lateDue = shared.schedule.defaultFollowUpClose(assignment, timeZone);', 'teacherTestCycleSchedule');
  assert.match(teacher, /const sittings = await classTestSittingsIfNeeded\(db, shared, \{/);
  assert.match(teacher, /shared\.schedule\.resolveClassWindows\(\{ availability: assignment\?\.testAvailability, classId, classPeriod, schedule: bell, timeZone, sittings \}\)/);
  const bulk = region(server, '} else if (action === "setTestDayForClasses") {', 'const first = classPeriod', 'setTestDayForClasses');
  assert.match(bulk, /const sittings = await classTestSittingsIfNeeded\(db, shared, \{ assignment, assignmentId, classId, classPeriod, schedule: bell \}\);/);
  assert.match(bulk, /sched\.resolveClassWindows\(\{ availability: assignment\?\.testAvailability, classId, classPeriod, schedule: bell, timeZone, sittings \}\)/);
});

test('the sittings are read only when a class window does not resolve', () => {
  const read = region(server, 'async function classTestSittingsIfNeeded(', '\n}\n', 'classTestSittingsIfNeeded');
  const gate = read.indexOf('if (!shared.schedule.classWindowsNeedSittings(live)) return null;');
  assert.ok(gate > 0, 'the gate');
  assert.ok(read.indexOf('.where("assignmentId", "==", id).get()') > gate, 'the query comes after it');
});
