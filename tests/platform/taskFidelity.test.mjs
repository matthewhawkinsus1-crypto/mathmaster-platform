import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdvancedAuthoringContract } from '../../src/platform/contract/authoringContract.js';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';

// Assignment V5 exposes semantic authoring guidance only. Internal renderer
// catalogues still describe runtime behavior for platform tests, but the AI
// contract must teach studentActions and source fidelity rather than type names.
const contract = buildAdvancedAuthoringContract();

test('the contract has a task-fidelity rule, after the representation rule', () => {
  const representation = contract.indexOf('## Source representation fidelity');
  const task = contract.indexOf('## Source task fidelity');
  assert.ok(representation > 0, 'representation fidelity must still be there');
  assert.ok(task > representation, 'task fidelity belongs immediately after it');
});

test('the rule names the specific semantic reductions that were observed', () => {
  // These are the same real downgrades, expressed in V5 student-action language
  // so the AI is never told to choose an internal React renderer.
  assert.match(contract, /Generic response fields where the student was supposed to BUILD something/);
  assert.match(contract, /identifyQuantities alone/);
  assert.match(contract, /completeTable alone/);
  assert.match(contract, /buildMapping without plotRelation/);
  assert.match(contract, /readGraph\/analyze actions[\s\S]*constructGraph/);
});

test('runtime types still define student behavior but the public AI contract does not teach renderer recipes', () => {
  Object.entries(QUESTION_TYPE_CATALOG).forEach(([type, entry]) => {
    assert.ok(entry.studentAction, `${type} needs a studentAction`);
    assert.ok(entry.studentAction.length > 15, `${type}'s studentAction is too thin to be useful`);
  });
  assert.match(contract, /what the student must DO/);
  assert.doesNotMatch(contract, /\*\*The student:\*\*/);
  assert.doesNotMatch(contract, /How to build each question type/);
});

test('the two graph types are distinguished by what the student does, not by name', () => {
  // The reduction this prevents: using graphAnalysis for a "draw it" task.
  assert.match(QUESTION_TYPE_CATALOG.graphAnalysis.studentAction, /Does NOT draw it/);
  assert.match(QUESTION_TYPE_CATALOG.functionGraph.studentAction, /CONSTRUCTS/);
  assert.match(QUESTION_TYPE_CATALOG.multiAnswer.studentAction, /NOT a construction workspace/);
  assert.match(QUESTION_TYPE_CATALOG.table.studentAction, /EDITS/);
});

test('the chocolate-bar example now preserves the full mathematical task', () => {
  assert.match(contract, /whole chocolate bars for \$2 each/);
  assert.match(
    contract,
    /"studentActions": \["identifyQuantities", "writeEquation", "completeTable", "constructGraph", "stateDomain", "stateRange", "classifyContinuity"\]/,
  );
  assert.doesNotMatch(contract, /"type": "multiAnswer"/);
});

test('the read-only table example is one where reading really is the task', () => {
  assert.match(contract, /Showing a table the student only reads/);
  assert.match(contract, /ONLY when the source/);
  // And it is followed by the warning against using it as a substitute.
  assert.match(contract, /Do not reach for this shape when the source asked for more/);
});

test('the worked example keeps every verb rather than reducing the task', () => {
  // The example now COMPOSES the six verbs into one relationshipModel rather
  // than splitting them across three questions — the composition compiler made
  // that possible. The rule underneath is unchanged and is what is checked:
  // count the verbs in the source, keep all of them, and split only when the
  // source really contains separate tasks.
  assert.match(contract, /That is six verbs/);
  assert.match(contract, /Use the separate-question split only when the source/);
  assert.match(contract, /really contains separate tasks, not to work around a missing dependency/);
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
