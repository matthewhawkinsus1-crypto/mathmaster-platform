import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

const source = fs.readFileSync('src/tools/sequenceExplorer/SequenceExplorer.jsx', 'utf8');

test('integrated sequence workflow requires students to build table, plot points, write rules, and use the rule', () => {
  assert.match(source, /function FullSequenceBridge/);
  assert.match(source, /Domain input n/);
  assert.match(source, /Output aₙ/);
  assert.match(source, /n is the domain input/);
  assert.match(source, /onPlot=\{requirePlot \? handlePlot : null\}/);
  assert.match(source, /Explicit rule/);
  assert.match(source, /Recursive rule/);
  assert.match(source, /Check the complete sequence model/);
  assert.doesNotMatch(
    source.slice(source.indexOf('function FullSequenceBridge'), source.indexOf('function RuleBridge')),
    /SequenceVisual spec=/,
    'the integrated mode must not reveal the completed table/graph before the student builds it',
  );
});

test('V5 integrated sequence intent stays one question instead of fragmenting connected work', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Sequence integration', courseId: 'algebra1' },
    sections: [{
      role: 'classwork',
      questions: [{
        standard: 'A.12D',
        prompt: 'Build the table and graph, write both rules, and use the explicit rule to find a₃₆.',
        studentActions: [
          'buildSequenceTable',
          'plotSequence',
          'analyzeSequence',
          'writeRecursive',
          'writeExplicit',
          'findSequenceTerm',
        ],
        sequence: { kind: 'arithmetic', first: 125, difference: 18 },
        displayCount: 6,
        targetN: 36,
      }],
    }],
  }).package;

  const questions = compiled.sections[0].questions;
  assert.equal(questions.length, 1);
  assert.equal(questions[0].type, 'sequenceExplorer');
  assert.equal(questions[0].mode, 'fullBridge');
  assert.equal(questions[0].targetN, 36);
  assert.deepEqual(questions[0].studentActions, [
    'buildSequenceTable',
    'plotSequence',
    'analyzeSequence',
    'writeRecursive',
    'writeExplicit',
    'findSequenceTerm',
  ]);
});

test('sequence graph bounds no longer force zero into far-away positive data', () => {
  const graphStart = source.indexOf('const graphBounds');
  const graphEnd = source.indexOf('function SequenceVisual', graphStart);
  const graphBlock = source.slice(graphStart, graphEnd);
  assert.match(graphBlock, /dataLow/);
  assert.match(graphBlock, /dataHigh/);
  assert.doesNotMatch(graphBlock, /Math\.min\(0, \.\.\.finite\)/);
});


test('sequence comparison can require student-created plots for both models before comparison', () => {
  const compareStart = source.indexOf('function CompareSequences');
  const compareBlock = source.slice(compareStart);
  assert.match(compareBlock, /actions\.includes\('plotSequence'\)/);
  assert.match(compareBlock, /leftPlottedPoints/);
  assert.match(compareBlock, /rightPlottedPoints/);
  assert.match(compareBlock, /onPlot=\{requirePlot \? handlePlot : null\}/);
  assert.match(compareBlock, /pointSetMatchesRows\(leftPlottedPoints, leftRows/);
  assert.match(compareBlock, /pointSetMatchesRows\(rightPlottedPoints, rightRows/);
  assert.match(compareBlock, /points=\{visiblePoints\}/);
  assert.match(compareBlock, /Plot both sequences as discrete functions/);
  assert.doesNotMatch(compareBlock, /\{\s*0:\s*row\.n/);
});

test('V5 compare-plus-plot intent stays a comparison while preserving the plotting requirement', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Compare plotted sequences', courseId: 'algebra1' },
    sections: [{
      role: 'practice',
      questions: [{
        standard: 'A.12C',
        prompt: 'Plot both sequences through term 7, then compare their seventh terms.',
        studentActions: ['plotSequence', 'compareSequences'],
        left: { kind: 'arithmetic', first: 2, difference: 5 },
        right: { kind: 'geometric', first: 2, ratio: 2 },
        leftLabel: 'Sequence A',
        rightLabel: 'Sequence B',
        displayCount: 7,
        compareN: 7,
      }],
    }],
  }).package.sections[0].questions[0];

  assert.equal(compiled.type, 'sequenceExplorer');
  assert.equal(compiled.mode, 'compare');
  assert.equal(compiled.displayCount, 7);
  assert.equal(compiled.compareN, 7);
  assert.deepEqual(compiled.studentActions, ['plotSequence', 'compareSequences']);
});
