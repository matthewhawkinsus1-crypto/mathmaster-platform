import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('authenticated student render paths use the identity shell with the student record', () => {
  const app = read('src/App.jsx');
  const shell = region(app, 'const renderStudentIdentityShell =', 'if (!user)', 'authenticated student shell');
  assert.match(app, /import StudentIdentityBar from ['"].\/components\/student\/StudentIdentityBar\.jsx['"]/);
  assert.match(shell, /data-authenticated-student-shell=/);
  assert.match(shell, /<StudentIdentityBar[\s\S]*student=\{preview \? null : \{ \.\.\.studentRecord, \.\.\.user \}\}/);
  assert.match(shell, /onLogout=\{preview \? null : handleLogout\}/);

  const studentRoutes = region(app, "if (user.role === 'student' && activeView === 'dashboard')", 'return null;', 'student route rendering');
  assert.match(studentRoutes, /renderStudentIdentityShell\([\s\S]*LiveChallengeStudent/);
  assert.match(studentRoutes, /renderStudentIdentityShell\(renderAssignmentWorkspace\(false\)\)/);
});

test('identity bar shows a full natural name, period, and normal not-you logout path', () => {
  const source = read('src/components/student/StudentIdentityBar.jsx');
  assert.match(source, /formatStudentName\(student, \{ lastFirst: false \}\)/);
  assert.match(source, /`Period \$\{period\}`/);
  assert.match(source, /Not you\?/);
  assert.match(source, /onClick=\{onLogout\}[\s\S]*Log Out/);
  assert.match(source, /position: 'sticky'/, 'the thin identity row must remain visible in compact and mobile layouts');
});

test('teacher preview is visibly preview-only and cannot receive student logout treatment', () => {
  const app = read('src/App.jsx');
  const previewRoute = region(app, 'if (isTeacherPreview)', "if (user.role === 'teacher')", 'teacher preview route');
  assert.match(previewRoute, /renderStudentIdentityShell\(renderAssignmentWorkspace\(true\), \{ preview: true \}\)/);

  const identity = read('src/components/student/StudentIdentityBar.jsx');
  assert.match(identity, /'Teacher Preview'/);
  assert.match(identity, /'Student View'/);
  assert.match(identity, /!preview && onLogout/);
});

test('walkthrough monitor delegates teacher-facing names to the canonical identity utility', () => {
  const source = executableSource(read('src/platform/teacher/walkthroughMonitor.js'));
  assert.match(source, /import \{ formatStudentName \} from ['"]\.\.\/studentName\.js['"]/);
  assert.match(source, /name: formatStudentName\(student, \{ lastFirst: false \}\)/);
  assert.doesNotMatch(source, /const studentName\s*=/);
});

test('Live Challenge shared leaderboard remains alias-based', () => {
  const studentBoard = read('src/components/liveChallenge/LiveChallengeStudent.jsx');
  const teacherBoard = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(studentBoard, /\{row\.alias\}/);
  assert.match(teacherBoard, /\{row\.alias\}/);
  assert.doesNotMatch(executableSource(studentBoard), /formatStudentName/);
  assert.doesNotMatch(executableSource(teacherBoard), /formatStudentName/);
});
