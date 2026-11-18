/*
 * THE DISABLED OPENER IS KEPT FOR THE 4 SECONDS IT CAN BE READ, THEN LET GO.
 *
 * Dialog.jsx remembers a control that lost focus because it was disabled (the
 * Scratchpad button greys out while its overlay loads), and a dialog opening
 * within 4 s returns focus to it on close. The record was never cleared, so it
 * kept that control and its whole detached tree alive after a lesson closed:
 * about 230 nodes at Home (docs/handoffs/NOVEMBER_BUILD_2026-11.md, section 6).
 * src/ui/disabledOpener.js now forgets it once the 4 s have passed; within
 * them it answers exactly as the old check did.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DISABLED_OPENER_WINDOW_MS, createDisabledOpenerMemory } from '../../src/ui/disabledOpener.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// A timer queue on a steady clock the test moves by hand, and a wall clock
// (Date.now()) that normally reads the same but can be set back.
const fakeTime = () => {
  let steady = 0;
  let wallOffset = 0;
  let nextId = 1;
  const timers = new Map();
  const advanceTo = (time) => {
    for (;;) {
      const due = [...timers.entries()].filter(([, entry]) => entry.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      steady = due[1].at;
      timers.delete(due[0]);
      due[1].callback();
    }
    steady = time;
  };
  return {
    now: () => steady + wallOffset,
    setTimer: (callback, ms) => { const id = nextId; nextId += 1; timers.set(id, { at: steady + ms, callback }); return id; },
    clearTimer: (id) => timers.delete(id),
    advanceTo,
    steady: () => steady,
    setWallBack: (ms) => { wallOffset -= ms; },
    pending: () => timers.size,
  };
};

// The rule Dialog.jsx used before this change, for comparison.
const oldRecent = (record, now) => (record && now - record.at <= DISABLED_OPENER_WINDOW_MS ? record.element : null);

test('within the 4 s the opener is borrowed exactly as before, and not one millisecond after', () => {
  assert.equal(DISABLED_OPENER_WINDOW_MS, 4000);
  const time = fakeTime();
  const memory = createDisabledOpenerMemory(time);
  const button = { name: 'Scratchpad' };
  time.advanceTo(1000);
  memory.remember(button);
  const oldRecord = { element: button, at: 1000 };
  for (const at of [1000, 1001, 2500, 4999, 5000, 5001, 6000, 60000]) {
    time.advanceTo(at);
    assert.equal(memory.recent(), oldRecent(oldRecord, time.now()), `at +${at - 1000} ms`);
  }
});

test('once the 4 s have passed the element is let go, read or not', () => {
  const time = fakeTime();
  const memory = createDisabledOpenerMemory(time);
  const button = { name: 'Scratchpad' };
  memory.remember(button);
  time.advanceTo(4000);
  assert.equal(memory.held(), button, 'still held at the last millisecond it can be read');
  time.advanceTo(4001);
  assert.equal(memory.held(), null, 'nothing keeps the element, or its detached tree, alive');
  assert.equal(time.pending(), 0, 'and no timer is left behind');
  // Nobody read it in between: it still goes.
  memory.remember(button);
  time.advanceTo(4001 + 5000);
  assert.equal(memory.held(), null);
});

test('a later disabled control replaces the earlier one and has its own 4 s', () => {
  const time = fakeTime();
  const memory = createDisabledOpenerMemory(time);
  const first = { name: 'first' };
  const second = { name: 'second' };
  memory.remember(first);
  time.advanceTo(3000);
  memory.remember(second);
  assert.equal(time.pending(), 1, 'one timer at a time');
  time.advanceTo(4001);
  assert.equal(memory.recent(), second, 'the second is still within its window');
  assert.equal(memory.held(), second);
  time.advanceTo(7001);
  assert.equal(memory.held(), null);
});

test('a wall clock set back keeps the record exactly as long as the old rule would read it', () => {
  const time = fakeTime();
  const memory = createDisabledOpenerMemory(time);
  const button = { name: 'Scratchpad' };
  memory.remember(button);
  time.advanceTo(1000);
  time.setWallBack(3000);
  // The timer fires at 4001 on the steady clock; Date.now() then reads 1001,
  // so the old rule would still hand the button out.
  time.advanceTo(4001);
  assert.equal(memory.recent(), oldRecent({ element: button, at: 0 }, time.now()));
  assert.equal(memory.recent(), button);
  assert.equal(memory.held(), button, 'still readable, so still held');
  time.advanceTo(7000);
  assert.equal(memory.recent(), button, 'Date.now() reads 4000');
  time.advanceTo(7001);
  assert.equal(memory.recent(), null);
  assert.equal(memory.held(), null, 'let go the moment it can no longer be read');
  assert.equal(time.pending(), 0);
});

test('Dialog.jsx remembers only a disabled control, through the memory, and holds no element of its own', () => {
  const source = executableSource(componentSource('src/ui/Dialog.jsx'));
  const wiring = region(source, 'const disabledOpener = createDisabledOpenerMemory();', 'const openDialogElements', 'the disabled-opener wiring');
  assert.match(wiring, /document\.addEventListener\('focusout', \(event\) => \{\s*if \(event\.target\?\.disabled === true\) disabledOpener\.remember\(event\.target\);\s*\}, true\);/);
  assert.match(wiring, /const recentDisabledOpener = \(\) => disabledOpener\.recent\(\);/);
  // No module-level variable of Dialog's own keeps an element any more.
  assert.doesNotMatch(source, /let disabledOpener\b/);
  assert.doesNotMatch(source, /disabledOpener\s*=\s*\{/);
  // The opener is still borrowed when a dialog opens with focus on <body>.
  const opening = region(source, 'const borrowed = recentDisabledOpener();', 'const addedTabIndex', 'the opener choice');
  assert.match(opening, /\(borrowed && !dialog\.contains\(borrowed\) \? borrowed : null\)/);
});
