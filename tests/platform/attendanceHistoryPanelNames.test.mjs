import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const source = fs.readFileSync(
  new URL('../../src/components/teacher/AttendanceHistoryPanel.jsx', import.meta.url),
  'utf8',
);

// The row a teacher corrects: its name comes from the shared formatter and an
// absent name is the explicit "Name unavailable", never the id.
const rowRegion = region(source, '{sortedRoster.map((student) => {', 'const effective =', 'attendance history row');

test('Attendance History uses the canonical student-name formatter, not raw ids', () => {
  assert.match(source, /import\s*\{[^}]*\bformatStudentName\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/platform\/studentName['"]/);
  assert.match(source, /import\s*\{[^}]*\bSTUDENT_NAME_UNAVAILABLE\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/platform\/studentName['"]/);
  // There is no "fall back to the id" option any more; the row asks for the
  // name alone and supplies the explicit missing-name label itself.
  assert.match(rowRegion, /const name = formatStudentName\(student,\s*\{\s*lastFirst:\s*false,\s*fallbackToNeutral:\s*false\s*\}\)\s*\|\|\s*STUDENT_NAME_UNAVAILABLE;/);
  assert.doesNotMatch(executableSource(source), /fallbackToId/);
});

test('Attendance History keeps the id as secondary identification only', () => {
  assert.match(source, />ID \{id\}</);
  assert.doesNotMatch(
    source,
    /const name = student\?\.displayName \|\| student\?\.name \|\| student\?\.studentName \|\| id;/,
  );
  // The one-line review banner labels a missing name with the id, as an id.
  assert.match(source, /Review needed for \{formatStudentLabel\(student, \{ lastFirst: false \}\)\}/);
});

test('a correction is never destructive: it is built and handed to a recorder, never a delete/update call', () => {
  assert.doesNotMatch(source, /deleteDoc|updateDoc/);
  assert.match(source, /buildAttendanceHistoryEvent/);
});
