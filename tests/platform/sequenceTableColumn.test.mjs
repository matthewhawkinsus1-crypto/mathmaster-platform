/*
 * TL40 (finding D-52): THE SEQUENCE TABLE IS GIVEN A COLUMN IT FITS IN.
 *
 * "Build the Sequence Model" is a row of one box per term beside the "Analyze
 * the pattern" panel. At 1366px the DOL #3 Review's six-term table was 573px
 * wide in a 474px column, so its fifth and sixth boxes sat behind the column's
 * edge. The two panels now go side by side only when each column is as wide as
 * the table the screen draws, so a table is never wider than its column; and
 * the boxes are compact enough that six terms still sit in half a laptop's page.
 *
 * This reads what the real screen renders (the boxes' width, the cells' padding,
 * the panel's padding and the columns' minimum) for every term count the screen
 * draws and holds the columns to the table drawn in them, so a column that
 * ignores the count, or a box that grows without the columns knowing, fails
 * here. The pixels themselves are measured in a browser
 * (tests/browser/sequenceBuildScreen.mjs).
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, withBrowser } from './helpers/studentToolRender.mjs';

after(closeEngine);

// The screen draws three to eight terms (fullBridgeTermCount).
const COUNTS = [3, 4, 5, 6, 7, 8];
// The row labels' column ("Domain input n" / "Output aₙ"), at the narrowest it
// can be drawn: measured 81px in Chrome; its longest word, "Domain" in bold, is
// the least it can shrink to.
const LABEL_COLUMN_AT_LEAST = 76;
// A 1366px laptop's two columns, measured in the question stage: the grid is
// 1030px wide and the gap between its columns is 18px.
const LAPTOP_GRID = 1030;
const GAP = 18;

const questionOf = (count) => ({
  type: 'sequenceExplorer', mode: 'fullBridge', sequence: { kind: 'arithmetic', first: -7, difference: 4 }, displayCount: count,
  prompt: 'Build the sequence.', studentActions: ['buildSequenceTable', 'plotSequence', 'analyzeSequence'],
});

const px = (style, property) => {
  const found = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`).exec(style)?.[1];
  return found ? found.trim().split(/\s+/).map((value) => parseFloat(value)) : [];
};
const styleOf = (tag) => /\bstyle="([^"]*)"/.exec(tag)?.[1] ?? '';

// What the screen draws for a table of `count` terms, read back from its markup.
const screenFor = async (count) => {
  const { server } = await loadEngine();
  const registry = await server.ssrLoadModule('/src/tools/toolRegistry.js');
  const Tool = registry.getToolDefinition('sequenceExplorer').component;
  const markup = await withBrowser(() => render(React.createElement(Tool, { questionData: questionOf(count), onAction() {}, attemptRecord: null })));
  const boxes = [...markup.matchAll(/<input\b[^>]*aria-label="Sequence output a\d+"[^>]*>/g)].map((match) => match[0]);
  const cell = /<td\b[^>]*>/.exec(markup.slice(markup.indexOf('<tbody')))?.[0] ?? '';
  const panel = /<div class="mathmaster-tool-panel"[^>]*>/.exec(markup)?.[0] ?? '';
  const grid = /<div class="mathmaster-tool-grid"[^>]*>/.exec(markup)?.[0] ?? '';
  const [boxWidth] = px(styleOf(boxes[0] ?? ''), 'min-width');
  const cellPadding = px(styleOf(cell), 'padding');
  const [panelPadding] = px(styleOf(panel), 'padding');
  const [panelBorder] = px(styleOf(panel), 'border');
  const [column] = (/minmax\((\d+(?:\.\d+)?)px/.exec(styleOf(grid)) ?? []).slice(1).map(Number);
  return {
    boxes: boxes.length,
    boxWidth,
    // `padding: 5px 3px` is 3px either side; `padding: 5px` is 5.
    cellSide: cellPadding.length > 1 ? cellPadding[1] : cellPadding[0],
    panelSides: 2 * (panelPadding + panelBorder),
    column,
  };
};

test('TL40: the screen draws a box for every term and tells the grid its column', async () => {
  for (const count of COUNTS) {
    const screen = await screenFor(count);
    assert.equal(screen.boxes, count, `${count} terms: a box each`);
    for (const [name, value] of Object.entries(screen)) assert.ok(Number.isFinite(value) && value > 0, `${count} terms: ${name} was read (${value})`);
  }
});

test('TL40: each column is as wide as the table drawn in it, for every term count', async () => {
  for (const count of COUNTS) {
    const screen = await screenFor(count);
    const table = LABEL_COLUMN_AT_LEAST + count * (screen.boxWidth + 2 * screen.cellSide);
    assert.ok(screen.column >= table + screen.panelSides,
      `${count} terms: a ${screen.column}px column cannot hold a ${table}px table in a ${screen.panelSides}px-padded panel`);
  }
});

test('TL40: a longer table asks for a wider column, and a short one for the usual', async () => {
  const columns = {};
  for (const count of COUNTS) columns[count] = (await screenFor(count)).column;
  assert.ok(columns[3] >= 360 && columns[4] >= 360, 'few terms: never narrower than the usual column');
  for (const [shorter, longer] of [[5, 6], [6, 7], [7, 8]]) {
    assert.ok(columns[longer] > columns[shorter], `${longer} terms ask for more than ${shorter}: ${columns[longer]} vs ${columns[shorter]}`);
  }
  assert.ok(columns[8] > columns[4], 'and eight terms for more than four');
});

test('TL40: the six terms of the DOL #3 question still sit beside the analysis on a 1366px laptop', async () => {
  const screen = await screenFor(6);
  // Two columns and the gap between them must fit the laptop's grid...
  assert.ok(2 * screen.column + GAP <= LAPTOP_GRID, `${screen.column}px columns: two and a gap are ${2 * screen.column + GAP}px of a ${LAPTOP_GRID}px grid`);
  // ...and the boxes are no narrower than a five-character value needs ("-12.5", about 45px of text, 6px of padding, 2px of border).
  assert.ok(screen.boxWidth >= 53, `${screen.boxWidth}px boxes`);
});
