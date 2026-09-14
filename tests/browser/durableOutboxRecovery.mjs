/*
 * CHROMEBOOK PERSISTENCE CERTIFICATION — REAL INDEXEDDB, REAL RELOAD.
 *
 * HOW TO RUN:  npm run test:durable-outbox
 *
 * WHY THIS EXISTS RATHER THAN MORE UNIT TESTS. On September 14 the in-memory
 * outbox suite was green while real Chromebook persistence was failing. An
 * in-memory Map cannot get a `readwrite` transaction wrong, cannot fail a
 * version upgrade, cannot lose a row across a reload, and cannot reproduce the
 * read-then-delete race that the coalesced checkpoint guard exists for. So the
 * assertions that would actually have caught the incident live here.
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.AUDIT_ORIGIN || 'http://127.0.0.1:5199';

const browser = await chromium.launch();
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const open = async () => {
    await page.goto(`${origin}/tests/browser/durableOutboxHarness.html`);
    await page.getByText('Durable outbox ready').waitFor();
  };
  const harness = (fn, arg) => page.evaluate(fn, arg);

  /* ---------------------------------------------------------------------
   * 19. A SUBMISSION SURVIVES THE DEVICE RESTARTING.
   * ------------------------------------------------------------------- */
  await open();
  await harness(() => window.outboxHarness.reset());
  await open();
  await harness(() => window.outboxHarness.enqueue('browser-reload-action'));
  await page.reload();
  await page.getByText('Durable outbox ready').waitFor();

  const recovered = await harness(() => window.outboxHarness.list());
  check(recovered.length === 1 && recovered[0].actionId === 'browser-reload-action',
    '19. a queued submission must survive a browser reload');

  const drained = await harness(() => window.outboxHarness.drain());
  check(drained.remaining === 0, '19. a reconciled submission must leave the queue');

  /* ---------------------------------------------------------------------
   * 5 + 6. A FAILING BACKGROUND ACTION MUST NOT BLOCK A SUBMIT.
   *
   * Against real IndexedDB, in capture order: the checkpoint is older, so the
   * serial drain that caused the incident reached it first and stopped there.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.reset());
  await open();
  await harness(() => window.outboxHarness.enqueue('cp-blocked', { kind: 'responseCheckpoint', payload: { documentId: 'cp-0' } }));
  await harness(() => window.outboxHarness.enqueue('progress-blocked', { kind: 'questionProgress', payload: { timeSpent: 10 } }));
  await harness(() => window.outboxHarness.enqueue('submit-behind'));

  const laneResult = await harness(() => window.outboxHarness.drain({
    responseCheckpoint: 'throw',
    questionProgress: 'throw',
  }));
  check(laneResult.seen[0] === 'submit-behind',
    '5. the grade-bearing submission must be attempted first, not behind the background work');
  check(laneResult.remainingGrade === 0,
    '5. the Submit must reach canonical storage while the background work is failing');
  const stillQueued = await harness(() => window.outboxHarness.list());
  check(stillQueued.length === 2 && !stillQueued.some((entry) => entry.actionId === 'submit-behind'),
    '6. the failing background actions must remain queued, and only them');

  /* ---------------------------------------------------------------------
   * 2. AN UNCLASSIFIED REJECTION MUST NOT DESTROY THE SUBMISSION.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.reset());
  await open();
  await harness(() => window.outboxHarness.enqueue('bare-rejection'));
  await harness(() => window.outboxHarness.drain({ 'bare-rejection': { status: 'rejected' } }));
  const afterRejection = await harness(() => window.outboxHarness.list());
  check(afterRejection.length === 1,
    '2. a bare rejection must keep the student submission in IndexedDB');
  check(afterRejection[0].delivery && afterRejection[0].delivery.reason === 'unclassified-rejection',
    '2. the reason a delivery did not succeed must be recorded next to the row');

  /* ---------------------------------------------------------------------
   * A PROVEN RETIREMENT IS A MOVE ACROSS TWO STORES, NOT A DELETE.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.drain({
    'bare-rejection': { disposition: 'permanently-invalid', reason: 'section-closed-at-capture' },
  }));
  const queueAfterRetirement = await harness(() => window.outboxHarness.list());
  const retired = await harness(() => window.outboxHarness.listRetired());
  check(queueAfterRetirement.length === 0, 'a proven retirement must leave the delivery queue');
  check(retired.length === 1 && retired[0].retirement.reason === 'section-closed-at-capture',
    'a retired submission must be kept, with its reason, as recovery evidence');
  check(Boolean(retired[0].payload && retired[0].payload.record),
    "the retired row must still carry the student's own envelope");

  /* ---------------------------------------------------------------------
   * 17. A DATABASE LEFT AT VERSION 1 BY PR #226 UPGRADES WITHOUT LOSS.
   *
   * The rows on the Chromebooks ARE the recovery. This creates the database at
   * version 1, seeds a row in the deployed shape, and then lets this release
   * open it — which triggers the version-2 upgrade.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.reset());
  await open();
  const createdVersion = await harness(() => window.outboxHarness.createVersionOneDatabase());
  check(createdVersion === 1, 'the harness must start from a version 1 database');

  await harness(() => window.outboxHarness.seedLegacyRow({
    schemaVersion: 1,
    actionId: 'legacy-226-row',
    kind: 'ordinarySubmission',
    studentId: 'browser-cert-student',
    assignmentId: 'assignment.with`punctuation',
    questionIndex: 7,
    createdAt: 1757862000000,
    createdOrder: 1757862000000000,
    payload: {
      previousTotalAttempts: 0,
      activityRole: 'warmup',
      record: { totalAttempts: 1, attemptCount: 1, status: 'attempted' },
    },
  }));

  await page.reload();
  await page.getByText('Durable outbox ready').waitFor();
  const legacyList = await harness(() => window.outboxHarness.list());
  check(legacyList.length === 1 && legacyList[0].actionId === 'legacy-226-row',
    '17. a PR #226 row must survive the version 2 upgrade and be readable');
  check(legacyList[0].schemaVersion === 1,
    '17. the stored row must not be rewritten to read it');
  check(legacyList[0].payload.record.totalAttempts === 1,
    "17. the legacy row's academic envelope must be intact");

  const legacyDrain = await harness(() => window.outboxHarness.drain());
  check(legacyDrain.seen.includes('legacy-226-row') && legacyDrain.remaining === 0,
    '17. a PR #226 row must be deliverable by the new drain');

  /* ---------------------------------------------------------------------
   * A HUNG RECONCILE MUST NOT OWN THE QUEUE.
   *
   * A Firestore client transaction does not fail fast when the network is gone;
   * it waits. One of those used to hold the single global drain chain, and
   * every later submission with it.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.reset());
  await open();
  await harness(() => window.outboxHarness.enqueue('hung-q0', { questionIndex: 0 }));
  await harness(() => window.outboxHarness.enqueue('fine-q1', { questionIndex: 1 }));
  const hungResult = await harness(() => window.outboxHarness.drain({ 'hung-q0': 'hang' }));
  check(hungResult.seen.includes('fine-q1'),
    'a hung reconcile on one question must not stop another question being delivered');
  check(hungResult.remainingGrade === 1,
    'the hung question must remain queued rather than be discarded');

  /* ---------------------------------------------------------------------
   * THE DEVICE CAN SAY WHAT IT IS STILL HOLDING.
   * ------------------------------------------------------------------- */
  const summary = await harness(() => window.outboxHarness.summary());
  check(summary.queuedGradeBearing === 1 && summary.queued === 1,
    'the device summary must count the grade-bearing work it is still holding');
  check(Object.keys(summary.blockedReasons).length > 0,
    'the device summary must say WHY a delivery has not succeeded');

  if (failures.length) {
    console.error(`Chromebook IndexedDB certification failed:\n  - ${failures.join('\n  - ')}`);
    process.exitCode = 1;
  } else {
    console.log('Chromebook IndexedDB persistence certification passed.');
  }
} finally {
  await browser.close();
}
