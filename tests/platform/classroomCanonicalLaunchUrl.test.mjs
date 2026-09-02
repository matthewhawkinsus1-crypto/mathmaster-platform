import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('production Classroom launches are pinned to Firebase Hosting', () => {
  const config = read('functions/lib/config.js');
  const server = read('functions/index.js');

  assert.match(config, /CANONICAL_STUDENT_APP_BASE_URL = "https:\/\/mathmaster-aleks\.web\.app"/);
  assert.match(config, /function readStudentAppBaseUrl\(\)/);
  assert.match(config, /FUNCTIONS_EMULATOR === "true"/);
  assert.match(config, /return CANONICAL_STUDENT_APP_BASE_URL/);

  const launchStart = server.indexOf('exports.resolveLaunchToken = onRequest');
  const launchEnd = server.indexOf('exports.getAssignmentByLaunchId', launchStart);
  const launch = server.slice(launchStart, launchEnd);

  assert.match(launch, /const appBaseUrl = readStudentAppBaseUrl\(\)/);
  assert.doesNotMatch(launch, /readPublicEnv\("APP_BASE_URL"/);
});

test('Google OAuth returns to the same canonical Firebase Hosting app', () => {
  const server = read('functions/index.js');
  const start = server.indexOf('exports.oauthCallback = onRequest');
  const end = server.indexOf('exports.getClassroomConnectionStatus', start);
  const callback = server.slice(start, end);

  assert.match(callback, /const appBaseUrl = readStudentAppBaseUrl\(\)/);
  assert.doesNotMatch(callback, /readPublicEnv\("APP_BASE_URL"/);
});

test('Classroom diagnostics expose and flag a stale configured app host', () => {
  const server = read('functions/index.js');
  assert.match(server, /checks\.configuredAppBaseUrl = readPublicEnv\("APP_BASE_URL"\)/);
  assert.match(server, /checks\.canonicalAppBaseUrl = CANONICAL_STUDENT_APP_BASE_URL/);
  assert.match(server, /Student launches are being forced to/);
});

test('deployment templates name Firebase Hosting as the public app base', () => {
  const envExample = read('functions/.env.example');
  const projectExample = read('functions/env.mathmaster-aleks.example');

  assert.match(envExample, /APP_BASE_URL=https:\/\/mathmaster-aleks\.web\.app/);
  assert.match(projectExample, /APP_BASE_URL=https:\/\/mathmaster-aleks\.web\.app/);
  assert.doesNotMatch(envExample, /vercel\.app/i);
  assert.doesNotMatch(projectExample, /vercel\.app/i);
});
