/*
 * TL35 (finding C1-4): ONE NAME FOR THE ENLARGED WORKSPACE.
 *
 * The question's opener read "Open Work View" (W6-1) while the tools showing
 * outside a question — the tools lab, a standalone figure — called the same
 * panel "Enlarge graph", "Enlarge to plot", "Enlarge algebra workspace",
 * "Enlarge system workspace". EnlargeableFigure now says "Open Work View"
 * wherever it opens one and takes no label of its own, so a tool cannot name
 * the same feature another way. (A control that enlarges ONE picture inside a
 * tool — "Enlarge Graph 2" on the Multiple Representations board, a Scenario
 * Match graph — is a zoom, not Work View, and keeps its word.)
 *
 * Rendered, not read: every registry tool is mounted through Vite the way the
 * tools lab mounts it, where no question owns the opener.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';

import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, text, withBrowser } from './helpers/studentToolRender.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { OPEN_WORK_VIEW } from '../../src/platform/student/studentWords.js';

after(closeEngine);

// Written out, not built from the constant the component reads: a changed word must fail here.
const OPENER = '⤢ Open Work View';
// The opener's own class, not the question's Work View button or a tool's controls.
const openersIn = (markup) => [...markup.matchAll(/<button\b[^>]*\bclass="[^"]*\bmathmaster-work-view-opener\b[^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map((match) => text(match[1]));
const buttonTexts = (markup) => [...markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) => text(match[1]));
// Below 1050px no tool opens itself (figurePresentation.js), so every one shows its opener.
const atWidth = (width, run) => withBrowser(async () => { window.innerWidth = width; return run(); });

test('TL35: the opener says Open Work View, whatever a caller still passes it', async () => {
  const { server } = await loadEngine();
  const { default: Figure } = await server.ssrLoadModule('/src/components/common/EnlargeableFigure.jsx');
  const opener = async (props) => openersIn(await atWidth(900, () => render(React.createElement(Figure, { label: 'workspace', ...props }, React.createElement('p', null, 'the work')))));
  assert.deepEqual(await opener({}), [OPENER]);
  // The words tools used to give it: not one of them is taken any more.
  for (const old of ['Enlarge', 'Enlarge graph', 'Enlarge to plot', 'Enlarge algebra workspace', 'Enlarge system workspace', 'Enlarge workspace']) {
    assert.deepEqual(await opener({ enlargeLabel: old }), [OPENER], old);
  }
});

test('TL35: a plane a student plots on, and one they only read, open the same Work View', async () => {
  const { server } = await loadEngine();
  const { default: Plane } = await server.ssrLoadModule('/src/tools/shared/CoordinatePlane.jsx');
  const bounds = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
  const interactive = openersIn(await atWidth(900, () => render(React.createElement(Plane, { ...bounds, onPlot() {} }))));
  const reading = openersIn(await atWidth(900, () => render(React.createElement(Plane, { ...bounds, points: [{ x: 1, y: 2 }] }))));
  assert.deepEqual(interactive, [OPENER], 'Enlarge to plot');
  assert.deepEqual(reading, [OPENER], 'Enlarge graph');
});

test('TL35: every tool outside a question opens its Work View with the one word', async () => {
  const { server } = await loadEngine();
  const registry = await server.ssrLoadModule('/src/tools/toolRegistry.js');
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const lab = await server.ssrLoadModule('/src/dev/MathToolsLab.jsx');
  const tools = registry.listTools();
  const found = new Map();
  for (const tool of tools) {
    const markup = await atWidth(900, () => render(
      React.createElement(ToolRuntimeProvider, null, React.createElement(registry.getToolDefinition(tool.toolId).component, { questionData: lab.SAMPLE_SPECS[tool.toolId] || {}, onAction() {}, attemptRecord: null })),
    ));
    found.set(tool.toolId, { openers: openersIn(markup), enlarge: buttonTexts(markup).filter((label) => /^(?:⤢\s*)?Enlarge\b/.test(label)) });
  }
  // Not vacuous: most of the registry has a Work View to open (the read-only review has none),
  // including the three that open themselves on a wide screen and the Systems Workspace
  // (whose call sites may still hand the component a label it now ignores).
  const withOpener = [...found].filter(([, entry]) => entry.openers.length > 0).map(([toolId]) => toolId);
  assert.ok(withOpener.length >= 20, `${withOpener.length} of ${tools.length} tools show an opener`);
  for (const toolId of ['graphing2', 'transformationsLab', 'intervalNumberLine', 'systemsWorkspace', 'sequenceExplorer', 'matrixLab', 'polynomialWorkshop']) {
    assert.ok(withOpener.includes(toolId), `${toolId} shows an opener`);
  }
  for (const [toolId, entry] of found) {
    entry.openers.forEach((label) => assert.equal(label, OPENER, `${toolId}: "${label}"`));
    assert.deepEqual(entry.enlarge, [], `${toolId}: no control is named "Enlarge …"`);
  }
});

test('TL35: the opener is built from the one word, not from a label a tool hands in', () => {
  const figure = executableSource(readFileSync(new URL('../../src/components/common/EnlargeableFigure.jsx', import.meta.url), 'utf8'));
  assert.doesNotMatch(figure, /enlargeLabel/, 'the component has no label prop');
  const button = region(figure, '<button ref={openerRef}', '</button>', 'the opener button');
  assert.match(button, /⤢ \{OPEN_WORK_VIEW\}/);
  assert.equal(OPEN_WORK_VIEW, 'Open Work View');
});

test('TL35: no tool hands the opener a label any more (the prop is gone, so a label would say nothing)', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [full] : [];
  });
  const src = fileURLToPath(new URL('../../src', import.meta.url));
  const passing = walk(src).filter((file) => /\benlargeLabel\s*=/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(passing.map((file) => path.relative(src, file)), []);
});
