// WHAT "BUILD THE SEQUENCE MODEL" SAYS AFTER A WRONG CHECK.
//
// Walkthrough 2026-10-22, Algebra I DOL #3 Review PR 13 (a₁ = −7, add 4): a
// student who added 4 to n (−7, 6, 7, 8, 9, 10) and plotted exactly that table
// was told to "keep every representation consistent" and that "both rules"
// must agree, on an item with no rule fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { fullBridgeMissMessage, plotMatchesTable, tableChangesPosition } from '../../src/tools/sequenceExplorer/fullBridgeFeedback.js';
import sequenceExplorerGrader from '../../functions/shared/serverGrading/tools/sequenceExplorer.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';

const question = {
  mode: 'fullBridge', sequence: { kind: 'arithmetic', first: -7, difference: 4 }, displayCount: 6,
  studentActions: ['buildSequenceTable', 'plotSequence'],
};
const spec = { kind: 'arithmetic', first: -7, difference: 4 };
const slipTable = ['-7', '6', '7', '8', '9', '10'];
const slipPoints = slipTable.map((value, index) => [index + 1, Number(value)]);

test('the add-to-n slip is named, the matching graph is not blamed, and no rules are mentioned', () => {
  const work = { tableValues: slipTable, plottedPoints: slipPoints };
  const result = gradeToolCheck(sequenceExplorerGrader, question, work);
  assert.equal(result.isCorrect, false);
  const message = fullBridgeMissMessage({ parts: result.parts, work, spec });
  assert.match(message, /add the common difference to the previous term, not to the term number n/);
  assert.match(message, /Your graph matches your table/);
  assert.doesNotMatch(message, /rule|consistent/i);
  assert.doesNotMatch(message, /\b4\b/, 'the common difference is not given away');
});

test('a right table with a wrong graph is told the table is right', () => {
  const tableValues = ['-7', '-3', '1', '5', '9', '13'];
  const work = { tableValues, plottedPoints: [[1, -7], [2, -3]] };
  const result = gradeToolCheck(sequenceExplorerGrader, question, work);
  assert.match(fullBridgeMissMessage({ parts: result.parts, work, spec }), /^Your table is right\./);
});

// FB22 (Codex on #517): a plot-only item has no table to call right.
test('a wrong graph on an item with no table part is never told its table is right', () => {
  const message = fullBridgeMissMessage({ parts: [{ id: 'plot', isCorrect: false }], work: {}, spec: { kind: 'arithmetic', difference: 3 } });
  assert.doesNotMatch(message, /table is right/);
  assert.match(message, /^Plot each pair \(n, aₙ\) as its own point/);
  // With a table part the grader marked right, it still says so.
  assert.match(fullBridgeMissMessage({ parts: [{ id: 'table', isCorrect: true }, { id: 'plot', isCorrect: false }], work: {}, spec: {} }), /^Your table is right\./);
});

test('rule sentences appear only for the rule parts that are wrong', () => {
  const parts = [{ id: 'explicit-rule', isCorrect: false }, { id: 'recursive-first', isCorrect: true }, { id: 'recursive-rule', isCorrect: true }];
  assert.match(fullBridgeMissMessage({ parts, work: {}, spec }), /your explicit rule/);
  assert.doesNotMatch(fullBridgeMissMessage({ parts, work: {}, spec }), /both/);
  assert.match(fullBridgeMissMessage({ parts: [{ id: 'term', isCorrect: false }], work: {}, spec, targetN: 12 }), /a₁₂ by putting n = 12/);
});

test('the slip and plot readers stay narrow', () => {
  assert.equal(tableChangesPosition(['-7', '-3', '1', '5'], spec), false, 'a right table is not the slip');
  assert.equal(tableChangesPosition(['-7', '6', '', ''], spec), false, 'one later term is not enough to say');
  assert.equal(tableChangesPosition(['2', '4', '6', '8'], { kind: 'geometric', first: 2, ratio: 2 }), true, 'n × r for a geometric sequence');
  assert.equal(plotMatchesTable(slipPoints.slice(0, 5), slipTable), false, 'a missing point is not a match');
});

test('the tool shows the computed message, not the old consistency sentence', async () => {
  const source = await readFile('src/tools/sequenceExplorer/SequenceExplorer.jsx', 'utf8');
  assert.doesNotMatch(source, /Keep every representation consistent/);
  assert.match(source, /setMissMessage\(result\.isCorrect \? '' : fullBridgeMissMessage\(/);
});
