// Error patterns: named only from misconception evidence a server classifier
// stored. A wrong answer alone is never classified.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ERROR_PATTERN_NOT_DETERMINABLE, analyzeErrorPatterns, errorPatternForQuestion, isNamedPart } from '../../src/platform/caseReview/errorPatterns.js';
import { QUESTION_OUTCOME } from '../../src/platform/caseReview/attemptAnalysis.js';
import { MISCONCEPTION_REGISTRY, isMisconceptionCode, normalizeMisconceptionCodes } from '../../functions/shared/misconceptionCodes.mjs';

const row = (extra = {}) => ({
  assignmentId: 'a1', storageIndex: 0, outcome: QUESTION_OUTCOME.EXHAUSTED, finalResult: 'incorrect', misconceptionCodes: [], latestParts: [], ...extra,
});

test('with no stored code, every wrong answer reads "not determinable" — the brief\'s exact words', () => {
  assert.equal(ERROR_PATTERN_NOT_DETERMINABLE, 'Error pattern not determinable from stored evidence.');
  const analysis = analyzeErrorPatterns({ questions: [row(), row({ storageIndex: 1 })] });
  assert.equal(analysis.determinable, false);
  assert.equal(analysis.statement, ERROR_PATTERN_NOT_DETERMINABLE);
  assert.equal(errorPatternForQuestion(row()).statement, ERROR_PATTERN_NOT_DETERMINABLE);
});

test('a stored registry code is reported with its label, where it occurred, and whether it recurs', () => {
  const analysis = analyzeErrorPatterns({ questions: [
    row({ misconceptionCodes: ['slope-sign-reversed'] }),
    row({ assignmentId: 'a2', storageIndex: 3, misconceptionCodes: ['slope-sign-reversed', 'inverse-operation-sign'] }),
  ] });
  assert.equal(analysis.determinable, true);
  assert.deepEqual(analysis.codes.map((entry) => [entry.code, entry.questions, entry.recurrence]), [['slope-sign-reversed', 2, 'recurring'], ['inverse-operation-sign', 1, 'isolated']]);
  assert.equal(analysis.codes[0].label, 'Slope sign reversed');
  assert.deepEqual(analysis.codes[0].assignmentIds, ['a1', 'a2']);
  assert.equal(analysis.statement, '1 recurring misconception and 1 isolated misconception identified by MathMaster\'s server-side classifiers in this selection.');
});

test('only registry codes are accepted; free text or a guess never becomes a code', () => {
  assert.deepEqual(normalizeMisconceptionCodes(['slope-sign-reversed', 'the student is confused', 'SLOPE-SIGN-REVERSED', 'slope-sign-reversed']), ['slope-sign-reversed']);
  assert.ok(MISCONCEPTION_REGISTRY.length >= 8);
  // The generic pre-registry ids no classifier can prove are not codes.
  ['sign-error', 'distribution-error', 'slope-direction', 'graph-endpoint-error'].forEach((code) => assert.equal(isMisconceptionCode(code), false, code));
  // A row carrying an id this build does not know shows nothing for it.
  const analysis = analyzeErrorPatterns({ questions: [row({ misconceptionCodes: ['a-code-from-a-future-registry'] })] });
  assert.equal(analysis.determinable, false);
  assert.equal(errorPatternForQuestion(row({ misconceptionCodes: ['a-code-from-a-future-registry'] })).statement, ERROR_PATTERN_NOT_DETERMINABLE);
});

test('named parts marked not correct are listed as recorded results; generic "Part 1" labels are not', () => {
  assert.equal(isNamedPart('y-intercept'), true);
  assert.equal(isNamedPart('Part 2'), false);
  const analysis = analyzeErrorPatterns({ questions: [
    row({ latestParts: [{ label: 'y-intercept', isCorrect: false, isComplete: true }, { label: 'slope', isCorrect: true, isComplete: true }] }),
    row({ storageIndex: 1, latestParts: [{ label: 'y-intercept', isCorrect: false, isComplete: true }, { label: 'Part 2', isCorrect: false, isComplete: true }] }),
    row({ storageIndex: 2, finalResult: 'correct', outcome: QUESTION_OUTCOME.CORRECT_FIRST, latestParts: [{ label: 'y-intercept', isCorrect: true, isComplete: true }] }),
  ] });
  assert.deepEqual(analysis.notCorrectParts.map((entry) => [entry.label, entry.questions]), [['y-intercept', 2]]);
  assert.match(analysis.partNote, /not a diagnosis/);
  assert.equal(analysis.determinable, false, 'parts are not a classification');
});
