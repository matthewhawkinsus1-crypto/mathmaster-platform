import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry = JSON.parse(readFileSync('drafts/fidelity-v2/algebra1/A.5B.json', 'utf8'));

test('A.5B stages five new complete inequality families', () => {
  assert.equal(entry.standard, 'A.5B');
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /distribution-both-sides-and-number-line/);
  assert.equal(entry.documents.length, 5);
  for (const doc of entry.documents) {
    assert.ok(doc.id.includes('_v2_'));
    assert.ok(doc.familyId.includes(':v2-'));
    assert.ok(doc.generator?.parameters && Object.keys(doc.generator.parameters).length);
    assert.ok(doc.solutionReview?.reasoning?.length >= 2);
  }
});

test('A.5B explicitly covers distribution and variables on both sides', () => {
  const distribute = entry.documents.find((doc) => doc.id.includes('distribute-inequality'));
  const bothSides = entry.documents.find((doc) => doc.id.includes('variables-both-sides'));
  assert.ok(distribute);
  assert.match(distribute.prompt, /\(x/);
  assert.equal(distribute.responseFields?.[0]?.inputProfile, 'inequality');
  assert.ok(bothSides);
  assert.match(bothSides.prompt, /x.*x/);
  assert.equal(bothSides.responseFields?.[0]?.inputProfile, 'inequality');
});

test('A.5B preserves a secure number-line interaction for a negative-coefficient inequality', () => {
  const graph = entry.documents.find((doc) => doc.type === 'intervalNumberLine');
  assert.ok(graph);
  assert.equal(graph.representation, 'graph');
  assert.deepEqual(graph.ask, ['graph']);
  assert.equal(Object.prototype.hasOwnProperty.call(graph, 'expectedNotation'), false);
  assert.doesNotMatch(graph.prompt, /interval notation/i);
  assert.equal(graph.expectedIntervals?.length, 1);
  assert.equal(graph.expectedIntervals[0].min, null);
  assert.equal(graph.expectedIntervals[0].maxClosed, true);
  assert.match(graph.prompt, /graph the solution/i);
  assert.match(graph.solutionReview.reasoning.join(' '), /reverses the comparison/i);
});

test('A.5B models a contextual inequality before solving it', () => {
  const context = entry.documents.find((doc) => doc.taskType === 'application');
  assert.ok(context);
  assert.equal(context.responseFields?.length, 2);
  assert.ok(context.responseFields.every((field) => field.inputProfile === 'inequality'));
  assert.match(context.prompt, /at most/i);
});

test('A.5B error analysis presents the negative-division misconception explicitly', () => {
  const error = entry.documents.find((doc) => doc.taskType === 'errorAnalysis');
  assert.ok(error);
  assert.match(error.prompt, /student/i);
  assert.match(error.prompt, /did not reverse/i);
  assert.match(String(error.responseFields?.[0]?.expected), />=/);
});
