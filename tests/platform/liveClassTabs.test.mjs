// LIVE CLASS'S ROOM / WALKTHROUGH / ATTENTION, AS REAL TABS (TT27, slice 2).
//
// They were buttons with role="tab" and nothing else of the pattern: each was a
// Tab stop, the arrow keys did nothing, and no panel said it belonged to them (a
// screen reader announces "tab, 2 of 3" and then has no tab panel to go to). Now
// the selected tab is the one Tab stop, Left / Right / Home / End move focus
// between them (src/platform/interaction/tabListKeys.js), each tab says which
// panel it controls, and the content under them is a tab panel named by the
// selected tab. Moving does not select: Walkthrough picks the class's live
// assignment when none is chosen, and that choice carries to the other views, so
// arrowing from Room to Attention must not set it on the way past.
//
// Node cannot render the monitor, so the keys are the pure function's and the
// markup is read as source; the browser proof is tests/browser/
// accessibilityTeacherLiveClassTabs.mjs, which presses the keys in the real app,
// and the teacher-home and teacher-live-class scenes of the accessibility ratchet,
// which audit the panel and the tab list (aria-controls, tabpanel, tablist).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tabKeyTarget } from '../../src/platform/interaction/tabListKeys.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const monitor = executableSource(readFileSync(new URL('../../src/components/teacher/LiveClassMonitor.jsx', import.meta.url), 'utf8'));

test('Left and Right move between the tabs, wrapping; Home and End jump; nothing else moves', () => {
  assert.equal(tabKeyTarget('ArrowRight', 0, 3), 1);
  assert.equal(tabKeyTarget('ArrowRight', 2, 3), 0, 'Right from the last wraps to the first');
  assert.equal(tabKeyTarget('ArrowLeft', 1, 3), 0);
  assert.equal(tabKeyTarget('ArrowLeft', 0, 3), 2, 'Left from the first wraps to the last');
  assert.equal(tabKeyTarget('Home', 2, 3), 0);
  assert.equal(tabKeyTarget('End', 0, 3), 2);
  // A horizontal list leaves Up and Down to the page, which scrolls on them.
  for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'Tab', 'Enter', ' ', 'Escape', 'a']) {
    assert.equal(tabKeyTarget(key, 1, 3), null, `${JSON.stringify(key)} does not move`);
  }
  assert.equal(tabKeyTarget('ArrowRight', 0, 0), null, 'no tabs');
  assert.equal(tabKeyTarget('Home', 0, 0), null);
  assert.equal(tabKeyTarget('ArrowRight', -1, 3), 1, 'focus on none of them counts as the first');
  assert.equal(tabKeyTarget('ArrowLeft', 9, 3), 2);
});

test('a vertical list takes Up and Down instead', () => {
  assert.equal(tabKeyTarget('ArrowDown', 0, 3, { vertical: true }), 1);
  assert.equal(tabKeyTarget('ArrowUp', 0, 3, { vertical: true }), 2);
  assert.equal(tabKeyTarget('ArrowRight', 0, 3, { vertical: true }), null);
  assert.equal(tabKeyTarget('End', 0, 3, { vertical: true }), 2);
});

const tablist = region(monitor, '<div role="tablist" aria-label="Live monitoring mode"', '{liveTeachingStale && (', 'the tab list');

test('the tab list is one Tab stop (the selected tab), each tab names its panel, and its keys are the shared ones', () => {
  assert.match(tablist, /onKeyDown=\{moveBetweenModes\}/, 'the keys are on the list');
  const tab = region(tablist, '<button', '</button>', 'one tab');
  assert.match(tab, /role="tab"/);
  assert.match(tab, /aria-selected=\{mode === id\}/);
  assert.match(tab, /tabIndex=\{mode === id \? 0 : -1\}/, 'only the selected tab is in the Tab order');
  assert.match(tab, /aria-controls=\{LIVE_CLASS_PANEL_ID\}/, 'and each says which panel it controls');
  assert.match(tab, /id=\{liveClassTabId\(id\)\}/, 'it has an id for the panel to be named by');
  assert.match(tab, /ref=\{\(node\) => \{ tabRefs\.current\[id\] = node; \}\}/, 'and a ref, which is how the keys find the tab to focus');
  assert.match(tab, /onClick=\{\(\) => switchMode\(id\)\}/, 'a click and Enter or Space (a native button\'s click) select the same way');
  const keys = region(monitor, 'const moveBetweenModes = (event) => {', '\n  };', 'the tab keys');
  assert.match(keys, /tabKeyTarget\(event\.key, /, 'which tab a key goes to is the shared function\'s');
  assert.match(keys, /tabRefs\.current\[[^\]]+\]\?\.focus\(\)/, 'moving puts focus on the tab');
  assert.doesNotMatch(keys, /switchMode|setMode/, 'moving does not select: that is Enter or Space on the tab');
});

test('the content under the tabs is one tab panel, named by the selected tab, and the award dialog is outside it', () => {
  const start = monitor.indexOf('id={LIVE_CLASS_PANEL_ID}');
  assert.notEqual(start, -1, 'the panel exists');
  const opening = monitor.slice(monitor.lastIndexOf('<div', start), monitor.indexOf('>', start) + 1);
  assert.match(opening, /role="tabpanel"/);
  assert.match(opening, /aria-labelledby=\{liveClassTabId\(mode\)\}/, 'it is named by the tab that is selected');
  // It holds what changes with the mode (the controls, the see-next list, the tiles or the walkthrough), and the dialog does not.
  const panel = monitor.slice(start, monitor.indexOf('{awardDialogStudent && activeClassId && ('));
  for (const part of ['<LiveTeachingPanel', 'mode === \'walkthrough\' ?', '<StudentTile', 'Who to see next']) assert.ok(panel.includes(part), `the panel holds ${part}`);
  assert.match(panel, /<\/div>\s*$/, 'the panel closes right before the Class Points dialog, which is not inside it');
  // The tab list sits above the panel and is not part of it.
  assert.ok(monitor.indexOf('role="tablist"') < start);
  assert.ok(!panel.includes('role="tablist"'));
});

test('the ids the tabs and the panel use are one pair of constants, unique to this screen', () => {
  assert.match(monitor, /const LIVE_CLASS_PANEL_ID = 'live-class-panel';/);
  assert.match(monitor, /const liveClassTabId = \(mode\) => `live-class-tab-\$\{mode\}`;/);
});
