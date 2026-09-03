"use strict";

const https = require("https");
const { replaceDirectCcmrQuestionsWithAuditedBank } = require("./ccmrAssignmentBank");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_ASSIGNMENT_MODEL = "gpt-5";
const MAX_PROMPT_CHARS = 240000;
const MAX_OUTPUT_TOKENS = 30000;

// The Cloud Function budget is 300s. Leave the provider a little less than that
// so a slow model surfaces as an honest MathMaster timeout instead of the
// platform killing the whole invocation before any error can be recorded.
const DEFAULT_PROVIDER_TIMEOUT_MS = 280000;

class AssignmentAiError extends Error {
  constructor(code, message, { status = null, details = null } = {}) {
    super(message);
    this.name = "AssignmentAiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function cleanPrompt(value) {
  const prompt = String(value || "").trim();
  if (!prompt) throw new AssignmentAiError("invalid-argument", "Finish the assignment plan before building with AI.");
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new AssignmentAiError(
      "invalid-argument",
      `The AI request is too large (${prompt.length.toLocaleString()} characters). MathMaster already uses compact repair packets; shorten unusually long teacher directions or split the lesson.`,
    );
  }
  return prompt;
}

function assignmentResponseSchema() {
  return {
    type: "object",
    properties: {
      schemaVersion: { type: "integer", enum: [5] },
      assignment: { type: "object" },
      sections: {
        type: "array",
        minItems: 1,
        items: { type: "object" },
      },
      variantPolicy: { type: "object" },
      differentiationPolicy: { type: "object" },
      supportPolicy: { type: "object" },
      toolPolicy: { type: "object" },
      deliveryPolicy: { type: "object" },
      gradingPolicy: { type: "object" },
      evidencePolicy: { type: "object" },
      outputProfiles: { type: "object" },
      classroomIntegration: { type: "object" },
      provenance: { type: "object" },
      preflight: { type: "object" },
    },
    required: ["schemaVersion", "assignment", "sections"],
    additionalProperties: true,
  };
}

// One repaired question, not a whole assignment. Preflight's per-question repair
// needs a packet this small: sending the entire lesson back through the model to
// fix one item wastes the output budget and invites unrelated rewrites.
function questionResponseSchema() {
  return {
    type: "object",
    properties: {
      replacementQuestion: { type: "object" },
    },
    required: ["replacementQuestion"],
    additionalProperties: true,
  };
}

const RESPONSE_MODES = Object.freeze({
  assignment: Object.freeze({
    schemaName: "mathmaster_assignment_v5",
    schemaDescription: "One complete MathMaster Assignment V5 authoring object.",
    schema: assignmentResponseSchema,
    instruction: "Return only one complete Assignment V5 JSON object.",
  }),
  question: Object.freeze({
    schemaName: "mathmaster_question_repair",
    schemaDescription: "One replacement MathMaster question object.",
    schema: questionResponseSchema,
    instruction: "Return only one JSON object shaped {\"replacementQuestion\": { ... }} containing exactly one repaired question.",
  }),
});

function responseMode(mode) {
  const selected = RESPONSE_MODES[String(mode || "assignment")];
  if (!selected) {
    throw new AssignmentAiError("invalid-argument", `Unknown MathMaster AI response mode: ${mode}`);
  }
  return selected;
}

// `reasoning` is only a valid Responses API parameter for reasoning models.
// Sending it to a non-reasoning model is a hard 400, so an administrator who
// points OPENAI_ASSIGNMENT_MODEL at gpt-4.1 should not break every build.
function supportsReasoningEffort(model) {
  return /^(gpt-5|o[1-4])/i.test(String(model || "").trim());
}

function buildOpenAiAssignmentRequest({
  prompt,
  model = DEFAULT_ASSIGNMENT_MODEL,
  mode = "assignment",
  reasoningEffort = "medium",
  maxOutputTokens = MAX_OUTPUT_TOKENS,
} = {}) {
  const clean = cleanPrompt(prompt);
  const selectedModel = String(model || DEFAULT_ASSIGNMENT_MODEL).trim() || DEFAULT_ASSIGNMENT_MODEL;
  const selectedMode = responseMode(mode);

  const request = {
    model: selectedModel,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "You are MathMaster's internal assignment-authoring model.",
              "Follow the supplied MathMaster contract exactly.",
              selectedMode.instruction,
              "Do not include Markdown fences, commentary, or alternative versions.",
              "MathMaster will independently validate instructional scope, grading, interactions, supports, differentiation, PDF fidelity, and assessment fidelity before publication.",
            ].join(" "),
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: clean }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: selectedMode.schemaName,
        description: selectedMode.schemaDescription,
        strict: false,
        schema: selectedMode.schema(),
      },
    },
    max_output_tokens: Math.max(1000, Number(maxOutputTokens) || MAX_OUTPUT_TOKENS),
    store: false,
  };

  // Reasoning tokens are billed against max_output_tokens on these models, so an
  // unbounded default effort can consume the whole budget and truncate the JSON.
  // Repair packets are small and deserve the cheaper, faster setting.
  if (supportsReasoningEffort(selectedModel) && reasoningEffort) {
    request.reasoning = { effort: String(reasoningEffort) };
  }

  return request;
}

function extractResponseText(response = {}) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const chunks = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part.text === "string") chunks.push(part.text);
    }
  }
  return chunks.join("").trim();
}

// A structured-output refusal is a successful HTTP response carrying no
// output_text at all. Reporting it as "returned no content" hid the one failure
// mode a teacher can actually act on by rewording the request.
function extractRefusalText(response = {}) {
  for (const item of Array.isArray(response.output) ? response.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "refusal" && typeof part.refusal === "string" && part.refusal.trim()) {
        return part.refusal.trim();
      }
    }
  }
  return "";
}

// The model is told not to fence its JSON, but a fenced or slightly prefixed
// response is a recoverable formatting slip, not a reason to throw away a
// complete assignment the teacher waited five minutes for.
function parseFirstJsonObject(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return null;

  const fenced = text.match(/^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i);
  const candidate = fenced ? fenced[1].trim() : text;

  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(candidate.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

function providerMessage(payload, fallback) {
  return String(payload?.error?.message || payload?.message || fallback || "").trim();
}

// Everything MathMaster knows about one provider round-trip, in a shape that is
// safe to write to Firestore and to log. Deliberately carries no prompt text and
// no assignment content — only status, codes, and counts.
function providerDiagnostics(payload = {}, { model = null, mode = null, elapsedMs = null } = {}) {
  const usage = payload?.usage && typeof payload.usage === "object" ? payload.usage : null;
  return {
    provider: "openai",
    mode: mode || null,
    requestedModel: model || null,
    servedModel: String(payload?.model || "").trim() || null,
    responseId: payload?.id || null,
    responseStatus: String(payload?.status || "").trim() || null,
    incompleteReason: String(payload?.incomplete_details?.reason || "").trim() || null,
    inputTokens: Number(usage?.input_tokens) || 0,
    outputTokens: Number(usage?.output_tokens) || 0,
    reasoningTokens: Number(usage?.output_tokens_details?.reasoning_tokens) || 0,
    elapsedMs: Number(elapsedMs) || null,
  };
}

function postJsonWithNativeHttps(url, {
  headers = {},
  body = "",
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  httpsImpl = https,
} = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const requestBody = String(body || "");
    const request = httpsImpl.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      family: 4,
      method: "POST",
      path: `${target.pathname}${target.search}`,
      headers: {
        ...headers,
        "Content-Length": Buffer.byteLength(requestBody),
      },
    }, (response) => {
      const chunks = [];
      let totalBytes = 0;
      const maxResponseBytes = 25 * 1024 * 1024;

      response.on("data", (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;
        if (totalBytes > maxResponseBytes) {
          const error = new Error("AI provider response exceeded the safe response-size limit.");
          error.code = "EMSGSIZE";
          request.destroy(error);
          return;
        }
        chunks.push(buffer);
      });

      response.on("end", () => {
        const status = Number(response.statusCode) || 0;
        const responseText = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: String(response.statusMessage || ""),
          text: async () => responseText,
        });
      });

      response.on("error", reject);
    });

    const timeout = Math.max(1000, Number(timeoutMs) || DEFAULT_PROVIDER_TIMEOUT_MS);
    request.setTimeout(timeout, () => {
      const error = new Error("AI provider request timed out.");
      error.code = "ETIMEDOUT";
      request.destroy(error);
    });
    request.on("error", reject);
    request.write(requestBody);
    request.end();
  });
}

// One round-trip to the provider. Returns the parsed payload plus diagnostics on
// success; throws an AssignmentAiError carrying the same diagnostics otherwise.
// Every caller — real builds and the administrator self-test alike — goes
// through here so there is exactly one place that classifies provider failures.
async function requestOpenAi({
  apiKey,
  requestBody,
  model,
  mode,
  fetchImpl = null,
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  httpsImpl = https,
} = {}) {
  if (!String(apiKey || "").trim()) {
    throw new AssignmentAiError("failed-precondition", "MathMaster AI authoring is not configured yet.");
  }

  const serializedBody = JSON.stringify(requestBody);
  const headers = {
    Authorization: `Bearer ${String(apiKey).trim()}`,
    "Content-Type": "application/json",
  };
  const startedAt = Date.now();
  let response;
  let payload;
  let timer = null;

  try {
    if (typeof fetchImpl === "function") {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || DEFAULT_PROVIDER_TIMEOUT_MS));
      response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers,
        body: serializedBody,
        signal: controller.signal,
      });
    } else {
      response = await postJsonWithNativeHttps(OPENAI_RESPONSES_URL, {
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
    const networkCode = String(error?.code || error?.cause?.code || "").trim().slice(0, 64);
    const elapsedMs = Date.now() - startedAt;
    if (error?.name === "AbortError" || networkCode === "ETIMEDOUT") {
      throw new AssignmentAiError(
        "deadline-exceeded",
        `The AI took too long and MathMaster stopped waiting after ${Math.round(elapsedMs / 1000)}s. Try again or use the outside-AI workflow.`,
        { details: { networkCode: networkCode || "ETIMEDOUT", elapsedMs, requestedModel: model || null, mode: mode || null } },
      );
    }
    throw new AssignmentAiError(
      "unavailable",
      `MathMaster could not reach the AI service${networkCode ? ` (${networkCode})` : ""}. The server now reports the network failure code so this can be diagnosed instead of hidden.`,
      { details: { networkCode: networkCode || null, elapsedMs, requestedModel: model || null, mode: mode || null } },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  const elapsedMs = Date.now() - startedAt;
  const diagnostics = providerDiagnostics(payload, { model, mode, elapsedMs });

  if (!response.ok) {
    const message = providerMessage(payload, "The AI service rejected the assignment request.");
    const providerCode = String(payload?.error?.code || payload?.error?.type || "").trim().toLowerCase();
    const details = { ...diagnostics, providerCode: providerCode || null };

    if (response.status === 401 || response.status === 403) {
      throw new AssignmentAiError(
        "failed-precondition",
        "MathMaster's AI service credential was rejected by OpenAI. The OPENAI_API_KEY secret needs administrator attention.",
        { status: response.status, details },
      );
    }
    if (response.status === 404 || /does not exist|do not have access/i.test(message)) {
      throw new AssignmentAiError(
        "failed-precondition",
        `OpenAI does not serve the configured model to this API project: ${message.slice(0, 300)}`,
        { status: response.status, details },
      );
    }
    if (response.status === 429) {
      if (providerCode === "insufficient_quota") {
        throw new AssignmentAiError(
          "resource-exhausted",
          "OpenAI rejected the request because this API project has no available quota or billing credit. MathMaster reached OpenAI successfully; the API project's billing/quota needs attention.",
          { status: response.status, details },
        );
      }
      throw new AssignmentAiError(
        "resource-exhausted",
        "OpenAI rate-limited the assignment request. MathMaster reached OpenAI successfully; wait briefly and try again.",
        { status: response.status, details },
      );
    }
    if (response.status >= 500) {
      throw new AssignmentAiError(
        "unavailable",
        "The AI service is temporarily unavailable. Try again shortly.",
        { status: response.status, details },
      );
    }
    throw new AssignmentAiError("failed-precondition", message.slice(0, 500), { status: response.status, details });
  }

  // A 200 that ran out of output budget is the failure that used to surface as
  // "returned no content" or "malformed JSON". Reasoning tokens count against
  // max_output_tokens, so this is a budget problem an administrator can fix.
  if (String(payload?.status || "") === "incomplete") {
    const reason = diagnostics.incompleteReason || "unknown";
    throw new AssignmentAiError(
      "resource-exhausted",
      reason === "max_output_tokens"
        ? `The AI ran out of its ${requestBody.max_output_tokens.toLocaleString()}-token output budget before finishing (${diagnostics.reasoningTokens.toLocaleString()} of those went to reasoning). Nothing was saved. Build a smaller assignment, or an administrator can lower the reasoning effort or raise the output budget.`
        : `The AI stopped before finishing (${reason}). Nothing was saved.`,
      { details: diagnostics },
    );
  }

  const refusal = extractRefusalText(payload);
  if (refusal) {
    throw new AssignmentAiError(
      "failed-precondition",
      `The AI declined this request: ${refusal.slice(0, 300)}`,
      { details: diagnostics },
    );
  }

  return { payload, diagnostics };
}

async function callOpenAiAssignmentAuthor({
  apiKey,
  prompt,
  model = DEFAULT_ASSIGNMENT_MODEL,
  mode = "assignment",
  reasoningEffort = "medium",
  maxOutputTokens = MAX_OUTPUT_TOKENS,
  fetchImpl = null,
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  httpsImpl = https,
} = {}) {
  const requestBody = buildOpenAiAssignmentRequest({ prompt, model, mode, reasoningEffort, maxOutputTokens });
  const { payload, diagnostics } = await requestOpenAi({
    apiKey,
    requestBody,
    model,
    mode,
    fetchImpl,
    timeoutMs,
    httpsImpl,
  });

  const responseText = extractResponseText(payload);
  if (!responseText) {
    throw new AssignmentAiError(
      "internal",
      "The AI returned an empty response. Nothing was saved.",
      { details: diagnostics },
    );
  }

  const parsed = parseFirstJsonObject(responseText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AssignmentAiError(
      "internal",
      "The AI returned malformed JSON. MathMaster did not accept it.",
      { details: { ...diagnostics, responseCharacters: responseText.length } },
    );
  }

  const common = {
    model: String(payload.model || model || DEFAULT_ASSIGNMENT_MODEL),
    responseId: payload.id || null,
    usage: payload.usage && typeof payload.usage === "object"
      ? {
          inputTokens: Number(payload.usage.input_tokens) || 0,
          outputTokens: Number(payload.usage.output_tokens) || 0,
          totalTokens: Number(payload.usage.total_tokens) || 0,
        }
      : null,
    diagnostics,
  };

  if (mode === "question") {
    const question = parsed.replacementQuestion && typeof parsed.replacementQuestion === "object" && !Array.isArray(parsed.replacementQuestion)
      ? parsed.replacementQuestion
      : parsed;
    if (!question || typeof question !== "object" || Array.isArray(question) || !String(question.type || "").trim()) {
      throw new AssignmentAiError(
        "failed-precondition",
        "The AI response was not one complete replacement question. MathMaster did not accept it.",
        { details: diagnostics },
      );
    }
    return { ...common, questionJson: JSON.stringify(question) };
  }

  if (Number(parsed.schemaVersion) !== 5 || !Array.isArray(parsed.sections)) {
    throw new AssignmentAiError(
      "failed-precondition",
      "The AI response was not a complete current MathMaster assignment. MathMaster did not accept it.",
      { details: diagnostics },
    );
  }

  const notes = parsed?.outputProfiles?.lessonNotesPdf;
  const requiresTwoPageNotes = /REQUIRED OUTPUT CONTRACT:\s*lessonNotesPdf\.enabled=true/i.test(String(prompt || ""));
  if (notes?.enabled === true || requiresTwoPageNotes) {
    const noteSections = Array.isArray(notes?.sections) ? notes.sections : [];
    const learningGoal = String(notes?.learningGoal || "").trim();
    if (notes?.enabled !== true || Number(notes?.targetPages) !== 2 || !learningGoal || noteSections.length < 2) {
      throw new AssignmentAiError(
        "failed-precondition",
        "MathMaster AI returned an assignment without the required two-page student notes package (enabled=true, targetPages=2, learning goal, and at least two substantive sections). The assignment was rejected instead of saving incomplete notes. Use the outside-AI import option or try the build again.",
        { details: diagnostics },
      );
    }
  }

  const banked = replaceDirectCcmrQuestionsWithAuditedBank(parsed);

  return {
    ...common,
    assignmentJson: JSON.stringify(banked.assignment),
    ccmrBank: banked.audit,
  };
}

// Smallest possible real round-trip: proves credential, model access, quota and
// egress in one call without spending an assignment-sized output budget. Used by
// the administrator self-test so "the AI is broken" becomes a specific cause.
async function probeAssignmentAiProvider({
  apiKey,
  model = DEFAULT_ASSIGNMENT_MODEL,
  fetchImpl = null,
  timeoutMs = 45000,
  httpsImpl = https,
} = {}) {
  const requestBody = {
    model: String(model || DEFAULT_ASSIGNMENT_MODEL).trim() || DEFAULT_ASSIGNMENT_MODEL,
    input: [
      { role: "system", content: [{ type: "input_text", text: "Reply with the single word ready." }] },
      { role: "user", content: [{ type: "input_text", text: "MathMaster connectivity self-test." }] },
    ],
    max_output_tokens: 16,
    store: false,
  };
  if (supportsReasoningEffort(requestBody.model)) {
    requestBody.reasoning = { effort: "low" };
  }

  const { payload, diagnostics } = await requestOpenAi({
    apiKey,
    requestBody,
    model: requestBody.model,
    mode: "probe",
    fetchImpl,
    timeoutMs,
    httpsImpl,
  });

  return { ok: true, reply: extractResponseText(payload).slice(0, 120), diagnostics };
}

module.exports = {
  AssignmentAiError,
  DEFAULT_ASSIGNMENT_MODEL,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  MAX_PROMPT_CHARS,
  MAX_OUTPUT_TOKENS,
  RESPONSE_MODES,
  assignmentResponseSchema,
  questionResponseSchema,
  supportsReasoningEffort,
  buildOpenAiAssignmentRequest,
  extractResponseText,
  extractRefusalText,
  parseFirstJsonObject,
  providerDiagnostics,
  postJsonWithNativeHttps,
  callOpenAiAssignmentAuthor,
  probeAssignmentAiProvider,
};
