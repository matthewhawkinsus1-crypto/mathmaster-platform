/*
 * The teacher-workflow harness's in-memory Firestore (teacherWorkflow/
 * fakeFirestore.js), with one gap filled for the accessibility certification:
 * every snapshot carries `metadata`.
 *
 * The real SDK always sets `snapshot.metadata`; the shared fake sets it only on
 * one deliberately-cached query. Live Challenge's room watcher reads
 * `snapshot.metadata.fromCache` (its "Reconnecting…" pill), so without this a
 * student's Live Challenge screen in the harness renders "Cannot read
 * properties of undefined (reading 'fromCache')" instead of the lobby.
 *
 * Everything else — the store, the listeners, `window.__mmHarnessStore` — is
 * the shared fake itself (re-exported, one module instance), so the app, the
 * fake callables and this driver see the same data.
 */
import { onSnapshot as harnessOnSnapshot } from './teacherWorkflow/fakeFirestore.js';

export * from './teacherWorkflow/fakeFirestore.js';

const ONLINE_METADATA = Object.freeze({ fromCache: false, hasPendingWrites: false });

const withMetadata = (snapshot) => {
  if (snapshot && typeof snapshot === 'object' && !snapshot.metadata) {
    try {
      Object.defineProperty(snapshot, 'metadata', { value: ONLINE_METADATA, configurable: true, enumerable: false });
    } catch { /* a frozen snapshot keeps what it has */ }
  }
  return snapshot;
};

export const onSnapshot = (target, ...rest) => {
  const wrapped = rest.map((entry) => {
    if (typeof entry === 'function') return entry;
    if (entry && typeof entry === 'object' && typeof entry.next === 'function') {
      return { ...entry, next: (snapshot) => entry.next(withMetadata(snapshot)) };
    }
    return entry;
  });
  // The first function after the target (or an observer's `next`) receives
  // snapshots; the second function, errors.
  const firstFunction = wrapped.findIndex((entry) => typeof entry === 'function');
  if (firstFunction !== -1) {
    const onNext = wrapped[firstFunction];
    wrapped[firstFunction] = (snapshot) => onNext(withMetadata(snapshot));
  }
  return harnessOnSnapshot(target, ...wrapped);
};
