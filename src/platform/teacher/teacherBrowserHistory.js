// Browser-history bridge for the teacher workspace.
//
// MathMaster does not use react-router: the teacher's screens are React state
// (`teacherTab`, the administration mode, the "View as Student" / Live Teaching
// preview, and the panels that open over a screen). Without History API
// entries the browser sees the whole teacher workspace as ONE page, so a single
// Back press — often by accident, mid-lesson, on a projector — leaves
// MathMaster for whatever site the teacher was on before.
//
// The student side solved the same problem in platform/student/browserHistory.js.
// This is the teacher counterpart: small, serializable snapshots of "where the
// teacher is", stored in history.state. App.jsx owns the React state; this
// module only decides what an entry is, what makes two entries the same place,
// and how to read and write them.

export const TEACHER_ROUTE_STATE_KEY = '__mathmasterTeacherRoute';

// One per page load. Entries are stamped with it so App can tell an entry this
// document wrote (safe to step back into: it only fires popstate) from one left
// over from before a reload (stepping back into that reloads the page).
export const TEACHER_HISTORY_DOCUMENT_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const cleanString = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const cleanIndex = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
};

/*
 * THE PANELS THAT OPEN OVER A SCREEN, BOTTOM TO TOP.
 *
 * Each of these is a place a teacher goes, not a form they fill in: an
 * assignment's hub, a student's profile drawer, the case review and the support
 * evidence report stacked above it, and the Test Cycle student preview. Back
 * closes the top one and leaves the screen underneath exactly as it was.
 *
 * Editors and confirmations (the question editor, delete, preflight…) are
 * deliberately NOT here. Back never closes those: they can hold unsaved work.
 */
export const TEACHER_PANEL_FIELDS = Object.freeze([
  'hubAssignmentId',
  'studentId',
  'caseReviewStudentId',
  'supportReportStudentId',
  'testCyclePreviewAssignmentId',
]);

const TEACHER_SURFACES = new Set(['workspace', 'administration', 'preview']);

const normalizePanels = (panels = {}) => {
  const normalized = {};
  TEACHER_PANEL_FIELDS.forEach((field) => {
    const value = cleanString(panels?.[field]);
    if (value) normalized[field] = value;
  });
  // The hub remembers which class it was opened for, so Forward reopens it on
  // the same class. It is not part of the panel's identity (see the key).
  const hubClassId = cleanString(panels?.hubClassId);
  if (normalized.hubAssignmentId && hubClassId) normalized.hubClassId = hubClassId;
  return normalized;
};

export const normalizeTeacherRoute = (route = {}) => {
  const requested = cleanString(route?.surface);
  const surface = TEACHER_SURFACES.has(requested) ? requested : 'workspace';

  if (surface === 'administration') {
    return { surface, adminTab: cleanString(route.adminTab, 'classes') };
  }

  if (surface === 'preview') {
    return {
      surface,
      assignmentId: cleanString(route.assignmentId),
      // Where the preview was. A teacher stepping through a lesson is still on
      // one screen — question moves update this entry instead of adding one —
      // but Forward back into the preview should land on the same question.
      questionIndex: cleanIndex(route.questionIndex),
    };
  }

  return {
    surface,
    tab: cleanString(route.tab, 'home'),
    panels: normalizePanels(route.panels),
  };
};

/*
 * WHAT MAKES TWO ENTRIES THE SAME PLACE.
 *
 * The screen key leaves the panels out: it is the screen UNDER any panel. The
 * route key adds the open panels. A preview's question is left out on purpose —
 * moving through a lesson while presenting must not turn Back into "previous
 * question" twenty times before it reaches the teacher's dashboard.
 */
export const teacherScreenKey = (route = {}) => {
  const normalized = normalizeTeacherRoute(route);
  if (normalized.surface === 'administration') return `administration:${normalized.adminTab}`;
  if (normalized.surface === 'preview') return `preview:${normalized.assignmentId}`;
  return `workspace:${normalized.tab}`;
};

export const teacherRouteKey = (route = {}) => {
  const normalized = normalizeTeacherRoute(route);
  const screen = teacherScreenKey(normalized);
  if (normalized.surface !== 'workspace') return screen;
  const open = TEACHER_PANEL_FIELDS
    .filter((field) => normalized.panels[field])
    .map((field) => `${field}=${normalized.panels[field]}`);
  return open.length ? `${screen}|${open.join('|')}` : screen;
};

// Two routes with the same key are the same place; this tells whether the
// entry's details (the preview's question, the hub's class) are also current.
export const teacherRouteSignature = (route = {}) => JSON.stringify(normalizeTeacherRoute(route));

const openPanelCount = (route) => (
  route.surface === 'workspace'
    ? TEACHER_PANEL_FIELDS.filter((field) => route.panels[field]).length
    : 0
);

/*
 * CLOSING A PANEL IS A STEP BACK, NOT A NEW PLACE.
 *
 * Opening a student's drawer adds an entry. If closing it with its own ✕ added
 * ANOTHER entry, a teacher who looked at four students would need eight Back
 * presses to leave the Gradebook, half of them reopening drawers they had
 * already closed. So when the teacher closes a panel and the entry directly
 * behind this one is exactly where they are going, App steps back to it.
 *
 * `entry` is the current history entry as written by writeTeacherRouteState
 * (route + the key it was pushed from + the document it belongs to). The
 * document check matters: an entry left over from before a reload belongs to a
 * document that no longer exists, and stepping back into it reloads the page.
 */
export const shouldStepBackToRoute = ({ entry, target, documentId }) => {
  if (!entry?.route || !entry.fromKey || !documentId || entry.documentId !== documentId) return false;
  const current = normalizeTeacherRoute(entry.route);
  const next = normalizeTeacherRoute(target);
  if (teacherScreenKey(current) !== teacherScreenKey(next)) return false;
  if (openPanelCount(next) >= openPanelCount(current)) return false;
  return entry.fromKey === teacherRouteKey(next);
};

/*
 * WHAT TO DO WITH THE BROWSER WHEN THE TEACHER'S SCREEN CHANGES.
 *
 *   none     the entry already says exactly this (a popstate just restored it)
 *   replace  same place, newer details — the preview moved to another question
 *   back     a panel closed onto the entry directly behind this one
 *   push     anywhere new
 *
 * App runs this from an effect on every screen change and does what it says.
 */
export const planTeacherHistoryWrite = ({ entry, target, documentId }) => {
  const currentKey = entry?.route ? teacherRouteKey(entry.route) : null;
  if (currentKey === teacherRouteKey(target)) {
    return teacherRouteSignature(entry.route) === teacherRouteSignature(target)
      ? { action: 'none' }
      : { action: 'replace', fromKey: entry.fromKey || null, documentId: entry.documentId || null };
  }
  if (shouldStepBackToRoute({ entry, target, documentId })) return { action: 'back' };
  return { action: 'push', fromKey: currentKey, documentId };
};

export const readTeacherHistoryEntry = (state) => {
  const entry = state?.[TEACHER_ROUTE_STATE_KEY];
  if (!entry || typeof entry !== 'object' || !entry.route) return null;
  return {
    route: normalizeTeacherRoute(entry.route),
    fromKey: cleanString(entry.fromKey) || null,
    documentId: cleanString(entry.documentId) || null,
  };
};

export const readTeacherRouteState = (state) => readTeacherHistoryEntry(state)?.route || null;

const currentStateObject = () => (
  typeof window !== 'undefined' && window.history?.state && typeof window.history.state === 'object'
    ? window.history.state
    : {}
);

export const writeTeacherRouteState = (route, { replace = false, fromKey = null, documentId = null } = {}) => {
  if (typeof window === 'undefined' || !window.history) return;
  const next = {
    ...currentStateObject(),
    [TEACHER_ROUTE_STATE_KEY]: {
      route: normalizeTeacherRoute(route),
      fromKey: fromKey || null,
      documentId: documentId || null,
    },
  };
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](next, '', window.location.href);
};
