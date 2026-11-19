import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { functionsBackendSource } from './helpers/functionsBackendSource.mjs';

test('rebuildPathCoverage explicitly declares public Cloud Run invocation', () => {
  const source = functionsBackendSource();
  assert.match(
    source,
    /exports\.rebuildPathCoverage\s*=\s*onCall\(\{[^}]*invoker:\s*["']public["'][^}]*\}/s,
  );
});
