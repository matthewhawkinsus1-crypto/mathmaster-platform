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

test('V5 deployment helper builds Firebase production mode and deploys server before web', () => {
  assert.match(script, /VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction/);
  assert.match(script, /npm run build:firebase/);
  assert.match(script, /deploy-functions-in-groups\.sh/);
  assert.match(script, /firebase deploy --only firestore:rules/);
  assert.match(script, /firebase deploy --only hosting/);
  assert.ok(
    script.indexOf('deploy-functions-in-groups.sh') < script.indexOf('firebase deploy --only hosting'),
    'Functions must deploy before Hosting so the new client never leads the server runtime.',
  );
});

test('V5 deployment helper verifies live Hosting after deployment', () => {
  assert.match(script, /https:\/\/\$PROJECT\.web\.app/);
  assert.match(script, /HTTP_STATUS/);
  assert.match(script, /firebase functions:list/);
  assert.match(script, /Refresh course \+ ASVAB built-ins/);
  assert.match(script, /Refresh released SAT \/ ACT \/ TSIA2/);
  assert.match(script, /Initialize built-in bank \(fresh install\)/);
});

console.log('v5PreproductionDeployHelper.test.mjs: all assertions passed');
