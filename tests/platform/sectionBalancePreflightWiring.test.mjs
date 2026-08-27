import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const preflight = fs.readFileSync(new URL('../../src/components/teacher/LessonPreflightModal.jsx', import.meta.url), 'utf8');
const contract = fs.readFileSync(new URL('../../src/platform/contract/authoringContract.js', import.meta.url), 'utf8');

test('teacher Assignment Review renders Section Balance & Rigor from canonical V5', () => {
  assert.match(preflight, /SectionBalanceRigorAudit/);
  assert.match(preflight, /assignmentV5=\{effectiveAssignmentV5\}/);
  assert.doesNotMatch(preflight, /lessonBundle=\{|effectiveBundle/);
});

test('V5 authoring contract distinguishes Classwork from independent Practice', () => {
  assert.match(contract, /Classwork versus Practice balance/);
  assert.match(contract, /Practice should normally be at least as broad as Classwork/);
  assert.match(contract, /6–8 substantial Classwork questions and 8–12 Practice questions/);
  assert.match(contract, /Instructional ceiling still wins/i);
  assert.match(contract, /Guided Notes belong primarily in Classwork/);
});

console.log('sectionBalancePreflightWiring.test.mjs: all assertions passed');
