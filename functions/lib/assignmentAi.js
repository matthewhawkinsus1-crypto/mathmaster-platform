"use strict";

const https = require("https");
const { replaceDirectCcmrQuestionsWithAuditedBank } = require("./ccmrAssignmentBank");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_ASSIGNMENT_MODEL = "gpt-5";
const MAX_PROMPT_CHARS = 240000;
const MAX_OUTPUT_TOKENS = 30000;

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

function buildOpenAiAssignmentRequest({ prompt, model = DEFAULT_ASSIGNMENT_MODEL } = {}) {
  const clean = cleanPrompt(prompt);
  const selectedModel = String(model || DEFAULT_ASSIGNMENT_MODEL).trim() || DEFAULT_ASSIGNMENT_MODEL;
  return {
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
              "Return only one complete Assignment V5 JSON object.",
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
        name: "mathmaster_assignment_v5",
        description: "One complete MathMaster Assignment V5 authoring object.",
        strict: false,
        schema: assignmentResponseSchema(),
      },
    },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    store: false,
  };
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

function providerMessage(payload, fallback) {
  return String(payload?.error?.message || payload?.message || fallback || "").trim();
}

function postJsonWithNativeHttps(url, {
  headers = {},
  body = "",
  timeoutMs = 240000,
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

    const timeout = Math.max(1000, Number(timeoutMs) || 240000);
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

async function callOpenAiAssignmentAuthor({
  apiKey,
  prompt,
  model = DEFAULT_ASSIGNMENT_MODEL,
  fetchImpl = null,
  timeoutMs = 240000,
  httpsImpl = https,
} = {}) {
  if (!String(apiKey || "").trim()) {
    throw new AssignmentAiError("failed-precondition", "MathMaster AI authoring is not configured yet.");
  }

  const requestBody = JSON.stringify(buildOpenAiAssignmentRequest({ prompt, model }));
  const headers = {
    Authorization: `Bearer ${String(apiKey).trim()}`,
    "Content-Type": "application/json",
  };
  let response;
  let payload;
  let timer = null;
  try {
    if (typeof fetchImpl === "function") {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 240000));
      response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers,
        body: requestBody,
        signal: controller.signal,
      });
    } else {
      response = await postJsonWithNativeHttps(OPENAI_RESPONSES_URL, {
        headers,
        body: requestBody,
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
    if (error?.name === "AbortError" || networkCode === "ETIMEDOUT") {
      throw new AssignmentAiError(
        "deadline-exceeded",
        "The AI took too long to build this assignment. Try again or use the outside-AI workflow.",
        { details: networkCode ? { networkCode } : null },
      );
    }
    throw new AssignmentAiError(
      "unavailable",
      `MathMaster could not reach the AI service${networkCode ? ` (${networkCode})` : ""}. The server now reports the network failure code so this can be diagnosed instead of hidden.`,
      { details: networkCode ? { networkCode } : null },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response.ok) {
    const message = providerMessage(payload, "The AI service rejected the assignment request.");
    if (response.status === 401 || response.status === 403) {
      throw new AssignmentAiError("failed-precondition", "MathMaster's AI service credential needs administrator attention.", { status: response.status });
    }
    if (response.status === 429) {
      const providerCode = String(payload?.error?.code || payload?.error?.type || '').trim().toLowerCase();
      if (providerCode === 'insufficient_quota') {
        throw new AssignmentAiError(
          "resource-exhausted",
          "OpenAI rejected the request because this API project has no available quota or billing credit. MathMaster reached OpenAI successfully; the API project's billing/quota needs attention.",
          { status: response.status, details: { providerCode } },
        );
      }
      throw new AssignmentAiError(
        "resource-exhausted",
        "OpenAI rate-limited the assignment request. MathMaster reached OpenAI successfully; wait briefly and try again.",
        { status: response.status, details: providerCode ? { providerCode } : null },
      );
    }
    if (response.status >= 500) {
      throw new AssignmentAiError("unavailable", "The AI service is temporarily unavailable. Try again shortly.", { status: response.status });
    }
    throw new AssignmentAiError("failed-precondition", message.slice(0, 500), { status: response.status });
  }

  const assignmentJson = extractResponseText(payload);
  if (!assignmentJson) {
    throw new AssignmentAiError("internal", "The AI returned no assignment content.");
  }

  let parsed;
  try {
    parsed = JSON.parse(assignmentJson);
  } catch {
    throw new AssignmentAiError("internal", "The AI returned malformed assignment JSON. MathMaster did not accept it.");
  }
  if (!parsed || Array.isArray(parsed) || Number(parsed.schemaVersion) !== 5 || !Array.isArray(parsed.sections)) {
    throw new AssignmentAiError("failed-precondition", "The AI response was not a complete current MathMaster assignment. MathMaster did not accept it.");
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
      );
    }
  }

  const banked = replaceDirectCcmrQuestionsWithAuditedBank(parsed);

  return {
    assignmentJson: JSON.stringify(banked.assignment),
    model: String(payload.model || model || DEFAULT_ASSIGNMENT_MODEL),
    responseId: payload.id || null,
    usage: payload.usage && typeof payload.usage === "object"
      ? {
          inputTokens: Number(payload.usage.input_tokens) || 0,
          outputTokens: Number(payload.usage.output_tokens) || 0,
          totalTokens: Number(payload.usage.total_tokens) || 0,
        }
      : null,
    ccmrBank: banked.audit,
  };
}

module.exports = {
  AssignmentAiError,
  DEFAULT_ASSIGNMENT_MODEL,
  MAX_PROMPT_CHARS,
  MAX_OUTPUT_TOKENS,
  assignmentResponseSchema,
  buildOpenAiAssignmentRequest,
  extractResponseText,
  postJsonWithNativeHttps,
  callOpenAiAssignmentAuthor,
};
