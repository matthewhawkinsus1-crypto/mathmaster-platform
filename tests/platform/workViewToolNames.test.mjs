// A REGISTRY TOOL'S WORK VIEW IS NAMED AFTER THE TOOL (TL42).
//
// The tools lab and every question with a registry tool open it through
// src/tools/shared/RegisteredToolWorkView.jsx. Its dialog was named
// "<toolId> workspace, Work View", so a screen reader said "matrixLab
// workspace". It now takes the tool's own name from the tool catalog.

import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_CATALOG } from '../../src/tools/toolCatalog.js';
import { WORK_VIEW_INVENTORY } from '../../src/tools/workViewInventory.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

test('every tool with a Work View has a name a person reads, not its program id', () => {
  for (const toolId of Object.keys(WORK_VIEW_INVENTORY)) {
    const name = TOOL_CATALOG[toolId]?.label;
    assert.ok(name, `${toolId} has a catalog name`);
    assert.notEqual(name, toolId, `${toolId}: the name is not the id`);
    assert.match(name, /^[A-Z]/, `${toolId}: "${name}" reads as a name`);
    assert.doesNotMatch(name, /[a-z][A-Z]/, `${toolId}: "${name}" is not camelCase`);
  }
});

test('the Work View dialog takes that name', () => {
  const view = executableSource(componentSource('src/tools/shared/RegisteredToolWorkView.jsx'));
  const figure = region(view, '<EnlargeableFigure', '>', 'the Work View figure');
  assert.match(figure, /label=\{toolName\}/);
  assert.match(view, /const toolName = getToolCatalogEntry\(toolId\)\?\.label \|\| 'This tool';/);
  assert.doesNotMatch(view, /\$\{toolId\} workspace/);
});
