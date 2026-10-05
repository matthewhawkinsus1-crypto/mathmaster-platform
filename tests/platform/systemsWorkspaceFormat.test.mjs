/*
 * HOW THE SYSTEMS WORKSPACE WRITES ITS MATHEMATICS, AND IN WHICH COLOURS.
 *
 * A constraint card used to read "y ≥ 1x + 1" beside a prompt that said
 * "y ≥ x + 1", "y ≥ 0x + 0" for the x-axis and "-1x" with a hyphen; and the
 * third constraint of a system was the same green as the solution region. The
 * labels are now written the way the prompt is (inequalityFormat.js) and every
 * inequality mode draws constraint i in constraintColor(i) (constraintPalette.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  formatInequality,
  formatLine,
  formatModelingConstraint,
  formatPoint,
  formatQuadratic,
  prettifyInequalityText,
} from '../../src/tools/systemsWorkspace/inequalityFormat.js';
import { CONSTRAINT_COLORS, POINT_COLORS, constraintColor } from '../../src/tools/systemsWorkspace/constraintPalette.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
// U+2212, the minus sign the prompts use — not the hyphen on the keyboard.
const MINUS = '\u2212';

test('slope-intercept constraints read the way the prompt writes them', () => {
  assert.equal(formatInequality({ m: 1, b: 1, relation: '>=' }), 'y ≥ x + 1', 'no 1 coefficient');
  assert.equal(formatInequality({ m: -0.5, b: 6, relation: '<' }), `y < ${MINUS}0.5x + 6`, 'a true minus sign, and the authored decimal');
  assert.equal(formatInequality({ m: -1, b: 4, relation: '<=' }), `y ≤ ${MINUS}x + 4`);
  assert.equal(formatInequality({ m: 0, b: 0, relation: '>=' }), 'y ≥ 0', 'no "0x + 0"');
  assert.equal(formatInequality({ m: 2, b: -3, relation: '>' }), `y > 2x ${MINUS} 3`);
  assert.equal(formatInequality({ m: 0, b: -2, relation: '<' }), `y < ${MINUS}2`);
  assert.equal(formatInequality({ m: 0.1 + 0.2, b: 0, relation: '<=' }), 'y ≤ 0.3x', 'float noise from a computed value never reaches the screen');
});

test('vertical, horizontal, standard-form and typed constraints are written cleanly too', () => {
  assert.equal(formatInequality({ orientation: 'vertical', x: 1, relation: '>=' }), 'x ≥ 1');
  assert.equal(formatInequality({ orientation: 'horizontal', y: -3, relation: '<' }), `y < ${MINUS}3`);
  assert.equal(formatInequality({ A: 1, B: -1, C: 1, relation: '>=' }), `x ${MINUS} y ≥ ${MINUS}1`, 'A·x + B·y + C ≥ 0 moves C across');
  assert.equal(formatInequality({ A: 3, B: -1, C: -4, relation: '<=' }), `3x ${MINUS} y ≤ 4`);
  assert.equal(formatInequality({ A: 0, B: 2, C: -6, relation: '>' }), '2y > 6');
  assert.equal(formatInequality('2x + y >= 4'), '2x + y ≥ 4');
  assert.equal(prettifyInequalityText('x - 2*y <= -1'), `x ${MINUS} 2·y ≤ ${MINUS}1`);
  assert.equal(formatInequality({}), 'Linear inequality');
});

test('lines, parabolas and points share the same writing', () => {
  assert.equal(formatLine({ m: 2, b: -1 }), `y = 2x ${MINUS} 1`);
  assert.equal(formatLine({ m: -1, b: 0 }), `y = ${MINUS}x`);
  assert.equal(formatLine({ m: 0, b: 5 }), 'y = 5');
  assert.equal(formatQuadratic({ a: 1, b: 0, c: -1 }), `y = x² ${MINUS} 1`);
  assert.equal(formatQuadratic({ a: -2, b: 3, c: 0 }), `y = ${MINUS}2x² + 3x`);
  assert.equal(formatPoint(2, -3), `(2, ${MINUS}3)`);
  assert.equal(formatPoint(-0, 0.5), '(0, 0.5)');
});

test('a constraint the student is still writing shows its blanks, never a guessed number', () => {
  const vars = [{ symbol: 'a' }, { symbol: 'b' }];
  assert.equal(formatModelingConstraint({ coeffA: '', coeffB: '', relation: '', constant: '' }, vars), '_a + _b ? _');
  assert.equal(formatModelingConstraint({ coeffA: '2', coeffB: '3', relation: '<=', constant: '12' }, vars), '2a + 3b ≤ 12');
  assert.equal(formatModelingConstraint({ coeffA: '2', coeffB: '0', relation: '<=', constant: '10' }, vars), '2a ≤ 10');
  assert.equal(formatModelingConstraint({ coeffA: '0', coeffB: '-1', relation: '>', constant: '-3' }, vars), `${MINUS}b > ${MINUS}3`);
  assert.equal(formatModelingConstraint({ coeffA: '1', coeffB: '', relation: '>=', constant: '4' }, vars), 'a + _b ≥ 4');
});

test('the labels never come from the hidden expected constraints', () => {
  // The student-build mode labels a constraint from the authored source, the
  // student's own model or the student's own verified rewrite.
  const mode = executableSource(read('src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx'));
  const label = region(mode, 'const inequalityLabel = (index) => {', '\n  };', 'inequalityLabel');
  assert.match(label, /formatModelingConstraint\(modelingEntries\[index\], variables\)/);
  assert.match(label, /formatSlopeInterceptInequality\(rewriteEntries\[index\]\.verifiedConstraint\)/);
  assert.match(label, /formatInequality\(source\)/);
  assert.doesNotMatch(label, /expectedConstraints|workingConstraints/, 'a label derived from the answer key would give it away');
  assert.doesNotMatch(label, /verifiedText/, 'a finished rewrite shows its clean slope-intercept form, not the solver\'s last line');
});

const luminance = (hex) => {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};
const hue = (hex) => {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (!delta) return 0;
  const raw = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (raw * 60 + 360) % 360;
};

test('every constraint has its own colour, readable on the light and the dark graph, and none is green', () => {
  assert.equal(new Set(CONSTRAINT_COLORS).size, CONSTRAINT_COLORS.length, 'two constraints never share a colour');
  assert.ok(CONSTRAINT_COLORS.length >= 3, 'a three-constraint system gets three colours');
  const tokens = read('src/theme/tokens.css');
  const graphBackgrounds = [...tokens.matchAll(/--mm-graph-bg:\s*(#[0-9a-fA-F]{6})/g)].map((match) => match[1]);
  assert.ok(graphBackgrounds.length >= 2, 'the light and dark graph backgrounds are both themed');
  for (const color of CONSTRAINT_COLORS) {
    for (const background of graphBackgrounds) {
      assert.ok(contrast(color, background) >= 3, `${color} on ${background}: a 3px line needs 3:1`);
    }
    const h = hue(color);
    assert.ok(h < 80 || h > 170, `${color} reads as green, the colour of "solution"`);
  }
  // Up to three constraints never share a colour with a point the question
  // draws: "the purple point" is the teacher's, and the student's own point
  // and the vertices have theirs.
  const hueGap = (a, b) => Math.min(Math.abs(hue(a) - hue(b)), 360 - Math.abs(hue(a) - hue(b)));
  for (const color of CONSTRAINT_COLORS.slice(0, 3)) {
    for (const [role, point] of Object.entries(POINT_COLORS)) {
      assert.ok(hueGap(color, point) >= 25, `${color} is too close to the ${role} colour ${point}`);
    }
  }
  assert.equal(constraintColor(0), CONSTRAINT_COLORS[0]);
  assert.equal(constraintColor(CONSTRAINT_COLORS.length), CONSTRAINT_COLORS[0], 'a long system wraps instead of running out');
  assert.equal(constraintColor(undefined), CONSTRAINT_COLORS[0]);
});

test('every inequality mode draws its constraints from the one palette', () => {
  const workspace = executableSource(read('src/tools/systemsWorkspace/SystemsWorkspace.jsx'));
  const classic = region(workspace, 'function ClassicInequalityMode(', 'function LinearQuadraticMode(', 'ClassicInequalityMode');
  assert.match(classic, /constraintColor\(/, 'the classic construct and analyze modes');
  const layers = executableSource(read('src/tools/systemsWorkspace/InequalityBuildPanels.jsx'));
  const graph = region(layers, 'export function InequalityGraphLayers(', '\n}\n', 'InequalityGraphLayers');
  assert.match(graph, /fill=\{constraintColor\(index\)\}/, 'the student-build shading');
  assert.match(graph, /stroke=\{constraintColor\(index\)\}/, 'the student-build lines');
  for (const path of ['src/tools/systemsWorkspace/SystemsWorkspace.jsx', 'src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx', 'src/tools/systemsWorkspace/InequalityBuildPanels.jsx']) {
    const code = executableSource(read(path));
    assert.doesNotMatch(code, /INEQUALITY_COLORS\s*=|#188038['"]\s*,\s*['"]#/, `${path} keeps no palette of its own`);
    for (const point of Object.values(POINT_COLORS)) assert.ok(!code.includes(`'${point}'`), `${path} names the point colours from the palette module, not as literals`);
  }
});
