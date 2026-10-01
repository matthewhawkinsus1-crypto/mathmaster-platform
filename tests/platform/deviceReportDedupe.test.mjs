import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SUBMISSION_DISPOSITION,
  createDurableAction,
  createMemoryOutboxStorage,
  drainDurableActions,
  enqueueDurableAction,
  resetRetiredTallyVerificationForTests,
  summarizeDurableOutbox,
} from '../../src/platform/performance/durableActionOutbox.js';
import {
  nextDeviceReportGeneration,
  resetDeviceIdentityCacheForTests,
} from '../../src/platform/persistence/deviceIdentity.js';
import { createDeviceReportCoordinator } from '../../src/platform/persistence/deviceReportCoordinator.js';
import {
  DEVICE_REPORT_HEARTBEAT_MS,
  decideDeviceReport,
  deviceReportFingerprint,
  reportDeviceQueueUnlessUnchanged,
} from '../../src/platform/persistence/deviceReportDedupe.js';

/*
 * A DEVICE REPORT THE SERVER ALREADY HOLDS IS NOT SENT AGAIN — AND NOTHING ELSE
 * IS EVER SKIPPED.
 *
 * The student runtime asks for a report before and after every drain, and the
 * drain retries every ten seconds, so an idle Chromebook re-sent the same
 * snapshot about a dozen times a minute. A report may now be skipped only when
 * its content is what the server last ACKNOWLEDGED, no report has been started
 * since, and that acknowledgement is younger than the heartbeat.
 */

/* ==========================================================================
 * THE DECISION, AS A PURE FUNCTION.
 * ======================================================================== */

const acknowledgedAt = 1_000_000;
const unchanged = {
  studentId: 'S1',
  deviceId: 'dev_1',
  fingerprint: '{"queued":0}',
  now: acknowledgedAt + 60_000,
  acknowledged: { studentId: 'S1', deviceId: 'dev_1', fingerprint: '{"queued":0}', generation: 7, capturedAt: acknowledgedAt },
  latestGeneration: 7,
};

test('only an acknowledged, unchanged, recent report with nothing started since is skipped', () => {
  assert.deepEqual(decideDeviceReport(unchanged), { send: false, reason: 'unchanged-within-heartbeat' });

  // Change any ONE thing and it is sent.
  const sends = [
    ['never-acknowledged', { acknowledged: null }],
    ['different-student', { studentId: 'S2' }],
    ['different-device', { deviceId: 'dev_2' }],
    ['state-changed', { fingerprint: '{"queued":1}' }],
    // A report started after the acknowledged one, from any tab, that has not
    // been acknowledged: it may have failed, timed out or still be in flight,
    // and in every case the server may hold something this device never heard.
    ['report-since-unacknowledged', { latestGeneration: 8 }],
    // Not knowing is not knowing.
    ['report-since-unacknowledged', { latestGeneration: null }],
    ['heartbeat-due', { now: acknowledgedAt + DEVICE_REPORT_HEARTBEAT_MS }],
    ['clock-unreliable', { now: acknowledgedAt - 1 }],
    ['clock-unreliable', { now: Number.NaN }],
  ];
  for (const [reason, change] of sends) {
    assert.deepEqual(decideDeviceReport({ ...unchanged, ...change }), { send: true, reason }, `${reason}: ${JSON.stringify(change)}`);
  }

  // The heartbeat boundary: one millisecond inside still skips, the boundary sends.
  assert.equal(decideDeviceReport({ ...unchanged, now: acknowledgedAt + DEVICE_REPORT_HEARTBEAT_MS - 1 }).send, false);
  assert.equal(decideDeviceReport({ ...unchanged, now: acknowledgedAt + DEVICE_REPORT_HEARTBEAT_MS }).send, true);
});

test('an acknowledgement that is malformed is never trusted', () => {
  const broken = [
    { ...unchanged.acknowledged, generation: 0 },
    { ...unchanged.acknowledged, generation: 'seven' },
    { ...unchanged.acknowledged, capturedAt: undefined },
    { ...unchanged.acknowledged, fingerprint: undefined },
    'not an object',
  ];
  for (const acknowledged of broken) {
    assert.equal(
      decideDeviceReport({ ...unchanged, acknowledged, latestGeneration: Number(acknowledged?.generation) || 7 }).send,
      true,
      JSON.stringify(acknowledged),
    );
  }
  assert.equal(decideDeviceReport({ ...unchanged, fingerprint: undefined }).send, true, 'a report with no fingerprint is sent');
});

test('the fingerprint is the report’s content: order-blind, exact, and free of anything volatile', async () => {
  assert.equal(
    deviceReportFingerprint({ queued: 1, byAssignment: { a: 1, b: 2 } }),
    deviceReportFingerprint({ byAssignment: { b: 2, a: 1 }, queued: 1 }),
    'the order a count map was built in is not a change',
  );
  assert.notEqual(
    deviceReportFingerprint({ queued: 1, byAssignment: { a: 1, b: 2 } }),
    deviceReportFingerprint({ queued: 1, byAssignment: { a: 1, b: 3 } }),
  );
  // `undefined` is what the callable sends as null, so it is one state with null.
  assert.equal(deviceReportFingerprint({ oldestCapturedAt: undefined }), deviceReportFingerprint({ oldestCapturedAt: null }));

  // Two summaries of the same queue, taken apart in time, are one state; one
  // more queued submission is another.
  resetRetiredTallyVerificationForTests();
  const storage = createMemoryOutboxStorage();
  await enqueueDurableAction(queuedWork('q-1', 1), { storage });
  const first = await summarizeDurableOutbox({ storage, studentId: 'S1' });
  await new Promise((resolve) => { setTimeout(resolve, 5); });
  const second = await summarizeDurableOutbox({ storage, studentId: 'S1' });
  assert.equal(deviceReportFingerprint(first), deviceReportFingerprint(second));
  await enqueueDurableAction(queuedWork('q-2', 2), { storage });
  assert.notEqual(deviceReportFingerprint(await summarizeDurableOutbox({ storage, studentId: 'S1' })), deviceReportFingerprint(first));
});

/* ==========================================================================
 * THE REPORTER, AGAINST A WHOLE IN-MEMORY DEVICE.
 * ======================================================================== */

function queuedWork(actionId, questionIndex, studentId = 'S1') {
  return createDurableAction({
    kind: 'ordinarySubmission',
    studentId,
    assignmentId: 'assignment-1',
    questionIndex,
    actionId,
    payload: { previousTotalAttempts: 0, activityRole: 'classwork', record: { totalAttempts: 1, status: 'attempted' } },
  });
}

const APPLIED = Object.freeze({ success: true, applied: true, ignored: false });
const IGNORED = Object.freeze({ success: true, applied: false, ignored: true, reason: 'superseded-by-newer-report' });

/** One Chromebook: a memory outbox, a stub callable, and a clock the test moves. */
const chromebook = () => {
  resetDeviceIdentityCacheForTests();
  resetRetiredTallyVerificationForTests();
  const storage = createMemoryOutboxStorage();
  const clock = { value: 1_700_000_000_000 };
  const sent = [];
  let answer = () => APPLIED;
  const transport = async (wire) => {
    sent.push(wire);
    const outcome = answer(wire);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  const report = (studentId = 'S1') => reportDeviceQueueUnlessUnchanged({ studentId, storage, transport, now: () => clock.value });
  return {
    storage,
    clock,
    sent,
    report,
    answer: (next) => { answer = next; },
    /** A page reload: module memory is gone, IndexedDB is not. */
    reload: () => { resetDeviceIdentityCacheForTests(); resetRetiredTallyVerificationForTests(); },
    deliver: (outcome = { disposition: SUBMISSION_DISPOSITION.ACCEPTED }) => drainDurableActions({
      storage, studentId: 'S1', reconcile: async () => outcome,
    }),
  };
};

test('an unchanged, acknowledged state is not sent again within the heartbeat — even after a reload', async () => {
  const device = chromebook();
  assert.deepEqual(await device.report(), APPLIED);
  assert.equal(device.sent.length, 1);

  device.clock.value += 30_000;
  assert.deepEqual(await device.report(), { skipped: true, reason: 'unchanged-within-heartbeat' });
  assert.equal(device.sent.length, 1, 'the callable was not called again');

  // A reload must not resend an unchanged report: the acknowledgement is durable.
  device.reload();
  assert.equal((await device.report()).skipped, true);
  assert.equal(device.sent.length, 1);

  // The heartbeat: an unchanged report still goes once it is due.
  device.clock.value += DEVICE_REPORT_HEARTBEAT_MS;
  assert.deepEqual(await device.report(), APPLIED);
  assert.equal(device.sent.length, 2);
  assert.equal((await device.report()).skipped, true, 'and is acknowledged afresh');
});

test('a changed state is always sent — including a return to a state acknowledged earlier', async () => {
  const device = chromebook();
  await device.report();
  const empty = device.sent[0].summary;

  await enqueueDurableAction(queuedWork('submit-1', 1), { storage: device.storage });
  await device.report();
  assert.equal(device.sent.length, 2, 'new queued work is reported');
  assert.equal(device.sent[1].summary.queuedGradeBearing, 1);

  await device.deliver();
  await device.report();
  assert.equal(device.sent.length, 3, 'the queue clearing is reported, though it looks like the first report');
  assert.deepEqual(device.sent[2].summary, empty);
});

test('after a report that failed, the next report is sent even if nothing changed', async () => {
  const device = chromebook();
  await device.report();                                            // "0 queued", acknowledged.
  await enqueueDurableAction(queuedWork('submit-1', 1), { storage: device.storage });
  device.answer(() => Object.assign(new Error('The server did not answer in time.'), { code: 'functions/deadline-exceeded' }));
  await assert.rejects(device.report());                            // "1 queued" — the server MAY have applied it.
  await device.deliver();                                           // Back to "0 queued".

  device.answer(() => APPLIED);
  const result = await device.report();
  assert.equal(result.skipped, undefined, 'the server may be holding "1 queued"; only a fresh report can correct it');
  assert.equal(device.sent.length, 3);
});

test('a report the server ignored is not an acknowledgement', async () => {
  const device = chromebook();
  device.answer(() => IGNORED);
  await device.report();
  await device.report();
  assert.equal(device.sent.length, 2, 'never acknowledged, so never skipped');

  device.answer(() => APPLIED);
  await device.report();
  await enqueueDurableAction(queuedWork('submit-1', 1), { storage: device.storage });
  device.answer(() => IGNORED);
  await device.report();                                            // Ignored: a newer one is on the server.
  await device.deliver();
  device.answer(() => APPLIED);
  await device.report();
  assert.equal(device.sent.length, 5, 'an ignored report still started a generation the server may hold');
});

test('a report another tab has started and not yet heard back from prevents a skip', async () => {
  const device = chromebook();
  await device.report();
  // Another tab on this Chromebook allocates the next generation and is still waiting.
  await nextDeviceReportGeneration({ storage: device.storage, now: () => device.clock.value });
  await device.report();
  assert.equal(device.sent.length, 2);
  assert.equal((await device.report()).skipped, true, 'once this report is acknowledged, the skip is safe again');
});

test('a late acknowledgement for an older report never replaces a newer one', async () => {
  const device = chromebook();
  // Two tabs report: A captures "0 queued" and waits on a slow network...
  let releaseA;
  device.answer(() => new Promise((resolve) => { releaseA = () => resolve(APPLIED); }));
  const tabA = device.report();
  while (!releaseA) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  // ...work is queued, and B reports "1 queued" under a NEWER generation and
  // hears back first.
  await enqueueDurableAction(queuedWork('submit-1', 1), { storage: device.storage });
  device.answer(() => APPLIED);
  await device.report();
  releaseA();
  await tabA;

  const state = await device.storage.readDeviceReportState();
  assert.equal(state.acknowledged.generation, device.sent[1].generation, 'the newest acknowledgement stands');
  assert.equal(state.acknowledged.generation, state.identity.reportGeneration);
  assert.equal((await device.report()).skipped, true, '"1 queued" is what the server holds, so it is not re-sent');
  assert.equal(device.sent.length, 2);
});

test('a page that sent under a generation nothing durable holds never skips again', async () => {
  const device = chromebook();
  await device.report();                                            // "0 queued", acknowledged at a durable generation.

  // Durable storage fails the generation AND the cleanup of the acknowledgement.
  const { nextReportGeneration, clearDeviceReportAcknowledgement } = device.storage;
  device.storage.nextReportGeneration = async () => { throw new Error('QuotaExceededError'); };
  device.storage.clearDeviceReportAcknowledgement = async () => { throw new Error('QuotaExceededError'); };
  await enqueueDurableAction(queuedWork('submit-1', 1), { storage: device.storage });
  await device.report();                                            // "1 queued" goes out under a volatile generation.
  device.storage.nextReportGeneration = nextReportGeneration;
  device.storage.clearDeviceReportAcknowledgement = clearDeviceReportAcknowledgement;

  await device.deliver();                                           // Back to "0 queued" — the stored acknowledgement.
  await device.report();
  assert.equal(device.sent.length, 3, 'the server may hold "1 queued"; the stored acknowledgement cannot vouch for it');
});

test('when it can, a volatile send also drops the stored acknowledgement, so a reload cannot trust it', async () => {
  const device = chromebook();
  await device.report();
  const { nextReportGeneration } = device.storage;
  device.storage.nextReportGeneration = async () => { throw new Error('transient'); };
  await enqueueDurableAction(queuedWork('submit-1', 1), { storage: device.storage });
  await device.report();
  device.storage.nextReportGeneration = nextReportGeneration;
  assert.equal((await device.storage.readDeviceReportState()).acknowledged, null);

  await device.deliver();
  device.reload();
  await device.report();
  assert.equal(device.sent.length, 3, 'after the reload, "0 queued" is sent rather than assumed');
});

test('records this device cannot read mean send, never fail', async () => {
  const device = chromebook();
  await device.report();
  device.storage.readDeviceReportState = async () => { throw new Error('IndexedDB is unavailable'); };
  await device.report();
  await device.report();
  assert.equal(device.sent.length, 3);
});

test('two students on one Chromebook never share an acknowledgement', async () => {
  const device = chromebook();
  await device.report('S1');
  await device.report('S2');
  assert.equal(device.sent.length, 2, 'a different student is a different server row');
  // S2's report is the newest this device started, so S1 cannot vouch for the
  // server any more than S2 can vouch for S1's row. It is simply sent again.
  await device.report('S1');
  assert.equal(device.sent.length, 3);
  assert.equal((await device.report('S1')).skipped, true);
});

test('through the coordinator, a skipped report settles as a success without a callable', async () => {
  const device = chromebook();
  const settlements = [];
  const coordinator = createDeviceReportCoordinator({
    report: () => device.report(),
    onSettled: (settlement) => settlements.push(settlement),
  });
  coordinator.request({ immediate: true });
  while (settlements.length < 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  coordinator.request({ immediate: true });
  while (settlements.length < 2) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  assert.equal(coordinator.startedCount(), 2, 'the coordinator still ran both reports');
  assert.equal(device.sent.length, 1, 'only one reached the server');
  assert.deepEqual(settlements.map((settlement) => settlement.ok), [true, true], 'a skip clears a reporting banner like a success');
  assert.equal(settlements[1].result.skipped, true);
});
