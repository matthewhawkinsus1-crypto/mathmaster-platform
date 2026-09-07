import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/components/teacher/IncompleteAssignmentRepairCenter.jsx', import.meta.url), 'utf8');

test('Repair Center exposes assignment, section, and question review scopes', () => {
  assert.match(source, /Review scope/i);
  assert.match(source, /value=['"]assignment['"]/);
  assert.match(source, /value=['"]section['"]/);
  assert.match(source, /value=['"]question['"]/);
});

test('scope target is derived from the current assignment/section/question rather than typed freehand', () => {
  assert.match(source, /reviewScope/);
  assert.match(source, /focusedRow\?\.sectionId|focusedRow\.sectionId/);
  assert.match(source, /actualFocusedQuestionId/);
  assert.match(source, /scope:\s*reviewScope/);
});
