import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  gradingClosesQuestion,
  latestAttemptCount,
  responseClosesQuestion,
} from '../../src/platform/path/pathProgression.js';

test('question closure works with current and previous callable response shapes', () => {
  assert.equal(gradingClosesQuestion({ questionFinalized: true, isCorrect: false }), true);
  assert.equal(gradingClosesQuestion({ isCorrect: true }), true);
  assert.equal(gradingClosesQuestion({ attemptNumber: 3, attemptsRemaining: 0, isCorrect: false }), true);
  assert.equal(responseClosesQuestion({ needsNextQuestion: true, grading: {} }), true);
  assert.equal(gradingClosesQuestion({ attemptNumber: 1, attemptsRemaining: 2, isCorrect: false }), false);
});

test('attempt display uses the newest attempt returned by the server', () => {
  assert.equal(latestAttemptCount({ attemptsUsed: 0 }, { attemptNumber: 1 }), 1);
  assert.equal(latestAttemptCount({ attemptsUsed: 2 }, { attemptNumber: 1 }), 2);
});

test('a failed next-question load keeps the continuation route available', () => {
  const source = readFileSync('src/components/student/MyMathPathProductionContainer.jsx', 'utf8');
  const advance = source.split('const advanceToNextQuestion')[1].split('const handleSubmitAnswer')[0];
  assert.doesNotMatch(advance, /setAwaitingContinue\(false\)/);
  assert.match(advance, /setAwaitingContinue\(true\)/);
  assert.match(source, /Try next question again/);
  assert.match(source, /responseClosesQuestion\(result\)/);
});

test('both canonical and generic Path questions expose the same continuation action', () => {
  const source = readFileSync('src/components/student/PathSessionPlayer.jsx', 'utf8');
  const actions = source.match(/ContinueAction onContinue=\{onContinue\}/g) || [];
  assert.ok(actions.length >= 2, `expected both Path renderers to expose ContinueAction; found ${actions.length}`);
  assert.match(source, /gradingClosesQuestion\(lastGradingResult\)/);
});

test('page-level horizontal movement is blocked while MathInput remains bounded', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const input = readFileSync('src/MathInput.jsx', 'utf8');
  assert.match(css, /html \{[\s\S]*overflow-x: clip/);
  assert.match(css, /body \{[\s\S]*overflow-x: clip/);
  assert.match(css, /#root \{[\s\S]*overflow-x: clip/);
  assert.match(input, /event\.key === ' ' \|\| event\.code === 'Space'/);
  assert.match(input, /overflowX: '(?:clip|hidden)'/);
});
