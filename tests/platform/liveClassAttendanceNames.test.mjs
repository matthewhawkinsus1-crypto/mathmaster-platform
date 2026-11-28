import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const monitor = fs.readFileSync(
  new URL('../../src/components/teacher/LiveClassMonitor.jsx', import.meta.url),
  'utf8',
);
// Today's Live Attendance left the monitor for a module the monitor loads on
// demand (teacher's first load, third pass): read it there, once the monitor
// is shown to draw it.
const panelSource = fs.readFileSync(
  new URL('../../src/components/teacher/LiveAttendancePanel.jsx', import.meta.url),
  'utf8',
);
const source = `${monitor}\n${panelSource}`;

const attendancePanel = region(panelSource, 'export default function AttendancePanel(', '\n}\n', 'Live attendance panel');

test('the live monitor draws the attendance panel, taken on demand', () => {
  assert.match(monitor, /^import \{[^}]*\bLiveAttendancePanel as AttendancePanel\b[^}]*\} from '\.\.\/\.\.\/app\/teacher\/teacherPanels\.js';$/m);
  assert.match(executableSource(monitor), /\{showAttendance && \(\s*<AttendancePanel\b/);
  assert.match(fs.readFileSync(new URL('../../src/app/teacher/teacherPanels.js', import.meta.url), 'utf8'), /export const LiveAttendancePanel = drawnPanel\(\(\) => import\('\.\.\/\.\.\/components\/teacher\/LiveAttendancePanel\.jsx'\)/);
});

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
