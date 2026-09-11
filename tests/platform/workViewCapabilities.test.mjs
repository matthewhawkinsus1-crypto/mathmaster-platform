import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  WORK_VIEW_CAPABILITIES,
  mergeWorkViewCapabilities,
  toggleWorkViewDrawer,
  workViewCapabilitySummary,
} from '../../src/platform/workView/workViewCapabilities.js';
import { resolveWorkViewLayout } from '../../src/platform/workView/workViewViewport.js';

test('the registry covers every platform Work View capability', () => {
  assert.deepEqual(WORK_VIEW_CAPABILITIES, [
    'undo', 'redo', 'fitView', 'panZoom', 'pointEditing', 'numericControls',
    'equationInput', 'tableData', 'instruction', 'task', 'help',
    'primaryActions', 'secondaryActions',
  ]);
});

test('Task and Help behave as mutually exclusive toggle drawers', () => {
  assert.equal(toggleWorkViewDrawer(null, 'task'), 'task');
  assert.equal(toggleWorkViewDrawer('task', 'task'), null);
  assert.equal(toggleWorkViewDrawer('task', 'help'), 'help');
});

test('tool capabilities augment platform actions without creating another state owner', () => {
  const undo = () => {};
  const fit = () => {};
  const capabilities = mergeWorkViewCapabilities(
    { undo:{ label:'Undo', onAction:undo }, task:{ text:'Original task' } },
    { fitView:{ label:'Fit View', onAction:fit, cameraOnly:true }, pointEditing:true },
  );
  assert.equal(capabilities.undo.onAction, undo);
  assert.equal(capabilities.fitView.onAction, fit);
  assert.equal(capabilities.fitView.cameraOnly, true);
  assert.deepEqual(workViewCapabilitySummary(capabilities), ['undo', 'fitView', 'pointEditing', 'task']);
});

test('responsive placement follows usable visual viewport without touching math state', () => {
  assert.deepEqual(resolveWorkViewLayout({ width:1366, height:768, visualHeight:700 }), {
    mode:'desktop', orientation:'landscape', usableHeight:700, controlsPlacement:'side',
  });
  assert.deepEqual(resolveWorkViewLayout({ width:390, height:844, visualHeight:510 }), {
    mode:'mobile', orientation:'portrait', usableHeight:510, controlsPlacement:'bottom',
  });
  assert.deepEqual(resolveWorkViewLayout({ width:664, height:390, visualHeight:340 }), {
    mode:'mobile', orientation:'landscape', usableHeight:340, controlsPlacement:'bottom',
  });
});

test('EnlargeableFigure preserves one child instance and exposes Task and Help drawers', async () => {
  const source = await readFile(new URL('../../src/components/common/EnlargeableFigure.jsx', import.meta.url), 'utf8');
  assert.match(source, /const figure = \([\s\S]*\{children\}[\s\S]*<\/figure>/);
  assert.equal((source.match(/\{figure\}/g) || []).length, 1, 'one stable figure is rendered exactly once');
  assert.doesNotMatch(source, /cloneElement|createPortal|children\s*\.\s*map/);
  assert.match(source, /aria-label="Original task"/);
  assert.match(source, /aria-label="Help and instructions"/);
});

test('QuestionEngine registers Universal Undo beside the tool call site', async () => {
  const source = await readFile(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  const provider = source.slice(source.indexOf('<WorkViewCapabilityProvider'), source.indexOf('</WorkViewCapabilityProvider>'));
  assert.match(provider, /undo:\s*\{[\s\S]*workspaceActions\.undo\.onClick/);
  assert.match(provider, /task:/);
  assert.match(provider, /help:/);
  assert.match(provider, /primaryActions:/);
  assert.match(provider, /secondaryActions:/);
  assert.match(provider, /\{renderModule\(\)\}/);
});
