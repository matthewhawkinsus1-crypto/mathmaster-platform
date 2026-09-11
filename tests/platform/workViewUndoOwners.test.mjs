import test from 'node:test';
import assert from 'node:assert/strict';
import { selectActiveUndoOwner } from '../../src/platform/workView/useMathUndoHistory.js';

const owner = (id, priority, order, canUndo = true) => ({
  id, priority, order, controller: { ownerId: id, canUndo },
});

test('base owner is selected and disabled state remains authoritative', () => {
  assert.equal(selectActiveUndoOwner([owner('tool', 0, 1)]).id, 'tool');
  assert.equal(selectActiveUndoOwner([owner('tool', 0, 1, false)]).controller.canUndo, false);
});

test('temporary owner wins and unregistering it immediately reveals the base', () => {
  const base = owner('legacy-tool', 0, 1);
  const scratchpad = owner('scratchpad', 100, 2);
  assert.equal(selectActiveUndoOwner([base, scratchpad]).id, 'scratchpad');
  assert.equal(selectActiveUndoOwner([base]).id, 'legacy-tool');
});

test('multiple temporary surfaces resolve by priority then latest registration', () => {
  const owners = [owner('tool', 0, 1), owner('scratchpad', 100, 2), owner('annotation', 100, 3)];
  assert.equal(selectActiveUndoOwner(owners).id, 'annotation');
  assert.equal(selectActiveUndoOwner(owners.filter(({ id }) => id !== 'annotation')).id, 'scratchpad');
});

test('question reset or owner unmount leaves no stale selection', () => {
  assert.equal(selectActiveUndoOwner([]), null);
  assert.equal(selectActiveUndoOwner(new Map().values()), null);
});
