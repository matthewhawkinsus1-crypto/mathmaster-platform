"use strict";

/*
 * ONE SECURE ITEM, FROM THE SERVER'S SIDE: WHAT TRAVELS AND WHO GRADES IT.
 *
 * Every secure surface — the Test, the Retest, Corrections and the teacher's
 * preview of a Test — issues a question the same way and grades it the same
 * way. Before this module each of them called
 * `mathPath.buildSanitizedQuestion(question, question)` and
 * `mathPath.gradeResponse(...)`, and both calls were wrong for a Rich Tool
 * item in the same quiet way:
 *
 *   - `buildSanitizedQuestion` emits the tool only when it is handed the
 *     payload as `options.toolPayload`. An issued question carries the tool
 *     FLATTENED onto itself, so the second argument had no `toolPayload` and
 *     the tool was dropped. A graphing item reached the student as a prompt
 *     and a bare "Answer" box.
 *   - `gradeResponse` is the FIELD grader. A tool item's private grading is
 *     `{ pathToolId, definition }`, which has no `fields`, so every answer —
 *     right or wrong — scored 0.
 *
 * Preflight approved those families as gradable, because they are. They were
 * simply never delivered or graded as what they are.
 *
 * THE BOUNDARY THIS MODULE KEEPS.
 *
 *   Public:  the Path Tool Contract's per-tool ALLOWLIST (pathToolContracts),
 *            then — in a secure mode — every Category B assistance key removed
 *            (questionRuntimePolicy) and the tool's assessment settings forced
 *            (secureToolCertification). Context scaffolds are switched off and
 *            the context itself is re-sanitized field by field.
 *   Private: the grading definition, the generator parameters and seed, and
 *            the issuance plan. None of them is ever read here for output.
 *
 *   Grading: a tool item is graded by the same Path Tool Contract grader My
 *            Math Path and Live Challenge use, on the student's raw work,
 *            bounded and stripped of any verdict the browser attached. A field
 *            item is graded exactly as before.
 *
 * Firestore cannot store an array directly inside an array, and tool work is
 * full of coordinate pairs, so raw work and workspace drafts are stored as ONE
 * canonical JSON string each (the same choice the durable tool response
 * contract made) and parsed back when read.
 */

const mathPath = require("./mathPath");
// Arrays of arrays (data points, mapping arrows) cannot be stored in
// Firestore; an issued item's tool fields are stored as JSON (see the file).
const { readStoredItem, storableItem } = require("./secureItemStorage");

let modules = null;
async function sharedModules() {
  if (!modules) {
    const [runtimePolicy, secureTools, toolResponse, draftKeys] = await Promise.all([
      import("../shared/questionRuntimePolicy.mjs"),
      import("../shared/secureToolCertification.mjs"),
      import("../shared/serverGrading/toolResponseContract.mjs"),
      import("../shared/secureItemDraftKey.mjs"),
    ]);
    modules = { runtimePolicy, secureTools, toolResponse, draftKeys };
  }
  return modules;
}

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Raw tool work is small: a constructed line, a few intervals, a final
// equation, a 12-row table. The cap keeps a session document — which holds
// every answered item — far inside Firestore's 1 MB limit on a long Test.
const MAX_RAW_JSON = 12000;
// Workspace drafts are the tool's own internal state, so a reload on another
// device reopens the same construction. They live only on the OPEN question
// and are discarded when it is answered.
const MAX_WORKSPACE_DRAFT_JSON = 60000;
const MAX_WORKSPACE_DRAFT_ENTRIES = 40;

/*
 * The context of a word problem, as a secure item may show it.
 *
 * Tool contracts copy `context` whole, which is fine where hints are allowed
 * and is not a boundary at all: an authored unknown quantity's `value` would
 * ride along. Re-sanitized with the generic Path allowlist, and in a secure
 * mode the Problem Understanding scaffold — which walks the student through
 * the quantities and the relationship — is off, because it is assistance.
 */
function contextForMode(context, secure) {
  const sanitized = mathPath.sanitizeContext(context);
  if (!sanitized || !secure) return sanitized;
  return {
    ...sanitized,
    scaffold: { enabled: false, showQuantitiesStep: false, showRelationshipStep: false },
    interpretation: null,
  };
}

/** The public tool payload of an issued question, as `mode` may see it. */
async function toolPayloadForMode(question, mode) {
  const stored = mathPath.storedToolPayload(readStoredItem(question));
  if (!stored) return null;
  const { runtimePolicy, secureTools } = await sharedModules();
  const secure = runtimePolicy.isSecureRuntimeMode(mode);
  let payload = runtimePolicy.stripAssistanceForMode(stored, mode);
  payload = secureTools.applySecureToolSettings(payload, { secure });
  if (isObject(payload?.tool) && payload.tool.context) {
    payload = { ...payload, tool: { ...payload.tool, context: contextForMode(payload.tool.context, secure) } };
  }
  return payload;
}

/**
 * The question a browser receives for one secure-surface item.
 *
 * `runtimeMode` travels with it, so the shared question runtime renders the
 * item under the capability policy the SERVER chose — a payload that forgot to
 * say resolves to Secure Test, never to practice.
 */
async function publicItem(storedQuestion = {}, { mode } = {}) {
  const question = readStoredItem(storedQuestion) || {};
  const { runtimePolicy } = await sharedModules();
  const resolvedMode = runtimePolicy.resolveQuestionRuntimePolicy(mode).mode;
  const toolPayload = await toolPayloadForMode(question, resolvedMode);
  const sanitized = mathPath.buildSanitizedQuestion(question, {
    questionInstanceId: question.questionInstanceId,
    attemptsAllowed: question.attemptsAllowed,
    attemptsUsed: Number(question.attemptsUsed || 0),
    toolPayload,
  });
  const secure = runtimePolicy.isSecureRuntimeMode(resolvedMode);
  return {
    ...sanitized,
    context: contextForMode(question.context, secure),
    runtimeMode: resolvedMode,
  };
}

/** The secure rendering contract of a question or family, for a mode. */
async function certifyItem(question, { mode } = {}) {
  const { secureTools } = await sharedModules();
  return secureTools.certifySecureItem(question, { mode });
}

const parseJson = (text) => {
  try {
    const parsed = JSON.parse(String(text || ""));
    return parsed === undefined ? null : parsed;
  } catch {
    return null;
  }
};

/**
 * Raw tool work, bounded and stripped of verdicts and answer keys, as the
 * canonical JSON string a session stores. Null when there is none.
 * Throws `{ code: 'raw_too_large' }` rather than truncating: half a graph is
 * not the student's work.
 */
async function rawWorkJson(raw) {
  if (raw === undefined || raw === null) return null;
  const { toolResponse } = await sharedModules();
  const source = typeof raw === "string" ? parseJson(raw) : raw;
  if (!isObject(source)) return null;
  const json = toolResponse.canonicalToolWorkJson(source);
  if (json.length > MAX_RAW_JSON) {
    const error = new Error("Secure tool work is too large to record.");
    error.code = "raw_too_large";
    throw error;
  }
  return json === "null" || json === "{}" ? null : json;
}

/** The bounded raw work out of a stored or submitted payload. */
async function rawWorkOf(responsePayload) {
  if (!isObject(responsePayload)) return null;
  if (typeof responsePayload.rawJson === "string") {
    const json = await rawWorkJson(responsePayload.rawJson);
    return json ? parseJson(json) : null;
  }
  const json = await rawWorkJson(responsePayload.raw);
  return json ? parseJson(json) : null;
}

/**
 * A tool's own draft entries (the question draft store, keyed under the
 * secure item's draft key), bounded, as one JSON string.
 *
 * Accepted only inside `draftKey`'s family, so a session cannot be used to
 * carry anything else back to the device. Oversize drafts are dropped, not
 * truncated: the device copy still exists, and a cut-off tool state would
 * restore as something the student never built.
 */
async function workspaceDraftsJson(entries, draftKey) {
  if (!draftKey || !Array.isArray(entries)) return null;
  const { toolResponse, draftKeys } = await sharedModules();
  const kept = entries
    .filter((entry) => isObject(entry) && typeof entry.key === "string" && entry.key.length <= 240
      && draftKeys.belongsToSecureItemDraft(entry.key, draftKey))
    .slice(0, MAX_WORKSPACE_DRAFT_ENTRIES)
    .map((entry) => ({
      key: entry.key,
      savedAt: Number.isFinite(Number(entry.savedAt)) ? Number(entry.savedAt) : 0,
      ...(entry.savedAtIsEdit === true ? { savedAtIsEdit: true } : {}),
      // A draft value is the tool's internal state. Bounded with the same
      // limits as raw work and stripped of verdict keys, so a tampered client
      // cannot park a claimed result in it.
      value: toolResponse.boundToolWork(entry.value).work,
    }));
  if (!kept.length) return null;
  const json = JSON.stringify(kept);
  return json.length <= MAX_WORKSPACE_DRAFT_JSON ? json : null;
}

/** The draft key of an exam session's open item. */
async function examItemDraftKey(examSessionId, questionInstanceId) {
  const { draftKeys } = await sharedModules();
  return draftKeys.secureItemDraftKey({ surface: "exam", sessionId: examSessionId, questionInstanceId });
}

/**
 * The stored payload fields that carry tool work: `rawJson` always,
 * `workspaceDraftsJson` only when `includeWorkspaceDrafts` (an open item's
 * draft — never a recorded response).
 */
async function storedToolFields(responsePayload, { draftKey = null, includeWorkspaceDrafts = false } = {}) {
  if (!isObject(responsePayload)) return {};
  const rawJson = await rawWorkJson(typeof responsePayload.rawJson === "string" ? responsePayload.rawJson : responsePayload.raw);
  const drafts = includeWorkspaceDrafts
    ? await workspaceDraftsJson(
      Array.isArray(responsePayload.workspaceDrafts) ? responsePayload.workspaceDrafts : parseJson(responsePayload.workspaceDraftsJson),
      draftKey,
    )
    : null;
  return {
    ...(rawJson ? { rawJson } : {}),
    ...(drafts ? { workspaceDraftsJson: drafts } : {}),
  };
}

/** A stored draft, in the shape the browser restores from. */
function publicDraft(draft) {
  if (!isObject(draft)) return null;
  const payload = isObject(draft.responsePayload) ? draft.responsePayload : {};
  const { rawJson, workspaceDraftsJson: draftsJson, ...rest } = payload;
  const raw = typeof rawJson === "string" ? parseJson(rawJson) : null;
  const workspaceDrafts = typeof draftsJson === "string" ? parseJson(draftsJson) : null;
  return {
    ...draft,
    responsePayload: {
      ...rest,
      ...(isObject(raw) ? { raw } : {}),
      ...(Array.isArray(workspaceDrafts) ? { workspaceDrafts } : {}),
    },
  };
}

/** Which runtime mode an exam session's items run in. */
async function runtimeModeForSession(session = {}) {
  const { runtimePolicy } = await sharedModules();
  if (String(session?.examType || "") !== "courseTest") return runtimePolicy.QUESTION_RUNTIME_MODES.SECURE_TEST;
  return runtimePolicy.runtimeModeForCycleStage(session?.courseTest?.cycleStage);
}

const meaningful = (value) => {
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(meaningful);
  return isObject(value) && Object.values(value).some(meaningful);
};

/** Whether a stored payload holds any student work at all. */
async function payloadHasWork(responsePayload) {
  if (!isObject(responsePayload)) return false;
  const responses = isObject(responsePayload.responses) ? responsePayload.responses : {};
  if (Object.values(responses).some((value) => String(value ?? "").trim())) return true;
  const raw = await rawWorkOf(responsePayload);
  return meaningful(raw);
}

/**
 * Grade one secure-surface response. The single authority for the Test, the
 * Retest, Corrections and the teacher preview.
 *
 *   { isCorrect, score, parts, rejected, reason, detail }
 *
 * `rejected` means the work is not shaped like an answer to this item (an
 * interface problem — "complete both fields"), never that it is wrong.
 */
async function gradeItem(privateGrading, responsePayload = {}) {
  if (privateGrading?.pathToolId) {
    const raw = await rawWorkOf(responsePayload);
    if (!raw) {
      return { isCorrect: false, score: 0, parts: [], rejected: true, reason: "missing_tool_work", detail: "This item needs the work you built in its tool." };
    }
    const result = await mathPath.gradePathToolResponse(privateGrading, { raw });
    const score = Math.max(0, Math.min(1, Number(result?.score) || 0));
    return {
      isCorrect: result?.isCorrect === true,
      score: result?.isCorrect === true ? 1 : score,
      parts: Array.isArray(result?.parts) ? result.parts.map((part) => ({ id: String(part?.id || ""), isCorrect: part?.isCorrect === true })) : [],
      rejected: result?.rejected === true,
      reason: result?.reason || null,
      detail: result?.detail || null,
    };
  }
  const result = await mathPath.gradeResponse(privateGrading, responsePayload || {});
  return {
    isCorrect: result?.isCorrect === true,
    score: Number(result?.score) || 0,
    parts: Array.isArray(result?.fieldResults) ? result.fieldResults : [],
    rejected: false,
    reason: null,
    detail: null,
  };
}

/** Grade a response to an ISSUED item as stored on a secure document. */
async function gradeIssuedItem(storedItem, responsePayload = {}) {
  return gradeItem(readStoredItem(storedItem)?.privateGrading || null, responsePayload);
}

module.exports = {
  MAX_RAW_JSON,
  MAX_WORKSPACE_DRAFT_JSON,
  certifyItem,
  examItemDraftKey,
  gradeIssuedItem,
  publicDraft,
  readStoredItem,
  storableItem,
  runtimeModeForSession,
  storedToolFields,
  gradeItem,
  payloadHasWork,
  publicItem,
  rawWorkJson,
  rawWorkOf,
  sharedModules,
  toolPayloadForMode,
  workspaceDraftsJson,
};
