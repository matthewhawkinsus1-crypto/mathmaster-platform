/*
 * TOOL-7 (pass 3, 04-tools-and-accessibility.md): Graphing's "Your line"
 * readout shows math the way the platform's solver does.
 *
 * A student who plotted (0, 2) and (3, 4) read "y = 0.66666667x + 2"; through
 * (0, 0) and (1, 1), "y = 1x + 0". The readout now comes from lineReadout.js,
 * built from the line the student's own points determine (lineFromPoints).
 * formatLine, which the server stores as the response text, is unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatLine, lineFromPoints } from '../../functions/shared/toolMath/graphing2/graphingMath.mjs';
import { lineReadoutLatex, lineReadoutText } from '../../src/tools/graphing2/lineReadout.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const through = (a, b) => lineFromPoints(a, b);
const BANNED = /\b1x\b|\b0x\b|\+ 0\b|− 0\b|\d\.\d{5,}|\+ -|-1x/;

test('the line through the student\'s points is written in exact, simplified form', () => {
  const cases = [
    [[0, 2], [3, 4], 'y = (2/3)x + 2', 'y = \\frac{2}{3}x + 2'],
    [[0, 0], [1, 1], 'y = x', 'y = x'],
    [[0, -4], [1, -5], 'y = −x − 4', 'y = -x - 4'],
    [[0, 3], [2, 3], 'y = 3', 'y = 3'],
    [[0, 0], [2, 0], 'y = 0', 'y = 0'],
    [[0, -0.5], [2, 0.5], 'y = (1/2)x − 1/2', 'y = \\frac{1}{2}x - \\frac{1}{2}'],
    [[0, 2.5], [3, 0], 'y = −(5/6)x + 5/2', 'y = -\\frac{5}{6}x + \\frac{5}{2}'],
    [[2.5, 0], [2.5, 1], 'x = 5/2', 'x = \\frac{5}{2}'],
    [[-3, 0], [-3, 4], 'x = −3', 'x = -3'],
  ];
  for (const [a, b, text, latex] of cases) {
    const line = through(a, b);
    assert.equal(lineReadoutText(line), text, `${JSON.stringify([a, b])} as text`);
    assert.equal(lineReadoutLatex(line), latex, `${JSON.stringify([a, b])} as LaTeX`);
    assert.doesNotMatch(lineReadoutText(line), BANNED);
  }
  // The stored response text is not this module's business: it is unchanged.
  assert.equal(formatLine(through([0, 0], [1, 1])), 'y = 1x + 0');
  assert.equal(lineReadoutText(null), null);
});

test('Graphing shows the readout, typeset, wherever it shows the student\'s line', () => {
  const graphing = executableSource(readFileSync(new URL('../../src/tools/graphing2/Graphing2.jsx', import.meta.url), 'utf8'));
  assert.doesNotMatch(graphing, /formatLine\(/, 'no student-facing line is written by the grader\'s formatter');
  const readout = region(graphing, 'data-line-readout=', '</dd>');
  assert.match(readout, /<MathDisplay value=\{lineReadoutLatex\(studentLine\)\} format="latex" inline \/>/);
});
