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

export const indexedDbOutboxStorage = Object.freeze({
  put: (action) => transactionRequest('readwrite', (store) => store.put(clone(action))),
  remove: (actionId) => transactionRequest('readwrite', (store) => store.delete(actionId)),
  list: () => transactionRequest('readonly', (store) => store.getAll()),
});

export const createDurableAction = ({ kind, studentId, assignmentId, questionIndex, payload, actionId = null, createdAt = Date.now() }) => {
  if (!['ordinarySubmission', 'questionProgress'].includes(kind)) throw new Error('Unsupported durable student action.');
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
        await storage.remove(action.actionId);
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
    async list() { return [...records.values()].map(clone); },
  };
};
