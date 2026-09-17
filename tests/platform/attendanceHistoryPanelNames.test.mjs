import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../src/components/teacher/AttendanceHistoryPanel.jsx', import.meta.url),
  'utf8',
);

test('Attendance History uses the canonical student-name formatter, not raw ids', () => {
  assert.match(source, /import\s*\{\s*formatStudentName\s*\}\s*from\s*['"]\.\.\/\.\.\/platform\/studentName['"]/);
  assert.match(source, /formatStudentName\(student,\s*\{\s*lastFirst:\s*false,\s*fallbackToId:\s*false\s*\}\)/);
});

test('Attendance History keeps the id as secondary identification only', () => {
  assert.match(source, />ID \{id\}</);
  assert.doesNotMatch(
    source,
    /const name = student\?\.displayName \|\| student\?\.name \|\| student\?\.studentName \|\| id;/,
  );
});

test('a correction is never destructive: it is built and handed to a recorder, never a delete/update call', () => {
  assert.doesNotMatch(source, /deleteDoc|updateDoc/);
  assert.match(source, /buildAttendanceHistoryEvent/);
});
