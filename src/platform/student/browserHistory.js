// Browser-history bridge for the student single-page app.
//
// MathMaster intentionally does not use react-router; student navigation is
// state-driven. Without History API entries, the browser's Back button sees
// only one document and can jump to the website the student visited before
// MathMaster.
//
// This module stores small, serializable navigation snapshots inside
// history.state. The UI components own the React state; this module only gives
// them a stable way to read/write browser entries.

export const STUDENT_ROUTE_STATE_KEY = '__mathmasterStudentRoute';
export const MATH_PATH_ROUTE_STATE_KEY = '__mathmasterMathPathRoute';

const cleanString = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const cleanIndex = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
};

/*
 * THE STUDENT'S SCREENS, AS BROWSER ENTRIES.
 *
 * Home -> Grades -> Assignment Result -> Practice is four screens, so it has to
 * be four history entries: a student who presses Back from practice expects the
 * result they opened it from, not the website they were on before MathMaster.
 *
 * Grades is a dashboard mode, so it needs nothing new here — 'grades' is simply
 * another `dashboardMode` and gets its own key for free. Assignment Result is a
 * surface of its own because it is addressed by assignment, and because a
 * Google Classroom deep link into a closed assignment lands directly on it: that
 * entry has to be restorable by Back/Forward like any other.
 */
const STUDENT_SURFACES = new Set(['assignment', 'assignmentResult', 'dashboard']);

export const normalizeStudentRoute = (route = {}) => {
  const requested = cleanString(route?.surface);
  const surface = STUDENT_SURFACES.has(requested) ? requested : 'dashboard';
  if (surface === 'assignment') {
    return {
      surface,
      assignmentId: cleanString(route.assignmentId),
      questionIndex: cleanIndex(route.questionIndex),
    };
  }

  if (surface === 'assignmentResult') {
    return {
      surface,
      assignmentId: cleanString(route.assignmentId),
      // The Classroom section a closed link arrived through, so Back onto this
      // entry restores the same section report rather than a generic one.
      sectionKey: cleanString(route.sectionKey),
    };
  }

  return {
    surface,
    dashboardMode: cleanString(route.dashboardMode, 'assignments'),
  };
};

export const normalizeMathPathRoute = (route = {}) => ({
  tab: cleanString(route?.tab, 'path'),
  sessionConfig: route?.tab === 'session' && route?.sessionConfig
    ? { ...route.sessionConfig }
    : null,
});

export const studentRouteKey = (route = {}) => {
  const normalized = normalizeStudentRoute(route);
  if (normalized.surface === 'assignment') {
    return `assignment:${normalized.assignmentId}:${normalized.questionIndex}`;
  }
  if (normalized.surface === 'assignmentResult') {
    return `assignmentResult:${normalized.assignmentId}:${normalized.sectionKey}`;
  }
  return `dashboard:${normalized.dashboardMode}`;
};

export const mathPathRouteKey = (route = {}) => {
  const normalized = normalizeMathPathRoute(route);
  if (normalized.tab !== 'session') return `mathPath:${normalized.tab}`;
  const config = normalized.sessionConfig || {};
  return [
    'mathPath:session',
    cleanString(config.targetAlignmentKey),
    cleanString(config.sessionKind, 'practice'),
    cleanString(config.assessmentFramework, 'course'),
    cleanString(config.weeklySlotKey),
  ].join(':');
};

export const readStudentRouteState = (state) => {
  const route = state?.[STUDENT_ROUTE_STATE_KEY];
  return route ? normalizeStudentRoute(route) : null;
};

export const readMathPathRouteState = (state) => {
  const route = state?.[MATH_PATH_ROUTE_STATE_KEY];
  return route ? normalizeMathPathRoute(route) : null;
};

const currentStateObject = () => (
  typeof window !== 'undefined' && window.history?.state && typeof window.history.state === 'object'
    ? window.history.state
    : {}
);

const writeState = (key, route, { replace = false } = {}) => {
  if (typeof window === 'undefined' || !window.history) return;
  const next = {
    ...currentStateObject(),
    [key]: route,
  };
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](next, '', window.location.href);
};

export const writeStudentRouteState = (route, options = {}) => {
  writeState(STUDENT_ROUTE_STATE_KEY, normalizeStudentRoute(route), options);
};

export const writeMathPathRouteState = (route, options = {}) => {
  writeState(MATH_PATH_ROUTE_STATE_KEY, normalizeMathPathRoute(route), options);
};
