/*
 * ONE QUESTION RUNTIME, FIVE CAPABILITY POLICIES.
 *
 * The shared Rich Question Runtime renders the same question on Practice,
 * Review, a secure Test, Corrections and a secure Retest. These tests pin what
 * each mode is allowed to do for the student — the security difference between
 * a Test and Corrections is capability, never a different renderer — and that
 * the server strips Category B material from a secure payload by key, at any
 * depth, while leaving the response tool itself alone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSISTANCE_CAPABILITIES,
  ASSISTANCE_PAYLOAD_KEYS,
  QUESTION_RUNTIME_MODES,
  RESPONSE_CAPABILITIES,
  SOLUTION_PATH_PAYLOAD_KEYS,
  assistanceKeysIn,
  engineActivityPolicyForMode,
  isSecureRuntimeMode,
  resolveQuestionRuntimePolicy,
  runtimeAllows,
  runtimeModeForCycleStage,
  secureShellRuntimeMode,
  stripAssistanceForMode,
} from '../../functions/shared/questionRuntimePolicy.mjs';

const SECURE = [QUESTION_RUNTIME_MODES.SECURE_TEST, QUESTION_RUNTIME_MODES.SECURE_RETEST];
const ALL = Object.values(QUESTION_RUNTIME_MODES);

test('every mode keeps every response tool: the mathematical interface never disappears', () => {
  ALL.forEach((mode) => {
    RESPONSE_CAPABILITIES.forEach((capability) => {
      assert.equal(runtimeAllows(mode, capability), true, `${mode} must keep ${capability}`);
    });
  });
});

test('secure Test and secure Retest switch off every assistance capability', () => {
  SECURE.forEach((mode) => {
    assert.equal(isSecureRuntimeMode(mode), true);
    ASSISTANCE_CAPABILITIES.forEach((capability) => {
      assert.equal(runtimeAllows(mode, capability), false, `${mode} must not allow ${capability}`);
    });
    const policy = resolveQuestionRuntimePolicy(mode);
    assert.equal(policy.attempts, 1);
    assert.equal(policy.verdictRelease, 'teacherRelease');
    assert.equal(policy.gradeImpact, 'recorded');
  });
});

test('Retest has the same capability policy as the Test', () => {
  assert.deepEqual(
    resolveQuestionRuntimePolicy(QUESTION_RUNTIME_MODES.SECURE_RETEST).capabilities,
    resolveQuestionRuntimePolicy(QUESTION_RUNTIME_MODES.SECURE_TEST).capabilities,
  );
  assert.equal(runtimeModeForCycleStage('retest'), QUESTION_RUNTIME_MODES.SECURE_RETEST);
  assert.equal(runtimeModeForCycleStage('test'), QUESTION_RUNTIME_MODES.SECURE_TEST);
  assert.equal(runtimeModeForCycleStage(undefined), QUESTION_RUNTIME_MODES.SECURE_TEST);
});

test('Corrections is instructional: hints, an immediate verdict and three tries — and no grade impact', () => {
  const policy = resolveQuestionRuntimePolicy(QUESTION_RUNTIME_MODES.CORRECTIONS);
  assert.equal(policy.secure, false);
  assert.equal(policy.capabilities.hints, true);
  assert.equal(policy.capabilities.immediateFeedback, true);
  assert.equal(policy.capabilities.answerCheckBeforeSubmit, true);
  assert.equal(policy.attempts, 3);
  assert.equal(policy.gradeImpact, 'none');
  // Help is the point, but the parallel item is never answered FOR them.
  assert.equal(policy.capabilities.solutionReveal, false);
  assert.equal(policy.capabilities.autoSolve, false);
});

test('a payload that does not say which mode it is gets the Secure Test policy, never practice', () => {
  [undefined, null, '', 'practise', 'assessment', 'secure'].forEach((value) => {
    assert.equal(resolveQuestionRuntimePolicy(value).mode, QUESTION_RUNTIME_MODES.SECURE_TEST, String(value));
    assert.equal(isSecureRuntimeMode(value), true, String(value));
  });
});

test('a mode is expressed in the activity-policy terms QuestionEngine already enforces', () => {
  const secure = engineActivityPolicyForMode(QUESTION_RUNTIME_MODES.SECURE_TEST);
  // feedback !== 'immediate' is what hides every verdict, colour and solution
  // review in the engine; hintsAllowed reaches every tool's hint panel and
  // self-check through ToolRuntimeContext; allowReplacement is "Request New
  // Question".
  assert.equal(secure.feedback, 'teacherRelease');
  assert.equal(secure.hintsAllowed, false);
  assert.equal(secure.remediationAllowed, false);
  assert.equal(secure.allowReplacement, false);
  assert.equal(secure.attempts, 1);
  assert.equal(secure.role, 'test');

  const corrections = engineActivityPolicyForMode(QUESTION_RUNTIME_MODES.CORRECTIONS);
  assert.equal(corrections.feedback, 'immediate');
  assert.equal(corrections.hintsAllowed, true);
  assert.equal(corrections.attempts, 3);
  assert.equal(corrections.role, 'corrections');
});

test('a secure payload loses assistance and solution-path keys at every depth — and keeps the tool', () => {
  const payload = {
    pathToolId: 'systemsWorkspace',
    responseShape: 'systemsWorkspace',
    tool: {
      prompt: 'Classify the system.',
      mode: 'linear',
      system: { line1: { m: 2, b: 1 }, line2: { m: 2, b: 3 } },
      hint: 'Compare the two slopes.',
      operationTags: ['subtract', 'divide'],
      solutionDepth: 2,
      graph: { xMin: -5, xMax: 5, panels: [{ workedExample: 'nested', label: 'kept' }] },
    },
  };
  const secure = stripAssistanceForMode(payload, QUESTION_RUNTIME_MODES.SECURE_TEST);
  assert.deepEqual(assistanceKeysIn(secure), []);
  assert.equal(secure.tool.system.line1.m, 2, 'the mathematics is the question and stays');
  assert.equal(secure.tool.graph.panels[0].label, 'kept');
  assert.equal(secure.pathToolId, 'systemsWorkspace');
  // The original is untouched (the server strips a copy).
  assert.equal(payload.tool.hint, 'Compare the two slopes.');

  const corrections = stripAssistanceForMode(payload, QUESTION_RUNTIME_MODES.CORRECTIONS);
  assert.equal(corrections.tool.hint, 'Compare the two slopes.', 'Corrections keeps the hint');
});

test('the assistance key lists are the ones the strip uses (break one, the test above goes red)', () => {
  ['hint', 'hints', 'workedExample', 'solutionSteps'].forEach((key) => assert.ok(ASSISTANCE_PAYLOAD_KEYS.includes(key), key));
  ['operationTags', 'complexityTags', 'solutionDepth', 'solutionMethod'].forEach((key) => assert.ok(SOLUTION_PATH_PAYLOAD_KEYS.includes(key), key));
});

test('the secure exam shell renders a secure mode only — and before the first item arrives', () => {
  // The container renders the player while the first item is still being
  // issued: no item must not crash, and must not mean practice.
  assert.equal(secureShellRuntimeMode(null), QUESTION_RUNTIME_MODES.SECURE_TEST);
  assert.equal(secureShellRuntimeMode(undefined), QUESTION_RUNTIME_MODES.SECURE_TEST);
  assert.equal(secureShellRuntimeMode({}), QUESTION_RUNTIME_MODES.SECURE_TEST);
  assert.equal(secureShellRuntimeMode({ runtimeMode: 'secureRetest' }), QUESTION_RUNTIME_MODES.SECURE_RETEST);
  assert.equal(secureShellRuntimeMode({ runtimeMode: 'secureTest' }), QUESTION_RUNTIME_MODES.SECURE_TEST);
  // A payload naming an instructional mode is still shown as a Secure Test.
  ['practice', 'review', 'corrections', 'somethingElse'].forEach((runtimeMode) => {
    assert.equal(secureShellRuntimeMode({ runtimeMode }), QUESTION_RUNTIME_MODES.SECURE_TEST, runtimeMode);
  });
});
