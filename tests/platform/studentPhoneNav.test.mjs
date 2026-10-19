/*
 * NAV-13 (student pass 3): on a phone the student navigation is one row —
 * Home, Assignments, Grades and "More" — and Assignments folds its search.
 * The heights are measured in Chromium by tests/browser/studentScreenChange.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STUDENT_DESTINATION,
  STUDENT_DESTINATION_ORDER,
  STUDENT_PHONE_PRIMARY,
  phoneNavGroups,
} from '../../src/platform/student/navigationModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('NAV-13: Home, Assignments and Grades stay in the row; the other places fold behind More', () => {
  assert.deepEqual(STUDENT_PHONE_PRIMARY, [STUDENT_DESTINATION.HOME, STUDENT_DESTINATION.ASSIGNMENTS, STUDENT_DESTINATION.GRADES]);
  const onGrades = phoneNavGroups(STUDENT_DESTINATION.GRADES);
  assert.deepEqual(onGrades.folded, [STUDENT_DESTINATION.REWARDS, STUDENT_DESTINATION.MATH_PATH, STUDENT_DESTINATION.SECURE_EXAMS]);
  assert.equal(onGrades.currentIsFolded, false);
  // Every destination is reachable: in the row or behind More.
  assert.deepEqual(new Set([...onGrades.primary, ...onGrades.folded]), new Set(STUDENT_DESTINATION_ORDER));
});

test('NAV-13: the screen the student is on is never folded away', () => {
  for (const current of [STUDENT_DESTINATION.REWARDS, STUDENT_DESTINATION.MATH_PATH, STUDENT_DESTINATION.SECURE_EXAMS]) {
    const groups = phoneNavGroups(current);
    assert.equal(groups.folded.includes(current), false, current);
    assert.equal(groups.currentIsFolded, true);
    assert.equal(groups.folded.length, 2);
  }
});

test('NAV-13: the nav marks folded places and draws More with aria-expanded/aria-controls; only a phone hides them', () => {
  const nav = executableSource(read('src/components/student/StudentGlobalNav.jsx'));
  assert.match(nav, /const groups = phoneNavGroups\(current\);/);
  assert.match(nav, /const folded = groups\.folded\.includes\(destination\);[\s\S]*?className=\{folded \? 'mm-student-nav__folded' : undefined\}/);
  const more = region(nav, 'className="mm-student-nav__more"', '</button>');
  assert.match(more, /aria-expanded=\{moreOpen\}/);
  assert.match(more, /aria-controls=\{groups\.folded\.map\(foldedId\)\.join\(' '\)\}/);
  assert.match(nav, /data-more-open=\{moreOpen \? 'true' : 'false'\}/);
  // Escape folds the places again and returns focus to More.
  assert.match(nav, /event\.key !== 'Escape'[\s\S]*?setMoreOpen\(false\);[\s\S]*?\.mm-student-nav__more'\)\?\.focus\(\)/);

  const css = read('src/index.css');
  // More is never drawn on a laptop; on a phone it is, and folded places hide until it opens.
  assert.match(css, /^\.mm-student-nav__more \{ display: none; \}$/m);
  const phone = css.slice(css.indexOf('@media (max-width: 640px) {'), css.indexOf('}\n', css.indexOf('.mm-assignments-filters[data-open="false"]')) + 2);
  assert.match(phone, /\.mm-student-nav__more \{ display: inline-flex;/);
  assert.match(phone, /\.mm-student-nav\[data-more-open="false"\] \.mm-student-nav__folded \{ display: none; \}/);
  assert.match(phone, /\.mm-assignments-filters\[data-open="false"\] \{ display: none !important; \}/);
});

test('NAV-13: Assignments folds the search and period behind one button, and a search in progress stays open', () => {
  const center = executableSource(read('src/components/student/StudentAssignmentsCenter.jsx'));
  assert.match(center, /data-open=\{filtersOpen \|\| Boolean\(search\) \? 'true' : 'false'\}/);
  const toggle = region(center, 'className="mm-assignments-filters__toggle"', '</button>');
  assert.match(toggle, /aria-expanded=\{filtersOpen \|\| Boolean\(search\)\}/);
  assert.match(toggle, /aria-controls="assignments-filters"/);
  assert.match(toggle, /if \(search\) return;/);
});

test('NAV-21: Assignments keeps its search, tab and marking period in its own history entry', async () => {
  const { readAssignmentsView, writeAssignmentsView } = await import('../../src/platform/student/assignmentsCenterMemory.js');
  const { ASSIGNMENTS_VIEW_STATE_KEY, STUDENT_ROUTE_STATE_KEY } = await import('../../src/platform/student/browserHistory.js');
  const fakeHistory = (route) => {
    const history = { state: { [STUDENT_ROUTE_STATE_KEY]: route }, replaceState(next) { history.state = next; } };
    return history;
  };
  const assignmentsEntry = fakeHistory({ surface: 'dashboard', dashboardMode: 'assignmentsCenter' });
  writeAssignmentsView('s1', { search: 'domain', category: 'completed', periodId: 'mp1', answer: 'never stored' }, assignmentsEntry, '/assignments');
  assert.deepEqual(readAssignmentsView('s1', assignmentsEntry), { search: 'domain', category: 'completed', periodId: 'mp1' });
  assert.doesNotMatch(JSON.stringify(assignmentsEntry.state), /never stored/);
  assert.equal(assignmentsEntry.state[STUDENT_ROUTE_STATE_KEY].dashboardMode, 'assignmentsCenter', 'the entry keeps its route');
  const other = readAssignmentsView('s2', assignmentsEntry);
  assert.ok(!other.search && !other.category && !other.periodId, 'another student on the same Chromebook starts fresh');
  // Never written into, or read from, an entry that is not Assignments (the
  // screen mounts before App pushes its entry: the entry then is the old one).
  const resultEntry = fakeHistory({ surface: 'assignmentResult', assignmentId: 'a1' });
  writeAssignmentsView('s1', { search: 'x' }, resultEntry, '/r');
  assert.equal(resultEntry.state[ASSIGNMENTS_VIEW_STATE_KEY], undefined);
  assert.deepEqual(readAssignmentsView('s1', { state: { ...resultEntry.state, [ASSIGNMENTS_VIEW_STATE_KEY]: { studentId: 's1', search: 'x' } } }), {});
  assert.deepEqual(readAssignmentsView('s1', null), {});
  assert.doesNotThrow(() => writeAssignmentsView('s1', {}, { state: assignmentsEntry.state, replaceState: () => { throw new Error('blocked'); } }, '/a'));
});

test('NAV-21: a push leaves the Assignments view in its entry, so a fresh visit starts clean', async () => {
  const pushed = [];
  const history = {
    state: { __mathmasterStudentRoute: { surface: 'dashboard', dashboardMode: 'assignmentsCenter' }, __mathmasterAssignmentsView: { studentId: 's1', search: 'domain' } },
    pushState(next) { pushed.push(next); history.state = next; },
    replaceState(next) { history.state = next; },
  };
  const saved = globalThis.window;
  globalThis.window = { history, location: { href: 'http://x/assignments' } };
  try {
    const { writeStudentRouteState, ASSIGNMENTS_VIEW_STATE_KEY } = await import('../../src/platform/student/browserHistory.js');
    writeStudentRouteState({ surface: 'assignmentResult', assignmentId: 'a1' }, { url: '/assignments/a1/results' });
    assert.equal(pushed.length, 1);
    assert.equal(pushed[0][ASSIGNMENTS_VIEW_STATE_KEY], undefined, 'not carried into the next entry');
    // A replace of the same entry keeps it (App re-stamping the entry it is on).
    history.state = { __mathmasterStudentRoute: { surface: 'dashboard', dashboardMode: 'assignmentsCenter' }, [ASSIGNMENTS_VIEW_STATE_KEY]: { studentId: 's1', search: 'domain' } };
    writeStudentRouteState({ surface: 'dashboard', dashboardMode: 'assignmentsCenter' }, { replace: true, url: '/assignments' });
    assert.equal(history.state[ASSIGNMENTS_VIEW_STATE_KEY]?.search, 'domain');
  } finally {
    globalThis.window = saved;
  }
});

test('NAV-21: the screen restores from and writes to its entry', () => {
  const center = executableSource(read('src/components/student/StudentAssignmentsCenter.jsx'));
  assert.match(center, /const \[remembered\] = useState\(\(\) => readAssignmentsView\(studentId\)\);/);
  assert.match(center, /useState\(remembered\.search \|\| ''\)/);
  assert.match(center, /useEffect\(\(\) => \{ writeAssignmentsView\(studentId, \{ search, category, periodId \}\); \}, \[studentId, search, category, periodId\]\);/);
});

test('review note: opening More moves focus to the first unfolded place, so Tab stays in the nav', () => {
  const nav = executableSource(read('src/components/student/StudentGlobalNav.jsx'));
  const more = region(nav, 'className="mm-student-nav__more"', '</button>');
  assert.match(more, /if \(opening\) \{[\s\S]*?nav\?\.querySelector\('\.mm-student-nav__folded'\)\?\.focus\(\)/);
});
