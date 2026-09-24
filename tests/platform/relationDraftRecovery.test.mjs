import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyBalancedOperationToRelation,
  buildStudentAuthoredAbsoluteValueSplit,
  parseRelationSource,
  restorableRelationState,
} from '../../src/algebraRelationFoundation.js';
import { region } from './helpers/sourceContract.mjs';

// A MALFORMED DRAFT NEVER STOPS A QUESTION FROM OPENING (Job 3).
//
// The relation workspace handed whatever localStorage (or another device's
// Firestore copy) held straight to its state. A truncated or old-shape draft
// crashed the whole question — "This question could not be displayed" — for an
// inequality the student had already started. Structurally sound drafts are
// restored; anything else resumes from the question's own relation.

const roundTrip = (state) => JSON.parse(JSON.stringify(state));

test('sound saved states are restored unchanged', () => {
  const start = parseRelationSource('-2x + 3 > 7', 'x');
  assert.deepEqual(restorableRelationState(roundTrip(start)), roundTrip(start));
  const divided = applyBalancedOperationToRelation(start, 'divide', '-2').state;
  assert.deepEqual(restorableRelationState(roundTrip(divided)), roundTrip(divided));
  const split = buildStudentAuthoredAbsoluteValueSplit(parseRelationSource('|x - 2| > 5', 'x'), 0, 'or', {
    branches: [{ value: '5', relation: '>' }, { value: '-5', relation: '<' }],
  }).state;
  assert.deepEqual(restorableRelationState(roundTrip(split)), roundTrip(split), 'OR branches survive');
  assert.deepEqual(restorableRelationState({ special: 'noSolution', variable: 'x', branches: [] }), { special: 'noSolution', variable: 'x', branches: [] });
});

test('malformed saved states are refused', () => {
  for (const bad of [
    null, 42, 'x < 4', [], {},
    { branches: 'broken' },
    { branches: [] },
    { branches: [{ expressions: ['x'], relations: [] }] },
    { branches: [{ expressions: ['x', '4'], relations: ['<', '<'] }] },
    { branches: [{ expressions: ['x', 5], relations: ['<'] }] },
    { branches: [{ expressions: ['x', '4'], relations: ['≈'] }] },
    { branches: [{ expressions: ['x', '((4'], relations: ['<'] }] },
    { branches: [{ expressions: ['x', '4'], relations: ['<'] }], connective: 'XOR' },
    { special: 'maybe', branches: [] },
  ]) {
    assert.equal(restorableRelationState(bad), null, `refused: ${JSON.stringify(bad)}`);
  }
});

test('the workspace reads its whole draft through the one sanitising reader', () => {
  const source = fs.readFileSync('src/MultiRelationAlgebraCore.jsx', 'utf8');
  const reader = region(source, 'const readRelationDraft = (draftKey) => {', '\n};', 'the draft reader');
  assert.match(reader, /restorableRelationState\(saved\.relationState\)/);
  assert.match(reader, /pendingSound \? pending : null/);
  assert.match(region(source, 'const initialStateFor = (question, draftKey) => {', '\n};'), /readRelationDraft\(draftKey\)/);
  assert.match(source, /const initialPendingRelationFlipFor = \(draftKey\) => readRelationDraft\(draftKey\)\.pendingRelationFlip;/);
  assert.match(source, /const initialCandidateChecksFor = \(draftKey\) => readRelationDraft\(draftKey\)\.candidateChecks;/);
  // No other path reads the relation draft raw.
  assert.equal((source.match(/readQuestionDraft\(draftKeyFor\(draftKey\)/g) || []).length, 1);
});
