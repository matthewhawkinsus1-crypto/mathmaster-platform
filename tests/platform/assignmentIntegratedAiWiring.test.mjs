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
  const start = functionsIndex.indexOf('exports.authorAssignmentWithAI');
  const block = functionsIndex.slice(start, start + 3500);
  assert.ok(start >= 0);
  assert.match(block, /requireTeacher\(request\)/);
  assert.match(block, /reserveAssignmentAiUsage/);
  assert.match(block, /callOpenAiAssignmentAuthor/);
  assert.match(functionsIndex, /ASSIGNMENT_AI_MIN_INTERVAL_MS/);
  assert.match(functionsIndex, /ASSIGNMENT_AI_DAILY_LIMIT/);
});

test('server records provider usage without storing the authored prompt or API key', () => {
  const start = functionsIndex.indexOf('collection("assignmentAiAudit")');
  const block = functionsIndex.slice(start, start + 1300);
  assert.ok(start >= 0);
  assert.match(block, /teacherUid/);
  assert.match(block, /model:/);
  assert.match(block, /usage:/);
  assert.match(block, /promptCharacters:/);
  assert.doesNotMatch(block, /prompt:\s*prompt|apiKey/);
});

test('creator makes integrated build primary while preserving outside-AI fallback', () => {
  assert.match(intake, /Build Assignment in MathMaster/);
  assert.match(intake, /handleBuildInsideMathMaster/);
  assert.match(intake, /buildAssignmentWithAI\(request\)/);
  assert.match(intake, /acceptJson\(built\.assignmentJson, 'Built in MathMaster'\)/);
  assert.match(intake, /Copy Complete AI Build Request/);
  assert.match(intake, /Built-in AI is unavailable right now/);
});

test('integrated and external AI results share the same MathMaster accept/validation path', () => {
  assert.match(intake, /const acceptJson = async/);
  assert.match(intake, /await onJsonReady\(\{ text, sourceName \}\)/);
  assert.match(intake, /await acceptJson\(built\.assignmentJson/);
  assert.match(intake, /await acceptJson\(text, 'Pasted from clipboard'\)/);
});

test('existing-assignment Honors review uses the same embedded AI instead of copy-paste', () => {
  assert.match(preflight, /Build Honors Depth with MathMaster AI/);
  assert.match(preflight, /buildHonorsDepthWithAi/);
  assert.match(preflight, /buildAssignmentWithAI\(request\)/);
  assert.match(preflight, /applyHonorsDepthAiSections/);
  assert.match(preflight, /buildAssignmentV5PreflightModel\(guardedCandidate\)/);
  assert.match(preflight, /Audited CCMR Practice will be sourced from Fidelity V2\.1 at publish/);
});

test('provider boundary uses current Responses API and Structured Outputs', () => {
  assert.match(provider, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(provider, /type: "json_schema"/);
  assert.match(provider, /store: false/);
});

console.log('assignmentIntegratedAiWiring.test.mjs: all assertions passed');
