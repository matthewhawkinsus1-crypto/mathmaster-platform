/*
 * AX32 (findings C1-98, VH-26, A3-122): A DIRECTION THAT SAYS "CLICK" OR "TAP"
 * ALSO SAYS HOW TO DO IT FROM THE KEYBOARD.
 *
 * Tool directions were written for a mouse or a finger. Graphing 2 and the Open
 * Sort board were reworded in Wave 7, but Representation Match still said "tap
 * every card that belongs to it. Tap a card again…", Relation Mapping's plot
 * "Click the intersection to plot or remove a point", and the shared plane's
 * keyboard sentence appeared only once the plane HAD keyboard focus — so a
 * keyboard or switch student read the pointer's directions all the way to the
 * plane before being told it takes the keys.
 *
 * Each tool is rendered whole (Vite SSR), practice and a DOL, and every
 * paragraph, list item and spoken label that tells the student to click, tap or
 * drag must name a keyboard route in the same line (Tab, the arrow keys, Enter
 * or Space). The detector is held to the old wording (it must flag it), the
 * four tools are shown to say both routes (or, for Open Sort, only "select"),
 * and the plane's directions are read before it has focus, in each of the ways a
 * tool can ask for them. That the fuller keyboard sentence takes the short line's
 * place once the plane has keyboard focus is a browser matter:
 * tests/browser/plotInteraction.mjs.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, text, withBrowser } from './helpers/studentToolRender.mjs';

after(closeEngine);

const POINTER_VERB = /\b(?:click|tap|drag|swipe)\b/i;
const KEYBOARD_ROUTE = /\b(?:Tab|arrow keys?|keyboard|Enter|Space)\b/;

// React leaves a comment between a string and the expression after it; text() makes it a space.
const tidy = (line) => line.replace(/\s+([.,;:])/g, '$1').replace(/\s+/g, ' ').trim();
const entities = (value) => value.replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

// The lines a student reads as directions, and the labels a screen reader speaks.
const linesOf = (markup) => [
  ...[...markup.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((match) => tidy(text(match[2]))),
  ...[...markup.matchAll(/\baria-label="([^"]*)"/g)].map((match) => tidy(entities(match[1]))),
].filter(Boolean);
const pointerOnly = (lines) => lines.filter((line) => POINTER_VERB.test(line) && !KEYBOARD_ROUTE.test(line));
const namesBoth = (lines) => lines.filter((line) => /\b(?:click|tap)\b/i.test(line) && KEYBOARD_ROUTE.test(line));

const GROUPING = {
  type: 'representationMatch', mode: 'linearConnections', task: 'group', prompt: 'Sort every card.',
  cardKinds: ['context', 'slopeIntercept', 'slope', 'table'],
  sets: [
    { id: 'plan', context: 'A phone plan costs $10 a month plus $2 for each gigabyte used.', slopeIntercept: 'y = 2x + 10', slope: 2, table: [{ x: 0, y: 10 }, { x: 1, y: 12 }, { x: 2, y: 14 }] },
    { id: 'candle', context: 'A 20 cm candle burns down 3 cm every hour.', slopeIntercept: 'y = -3x + 20', slope: -3, table: [{ x: 0, y: 20 }, { x: 1, y: 17 }, { x: 2, y: 14 }] },
  ],
};
const PLOT_RELATION = { pairs: [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: -1 }], ask: ['plot', 'mapping', 'isFunction'] };

const PRACTICE = {};
const DOL = { hintsAllowed: false, verdictsWithheld: true };

// A tool, rendered as a student opens it (folds open, so every step is in the markup).
const toolLines = async (name, questionData, runtime) => {
  const { server } = await loadEngine();
  const registry = await server.ssrLoadModule('/src/tools/toolRegistry.js');
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const Tool = registry.getToolDefinition(name).component;
  const markup = await withBrowser(() => {
    window.localStorage.getItem = (key) => (String(key).startsWith('mm.tool.') ? 'open' : null);
    return render(React.createElement(ToolRuntimeProvider, runtime, React.createElement(Tool, { questionData, onAction() {}, attemptRecord: null })));
  });
  return linesOf(markup);
};
const sampleOf = async (name) => (await (await loadEngine()).server.ssrLoadModule('/src/dev/MathToolsLab.jsx')).SAMPLE_SPECS[name];

test('AX32: the detector flags the directions as they were, and passes the way they are said now', () => {
  for (const old of [
    'Choose a group, then tap every card that belongs to it. Tap a card again to take it back out.',
    'Choose a group at the top, then tap every card that belongs to it — a slope, an intercept or the graph.',
    'Move across the coordinate plane to see x- and y-guides. Click the intersection to plot or remove a point.',
    'Press the grid and slide to aim — the point lands where you let go; drag a point to move it.',
    'y equals 2x plus 10. In Line 1. Tap to put it in Line 2.',
  ]) assert.equal(pointerOnly([old]).length, 1, `not flagged: ${old}`);
  for (const fixed of [
    'Choose a group, then select every card that belongs to it (click or tap, or Tab to a card and press Enter or Space).',
    'Click or tap the intersection to plot or remove a point, or focus the plane and use the arrow keys and Enter.',
    'Press the grid and slide to aim — the point lands where you let go. From the keyboard, focus the grid and use the arrow keys and Enter.',
    'Select a card, then select a group to place it there.',
  ]) assert.equal(pointerOnly([fixed]).length, 0, `flagged: ${fixed}`);
});

for (const [role, runtime] of [['practice', PRACTICE], ['a DOL', DOL]]) {
  test(`AX32: Representation Match's grouping board (${role}) says select, with the keyboard route`, async () => {
    const lines = await toolLines('representationMatch', GROUPING, runtime);
    assert.deepEqual(pointerOnly(lines), [], 'no direction for a mouse or a finger and nothing else');
    // The step that begins the work (a control, so it is kept on a DOL) and the line above the cards.
    assert.ok(namesBoth(lines).some((line) => line.startsWith('Choose a group at the top, then select every card')), 'the step names both routes');
    assert.ok(namesBoth(lines).some((line) => /^Choose a \w.*then select every card.*Select a card again to take it back out\.$/.test(line)), 'and the line above the cards');
    // What a screen reader says for each card carries no device either.
    const spoken = lines.filter((line) => /\. In .+\. (?:Select|Tap|Click) to (?:put it in|take it out of) /.test(line));
    assert.ok(spoken.length >= 8, `a spoken label for each of the eight cards (${spoken.length})`);
    assert.deepEqual(spoken.filter((line) => /\. (?:Tap|Click) to /.test(line)), [], 'none says tap or click');
  });

  test(`AX32: Relation Mapping's plot (${role}) names the keyboard beside the pointer`, async () => {
    const lines = await toolLines('relationMapping', PLOT_RELATION, runtime);
    assert.deepEqual(pointerOnly(lines), []);
    assert.ok(namesBoth(lines).some((line) => /plot or remove a point/.test(line) && /arrow keys/.test(line) && /Enter/.test(line)), 'the line under the plane gives both routes');
  });

  test(`AX32: Graphing 2 (${role}) and Open Sort (${role}) still name the way in that is not a pointer`, async () => {
    const graphing = await toolLines('graphing2', await sampleOf('graphing2'), runtime);
    assert.deepEqual(pointerOnly(graphing), []);
    assert.ok(namesBoth(graphing).some((line) => /plot a point/.test(line) && /arrow keys and Enter/.test(line)), 'Graphing 2: click or tap, or focus it and use the arrow keys and Enter');
    const sort = await toolLines('openSortBoard', await sampleOf('openSortBoard'), runtime);
    assert.deepEqual(pointerOnly(sort), []);
    assert.ok(sort.some((line) => line.startsWith('Select a card, then select a group')), 'Open Sort: select a card, then select a group');
  });
}

/* ------------------------------------------ the plane, before it has focus */

const planeHelp = async (props) => {
  const { server } = await loadEngine();
  const Plane = (await server.ssrLoadModule('/src/tools/shared/CoordinatePlane.jsx')).default;
  const markup = await withBrowser(() => render(React.createElement(Plane, { xMin: -5, xMax: 5, yMin: -5, yMax: 5, onPlot() {}, ...props })));
  const help = /<div class="mathmaster-plot-help"[^>]*>([\s\S]*?)<\/div>/.exec(markup)?.[1];
  return help == null ? null : [...help.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((match) => tidy(text(match[1])));
};

test('AX32: the plane names the keyboard route before it has focus: after the gesture line, or alone where a step says what a tap does', async () => {
  // The default: the gesture line, and the route in the same paragraph.
  const standing = await planeHelp({});
  assert.equal(standing.length, 1, 'one paragraph: the page does not grow a row for it');
  assert.match(standing[0], /^Press the grid and slide to aim/);
  assert.match(standing[0], /From the keyboard, focus the grid and use the arrow keys and Enter\.$/);
  assert.deepEqual(pointerOnly(standing), []);
  // A plane that lets a point be dragged still says so, and still names the route.
  const movable = await planeHelp({ points: [{ x: 1, y: 1 }], onMovePoint() {} });
  assert.match(movable[0], /drag a point to move it/);
  assert.match(movable[0], /arrow keys and Enter\.$/);
  // Where the tool's own step says beside the plane what a tap does: no gesture
  // line, but the route is no longer withheld until focus.
  const keyboardOnly = await planeHelp({ showPlotHelp: 'keyboard' });
  assert.deepEqual(keyboardOnly, ['From the keyboard, focus the grid and use the arrow keys and Enter.']);
  // A tool that says it once above its planes asks for none under them.
  assert.equal(await planeHelp({ showPlotHelp: false }), null);
  // And a plane nothing is plotted on has no plotting directions at all.
  assert.equal(await planeHelp({ onPlot: null }), null);
});
