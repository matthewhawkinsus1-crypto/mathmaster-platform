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
/*
 * WHOSE ENTRY THIS IS.
 *
 * Entries stay in the tab after Log Out. On a shared Chromebook the next
 * student's Back would otherwise walk into the previous student's screens.
 * Every entry the app writes carries the signed-in account's uid; a popstate
 * onto an entry another account wrote is refused (App.jsx). Entries written
 * by spreading the current state (My Math Path's) inherit it.
 */
export const ROUTE_OWNER_STATE_KEY = '__mathmasterRouteOwner';
// What Assignments was showing (assignmentsCenterMemory.js, NAV-21). It belongs
// to its one entry: a push does not copy it into the next entry, so opening
// Assignments afresh starts clean while Back onto that entry restores it.
export const ASSIGNMENTS_VIEW_STATE_KEY = '__mathmasterAssignmentsView';
const ENTRY_ONLY_STATE_KEYS = [ASSIGNMENTS_VIEW_STATE_KEY];
export const readRouteOwner = (state) => (
  state && typeof state === 'object' ? state[ROUTE_OWNER_STATE_KEY] || null : null
);
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

// The sections a Classroom post can be scoped to (App.jsx startAssignment).
const SECTION_SCOPES = Object.freeze(['warmup', 'classwork', 'practice', 'dol']);

export const normalizeStudentRoute = (route = {}) => {
  const requested = cleanString(route?.surface);
  const surface = STUDENT_SURFACES.has(requested) ? requested : 'dashboard';
  if (surface === 'assignment') {
    // A Google Classroom post for one section shows that section only. The
    // scope rides in this tab's entry, so a reload or Back keeps it (NV03);
    // a fresh link to the same address opens the whole assignment.
    const sectionScope = SECTION_SCOPES.includes(cleanString(route.sectionScope)) ? cleanString(route.sectionScope) : '';
    return {
      surface,
      assignmentId: cleanString(route.assignmentId),
      questionIndex: cleanIndex(route.questionIndex),
      ...(sectionScope ? { sectionScope } : {}),
    };
  }

  if (surface === 'assignmentResult') {
    return {
      surface,
      assignmentId: cleanString(route.assignmentId),
      // The Classroom section a closed link arrived through, so Back onto this
      // entry restores the same section report rather than a generic one.
      sectionKey: cleanString(route.sectionKey),
      /*
       * WHERE THE STUDENT CAME FROM, CARRIED WITH THE SCREEN.
       *
       * One result screen is reachable from Assignments, from Grades, and from
       * a Google Classroom link. Browser Back gets this right for free — it
       * pops to whatever entry preceded this one — but the VISIBLE Back control
       * has to be told, or it picks one destination and is wrong half the time
       * for a student who reached the result the other way.
       *
       * Storing it in the history entry is what keeps the two agreeing after a
       * Back out of practice: the restored entry still knows its origin.
       */
      origin: cleanString(route.origin, 'assignments'),
    };
  }

  const dashboardMode = cleanString(route.dashboardMode, 'assignments');
  /*
   * A TEST CYCLE ENTRY NAMES ITS TEST (student pass 3, NAV-9).
   *
   * The card is addressed by assignment, like a result. An entry holding only
   * the mode restored "testCycle" with no test: browser Back showed Home under
   * a /test-cycle address, and two tests in a row restored the wrong card.
   * Where it was opened from rides along, so its Back still names that place.
   */
  if (dashboardMode === 'testCycle') {
    return {
      surface,
      dashboardMode,
      testCycleAssignmentId: cleanString(route.testCycleAssignmentId),
      origin: cleanString(route.origin, 'assignments'),
    };
  }
  return { surface, dashboardMode };
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
    return `assignment:${normalized.assignmentId}:${normalized.questionIndex}${normalized.sectionScope ? `:${normalized.sectionScope}` : ''}`;
  }
  if (normalized.surface === 'assignmentResult') {
    // The origin is part of the identity: the same assignment opened from
    // Grades and from Assignments are two different places to press Back from,
    // and collapsing them into one entry would lose that.
    return `assignmentResult:${normalized.assignmentId}:${normalized.sectionKey}:${normalized.origin}`;
  }
  if (normalized.dashboardMode === 'testCycle') return `dashboard:testCycle:${normalized.testCycleAssignmentId}`;
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

// `url` is the address of the screen this entry records (app/routes/
// browserUrl.js); without one the entry keeps the current address. `owner`
// stamps the entry with the signed-in account; `fresh` drops whatever the
// current entry held (an entry another account wrote).
const carriedStateObject = (replace) => {
  const current = { ...currentStateObject() };
  // A new entry is a new place: what belongs to the entry being left stays there.
  if (!replace) ENTRY_ONLY_STATE_KEYS.forEach((entryKey) => { delete current[entryKey]; });
  return current;
};

const writeState = (key, route, { replace = false, url = null, owner = null, fresh = false } = {}) => {
  if (typeof window === 'undefined' || !window.history) return;
  const next = {
    ...(fresh ? {} : carriedStateObject(replace)),
    [key]: route,
    ...(owner ? { [ROUTE_OWNER_STATE_KEY]: owner } : {}),
  };
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](next, '', url || window.location.href);
};

export const writeStudentRouteState = (route, options = {}) => {
  writeState(STUDENT_ROUTE_STATE_KEY, normalizeStudentRoute(route), options);
};

export const writeMathPathRouteState = (route, options = {}) => {
  writeState(MATH_PATH_ROUTE_STATE_KEY, normalizeMathPathRoute(route), options);
};
