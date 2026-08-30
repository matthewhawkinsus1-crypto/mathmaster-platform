const crypto = require('crypto');
const { cellsForRow } = require('./pathFirestoreShape');

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

// Server-side question generation. Lives on this side of the wire on purpose:
// the browser must never see the parameters that produced an answer, and the
// browser generating its own numbers while the server graded the stored key
// would mark every correct answer wrong.
let generationModule = null;
async function pathGeneration() {
  if (!generationModule) generationModule = await import('../shared/pathQuestionGeneration.mjs');
  return generationModule;
}

/**
 * The question a student is actually given, from the family that was selected.
 *
 * A template becomes one concrete question here, deterministically from the
 * seed, and the concrete question is what gets stored on the session and
 * graded. A question with no generator is returned unchanged, which is every
 * question in the bank today — this is additive, and nothing that works now
 * changes shape.
 */
async function instantiateQuestion(question, seedKey) {
  const generation = await pathGeneration();
  if (!generation.hasPathGenerator(question)) return { question, parameters: null, reason: null };
  return generation.generatePathInstanceWithRetries(question, seedKey);
}

/**
 * Whether a template can really produce questions, checked by producing them.
 *
 * A template is never validated by inspection. `buildIssuePlan` is run against
 * SAMPLED INSTANCES, because an instance is the thing that reaches a student:
 * a template whose constraints are unsatisfiable, or that leaves a placeholder
 * unbound, or that generates an ungradeable question one draw in twenty, has
 * to fail at import rather than at nine in the morning in a classroom.
 */
async function buildTemplateIssuePlan(question, { samples = 8 } = {}) {
  const generation = await pathGeneration();
  if (!generation.hasPathGenerator(question)) {
    const plan = await buildIssuePlan(question);
    return { issuable: plan.issuable, reason: plan.reason, samples: 0 };
  }
  const drawn = generation.samplePathInstances(question, samples);
  const failed = drawn.find((entry) => !entry.question);
  if (failed) return { issuable: false, reason: failed.reason || 'generator_failed', samples: drawn.length };
  for (const entry of drawn) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await buildIssuePlan(entry.question);
    if (!plan.issuable) return { issuable: false, reason: `generated_${plan.reason}`, samples: drawn.length };
  }
  return { issuable: true, reason: null, samples: drawn.length };
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

// What a student is entitled to, resolved from whichever profile shape their
// district actually wrote. The Path server used to read no support profile at
// all, which meant extra attempts, calculator and reduced choices could not be
// authoritative on the Path however carefully they were authorized.
let supportEntitlementsModule = null;
async function supportEntitlements() {
  if (!supportEntitlementsModule) supportEntitlementsModule = await import('../shared/supportEntitlements.mjs');
  return supportEntitlementsModule;
}

/** Resolve one student's entitlements from their stored `grades/{id}.profile`. */
async function resolveEntitlements(rawProfile) {
  const module = await supportEntitlements();
  return module.resolveSupportEntitlements(rawProfile);
}

/** Attempts for a Path question, after any authorized extra-attempts support. */
async function attemptsFor(baseAttempts, entitlements) {
  const module = await supportEntitlements();
  return module.attemptsWithEntitlements(baseAttempts, entitlements);
}

/** Which authorized supports actually apply to this question. */
async function applicableSupportsFor(entitlements, question, options) {
  const module = await supportEntitlements();
  return module.applicableSupports(entitlements, question, options || {});
}

/** Fold the client's render/use report into the server's authorized set. */
async function reconcileSupports(input) {
  const module = await supportEntitlements();
  return module.reconcileSupportDelivery(input);
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
const authoredChoiceId = (choice, index) => (
  choice && typeof choice === 'object'
    ? String(choice.id || choice.value || `choice-${index + 1}`)
    : String(choice)
);

const authoredChoiceLabel = (choice) => (
  choice && typeof choice === 'object'
    ? String(choice.label ?? choice.text ?? choice.value ?? '')
    : String(choice)
);

// Author IDs such as "opt-1" are useful inside the bank, but must never become
// the browser's answer vocabulary. Otherwise a bank-wide convention where
// opt-1 is usually correct can be discovered from the network payload even
// after the buttons are shuffled.
//
// The runtime id is deterministic from the CONCRETE issued question and the
// visible choice list. A reload of the same question therefore keeps its ids,
// while a different generated instance gets a different namespace. Nothing in
// this hash depends on which choice is correct.
function choiceRuntimeNamespace(question = {}, sourceKey = 'question', choices = []) {
  const visibleSignature = (Array.isArray(choices) ? choices : [])
    .slice(0, 12)
    .map((choice) => authoredChoiceLabel(choice))
    .join('\u241f');
  return [
    question.id || question.familyId || question.questionType || 'path-question',
    question.prompt || '',
    sourceKey,
    visibleSignature,
  ].join('|');
}

function choiceRuntimeId(question, sourceKey, choices, choice, index) {
  return opaqueId(
    'choice',
    choiceRuntimeNamespace(question, sourceKey, choices),
    authoredChoiceId(choice, index),
    String(index),
  );
}

function choiceIdMap(question, sourceKey, choices) {
  const map = new Map();
  (Array.isArray(choices) ? choices : []).slice(0, 12).forEach((choice, index) => {
    map.set(
      authoredChoiceId(choice, index),
      choiceRuntimeId(question, sourceKey, choices, choice, index),
    );
  });
  return map;
}

function normalizeChoices(choices, question = {}, sourceKey = 'question') {
  return (Array.isArray(choices) ? choices : []).slice(0, 12).map((choice, index) => ({
    id: choiceRuntimeId(question, sourceKey, choices, choice, index),
    label: authoredChoiceLabel(choice),
  })).filter((choice) => choice.label !== '');
}

function normalizeResponseFields(fields = [], question = {}) {
  const safeSymbols = (value) => (Array.isArray(value) ? value : [])
    .map((symbol) => String(symbol || '').trim())
    .filter(Boolean)
    .slice(0, 16);
  return (Array.isArray(fields) ? fields : []).map((field, index) => {
    const answerFormat = field?.answerFormat || field?.inputContract?.format || null;
    const requiredSymbols = safeSymbols(field?.requiredSymbols || field?.inputContract?.requiredSymbols);
    return {
      id: String(field?.id || `response-${index + 1}`),
      label: String(field?.label || `Response ${index + 1}`),
      inputProfile: field?.inputProfile || 'text',
      unit: field?.unit || null,
      // Entry metadata is public presentation state, not grading state. Preserve
      // it so the client can guarantee that the expected notation is typeable,
      // while expected/accepted answers remain server-private.
      answerFormat: answerFormat ? String(answerFormat).slice(0, 40) : null,
      requiredSymbols,
      inputContract: answerFormat || requiredSymbols.length ? {
        format: answerFormat ? String(answerFormat).slice(0, 40) : null,
        requiredSymbols,
      } : null,
      // Short instruction rendered with the input ("Give your answer in interval
      // notation"). Presentation only.
      responseHint: field?.responseHint ? String(field.responseHint).slice(0, 160) : null,
      placeholder: field?.placeholder ? String(field.placeholder).slice(0, 60) : null,
      ...(Array.isArray(field?.choices) ? { choices: normalizeChoices(field.choices, question, `field:${String(field?.id || `response-${index + 1}`)}`) } : {}),
    };
  });
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
  if (stimulus.graph && typeof stimulus.graph === 'object') {
    const graph = stimulus.graph;
    const finiteNumber = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const visiblePoint = (point) => {
      const x = Number(Array.isArray(point) ? point[0] : point?.x);
      const y = Number(Array.isArray(point) ? point[1] : point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x,
        y,
        ...(point && !Array.isArray(point) && point.label ? { label:String(point.label).slice(0, 40) } : {}),
      };
    };
    clean.graph = {
      xMin: finiteNumber(graph.xMin, -6),
      xMax: finiteNumber(graph.xMax, 6),
      yMin: finiteNumber(graph.yMin, -6),
      yMax: finiteNumber(graph.yMax, 6),
      ariaLabel: graph.ariaLabel ? String(graph.ariaLabel).slice(0, 160) : null,
      points: (Array.isArray(graph.points) ? graph.points : []).slice(0, 24)
        .map(visiblePoint).filter(Boolean),
      lines: (Array.isArray(graph.lines) ? graph.lines : []).slice(0, 4)
        .map((line, index) => ({
          label: String(line?.label || `Line ${index + 1}`).slice(0, 60),
          boundaryStyle: String(line?.boundaryStyle || 'solid') === 'dashed' ? 'dashed' : 'solid',
          points: (Array.isArray(line?.points) ? line.points : []).slice(0, 2)
            .map(visiblePoint).filter(Boolean),
        }))
        .filter((line) => line.points.length === 2),
      // Curves are sent only as sampled visible coordinates. No function
      // coefficients/equation are admitted here, which lets a graph be the
      // stimulus for "write the equation" without shipping that answer in a
      // hidden functionSpec.
      curves: (Array.isArray(graph.curves) ? graph.curves : []).slice(0, 4)
        .map((curve, index) => ({
          label: String(curve?.label || `Curve ${index + 1}`).slice(0, 60),
          points: (Array.isArray(curve?.points) ? curve.points : []).slice(0, 32)
            .map(visiblePoint).filter(Boolean),
        }))
        .filter((curve) => curve.points.length >= 2),
      shading: (Array.isArray(graph.shading) ? graph.shading : []).slice(0, 4)
        .map((shade) => ({
          lineIndex: Math.max(0, Math.trunc(Number(shade?.lineIndex) || 0)),
          side: String(shade?.side || '') === 'above' ? 'above' : String(shade?.side || '') === 'below' ? 'below' : null,
        }))
        .filter((shade) => shade.side),
    };
  }
  if (stimulus.table && typeof stimulus.table === 'object') {
    clean.table = {
      headers: (Array.isArray(stimulus.table.headers) ? stimulus.table.headers : []).slice(0, 8).map((value) => String(value)),
      // Firestore cannot store arrays directly inside arrays. Persisted Path
      // bank/session rows therefore use { cells: [...] }, while older authored
      // content may still arrive as a plain row array. Normalize both to the
      // Firestore-safe shape before the question is stored in a session.
      rows: (Array.isArray(stimulus.table.rows) ? stimulus.table.rows : []).slice(0, 20)
        .map((row) => ({ cells: cellsForRow(row).slice(0, 8).map((value) => String(value)) })),
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
    // THE STANDARD THIS QUESTION IS ON. Public metadata, not an answer — the
    // student is entitled to know what they are practising, and a CCMR session
    // has to be able to say which standard and which assessment the question in
    // front of them serves. It has to travel per QUESTION rather than per
    // session because the routing engine descends into prerequisites: a session
    // targeting A.2(B) can legitimately issue an 8.5(I) question, and labelling
    // that with the session's target would be a lie.
    alignmentKey: displayAlignmentKey(
      Array.isArray(question.alignmentKeys) && question.alignmentKeys.length
        ? question.alignmentKeys[0]
        : question.alignmentKey || '',
    ),
    familyId: String(question.familyId || question.questionType || 'path-question'),
    familyVersion: Number(question.familyVersion) || 1,
    questionType: String(question.questionType || 'response'),
    activityRole: String(question.activityRole || 'practice'),
    difficultyBand: Number(question.difficultyBand) || 3,
    dok: Number(question.dok) || 1,
    calculatorPolicy: String(question.calculatorPolicy || 'inherit'),
    assessedConstruct: question.assessedConstruct || null,
    // Assessment context is instructional metadata, not answer data. Carry it
    // per issued question so CCMR practice can distinguish a real exam-format
    // item from a temporary course-foundation bridge during adaptive routing.
    assessmentContext: question.assessmentContext && typeof question.assessmentContext === 'object'
      ? (() => {
        const framework = String(question.assessmentContext.framework || 'course');
        const directAlignment = (Array.isArray(question.alignments) ? question.alignments : []).find((entry) => (
          String(entry?.framework || '') === framework && Boolean(String(entry?.domainId || '').trim())
        ));
        return {
          framework,
          domainId: String(question.assessmentContext.domainId || directAlignment?.domainId || ''),
          subtest: question.assessmentContext.subtest ? String(question.assessmentContext.subtest) : null,
          examStyle: question.assessmentContext.examStyle === true,
        };
      })()
      : null,
    assessmentBridgeFramework: question.assessmentBridgeFramework ? String(question.assessmentBridgeFramework) : null,
    assessmentItemFormat: question.assessmentItemFormat ? String(question.assessmentItemFormat) : null,
    examCalculatorMode: question.examCalculatorMode ? String(question.examCalculatorMode) : null,
    ccmrChallengeTier: Math.max(1, Math.min(3, Number(question.ccmrChallengeTier || 1) || 1)),
    ccmrFamilyRole: question.ccmrFamilyRole ? String(question.ccmrFamilyRole) : null,
    ccmrFidelity: question.ccmrFidelity && typeof question.ccmrFidelity === 'object' ? {
      version: Number(question.ccmrFidelity.version) || 2,
      variantKind: question.ccmrFidelity.variantKind ? String(question.ccmrFidelity.variantKind) : null,
      responseMode: question.ccmrFidelity.responseMode ? String(question.ccmrFidelity.responseMode) : null,
      officialReferenceIds: Array.isArray(question.ccmrFidelity.officialReferenceIds)
        ? question.ccmrFidelity.officialReferenceIds.map(String).slice(0, 8)
        : [],
    } : null,
    prompt: String(question.prompt || ''),
    choices: normalizeChoices(question.choices, question, 'question'),
    formulaLatex: question.formulaLatex ? String(question.formulaLatex) : null,
    responseFields: normalizeResponseFields(question.responseFields, question),
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
  const fields = (Array.isArray(question.responseFields) ? question.responseFields : []).map((field, index) => {
    const id = String(field?.id || `response-${index + 1}`);
    const isChoice = String(field?.inputProfile || '').toLowerCase() === 'choice';
    const hasFieldChoices = Array.isArray(field?.choices) && field.choices.length > 0;
    const sourceChoices = hasFieldChoices
      ? field.choices
      : (isChoice && Array.isArray(question.choices) ? question.choices : []);
    const sourceKey = hasFieldChoices ? `field:${id}` : 'question';
    const runtimeIds = isChoice && sourceChoices.length
      ? choiceIdMap(question, sourceKey, sourceChoices)
      : null;
    const remap = (value) => (
      runtimeIds && runtimeIds.has(String(value))
        ? runtimeIds.get(String(value))
        : value
    );
    return {
      id,
      expected: remap(field?.expected ?? field?.answer),
      accepted: [
        ...(Array.isArray(field?.accepted) ? field.accepted : []),
        ...(Array.isArray(field?.acceptedAnswers) ? field.acceptedAnswers : []),
      ].map(remap),
      numericTolerance: Number(field?.numericTolerance ?? explicit.numericTolerance ?? 1e-6),
      caseSensitive: Boolean(field?.caseSensitive ?? explicit.caseSensitive),
      equivalence: field?.equivalence ? String(field.equivalence) : null,
    };
  });
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
  // Alternatives supplement the primary key; they never replace it.
  const candidates = [field.expected, ...(Array.isArray(field.accepted) ? field.accepted : [])]
    .filter((value) => value !== undefined && value !== null);
  const equivalence = await answerEquivalence();
  return candidates.some((expected) => {
    const left = String(actual ?? '').trim();
    const right = String(expected ?? '').trim();
    if (field.caseSensitive && !Number.isFinite(Number(actual)) && !Number.isFinite(Number(expected))) {
      return left === right;
    }
    const tolerance = Math.max(0, Number(field.numericTolerance) || 0);
    if (field.equivalence === 'polynomialRelation') {
      return equivalence.samePolynomialEquationRelation(actual, expected, tolerance);
    }
    if (field.equivalence === 'absoluteLinearRelation') {
      return equivalence.sameAbsoluteValueLinearEquation(actual, expected, tolerance);
    }
    if (field.equivalence === 'modelEquation') {
      return equivalence.sameCommutativeModelEquation(actual, expected);
    }
    if (field.equivalence === 'setBuilder') {
      return equivalence.sameSetBuilderNotation(actual, expected, tolerance);
    }
    return equivalence.sameValue(actual, expected, tolerance);
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
  // An algebra auto-apply performs an algebraic step the student selected but
  // did not carry out. Every other ACCESS accommodation in `accommodations` is
  // deliberately absent from this check — text-to-speech, translation, large
  // text, contrast, extra time and a permitted calculator change how a student
  // reaches the mathematics, not whether they did it.
  const usedConstructSupport = (Array.isArray(supportUsage.accommodations) ? supportUsage.accommodations : [])
    .some((entry) => String(entry) === 'algebraAutoApply');
  return supportUsage.isMathematicallyIndependent !== false
    && !usedConstructSupport
    && !supportUsage.hintUsed
    && !supportUsage.teacherAssisted
    && !supportUsage.scaffoldUsed
    && !supportUsage.remediationUsed
    && !supportUsage.workedExampleUsed;
}

function supportTelemetry(supportUsage = {}) {
  const result = [];
  // PRESENTED means it actually rendered on the student's screen, not that
  // their profile contained it. Deriving "presented" from authorization is how
  // a compliance report comes to claim a support was delivered on a screen
  // that never showed it.
  const presented = Array.isArray(supportUsage.accommodationsPresented)
    ? supportUsage.accommodationsPresented
    // Older evidence documents only carried `accommodations`. Reading them as
    // presented keeps historical reports working rather than blanking them.
    : (supportUsage.accommodations || []);
  presented.forEach((supportType) => result.push({
    stage: 'presented',
    supportType: String(supportType),
    reducesMathematicalIndependence: false,
  }));
  // An ACCESS accommodation the student actually used. Explicitly does not
  // reduce mathematical independence: reading the question aloud, or in
  // Spanish, is not help with the mathematics.
  (Array.isArray(supportUsage.accommodations) ? supportUsage.accommodations : []).forEach((supportType) => {
    result.push({
      stage: 'used',
      supportType: String(supportType),
      // The one exception. An algebra auto-apply carries out a step the student
      // chose but did not perform, which is a different claim from having
      // solved it.
      reducesMathematicalIndependence: String(supportType) === 'algebraAutoApply',
    });
  });
  // Authorized, applicable to this question, and yet nothing put it on screen.
  // Recorded as its own stage so an administrator can find the tools that
  // cannot honour a support rather than discovering it from a parent.
  (Array.isArray(supportUsage.accommodationsNotDelivered) ? supportUsage.accommodationsNotDelivered : [])
    .forEach((supportType) => result.push({
      stage: 'authorizedNotPresented',
      supportType: String(supportType),
      reducesMathematicalIndependence: false,
    }));
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
  applicableSupportsFor,
  attemptsFor,
  reconcileSupports,
  resolveEntitlements,
  supportEntitlements,
  attemptSupport,
  buildPrivateSupport,
  pathSolutionSupport,
  buildIssuePlan,
  buildTemplateIssuePlan,
  instantiateQuestion,
  pathGeneration,
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
