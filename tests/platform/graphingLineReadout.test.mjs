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

// GR30: the stored response text stays formatLine's — every record, old or
// new, holds that shape, so no record reads differently from another — and
// where a record is read (the Response Inspector, Spotlight, the student's
// closed-question card) it is shown the way the readout writes a line.
test('GR30 — a stored Graphing line reads as the readout writes it wherever a record is read; the stored text is unchanged', async () => {
  const { readableStoredResponse, readableStoredResponseLatex, storedGraphingLine } = await import('../../src/tools/graphing2/storedLineText.js');
  const graphing = { type: 'graphing2' };
  for (const [a, b, text, latex] of [
    [[0, 0], [1, 1], 'y = x', 'y = x'],
    [[0, 2], [3, 4], 'y = (2/3)x + 2', 'y = \\frac{2}{3}x + 2'],
    [[0, -4], [1, -5], 'y = −x − 4', 'y = -x - 4'],
    [[0, 3], [2, 3], 'y = 3', 'y = 3'],
    [[-3, 0], [-3, 4], 'x = −3', 'x = -3'],
  ]) {
    const stored = formatLine(through(a, b));
    assert.equal(readableStoredResponse(stored, graphing), text, stored);
    assert.equal(readableStoredResponseLatex(stored, graphing), latex, stored);
  }
  assert.equal(formatLine(through([0, 0], [1, 1])), 'y = 1x + 0', 'the record itself is unchanged');
  // Only formatLine's own shape, and only on a Graphing question.
  assert.equal(readableStoredResponse('y = 1x + 0', { type: 'multiAnswer' }), 'y = 1x + 0', 'a typed answer is shown as typed');
  assert.equal(readableStoredResponse('y=1x+0', graphing), 'y=1x+0');
  assert.equal(readableStoredResponse('(0, 0)', graphing), '(0, 0)');
  assert.equal(readableStoredResponse('invalid line', graphing), 'invalid line');
  assert.equal(storedGraphingLine('y = 2x + 3 and more'), null);
  // The three places a record is read use it.
  const read = (file) => executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
  assert.match(read('src/components/teacher/StudentResponseInspector.jsx'), /show\(readableStoredResponse\(legacy\?\.\[part\.id\] \?\? legacy, model\.question\)\)/);
  assert.match(read('src/components/teacher/StudentSpotlightView.jsx'), /value=\{readableStoredResponse\(part\?\.value \?\? part\?\.response \?\? part, frame\.question\)\}/);
  assert.match(region(read('src/QuestionEngine.jsx'), 'const closedYourAnswer =', ': [];'), /response: readableStoredResponseLatex\(part\.response, processedQuestion\)/);
});
