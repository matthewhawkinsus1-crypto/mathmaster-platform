import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const preflight = fs.readFileSync(new URL('../../src/components/teacher/LessonPreflightModal.jsx', import.meta.url), 'utf8');
const contract = fs.readFileSync(new URL('../../src/platform/contract/authoringContract.js', import.meta.url), 'utf8');

test('teacher Preflight renders Section Balance & Rigor audit', () => {
  assert.match(preflight, /SectionBalanceRigorAudit/);
  assert.match(preflight, /lessonBundle=\{effectiveBundle\}/);
});

test('V5 authoring contract distinguishes classwork from practice', () => {
  assert.match(contract, /Classwork versus Practice balance/);
  assert.match(contract, /Practice is the independent-application section/);
  assert.match(contract, /6–8 Classwork questions and 8–12 Practice questions/);
  assert.match(contract, /instructional-scope ceiling always wins/i);
});
