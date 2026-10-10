/*
 * MATHMASTER'S ADDRESSES.
 *
 * The app keeps its screens in React state; this module is the one place that
 * turns a screen into a path and a path back into a screen. It is pure: no
 * window, no React, no data — App decides whether a parsed address may open
 * (the same gates a click goes through) and this module only says what the
 * address names.
 *
 * WHAT A PATH MAY CARRY: ids and positions, nothing else. An assignment id, a
 * section and the question's number in it, a skill code, a teacher tab. Never
 * an answer, a score, a draft, a timer, a secure-exam session or a student
 * id: everything a URL holds is visible in the address bar, in browser
 * history, in a screenshot projected to the class and in any link a student
 * pastes into chat.
 *
 *   Student                                 Teacher
 *   /                    Home               /teacher                    Home
 *   /assignments         Assignments        /teacher/<tab>              a sidebar tab
 *   /assignments/<id>    an assignment      /teacher/<tab>/assignments/<id>
 *   /assignments/<id>/<section>/<n>                                     an assignment's monitor
 *                        a question         /teacher/admin/<tab>        Administration
 *   /assignments/<id>/results               /teacher/preview/<id>       View as Student
 *                        result + Review My Work
 *   /grades              Grades
 *   /rewards             Rewards
 *   /path                My Math Path (/path/<tab>, /path/session/<skill>)
 *   /tests               secure tests (where a secure test is started)
 *   /test-cycle[/<id>]   Test Cycle
 *   /live                Live Challenge join
 */

// Student dashboard modes, by their path segment.
const DASHBOARD_MODE_BY_SEGMENT = Object.freeze({
  '': 'assignments',
  assignments: 'assignmentsCenter',
  grades: 'grades',
  rewards: 'rewards',
  path: 'mathPath',
  tests: 'secureExams',
  'test-cycle': 'testCycle',
  live: 'liveChallenge',
});
const SEGMENT_BY_DASHBOARD_MODE = Object.freeze(Object.fromEntries(
  Object.entries(DASHBOARD_MODE_BY_SEGMENT).map(([segment, mode]) => [mode, segment]),
));
export const STUDENT_DASHBOARD_MODES = Object.freeze(Object.values(DASHBOARD_MODE_BY_SEGMENT));

// My Math Path's own tabs (MyMathPathApp TABS) plus its session.
export const MATH_PATH_TABS = Object.freeze(['path', 'dashboard', 'progress', 'ccmr', 'history']);

// The teacher workspace's sidebar tabs (TeacherSidebar groups) and the
// screens reached from them. A tab not listed here is not an address.
export const TEACHER_TABS = Object.freeze([
  'home', 'assignments', 'library',
  'classesWorkspace', 'students', 'weeklyPath', 'pacing',
  'actionCenter', 'attendanceHistory', 'parentContacts',
  'grades', 'gradeTransfer', 'standards', 'analytics', 'exams',
  'liveChallenge', 'mathTools', 'simulator', 'demo',
  'classes', 'classroom', 'access',
]);
export const TEACHER_ADMIN_TABS = Object.freeze(['classes', 'accounts', 'ai', 'coverage', 'reset']);

// A section of an assignment, as the workspace names it (activityRole).
const SECTION_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
// Firestore ids and TEKS codes: letters, digits and a little punctuation.
// Anything else (a slash after decoding, whitespace, an over-long value) is
// not an id this app ever minted, so the address is unknown.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

const camelToKebab = (value) => String(value).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const kebabToCamel = (value) => String(value).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

const decodeSegment = (segment) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};
const cleanId = (value) => {
  const text = String(value ?? '').trim();
  return ID_PATTERN.test(text) ? text : null;
};
const encodeId = (value) => encodeURIComponent(String(value));
const positiveInteger = (value) => {
  if (!/^[1-9][0-9]{0,4}$/.test(String(value ?? ''))) return null;
  return Number(value);
};

/*
 * WHICH DOCUMENTS ROUTE BY PATH.
 *
 * The app is served at "/" (Hosting rewrites every path to index.html). The
 * browser harnesses and the tools lab mount the same app from their own
 * `*.html` page; there the path is the harness's, not a screen, so the app
 * keeps the page's URL and routes by history entries only, exactly as before
 * URLs existed. `/index.html` is the app's own page under another name.
 */
export const pathRoutesEnabled = (pathname = '/') => {
  const path = String(pathname || '/');
  if (path === '/index.html') return true;
  return !/\.html?$/i.test(path);
};

const splitPath = (pathname) => {
  const raw = String(pathname || '/').split('?')[0].split('#')[0];
  if (raw === '/index.html') return [];
  const segments = raw.split('/').filter(Boolean).map(decodeSegment);
  return segments.includes(null) ? null : segments;
};

/**
 * What a path names.
 *
 * Returns { area: 'student' | 'teacher', route, extras } for a known address,
 * { area: 'unknown', reason } otherwise. `route` has the shape the history
 * modules use (platform/student/browserHistory.js and
 * platform/teacher/teacherBrowserHistory.js); `extras` holds the parts of the
 * address that need the assignment's data to resolve (a question's section and
 * number, a Math Path tab or session skill, a Test Cycle id).
 */
export const parseAppPath = (pathname = '/') => {
  const segments = splitPath(pathname);
  if (!segments) return { area: 'unknown', reason: 'malformed' };
  if (segments[0] === 'teacher') return parseTeacherSegments(segments.slice(1));
  return parseStudentSegments(segments);
};

const unknown = (reason = 'not-found') => ({ area: 'unknown', reason });

const parseStudentSegments = (segments) => {
  const [first = '', ...rest] = segments;
  if (first === 'assignments' && rest.length) {
    const assignmentId = cleanId(rest[0]);
    if (!assignmentId) return unknown();
    if (rest.length === 1) {
      return { area: 'student', route: { surface: 'assignment', assignmentId, questionIndex: 0 }, extras: { question: null } };
    }
    if (rest[1] === 'results' && rest.length <= 3) {
      const sectionKey = rest[2] === undefined ? '' : (SECTION_PATTERN.test(rest[2]) ? rest[2] : null);
      if (sectionKey === null) return unknown();
      return {
        area: 'student',
        route: { surface: 'assignmentResult', assignmentId, sectionKey, origin: 'assignments' },
        extras: {},
      };
    }
    if (rest.length === 3 && SECTION_PATTERN.test(rest[1])) {
      const number = positiveInteger(rest[2]);
      if (!number) return unknown();
      return {
        area: 'student',
        route: { surface: 'assignment', assignmentId, questionIndex: 0 },
        extras: { question: { section: rest[1], number } },
      };
    }
    return unknown();
  }

  if (!Object.hasOwn(DASHBOARD_MODE_BY_SEGMENT, first)) return unknown();
  const dashboardMode = DASHBOARD_MODE_BY_SEGMENT[first];
  const route = { surface: 'dashboard', dashboardMode };

  if (dashboardMode === 'mathPath') {
    if (!rest.length) return { area: 'student', route, extras: { mathPath: { tab: 'path', skill: null } } };
    if (rest.length === 1 && MATH_PATH_TABS.includes(rest[0])) {
      return { area: 'student', route, extras: { mathPath: { tab: rest[0], skill: null } } };
    }
    if (rest.length === 2 && rest[0] === 'session') {
      const skill = cleanId(rest[1]);
      if (!skill) return unknown();
      return { area: 'student', route, extras: { mathPath: { tab: 'session', skill } } };
    }
    return unknown();
  }
  if (dashboardMode === 'testCycle') {
    if (!rest.length) return { area: 'student', route, extras: { testCycleAssignmentId: null } };
    const assignmentId = rest.length === 1 ? cleanId(rest[0]) : null;
    if (!assignmentId) return unknown();
    return { area: 'student', route, extras: { testCycleAssignmentId: assignmentId } };
  }
  if (rest.length) return unknown();
  return { area: 'student', route, extras: {} };
};

const parseTeacherSegments = (segments) => {
  const [first = 'home', ...rest] = segments;
  if (first === 'admin') {
    const adminTab = rest.length === 0 ? 'classes' : (rest.length === 1 ? rest[0] : null);
    if (!TEACHER_ADMIN_TABS.includes(adminTab)) return unknown();
    return { area: 'teacher', route: { surface: 'administration', adminTab }, extras: {} };
  }
  if (first === 'preview') {
    const assignmentId = rest.length === 1 ? cleanId(rest[0]) : null;
    if (!assignmentId) return unknown();
    return { area: 'teacher', route: { surface: 'preview', assignmentId, questionIndex: 0 }, extras: {} };
  }
  const tab = kebabToCamel(first);
  if (!TEACHER_TABS.includes(tab) || first !== camelToKebab(tab)) return unknown();
  if (!rest.length) return { area: 'teacher', route: { surface: 'workspace', tab, panels: {} }, extras: {} };
  if (rest.length === 2 && rest[0] === 'assignments') {
    const hubAssignmentId = cleanId(rest[1]);
    if (!hubAssignmentId) return unknown();
    return { area: 'teacher', route: { surface: 'workspace', tab, panels: { hubAssignmentId } }, extras: {} };
  }
  return unknown();
};

/**
 * The path of a student screen.
 *
 * `question` is the open question's address ({ section, number }) — the
 * number the workspace shows ("Classwork, Question 2"), never a storage index
 * and never anything about the student's work on it. Without one, the
 * assignment's own path. `mathPath` is My Math Path's tab or session skill.
 */
export const studentPathFor = (route = {}, { question = null, mathPath = null, testCycleAssignmentId = null } = {}) => {
  if (route.surface === 'assignment') {
    const assignmentId = cleanId(route.assignmentId);
    if (!assignmentId) return '/';
    const section = question && SECTION_PATTERN.test(String(question.section || '')) ? question.section : null;
    const number = question ? positiveInteger(question.number) : null;
    return section && number
      ? `/assignments/${encodeId(assignmentId)}/${section}/${number}`
      : `/assignments/${encodeId(assignmentId)}`;
  }
  if (route.surface === 'assignmentResult') {
    const assignmentId = cleanId(route.assignmentId);
    if (!assignmentId) return '/';
    const sectionKey = String(route.sectionKey || '');
    return sectionKey && sectionKey !== 'whole' && SECTION_PATTERN.test(sectionKey)
      ? `/assignments/${encodeId(assignmentId)}/results/${sectionKey}`
      : `/assignments/${encodeId(assignmentId)}/results`;
  }
  const mode = String(route.dashboardMode || 'assignments');
  const segment = Object.hasOwn(SEGMENT_BY_DASHBOARD_MODE, mode) ? SEGMENT_BY_DASHBOARD_MODE[mode] : '';
  if (mode === 'mathPath' && mathPath) {
    if (mathPath.tab === 'session') {
      const skill = cleanId(mathPath.skill);
      return skill ? `/path/session/${encodeId(skill)}` : '/path';
    }
    return MATH_PATH_TABS.includes(mathPath.tab) && mathPath.tab !== 'path' ? `/path/${mathPath.tab}` : '/path';
  }
  if (mode === 'testCycle') {
    const assignmentId = cleanId(testCycleAssignmentId);
    return assignmentId ? `/test-cycle/${encodeId(assignmentId)}` : '/test-cycle';
  }
  return `/${segment}`;
};

/**
 * The path of a teacher screen. Only the screen and an open assignment
 * monitor: a student drawer, case review or support report is a panel over
 * the screen and is never written into the address (it would put a student's
 * name-bearing record one copied link away).
 */
export const teacherPathFor = (route = {}) => {
  if (route.surface === 'administration') {
    const adminTab = TEACHER_ADMIN_TABS.includes(route.adminTab) ? route.adminTab : 'classes';
    return `/teacher/admin/${adminTab}`;
  }
  if (route.surface === 'preview') {
    const assignmentId = cleanId(route.assignmentId);
    return assignmentId ? `/teacher/preview/${encodeId(assignmentId)}` : '/teacher';
  }
  const tab = TEACHER_TABS.includes(route.tab) ? route.tab : 'home';
  const base = tab === 'home' ? '/teacher' : `/teacher/${camelToKebab(tab)}`;
  const hubAssignmentId = cleanId(route.panels?.hubAssignmentId);
  if (!hubAssignmentId) return base;
  return `${tab === 'home' ? '/teacher/home' : base}/assignments/${encodeId(hubAssignmentId)}`;
};

// Classroom launch parameters are consumed once, on arrival. Carrying them on
// into every later screen would make a refresh re-run the launch and throw
// the student back into that assignment from wherever they had gone.
const CONSUMED_LAUNCH_PARAMS = ['launch', 'classroomSection', 'classroomCourse', 'classroomPublication'];

export const searchWithoutLaunch = (search = '') => {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  CONSUMED_LAUNCH_PARAMS.forEach((name) => params.delete(name));
  const text = params.toString();
  return text ? `?${text}` : '';
};
