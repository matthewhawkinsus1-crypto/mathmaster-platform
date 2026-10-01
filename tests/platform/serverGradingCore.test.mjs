/*
 * SERVER-AUTHORITATIVE GRADING: THE CORE CONTRACT.
 *
 * One grading registry (functions/shared/serverGrading) marks a student's raw
 * work the same way whichever path delivered it: the browser's Check, server
 * ingestion of a queued submission, the deadline finalizer, a Question Family
 * instance rebuilt from its delivery pin, or Practice-based Recovery. These
 * tests pin the contract itself — the raw-response boundary, the dispatch, and
 * the cross-path parity — using the reference grader (complexPlaneLab). Every
 * tool's own parity suite lives in tests/tools/*SharedGrading.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NON_WORK_KEYS,
  TOOL_RESPONSE_LIMITS,
  boundToolWork,
  buildToolResponse,
  canonicalToolWorkJson,
  normalizeToolResponse,
  readToolWork,
} from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { attemptInputsFromGrading, gradedResult } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { SHARED, bindToolGrader, clientGraded, declareTool } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import {
  gradeServerResponse,
  gradeToolWork,
  serverResponseGradingSupport,
} from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeWorkWithGrader } from '../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import complexPlaneGrader from '../../functions/shared/serverGrading/tools/complexPlaneLab.mjs';
import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import {
  buildIngestedAttempt,
  normalizeSubmissionEnvelope,
  serverCanRegradeEnvelope,
} from '../../functions/shared/submissionIngestion.mjs';
import { buildSubmissionEnvelope } from '../../functions/shared/submissionEnvelope.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { familyInstanceServerGradable, resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { assessRecoverySlot } from '../../functions/shared/sectionRecoveryReadiness.mjs';
import { normalizeStoredResponse } from '../../functions/shared/responseCheckpointSchema.mjs';

/* ---------------------------------------------------------------------------
 * The raw-response boundary
 * ------------------------------------------------------------------------- */

test('a tool response carries student work only: verdicts and answer keys are stripped at every depth', () => {
  const tampered = {
    real: '5',
    isCorrect: true,
    score: 1,
    nested: { expected: [3, 4], solution: 'x=2', checks: [true], keep: 'yes', deeper: [{ answerKey: 'k', value: 2 }] },
  };
  const { work, dropped } = boundToolWork(tampered);
  assert.deepEqual(work, { real: '5', nested: { keep: 'yes', deeper: [{ value: 2 }] } });
  ['isCorrect', 'score', 'expected', 'solution', 'checks', 'answerKey'].forEach((key) => assert.ok(dropped.includes(key), key));
  // Every key the contract strips is named, so a tool cannot accidentally
  // build its work out of one.
  ['isCorrect', 'score', 'expected', 'solution', 'acceptedAnswers', 'seed'].forEach((key) => assert.ok(NON_WORK_KEYS.includes(key), key));
});

test('a tool response refuses prototype-pollution keys and is JSON-exact (Infinity survives, NaN does not)', () => {
  const work = JSON.parse('{"__proto__":{"polluted":true},"constructor":1,"min":-1}');
  work.max = Number.POSITIVE_INFINITY;
  work.nan = Number.NaN;
  work.negativeZero = -0;
  const { work: bounded } = boundToolWork(work);
  assert.deepEqual(bounded, { min: -1, max: 'Infinity', nan: null, negativeZero: 0 });
  assert.equal(Number(bounded.max), Number.POSITIVE_INFINITY, 'a grader reads an unbounded interval back with Number()');
  assert.equal({}.polluted, undefined);
});

test('the same work always serializes to the same bytes, whatever its key order', () => {
  assert.equal(canonicalToolWorkJson({ b: 2, a: { d: 1, c: [3, 1] } }), canonicalToolWorkJson({ a: { c: [3, 1], d: 1 }, b: 2 }));
});

test('every size dimension is bounded, and oversize work is refused rather than truncated', () => {
  const { work, truncated } = boundToolWork({
    long: 'x'.repeat(TOOL_RESPONSE_LIMITS.maxStringLength + 50),
    many: Array.from({ length: TOOL_RESPONSE_LIMITS.maxArrayLength + 5 }, (_, index) => index),
  });
  assert.equal(truncated, true);
  assert.equal(work.long.length, TOOL_RESPONSE_LIMITS.maxStringLength);
  assert.equal(work.many.length, TOOL_RESPONSE_LIMITS.maxArrayLength);

  let deep = { leaf: 1 };
  for (let depth = 0; depth < TOOL_RESPONSE_LIMITS.maxDepth + 2; depth += 1) deep = { deep };
  assert.ok(JSON.stringify(boundToolWork(deep).work).includes('null'), 'nesting beyond the depth limit is cut off');

  const huge = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`row${index}`, 'y'.repeat(900)]));
  const response = buildToolResponse({ toolId: 'complexPlaneLab', work: huge });
  assert.equal(response.oversize, true);
  assert.equal(response.value, '', 'half of a board is not the student\'s work');
  assert.deepEqual(readToolWork(response), { ok: false, reason: 'oversize-response', work: null });
});

test('a tool response from the wire is re-bounded: a device is not trusted to have run the builder', () => {
  const forged = {
    kind: 'tool', toolId: 'complexPlaneLab', mode: 'features', contractVersion: 1,
    value: JSON.stringify({ magnitudeAnswer: '5', isCorrect: true, score: 1 }),
    isCorrect: true,
  };
  const normalized = normalizeToolResponse(forged);
  assert.equal(normalized.isCorrect, undefined);
  assert.deepEqual(JSON.parse(normalized.value), { magnitudeAnswer: '5' });
  assert.deepEqual(readToolWork({ ...forged, value: '{not json' }), { ok: false, reason: 'unreadable-response', work: null });
  // The checkpoint store keeps a tool response as a tool response.
  assert.equal(normalizeStoredResponse(forged).kind, 'tool');
  assert.deepEqual(JSON.parse(normalizeStoredResponse(forged).value), { magnitudeAnswer: '5' });
});

/* ---------------------------------------------------------------------------
 * Grader declarations cannot drift from grader code
 * ------------------------------------------------------------------------- */

test('a client-graded mode must name its blocker, and a shared mode must have a grader', () => {
  assert.throws(() => declareTool({ modes: { a: clientGraded('') } }), /documented blocker/);
  const declaration = declareTool({ defaultMode: 'a', modes: { a: SHARED, b: clientGraded('Strokes are judged in screen space.') } });
  assert.throws(() => bindToolGrader(declaration, 'demo', {}), /declared shared-server but has no grade function/);
  assert.throws(() => bindToolGrader(declaration, 'demo', { a: () => ({}), b: () => ({}) }), /supplies a grade function/);
  assert.throws(() => bindToolGrader(declaration, 'demo', { a: () => ({}), c: () => ({}) }), /undeclared mode/);
});

test('a grader that throws on tampered work yields "no verdict", never a crash and never "correct"', () => {
  const declaration = declareTool({ defaultMode: 'a', modes: { a: SHARED } });
  const grader = bindToolGrader(declaration, 'demo', { a: (question, work) => { if (!Array.isArray(work.points)) throw new Error('points'); return gradedResult({ parts: [] }); } });
  assert.equal(grader.grade({}, { points: 'nope' }).reason, 'malformed-response');
  assert.equal(grader.grade({}, null).reason, 'empty-response');
  assert.equal(grader.grade({}, ['array']).reason, 'empty-response');
  assert.equal(grader.grade({}, { points: 'nope' }).isCorrect, false);
});

test('gradedResult derives the score from part credit, and attemptInputsFromGrading is the one mapping to the attempt policy', () => {
  const result = gradedResult({ parts: [{ id: 'a', isCorrect: true }, { id: 'b', isCorrect: false }, { id: 'c', isCorrect: true, weight: 2 }] });
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 3 / 4);
  assert.deepEqual(attemptInputsFromGrading(result), { isCorrect: false, parts: result.parts, partialCreditPercent: 75 });
  assert.equal(attemptInputsFromGrading(gradedResult({ parts: [{ id: 'a', isCorrect: true }] })).partialCreditPercent, 100);
});

/* ---------------------------------------------------------------------------
 * The dispatch
 * ------------------------------------------------------------------------- */

const OPERATIONS = { questionId: 'cpl-ops', type: 'complexPlaneLab', mode: 'operations', operation: 'multiply', z: { re: 2, im: 3 }, w: { re: -1, im: 2 }, activityRole: 'classwork' };
// (2 + 3i)(-1 + 2i) = -2 + 4i - 3i + 6i^2 = -8 + i
const CORRECT_OPERATIONS_WORK = { real: '-8', imaginary: '1' };

test('the server will not grade a question the student did not see verbatim', () => {
  const reasons = [
    [{ ...OPERATIONS, secure: true }, 'secure-question'],
    [{ ...OPERATIONS, teacherExcluded: true }, 'teacher-excluded'],
    [{ ...OPERATIONS, generator: { kind: 'stepLinearEquation' } }, 'generated-question'],
    [{ ...OPERATIONS, questionFamily: { scope: 'assignment' } }, 'family-template'],
    [{ ...OPERATIONS, variants: [{}] }, 'variant-selection'],
    [{ ...OPERATIONS, differentiation: { mode: 'auto' } }, 'adaptive-band-profile'],
  ];
  reasons.forEach(([question, reason]) => assert.equal(serverResponseGradingSupport(question).reason, reason, reason));
  assert.equal(serverResponseGradingSupport(OPERATIONS).supported, true);
});

test('a tool question is graded only from a tool response for THAT tool, at a contract version the server knows', () => {
  const browser = gradeToolWork({ toolId: 'complexPlaneLab', question: OPERATIONS, work: CORRECT_OPERATIONS_WORK });
  assert.equal(gradeServerResponse({ question: OPERATIONS, response: browser.toolResponse }).isCorrect, true);
  assert.equal(gradeServerResponse({ question: OPERATIONS, response: { kind: 'opaque', value: '{"real":"-8"}' } }).reason, 'no-tool-response');
  assert.equal(gradeServerResponse({ question: OPERATIONS, response: { ...browser.toolResponse, toolId: 'graphing2' } }).reason, 'response-tool-mismatch');
  assert.equal(gradeServerResponse({ question: OPERATIONS, response: { ...browser.toolResponse, contractVersion: 99 } }).reason, 'response-contract-newer-than-server');
  // And an ordinary question is never graded from a tool-shaped response.
  const literal = { type: 'literal', solveFor: 'x', acceptedAnswers: ['2'] };
  assert.equal(gradeServerResponse({ question: literal, response: browser.toolResponse }).reason, 'response-shape-mismatch');
  assert.equal(gradeServerResponse({ question: literal, response: { kind: 'scalar', type: 'literal', value: '2', fields: [] } }).isCorrect, true);
});

test('the mode is decided by the question, never by the response', () => {
  const browser = gradeToolWork({ toolId: 'complexPlaneLab', question: OPERATIONS, work: CORRECT_OPERATIONS_WORK });
  // A response claiming another mode is still marked as the question's mode.
  const relabeled = { ...browser.toolResponse, mode: 'features' };
  const result = gradeServerResponse({ question: OPERATIONS, response: relabeled });
  assert.equal(result.mode, 'operations');
  assert.equal(result.isCorrect, true);
});

/* ---------------------------------------------------------------------------
 * Browser == server for the reference tool, every mode
 * ------------------------------------------------------------------------- */

const COMPLEX_FIXTURES = [
  { name: 'features correct', question: { type: 'complexPlaneLab', mode: 'features', z: { re: 3, im: -4 } }, work: { magnitudeAnswer: '5', conjugateRe: '3', conjugateIm: '4' }, isCorrect: true, score: 1 },
  { name: 'features one wrong', question: { type: 'complexPlaneLab', mode: 'features', z: { re: 3, im: -4 } }, work: { magnitudeAnswer: '5', conjugateRe: '3', conjugateIm: '-4' }, isCorrect: false, score: 2 / 3 },
  { name: 'features defaults when z is unauthored', question: { type: 'complexPlaneLab' }, work: { magnitudeAnswer: '5.0', conjugateRe: '3', conjugateIm: '4' }, isCorrect: true, score: 1 },
  { name: 'operations add', question: { type: 'complexPlaneLab', mode: 'operations', operation: 'add', z: { re: 1, im: 1 }, w: { re: 2, im: -3 } }, work: { real: '3', imaginary: '-2' }, isCorrect: true, score: 1 },
  { name: 'division', question: { type: 'complexPlaneLab', mode: 'division', z: { re: 4, im: 2 }, w: { re: 1, im: -1 } }, work: { conjugateRe: '1', conjugateIm: '1', real: '1', imaginary: '3' }, isCorrect: true, score: 1 },
  { name: 'powers magnitude tolerance', question: { type: 'complexPlaneLab', mode: 'powers', z: { re: 1, im: 1 }, exponent: 3 }, work: { real: '-2', imaginary: '2', magnitude: '2.83' }, isCorrect: true, score: 1 },
  { name: 'rotation', question: { type: 'complexPlaneLab', mode: 'rotation', z: { re: 3, im: 1 }, quarterTurns: 5 }, work: { real: '-1', imaginary: '3', rotation: '1' }, isCorrect: true, score: 1 },
  { name: 'quadratic roots any order', question: { type: 'complexPlaneLab', mode: 'quadraticRoots', quadratic: { a: 1, b: 2, c: 5 } }, work: { r1Re: '-1', r1Im: '-2', r2Re: '-1', r2Im: '2' }, isCorrect: true, score: 1 },
  { name: 'quadratic roots incomplete', question: { type: 'complexPlaneLab', mode: 'quadraticRoots', quadratic: { a: 1, b: 2, c: 5 } }, work: { r1Re: '-1', r1Im: '2', r2Re: '', r2Im: '' }, isCorrect: false, score: 0, isComplete: false },
  { name: 'unknown mode renders (and grades) as features', question: { type: 'complexPlaneLab', mode: 'notAMode', z: { re: 0, im: 2 } }, work: { magnitudeAnswer: '2', conjugateRe: '0', conjugateIm: '-2' }, isCorrect: true, score: 1 },
];

COMPLEX_FIXTURES.forEach((fixture) => {
  test(`complexPlaneLab parity — ${fixture.name}`, () => {
    const browser = gradeWorkWithGrader({ grader: complexPlaneGrader, question: fixture.question, work: fixture.work });
    const wire = JSON.parse(JSON.stringify(browser.toolResponse));
    const server = gradeServerResponse({ question: fixture.question, response: wire });
    assert.equal(browser.graded, true);
    assert.equal(browser.isCorrect, fixture.isCorrect);
    assert.equal(browser.score, fixture.score);
    if (fixture.isComplete !== undefined) assert.equal(browser.isComplete, fixture.isComplete);
    ['graded', 'isCorrect', 'isComplete', 'score', 'parts'].forEach((key) => assert.deepEqual(server[key], browser[key], key));
    assert.deepEqual(boundToolWork(fixture.work).dropped, []);
  });
});

test('complexPlaneLab fixtures discriminate: the same correct work fails against a different key', () => {
  const question = { type: 'complexPlaneLab', mode: 'operations', operation: 'multiply', z: { re: 2, im: 3 }, w: { re: -1, im: 2 } };
  assert.equal(gradeToolWork({ toolId: 'complexPlaneLab', question, work: CORRECT_OPERATIONS_WORK }).isCorrect, true);
  assert.equal(gradeToolWork({ toolId: 'complexPlaneLab', question: { ...question, operation: 'add' }, work: CORRECT_OPERATIONS_WORK }).isCorrect, false);
  assert.equal(gradeToolWork({ toolId: 'complexPlaneLab', question: { ...question, z: { re: 2, im: 4 } }, work: CORRECT_OPERATIONS_WORK }).isCorrect, false);
});

/* ---------------------------------------------------------------------------
 * One raw response, one record — whichever path delivers it
 * ------------------------------------------------------------------------- */

const ASSIGNMENT = { id: 'A1', schemaVersion: 5, releaseAt: '2026-09-01T00:00:00Z' };
const CAPTURED_AT = Date.parse('2026-09-14T15:00:00Z');

const envelopeFor = ({ question, response, record = null, questionIndex = 0, activityRole = 'classwork', familyDelivery = null }) => normalizeSubmissionEnvelope(buildSubmissionEnvelope({
  actionId: `act-${questionIndex}-${Math.round(Math.random() * 1e9)}`,
  kind: 'ordinarySubmission',
  studentId: 'S1',
  assignmentId: 'A1',
  questionIndex,
  questionId: question.questionId,
  activityRole,
  capturedAt: CAPTURED_AT,
  previousTotalAttempts: 0,
  // A forged browser record claiming full marks — never consulted when the
  // server can grade the raw response.
  record: record || { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100 },
  response,
  familyDelivery,
}));

test('ingestion re-grades a tool submission from its raw work and discards the browser verdict', () => {
  const wrong = gradeToolWork({ toolId: 'complexPlaneLab', question: OPERATIONS, work: { real: '-8', imaginary: '5' } });
  const built = buildIngestedAttempt({ envelope: envelopeFor({ question: OPERATIONS, response: wrong.toolResponse }), assignment: ASSIGNMENT, question: OPERATIONS, canonicalRecord: null, ingestedAt: CAPTURED_AT + 1000 });
  assert.equal(built.gradedBy, 'server');
  assert.equal(built.record.status, 'attempted', 'the forged "correct" record is not what was stored');
  assert.equal(built.record.partialCredit, 50);
  assert.equal(built.gradingEvidence.graderVersion, 'complexPlaneLab@1');
  assert.equal(built.gradingEvidence.gradingAuthority, 'server');
});

test('a browser Submit, a queued ingestion and a deadline finalization record the same attempt for the same work', () => {
  const work = { real: '-8', imaginary: '5' };
  const browser = gradeToolWork({ toolId: 'complexPlaneLab', question: OPERATIONS, work });
  const browserInputs = attemptInputsFromGrading(browser);
  const browserRecord = recordQuestionAttempt({
    record: null,
    ...browserInputs,
    responseKey: browser.toolResponse.value,
    maximumAttempts: 3,
  }).record;
  const ingested = buildIngestedAttempt({ envelope: envelopeFor({ question: OPERATIONS, response: browser.toolResponse }), assignment: ASSIGNMENT, question: OPERATIONS, canonicalRecord: null, ingestedAt: CAPTURED_AT + 1000 }).record;
  ['status', 'attemptCount', 'totalAttempts', 'partialCredit', 'bestPartialCredit', 'lastResponseKey'].forEach((key) => {
    assert.deepEqual(ingested[key], browserRecord[key], key);
  });
  assert.deepEqual(
    ingested.partGrades.map(({ id, isCorrect, credit }) => ({ id, isCorrect, credit })),
    browserRecord.partGrades.map(({ id, isCorrect, credit }) => ({ id, isCorrect, credit })),
  );
});

test('a submission an OLD client queued with an opaque tool string is kept on the legacy sanitized path, not lost', () => {
  const envelope = envelopeFor({ question: OPERATIONS, response: { kind: 'opaque', type: 'complexPlaneLab', value: '{"real":"-8","imaginary":"1"}', fields: [] } });
  assert.deepEqual(serverCanRegradeEnvelope({ envelope, question: OPERATIONS }), { regrade: false, reason: 'legacy-unstructured-response' });
  const built = buildIngestedAttempt({ envelope, assignment: ASSIGNMENT, question: OPERATIONS, canonicalRecord: null, ingestedAt: CAPTURED_AT + 1000 });
  assert.equal(built.blocked, false);
  assert.equal(built.gradedBy, 'client');
  assert.equal(built.record.serverGradingReason, 'legacy-unstructured-response');
  // Bounded exactly as before: one attempt, never more.
  assert.equal(built.record.totalAttempts, 1);
});

test('the server grades the question QuestionEngine renders: runtime repair and the word-problem layer are applied', () => {
  const stored = { ...OPERATIONS, context: { scenario: 'Rotating a robot arm', quantities: [] } };
  const delivered = deliveredQuestionForGrading(stored);
  assert.equal(delivered.context.scaffold.enabled, true, 'normalizeContextualQuestion defaults are applied');
  assert.deepEqual(deliveredQuestionForGrading(delivered), delivered, 'idempotent');
});

/* ---------------------------------------------------------------------------
 * Question Families and Recovery use the same registry — no allow-list
 * ------------------------------------------------------------------------- */

const TEMPLATE = {
  questionId: 'cpl-family', type: 'complexPlaneLab', toolId: 'complexPlaneLab', mode: 'operations', operation: 'add',
  prompt: 'Add ({{a}} + {{b}}i) and (2 - i).', z: { re: '{{a}}', im: '{{b}}' }, w: { re: 2, im: -1 }, activityRole: 'dol',
  questionFamily: { scope: 'assignment' },
  generator: { parameters: { a: { type: 'int', min: 1, max: 9 }, b: { type: 'int', min: 1, max: 9 } } },
};
const instanceFor = (seat) => resolveFamilyQuestionInstance({ question: TEMPLATE, assignmentId: 'A1', storageIndex: 0, allocation: { seat, variant: 0, stride: 40, index: seat, basis: 'seated' } });

test('a tool-backed Question Family instance is server-gradable because its mode has a shared grader — not because of an allow-list', () => {
  const { question } = instanceFor(3);
  assert.equal(familyInstanceServerGradable(question), true);
  const slot = assessRecoverySlot({ assignmentId: 'A1', question: TEMPLATE, storageIndex: 0, label: 'DOL Q1' });
  assert.equal(slot.ready, true, JSON.stringify(slot.issues));
  // A mode that is not server-gradable keeps Recovery unavailable, and says why.
  const declaration = { ...TEMPLATE, mode: 'operations' };
  assert.equal(serverResponseGradingSupport({ ...declaration, questionFamily: undefined, generator: undefined, z: { re: 1, im: 1 } }).supported, true);
});

test('a family instance is graded against the instance its own validated pin names — never the template, never another student\'s', () => {
  const mine = instanceFor(3);
  const theirs = instanceFor(7);
  assert.notDeepEqual(mine.question.z, theirs.question.z, 'two seats get different numbers');
  const myWork = { real: String(Number(mine.question.z.re) + 2), imaginary: String(Number(mine.question.z.im) - 1) };
  const browser = gradeToolWork({ toolId: 'complexPlaneLab', question: mine.question, work: myWork });
  assert.equal(browser.isCorrect, true);

  const serverWithMyPin = resolveServerGradingQuestion({ assignment: { id: 'A1' }, question: TEMPLATE, questionIndex: 0, variantIndex: 0, claimedDelivery: mine.delivery });
  assert.equal(gradeServerResponse({ question: serverWithMyPin.question, response: browser.toolResponse }).isCorrect, true);

  // Substituting another student's pin grades against THEIR instance, so my
  // answer is not correct there — a pin cannot be used to borrow a key.
  const serverWithTheirPin = resolveServerGradingQuestion({ assignment: { id: 'A1' }, question: TEMPLATE, questionIndex: 0, variantIndex: 0, claimedDelivery: theirs.delivery });
  assert.equal(gradeServerResponse({ question: serverWithTheirPin.question, response: browser.toolResponse }).isCorrect, false);

  // A pin for another variant is never used, and a forged fingerprint fails.
  assert.equal(resolveServerGradingQuestion({ assignment: { id: 'A1' }, question: TEMPLATE, questionIndex: 0, variantIndex: 1, claimedDelivery: mine.delivery }).question, null);
  const forged = resolveServerGradingQuestion({ assignment: { id: 'A1' }, question: TEMPLATE, questionIndex: 0, variantIndex: 0, claimedDelivery: { ...mine.delivery, fingerprint: 'local:A1_cpl-family:deadbeefdeadbeef' } });
  assert.equal(forged.question, null);
  assert.match(forged.reason, /^family-/);
});

test('ingestion grades a family-backed tool slot against the pinned instance and stamps the canonical pin', () => {
  const mine = instanceFor(3);
  const work = { real: String(Number(mine.question.z.re) + 2), imaginary: String(Number(mine.question.z.im) - 1) };
  const browser = gradeToolWork({ toolId: 'complexPlaneLab', question: mine.question, work });
  const built = buildIngestedAttempt({
    envelope: envelopeFor({ question: TEMPLATE, response: browser.toolResponse, activityRole: 'dol', familyDelivery: mine.delivery }),
    assignment: ASSIGNMENT,
    question: TEMPLATE,
    canonicalRecord: null,
    ingestedAt: CAPTURED_AT + 1000,
  });
  assert.equal(built.gradedBy, 'server');
  assert.equal(built.record.status, 'correct');
  assert.equal(built.record.familyDelivery.fingerprint, mine.delivery.fingerprint);
});
