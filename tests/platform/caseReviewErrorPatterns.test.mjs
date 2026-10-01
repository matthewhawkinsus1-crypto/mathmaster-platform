// Error patterns: named only from a structured code a tool stored. A wrong
// answer alone is never classified.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ERROR_PATTERN_NOT_DETERMINABLE, analyzeErrorPatterns, errorPatternForQuestion, isNamedPart } from '../../src/platform/caseReview/errorPatterns.js';
import { QUESTION_OUTCOME } from '../../src/platform/caseReview/attemptAnalysis.js';
import { MISCONCEPTION_CODE_CATALOG, isMisconceptionCode, normalizeMisconceptionCodes } from '../../functions/shared/misconceptionCodes.mjs';

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

test('a stored catalog code is reported with its label and where it occurred', () => {
  const analysis = analyzeErrorPatterns({ questions: [
    row({ misconceptionCodes: ['slope-direction'] }),
    row({ assignmentId: 'a2', storageIndex: 3, misconceptionCodes: ['slope-direction', 'sign-error'] }),
  ] });
  assert.equal(analysis.determinable, true);
  assert.deepEqual(analysis.codes.map((entry) => [entry.code, entry.questions]), [['slope-direction', 2], ['sign-error', 1]]);
  assert.equal(analysis.codes[0].label, 'Incorrect slope direction');
  assert.deepEqual(analysis.codes[0].assignmentIds, ['a1', 'a2']);
});

test('only catalog codes are accepted; free text or a guess never becomes a code', () => {
  assert.deepEqual(normalizeMisconceptionCodes(['slope-direction', 'the student is confused', 'SIGN-ERROR', 'slope-direction']), ['slope-direction']);
  assert.ok(MISCONCEPTION_CODE_CATALOG.length >= 8);
  ['sign-error', 'slope-direction', 'intercept-confusion', 'equation-form-confusion', 'distribution-error', 'graph-endpoint-error', 'inequality-boundary-error', 'substitution-setup-error', 'elimination-setup-error']
    .forEach((code) => assert.equal(isMisconceptionCode(code), true, code));
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
