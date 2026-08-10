import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditAlignmentSpecificity } from '../../src/platform/contract/alignments.js';

const teks = (code) => ({ alignments: [{ framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' }] });
const question = (type, code) => ({ type, prompt: 'x', ...teks(code) });

// Alignment is a property of a question, not of a lesson. An AI author handed
// one assignment-level TEKS will stamp it on every item, and the result records
// mastery evidence for standards the questions never assessed.

test('one standard across many different tools is flagged', () => {
  const { warnings } = auditAlignmentSpecificity([
    question('intervalNumberLine', 'A2.7I'),
    question('graphAnalysis', 'A2.7I'),
    question('relationMapping', 'A2.7I'),
    question('table', 'A2.7I'),
  ]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Every question in this assignment is aligned to A2\.7I/);
  assert.match(warnings[0], /Alignment is per question/);
  assert.match(warnings[0], /prerequisite/);
});

test('a focused practice set on one standard is NOT flagged', () => {
  // Ten algebra questions, one standard. Entirely legitimate.
  const focused = Array.from({ length: 10 }, () => question('algebra', 'A.5A'));
  assert.deepEqual(auditAlignmentSpecificity(focused).warnings, []);
});

test('a mixed assignment that already aligns per question is not flagged', () => {
  const { warnings } = auditAlignmentSpecificity([
    question('intervalNumberLine', 'A2.7I'),
    question('relationMapping', 'A2.7A'),
    question('table', 'A2.7B'),
    question('graphAnalysis', 'A2.7I'),
  ]);
  assert.deepEqual(warnings, []);
});

test('a short assignment is left alone, because two items prove nothing', () => {
  assert.deepEqual(auditAlignmentSpecificity([
    question('table', 'A.2A'),
    question('algebra', 'A.2A'),
  ]).warnings, []);
});

test('the supplied fixture is exactly the pattern this exists to catch', async () => {
  // The real file from the handoff: eleven questions, seven tool types, one
  // TEKS on all of them.
  const raw = await readFile(
    new URL('./fixtures/attributesAndRelationsOfFunctions.json', import.meta.url),
    'utf8',
  );
  const { questions } = JSON.parse(raw);
  assert.equal(questions.length, 11);

  const { warnings } = auditAlignmentSpecificity(questions);
  assert.equal(warnings.length, 1, 'this assignment must be flagged');
  assert.match(warnings[0], /A2\.7I/);

  // And the audit is describing something real: the questions genuinely span
  // several distinct tasks.
  const types = new Set(questions.map((entry) => entry.type));
  assert.ok(types.size >= 5, `expected several question types, saw ${[...types].join(', ')}`);
});
