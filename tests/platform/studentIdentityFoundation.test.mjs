import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('authenticated student render paths use the identity shell with the student record', () => {
  const app = read('src/App.jsx');
  const shell = region(app, 'const renderStudentIdentityShell =', 'if (!user)', 'authenticated student shell');
  assert.match(app, /import StudentIdentityBar(?:, \{[^}]+\})? from ['"].\/components\/student\/StudentIdentityBar\.jsx['"]/);
  assert.match(shell, /data-authenticated-student-shell=/);
  assert.match(shell, /<StudentIdentityBar[\s\S]*student=\{preview \? null : \{ \.\.\.studentRecord, \.\.\.user \}\}/);
  assert.match(shell, /onLogout=\{preview \? null : handleLogout\}/);

  const studentRoutes = region(app, "if (user.role === 'student' && activeView === 'dashboard')", 'return null;', 'student route rendering');
  assert.match(studentRoutes, /renderStudentIdentityShell\([\s\S]*LiveChallengeStudent/);
  assert.match(studentRoutes, /renderStudentIdentityShell\(renderAssignmentWorkspace\(false\)\)/);
});

test('identity bar shows a full natural name, period, and normal not-you logout path', () => {
  const source = read('src/components/student/StudentIdentityBar.jsx');
  // A student with no name on file sees the neutral "Student" — the
  // teacher-facing "Name unavailable" and the id are never their own label.
  assert.match(source, /formatStudentName\(student, \{ lastFirst: false, neutralLabel: STUDENT_SELF_NEUTRAL_LABEL \}\)/);
  assert.match(source, /import \{[^}]*\bSTUDENT_SELF_NEUTRAL_LABEL\b[^}]*\} from '\.\.\/\.\.\/platform\/studentName\.js'/);
  assert.match(source, /`Period \$\{period\}`/);
  assert.match(source, /Not you\?/);
  assert.match(source, /onClick=\{onLogout\}[\s\S]*Log Out/);
  assert.match(source, /position: 'sticky'/, 'the thin identity row must remain visible in compact and mobile layouts');
});

test('classroom alerts stack below the measured identity bar instead of competing at top zero', () => {
  const app = read('src/App.jsx');
  const identity = read('src/components/student/StudentIdentityBar.jsx');
  const packUp = region(app, 'const renderStudentPackUpBanner =', 'const renderStudentWarmupBanner =', 'Pack-Up alert');
  const warmUp = region(app, 'const renderStudentWarmupBanner =', 'const renderIdleOverlay =', 'Warm-Up alert');

  assert.match(identity, /STUDENT_IDENTITY_STACK_OFFSET/);
  assert.match(identity, /ResizeObserver\(publishHeight\)/, 'the offset must follow wrapped mobile identity height');
  assert.match(identity, /zIndex: STUDENT_IDENTITY_Z_INDEX/);
  assert.match(packUp, /position: 'fixed',[\s\S]*top: `var\(\$\{STUDENT_IDENTITY_STACK_OFFSET\}, 38px\)`/);
  assert.match(warmUp, /position: 'sticky',[\s\S]*top: `var\(\$\{STUDENT_IDENTITY_STACK_OFFSET\}, 38px\)`/);
  assert.doesNotMatch(packUp, /top: 0/);
  assert.doesNotMatch(warmUp, /top: 0/);
});

test('historical support sessions and events resolve ids through the current roster', () => {
  const source = read('src/components/teacher/StudentSupportDashboard.jsx');
  const resolution = region(source, 'const namedClassEvents =', 'const classAlerts =', 'historical support identity resolution');
  assert.match(resolution, /studentId: event\.studentId, students, historicalName: event\.studentName/);
  assert.match(resolution, /studentId: summary\.studentId, students, historicalName: summary\.studentName/);
  assert.match(source, /const recent = namedClassEvents\.slice/);
  assert.match(source, /const productivityReviews = useMemo\(\(\) => namedClassSessions/);
  assert.match(source, /const archivedEntries = namedClassSessions/);
  assert.doesNotMatch(executableSource(source), /studentName \|\| 'Student'/);
});

test('teacher preview is visibly preview-only and cannot receive student logout treatment', () => {
  const app = read('src/App.jsx');
  // The preview ROUTE is the branch immediately before the teacher route;
  // `if (isTeacherPreview)` also guards a dozen handlers earlier in App.jsx,
  // and the first of those is not this route.
  const teacherRoute = app.indexOf("if (user.role === 'teacher')");
  assert.notEqual(teacherRoute, -1, 'the teacher route');
  const previewRoute = app.slice(app.lastIndexOf('if (isTeacherPreview)', teacherRoute), teacherRoute);
  assert.ok(previewRoute.startsWith('if (isTeacherPreview)') && previewRoute.length < 400, 'bound to the preview route alone');
  assert.match(previewRoute, /renderStudentIdentityShell\(renderAssignmentWorkspace\(true\), \{ preview: true \}\)/);

  const identity = read('src/components/student/StudentIdentityBar.jsx');
  assert.match(identity, /'Teacher Preview'/);
  assert.match(identity, /'Student View'/);
  assert.match(identity, /!preview && onLogout/);
});

test('walkthrough monitor delegates teacher-facing names to the canonical identity utility', () => {
  const source = executableSource(read('src/platform/teacher/walkthroughMonitor.js'));
  assert.match(source, /import \{[^}]*\bformatStudentName\b[^}]*\} from ['"]\.\.\/studentName\.js['"]/);
  // The card's name is the resolved name or the explicit "Name unavailable";
  // the id travels separately as a labelled idLabel, never as the name.
  const row = region(source, 'const resolvedName =', 'row.reason =', 'walkthrough row');
  assert.match(row, /const resolvedName = formatStudentName\(student, \{ lastFirst: false, fallbackToNeutral: false \}\)/);
  assert.match(row, /name: resolvedName \|\| STUDENT_NAME_UNAVAILABLE/);
  assert.match(row, /nameMissing: !resolvedName/);
  assert.match(row, /idLabel: studentIdLabel\(id\)/);
  assert.doesNotMatch(source, /const studentName\s*=/);
});

test('Live Challenge shared leaderboard remains alias-based', () => {
  // Every shared board — student devices, the console's live board, the
  // projector — renders through the shell's boards, which show game aliases.
  const parts = read('src/components/liveChallenge/ChallengeShellParts.jsx');
  assert.match(region(parts, 'export function StandingsBoard(', '\nexport const roundPerformanceText', 'standings board'), />\{row\.alias\}</);
  assert.match(region(parts, 'export function RoundResultsTable(', '\nexport function ConfirmDialog', 'round results'), />\{row\.alias\}</);
  const files = ['LiveChallengeStudent.jsx', 'LiveChallengeTeacher.jsx', 'LiveChallengeArenaProjector.jsx', 'ChallengeShellParts.jsx', 'ChallengeStudentShell.jsx', 'ChallengeHostConsole.jsx']
    .map((name) => [name, read(`src/components/liveChallenge/${name}`)]);
  files.forEach(([name, source]) => assert.doesNotMatch(executableSource(source), /formatStudentName/, name));
  // Names exist for the teacher's console only (a teacher-only callable): the
  // projector is never handed the roster, and never asks for it.
  const teacher = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  const projectorProps = region(teacher, "if (projector && ['lobby', 'running', 'finished'].includes(room.status)) {", '/>;', 'projector props');
  assert.doesNotMatch(projectorProps, /roster/i);
  const projector = executableSource(read('src/components/liveChallenge/LiveChallengeArenaProjector.jsx'));
  assert.doesNotMatch(projector, /roster|getLiveChallengeHostRoster/i);
});
