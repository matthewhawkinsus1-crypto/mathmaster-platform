const crypto = require('crypto');

const DAY_MS = 24 * 60 * 60 * 1000;

// The Path Tool Contract is one file, shared with the browser and the Teacher
// Path Simulator, so the public allowlist and the server grader can never drift
// apart. It is ESM and this module is CommonJS, so it is loaded once, lazily,
// through a dynamic import — every caller here is already async.
let contractModule = null;
async function pathToolContracts() {
  if (!contractModule) contractModule = await import('../shared/pathToolContracts.mjs');
  return contractModule;
}

function canonicalAlignmentKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9_-]*:/i.test(raw)) {
    const [namespace, ...rest] = raw.split(':');
    return `${namespace.toLowerCase()}:${rest.join(':').trim().toUpperCase()}`;
  }
  return `texas:${raw.toUpperCase().replace(/\s+/g, '')}`;
}

function displayAlignmentKey(value) {
  return String(value || '').replace(/^texas:/i, '').trim().toUpperCase();
}

function opaqueId(prefix, ...parts) {
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 28);
  return `${prefix}_${hash}`;
}

function runtimeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeResponseFields(fields = []) {
  return (Array.isArray(fields) ? fields : []).map((field, index) => ({
    id: String(field?.id || `response-${index + 1}`),
    label: String(field?.label || `Response ${index + 1}`),
    inputProfile: field?.inputProfile || 'text',
    unit: field?.unit || null,
  }));
}

function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return null;
  return {
    scenario: String(context.scenario || ''),
    quantities: (Array.isArray(context.quantities) ? context.quantities : []).map((quantity, index) => ({
      id: String(quantity?.id || `quantity-${index + 1}`),
      name: String(quantity?.name || quantity?.label || `Quantity ${index + 1}`),
      symbol: String(quantity?.symbol || 'x'),
      unit: String(quantity?.unit || ''),
      isGiven: Boolean(quantity?.isGiven),
      givenValue: quantity?.isGiven ? (quantity?.givenValue ?? quantity?.value ?? null) : null,
      isUnknown: Boolean(quantity?.isUnknown),
    })),
    scaffold: {
      enabled: context.scaffold?.enabled !== false,
      showQuantitiesStep: context.scaffold?.showQuantitiesStep !== false,
      showRelationshipStep: context.scaffold?.showRelationshipStep !== false,
    },
    interpretation: context.interpretation ? {
      prompt: String(context.interpretation.prompt || 'What does this answer represent in the context?'),
      acceptedUnits: Array.isArray(context.interpretation.acceptedUnits) ? context.interpretation.acceptedUnits.slice(0, 12) : [],
      checkReasonableness: Boolean(context.interpretation.checkReasonableness),
      discreteDomainConstraint: Boolean(context.interpretation.discreteDomainConstraint),
    } : null,
  };
}

// `toolPayload` comes from buildPublicToolPayload, which the caller awaits.
// Passing it in rather than fetching it here keeps this function synchronous
// for the many call sites that do not need a tool.
function buildSanitizedQuestion(question, { questionInstanceId, attemptsAllowed, attemptsUsed = 0, toolPayload = null } = {}) {
  return {
    // The authentic tool, by allowlist, or nothing at all. A question whose
    // tool has no contract is not issued — it is never downgraded into the
    // generic fields below, because that would silently turn a graphing
    // question into "type your answer".
    ...(toolPayload ? {
      pathToolId: toolPayload.pathToolId,
      serverGradingVersion: toolPayload.serverGradingVersion,
      responseShape: toolPayload.responseShape,
      tool: toolPayload.tool,
    } : {}),
    questionInstanceId,
    familyId: String(question.familyId || question.questionType || 'path-question'),
    familyVersion: Number(question.familyVersion) || 1,
    questionType: String(question.questionType || 'response'),
    activityRole: String(question.activityRole || 'practice'),
    difficultyBand: Number(question.difficultyBand) || 3,
    dok: Number(question.dok) || 1,
    calculatorPolicy: String(question.calculatorPolicy || 'inherit'),
    assessedConstruct: question.assessedConstruct || null,
    prompt: String(question.prompt || ''),
    choices: Array.isArray(question.choices) ? question.choices.slice(0, 12).map((choice, index) => {
      if (choice && typeof choice === 'object') return { id: String(choice.id || choice.value || `choice-${index + 1}`), label: String(choice.label || choice.text || choice.value || '') };
      return { id: String(choice), label: String(choice) };
    }) : [],
    formulaLatex: question.formulaLatex ? String(question.formulaLatex) : null,
    responseFields: normalizeResponseFields(question.responseFields),
    context: sanitizeContext(question.context),
    attemptsAllowed,
    attemptsUsed,
    adaptiveRigor: question.adaptiveRigor ? {
      courseLevel: question.adaptiveRigor.courseLevel,
      readiness: question.adaptiveRigor.readiness,
      mode: question.adaptiveRigor.mode,
      preferredDifficultyBand: question.adaptiveRigor.preferredDifficultyBand,
      returnTargetBand: question.adaptiveRigor.returnTargetBand,
    } : null,
  };
}

function privateGradingDefinition(question) {
  const explicit = question.grading && typeof question.grading === 'object' ? question.grading : {};
  const fields = (Array.isArray(question.responseFields) ? question.responseFields : []).map((field, index) => ({
    id: String(field?.id || `response-${index + 1}`),
    expected: field?.expected,
    accepted: Array.isArray(field?.accepted) ? field.accepted : null,
    numericTolerance: Number(field?.numericTolerance ?? explicit.numericTolerance ?? 1e-6),
    caseSensitive: Boolean(field?.caseSensitive ?? explicit.caseSensitive),
  }));
  return { ...explicit, fields };
}

function hasGradeableDefinition(question) {
  const grading = privateGradingDefinition(question);
  return grading.fields.length > 0 && grading.fields.every((field) => field.expected !== undefined || field.accepted?.length);
}

// The tool payload as it was stored on the session, so re-sanitizing an
// already-issued question produces the same public payload it produced when it
// was first issued.
function storedToolPayload(question) {
  if (!question?.pathToolId) return null;
  return {
    pathToolId: question.pathToolId,
    serverGradingVersion: question.serverGradingVersion || 1,
    responseShape: question.responseShape || null,
    tool: question.tool || {},
  };
}

/**
 * Decide whether a bank question may be issued on a path, and with what.
 *
 * Fail closed: a question that names a tool this server cannot grade is not
 * issued at all. It is never downgraded into the generic response fields, which
 * would quietly turn a graphing question into "type your answer" and hand the
 * verdict back to the browser.
 *
 * A question that names no tool is the original field-graded kind, and is still
 * issued on the original grader.
 */
async function buildIssuePlan(question) {
  const contracts = await pathToolContracts();
  const toolId = contracts.resolvePathToolId(question);
  if (toolId) {
    const toolPayload = contracts.buildPublicToolPayload(question);
    // Named a supported tool but carries no answer to grade against.
    if (!toolPayload) return { issuable: false, reason: 'tool_has_no_gradable_answer', toolPayload: null, privateGrading: null };
    return {
      issuable: true,
      reason: null,
      toolPayload,
      privateGrading: contracts.buildPrivateToolGrading(question),
    };
  }
  const declaredTool = String(question?.pathToolId || question?.toolId || question?.type || '').trim();
  if (declaredTool) {
    return { issuable: false, reason: 'no_server_grader_for_this_tool', toolPayload: null, privateGrading: null };
  }
  if (!hasGradeableDefinition(question)) {
    return { issuable: false, reason: 'no_gradable_definition', toolPayload: null, privateGrading: null };
  }
  return { issuable: true, reason: null, toolPayload: null, privateGrading: privateGradingDefinition(question) };
}

function valuesEquivalent(actual, field) {
  const candidates = field.accepted?.length ? field.accepted : [field.expected];
  return candidates.some((expected) => {
    const actualNumber = Number(actual);
    const expectedNumber = Number(expected);
    if (String(actual ?? '').trim() !== '' && Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
      return Math.abs(actualNumber - expectedNumber) <= Math.max(0, Number(field.numericTolerance) || 0);
    }
    const left = String(actual ?? '').trim();
    const right = String(expected ?? '').trim();
    return field.caseSensitive ? left === right : left.toLowerCase() === right.toLowerCase();
  });
}

/**
 * Grade a path response.
 *
 * The grader is chosen from `grading.pathToolId`, which came out of the session
 * document the server wrote when it issued the question. Nothing the browser
 * sends selects a grader, and nothing the browser claims about correctness is
 * read: `responsePayload.isCorrect` is not consulted anywhere below.
 */
async function gradePathToolResponse(grading, responsePayload = {}) {
  const contracts = await pathToolContracts();
  if (grading?.pathToolId) {
    return contracts.gradePathResponse({
      privateGrading: grading,
      raw: responsePayload?.raw && typeof responsePayload.raw === 'object' ? responsePayload.raw : responsePayload,
    });
  }
  // No tool on this question: the original field grader still applies.
  const result = gradeResponse(grading, responsePayload);
  return { ...result, parts: result.fieldResults, rejected: false, reason: null };
}

function gradeResponse(grading, responsePayload = {}) {
  const responses = responsePayload.responses && typeof responsePayload.responses === 'object'
    ? responsePayload.responses
    : {};
  const fields = Array.isArray(grading?.fields) ? grading.fields : [];
  if (!fields.length) return { isCorrect: false, score: 0, fieldResults: [] };
  const fieldResults = fields.map((field) => ({ id: field.id, isCorrect: valuesEquivalent(responses[field.id], field) }));
  const correctCount = fieldResults.filter((field) => field.isCorrect).length;
  return { isCorrect: correctCount === fields.length, score: correctCount / fields.length, fieldResults };
}

function mathematicalIndependence(supportUsage = {}) {
  return supportUsage.isMathematicallyIndependent !== false
    && !supportUsage.hintUsed
    && !supportUsage.teacherAssisted
    && !supportUsage.scaffoldUsed
    && !supportUsage.remediationUsed
    && !supportUsage.workedExampleUsed;
}

function supportTelemetry(supportUsage = {}) {
  const result = [];
  (supportUsage.accommodations || []).forEach((supportType) => result.push({ stage: 'presented', supportType: String(supportType), reducesMathematicalIndependence: false }));
  const used = [
    ['hintUsed', 'hint', true],
    ['teacherAssisted', 'teacherAssistance', true],
    ['scaffoldUsed', 'mathScaffold', true],
    ['contextScaffoldUsed', 'contextScaffold', false],
    ['remediationUsed', 'remediation', true],
    ['workedExampleUsed', 'workedExample', true],
    ['calculatorUsed', 'calculator', false],
  ];
  used.forEach(([key, supportType, reducesMathematicalIndependence]) => {
    if (supportUsage[key]) result.push({ stage: 'used', supportType, reducesMathematicalIndependence });
  });
  return result;
}

function nextRetentionDue(now, successfulCheckCount) {
  const days = successfulCheckCount <= 0 ? 14 : successfulCheckCount === 1 ? 30 : 60;
  return now + days * DAY_MS;
}

module.exports = {
  buildIssuePlan,
  buildSanitizedQuestion,
  gradePathToolResponse,
  storedToolPayload,
  pathToolContracts,
  canonicalAlignmentKey,
  displayAlignmentKey,
  gradeResponse,
  hasGradeableDefinition,
  mathematicalIndependence,
  nextRetentionDue,
  opaqueId,
  privateGradingDefinition,
  runtimeId,
  supportTelemetry,
};
