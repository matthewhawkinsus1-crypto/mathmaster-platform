import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM_OWNED_FIELDS as CLIENT_FIELDS } from '../../src/platform/contract/platformOwnedFields.js';
import { PLATFORM_OWNED_FIELDS as SERVER_FIELDS } from '../../functions/shared/platformOwnedFields.mjs';

// functions/ deploys as its own package (firebase.json source: "functions"
// only) and cannot import src/, so the protected-field contract is
// necessarily duplicated for server-side question repairs. This test is the
// guard against drift: if one list changes without the other, a server
// repair could silently stop protecting (or start over-protecting) a field a
// teacher-supplied replacement question must never set.
test('the server-side protected-field list matches the client contract exactly', () => {
  assert.deepEqual([...SERVER_FIELDS].sort(), [...CLIENT_FIELDS].sort());
});
