import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PREVIEW_POINT_RADIUS, PREVIEW_STROKE, choicePreviewProblems, parseChoiceFigure, previewFigures } from '../../src/platform/workflow/choicePreview.js';
import { validateWorkflow } from '../../src/platform/workflow/questionWorkflow.js';

/*
 * The platform's usual rule is that it does not show a student where an answer
 * is. This is the deliberate exception, and it is only safe because every option
 * draws in exactly the same style: the graph says what a symbol MEANS, not how
 * close to right it is. A student who cannot yet read "x = -2" as a vertical
 * line can see one, decide, and still be wrong.
 */

test('the shapes an Algebra I answer choice actually takes all parse', () => {
  assert.deepEqual(parseChoiceFigure('(-2,5)'), { kind: 'point', point: [-2, 5] });
  assert.deepEqual(parseChoiceFigure('(2, 5)'), { kind: 'point', point: [2, 5] }, 'spaces are normal');
  assert.deepEqual(parseChoiceFigure('x=-2'), { kind: 'verticalLine', x: -2 });
  assert.deepEqual(parseChoiceFigure('y=5'), { kind: 'horizontalLine', y: 5 });
  assert.deepEqual(parseChoiceFigure('y=2x-1'), { kind: 'line', m: 2, b: -1 });
  assert.deepEqual(parseChoiceFigure('y=-x'), { kind: 'line', m: -1, b: 0 }, 'an implied slope of one');
  assert.deepEqual(parseChoiceFigure('f(x)=3x+2'), { kind: 'line', m: 3, b: 2 });
  // Bank records carry LaTeX delimiters and unicode minus signs.
  assert.deepEqual(parseChoiceFigure('$(-2,5)$'), { kind: 'point', point: [-2, 5] });
  assert.deepEqual(parseChoiceFigure('x=−2'), { kind: 'verticalLine', x: -2 }, 'unicode minus');
});

test('prose does not pretend to be a figure', () => {
  ['growth', 'none of these', '', null, undefined, 'all real numbers'].forEach((value) => {
    assert.equal(parseChoiceFigure(value), null, `${String(value)} should not parse`);
  });
});

test('a stage where only some options draw is refused', () => {
  // THE REASON THIS MATTERS. If three options drew a marker and the fourth
  // stayed blank, the blank one would be marked out as different — the question
  // would be quietly telling the student something about the answer.
  assert.deepEqual(choicePreviewProblems({ choices: ['(-2,5)', '(2,5)', '(0,5)'] }), []);
  const problems = choicePreviewProblems({ choices: ['(-2,5)', 'none of these'] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /marked out as different/);
});

test('validation rejects a half-drawable preview stage', () => {
  const { errors } = validateWorkflow([{
    id: 'vertex',
    kind: 'multipleChoice',
    choices: ['(-2,5)', 'I do not know'],
    previewOnGraph: { graph: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 } },
  }], { label: 'Q' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /cannot draw "I do not know"/);
});

test('a stage without the option is untouched', () => {
  // Opt-in: an ordinary choice stage full of prose must not suddenly be invalid.
  const { errors } = validateWorkflow([
    { id: 'behaviour', kind: 'classification', choices: ['growth', 'decay', 'neither'] },
  ], { label: 'Q' });
  assert.deepEqual(errors, []);
});

test('every option draws in exactly one style', () => {
  // The safety property. If a point were drawn differently from a line, or one
  // option larger than another, the drawing would start ranking the options.
  const point = previewFigures('(-2,5)');
  const other = previewFigures('(0,5)');
  assert.equal(point.points.length, 1);
  assert.equal(other.points.length, 1);
  assert.equal(point.points[0].fill, other.points[0].fill, 'same colour for every option');
  assert.equal(point.points[0].r, other.points[0].r, 'same size for every option');
  assert.equal(point.points[0].fill, PREVIEW_STROKE);
  // From the shared constant, not a literal at the call site: that is what makes
  // it impossible for one option to be drawn louder than another.
  assert.equal(point.points[0].r, PREVIEW_POINT_RADIUS);
  assert.equal(other.points[0].r, PREVIEW_POINT_RADIUS);

  const line = previewFigures('y=2x-1');
  assert.equal(line.lines[0].stroke, PREVIEW_STROKE, 'a line uses the same colour as a point');
});

test('nothing is drawn before an option is chosen', () => {
  const empty = previewFigures('');
  assert.deepEqual(empty.points, []);
  assert.deepEqual(empty.lines, []);
  assert.deepEqual(empty.verticalLines, []);
  assert.deepEqual(empty.horizontalLines, []);
});

test('the preview never consults the answer key', () => {
  // Structural guarantee. previewFigures takes a label and nothing else; if it
  // could see which option was correct, it could draw that one differently.
  const source = readFileSync('src/platform/workflow/choicePreview.js', 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Named identifiers, not the word "answer" — that appears in a validation
  // message, which is prose rather than state.
  ['grading', 'answerKey', 'isCorrect', 'acceptedAnswers', 'expectedAnswer'].forEach((name) => {
    assert.ok(!new RegExp(`\\b${name}\\b`).test(code), `the preview must not read ${name}`);
  });
  // And structurally: it is handed a label and nothing else, so there is no
  // channel through which it could learn which option is correct.
  assert.match(source, /export const previewFigures = \(label\) =>/);
  assert.match(source, /export const parseChoiceFigure = \(label\) =>/);
});

test('the runner renders the preview above the options', () => {
  const runner = readFileSync('src/platform/workflow/WorkflowRunner.jsx', 'utf8');
  assert.match(runner, /ChoicePreviewGraph/);
  assert.match(runner, /stage\?\.previewOnGraph \? <ChoicePreviewGraph/);
  // It is the student's own selection that is drawn, not anything else.
  assert.match(runner, /previewFigures\(value\)/);
});
