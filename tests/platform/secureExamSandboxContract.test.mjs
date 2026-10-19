/*
 * THE SECURE-EXAM SANDBOX PLAYS THE SAME CONTRACT AS THE FUNCTIONS.
 *
 * src/services/secureExamService.js has a MOCK_LOCAL sandbox that a developer
 * build and the browser harness (tests/browser/secureExamNavigation.mjs) run
 * the student's secure screens against. A sandbox that behaves differently
 * from the server teaches the screen the wrong thing, so this drives it
 * through a whole test and compares its refusals with the server's own rules
 * (functions/lib/secureExamNavigation.js).
 *
 * What is protected, in words:
 *   - a question is issued only when the student reaches it; only the next
 *     unopened one can be reached; module 2 needs `closeModule` and closes
 *     module 1 — refused with the server's words and `details.navigation`;
 *   - a draft saves for ANY open question, a review flag saves without
 *     touching the answer, and nothing saved is graded;
 *   - the second integrity event warns, the third pauses, and a paused
 *     session's calls carry `details.status`; time up is `deadline-exceeded`
 *     (on the sandbox's clock — nothing here waits for real time to pass);
 *   - a not-started session is listed with the student's extended time, as
 *     the server projects it, and Start applies exactly that, once;
 *   - finishing grades every open draft once, blank ones as unanswered; a
 *     practice test's results are released at once and a course Test's are
 *     not; answers and solutions appear only in a released review;
 *   - importing the service never loads the live Firebase project, and the
 *     sandbox never reaches a Cloud Function.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, register } from 'node:module';

register('./helpers/secureExamServiceIsolation.mjs', import.meta.url);
const service = await import('../../src/services/secureExamService.js');
const require_ = createRequire(import.meta.url);
const server = require_('../../functions/lib/secureExamNavigation.js');

const refusal = async (promise) => {
  try { await promise; } catch (error) { return error; }
  assert.fail('expected the sandbox to refuse');
  return null;
};
const serverReason = (sessionShape, request) => server.resolveTarget({
  examType: sessionShape.examType,
  requiredQuestions: sessionShape.required,
  navigation: {
    version: 1,
    itemOrder: Array.from({ length: sessionShape.issued }, (_, index) => `q${index}`),
    items: Object.fromEntries(Array.from({ length: sessionShape.issued }, (_, index) => [`q${index}`, { position: index, state: 'open', hasWork: false, flagged: false }])),
    cursor: 0,
    closedThrough: sessionShape.closedThrough || 0,
    modules: server.moduleLayoutFor(sessionShape.examType, sessionShape.required),
  },
}, request);

test('a Digital SAT practice test: issue by position, skip, mark, module close, pause, finish, release', async () => {
  const created = (await service.createSecureExamSession({ studentId: 'student-1', examType: 'digitalSAT', questionCount: 4 })).session;
  assert.equal(created.status, 'not_started');
  assert.equal(created.releasePolicy, 'automatic', 'a practice test releases its results itself');
  assert.deepEqual(created.navigation.modules.map((entry) => [entry.start, entry.end]), [[0, 2], [2, 4]]);
  const id = created.examSessionId;

  const started = (await service.startSecureExamSession({ examSessionId: id })).session;
  assert.equal(started.status, 'in_progress');
  assert.equal(started.timeLimitSeconds, 7 * 60, '4 of 44 questions keep the SAT\'s pace, rounded up to a minute');
  assert.ok(started.expiresAt > Date.now());
  assert.equal(started.integrityLockThreshold, 3);

  const first = await service.issueSecureExamQuestion({ examSessionId: id, position: 0 });
  assert.equal(first.position, 0);
  assert.equal(first.recorded, false);
  const answerFields = ['key', 'answer', 'answers', 'acceptedAnswers', 'correctAnswer', 'solution', 'privateGrading', 'grading', 'isCorrect'];
  assert.deepEqual(Object.keys(first.questionInstance).filter((field) => answerFields.includes(field)), [], 'the issued item carries no answer');

  const tooFar = await refusal(service.issueSecureExamQuestion({ examSessionId: id, position: 2 }));
  assert.equal(tooFar.code, 'functions/failed-precondition');
  assert.equal(tooFar.details.navigation, 'not_reached');
  assert.equal(tooFar.message, serverReason({ examType: 'digitalSAT', required: 4, issued: 1 }, { position: 2 }).reason);

  const q0 = first.questionInstance.questionInstanceId;
  let saved = await service.saveSecureExamDraft({ examSessionId: id, questionInstanceId: q0, responsePayload: { responses: { answer: '42' } }, supportUsage: {} });
  assert.deepEqual([saved.navigation.items[0].status, saved.answeredQuestions], ['answered', 1]);
  saved = await service.saveSecureExamDraft({ examSessionId: id, questionInstanceId: q0, flagged: true });
  assert.deepEqual([saved.navigation.items[0].flagged, saved.navigation.items[0].status, saved.answeredQuestions], [true, 'answered', 1], 'a flag alone keeps the answer');
  const reopened = await service.issueSecureExamQuestion({ examSessionId: id, position: 0 });
  assert.deepEqual(reopened.draftResponse.responsePayload, { responses: { answer: '42' } }, 'the draft comes back with the question');
  assert.equal((await refusal(service.saveSecureExamDraft({ examSessionId: id, questionInstanceId: q0 }))).code, 'functions/invalid-argument');

  // Skip question 2: Next simply opens it and moves on.
  const second = await service.issueSecureExamQuestion({ examSessionId: id, position: 1 });
  assert.equal(second.session.navigation.issued, 2);

  const moduleEnd = await refusal(service.issueSecureExamQuestion({ examSessionId: id, position: 2 }));
  assert.equal(moduleEnd.details.navigation, 'module_end');
  assert.equal(moduleEnd.message, serverReason({ examType: 'digitalSAT', required: 4, issued: 2 }, { position: 2 }).reason);
  const third = await service.issueSecureExamQuestion({ examSessionId: id, position: 2, closeModule: true });
  assert.equal(third.session.navigation.modules[0].closed, true);
  assert.deepEqual(third.session.navigation.items.map((item) => item.closed), [true, true, false]);
  const closed = await refusal(service.issueSecureExamQuestion({ examSessionId: id, position: 0 }));
  assert.equal(closed.details.navigation, 'module_closed');
  assert.equal(closed.message, serverReason({ examType: 'digitalSAT', required: 4, issued: 3, closedThrough: 2 }, { position: 0 }).reason);
  assert.equal((await refusal(service.saveSecureExamDraft({ examSessionId: id, questionInstanceId: q0, flagged: false }))).message, 'That question is no longer active.');

  // Leaving the window: warned on the second event, paused on the third.
  const event = (n) => service.recordSecureExamIntegrityEvent({ examSessionId: id, eventId: `event-${n}`, type: 'window_blur' });
  assert.deepEqual(await event(1), { success: true, status: 'in_progress', violationCount: 1, lockThreshold: 3, warning: false });
  assert.equal((await event(2)).warning, true);
  assert.equal((await event(2)).duplicate, true, 'the same event is counted once');
  assert.deepEqual(await event(3), { success: true, status: 'locked_integrity', violationCount: 3, lockThreshold: 3, warning: false });
  const paused = await refusal(service.issueSecureExamQuestion({ examSessionId: id, position: 3 }));
  assert.deepEqual([paused.code, paused.details.status], ['functions/failed-precondition', 'locked_integrity']);
  assert.equal((await refusal(service.finalizeSecureExam({ examSessionId: id }))).message, 'A locked exam must be resolved by the proctor.');
  assert.equal((await service.startSecureExamSession({ examSessionId: id })).session.status, 'locked_integrity', 'start returns a paused session unchanged');
  await service.proctorExamAction({ examSessionId: id, action: 'unlock' });

  const finished = (await service.finalizeSecureExam({ examSessionId: id, reason: 'studentSubmit' })).session;
  assert.deepEqual([finished.status, finished.feedbackReleased, finished.answeredQuestions], ['submitted', true, 1]);
  assert.equal((await service.finalizeSecureExam({ examSessionId: id })).session.status, 'submitted', 'finishing twice is harmless');
  // The student's list and the proctor's monitor read the same public session.
  const listed = (await service.listStudentSecureExamSessions()).sessions.find((entry) => entry.examSessionId === id);
  assert.deepEqual([listed.status, listed.feedbackReleased, listed.navigation.total], ['submitted', true, 4]);
  assert.equal('issued' in listed || 'responses' in listed || 'nav' in listed, false, 'no issued item, key or response leaves the sandbox');
  assert.ok((await service.listProctorExamSessions({ examType: 'digitalSAT' })).sessions.some((entry) => entry.examSessionId === id));
  const { review } = await service.getStudentSecureExamReview({ examSessionId: id });
  assert.deepEqual(review.items.map((item) => [item.position, item.unanswered]), [[0, false], [1, true], [2, true]]);
  assert.deepEqual([review.plannedQuestions, review.answeredQuestions, review.scoreBasis], [4, 1, 'planned']);
  assert.ok(review.items.every((item) => item.solution && item.solution.answers.length), 'released solutions, only now');
  assert.ok(review.items.filter((item) => item.unanswered).every((item) => item.grading.score === 0));
});

test('a course Test keeps its results for the teacher; time up is deadline-exceeded and finishes as timed out', async () => {
  const { session } = await service.createSecureExamSession({
    studentId: 'student-2', examType: 'courseTest', questionCount: 2, timeLimitMinutes: 10,
    sandboxItems: [
      { question: { prompt: 'Solve $x+1=3$.', responseFields: [{ id: 'answer', label: 'Answer' }] }, key: { answers: { answer: '2' }, display: '2' } },
      { question: { prompt: 'Solve $x-1=3$.', responseFields: [{ id: 'answer', label: 'Answer' }] }, key: { answers: { answer: '4' }, display: '4' } },
    ],
  });
  assert.equal(session.releasePolicy, 'teacher');
  const id = session.examSessionId;
  await service.startSecureExamSession({ examSessionId: id });
  const item = await service.issueSecureExamQuestion({ examSessionId: id, position: 0 });
  assert.equal(item.questionInstance.prompt, 'Solve $x+1=3$.');
  assert.equal(item.questionInstance.runtimeMode, 'secureTest');
  await service.saveSecureExamDraft({ examSessionId: id, questionInstanceId: item.questionInstance.questionInstanceId, responsePayload: { responses: { answer: '2' } } });
  // Not yet: the sandbox, like the server, refuses a time-up finish before its own deadline.
  assert.match((await refusal(service.finalizeSecureExam({ examSessionId: id, reason: 'timeExpired' }))).message, /deadline has not been reached/);
  // Eleven minutes later, on the sandbox's clock (no real waiting, so a slow
  // machine cannot run the deadline out early).
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60 * 1000;
  try {
    const late = await refusal(service.issueSecureExamQuestion({ examSessionId: id, position: 1 }));
    assert.deepEqual([late.code, late.message], ['functions/deadline-exceeded', 'The exam time has expired.']);
    const finished = (await service.finalizeSecureExam({ examSessionId: id, reason: 'timeExpired' })).session;
    assert.deepEqual([finished.status, finished.feedbackReleased], ['time_expired', false]);
  } finally {
    Date.now = realNow;
  }
  await assert.rejects(service.getStudentSecureExamReview({ examSessionId: id }), /not released/);
  await service.proctorExamAction({ examSessionId: id, action: 'releaseFeedback' });
  const { review } = await service.getStudentSecureExamReview({ examSessionId: id });
  assert.deepEqual(review.items.map((entry) => entry.grading.isCorrect), [true]);
});

test('the student\'s list states their extended time before Start, as the server projects it', async () => {
  const { session } = await service.createSecureExamSession({ studentId: 'student-4', examType: 'courseTest', questionCount: 2, timeLimitMinutes: 25, extendedTimeMultiplier: 1.5 });
  assert.equal(session.timeLimitSeconds, 25 * 60, 'the session itself keeps its base limit until Start');
  const listed = (await service.listStudentSecureExamSessions()).sessions.find((entry) => entry.examSessionId === session.examSessionId);
  // functions/index.js projectedSecureExamTime: the multiplier on the base
  // limit, rounded up to a minute (accommodatedTimeLimitSeconds).
  const expected = server.accommodatedTimeLimitSeconds(25 * 60, 1.5);
  assert.deepEqual([listed.status, listed.timeLimitSeconds, listed.baseTimeLimitSeconds, listed.extendedTimeMultiplier], ['not_started', expected, 25 * 60, 1.5]);
  const started = (await service.startSecureExamSession({ examSessionId: session.examSessionId })).session;
  assert.deepEqual([started.timeLimitSeconds, started.baseTimeLimitSeconds, started.extendedTimeMultiplier], [expected, 25 * 60, 1.5], 'Start applies exactly what the list promised');
  assert.equal(started.expiresAt - started.startedAt, expected * 1000);
  const relisted = (await service.listStudentSecureExamSessions()).sessions.find((entry) => entry.examSessionId === session.examSessionId);
  assert.equal(relisted.timeLimitSeconds, expected, 'and is not extended twice');
  const resumed = (await service.startSecureExamSession({ examSessionId: session.examSessionId })).session;
  assert.deepEqual([resumed.timeLimitSeconds, resumed.expiresAt], [expected, started.expiresAt], 'coming back neither extends the time again nor restarts the clock');
  // No accommodation, no projection.
  const plain = (await service.createSecureExamSession({ studentId: 'student-5', examType: 'act', questionCount: 3 })).session;
  const plainListed = (await service.listStudentSecureExamSessions()).sessions.find((entry) => entry.examSessionId === plain.examSessionId);
  assert.equal('extendedTimeMultiplier' in plainListed, false);
});

test('a teacher pause and resume, an extension that moves the deadline, and a teacher submit', async () => {
  const { session } = await service.createSecureExamSession({ studentId: 'student-3', examType: 'act', questionCount: 3 });
  const id = session.examSessionId;
  const startedAt = (await service.startSecureExamSession({ examSessionId: id })).session;
  await service.issueSecureExamQuestion({ examSessionId: id, position: 0 });
  // The clock is held still, then moved exactly 90 seconds between the pause
  // and the resume, so the paused time is exact (not a millisecond tick).
  const realNow = Date.now;
  const pausedAt = realNow();
  Date.now = () => pausedAt;
  try {
    await service.proctorExamAction({ examSessionId: id, action: 'lock' });
    const paused = await refusal(service.saveSecureExamDraft({ examSessionId: id, questionInstanceId: 'anything', flagged: true }));
    assert.equal(paused.details.status, 'locked_proctor');
    Date.now = () => pausedAt + 90 * 1000;
    const unlocked = (await service.proctorExamAction({ examSessionId: id, action: 'unlock' })).session;
    assert.equal(unlocked.expiresAt - startedAt.expiresAt, 90 * 1000, 'a teacher\'s pause moves the deadline by exactly the time paused');
    const extended = (await service.proctorExamAction({ examSessionId: id, action: 'extendTime', minutes: 5 })).session;
    assert.equal(extended.expiresAt - unlocked.expiresAt, 5 * 60 * 1000, 'added time moves the deadline; it does not restart the clock');
  } finally {
    Date.now = realNow;
  }
  const submitted = (await service.proctorExamAction({ examSessionId: id, action: 'forceSubmit' })).session;
  assert.deepEqual([submitted.status, submitted.feedbackReleased], ['force_submitted', true]);
});

test('the sandbox never reached a Cloud Function, and never loaded the live Firebase project', () => {
  assert.equal(globalThis.__secureExamFirebaseStubLoaded, true, 'firebase.js and firebase/functions resolved to the stub');
  assert.equal(globalThis.__secureExamCallableCalls || 0, 0);
});
