'use strict';

const https = require('https');
const {
  AssignmentAiError,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  MAX_PROMPT_CHARS,
  MAX_OUTPUT_TOKENS,
  assignmentResponseSchema,
  parseFirstJsonObject,
  postJsonWithNativeHttps,
} = require('./assignmentAi');

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_ASSIGNMENT_MODEL = 'gemini-3.8-flash';

function cleanPrompt(value) {
  const prompt = String(value || '').trim();
  if (!prompt) {
    throw new AssignmentAiError('invalid-argument', 'Finish the Honors-depth repair request before building with AI.');
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new AssignmentAiError(
      'invalid-argument',
      `The Honors AI request is too large (${prompt.length.toLocaleString()} characters). Shorten unusually long teacher directions or split the lesson.`,
    );
  }
  return prompt;
}

function buildGeminiAssignmentRequest({
  prompt,
  maxOutputTokens = MAX_OUTPUT_TOKENS,
} = {}) {
  const clean = cleanPrompt(prompt);
  return {
    systemInstruction: {
      parts: [{
        text: [
          "You are MathMaster's internal Honors-depth assignment repair model.",
          'Follow the supplied MathMaster Honors repair contract exactly.',
          'Return only one complete Assignment V5 JSON object.',
          'Do not include Markdown fences, commentary, or alternative versions.',
          'Do not fabricate CCMR alignment or replace audited CCMR content.',
          'MathMaster will independently validate the result before publication.',
        ].join(' '),
      }],
    },
    contents: [{
      role: 'user',
      parts: [{ text: clean }],
    }],
    generationConfig: {
      maxOutputTokens: Math.max(1000, Number(maxOutputTokens) || MAX_OUTPUT_TOKENS),
      responseFormat: {
        text: {
          mimeType: 'application/json',
          schema: assignmentResponseSchema(),
        },
      },
    },
  };
}

function extractGeminiResponseText(payload = {}) {
  const chunks = [];
  for (const candidate of Array.isArray(payload?.candidates) ? payload.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      if (typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('').trim();
}

function geminiDiagnostics(payload = {}, { model = null, elapsedMs = null } = {}) {
  const usage = payload?.usageMetadata && typeof payload.usageMetadata === 'object'
    ? payload.usageMetadata
    : {};
  const firstCandidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
  return {
    provider: 'gemini',
    mode: 'honors-depth',
    requestedModel: model || null,
    servedModel: String(payload?.modelVersion || '').trim() || null,
    responseId: String(payload?.responseId || '').trim() || null,
    responseStatus: String(firstCandidate?.finishReason || '').trim() || null,
    inputTokens: Number(usage.promptTokenCount) || 0,
    outputTokens: Number(usage.candidatesTokenCount) || 0,
    totalTokens: Number(usage.totalTokenCount) || 0,
    elapsedMs: Number(elapsedMs) || null,
  };
}

function providerMessage(payload, fallback) {
  return String(payload?.error?.message || payload?.message || fallback || '').trim();
}

async function requestGemini({
  apiKey,
  requestBody,
  model = DEFAULT_GEMINI_ASSIGNMENT_MODEL,
  fetchImpl = null,
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  httpsImpl = https,
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new AssignmentAiError(
      'failed-precondition',
      'MathMaster Honors AI is not configured yet. The GEMINI_API_KEY secret needs administrator attention.',
    );
  }

  const selectedModel = String(model || DEFAULT_GEMINI_ASSIGNMENT_MODEL).trim() || DEFAULT_GEMINI_ASSIGNMENT_MODEL;
  const url = `${GEMINI_MODELS_URL}/${encodeURIComponent(selectedModel)}:generateContent`;
  const serializedBody = JSON.stringify(requestBody);
  const headers = {
    'x-goog-api-key': key,
    'Content-Type': 'application/json',
  };
  const startedAt = Date.now();
  let response;
  let payload;
  let timer = null;

  try {
    if (typeof fetchImpl === 'function') {
      const controller = new AbortController();
      timer = setTimeout(
        () => controller.abort(),
        Math.max(1000, Number(timeoutMs) || DEFAULT_PROVIDER_TIMEOUT_MS),
      );
      response = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: serializedBody,
        signal: controller.signal,
      });
    } else {
      response = await postJsonWithNativeHttps(url, {
        headers,
        body: serializedBody,
        timeoutMs,
        httpsImpl,
      });
    }

    const text = await response.text();
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
  } catch (error) {
    const networkCode = String(error?.code || error?.cause?.code || '').trim().slice(0, 64);
    const elapsedMs = Date.now() - startedAt;
    if (error?.name === 'AbortError' || networkCode === 'ETIMEDOUT') {
      throw new AssignmentAiError(
        'deadline-exceeded',
        `Gemini took too long and MathMaster stopped waiting after ${Math.round(elapsedMs / 1000)}s. Nothing was changed.`,
        { details: { provider: 'gemini', networkCode: networkCode || 'ETIMEDOUT', elapsedMs, requestedModel: selectedModel, mode: 'honors-depth' } },
      );
    }
    throw new AssignmentAiError(
      'unavailable',
      `MathMaster could not reach Gemini${networkCode ? ` (${networkCode})` : ''}. Nothing was changed.`,
      { details: { provider: 'gemini', networkCode: networkCode || null, elapsedMs, requestedModel: selectedModel, mode: 'honors-depth' } },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  const elapsedMs = Date.now() - startedAt;
  const diagnostics = geminiDiagnostics(payload, { model: selectedModel, elapsedMs });

  if (!response.ok) {
    const message = providerMessage(payload, 'Gemini rejected the Honors-depth request.');
    const providerCode = String(payload?.error?.status || payload?.error?.code || '').trim().slice(0, 100);
    const details = { ...diagnostics, providerCode: providerCode || null };

    if (response.status === 401 || response.status === 403) {
      throw new AssignmentAiError(
        'failed-precondition',
        "MathMaster's Gemini credential was rejected. The GEMINI_API_KEY secret needs administrator attention.",
        { status: response.status, details },
      );
    }
    if (response.status === 404 || /not found|does not exist|not supported|not available/i.test(message)) {
      throw new AssignmentAiError(
        'failed-precondition',
        `Gemini does not serve the configured Honors model to this API project: ${message.slice(0, 300)}`,
        { status: response.status, details },
      );
    }
    if (response.status === 429) {
      throw new AssignmentAiError(
        'resource-exhausted',
        'Gemini rate or quota limits blocked the Honors-depth request. Nothing was changed; wait briefly or check the Gemini API project quota.',
        { status: response.status, details },
      );
    }
    if (response.status >= 500) {
      throw new AssignmentAiError(
        'unavailable',
        'Gemini is temporarily unavailable. Nothing was changed; try again shortly.',
        { status: response.status, details },
      );
    }
    throw new AssignmentAiError(
      'failed-precondition',
      `Gemini rejected the Honors-depth request: ${message.slice(0, 400)}`,
      { status: response.status, details },
    );
  }

  const finishReason = String(diagnostics.responseStatus || '').toUpperCase();
  if (finishReason === 'MAX_TOKENS') {
    throw new AssignmentAiError(
      'resource-exhausted',
      `Gemini ran out of its ${Number(requestBody?.generationConfig?.maxOutputTokens || MAX_OUTPUT_TOKENS).toLocaleString()}-token output budget before finishing. Nothing was changed.`,
      { details: diagnostics },
    );
  }
  if (finishReason && finishReason !== 'STOP') {
    throw new AssignmentAiError(
      'failed-precondition',
      `Gemini stopped the Honors-depth repair before completing it (${finishReason}). Nothing was changed.`,
      { details: diagnostics },
    );
  }

  return { payload, diagnostics };
}

async function callGeminiAssignmentAuthor({
  apiKey,
  prompt,
  model = DEFAULT_GEMINI_ASSIGNMENT_MODEL,
  maxOutputTokens = MAX_OUTPUT_TOKENS,
  fetchImpl = null,
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  httpsImpl = https,
} = {}) {
  const selectedModel = String(model || DEFAULT_GEMINI_ASSIGNMENT_MODEL).trim() || DEFAULT_GEMINI_ASSIGNMENT_MODEL;
  const requestBody = buildGeminiAssignmentRequest({ prompt, maxOutputTokens });
  const { payload, diagnostics } = await requestGemini({
    apiKey,
    requestBody,
    model: selectedModel,
    fetchImpl,
    timeoutMs,
    httpsImpl,
  });

  const responseText = extractGeminiResponseText(payload);
  if (!responseText) {
    throw new AssignmentAiError(
      'internal',
      'Gemini returned an empty Honors-depth response. MathMaster changed nothing.',
      { details: diagnostics },
    );
  }

  const parsed = parseFirstJsonObject(responseText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AssignmentAiError(
      'internal',
      'Gemini returned malformed JSON. MathMaster did not accept it.',
      { details: { ...diagnostics, responseCharacters: responseText.length } },
    );
  }
  if (Number(parsed.schemaVersion) !== 5 || !Array.isArray(parsed.sections)) {
    throw new AssignmentAiError(
      'failed-precondition',
      'The Gemini response was not one complete current MathMaster assignment. MathMaster did not accept it.',
      { details: diagnostics },
    );
  }

  const usage = payload?.usageMetadata && typeof payload.usageMetadata === 'object'
    ? {
        inputTokens: Number(payload.usageMetadata.promptTokenCount) || 0,
        outputTokens: Number(payload.usageMetadata.candidatesTokenCount) || 0,
        totalTokens: Number(payload.usageMetadata.totalTokenCount) || 0,
      }
    : null;

  return {
    assignmentJson: JSON.stringify(parsed),
    model: String(payload?.modelVersion || selectedModel),
    responseId: String(payload?.responseId || '').trim() || null,
    usage,
    diagnostics,
  };
}

module.exports = {
  GEMINI_MODELS_URL,
  DEFAULT_GEMINI_ASSIGNMENT_MODEL,
  buildGeminiAssignmentRequest,
  extractGeminiResponseText,
  geminiDiagnostics,
  callGeminiAssignmentAuthor,
};
