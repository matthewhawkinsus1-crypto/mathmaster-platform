import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Full Assignment Audit offers corrected content release creation', async () => {
  const source = await readFile('src/components/teacher/FullAssignmentAudit.jsx', 'utf8');
  assert.match(source, /Create Corrected Content V/);
  assert.match(source, /createAssignmentContentVersion/);
  assert.match(source, /Existing assigned copies were not changed/);
});
