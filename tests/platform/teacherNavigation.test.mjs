// NAVIGATION GROUPED BY WHEN A TEACHER REACHES FOR IT.
//
//   "Do not change this merely to reduce tab count. Use teacher workflow as
//    the deciding factor."
//
// So the assertions below are about placement, not about length. There is
// deliberately no test that the tab count went down, because the count was
// never the problem — the problem was that things a teacher touches every
// period sat beside things they touch twice a semester, and the eye pays for
// that on every visit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/TeacherSidebar.jsx', 'utf8');

const groups = (() => {
  const match = source.match(/const TAB_GROUPS = \[([\s\S]*?)\n\];/);
  if (!match) throw new Error('TAB_GROUPS not found');
  return [...match[1].matchAll(/\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*tabs:\s*\[([^\]]*)\]/g)]
    .map(([, id, label, tabs]) => ({
      id,
      label,
      tabs: tabs.split(',').map((tab) => tab.trim().replace(/'/g, '')).filter(Boolean),
    }));
})();

const groupOf = (tab) => groups.find((group) => group.tabs.includes(tab))?.id || null;

test('every tab still exists somewhere — nothing was dropped to shorten the list', () => {
  const labels = [...source.matchAll(/^\s{2}(\w+):\s*'/gm)].map(([, key]) => key);
  const placed = new Set(groups.flatMap((group) => group.tabs));
  labels.forEach((tab) => {
    assert.ok(placed.has(tab), `${tab} has a label but no home in the rail`);
  });
});

test('no tab appears in two groups', () => {
  const seen = new Set();
  groups.flatMap((group) => group.tabs).forEach((tab) => {
    assert.ok(!seen.has(tab), `${tab} is in two groups`);
    seen.add(tab);
  });
});

test('the daily loop is the first group and contains only daily screens', () => {
  // What needs attention, what is assigned, where the assignments live.
  assert.equal(groups[0].id, 'teach');
  assert.deepEqual(groups[0].tabs, ['home', 'assignments', 'library']);
});

test('configuration is not sitting beside the daily class workspace', () => {
  // Class & Bell Schedule is set in August and edited when the bells change.
  // Next to the class workspace, a settings screen looks like a place to work.
  assert.equal(groupOf('classes'), 'admin');
  assert.equal(groupOf('classesWorkspace'), 'people');
});

test('screens that touch no real student are grouped apart from those that do', () => {
  // Demo, Math Tools and the Simulator are for exploring the platform, trying a
  // tool before assigning it, and seeing what the engine would do. Grouped with
  // Assignments they implied a daily role none of them has.
  ['demo', 'mathTools', 'simulator'].forEach((tab) => {
    assert.equal(groupOf(tab), 'explore', `${tab} is in the wrong group`);
  });
});

test('evidence screens stay together', () => {
  ['grades', 'standards', 'analytics', 'exams'].forEach((tab) => {
    assert.equal(groupOf(tab), 'insight');
  });
});

test('no group is long enough to stop being scannable', () => {
  // The reason to group at all: a list the eye can take in at once. Past about
  // five, a group is just a shorter version of the flat list it replaced.
  groups.forEach((group) => {
    assert.ok(group.tabs.length <= 5, `${group.label} has ${group.tabs.length} entries`);
  });
});
