// GOOGLE CLASSROOM GRADE PUSHES STAY UNDER GOOGLE'S LIMIT, AND SAY WHY THEY FAIL.
//
// Oct 14, 2026: a teacher reconnected Google and pressed "Retry all eligible
// failures". The browser called retryClassroomGradeSync once per failed row,
// each call signalled the grade triggers at once, and 208 retries became
// about 2,000 Classroom requests in 70 seconds. Google allows a teacher 600 a
// minute: 410 pushes were refused for the limit and marked failed, 8 synced.
// 337 more failed with "Precondition check failed.", and nobody could say why:
// only the message was kept, and the section trigger's log lost even that.
//
// Now every bulk sender queues its students (functions/lib/classroomPushQueue.js),
// a 1-minute drain releases what fits in two thirds of each teacher's minute,
// a push Google still refuses for the limit is queued again instead of failing,
// and a failed push keeps Google's status, reason and the call that failed
// (functions/lib/classroomPushErrors.js). The real Firestore and both real
// triggers are exercised in tests/integration/classroomPushPacing.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listDeployableFunctions } from '../../scripts/lib/functionsInventory.mjs';
import {
  gradeSyncErrorText,
  gradeSyncStatusLabel,
  isGradeSyncRetryEligible,
} from '../../src/classroomGradeSyncUi.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromFunctions = createRequire(path.join(root, 'functions/index.js'));
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const { GaxiosError } = requireFromFunctions('gaxios');
const errors = requireFromFunctions('./lib/classroomPushErrors.js');
const queue = requireFromFunctions('./lib/classroomPushQueue.js');
const classroomLib = requireFromFunctions('./lib/classroom.js');

/* --- what Google said ----------------------------------------------------- */

const TOKEN = 'ya29.SECRET-ACCESS-TOKEN';
const googleError = ({ status, body }) => {
  const config = {
    url: 'https://classroom.googleapis.com/v1/courses/1/courseWork/2/studentSubmissions/3',
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}` },
  };
  return new GaxiosError(body.error.message, config, {
    status, statusText: '', data: body, headers: {}, config, request: { responseURL: config.url },
  });
};
const PRECONDITION = () => googleError({
  status: 400,
  body: { error: {
    code: 400, message: 'Precondition check failed.', status: 'FAILED_PRECONDITION',
    errors: [{ message: 'Precondition check failed.', domain: 'global', reason: 'failedPrecondition' }],
  } },
});
const QUOTA_MESSAGE = "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute per user' of service 'classroom.googleapis.com' for consumer 'project_number:1'.";
const QUOTA = () => googleError({
  status: 429,
  body: { error: {
    code: 429, message: QUOTA_MESSAGE, status: 'RESOURCE_EXHAUSTED',
    details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'RATE_LIMIT_EXCEEDED', domain: 'googleapis.com' }],
  } },
});
// A client whose three submission calls answer as given.
const fakeClassroom = ({ list, patch, ret }) => ({
  courses: { courseWork: { studentSubmissions: {
    list: async () => (list ? list() : { data: { studentSubmissions: [{ id: 'sub-1', state: 'CREATED' }] } }),
    patch: async () => (patch ? patch() : { data: { state: 'CREATED' } }),
    return: async () => (ret ? ret() : {}),
  } } },
});
const thrown = async (promise) => {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected the call to throw');
};

test('a refused grade keeps Google\'s HTTP status, status name, reason and the call that failed, never the request', async () => {
  const error = await thrown(classroomLib.patchGrade(fakeClassroom({ patch: () => { throw PRECONDITION(); } }), {
    courseId: '1', courseWorkId: '2', submissionId: '3', grade: 80,
  }));
  const description = errors.describeClassroomError(error);
  assert.deepEqual(description, {
    step: 'patch-grade',
    httpStatus: 400,
    googleStatus: 'FAILED_PRECONDITION',
    reasons: ['failedPrecondition'],
    message: 'Precondition check failed.',
  });
  assert.equal(errors.isClassroomQuotaError(description), false);
  assert.doesNotMatch(JSON.stringify(errors.classroomErrorAuditFields(description)), /SECRET|Bearer|Authorization/);

  const listError = await thrown(classroomLib.findSubmissionForStudent(fakeClassroom({ list: () => { throw QUOTA(); } }), {
    courseId: '1', courseWorkId: '2', googleUserId: 'g',
  }));
  assert.equal(errors.describeClassroomError(listError).step, 'find-submission');
  const returnError = await thrown(classroomLib.returnSubmission(fakeClassroom({ ret: () => { throw PRECONDITION(); } }), {
    courseId: '1', courseWorkId: '2', submissionId: '3',
  }));
  assert.equal(errors.describeClassroomError(returnError).step, 'return-submission');
});

test('Google\'s per-minute limit is recognised from the error and from the stored message alone', () => {
  const description = errors.describeClassroomError(QUOTA());
  assert.equal(description.httpStatus, 429);
  assert.equal(description.googleStatus, 'RESOURCE_EXHAUSTED');
  assert.deepEqual(description.reasons, ['RATE_LIMIT_EXCEEDED']);
  assert.equal(errors.isClassroomQuotaError(description), true);
  assert.equal(errors.isClassroomQuotaError(errors.describeClassroomError(new Error(QUOTA_MESSAGE))), true);
  assert.equal(errors.isClassroomQuotaError(errors.describeClassroomError(new Error('Requested entity was not found.'))), false);
});

test('a limit refusal is "rate-limited" while it can be queued again and "failed" once it cannot; any other refusal fails', () => {
  const queuedAgain = errors.classroomPushFailure(QUOTA(), { mayRequeue: true });
  assert.equal(queuedAgain.quota, true);
  assert.equal(queuedAgain.audit.status, 'rate-limited');
  assert.equal(queuedAgain.audit.errorCode, 429);
  assert.match(queuedAgain.audit.message, /sends this grade again automatically/);

  const givenUp = errors.classroomPushFailure(QUOTA(), { mayRequeue: false });
  assert.equal(givenUp.audit.status, 'failed');
  assert.match(givenUp.audit.message, /Retry it from this page/);

  const refused = errors.classroomPushFailure(PRECONDITION(), { mayRequeue: true });
  assert.equal(refused.quota, false);
  assert.equal(refused.audit.status, 'failed');
  assert.equal(refused.audit.errorStatus, 'FAILED_PRECONDITION');

  assert.equal(errors.classroomPushHeldForLimit({ mayRequeue: true }).status, 'rate-limited');
  assert.equal(errors.classroomPushHeldForLimit({ mayRequeue: false }).status, 'failed');
});

/* --- what a push costs, and what fits in a minute ------------------------- */

const published = (extra) => ({ status: 'published', courseworkId: 'cw', ...extra });

test('a student\'s push costs three requests for every column either trigger sends to, per teacher', () => {
  const costs = queue.classroomRequestsPerStudent([
    published({ teacherUid: 't1', publicationKind: 'assignment' }),
    ...['warmup', 'classwork', 'practice', 'dol'].map((sectionKey) => published({
      teacherUid: 't1', publicationKind: 'section', sectionKey, gradePassbackEnabled: false, sectionGradePassbackEnabled: true,
    })),
    published({ teacherUid: 't1', publicationKind: 'section', gradePassbackEnabled: false, sectionGradePassbackEnabled: false }),
    { status: 'draft', courseworkId: 'cw', teacherUid: 't1' },
    { status: 'published', teacherUid: 't1' },
    published({ teacherUid: 't2' }),
    published({}),
  ]);
  assert.deepEqual(Object.fromEntries(costs), { t1: 15, t2: 3, __legacy__: 3 });
});

const entries = (assignmentId, count, extra = {}) => Array.from({ length: count }, (_, index) => ({
  assignmentId, studentId: `${assignmentId}-s${index}`, reason: 'manual-retry', ...extra,
}));
const costs = (pairs) => new Map(pairs.map(([assignmentId, teacherCosts]) => [assignmentId, new Map(Object.entries(teacherCosts))]));

test('one minute releases at most 400 requests a teacher, oldest first, and leaves the rest queued', () => {
  const plan = queue.planClassroomPushDrain(entries('wide', 200), costs([['wide', { t1: 12 }]]));
  assert.equal(plan.release.length, 33, '33 x 12 = 396; a 34th would be 408');
  assert.deepEqual(plan.release.map((entry) => entry.studentId), entries('wide', 33).map((entry) => entry.studentId));
  assert.equal(plan.held, 167);
  assert.equal(plan.requestsByTeacher.get('t1'), 396);
  assert.ok(plan.requestsByTeacher.get('t1') <= queue.TEACHER_REQUESTS_PER_DRAIN);
  assert.ok(queue.TEACHER_REQUESTS_PER_DRAIN < 600, 'below Google\'s 600 a minute, with room for students working now');
});

test('each teacher has a budget of their own, and the project has one over all of them', () => {
  const both = [...entries('a', 200), ...entries('b', 200)];
  const plan = queue.planClassroomPushDrain(both, costs([['a', { t1: 3 }], ['b', { t2: 3 }]]));
  assert.equal(plan.requestsByTeacher.get('t1'), 399);
  assert.equal(plan.requestsByTeacher.get('t2'), 399);
  assert.equal(plan.release.length, 266);

  const capped = queue.planClassroomPushDrain(both, costs([['a', { t1: 3 }], ['b', { t2: 3 }]]), { projectBudget: 300 });
  assert.equal(capped.projectRequests, 300);
  assert.equal(capped.release.length, 100);
});

test('a teacher\'s first push always goes, however wide, so a wide assignment never waits forever', () => {
  const plan = queue.planClassroomPushDrain(entries('huge', 3), costs([['huge', { t1: 450 }]]));
  assert.equal(plan.release.length, 1);
  assert.equal(plan.held, 2);
});

test('two queued reasons for one student go out in different minutes, never collapsed into one write', () => {
  const twice = [
    { assignmentId: 'a', studentId: 's', reason: 'final-deadline' },
    { assignmentId: 'a', studentId: 's', reason: 'manual-retry' },
    { assignmentId: 'a', studentId: 't', reason: 'manual-retry' },
  ];
  const plan = queue.planClassroomPushDrain(twice, costs([['a', { t1: 3 }]]));
  assert.deepEqual(plan.release.map((entry) => `${entry.studentId}:${entry.reason}`), ['s:final-deadline', 't:manual-retry']);
});

test('a refused push waits 1, 2, 4, 8, 16 and then 30 minutes, eight times, about two hours in all', () => {
  const minutes = Array.from({ length: queue.MAX_QUOTA_RETRIES }, (_, attempt) => queue.quotaBackoffMs(attempt) / 60_000);
  assert.deepEqual(minutes, [1, 2, 4, 8, 16, 30, 30, 30]);
  assert.equal(minutes.reduce((sum, value) => sum + value, 0), 121);
});

test('the released signal keeps the reason and the retry count, and is new every time', () => {
  const signal = queue.releaseSignalFor({ reason: 'final-deadline', requestedAt: 'then', quotaRetry: 2 }, '2026-10-14T22:00:00.000Z');
  assert.deepEqual(signal, {
    requestedAt: '2026-10-14T22:00:00.000Z', reason: 'final-deadline', source: 'classroom-push-queue', firstRequestedAt: 'then', quotaRetry: 2,
  });
  assert.equal('quotaRetry' in queue.releaseSignalFor({ reason: 'manual-retry' }, 'now'), false);
});

/* --- every bulk sender goes through the queue ---------------------------- */

// From a declaration to the next top-level one.
const bodyOf = (source, signature) => {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} exists`);
  const rest = source.slice(start + signature.length);
  const next = rest.search(/\n(?:async function |function |const |let |exports\.|module\.exports)/);
  return signature + (next < 0 ? rest : rest.slice(0, next));
};

test('no bulk sender signals grade documents directly any more', () => {
  const index = read('functions/index.js');
  const section = read('functions/classroomSectionEntry.js');
  const force = read('functions/classroomSectionForceEntry.js');
  const senders = [
    ['section reconcile, first publish and checkpoints', bodyOf(section, 'async function queueGradeSignalForAssignmentAudience')],
    ['force republish', bodyOf(force, 'async function queueGradeSignalForAssignmentAudience')],
    ['whole-assignment checkpoints', bodyOf(index, 'async function queueClassroomGradeSignalForAudience')],
    ['released assessments', bodyOf(index, 'exports.queueReleasedAssessmentGrades = ')],
    ['reposted assignment', bodyOf(index, 'async function queueRepostedAssignmentGrades')],
    ['one row\'s retry', bodyOf(index, 'exports.retryClassroomGradeSync = ')],
    ['retry all', bodyOf(index, 'exports.retryAllClassroomGradeSyncs = ')],
  ];
  for (const [name, body] of senders) {
    assert.match(body, /enqueueClassroomPushes\(db, \{/, `${name} queues`);
    assert.doesNotMatch(body, /classroomReleaseSignals/, `${name} does not signal directly`);
  }
});

test('both triggers stop forcing on a queued retry, requeue a limit refusal, and log Google\'s answer under its own names', () => {
  const index = read('functions/index.js');
  const section = read('functions/classroomSectionEntry.js');
  const whole = bodyOf(index, 'exports.syncGradeToClassroom = onDocumentWritten(');
  const split = bodyOf(section, 'const syncSectionGradeToClassroom = onDocumentWritten(');
  for (const [name, body] of [['whole', whole], ['section', split]]) {
    assert.match(body, /&& quotaRetry === 0;/, `${name}: a queued retry does not force`);
    assert.match(body, /classroomPushFailure\(/, `${name}: Google's answer is described`);
    assert.match(body, /teachersAtClassroomLimit\.has\(/, `${name}: stops calling Google after the limit`);
    assert.match(body, /requeueClassroomPushAfterQuota\(db, \{/, `${name}: requeues`);
    assert.match(body, /\.\.\.clearedClassroomErrorFields\(\),\n\s+assignmentId,/, `${name}: a synced row drops old errors`);
    assert.doesNotMatch(body, /error: String\(err(or)?\.message/, `${name}: no bare message`);
  }
  const sectionLog = split.slice(split.indexOf('logger.error("Section grade passback failed"'));
  assert.doesNotMatch(sectionLog.slice(0, sectionLog.indexOf('});')), /\bmessage:/, 'the logger\'s own message field cannot replace the error');
});

test('the drain runs every minute and Retry all is one server call', () => {
  const { functions } = listDeployableFunctions();
  const drain = functions.find((fn) => fn.name === 'drainClassroomPushQueue');
  assert.ok(drain, 'drainClassroomPushQueue is deployed');
  assert.equal(drain.trigger, 'schedule');
  assert.equal(drain.schedule, 'every 1 minutes');
  assert.ok(drain.timeoutSeconds >= 60 && drain.timeoutSeconds <= 120);
  const retryAll = functions.find((fn) => fn.name === 'retryAllClassroomGradeSyncs');
  assert.equal(retryAll?.trigger, 'callable');

  assert.match(read('src/classroomApi.js'), /retryAllClassroomGradeSyncs = call\("retryAllClassroomGradeSyncs"\)/);
  const manager = read('src/ClassroomManagerV2.jsx');
  const button = manager.slice(manager.indexOf('can be retried now'), manager.indexOf('Retry all eligible failures'));
  assert.match(button, /await retryAllClassroomGradeSyncs\(\)/);
  assert.doesNotMatch(button, /for \(const sync of retryableGradeSyncs\)/, 'no browser loop of one call per row');
});

/* --- what the teacher sees ----------------------------------------------- */

test('the monitor says a row is queued or waiting for Google\'s limit, and does not offer to retry it', () => {
  const row = { status: 'failed', publicationId: 'p', assignmentId: 'a', studentId: 's' };
  assert.equal(isGradeSyncRetryEligible(row), true);
  assert.equal(isGradeSyncRetryEligible({ ...row, queued: true }), false);
  assert.equal(isGradeSyncRetryEligible({ ...row, status: 'rate-limited' }), false);
  assert.equal(gradeSyncStatusLabel({ ...row, queued: true }), 'Queued to send');
  assert.equal(gradeSyncStatusLabel({ status: 'rate-limited' }), 'Waiting: Classroom limit');
  assert.equal(gradeSyncStatusLabel(row), 'Failed');
});

test('a failed row shows what Google said, with its status, reason and the call that failed', () => {
  assert.equal(gradeSyncErrorText({
    status: 'failed', error: 'Precondition check failed.', errorStatus: 'FAILED_PRECONDITION',
    errorReasons: ['failedPrecondition'], errorStep: 'return-submission',
  }), 'Precondition check failed. (FAILED_PRECONDITION, failedPrecondition) at return submission');
  assert.equal(gradeSyncErrorText({ status: 'failed', error: 'Requested entity was not found.' }), 'Requested entity was not found.');
  assert.equal(gradeSyncErrorText({ status: 'synced', error: 'invalid_grant' }), '', 'a synced row shows no old error');
});
