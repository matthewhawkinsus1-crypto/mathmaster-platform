import { recordPerformanceSample, startPerformanceSpan } from './performanceTelemetry.js';
import { generateRuntimeUUID } from '../../utils/idUtils.js';

const DATABASE_NAME = 'mathmaster-student-actions';
const STORE_NAME = 'outbox';
const DATABASE_VERSION = 1;
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
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'actionId' });
      store.createIndex('studentId', 'studentId', { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
});

const transactionRequest = async (mode, operation) => {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
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

export const indexedDbOutboxStorage = Object.freeze({
  put: (action) => transactionRequest('readwrite', (store) => store.put(clone(action))),
  remove: (actionId) => transactionRequest('readwrite', (store) => store.delete(actionId)),
  /** Delete only while the stored row is still the revision that was reconciled. */
  removeIfCurrent: (actionId, expectedCreatedOrder) => removeIfCurrentTransaction(actionId, expectedCreatedOrder),
  list: () => transactionRequest('readonly', (store) => store.getAll()),
});

export const createDurableAction = ({ kind, studentId, assignmentId, questionIndex, payload, actionId = null, createdAt = Date.now() }) => {
  if (!['ordinarySubmission', 'stepSubmission', 'questionProgress', 'questionReplacement', 'responseCheckpoint'].includes(kind)) throw new Error('Unsupported durable student action.');
  if (payload?.secure === true || payload?.answerKey != null || payload?.seed != null) throw new Error('Protected assessment data cannot enter the ordinary student outbox.');
  if (!studentId || !assignmentId || !Number.isInteger(Number(questionIndex))) throw new Error('Durable student actions require student, assignment, and question identity.');
  return Object.freeze({
    schemaVersion: 1,
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

export const listDurableActions = async ({ storage = indexedDbOutboxStorage, studentId = null } = {}) => {
  const actions = await storage.list();
  return actions
    .filter((action) => !studentId || action.studentId === studentId)
    .sort((left, right) => (left.createdOrder || left.createdAt) - (right.createdOrder || right.createdAt)
      || left.actionId.localeCompare(right.actionId));
};

export const overlayDurableActionsOnGrades = (gradesByAssignment = {}, actions = []) => {
  let next = gradesByAssignment && typeof gradesByAssignment === 'object' ? gradesByAssignment : {};
  const ordered = [...(Array.isArray(actions) ? actions : [])]
    .sort((left, right) => (left.createdOrder || left.createdAt || 0) - (right.createdOrder || right.createdAt || 0)
      || String(left.actionId || '').localeCompare(String(right.actionId || '')));

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

    if (!['ordinarySubmission', 'stepSubmission', 'questionReplacement'].includes(action.kind) || !action.payload?.record) return;
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

export const drainDurableActions = ({ storage = indexedDbOutboxStorage, studentId, reconcile }) => {
  const run = async () => {
    const queued = await listDurableActions({ storage, studentId });
    let recovered = 0;
    let rejected = 0;
    for (const action of queued) {
      const span = startPerformanceSpan('submission_reconcile_ms', { flow: action.kind });
      try {
        const outcome = await reconcile(action);
        if (!['durable', 'rejected'].includes(outcome?.status)) {
          span.finish({ status: 'queued' });
          break;
        }
        await removeReconciledAction(storage, action);
        recovered += 1;
        if (outcome.status === 'rejected') rejected += 1;
        span.finish({ status: outcome.status });
      } catch {
        span.finish({ status: 'queued' });
        break;
      }
    }
    if (recovered) recordPerformanceSample('submission_recovery_count', recovered, { flow: 'outbox' });
    await reportDepth(storage).catch(() => null);
    return { recovered, rejected, remaining: (await listDurableActions({ storage, studentId })).length };
  };
  const result = drainChain.then(run, run);
  drainChain = result.catch(() => {});
  return result;
};

export const createMemoryOutboxStorage = (initial = []) => {
  const records = new Map(initial.map((action) => [action.actionId, clone(action)]));
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
    async list() { return [...records.values()].map(clone); },
  };
};
