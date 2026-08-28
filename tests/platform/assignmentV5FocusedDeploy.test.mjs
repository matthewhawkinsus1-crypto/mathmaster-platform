import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync('scripts/deploy-assignment-v5-followup.sh', 'utf8');

test('focused Assignment V5 deploy updates Hosting and only the two Assignment V5 callables', () => {
  assert.match(script, /firebase deploy --only hosting,functions:authorAssignmentWithAI,functions:hydrateAssignmentCcmr/);
  assert.doesNotMatch(script, /firestore:rules/);
  assert.doesNotMatch(script, /deploy-functions-in-groups/);
});

test('focused deploy refuses stale or dirty source and checks the live surfaces', () => {
  assert.match(script, /git status --porcelain/);
  assert.match(script, /git rev-parse origin\/main/);
  assert.match(script, /functions:secrets:access OPENAI_API_KEY/);
  assert.match(script, /test:assignment-v5-followup/);
  assert.ok(script.includes('"https://$PROJECT.web.app"'));
  assert.match(script, /authorAssignmentWithAI/);
  assert.match(script, /hydrateAssignmentCcmr/);
});
