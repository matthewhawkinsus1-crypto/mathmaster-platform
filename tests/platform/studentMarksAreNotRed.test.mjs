/*
 * TL38 (finding A2-118; issue #386 R18): A POINT THE STUDENT MARKED IS NOT DRAWN
 * RED BEFORE ANYTHING IS GRADED.
 *
 * The graph workspace drew every point a student selected for an analysis part
 * (an intercept, a vertex) red, and the "mark the feature" stage drew its marks
 * red too — whether or not they were right, so a correct y-intercept looked
 * like a mistake. Red says "wrong" everywhere else on the platform (a failed
 * part's border and tint, the wrong-answer chip). A mark is the student's own
 * work and is not graded yet; it has one colour of its own (teal), which is
 * neither the red of an error, the green of "correct", the blue of the figure
 * they are reading, nor the purple of a reflected point.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';

import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, withBrowser } from './helpers/studentToolRender.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { STUDENT_MARK_COLOR } from '../../src/platform/graph/studentMarkColor.js';

after(closeEngine);

const hueOf = (hex) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return null;
  const delta = max - min;
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return Math.round(((hue * 60) + 360) % 360);
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastWithWhite = (hex) => 1.05 / (luminance(hex) + 0.05);

test('TL38: the mark colour is teal: not red, not green, not the figure\'s blue, not a reflected point\'s purple', () => {
  assert.match(STUDENT_MARK_COLOR, /^#[0-9a-f]{6}$/i);
  const hue = hueOf(STUDENT_MARK_COLOR);
  assert.ok(hue >= 165 && hue <= 195, `hue ${hue} is teal`);
  // The colours it must stay clear of, as hues rather than as names.
  for (const [name, hex] of [['error red', '#d93025'], ['correct green', '#188038'], ['the figure\'s blue', '#1a73e8'], ['a reflected point\'s purple', '#9334e6']]) {
    assert.ok(Math.abs(hueOf(hex) - hue) >= 25, `${name} (hue ${hueOf(hex)}) is not this colour`);
  }
  // As visible against the graph paper as the red it replaces.
  assert.ok(contrastWithWhite(STUDENT_MARK_COLOR) >= 4.5, `${contrastWithWhite(STUDENT_MARK_COLOR).toFixed(2)}:1 against white`);
  assert.ok(contrastWithWhite(STUDENT_MARK_COLOR) >= contrastWithWhite('#d93025') - 0.5);
});

test('TL38: a mark on the "mark the feature" plane is teal, beside the blue figure, and never red', async () => {
  const { server } = await loadEngine();
  const { default: Stage, FEATURE_SELECTION_ARTIFACT } = await server.ssrLoadModule('/src/platform/workflow/GraphFeatureSelectStage.jsx');
  const circles = async (selections) => {
    const markup = await withBrowser(() => render(React.createElement(Stage, {
      stage: { feature: 'yIntercept', selectionCount: 2, allowNone: true },
      sourceGraph: { xMin: -5, xMax: 5, yMin: -5, yMax: 8, functions: [{ type: 'linear', m: 2, b: 1 }], points: [[-1, -1], [2, 5]] },
      value: { __mathmasterWorkflowArtifact: FEATURE_SELECTION_ARTIFACT, feature: 'yIntercept', selections, none: false },
      onChange() {},
    })));
    return [...markup.matchAll(/<circle\b[^>]*\bfill="(#[0-9a-fA-F]{6})"[^>]*\br="(\d+(?:\.\d+)?)"|<circle\b[^>]*\br="(\d+(?:\.\d+)?)"[^>]*\bfill="(#[0-9a-fA-F]{6})"/g)]
      .map((match) => ({ fill: (match[1] ?? match[4]).toLowerCase(), r: Number(match[2] ?? match[3]) }));
  };
  const none = await circles([]);
  const two = await circles([[0, 1], [3, 7]]);
  const marked = two.filter((circle) => circle.fill === STUDENT_MARK_COLOR);
  assert.equal(marked.length, 2, `two marks, two teal circles: ${JSON.stringify(two)}`);
  assert.equal(none.filter((circle) => circle.fill === STUDENT_MARK_COLOR).length, 0, 'and none before anything is marked');
  assert.equal(two.filter((circle) => circle.fill.toLowerCase() === '#d93025').length, 0, 'no circle on the plane is red');
  // The figure the student is reading is still drawn in its own blue, apart from the marks.
  assert.ok(two.some((circle) => circle.fill === '#1a73e8'), 'the figure\'s points stay blue');
  assert.ok(two.length > none.length, 'the marks are extra circles on the same figure');
});

test('TL38: the graph workspace draws a selected analysis point in the mark colour, and a reflected one in purple', () => {
  const source = executableSource(readFileSync(new URL('../../src/InteractiveGraphWorkspace.jsx', import.meta.url), 'utf8'));
  // The circle drawn for each point a student selected in the analysis stage.
  const drawn = region(source, "stage === 'analysis' && analysisParts.filter((part) => ['point', 'inversePoint'].includes(part.kind))", '</g>))}', 'the selected analysis points');
  assert.match(drawn, /fill=\{part\.kind === 'inversePoint' \? '#9334e6' : STUDENT_MARK_COLOR\}/);
  assert.doesNotMatch(drawn, /#d93025/);
  assert.match(source, /import \{ STUDENT_MARK_COLOR \} from '\.\/platform\/graph\/studentMarkColor\.js';/);
  // The same colour in the feature stage.
  const stage = executableSource(readFileSync(new URL('../../src/platform/workflow/GraphFeatureSelectStage.jsx', import.meta.url), 'utf8'));
  assert.match(stage, /fill: STUDENT_MARK_COLOR, r: 7/);
  assert.doesNotMatch(stage, /#d93025/);
});
