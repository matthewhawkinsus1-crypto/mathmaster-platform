import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * CLASS/TEACHER AUTHORIZATION AND "A STUDENT CANNOT ALTER THIS HISTORY".
 *
 * Attendance history corrections and return/attendance-correction-review
 * action items are all written as `studentSupportEvents` docs (see
 * src/platform/attendance/attendanceHistory.js and returnCheckIn.js) — the
 * exact collection `firestore.rules` already locks down:
 *
 *   - only `teacher()` may `create` a document, and only when
 *     `createdByEmail` matches the caller and the student is on that
 *     teacher's own roster (assignedTeacherEmail/classId match) — a
 *     different class's teacher cannot write into a class they don't teach;
 *   - `allow update, delete: if false` — append-only, for every kind,
 *     including the new ones this feature adds. A student has no matching
 *     rule at all, so a student write is denied by default.
 *
 * No new collection was created for this feature, so no new rules were
 * needed — this test pins that the existing rule block still covers the
 * whole `studentSupportEvents` match and has not been narrowed or
 * duplicated into a second, less strict block.
 */
const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

test('studentSupportEvents remains append-only for every kind, including attendance history and return check-ins', () => {
  const match = rules.match(/match \/studentSupportEvents\/\{eventId\} \{([\s\S]*?)\n {4}\}/);
  assert.ok(match, 'studentSupportEvents rule block must exist');
  const body = match[1];
  assert.match(body, /allow update, delete: if false;/);
  assert.match(body, /allow create: if rootAdmin\(\) \|\| \(/);
});

test('there is only one studentSupportEvents rule block — no second, looser one was added for the new kinds', () => {
  const occurrences = rules.match(/match \/studentSupportEvents\//g) || [];
  assert.equal(occurrences.length, 1);
});

test('the assignments collection stays teacher-only for write, so a student cannot grant themselves an extension', () => {
  const match = rules.match(/match \/assignments\/\{assignmentId\} \{([\s\S]*?)\n {4}\}/);
  assert.ok(match);
  assert.match(match[1], /allow create, delete: if teacher\(\);/);
  assert.match(match[1], /allow update: if teacher\(\)/);
  // studentOverrides (the per-student extension field) is carved out of even
  // the teacher's own update rule — see attendanceHistoryScopedQuery/
  // attendanceReconciliationUnifiedPath tests for the full callable-only story.
  assert.match(match[1], /affectedKeys\(\)\.hasAny\(\['studentOverrides'\]\)/);
  assert.doesNotMatch(match[1], /ownsStudent/);
});
