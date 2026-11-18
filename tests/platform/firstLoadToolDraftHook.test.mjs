// THE TOOLS' DRAFT HOOK IS NOT IN A STUDENT'S FIRST LOAD (PF01).
//
// scripts/check-first-load-budget.mjs measured about 3.7 KB gzip of the hook
// that keeps a tool's unfinished work (src/tools/shared/usePersistentToolState.js,
// with the shape checks under it, toolDraftShape.js) in front of every
// student's Home. App read one name from it: "View as Student" forgets the
// preview's cached tool workspaces before the preview opens
// (forgetAssignmentToolDrafts). That function and the cache it clears now
// live on their own (src/tools/shared/toolDraftCache.js); the hook reads and
// writes the same cache and re-exports both names, so the hook loads with
// the tools, which Home fetches with the question runtime while it is idle.
//
// Same walk as tests/platform/initialBundleBoundary.test.mjs (static imports
// from main.jsx, then App.jsx), through tests/platform/helpers/firstLoadGraph.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';

const graph = firstLoadGraph();
const file = (name) => path.join(repo, name);

test('the walker reaches the first load, and the cache App clears for "View as Student"', () => {
  assert.ok(graph.has(file('src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  // What stays, on purpose: App still forgets a preview's cached workspaces.
  assert.ok(graph.has(file('src/tools/shared/toolDraftCache.js')),
    'toolDraftCache.js is no longer reached: the walk or the wiring changed, so the absences below prove nothing');
});

for (const [name, why] of [
  ['src/tools/shared/usePersistentToolState.js', 'the tools\' draft hook; App only forgets a preview\'s cache (toolDraftCache.js)'],
  ['src/tools/shared/toolDraftShape.js', 'the shape checks a restored draft passes, under the hook'],
]) {
  test(`${path.basename(name)} is not in the first load: ${why}`, () => {
    const key = file(name);
    // A module that was renamed or deleted is in no graph at all: say so, or
    // the absence below proves nothing about the module that took its place.
    assert.ok(existsSync(key), `${name} no longer exists: point this list at the module that holds it now`);
    assert.ok(!graph.has(key), `${name} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  });
}

const memoryLocalStorage = () => {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
};

test('App\'s forget clears the very workspaces the hook cached', async () => {
  const previous = globalThis.window;
  globalThis.window = { localStorage: memoryLocalStorage() };
  try {
    const cache = await import('../../src/tools/shared/toolDraftCache.js');
    const hook = await import('../../src/tools/shared/usePersistentToolState.js');
    const { buildQuestionDraftKey, removeAssignmentDrafts, writeQuestionDraft } = await import('../../src/questionDraftStorage.js');
    // One function and one segment name, whichever module a caller imports.
    assert.equal(hook.forgetAssignmentToolDrafts, cache.forgetAssignmentToolDrafts);
    assert.equal(hook.TOOL_DRAFT_SEGMENT, cache.TOOL_DRAFT_SEGMENT);
    const draftKey = buildQuestionDraftKey({ studentId: 'teacher-preview', assignmentId: 'preview-a', questionIndex: 1, variantIndex: 0 });
    const otherKey = buildQuestionDraftKey({ studentId: 'teacher-preview', assignmentId: 'preview-b', questionIndex: 1, variantIndex: 0 });
    writeQuestionDraft(hook.toolDraftKey(draftKey), { responses: { sum: '3x' } });
    writeQuestionDraft(hook.toolDraftKey(otherKey), { responses: { sum: 'x' } });
    // The hook parses each record once and keeps it in the shared cache.
    assert.deepEqual(hook.readToolDraftRecord(draftKey), { responses: { sum: '3x' } });
    assert.deepEqual(hook.readToolDraftRecord(otherKey), { responses: { sum: 'x' } });
    assert.ok(cache.toolDraftCache.has(hook.toolDraftKey(draftKey)), 'the hook caches in toolDraftCache.js\'s Map');
    // "View as Student", as App does it: storage first, then the cache.
    removeAssignmentDrafts({ studentId: 'teacher-preview', assignmentId: 'preview-a' });
    assert.equal(cache.forgetAssignmentToolDrafts({ studentId: 'teacher-preview', assignmentId: 'preview-a' }), 1);
    assert.deepEqual(hook.readToolDraftRecord(draftKey), {}, 'cleared work is not resurrected from memory');
    assert.deepEqual(hook.readToolDraftRecord(otherKey), { responses: { sum: 'x' } }, 'another assignment\'s work stays');
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
