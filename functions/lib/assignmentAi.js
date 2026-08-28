"use strict";

const { replaceDirectCcmrQuestionsWithAuditedBank } = require("./ccmrAssignmentBank");

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_ASSIGNMENT_MODEL = "gpt-5";
const MAX_PROMPT_CHARS = 120000;
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
      `The assignment build request is too large (${prompt.length.toLocaleString()} characters). Shorten the teacher directions or split the lesson.`,
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

async function callOpenAiAssignmentAuthor({
  apiKey,
  prompt,
  model = DEFAULT_ASSIGNMENT_MODEL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 240000,
} = {}) {
  if (!String(apiKey || "").trim()) {
    throw new AssignmentAiError("failed-precondition", "MathMaster AI authoring is not configured yet.");
  }
  if (typeof fetchImpl !== "function") {
    throw new AssignmentAiError("internal", "This server runtime cannot reach the AI provider.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 240000));
  let response;
  let payload;
  try {
    response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${String(apiKey).trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenAiAssignmentRequest({ prompt, model })),
      signal: controller.signal,
    });
    const text = await response.text();
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new AssignmentAiError("deadline-exceeded", "The AI took too long to build this assignment. Try again or use the copy/paste AI workflow.");
    }
    throw new AssignmentAiError("unavailable", "MathMaster could not reach the AI service. Try again or use the copy/paste AI workflow.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const message = providerMessage(payload, "The AI service rejected the assignment request.");
    if (response.status === 401 || response.status === 403) {
      throw new AssignmentAiError("failed-precondition", "MathMaster's AI service credential needs administrator attention.", { status: response.status });
    }
    if (response.status === 429) {
      throw new AssignmentAiError("resource-exhausted", "The AI service is busy or the usage limit was reached. Try again shortly.", { status: response.status });
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
  callOpenAiAssignmentAuthor,
};
