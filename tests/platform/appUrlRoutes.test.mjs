/*
 * MathMaster's addresses (src/app/routes/appUrl.js) and a question's address
 * (src/app/routes/questionAddress.js): every screen has a path, every path
 * names one screen or none, and a path carries ids and positions only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATH_PATH_TABS,
  STUDENT_DASHBOARD_MODES,
  TEACHER_ADMIN_TABS,
  TEACHER_TABS,
  parseAppPath,
  pathRoutesEnabled,
  searchWithoutLaunch,
  studentPathFor,
  teacherPathFor,
} from '../../src/app/routes/appUrl.js';
import {
  questionAddressFor,
  questionAddressLabel,
  storageIndexForAddress,
  studentQuestionEntries,
} from '../../src/app/routes/questionAddress.js';
import { readFileSync } from 'node:fs';

const studentRoundTrip = (route, extras = {}) => {
  const path = studentPathFor(route, extras);
  const parsed = parseAppPath(path);
  assert.equal(parsed.area, 'student', `${path} must parse as a student screen`);
  return { path, parsed };
};

test('every student dashboard screen has its own path and parses back to it', () => {
  const seen = new Set();
  for (const dashboardMode of STUDENT_DASHBOARD_MODES) {
    const { path, parsed } = studentRoundTrip({ surface: 'dashboard', dashboardMode });
    assert.equal(parsed.route.dashboardMode, dashboardMode, path);
    seen.add(path);
  }
  assert.equal(seen.size, STUDENT_DASHBOARD_MODES.length, 'two screens share a path');
  assert.equal(studentPathFor({ surface: 'dashboard', dashboardMode: 'assignments' }), '/');
  assert.equal(studentPathFor({ surface: 'dashboard', dashboardMode: 'grades' }), '/grades');
  assert.equal(studentPathFor({ surface: 'dashboard', dashboardMode: 'secureExams' }), '/tests');
  assert.equal(studentPathFor({ surface: 'dashboard', dashboardMode: 'liveChallenge' }), '/live');
});

test('an assignment, its question and its result page round-trip', () => {
  const plain = studentRoundTrip({ surface: 'assignment', assignmentId: 'lesson-7', questionIndex: 4 });
  assert.equal(plain.path, '/assignments/lesson-7');
  assert.deepEqual(plain.parsed.extras, { question: null });

  const question = studentRoundTrip(
    { surface: 'assignment', assignmentId: 'lesson-7', questionIndex: 4 },
    { question: { section: 'classwork', number: 2 } },
  );
  assert.equal(question.path, '/assignments/lesson-7/classwork/2');
  assert.equal(question.parsed.route.assignmentId, 'lesson-7');
  assert.deepEqual(question.parsed.extras.question, { section: 'classwork', number: 2 });

  const result = studentRoundTrip({ surface: 'assignmentResult', assignmentId: 'lesson-7', sectionKey: 'whole', origin: 'grades' });
  assert.equal(result.path, '/assignments/lesson-7/results');
  assert.equal(result.parsed.route.surface, 'assignmentResult');
  const sectionResult = studentRoundTrip({ surface: 'assignmentResult', assignmentId: 'lesson-7', sectionKey: 'dol' });
  assert.equal(sectionResult.path, '/assignments/lesson-7/results/dol');
  assert.equal(sectionResult.parsed.route.sectionKey, 'dol');
});

test('My Math Path tabs, its session and a Test Cycle round-trip', () => {
  for (const tab of MATH_PATH_TABS) {
    const { parsed } = studentRoundTrip({ surface: 'dashboard', dashboardMode: 'mathPath' }, { mathPath: { tab, skill: null } });
    assert.equal(parsed.extras.mathPath.tab, tab);
  }
  const session = studentRoundTrip({ surface: 'dashboard', dashboardMode: 'mathPath' }, { mathPath: { tab: 'session', skill: 'A.5A' } });
  assert.equal(session.path, '/path/session/A.5A');
  assert.deepEqual(session.parsed.extras.mathPath, { tab: 'session', skill: 'A.5A' });

  const cycle = studentRoundTrip({ surface: 'dashboard', dashboardMode: 'testCycle' }, { testCycleAssignmentId: 'unit-3' });
  assert.equal(cycle.path, '/test-cycle/unit-3');
  assert.equal(cycle.parsed.extras.testCycleAssignmentId, 'unit-3');
});

test('every teacher tab, an assignment monitor, Administration and Preview round-trip', () => {
  for (const tab of TEACHER_TABS) {
    const path = teacherPathFor({ surface: 'workspace', tab, panels: {} });
    const parsed = parseAppPath(path);
    assert.equal(parsed.area, 'teacher', path);
    assert.equal(parsed.route.tab, tab, path);
    const monitorPath = teacherPathFor({ surface: 'workspace', tab, panels: { hubAssignmentId: 'a1', hubClassId: 'c1', studentId: 'S123' } });
    const monitor = parseAppPath(monitorPath);
    assert.equal(monitor.route.panels.hubAssignmentId, 'a1', monitorPath);
    assert.equal(monitor.route.tab, tab, monitorPath);
  }
  assert.equal(teacherPathFor({ surface: 'workspace', tab: 'home' }), '/teacher');
  assert.equal(teacherPathFor({ surface: 'workspace', tab: 'classesWorkspace' }), '/teacher/classes-workspace');
  for (const adminTab of TEACHER_ADMIN_TABS) {
    assert.equal(parseAppPath(teacherPathFor({ surface: 'administration', adminTab })).route.adminTab, adminTab);
  }
  const preview = parseAppPath(teacherPathFor({ surface: 'preview', assignmentId: 'a1', questionIndex: 3 }));
  assert.deepEqual(preview.route, { surface: 'preview', assignmentId: 'a1', questionIndex: 0 });
});

test('the teacher tab list is the sidebar\'s: a new tab without an address is caught here', () => {
  const sidebar = readFileSync(new URL('../../src/TeacherSidebar.jsx', import.meta.url), 'utf8');
  const groups = [...sidebar.matchAll(/tabs: \[([^\]]*)\]/g)].flatMap((match) => [...match[1].matchAll(/'([A-Za-z]+)'/g)].map((tab) => tab[1]));
  assert.ok(groups.length >= 15, 'sidebar groups not found');
  for (const tab of groups) assert.ok(TEACHER_TABS.includes(tab), `sidebar tab ${tab} has no address`);
});

test('a path carries ids and positions only — never a panel, a student or anything about work', () => {
  const loaded = {
    surface: 'assignment', assignmentId: 'a1', questionIndex: 2,
    answer: '42', score: 100, draft: 'x=4', secureExamSessionId: 'sess-1', studentId: 'S999',
  };
  const path = studentPathFor(loaded, { question: { section: 'dol', number: 1, answer: '42' } });
  assert.equal(path, '/assignments/a1/dol/1');
  const teacher = teacherPathFor({
    surface: 'workspace', tab: 'grades',
    panels: { studentId: 'S999', caseReviewStudentId: 'S999', supportReportStudentId: 'S999', testCyclePreviewAssignmentId: 'a1' },
  });
  assert.equal(teacher, '/teacher/grades', 'a student-bearing panel must never reach the address');
  // An id this app never minted does not become a path segment.
  assert.equal(studentPathFor({ surface: 'assignment', assignmentId: '../grades/S999' }), '/');
  assert.equal(studentPathFor({ surface: 'assignment', assignmentId: 'a b' }), '/');
});

test('unknown, malformed and stale-shaped paths name no screen', () => {
  for (const path of [
    '/nope', '/students/S123', '/assignments/a1/extra', '/assignments/a1/classwork/0',
    '/assignments/a1/classwork/two', '/assignments/a1/results/dol/1', '/grades/S123',
    '/path/session', '/path/nope', '/test-cycle/a/b', '/teacher/nope', '/teacher/classesWorkspace',
    '/teacher/admin/nope', '/teacher/preview', '/teacher/grades/students/S123', '/%E0%A4%A',
    '/assignments/%2E%2E%2Fsecret',
  ]) {
    assert.equal(parseAppPath(path).area, 'unknown', path);
  }
  assert.equal(parseAppPath('/').route.dashboardMode, 'assignments');
  assert.equal(parseAppPath('/index.html').route.dashboardMode, 'assignments');
  assert.equal(parseAppPath('/grades/').route.dashboardMode, 'grades', 'a trailing slash is the same screen');
});

test('harness and tools-lab pages keep their own URL; the app page routes by path', () => {
  assert.equal(pathRoutesEnabled('/'), true);
  assert.equal(pathRoutesEnabled('/assignments/a1'), true);
  assert.equal(pathRoutesEnabled('/index.html'), true);
  assert.equal(pathRoutesEnabled('/tests/browser/teacherWorkflow/index.html'), false);
  assert.equal(pathRoutesEnabled('/tools-lab.html'), false);
});

test('Classroom launch parameters are consumed, other query parameters kept', () => {
  assert.equal(searchWithoutLaunch('?launch=a1&classroomSection=dol&classroomCourse=c&classroomPublication=p'), '');
  assert.equal(searchWithoutLaunch('?reset=1&launch=a1'), '?reset=1');
  assert.equal(searchWithoutLaunch(''), '');
});

// --- A question's address -----------------------------------------------------

const lesson = () => ({
  schemaVersion: 5,
  sections: [
    { id: 'warmup', role: 'warmup', questions: [
      { questionId: 'w1' },
      { questionId: 'old-w2', teacherExcluded: true },
      { questionId: 'w3' },
    ] },
    { id: 'classwork', role: 'classwork', questions: [{ questionId: 'c1' }, { questionId: 'c2' }] },
    { id: 'content-v2-corrections-warmup', role: 'warmup', questions: [
      { questionId: 'new-w2', supersedesQuestionId: 'old-w2', introducedInContentVersion: 2 },
    ] },
  ],
});

test('a question is numbered within its section, as the workspace numbers it', () => {
  const entries = studentQuestionEntries(lesson());
  // Storage: w1 0, old-w2 1 (replaced), w3 2, c1 3, c2 4, new-w2 5.
  assert.deepEqual(questionAddressFor(entries, 4), { section: 'classwork', number: 2 }, 'storage 4 is the SECOND Classwork question');
  assert.deepEqual(questionAddressFor(entries, 5), { section: 'warmup', number: 2 }, 'a replacement sits where the question it replaced sat');
  assert.deepEqual(questionAddressFor(entries, 2), { section: 'warmup', number: 3 });
  assert.equal(questionAddressFor(entries, 1), null, 'a replaced question has no address');
  for (const entry of entries) {
    assert.equal(storageIndexForAddress(entries, questionAddressFor(entries, entry.storageIndex)), entry.storageIndex);
  }
  assert.equal(storageIndexForAddress(entries, { section: 'classwork', number: 3 }), null, 'past the end');
  assert.equal(storageIndexForAddress(entries, { section: 'dol', number: 1 }), null, 'no such section');
  assert.equal(questionAddressLabel({ section: 'classwork', number: 2 }), 'Classwork Question 2');
  assert.equal(questionAddressLabel({ section: 'warmup', number: 1 }), 'Warm-Up Question 1');
});

test('fewer required items renumber the section for that student', () => {
  const entries = studentQuestionEntries(lesson(), { omittedIndices: new Set([3]) });
  assert.deepEqual(questionAddressFor(entries, 4), { section: 'classwork', number: 1 });
  assert.equal(questionAddressFor(entries, 3), null);
});

// --- Hosting ------------------------------------------------------------------

test('Hosting serves index.html, uncached, at every address the app writes; static files keep their rules', () => {
  const config = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8')).hosting;
  // Every path falls back to the app (static files are served first by Hosting).
  assert.ok(config.rewrites.some((rule) => rule.source === '**' && rule.destination === '/index.html'), 'SPA fallback');
  assert.equal(config.rewrites.length, 1, 'a new rewrite needs a check that it does not shadow an app address');
  // A rewritten address is cached by ITS path, not /index.html's: without its
  // own no-cache rule a reload of /grades after a deploy could keep the old
  // page shell, whose fingerprinted bundles no longer exist.
  const routeRule = config.headers.find((rule) => rule.regex);
  assert.ok(routeRule, 'app addresses need a no-cache rule');
  assert.match(routeRule.headers.find((header) => header.key === 'Cache-Control').value, /no-cache/);
  const routePattern = new RegExp(routeRule.regex);
  const written = [
    ...STUDENT_DASHBOARD_MODES.map((dashboardMode) => studentPathFor({ surface: 'dashboard', dashboardMode })),
    ...MATH_PATH_TABS.map((tab) => studentPathFor({ surface: 'dashboard', dashboardMode: 'mathPath' }, { mathPath: { tab } })),
    studentPathFor({ surface: 'dashboard', dashboardMode: 'mathPath' }, { mathPath: { tab: 'session', skill: 'A.5A' } }),
    studentPathFor({ surface: 'dashboard', dashboardMode: 'testCycle' }, { testCycleAssignmentId: 'c1' }),
    studentPathFor({ surface: 'assignment', assignmentId: 'a1' }, { question: { section: 'classwork', number: 2 } }),
    studentPathFor({ surface: 'assignmentResult', assignmentId: 'a1', sectionKey: 'dol' }),
    ...TEACHER_TABS.map((tab) => teacherPathFor({ surface: 'workspace', tab, panels: { hubAssignmentId: 'a1' } })),
    ...TEACHER_TABS.map((tab) => teacherPathFor({ surface: 'workspace', tab })),
    teacherPathFor({ surface: 'administration', adminTab: 'ai' }),
    teacherPathFor({ surface: 'preview', assignmentId: 'a1' }),
  ];
  assert.ok(written.includes('/'), 'Home is an app address too');
  for (const path of written) assert.match(path, routePattern, `${path} is written by the app but cached by Hosting`);
  for (const path of ['/assets/index-abc123.js', '/mathmaster-build.json', '/audio/ding.mp3', '/mathmaster-icon.svg', '/__/auth/handler', '/tools-lab.html']) {
    assert.doesNotMatch(path, routePattern, `${path} is a static file and keeps its own caching`);
  }
  const indexRule = config.headers.find((rule) => rule.source === '/index.html');
  assert.ok(indexRule, '/ and /index.html keep their own rule');
});

test('Vercel previews fall back to the app at every address too (static files are served first)', () => {
  const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }]);
  const assets = config.headers.find((rule) => rule.source === '/assets/(.*)');
  assert.match(assets.headers[0].value, /immutable/);
});
