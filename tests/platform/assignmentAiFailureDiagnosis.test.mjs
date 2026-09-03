import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  AssignmentAiError,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  buildOpenAiAssignmentRequest,
  extractRefusalText,
  parseFirstJsonObject,
  probeAssignmentAiProvider,
  providerDiagnostics,
  questionResponseSchema,
  supportsReasoningEffort,
  callOpenAiAssignmentAuthor,
} = require('../../functions/lib/assignmentAi.js');

const validAssignment = {
  schemaVersion: 5,
  assignment: { title: 'Linear Equations', courseId: 'algebra1' },
  sections: [{ id: 'practice', role: 'practice', questions: [{ type: 'multiAnswer', prompt: 'Solve.' }] }],
};

const respondWith = (status, body) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return JSON.stringify(body); },
});

const failureFrom = async (status, body, options = {}) => {
  try {
    await callOpenAiAssignmentAuthor({
      apiKey: 'test-key',
      prompt: options.prompt || 'build a lesson',
      mode: options.mode,
      fetchImpl: respondWith(status, body),
    });
  } catch (error) {
    return error;
  }
  return null;
};

// Each of these used to surface to the teacher as the same sentence, and none of
// them were written to Cloud Logging. The point of this suite is that a failure
// now names its own cause, because that is the only thing that makes the feature
// supportable in production.
test('a response truncated by the output budget is reported as a budget problem', async () => {
  const error = await failureFrom(200, {
    status: 'incomplete',
    incomplete_details: { reason: 'max_output_tokens' },
    output: [],
    usage: { output_tokens: 30000, output_tokens_details: { reasoning_tokens: 28500 } },
  });
  assert.ok(error instanceof AssignmentAiError);
  assert.equal(error.code, 'resource-exhausted');
  assert.match(error.message, /output budget/i);
  assert.match(error.message, /28,500/);
  assert.equal(error.details.incompleteReason, 'max_output_tokens');
});

test('a model refusal is reported as a refusal, not as empty content', async () => {
  const error = await failureFrom(200, {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'I will not do that.' }] }],
  });
  assert.equal(error.code, 'failed-precondition');
  assert.match(error.message, /declined this request/i);
  assert.match(error.message, /I will not do that/);
});

test('quota exhaustion, a rejected credential and an unavailable model stay distinguishable', async () => {
  const quota = await failureFrom(429, { error: { code: 'insufficient_quota', message: 'no credit' } });
  assert.equal(quota.code, 'resource-exhausted');
  assert.match(quota.message, /billing credit/i);

  const credential = await failureFrom(401, { error: { message: 'Incorrect API key' } });
  assert.equal(credential.code, 'failed-precondition');
  assert.match(credential.message, /OPENAI_API_KEY/);

  const model = await failureFrom(404, { error: { message: 'The model `gpt-5` does not exist or you do not have access to it.' } });
  assert.equal(model.code, 'failed-precondition');
  assert.match(model.message, /does not serve the configured model/i);
});

test('every classified failure carries diagnostics that name no prompt or assignment content', async () => {
  const error = await failureFrom(429, { error: { code: 'insufficient_quota', message: 'no credit' } });
  const keys = Object.keys(error.details);
  assert.ok(keys.includes('requestedModel'));
  assert.ok(keys.includes('responseStatus'));
  assert.ok(keys.includes('elapsedMs'));
  const serialized = JSON.stringify(error.details);
  assert.doesNotMatch(serialized, /build a lesson/);
  assert.doesNotMatch(serialized, /test-key/);
});

test('a fenced or slightly prefixed JSON response is salvaged instead of discarded', async () => {
  const result = await callOpenAiAssignmentAuthor({
    apiKey: 'test-key',
    prompt: 'build a lesson',
    fetchImpl: respondWith(200, { output_text: `\`\`\`json\n${JSON.stringify(validAssignment)}\n\`\`\`` }),
  });
  assert.equal(JSON.parse(result.assignmentJson).schemaVersion, 5);

  assert.equal(parseFirstJsonObject('Here you go: {"a":1} — hope that helps').a, 1);
  assert.equal(parseFirstJsonObject('not json at all'), null);
  assert.equal(parseFirstJsonObject(''), null);
});

test('question repair mode returns one question and rejects a whole-assignment answer', async () => {
  const result = await callOpenAiAssignmentAuthor({
    apiKey: 'test-key',
    prompt: 'repair this question',
    mode: 'question',
    fetchImpl: respondWith(200, {
      output_text: JSON.stringify({ replacementQuestion: { type: 'multiAnswer', prompt: 'Solve 2x = 10.' } }),
    }),
  });
  assert.equal(JSON.parse(result.questionJson).type, 'multiAnswer');

  const wrong = await failureFrom(200, { output_text: JSON.stringify(validAssignment) }, { mode: 'question' });
  assert.equal(wrong.code, 'failed-precondition');
  assert.match(wrong.message, /one complete replacement question/i);

  const schema = questionResponseSchema();
  assert.deepEqual(schema.required, ['replacementQuestion']);
});

test('reasoning effort is sent only to models that accept it', () => {
  assert.equal(supportsReasoningEffort('gpt-5'), true);
  assert.equal(supportsReasoningEffort('o3-mini'), true);
  assert.equal(supportsReasoningEffort('gpt-4.1'), false);

  const reasoning = buildOpenAiAssignmentRequest({ prompt: 'x', model: 'gpt-5', reasoningEffort: 'low' });
  assert.deepEqual(reasoning.reasoning, { effort: 'low' });

  // Sending `reasoning` to a non-reasoning model is a hard 400, so an
  // administrator who repoints the model must not break every build.
  const plain = buildOpenAiAssignmentRequest({ prompt: 'x', model: 'gpt-4.1' });
  assert.equal(plain.reasoning, undefined);
});

test('the provider timeout leaves the 300s Cloud Function budget room to report the failure', () => {
  assert.ok(DEFAULT_PROVIDER_TIMEOUT_MS < 300000);
  assert.ok(DEFAULT_PROVIDER_TIMEOUT_MS >= 240000);
});

test('the administrator probe is small, sends no lesson content, and reports the served model', async () => {
  const probe = await probeAssignmentAiProvider({
    apiKey: 'test-key',
    model: 'gpt-5',
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body);
      assert.ok(body.max_output_tokens <= 64, 'the probe must not spend an assignment-sized budget');
      assert.doesNotMatch(JSON.stringify(body), /Assignment V5|TEKS/);
      return { ok: true, status: 200, async text() { return JSON.stringify({ id: 'resp_1', model: 'gpt-5', status: 'completed', output_text: 'ready' }); } };
    },
  });
  assert.equal(probe.ok, true);
  assert.equal(probe.reply, 'ready');
  assert.equal(probe.diagnostics.servedModel, 'gpt-5');
});

test('refusal and diagnostics helpers behave on empty input', () => {
  assert.equal(extractRefusalText({}), '');
  assert.equal(extractRefusalText({ output: [{ content: [{ type: 'output_text', text: 'hi' }] }] }), '');
  const diagnostics = providerDiagnostics({}, { model: 'gpt-5', mode: 'assignment' });
  assert.equal(diagnostics.requestedModel, 'gpt-5');
  assert.equal(diagnostics.servedModel, null);
  assert.equal(diagnostics.reasoningTokens, 0);
});
