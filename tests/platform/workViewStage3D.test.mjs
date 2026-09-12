import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';
import { WORK_VIEW_INVENTORY, STAGE_3D_WORK_VIEW_IDS } from '../../src/tools/workViewInventory.js';
import { WORK_VIEW_CAPABILITIES } from '../../src/platform/workView/workViewCapabilities.js';
import { selectActiveUndoOwner } from '../../src/platform/workView/useMathUndoHistory.js';
import { region } from './helpers/sourceContract.mjs';

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
  assert.match(registry, /REGISTRY_WORK_VIEW_IDS\.has\(toolId\)/);
  assert.match(wrapper, /<EnlargeableFigure[\s\S]*?>[\s\S]*\{children\}[\s\S]*<\/EnlargeableFigure>/);
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
  assert.match(scratchpad, /<UniversalUndoButton controller=\{scratchpadUndoController\}/);
  assert.match(scratchpad, /zIndex:\s*30000/);
  assert.match(scratchpad, /dataset\.undoOverlayOwner\s*=\s*'scratchpad'/);
  const workViewCss = source('src/components/common/WorkViewShell.css');
  assert.match(workViewCss, /data-undo-overlay-owner="scratchpad"[\s\S]*data-work-view-action\*="Undo"/);
  const engine = source('src/QuestionEngine.jsx');
  assert.match(engine, /!scratchpadOpen\s*\?\s*<UniversalUndoButton/, 'covered work-bar Undo is hidden');

  const tool = { priority: 0, order: 1, controller: { label: 'tool' } };
  const overlay = { priority: 100, order: 2, controller: { label: 'scratchpad' } };
  assert.equal(selectActiveUndoOwner([tool]).controller.label, 'tool');
  assert.equal(selectActiveUndoOwner([tool, overlay]).controller.label, 'scratchpad');
  assert.equal(selectActiveUndoOwner([tool]).controller.label, 'tool');
});

test('Undo inventory declarations correspond to real shared histories', () => {
  const undoSources = {
    systemsWorkspace: 'src/tools/systemsWorkspace/SystemsWorkspace.jsx',
    sequenceExplorer: 'src/tools/sequenceExplorer/SequenceExplorer.jsx',
    transformationsLab: 'src/tools/transformations/TransformationsLab.jsx',
    functionInvestigation2: 'src/tools/functionInvestigation2/FunctionInvestigation2.jsx',
    graphing2: 'src/tools/graphing2/Graphing2.jsx',
    constraintFunctionBuilder: 'src/tools/constraintFunctionBuilder/ConstraintFunctionBuilder.jsx',
    stepAlgebra2: 'src/tools/stepAlgebra2/StepAlgebra2.jsx',
    intervalNumberLine: 'src/tools/intervalNumberLine/IntervalNumberLine.jsx',
    relationMapping: 'src/tools/relationMapping/RelationMapping.jsx',
  };
  const declaredUndo = Object.entries(WORK_VIEW_INVENTORY)
    .filter(([, entry]) => entry.capabilities.includes('undo'))
    .map(([id]) => id).sort();
  assert.deepEqual(declaredUndo, Object.keys(undoSources).sort());
  for (const [id, file] of Object.entries(undoSources)) {
    assert.match(source(file), /useMathUndoHistory\(\{/, `${id} has a real shared history source`);
  }
  const stage3DUndo = declaredUndo.filter((id) => WORK_VIEW_INVENTORY[id].stage === '3D');
  assert.deepEqual(stage3DUndo, ['intervalNumberLine', 'relationMapping']);
  assert.doesNotMatch(source('src/tools/shared/RegisteredToolWorkView.jsx'), /undo:\s*true|undo:\s*descriptor/);
  for (const id of ['parabolaGeometryLab', 'functionOperationsLab', 'openSortBoard']) {
    assert.equal(WORK_VIEW_INVENTORY[id].capabilities.includes('undo'), false, `${id} does not advertise inert Undo`);
  }
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


test('Data Modeling Lab enlarges the whole tool instead of a graph-only nested shell', () => {
  const registry = source('src/tools/toolRegistry.js');
  const lab = source('src/tools/dataModeling/DataModelingLab.jsx');
  const workViewOwners = region(registry, 'const REGISTRY_WORK_VIEW_IDS', '// Labels and course lists');
  assert.match(workViewOwners, /'dataModelingLab'/);
  assert.doesNotMatch(lab, /<EnlargeableFigure/,
    'a nested graph-only Work View would hide correlation/model answer controls outside the enlarged surface');
  assert.match(lab, /Correlation coefficient r/);
  assert.match(lab, /Direction/);
  assert.match(lab, /Strength/);
});
