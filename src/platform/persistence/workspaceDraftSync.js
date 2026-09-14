/*
 * BACKGROUND SAVE FOR UNFINISHED WORK.
 *
 * The student's interaction path is untouched: a keystroke updates the
 * workspace, writes the local draft, and returns. This layer notices that the
 * draft changed, coalesces every change inside a debounce window, and writes
 * ONE Firestore document per assignment in the background. Nothing here is
 * ever awaited by a component.
 *
 * That is the whole reason a Chromebook can be turned off, or swapped for a
 * different one, without costing the student their work — and the reason
 * typing does not cost a Firestore write per character.
 */
import {
  buildWorkspaceDraftDocument,
  isSyncableDraftKey,
  sanitizeWorkspaceDraftValue,
} from '../../../functions/shared/workspaceDraftSchema.mjs';
import { parseQuestionDraftKey } from '../../questionDraftStorage.js';

export const WORKSPACE_DRAFT_DEBOUNCE_MS = 2500;

/**
 * @param flush  async ({ document }) => void — the only network call.
 *               Injected so the engine is testable without Firestore, and so a
 *               failure here can be retried without the caller knowing.
 */
export const createWorkspaceDraftSync = ({
  studentId,
  assignmentId,
  classId = null,
  flush,
  debounceMs = WORKSPACE_DRAFT_DEBOUNCE_MS,
  scheduler = null,
  now = () => Date.now(),
} = {}) => {
  const pending = new Map();
  const timers = scheduler || {
    set: (callback, delay) => setTimeout(callback, delay),
    clear: (handle) => clearTimeout(handle),
  };
  let handle = null;
  let revision = 0;
  let inFlight = null;
  let stopped = false;
  let dirtySinceFlush = false;
  let resume = null;
  let practice = null;
  const stats = { recorded: 0, skipped: 0, flushes: 0, failures: 0 };

  const snapshotDocument = () => buildWorkspaceDraftDocument({
    studentId,
    assignmentId,
    classId,
    revision,
    entries: [...pending.values()],
    resume,
    practice,
  });

  const runFlush = async () => {
    handle = null;
    if (stopped || !dirtySinceFlush || typeof flush !== 'function') return;
    // One write at a time. A slow network coalesces into the next flush
    // instead of queueing a write per keystroke.
    if (inFlight) return;
    dirtySinceFlush = false;
    revision += 1;
    const document = snapshotDocument();
    stats.flushes += 1;
    inFlight = Promise.resolve()
      .then(() => flush({ document }))
      .catch((error) => {
        // The local copy is still durable. Mark the state dirty again so the
        // next change — or the next explicit flush — retries it.
        stats.failures += 1;
        dirtySinceFlush = true;
        console.warn('MathMaster could not back up this workspace draft yet:', error);
      })
      .finally(() => {
        inFlight = null;
        if (dirtySinceFlush && !stopped) schedule();
      });
  };

  function schedule() {
    if (stopped) return;
    if (handle !== null) timers.clear(handle);
    handle = timers.set(runFlush, debounceMs);
  }

  return {
    /** Called synchronously from the draft write. Must stay cheap. */
    record({ key, value, savedAt } = {}) {
      if (stopped) return false;
      const identity = parseQuestionDraftKey(key);
      if (!identity || !['student', 'practice'].includes(identity.sessionBucket)) { stats.skipped += 1; return false; }
      if (identity.studentId !== String(studentId) || identity.assignmentId !== String(assignmentId)) { stats.skipped += 1; return false; }
      if (!isSyncableDraftKey(key) || !sanitizeWorkspaceDraftValue(value).ok) { stats.skipped += 1; return false; }
      pending.set(key, {
        key,
        value,
        savedAt: Number(savedAt) || now(),
        questionIndex: identity.questionIndex,
        variantIndex: identity.variantIndex,
      });
      stats.recorded += 1;
      dirtySinceFlush = true;
      schedule();
      return true;
    },
    /** Resume position and Practice Mode ride the same document and debounce. */
    setResume(next) {
      resume = next ? { ...next, updatedAt: Number(next.updatedAt) || now() } : null;
      dirtySinceFlush = true;
      schedule();
    },
    setPractice(next) {
      practice = next && typeof next === 'object' ? next : null;
      dirtySinceFlush = true;
      schedule();
    },
    /** Used by pagehide and by assignment teardown. Still never blocks a render. */
    flushNow() {
      if (handle !== null) { timers.clear(handle); handle = null; }
      return runFlush();
    },
    stop() {
      stopped = true;
      if (handle !== null) { timers.clear(handle); handle = null; }
    },
    pendingKeys: () => [...pending.keys()],
    stats: () => ({ ...stats }),
    snapshotDocument,
  };
};
