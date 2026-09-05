import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, globSync } from 'node:fs';

import {
  figureDismissalKey,
  isAimingTool,
  shouldOpenFigureEnlarged,
} from '../../src/platform/student/figurePresentation.js';

const codeOf = (path) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const AIMING = ['graphing2', 'transformations', 'intervalNumberLine'];

test('a plane a student plots on can be enlarged to plot in', () => {
  // THIS REVERSES AN EARLIER DECISION. The rule used to be that an interactive
  // plane never enlarged, because CoordinatePlane holds only the plane and the
  // Check button would be stranded behind the backdrop — a dead end.
  //
  // In practice the plane a student AIMS at is the one that most needs to be
  // bigger, and the dead end was overstated: plotting inside the enlarged view
  // updates the same tool state, so closing it returns to the question with the
  // work already done. Verified by doing it in a browser rather than reasoning
  // about it — tests/browser/plotInteraction.mjs plots inside the enlarged view
  // on both a Chromebook and a phone and checks the point took.
  const source = codeOf('src/tools/shared/CoordinatePlane.jsx');
  assert.match(source, /if \(!enlargeable\) return plane;/);
  assert.doesNotMatch(source, /if \(!enlargeable \|\| interactive\) return plane;/);
  assert.match(source, /const interactive = typeof onPlot === 'function';/);
  // Named for what it is for, so the control reads as an invitation to work
  // rather than an invitation to look.
  assert.match(source, /enlargeLabel=\{interactive \? 'Enlarge to plot' : 'Enlarge graph'\}/);
});

test('every tool that opens itself carries its controls into the panel', () => {
  // This is the condition that makes auto-opening safe rather than a trap.
  for (const toolId of AIMING) {
    const path = globSync(`src/tools/${toolId}/*.jsx`)[0];
    const source = codeOf(path);
    const figure = source.indexOf('<EnlargeableFigure');
    const split = source.indexOf('<ToolSplit');
    assert.ok(figure >= 0 && split >= 0, `${toolId}: expected a figure around a split`);
    assert.ok(figure < split, `${toolId}: the figure must wrap the split, not sit inside it`);
  }
});

test('the two tools wrapped earlier now take their answer panel with them', () => {
  // Both had the figure wrapped around the diagram alone, which stranded the
  // panel a student answers in behind the backdrop.
  for (const toolId of ['relationMapping', 'intervalNumberLine']) {
    const path = globSync(`src/tools/${toolId}/*.jsx`)[0];
    const source = codeOf(path);
    assert.ok(source.indexOf('<EnlargeableFigure') < source.indexOf('<ToolSplit'), toolId);
    const opened = (source.match(/<EnlargeableFigure/g) || []).length;
    const closed = (source.match(/<\/EnlargeableFigure>/g) || []).length;
    assert.equal(opened, closed, `${toolId}: unbalanced figure tags`);
  }
});

test('aiming at the figure is what decides an auto-open', () => {
  // Plotting a point, dragging an endpoint and placing an image are precision
  // tasks against a plane the embedded column squeezes. Reading a graph is not.
  for (const toolId of AIMING) {
    assert.equal(isAimingTool(toolId), true, toolId);
    assert.equal(shouldOpenFigureEnlarged({ toolId, viewportWidth: 1400 }), true, toolId);
  }
  for (const toolId of ['relationMapping', 'representationMatch', 'polynomialWorkshop', 'solutionReview2', '']) {
    assert.equal(shouldOpenFigureEnlarged({ toolId, viewportWidth: 1400 }), false, toolId);
  }
});

test('an auto-open still respects every brake already on it', () => {
  assert.equal(shouldOpenFigureEnlarged({ toolId: 'graphing2', viewportWidth: 900 }), false);
  assert.equal(shouldOpenFigureEnlarged({ toolId: 'graphing2', viewportWidth: 1400, dismissed: true }), false);
  assert.equal(
    shouldOpenFigureEnlarged({ toolId: 'graphing2', question: { presentEnlarged: false }, viewportWidth: 1400 }),
    false,
  );
});

test('each tool remembers its own dismissal', () => {
  // Closing the graphing workspace says nothing about the number line.
  const keys = AIMING.map((toolId) => figureDismissalKey({}, toolId));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(figureDismissalKey({}, 'graphing2'), 'mm.figure.enlarged.graphing2');
  assert.equal(figureDismissalKey({}, 'representationMatch'), null);
});

test('the task comes with the figure', () => {
  // The enlarged panel covers the page holding the prompt, so a student who
  // opens a plane to plot on loses sight of what they were asked to plot.
  const figure = codeOf('src/components/common/EnlargeableFigure.jsx');
  assert.match(figure, /taskText = ''/);
  assert.match(figure, /\{enlarged && taskText \?/);

  for (const toolId of AIMING) {
    const source = codeOf(globSync(`src/tools/${toolId}/*.jsx`)[0]);
    assert.match(source, /taskText=\{/, toolId);
  }
});

test('the task is shown only when enlarged, never twice', () => {
  // The tool already leads with its task card. Rendering the same sentence
  // inline as well would add bulk to fix a problem that only exists in the
  // panel.
  const source = codeOf('src/components/common/EnlargeableFigure.jsx');
  const block = source.slice(source.indexOf('{enlarged && taskText ?'));
  assert.match(block.slice(0, 120), /enlarged && taskText/);
  assert.doesNotMatch(source, /\{taskText\}\s*<\/p>\s*\)\s*:\s*null\}\s*\{!enlarged/);
});

test('the width behind the decision is re-measured, not read once', () => {
  const hook = codeOf('src/platform/mobile/useViewportWidth.js');
  assert.match(hook, /addEventListener\('resize', update\)/);
  assert.match(hook, /addEventListener\('orientationchange', update\)/);
  assert.match(hook, /removeEventListener\('resize', update\)/);
  // No window means 0, so a caller comparing against a minimum falls through to
  // the embedded layout instead of throwing.
  assert.match(hook, /typeof window === 'undefined' \? 0/);

  for (const toolId of AIMING) {
    assert.match(codeOf(globSync(`src/tools/${toolId}/*.jsx`)[0]), /useViewportWidth\(\)/, toolId);
  }
});

test('no tool auto-opens without also declaring where to remember the dismissal', () => {
  // An auto-open with no dismissal key cannot be turned off by the student.
  for (const path of globSync('src/tools/*/*.jsx')) {
    const source = codeOf(path);
    if (!source.includes('openEnlarged=')) continue;
    assert.match(source, /dismissKey=\{/, path);
  }
});
