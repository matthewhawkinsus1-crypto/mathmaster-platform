import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthoringContract } from '../../src/platform/contract/authoringContract.js';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';

const contract = buildAuthoringContract();

test('the contract has a task-fidelity rule, after the representation rule', () => {
  const representation = contract.indexOf('## Source representation fidelity');
  const task = contract.indexOf('## Source task fidelity');
  assert.ok(representation > 0, 'representation fidelity must still be there');
  assert.ok(task > representation, 'task fidelity belongs immediately after it');
});

test('the rule names the specific reductions that were observed', () => {
  // Each of these is a real downgrade from the generated assignment, not a
  // hypothetical. Naming them is the point — "preserve the task" alone did not
  // stop any of them.
  [
    'multiAnswer',
    'relationshipModel',
    'relationMapping',
    'graphAnalysis',
  ].forEach((type) => {
    assert.ok(contract.includes(`\`${type}\``), `${type} should appear in the reductions list`);
  });
  assert.match(contract, /It is a response form/);
  assert.match(contract, /that is `functionGraph`/);
});

test('every type says what the student physically does', () => {
  Object.entries(QUESTION_TYPE_CATALOG).forEach(([type, entry]) => {
    assert.ok(entry.studentAction, `${type} needs a studentAction`);
    assert.ok(entry.studentAction.length > 15, `${type}'s studentAction is too thin to be useful`);
  });
  assert.match(contract, /\*\*The student:\*\*/);
});

test('the two graph types are distinguished by what the student does, not by name', () => {
  // The reduction this prevents: using graphAnalysis for a "draw it" task.
  assert.match(QUESTION_TYPE_CATALOG.graphAnalysis.studentAction, /Does NOT draw it/);
  assert.match(QUESTION_TYPE_CATALOG.functionGraph.studentAction, /CONSTRUCTS/);
  assert.match(QUESTION_TYPE_CATALOG.multiAnswer.studentAction, /NOT a construction workspace/);
  assert.match(QUESTION_TYPE_CATALOG.table.studentAction, /EDITS/);
});

test('the misleading chocolate-bar example is gone', () => {
  // It was the actual lesson task, shown as an acceptable multiAnswer. Having
  // it in the contract taught the reduction the contract now forbids.
  assert.ok(!contract.toLowerCase().includes('chocolate'),
    'the example that taught the reduction must not remain in the contract');
});

test('the read-only table example is one where reading really is the task', () => {
  assert.match(contract, /Showing a table the student only reads/);
  assert.match(contract, /ONLY when the source/);
  // And it is followed by the warning against using it as a substitute.
  assert.match(contract, /Do not reach for this shape when the source asked for more/);
});

test('the worked example splits rather than reduces, and keeps every verb', () => {
  assert.match(contract, /Three questions, six verbs kept/);
  assert.match(contract, /more questions, never fewer actions/);
});

test('the contract does not advertise a field the platform ignores', () => {
  // `stages` is the staged Context Function Model, which is designed but not
  // built. Documenting it now would produce JSON MathMaster silently drops —
  // the same class of failure as the interval viewport bug.
  assert.ok(!contract.includes('"stages"'),
    'do not document relationshipModel stages until the tool implements them');
  assert.ok(!QUESTION_TYPE_CATALOG.relationshipModel.optional.includes('stages'));
});

test('graph choice guidance covers the accidental empty answer', () => {
  assert.match(contract, /parent cubic is increasing everywhere/);
  assert.match(contract, /only when the lesson specifically intends/);
});
