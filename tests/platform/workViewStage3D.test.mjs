import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';
import { WORK_VIEW_INVENTORY, STAGE_3D_WORK_VIEW_IDS } from '../../src/tools/workViewInventory.js';
import { WORK_VIEW_CAPABILITIES } from '../../src/platform/workView/workViewCapabilities.js';
import { selectActiveUndoOwner } from '../../src/platform/workView/useMathUndoHistory.js';

const source = (path) => readFileSync(path, 'utf8');

test('every registered student tool has a complete Work View classification', () => {
  assert.deepEqual(Object.keys(WORK_VIEW_INVENTORY).sort(), [...TOOL_CATALOG_IDS].sort());
  for (const [id, entry] of Object.entries(WORK_VIEW_INVENTORY)) {
    assert.ok(['migrated', 'exempt'].includes(entry.status), `${id} has a final status`);
    if (entry.status === 'migrated') assert.ok(entry.capabilities.length, `${id} declares capabilities`);
    if (entry.status === 'exempt') assert.ok(entry.reason?.length > 20, `${id} documents its exemption`);
    for (const capability of entry.capabilities) assert.ok(WORK_VIEW_CAPABILITIES.includes(capability), `${id}: ${capability}`);
  }
});

test('Stage 3D registry migration wraps one existing state owner', () => {
  const registry = source('src/tools/toolRegistry.js');
  const wrapper = source('src/tools/shared/RegisteredToolWorkView.jsx');
  assert.match(registry, /STAGE_3D_WORK_VIEW_IDS\.includes\(toolId\)/);
  assert.match(wrapper, /<EnlargeableFigure[\s\S]*\{children\}<\/EnlargeableFigure>/);
  assert.doesNotMatch(wrapper, /cloneElement|createPortal/);
  assert.ok(STAGE_3D_WORK_VIEW_IDS.includes('representationMatch'));
});

test('number line and mapping publish Universal Undo and have no local Undo button', () => {
  for (const file of ['src/tools/intervalNumberLine/IntervalNumberLine.jsx', 'src/tools/relationMapping/RelationMapping.jsx']) {
    const text = source(file);
    assert.match(text, /useMathUndoHistory\(\{/);
    assert.match(text, /undo:\s*undoHistory\.capability/);
    assert.doesNotMatch(text, />\s*(?:↶\s*)?Undo\s*</);
  }
});

test('Scratchpad temporarily owns Undo and removes its duplicate control', () => {
  const scratchpad = source('src/ScratchpadOverlay.jsx');
  assert.match(scratchpad, /useActiveUndoOwner\(\{/);
  assert.match(scratchpad, /priority:\s*100/);
  assert.match(scratchpad, /active:\s*open/);
  assert.doesNotMatch(scratchpad, />↶ Undo</);

  const tool = { priority: 0, order: 1, controller: { label: 'tool' } };
  const overlay = { priority: 100, order: 2, controller: { label: 'scratchpad' } };
  assert.equal(selectActiveUndoOwner([tool]).controller.label, 'tool');
  assert.equal(selectActiveUndoOwner([tool, overlay]).controller.label, 'scratchpad');
  assert.equal(selectActiveUndoOwner([tool]).controller.label, 'tool');
});

test('nested coordinate graphs automatically defer to the activity Work View', () => {
  const plane = source('src/tools/shared/CoordinatePlane.jsx');
  assert.match(plane, /useHasParentWorkView\(\)/);
  assert.match(plane, /enlargeable\s*=\s*enlargeable\s*&&\s*!insideParentWorkView/);
});

test('migrated tools cannot introduce independent fullscreen or local mathematical Undo', () => {
  const files = ['src/tools/shared/RegisteredToolWorkView.jsx', 'src/tools/intervalNumberLine/IntervalNumberLine.jsx', 'src/tools/relationMapping/RelationMapping.jsx'];
  for (const file of files) {
    const text = source(file);
    assert.doesNotMatch(text, /requestFullscreen|webkitRequestFullscreen|<SolverWorkspaceFrame/);
  }
});
