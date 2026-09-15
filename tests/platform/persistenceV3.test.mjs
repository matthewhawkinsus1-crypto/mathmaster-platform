import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  createDurableAction,
  createMemoryOutboxStorage,
  drainDurableActions,
  enqueueDurableAction,
  listDurableActions,
  summarizeDurableOutbox,
} from '../../src/platform/performance/durableActionOutbox.js';
import { callableDeliveryDiagnostic } from '../../src/services/submissionIngestionService.js';
import {
  assessPersistencePending,
  sessionGapResolutionApplies,
} from '../../functions/shared/persistencePending.mjs';
import { verifyPolicies } from '../../scripts/verify-persistence-production.mjs';
import {
  assessRequiredIndexes,
  clientFacingServiceIds,
  firebaseFunctionTargets,
  indexDependentFunctionNames,
  persistenceFunctionNames,
} from '../../scripts/persistence-deploy-surface.mjs';
import {
  createDeviceReportCoordinator,
  reconcileWithDeviceReports,
} from '../../src/platform/persistence/deviceReportCoordinator.js';

const action = ({ id, assignmentId = 'assignment-a', kind = 'ordinarySubmission', questionIndex = 0 }) => createDurableAction({
  actionId: id, kind, studentId: 'student-a', assignmentId, questionIndex,
  payload: { previousTotalAttempts: 0, record: { totalAttempts: 1 } },
});

test('callable transport failure remains durable with bounded safe diagnostics', async () => {
  const storage = createMemoryOutboxStorage();
  await enqueueDurableAction(action({ id: 'permission-denied' }), { storage });
  const diagnostic = callableDeliveryDiagnostic({ code: 'functions/permission-denied', message: 'raw answer must not survive: 42' });
  const result = await drainDurableActions({
    storage, studentId: 'student-a', now: 1000,
    reconcile: async () => ({ disposition: 'retryable', reason: diagnostic.safeReason, diagnostic }),
  });
  assert.equal(result.remainingGrade, 1);
  const [queued] = await listDurableActions({ storage });
  assert.deepEqual({
    attempts: queued.delivery.attempts,
    transport: queued.delivery.transport,
    firebaseCode: queued.delivery.firebaseCode,
    safeReason: queued.delivery.safeReason,
    firstFailureAt: queued.delivery.firstFailureAt,
    latestFailureAt: queued.delivery.latestFailureAt,
  }, {
    attempts: 1, transport: 'callable', firebaseCode: 'permission-denied',
    safeReason: 'callable-permission-denied', firstFailureAt: 1000, latestFailureAt: 1000,
  });
  assert.doesNotMatch(JSON.stringify(queued.delivery), /raw answer|42/);
});

test('assignment summaries never leak another assignment reason', async () => {
  const storage = createMemoryOutboxStorage();
  await enqueueDurableAction(action({ id: 'a', assignmentId: 'assignment-a' }), { storage });
  await enqueueDurableAction(action({ id: 'b', assignmentId: 'assignment-b', questionIndex: 1 }), { storage });
  await drainDurableActions({
    storage, studentId: 'student-a', now: 2000,
    reconcile: async (queued) => ({ disposition: 'retryable', reason: queued.assignmentId === 'assignment-a' ? 'callable-unavailable' : 'question-identity-mismatch' }),
  });
  const summary = await summarizeDurableOutbox({ storage, studentId: 'student-a' });
  assert.deepEqual(summary.blockedReasonsByAssignment['assignment-a'], { 'callable-unavailable': 1 });
  assert.deepEqual(summary.blockedReasonsByAssignment['assignment-b'], { 'question-identity-mismatch': 1 });
  assert.deepEqual(summary.queuedKindsByAssignment['assignment-a'], { ordinarySubmission: 1 });
});

test('known ordinary persistence gaps block finality and clearing them restores it', () => {
  // `resolvedReasons` is part of the shape now: a reason a teacher of record
  // has acknowledged is reported separately from the ones still blocking, so
  // the passback audit can say what was resolved as well as what is left.
  assert.deepEqual(assessPersistencePending({ queuedGradeBearing: 2 }), {
    persistencePending: true, reasons: ['device-queue'], resolvedReasons: [],
  });
  assert.equal(assessPersistencePending({ worked: 4, canonicalAttempted: 3 }).persistencePending, true);
  assert.equal(assessPersistencePending({ worked: 3, canonicalAttempted: 3 }).persistencePending, false);
  assert.equal(assessPersistencePending({ queuedGradeBearing: 2, secureTestCycle: true }).persistencePending, false);
});

/*
 * The behaviour, not the count: EVERY callable a student's browser invokes
 * directly must grant `allUsers` the transport-only invoker role, and one that
 * does not must fail the whole verification. Pinning the two service names this
 * once had meant a third client-facing callable could be added and silently go
 * unverified — which is the failure that makes a healthy deploy look, from the
 * classroom, exactly like lost work.
 */
test('production IAM verification requires a public invoker binding on every client-facing callable', () => {
  const services = clientFacingServiceIds();
  assert.ok(services.length >= 2, 'the release has more than one client-facing callable');
  assert.ok(services.includes('ingeststudentsubmissions') && services.includes('reportstudentdevicequeue'));

  const valid = { bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }] };
  const privatePolicy = { bindings: [{ role: 'roles/run.invoker', members: ['user:teacher@example.com'] }] };

  const allPublic = Object.fromEntries(services.map((service) => [service, valid]));
  assert.equal(verifyPolicies(allPublic).every((item) => item.ok), true);

  // Each one on its own is enough to fail the verification.
  services.forEach((service) => {
    const policies = { ...allPublic, [service]: privatePolicy };
    const results = verifyPolicies(policies);
    assert.equal(results.every((item) => item.ok), false, `${service} without allUsers must fail verification`);
    assert.equal(results.find((item) => item.service === service).ok, false);
  });

  // A service the deploy never bound at all is a failure, not a pass by default.
  assert.equal(verifyPolicies({}).every((item) => item.ok), false);
});

test('grade delivery has one canonical writer and hydration reports before and after drain', async () => {
  const [app, functionsSource] = await Promise.all([
    readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/index.js', import.meta.url), 'utf8'),
  ]);
  const dispatcher = region(app, 'const reconcileDurableStudentAction', 'const drainStudentOutbox', 'durable dispatcher');
  assert.match(dispatcher, /if \(INGESTIBLE_KINDS\.includes\(action\.kind\)\)[\s\S]*return \{[\s\S]*disposition: SUBMISSION_DISPOSITION\.RETRYABLE/);
  assert.match(dispatcher, /\/\/ Checkpoints and elapsed-time progress are non-grade background state\.[\s\S]*return reconcileThroughClientTransaction\(action\)/);
  assert.doesNotMatch(dispatcher, /falling back|studentIngestionFallback/);
  const hydration = region(app, 'const recoverAndReconcileQueuedStudentWork', 'const reconcileQueuedStudentWork', 'hydration reconciliation');
  assert.match(hydration, /await reconcileAndReportStudentOutbox\(\)/);
  /*
   * The cycle used to be three awaits in a row, and this assertion pinned that
   * order. It is now delegated to `reconcileWithDeviceReports`, which starts
   * the pre-drain report and never awaits it ahead of delivery — the behaviour
   * is covered directly by the timing test below. What App.jsx still has to do
   * is route BOTH halves through that helper rather than awaiting a report
   * itself, so that is what is asserted here.
   */
  const cycle = region(app, 'const reconcileAndReportStudentOutbox', 'const leaveUnavailableAssignment', 'report-drain-report');
  assert.match(cycle, /reconcileWithDeviceReports\(\{[\s\S]*report: reportStudentOutbox[\s\S]*drain: \(\) => drainStudentOutbox\(options\)/);
  assert.doesNotMatch(executableSource(cycle), /await\s+reportStudentOutbox\(/);
  assert.match(app, /import \{[\s\S]*reconcileWithDeviceReports[\s\S]*\} from '\.\/platform\/persistence\/deviceReportCoordinator\.js'/);
  const passback = region(functionsSource, 'exports.syncGradeToClassroom', 'exports.getClassroomSyncHealth', 'Classroom passback');
  assert.match(passback, /!isTestCycleAssignment && isFinal/);
  assert.match(passback, /status: "sync-pending"[\s\S]*isFinal: false/);
  assert.match(passback, /if \(persistenceState\.persistencePending\)[\s\S]*continue;/);
});

/* ==========================================================================
 * A REPORTING OUTAGE MUST NOT DELAY A HEALTHY GRADE.
 *
 * `reportStudentDeviceQueue` and `ingestStudentSubmissions` share a 12-second
 * callable timeout. The first implementation awaited the report, then drained,
 * then awaited a second report — so a degraded reporting endpoint delayed every
 * canonical grade by that full timeout while ingestion was perfectly healthy.
 * ======================================================================== */

// The real bound both callables use (`INGEST_TIMEOUT_MS`). The test hangs the
// report for exactly that long, so it is measuring the actual worst case.
const REPORT_TIMEOUT_MS = 12_000;
const INGESTION_MS = 100;

test('a device report hanging for its full 12s timeout does not delay canonical ingestion', async () => {
  const timers = [];
  const hangingReport = () => new Promise((resolve) => {
    timers.push(setTimeout(resolve, REPORT_TIMEOUT_MS));
  });

  let reportStartedAt = null;
  let drainStartedAt = null;
  const report = () => { reportStartedAt ??= Date.now(); return hangingReport(); };
  const drain = async () => {
    drainStartedAt = Date.now();
    await new Promise((resolve) => { setTimeout(resolve, INGESTION_MS); });
    return { remaining: 0, delivered: 1 };
  };

  const startedAt = Date.now();
  try {
    const result = await reconcileWithDeviceReports({ report, drain });
    const elapsed = Date.now() - startedAt;

    // The teacher still gets a pre-drain snapshot: reporting is STARTED first.
    assert.notEqual(reportStartedAt, null, 'the pre-drain report must be started');
    assert.ok(
      reportStartedAt <= drainStartedAt,
      'the pre-drain report must be started before the drain, not after it',
    );
    // And delivery begins immediately rather than behind it.
    assert.ok(
      drainStartedAt - startedAt < 50,
      `canonical ingestion began ${drainStartedAt - startedAt}ms in; it must begin immediately`,
    );
    assert.deepEqual(result, { remaining: 0, delivered: 1 });
    // The whole cycle costs ingestion's time, not reporting's.
    assert.ok(
      elapsed < REPORT_TIMEOUT_MS / 4,
      `delivery took ${elapsed}ms; a hung report must not add its ${REPORT_TIMEOUT_MS}ms timeout to it`,
    );
  } finally {
    timers.forEach((timer) => clearTimeout(timer));
  }
});

test('a device report that rejects never reaches the delivery path', async () => {
  const settlements = [];
  const result = await reconcileWithDeviceReports({
    report: () => Promise.reject(new Error('reportStudentDeviceQueue is unavailable')),
    drain: async () => ({ remaining: 0 }),
    onReportSettled: (settlement) => settlements.push(settlement),
  });
  assert.deepEqual(result, { remaining: 0 }, 'the drain result must survive a failed report');
  // The failure is diagnosed where it happened, on its own schedule.
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.ok(settlements.some((settlement) => settlement.ok === false));
});

test('rapid submissions cannot spawn an unbounded number of report cycles', async () => {
  let inFlight = 0;
  let peakInFlight = 0;
  const releases = [];
  const coordinator = createDeviceReportCoordinator({
    report: () => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      return new Promise((resolve) => {
        releases.push(() => { inFlight -= 1; resolve({ success: true }); });
      });
    },
  });

  // Forty submissions in the time one report is in flight.
  for (let index = 0; index < 40; index += 1) coordinator.request({ immediate: true });
  assert.equal(coordinator.startedCount(), 1, 'a burst must not start a report per submission');
  assert.equal(peakInFlight, 1, 'only one report may be in flight at a time');

  // Releasing the first starts exactly ONE follow-up carrying the newest state.
  releases.shift()();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(coordinator.startedCount(), 2, 'exactly one follow-up report, not forty');

  releases.shift()();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(coordinator.startedCount(), 2, 'the follow-up must not cascade');
  assert.equal(coordinator.pending(), false);
});

// Let an in-flight report settle. These events arrive in separate ticks in a
// browser; running them back to back in one tick would only be re-testing the
// coalescing above.
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

test('hydration, reconnect, pageshow, visibility return and post-drain state each report immediately', async () => {
  const starts = [];
  let clock = 0;
  const coordinator = createDeviceReportCoordinator({
    report: () => { starts.push(clock); return Promise.resolve(null); },
    now: () => clock,
    // A timer that is never fired, so anything counted below was IMMEDIATE and
    // not something the rate limiter let through later.
    setTimer: () => 1,
    clearTimer: () => {},
  });
  const triggers = ['hydration', 'reconnect', 'pageshow', 'visibility-return', 'new-queued-work', 'post-drain'];
  for (const trigger of triggers) {
    clock += 1;
    coordinator.request({ immediate: true });
    assert.equal(starts.at(-1), clock, `${trigger} must report at once, not on the next rate-limit window`);
    // eslint-disable-next-line no-await-in-loop
    await settle();
  }
  assert.equal(starts.length, triggers.length);
});

test('an ordinary background tick is rate limited, an immediate trigger is not', async () => {
  let clock = 0;
  let started = 0;
  const coordinator = createDeviceReportCoordinator({
    report: () => { started += 1; return Promise.resolve(null); },
    minIntervalMs: 3_000,
    now: () => clock,
    setTimer: () => 1,
    clearTimer: () => {},
  });
  coordinator.request({ immediate: false });
  assert.equal(started, 1);
  await settle();

  clock = 500;
  coordinator.request({ immediate: false });
  assert.equal(started, 1, 'a background tick inside the window is deferred, not sent again at once');
  assert.equal(coordinator.pending(), true, 'and it is deferred, never dropped');

  coordinator.request({ immediate: true });
  assert.equal(started, 2, 'an immediate trigger ignores the window');
});

/* ==========================================================================
 * THE DEPLOYED SURFACE.
 * ======================================================================== */

test('the targeted deploy covers every production function this release changes', async () => {
  const functionsSource = await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const names = persistenceFunctionNames();

  // The four the review named, at minimum.
  [
    'ingestStudentSubmissions',
    'reportStudentDeviceQueue',
    'syncGradeToClassroom',
    'getStudentPersistenceRecoveryReport',
  ].forEach((name) => {
    assert.ok(names.includes(name), `${name} changes production behaviour and must be deployed`);
  });
  // Plus the two this release adds; neither has a browser contract that works
  // until it exists in production.
  ['resolveStudentPersistenceHold', 'reconcileAssignmentActivityProjection'].forEach((name) => {
    assert.ok(names.includes(name), `${name} is new in this release and must be deployed`);
  });

  // Every name must be a real export — a typo here deploys nothing and says
  // nothing, which is the worst possible outcome for a targeted deploy.
  names.forEach((name) => {
    assert.ok(
      functionsSource.includes(`exports.${name} = `),
      `${name} is in the deploy list but is not exported from functions/index.js`,
    );
  });
  assert.equal(new Set(names).size, names.length, 'no duplicate targets');
});

test('the deploy script deploys named functions, never the whole fleet, in dependency order', async () => {
  const script = await readFile(new URL('../../scripts/deploy-persistence.sh', import.meta.url), 'utf8');
  const executable = executableSource(script.split('\n').map((line) => line.replace(/^\s*#.*/, '')).join('\n'));

  // THE FLEET DEPLOY IS THE THING THIS SCRIPT EXISTS TO AVOID.
  assert.doesNotMatch(
    executable,
    /--only\s+functions(\s|["']|$)/,
    'a bare `--only functions` redeploys every function in the codebase',
  );
  assert.match(firebaseFunctionTargets(), /^functions:[A-Za-z]/);
  assert.ok(
    firebaseFunctionTargets().split(',').every((target) => target.startsWith('functions:')),
    'every target names one function',
  );

  const order = [
    executable.indexOf('npm run build'),
    executable.indexOf('--only firestore:indexes'),
    executable.indexOf('scripts/check-persistence-indexes.mjs'),
    executable.indexOf('--only "$FUNCTION_TARGETS"'),
    executable.indexOf('npm run verify:persistence-production'),
    executable.indexOf('npm run deploy:hosting'),
  ];
  order.forEach((position, index) => {
    assert.ok(position >= 0, `deploy step ${index + 1} is missing from the script`);
    if (index > 0) {
      assert.ok(
        order[index - 1] < position,
        `deploy step ${index + 1} must come after step ${index}: build, indexes, index gate, functions, IAM, hosting`,
      );
    }
  });
});

test('the index-dependent functions are gated on the index, and the gate stops rather than guessing', async () => {
  const script = await readFile(new URL('../../scripts/deploy-persistence.sh', import.meta.url), 'utf8');

  // `readPersistencePending` runs the studentResponseCheckpoints(studentId,
  // assignmentId, status) query, so anything that calls it is index-dependent.
  assert.deepEqual(
    indexDependentFunctionNames().sort(),
    ['resolveStudentPersistenceHold', 'syncGradeToClassroom'],
  );

  // The declared index must actually be in firestore.indexes.json, or step 2
  // deploys nothing and step 3 waits forever for an index nobody requested.
  const declared = JSON.parse(
    await readFile(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'),
  );
  const required = assessRequiredIndexes([]);
  required.forEach((requirement) => {
    const match = (declared.indexes || []).find((index) => (
      index.collectionGroup === requirement.collectionGroup
      && index.fields.map((field) => field.fieldPath).join(',') === requirement.fields.join(',')
    ));
    assert.ok(match, `firestore.indexes.json must declare ${requirement.collectionGroup}(${requirement.fields.join(', ')})`);
  });

  // A missing index is not ready. An index still BUILDING is not ready either:
  // the query fails the same way, and it is the final-grade safety check.
  const fields = required[0].fields.map((fieldPath) => ({ fieldPath, order: 'ASCENDING' }));
  const live = (state) => [{ collectionGroup: required[0].collectionGroup, fields, state }];
  assert.equal(assessRequiredIndexes([])[0].ready, false, 'a missing index is not ready');
  assert.equal(assessRequiredIndexes(live('CREATING'))[0].ready, false, 'a building index is not ready');
  assert.equal(assessRequiredIndexes(live('READY'))[0].ready, true);
  // Firestore appends __name__ to every composite index; that must still match.
  assert.equal(
    assessRequiredIndexes([{
      collectionGroup: required[0].collectionGroup,
      fields: [...fields, { fieldPath: '__name__', order: 'ASCENDING' }],
      state: 'READY',
    }])[0].ready,
    true,
  );
  // A DIFFERENT index on the same collection group must not satisfy it.
  assert.equal(
    assessRequiredIndexes([{
      collectionGroup: required[0].collectionGroup,
      fields: [{ fieldPath: 'studentId', order: 'ASCENDING' }, { fieldPath: 'assignmentId', order: 'ASCENDING' }],
      state: 'READY',
    }])[0].ready,
    false,
  );

  // And the script must STOP on a failed gate rather than carrying on.
  const gate = script.slice(script.indexOf('scripts/check-persistence-indexes.mjs'));
  const stop = gate.indexOf('exit 2');
  const deployFunctions = gate.indexOf('--only "$FUNCTION_TARGETS"');
  assert.ok(stop >= 0, 'a failed index gate must stop the script');
  assert.ok(stop < deployFunctions, 'the stop must come before the function deploy, not after it');
});

/* ==========================================================================
 * THE TEACHER RESOLUTION, AND WHAT IT DOES NOT COVER.
 * ======================================================================== */

const resolution = (overrides = {}) => ({
  acknowledgedWorked: 5,
  acknowledgedCanonicalAttempted: 3,
  resolvedByEmail: 'teacher@desotoisd.org',
  revokedAt: null,
  ...overrides,
});

test('a teacher resolution releases the session gap and nothing else', () => {
  const gapOnly = { worked: 5, canonicalAttempted: 3 };
  assert.deepEqual(
    assessPersistencePending(gapOnly).reasons,
    ['session-summary-gap'],
    'the gap alone blocks finality',
  );

  const resolved = assessPersistencePending({ ...gapOnly, sessionGapResolution: resolution() });
  assert.equal(resolved.persistencePending, false, 'an acknowledged gap stops withholding the passback');
  assert.deepEqual(resolved.reasons, []);
  assert.deepEqual(resolved.resolvedReasons, ['session-summary-gap'], 'and it is recorded as resolved, not as absent');

  // Every other reason names a concrete artifact that still exists. None of
  // them is a teacher's to acknowledge, and the resolution must not touch them.
  [
    ['queuedGradeBearing', 'device-queue'],
    ['activeCheckpoints', 'response-checkpoint'],
    ['recoverableDrafts', 'workspace-draft'],
  ].forEach(([input, reason]) => {
    const state = assessPersistencePending({
      ...gapOnly, [input]: 1, sessionGapResolution: resolution(),
    });
    assert.equal(state.persistencePending, true, `${reason} must survive a session-gap resolution`);
    assert.deepEqual(state.reasons, [reason]);
  });
});

test('new concrete queued evidence reactivates the hard hold after a resolution', () => {
  const resolved = resolution();
  const afterResolution = { worked: 5, canonicalAttempted: 3, sessionGapResolution: resolved };
  assert.equal(assessPersistencePending(afterResolution).persistencePending, false);

  // A Chromebook reconnects and reports one grade-bearing item still queued.
  // That is concrete recoverable evidence, and it raises its own reason, which
  // no resolution suppresses.
  const chromebookReports = assessPersistencePending({ ...afterResolution, queuedGradeBearing: 1 });
  assert.equal(chromebookReports.persistencePending, true);
  assert.deepEqual(chromebookReports.reasons, ['device-queue']);

  // Session evidence growing past what was acknowledged is a DIFFERENT
  // discrepancy from the one the teacher looked at, so the gap comes back too.
  const workedMore = assessPersistencePending({ ...afterResolution, worked: 9 });
  assert.equal(workedMore.persistencePending, true);
  assert.deepEqual(workedMore.reasons, ['session-summary-gap']);
  assert.deepEqual(workedMore.resolvedReasons, []);

  // A gap that SHRANK because work was recovered is still covered: it is a
  // subset of what was acknowledged.
  assert.equal(
    assessPersistencePending({ ...afterResolution, canonicalAttempted: 4 }).persistencePending,
    false,
  );
});

test('a resolution that never described a real discrepancy covers nothing', () => {
  const args = { worked: 5, canonicalAttempted: 3 };
  assert.equal(sessionGapResolutionApplies({ resolution: null, ...args }), false);
  assert.equal(sessionGapResolutionApplies({ resolution: resolution({ acknowledgedWorked: 3 }), ...args }), false);
  assert.equal(sessionGapResolutionApplies({ resolution: resolution({ revokedAt: 'now' }), ...args }), false);
  assert.equal(sessionGapResolutionApplies({ resolution: resolution(), ...args }), true);
  // Secure Test Cycle never consults this policy at all.
  assert.equal(
    assessPersistencePending({ ...args, secureTestCycle: true, sessionGapResolution: resolution() }).persistencePending,
    false,
  );
});

test('the policy advertises no signal production finalization does not read', async () => {
  const [policy, functionsSource] = await Promise.all([
    readFile(new URL('../../functions/shared/persistencePending.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/index.js', import.meta.url), 'utf8'),
  ]);
  const reader = region(
    functionsSource,
    'async function readPersistencePending',
    'async function countRecoverableWorkspaceDrafts',
    'persistence pending reader',
  );

  // Every input the policy accepts must be supplied by the one production
  // reader of it. An advertised safety source with nothing behind it reads, to
  // anyone auditing this, like a check that is running when it is not.
  ['queuedGradeBearing', 'activeCheckpoints', 'recoverableDrafts', 'worked', 'canonicalAttempted']
    .forEach((input) => {
      assert.match(
        executableSource(policy),
        new RegExp(`\\b${input}\\b`),
        `${input} must be a policy input`,
      );
      assert.match(reader, new RegExp(`\\b${input}\\b`), `readPersistencePending must supply ${input}`);
    });

  // `unresolvedReceipts` was accepted and never supplied. It is gone from the
  // executable policy, and the reason it is not a finality blocker is written
  // down so it is not re-added.
  assert.doesNotMatch(executableSource(policy), /unresolvedReceipts|server-ingestion-unresolved/);
  assert.match(policy, /WHY `unresolvedReceipts` IS NOT A FINALITY BLOCKER/);

  // A recoverable server-held draft DOES block finality, assessed with the
  // same rules the teacher recovery report uses so the two cannot disagree.
  assert.match(
    reader,
    /const recoverableDrafts = [\s\S]*countRecoverableWorkspaceDrafts\(\{[\s\S]*assessPersistencePending\(\{[\s\S]*\brecoverableDrafts,/,
    'the recoverable-draft count must be derived from the draft document and handed to the policy',
  );
  const draftCounter = region(
    functionsSource,
    'async function countRecoverableWorkspaceDrafts',
    'exports.reportStudentDeviceQueue',
    'workspace draft counter',
  );
  assert.match(draftCounter, /assessWorkspaceDraftDocument/);
  assert.match(draftCounter, /assessment\?\.recoverable\?\.length/);
});

/* ==========================================================================
 * THE BROWSER NO LONGER AUTHORS A COMPLETION PROJECTION.
 * ======================================================================== */

test('the browser never writes classworkGradesByAssignment from its local tracker', async () => {
  const app = executableSource(await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8'));

  // `classworkGradesByAssignment` opens the next assignment through
  // `prerequisiteAccess`. The browser's tracker is the local overlay and holds
  // attempts still queued on this device, so a completion computed there could
  // unlock work on evidence the gradebook has never seen.
  assert.doesNotMatch(
    app,
    /evaluateClassworkCompletion\s*\(/,
    'the student client must not evaluate classwork completion itself',
  );
  const studentWrites = app.split('const teacherResetAssignmentRecords')[0];
  assert.doesNotMatch(
    studentWrites,
    /FieldPath\(\s*'classworkGradesByAssignment'/,
    'the student client must not write the classwork completion projection',
  );

  // The activity flush writes engagement time and then ASKS the server to
  // re-derive the projection from canonical records.
  const flush = region(app, 'const flushAssignmentActivity', 'const rawActiveAssignmentData', 'activity flush');
  assert.match(flush, /FieldPath\('assignmentActivity', assignmentId\)/, 'engagement time is still saved');
  assert.match(flush, /reconcileAssignmentActivityProjection\(\{ assignmentId \}\)/);

  // And the server derives it from the canonical tracker, never the caller's.
  const functionsSource = await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const reconciler = region(
    functionsSource,
    'exports.reconcileAssignmentActivityProjection',
    'CLOSING A PERSISTENCE INCIDENT',
    'activity projection reconciler',
  );
  assert.match(reconciler, /assignmentTracker: gradeData\?\.gradesByAssignment\?\.\[assignmentId\]/);
  assert.match(reconciler, /totalTimeSeconds: Number\(gradeData\?\.assignmentActivity/);
  assert.doesNotMatch(
    executableSource(reconciler),
    /request\.data\?\.(completion|classworkGrade|tracker|score)/,
    'the server must take no completion, score or tracker from the caller',
  );
});

test('the recovery panel shows the discrepancy before it offers to resolve it', async () => {
  const panel = await readFile(
    new URL('../../src/components/teacher/StudentPersistenceRecoveryPanel.jsx', import.meta.url),
    'utf8',
  );
  // The state, named, so a teacher knows what they are accepting.
  assert.match(panel, /Sync pending — session evidence exceeds recorded attempts/);
  assert.match(panel, /Resolve technical persistence hold/);
  // The action is offered only when the gap is the ONLY thing blocking.
  assert.match(
    panel,
    /persistencePendingReasons \|\| \[\]\)\.length === 1[\s\S]*=== 'session-summary-gap'/,
  );
  // It is confirmed, and the confirmation states exactly what it means.
  assert.match(panel, /role="dialog"[\s\S]*resolve-hold-title/);
  assert.match(
    panel,
    /I acknowledge the unrecoverable discrepancy and permit normal finalization using the canonical\s*\n?\s*evidence that exists\./,
  );
  assert.match(panel, /no grade, no attempt and no zero/);
  // And a reason is required before the button does anything.
  assert.match(panel, /disabled=\{Boolean\(busy\) \|\| !resolutionReason\.trim\(\)\}/);
  // The numbers sent back are the ones displayed.
  assert.match(panel, /acknowledgedWorked: target\.presence\.answered/);
  assert.match(panel, /acknowledgedCanonicalAttempted: target\.canonicalAttempted/);
});

/* ==========================================================================
 * THE FAST PATH, WHICH NONE OF THIS MAY HAVE MOVED.
 *
 * local grade -> durable IndexedDB enqueue -> UI advances. Nothing between the
 * enqueue and the advance may await the network. The real proof is the Chromium
 * certification (`npm run test:durable-outbox`), which drives a 5-second server
 * call and measures when Submit returned; this guards the wiring that test
 * cannot see from node.
 * ======================================================================== */

test('Submit still advances on the durable write alone, with every network call detached', async () => {
  const app = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const submit = region(app, 'const serverAckSpan = startPerformanceSpan', 'const handleRequestNewQuestion', 'submit tail');

  // Reconciliation, reporting and the activity flush are all inside a voided
  // async IIFE. `void (async () => ...)` is what keeps them off the student's
  // interaction path; an `await` at this level would put them back on it.
  assert.match(submit, /void \(async \(\) => \{[\s\S]*reconcileAndReportStudentOutbox\(\{ successStatus: 'submitted' \}\)/);
  assert.match(submit, /void \(async \(\) => \{[\s\S]*flushAssignmentActivity\(activeAssignmentId\)/);

  // The enqueue is the only thing awaited before the UI advances, and a failed
  // enqueue returns rather than advancing on work that is not durable.
  const capture = region(app, "setStudentPersistenceStatus('capturing')", 'const serverAckSpan = startPerformanceSpan', 'durable capture');
  const enqueue = capture.indexOf('await enqueueDurableAction(');
  const advance = capture.indexOf('setTracker(updatedTracker)');
  assert.ok(enqueue >= 0 && advance > enqueue, 'the UI must advance only after the durable write');
  assert.match(capture, /catch \(error\)[\s\S]*setStudentPersistenceStatus\('volatile'\)[\s\S]*return null;/);
  assert.doesNotMatch(
    executableSource(capture.slice(enqueue, advance)),
    /await (ingestOneSubmission|reportDeviceQueueState|reconcileAssignmentActivityProjection|drainStudentOutbox)\(/,
    'no network call may be awaited between the durable write and the student advancing',
  );
});
