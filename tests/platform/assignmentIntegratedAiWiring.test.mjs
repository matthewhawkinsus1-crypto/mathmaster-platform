import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = fs.readFileSync('functions/lib/config.js', 'utf8');
const functionsIndex = fs.readFileSync('functions/index.js', 'utf8');
const provider = fs.readFileSync('functions/lib/assignmentAi.js', 'utf8');
const service = fs.readFileSync('src/services/assignmentAiService.js', 'utf8');
const intake = fs.readFileSync('src/AssignmentIntake.jsx', 'utf8');
const preflight = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');

test('OpenAI credential is defined and read only in server Functions code', () => {
  assert.match(config, /defineSecret\("OPENAI_API_KEY"\)/);
  assert.match(config, /readOpenAiApiKey/);
  assert.match(functionsIndex, /secrets:\s*ASSIGNMENT_AI_SECRETS/);
  assert.match(functionsIndex, /readOpenAiApiKey\(\)/);
  assert.doesNotMatch(service, /OPENAI_API_KEY|api\.openai\.com/);
  assert.doesNotMatch(intake, /OPENAI_API_KEY|api\.openai\.com/);
});

test('integrated authoring callable requires teacher auth and usage reservation before provider call', () => {
  // Every integrated AI surface now shares one runner, so the auth and quota
  // guarantees are asserted once, where they are actually enforced.
  const start = functionsIndex.indexOf('async function runAssignmentAiRequest');
  const block = functionsIndex.slice(start, functionsIndex.indexOf('exports.authorAssignmentWithAI'));
  assert.ok(start >= 0);
  assert.match(block, /requireTeacher\(request\)/);
  assert.match(block, /reserveAssignmentAiUsage/);
  assert.match(block, /callOpenAiAssignmentAuthor/);
  assert.match(functionsIndex, /ASSIGNMENT_AI_MIN_INTERVAL_MS/);
  assert.match(functionsIndex, /ASSIGNMENT_AI_DAILY_LIMIT/);
  for (const callable of ['authorAssignmentWithAI', 'repairAssignmentQuestionWithAI']) {
    const site = functionsIndex.indexOf(`exports.${callable}`);
    assert.ok(site >= 0, `${callable} must exist`);
    assert.match(functionsIndex.slice(site, site + 600), /runAssignmentAiRequest\(request/);
  }
});

test('every AI failure is logged and audited, and infrastructure failures refund the daily allowance', () => {
  // The previous implementation returned early for AssignmentAiError and never
  // reached its own logger call, so no provider failure was recorded anywhere.
  const start = functionsIndex.indexOf('function translateAssignmentAiError');
  const block = functionsIndex.slice(start, start + 1400);
  const classified = block.indexOf('classified: true');
  const returned = block.indexOf('return new HttpsError');
  assert.ok(classified >= 0 && returned > classified, 'classified failures must be logged before returning');
  assert.match(functionsIndex, /ASSIGNMENT_AI_REFUNDABLE_CODES/);
  assert.match(functionsIndex, /async function refundAssignmentAiUsage/);
  assert.match(functionsIndex, /async function recordAssignmentAiFailure/);
  assert.match(functionsIndex, /outcome: "failure"/);
});

test('administrator self-test reports the provider cause without teacher or student content', () => {
  const start = functionsIndex.indexOf('exports.assignmentAiSelfTest');
  assert.ok(start >= 0);
  const block = functionsIndex.slice(start, start + 2600);
  assert.match(block, /requireRootAdmin\(request\)/);
  assert.match(block, /probeAssignmentAiProvider/);
  assert.match(block, /stage: "secret"/);
  assert.match(block, /diagnostics/);
  assert.doesNotMatch(block, /prompt/);
  assert.match(provider, /async function probeAssignmentAiProvider/);
  assert.match(service, /runAssignmentAiSelfTest/);
});

test('server records provider usage without storing the authored prompt or API key', () => {
  // Scope this to the audit record itself. Widening the window pulls in the
  // provider call, whose apiKey argument is correct and must not fail the test.
  const success = functionsIndex.indexOf('outcome: "success"');
  assert.ok(success >= 0, 'a success audit record must exist');
  const start = functionsIndex.lastIndexOf('.add({', success);
  const block = functionsIndex.slice(start, functionsIndex.indexOf('});', success));
  assert.match(block, /teacherUid/);
  assert.match(block, /model:/);
  assert.match(block, /usage:/);
  assert.match(block, /promptCharacters:/);
  assert.doesNotMatch(block, /prompt:\s*prompt|apiKey/);

  // The failure record carries diagnostics only. Prompts contain full lesson
  // content and must never be persisted, on success or on failure.
  const failureStart = functionsIndex.indexOf('async function recordAssignmentAiFailure');
  const failureBlock = functionsIndex.slice(failureStart, failureStart + 700);
  assert.doesNotMatch(failureBlock, /prompt:\s*prompt|apiKey/);
});

test('creator makes integrated build primary while preserving outside-AI fallback', () => {
  assert.match(intake, /Build Assignment in MathMaster/);
  assert.match(intake, /handleBuildInsideMathMaster/);
  assert.match(intake, /buildAssignmentWithAI\(request\)/);
  assert.match(intake, /acceptJson\(built\.assignmentJson, 'Built in MathMaster'\)/);
  assert.match(intake, /Copy Complete AI Build Request/);
  assert.match(intake, /Built-in AI could not finish/);
  // The real provider reason must reach the teacher; the old build discarded it
  // and showed one generic sentence for every possible failure.
  assert.match(intake, /assignmentAiFailureMessage\(error\)/);
  assert.match(intake, /assignmentAiDiagnostics\(error\)/);
});

test('integrated and external AI results share the same MathMaster accept/validation path', () => {
  assert.match(intake, /const acceptJson = async/);
  assert.match(intake, /await onJsonReady\(\{ text, sourceName \}\)/);
  assert.match(intake, /await acceptJson\(built\.assignmentJson/);
  assert.match(intake, /await acceptJson\(text, 'Pasted from clipboard'\)/);
});

test('existing-assignment Honors review has embedded, no-AI, and external-AI repair paths', () => {
  assert.match(preflight, /Build Honors Depth with MathMaster AI/);
  assert.match(preflight, /buildHonorsDepthWithAi/);
  assert.match(preflight, /buildAssignmentWithAI\(request\)/);
  assert.match(preflight, /applyHonorsDepthAiSections/);
  assert.match(preflight, /buildAssignmentV5PreflightModel\(guardedCandidate\)/);
  assert.match(preflight, /Add built-in Honors extension \(no AI\)/);
  assert.match(preflight, /Copy outside-AI repair request/);
  assert.match(preflight, /Paste AI Honors result/);
  assert.match(preflight, /Upload Honors JSON/);
  assert.match(preflight, /Audited CCMR Practice will be sourced from Fidelity V2\.1 at publish/);
});

test('provider boundary uses current Responses API and Structured Outputs', () => {
  assert.match(provider, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(provider, /type: "json_schema"/);
  assert.match(provider, /store: false/);
});

console.log('assignmentIntegratedAiWiring.test.mjs: all assertions passed');


test('integrated AI failures expose actionable configuration messages instead of hiding every error', () => {
  assert.match(functionsIndex, /OPENAI_API_KEY/);
  assert.match(functionsIndex, /not configured on this Firebase deployment/);
  assert.match(service, /assignmentAiFailureMessage/);
  assert.match(preflight, /assignmentAiFailureMessage\(error\)/);
});
