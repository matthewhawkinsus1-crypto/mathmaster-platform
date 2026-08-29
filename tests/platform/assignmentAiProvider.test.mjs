import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  AssignmentAiError,
  MAX_PROMPT_CHARS,
  assignmentResponseSchema,
  buildOpenAiAssignmentRequest,
  extractResponseText,
  callOpenAiAssignmentAuthor,
} = require('../../functions/lib/assignmentAi.js');

const validAssignment = {
  schemaVersion: 5,
  assignment: { title: 'Linear Equations', courseId: 'algebra1' },
  sections: [{ id: 'practice', role: 'practice', title: 'Practice', questions: [{ type: 'multiAnswer', prompt: 'Solve.' }] }],
};

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return JSON.stringify(body); },
});

test('provider request uses Responses API structured JSON output and does not store the response', () => {
  const body = buildOpenAiAssignmentRequest({ prompt: '# MathMaster assignment request', model: 'gpt-5' });
  assert.equal(body.model, 'gpt-5');
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.name, 'mathmaster_assignment_v5');
  assert.equal(body.text.format.schema.properties.schemaVersion.enum[0], 5);
  assert.ok(body.max_output_tokens >= 10000);
  assert.match(body.input[0].content[0].text, /Return only one complete Assignment V5 JSON object/);
});

test('top-level response schema requires current assignment identity and sections', () => {
  const schema = assignmentResponseSchema();
  assert.deepEqual(schema.required, ['schemaVersion', 'assignment', 'sections']);
  assert.equal(schema.properties.sections.minItems, 1);
});

test('provider request rejects blank and runaway prompts before making an API call', () => {
  assert.throws(
    () => buildOpenAiAssignmentRequest({ prompt: '' }),
    (error) => error instanceof AssignmentAiError && error.code === 'invalid-argument',
  );
  assert.throws(
    () => buildOpenAiAssignmentRequest({ prompt: 'x'.repeat(MAX_PROMPT_CHARS + 1) }),
    /too large/,
  );
});

test('response text extraction supports the raw Responses API output shape', () => {
  const text = extractResponseText({
    output: [
      { content: [{ type: 'output_text', text: '{"schemaVersion":' }, { type: 'output_text', text: '5}' }] },
    ],
  });
  assert.equal(text, '{"schemaVersion":5}');
});

test('successful provider call returns normalized assignment JSON and usage', async () => {
  let request;
  const result = await callOpenAiAssignmentAuthor({
    apiKey: 'server-test-key',
    prompt: '# MathMaster request',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(200, {
        id: 'resp_test',
        model: 'gpt-5',
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(validAssignment) }] }],
        usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
      });
    },
  });

  assert.match(request.url, /api\.openai\.com\/v1\/responses/);
  assert.equal(request.options.headers.Authorization, 'Bearer server-test-key');
  assert.equal(JSON.parse(result.assignmentJson).schemaVersion, 5);
  assert.equal(result.responseId, 'resp_test');
  assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 200, totalTokens: 300 });
});

test('provider errors are translated into safe service categories', async () => {
  await assert.rejects(
    () => callOpenAiAssignmentAuthor({
      apiKey: 'bad',
      prompt: '# MathMaster request',
      fetchImpl: async () => response(401, { error: { message: 'secret provider detail' } }),
    }),
    (error) => error.code === 'failed-precondition' && /administrator attention/.test(error.message),
  );
  await assert.rejects(
    () => callOpenAiAssignmentAuthor({
      apiKey: 'busy',
      prompt: '# MathMaster request',
      fetchImpl: async () => response(429, { error: { message: 'rate' } }),
    }),
    (error) => error.code === 'resource-exhausted',
  );
});

test('provider fails closed on malformed or non-V5 model output', async () => {
  await assert.rejects(
    () => callOpenAiAssignmentAuthor({
      apiKey: 'ok',
      prompt: '# MathMaster request',
      fetchImpl: async () => response(200, {
        output: [{ content: [{ type: 'output_text', text: '{"schemaVersion":4}' }] }],
      }),
    }),
    /not a complete current MathMaster assignment/,
  );
});

console.log('assignmentAiProvider.test.mjs: all assertions passed');
