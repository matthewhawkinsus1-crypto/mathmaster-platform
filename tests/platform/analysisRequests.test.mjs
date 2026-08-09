import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYSIS_KINDS, NOTATION_ANALYSIS_KINDS, POINT_FEATURES,
  validateAnalysisRequest, validateAnalysisRequests,
} from '../../src/analysisRequestCatalog.js';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';

const graphQuestion = (analysisRequests) => ({
  type: 'graphAnalysis',
  prompt: 'Use the graph to answer each part.',
  functionSpec: { type: 'quadratic', a: 1, h: 0, k: -4 },
  analysisRequests,
});

test('every notation kind is accepted', () => {
  for (const kind of NOTATION_ANALYSIS_KINDS) {
    assert.deepEqual(validateAnalysisRequest({ id: kind, kind, notation: 'interval' }), []);
  }
});

test('"point" without a feature is rejected, and the message names the fix', () => {
  // This is the exact regression: an AI rewrote "positive" as "point", the
  // question validated, and the student got a click target with no valid point.
  const errors = validateAnalysisRequest({ id: 'positive', kind: 'point', notation: 'interval' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /needs a `feature`/);
  assert.match(errors[0], /xIntercepts/);
  assert.match(errors[0], /use kind "positive" or "negative" instead/);
});

test('"point" with a real feature is accepted', () => {
  for (const feature of POINT_FEATURES) {
    assert.deepEqual(validateAnalysisRequest({ id: 'f', kind: 'point', feature }), []);
  }
});

test('an invented kind, feature or notation is rejected by name', () => {
  assert.match(validateAnalysisRequest({ id: 'a', kind: 'slope' })[0], /not a value MathMaster renders/);
  assert.match(validateAnalysisRequest({ id: 'a', kind: 'point', feature: 'asymptote' })[0], /cannot locate/);
  assert.match(validateAnalysisRequest({ id: 'a', kind: 'domain', notation: 'words' })[0], /Use one of: interval/);
});

test('the whole-question path reports the position of each bad request', () => {
  const { errors } = validateQuestionSemantics(graphQuestion([
    { id: 'domain', kind: 'domain', notation: 'interval' },
    { id: 'positive', kind: 'point', notation: 'interval' },
    { id: 'negative', kind: 'point', notation: 'interval' },
  ]));
  assert.equal(errors.length, 2, errors.join(' | '));
  assert.ok(errors.every((e) => /analysisRequests\[[12]\]/.test(e)), errors.join(' | '));
  assert.ok(errors.some((e) => /"positive"/.test(e)), 'the request id appears in the message');
});

test('the shape Gemini originally produced is valid', () => {
  const { errors } = validateQuestionSemantics(graphQuestion([
    { id: 'positive', kind: 'positive', notation: 'interval' },
    { id: 'negative', kind: 'negative', notation: 'interval' },
  ]));
  assert.deepEqual(errors, [], 'positive/negative were correct all along');
});

test('hostile input does not throw', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}]) {
    assert.doesNotThrow(() => validateAnalysisRequest(bad));
  }
  assert.deepEqual(validateAnalysisRequests(null), []);
  assert.deepEqual(validateAnalysisRequests('nope'), []);
  assert.ok(ANALYSIS_KINDS.includes('point'));
});
