import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync('scripts/deploy-assignment-v5-followup.sh', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('focused Assignment V5 deploy updates Hosting and only the Assignment AI callables', () => {
  // The self-test is the first thing an administrator reaches for when the AI
  // misbehaves, and per-question repair now has a server side, so both have to
  // ship with the surfaces that call them.
  assert.match(script, /firebase deploy --only hosting,functions:authorAssignmentWithAI,functions:repairAssignmentQuestionWithAI,functions:assignmentAiSelfTest,functions:hydrateAssignmentCcmr/);
  assert.doesNotMatch(script, /firestore:rules/);
  assert.doesNotMatch(script, /deploy-functions-in-groups/);
});

test('focused deploy proves discovery locally and survives a small deploy VM', () => {
  // "Failed to list functions" names neither the cause nor a remedy, so the
  // script proves the codebase loads on its own first and then tells the
  // operator what to do when the CLI still cannot see it.
  assert.match(script, /FUNCTIONS_DISCOVERY_TIMEOUT/);
  assert.match(script, /NO_PROXY/);
  assert.match(script, /verify-functions-discovery\.mjs/);
  const preflight = script.indexOf('verify-functions-discovery.mjs');
  const deploy = script.indexOf('firebase deploy --only hosting');
  assert.ok(preflight >= 0 && preflight < deploy, 'discovery must be proven before deploying');
  assert.match(script, /Failed to list functions for \$PROJECT/);
  assert.match(script, /npm install -g firebase-tools/);
});

test('focused deploy refuses stale or dirty source and checks the live surfaces', () => {
  assert.match(script, /git status --porcelain/);
  assert.match(script, /git rev-parse origin\/main/);
  assert.match(script, /functions:secrets:access OPENAI_API_KEY/);
  assert.match(script, /test:assignment-v5-followup/);
  assert.ok(script.includes('"https://$PROJECT.web.app"'));
  assert.match(script, /authorAssignmentWithAI/);
  assert.match(script, /repairAssignmentQuestionWithAI/);
  assert.match(script, /assignmentAiSelfTest/);
  assert.match(script, /hydrateAssignmentCcmr/);
});


test('focused deploy gate covers CCMR hydration across every Assignment V5 authoring route', () => {
  const command = packageJson.scripts?.['test:assignment-v5-followup'] || '';
  assert.match(command, /assignmentTransformationsFullModel\.test\.mjs/);
  assert.match(command, /assignmentCcmrAllRoutes\.test\.mjs/);
  assert.match(command, /assignmentCcmrBankHydration\.test\.mjs/);
  assert.match(command, /assignmentEvidencePolicy\.test\.mjs/);
  assert.match(command, /assignmentStudentProgressUi\.test\.mjs/);
});
