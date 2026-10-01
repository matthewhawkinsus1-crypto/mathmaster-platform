import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { region } from './helpers/sourceContract.mjs';
import {
  RETIRED_TALLY_VERSION,
  SUBMISSION_DISPOSITION,
  applyRetiredTallyChange,
  createDurableAction,
  createMemoryOutboxStorage,
  drainDurableActions,
  enqueueDurableAction,
  listRetiredDurableActions,
  resetRetiredTallyVerificationForTests,
  retiredTallyKey,
  summarizeDurableOutbox,
  tallyRetiredRows,
} from '../../src/platform/performance/durableActionOutbox.js';

/*
 * THE RETIRED STORE IS COUNTED AS IT GROWS.
 *
 * `retired` is never pruned (it is recovery evidence), and the device summary
 * used to describe it with a full read of the store on every report — so over
 * a semester each Submit deserialized every submission the Chromebook had ever
 * retired. The summary now reads a per-student tally kept in the retirement
 * transaction. These tests hold that tally to the one standard that matters:
 * it reports EXACTLY what the full read reported, through every history.
 */

/*
 * THE ORACLE: how `summarizeDurableOutbox` computed its retired counts before
 * the tally existed, kept verbatim. It reads through `listRetired`, which the
 * summary itself no longer calls for a student.
 */
const fullScanRetiredCounts = async ({ storage, studentId = null }) => {
  const retired = await listRetiredDurableActions({ storage, studentId }).catch(() => []);
  return {
    retired: retired.length,
    retiredByDisposition: retired.reduce(
      (counts, action) => ({ ...counts, [action.retirement?.disposition || 'unknown']: (counts[action.retirement?.disposition || 'unknown'] || 0) + 1 }),
      {},
    ),
  };
};

const retiredCountsOf = (summary) => ({
  retired: summary.retired,
  retiredByDisposition: summary.retiredByDisposition,
});

const ASSIGNMENT = 'assignment.with punctuation`';

const submission = (studentId, actionId, questionIndex = 0) => createDurableAction({
  kind: 'ordinarySubmission',
  studentId,
  assignmentId: ASSIGNMENT,
  questionIndex,
  actionId,
  payload: { previousTotalAttempts: 0, activityRole: 'classwork', record: { totalAttempts: 1, status: 'attempted' } },
});

/** A row as an earlier release left it in `retired`: no tally anywhere. */
const retiredRow = (studentId, actionId, retirement) => {
  const row = { ...submission(studentId, actionId) };
  if (retirement !== undefined) row.retirement = retirement;
  return row;
};

const retirement = (disposition) => ({ disposition, reason: 'seeded', retiredAt: 1, receipt: null });

/*
 * A semester on one shared Chromebook: two students, every retiring
 * disposition, and the shapes a summary has to file somewhere — no
 * `retirement` at all, an empty disposition, and a student id that is a NUMBER
 * (the summary's filter is strict equality, so it must never be counted for
 * the string '7').
 */
const semester = () => [
  ...Array.from({ length: 12 }, (_, index) => retiredRow('S1', `s1-dup-${index}`, retirement(SUBMISSION_DISPOSITION.DUPLICATE))),
  ...Array.from({ length: 7 }, (_, index) => retiredRow('S1', `s1-sup-${index}`, retirement(SUBMISSION_DISPOSITION.SUPERSEDED))),
  ...Array.from({ length: 3 }, (_, index) => retiredRow('S1', `s1-inv-${index}`, retirement(SUBMISSION_DISPOSITION.PERMANENTLY_INVALID))),
  retiredRow('S1', 's1-no-retirement', undefined),
  retiredRow('S1', 's1-empty-disposition', { disposition: '', reason: 'legacy' }),
  ...Array.from({ length: 5 }, (_, index) => retiredRow('S2', `s2-dup-${index}`, retirement(SUBMISSION_DISPOSITION.DUPLICATE))),
  { ...retiredRow('S1', 'numeric-owner', retirement(SUBMISSION_DISPOSITION.SUPERSEDED)), studentId: 7 },
];

/** Count summary-side full reads: the summary must never call `listRetired` for a student. */
const watchFullReads = (storage) => {
  const original = storage.listRetired.bind(storage);
  const counter = { calls: 0 };
  storage.listRetired = async () => { counter.calls += 1; return original(); };
  return { counter, oracleView: { listRetired: original } };
};

test('a device that already holds retired rows reports exactly what the full read reported, reading them once', async () => {
  resetRetiredTallyVerificationForTests();
  const storage = createMemoryOutboxStorage([], { retired: semester() });
  const { counter, oracleView } = watchFullReads(storage);

  const first = await summarizeDurableOutbox({ storage, studentId: 'S1' });
  assert.deepEqual(retiredCountsOf(first), await fullScanRetiredCounts({ storage: oracleView, studentId: 'S1' }));
  assert.equal(first.retired, 24, 'twelve duplicate, seven superseded, three invalid, two unknown — and not the numeric-owner row');
  assert.equal(storage.retiredRowScans(), 1, 'the first summary builds the tally from the rows, once');

  for (let report = 0; report < 10; report += 1) {
    // eslint-disable-next-line no-await-in-loop
    const later = await summarizeDurableOutbox({ storage, studentId: 'S1' });
    assert.deepEqual(retiredCountsOf(later), retiredCountsOf(first));
  }
  assert.equal(storage.retiredRowScans(), 1, 'no later summary reads a retired row');
  assert.equal(counter.calls, 0, 'a student summary never falls back to reading the whole store');

  // Every other student on the device, and the strict-equality edge, agree too.
  for (const studentId of ['S2', '7', 'nobody']) {
    // eslint-disable-next-line no-await-in-loop
    const summary = await summarizeDurableOutbox({ storage, studentId });
    // eslint-disable-next-line no-await-in-loop
    assert.deepEqual(retiredCountsOf(summary), await fullScanRetiredCounts({ storage: oracleView, studentId }), studentId);
  }
  assert.equal(
    retiredCountsOf(await summarizeDurableOutbox({ storage, studentId: '7' })).retired,
    0,
    'a row stored under the number 7 is not the string "7"',
  );
  // A device-wide summary (no student) still counts every row, as it always did.
  assert.deepEqual(
    retiredCountsOf(await summarizeDurableOutbox({ storage })),
    await fullScanRetiredCounts({ storage: oracleView }),
  );
});

test('a retirement updates the tally in the same step, and nothing else touches it', async () => {
  resetRetiredTallyVerificationForTests();
  const storage = createMemoryOutboxStorage([], { retired: semester() });
  const { oracleView } = watchFullReads(storage);
  await summarizeDurableOutbox({ storage, studentId: 'S1' });

  const outcomes = {
    'new-duplicate': { disposition: SUBMISSION_DISPOSITION.DUPLICATE, reason: 'already-canonical' },
    'new-invalid': { disposition: SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, reason: 'section-closed-at-capture' },
    // Accepted work is REMOVED, not retired; kept work stays queued. Neither is a retired row.
    'new-accepted': { disposition: SUBMISSION_DISPOSITION.ACCEPTED },
    'new-review': { disposition: SUBMISSION_DISPOSITION.NEEDS_REVIEW, reason: 'section-close-time-unknown' },
    'new-retry': { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'callable-unavailable' },
  };
  let questionIndex = 1;
  for (const actionId of Object.keys(outcomes)) {
    // eslint-disable-next-line no-await-in-loop
    await enqueueDurableAction(submission('S1', actionId, questionIndex), { storage });
    questionIndex += 1;
  }
  await drainDurableActions({ storage, studentId: 'S1', reconcile: async (action) => outcomes[action.actionId] });

  const summary = await summarizeDurableOutbox({ storage, studentId: 'S1' });
  assert.deepEqual(retiredCountsOf(summary), await fullScanRetiredCounts({ storage: oracleView, studentId: 'S1' }));
  assert.equal(summary.retired, 26, 'exactly the two retiring outcomes were added');
  assert.equal(summary.retiredByDisposition[SUBMISSION_DISPOSITION.DUPLICATE], 13);
  assert.equal(summary.retiredByDisposition[SUBMISSION_DISPOSITION.PERMANENTLY_INVALID], 4);
  assert.equal(summary.queued, 2, 'the needs-review and retryable work is still queued');
  assert.equal(storage.retiredRowScans(), 1, 'the retirements were counted as they happened, not by re-reading');
});

test('before a tally exists, a retirement leaves it absent rather than starting one short', async () => {
  resetRetiredTallyVerificationForTests();
  // A Chromebook carrying 24 retired rows for S1 from the release before
  // tallies. Its first retirement under this release happens before any
  // summary has asked for a tally.
  const storage = createMemoryOutboxStorage([submission('S1', 'first-under-new-release', 3)], { retired: semester() });
  const { oracleView } = watchFullReads(storage);
  await drainDurableActions({
    storage,
    studentId: 'S1',
    reconcile: async () => ({ disposition: SUBMISSION_DISPOSITION.SUPERSEDED, reason: 'newer-canonical-attempt' }),
  });

  // Read WITHOUT the page's first-summary count check, which would otherwise
  // repair a short tally and hide that one was ever written.
  const tally = await storage.readRetiredTally('S1', { verify: false });
  assert.equal(tally.total, 25, 'a tally started by that retirement would say 1, and only a count could ever repair it');
  assert.equal(storage.retiredRowScans(), 1, 'the tally was still absent, so it was built from every row');

  const summary = await summarizeDurableOutbox({ storage, studentId: 'S1' });
  assert.deepEqual(retiredCountsOf(summary), await fullScanRetiredCounts({ storage: oracleView, studentId: 'S1' }));
});

test('two tabs building the same missing tally produce one tally, from one read of the rows', async () => {
  resetRetiredTallyVerificationForTests();
  const storage = createMemoryOutboxStorage([], { retired: semester() });
  const { oracleView } = watchFullReads(storage);
  const expected = await fullScanRetiredCounts({ storage: oracleView, studentId: 'S1' });

  // Both tabs look, find nothing, and race to build it.
  const [tabA, tabB] = await Promise.all([
    storage.readRetiredTally('S1', { verify: true }),
    storage.readRetiredTally('S1', { verify: true }),
  ]);
  assert.deepEqual(tabA, tabB);
  assert.deepEqual({ retired: tabA.total, retiredByDisposition: tabA.byDisposition }, expected);
  assert.equal(storage.retiredRowScans(), 1, 'the second tab must find the first tab’s tally and write nothing');

  // And through the summary, the way two reports would actually race.
  resetRetiredTallyVerificationForTests();
  const fresh = createMemoryOutboxStorage([], { retired: semester() });
  const [reportA, reportB] = await Promise.all([
    summarizeDurableOutbox({ storage: fresh, studentId: 'S1' }),
    summarizeDurableOutbox({ storage: fresh, studentId: 'S1' }),
  ]);
  assert.deepEqual(retiredCountsOf(reportA), expected);
  assert.deepEqual(retiredCountsOf(reportB), expected);
  assert.equal(fresh.retiredRowScans(), 1);
});

test('a retirement racing the first build is counted exactly once, whichever lands first', async () => {
  resetRetiredTallyVerificationForTests();
  const make = () => createMemoryOutboxStorage([submission('S1', 'racing', 4)], { retired: semester() });
  const retire = (storage) => storage.retireIfCurrent(
    'racing',
    Number.MAX_SAFE_INTEGER,
    retirement(SUBMISSION_DISPOSITION.DUPLICATE),
  );

  // Tab A has looked and found no tally; tab B retires before A builds.
  const before = make();
  const building = before.readRetiredTally('S1');
  await retire(before);
  const builtAfterRetirement = await building;
  assert.equal(builtAfterRetirement.total, 25, 'the build reads the row the retirement just moved');

  // The build lands first; the retirement then adds to it.
  const after = make();
  await after.readRetiredTally('S1');
  await retire(after);
  assert.equal((await after.readRetiredTally('S1')).total, 25);

  for (const storage of [before, after]) {
    const { oracleView } = watchFullReads(storage);
    // eslint-disable-next-line no-await-in-loop
    const summary = await summarizeDurableOutbox({ storage, studentId: 'S1' });
    // eslint-disable-next-line no-await-in-loop
    assert.deepEqual(retiredCountsOf(summary), await fullScanRetiredCounts({ storage: oracleView, studentId: 'S1' }));
  }
});

test('a second tab retiring a row the first already moved changes nothing', async () => {
  resetRetiredTallyVerificationForTests();
  const storage = createMemoryOutboxStorage([submission('S1', 'both-tabs', 5)], { retired: semester() });
  await summarizeDurableOutbox({ storage, studentId: 'S1' });
  // The same reconciled row, retired from two tabs at once.
  await Promise.all([
    storage.retireIfCurrent('both-tabs', Number.MAX_SAFE_INTEGER, retirement(SUBMISSION_DISPOSITION.DUPLICATE)),
    storage.retireIfCurrent('both-tabs', Number.MAX_SAFE_INTEGER, retirement(SUBMISSION_DISPOSITION.DUPLICATE)),
  ]);
  const summary = await summarizeDurableOutbox({ storage, studentId: 'S1' });
  assert.equal(summary.retired, 25, 'one submission is one retired row, counted once');
});

test('re-retiring an action id moves its count between dispositions instead of adding one', async () => {
  resetRetiredTallyVerificationForTests();
  const storage = createMemoryOutboxStorage([], { retired: semester() });
  const { oracleView } = watchFullReads(storage);
  await summarizeDurableOutbox({ storage, studentId: 'S1' });
  await summarizeDurableOutbox({ storage, studentId: 'S2' });

  // `s1-sup-0` is already retired as superseded. The same id is queued again
  // (a retry of the identical envelope) and retired as a duplicate: `put`
  // replaces the row, so the total must not move.
  await enqueueDurableAction(submission('S1', 's1-sup-0', 6), { storage });
  await storage.retireIfCurrent('s1-sup-0', Number.MAX_SAFE_INTEGER, retirement(SUBMISSION_DISPOSITION.DUPLICATE));
  const s1 = await summarizeDurableOutbox({ storage, studentId: 'S1' });
  assert.equal(s1.retired, 24);
  assert.equal(s1.retiredByDisposition[SUBMISSION_DISPOSITION.SUPERSEDED], 6);
  assert.equal(s1.retiredByDisposition[SUBMISSION_DISPOSITION.DUPLICATE], 13);
  assert.deepEqual(retiredCountsOf(s1), await fullScanRetiredCounts({ storage: oracleView, studentId: 'S1' }));

  // An id that ends up under ANOTHER student leaves one tally and joins the other.
  await enqueueDurableAction(submission('S2', 's1-inv-0', 7), { storage });
  await storage.retireIfCurrent('s1-inv-0', Number.MAX_SAFE_INTEGER, retirement(SUBMISSION_DISPOSITION.DUPLICATE));
  for (const studentId of ['S1', 'S2']) {
    // eslint-disable-next-line no-await-in-loop
    const summary = await summarizeDurableOutbox({ storage, studentId });
    // eslint-disable-next-line no-await-in-loop
    assert.deepEqual(retiredCountsOf(summary), await fullScanRetiredCounts({ storage: oracleView, studentId }), studentId);
  }
  assert.equal(storage.retiredRowScans(), 2, 'one build per student, nothing re-read afterwards');
});

/*
 * RANDOMIZED HISTORIES AGAINST THE ORACLE.
 *
 * Seeded, so a failure names a reproducible history. Every step is checked for
 * every student on the device and for the device-wide summary.
 */
const prng = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const OUTCOMES = [
  { disposition: SUBMISSION_DISPOSITION.ACCEPTED },
  { disposition: SUBMISSION_DISPOSITION.DUPLICATE, reason: 'already-canonical' },
  { disposition: SUBMISSION_DISPOSITION.SUPERSEDED, reason: 'newer-canonical-attempt' },
  { disposition: SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, reason: 'section-closed-at-capture' },
  { disposition: SUBMISSION_DISPOSITION.NEEDS_REVIEW, reason: 'section-close-time-unknown' },
  { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'callable-unavailable' },
  'throw',
];
const STUDENTS = ['S1', 'S2', 'student:with:colons', 'stüdent-ß'];
const LEGACY_DISPOSITIONS = [
  SUBMISSION_DISPOSITION.DUPLICATE,
  SUBMISSION_DISPOSITION.SUPERSEDED,
  SUBMISSION_DISPOSITION.PERMANENTLY_INVALID,
  '',
  undefined,
  'unknown',
];

for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
  test(`randomized history ${seed}: the tally always equals the full read`, async () => {
    resetRetiredTallyVerificationForTests();
    const random = prng(seed);
    const pick = (list) => list[Math.floor(random() * list.length)];
    const legacy = Array.from({ length: Math.floor(random() * 40) }, (_, index) => {
      const disposition = pick(LEGACY_DISPOSITIONS);
      if (random() < 0.1) return retiredRow(pick(STUDENTS), `legacy-${index}`, undefined);
      return retiredRow(pick(STUDENTS), `legacy-${index}`, disposition === undefined ? {} : retirement(disposition));
    });
    const storage = createMemoryOutboxStorage([], { retired: legacy });
    const { oracleView } = watchFullReads(storage);
    const usedIds = legacy.map((row) => row.actionId);
    let nextId = 0;
    let nextQuestion = 0;

    const checkEveryone = async (step) => {
      for (const studentId of [...STUDENTS, null]) {
        // eslint-disable-next-line no-await-in-loop
        const summary = await summarizeDurableOutbox({ storage, studentId });
        // eslint-disable-next-line no-await-in-loop
        const expected = await fullScanRetiredCounts({ storage: oracleView, studentId });
        assert.deepEqual(retiredCountsOf(summary), expected, `seed ${seed}, step ${step}, student ${studentId}`);
      }
    };

    for (let step = 0; step < 70; step += 1) {
      const roll = random();
      if (roll < 0.45) {
        // Queue work. One time in eight it reuses an id the device has seen.
        const reuse = random() < 0.125 && usedIds.length;
        const actionId = reuse ? pick(usedIds) : `action-${seed}-${nextId++}`;
        usedIds.push(actionId);
        nextQuestion += 1;
        // eslint-disable-next-line no-await-in-loop
        await enqueueDurableAction(submission(pick(STUDENTS), actionId, nextQuestion), { storage });
      } else if (roll < 0.8) {
        const studentId = pick(STUDENTS);
        // eslint-disable-next-line no-await-in-loop
        await drainDurableActions({
          storage,
          studentId,
          timeoutMs: 1000,
          reconcile: async () => {
            const outcome = pick(OUTCOMES);
            if (outcome === 'throw') throw new Error('offline');
            return outcome;
          },
        });
      } else if (roll < 0.9) {
        // A reload: this page's verification memory is gone.
        resetRetiredTallyVerificationForTests();
      } else {
        // eslint-disable-next-line no-await-in-loop
        await checkEveryone(step);
      }
    }
    await checkEveryone('end');
    assert.ok(
      (await oracleView.listRetired()).length > legacy.length,
      'a history that never retired anything would prove nothing',
    );
  });
}

test('a tally that disagrees with its rows is rebuilt by the next page that loads', async () => {
  // What a tab still running the previous release leaves behind: it retires
  // rows without counting them, so the stored tally is short.
  const rows = semester();
  const shortTally = {
    key: retiredTallyKey('S1'),
    version: RETIRED_TALLY_VERSION,
    studentId: 'S1',
    total: 20,
    byDisposition: { [SUBMISSION_DISPOSITION.DUPLICATE]: 10, [SUBMISSION_DISPOSITION.SUPERSEDED]: 7, [SUBMISSION_DISPOSITION.PERMANENTLY_INVALID]: 3 },
  };
  resetRetiredTallyVerificationForTests();
  const storage = createMemoryOutboxStorage([], { retired: rows, deviceRecords: [shortTally] });
  const { oracleView } = watchFullReads(storage);

  const summary = await summarizeDurableOutbox({ storage, studentId: 'S1' });
  assert.deepEqual(retiredCountsOf(summary), await fullScanRetiredCounts({ storage: oracleView, studentId: 'S1' }));
  assert.equal(storage.retiredRowScans(), 1, 'the disagreement is found by a count, and repaired by one read');
  await summarizeDurableOutbox({ storage, studentId: 'S1' });
  assert.equal(storage.retiredRowScans(), 1, 'and not looked for again on the same page');

  // A tally that agrees with its rows costs no read at all on a new page.
  resetRetiredTallyVerificationForTests();
  await summarizeDurableOutbox({ storage, studentId: 'S1' });
  assert.equal(storage.retiredRowScans(), 1);
});

test('a tally record this release cannot trust is rebuilt, never read as a number', async () => {
  const rows = semester();
  const expected = tallyRetiredRows(rows, 'S1');
  // Each is wrong in exactly one way. Read WITHOUT the page's first-summary
  // count check, so the record's own validation is the only thing in the way.
  const untrustworthy = [
    // Written by an earlier release's rules: the reason the version exists.
    { version: RETIRED_TALLY_VERSION - 1, studentId: 'S1', total: 1, byDisposition: { duplicate: 1 } },
    { version: RETIRED_TALLY_VERSION + 1, studentId: 'S1', total: 1, byDisposition: { duplicate: 1 } },
    { version: RETIRED_TALLY_VERSION, studentId: 'S2', total: 1, byDisposition: { duplicate: 1 } },
    { version: RETIRED_TALLY_VERSION, studentId: 'S1', total: 3, byDisposition: { duplicate: 1 } },
    { version: RETIRED_TALLY_VERSION, studentId: 'S1', total: 1, byDisposition: { duplicate: 0, superseded: 1 } },
    { version: RETIRED_TALLY_VERSION, studentId: 'S1', total: -1, byDisposition: {} },
    { version: RETIRED_TALLY_VERSION, studentId: 'S1', total: '24', byDisposition: expected.byDisposition },
    { version: RETIRED_TALLY_VERSION, studentId: 'S1', total: 0, byDisposition: null },
  ];
  for (const record of untrustworthy) {
    const storage = createMemoryOutboxStorage([], {
      retired: rows,
      deviceRecords: [{ key: retiredTallyKey('S1'), ...record }],
    });
    // eslint-disable-next-line no-await-in-loop
    const tally = await storage.readRetiredTally('S1', { verify: false });
    assert.deepEqual(tally, expected, JSON.stringify(record));
    assert.equal(storage.retiredRowScans(), 1, `rebuilt from the rows: ${JSON.stringify(record)}`);
  }
});

test('the tally arithmetic drops empty buckets and refuses to remove what it never counted', () => {
  const start = { total: 2, byDisposition: { duplicate: 1, superseded: 1 } };
  const moved = applyRetiredTallyChange(start, {
    studentId: 'S1',
    removed: { studentId: 'S1', retirement: { disposition: 'superseded' } },
    added: { studentId: 'S1', retirement: { disposition: 'duplicate' } },
  });
  assert.deepEqual(moved, { total: 2, byDisposition: { duplicate: 2 } }, 'an emptied disposition disappears, as it does from a full read');
  assert.equal(
    applyRetiredTallyChange(start, { studentId: 'S1', removed: { studentId: 'S1', retirement: { disposition: 'permanently-invalid' } } }),
    null,
    'removing a row the tally never counted means the tally is wrong: rebuild, do not guess',
  );
  assert.deepEqual(
    applyRetiredTallyChange(start, { studentId: 'S1', added: { studentId: 'S2', retirement: { disposition: 'duplicate' } } }),
    start,
    'another student’s row is not this student’s count',
  );
  assert.deepEqual(
    applyRetiredTallyChange(start, { studentId: 'S1', added: { studentId: 'S1' } }),
    { total: 3, byDisposition: { duplicate: 1, superseded: 1, unknown: 1 } },
    'a row with no disposition is filed under unknown, as the summary always filed it',
  );
});

test('a summary that cannot read its tally reports no retired rows, as the full read did when it failed', async () => {
  resetRetiredTallyVerificationForTests();
  const storage = createMemoryOutboxStorage([submission('S1', 'still-queued')], { retired: semester() });
  storage.readRetiredTally = async () => { throw new Error('IndexedDB is unavailable'); };
  const summary = await summarizeDurableOutbox({ storage, studentId: 'S1' });
  const failingOracle = await fullScanRetiredCounts({ storage: { listRetired: async () => { throw new Error('IndexedDB is unavailable'); } }, studentId: 'S1' });
  assert.deepEqual(retiredCountsOf(summary), failingOracle);
  assert.equal(summary.queued, 1, 'and the rest of the summary is unaffected');
});

test('a storage adapter that keeps no tally is still counted from its rows', async () => {
  resetRetiredTallyVerificationForTests();
  const rows = semester();
  const tallyless = { list: async () => [], listRetired: async () => rows.map((row) => ({ ...row })) };
  const summary = await summarizeDurableOutbox({ storage: tallyless, studentId: 'S1' });
  assert.deepEqual(retiredCountsOf(summary), await fullScanRetiredCounts({ storage: tallyless, studentId: 'S1' }));
});

/* ==========================================================================
 * THE INDEXEDDB ADAPTER'S SHAPE.
 *
 * node has no IndexedDB, so the real transactions are proved in Chromium by
 * tests/browser/durableOutboxRecovery.mjs (`npm run test:durable-outbox`),
 * which nothing in CI runs. These bind the properties that only exist in the
 * IndexedDB adapter to the code that has to provide them, so CI still notices
 * if one is taken away.
 * ======================================================================== */

const outboxSource = readFileSync(new URL('../../src/platform/performance/durableActionOutbox.js', import.meta.url), 'utf8');

test('the retirement and its count share one transaction', () => {
  const retire = region(outboxSource, 'const retireIfCurrentTransaction', 'const annotateIfCurrentTransaction', 'retirement transaction');
  // The transaction is opened over the tally's store as well as the two the move needs...
  assert.match(retire, /database\.transaction\(\s*keepsTally \? \[STORE_NAME, RETIRED_STORE_NAME, DEVICE_IDENTITY_STORE_NAME\]/);
  // ...and the tally is changed through THAT transaction, in the handler that moves the row.
  const move = region(retire, 'replaced.onsuccess = () => {', 'transaction.oncomplete', 'the move');
  assert.match(move, /retiredStore\.put\(entry\);\s*store\.delete\(actionId\);/);
  assert.match(move, /keepRetiredTallyCurrent\(transaction\.objectStore\(DEVICE_IDENTITY_STORE_NAME\), \{\s*replaced: replaced\.result \|\| null,\s*added: entry,/);
});

test('a bookkeeping failure cannot abort the retirement it rides in', () => {
  const upkeep = region(outboxSource, 'const keepRetiredTallyCurrent', 'RETIREMENT IS A MOVE, NOT A DELETE', 'tally upkeep');
  // A failed request is kept from aborting the transaction, and from bubbling
  // to the handler that would report the retirement as failed.
  assert.match(upkeep, /event\?\.preventDefault\?\.\(\);\s*event\?\.stopPropagation\?\.\(\);/);
  assert.match(upkeep, /read\.onerror = discard;/);
  assert.match(upkeep, /\.onerror = discard;\s*\} catch \{\s*discard\(\);/);
});

test('a missing tally is built and stored inside one readwrite transaction that looks again first', () => {
  const rebuild = region(outboxSource, 'const rebuildRetiredTallyTransaction', 'const readRetiredTallyTransaction', 'tally rebuild');
  assert.match(rebuild, /runOwnTransaction\(\s*\[RETIRED_STORE_NAME, DEVICE_IDENTITY_STORE_NAME\],\s*'readwrite',/);
  // The rows are read and the tally written in the same success handler.
  assert.match(rebuild, /rows\.onsuccess = \(\) => \{\s*const tally = tallyRetiredRows\(rows\.result, studentId\);\s*tallies\.put\(retiredTallyRecord\(studentId, tally\)\);/);
  // Another tab's tally, found on the second look, is used and not overwritten.
  assert.match(rebuild, /if \(stored && !verify\) \{\s*settle\(stored\);\s*return;\s*\}/);

  // The ordinary read opens the tally's store alone; `retired` only when verifying.
  const read = region(outboxSource, 'const readRetiredTallyTransaction', 'THE LAST DEVICE REPORT THE SERVER ACKNOWLEDGED', 'tally read');
  assert.match(read, /verify \? \[DEVICE_IDENTITY_STORE_NAME, RETIRED_STORE_NAME\] : DEVICE_IDENTITY_STORE_NAME,\s*'readonly'/);
  assert.doesNotMatch(read.split('return rebuildRetiredTallyTransaction')[0], /getAll\(/, 'the ordinary read must never read retired rows');
});
