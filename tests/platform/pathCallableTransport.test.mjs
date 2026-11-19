import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { functionsBackendSource } from './helpers/functionsBackendSource.mjs';

const source = functionsBackendSource();

test('HTTPS callable transport is source-controlled as public', () => {
  // The one global-options statement must keep the public invoker (it also
  // carries the deploy provenance labels), and it must run before the app and
  // every function is set up.
  const statement = source.match(/^setGlobalOptions\(\{[^;]*\}\);$/m);
  assert.ok(statement, 'functions/index.js sets global options');
  assert.match(statement[0], /\binvoker:\s*"public"/);
  assert.equal(source.split(/^setGlobalOptions\(/m).length, 2, 'exactly one global-options call');
  const initialize = source.indexOf('initializeApp();');
  assert.ok(initialize > statement.index);
});

test('submitPathResponse is inside the shared diagnostic boundary', () => {
  assert.match(source, /exports\.submitPathResponse = onCall\(\(request\) => withPathCallableDiagnostics\("submitPathResponse", async \(\) => \{/);
});
