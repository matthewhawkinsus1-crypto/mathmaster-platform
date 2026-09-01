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
  postJsonWithNativeHttps,
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

test('native HTTPS transport posts directly to api.openai.com without depending on global fetch', async () => {
  let capturedOptions = null;
  let capturedBody = '';
  const fakeHttps = {
    request(options, onResponse) {
      capturedOptions = options;
      const requestHandlers = {};
      const request = {
        setTimeout() {},
        on(event, handler) {
          requestHandlers[event] = handler;
          return request;
        },
        write(body) {
          capturedBody += String(body);
        },
        end() {
          queueMicrotask(() => {
            const responseHandlers = {};
            const response = {
              statusCode: 200,
              statusMessage: 'OK',
              on(event, handler) {
                responseHandlers[event] = handler;
                return response;
              },
            };
            onResponse(response);
            queueMicrotask(() => {
              responseHandlers.data?.(Buffer.from('{"ok":true}'));
              responseHandlers.end?.();
            });
          });
        },
        destroy(error) {
          requestHandlers.error?.(error);
        },
      };
      return request;
    },
  };

  const result = await postJsonWithNativeHttps('https://api.openai.com/v1/responses', {
    headers: { Authorization: 'Bearer server-test-key', 'Content-Type': 'application/json' },
    body: '{"hello":"world"}',
    httpsImpl: fakeHttps,
  });

  assert.equal(capturedOptions.hostname, 'api.openai.com');
  assert.equal(capturedOptions.path, '/v1/responses');
  assert.equal(capturedOptions.method, 'POST');
  assert.equal(capturedOptions.family, 4);
  assert.equal(capturedOptions.headers.Authorization, 'Bearer server-test-key');
  assert.equal(capturedBody, '{"hello":"world"}');
  assert.equal(result.status, 200);
  assert.equal(await result.text(), '{"ok":true}');
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
  await assert.rejects(
    () => callOpenAiAssignmentAuthor({
      apiKey: 'network-test',
      prompt: '# MathMaster request',
      fetchImpl: async () => {
        const error = new Error('dns lookup failed');
        error.code = 'ENOTFOUND';
        throw error;
      },
    }),
    (error) => (
      error.code === 'unavailable'
      && /ENOTFOUND/.test(error.message)
      && error.details?.networkCode === 'ENOTFOUND'
    ),
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


test('provider rejects a creator result that omits required two-page lesson notes', async () => {
  await assert.rejects(
    () => callOpenAiAssignmentAuthor({
      apiKey: 'ok',
      prompt: [
        '# MathMaster request',
        '- REQUIRED OUTPUT CONTRACT: lessonNotesPdf.enabled=true; targetPages=2; learningGoal required; at least two content-bearing sections.',
      ].join('\n'),
      fetchImpl: async () => response(200, {
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(validAssignment) }] }],
      }),
    }),
    /required two-page student notes package/i,
  );
});

test('provider accepts a complete required two-page lesson notes package', async () => {
  const complete = {
    ...validAssignment,
    outputProfiles: {
      lessonNotesPdf: {
        enabled: true,
        targetPages: 2,
        learningGoal: 'Represent and interpret linear relationships.',
        sections: [
          { heading: 'Key ideas', bullets: ['Slope describes rate of change.'] },
          { heading: 'Reference pattern', bullets: ['Use y = mx + b to organize the model.'] },
        ],
      },
    },
  };
  const result = await callOpenAiAssignmentAuthor({
    apiKey: 'ok',
    prompt: [
      '# MathMaster request',
      '- REQUIRED OUTPUT CONTRACT: lessonNotesPdf.enabled=true; targetPages=2; learningGoal required; at least two content-bearing sections.',
    ].join('\n'),
    fetchImpl: async () => response(200, {
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(complete) }] }],
    }),
  });
  const parsed = JSON.parse(result.assignmentJson);
  assert.equal(parsed.outputProfiles.lessonNotesPdf.targetPages, 2);
  assert.equal(parsed.outputProfiles.lessonNotesPdf.sections.length, 2);
});
