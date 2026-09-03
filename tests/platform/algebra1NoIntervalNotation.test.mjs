import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const certifiedDocuments = () => readdirSync('drafts/fidelity-v2/algebra1')
  .filter((name) => name.endsWith('.json'))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .flatMap((name) => readJson(join('drafts/fidelity-v2/algebra1', name)).documents || []);

const collectViolations = (value, path = '$', out = []) => {
  if (typeof value === 'string') {
    if (/interval notation/i.test(value)) out.push(path + ': student-visible interval notation text');
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectViolations(item, path + '[' + index + ']', out));
    return out;
  }
  if (!value || typeof value !== 'object') return out;

  if (value.inputProfile === 'interval') out.push(path + ': inputProfile interval');
  if (value.notation === 'interval') out.push(path + ': analysis notation interval');
  if (Array.isArray(value.ask) && value.ask.includes('interval')) out.push(path + ': asks for interval notation');
  if (Object.prototype.hasOwnProperty.call(value, 'expectedNotation')) out.push(path + ': expectedNotation is present');

  Object.entries(value).forEach(([key, item]) => collectViolations(item, path + '.' + key, out));
  return out;
};

test('certified Algebra I Path content never requires formal interval notation', () => {
  const documents = certifiedDocuments();
  const violations = collectViolations({ documents });
  assert.deepEqual(violations, [], violations.join('\n'));
});

test('Algebra I compatibility and production seed mirrors match certified packages', () => {
  const certified = certifiedDocuments();
  const compatibility = readJson('drafts/algebra1.json').documents || [];
  const webSeed = readJson('seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json').documents || [];
  const functionsSeed = readJson('functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json').documents || [];

  assert.equal(certified.length, 245);
  assert.deepEqual(compatibility, certified);
  assert.deepEqual(webSeed, certified);
  assert.deepEqual(functionsSeed, certified);
});

test('A.5B negative-coefficient number-line family is graph-only', () => {
  const doc = certifiedDocuments().find((entry) => entry.id === 'mm_A_5B_v2_negative-coefficient-number-line');
  assert.ok(doc);
  assert.deepEqual(doc.ask, ['graph']);
  assert.equal(Object.prototype.hasOwnProperty.call(doc, 'expectedNotation'), false);
  assert.doesNotMatch(doc.prompt, /interval notation/i);
});


test('Algebra I canonical graph-analysis re-import cannot regress domain/range to interval notation', () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: {
      title: 'Algebra I graph-analysis round trip',
      courseId: 'algebra1',
      instructionalPurpose: 'review',
      gradingPurpose: 'classwork',
    },
    sections: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        standard: 'A.9A',
        prompt: 'Use the displayed graph to determine domain and range.',
        studentActions: ['readGraph', 'analyzeDomain', 'analyzeRange'],
        functionSpec: { type: 'exponential', a: 5, base: 3, h: 0, k: -4 },
        // This is the stale canonical shape that previously survived export
        // and then overrode the Algebra I course ceiling on re-import.
        analysisRequests: [
          { id: 'domain', kind: 'domain', notation: 'interval' },
          { id: 'range', kind: 'range', notation: 'interval' },
        ],
      }],
    }],
  }).package.sections[0].questions[0];

  assert.equal(compiled.type, 'graphAnalysis');
  assert.deepEqual(
    compiled.analysisRequests.map((request) => request.notation),
    ['inequality', 'inequality'],
  );
  assert.deepEqual(collectViolations(compiled), []);
});
