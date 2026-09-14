/*
 * THE DURABLE STUDENT ACTION OUTBOX.
 *
 * A student's Submit crosses this boundary before React advances, so the
 * interaction stays fast and the work survives a closed Chromebook. Everything
 * after that is delivery, and delivery is where the September 14 incident
 * happened. Two properties are now structural rather than incidental:
 *
 *   1. A NON-GRADE ACTION CAN NEVER BLOCK A GRADE-BEARING ACTION.
 *      The queue used to be one serial list drained by a `for` loop that
 *      `break`s on the first failure. A response checkpoint or a progress save
 *      that could not be written therefore held every later Submit behind it —
 *      indefinitely, because the retry restarted at the same stuck head. Work
 *      is now split into an ordered stream per question, grade-bearing streams
 *      are drained first, and a stalled stream only stalls itself.
 *
 *   2. CAPTURED ACADEMIC WORK IS NEVER SILENTLY DISCARDED.
 *      A submission leaves this queue only when the outcome PROVES it may:
 *      the canonical write succeeded, the same submission is already canonical,
 *      a newer canonical attempt superseded it, or it was never eligible for
 *      credit. Everything else is kept. A retired submission is moved to the
 *      `retired` store with its reason, not deleted — it is the evidence a
 *      teacher recovery report is built from.
 *
 * Per-question ordering is preserved; global ordering across unrelated
 * questions is not, and never needed to be.
 */
import { recordPerformanceSample, startPerformanceSpan } from './performanceTelemetry.js';
import { generateRuntimeUUID } from '../../utils/idUtils.js';
import {
  RETIRING_DISPOSITIONS,
  SUBMISSION_DISPOSITION,
  isTerminalDisposition,
  normalizeReconcileOutcome,
} from '../../../functions/shared/studentSubmissionDisposition.mjs';

const DATABASE_NAME = 'mathmaster-student-actions';
const STORE_NAME = 'outbox';
const RETIRED_STORE_NAME = 'retired';
/*
 * VERSION 2 IS ADDITIVE ON PURPOSE.
 *
 * Chromebooks in the field are holding version 1 rows written by PR #226 and
 * PR #243, and those rows ARE the September 14 recovery. The upgrade adds the
 * `retired` store and leaves every existing row untouched; nothing reads a
 * field a version 1 row lacks without a default. Opening the database must
 * never be able to cost a student their queued work.
 */
const DATABASE_VERSION = 2;

export const DURABLE_ACTION_SCHEMA_VERSION = 2;

const SUPPORTED_KINDS = ['ordinarySubmission', 'stepSubmission', 'questionProgress', 'questionReplacement', 'responseCheckpoint'];

/** The kinds that carry academic credit. These are drained first, always. */
export const GRADE_BEARING_KINDS = Object.freeze(['ordinarySubmission', 'stepSubmission', 'questionReplacement']);

export const LANE = Object.freeze({ GRADE: 'grade', BACKGROUND: 'background' });

export const actionLane = (action) => (
  GRADE_BEARING_KINDS.includes(String(action?.kind || '')) ? LANE.GRADE : LANE.BACKGROUND
);

export const isGradeBearingAction = (action) => actionLane(action) === LANE.GRADE;

/*
 * THE UNIT OF ORDERING.
 *
 * Two attempts at the SAME question must reach Firestore in the order the
 * student made them, because the second one's `previousTotalAttempts` names
 * the first one's result. Nothing else needs an order: question 4 has no
 * opinion about question 7, and a checkpoint has no opinion about anything.
 *
 * Background work is keyed by kind as well, so a stuck checkpoint for a
 * question cannot hold up that question's progress save either. The key is
 * JSON so that an assignment id containing the separator cannot collide two
 * unrelated streams into one.
 */
export const actionStreamKey = (action) => JSON.stringify([
  isGradeBearingAction(action) ? LANE.GRADE : String(action?.kind ?? ''),
  String(action?.assignmentId ?? ''),
  Number(action?.questionIndex ?? -1),
]);

/*
 * A RECONCILE THAT NEVER RETURNS MUST NOT OWN THE QUEUE.
 *
 * Firestore client transactions do NOT behave like ordinary writes when the
 * network is gone: `runTransaction` waits for connectivity rather than failing,
 * so one offline Submit could hold the single global drain chain forever and
 * every later submission with it. Bounding the wait turns that into a retry.
 * The transaction may still commit afterwards, which is harmless — every
 * reconciliation path is idempotent on the action id.
 */
export const RECONCILE_TIMEOUT_MS = 15_000;

let drainChain = Promise.resolve();
let lastCreatedOrder = 0;

const nextCreatedOrder = () => {
  lastCreatedOrder = Math.max(lastCreatedOrder + 1, Date.now() * 1000);
  return lastCreatedOrder;
};

const clone = (value) => (typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value)));

const openDatabase = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('Durable browser storage is unavailable.'));
    return;
  }
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onerror = () => reject(request.error || new Error('Could not open the student action outbox.'));
  request.onupgradeneeded = () => {
    const database = request.result;
    // Additive only. An existing `outbox` keeps every row it already holds.
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'actionId' });
      store.createIndex('studentId', 'studentId', { unique: false });
    }
    if (!database.objectStoreNames.contains(RETIRED_STORE_NAME)) {
      const retired = database.createObjectStore(RETIRED_STORE_NAME, { keyPath: 'actionId' });
      retired.createIndex('studentId', 'studentId', { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
});

const transactionRequest = async (mode, operation, storeName = STORE_NAME) => {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      let result;
      request.onerror = () => reject(request.error || new Error('Student action outbox request failed.'));
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error('Student action outbox transaction aborted.'));
      transaction.onerror = () => reject(transaction.error || new Error('Student action outbox transaction failed.'));
    });
  } finally {
    database.close();
  }
};

/*
 * `removeIfCurrent` IS THE ONLY SAFE WAY TO DELETE A COALESCED ACTION.
 *
 * A response checkpoint's queue id is DETERMINISTIC so revisions coalesce into
 * one row. A plain delete after reconciling therefore races: revision 2 can be
 * written while revision 1 is still in flight, and deleting "the row" then
 * throws revision 2 away — leaving the server holding the STALE response,
 * which is the exact bug checkpoints exist to prevent.
 *
 * The read and the delete happen inside ONE readwrite transaction, so nothing
 * can be written between them.
 *
 * This owns its whole transaction rather than going through
 * `transactionRequest`, which assigns its own `onsuccess` to whatever request
 * it is handed — that would silently replace the handler below and the delete
 * would never be issued. It is the kind of mistake unit tests against the
 * in-memory adapter cannot see, so tests/browser/durableOutboxRecovery.mjs
 * exercises this against real IndexedDB.
 */
const removeIfCurrentTransaction = async (actionId, expectedCreatedOrder) => {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      // Assume removal unless the read proves this row has moved on.
      let removed = true;
      const read = store.get(actionId);
      read.onerror = () => reject(read.error || new Error('Student action outbox request failed.'));
      read.onsuccess = () => {
        const current = read.result;
        // Already gone: nothing to do, and nothing was lost.
        if (!current) return;
        if (Number(current.createdOrder ?? current.createdAt ?? 0) > Number(expectedCreatedOrder ?? 0)) {
          removed = false;
          return;
        }
        store.delete(actionId);
      };
      transaction.oncomplete = () => resolve(removed);
      transaction.onabort = () => reject(transaction.error || new Error('Student action outbox transaction aborted.'));
      transaction.onerror = () => reject(transaction.error || new Error('Student action outbox transaction failed.'));
    });
  } finally {
    database.close();
  }
};

/*
 * RETIREMENT IS A MOVE, NOT A DELETE.
 *
 * The retired row is what proves to a teacher that a student's submission
 * existed and why it never became a grade. Writing it and removing the queue
 * row happen in ONE transaction across both stores, so a crash between them
 * cannot lose the envelope. If the queue row has moved on, nothing is retired:
 * the newer revision is still owed a delivery.
 */
const retireIfCurrentTransaction = async (actionId, expectedCreatedOrder, retirement) => {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, RETIRED_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const retiredStore = transaction.objectStore(RETIRED_STORE_NAME);
      let retired = true;
      const read = store.get(actionId);
      read.onerror = () => reject(read.error || new Error('Student action outbox request failed.'));
      read.onsuccess = () => {
        const current = read.result;
        if (!current) return;
        if (Number(current.createdOrder ?? current.createdAt ?? 0) > Number(expectedCreatedOrder ?? 0)) {
          retired = false;
          return;
        }
        retiredStore.put(clone({ ...current, retirement }));
        store.delete(actionId);
      };
      transaction.oncomplete = () => resolve(retired);
      transaction.onabort = () => reject(transaction.error || new Error('Student action outbox transaction aborted.'));
      transaction.onerror = () => reject(transaction.error || new Error('Student action outbox transaction failed.'));
    });
  } finally {
    database.close();
  }
};

/** Record why a delivery has not succeeded yet, without disturbing the row's order. */
const annotateIfCurrentTransaction = async (actionId, expectedCreatedOrder, delivery) => {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      let annotated = true;
      const read = store.get(actionId);
      read.onerror = () => reject(read.error || new Error('Student action outbox request failed.'));
      read.onsuccess = () => {
        const current = read.result;
        if (!current) { annotated = false; return; }
        if (Number(current.createdOrder ?? current.createdAt ?? 0) > Number(expectedCreatedOrder ?? 0)) {
          annotated = false;
          return;
        }
        store.put({ ...current, delivery: clone(delivery) });
      };
      transaction.oncomplete = () => resolve(annotated);
      transaction.onabort = () => reject(transaction.error || new Error('Student action outbox transaction aborted.'));
      transaction.onerror = () => reject(transaction.error || new Error('Student action outbox transaction failed.'));
    });
  } finally {
    database.close();
  }
};

export const indexedDbOutboxStorage = Object.freeze({
  put: (action) => transactionRequest('readwrite', (store) => store.put(clone(action))),
  remove: (actionId) => transactionRequest('readwrite', (store) => store.delete(actionId)),
  /** Delete only while the stored row is still the revision that was reconciled. */
  removeIfCurrent: (actionId, expectedCreatedOrder) => removeIfCurrentTransaction(actionId, expectedCreatedOrder),
  /** Move to the retained `retired` store only while the row is still current. */
  retireIfCurrent: (actionId, expectedCreatedOrder, retirement) => retireIfCurrentTransaction(actionId, expectedCreatedOrder, retirement),
  annotateIfCurrent: (actionId, expectedCreatedOrder, delivery) => annotateIfCurrentTransaction(actionId, expectedCreatedOrder, delivery),
  list: () => transactionRequest('readonly', (store) => store.getAll()),
  listRetired: () => transactionRequest('readonly', (store) => store.getAll(), RETIRED_STORE_NAME),
});

export const createDurableAction = ({ kind, studentId, assignmentId, questionIndex, payload, actionId = null, createdAt = Date.now() }) => {
  if (!SUPPORTED_KINDS.includes(kind)) throw new Error('Unsupported durable student action.');
  if (payload?.secure === true || payload?.answerKey != null || payload?.seed != null) throw new Error('Protected assessment data cannot enter the ordinary student outbox.');
  if (!studentId || !assignmentId || !Number.isInteger(Number(questionIndex))) throw new Error('Durable student actions require student, assignment, and question identity.');
  return Object.freeze({
    schemaVersion: DURABLE_ACTION_SCHEMA_VERSION,
    actionId: actionId || `student_action_${generateRuntimeUUID()}`,
    kind,
    studentId: String(studentId),
    assignmentId: String(assignmentId),
    questionIndex: Number(questionIndex),
    createdAt: Number(createdAt) || Date.now(),
    createdOrder: nextCreatedOrder(),
    payload: clone(payload || {}),
  });
};

/*
 * READ A ROW WRITTEN BY ANY RELEASE.
 *
 * A Chromebook that has not been reloaded since September 14 holds PR #226 and
 * PR #243 rows: `schemaVersion: 1`, no `delivery`, and for the oldest of them
 * no `createdOrder` either. They are read here without being rewritten, because
 * the recovery depends on them being usable exactly as they were stored.
 * Anything this release added is defaulted, never required.
 */
export const migrateLegacyDurableAction = (action) => {
  if (!action || typeof action !== 'object') return null;
  if (!SUPPORTED_KINDS.includes(String(action.kind || ''))) return null;
  if (!action.actionId || !action.studentId || !action.assignmentId) return null;
  if (!Number.isInteger(Number(action.questionIndex))) return null;
  const createdAt = Number(action.createdAt) || 0;
  const createdOrder = Number(action.createdOrder) || createdAt * 1000 || 0;
  return {
    ...action,
    schemaVersion: Number(action.schemaVersion) || 1,
    questionIndex: Number(action.questionIndex),
    createdAt: createdAt || Math.round(createdOrder / 1000) || 0,
    createdOrder,
    payload: action.payload && typeof action.payload === 'object' ? action.payload : {},
    delivery: action.delivery && typeof action.delivery === 'object' ? action.delivery : null,
  };
};

const reportDepth = async (storage) => {
  const depth = (await storage.list()).length;
  recordPerformanceSample('submission_queue_depth', depth, { flow: 'outbox' });
  return depth;
};

export const enqueueDurableAction = async (action, { storage = indexedDbOutboxStorage } = {}) => {
  const captureSpan = startPerformanceSpan('submission_capture_ms', { flow: action.kind });
  const immutable = clone(action);
  captureSpan.finish({ status: 'captured' });
  const writeSpan = startPerformanceSpan('submission_queue_write_ms', { flow: action.kind });
  await storage.put(immutable);
  writeSpan.finish({ status: 'durable_local' });
  await reportDepth(storage).catch(() => null);
  return immutable;
};

const byCaptureOrder = (left, right) => (
  (left.createdOrder || left.createdAt || 0) - (right.createdOrder || right.createdAt || 0)
  || String(left.actionId || '').localeCompare(String(right.actionId || ''))
);

export const listDurableActions = async ({ storage = indexedDbOutboxStorage, studentId = null } = {}) => {
  const actions = await storage.list();
  return actions
    .map(migrateLegacyDurableAction)
    .filter((action) => action && (!studentId || action.studentId === studentId))
    .sort(byCaptureOrder);
};

/** Submissions this device retired, with the reason each one was retired for. */
export const listRetiredDurableActions = async ({ storage = indexedDbOutboxStorage, studentId = null } = {}) => {
  if (typeof storage.listRetired !== 'function') return [];
  const actions = await storage.listRetired();
  return (Array.isArray(actions) ? actions : [])
    .filter((action) => action && (!studentId || action.studentId === studentId))
    .sort(byCaptureOrder);
};

export const overlayDurableActionsOnGrades = (gradesByAssignment = {}, actions = []) => {
  let next = gradesByAssignment && typeof gradesByAssignment === 'object' ? gradesByAssignment : {};
  const ordered = [...(Array.isArray(actions) ? actions : [])].sort(byCaptureOrder);

  ordered.forEach((action) => {
    if (!action?.assignmentId || !Number.isInteger(Number(action.questionIndex))) return;
    const assignmentId = String(action.assignmentId);
    const questionIndex = Number(action.questionIndex);
    const assignmentGrades = next[assignmentId] || {};
    const currentRecord = assignmentGrades[questionIndex] || {};

    if (action.kind === 'questionProgress') {
      const pendingTime = Number(action.payload?.timeSpent) || 0;
      const currentTime = Number(currentRecord?.timeSpent) || 0;
      if (pendingTime <= currentTime) return;
      next = {
        ...next,
        [assignmentId]: {
          ...assignmentGrades,
          [questionIndex]: { ...currentRecord, timeSpent: pendingTime },
        },
      };
      return;
    }

    if (!GRADE_BEARING_KINDS.includes(action.kind) || !action.payload?.record) return;
    const pendingRecord = clone(action.payload.record);
    const pendingAttempts = Number(pendingRecord.totalAttempts) || 0;
    const currentAttempts = Number(currentRecord?.totalAttempts) || 0;
    if (pendingAttempts < currentAttempts) return;

    next = {
      ...next,
      [assignmentId]: {
        ...assignmentGrades,
        [questionIndex]: pendingRecord,
      },
    };
  });

  return next;
};

/**
 * Remove the row we reconciled, never whatever is there now.
 *
 * Storage that implements `removeIfCurrent` does this atomically. The fallback
 * exists only for a storage adapter that predates it.
 */
const removeReconciledAction = async (storage, action) => {
  const expectedOrder = action.createdOrder ?? action.createdAt ?? 0;
  if (typeof storage.removeIfCurrent === 'function') {
    return storage.removeIfCurrent(action.actionId, expectedOrder);
  }
  const current = (await storage.list()).find((entry) => entry.actionId === action.actionId);
  if (current && Number(current.createdOrder ?? current.createdAt ?? 0) > Number(expectedOrder)) return false;
  await storage.remove(action.actionId);
  return true;
};

/**
 * Retire a submission that PROVABLY may leave the queue, keeping its envelope.
 *
 * An adapter with no `retired` store falls back to removal, which is what a
 * successful canonical write needs anyway. Retirement for any other reason is
 * refused there rather than silently destroying the work.
 */
const retireReconciledAction = async (storage, action, retirement) => {
  const expectedOrder = action.createdOrder ?? action.createdAt ?? 0;
  if (typeof storage.retireIfCurrent === 'function') {
    return storage.retireIfCurrent(action.actionId, expectedOrder, retirement);
  }
  if (retirement.disposition === SUBMISSION_DISPOSITION.ACCEPTED) {
    return removeReconciledAction(storage, action);
  }
  return false;
};

const withTimeout = (promise, timeoutMs) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
    // Deliberately NOT unref'd. The point of this timer is to be the thing that
    // still resolves when the reconcile never does; a timer that lets the loop
    // drain out from under it would put the queue right back where it was.
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Reconciliation did not answer in time.')), timeoutMs);
    }),
  ]);
};

/** Group actions into independently drainable, internally ordered streams. */
export const groupDurableActionsIntoStreams = (actions = []) => {
  const streams = new Map();
  [...actions].sort(byCaptureOrder).forEach((action) => {
    const key = actionStreamKey(action);
    if (!streams.has(key)) streams.set(key, { key, lane: actionLane(action), actions: [] });
    streams.get(key).actions.push(action);
  });
  return [...streams.values()];
};

const emptyTally = () => ({
  accepted: 0,
  duplicate: 0,
  superseded: 0,
  permanentlyInvalid: 0,
  needsReview: 0,
  retryable: 0,
  failed: 0,
});

/**
 * Drain the outbox.
 *
 * Grade-bearing streams first, then background streams, each stream
 * independently. A stream stops at its first retained action so that question's
 * attempts stay ordered; every other stream keeps going.
 */
export const drainDurableActions = ({
  storage = indexedDbOutboxStorage,
  studentId,
  reconcile,
  timeoutMs = RECONCILE_TIMEOUT_MS,
  now = Date.now(),
} = {}) => {
  const run = async () => {
    const queued = await listDurableActions({ storage, studentId });
    const streams = groupDurableActionsIntoStreams(queued);
    const tally = emptyTally();
    let recovered = 0;
    let rejected = 0;
    let gradeBlocked = 0;
    const retained = [];

    const drainStream = async (stream) => {
      for (const action of stream.actions) {
        const span = startPerformanceSpan('submission_reconcile_ms', { flow: action.kind });
        let normalized;
        try {
          normalized = normalizeReconcileOutcome(await withTimeout(reconcile(action), timeoutMs));
        } catch (error) {
          normalized = {
            disposition: SUBMISSION_DISPOSITION.RETRYABLE,
            reason: `delivery-error:${String(error?.message || error || 'unknown').slice(0, 120)}`,
          };
          tally.failed += 1;
        }

        if (isTerminalDisposition(normalized.disposition)) {
          const retirement = {
            disposition: normalized.disposition,
            reason: normalized.reason,
            retiredAt: now,
            receipt: normalized.receipt || null,
          };
          if (RETIRING_DISPOSITIONS.includes(normalized.disposition)) {
            await retireReconciledAction(storage, action, retirement);
          } else {
            await removeReconciledAction(storage, action);
          }
          recovered += 1;
          if (normalized.disposition === SUBMISSION_DISPOSITION.ACCEPTED) tally.accepted += 1;
          if (normalized.disposition === SUBMISSION_DISPOSITION.DUPLICATE) tally.duplicate += 1;
          if (normalized.disposition === SUBMISSION_DISPOSITION.SUPERSEDED) tally.superseded += 1;
          if (normalized.disposition === SUBMISSION_DISPOSITION.PERMANENTLY_INVALID) {
            tally.permanentlyInvalid += 1;
            rejected += 1;
          }
          span.finish({ status: normalized.disposition });
          continue;
        }

        /*
         * KEPT. The student's work stays exactly where it is, and the reason is
         * written next to it so the recovery report can say why. The rest of
         * this stream waits — attempts at one question stay in order — and
         * every other stream carries on.
         */
        if (normalized.disposition === SUBMISSION_DISPOSITION.NEEDS_REVIEW) tally.needsReview += 1;
        else tally.retryable += 1;
        if (stream.lane === LANE.GRADE) gradeBlocked += 1;
        retained.push({ actionId: action.actionId, kind: action.kind, ...normalized });
        const delivery = {
          attempts: Number(action.delivery?.attempts || 0) + 1,
          disposition: normalized.disposition,
          reason: normalized.reason,
          lastAttemptAt: now,
        };
        if (typeof storage.annotateIfCurrent === 'function') {
          await storage.annotateIfCurrent(action.actionId, action.createdOrder ?? action.createdAt ?? 0, delivery)
            .catch(() => null);
        }
        span.finish({ status: normalized.disposition });
        break;
      }
    };

    // Grade-bearing work is drained to completion before anything else is
    // attempted. A checkpoint or a progress save cannot get in front of a
    // Submit even by being older.
    for (const stream of streams.filter((entry) => entry.lane === LANE.GRADE)) await drainStream(stream);
    for (const stream of streams.filter((entry) => entry.lane !== LANE.GRADE)) await drainStream(stream);

    if (recovered) recordPerformanceSample('submission_recovery_count', recovered, { flow: 'outbox' });
    if (tally.needsReview) recordPerformanceSample('submission_needs_review_count', tally.needsReview, { flow: 'outbox' });
    await reportDepth(storage).catch(() => null);
    const remainingActions = await listDurableActions({ storage, studentId });
    return {
      recovered,
      // Retained for callers written against the previous shape. It counts only
      // PROVEN-invalid work now, never a submission that is merely waiting.
      rejected,
      remaining: remainingActions.length,
      remainingGrade: remainingActions.filter(isGradeBearingAction).length,
      gradeBlocked,
      retained,
      tally,
    };
  };
  const result = drainChain.then(run, run);
  drainChain = result.catch(() => {});
  return result;
};

/**
 * What this device is still holding.
 *
 * Reported by the student's own browser after it reconnects, because an
 * IndexedDB queue is the one part of the incident no server query can see.
 */
export const summarizeDurableOutbox = async ({ storage = indexedDbOutboxStorage, studentId = null } = {}) => {
  const [queued, retired] = await Promise.all([
    listDurableActions({ storage, studentId }),
    listRetiredDurableActions({ storage, studentId }).catch(() => []),
  ]);
  const gradeBearing = queued.filter(isGradeBearingAction);
  const byReason = {};
  queued.forEach((action) => {
    const reason = action.delivery?.reason || 'not-attempted';
    byReason[reason] = (byReason[reason] || 0) + 1;
  });
  return {
    studentId: studentId || null,
    queued: queued.length,
    queuedGradeBearing: gradeBearing.length,
    queuedByKind: queued.reduce((counts, action) => ({ ...counts, [action.kind]: (counts[action.kind] || 0) + 1 }), {}),
    oldestCapturedAt: queued.length ? Math.min(...queued.map((action) => Number(action.createdAt) || 0)) : null,
    latestCapturedAt: queued.length ? Math.max(...queued.map((action) => Number(action.createdAt) || 0)) : null,
    blockedReasons: byReason,
    needsReview: queued.filter((action) => action.delivery?.disposition === SUBMISSION_DISPOSITION.NEEDS_REVIEW).length,
    retired: retired.length,
    retiredByDisposition: retired.reduce(
      (counts, action) => ({ ...counts, [action.retirement?.disposition || 'unknown']: (counts[action.retirement?.disposition || 'unknown'] || 0) + 1 }),
      {},
    ),
  };
};

export const createMemoryOutboxStorage = (initial = []) => {
  const records = new Map(initial.map((action) => [action.actionId, clone(action)]));
  const retired = new Map();
  return {
    async put(action) { records.set(action.actionId, clone(action)); },
    async remove(actionId) { records.delete(actionId); },
    // Mirrors the IndexedDB guard so tests exercise the real semantics.
    async removeIfCurrent(actionId, expectedCreatedOrder) {
      const current = records.get(actionId);
      if (!current) return true;
      if (Number(current.createdOrder ?? current.createdAt ?? 0) > Number(expectedCreatedOrder ?? 0)) return false;
      records.delete(actionId);
      return true;
    },
    async retireIfCurrent(actionId, expectedCreatedOrder, retirement) {
      const current = records.get(actionId);
      if (!current) return true;
      if (Number(current.createdOrder ?? current.createdAt ?? 0) > Number(expectedCreatedOrder ?? 0)) return false;
      retired.set(actionId, clone({ ...current, retirement }));
      records.delete(actionId);
      return true;
    },
    async annotateIfCurrent(actionId, expectedCreatedOrder, delivery) {
      const current = records.get(actionId);
      if (!current) return false;
      if (Number(current.createdOrder ?? current.createdAt ?? 0) > Number(expectedCreatedOrder ?? 0)) return false;
      records.set(actionId, clone({ ...current, delivery }));
      return true;
    },
    async list() { return [...records.values()].map(clone); },
    async listRetired() { return [...retired.values()].map(clone); },
  };
};

export { SUBMISSION_DISPOSITION };
