import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const source = fs.readFileSync(
  new URL('../../src/components/teacher/LiveClassMonitor.jsx', import.meta.url),
  'utf8',
);

const attendancePanel = region(source, 'function AttendancePanel(', 'function ReturnCheckInPanel(', 'Live attendance panel');

test('Live Class attendance uses the canonical student-name formatter', () => {
  assert.match(source, /import\s*\{[^}]*\bformatStudentName\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/platform\/studentName['"]/);
  // The panel asks for the NAME alone (no id fallback exists) and shows the
  // explicit "Name unavailable" when none is on file.
  assert.match(attendancePanel, /name: formatStudentName\(student,\s*\{\s*lastFirst:\s*false,\s*fallbackToNeutral:\s*false\s*\}\)/);
  assert.match(attendancePanel, /const name = resolvedName \|\| STUDENT_NAME_UNAVAILABLE;/);
  assert.doesNotMatch(executableSource(source), /fallbackToId/);
});

test('Live Class attendance keeps ID as secondary identification instead of the primary name', () => {
  assert.doesNotMatch(
    source,
    /const name = student\?\.displayName \|\| student\?\.name \|\| student\?\.studentName \|\| id;/,
  );
  assert.match(attendancePanel, />ID \{id\}</);
});
