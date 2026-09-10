import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

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
const {
  DEFAULT_GEMINI_ASSIGNMENT_MODEL,
  buildGeminiAssignmentRequest,
  extractGeminiResponseText,
  callGeminiAssignmentAuthor,
} = require('../../functions/lib/geminiAssignmentAi.js');

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

test('curated AI authoring preserves authored CCMR-looking questions unless enrichment is explicit', async () => {
  const curated = {
    schemaVersion: 5,
    assignment: { title: 'Curated review', courseId: 'algebra1', instructionalPurpose: 'review' },
    sections: [{
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [{
        questionId: 'teacher-authored-1',
        prompt: 'Teacher-authored SAT-style equation question.',
        studentActions: ['solveEquation'],
        equation: '3x+4=40',
        answer: '12',
        standard: 'A.5A',
        alignments: [
          { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
          { framework: 'digitalSAT', domainId: 'algebra', role: 'primary', evidenceMode: 'direct' },
        ],
        assessmentContext: { framework: 'digitalSAT', examStyle: true },
      }],
    }],
  };
  const result = await callOpenAiAssignmentAuthor({
    apiKey: 'ok',
    prompt: '# Curated review request',
    fetchImpl: async () => response(200, {
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(curated) }] }],
    }),
  });

  assert.deepEqual(JSON.parse(result.assignmentJson).sections, curated.sections);
  assert.equal(result.ccmrBank, null);
});

test('explicit AI CCMR enrichment uses audited replacement and the Practice target', async () => {
  const sourceQuestions = Array.from({ length: 8 }, (unused, index) => ({
    questionId: `authored-${index + 1}`,
    prompt: index === 0 ? 'Direct Digital SAT equation.' : `Course review equation ${index + 1}.`,
    studentActions: ['solveEquation'],
    equation: `${index + 2}x+4=${(index + 2) * 6 + 4}`,
    answer: '6',
    standard: 'A.5A',
    alignments: [
      { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
      ...(index === 0 ? [{ framework: 'digitalSAT', domainId: 'algebra', role: 'primary', evidenceMode: 'direct' }] : []),
    ],
    ...(index === 0 ? { assessmentContext: { framework: 'digitalSAT', examStyle: true } } : {}),
  }));
  const result = await callOpenAiAssignmentAuthor({
    apiKey: 'ok',
    prompt: '# Explicit CCMR enrichment request',
    ccmrEnrichment: true,
    fetchImpl: async () => response(200, {
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({
        schemaVersion: 5,
        assignment: { title: 'Enriched review', courseId: 'algebra1' },
        sections: [{ id: 'practice', role: 'practice', title: 'Practice', questions: sourceQuestions }],
      }) }] }],
    }),
  });
  const questions = JSON.parse(result.assignmentJson).sections[0].questions;

  assert.equal(questions.length, sourceQuestions.length);
  assert.equal(result.ccmrBank.replaced, 1);
  assert.equal(result.ccmrBank.targetCount, 1);
  assert.equal(questions.filter((question) => question.ccmrSource?.source === 'auditedBank').length, 1);
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
      fetchImpl: async () => response(429, { error: { type: 'rate_limit_exceeded', message: 'rate' } }),
    }),
    (error) => error.code === 'resource-exhausted' && /rate-limited/i.test(error.message),
  );
  await assert.rejects(
    () => callOpenAiAssignmentAuthor({
      apiKey: 'quota',
      prompt: '# MathMaster request',
      fetchImpl: async () => response(429, { error: { code: 'insufficient_quota', message: 'quota' } }),
    }),
    (error) => (
      error.code === 'resource-exhausted'
      && /billing\/quota needs attention/i.test(error.message)
      && error.details?.providerCode === 'insufficient_quota'
    ),
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

test('Gemini Honors provider is implemented as a separate server-side module', () => {
  assert.equal(
    fs.existsSync('functions/lib/geminiAssignmentAi.js'),
    true,
    'Honors V5 needs a dedicated Gemini provider module before the browser can route Honors additions to it.',
  );
});

test('Gemini Honors request uses the stable Flash model and structured Assignment V5 JSON', () => {
  assert.equal(DEFAULT_GEMINI_ASSIGNMENT_MODEL, 'gemini-3.8-flash');
  const body = buildGeminiAssignmentRequest({ prompt: '# MathMaster Honors-depth repair\nRepair only the missing Honors depth.' });
  assert.equal(body.contents[0].role, 'user');
  assert.match(body.contents[0].parts[0].text, /Honors-depth repair/);
  assert.equal(body.generationConfig.responseFormat.text.mimeType, 'application/json');
  assert.equal(body.generationConfig.responseFormat.text.schema.properties.schemaVersion.enum[0], 5);
  assert.ok(body.generationConfig.maxOutputTokens >= 10000);
});

test('Gemini Honors provider sends the API key only in the server request header and normalizes usage', async () => {
  let request;
  const result = await callGeminiAssignmentAuthor({
    apiKey: 'server-gemini-key',
    prompt: '# MathMaster Honors-depth repair\nRepair only the missing Honors depth.',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(200, {
        responseId: 'gemini-response-1',
        modelVersion: 'gemini-3.8-flash',
        candidates: [{ content: { parts: [{ text: JSON.stringify(validAssignment) }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 101, candidatesTokenCount: 202, totalTokenCount: 303 },
      });
    },
  });

  assert.match(request.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent/);
  assert.equal(request.options.headers['x-goog-api-key'], 'server-gemini-key');
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(JSON.parse(result.assignmentJson).schemaVersion, 5);
  assert.equal(result.responseId, 'gemini-response-1');
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.deepEqual(result.usage, { inputTokens: 101, outputTokens: 202, totalTokens: 303 });
});

test('Gemini response extraction joins text parts and ignores non-text parts', () => {
  assert.equal(
    extractGeminiResponseText({ candidates: [{ content: { parts: [{ text: '{"schemaVersion":' }, { thoughtSignature: 'opaque' }, { text: '5}' }] } }] }),
    '{"schemaVersion":5}',
  );
});

test('Gemini Honors provider classifies credential, quota, and output-budget failures safely', async () => {
  await assert.rejects(
    () => callGeminiAssignmentAuthor({
      apiKey: 'bad',
      prompt: '# MathMaster Honors-depth repair',
      fetchImpl: async () => response(403, { error: { status: 'PERMISSION_DENIED', message: 'provider detail' } }),
    }),
    (error) => error.code === 'failed-precondition' && /GEMINI_API_KEY/.test(error.message),
  );
  await assert.rejects(
    () => callGeminiAssignmentAuthor({
      apiKey: 'busy',
      prompt: '# MathMaster Honors-depth repair',
      fetchImpl: async () => response(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }),
    }),
    (error) => error.code === 'resource-exhausted' && /rate|quota/i.test(error.message),
  );
  await assert.rejects(
    () => callGeminiAssignmentAuthor({
      apiKey: 'ok',
      prompt: '# MathMaster Honors-depth repair',
      fetchImpl: async () => response(200, {
        candidates: [{ content: { parts: [{ text: '{"schemaVersion":5}' }] }, finishReason: 'MAX_TOKENS' }],
      }),
    }),
    (error) => error.code === 'resource-exhausted' && /output budget/i.test(error.message),
  );
});

test('Gemini Honors provider fails closed on malformed or non-V5 output', async () => {
  await assert.rejects(
    () => callGeminiAssignmentAuthor({
      apiKey: 'ok',
      prompt: '# MathMaster Honors-depth repair',
      fetchImpl: async () => response(200, {
        candidates: [{ content: { parts: [{ text: '{"schemaVersion":4}' }] }, finishReason: 'STOP' }],
      }),
    }),
    /complete current MathMaster assignment/,
  );
});
