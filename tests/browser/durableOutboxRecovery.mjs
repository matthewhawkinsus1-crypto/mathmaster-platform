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
  // An explicit context, so a second tab can share this one's storage — one
  // Chromebook, two tabs — further down.
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
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
    script: { responseCheckpoint: 'throw', questionProgress: 'throw' },
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
  await harness(() => window.outboxHarness.drain({ script: { 'bare-rejection': { status: 'rejected' } } }));
  const afterRejection = await harness(() => window.outboxHarness.list());
  check(afterRejection.length === 1,
    '2. a bare rejection must keep the student submission in IndexedDB');
  check(afterRejection[0].delivery && afterRejection[0].delivery.reason === 'unclassified-rejection',
    '2. the reason a delivery did not succeed must be recorded next to the row');

  /* ---------------------------------------------------------------------
   * A PROVEN RETIREMENT IS A MOVE ACROSS TWO STORES, NOT A DELETE.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.drain({
    script: { 'bare-rejection': { disposition: 'permanently-invalid', reason: 'section-closed-at-capture' } },
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
   * DEVICE IDENTITY SURVIVES WHATEVER THE QUEUE SURVIVES.
   *
   * A device report is a claim about what this IndexedDB queue holds, so the
   * identity making the claim has to outlive a reload exactly as the queue
   * does. In node this can only be simulated; here the page really reloads,
   * the module cache really goes, and only the durable record can answer.
   *
   * The failure this replaces: the old fallback minted a fresh
   * `dev_session_<random>` per call, so the pre-drain report ("2 queued") and
   * the post-drain report ("0 queued") landed on two different device rows and
   * the positive one was never cleared by anything.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.reset());
  await open();
  await harness(() => window.outboxHarness.enqueue('identity-survives-reload'));
  const firstDeviceId = await harness(() => window.outboxHarness.deviceId());
  const repeatDeviceId = await harness(() => window.outboxHarness.deviceId());
  check(Boolean(firstDeviceId), 'a device must be able to identify itself');
  check(firstDeviceId === repeatDeviceId, 'repeated calls must not mint a second device id');
  check(!/^dev_session_/.test(firstDeviceId), 'the per-call session fallback must be gone');

  const beforeReloadGeneration = await harness(() => window.outboxHarness.reportGeneration());
  check(beforeReloadGeneration.deviceId === firstDeviceId,
    'a report generation must be paired with this device, never another');

  // A real reload. Module state is gone; the database is not.
  await page.reload();
  await page.getByText('Durable outbox ready').waitFor();
  const afterReloadDeviceId = await harness(() => window.outboxHarness.deviceId());
  check(afterReloadDeviceId === firstDeviceId,
    `device identity changed across a reload (${firstDeviceId} -> ${afterReloadDeviceId}); the queued row survived and its identity must too`);
  check((await harness(() => window.outboxHarness.list())).some((entry) => entry.actionId === 'identity-survives-reload'),
    'the queue this identity describes must still be there');

  const afterReloadGeneration = await harness(() => window.outboxHarness.reportGeneration());
  check(afterReloadGeneration.generation > beforeReloadGeneration.generation,
    `report generation went backwards across a reload (${beforeReloadGeneration.generation} -> ${afterReloadGeneration.generation}); the server would ignore every later report from this device`);

  // localStorage alone is not what holds the identity. Clearing it must change
  // nothing, because the durable record is the authority.
  await harness(() => window.outboxHarness.clearDeviceLocalStorage());
  await page.reload();
  await page.getByText('Durable outbox ready').waitFor();
  check((await harness(() => window.outboxHarness.deviceId())) === firstDeviceId,
    'device identity must survive localStorage being cleared while the queue survives');

  /* ---------------------------------------------------------------------
   * AND IT SURVIVES THE DATABASE UPGRADE, WITH THE LEGACY ROW.
   *
   * A Chromebook that has not reloaded since PR #226 opens a version 1
   * database. Version 3 adds the identity store; the upgrade is additive, so
   * the queued row it is holding must be untouched.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.reset());
  await harness(() => window.outboxHarness.createVersionOneDatabase());
  await harness(() => window.outboxHarness.seedLegacyRow({
    actionId: 'legacy-row-through-v3',
    schemaVersion: 1,
    kind: 'ordinarySubmission',
    studentId: 'browser-cert-student',
    assignmentId: 'assignment.with`punctuation',
    questionIndex: 2,
    createdAt: Date.now() - 90_000,
    payload: { previousTotalAttempts: 0, record: { totalAttempts: 1, attemptCount: 1, status: 'attempted' } },
  }));
  await open();
  const upgradedDeviceId = await harness(() => window.outboxHarness.deviceId());
  check(Boolean(upgradedDeviceId), 'a version 1 database must still yield a device identity after upgrading');
  const throughUpgrade = await harness(() => window.outboxHarness.list());
  check(throughUpgrade.some((entry) => entry.actionId === 'legacy-row-through-v3'),
    'the version 3 upgrade must not cost a Chromebook its queued work');

  /* ---------------------------------------------------------------------
   * SUBMIT WAITS FOR INDEXEDDB, NEVER FOR THE NETWORK.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.reset());
  await open();
  const localAdvance = await harness(async () => {
    const result = await window.outboxHarness.captureThenDeliverInBackground('slow-network-submit', 5000);
    // Promises cannot cross the page boundary; intentionally leave delivery
    // running and return only when the UI would advance.
    return { advancedAfterMs: result.advancedAfterMs };
  });
  check(localAdvance.advancedAfterMs < 500,
    `Submit waited ${localAdvance.advancedAfterMs}ms; a 5s server call must remain outside the interaction path`);
  await harness(() => window.outboxHarness.enqueue('interaction-during-slow-sync', { questionIndex: 9 }));
  check((await harness(() => window.outboxHarness.list())).some((entry) => entry.actionId === 'interaction-during-slow-sync'),
    'a slow delivery must not block another local durable interaction');
  await page.waitForTimeout(5100);

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
  await harness(() => window.outboxHarness.enqueue('q2-a1', { questionIndex: 2, previous: 0 }));
  await harness(() => window.outboxHarness.enqueue('q2-a2', { questionIndex: 2, previous: 1 }));
  const HUNG_TIMEOUT_MS = 1500;
  const hungResult = await harness((timeoutMs) => window.outboxHarness.drain({
    script: { 'hung-q0': 'hang' }, timeoutMs,
  }), HUNG_TIMEOUT_MS);

  check(hungResult.seen.includes('fine-q1'),
    'a hung reconcile on one question must not stop another question being delivered');
  check(hungResult.remainingGrade === 1,
    'the hung question must remain queued rather than be discarded');
  // NOT BLOCKED HAS TO MEAN NOT DELAYED.
  // Draining streams one after another left question 1 waiting out question 0's
  // whole timeout — fifteen seconds in production.
  check(
    hungResult.settledAfterMs['fine-q1'] !== undefined
      && hungResult.settledAfterMs['fine-q1'] < HUNG_TIMEOUT_MS / 2,
    `question 1 landed after ${hungResult.settledAfterMs['fine-q1']}ms; it must not wait out question 0's ${HUNG_TIMEOUT_MS}ms timeout`,
  );
  check(
    hungResult.seen.indexOf('q2-a1') < hungResult.seen.indexOf('q2-a2'),
    'two attempts at the same question must stay ordered while other questions run concurrently',
  );

  /* ---------------------------------------------------------------------
   * THE DEVICE CAN SAY WHAT IT IS STILL HOLDING.
   * ------------------------------------------------------------------- */
  const summary = await harness(() => window.outboxHarness.summary());
  check(summary.queuedGradeBearing === 1 && summary.queued === 1,
    'the device summary must count the grade-bearing work it is still holding');
  check(Object.keys(summary.blockedReasons).length > 0,
    'the device summary must say WHY a delivery has not succeeded');

  /* ---------------------------------------------------------------------
   * A SEMESTER OF RETIRED EVIDENCE IS COUNTED ONCE, NOT ON EVERY REPORT.
   *
   * `retired` is never pruned, and every device report used to read all of
   * it. The summary now reads a per-student tally kept in the retirement
   * transaction. Against real IndexedDB: a Chromebook carrying a semester of
   * rows from the release before tallies must report exactly what the full
   * read reported, read those rows ONCE, and never again per report.
   * ------------------------------------------------------------------- */
  const SEMESTER_ROWS = 600;
  const sortedCounts = (counts) => JSON.stringify(Object.fromEntries(Object.entries(counts || {}).sort()));
  const sameRetiredCounts = (described, oracle) => described.retired === oracle.retired
    && sortedCounts(described.retiredByDisposition) === sortedCounts(oracle.retiredByDisposition);
  const describe = (counts) => `${counts.retired} ${sortedCounts(counts.retiredByDisposition)}`;
  const retiredReads = (calls) => ['getAll', 'openCursor', 'count']
    .reduce((total, method) => total + (calls[`retired.${method}`] || 0), 0);

  await harness(() => window.outboxHarness.reset());
  await open();
  await harness((count) => window.outboxHarness.seedSemesterOfRetiredRows(count), SEMESTER_ROWS);
  await harness(() => window.outboxHarness.resetIdbCalls());
  const semesterSummary = await harness(() => window.outboxHarness.summary());
  const semesterOracle = await harness(() => window.outboxHarness.fullScanRetiredCounts());
  check(semesterOracle.retired > 400, `the seeded semester must belong mostly to this student (${semesterOracle.retired})`);
  check(sameRetiredCounts(semesterSummary, semesterOracle),
    `(1) a device with ${SEMESTER_ROWS} retired rows and no tally must report what the full read reported: ${describe(semesterSummary)} vs ${describe(semesterOracle)}`);
  const firstSummaryCalls = await harness(() => window.outboxHarness.idbCalls());
  check(firstSummaryCalls['retired.getAll'] === 1,
    `(2) the first summary builds the tally from the rows exactly once (retired.getAll = ${firstSummaryCalls['retired.getAll']})`);

  // Every later report, through the real reporter, reads no retired row.
  await harness(() => window.outboxHarness.resetIdbCalls());
  for (let index = 0; index < 5; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await harness(() => window.outboxHarness.report('applied'));
  }
  await harness(() => window.outboxHarness.enqueue('semester-dup', { questionIndex: 31 }));
  await harness(() => window.outboxHarness.enqueue('semester-sup', { questionIndex: 32 }));
  await harness(() => window.outboxHarness.enqueue('semester-invalid', { questionIndex: 33 }));
  await harness(() => window.outboxHarness.enqueue('semester-accepted', { questionIndex: 34 }));
  await harness(() => window.outboxHarness.drain({
    script: {
      'semester-dup': { disposition: 'duplicate', reason: 'already-canonical' },
      'semester-sup': { disposition: 'superseded', reason: 'newer-canonical-attempt' },
      'semester-invalid': { disposition: 'permanently-invalid', reason: 'section-closed-at-capture' },
      'semester-accepted': { disposition: 'accepted' },
    },
  }));
  for (let index = 0; index < 5; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await harness(() => window.outboxHarness.report('applied'));
  }
  const afterRetirements = await harness(() => window.outboxHarness.summary());
  const perReportCalls = await harness(() => window.outboxHarness.idbCalls());
  check(retiredReads(perReportCalls) === 0,
    `(2) after the first summary, reports and retirements must not read the retired store: ${JSON.stringify(perReportCalls)}`);
  const afterRetirementsOracle = await harness(() => window.outboxHarness.fullScanRetiredCounts());
  check(sameRetiredCounts(afterRetirements, afterRetirementsOracle),
    `(1) retirements through the real transaction must keep the tally exact: ${describe(afterRetirements)} vs ${describe(afterRetirementsOracle)}`);
  check(afterRetirements.retired === semesterOracle.retired + 3,
    'exactly the three retiring outcomes were added; accepted work is removed, not retired');

  // The same action id retired again (a retry of the identical envelope): the
  // retired row is REPLACED, so its count moves between dispositions.
  await harness(() => window.outboxHarness.enqueue('semester-dup', { questionIndex: 35 }));
  await harness(() => window.outboxHarness.drain({
    script: { 'semester-dup': { disposition: 'permanently-invalid', reason: 'section-closed-at-capture' } },
  }));
  const afterReRetire = await harness(() => window.outboxHarness.summary());
  const afterReRetireOracle = await harness(() => window.outboxHarness.fullScanRetiredCounts());
  check(afterReRetire.retired === afterRetirements.retired && sameRetiredCounts(afterReRetire, afterReRetireOracle),
    `(1) a re-retired id must move its count, never add one: ${describe(afterReRetire)} vs ${describe(afterReRetireOracle)}`);

  // A reload reads the tally, plus one count of keys to check it: still no row read.
  await page.reload();
  await page.getByText('Durable outbox ready').waitFor();
  const reloadedSummary = await harness(() => window.outboxHarness.summary());
  await harness(() => window.outboxHarness.summary());
  const reloadCalls = await harness(() => window.outboxHarness.idbCalls());
  const reloadOracle = await harness(() => window.outboxHarness.fullScanRetiredCounts());
  check(sameRetiredCounts(reloadedSummary, reloadOracle) && sameRetiredCounts(reloadedSummary, afterReRetire),
    `(1) the tally must survive a reload unchanged: ${describe(reloadedSummary)} vs ${describe(reloadOracle)}`);
  check(!reloadCalls['retired.getAll'] && !reloadCalls['retired.openCursor'] && reloadCalls['retired.count'] === 1,
    `(2) after a reload, one key count per page and no row reads: ${JSON.stringify(reloadCalls)}`);

  // A tab still on the previous release retires a row without counting it.
  // The next page of this release to load finds the disagreement and repairs it.
  await harness(() => window.outboxHarness.retireTheOldWay('retired-by-previous-release'));
  await page.reload();
  await page.getByText('Durable outbox ready').waitFor();
  const healedSummary = await harness(() => window.outboxHarness.summary());
  const healedOracle = await harness(() => window.outboxHarness.fullScanRetiredCounts());
  check(sameRetiredCounts(healedSummary, healedOracle),
    `a tally left short by the previous release must be repaired on the next page load: ${describe(healedSummary)} vs ${describe(healedOracle)}`);

  /* ---------------------------------------------------------------------
   * TWO TABS, ONE CHROMEBOOK: ONE TALLY, NOTHING COUNTED TWICE.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.reset());
  await open();
  await harness((count) => window.outboxHarness.seedSemesterOfRetiredRows(count), SEMESTER_ROWS);
  const secondTab = await context.newPage();
  await secondTab.goto(`${origin}/tests/browser/durableOutboxHarness.html`);
  await secondTab.getByText('Durable outbox ready').waitFor();
  const [tabOne, tabTwo] = await Promise.all([
    page.evaluate(() => window.outboxHarness.summaryWithCalls()),
    secondTab.evaluate(() => window.outboxHarness.summaryWithCalls()),
  ]);
  const raceOracle = await harness(() => window.outboxHarness.fullScanRetiredCounts());
  check(sameRetiredCounts(tabOne.summary, raceOracle) && sameRetiredCounts(tabTwo.summary, raceOracle),
    `two tabs building the missing tally at once must both report the full read: ${describe(tabOne.summary)} / ${describe(tabTwo.summary)} vs ${describe(raceOracle)}`);
  check((tabOne.calls['retired.getAll'] || 0) + (tabTwo.calls['retired.getAll'] || 0) === 1,
    `two tabs racing must build ONE tally from ONE read of the rows: ${JSON.stringify([tabOne.calls, tabTwo.calls])}`);

  // Both tabs drain the same queue at once; every row is retired by one of them.
  for (const actionId of ['both-tabs-0', 'both-tabs-1', 'both-tabs-2', 'both-tabs-3', 'both-tabs-4', 'both-tabs-5']) {
    // eslint-disable-next-line no-await-in-loop
    await harness((id) => window.outboxHarness.enqueue(id, { questionIndex: 40 + Number(id.slice(-1)) }), actionId);
  }
  const everythingDuplicate = { script: { ordinarySubmission: { disposition: 'duplicate', reason: 'already-canonical' } } };
  await Promise.all([
    page.evaluate((options) => window.outboxHarness.drain(options), everythingDuplicate),
    secondTab.evaluate((options) => window.outboxHarness.drain(options), everythingDuplicate),
  ]);
  const afterBothDrains = await harness(() => window.outboxHarness.summary());
  const afterBothOracle = await harness(() => window.outboxHarness.fullScanRetiredCounts());
  check(afterBothDrains.retired === raceOracle.retired + 6 && sameRetiredCounts(afterBothDrains, afterBothOracle),
    `two tabs retiring the same six submissions must count six: ${describe(afterBothDrains)} vs ${describe(afterBothOracle)}`);
  await secondTab.close();

  /* ---------------------------------------------------------------------
   * A REPORT THE SERVER ALREADY HOLDS IS NOT SENT AGAIN; A CHANGE ALWAYS IS.
   *
   * The real reporter against real IndexedDB, with only the callable stubbed.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.reset());
  await open();
  const firstReport = await harness(() => window.outboxHarness.report('applied'));
  check(firstReport.sentFromThisPage === 1 && !firstReport.result.skipped, '(3) the first report goes to the server');
  const repeatReport = await harness(() => window.outboxHarness.report('applied'));
  check(repeatReport.result.skipped === true && repeatReport.sentFromThisPage === 1,
    `(3) an unchanged, acknowledged state within the heartbeat must not call the callable again: ${JSON.stringify(repeatReport.result)}`);

  await page.reload();
  await page.getByText('Durable outbox ready').waitFor();
  const afterReloadReport = await harness(() => window.outboxHarness.report('applied'));
  check(afterReloadReport.result.skipped === true && afterReloadReport.sentFromThisPage === 0,
    '(3) a reload must not resend a report the server already acknowledged');

  // New work is a changed state, so it goes — and here the server never answers.
  await harness(() => window.outboxHarness.enqueue('dedupe-new-work', { questionIndex: 50 }));
  const changedReport = await harness(() => window.outboxHarness.report('throw'));
  check(changedReport.sentFromThisPage === 1 && changedReport.lastWire?.summary?.queued === 1,
    '(3) a changed state must call the callable, carrying the new state');
  check(Boolean(changedReport.result.failed), 'that report fails');

  // The work is delivered and the queue is back to exactly the acknowledged
  // state. The failed "1 queued" may still have reached the server, so this
  // report must go, even though it matches the last acknowledgement.
  await harness(() => window.outboxHarness.drain());
  const afterFailure = await harness(() => window.outboxHarness.report('applied'));
  check(!afterFailure.result.skipped && afterFailure.sentFromThisPage === 2 && afterFailure.lastWire?.summary?.queued === 0,
    '(3) after a failed report the next one must go out, even when it matches the acknowledged state');
  const settledAgain = await harness(() => window.outboxHarness.report('applied'));
  check(settledAgain.result.skipped === true && settledAgain.sentFromThisPage === 2, 'and once acknowledged, it is skipped again');

  // A report the server IGNORED (a newer one was already stored) is no acknowledgement either.
  await harness(() => window.outboxHarness.enqueue('dedupe-ignored', { questionIndex: 51 }));
  const ignoredReport = await harness(() => window.outboxHarness.report('ignored'));
  check(ignoredReport.sentFromThisPage === 3, '(3) the new work is reported');
  await harness(() => window.outboxHarness.drain());
  const afterIgnored = await harness(() => window.outboxHarness.report('applied'));
  check(!afterIgnored.result.skipped && afterIgnored.sentFromThisPage === 4,
    '(3) a report the server ignored must not let the next one be skipped');

  /* ---------------------------------------------------------------------
   * REVIEW WORK REFUSED AS "SECURE" GOES BACK IN THE QUEUE, EXACTLY ONCE.
   *
   * Before the server ingested a Test Cycle's Review, every Review answer was
   * retired as "secure-assignment-excluded". The move back is one transaction
   * across the queue, `retired` and the tally's store, which the memory
   * adapter cannot get wrong on anyone's behalf. Two tabs resending at once
   * must move each row once, and the tally must still match the rows.
   * ------------------------------------------------------------------- */
  await harness(() => window.outboxHarness.reset());
  await open();
  await harness(() => window.outboxHarness.seedRefusedReviewWork());
  // The first summary builds the tally, so the move has to keep it current.
  await harness(() => window.outboxHarness.summary());
  const resendTab = await context.newPage();
  await resendTab.goto(`${origin}/tests/browser/durableOutboxHarness.html`);
  await resendTab.getByText('Durable outbox ready').waitFor();
  const [resentHere, resentThere] = await Promise.all([
    harness(() => window.outboxHarness.resendReview()),
    resendTab.evaluate(() => window.outboxHarness.resendReview()),
  ]);
  await resendTab.close();
  check(resentHere.resent + resentThere.resent === 2,
    `two tabs resending at once must move each refused Review row exactly once (${resentHere.resent} + ${resentThere.resent})`);
  const resentQueue = await harness(() => window.outboxHarness.list());
  check(JSON.stringify(resentQueue.map((row) => row.actionId).sort()) === JSON.stringify(['refused-review-0', 'refused-review-1']),
    `only the Review rows refused as secure go back in the queue: ${resentQueue.map((row) => row.actionId)}`);
  check(resentQueue.every((row) => !row.retirement && row.reviewResend?.attempts === 1 && row.payload?.record),
    'a resent row is the student\'s own envelope, without its old verdict, counted as one resend');
  const leftRetired = (await harness(() => window.outboxHarness.listRetired())).map((row) => row.actionId).sort();
  check(JSON.stringify(leftRetired) === JSON.stringify(['refused-classwork', 'refused-review-closed']),
    `classwork, and Review refused for a real reason, stay retired: ${leftRetired}`);
  const resendSummary = await harness(() => window.outboxHarness.summary());
  const resendOracle = await harness(() => window.outboxHarness.fullScanRetiredCounts());
  check(sameRetiredCounts(resendSummary, resendOracle) && resendSummary.retired === 2,
    `the retired tally must match the rows after the move: ${describe(resendSummary)} vs ${describe(resendOracle)}`);
  check(resendSummary.queued === 2, 'and the restored work is counted as queued');
  const resendAgain = await harness(() => window.outboxHarness.resendReview());
  check(resendAgain.resent === 0 && resendAgain.checked === false, 'the resend runs once per page');
  // The restored work survives a reload and is delivered.
  await page.reload();
  await page.getByText('Durable outbox ready').waitFor();
  const resendDelivered = await harness(() => window.outboxHarness.drain());
  check(resendDelivered.remaining === 0 && resendDelivered.seen.length === 2,
    'the restored Review work survives a reload and is delivered');
  // A tab still holding the old read must not bring delivered work back.
  const staleRestore = await harness(() => window.outboxHarness.restoreFromStaleRead('refused-review-0'));
  const afterStale = await harness(() => window.outboxHarness.list());
  check(staleRestore === false && afterStale.length === 0,
    'a stale restore must not put delivered Review work back in the queue');

  if (failures.length) {
    console.error(`Chromebook IndexedDB certification failed:\n  - ${failures.join('\n  - ')}`);
    process.exitCode = 1;
  } else {
    console.log('Chromebook IndexedDB persistence certification passed.');
  }
} finally {
  await browser.close();
}
