import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

test('HTTPS callable transport is source-controlled as public', () => {
  const options = source.indexOf('setGlobalOptions({ invoker: "public" });');
  const initialize = source.indexOf('initializeApp();');
  assert.ok(options >= 0);
  assert.ok(initialize > options);
});

test('submitPathResponse is inside the shared diagnostic boundary', () => {
  assert.match(source, /exports\.submitPathResponse = onCall\(\(request\) => withPathCallableDiagnostics\("submitPathResponse", async \(\) => \{/);
});
