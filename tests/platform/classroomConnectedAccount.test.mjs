// The Classroom connection names the Google account it belongs to: the
// connection status returns the stored account, and the Classroom screen
// shows it beside "Connected". Storing it on connect is proven against
// Firestore in tests/integration/oauthStateSingleUse.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const lib = executableSource(readFileSync('functions/lib/classroom.js', 'utf8'));
const screen = executableSource(readFileSync('src/ClassroomManagerV2.jsx', 'utf8'));

test('the connection status returns the stored Google account email', () => {
  const start = lib.indexOf('async function getConnectionHealth(');
  const health = lib.slice(start, lib.indexOf('\nasync function ', start + 10));
  assert.match(health, /const googleAccountEmail = integration\.exists \? integration\.data\(\)\?\.googleAccountEmail \|\| null : null;/);
  assert.match(health, /connected: true,[\s\S]{0,120}googleAccountEmail,/, 'a working connection names its account');
});

test('the Classroom screen shows the connected account beside "Connected"', () => {
  assert.match(screen, /\{connection\.connected \? 'Connected' : 'Not connected'\}\s*\{connection\.connected && connection\.googleAccountEmail \? ` as \$\{connection\.googleAccountEmail\}` : ''\}/);
});
