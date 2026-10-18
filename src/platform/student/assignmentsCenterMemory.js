/*
 * WHAT ASSIGNMENTS WAS SHOWING (student pass 3, NAV-21).
 *
 * The screen unmounts on every navigation, so View Results → Back cleared a
 * search, put the tab back to Active and the marking period back to the
 * current one. Its three filters are kept IN ITS OWN HISTORY ENTRY: Back (or
 * Forward, or a reload) onto that entry finds the list as it was left, and
 * opening Assignments afresh — from the nav, from a result's "All
 * Assignments" — is a new entry and starts clean. (An earlier version kept
 * them in sessionStorage, which also brought an old search back on a fresh
 * visit: a student pressing Assignments saw three rows and no reason.)
 *
 * The key is entry-only: browserHistory.js does not copy it into the entries
 * pushed after this one. Written only while the current entry IS Assignments,
 * stamped with the student, and read back only for that student. Nothing
 * about the work is stored — a search word, a tab id and a period id.
 */
import { ASSIGNMENTS_VIEW_STATE_KEY, readStudentRouteState } from './browserHistory.js';

const MAX_SEARCH = 120;

const browserHistory = () => {
  try { return typeof window !== 'undefined' && window.history ? window.history : null; } catch { return null; }
};

const clean = (value, max = 80) => (typeof value === 'string' ? value.slice(0, max) : null);
const isAssignmentsEntry = (state) => readStudentRouteState(state)?.dashboardMode === 'assignmentsCenter'
  && readStudentRouteState(state)?.surface === 'dashboard';

/** { search, category, periodId } as this entry left them, or {} when there is none. */
export const readAssignmentsView = (studentId, history = browserHistory()) => {
  const id = String(studentId || '').trim();
  const state = history?.state;
  if (!id || !state || typeof state !== 'object' || !isAssignmentsEntry(state)) return {};
  const view = state[ASSIGNMENTS_VIEW_STATE_KEY];
  if (!view || typeof view !== 'object' || Array.isArray(view) || view.studentId !== id) return {};
  return {
    search: clean(view.search, MAX_SEARCH) ?? '',
    category: clean(view.category),
    periodId: clean(view.periodId),
  };
};

export const writeAssignmentsView = (studentId, view = {}, history = browserHistory(), href = null) => {
  const id = String(studentId || '').trim();
  const state = history?.state;
  if (!id || !history || !state || typeof state !== 'object' || !isAssignmentsEntry(state)) return;
  try {
    history.replaceState({
      ...state,
      [ASSIGNMENTS_VIEW_STATE_KEY]: {
        studentId: id,
        search: clean(view.search, MAX_SEARCH) ?? '',
        category: clean(view.category),
        periodId: clean(view.periodId),
      },
    }, '', href ?? (typeof window !== 'undefined' ? window.location.href : undefined));
  } catch { /* best effort */ }
};
