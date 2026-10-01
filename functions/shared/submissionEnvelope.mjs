/*
 * THE STUDENT SUBMISSION ENVELOPE — WHAT A DEVICE SENDS, AND HOW IT IS READ.
 *
 * Split from submissionIngestion.mjs so the student app can build and read
 * envelopes without importing the server half, which grades through the
 * shared grading registry and therefore loads every tool's grader. Ingestion
 * re-exports everything here, so server code and tests see one module.
 *
 * Pure.
 */
import { normalizeDeliveryPin } from './questionGenerationIdentity.mjs';
import { normalizeToolResponse } from './serverGrading/toolResponseContract.mjs';
import { SUBMISSION_DISPOSITION } from './studentSubmissionDisposition.mjs';

export const SUBMISSION_ENVELOPE_SCHEMA_VERSION = 1;

/** Kinds that carry academic credit and are therefore ingested here. */
export const INGESTIBLE_KINDS = Object.freeze(['ordinarySubmission', 'stepSubmission', 'questionReplacement']);

/** One call carries a whole stalled queue without becoming a write amplifier. */
export const MAX_ENVELOPES_PER_CALL = 25;

/*
 * Anything that would let a browser hand itself an answer or a grade.
 *
 * The envelope is built from a student's device, so this is checked when it is
 * built AND when it is read. `isCorrect` and `score` are deliberately absent:
 * a record legitimately carries a status and a partial credit, and both are
 * bounded below by the server's own read rather than by trusting the client.
 */
export const FORBIDDEN_ENVELOPE_FIELDS = Object.freeze([
  'answerKey',
  'acceptedAnswers',
  'answerFields',
  'solution',
  'seed',
  'secureQuestion',
  'gradingContract',
  'testCycle',
  'testCycleGrades',
]);

/*
 * Step Algebra records use `accepted` as a verdict. It is safe only in that
 * narrow boolean shape. Authoring contracts also use `accepted` for alternate
 * answers, so every string, array, object, number, or null value remains secure
 * answer-key material and must never cross the student submission boundary.
 */
const forbiddenEnvelopeEntry = (key, value) => (
  FORBIDDEN_ENVELOPE_FIELDS.includes(key)
  || (key === 'accepted' && typeof value !== 'boolean')
);

const text = (value) => String(value ?? '');
const trimmed = (value) => text(value).trim();
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

const containsForbiddenField = (value, depth = 0) => {
  if (depth > 6 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => containsForbiddenField(entry, depth + 1));
  return Object.entries(value).some(([key, nested]) => (
    forbiddenEnvelopeEntry(key, nested) || containsForbiddenField(nested, depth + 1)
  ));
};

/*
 * THE RAW WORK OF ONE STEP ALGEBRA STEP (`stepWork`, step submissions only).
 *
 * A step submission used to carry nothing but the browser's own record, so
 * the server could only bound the credit the browser claimed. It now carries
 * the step itself, and the server derives the credit from it
 * (serverGrading/stepAlgebraStepVerification.mjs):
 *
 *   version        STEP_WORK_VERSION
 *   surface        'equation' | 'relation' | 'intercept'
 *   action         'balanced-move' | 'inefficient-move' | 'rejected-move'
 *                  | 'rewrite' | 'relation-step' | 'intercept-check'
 *   before/after   the state before and after the step: { left, right } for
 *                  an equation; { special, connective, branches } for a
 *                  relation (the workspace's own expressions, never LaTeX)
 *   operation      a balanced move: { operation, operand, placementBySide }
 *   transition     a relation step: the move the workspace validated
 *   kind, label    which tool made a rewrite, and its display name
 *   supportLevel   the workspace's support level (1-5)
 *   zeroVariable   an intercept sub-solve: the letter set to 0
 *   intercept/point  an intercept check: which intercept, the typed pair
 *
 * NO VERDICT TRAVELS HERE: no earned, possible, productive or accepted flag,
 * and no expected value. Every string is the student's own work. A value of
 * the wrong type or size makes the whole field unreadable (null) rather than
 * half-read: an expression is never truncated into a different expression.
 * Pure and light — the student app imports this module.
 */
export const STEP_WORK_VERSION = 1;
export const STEP_WORK_LIMITS = Object.freeze({
  // A whole step: two states, an operation, a label. The workspaces write a
  // few hundred characters (a four-branch absolute-value split is ~1 KB);
  // anything larger is not a step they produced.
  maxJsonLength: 16_000,
  maxExpressionLength: 1_000,
  // A step's display label ("Distribute -3 over (2x + 5)"). The shared step
  // builders bound the label they record to this same length, so the label
  // the server records is always the label the browser recorded.
  maxLabelLength: 400,
  maxKindLength: 40,
  maxBranches: 8,
  maxBranchExpressions: 5,
  maxPointLength: 120,
  maxSupportLevelLength: 24,
});
const STEP_WORK_SURFACES = Object.freeze(['equation', 'relation', 'intercept']);
const STEP_WORK_ACTIONS = Object.freeze([
  'balanced-move', 'inefficient-move', 'rejected-move', 'rewrite', 'relation-step', 'intercept-check',
]);
const STEP_OPERATIONS = Object.freeze(['add', 'subtract', 'multiply', 'divide']);
const RELATION_TRANSITION_KINDS = Object.freeze(['equivalentRewrite', 'balancedOperation', 'absoluteSplit', 'squareRoot', 'solutionClaim']);
const RELATION_SYMBOLS = Object.freeze(['=', '<', '<=', '>', '>=']);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
// A string within `max` characters, or null. Never truncated: a shortened
// expression is a different expression.
const boundedString = (value, max) => (typeof value === 'string' && value.length <= max ? value : null);
const XY = Object.freeze(['x', 'y']);

const stepEquation = (value) => {
  if (!isPlainObject(value)) return null;
  const left = boundedString(value.left, STEP_WORK_LIMITS.maxExpressionLength);
  const right = boundedString(value.right, STEP_WORK_LIMITS.maxExpressionLength);
  return left !== null && right !== null ? { left, right } : null;
};

const stepRelation = (value) => {
  if (!isPlainObject(value)) return null;
  const branches = Array.isArray(value.branches) ? value.branches : [];
  if (branches.length > STEP_WORK_LIMITS.maxBranches) return null;
  const read = branches.map((branch) => {
    if (!isPlainObject(branch) || !Array.isArray(branch.expressions) || !Array.isArray(branch.relations)) return null;
    if (branch.expressions.length > STEP_WORK_LIMITS.maxBranchExpressions || branch.relations.length > STEP_WORK_LIMITS.maxBranchExpressions) return null;
    const expressions = branch.expressions.map((expression) => boundedString(expression, STEP_WORK_LIMITS.maxExpressionLength));
    const relations = branch.relations.map((relation) => (RELATION_SYMBOLS.includes(relation) ? relation : null));
    return expressions.includes(null) || relations.includes(null) ? null : { expressions, relations };
  });
  if (read.includes(null)) return null;
  return {
    special: value.special === 'noSolution' || value.special === 'allReals' ? value.special : null,
    connective: value.connective === 'OR' || value.connective === 'AND' ? value.connective : null,
    branches: read,
  };
};

// Where an additive move was written, exactly as the engine reads it
// (applyAdditiveOperationAtPlacement): an object placement, or none.
const stepPlacement = (value) => {
  if (!isPlainObject(value)) return null;
  const index = Number(value.termIndex);
  return {
    kind: ['before', 'after', 'under'].includes(value.kind) ? value.kind : 'end',
    termIndex: Number.isNaN(index) ? 0 : Math.max(-1000, Math.min(1000, index)),
  };
};

const stepOperation = (value) => {
  if (!isPlainObject(value) || !STEP_OPERATIONS.includes(value.operation)) return null;
  const operand = boundedString(value.operand, STEP_WORK_LIMITS.maxExpressionLength);
  if (operand === null) return null;
  const placement = isPlainObject(value.placementBySide) ? value.placementBySide : null;
  return {
    operation: value.operation,
    operand,
    placementBySide: placement ? { left: stepPlacement(placement.left), right: stepPlacement(placement.right) } : null,
  };
};

const branchIndex = (value) => {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < STEP_WORK_LIMITS.maxBranches ? index : 0;
};

// The validation context the relation workspace checked the step with
// (algebraRelationFoundation.mjs validateRelationTransition reads these keys).
const stepTransition = (value) => {
  if (!isPlainObject(value) || !RELATION_TRANSITION_KINDS.includes(value.kind)) return null;
  if (value.kind === 'balancedOperation') {
    if (!STEP_OPERATIONS.includes(value.operation)) return null;
    const operandExpression = boundedString(value.operandExpression, STEP_WORK_LIMITS.maxExpressionLength);
    const indices = Array.isArray(value.branchIndices) ? value.branchIndices : [value.branchIndices];
    if (operandExpression === null || indices.length > STEP_WORK_LIMITS.maxBranches) return null;
    return {
      kind: value.kind,
      operation: value.operation,
      operandExpression,
      branchIndices: indices.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < STEP_WORK_LIMITS.maxBranches),
    };
  }
  if (value.kind === 'absoluteSplit') {
    return { kind: value.kind, branchIndex: branchIndex(value.branchIndex), structure: value.structure === 'and' ? 'and' : value.structure === 'or' ? 'or' : null };
  }
  if (value.kind === 'squareRoot') return { kind: value.kind, branchIndex: branchIndex(value.branchIndex) };
  if (value.kind === 'solutionClaim') {
    return { kind: value.kind, claim: value.claim === 'noSolution' || value.claim === 'allReals' ? value.claim : null };
  }
  return { kind: value.kind };
};

/** The step's raw work, bounded and typed — or null when it cannot be read whole. */
export const normalizeStepWork = (raw) => {
  if (!isPlainObject(raw) || Number(raw.version) !== STEP_WORK_VERSION) return null;
  if (!STEP_WORK_SURFACES.includes(raw.surface) || !STEP_WORK_ACTIONS.includes(raw.action)) return null;
  const work = { version: STEP_WORK_VERSION, surface: raw.surface, action: raw.action };
  if (raw.kind != null) {
    const kind = boundedString(raw.kind, STEP_WORK_LIMITS.maxKindLength);
    if (kind === null) return null;
    work.kind = kind;
  }
  // Display text only; never read as mathematics.
  if (typeof raw.label === 'string') work.label = raw.label.slice(0, STEP_WORK_LIMITS.maxLabelLength);
  if (raw.supportLevel != null) {
    const level = typeof raw.supportLevel === 'number'
      ? (Number.isFinite(raw.supportLevel) ? raw.supportLevel : null)
      : boundedString(raw.supportLevel, STEP_WORK_LIMITS.maxSupportLevelLength);
    if (level !== null) work.supportLevel = level;
  }
  if (raw.surface === 'intercept') {
    const point = boundedString(raw.point, STEP_WORK_LIMITS.maxPointLength);
    if (!XY.includes(raw.intercept) || point === null) return null;
    work.intercept = raw.intercept;
    work.point = point;
  } else {
    const state = raw.surface === 'relation' ? stepRelation : stepEquation;
    const before = state(raw.before);
    if (!before) return null;
    work.before = before;
    if (raw.after != null) {
      const after = state(raw.after);
      if (!after) return null;
      work.after = after;
    }
  }
  if (raw.surface === 'equation') {
    if (raw.operation != null) {
      const operation = stepOperation(raw.operation);
      if (!operation) return null;
      work.operation = operation;
    }
    if (raw.zeroVariable != null) {
      if (!XY.includes(raw.zeroVariable)) return null;
      work.zeroVariable = raw.zeroVariable;
    }
  }
  if (raw.surface === 'relation' && raw.transition != null) {
    const transition = stepTransition(raw.transition);
    if (!transition) return null;
    work.transition = transition;
  }
  return JSON.stringify(work).length <= STEP_WORK_LIMITS.maxJsonLength ? work : null;
};

export const assertEnvelopeCarriesNoSecureData = (candidate) => {
  if (candidate?.secure === true) throw new Error('Secure assessment work cannot be ingested as an ordinary submission.');
  if (containsForbiddenField(candidate)) {
    throw new Error('A submission envelope may not carry answer keys, generator seeds or secure assessment data.');
  }
};

/**
 * The section state the browser observed AT CAPTURE.
 *
 * This is the witness that makes "the teacher closed Classwork while this
 * answer sat in the queue" distinguishable from "the student answered after
 * the section was already closed". It is not authorization on its own — the
 * server still re-reads the assignment — but it is the only record of the
 * moment that a later teacher edit cannot rewrite.
 */
export const captureSectionAccessProof = ({ sectionAccess = null, capturedAt = Date.now() } = {}) => {
  if (!sectionAccess || typeof sectionAccess !== 'object') return null;
  return {
    role: trimmed(sectionAccess.role) || null,
    enabled: sectionAccess.enabled === true,
    isOpen: sectionAccess.isOpen !== false,
    status: trimmed(sectionAccess.status) || null,
    overrideChangedAt: sectionAccess.override?.changedAt ? text(sectionAccess.override.changedAt) : null,
    capturedAt: finite(capturedAt, Date.now()),
  };
};

/**
 * The live Classwork/Practice section state, in the shape the capture-time
 * comparison reads.
 *
 * Deliberately NOT `manualSectionCloseAt`, which returns null both for "this
 * section is open" and for "this section is closed but nothing recorded when".
 * Those two must stay distinguishable: the first accepts queued work, the
 * second is the unprovable case that keeps it for review.
 */
export const resolveLiveSectionAccess = ({ assignment, activityRole, classId = null } = {}) => {
  const role = trimmed(activityRole).toLowerCase();
  if (!['classwork', 'practice'].includes(role)) return { role, enabled: false, isOpen: true, override: null };
  const config = assignment?.sectionAccess?.[role] || {};
  const overrides = config.overridesByClassId && typeof config.overridesByClassId === 'object' ? config.overridesByClassId : {};
  const override = classId ? overrides[trimmed(classId)] || null : null;
  const overrideState = trimmed(override?.state).toLowerCase();
  const defaultState = trimmed(config.defaultState || assignment?.sectionAccessDefaults?.[role] || 'open').toLowerCase();
  const status = ['open', 'closed'].includes(overrideState) ? overrideState : (defaultState === 'closed' ? 'closed' : 'open');
  return {
    role,
    enabled: true,
    isOpen: status === 'open',
    status,
    override: override ? { state: overrideState || null, changedAt: override.changedAt || null } : null,
  };
};

/**
 * Build the envelope a student's device sends.
 *
 * `record` is the browser's attempt record. It is carried because the ordinary
 * assignment path has always been allowed to write it, and it is the only thing
 * that can mark a question type the server cannot mark. `response` is the raw
 * student work; wherever it is present and the question is server-gradeable it
 * OVERRIDES the record's verdict at ingestion.
 */
export const buildSubmissionEnvelope = ({
  actionId,
  kind,
  studentId,
  assignmentId,
  questionIndex,
  questionId = null,
  variantIndex = 0,
  activityRole,
  capturedAt = Date.now(),
  previousTotalAttempts = 0,
  record,
  response = null,
  supportUsage = null,
  assignmentSupportUsage = null,
  hasClassworkGrade = false,
  hasDolGrade = false,
  timedSectionAccess = null,
  capturedSectionAccess = null,
  checkpointDocumentId = null,
  timeSpentSeconds = 0,
  // How many times this device has already tried to deliver this submission.
  // The server's escalation from `retryable` to `needs-review` reads it, and
  // without it a week-old submission retries forever and is never surfaced.
  deliveryAttempts = 0,
  // Which instance of a question-family slot this work answers (a delivery
  // pin: allocation index, seat basis, family version, fingerprint). It names
  // the question the student saw; it is not an answer and holds no key.
  familyDelivery = null,
  // A step submission's raw step (normalizeStepWork above). The server
  // derives the step's credit from it; absent, the record is sanitized.
  stepWork = null,
} = {}) => {
  if (!INGESTIBLE_KINDS.includes(kind)) throw new Error('Only grade-bearing student actions are ingested.');
  if (!trimmed(actionId)) throw new Error('A submission envelope requires its durable action id.');
  if (!trimmed(studentId) || !trimmed(assignmentId) || !Number.isInteger(Number(questionIndex))) {
    throw new Error('A submission envelope requires student, assignment and question identity.');
  }
  const envelope = {
    schemaVersion: SUBMISSION_ENVELOPE_SCHEMA_VERSION,
    actionId: trimmed(actionId),
    kind,
    studentId: trimmed(studentId),
    assignmentId: trimmed(assignmentId),
    questionIndex: Number(questionIndex),
    questionId: trimmed(questionId) || null,
    variantIndex: Math.max(0, finite(variantIndex, 0)),
    activityRole: trimmed(activityRole).toLowerCase() || null,
    capturedAt: finite(capturedAt, Date.now()),
    previousTotalAttempts: Math.max(0, finite(previousTotalAttempts, 0)),
    record: record && typeof record === 'object' ? record : null,
    response: response && typeof response === 'object' ? response : null,
    supportUsage: supportUsage && typeof supportUsage === 'object' ? supportUsage : null,
    assignmentSupportUsage: assignmentSupportUsage && typeof assignmentSupportUsage === 'object' ? assignmentSupportUsage : null,
    hasClassworkGrade: hasClassworkGrade === true,
    hasDolGrade: hasDolGrade === true,
    timedSectionAccess: timedSectionAccess || null,
    capturedSectionAccess: capturedSectionAccess || null,
    checkpointDocumentId: trimmed(checkpointDocumentId) || null,
    timeSpentSeconds: Math.max(0, Math.min(86_400, finite(timeSpentSeconds, 0))),
    deliveryAttempts: Math.max(0, Math.min(100_000, finite(deliveryAttempts, 0))),
    familyDelivery: normalizeDeliveryPin(familyDelivery),
    stepWork: kind === 'stepSubmission' ? normalizeStepWork(stepWork) : null,
  };
  assertEnvelopeCarriesNoSecureData(envelope);
  return envelope;
};

/** Read an envelope that arrived over the wire, keeping only what is defined. */
export const normalizeSubmissionEnvelope = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  if (!INGESTIBLE_KINDS.includes(trimmed(raw.kind))) return null;
  if (!trimmed(raw.actionId) || !trimmed(raw.assignmentId)) return null;
  if (!Number.isInteger(Number(raw.questionIndex)) || Number(raw.questionIndex) < 0) return null;
  if (raw.secure === true || containsForbiddenField(raw)) return null;
  return {
    schemaVersion: finite(raw.schemaVersion, 1),
    actionId: trimmed(raw.actionId).slice(0, 200),
    kind: trimmed(raw.kind),
    assignmentId: trimmed(raw.assignmentId),
    questionIndex: Number(raw.questionIndex),
    questionId: trimmed(raw.questionId) || null,
    variantIndex: Math.max(0, finite(raw.variantIndex, 0)),
    activityRole: trimmed(raw.activityRole).toLowerCase() || null,
    capturedAt: finite(raw.capturedAt, 0) || null,
    previousTotalAttempts: Math.max(0, finite(raw.previousTotalAttempts, 0)),
    record: raw.record && typeof raw.record === 'object' ? raw.record : null,
    // A registry tool's structured work is re-bounded here: the device that
    // built it is not trusted to have run the builder.
    response: raw.response && typeof raw.response === 'object'
      ? (normalizeToolResponse(raw.response) || raw.response)
      : null,
    supportUsage: raw.supportUsage && typeof raw.supportUsage === 'object' ? raw.supportUsage : null,
    assignmentSupportUsage: raw.assignmentSupportUsage && typeof raw.assignmentSupportUsage === 'object' ? raw.assignmentSupportUsage : null,
    hasClassworkGrade: raw.hasClassworkGrade === true,
    hasDolGrade: raw.hasDolGrade === true,
    timedSectionAccess: raw.timedSectionAccess && typeof raw.timedSectionAccess === 'object' ? raw.timedSectionAccess : null,
    capturedSectionAccess: raw.capturedSectionAccess && typeof raw.capturedSectionAccess === 'object' ? raw.capturedSectionAccess : null,
    checkpointDocumentId: trimmed(raw.checkpointDocumentId) || null,
    timeSpentSeconds: Math.max(0, Math.min(86_400, finite(raw.timeSpentSeconds, 0))),
    // Bounded: it only ever moves an unprovable retry to `needs-review`, and a
    // device inflating it can only ask for its own work to be looked at.
    deliveryAttempts: Math.max(0, Math.min(100_000, finite(raw.deliveryAttempts, 0))),
    // Malformed pins are dropped, never half-trusted.
    familyDelivery: normalizeDeliveryPin(raw.familyDelivery),
    // Re-bounded here, on the device and on the server alike: a step's work
    // that cannot be read whole is dropped, and the step is then sanitized
    // exactly as a step from a client built before step work existed.
    stepWork: trimmed(raw.kind) === 'stepSubmission' ? normalizeStepWork(raw.stepWork) : null,
  };
};

export { SUBMISSION_DISPOSITION };
