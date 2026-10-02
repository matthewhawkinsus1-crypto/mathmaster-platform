/*
 * A STEP ALGEBRA STEP SUBMISSION IS CREDITED BY THE SERVER, FROM ITS WORK.
 *
 * Before: every committed step reached the server as a `stepSubmission`
 * envelope carrying the browser's whole attempt record, and ingestion could
 * only sanitize it (sanitizeClientAttemptRecord: never `correct`, partial
 * credit capped at 90). A forged step envelope therefore earned up to 90% of
 * any Step Algebra question without the work.
 *
 * Now the workspaces put the step's raw work in the envelope (`stepWork`) and
 * ingestion (submissionIngestion.mjs buildIngestedAttempt) derives the step's
 * credit itself — the same stepGrade, through the same recordQuestionStep, on
 * the CANONICAL record — ignoring the record the browser sent.
 *
 * These tests drive the real client builders (buildSubmissionEnvelope, as
 * App.buildSubmissionEnvelopeForAction calls it), the real wire normalizer and
 * the real ingestion, and require that the record the server builds for an
 * honest step is the record the browser built locally, field for field.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  assertEnvelopeCarriesNoSecureData,
  buildIngestedAttempt,
  normalizeSubmissionEnvelope,
  sanitizeClientAttemptRecord,
} from '../../functions/shared/submissionIngestion.mjs';
import { STEP_WORK_LIMITS, buildSubmissionEnvelope, normalizeStepWork } from '../../functions/shared/submissionEnvelope.mjs';
import { emptyQuestionRecord, normalizeQuestionRecord, recordQuestionStep } from '../../functions/shared/attemptPolicy.mjs';
import { applyBalancedOperation, parseEquationInput } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { resolveEquationAfterKeepingMove, resolveEquationAfterMove } from '../../functions/shared/algebra/algebraSupportLevels.mjs';
import {
  applyBalancedOperationToBranches,
  cloneRelationState,
  normalizeRelationExpressionInput,
  parseRelationSource,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { ALGEBRA_DRAFT_VERSION, makePendingMove, pendingMoveDraft, rehydrateAlgebraDraft } from '../../src/algebraDraftState.js';
import {
  STEP_ACTIONS,
  STEP_BEYOND_SERVER_BUDGET,
  UNVERIFIED_STEP_KIND,
  equationMoveStepGrade,
  equationRewriteStepGrade,
  equationStatePatch,
  equationStepWork,
  interceptStepGrade,
  interceptStepWork,
  rejectedMoveStatePatch,
  relationStatePatch,
  relationStepGrade,
  relationStepWork,
  stepActionCountsAttempt,
} from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const CAPTURED_AT = Date.parse('2026-09-14T15:20:00Z');
const MAX_ATTEMPTS = 3; // classwork

const LINEAR = { questionId: 'q-linear', type: 'stepAlgebra', prompt: 'Solve.', equation: '3x + 6 = 21', workspaceDifficulty: 3 };
const INEQUALITY = { questionId: 'q-ineq', type: 'stepAlgebra', prompt: 'Solve.', equation: '-2x + 3 > 7' };
const INTERCEPTS = { questionId: 'q-int', type: 'stepAlgebra', mode: 'linearIntercepts', prompt: 'Find both intercepts.', equation: '3x + 4y = 24' };
const FAMILY_TEMPLATE = { questionId: 'q-fam', type: 'stepAlgebra', prompt: 'Solve for x.', questionFamily: { id: 'linear.twoStepEquation' } };
const GENERATED = { questionId: 'q-gen', type: 'stepAlgebra', prompt: 'Solve.', generator: { kind: 'stepLinearEquation' } };

const QUESTIONS = [LINEAR, INEQUALITY, INTERCEPTS, FAMILY_TEMPLATE, GENERATED];
const INDEX = Object.fromEntries(QUESTIONS.map((question, index) => [question.questionId, index]));

const assignment = () => ({
  id: 'A1',
  schemaVersion: 5,
  assignedClassIds: ['class-a'],
  releaseAt: '2026-09-01T00:00:00Z',
  dueAt: '2026-09-20',
  sections: [{ id: 's-classwork', role: 'classwork', questions: QUESTIONS }],
});
const runtimeQuestion = (questionId) => ({ ...QUESTIONS[INDEX[questionId]], activityRole: 'classwork' });
const gradeDocument = () => ({ studentId: 'S1', classId: 'class-a', gradesByAssignment: {} });

// The family instance this student was delivered (the real family engine).
const familyInstance = resolveFamilyQuestionInstance({
  question: FAMILY_TEMPLATE,
  assignmentId: 'A1',
  storageIndex: INDEX['q-fam'],
  allocation: { seat: 4, variant: 0, stride: 40, index: 4, basis: 'provisional' },
});

// ---------------------------------------------------------------------------
// One question's life: the browser's local record and the server's canonical
// record, advanced by the same steps.
// ---------------------------------------------------------------------------

let actionCounter = 0;

const session = (question, { workspaceQuestion = question, familyDelivery = null } = {}) => ({
  question,
  workspaceQuestion,
  familyDelivery,
  browser: emptyQuestionRecord(),
  server: null,
  equation: null,
  relation: null,
});

/**
 * App.handleStepGrade + buildSubmissionEnvelopeForAction + the callable's wire
 * normalization + buildIngestedAttempt. Returns the server's outcome.
 */
const submitStep = (s, payload, { recordOverride = null, stepWorkOverride } = {}) => {
  const previousTotalAttempts = Number(s.browser.totalAttempts) || 0;
  const local = recordQuestionStep({
    record: s.browser,
    stepGrade: payload.stepGrade,
    countsAttempt: payload.countsAttempt,
    statePatch: payload.statePatch,
    supportUsage: null,
    maximumAttempts: MAX_ATTEMPTS,
    occurredAt: CAPTURED_AT,
  });
  s.browser = local.record;
  actionCounter += 1;
  const envelope = buildSubmissionEnvelope({
    actionId: `step-${actionCounter}`,
    kind: 'stepSubmission',
    studentId: 'S1',
    assignmentId: 'A1',
    questionIndex: INDEX[s.question.questionId],
    questionId: s.question.questionId,
    variantIndex: 0,
    activityRole: 'classwork',
    capturedAt: CAPTURED_AT,
    previousTotalAttempts,
    record: recordOverride || local.record,
    stepWork: stepWorkOverride === undefined ? normalizeStepWork(payload.stepWork) : stepWorkOverride,
    familyDelivery: s.familyDelivery,
    supportUsage: local.record.supportUsage,
  });
  const wire = normalizeSubmissionEnvelope(JSON.parse(JSON.stringify(envelope)));
  const built = buildIngestedAttempt({
    envelope: { ...wire, studentId: 'S1' },
    assignment: assignment(),
    question: runtimeQuestion(s.question.questionId),
    canonicalRecord: s.server,
    gradeDocument: gradeDocument(),
    ingestedAt: CAPTURED_AT + 2_000,
  });
  assert.equal(built.blocked, false, `ingestion held the step: ${built.reason}`);
  s.server = built.record;
  return { built, local };
};

// The fields the server stamps about ingestion itself, never academic state.
const INGESTION_STAMPS = ['lastSubmissionId', 'submissionOrigin', 'gradedBy', 'serverGradingReason', 'academicOccurredAt', 'ingestedAt', 'recoveredLate', 'familyDelivery', 'familyDeliveryVerification'];
const academic = (record) => Object.fromEntries(Object.entries(normalizeQuestionRecord(record)).filter(([key]) => !INGESTION_STAMPS.includes(key)));

const honestStep = (s, payload, label) => {
  const { built } = submitStep(s, payload);
  assert.equal(built.gradedBy, 'server', `${label}: credited by the server`);
  assert.equal(built.record.serverGradingReason, null, `${label}: verified`);
  assert.deepEqual(academic(built.record), academic(s.browser), `${label}: the server's record equals the browser's`);
  return built;
};

// --- What the workspaces report (the shared builders they call) ------------

const balancedPayload = (s, operation, operand) => {
  const move = { ...applyBalancedOperation({ equationState: s.equation, operation, operand, placementBySide: {} }), placementBySide: {} };
  const after = resolveEquationAfterMove(move, 3, move.requiredCancellationSides);
  const action = STEP_ACTIONS.BALANCED_MOVE;
  const payload = {
    stepGrade: equationMoveStepGrade({ action, move, supportLevel: 3, before: s.equation, after, question: s.workspaceQuestion }),
    countsAttempt: stepActionCountsAttempt(action),
    statePatch: equationStatePatch({ equation: after, supportLevel: 3, stepNumber: Number(s.browser.algebraState?.stepNumber || 0) + 1 }),
    stepWork: equationStepWork({ action, before: s.equation, after, move, supportLevel: 3 }),
  };
  return { payload, after, move };
};

const rejectedPayload = (s, move) => ({
  stepGrade: equationMoveStepGrade({ action: STEP_ACTIONS.REJECTED_MOVE, move, supportLevel: 3, before: s.equation, question: s.workspaceQuestion }),
  countsAttempt: stepActionCountsAttempt(STEP_ACTIONS.REJECTED_MOVE),
  statePatch: rejectedMoveStatePatch(move),
  stepWork: equationStepWork({ action: STEP_ACTIONS.REJECTED_MOVE, before: s.equation, move, supportLevel: 3 }),
});

const rewritePayload = (s, after, kind = 'student-rewrite', label = 'Rewrite / simplify right') => ({
  stepGrade: equationRewriteStepGrade({ kind, label, supportLevel: 3, before: s.equation, after, question: s.workspaceQuestion }),
  countsAttempt: false,
  statePatch: equationStatePatch({ equation: after, supportLevel: 3, stepNumber: Number(s.browser.algebraState?.stepNumber || 0) + 1 }),
  stepWork: equationStepWork({ action: STEP_ACTIONS.REWRITE, kind, label, before: s.equation, after, supportLevel: 3 }),
});

const balanced = (s, operation, operand, label) => {
  const { payload, after } = balancedPayload(s, operation, operand);
  const built = honestStep(s, payload, label);
  s.equation = after;
  return built;
};

const rewritten = (s, side, value, label) => {
  const after = { ...s.equation, [side]: value };
  const built = honestStep(s, rewritePayload(s, after), label);
  s.equation = after;
  return built;
};

const linearSession = () => {
  const s = session(LINEAR);
  s.equation = parseEquationInput(LINEAR);
  return s;
};

// ===========================================================================
// Parity: an honest solve, envelope by envelope
// ===========================================================================

test('an honest balance solve: every step is credited by the server, and its record equals the browser\'s', () => {
  const s = linearSession();
  balanced(s, 'subtract', '6', 'subtract 6');
  rewritten(s, 'right', '15', 'simplify the right side');
  balanced(s, 'divide', '3', 'divide by 3');
  rewritten(s, 'right', '5', 'simplify the quotient');
  assert.equal(s.server.partialCredit, 90);
  assert.equal(s.server.status, 'attempted');
  assert.equal(s.server.stepGrades.length, 4);
  assert.equal(s.server.stepCreditVersion, 2);
});

test('an inequality solve and an intercept check are credited the same way', () => {
  const relation = session(INEQUALITY);
  relation.relation = parseRelationSource(INEQUALITY.equation, 'x');
  const relationStep = (after, { kind = 'relation-step', label, transition }) => {
    honestStep(relation, {
      stepGrade: relationStepGrade({ kind, label, before: relation.relation, after, question: INEQUALITY }),
      countsAttempt: false,
      statePatch: relationStatePatch(after),
      stepWork: relationStepWork({ kind, label, before: relation.relation, after, transition }),
    }, label);
    relation.relation = after;
  };
  const subtract = applyBalancedOperationToBranches(relation.relation, 'subtract', '3', {
    branchIndices: [0], placementByBranch: { 0: { 0: { kind: 'end', termIndex: 1 }, 1: { kind: 'end', termIndex: 0 } } }, requireExplicitPlacement: true,
  });
  relationStep(subtract.state, { label: 'Subtract 3', transition: { kind: 'balancedOperation', operation: 'subtract', operandExpression: '3', branchIndices: [0] } });
  const rewrite = cloneRelationState(relation.relation);
  rewrite.branches[0].expressions[0] = normalizeRelationExpressionInput('-2x');
  relationStep(rewrite, { kind: 'student-rewrite', label: 'Student rewrite of expression 1 on Branch A', transition: { kind: 'equivalentRewrite' } });

  const intercepts = session(INTERCEPTS);
  const standard = { A: 3, B: 4, C: 24 };
  honestStep(intercepts, {
    stepGrade: interceptStepGrade({ standard, intercept: 'x', point: '(8, 0)' }),
    countsAttempt: false,
    stepWork: interceptStepWork({ intercept: 'x', point: '(8, 0)' }),
  }, 'x-intercept');
});

test('a placed move is credited by the server as the browser credits it — and so is the same move restored from a draft', () => {
  // StepByStepAlgebraCore makes every pending move with makePendingMove, which
  // keeps where the student wrote it ("−6" dropped before the "+6"; the right
  // side as a whole); a reload remakes it from the draft (operation, operand,
  // placement — never the engine's analysis, which holds the solution) through
  // the same function.
  const placementBySide = { left: { kind: 'before', termIndex: 1 }, right: 'side' };
  const equation = parseEquationInput(LINEAR);
  const placed = makePendingMove({ equation, operation: 'subtract', operand: '6', placementBySide });
  const draft = { algebraDraftVersion: ALGEBRA_DRAFT_VERSION, equation, pendingMove: pendingMoveDraft(placed) };
  const restored = rehydrateAlgebraDraft({ draft, initialEquation: equation }).pendingMove;
  for (const [label, move] of [['placed', placed], ['restored', restored]]) {
    const s = linearSession();
    const action = STEP_ACTIONS.BALANCED_MOVE;
    const after = resolveEquationAfterMove(move, 3, move.requiredCancellationSides);
    const stepWork = equationStepWork({ action, before: s.equation, after, move, supportLevel: 3 });
    assert.doesNotMatch(JSON.stringify(stepWork), /solution|analysis/, `${label}: the step's work carries no solved value`);
    // The server's own recomputation (stepAlgebraStepVerification recomputeMove)
    // from what reaches it is the move the student made, placement and all.
    const wire = normalizeStepWork(JSON.parse(JSON.stringify(stepWork)));
    const rebuilt = applyBalancedOperation({
      equationState: s.equation,
      operation: wire.operation.operation,
      operand: wire.operation.operand,
      placementBySide: wire.operation.placementBySide || {},
    });
    assert.deepEqual(rebuilt.unsimplified, placed.unsimplified, `${label}: the server rebuilds the move the student placed`);
    honestStep(s, {
      stepGrade: equationMoveStepGrade({ action, move, supportLevel: 3, before: s.equation, after, question: s.workspaceQuestion }),
      countsAttempt: stepActionCountsAttempt(action),
      statePatch: equationStatePatch({ equation: after, supportLevel: 3, stepNumber: 1 }),
      stepWork,
    }, label);
  }
});

test('a Question Family instance: the steps are checked against the instance the pin rebuilds', () => {
  const s = session(FAMILY_TEMPLATE, { workspaceQuestion: familyInstance.question, familyDelivery: familyInstance.delivery });
  s.equation = parseEquationInput(familyInstance.question);
  const first = balancedPayload(s, 'subtract', '1');
  honestStep(s, first.payload, 'family step');
  assert.equal(s.server.familyDelivery.fingerprint, familyInstance.delivery.fingerprint, 'the canonical pin is stamped');
  // A step on another instance's equation does not follow.
  const other = parseEquationInput({ equation: '7x + 2 = 30' });
  const foreign = { ...s, equation: other };
  const { built } = submitStep(s, balancedPayload(foreign, 'subtract', '2').payload);
  assert.equal(built.record.serverGradingReason, 'step-not-continuous');
  assert.equal(built.record.stepGrades.at(-1).kind, 'unverified-step');
});

// ===========================================================================
// Security
// ===========================================================================

test('the record the browser sends is never read when the step carries its work', () => {
  const s = linearSession();
  const { payload } = balancedPayload(s, 'subtract', '6');
  const forgedRecord = {
    ...emptyQuestionRecord(),
    status: 'correct',
    totalAttempts: 0,
    partialCredit: 100,
    bestPartialCredit: 100,
    stepGrades: [{ variantIndex: 0, kind: 'balanced-operation', productive: true, accepted: true, earned: 99, possible: 1, equationBefore: 'a', equationAfter: 'b', expectedTotalPoints: 1 }],
  };
  const { built } = submitStep(s, payload, { recordOverride: forgedRecord });
  assert.equal(built.gradedBy, 'server');
  assert.equal(built.record.status, 'attempted', 'a step never completes a question');
  assert.equal(built.record.partialCredit, 33, 'the server\'s 2 of 6, not the claimed 100');
  assert.equal(built.record.stepGrades.length, 1);
  assert.equal(built.record.stepGrades[0].earned, 2);
});

test('today\'s forged-step attack: 90% without the work before, nothing now', () => {
  const forgedStepGrades = Array.from({ length: 6 }, (_, index) => ({
    variantIndex: 0, kind: 'balanced-operation', productive: true, accepted: true, earned: 2, possible: 2,
    equationBefore: `s${index}`, equationAfter: `s${index + 1}`, expectedTotalPoints: 2,
  }));
  const forgedRecord = { ...emptyQuestionRecord(), status: 'attempted', stepGrades: forgedStepGrades, partialCredit: 90, bestPartialCredit: 90 };
  const envelope = (stepWork) => normalizeSubmissionEnvelope(JSON.parse(JSON.stringify(buildSubmissionEnvelope({
    actionId: `forged-${stepWork ? 'work' : 'legacy'}`, kind: 'stepSubmission', studentId: 'S1', assignmentId: 'A1',
    questionIndex: INDEX['q-linear'], questionId: 'q-linear', activityRole: 'classwork', capturedAt: CAPTURED_AT,
    record: forgedRecord, stepWork,
  }))));
  const ingest = (stepWork) => buildIngestedAttempt({
    envelope: { ...envelope(stepWork), studentId: 'S1' }, assignment: assignment(), question: runtimeQuestion('q-linear'),
    canonicalRecord: null, gradeDocument: gradeDocument(), ingestedAt: CAPTURED_AT + 2_000,
  });
  // A client built before step work existed: unchanged, still sanitized (the
  // remaining legacy path, documented in the report).
  const legacy = ingest(null);
  assert.equal(legacy.gradedBy, 'client');
  assert.equal(legacy.record.partialCredit, 90);
  // The same forgery with any step work at all: the server derives the credit.
  const forgedWork = equationStepWork({
    action: STEP_ACTIONS.REWRITE, kind: 'student-rewrite', label: 'x',
    before: { left: 'x', right: '5' }, after: { left: 'x', right: '10 / 2' },
  });
  const verified = ingest(forgedWork);
  assert.equal(verified.gradedBy, 'server');
  assert.equal(verified.record.partialCredit, 0, 'the forged stepGrades are not read');
  assert.equal(verified.record.serverGradingReason, 'step-not-continuous');
});

test('with settings/serverGrading.requireStepWork on, leaving the work out earns nothing', () => {
  const forgedStepGrades = Array.from({ length: 6 }, (_, index) => ({
    variantIndex: 0, kind: 'balanced-operation', productive: true, accepted: true, earned: 2, possible: 2,
    equationBefore: `s${index}`, equationAfter: `s${index + 1}`, expectedTotalPoints: 2,
  }));
  const forgedRecord = { ...emptyQuestionRecord(), status: 'attempted', attemptCount: 0, stepGrades: forgedStepGrades, partialCredit: 90, bestPartialCredit: 90 };
  const ingest = ({ questionId, requireStepWork }) => buildIngestedAttempt({
    envelope: {
      ...normalizeSubmissionEnvelope(JSON.parse(JSON.stringify(buildSubmissionEnvelope({
        actionId: `legacy-${questionId}-${requireStepWork}`, kind: 'stepSubmission', studentId: 'S1', assignmentId: 'A1',
        questionIndex: INDEX[questionId], questionId, activityRole: 'classwork', capturedAt: CAPTURED_AT,
        record: forgedRecord, stepWork: null,
      })))),
      studentId: 'S1',
    },
    assignment: assignment(), question: runtimeQuestion(questionId), canonicalRecord: null,
    gradeDocument: gradeDocument(), ingestedAt: CAPTURED_AT + 2_000, requireStepWork,
  });
  // Off (the default): the legacy path, as before.
  assert.equal(ingest({ questionId: 'q-linear', requireStepWork: false }).record.partialCredit, 90);
  // On: an unverified step that earns nothing and spends no attempt.
  const refused = ingest({ questionId: 'q-linear', requireStepWork: true });
  assert.equal(refused.gradedBy, 'server');
  assert.equal(refused.record.serverGradingReason, 'step-work-required');
  assert.equal(refused.record.partialCredit, 0);
  assert.equal(refused.record.attemptCount, 0);
  assert.equal(refused.record.stepGrades.at(-1).kind, UNVERIFIED_STEP_KIND);
  // A question the server cannot verify steps on keeps the legacy path even
  // with the switch on: there is nothing to check the step against.
  assert.equal(ingest({ questionId: 'q-gen', requireStepWork: true }).gradedBy, 'client');
});

test('the ingestion callable reads the switch once per call and keeps a wall-clock budget', () => {
  const functionsSource = readFileSync('functions/index.js', 'utf8');
  const callable = functionsSource.slice(functionsSource.indexOf('exports.ingestStudentSubmissions = onCall'), functionsSource.indexOf('PRACTICE-BASED RECOVERY'));
  assert.match(callable, /db\.collection\("settings"\)\.doc\("serverGrading"\)\.get\(\)/);
  assert.match(callable, /if \(Date\.now\(\) - now > INGESTION_CALL_BUDGET_MS\) \{[\s\S]*?SUBMISSION_DISPOSITION\.RETRYABLE,[\s\S]*?continue;/);
  assert.match(functionsSource, /requireStepWork: serverGradingSettings\.requireStepWork === true,/);
  assert.match(functionsSource, /const INGESTION_CALL_BUDGET_MS = 40_000;/);
});

test('a step without step work keeps today\'s sanitized path exactly', () => {
  const s = linearSession();
  const { payload } = balancedPayload(s, 'subtract', '6');
  const { built, local } = submitStep(s, payload, { stepWorkOverride: null });
  assert.equal(built.gradedBy, 'client');
  assert.equal(built.record.serverGradingReason, 'kind:stepSubmission');
  const expected = sanitizeClientAttemptRecord({
    envelope: { kind: 'stepSubmission', record: local.record },
    canonicalRecord: null,
    maximumAttempts: MAX_ATTEMPTS,
    allowClaimedCorrect: false,
  });
  assert.deepEqual(academic(built.record), academic(expected));
});

test('an honest solve that outgrows the server\'s budget keeps the browser\'s record: the long steps are sanitized, and the server credits the rest', () => {
  // Open level (no attempt cost): eight additive moves kept "as written"
  // make the ninth state a sum chain past the budget's ten links. The server
  // will not simplify that, but it must not strand the solve either: those
  // steps keep today's sanitized path, and once the student simplifies back
  // inside the budget, the server derives the credit again — from the state
  // the sanitized record now holds.
  const s = linearSession();
  const LEVEL = 5;
  const kept = (operation, operand) => {
    const move = { ...applyBalancedOperation({ equationState: s.equation, operation, operand, placementBySide: {} }), placementBySide: {} };
    const after = resolveEquationAfterKeepingMove(move, []);
    const action = STEP_ACTIONS.BALANCED_MOVE;
    return {
      after,
      payload: {
        stepGrade: equationMoveStepGrade({ action, move, supportLevel: LEVEL, before: s.equation, after, question: s.workspaceQuestion }),
        countsAttempt: stepActionCountsAttempt(action),
        statePatch: equationStatePatch({ equation: after, supportLevel: LEVEL, stepNumber: Number(s.browser.algebraState?.stepNumber || 0) + 1 }),
        stepWork: equationStepWork({ action, before: s.equation, after, move, supportLevel: LEVEL }),
      },
    };
  };
  const sanitizedStep = (payload, label) => {
    const { built } = submitStep(s, payload);
    assert.equal(built.gradedBy, 'client', `${label}: declined to the sanitized path`);
    assert.equal(built.record.serverGradingReason, STEP_BEYOND_SERVER_BUDGET, label);
    assert.deepEqual(academic(built.record), academic(s.browser), `${label}: the server's record equals the browser's`);
  };
  for (let index = 1; index <= 8; index += 1) {
    const { payload, after } = kept(index % 2 ? 'subtract' : 'add', '1');
    honestStep(s, payload, `kept move ${index}`);
    s.equation = after;
  }
  const ninth = kept('subtract', '1');
  sanitizedStep(ninth.payload, 'the ninth kept move');
  s.equation = ninth.after;
  const simplified = { ...s.equation, left: '3 x + 5', right: '20' };
  const rewrite = {
    stepGrade: equationRewriteStepGrade({ kind: 'student-rewrite', label: 'Rewrite / simplify left and right', supportLevel: LEVEL, before: s.equation, after: simplified, question: LINEAR }),
    countsAttempt: false,
    statePatch: equationStatePatch({ equation: simplified, supportLevel: LEVEL, stepNumber: Number(s.browser.algebraState?.stepNumber || 0) + 1 }),
    stepWork: equationStepWork({ action: STEP_ACTIONS.REWRITE, kind: 'student-rewrite', label: 'Rewrite / simplify left and right', before: s.equation, after: simplified, supportLevel: LEVEL }),
  };
  sanitizedStep(rewrite, 'simplifying the long state');
  s.equation = simplified;
  // Back inside the budget: the server derives this step's credit itself.
  balanced(s, 'subtract', '5', 'the productive move after');
  assert.equal(s.server.gradedBy, 'server');
  assert.equal(s.server.stepGrades.length, 11);
});

test('a question the server does not hold as delivered keeps the sanitized path, step work or not', () => {
  const s = session(GENERATED);
  s.equation = parseEquationInput({ equation: '2x + 5 = 11' });
  const { built } = submitStep(s, balancedPayload(s, 'subtract', '5').payload);
  assert.equal(built.gradedBy, 'client');
  assert.equal(built.record.serverGradingReason, 'generated-question');
});

test('rejected moves spend attempts on the server; once expired, a step changes nothing', () => {
  const s = linearSession();
  const move = applyBalancedOperation({ equationState: s.equation, operation: 'subtract', operand: '6' });
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const built = honestStep(s, rejectedPayload(s, move), `rejection ${attempt}`);
    assert.equal(built.record.attemptCount, attempt);
  }
  assert.equal(s.server.status, 'expired');
  const frozen = academic(s.server);
  const { built } = submitStep(s, balancedPayload(s, 'subtract', '6').payload);
  assert.deepEqual(academic(built.record), frozen, 'an expired version takes no more credit');
});

test('a step on a question already answered correctly changes nothing', () => {
  const s = linearSession();
  s.server = { ...emptyQuestionRecord(), status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100 };
  s.browser = s.server;
  const { built } = submitStep(s, balancedPayload(s, 'subtract', '6').payload);
  assert.equal(built.record.status, 'correct');
  assert.deepEqual(built.record.stepGrades, []);
});

test('a replayed step under a new action id adds no credit', () => {
  const s = linearSession();
  const { payload } = balancedPayload(s, 'subtract', '6');
  submitStep(s, payload);
  const credit = s.server.partialCredit;
  const { built } = submitStep(s, payload);
  assert.equal(built.record.partialCredit, credit);
  assert.equal(built.record.stepGrades.length, 2);
});

test('a step that is not what its operation produces is recorded as unverified and earns nothing', () => {
  const s = linearSession();
  const { payload } = balancedPayload(s, 'subtract', '6');
  payload.stepWork.after = { left: 'x', right: '5' };
  const { built } = submitStep(s, payload);
  assert.equal(built.gradedBy, 'server');
  assert.equal(built.record.serverGradingReason, 'step-not-from-operation');
  assert.equal(built.record.partialCredit, 0);
  assert.deepEqual(
    (({ kind, accepted, earned, possible, expectedTotalPoints }) => ({ kind, accepted, earned, possible, expectedTotalPoints }))(built.record.stepGrades[0]),
    { kind: 'unverified-step', accepted: false, earned: 0, possible: 0, expectedTotalPoints: 0 },
  );
  assert.equal(built.record.algebraState, null, 'an unverified step never moves the saved state');
});

// ===========================================================================
// The envelope
// ===========================================================================

test('step work survives the device, the queue and the wire unchanged, and carries no secure data', () => {
  const s = linearSession();
  const { payload } = balancedPayload(s, 'subtract', '6');
  const stepWork = normalizeStepWork(payload.stepWork);
  const envelope = buildSubmissionEnvelope({
    actionId: 'a-1', kind: 'stepSubmission', studentId: 'S1', assignmentId: 'A1', questionIndex: 0, activityRole: 'classwork', record: {}, stepWork,
  });
  assert.deepEqual(envelope.stepWork, stepWork);
  assert.doesNotThrow(() => assertEnvelopeCarriesNoSecureData(envelope));
  assert.deepEqual(normalizeSubmissionEnvelope(JSON.parse(JSON.stringify(envelope))).stepWork, stepWork, 'the server reads what the device sent');
  // No verdict-shaped key travels in it.
  const keys = JSON.stringify(stepWork).match(/"([A-Za-z]+)":/g).map((key) => key.slice(1, -2));
  for (const forbidden of ['earned', 'possible', 'productive', 'accepted', 'isCorrect', 'score', 'expected', 'answer', 'solution']) {
    assert.equal(keys.includes(forbidden), false, forbidden);
  }
  assert.ok(JSON.stringify(stepWork).length < 600, 'a realistic step is a few hundred characters');
  // Only a step submission carries step work.
  const ordinary = buildSubmissionEnvelope({ actionId: 'a-2', kind: 'ordinarySubmission', studentId: 'S1', assignmentId: 'A1', questionIndex: 0, activityRole: 'classwork', record: {}, stepWork });
  assert.equal(ordinary.stepWork, null);
  assert.equal(normalizeSubmissionEnvelope({ ...envelope, kind: 'ordinarySubmission' }).stepWork, null);
  // Oversized or malformed work is dropped whole, and the step is sanitized.
  const oversized = { ...stepWork, before: { left: 'x'.repeat(STEP_WORK_LIMITS.maxExpressionLength + 1), right: '1' } };
  assert.equal(normalizeSubmissionEnvelope({ ...envelope, stepWork: oversized }).stepWork, null);
  // An answer-key-shaped `accepted` is still refused anywhere in the envelope.
  assert.equal(normalizeSubmissionEnvelope({ ...envelope, stepWork: { ...stepWork, accepted: ['x = 5'] } }), null);
});

// ===========================================================================
// The wiring (source contracts; node cannot render the components)
// ===========================================================================

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

test('App forwards the step\'s raw work in the durable step submission, and imports what it calls', () => {
  const app = executableSource(read('src/App.jsx'));
  const handler = region(app, 'const handleStepGrade = async', 'const handleRequestNewQuestion', 'handleStepGrade');
  assert.match(handler, /\(\{[^}]*\bstepWork\b[^}]*\}\)\s*=>/, 'handleStepGrade receives the step work');
  const payload = region(handler, "kind: 'stepSubmission'", 'setStudentOutboxDepth(', 'the step submission payload');
  assert.match(payload, /stepWork:\s*normalizeStepWork\(stepWork\)/, 'the payload carries the bounded step work');
  assert.match(app, /import\s*\{[^}]*\bnormalizeStepWork\b[^}]*\}\s*from\s*'\.\.\/functions\/shared\/submissionEnvelope\.mjs'/, 'normalizeStepWork is imported (a missing import is a runtime ReferenceError no check catches)');
  const builder = region(app, 'const buildSubmissionEnvelopeForAction', '});', 'buildSubmissionEnvelopeForAction');
  assert.match(builder, /stepWork:\s*payload\.stepWork/, 'the envelope carries it to the server');
});

test('every step the equation workspace reports carries its raw work, built by the shared definitions', () => {
  const core = executableSource(read('src/StepByStepAlgebraCore.jsx'));
  const saveStep = region(core, 'const saveStep = async', 'const commitMove', 'saveStep');
  assert.match(saveStep, /stepGrade = equationMoveStepGrade\(/);
  assert.match(saveStep, /stepWork:\s*equationStepWork\(/);
  const rewrite = region(core, 'const rewriteStepPayload', 'const persistStudentRewrite', 'rewriteStepPayload');
  assert.match(rewrite, /stepGrade:\s*equationRewriteStepGrade\(/);
  assert.match(rewrite, /stepWork:\s*equationStepWork\(/);
  // An intercept sub-solve's steps name the substitution the orchestrator
  // opened (stepWorkContext): without zeroVariable the server cannot rebuild
  // the sub-equation and records every sub-solve step as unverified.
  assert.match(saveStep, /stepWork:\s*equationStepWork\(\{[^}]*\bzeroVariable:\s*stepWorkContext\?\.zeroVariable\b/, 'balanced moves carry the sub-solve\'s substitution');
  assert.match(rewrite, /stepWork:\s*equationStepWork\(\{[^}]*\bzeroVariable:\s*stepWorkContext\?\.zeroVariable\b/, 'rewrites carry the sub-solve\'s substitution');
  // No step is reported with a hand-written credit any more: every
  // onStepGrade call goes through saveStep or rewriteStepPayload.
  const calls = [...core.matchAll(/onStepGrade\(([^)]{0,40})/g)].map((match) => match[1].trim());
  assert.ok(calls.length >= 4, 'the workspace still reports its steps');
  calls.forEach((call) => assert.match(call, /^(\{\s*$|\{\s*stepGrade,?|rewriteStepPayload)/, `an onStepGrade call bypasses the shared builders: ${call}`));
  assert.doesNotMatch(core, /earned:\s*\d/, 'no inline credit');
  // The move remembers where it was written (its own property, beside the
  // engine's result), so the server recomputes the same move. The workspace
  // makes it through makePendingMove, the one route a move restored from a
  // draft takes too (algebraDraftState.js), which keeps the placement on the
  // move; "a placed move ... restored from a draft" above runs both through
  // the server.
  assert.match(
    region(core, 'const attemptMove = async', 'if (!move.preservesSolution)', 'attemptMove'),
    /move = makePendingMove\(\{[^}]*\bplacementBySide: placementBySideOverride \|\| placedOperationPositions\b[^}]*\}\);/,
  );
});

test('the relation workspace and the intercept orchestrator report their raw work too', () => {
  const relation = executableSource(read('src/MultiRelationAlgebraCore.jsx'));
  const persist = region(relation, 'const persistStep = async', 'const commitState', 'persistStep');
  assert.match(persist, /stepGrade:\s*relationStepGrade\(/);
  assert.match(persist, /stepWork:\s*relationStepWork\(\{[^}]*transition/);
  assert.match(region(relation, 'const commitState = async', 'const hasOperationOperand', 'commitState'), /persistStep\([^)]*validationContext\)/, 'the validated context travels');
  assert.match(region(relation, 'const chooseRelationSymbol', 'const applyAbsoluteSplitChoice', 'chooseRelationSymbol'), /pending\.validationContext/);

  const orchestrator = executableSource(read('src/LinearInterceptsOrchestrator.jsx'));
  const check = region(orchestrator, 'const checkCurrentIntercept', 'const activeRedirect', 'checkCurrentIntercept');
  assert.match(check, /stepGrade:\s*interceptStepGrade\(/);
  assert.match(check, /stepWork:\s*interceptStepWork\(/);
  const core = region(orchestrator, '<StepByStepAlgebraCore', '/>', 'the embedded solver');
  assert.match(core, /stepWorkContext=\{subSolveStepWorkContext\}/, 'the sub-solve names the equation it opened');
  assert.match(
    orchestrator,
    /const subSolveStepWorkContext = stage\.committed \? \{ zeroVariable: stage\.placedZeroVariable \} : null;/,
    'the context is the substitution the sub-equation was built from',
  );
  assert.match(orchestrator, /interceptSubEquationQuestion\(question, standard, stage\.placedZeroVariable\)/, 'one definition of the sub-equation');
});
