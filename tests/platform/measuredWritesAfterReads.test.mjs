/*
 * WHAT A QUESTION MEASURES IS WRITTEN AFTER EVERYTHING HAS BEEN MEASURED.
 *
 * A read that needs layout (offsetHeight, getBoundingClientRect) made after a
 * write in the same task makes the browser lay the page out early, once per
 * read. On a production build at 4x CPU (the runtime driver's trace mode,
 * tests/browser/teacherWorkflow/studentRuntimePerformance.mjs), the identity
 * bar, the sticky navigator, task card and action bar, and the Work View
 * button each measured themselves and wrote what they found in turn as a
 * question opened, so each measurement after the first laid the page out
 * again: 8 forced layouts opening an assignment on a Chromebook, 4 on the
 * plainest Next. Now each measures at once and hands its writes to
 * layoutWrites.js, which makes them together once the commit has finished
 * measuring, before the next frame; a bar that leaves and comes back in one
 * commit (the next question's task card and action bar) keeps its variable,
 * and one of the same height writes nothing. The driver's trace mode holds the
 * browser's count to FORCED_LAYOUT_BUDGET; this holds what node can see: the
 * order of reads and writes, and the components' as source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cancelLayoutWrite, deferLayoutWrite, writeStyleVariable } from '../../src/platform/layout/layoutWrites.js';
import { stickyHeightRef } from '../../src/platform/layout/stickyHeightRef.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
// Resolves once the writes a commit handed over have been made (a microtask queued after theirs).
const commitWritten = () => new Promise((resolve) => queueMicrotask(resolve));

const loggedStyle = (log = []) => {
  const values = new Map();
  return {
    log,
    values,
    style: {
      getPropertyValue: (name) => values.get(name) || '',
      setProperty: (name, value) => { values.set(name, value); log.push(`set ${name} ${value}`); },
      removeProperty: (name) => { values.delete(name); log.push(`remove ${name}`); },
    },
  };
};

/* ------------------------------------------------------------ layoutWrites.js */

test('a commit\'s measured writes wait until it has finished measuring, and the last under a key wins', async () => {
  const made = [];
  deferLayoutWrite('nav', () => made.push('nav 60px'));
  deferLayoutWrite('task', () => made.push('task 120px'));
  deferLayoutWrite('nav', () => made.push('nav 64px'));
  deferLayoutWrite('gone', () => made.push('gone'));
  cancelLayoutWrite('gone');
  assert.deepEqual(made, [], 'nothing is written while the commit is still measuring');
  await commitWritten();
  assert.deepEqual(made, ['task 120px', 'nav 64px'], 'once each, the later nav write in place of the earlier, the cancelled one not at all');
  // Before the next task: a frame cannot start in between.
  deferLayoutWrite('late', () => made.push('late'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(made.at(-1), 'late');
});

test('a write that throws leaves the rest of the commit\'s writes to be made, and still reaches the page', () => {
  const made = [];
  const queued = [];
  const original = globalThis.queueMicrotask;
  globalThis.queueMicrotask = (callback) => queued.push(callback);
  try {
    deferLayoutWrite('broken', () => { throw new Error('the element has gone'); });
    deferLayoutWrite('after', () => made.push('after'));
    assert.equal(queued.length, 1, 'one flush for the commit');
    queued.shift()();
    assert.deepEqual(made, ['after']);
    assert.equal(queued.length, 1, 'the error is thrown again, on its own');
    assert.throws(() => queued.shift()(), /the element has gone/);
  } finally {
    globalThis.queueMicrotask = original;
  }
});

test('a variable is set only when its value changes, and removed only when it is there', () => {
  const { log, style } = loggedStyle();
  writeStyleVariable(style, '--x-height', '40px');
  writeStyleVariable(style, '--x-height', '40px');
  writeStyleVariable(style, '--x-height', null);
  writeStyleVariable(style, '--x-height', null);
  assert.deepEqual(log, ['set --x-height 40px', 'remove --x-height']);
});

/* --------------------------------------------------------- stickyHeightRef.js */

const withDocument = async (style, run) => {
  globalThis.document = { documentElement: { style } };
  try {
    return await run();
  } finally {
    delete globalThis.document;
  }
};
const bar = (log, name, height) => ({ get offsetHeight() { log.push(`read ${name}`); return height.value ?? height; } });

test('the sticky bars are all measured before any of them is written', async () => {
  const { log, style } = loggedStyle();
  await withDocument(style, async () => {
    // Opening an assignment: the navigator, the task card and the action bar arrive in one commit.
    stickyHeightRef('--x-nav')(bar(log, 'nav', 60));
    stickyHeightRef('--x-task')(bar(log, 'task', 120));
    stickyHeightRef('--x-actions')(bar(log, 'actions', 64));
    assert.deepEqual(log, ['read nav', 'read task', 'read actions'], 'each read once, and nothing written between the reads');
    await commitWritten();
    assert.deepEqual(log.slice(3), ['set --x-nav 60px', 'set --x-task 120px', 'set --x-actions 64px']);
  });
});

test('on Next, the next question\'s bar of the same height writes nothing; one that has gone is removed', async () => {
  const { log, style } = loggedStyle();
  await withDocument(style, async () => {
    const task = stickyHeightRef('--x-next-task');
    const actions = stickyHeightRef('--x-next-actions');
    task(bar(log, 'task', 120));
    actions(bar(log, 'actions', 64));
    await commitWritten();
    log.length = 0;
    // Next: each old bar leaves and the new one arrives in the same commit.
    task(null);
    task(bar(log, 'next task', 96));
    actions(null);
    actions(bar(log, 'next actions', 64));
    await commitWritten();
    assert.deepEqual(log, ['read next task', 'read next actions', 'set --x-next-task 96px'], 'no removal and re-adding, and only the height that changed');
    // A screen without the bar (leaving the assignment).
    actions(null);
    await commitWritten();
    assert.deepEqual(log.slice(3), ['remove --x-next-actions']);
  });
});

test('a sticky bar is read once per resize, from its observer, and writes only a new height', async () => {
  const { log, style } = loggedStyle();
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  try {
    await withDocument(style, async () => {
      const height = { value: 58 };
      stickyHeightRef('--x-resize')(bar(log, 'nav', height));
      await commitWritten();
      assert.deepEqual(log, ['read nav', 'set --x-resize 58px']);
      height.value = 102; // it wrapped
      observers.at(-1).callback([]);
      assert.deepEqual(log.slice(2), ['read nav', 'set --x-resize 102px'], 'published where the observer reports it, as before');
      observers.at(-1).callback([]);
      assert.deepEqual(log.slice(4), ['read nav'], 'a report with no new height writes nothing');
    });
  } finally {
    delete globalThis.ResizeObserver;
  }
});

/* ------------------------------------------------------- the components, as source */

test('the Work View button reads everything before it writes, and writes with the commit', () => {
  const figure = executableSource(read('src/components/common/EnlargeableFigure.jsx'));
  const publish = region(figure, 'const publishSpace = () => {', 'const stopObserving', 'the opener measurement');
  const [reads, writes] = publish.split('deferLayoutWrite(surface, () => {');
  assert.ok(writes, 'its writes are handed to layoutWrites.js');
  for (const measured of [/Math\.ceil\(opener\.offsetWidth\)/, /surface\.clientWidth/, /getComputedStyle\(opener\)/, /const bottom = stacked \|\| leavesItsRow \? 0 : bottomEdge\(\);/]) {
    assert.match(reads, measured);
  }
  // After writing, it reads only the bottom edge of a button that has just left a row of its own for the corner.
  assert.doesNotMatch(writes.replace('leavesItsRow ? bottomEdge() : bottom', ''), /offset|client|getComputedStyle|getBoundingClientRect|bottomEdge\(\)/);
  assert.match(figure, /cancelLayoutWrite\(surface\);/, 'and a write still waiting is dropped when the button goes');
});

test('the identity bar reads both heights before writing, and keeps its variables through a remount', () => {
  const bar = executableSource(read('src/components/student/StudentIdentityBar.jsx'));
  const publish = region(bar, 'const publishHeight = () => {', '};', 'the height publication');
  const firstWrite = publish.indexOf('deferLayoutWrite(');
  assert.ok(firstWrite > 0, 'written with the commit (layoutWrites.js)');
  assert.equal(publish.match(/\.offsetHeight/g)?.length, 2, 'the bar and its notice, each read once');
  assert.ok(publish.lastIndexOf('.offsetHeight') < firstWrite, 'both read before anything is written');
  // Opening an assignment draws the next screen's bar in the same commit: a removal waits for the commit.
  const cleanup = region(bar, 'return () => {\n      stopObserving();', '}, [hasNotice]);', 'the cleanup');
  assert.doesNotMatch(cleanup, /removeProperty/);
  assert.match(cleanup, /deferLayoutWrite\(STUDENT_IDENTITY_STACK_OFFSET, \(\) => writeStyleVariable\(style, STUDENT_IDENTITY_STACK_OFFSET, null\)\);/);
  assert.match(cleanup, /deferLayoutWrite\(STUDENT_IDENTITY_BAR_HEIGHT, \(\) => writeStyleVariable\(style, STUDENT_IDENTITY_BAR_HEIGHT, null\)\);/);
});

test('a question\'s horizontal scroll guard measures with the commit, before the passive effects write', () => {
  const container = executableSource(read('src/components/student/MobileViewportContainer.jsx'));
  const guard = container.indexOf('const promptPanel = root.querySelector');
  assert.ok(guard > 0);
  const effect = container.lastIndexOf('Effect(() => {', guard);
  assert.equal(container.slice(effect - 'useLayout'.length, effect), 'useLayout', 'a layout effect');
  assert.match(region(container, 'const promptPanel = root.querySelector', 'return () => {', 'the guard'), /forceZero\(\);/);
});
