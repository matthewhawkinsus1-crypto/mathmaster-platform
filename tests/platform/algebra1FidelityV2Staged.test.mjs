import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPRESENTATIONS, TASK_TYPES } from '../../functions/shared/pathQuestionQuality.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const codes = ['A.2C', 'A.2H', 'A.2I', 'A.8A', 'A.9C', 'A.10A', 'A.10B', 'A.10C', 'A.10D', 'A.10E', 'A.10F', 'A.11B', 'A.12A', 'A.12C', 'A.12D'];
const staged = codes.map((code) => read(`drafts/fidelity-v2/algebra1/${code}.json`));
const codeOf = (doc) => String((doc.alignmentKeys || []).find((key) => String(key).startsWith('texas:')) || '').replace(/^texas:/, '');
const allStrings = (node, out = []) => {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((value) => allStrings(value, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((value) => allStrings(value, out));
  return out;
};
const payload = (code) => staged.find((entry) => entry.standard === code);

test('each staged Algebra I Fidelity V2 standard contains five new complete families', () => {
  const ids = new Set();
  const familyIds = new Set();
  assert.deepEqual(staged.map((entry) => entry.standard), codes);
  for (const entry of staged) {
    assert.equal(entry.documents.length, 5, `${entry.standard} must contain exactly five replacements`);
    for (const doc of entry.documents) {
      assert.equal(codeOf(doc), entry.standard);
      assert.ok(doc.id.includes('_v2_'), `${doc.id} needs a new Fidelity V2 id`);
      assert.equal(ids.has(doc.id), false, `duplicate staged id ${doc.id}`);
      ids.add(doc.id);
      assert.ok(doc.familyId.includes(':v2-'), `${doc.id} needs a new Fidelity V2 family id`);
      assert.equal(familyIds.has(doc.familyId), false, `duplicate staged familyId ${doc.familyId}`);
      familyIds.add(doc.familyId);
      assert.ok(REPRESENTATIONS.includes(doc.representation), `${doc.id} has unsupported representation ${doc.representation}`);
      assert.ok(TASK_TYPES.includes(doc.taskType), `${doc.id} has unsupported task type ${doc.taskType}`);
      assert.ok(Number.isInteger(doc.dok) && doc.dok >= 1 && doc.dok <= 4);
      assert.ok(Number.isInteger(doc.difficultyBand) && doc.difficultyBand >= 1 && doc.difficultyBand <= 5);
      assert.ok(doc.generator?.parameters && Object.keys(doc.generator.parameters).length, `${doc.id} needs a real generator`);
      assert.ok(doc.solutionReview?.reasoning?.length >= 2, `${doc.id} needs a meaningful solution review`);
      assert.ok(doc.attemptFeedback?.length, `${doc.id} needs attempt feedback`);
      assert.ok(doc.supportHints?.length, `${doc.id} needs support hints`);
      assert.equal(allStrings(doc).join(' ').includes('$$'), false, `${doc.id} contains a double math delimiter`);
      if (doc.representation === 'table') assert.ok(doc.stimulus?.table?.rows?.length >= 2, `${doc.id} declares table but supplies no table`);
      if (doc.taskType === 'errorAnalysis') assert.match(String(doc.prompt), /student|error|mistake|incorrect|correct|claims?/i, `${doc.id} must present an error to analyze`);
    }
  }
});

test('A.2C makes students write a complete linear equation in every family', () => {
  for (const doc of payload('A.2C').documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'equation');
    assert.match(String(doc.responseFields[0].expected), /=/);
  }
  assert.ok(payload('A.2C').documents.some((doc) => doc.representation === 'table'));
  assert.ok(payload('A.2C').documents.some((doc) => doc.taskType === 'errorAnalysis'));
});

test('A.2H makes students write a two-variable inequality in every family', () => {
  const entry = payload('A.2H');
  assert.match(entry.certificationStatus, /needs-real-two-variable-graph-family/);
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'inequality');
    const expected = String(doc.responseFields[0].expected);
    assert.match(expected, /x|y/);
    assert.match(expected, /<=|>=|<|>/);
  }
});

test('A.2I requires both equations of the system in every family', () => {
  const entry = payload('A.2I');
  assert.match(entry.certificationStatus, /needs-real-graph-family/);
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 2);
    assert.ok(doc.responseFields.every((field) => field.inputProfile === 'equation' && String(field.expected).includes('=')));
  }
});

test('A.8A covers all four required quadratic solution methods and complete solution sets', () => {
  const entry = payload('A.8A');
  assert.match(entry.certificationStatus, /four-required-methods/);
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'set');
    assert.match(String(doc.responseFields[0].expected), /\{.*\}/);
  }
  const prompts = entry.documents.map((doc) => String(doc.prompt).toLowerCase()).join(' ');
  assert.match(prompts, /factor/);
  assert.match(prompts, /square-root property/);
  assert.match(prompts, /completing the square/);
  assert.match(prompts, /quadratic formula/);
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /complete solution set/i.test(doc.prompt)));
});

test('A.9C makes students write complete exponential equations for growth and decay', () => {
  const entry = payload('A.9C');
  assert.match(entry.certificationStatus, /full-equation-writing/);
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'equation');
    assert.match(String(doc.responseFields[0].expected), /^y=/);
  }
  const growth = entry.documents.find((doc) => doc.id.includes('context-growth-model'));
  const decay = entry.documents.find((doc) => doc.id.includes('context-decay-model'));
  assert.ok(growth?.generator?.parameters?.base?.values?.some((value) => value > 1));
  assert.ok(decay?.generator?.parameters?.base?.values?.every((value) => value > 0 && value < 1));
  assert.ok(entry.documents.some((doc) => doc.representation === 'table' && doc.stimulus?.table?.rows?.length >= 3));
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /linear model/i.test(doc.prompt)));
  assert.ok(entry.documents.some((doc) => doc.dok === 3 && doc.taskType === 'reverseReasoning' && /y\(2\)/i.test(doc.prompt)));
});

test('A.10A-D require complete polynomial-operation expressions rather than component answers', () => {
  for (const code of ['A.10A', 'A.10B', 'A.10C', 'A.10D']) {
    const entry = payload(code);
    assert.match(entry.certificationStatus, /expanded-expression-grader-integration/);
    for (const doc of entry.documents) {
      assert.equal(doc.responseFields?.length, 1);
      assert.equal(doc.responseFields[0].inputProfile, 'expression');
      assert.match(String(doc.responseFields[0].expected), /x/);
      assert.doesNotMatch(String(doc.prompt), /what is the coefficient|what is the constant term|what is the degree/i);
    }
    assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
    assert.ok(new Set(entry.documents.map((doc) => doc.dok)).size >= 2, `${code} needs honest DOK spread without forcing DOK 3`);
  }
});

test('A.10E-F require complete factored forms and preserve factor order alternatives', () => {
  for (const code of ['A.10E', 'A.10F']) {
    const entry = payload(code);
    assert.match(entry.certificationStatus, /form-preserving-factoring/);
    for (const doc of entry.documents) {
      const field = doc.responseFields?.[0];
      assert.equal(field?.inputProfile, 'expression');
      assert.match(String(doc.prompt), /factor/i);
      assert.match(String(field.expected), /\(|\^2/);
      assert.doesNotMatch(String(doc.prompt), /what is the larger zero|what positive number|what is the coefficient/i);
    }
    assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
  }
});

test('A.11B includes integral and rational exponent laws with complete simplification', () => {
  const entry = payload('A.11B');
  assert.match(entry.certificationStatus, /rational-and-integral-exponent-coverage/);
  const text = JSON.stringify(entry.documents).toLowerCase();
  assert.match(text, /rational exponent/);
  assert.match(text, /positive exponents/);
  assert.ok(entry.documents.some((doc) => doc.prompt.includes('{{p}}/{{q}}')));
  assert.ok(entry.documents.some((doc) => doc.responseFields?.[0]?.inputProfile === 'number'));
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /adding the exponents/i.test(doc.prompt)));
});

test('A.12A uses real mapping/table/ordered-pair evidence and does not certify a missing graph', () => {
  const entry = payload('A.12A');
  assert.match(entry.certificationStatus, /needs-real-graph-family/);
  assert.ok(entry.documents.some((doc) => doc.type === 'relationMapping'));
  assert.ok(entry.documents.some((doc) => doc.representation === 'table' && doc.stimulus?.table?.rows?.length >= 2));
  assert.ok(entry.documents.some((doc) => doc.representation === 'orderedPairs'));
  assert.ok(entry.documents.some((doc) => doc.representation === 'context'));
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /repeats/i.test(doc.prompt)));
  assert.equal(entry.documents.some((doc) => doc.representation === 'graph'), false);
});

test('A.12C connects recursive sequences to term-number domain, tables, and discrete graph points', () => {
  const entry = payload('A.12C');
  assert.equal(entry.verdict, 'ENHANCE');
  assert.match(entry.certificationStatus, /discrete-point-render-review/);
  assert.ok(entry.documents.filter((doc) => doc.representation === 'table').length >= 2);
  const graph = entry.documents.find((doc) => doc.representation === 'graph');
  assert.equal(graph?.type, 'functionInvestigation');
  assert.equal(graph?.pointTasks?.length, 4);
  assert.ok(graph.pointTasks.every((task, index) => task.expected?.[0] === index + 1));
  assert.match(String(graph.prompt), /term number as the x-coordinate/i);
  assert.match(String(graph.prompt), /discrete/i);
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /domain/i.test(doc.prompt)));
  const text = JSON.stringify(entry.documents).toLowerCase();
  assert.match(text, /arithmetic/);
  assert.match(text, /geometric/);
  assert.match(text, /input\/domain|domain\/input/);
});

test('A.12D requires nth-term formulas and covers arithmetic plus geometric growth/decay', () => {
  const entry = payload('A.12D');
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'expression');
    assert.match(String(doc.prompt), /formula/i);
    assert.match(String(doc.responseFields[0].expected), /n/);
  }
  const text = JSON.stringify(entry.documents).toLowerCase();
  assert.match(text, /arithmetic/);
  assert.match(text, /geometric/);
  assert.match(text, /0\.5|1\/2/);
  assert.ok(entry.documents.filter((doc) => doc.representation === 'table').length >= 2);
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
  assert.ok(entry.documents.some((doc) => doc.dok === 3 && doc.taskType === 'reverseReasoning'));
});
