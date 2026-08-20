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

// The legacy field-graded branch, shared with the coverage index and the
// promotion gate so all three mean the same thing by "gradeable".
let legacyModule = null;
async function legacyFieldGrading() {
  if (!legacyModule) legacyModule = await import('../shared/legacyFieldGrading.mjs');
  return legacyModule;
}

let answerEquivalenceModule = null;
async function answerEquivalence() {
  if (!answerEquivalenceModule) answerEquivalenceModule = await import('../shared/answerEquivalence.mjs');
  return answerEquivalenceModule;
}

// Feedback, hints and the solution review. Loaded the same lazy way, and shared
// with the Teacher Path Simulator so a teacher previewing a question sees the
// student's actual sequence rather than a teacher-only summary.
let solutionSupportModule = null;
async function pathSolutionSupport() {
  if (!solutionSupportModule) solutionSupportModule = await import('../shared/pathSolutionSupport.mjs');
  return solutionSupportModule;
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

// The response fields, by allowlist.
//
// `choices` travels because a multiple-choice question is unanswerable without
// the options — but only as ids and labels, never as the author wrote them. An
// author writing `choices: [{ id: 'a', label: '…', correct: true }]` would
// otherwise have shipped the answer key inside a field the allowlist had just
// admitted, which is the exact hole the tool contract exists to close.
function normalizeChoices(choices) {
  return (Array.isArray(choices) ? choices : []).slice(0, 12).map((choice, index) => {
    if (choice && typeof choice === 'object') {
      return {
        id: String(choice.id || choice.value || `choice-${index + 1}`),
        label: String(choice.label ?? choice.text ?? choice.value ?? ''),
      };
    }
    return { id: String(choice), label: String(choice) };
  }).filter((choice) => choice.label !== '');
}

function normalizeResponseFields(fields = []) {
  return (Array.isArray(fields) ? fields : []).map((field, index) => ({
    id: String(field?.id || `response-${index + 1}`),
    label: String(field?.label || `Response ${index + 1}`),
    inputProfile: field?.inputProfile || 'text',
    unit: field?.unit || null,
    // Short instruction rendered with the input ("Give your answer in interval
    // notation"). Presentation only.
    responseHint: field?.responseHint ? String(field.responseHint).slice(0, 160) : null,
    placeholder: field?.placeholder ? String(field.placeholder).slice(0, 60) : null,
    ...(Array.isArray(field?.choices) ? { choices: normalizeChoices(field.choices) } : {}),
  }));
}

// Question material a student must SEE to answer: the table they are reading,
// the ordered pairs they are classifying, the worked steps in an error-analysis
// item. Allowlisted field by field and coerced to primitives, so an authoring
// key nobody anticipated cannot ride along.
function sanitizeStimulus(stimulus) {
  if (!stimulus || typeof stimulus !== 'object') return null;
  const clean = {
    kind: String(stimulus.kind || 'expressions'),
    title: stimulus.title ? String(stimulus.title).slice(0, 140) : null,
    note: stimulus.note ? String(stimulus.note).slice(0, 300) : null,
  };
  if (stimulus.table && typeof stimulus.table === 'object') {
    clean.table = {
      headers: (Array.isArray(stimulus.table.headers) ? stimulus.table.headers : []).slice(0, 8).map((value) => String(value)),
      rows: (Array.isArray(stimulus.table.rows) ? stimulus.table.rows : []).slice(0, 20)
        .map((row) => (Array.isArray(row) ? row : []).slice(0, 8).map((value) => String(value))),
    };
  }
  if (Array.isArray(stimulus.orderedPairs)) {
    clean.orderedPairs = stimulus.orderedPairs.slice(0, 24)
      .map((pair) => (Array.isArray(pair)
        ? { x: Number(pair[0]), y: Number(pair[1]) }
        : { x: Number(pair?.x), y: Number(pair?.y) }))
      .filter((pair) => Number.isFinite(pair.x) && Number.isFinite(pair.y));
  }
  if (Array.isArray(stimulus.expressions)) {
    clean.expressions = stimulus.expressions.slice(0, 12).map((value) => String(value).slice(0, 200));
  }
  if (Array.isArray(stimulus.steps)) {
    clean.steps = stimulus.steps.slice(0, 10).map((step, index) => ({
      id: String(step?.id || `step-${index + 1}`),
      label: String(step?.label || `Step ${index + 1}`).slice(0, 60),
      work: String(step?.work ?? '').slice(0, 200),
    }));
  }
  if (Array.isArray(stimulus.items)) {
    clean.items = stimulus.items.slice(0, 12).map((item, index) => ({
      id: String(item?.id || `item-${index + 1}`),
      label: String(item?.label ?? '').slice(0, 200),
    }));
  }
  return clean;
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
    choices: normalizeChoices(question.choices),
    formulaLatex: question.formulaLatex ? String(question.formulaLatex) : null,
    responseFields: normalizeResponseFields(question.responseFields),
    // What the student has to look at to answer. Never anything they have to
    // work out.
    stimulus: sanitizeStimulus(question.stimulus),
    representation: question.representation ? String(question.representation) : null,
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
  // A question that NAMES a tool this server cannot grade fails closed. Note
  // `questionType` is deliberately not consulted: "response" is the generic
  // question category, not a tool, and reading it as one would reject every
  // legacy field-graded question in the bank.
  const legacy = await legacyFieldGrading();
  const declaredTool = legacy.declaredToolId(question);
  if (declaredTool) {
    return { issuable: false, reason: 'no_server_grader_for_this_tool', toolPayload: null, privateGrading: null };
  }
  if (!legacy.hasFieldGradableDefinition(question)) {
    return { issuable: false, reason: 'no_gradable_definition', toolPayload: null, privateGrading: null };
  }
  return { issuable: true, reason: null, toolPayload: null, privateGrading: privateGradingDefinition(question) };
}

async function valuesEquivalent(actual, field) {
  const candidates = field.accepted?.length ? field.accepted : [field.expected];
  const equivalence = await answerEquivalence();
  return candidates.some((expected) => {
    const left = String(actual ?? '').trim();
    const right = String(expected ?? '').trim();
    if (field.caseSensitive && !Number.isFinite(Number(actual)) && !Number.isFinite(Number(expected))) {
      return left === right;
    }
    return equivalence.sameValue(actual, expected, Math.max(0, Number(field.numericTolerance) || 0));
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
  const result = await gradeResponse(grading, responsePayload);
  return { ...result, parts: result.fieldResults, rejected: false, reason: null };
}

async function gradeResponse(grading, responsePayload = {}) {
  const responses = responsePayload.responses && typeof responsePayload.responses === 'object'
    ? responsePayload.responses
    : {};
  const fields = Array.isArray(grading?.fields) ? grading.fields : [];
  if (!fields.length) return { isCorrect: false, score: 0, fieldResults: [] };
  const fieldResults = await Promise.all(fields.map(async (field) => ({ id: field.id, isCorrect: await valuesEquivalent(responses[field.id], field) })));
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

/**
 * The private support bundle for a question the server is about to issue.
 *
 * Kept next to `privateGrading` on the session document and never included in
 * anything sanitizeQuestion returns. Released one piece at a time by
 * `attemptSupport` below.
 */
async function buildPrivateSupport(question) {
  const support = await pathSolutionSupport();
  return support.buildPrivateSupport(question);
}

/** What the student is told about the attempt that just happened. */
async function attemptSupport(args) {
  const support = await pathSolutionSupport();
  return support.buildAttemptSupportPayload(args);
}

module.exports = {
  attemptSupport,
  buildPrivateSupport,
  pathSolutionSupport,
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
