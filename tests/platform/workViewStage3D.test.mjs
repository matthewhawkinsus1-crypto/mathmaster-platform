import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOL_CATALOG_IDS } from '../../src/tools/toolCatalog.js';
import { WORK_VIEW_INVENTORY, STAGE_3D_WORK_VIEW_IDS } from '../../src/tools/workViewInventory.js';
import { WORK_VIEW_CAPABILITIES } from '../../src/platform/workView/workViewCapabilities.js';
import { selectActiveUndoOwner } from '../../src/platform/workView/useMathUndoHistory.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { TOOL_STATE_PERSISTENCE } from '../../src/tools/toolStatePersistence.js';

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
  // Hidden while the scratchpad covers it, and (pass 3, TOOL-2) whenever no
  // history is registered at all: a greyed Undo that can never work is not
  // shown. Bound to the work bar, so the Work View rail cannot satisfy it.
  const workBar = region(engine, 'const questionWorkBar = (', '\n  );', 'the work bar');
  assert.match(workBar, /\{!scratchpadOpen && undoController \? <UniversalUndoButton /, 'covered or history-less work-bar Undo is hidden');
  // Undo may not change the work while a submission is being graded, or in a
  // tab paused because the question is open in another (pass 3 review): its
  // restore would write over what was graded, or over the newer tab's draft.
  // Both Undo controls read the one rule.
  assert.match(engine, /const undoUnavailable = locked \|\| submitting \|\| pausedByAnotherTab;/);
  assert.match(workBar, /<UniversalUndoButton [^>]*controller=\{undoController\} disabled=\{undoUnavailable\}/);
  const railUndo = region(engine, '  const workspaceActions = {\n    undo: {', '\n    },', 'the Work View Undo');
  assert.match(railUndo, /onClick: \(\) => \{ if \(!undoUnavailable\) undoController\?\.onUndo\?\.\(\); \}/);
  assert.match(railUndo, /disabled: !undoController\?\.canUndo \|\| undoUnavailable,/);

  const tool = { priority: 0, order: 1, controller: { label: 'tool' } };
  const overlay = { priority: 100, order: 2, controller: { label: 'scratchpad' } };
  assert.equal(selectActiveUndoOwner([tool]).controller.label, 'tool');
  assert.equal(selectActiveUndoOwner([tool, overlay]).controller.label, 'scratchpad');
  assert.equal(selectActiveUndoOwner([tool]).controller.label, 'tool');
});

test('Undo inventory declarations correspond to real shared histories', () => {
  // Pass 3 (TOOL-2): ten tools had no history while the work bar showed a
  // greyed ↶ Undo. Every migrated tool now keeps one, through the platform
  // hook directly or through useFieldUndoHistory (which is that hook over a
  // tool's answer fields). A declaration is held to the tool's own sources
  // (TOOL_STATE_PERSISTENCE names them), so the inventory can neither claim an
  // inert Undo nor miss a real one.
  const fieldHook = source('src/tools/shared/useFieldUndoHistory.js');
  assert.match(fieldHook, /return useMathUndoHistory\(\{/, 'the field helper is the platform history');
  const hasHistory = (id) => TOOL_STATE_PERSISTENCE[id].sources
    .map((file) => executableSource(source(`src/tools/${file}`)))
    .some((text) => /\buse(?:Math|Field)UndoHistory\(\{/.test(text));
  for (const [id, entry] of Object.entries(WORK_VIEW_INVENTORY)) {
    if (entry.status !== 'migrated') continue;
    assert.equal(entry.capabilities.includes('undo'), hasHistory(id), `${id}: declared Undo must match a real history in its source`);
  }
  // Every migrated tool, including the ten that had none.
  for (const id of ['dataModelingLab', 'inverseCompositionLab', 'functionOperationsLab', 'parabolaGeometryLab', 'polynomialWorkshop', 'signSolutionAnalyzer', 'complexPlaneLab', 'exponentialLogBridge', 'representationMatch', 'openSortBoard']) {
    assert.ok(WORK_VIEW_INVENTORY[id].capabilities.includes('undo'), `${id} has Universal Undo`);
  }
  assert.doesNotMatch(source('src/tools/shared/RegisteredToolWorkView.jsx'), /undo:\s*true|undo:\s*descriptor/);
});

test('the inverse derivation lab has one Undo: the platform one', () => {
  // It had its own Undo beside the work bar's permanently greyed one.
  const lab = executableSource(source('src/tools/inverseComposition/InverseDerivationLab.jsx'));
  assert.match(lab, /useMathUndoHistory\(\{/);
  assert.match(region(lab, 'const undoState = useMemo(', ';', 'the recorded state'), /derivation, operation, operand/);
  assert.doesNotMatch(lab, />\s*(?:↶\s*)?Undo\s*</, 'no local Undo button');
  assert.doesNotMatch(lab, /'undo'\)/, 'no second history popped by a local button');
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
