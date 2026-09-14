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

test('deployment helper builds Firebase production mode and deploys Functions before rules and resilient Hosting', () => {
  assert.match(script, /VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction/);
  assert.match(script, /npm run build:firebase/);
  assert.match(script, /firebase deploy --only firestore:rules --project/);
  assert.match(script, /deploy-hosting-resilient\.sh/);
  assert.match(script, /deploy-functions-in-groups\.sh/);
  const functionsIndex = script.indexOf('deploy-functions-in-groups.sh');
  const rulesIndex = script.indexOf('firebase deploy --only firestore:rules --project');
  const hostingIndex = script.indexOf('deploy-hosting-resilient.sh');
  assert.ok(functionsIndex >= 0 && functionsIndex < rulesIndex && rulesIndex < hostingIndex,
    'release-managed Functions must deploy before rules, and Hosting must use the resilient uploader last');
});

test('deployment helper verifies Hosting and names the three safe production bank activations', () => {
  assert.match(script, /https:\/\/\$PROJECT\.web\.app/);
  assert.match(script, /HTTP_STATUS/);
  assert.match(script, /firebase functions:list/);
  assert.match(script, /Refresh course Path bank/);
  assert.match(script, /Refresh ASVAB release/);
  assert.match(script, /Refresh SAT \/ ACT \/ TSIA2 release/);
  assert.match(script, /Do NOT use Fresh installation unless the secure bank count is 0/);
});

console.log('v5PreproductionDeployHelper.test.mjs: all assertions passed');
