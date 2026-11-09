/*
 * THE SAVE LINE SAYS "SAVED" ONLY FOR WORK THAT WAS (RUN-3).
 *
 * App.jsx's queued-work reconcile drains the device queue at sign-in, on a
 * reconnect and every 10 seconds. A drain that left nothing owed set the
 * line to its success status whether or not it had delivered anything, so:
 *
 *   - an untouched question read "Draft saved." right after sign-in (on a
 *     Chromebook, where routine lines are drawn);
 *   - a save the device refused ("Not saved · …", 'volatile') read "Draft
 *     saved." within 10 seconds, with nothing stored; and, while the queue
 *     held other work, "Draft saved on this device" (the reconcile says the
 *     queued work is there before it drains).
 *
 * saveStatusModel.persistenceStatusAfterDrain decides the status a drain
 * leaves, from the status the line shows and the drain's own tally. In the
 * browser: tests/browser/teacherWorkflow/phoneSaveLineJourneys.mjs (U, T).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';
import {
  describeRuntimeSaveLine, describeSaveStatus, drainDelivered, initialSaveSubject, nextSaveSubject, persistenceStatusAfterDrain,
  persistenceStatusOnAssignmentChange, persistenceStatusWithQueuedWork, persistenceStatusWithUnstoredWork, withUnstoredWork, withoutUnstoredWork,
} from '../../src/platform/student/saveStatusModel.js';
import { describeLogoutRisk } from '../../src/platform/student/logoutGuard.js';
import {
  SUBMISSION_DISPOSITION, createDurableAction, createMemoryOutboxStorage, drainDurableActions, enqueueDurableAction,
} from '../../src/platform/performance/durableActionOutbox.js';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const NOTHING = Object.freeze({ accepted: 0, duplicate: 0, superseded: 0, permanentlyInvalid: 0, needsReview: 0, retryable: 0, failed: 0 });
const tally = (counts = {}) => ({ ...NOTHING, ...counts });
const after = (status, { remaining = 0, online = true, successStatus = 'durable', ...counts } = {}) => (
  persistenceStatusAfterDrain({ status, remaining, tally: tally(counts), online, successStatus })
);

test('a drain that delivered nothing and found nothing owed leaves the line as it is', () => {
  // The reconcile's tick on an empty queue: not a save.
  for (const status of ['idle', 'volatile', 'rejected', 'durable', 'submitted']) {
    assert.equal(after(status), status, status);
    assert.equal(after(status, { successStatus: 'submitted' }), status, `${status}, after a submit's drain`);
  }
  // "Saving…": that write has not reached the queue, so no drain delivered it.
  assert.equal(after('capturing'), 'capturing');
  // A status the model does not know is not promoted to saved either.
  assert.equal(after(undefined), 'idle');
  assert.equal(after(null), 'idle');
});

test('saved or recorded only for work this drain delivered, or work the line was waiting on', () => {
  for (const delivered of [{ accepted: 1 }, { duplicate: 1 }, { superseded: 2 }]) {
    for (const status of ['idle', 'queued', 'syncing', 'durable', 'submitted', 'capturing']) {
      assert.equal(after(status, delivered), 'durable', `${status} + ${JSON.stringify(delivered)}`);
    }
    assert.equal(after('queued', { ...delivered, successStatus: 'submitted' }), 'submitted', 'a submit\'s drain says recorded');
  }
  // Waiting on the queue, and owed nothing now (another drain or tab delivered it).
  for (const status of ['queued', 'syncing', 'offline', 'needs-review']) {
    assert.equal(after(status), 'durable', status);
    assert.equal(after(status, { successStatus: 'submitted' }), 'submitted', `${status}, after a submit's drain`);
  }
  // Retained or failed work is not delivered work.
  assert.equal(drainDelivered(tally({ retryable: 3, failed: 2, needsReview: 1, permanentlyInvalid: 1 })), 0);
  assert.equal(drainDelivered(tally({ accepted: 1, duplicate: 2, superseded: 3 })), 6);
  assert.equal(drainDelivered(undefined), 0);
});

test('a save the device refused stands until the student saves again, whatever a drain finds', () => {
  // Owed work, delivered work, or nothing at all: "Draft saved on this
  // device" or "Draft saved." over "Not saved" would read as that change saved.
  assert.equal(after('volatile', { remaining: 2, retryable: 2 }), 'volatile', 'other work still owed');
  assert.equal(after('volatile', { remaining: 1, needsReview: 1 }), 'volatile');
  assert.equal(after('volatile', { remaining: 1, retryable: 1, online: false }), 'volatile', 'offline');
  assert.equal(after('volatile', { accepted: 3 }), 'volatile', 'other work delivered');
  assert.equal(after('volatile', { superseded: 1, successStatus: 'submitted' }), 'volatile');
  // MathMaster refusing queued work for good says "not accepted": not "saved".
  assert.equal(after('volatile', { permanentlyInvalid: 1 }), 'rejected');
  assert.equal(after('volatile', { remaining: 1, retryable: 1, permanentlyInvalid: 1 }), 'volatile', 'and owed work keeps the refusal');
  // And the student's next save is what moves it: it goes through 'capturing'.
  assert.equal(after('capturing', { accepted: 1 }), 'durable');
});

test('work still owed, and work refused for good, are said as before', () => {
  for (const status of ['idle', 'queued', 'syncing', 'durable', 'submitted', 'rejected', 'capturing']) {
    assert.equal(after(status, { remaining: 1, needsReview: 1 }), 'needs-review', status);
    assert.equal(after(status, { remaining: 2, retryable: 2 }), 'syncing', status);
    assert.equal(after(status, { remaining: 2, retryable: 2, online: false }), 'offline', status);
    assert.equal(after(status, { remaining: 1, accepted: 4, retryable: 1 }), 'syncing', `${status}: owed beats delivered`);
    assert.equal(after(status, { permanentlyInvalid: 1 }), 'rejected', status);
    assert.equal(after(status, { permanentlyInvalid: 1, accepted: 2 }), 'rejected', `${status}: refused beats delivered`);
  }
});

test('in words: the reconcile says nothing under an untouched question, and nothing over a refused save', () => {
  const words = (status, subject = initialSaveSubject()) => describeRuntimeSaveLine({ persistenceStatus: status, subject: nextSaveSubject(subject, { type: 'status', status }) });
  // Sign-in, then the 10-second tick: the line is not shown at all ('idle').
  assert.equal(after(after('idle')), 'idle');
  assert.equal(words(after('idle')), null);
  // The refused save keeps its line (App.jsx draws "Not saved · …" for it), and
  // Home keeps its attention line.
  assert.equal(after(after('volatile')), 'volatile');
  assert.equal(words(after('volatile')), null, 'not one of the model\'s routine lines');
  assert.equal(describeSaveStatus({ persistenceStatus: after('volatile') }).tone, 'attention');
  // "Answer recorded by MathMaster." is not turned into "Draft saved." by the
  // next tick: that tick recorded nothing.
  const sent = nextSaveSubject(nextSaveSubject(initialSaveSubject(), { type: 'answer-sent' }), { type: 'status', status: 'queued' });
  const recorded = nextSaveSubject(sent, { type: 'status', status: after('queued', { accepted: 1, successStatus: 'submitted' }) });
  assert.equal(describeRuntimeSaveLine({ persistenceStatus: 'submitted', subject: recorded }), 'Answer recorded by MathMaster.');
  const tick = after('submitted');
  assert.equal(tick, 'submitted');
  assert.equal(describeRuntimeSaveLine({ persistenceStatus: tick, subject: nextSaveSubject(recorded, { type: 'status', status: tick }) }), 'Answer recorded by MathMaster.');
});

test('against the real drain: an empty queue delivers nothing, a queued checkpoint is delivered', async () => {
  const storage = createMemoryOutboxStorage();
  const reconcile = async () => ({ disposition: SUBMISSION_DISPOSITION.ACCEPTED });
  const empty = await drainDurableActions({ storage, studentId: 'student', reconcile });
  assert.equal(empty.remaining, 0);
  assert.equal(drainDelivered(empty.tally), 0);
  for (const status of ['idle', 'volatile']) {
    assert.equal(persistenceStatusAfterDrain({ status, remaining: empty.remaining, tally: empty.tally }), status, `${status} on an empty queue`);
  }
  await enqueueDurableAction(createDurableAction({
    kind: 'responseCheckpoint', studentId: 'student', assignmentId: 'lesson-3', questionIndex: 0, actionId: 'checkpoint-0',
    payload: { documentId: 'checkpoint-0', revision: 1 },
  }), { storage });
  const delivered = await drainDurableActions({ storage, studentId: 'student', reconcile });
  assert.equal(delivered.remaining, 0);
  assert.equal(delivered.tally.accepted, 1);
  assert.equal(persistenceStatusAfterDrain({ status: 'queued', remaining: delivered.remaining, tally: delivered.tally }), 'durable');
  assert.equal(persistenceStatusAfterDrain({ status: 'idle', remaining: delivered.remaining, tally: delivered.tally }), 'durable');
});

test('queued work found by the reconcile is said, but not over a save in progress or refused', () => {
  // A reload, or work queued since: the line says it is on this device.
  for (const status of ['idle', 'durable', 'submitted', 'rejected', 'queued', 'syncing', 'offline', 'needs-review']) {
    assert.equal(persistenceStatusWithQueuedWork(status), 'queued', status);
  }
  // The student's latest change is not that queued work.
  assert.equal(persistenceStatusWithQueuedWork('volatile'), 'volatile');
  assert.equal(persistenceStatusWithQueuedWork('capturing'), 'capturing');
  // The refused save, with progress still owed, through a whole tick.
  const tick = persistenceStatusAfterDrain({ status: persistenceStatusWithQueuedWork('volatile'), remaining: 1, tally: tally({ retryable: 1 }) });
  assert.equal(tick, 'volatile');
  assert.equal(persistenceStatusAfterDrain({ status: persistenceStatusWithQueuedWork('idle'), remaining: 1, tally: tally({ retryable: 1 }) }), 'syncing');
});

test('App: the reconcile says queued work through the model, every tick', () => {
  const reconcile = executableSource(region(app, 'const recoverAndReconcileQueuedStudentWork = async () => {', 'await reconcileAndReportStudentOutbox();', 'the reconcile'));
  assert.match(reconcile, /if \(actions\.length\) \{\s*if \(actions\.some\(isGradeBearingAction\)\) markAnswerSent\(\);\s*setStudentPersistenceStatus\(persistenceStatusWithQueuedWork\);/);
  assert.doesNotMatch(reconcile, /setStudentPersistenceStatus\('queued'\)/);
});

test('App: the drain sets the line from the line it shows and its own result, through the model', () => {
  assert.match(app, /^import \{[^}]*\bpersistenceStatusAfterDrain\b[^}]*\} from '\.\/platform\/student\/saveStatusModel\.js';$/m);
  const drain = executableSource(region(app, 'const drainStudentOutbox = async', 'return result;', 'the drain'));
  // A functional update: the status the line shows when the drain returns,
  // not the one this render saw (a save refused while the drain was out).
  assert.match(drain, /setStudentPersistenceStatus\(\(status\) => persistenceStatusAfterDrain\(\{\s*status,\s*remaining: result\.remaining,\s*tally: result\.tally,\s*online,\s*successStatus,\s*\}\)\);/);
  // It is the drain's only word on the status: nothing sets `successStatus` around it.
  assert.equal(drain.match(/setStudentPersistenceStatus\(/g).length, 1);
  assert.match(drain, /const online = navigator\.onLine;/);
});

/* ------------------------------------------------------------ moving on */
/*
 * Those false successes were also what cleared a stale "Not saved" or "not
 * accepted" line once the student had moved on. Now the line starts over on
 * another assignment, as its subject does; a change the device could not
 * store stays on Home (and Log Out asks first) until that assignment's work
 * is stored, or another account signs in. In the browser:
 * phoneSaveLineJourneys.mjs (M).
 */
test('another assignment starts the line over: a status about one save goes, one about the queue stays', () => {
  for (const status of ['durable', 'submitted', 'volatile', 'rejected']) {
    assert.equal(persistenceStatusOnAssignmentChange(status), 'idle', status);
  }
  for (const status of ['idle', 'capturing', 'queued', 'syncing', 'offline', 'needs-review']) {
    assert.equal(persistenceStatusOnAssignmentChange(status), status, status);
  }
  assert.equal(persistenceStatusOnAssignmentChange(undefined), 'idle');
});

test('the assignments with a change this device could not store, until that work is stored', () => {
  const none = [];
  const lesson3 = withUnstoredWork(none, 'lesson-3');
  assert.deepEqual(lesson3, ['lesson-3']);
  assert.equal(withUnstoredWork(lesson3, 'lesson-3'), lesson3, 'the same list when nothing changes (no new render)');
  const both = withUnstoredWork(lesson3, 'lesson-4');
  assert.deepEqual(both, ['lesson-3', 'lesson-4']);
  assert.deepEqual(withoutUnstoredWork(both, 'lesson-3'), ['lesson-4'], 'a save stored elsewhere leaves the other');
  assert.equal(withoutUnstoredWork(lesson3, 'lesson-4'), lesson3);
  assert.deepEqual(withoutUnstoredWork(lesson3, 'lesson-3'), []);
  assert.deepEqual(withUnstoredWork(none, 7), ['7'], 'ids are compared as text');
  assert.deepEqual(withoutUnstoredWork(['7'], 7), []);
  assert.equal(withUnstoredWork(none, null), none, 'no assignment, nothing kept');
  assert.equal(withUnstoredWork(none, ''), none);
  assert.deepEqual(withUnstoredWork(undefined, 'lesson-3'), ['lesson-3']);
  assert.deepEqual(withoutUnstoredWork('lesson-3', 'lesson-3'), []);
  // Home, the pack-up line and Log Out read it first.
  assert.equal(persistenceStatusWithUnstoredWork('durable', lesson3), 'volatile');
  assert.equal(persistenceStatusWithUnstoredWork('needs-review', lesson3), 'volatile');
  assert.equal(persistenceStatusWithUnstoredWork('durable', none), 'durable');
  assert.equal(persistenceStatusWithUnstoredWork(undefined, null), 'idle');
});

test('a refused save, then the student moves on: what the line, Home and Log Out say at each step', () => {
  // App.jsx's steps, in the model: the status, the unstored list, and the
  // line under the question, Home and Log Out as they read them.
  let status = 'idle';
  let unstored = [];
  const home = () => describeSaveStatus({ persistenceStatus: persistenceStatusWithUnstoredWork(status, unstored) });
  const logout = () => describeLogoutRisk({ persistenceStatus: persistenceStatusWithUnstoredWork(status, unstored) });
  const tick = () => { status = persistenceStatusAfterDrain({ status, remaining: 0, tally: NOTHING }); };
  const refuse = (assignmentId) => { status = 'capturing'; unstored = withUnstoredWork(unstored, assignmentId); status = 'volatile'; };
  const store = (assignmentId) => {
    status = 'capturing';
    status = 'queued';
    unstored = withoutUnstoredWork(unstored, assignmentId);
    status = persistenceStatusAfterDrain({ status, remaining: 0, tally: tally({ accepted: 1 }) });
  };
  const open = () => { status = persistenceStatusOnAssignmentChange(status); };
  const ONLY_ON_SCREEN = /an answer is only on this screen/;

  open(); // Lesson 3
  refuse('lesson-3');
  tick();
  assert.equal(status, 'volatile', 'the refused save\'s line stands through the reconcile');
  assert.equal(logout()?.severity, 'high', 'Log Out asks first');
  open(); // Home
  tick();
  assert.equal(status, 'idle');
  assert.match(home().text, ONLY_ON_SCREEN, 'Home says it once the student has left');
  open(); // Lesson 4, untouched: no line about Lesson 3's save
  assert.equal(status, 'idle');
  store('lesson-4');
  assert.equal(status, 'durable', 'Lesson 4\'s own save is told under Lesson 4');
  assert.match(home().text, ONLY_ON_SCREEN, 'a save stored elsewhere leaves Home saying it');
  assert.equal(logout()?.severity, 'high');
  open(); // back to Lesson 3: Lesson 4's "Draft saved." is not said over Lesson 3's work
  assert.equal(status, 'idle');
  store('lesson-3');
  assert.equal(home().tone, 'saved', 'once Lesson 3\'s work is stored later, Home has nothing to say');
  assert.equal(logout(), null);
  // Refused again, and another account signs in on this Chromebook.
  refuse('lesson-3');
  assert.match(home().text, ONLY_ON_SCREEN);
  status = 'idle';
  unstored = [];
  tick();
  assert.equal(home().tone, 'saved', 'the next student is not told the last one\'s work is only on screen');
});

test('App: another assignment starts the line over, and another account starts from nothing', () => {
  assert.match(app, /^import \{[^}]*\bpersistenceStatusOnAssignmentChange\b[^}]*\bpersistenceStatusWithUnstoredWork\b[^}]*\bwithUnstoredWork\b[^}]*\bwithoutUnstoredWork\b[^}]*\} from '\.\/platform\/student\/saveStatusModel\.js';$/m);
  const code = executableSource(app);
  // Beside the subject's own reset, on the same change.
  assert.match(code, /useEffect\(\(\) => \{\s*setStudentSaveSubject\(initialSaveSubject\(\)\);\s*\}, \[activeAssignmentId, user\?\.id\]\);\s*useEffect\(\(\) => \{\s*setStudentPersistenceStatus\(persistenceStatusOnAssignmentChange\);\s*\}, \[activeAssignmentId\]\);/);
  assert.match(code, /useEffect\(\(\) => \{\s*setStudentPersistenceStatus\('idle'\);\s*setStudentUnstoredAssignmentIds\(\[\]\);\s*\}, \[user\?\.id\]\);/);
  assert.match(code, /const \[studentUnstoredAssignmentIds, setStudentUnstoredAssignmentIds\] = useState\(\[\]\);/);
});

test('App: every save the device refuses is kept for its assignment, and every save it stores clears it', () => {
  const code = executableSource(app);
  // Each refusal records its assignment as it says "Not saved", and there is
  // no "Not saved" without it.
  const refusals = code.match(/setStudentPersistenceStatus\('volatile'\);/g) || [];
  const kept = code.match(/setStudentUnstoredAssignmentIds\(\(ids\) => withUnstoredWork\(ids, activeAssignmentId\)\);\s*setStudentPersistenceStatus\('volatile'\);/g) || [];
  assert.equal(refusals.length, 5, 'the five durable writes: progress, a checkpoint, a submission, a step, a new problem');
  assert.equal(kept.length, refusals.length);
  // Each of the five, in its own handler: refused in its catch, stored after
  // the queue took it (and only then).
  const sites = [
    ['const changeQuestion = async (', 'const exportAssignmentWorksheetPdf = async (', "kind: 'questionProgress'", 'setTracker(updatedTracker);'],
    ['const handleResponseCheckpoint = useCallback(', 'const handleGradeSubmit = async (', 'const queued = await enqueueResponseCheckpoint(checkpoint);', "setStudentPersistenceStatus('queued');"],
    ['const handleGradeSubmit = async (', 'const handleStepGrade = async (', "kind: 'ordinarySubmission'", 'setTracker(updatedTracker);'],
    ['const handleStepGrade = async (', 'const handleRequestNewQuestion = async (', "kind: 'stepSubmission'", 'setTracker(updatedTracker);'],
    ['const handleRequestNewQuestion = async (', 'const V5_COMPILER_PLUMBING_ERROR', "kind: 'questionReplacement'", 'setTracker(updatedTracker);'],
  ];
  for (const [start, end, enqueue, stored] of sites) {
    const handler = executableSource(region(app, start, end, start));
    const queuedAt = handler.indexOf(enqueue);
    assert.notEqual(queuedAt, -1, `${start}: its enqueue`);
    // The catch of that enqueue, to its closing brace.
    const catchAt = handler.indexOf('} catch (error) {', queuedAt);
    const catchEnd = handler.indexOf('\n    }', catchAt + 1);
    assert.ok(catchAt > queuedAt && catchEnd > catchAt, `${start}: its catch`);
    const failure = handler.slice(catchAt, catchEnd);
    assert.match(failure, /setStudentUnstoredAssignmentIds\(\(ids\) => withUnstoredWork\(ids, activeAssignmentId\)\);\s*setStudentPersistenceStatus\('volatile'\);/, `${start}: refused`);
    assert.doesNotMatch(failure, /withoutUnstoredWork/, `${start}: a refused save never clears it`);
    // Cleared once the queue has the work: after the enqueue's own success
    // line, and not inside the catch.
    const storedAt = handler.indexOf(stored, queuedAt);
    const clearedAt = handler.indexOf('setStudentUnstoredAssignmentIds((ids) => withoutUnstoredWork(ids, activeAssignmentId));', queuedAt);
    assert.ok(storedAt > queuedAt && clearedAt > storedAt, `${start}: cleared only once the queue has it`);
    assert.ok(clearedAt < catchAt || clearedAt > catchEnd, `${start}: not on the refusal's path`);
  }
});

test('App: Home, the pack-up line and Log Out read unstored work first', () => {
  const home = executableSource(region(app, 'const studentSaveStatusNow = () => describeSaveStatus({', '});', 'Home\'s save status'));
  assert.match(home, /persistenceStatus: persistenceStatusWithUnstoredWork\(studentPersistenceStatus, studentUnstoredAssignmentIds\),/);
  const shell = executableSource(region(app, 'const studentShellLogoutRisk = preview ? null : describeLogoutRisk({', '});', 'Log Out'));
  assert.match(shell, /persistenceStatus: persistenceStatusWithUnstoredWork\(studentPersistenceStatus, studentUnstoredAssignmentIds\),/);
  // The pack-up line is Home's status (packUpLine.js), not a second reading.
  assert.match(app, /const workLine = packUpWorkLine\(studentSaveStatusNow\(\)\);/);
});
