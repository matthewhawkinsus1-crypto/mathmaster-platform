import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('rebuildPathCoverage explicitly declares public Cloud Run invocation', () => {
  const source = fs.readFileSync('functions/index.js', 'utf8');
  assert.match(
    source,
    /exports\.rebuildPathCoverage\s*=\s*onCall\(\{[^}]*invoker:\s*["']public["'][^}]*\}/s,
  );
});
