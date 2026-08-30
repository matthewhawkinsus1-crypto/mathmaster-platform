import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPRESENTATIONS, TASK_TYPES } from '../../functions/shared/pathQuestionQuality.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));

const staged = [
  read('drafts/fidelity-v2/algebra1/A.2C.json'),
  read('drafts/fidelity-v2/algebra1/A.2H.json'),
  read('drafts/fidelity-v2/algebra1/A.2I.json'),
  read('drafts/fidelity-v2/algebra1/A.12D.json'),
];

const codeOf = (doc) => String((doc.alignmentKeys || []).find((key) => String(key).startsWith('texas:')) || '')
  .replace(/^texas:/, '');

const allStrings = (node, out = []) => {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((value) => allStrings(value, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((value) => allStrings(value, out));
  return out;
};

test('each staged Algebra I Fidelity V2 standard contains five new complete families', () => {
  const ids = new Set();
  const familyIds = new Set();
  for (const payload of staged) {
    assert.match(payload.standard, /^A\.\d+[A-Z]$/);
    assert.equal(payload.documents.length, 5, `${payload.standard} must contain exactly five replacements`);
    for (const doc of payload.documents) {
      assert.equal(codeOf(doc), payload.standard);
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

      const joined = allStrings(doc).join(' ');
      assert.equal(joined.includes('$$'), false, `${doc.id} contains an empty/double math delimiter`);

      if (doc.representation === 'table') {
        assert.ok(doc.stimulus?.table?.rows?.length >= 2, `${doc.id} declares table but supplies no real table`);
      }
      if (doc.taskType === 'errorAnalysis') {
        assert.match(String(doc.prompt), /student|error|mistake|incorrect|correct/i, `${doc.id} must actually present an error to analyze`);
      }
    }
  }
});

test('A.2C Fidelity V2 makes students write the linear equation in every family', () => {
  const docs = staged.find((entry) => entry.standard === 'A.2C').documents;
  assert.equal(docs.length, 5);
  for (const doc of docs) {
    const fields = doc.responseFields || [];
    assert.equal(fields.length, 1);
    assert.equal(fields[0].inputProfile, 'equation', `${doc.id} must require an equation`);
    assert.match(String(fields[0].expected), /=/);
  }
  assert.ok(docs.some((doc) => doc.representation === 'table'));
  assert.ok(docs.some((doc) => doc.representation === 'context'));
  assert.ok(docs.some((doc) => doc.taskType === 'errorAnalysis'));
  assert.ok(docs.some((doc) => doc.dok === 3));
});

test('A.2H Fidelity V2 makes students write two-variable inequalities in every family', () => {
  const payload = staged.find((entry) => entry.standard === 'A.2H');
  const docs = payload.documents;
  assert.match(payload.certificationStatus, /needs-real-two-variable-graph-family/);
  for (const doc of docs) {
    const fields = doc.responseFields || [];
    assert.equal(fields.length, 1);
    assert.equal(fields[0].inputProfile, 'inequality', `${doc.id} must require an inequality`);
    const expected = String(fields[0].expected);
    assert.match(expected, /x|y/);
    assert.match(expected, /<=|>=|<|>/);
  }
  assert.ok(docs.some((doc) => doc.representation === 'table'));
  assert.ok(docs.some((doc) => doc.taskType === 'errorAnalysis'));
});

test('A.2I Fidelity V2 makes students write complete systems rather than solve a supplied system', () => {
  const payload = staged.find((entry) => entry.standard === 'A.2I');
  const docs = payload.documents;
  assert.match(payload.certificationStatus, /needs-real-graph-family/);
  for (const doc of docs) {
    const fields = doc.responseFields || [];
    assert.equal(fields.length, 2, `${doc.id} must require both equations of the system`);
    assert.ok(fields.every((field) => field.inputProfile === 'equation'), `${doc.id} system fields must be equations`);
    assert.ok(fields.every((field) => String(field.expected).includes('=')), `${doc.id} needs two complete equation keys`);
  }
  assert.ok(docs.some((doc) => doc.representation === 'table'));
  assert.ok(docs.some((doc) => doc.taskType === 'errorAnalysis'));
  assert.ok(docs.some((doc) => doc.dok === 3 && doc.taskType === 'reverseReasoning'));
});

test('A.12D Fidelity V2 actually requires nth-term formulas rather than component answers', () => {
  const payload = staged.find((entry) => entry.standard === 'A.12D');
  assert.ok(payload);
  for (const doc of payload.documents) {
    const fields = doc.responseFields || [];
    assert.equal(fields.length, 1);
    assert.equal(fields[0].inputProfile, 'expression', `${doc.id} must require an explicit formula expression`);
    assert.match(String(doc.prompt), /formula/i);
    assert.match(String(fields[0].expected), /n/);
  }
});

test('A.12D includes arithmetic, geometric growth, geometric decay, true error analysis, and a higher reasoning family', () => {
  const docs = staged.find((entry) => entry.standard === 'A.12D').documents;
  const text = JSON.stringify(docs).toLowerCase();
  assert.match(text, /arithmetic/);
  assert.match(text, /geometric/);
  assert.match(text, /0\.5|1\/2/);
  assert.ok(docs.some((doc) => doc.taskType === 'errorAnalysis' && /student/i.test(doc.prompt)));
  assert.ok(docs.some((doc) => doc.dok === 3 && doc.taskType === 'reverseReasoning'));
  assert.ok(docs.filter((doc) => doc.representation === 'table').length >= 2);
});
