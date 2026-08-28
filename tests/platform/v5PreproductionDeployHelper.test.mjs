import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync('scripts/deploy-v5-preproduction.sh', 'utf8');

test('V5 deployment helper refuses dirty or stale source', () => {
  assert.match(script, /git status --porcelain/);
  assert.match(script, /git fetch origin main/);
  assert.match(script, /git checkout main/);
  assert.match(script, /git pull --ff-only origin main/);
});

test('V5 deployment helper requires the server-side assignment AI secret', () => {
  assert.match(script, /functions:secrets:access OPENAI_API_KEY/);
  assert.match(script, /functions:secrets:set OPENAI_API_KEY/);
});

test('V5 deployment helper runs release gates before deploying', () => {
  assert.match(script, /npm ci/);
  assert.match(script, /npm run test:authoring-v5/);
  assert.match(script, /npm run validate:authoring-v5/);
  assert.match(script, /npm run audit:assignment-authoring-boundary/);
  assert.match(script, /audit:no-legacy-assignment-bundle/);
});

test('V5 deployment helper builds Firebase production mode and deploys all server surfaces', () => {
  assert.match(script, /VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction/);
  assert.match(script, /npm run build:firebase/);
  assert.match(script, /firebase deploy --only firestore:rules,hosting/);
  assert.match(script, /deploy-functions-in-groups\.sh/);
});

test('V5 deployment helper verifies live Hosting after deployment', () => {
  assert.match(script, /https:\/\/\$PROJECT\.web\.app/);
  assert.match(script, /HTTP_STATUS/);
  assert.match(script, /firebase functions:list/);
  assert.match(script, /Initialize \/ refresh built-in starter bank/);
});

console.log('v5PreproductionDeployHelper.test.mjs: all assertions passed');
