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
 * plane before being told it takes the keys. Slice 2 did the same for the seven
 * tools the VPAT (3.3.2) still listed: Linear Intercepts, the Linear Table
 * Workbench, Matrix Lab, Expression Meaning, the Interval Number Line, the
 * Representation Bridge and the Sign & Solution Analyzer. Slice 3 is the Systems
 * Workspace: the inequality build's steps, the two construct forms, the 3D
 * model's cue and the lines beside a token to drag.
 *
 * Each tool is rendered whole (Vite SSR), practice and a DOL, in each of its
 * views, and every line a student reads — a paragraph, a list item, a button's
 * caption, a spoken label — that tells them to click, tap or drag must name a
 * keyboard route in the same line (Tab, the arrow keys, Enter or Space). The
 * detector is held to the old wording (it must flag it), the tools are shown to
 * say both routes, and the control each direction sends a student to is shown
 * to be one Tab reaches.
 *
 * A server render shows the first screen only. What a tool says later — after
 * one row is picked, after Check, in the enlarged graph, in Process Mode — is
 * read from the strings the tool's own files carry, as Vite compiles them
 * (comments gone, JSX text joined into the sentence a student reads), so a
 * pointer-only line cannot come back in any of those places either.
 *
 * The plane's directions are read before it has focus, in each of the ways a
 * tool can ask for them. That the fuller keyboard sentence takes the short line's
 * place once the plane has keyboard focus is a browser matter:
 * tests/browser/plotInteraction.mjs.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import React from 'react';

import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { buttonsOf, render, text, withBrowser } from './helpers/studentToolRender.mjs';
import { buildSystemsWorkspaceReview } from '../../src/tools/shared/reviews/systemsWorkspaceReview.js';

after(closeEngine);

// Every form of the verb a direction can use ("clicking the line" was missed by \bclick\b).
const POINTER_VERB = /\b(?:click(?:s|ed|ing)?|tap(?:s|ped|ping)?|drag(?:s|ged|ging)?|swip(?:e|es|ed|ing))\b/i;
const KEYBOARD_ROUTE = /\b(?:Tab|arrow keys?|keyboard|Enter|Space)\b/;

// React leaves a comment between a string and the expression after it; text() makes it a space.
const tidy = (line) => line.replace(/\s+([.,;:])/g, '$1').replace(/\s+/g, ' ').trim();
const entities = (value) => value.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// A line is the text between block-level tags, as the page lays it out: an
// inline tag, a React comment or a typeset fraction does not end it, a
// paragraph, item, button, caption or cell does.
const BLOCK_TAG = /<\/?(?:p|li|ul|ol|div|section|article|aside|header|footer|nav|main|form|fieldset|legend|label|button|summary|details|h[1-6]|table|thead|tbody|tfoot|tr|th|td|dl|dt|dd|figure|figcaption|select|option|textarea|svg|g|text|title)\b[^>]*>/gi;

// The lines a student reads as directions, and the labels a screen reader speaks.
const linesOf = (markup) => [
  ...markup.replace(/<!--[\s\S]*?-->/g, '').replace(/\n/g, ' ').replace(BLOCK_TAG, '\n').split('\n').map((chunk) => tidy(text(chunk))),
  ...[...markup.matchAll(/\baria-label="([^"]*)"/g)].map((match) => tidy(entities(match[1]))),
].filter(Boolean);
// A verb inside a template's ${…} (a class name such as "is-drag-over") is code, not a line a student reads.
const prose = (line) => line.replace(/\$\{[^}]*\}/g, ' ');
const pointerOnly = (lines) => lines.filter((line) => POINTER_VERB.test(prose(line)) && !KEYBOARD_ROUTE.test(line));
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
const ROLES = [['practice', PRACTICE], ['a DOL', DOL]];

// A tool, rendered as a student opens it (folds open, so every step is in the markup).
const toolMarkup = async (name, questionData, runtime) => {
  const { server } = await loadEngine();
  const registry = await server.ssrLoadModule('/src/tools/toolRegistry.js');
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const Tool = registry.getToolDefinition(name).component;
  return withBrowser(() => {
    window.localStorage.getItem = (key) => (String(key).startsWith('mm.tool.') ? 'open' : null);
    return render(React.createElement(ToolRuntimeProvider, runtime, React.createElement(Tool, { questionData, onAction() {}, attemptRecord: null })));
  });
};
const toolLines = async (name, questionData, runtime) => linesOf(await toolMarkup(name, questionData, runtime));
const sampleOf = async (name) => (await (await loadEngine()).server.ssrLoadModule('/src/dev/MathToolsLab.jsx')).SAMPLE_SPECS[name];

test('AX32: the detector flags the directions as they were, and passes the way they are said now', () => {
  for (const old of [
    'Choose a group, then tap every card that belongs to it. Tap a card again to take it back out.',
    'Choose a group at the top, then tap every card that belongs to it — a slope, an intercept or the graph.',
    'Move across the coordinate plane to see x- and y-guides. Click the intersection to plot or remove a point.',
    'Press the grid and slide to aim — the point lands where you let go; drag a point to move it.',
    'y equals 2x plus 10. In Line 1. Tap to put it in Line 2.',
    // Slice 2: the seven tools, as they were (every form of the verb counts).
    'Tap an expression in the matrix to open it.',
    'tap to select',
    'Tap two rows to form an interval.',
    'Row 1 selected. Tap a second row to form an interval.',
    'One row breaks the pattern. Tap the offending row above, then enter its corrected y-value.',
    'Place an endpoint by clicking the line or typing its exact value. Fractions such as -13/8 are accepted.',
    'A click or drag moves in steps of 1. Type an exact value for anything in between.',
    'Click the line for a quick placement, or type an exact endpoint above.',
    'Nothing is graphed yet. Click the line or type an exact endpoint, then place the other endpoint or choose a ray.',
    'Now tap its cell in the matrix.',
    'Tap a cell: its row of the first matrix and its column of the second light up.',
    'Drag the 0 onto x or y. On a touch screen, tap the 0 and then tap the variable.',
    'Place the 0 on a variable (drag it, or tap the 0 and then the variable), then press Substitute and solve.',
    'Tap the grid to move your second point, or drag either point.',
    'Now tap the second point.',
    'Tap where the line crosses the x-axis.',
    // Slice 3: the Systems Workspace.
    'Tap the grid to plot two points on the boundary line.',
    'Tap the graph on the side of your boundary line that should be shaded.',
    'Point 2: tap the graph',
    'Both points are on the graph. Drag a point to move it, or remove one with × and tap to plot it again.',
    'That point is on the boundary line. Tap a point on the side you want to shade.',
    'Shaded the side with (0, 6). Tap the other side to change it.',
    'Pick your own test point: tap anywhere on the graph.',
    'Your point: (1, 1). Tap the graph again to move it.',
    'Tap each point where two boundary lines meet at a corner of the solution region. If the region has no corners, choose “There are no corners”.',
    'That point does not look like a corner of this system yet. Try tapping exactly where two boundary lines cross.',
    'Tap the place where two boundary lines meet at the corner you have not marked yet.',
    'Not finished yet — tap the side of your boundary to shade.',
    'Type two points on each boundary line — or tap the graph to plot them — then choose its style and the side to shade.',
    'or tap the graph',
    'Find two points on each boundary line, and type them or tap them on the graph.',
    'Auto-rotating to show depth — drag the model to take control.',
    'Drag the expression, or select it and then select a variable.',
    'shade above the line — tap a point there such as (0, 3), since 3 ≥ 0 + 1 = 1 is true.',
  ]) assert.equal(pointerOnly([old]).length, 1, `not flagged: ${old}`);
  for (const fixed of [
    'Choose a group, then select every card that belongs to it (click or tap, or Tab to a card and press Enter or Space).',
    'Click or tap the intersection to plot or remove a point, or focus the plane and use the arrow keys and Enter.',
    'Press the grid and slide to aim — the point lands where you let go. From the keyboard, focus the grid and use the arrow keys and Enter.',
    'Select a card, then select a group to place it there.',
    'Select an expression in the matrix to open it (click or tap, or Tab to it and press Enter).',
    'tap or press Enter to select',
    'Place an endpoint: click or tap the line, or Tab to it and use the arrow keys and Enter, or type its exact value.',
    'A click, a drag or an arrow key moves in steps of 1. Type an exact value for anything in between.',
    'Click or tap a cell, or Tab to it: its row of the first matrix and its column of the second light up.',
    'Place a point where the line crosses the x-axis.',
    'One row breaks the pattern. Find it in the table above, choose it in the Offending row list, then enter its corrected y-value.',
    'Click or tap the grid to plot two points on the boundary line, or focus the grid and use the arrow keys and Enter.',
    'Both points are on the graph. Drag a point to move it, or remove one with × and plot it again. From the keyboard, move the crosshair onto a point and press Enter to pick it up, use the arrow keys to move it, then press Enter to put it down.',
    'Point 2: plot it on the graph',
    'That point is on the boundary line. Choose a point on the side you want to shade.',
    'Find two points on each boundary line, and type them or plot them on the graph (click or tap it, or focus the grid and use the arrow keys and Enter).',
    'Auto-rotating to show depth — drag the model, or focus it and press an arrow key, to take control.',
    'Drag the expression, or select it and then select a variable (click or tap, or Tab to each one and press Enter).',
    'shade above the line — choose a point there such as (0, 3), since 3 ≥ 0 + 1 = 1 is true.',
    // A verb inside a template's ${…} is code, not a line a student reads.
    'mathmaster-systems-variable-drop${tokenArmed ? " is-armed": ""}${dragOverVariable === part ? " is-drag-over": ""}',
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

/* ---------------------------------- slice 2: the seven tools the VPAT still listed */

// A control Tab reaches and Enter or Space works: a real button, input or select
// the page has not disabled or taken out of the tab order.
const tabReachable = (attrs) => !/\sdisabled(?:=|\s|$)/.test(attrs) && !/tabindex="-1"/.test(attrs);
const controlsLabelled = (markup, pattern) => [...markup.matchAll(/<(button|input|select|textarea)\b([^>]*)>/g)]
  .map((match) => ({ attrs: match[2], label: /aria-label="([^"]*)"/.exec(match[2])?.[1] ?? '' }))
  .filter(({ label }) => pattern.test(label));
const buttonsNamed = (markup, pattern) => buttonsOf(markup).filter((button) => pattern.test(button.name));
const allReachable = (controls, count, what) => {
  assert.equal(controls.length, count, `${what}: ${controls.length} found, ${count} expected`);
  controls.forEach((control) => assert.ok(tabReachable(control.attrs), `${what}: a control Tab skips or cannot press: ${control.attrs.slice(0, 120)}`));
};
const both = (lines, pattern) => {
  const line = namesBoth(lines).find((candidate) => pattern.test(candidate));
  assert.ok(line, `no line that names a tap or click and a key: ${pattern}\n${lines.filter((candidate) => pattern.test(candidate)).join('\n')}`);
  return line;
};

const SIGN_POLYNOMIAL = { mode: 'polynomial', numeratorFactors: [{ root: -2, multiplicity: 1 }, { root: 3, multiplicity: 1 }], relation: '>' };
const TABLE_ROWS = [{ x: 0, y: 3 }, { x: 1, y: 5 }, { x: 2, y: 7 }, { x: 3, y: 12 }, { x: 4, y: 11 }];
const MATRIX_LOCATE = {
  questionId: 'ax32-locate', mode: 'locate', prompt: 'Read the matrix.', matrix: 'A', askDimensions: true,
  matrices: { A: { name: 'A', rows: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]] } },
  targets: [{ id: 'a23', kind: 'tap', row: 2, col: 3 }, { id: 'a14', kind: 'tap', row: 1, col: 4 }, { id: 'n1', kind: 'notation', row: 3, col: 2, description: 'the entry in row 3 and column 2' }],
};
const MATRIX_OPERATE = {
  questionId: 'ax32-operate', mode: 'operate', operation: 'multiply', prompt: 'Multiply.', left: 'A', right: 'B', askDefined: false, fillResult: true,
  matrices: { A: { name: 'A', rows: [[1, 2], [3, 4]] }, B: { name: 'B', rows: [[5, 6], [7, 8]] } },
};
const BOARD = { type: 'representationBridge', mode: 'linearMultipleRepresentations', source: { kind: 'standardForm', equation: '2x - 4y = 12' }, feedbackTiming: 'guided' };
const INTERCEPTS = { mode: 'linearIntercepts', standard: { A: 2, B: 3, C: 12 } };

for (const [role, runtime] of ROLES) {
  test(`AX32: Expression Meaning (${role}) says select, with the keyboard route`, async () => {
    const markup = await toolMarkup('expressionMeaning', await sampleOf('expressionMeaning'), runtime);
    const lines = linesOf(markup);
    assert.deepEqual(pointerOnly(lines), []);
    // A step that works the tool, so a DOL keeps it.
    both(lines, /^Select an expression in the matrix to open it .*\bTab\b.*\bEnter\b/);
    // The expressions it sends a student to are buttons Tab reaches.
    allReachable(buttonsNamed(markup, /^Edit the meaning of /), 3, 'the expression buttons');
  });

  test(`AX32: the Sign & Solution Analyzer's interval cards (${role}) say how to select one from the keyboard`, async () => {
    for (const [view, question] of [['a rational inequality', await sampleOf('signSolutionAnalyzer')], ['a polynomial inequality', SIGN_POLYNOMIAL]]) {
      const markup = await toolMarkup('signSolutionAnalyzer', question, runtime);
      assert.deepEqual(pointerOnly(linesOf(markup)), [], view);
      // The caption is part of each card button's name, so it is what a screen reader says too.
      const cards = buttonsOf(markup).filter((button) => /aria-pressed=/.test(button.attrs));
      assert.ok(cards.length >= 3, `${view}: the interval cards`);
      cards.forEach((card) => {
        assert.match(card.name, /\btap\b.*\bEnter\b/, `${view}: a card names the tap and the key`);
        assert.ok(tabReachable(card.attrs), `${view}: a card is a button Tab reaches`);
      });
    }
    // The other two views (candidates to keep, a solve in stages) never named a pointer.
    for (const question of [{ mode: 'radicalCheck', radicalEquation: { radicand: { m: 1, b: 6 }, rhs: { m: 0, b: 3 } }, candidates: [3, -15] }, { mode: 'radicalSolve' }]) {
      assert.deepEqual(pointerOnly(await toolLines('signSolutionAnalyzer', question, runtime)), [], question.mode);
    }
  });

  test(`AX32: the Linear Table Workbench (${role}) says select two rows, with the keyboard route, in each of its views`, async () => {
    for (const mode of ['constantRate', 'deriveEquation', 'repairValue']) {
      const markup = await toolMarkup('linearTableWorkbench', { mode, rows: TABLE_ROWS, requiredComparisons: 2 }, runtime);
      const lines = linesOf(markup);
      assert.deepEqual(pointerOnly(lines), [], mode);
      both(lines, /^Select two rows to form an interval .*\bTab\b.*\bEnter\b/);
      allReachable(buttonsNamed(markup, /^Row \d+: x equals/), TABLE_ROWS.length, `${mode}: the row buttons`);
      if (mode !== 'repairValue') continue;
      // "Tap the offending row above" did nothing: those buttons pick rows for an
      // interval. The row to repair is chosen in the list, so the line names the list.
      assert.ok(lines.some((line) => /^One row breaks the pattern\..*\bOffending row\b/.test(line)), 'the repair line names the Offending row list');
      assert.match(markup, /<label[^>]*>\s*<span[^>]*>Offending row<\/span>\s*<select\b(?![^>]*\bdisabled\b)/, 'and that list is a select Tab reaches');
    }
  });

  test(`AX32: Matrix Lab (${role}) says select a cell, with the keyboard route, where it asks for one`, async () => {
    const locate = await toolMarkup('matrixLab', MATRIX_LOCATE, runtime);
    const lines = linesOf(locate);
    assert.deepEqual(pointerOnly(lines), [], 'locate');
    both(lines, /^Now select its cell in the matrix .*\bTab\b.*\bEnter\b/);
    // The element buttons no longer say "Tap" and the matrix's spoken name says select.
    assert.deepEqual(buttonsNamed(locate, /^Tap\b/), []);
    allReachable(buttonsNamed(locate, /^Find /), 2, 'locate: the element buttons');
    assert.ok(lines.includes('Matrix A. Select the cell for the element you are placing.'));
    // The cells are buttons, enabled for the element in hand.
    allReachable(buttonsNamed(locate, /^Row \d+, column \d+: /), 12, 'locate: the cells');
    const operate = await toolMarkup('matrixLab', MATRIX_OPERATE, runtime);
    assert.deepEqual(pointerOnly(linesOf(operate)), [], 'operate');
    both(linesOf(operate), /^Click or tap a cell, or Tab to it: .*row of the first matrix/);
    // "Tab to it": the product's cells are boxes, and focusing one lights its row and column.
    allReachable(controlsLabelled(operate, /^Matrix AB, row \d, column \d$/), 4, 'operate: the product cells');
    for (const question of [{ questionId: 'ax32-eq', mode: 'equation', prompt: 'Write.', equations: ['2x - 3y = 7', 'y + z = -5', 'x + 2y + 4z = -17'], variables: ['x', 'y', 'z'] }, await sampleOf('matrixLab')]) {
      assert.deepEqual(pointerOnly(await toolLines('matrixLab', question, runtime)), [], question.mode);
    }
  });

  test(`AX32: the Interval Number Line (${role}) names the keyboard beside the click, in each view`, async () => {
    for (const [view, question] of [
      ['the graph alone', { min: -8, max: 8, step: 1, variable: 'x', ask: ['graph'] }],
      ['with interval notation', await sampleOf('intervalNumberLine')],
      ['with an inequality', { min: -8, max: 8, step: 1, variable: 'x', ask: ['graph', 'inequality'] }],
    ]) {
      const markup = await toolMarkup('intervalNumberLine', question, runtime);
      const lines = linesOf(markup);
      assert.deepEqual(pointerOnly(lines), [], view);
      // The first step (a control, so a DOL keeps it): the line is a tab stop, the arrows
      // move a marker and Enter places an endpoint there; typing a value is the other way.
      both(lines, /^Place an endpoint: .*\bTab\b.*arrow keys.*\bEnter\b.*exact value/);
      both(lines, /^A click, a drag or an arrow key moves in steps of /);
      both(lines, /^Click or tap the line for a quick placement, or Tab to it and use the arrow keys and Enter/);
      assert.match(markup, /<svg\b(?=[^>]*\brole="application")(?=[^>]*\btabindex="0")/, `${view}: the line is a tab stop`);
      allReachable(controlsLabelled(markup, /^Exact endpoint value$/), 1, `${view}: the typed value box`);
    }
  });

  test(`AX32: the Representation Bridge (${role}) says select two rows, with the keyboard route, and its boards name theirs`, async () => {
    const classic = await toolMarkup('representationBridge', await sampleOf('representationBridge'), runtime);
    assert.deepEqual(pointerOnly(linesOf(classic)), [], 'the table-and-panels board');
    both(linesOf(classic), /^Table: select two rows to form an interval \(.*\bTab\b.*\bEnter\b\), enter/);
    allReachable(buttonsNamed(classic, /^Row \d+: x equals/), 4, 'the row buttons');
    for (const [view, question] of [['the multiple representations board', BOARD], ['its Process Mode', { ...BOARD, interactionMode: 'process' }]]) {
      const lines = await toolLines('representationBridge', question, runtime);
      assert.deepEqual(pointerOnly(lines), [], view);
      both(lines, /^Each graph is its own workspace\..*keyboard: arrow keys, then Enter/);
    }
  });

  test(`AX32: Linear Intercepts (${role}) names the keyboard beside the drag, in the registry shell and the one an assignment opens`, async () => {
    const shell = await toolMarkup('stepAlgebra2', INTERCEPTS, runtime);
    const shellLines = linesOf(shell);
    assert.deepEqual(pointerOnly(shellLines), []);
    // A step that works the tool, so a DOL keeps it, and the line beside the 0.
    both(shellLines, /^Place the 0 on a variable \(drag it, or select the 0 and then the variable: .*\bTab\b.*\bEnter\b\), then press Substitute and solve\./);
    both(shellLines, /^Drag the 0 onto x or y\. Or select the 0 and then the variable \(.*\bTab\b.*\bEnter\b\)/);
    // The 0 and the two variables are buttons: Tab reaches them, Enter or Space presses them.
    allReachable(buttonsNamed(shell, /^Pick up zero for substitution$/), 1, 'the 0');
    allReachable(buttonsNamed(shell, /^[xy] variable substitution target$/), 2, 'the variables');
    // The orchestrator an assignment opens says the same sentence (it used to say it differently).
    const { server } = await loadEngine();
    const Orchestrator = (await server.ssrLoadModule('/src/LinearInterceptsOrchestrator.jsx')).default;
    const question = { type: 'stepAlgebra', ...INTERCEPTS, prompt: 'Find the intercepts of 2x + 3y = 12.' };
    const orchestrated = await withBrowser(() => render(React.createElement(Orchestrator, { question, draftKey: 'ax32:intercepts', revealCorrectness: role === 'practice', hintsAllowed: role === 'practice' })));
    const lines = linesOf(orchestrated);
    assert.deepEqual(pointerOnly(lines), []);
    both(lines, /^Drag the 0 onto x or y\. Or select the 0 and then the variable \(.*\bTab\b.*\bEnter\b\)/);
    allReachable(buttonsNamed(orchestrated, /^Pick up zero for substitution$/), 1, 'the 0 (assignment)');
    allReachable(buttonsNamed(orchestrated, /^[xy] variable substitution target$/), 2, 'the variables (assignment)');
  });
}

/* ------------------------------------ slice 3: the Systems Workspace */

const SYSTEMS = 'systemsWorkspace';
const sw = (fields) => ({ type: SYSTEMS, prompt: 'A system of equations.', ...fields });
// The student-build inequality workflow: boundary, line style and shading for each constraint, then the reasoning.
const INEQUALITY_BUILD = sw({
  questionId: 'ax32-build', mode: 'inequalities', prompt: 'Graph the system y ≥ x + 1 and y < −0.5x + 6. Then classify the solution region.',
  inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<' }],
  studentBuild: { boundary: true, lineStyle: true, shading: true },
  reasoning: { classifyRegion: true },
  graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
});
// My Math Path's construct forms, where the points are typed or plotted on the plane.
const INEQUALITY_CONSTRUCT = sw({
  questionId: 'ax32-construct', mode: 'inequalities', interaction: 'construct', ask: ['construction'],
  inequalities: [{ m: 2, b: -3, relation: '>=' }, { m: -1, b: 6, relation: '<=' }],
  graph: { xMin: -6, xMax: 6, yMin: -10, yMax: 12 },
});
const LINEAR_CONSTRUCT = sw({ questionId: 'ax32-linear', mode: 'linear', interaction: 'construct', system: { m1: 2, b1: -1, m2: -1, b2: 5 } });
const THREE_PLANES = sw({ questionId: 'ax32-planes', mode: 'spatial', equations: ['x + y + z = 6', 'x - y + z = 2', '2x + y - z = 1'], variables: ['x', 'y', 'z'] });
const ALGEBRAIC_2X2 = sw({ questionId: 'ax32-algebraic', studentActions: ['solveSystem'], equations: ['2x + y = 7', 'x - y = -1'], variables: ['x', 'y'], requireVerification: true });
const APPLICATION_SVG = /<svg\b(?=[^>]*\brole="application")(?=[^>]*\btabindex="0")/;

for (const [role, runtime] of ROLES) {
  test(`AX32: the Systems Workspace's inequality build (${role}) says click or tap with the keys beside it, and its plane is a tab stop`, async () => {
    const markup = await toolMarkup(SYSTEMS, INEQUALITY_BUILD, runtime);
    const lines = linesOf(markup);
    assert.deepEqual(pointerOnly(lines), []);
    // The plane under the graph keeps only its keyboard sentence (what a tap does is said here),
    // so the step's own line has to give both routes. The point still to plot says what to do, not how.
    both(lines, /^Click or tap the grid to plot two points on the boundary line, or focus the grid and use the arrow keys and Enter\.$/);
    assert.ok(lines.some((line) => /^Point 1: plot it on the graph\b/.test(line)), 'the point still to plot');
    assert.match(markup, APPLICATION_SVG, 'the plane takes Tab');
    assert.match(markup, /aria-label="Student-constructed graph of the inequality system\. Plot boundary point 1 for constraint 1\. Click to plot, or use the arrow keys to move the crosshair and Enter to plot\. Enter on a plotted point picks it up to move it\./, 'and its name says the keys, including how a plotted point is moved');
  });

  test(`AX32: the Systems Workspace's construct forms (${role}) name the keys where they name the tap`, async () => {
    for (const [view, question, step, instruction] of [
      ['the inequality construct', INEQUALITY_CONSTRUCT,
        /^Find two points on each boundary line, and type them or plot them on the graph \(click or tap it, or focus the grid and use the arrow keys and Enter\)\.$/,
        /^Type two points on each boundary line, or plot them on the graph: click or tap it, or focus the grid and use the arrow keys and Enter\. Then choose its style and the side to shade\.$/],
      ['the linear construct', LINEAR_CONSTRUCT,
        /^Use each equation to find two points on its line, and type them or plot them on the graph \(click or tap it, or focus the grid and use the arrow keys and Enter\)\.$/,
        /^Type two points on each line, or plot them on the graph: click or tap it, or focus the grid and use the arrow keys and Enter\. Use each equation to find its points\.$/],
    ]) {
      const markup = await toolMarkup(SYSTEMS, question, runtime);
      const lines = linesOf(markup);
      assert.deepEqual(pointerOnly(lines), [], view);
      // The first step is a control step, so a DOL keeps it.
      both(lines, step);
      both(lines, instruction);
      assert.ok(lines.includes('or plot it on the graph'), `${view}: the point still to plot says what to do, not how`);
      assert.match(markup, APPLICATION_SVG, `${view}: the plane takes Tab`);
    }
  });

  test(`AX32: the 3D model's cue (${role}) names the arrow key beside the drag, and the model takes Tab`, async () => {
    const markup = await toolMarkup(SYSTEMS, THREE_PLANES, runtime);
    const lines = linesOf(markup);
    assert.deepEqual(pointerOnly(lines), []);
    // An arrow key takes over from the idle orbit as a drag does (tests/browser/toolKeyboardThreePlane.mjs).
    assert.ok(lines.includes('Auto-rotating to show depth — drag the model, or focus it and press an arrow key, to take control.'), 'the cue while it turns');
    assert.match(markup, /<svg\b(?=[^>]*\brole="application")(?=[^>]*\btabindex="0")(?=[^>]*\baria-label="Three planes in 3D")/);
  });

  test(`AX32: the 2x2 algebraic form (${role}) has no pointer-only line on its first screen`, async () => {
    assert.deepEqual(pointerOnly(await toolLines(SYSTEMS, ALGEBRAIC_2X2, runtime)), []);
  });
}

test('AX32: the Systems Workspace names the plane\'s own keys, and says the same sentence under the graph', async () => {
  const { server } = await loadEngine();
  const { PLANE_KEYS } = await server.ssrLoadModule('/src/tools/systemsWorkspace/InequalityControls.jsx');
  assert.deepEqual(await planeHelp({ showPlotHelp: 'keyboard' }), [`From the keyboard, ${PLANE_KEYS}.`]);
});

test('AX32: the lines beside a token to drag name the keys, and the token and each variable are buttons Tab reaches', async () => {
  const { server } = await loadEngine();
  const { MathDragToken, VariableDropEquation, dragOrSelectDirection } = await server.ssrLoadModule('/src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
  for (const what of ['the expression', 'the value', 'a value']) {
    const line = dragOrSelectDirection(what);
    assert.deepEqual(pointerOnly([line]), [], line);
    assert.equal(line, `Drag ${what}, or select it and then select a variable (click or tap, or Tab to each one and press Enter).`);
  }
  // Enter picks the token up and puts it on a variable because both are buttons whose press is the tap.
  const markup = await withBrowser(() => render(React.createElement('div', null,
    React.createElement(MathDragToken, { payloadPrefix: 'mathmaster-substitution:', payloadValue: 'x', expression: '2y - 3', onArm() {} }),
    React.createElement(VariableDropEquation, { equationText: '3x + 5y = 24', variables: ['x', 'y'], onVariableAttempt() {}, tokenArmed: true, armedPayloadValue: 'x' }))));
  allReachable(buttonsNamed(markup, /^Pick up /), 1, 'the token');
  allReachable(buttonsNamed(markup, /^Variable [xy]\b/), 2, 'the variables');
});

test('AX32: the worked solution of a student build says to choose a point to shade, not to tap one', () => {
  const steps = buildSystemsWorkspaceReview(INEQUALITY_BUILD).steps;
  assert.deepEqual(pointerOnly(steps), []);
  const shading = steps.filter((step) => /shade (?:above|below) the line/.test(step));
  assert.equal(shading.length, 2, 'one for each constraint');
  shading.forEach((step) => assert.match(step, /shade (?:above|below) the line — choose a point there such as \(/));
});

/* ------------------- what a server render cannot reach: the strings the files carry */

const REPO = new URL('../../', import.meta.url);
const filesUnder = (path) => (statSync(new URL(path, REPO)).isDirectory()
  ? readdirSync(new URL(`${path}/`, REPO), { recursive: true }).map((name) => `${path}/${String(name).replace(/\\/g, '/')}`).filter((file) => /\.jsx?$/.test(file))
  : [path]);

// Vite keeps the comments of a plain .js module and a file's opening comment, so a
// phrase in quotation marks inside one ("Tap the side of the graph to shade", said
// of an older screen) would read as a string a student sees. Taken out first.
const withoutComments = (code) => {
  let out = '';
  let at = 0;
  while (at < code.length) {
    const char = code[at];
    if (char === '/' && code[at + 1] === '/') {
      const end = code.indexOf('\n', at);
      at = end < 0 ? code.length : end;
    } else if (char === '/' && code[at + 1] === '*') {
      const end = code.indexOf('*/', at + 2);
      at = end < 0 ? code.length : end + 2;
      out += ' ';
    } else if (char === '"' || char === "'" || char === '`') {
      let end = at + 1;
      while (end < code.length && code[end] !== char) end += code[end] === '\\' ? 2 : 1;
      out += code.slice(at, end + 1);
      at = end + 1;
    } else {
      out += char;
      at += 1;
    }
  }
  return out;
};

// The strings one module carries, as Vite compiles it: comments gone, JSX text
// joined into the sentence a student reads, a template literal read with the
// constants it names filled in (the endpoint labels end in `${endpointKeyHelp}`,
// the Systems Workspace's lines end in `${PLANE_KEYS}`, which another module
// holds). Only strings of more than one word, so an id such as 'tap-select' is
// not text.
const LITERAL = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
const carried = async (paths) => {
  const { server } = await loadEngine();
  const strings = [];
  for (const path of paths) {
    const code = withoutComments((await server.transformRequest(`/${path}`, { ssr: true }))?.code ?? '');
    const constants = Object.fromEntries([...code.matchAll(/\bconst (\w+) = "((?:[^"\\\n]|\\.)*)";/g)].map((match) => [match[1], match[2]]));
    // `${__vite_ssr_import_4__.NAME}` is a constant NAME another module exports.
    const sources = Object.fromEntries([...code.matchAll(/\bconst (__vite_ssr_import_\d+__) = await __vite_ssr_import__\("([^"]+)"/g)].map((match) => [match[1], match[2]]));
    const modules = {};
    for (const [, binding] of code.matchAll(/\$\{(__vite_ssr_import_\d+__)\.\w+\}/g)) {
      modules[binding] ??= sources[binding] ? await server.ssrLoadModule(sources[binding]) : {};
    }
    for (const match of code.matchAll(LITERAL)) {
      const literal = tidy((match[1] ?? match[2] ?? match[3])
        .replace(/\$\{(\w+)\}/g, (whole, name) => constants[name] ?? whole)
        .replace(/\$\{(__vite_ssr_import_\d+__)\.(\w+)\}/g, (whole, binding, name) => (typeof modules[binding]?.[name] === 'string' ? modules[binding][name] : whole)));
      if (/\s/.test(literal)) strings.push({ path, text: literal });
    }
  }
  return strings;
};

const CARRIED = {
  'Expression Meaning': ['src/tools/expressionMeaning', 'src/tools/shared/reviews/expressionMeaningReview.js'],
  'the Sign & Solution Analyzer': ['src/tools/signSolutionAnalyzer', 'src/tools/shared/reviews/signSolutionAnalyzerReview.js'],
  'the Linear Table Workbench': ['src/tools/linearTableWorkbench', 'src/tools/shared/reviews/linearTableWorkbenchReview.js'],
  'the Interval Number Line': ['src/tools/intervalNumberLine', 'src/tools/shared/reviews/intervalNumberLineReview.js'],
  'Matrix Lab': ['src/tools/matrixLab', 'src/components/common/MatrixGrid.jsx', 'src/tools/shared/reviews/matrixLabReview.js'],
  'the Representation Bridge': ['src/tools/representationBridge', 'src/tools/shared/reviews/representationBridgeReview.js'],
  'Linear Intercepts': ['src/tools/stepAlgebra2/LinearIntercepts.jsx', 'src/tools/stepAlgebra2/linearInterceptsConceptualUi.jsx', 'src/LinearInterceptsOrchestrator.jsx', 'src/tools/shared/reviews/stepAlgebra2Review.js'],
  // Every mode: the inequality build and construct forms, the algebraic forms, the 3D model.
  'the Systems Workspace': ['src/tools/systemsWorkspace', 'src/tools/shared/reviews/systemsWorkspaceReview.js'],
};

test('AX32: nothing the eight tools carry tells a student to click, tap or drag without naming a key, on any screen they draw', async () => {
  for (const [tool, paths] of Object.entries(CARRIED)) {
    const strings = await carried(paths.flatMap(filesUnder));
    assert.ok(strings.length > 20, `${tool}: the scan reads the tool's strings (${strings.length})`);
    assert.deepEqual(pointerOnly(strings.map(({ text: line }) => line)), [], tool);
  }
});

test('AX32: the lines only a later screen draws are there, and each names both routes', async () => {
  const lines = async (path, pattern) => {
    const found = (await carried(filesUnder(path))).map(({ text: line }) => line).filter((line) => pattern.test(line));
    assert.ok(found.length >= 1, `${path}: no string matches ${pattern}`);
    return found;
  };
  const bothRoutes = (found) => found.forEach((line) => {
    assert.ok(/\b(?:click|tap)\b/i.test(line) && KEYBOARD_ROUTE.test(line), `says one route only: ${line}`);
  });
  // After one row is picked, in both table tools.
  bothRoutes(await lines('src/tools/linearTableWorkbench', /selected\. Select a second row to form an interval/));
  bothRoutes(await lines('src/tools/representationBridge/RepresentationBridge.jsx', /selected\. Select a second row to form an interval/));
  // After Check with nothing graphed.
  bothRoutes(await lines('src/tools/intervalNumberLine', /^Nothing is graphed yet\./));
  // The enlarged graph of the multiple representations board.
  bothRoutes(await lines('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx', /Tap the grid to move your second point/));
  bothRoutes(await lines('src/tools/representationBridge/LinearMultipleRepresentationsBoard.jsx', /^Tap or press to place a point; drag a point to move it/));
  // Process Mode's graph methods: each step of placing the points.
  for (const step of [/^Tap the grid to place a point/, /^Now tap the second point/, /^Tap again or drag to move it/, /^Tap the grid to move your second point/]) {
    bothRoutes(await lines('src/tools/representationBridge/process/ProcessMethods.jsx', step));
  }
  // …and their tasks say what to do, not how (the line under the plane says how).
  const tasks = await lines('src/tools/representationBridge/process/ProcessMethods.jsx', /^Place (?:a point|two points) /);
  assert.ok(tasks.length >= 4 && tasks.every((task) => !POINTER_VERB.test(task)), `process tasks: ${tasks.join(' | ')}`);
  // The endpoints' labels end in the shared key help; it names Enter, Space and the arrows.
  const labels = await lines('src/tools/intervalNumberLine/IntervalNumberLine.jsx', /endpoint at .*Click to switch/);
  bothRoutes(labels);
  assert.ok(labels.length >= 3 && labels.every((label) => /Press Enter or Space to switch open or closed\. Use the left and right arrow keys/.test(label)), 'a placed low end, a placed high end and a pending endpoint');
  // The Systems Workspace's inequality build, after its first step (the render above reads the first).
  // The shading step's line sits beside the first step's, in the same panels file.
  bothRoutes(await lines('src/tools/systemsWorkspace/InequalityBuildPanels.jsx', /^Click or tap the graph on the side of your boundary line that should be shaded, or focus the grid and use the arrow keys and Enter\.$/));
  // The reasoning steps: the test point of the student's own, and the corners.
  const build = 'src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx';
  bothRoutes(await lines(build, /^Pick your own test point: click or tap anywhere on the graph, or focus the grid and use the arrow keys and Enter\.$/));
  bothRoutes(await lines(build, /Click or tap the graph again to move it, or focus the grid and use the arrow keys and Enter\.$/));
  bothRoutes(await lines(build, /^Click or tap each point where two boundary lines meet at a corner of the solution region, or focus the grid and use the arrow keys and Enter\.$/));
  // …and the line the enlarged view's header gives each of those two steps.
  bothRoutes(await lines(build, /^Click or tap the graph to place a test point of your own \(or focus the grid and use the arrow keys and Enter\), then test it\.$/));
  bothRoutes(await lines(build, /^Click or tap each corner of the solution region \(or focus the grid and use the arrow keys and Enter\) and say whether it is included\.$/));
  // Moving a plotted point is a drag, and from the keyboard Enter on it, the arrow keys and Enter again.
  const moving = await lines(build, /^Both points are on the graph\./);
  assert.ok(moving.length === 1 && /\bDrag a point to move it\b/.test(moving[0]) && /\bpress Enter to pick it up, use the arrow keys to move it, then press Enter to put it down\b/.test(moving[0]), moving.join('\n'));
  // What the notices and verdict lines say is what to do, not how (the line above each says how).
  for (const [path, pattern] of [
    [build, /^That point is on the boundary line\. Choose a point on the side you want to shade\.$/],
    [build, /Choose a point on the other side to change it\.$/],
    [build, /^That point does not look like a corner of this system yet\. Try placing it exactly where two boundary lines cross\.$/],
    ['src/tools/systemsWorkspace/inequalityFormat.js', /^Mark each place where two boundary lines meet at a corner you have not marked yet\.$/],
    ['src/tools/systemsWorkspace/inequalityBuildPolicy.js', /^Not finished yet — shade a side of your boundary\.$/],
  ]) {
    const said = await lines(path, pattern);
    assert.deepEqual(pointerOnly(said), [], pattern.source);
  }
});

test('AX32: the shared sentence beside the 0 names both routes', async () => {
  const { server } = await loadEngine();
  const { ZERO_TOKEN_DIRECTIONS } = await server.ssrLoadModule('/src/tools/stepAlgebra2/linearInterceptsConceptualUi.jsx');
  assert.ok(/\bdrag\b/i.test(ZERO_TOKEN_DIRECTIONS) && /\bTab\b/.test(ZERO_TOKEN_DIRECTIONS) && /\bEnter\b/.test(ZERO_TOKEN_DIRECTIONS), ZERO_TOKEN_DIRECTIONS);
  assert.deepEqual(pointerOnly([ZERO_TOKEN_DIRECTIONS]), []);
});

/* ------------------------------------------------ the keys do what the line says */

// Linear Intercepts: "Tab to each one and press Enter". The 0 is a button (Enter and
// Space press it, as a tap does); a variable's own handler is read here, called as
// the browser would call it, because a server render cannot press anything.
const findElement = (node, type) => {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  return node.type === type ? node : findElement(node.props?.children, type);
};

test('AX32: Enter or Space on a variable puts the picked-up 0 on it, as a tap does, and does nothing before the 0 is picked up', async () => {
  const { server } = await loadEngine();
  const { VariableDropTarget } = await server.ssrLoadModule('/src/tools/stepAlgebra2/linearInterceptsConceptualUi.jsx');
  const target = (props) => {
    const placed = [];
    const button = findElement(VariableDropTarget({ variable: 'x', coefficient: 2, placed: false, armed: true, disabled: false, ...props, onPlace: (variable) => placed.push(variable) }), 'button');
    assert.ok(button, 'the variable is a button');
    const press = (key) => {
      const event = { key, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      button.props.onKeyDown(event);
      return event.defaultPrevented;
    };
    return { placed, press, click: () => button.props.onClick() };
  };
  for (const key of ['Enter', ' ']) {
    const armed = target({});
    assert.equal(armed.press(key), true, `${JSON.stringify(key)} is taken by the variable`);
    assert.deepEqual(armed.placed, ['x'], `${JSON.stringify(key)} puts the 0 on x`);
  }
  const tap = target({});
  tap.click();
  assert.deepEqual(tap.placed, ['x'], 'the same placement as a tap');
  // Before the 0 is picked up, or while the tool is disabled, a key places nothing and is left alone.
  for (const props of [{ armed: false }, { disabled: true }]) {
    const idle = target(props);
    assert.equal(idle.press('Enter'), false);
    idle.click();
    assert.deepEqual(idle.placed, [], JSON.stringify(props));
  }
  // Tab is not taken: the keyboard can leave the variable.
  const leaving = target({});
  assert.equal(leaving.press('Tab'), false);
  assert.deepEqual(leaving.placed, []);
});
