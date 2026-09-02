import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  normalizeQuestionWeight,
  suggestedQuestionWeight,
  weightedQuestionTotals,
} from '../../src/platform/grading/questionWeights.js';

const require = createRequire(import.meta.url);
const serverWeights = require('../../functions/lib/questionWeights.js');

test('question weight defaults to one and clamps authored values safely', () => {
  assert.equal(normalizeQuestionWeight({}), 1);
  assert.equal(normalizeQuestionWeight({ questionWeight: 4 }), 4);
  assert.equal(normalizeQuestionWeight({ questionWeight: 0.1 }), 0.25);
  assert.equal(normalizeQuestionWeight({ questionWeight: 99 }), 20);
  assert.equal(normalizeQuestionWeight({ questionWeight: 'bad' }), 1);
});

test('weighted assignment score uses earned credit times question weight', () => {
  const tracker = {
    0: { credit: 1, attempted: true },
    1: { credit: 0.5, attempted: true },
    2: { credit: 0, attempted: false },
  };
  const questions = [
    { questionWeight: 4 },
    {},
    {},
  ];
  const totals = weightedQuestionTotals({
    tracker,
    questions,
    indices: [0, 1, 2],
    creditForRecord: (record) => record?.credit || 0,
    attemptedForRecord: (record) => record?.attempted === true,
  });
  assert.equal(totals.possibleWeight, 6);
  assert.equal(totals.earnedWeight, 4.5);
  assert.equal(totals.score, 75);
  assert.equal(totals.creditOnAttempted, 90, '4.5 earned out of 5 attempted weight units');
});

test('client and server normalize weights identically', () => {
  for (const value of [undefined, null, '', 0, 0.1, 0.25, 1, 1.5, 4, 20, 100, '3', 'bad']) {
    assert.equal(
      serverWeights.normalizeQuestionWeight({ questionWeight: value }),
      normalizeQuestionWeight({ questionWeight: value }),
      `mismatch for ${String(value)}`,
    );
  }
});

test('eight-stage modeling work is suggested at four times a simple item', () => {
  assert.equal(suggestedQuestionWeight({
    workflow: Array.from({ length: 8 }, (_, index) => ({ id: `stage-${index}` })),
  }), 4);
  assert.equal(suggestedQuestionWeight({
    answerFields: [{ id: 'answer' }],
  }), 1);
});
