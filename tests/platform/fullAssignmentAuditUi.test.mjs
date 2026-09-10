import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/components/teacher/FullAssignmentAudit.jsx', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../../src/AssignmentQuestionEditor.jsx', import.meta.url), 'utf8');

test('elevated audit UI requires two distinct warnings, review, selections, and activity caution', () => {
  assert.match(source, /if \(!authorized\) return null/);
  assert.match(source, /Continue to Full Audit/);
  assert.match(source, /Full audit response review/);
  assert.match(source, /Select all proposed assignment repairs/);
  assert.match(source, /Apply Repairs to Shared Library Assignment/);
  assert.match(source, /Cancel and Review/);
  assert.match(source, /Students have already worked on this assignment/);
  assert.match(source, /Platform issue — question left unchanged/);
  assert.match(editor, /import FullAssignmentAudit/);
  assert.match(editor, /authorized=\{fullAuditAuthorized\}/);
});
