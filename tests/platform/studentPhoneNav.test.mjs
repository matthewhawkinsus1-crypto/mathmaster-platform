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

test('P3: Assignments keeps its search, tab and marking period for Back, per student, in this tab only', async () => {
  const { readAssignmentsView, writeAssignmentsView, assignmentsViewKey } = await import('../../src/platform/student/assignmentsCenterMemory.js');
  const data = new Map();
  const store = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  writeAssignmentsView('s1', { search: 'domain', category: 'completed', periodId: 'mp1', answer: 'never stored' }, store);
  assert.deepEqual(readAssignmentsView('s1', store), { search: 'domain', category: 'completed', periodId: 'mp1' });
  const other = readAssignmentsView('s2', store);
  assert.ok(!other.search && !other.category && !other.periodId, 'another student on the same Chromebook starts fresh');
  assert.doesNotMatch(data.get(assignmentsViewKey('s1')), /never stored/);
  const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(readAssignmentsView('s1', throwing), {});
  assert.doesNotThrow(() => writeAssignmentsView('s1', {}, throwing));

  const center = executableSource(read('src/components/student/StudentAssignmentsCenter.jsx'));
  assert.match(center, /const \[remembered\] = useState\(\(\) => readAssignmentsView\(studentId\)\);/);
  assert.match(center, /useState\(remembered\.search \|\| ''\)/);
  assert.match(center, /useEffect\(\(\) => \{ writeAssignmentsView\(studentId, \{ search, category, periodId \}\); \}, \[studentId, search, category, periodId\]\);/);
});
