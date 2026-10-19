// A student never awarded Class Points has no account document. Their wallet
// must read as an empty wallet, never "Temporarily unavailable" (student push E).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accountReadRefusedAsMissing, emptyClassPointAccount } from '../../src/platform/classPointsClient.js';
import { region } from './helpers/sourceContract.mjs';

const client = readFileSync(new URL('../../src/platform/classPointsClient.js', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

test('a refusal on the student\'s own account is a missing account, anything else an error', () => {
  assert.equal(accountReadRefusedAsMissing({ code: 'permission-denied' }), true);
  assert.equal(accountReadRefusedAsMissing({ code: 'firestore/permission-denied' }), true);
  assert.equal(accountReadRefusedAsMissing({ code: 'unavailable' }), false);
  assert.equal(accountReadRefusedAsMissing(null), false);
  assert.equal(emptyClassPointAccount().balance, 0);
});

test('the account listener turns that refusal into an empty wallet, and only that', () => {
  const listener = region(client, 'const unsubAccount = onSnapshot(', 'const unsubHistory', 'the account listener');
  assert.match(listener, /if \(accountReadRefusedAsMissing\(error\)\) onAccount\(emptyClassPointAccount\(\)\);\s*else onError\?\.\(error\);/);
});

test('the rules let a student read their own missing account by the id that names them', () => {
  const block = region(rules, 'match /classPointAccounts/{accountId}', 'allow create, update, delete: if false;', 'the account rules');
  assert.match(block, /resource == null\s*\?\s*missingClassPointAccountIsOwn\(accountId\)/);
  const fn = region(rules, 'function missingClassPointAccountIsOwn', 'function authorizedTeacher', 'the missing-account rule');
  // The length prefix and the id both have to match the caller's token.
  assert.match(fn, /accountId\.split\(':'\)\[0\] == string\(request\.auth\.token\.get\('studentId', ''\)\.size\(\)\)/);
  assert.match(fn, /accountId\.split\(':'\)\[1\] == request\.auth\.token\.get\('studentId', ''\)/);
});
