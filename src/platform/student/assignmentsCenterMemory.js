/*
 * WHAT ASSIGNMENTS WAS SHOWING (student pass 3, P3).
 *
 * The screen unmounts on every navigation, so View Results → Back cleared a
 * search, put the tab back to Active and the marking period back to the
 * current one. Its three filters are kept for this tab of the browser
 * (sessionStorage), per student, so Back finds the list as it was left. Best
 * effort: a private window or blocked storage just starts fresh. Nothing about
 * the work is stored — a search word, a tab id and a period id.
 */
const KEY_PREFIX = 'mm-assignments-view:';
const MAX_SEARCH = 120;

const storage = () => {
  try { return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null; } catch { return null; }
};

const clean = (value, max = 80) => (typeof value === 'string' ? value.slice(0, max) : null);

export const assignmentsViewKey = (studentId) => `${KEY_PREFIX}${String(studentId || '').trim()}`;

/** { search, category, periodId } as last left, or {} when there is none. */
export const readAssignmentsView = (studentId, store = storage()) => {
  if (!String(studentId || '').trim() || !store) return {};
  try {
    const parsed = JSON.parse(store.getItem(assignmentsViewKey(studentId)) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return {
      search: clean(parsed.search, MAX_SEARCH) ?? '',
      category: clean(parsed.category),
      periodId: clean(parsed.periodId),
    };
  } catch { return {}; }
};

export const writeAssignmentsView = (studentId, view = {}, store = storage()) => {
  if (!String(studentId || '').trim() || !store) return;
  try {
    store.setItem(assignmentsViewKey(studentId), JSON.stringify({
      search: clean(view.search, MAX_SEARCH) ?? '',
      category: clean(view.category),
      periodId: clean(view.periodId),
    }));
  } catch { /* best effort */ }
};
