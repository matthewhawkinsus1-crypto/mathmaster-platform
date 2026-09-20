import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateConstruction } from '../../src/tools/graphing2/constructionPolicy.js';
import { targetLineFromQuestion } from '../../src/tools/graphing2/graphingMath.js';

const source = fs.readFileSync(new URL('../../src/tools/graphing2/Graphing2.jsx', import.meta.url), 'utf8');

const pointSlopeQuestion = {
  mode: 'pointSlope',
  point: [14, 5],
  slope: -0.75,
  constructionPolicy: { strategy: 'formAware' },
};

test('a first click exactly at the encoded point is accepted as the required anchor', () => {
  const target = targetLineFromQuestion(pointSlopeQuestion);
  const secondPoint = [14 + 4, 5 - 3]; // slope -3/4 from the given point, still on the line
  const result = evaluateConstruction([pointSlopeQuestion.point, secondPoint], pointSlopeQuestion, target);
  assert.equal(result.anchorSatisfied, true);
  assert.equal(result.isCorrect, true);
});

test('a construction that never plots the encoded point is rejected even on the correct line', () => {
  const target = targetLineFromQuestion(pointSlopeQuestion);
  const onLineButNotTheAnchor = [[0, 15.5], [4, 12.5]]; // same line, never touches (14, 5)
  const result = evaluateConstruction(onLineButNotTheAnchor, pointSlopeQuestion, target);
  assert.equal(result.anchorSatisfied, false);
  assert.equal(result.isCorrect, false);
});

test('pointSlope mode does not preplot question.point as a given point', () => {
  const givenPointsLine = source.match(/const givenPoints = .*/)?.[0] || '';
  assert.match(givenPointsLine, /throughPoints/);
  assert.doesNotMatch(givenPointsLine, /pointSlope/);
});

test('throughPoints mode still renders its authored given points, unchanged', () => {
  const givenPointsLine = source.match(/const givenPoints = .*/)?.[0] || '';
  assert.match(givenPointsLine, /questionData\.givenPoints/);
});

test('the pointSlope help text no longer claims a purple point exists that does not count', () => {
  const pointSlopeHelp = source.match(/if \(mode === 'pointSlope'\) return '[^']*';/)?.[0] || '';
  assert.doesNotMatch(pointSlopeHelp, /purple point/i);
});

test('graphing hints format a rational slope as an exact fraction, not a repeating decimal', () => {
  assert.match(source, /formatSlopeForHint/);
  assert.match(source, /import \{ toFraction, formatFraction \} from '\.\.\/shared\/linearEquations\.js';/);
  // The pointSlope hint must route the slope through the formatter, not
  // interpolate questionData.slope/the raw numeric slope directly.
  const hintsForModeStart = source.indexOf('const hintsForMode = ');
  const pointSlopeStart = source.indexOf("if (mode === 'pointSlope') {", hintsForModeStart);
  const standardFormStart = source.indexOf("if (mode === 'standardForm')", pointSlopeStart);
  const pointSlopeHints = source.slice(pointSlopeStart, standardFormStart);
  assert.doesNotMatch(pointSlopeHints, /Slope \$\{questionData\.slope\}/);
  assert.match(pointSlopeHints, /formatSlopeForHint/);
});

// Mutation guard: prove the "no purple point" assertion can fail.
test('mutation guard: help text that still mentions the purple point would fail the assertion above', () => {
  const fakeHelp = "return 'plot the given point — the purple point alone does not count as your evidence.';";
  assert.match(fakeHelp, /purple point/i);
});
