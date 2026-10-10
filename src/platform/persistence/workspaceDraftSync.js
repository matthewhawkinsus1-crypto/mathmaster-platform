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
  explainWorkspaceDraftRejection,
  isSyncableDraftKey,
  sanitizeWorkspaceDraftValue,
} from '../../../functions/shared/workspaceDraftSchema.mjs';
import { parseQuestionDraftKey } from '../../questionDraftStorage.js';
import { reportDraftSyncRejection } from './draftSyncDiagnostics.js';
import { projectDraftForServer } from './serverDraftProjection.js';

export const WORKSPACE_DRAFT_DEBOUNCE_MS = 2500;

/*
 * How long a page must have been out of sight before coming back to it reads
 * the server copy again (App.jsx): long enough to have picked up another
 * Chromebook and worked on this assignment there, short enough to catch a lid
 * closed between periods. A quick tab switch to look something up costs no read.
 */
export const WORKSPACE_DRAFT_REREAD_AFTER_HIDDEN_MS = 15_000;

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
  // `rejected` counts drafts the guard refused, by reason. They are also
  // `skipped`; the separate tally is what tells a refused record (a tool bug
  // that stops server backup) from an out-of-scope key (expected).
  const stats = { recorded: 0, skipped: 0, flushes: 0, failures: 0, rejected: {}, unedited: 0 };

  /*
   * WHAT THE SERVER HOLDS, AS FAR AS THIS DEVICE KNOWS (PQ-044).
   *
   * Per key, the newest `savedAt` seen there: from the assignment's read
   * (`noteServerCopy`) and from every save this device has made since. Until
   * that read has come back, nothing is known — and a draft that is not the
   * student's edit (see `record`) waits for it in `held`.
   */
  const serverSavedAt = new Map();
  let serverKnown = false;
  const held = new Map();
  const noteServerSavedAt = (key, savedAt) => {
    const at = Number(savedAt) || 0;
    if (key && at > (serverSavedAt.get(key) || 0)) serverSavedAt.set(key, at);
  };

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
          noteServerSavedAt(key, savedAt);
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

  /** Called synchronously from the draft write. Must stay cheap. */
  const record = ({ key, value, savedAt, edit, savedAtIsEdit } = {}) => {
    if (stopped) return false;
    const identity = parseQuestionDraftKey(key);
    if (!identity || !['student', 'practice'].includes(identity.sessionBucket)) { stats.skipped += 1; return false; }
    if (identity.studentId !== String(studentId) || identity.assignmentId !== String(assignmentId)) { stats.skipped += 1; return false; }
    if (!isSyncableDraftKey(key)) { stats.skipped += 1; return false; }
    /*
     * NOT THE STUDENT'S EDIT (questionDraftStorage.js): a workspace writing
     * back what it read as it mounted, a tool reporting what it derived. It
     * carries the time of the last real edit — 0 if there never was one, and
     * then there is nothing to back up — and it is sent only to give the
     * server an edit it does not have yet (one made offline, or just before
     * the page closed). Whether the server has it is only known once the
     * assignment's read has come back; until then it waits. It never replaces
     * what the server holds at the same time, so a derived copy cannot
     * overwrite the work it was derived from.
     */
    let stamp = Number(savedAt) || 0;
    // The edit-time marker (workspaceDraftSchema.mjs): an edit's time is one;
    // a copy offered again carries whatever its envelope says — a copy an
    // older build dated may carry an opening's time, and goes unmarked.
    const marked = edit === false ? savedAtIsEdit === true : true;
    if (edit === false) {
      if (stamp <= 0) { stats.unedited += 1; return false; }
      if ((pending.get(key)?.savedAt ?? 0) >= stamp) return false;
      if (!serverKnown) { held.set(key, { key, value, savedAt: stamp, savedAtIsEdit: marked }); return false; }
      if (stamp <= (serverSavedAt.get(key) || 0)) return false;
    } else {
      held.delete(key);
      if (!stamp) stamp = now();
    }
    // What the server may hold of this draft (serverDraftProjection.js):
    // the draft itself, except where the device's copy keeps a verdict the
    // student-readable server copy must not. The guard below judges exactly
    // what would be sent.
    const serverValue = projectDraftForServer(key, value);
    if (!sanitizeWorkspaceDraftValue(serverValue).ok) {
      // Refused by the guard, which stays exactly as strict. What changes is
      // that someone hears about it: the path and reason go to the console
      // once (see draftSyncDiagnostics.js). The student is told nothing —
      // their local draft is still durable.
      const explanation = explainWorkspaceDraftRejection(serverValue);
      stats.skipped += 1;
      stats.rejected[explanation.reason] = (stats.rejected[explanation.reason] || 0) + 1;
      reportDraftSyncRejection({ key, explanation, source: 'sync' });
      return false;
    }
    pending.set(key, {
      key,
      value: serverValue,
      savedAt: stamp,
      questionIndex: identity.questionIndex,
      variantIndex: identity.variantIndex,
      ...(marked ? { savedAtIsEdit: true } : {}),
    });
    stats.recorded += 1;
    dirtySinceFlush = true;
    schedule();
    return true;
  };

  function flushNow() {
    if (handle !== null) { timers.clear(handle); handle = null; }
    return runFlush();
  }

  return {
    record,
    /**
     * The assignment's server copy has been read (its entries, as
     * readWorkspaceDraftEntries decodes them; none when there is no document).
     * From now on this device knows what the server holds, and the drafts that
     * were waiting to learn it are sent if — and only if — the server lacks them.
     */
    noteServerCopy(entries = []) {
      if (stopped) return;
      (Array.isArray(entries) ? entries : []).forEach((entry) => noteServerSavedAt(String(entry?.key || ''), entry?.savedAt));
      serverKnown = true;
      const waiting = [...held.values()];
      held.clear();
      waiting.forEach((entry) => record({ ...entry, edit: false }));
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
    flushNow,
    stop() {
      if (stopped) return;
      if (handle !== null) { timers.clear(handle); handle = null; }
      // Edits made while a save was already on its way are still pending:
      // flushNow hands back that save, and a stopped sync schedules nothing
      // after it, so they never left this device — and a tool workspace does
      // not offer its draft again when it next opens. They go once it lands,
      // in one last save, and then nothing more.
      if (inFlight && dirtySinceFlush) {
        inFlight.finally(() => {
          flushNow();
          stopped = true;
        });
        return;
      }
      stopped = true;
    },
    pendingKeys: () => [...pending.keys()],
    stats: () => ({ ...stats, rejected: { ...stats.rejected } }),
    snapshotPatch,
  };
};
