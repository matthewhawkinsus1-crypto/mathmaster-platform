import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditPathQuestionQuality,
  summarizePathBankQuality,
  buildPathQuestionRevisionBrief,
} from '../../src/platform/path/pathQuestionQuality.js';

test('legacy field-only starter item is a candidate, not silently production-ready', () => {
  const audit = auditPathQuestionQuality({
    id: 'seed-a12e',
    alignmentKeys: ['texas:A.12E'],
    prompt: 'Solve the literal equation for the requested variable.',
    responseFields: [{ id: 'answer', label: 'Answer', expected: 'd/r' }],
  });
  assert.equal(audit.level, 'candidate');
  assert.ok(audit.issues.some((issue) => issue.code === 'legacy-field-only'));
});

test('missing graph representation is a blocker', () => {
  const audit = auditPathQuestionQuality({
    alignmentKeys: ['texas:A.3C'],
    prompt: 'Use the displayed graph to identify the behavior from left to right.',
    responseFields: [{ id: 'answer', label: 'Behavior', expected: 'decreasing' }],
  });
  assert.equal(audit.level, 'blocked');
  assert.ok(audit.issues.some((issue) => issue.code === 'missing-graph-representation'));
});

test('rich item with solution support can be ready', () => {
  const audit = auditPathQuestionQuality({
    alignmentKeys: ['texas:A.12E'],
    prompt: 'Use the balance workspace to solve d = rt for t.',
    studentActions: ['solveStepByStep'],
    answer: 'd/r',
    solutionSteps: ['Divide both sides by r.', 'Cancel r/r on the right.'],
  });
  assert.equal(audit.level, 'ready');
  assert.ok(audit.score >= 80);
});

test('bank summary and revision brief expose QA state', () => {
  const question = {
    id: 'seed',
    alignmentKeys: ['texas:A.12E'],
    prompt: 'Solve for t.',
    responseFields: [{ id: 'answer', label: 't', expected: 'd/r' }],
  };
  const summary = summarizePathBankQuality([question]);
  assert.equal(summary.total, 1);
  assert.equal(summary.candidate, 1);
  assert.match(buildPathQuestionRevisionBrief(question), /Secure expected answer/);
});
