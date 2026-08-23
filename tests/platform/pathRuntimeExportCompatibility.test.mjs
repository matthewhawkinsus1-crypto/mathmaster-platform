import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

test('every mathPath method referenced by Cloud Functions exists in the deployed runtime module', () => {
  const refs = [...new Set([...functionsSource.matchAll(/mathPath\.([A-Za-z0-9_]+)/g)].map((match) => match[1]))].sort();
  const missing = refs.filter((name) => typeof mathPath[name] !== 'function');
  assert.deepEqual(missing, [], `Missing mathPath runtime exports: ${missing.join(', ')}`);
});
