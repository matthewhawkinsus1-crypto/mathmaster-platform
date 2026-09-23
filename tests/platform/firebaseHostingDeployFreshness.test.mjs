import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deployScript = fs.readFileSync('scripts/deploy-hosting-resilient.sh', 'utf8');
const buildScript = fs.readFileSync('scripts/build-firebase-hosting.mjs', 'utf8');

test('Firebase Hosting deploy always builds the exact checked-out commit first', () => {
  assert.match(deployScript, /npm run build:firebase/);
  assert.match(deployScript, /git rev-parse --short=12 HEAD/);
  assert.match(deployScript, /dist\/mathmaster-build\.json/);
  assert.match(deployScript, /Refusing to deploy stale Hosting output/);
});

test('Firebase production build writes a public commit manifest after a successful Vite build', () => {
  assert.match(buildScript, /dist\/mathmaster-build\.json/);
  assert.match(buildScript, /gitSha/);
  assert.match(buildScript, /builtAt/);
  assert.match(buildScript, /executionMode/);
  assert.match(buildScript, /writeFileSync/);
});
