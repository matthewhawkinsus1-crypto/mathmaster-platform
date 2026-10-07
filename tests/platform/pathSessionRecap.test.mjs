/*
 * THE END-OF-SESSION RECAP (student push D, item 4).
 *
 * A finished session lists the questions the student missed or got partly
 * right — as they saw them, with their answer, the correct answer and the
 * worked solution. Decision 3: nothing reveals an answer, solution or
 * diagnosis while an item can still be answered. So the recap is recorded
 * only for CLOSED items, released only for a COMPLETED session, and only to
 * the student it belongs to.
 *
 * These tests run the shared rules, the server loader against a strict
 * Firestore stand-in, and the callable itself as written in functions/index.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  PATH_RECAP_MAX_JSON,
  buildPathRecapEntry,
  buildPathSessionRecap,
  parsePathRecapEntry,
  pathRecapAccess,
  serializePathRecapEntry,
} from '../../functions/shared/pathSessionRecap.mjs';
import { FakeFirestore, HttpsError, topLevelFunction } from './helpers/serverCallableHarness.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const recapLib = require('../../functions/lib/pathSessionRecap.js');
const mathPath = require('../../functions/lib/mathPath.js');

const SERVER = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

// A field-graded multiple-choice item, authored with private choice ids.
const authored = {
  id: 'bank-confounder',
  familyId: 'mathmaster:A.4B:confounder',
  prompt: 'Cold drink sales and beach rescues both rise in summer. Which explanation is best?',
  choices: [
    { id: 'opt-1', label: 'Hot weather can influence both' },
    { id: 'opt-2', label: 'Drinks cause rescues' },
    { id: 'opt-3', label: 'Rescues cause drink sales' },
  ],
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'choice', expected: 'opt-1' }],
  solutionReview: {
    headline: 'A third variable can drive both.',
    reasoning: ['Both rise when it is hot.', 'Correlation alone does not show causation.'],
    answerSummary: 'Hot weather can influence both.',
  },
};

// The item exactly as issueNextQuestion stores it on the session.
const storedItem = async (question = authored, questionInstanceId = 'qi-1') => {
  const plan = await mathPath.buildIssuePlan(question);
  return {
    ...mathPath.buildSanitizedQuestion(question, { questionInstanceId, attemptsAllowed: 1, toolPayload: plan.toolPayload }),
    bankQuestionId: question.id,
    generatorParameters: { secret: 42 },
    privateGrading: plan.privateGrading,
    privateSupport: await mathPath.buildPrivateSupport(question),
    attemptsAllowed: 1,
    attemptsUsed: 0,
  };
};

// What the browser was handed for that stored item.
const servedTo = (item) => mathPath.buildSanitizedQuestion(item, {
  questionInstanceId: item.questionInstanceId,
  attemptsAllowed: item.attemptsAllowed,
  toolPayload: mathPath.storedToolPayload(item),
});

const finalized = (overrides = {}) => ({
  isCorrect: false, score: 0, attemptNumber: 1, attemptsRemaining: 0, questionFinalized: true, ...overrides,
});

const entry = (overrides = {}) => buildPathRecapEntry({
  sessionId: 'session-1',
  questionInstanceId: 'qi-1',
  questionNumber: 1,
  skillCode: 'A.5A',
  closedAt: 1000,
  publicQuestion: {
    prompt: 'Solve $2x + 3 = 11$.',
    responseFields: [{ id: 'answer', label: 'x =', inputProfile: 'number' }],
  },
  privateGrading: { fields: [{ id: 'answer', expected: '4' }] },
  responsePayload: { responses: { answer: '5' } },
  grading: { isCorrect: false, score: 0, attemptNumber: 3, attemptsAllowed: 3 },
  solutionReview: { headline: 'Undo the addition, then the multiplication.', reasoning: ['Subtract 3: 2x = 8.', 'Divide by 2: x = 4.'] },
  ...overrides,
});

const completedSession = (overrides = {}) => ({
  sessionId: 'session-1', studentId: 'student-1', status: 'completed',
  summary: { completedQuestions: 3, correctQuestions: 1 }, ...overrides,
});

test('a recap entry is the question as served, the student\'s answer, the correct answer and the review', async () => {
  const item = await storedItem();
  const served = servedTo(item);
  const wrong = served.choices.find((choice) => choice.label === 'Drinks cause rescues');
  const json = recapLib.closedQuestionRecapJson(await recapLib.pathSessionRecapRules(), {
    sessionId: 'session-1',
    currentQuestion: item,
    responsePayload: { responses: { answer: wrong.id } },
    grading: finalized(),
    solutionReview: item.privateSupport.solutionReview,
    questionNumber: 2,
    skillCode: 'A.4B',
    closedAt: 5000,
  });
  const stored = parsePathRecapEntry(json);
  assert.equal(stored.question.prompt, authored.prompt);
  assert.deepEqual(stored.response.entries, [{ label: 'Answer', value: 'Drinks cause rescues', format: 'rich' }]);
  // The correct answer resolves in the grading definition's own id space, so
  // it names the option even though the browser saw re-issued ids.
  assert.deepEqual(stored.correctAnswer, [{ label: 'Answer', value: 'Hot weather can influence both', format: 'rich' }]);
  assert.equal(stored.solutionReview.answerSummary, 'Hot weather can influence both.');
  assert.equal(stored.questionNumber, 2);
  // Nothing private rides along: no grading definition, generator draw,
  // support bundle or author choice id.
  assert.doesNotMatch(json, /privateGrading|generatorParameters|privateSupport|"secret"|opt-1|attemptFeedback/);
});

test('an attempt that leaves its question open records no recap entry', async () => {
  const rules = await recapLib.pathSessionRecapRules();
  const item = await storedItem();
  const open = recapLib.closedQuestionRecapJson(rules, {
    sessionId: 'session-1', currentQuestion: item, responsePayload: { responses: { answer: 'x' } },
    grading: { isCorrect: false, score: 0, attemptNumber: 1, attemptsRemaining: 2, questionFinalized: false },
  });
  assert.equal(open, null);
});

test('building a recap entry can never fail the graded answer', async () => {
  const rules = await recapLib.pathSessionRecapRules();
  const errors = [];
  const hostile = { questionInstanceId: 'qi-x', get prompt() { throw new Error('boom'); } };
  const json = recapLib.closedQuestionRecapJson(rules, {
    sessionId: 'session-1', currentQuestion: hostile, responsePayload: {}, grading: finalized(),
    onError: (error) => errors.push(error.message),
  });
  assert.equal(json, null);
  assert.deepEqual(errors, ['boom']);
  // A value JSON cannot encode is refused, not thrown.
  const circular = entry();
  circular.question.self = circular;
  assert.equal(serializePathRecapEntry(circular), null);
});

test('typed answers keep their notation and an untrusted payload is never stored raw', () => {
  const typed = entry();
  assert.deepEqual(typed.response.entries, [{ label: 'x =', value: '5', format: 'math' }]);
  assert.deepEqual(typed.correctAnswer, [{ label: 'x =', value: '4', format: 'math' }]);

  const words = entry({
    publicQuestion: { prompt: 'Name the property.', responseFields: [{ id: 'answer', label: 'Property', inputProfile: 'text' }] },
    privateGrading: { fields: [{ id: 'answer', expected: 'distributive' }] },
    responsePayload: { responses: { answer: 'commutative', smuggled: { evil: true } } },
  });
  assert.deepEqual(words.response.entries, [{ label: 'Property', value: 'commutative', format: 'text' }]);

  const objectAnswer = entry({ responsePayload: { responses: { answer: { isCorrect: true } } } });
  assert.deepEqual(objectAnswer.response, { kind: 'none', entries: [] });

  // A tool answer is summarized to a value; the raw work is not kept.
  const tool = entry({
    publicQuestion: { pathToolId: 'algebra', tool: { prompt: 'Solve 3x = 12.' } },
    privateGrading: { pathToolId: 'algebra', definition: { expected: '4', variable: 'x' } },
    responsePayload: { raw: { finalEquation: 'x=5', steps: [[1, 2], [3, 4]] } },
  });
  assert.equal(tool.question.prompt, 'Solve 3x = 12.');
  assert.deepEqual(tool.response, { kind: 'tool', entries: [{ label: 'Your answer', value: 'x=5', format: 'math' }] });
  assert.deepEqual(tool.correctAnswer, [{ label: 'Answer', value: '4', format: 'math' }]);
  assert.doesNotMatch(JSON.stringify(tool), /steps/);
});

test('entries are stored as one string, and an oversize one sheds its stimulus before it is refused', () => {
  const heavy = entry({
    publicQuestion: {
      prompt: 'Read the graph.',
      stimulus: { kind: 'graph', graph: { curves: [{ label: 'f', points: Array.from({ length: 2000 }, (_, x) => ({ x, y: x * x })) }] } },
    },
  });
  const json = serializePathRecapEntry(heavy);
  assert.ok(json.length <= PATH_RECAP_MAX_JSON);
  const parsed = parsePathRecapEntry(json);
  assert.equal(parsed.question.stimulus, null);
  assert.equal(parsed.question.stimulusOmitted, true);
  assert.equal(parsed.solutionReview.reasoning.length, 2, 'the worked solution survives');
  // Nested arrays are fine inside a string, which is why it is one.
  const nested = entry({ publicQuestion: { prompt: 'p', stimulus: { kind: 'table', rows: [[1, 2], [3, 4]] } } });
  assert.deepEqual(parsePathRecapEntry(serializePathRecapEntry(nested)).question.stimulus.rows, [[1, 2], [3, 4]]);
  assert.equal(parsePathRecapEntry('{"v":99}'), null);
  assert.equal(parsePathRecapEntry('not json'), null);
});

test('the recap lists only missed and partly credited questions, once each, in order', () => {
  const recap = buildPathSessionRecap({
    session: completedSession({ summary: { completedQuestions: 4 } }),
    entries: [
      entry({ questionInstanceId: 'q3', questionNumber: 3, grading: { isCorrect: false, score: 0.5, attemptNumber: 3 } }),
      entry({ questionInstanceId: 'q1', questionNumber: 1, grading: { isCorrect: true, score: 1, attemptNumber: 1 } }),
      entry({ questionInstanceId: 'q2', questionNumber: 2, grading: { isCorrect: false, score: 0, attemptNumber: 3 } }),
      entry({ questionInstanceId: 'q4', questionNumber: 4, grading: { isCorrect: true, score: 1, attemptNumber: 2 } }),
      // Another session's entry never leaks in.
      entry({ sessionId: 'someone-else', questionInstanceId: 'qx', questionNumber: 1 }),
    ],
  });
  assert.equal(recap.available, true);
  assert.deepEqual(recap.items.map((item) => [item.questionInstanceId, item.outcome]), [['q2', 'missed'], ['q3', 'partial']]);
  assert.equal(recap.reviewedQuestions, 4);
  assert.equal(recap.missingQuestions, 0);
  assert.equal(recap.allCorrect, false);
  const [missed] = recap.items;
  assert.equal(missed.solutionReview.reasoning[1], 'Divide by 2: x = 4.');
  assert.deepEqual(missed.response.entries[0], { label: 'x =', value: '5', format: 'math' });
});

test('the recap is never built for a session that can still be answered', () => {
  for (const status of ['active', 'teacherSupportNeeded', 'superseded', undefined]) {
    const recap = buildPathSessionRecap({ session: completedSession({ status }), entries: [entry()] });
    assert.equal(recap.available, false, `status ${status}`);
    assert.deepEqual(recap.items, []);
  }
  assert.equal(buildPathSessionRecap({ session: null, entries: [entry()] }).available, false);
});

test('a perfect session says so; questions finished before entries existed are counted, not hidden', () => {
  const perfect = buildPathSessionRecap({
    session: completedSession({ summary: { completedQuestions: 1 } }),
    entries: [entry({ grading: { isCorrect: true, score: 1, attemptNumber: 1 } })],
  });
  assert.equal(perfect.allCorrect, true);
  assert.deepEqual(perfect.items, []);

  const spanning = buildPathSessionRecap({ session: completedSession({ summary: { completedQuestions: 5 } }), entries: [entry()] });
  assert.equal(spanning.missingQuestions, 4);
  assert.equal(spanning.allCorrect, false);
});

test('access: only the owner, and only once the session is completed', () => {
  assert.deepEqual(pathRecapAccess({ session: completedSession(), studentId: 'student-1' }), { allowed: true, code: null, message: null });
  const foreign = pathRecapAccess({ session: completedSession(), studentId: 'student-2' });
  const missing = pathRecapAccess({ session: null, studentId: 'student-1' });
  assert.equal(foreign.code, 'not-found');
  assert.deepEqual(foreign, missing, 'someone else\'s session reads exactly like no session');
  assert.equal(pathRecapAccess({ session: completedSession({ status: 'active' }), studentId: 'student-1' }).code, 'failed-precondition');
  assert.equal(pathRecapAccess({ session: completedSession({ status: 'teacherSupportNeeded' }), studentId: 'student-1' }).code, 'failed-precondition');
  assert.equal(pathRecapAccess({ session: completedSession(), studentId: '' }).allowed, false);
});

const seed = (sessions = {}, submissions = {}) => new FakeFirestore({ pathSessions: sessions, pathSubmissions: submissions });
const submission = (studentId, sessionId, recapEntry) => ({
  studentId, sessionId, submissionId: 'sub', createdAt: 1, result: {}, recapJson: serializePathRecapEntry(recapEntry),
});

test('the server loader refuses an active or foreign session before reading any submission', async () => {
  const db = seed({
    'session-1': completedSession({ status: 'active' }),
    'session-2': completedSession({ sessionId: 'session-2', studentId: 'student-2' }),
  }, { a: submission('student-1', 'session-1', entry()) });

  const active = await recapLib.loadMyPathSessionRecap(db, { studentId: 'student-1', sessionId: 'session-1' });
  assert.equal(active.refused.code, 'failed-precondition');
  const foreign = await recapLib.loadMyPathSessionRecap(db, { studentId: 'student-1', sessionId: 'session-2' });
  assert.equal(foreign.refused.code, 'not-found');
  const missing = await recapLib.loadMyPathSessionRecap(db, { studentId: 'student-1', sessionId: 'nope' });
  assert.equal(missing.refused.code, 'not-found');
  assert.equal(db.reads.filter((read) => read.collection === 'pathSubmissions').length, 0,
    'a refused recap must not read a single submission');
});

test('the server loader returns the owner\'s missed questions from the finalizing submissions', async () => {
  const db = seed({ 'session-1': completedSession() }, {
    a: submission('student-1', 'session-1', entry({ questionInstanceId: 'q1', questionNumber: 1 })),
    b: submission('student-1', 'session-1', entry({ questionInstanceId: 'q2', questionNumber: 2, grading: { isCorrect: true, score: 1, attemptNumber: 1 } })),
    // An attempt that left its question open carries no recap.
    c: { studentId: 'student-1', sessionId: 'session-1', result: {} },
    // A submission row with someone else's id is ignored, whatever it holds.
    d: submission('student-9', 'session-1', entry({ questionInstanceId: 'q9', questionNumber: 3 })),
  });
  const { recap } = await recapLib.loadMyPathSessionRecap(db, { studentId: 'student-1', sessionId: 'session-1' });
  assert.equal(recap.available, true);
  assert.deepEqual(recap.items.map((item) => item.questionInstanceId), ['q1']);
  assert.equal(recap.reviewedQuestions, 2);
});

// The callable, cut out of functions/index.js and run with its real
// authorization and diagnostics helpers.
const runRecapCallable = async ({ db, request }) => {
  const source = region(SERVER, 'exports.getMyPathSessionRecap = onCall(', '\n}));\n', 'getMyPathSessionRecap');
  const helpers = ['requireStudent', 'isHttpsCallableError', 'pathDiagnosticId', 'withPathCallableDiagnostics'].map(topLevelFunction);
  const collaborators = {
    onCall: (handler) => handler,
    HttpsError,
    getFirestore: () => db,
    logger: { info() {}, warn() {}, error() {} },
    crypto,
    pathSessionRecap: recapLib,
  };
  const factory = new Function(
    ...Object.keys(collaborators),
    `"use strict";\n${helpers.join('\n')}\nconst exports = {};\n${source}\n}));\nreturn exports.getMyPathSessionRecap;`,
  );
  return factory(...Object.values(collaborators))(request);
};
const studentRequest = (studentId, data) => ({ auth: { uid: `uid-${studentId}`, token: { role: 'student', studentId } }, data });

test('getMyPathSessionRecap: an active session is refused, a foreign one is not found, a finished one is the owner\'s', async () => {
  const db = seed({
    'session-1': completedSession({ status: 'active' }),
    'session-2': completedSession({ sessionId: 'session-2' }),
    'session-3': completedSession({ sessionId: 'session-3', studentId: 'student-2' }),
  }, {
    a: submission('student-1', 'session-1', entry({ sessionId: 'session-1' })),
    b: submission('student-1', 'session-2', entry({ sessionId: 'session-2' })),
  });

  await assert.rejects(runRecapCallable({ db, request: studentRequest('student-1', { sessionId: 'session-1' }) }),
    (error) => error instanceof HttpsError && error.code === 'failed-precondition');
  await assert.rejects(runRecapCallable({ db, request: studentRequest('student-1', { sessionId: 'session-3' }) }),
    (error) => error instanceof HttpsError && error.code === 'not-found');
  await assert.rejects(runRecapCallable({ db, request: studentRequest('student-1', {}) }),
    (error) => error.code === 'invalid-argument');
  await assert.rejects(runRecapCallable({ db, request: { auth: null, data: { sessionId: 'session-2' } } }),
    (error) => error.code === 'unauthenticated');
  await assert.rejects(runRecapCallable({ db, request: { auth: { uid: 't', token: { role: 'teacher', email: 't@x.org' } }, data: { sessionId: 'session-2' } } }),
    (error) => error.code === 'permission-denied');

  const ok = await runRecapCallable({ db, request: studentRequest('student-1', { sessionId: 'session-2' }) });
  assert.equal(ok.success, true);
  assert.equal(ok.available, true);
  assert.deepEqual(ok.items.map((item) => item.questionInstanceId), ['qi-1']);
});

test('submitPathResponse records the entry on the finalizing submission, from rules loaded before the transaction', () => {
  const source = executableSource(SERVER);
  assert.match(source, /^const pathSessionRecap = require\("\.\/lib\/pathSessionRecap"\);$/m);
  const submit = region(source, 'exports.submitPathResponse = onCall(', 'exports.getMyPathSessionRecap', 'submitPathResponse');
  const preload = submit.indexOf('const recapRules = await pathSessionRecap.pathSessionRecapRules();');
  assert.ok(preload > 0 && preload < submit.indexOf('db.runTransaction('),
    'a cold module import must never run inside the submit transaction');
  const recorded = region(submit, 'const recapJson = pathSessionRecap.closedQuestionRecapJson(recapRules, {', 'return { duplicate: false, result };', 'recap write');
  assert.match(recorded, /currentQuestion,/);
  assert.match(recorded, /grading: result\.grading,/);
  assert.match(recorded, /solutionReview: attemptSupport\.solutionReview,/);
  assert.match(recorded, /transaction\.set\(submissionRef, \{ studentId, sessionId, submissionId, createdAt: now, result, \.\.\.\(recapJson \? \{ recapJson \} : \{\}\) \}\);/);
});
