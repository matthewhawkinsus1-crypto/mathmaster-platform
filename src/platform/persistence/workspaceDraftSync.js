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
  buildWorkspaceDraftPatch,
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
  // What THIS device has changed and not yet had acknowledged. A flush sends
  // these as a patch; anything the server already holds for other questions is
  // preserved by the merge on the way in, never resent and never erased.
  const pending = new Map();
  let resumePatch = null;
  let resumeDirty = false;
  let practicePatch = null;
  let practiceDirty = false;
  let practiceUpdatedAt = 0;
  const timers = scheduler || {
    set: (callback, delay) => setTimeout(callback, delay),
    clear: (handle) => clearTimeout(handle),
  };
  let handle = null;
  let inFlight = null;
  let stopped = false;
  let dirtySinceFlush = false;
  const stats = { recorded: 0, skipped: 0, flushes: 0, failures: 0 };

  const snapshotPatch = () => buildWorkspaceDraftPatch({
    studentId,
    assignmentId,
    classId,
    entries: [...pending.values()],
    resume: resumePatch,
    hasResume: resumeDirty,
    practice: practicePatch,
    hasPractice: practiceDirty,
    practiceUpdatedAt,
  });

  const failed = (error) => {
    // The local copy is still durable. Mark the state dirty again so the next
    // change — or the next explicit flush — retries it.
    stats.failures += 1;
    dirtySinceFlush = true;
    console.warn('MathMaster could not back up this workspace draft yet:', error);
  };

  const runFlush = () => {
    handle = null;
    if (stopped || !dirtySinceFlush || typeof flush !== 'function') return inFlight;
    // One write at a time. A slow network coalesces into the next flush
    // instead of queueing a write per keystroke.
    if (inFlight) return inFlight;
    dirtySinceFlush = false;
    const document = snapshotPatch();
    // What this flush is responsible for. Anything the student changes WHILE
    // it is in flight stays pending, exactly like the durable outbox's
    // conditional removal — a newer draft must never be dropped because an
    // older write for the same key succeeded.
    const flushedAt = new Map([...pending.entries()].map(([key, entry]) => [key, entry.savedAt]));
    const flushedResume = resumeDirty ? resumePatch?.updatedAt ?? 0 : null;
    const flushedPractice = practiceDirty ? practiceUpdatedAt : null;
    stats.flushes += 1;
    // Started synchronously — the point of the debounce is to delay the write,
    // not to add another turn of the event loop once it is due — and never
    // awaited by whoever asked for it.
    let started;
    try {
      started = flush({ document });
    } catch (error) {
      failed(error);
      return null;
    }
    inFlight = Promise.resolve(started)
      .then(() => {
        flushedAt.forEach((savedAt, key) => {
          if ((pending.get(key)?.savedAt ?? -1) === savedAt) pending.delete(key);
        });
        if (flushedResume !== null && (resumePatch?.updatedAt ?? 0) === flushedResume) resumeDirty = false;
        if (flushedPractice !== null && practiceUpdatedAt === flushedPractice) practiceDirty = false;
      })
      .catch(failed)
      .finally(() => {
        inFlight = null;
        if (dirtySinceFlush && !stopped) schedule();
      });
    return inFlight;
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
    /*
     * Resume position and Practice Mode ride the same document and debounce.
     * Each is marked dirty independently, so updating one never sends — and
     * therefore never overwrites — the other, or any draft entry.
     */
    setResume(next) {
      resumePatch = next ? { ...next, updatedAt: Number(next.updatedAt) || now() } : null;
      resumeDirty = true;
      dirtySinceFlush = true;
      schedule();
    },
    setPractice(next) {
      practicePatch = next && typeof next === 'object' ? next : null;
      practiceUpdatedAt = now();
      practiceDirty = true;
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
    snapshotPatch,
  };
};
