import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (code) => JSON.parse(readFileSync(`drafts/fidelity-v2/algebra1/${code}.json`, 'utf8'));
const entries = ['A.2B', 'A.2D', 'A.2E', 'A.2F'].map(read);

test('A.2B A.2D A.2E A.2F each stage five new Fidelity V2 families', () => {
  for (const entry of entries) {
    assert.equal(entry.verdict, 'ENHANCE');
    assert.equal(entry.documents.length, 5);
    assert.ok(entry.documents.every((doc) => doc.id.includes('_v2_')));
    assert.ok(entry.documents.every((doc) => doc.familyId.includes(':v2-')));
    assert.ok(entry.documents.every((doc) => doc.generator?.parameters && Object.keys(doc.generator.parameters).length));
    assert.ok(entry.documents.some((doc) => doc.representation === 'table'));
    assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis' && /student/i.test(doc.prompt)));
  }
});

test('A.2B requires complete line equations and genuinely samples multiple forms', () => {
  const entry = read('A.2B');
  assert.match(entry.certificationStatus, /multiple-linear-forms/);
  for (const doc of entry.documents) {
    const equation = doc.responseFields?.find((field) => field.inputProfile === 'equation');
    assert.ok(equation, `${doc.id} must require a complete equation`);
    assert.match(String(equation.expected), /=/);
  }
  assert.ok(entry.documents.some((doc) => /point-slope/i.test(doc.prompt)), 'must assess point-slope form');
  assert.ok(entry.documents.some((doc) => /standard form/i.test(doc.prompt)), 'must assess standard form');
  assert.ok(entry.documents.some((doc) => /slope-intercept form/i.test(doc.prompt)), 'must assess slope-intercept form');
  assert.ok(entry.documents.some((doc) => doc.representation === 'table'));
  assert.ok(entry.documents.some((doc) => doc.representation === 'orderedPairs'));
  assert.ok(entry.documents.some((doc) => doc.taskType === 'errorAnalysis'));
});

test('A.2D requires a complete direct-variation equation in every family', () => {
  const entry = read('A.2D');
  assert.match(entry.certificationStatus, /full-direct-variation-modeling/);
  for (const doc of entry.documents) {
    const equation = doc.responseFields?.find((field) => field.inputProfile === 'equation');
    assert.ok(equation, `${doc.id} must require an equation`);
    assert.match(String(equation.expected), /=/);
    assert.doesNotMatch(String(doc.prompt), /^what is k\b/i);
  }
  assert.ok(entry.documents.some((doc) => doc.responseFields?.length === 2), 'at least one family should write then use the model');
});

test('A.2E requires complete parallel-line equations instead of slope-only answers', () => {
  const entry = read('A.2E');
  assert.match(entry.certificationStatus, /full-parallel-line-writing/);
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'equation');
    assert.match(String(doc.responseFields[0].expected), /^y=/);
    assert.match(String(doc.prompt), /parallel/i);
    assert.doesNotMatch(String(doc.prompt), /what is the slope/i);
  }
  assert.ok(entry.documents.some((doc) => doc.representation === 'orderedPairs'));
});

test('A.2F requires complete perpendicular-line equations and negative-reciprocal reasoning', () => {
  const entry = read('A.2F');
  assert.match(entry.certificationStatus, /full-perpendicular-line-writing/);
  for (const doc of entry.documents) {
    assert.equal(doc.responseFields?.length, 1);
    assert.equal(doc.responseFields[0].inputProfile, 'equation');
    assert.match(String(doc.responseFields[0].expected), /^y=/);
    assert.match(String(doc.prompt), /perpendicular/i);
    assert.doesNotMatch(String(doc.prompt), /what is the slope/i);
  }
  assert.ok(entry.documents.some((doc) => doc.representation === 'orderedPairs'));
  assert.ok(entry.documents.every((doc) => JSON.stringify(doc).includes('pm')));
});
