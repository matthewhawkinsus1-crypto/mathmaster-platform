import { auditDraftWrite } from './platform/persistence/draftSyncDiagnostics.js';
import { reportDraftSaveProblem, clearDraftSaveProblem, DRAFT_SAVE_PROBLEM } from './platform/persistence/draftSaveHealth.js';
import {
  fieldRecordDraftKind,
  fieldRecordGroups,
  freshToolWorkspaceEdits,
  isSyncableDraftKey,
  isToolWorkspaceDraftKey,
  adoptedFieldEditedAt,
  mergeFieldRecordCopies,
  mergeFreshToolWorkspace,
  resetTimeOf,
  stampFieldRecordEdits,
  toolWorkspaceFields,
} from '../functions/shared/workspaceDraftSchema.mjs';

const DRAFT_PREFIX = 'mathmaster:draft:v2:';
const RESUME_PREFIX = 'mathmaster:resume:v1:';
const MAX_DRAFT_AGE_MS = 1000 * 60 * 60 * 24 * 45;

const safeParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const storageAvailable = () => {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
};

const normalizeKeyPart = (value) => encodeURIComponent(String(value ?? ''));

/*
 * THE SEAM SERVER-BACKED DRAFTS HANG OFF.
 *
 * Every tool's workspace state already flows through writeQuestionDraft, so
 * one subscriber here reaches all of them — the expression box, the table
 * cells, the plotted points, the workflow stage — without touching a single
 * tool component.
 *
 * Subscribers are notified SYNCHRONOUSLY and must not do work: the student is
 * mid-keystroke. The sync layer's job here is to note the key and return.
 */
const draftSubscribers = new Set();

export const subscribeToQuestionDrafts = (listener) => {
  if (typeof listener !== 'function') return () => {};
  draftSubscribers.add(listener);
  return () => draftSubscribers.delete(listener);
};

const notifyDraftWritten = (key, value, savedAt, edit, savedAtIsEdit, fieldMarkers = null) => {
  draftSubscribers.forEach((listener) => {
    try {
      listener({ key, value, savedAt, edit, savedAtIsEdit, ...fieldMarkers });
    } catch (error) {
      // A failing sync listener must never cost the student their keystroke.
      console.warn('MathMaster could not queue a draft for background save:', error);
    }
  });
};

/*
 * ONLY A STUDENT'S EDIT MOVES A DRAFT FORWARD IN TIME (PQ-044).
 *
 * `savedAt` is what every copy of a draft is ordered by. The server keeps the
 * newer copy of each key; a restore writes the server's copy over this device's
 * only when it is newer; a draft older than the question's last submitted
 * attempt is history. It used to be stamped by EVERY write — and every
 * workspace writes its draft back the moment it mounts. So merely opening a
 * question made what it showed (on a Chromebook that had never seen this work:
 * empty boxes) the newest version of the student's work. The server copy then
 * on its way lost the restore to it, and the background save carried the
 * empty boxes up over the real work, for every device.
 *
 * So each write says whether it is the student's edit:
 *
 *   - an EDIT is stamped now, as every write used to be;
 *   - anything else — a workspace writing back what it just read, a tool
 *     reporting state it derived as it mounted — keeps the time of the edit
 *     the draft already carries, or 0 ("never edited") when it carries none.
 *     It never looks newer than real work, here or on the server, and the
 *     background save never sends it as new work (workspaceDraftSync.js).
 *
 * The VALUE is stored either way, so a reload, a question change or a reopened
 * browser on this device restores exactly what it always did.
 *
 * A copy whose time is an edit's says so: `savedAtIsEdit` in the envelope, set
 * by an edit here and by a restore of a server entry that carried the same
 * marker, kept by every write that is not an edit. It goes with the copy to
 * the server (workspaceDraftSchema.mjs, "the edit-time marker"). A copy an
 * older build wrote has no marker — its time may be an opening's — and neither
 * does one restored from such an entry.
 *
 * Who decides: a writer that knows passes `{ edit }` (the draft hooks do; see
 * useLocalDraftState, useUndoHistory, usePersistentToolState). Otherwise it is
 * inferred: an edit is a write made after the student touched the page — a
 * trusted keyboard, pointer or input event — since this page read that draft.
 * Opening a question reads its drafts and writes them back with no touch in
 * between. A read is therefore a promise to write back only what was read, and
 * every reader in the app is a workspace loading the draft it owns; anything
 * that only wants to LOOK at a draft must not use readQuestionDraft to do it.
 */
const STUDENT_INPUT_EVENTS = Object.freeze([
  'keydown', 'beforeinput', 'input', 'paste', 'cut', 'drop',
  'pointerdown', 'mousedown', 'touchstart', 'click', 'change',
]);
let studentInputCount = 0;
let studentInputTracked = false;

const noteStudentInput = (event) => {
  // The browser's own events only. A script's dispatchEvent — a tool
  // re-dispatching, a math field announcing a value it normalised — is not
  // the student.
  if (event?.isTrusted === true) studentInputCount += 1;
};

/**
 * Count the student's input on `target` (the window, by default, in the
 * capture phase so nothing can hide an event from it). Where input cannot be
 * observed at all, every write counts as an edit — exactly the old behaviour.
 */
export const trackStudentInput = (target = typeof window !== 'undefined' ? window : null) => {
  if (!target || typeof target.addEventListener !== 'function') return false;
  STUDENT_INPUT_EVENTS.forEach((type) => target.addEventListener(type, noteStudentInput, { capture: true, passive: true }));
  studentInputTracked = true;
  return true;
};

try {
  trackStudentInput();
} catch {
  // Untracked: every write is an edit, as before.
}

/** Where to measure "has the student touched the page since?" from. */
export const studentInputMark = () => studentInputCount;

/** Has the student touched the page since `mark`? Always yes where input is not observed. */
export const studentInputSince = (mark) => !studentInputTracked || studentInputCount > (Number(mark) || 0);

/*
 * What this page last saw of each draft: the edit time it read (or wrote), and
 * the student's input mark when it read it.
 */
const pageView = new Map();

// For a field-record draft (workspaceDraftSchema.mjs) the page also notes which
// answers it was shown, so a write never removes one it never saw.
const viewedGroups = (key, value) => {
  const kind = fieldRecordDraftKind(key);
  return kind ? new Set(fieldRecordGroups(kind, value).keys()) : null;
};

const notePageRead = (key, savedAt, value = undefined) => {
  pageView.set(key, { savedAt: Number(savedAt) || 0, input: studentInputCount, groups: viewedGroups(key, value) });
};

const forgetPageView = (matches) => {
  [...pageView.keys()].forEach((key) => { if (matches(key)) pageView.delete(key); });
};

/**
 * The student, assignment, question and variant a draft key belongs to.
 *
 * `buildQuestionDraftKey` joins with ':' onto a prefix that already ends in
 * ':', so the empty segment at index 3 is expected.
 */
export const parseQuestionDraftKey = (key) => {
  const parts = String(key || '').split(':');
  if (parts.length < 9 || `${parts[0]}:${parts[1]}:${parts[2]}:` !== DRAFT_PREFIX) return null;
  const questionIndex = Number(parts[6]);
  const variantIndex = Number(parts[7]);
  return {
    studentId: decodeURIComponent(parts[4] || ''),
    assignmentId: decodeURIComponent(parts[5] || ''),
    questionIndex: Number.isFinite(questionIndex) ? questionIndex : null,
    variantIndex: Number.isFinite(variantIndex) ? variantIndex : null,
    sessionBucket: decodeURIComponent(parts[8] || ''),
    toolSuffix: parts.slice(9).join(':'),
  };
};

export const buildQuestionDraftKey = ({
  studentId,
  assignmentId,
  questionIndex,
  variantIndex = 0,
  sessionMode = 'graded',
}) => {
  // Post-deadline Practice Mode gets its OWN bucket. Practising after the
  // deadline must never overwrite the graded workspace the student left behind,
  // and the two are restored independently.
  const sessionBucket = sessionMode === 'preview'
    ? 'preview'
    : sessionMode === 'post-deadline-practice' ? 'practice' : 'student';
  return [
    DRAFT_PREFIX,
    normalizeKeyPart(studentId || 'anonymous'),
    normalizeKeyPart(assignmentId || 'assignment'),
    normalizeKeyPart(questionIndex ?? 0),
    normalizeKeyPart(variantIndex),
    normalizeKeyPart(sessionBucket),
  ].join(':');
};

/*
 * `savedAt` is the time of the last edit; `touchedAt` the last time this
 * device wrote the draft at all. Expiry runs from whichever is later, so a
 * draft that is opened keeps living exactly as long as it used to (an envelope
 * from before `touchedAt` existed simply expires from its `savedAt`).
 */
export const readQuestionDraft = (key, fallback = null) => {
  if (!key) return fallback;
  if (!storageAvailable()) {
    notePageRead(key, 0);
    return fallback;
  }
  const parsed = safeParse(window.localStorage.getItem(key));
  if (!parsed || typeof parsed !== 'object') {
    notePageRead(key, 0);
    return fallback;
  }
  const savedAt = Number(parsed.savedAt || 0);
  const lastWritten = Math.max(savedAt, Number(parsed.touchedAt) || 0);
  if (lastWritten && Date.now() - lastWritten > MAX_DRAFT_AGE_MS) {
    window.localStorage.removeItem(key);
    notePageRead(key, 0);
    return fallback;
  }
  notePageRead(key, savedAt, parsed.value);
  return parsed.value ?? fallback;
};

const storedEnvelope = (key) => {
  if (!key || !storageAvailable()) return null;
  try {
    const parsed = safeParse(window.localStorage.getItem(key));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const storedSavedAt = (key) => Number(storedEnvelope(key)?.savedAt) || 0;

/**
 * Store a draft and offer it to the background save.
 *
 * `edit`: true when the student made this change, false when they did not
 * (a workspace writing back what it read). Leave it out to have it inferred
 * from the student's input since this page read the draft (see above).
 */
export const writeQuestionDraft = (key, value, { edit } = {}) => {
  if (!key) return false;
  const seen = pageView.get(key);
  const isEdit = typeof edit === 'boolean' ? edit : studentInputSince(seen ? seen.input : 0);
  const now = Date.now();
  let savedAt = now;
  let savedAtIsEdit = true;
  const fieldKind = fieldRecordDraftKind(key);
  const stored = (!isEdit || fieldKind) ? storedEnvelope(key) : null;
  if (!isEdit) {
    const storedAt = Number(stored?.savedAt) || 0;
    // Something else wrote this draft after this page last saw it — a newer
    // copy restored from the server, this student's edit in another tab. The
    // page's own copy is the older one, and a write that is not an edit must
    // not put it back. (The page catches up when it next reads: a restore
    // remounts the question.)
    if (seen && storedAt !== seen.savedAt) return false;
    savedAt = storedAt;
    savedAtIsEdit = storedAt > 0 && stored?.savedAtIsEdit === true;
  }
  /*
   * A FIELD-RECORD DRAFT DATES EACH ANSWER (workspaceDraftSchema.mjs).
   *
   * An edit dates the answers it changed; anything else dates nothing. An
   * answer this device holds but the page never saw — merged in behind it by
   * a settle that has not remounted the question yet — is kept, not removed.
   * A draft begun with no copy of any kind here is fresh until the server's
   * copy has been read (reconcileFieldRecordDrafts).
   */
  let written = value;
  let fieldMarkers = null;
  if (fieldKind) {
    const storedValue = stored?.value;
    if (seen?.groups && value && typeof value === 'object' && !Array.isArray(value)
      && storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue)) {
      const incoming = fieldRecordGroups(fieldKind, value);
      const unseen = [];
      fieldRecordGroups(fieldKind, storedValue).forEach((entry, group) => {
        if (incoming.has(group) || seen.groups.has(group)) return;
        entry.fields.forEach((field) => unseen.push(field));
      });
      if (unseen.length) {
        // Own properties only: a field id may be "__proto__" (workspaceDraftSchema.mjs).
        written = { ...value };
        unseen.forEach((field) => Object.defineProperty(written, field, { value: storedValue[field], enumerable: true, writable: true, configurable: true }));
      }
    }
    // Start over (a tombstone written as an edit) dates nothing and records
    // when it happened; anything written later carries that reset forward, so
    // no merge brings back an answer dated before it.
    const resetting = written === null && isEdit;
    const resetAt = resetting ? now : resetTimeOf(stored);
    const fieldEditedAt = resetting ? {} : stampFieldRecordEdits({
      kind: fieldKind,
      previous: storedValue,
      // A copy an older build stored has no per-answer times: its answers are
      // dated at its edit time, not left as never edited.
      previousEditedAt: stored ? adoptedFieldEditedAt(fieldKind, stored) : null,
      next: written,
      edit: isEdit,
      now,
    });
    // Fresh means "not yet settled against the server's copy": a draft begun
    // after this page read that copy (reconcileFieldRecordDrafts) has seen it.
    const fieldsFresh = stored === null ? !serverCopySeen(key) : stored.fieldsFresh === true;
    fieldMarkers = { fieldEditedAt, ...(fieldsFresh ? { fieldsFresh: true } : {}), ...(resetAt ? { resetAt } : {}) };
  }
  // The answers the PAGE holds — not the ones kept for it from behind its back,
  // which it has still not seen: its next write-back keeps them again.
  pageView.set(key, { savedAt, input: seen ? seen.input : 0, groups: fieldKind ? viewedGroups(key, value) : null });
  // Development only: name the field that would stop the server backup at the
  // keystroke that introduced it, whether or not a signed-in sync is running.
  // A no-op in production, where the sync reports what it refuses.
  auditDraftWrite(key, written);
  // The background save is offered even when local storage is unavailable —
  // a district policy that blocks site data is exactly the case where the
  // server copy is the only copy the student will get back.
  notifyDraftWritten(key, written, savedAt, isEdit, savedAtIsEdit, fieldMarkers);
  if (!storageAvailable()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify({
      version: 2,
      savedAt,
      value: written,
      touchedAt: now,
      ...(savedAtIsEdit ? { savedAtIsEdit: true } : {}),
      ...fieldMarkers,
    }));
    clearDraftSaveProblem(DRAFT_SAVE_PROBLEM.DEVICE_FULL, key);
    return true;
  } catch (error) {
    // Storage full (or refused by policy mid-session). The background save
    // above still carries the work while the student is online; what the
    // student must hear is that this device does not hold it (App.jsx).
    console.warn('MathMaster could not save local question work:', error);
    reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.DEVICE_FULL, key);
    return false;
  }
};

/** When the student last edited that draft (as this device knows it), or 0. */
export const questionDraftSavedAt = (key) => storedSavedAt(key);

/**
 * Does this device hold any copy of that draft — work, or a reset's
 * tombstone? Read-only: unlike readQuestionDraft it is no promise to write.
 */
export const questionDraftExists = (key) => storedEnvelope(key) !== null;

/*
 * HOW A CACHE KNOWS THE SERVER OVERWROTE IT.
 *
 * `restoreQuestionDrafts` writes straight into local storage, behind the back
 * of anything holding a parsed copy. A holder that compares this counter
 * against the value it last saw knows its copy is history without re-parsing
 * every key on every read. Bumped once per restore pass, not per entry.
 */
let restoreGeneration = 0;

export const questionDraftRestoreGeneration = () => restoreGeneration;

/**
 * Write server-held drafts back into this device, newest wins.
 *
 * The server's answer usually arrives after the question has mounted. Its
 * workspaces have already read their (older, or empty) drafts and written them
 * back — as what they are, not edits, so those writes never outrank the copy
 * arriving here (see writeQuestionDraft). App then remounts the question
 * (`workspaceDraftGeneration`), and every workspace reads what was restored,
 * exactly as if the student had never left.
 */
export const restoreQuestionDrafts = (entries = []) => {
  if (!storageAvailable()) return 0;
  let restored = 0;
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const key = String(entry?.key || '');
    const savedAt = Number(entry?.savedAt) || 0;
    if (!key || !savedAt || savedAt <= questionDraftSavedAt(key)) return;
    // A tool workspace restored from the server is the server's copy, and so
    // is never "started from nothing" here, whatever it carried there.
    const value = isToolWorkspaceDraftKey(key) ? toolWorkspaceFields(entry.value) : entry.value;
    // Nor is a field-record draft, which keeps the server's per-answer times
    // (dated at the entry's edit time when an older build saved it) and the
    // latest reset it knew of.
    const fieldKind = fieldRecordDraftKind(key);
    const fieldEditedAt = fieldKind ? adoptedFieldEditedAt(fieldKind, entry) : null;
    const resetAt = fieldKind ? resetTimeOf(entry) : 0;
    try {
      // The server entry's edit-time marker comes with it (see writeQuestionDraft).
      window.localStorage.setItem(key, JSON.stringify({
        version: 2,
        savedAt,
        value,
        ...(entry.savedAtIsEdit === true ? { savedAtIsEdit: true } : {}),
        ...(fieldEditedAt ? { fieldEditedAt } : {}),
        ...(resetAt ? { resetAt } : {}),
      }));
      restored += 1;
    } catch {
      // Out of quota: the student keeps whatever this device already had.
    }
  });
  if (restored) restoreGeneration += 1;
  return restored;
};

/*
 * A SERVER ENTRY OLDER THAN THE QUESTION'S LAST SUBMITTED ATTEMPT IS HISTORY.
 *
 * `selectRestorableDraftEntries` already refuses to restore one. The settles
 * below merge rather than restore, and used to take every entry: a fresh
 * device's edit then pulled the fields of an older attempt into the new one,
 * under the edit's newer time, where no later guard could tell them apart
 * (PR #458 review). They read only what is newer than the question's last
 * submission (`canonicalSavedAt(entry)`, as for the restore).
 */
const currentServerEntries = (entries, canonicalSavedAt) => new Map((Array.isArray(entries) ? entries : [])
  .filter((entry) => {
    const savedAt = Number(entry?.savedAt) || 0;
    let canonical = 0;
    try { canonical = Number(typeof canonicalSavedAt === 'function' ? canonicalSavedAt(entry) : 0) || 0; } catch { canonical = 0; }
    return !(canonical > 0 && savedAt <= canonical);
  })
  .map((entry) => [String(entry?.key || ''), entry]));

/**
 * Settle every tool workspace this device started from nothing against the
 * server's copy of the same draft, once that copy has been read.
 *
 * Such a record carries `__fresh`, the fields its student edited
 * (usePersistentToolState.js). Where the server holds a record for the key:
 *   - a newer edit there wins the fields both copies hold, and this device
 *     keeps any field only it set — the newer copy's time comes with it;
 *   - otherwise this device's edited fields, and any field only it holds, are
 *     laid over the server's copy, and this device keeps its own time.
 * Where the server holds nothing, or a reset, there is nothing to merge. In
 * every case the marker goes: this device has now seen the server's copy.
 *
 * Without this, a Chromebook whose student touched the question before the
 * read landed went on showing only that touch, and its next save carried the
 * partial record as the newest copy of the whole workspace. Returns how many
 * records were settled; the caller remounts the question when it is not 0,
 * as for restoreQuestionDrafts.
 */
export const reconcileToolWorkspaceDrafts = (entries = [], { studentId, assignmentId, canonicalSavedAt = () => 0 } = {}) => {
  if (!storageAvailable() || !studentId || !assignmentId) return 0;
  const prefix = `${DRAFT_PREFIX}:${normalizeKeyPart(studentId)}:${normalizeKeyPart(assignmentId)}:`;
  const server = currentServerEntries(entries, canonicalSavedAt);
  const keys = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix) && isToolWorkspaceDraftKey(key) && isSyncableDraftKey(key)) keys.push(key);
    }
  } catch {
    return 0;
  }
  let settled = 0;
  keys.forEach((key) => {
    const envelope = storedEnvelope(key);
    if (!envelope || !freshToolWorkspaceEdits(envelope.value)) return;
    const entry = server.get(key);
    const serverValue = entry?.value;
    const isRecord = Boolean(serverValue) && typeof serverValue === 'object' && !Array.isArray(serverValue);
    const localSavedAt = Number(envelope.savedAt) || 0;
    const serverSavedAt = Number(entry?.savedAt) || 0;
    let next = { ...envelope, value: toolWorkspaceFields(envelope.value) };
    if (isRecord && entry.savedAtIsEdit === true && serverSavedAt > localSavedAt) {
      next = { ...next, savedAt: serverSavedAt, savedAtIsEdit: true, value: { ...next.value, ...toolWorkspaceFields(serverValue) } };
    } else if (isRecord) {
      next = { ...next, value: mergeFreshToolWorkspace(serverValue, envelope.value) };
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
      settled += 1;
    } catch {
      // Out of quota: the record stays fresh here, and the server merge still
      // keeps the server's copy whole.
    }
  });
  if (settled) restoreGeneration += 1;
  return settled;
};

/*
 * Which assignments' server copies this page has read (by draft-key prefix).
 * A draft begun after that read is not fresh: there is nothing left to settle.
 */
const serverCopiesSeen = new Set();
const assignmentDraftPrefix = (studentId, assignmentId) => `${DRAFT_PREFIX}:${normalizeKeyPart(studentId)}:${normalizeKeyPart(assignmentId)}:`;
const serverCopySeen = (key) => [...serverCopiesSeen].some((prefix) => String(key).startsWith(prefix));

/**
 * Settle every multi-answer, Step Algebra and composed-step draft this device
 * holds against the server's copy of the same draft, answer by answer
 * (mergeFieldRecordCopies, workspaceDraftSchema.mjs), once that copy has been
 * read.
 *
 * Whole-copy restore (restoreQuestionDrafts) takes the server's copy only
 * when it is newer, and keeps this device's otherwise — so a fresh
 * Chromebook whose student touched one box before the read landed kept that
 * one box over every saved answer, and two devices editing different steps
 * each kept only their own. Here every answer goes to the copy that edited it
 * last; a field only one copy holds is kept. Entries older than the
 * question's last submitted attempt are left out (`canonicalSavedAt`), and a
 * draft this device does not hold at all is left to restoreQuestionDrafts.
 *
 * Returns `{ settled, keys }`: how many drafts changed here (the caller
 * remounts the question when it is not 0) and every key settled here, which
 * the caller must not then restore whole. Fresh markers go either way: this
 * device has now seen the server's copy.
 */
export const reconcileFieldRecordDrafts = (entries = [], { studentId, assignmentId, canonicalSavedAt = () => 0 } = {}) => {
  const keys = new Set();
  if (!studentId || !assignmentId) return { settled: 0, keys };
  const prefix = assignmentDraftPrefix(studentId, assignmentId);
  serverCopiesSeen.add(prefix);
  if (!storageAvailable()) return { settled: 0, keys };
  const server = currentServerEntries(entries, canonicalSavedAt);
  const local = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix) && fieldRecordDraftKind(key) && isSyncableDraftKey(key)) local.push(key);
    }
  } catch {
    return { settled: 0, keys };
  }
  let settled = 0;
  local.forEach((key) => {
    const envelope = storedEnvelope(key);
    if (!envelope) return;
    const entry = server.get(key);
    const fresh = envelope.fieldsFresh === true;
    if (!entry) {
      if (!fresh) return;
      // Nothing on the server to settle against: just no longer fresh.
      const { fieldsFresh: _fresh, ...seenEnvelope } = envelope;
      try { window.localStorage.setItem(key, JSON.stringify(seenEnvelope)); } catch { /* stays fresh */ }
      return;
    }
    const kind = fieldRecordDraftKind(key);
    // The later of this device's grade record and the submission the server
    // entry was saved after: a submission made on another device may not have
    // reached this one's records yet.
    let canonicalAt = Math.max(0, Number(entry?.canonicalAt) || 0);
    try { canonicalAt = Math.max(canonicalAt, Number(typeof canonicalSavedAt === 'function' ? canonicalSavedAt(entry) : 0) || 0); } catch { /* the entry's own */ }
    const merged = mergeFieldRecordCopies({
      kind,
      // This device's copy, with its answers dated even if an older build wrote it.
      a: { ...envelope, fieldEditedAt: adoptedFieldEditedAt(kind, envelope) },
      b: entry,
      prefer: 'a',
      // A copy from before the question's last submission and one from after
      // it are not merged answer by answer: the restore decides, whole.
      canonicalAt,
    });
    if (!merged) {
      if (!fresh) return;
      // Copies this rule cannot merge (a value an older build stored): the
      // ordinary restore decides, and the marker goes.
      const { fieldsFresh: _fresh, ...seenEnvelope } = envelope;
      try { window.localStorage.setItem(key, JSON.stringify(seenEnvelope)); } catch { /* stays fresh */ }
      return;
    }
    keys.add(key);
    const changed = JSON.stringify(merged.value) !== JSON.stringify(envelope.value);
    const next = {
      version: 2,
      savedAt: merged.savedAt,
      value: merged.value,
      ...(envelope.touchedAt ? { touchedAt: envelope.touchedAt } : {}),
      ...(merged.savedAtIsEdit ? { savedAtIsEdit: true } : {}),
      fieldEditedAt: merged.fieldEditedAt,
      ...(merged.resetAt ? { resetAt: merged.resetAt } : {}),
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
      if (changed) settled += 1;
      // Unchanged answers need no remount, and the page already shows them:
      // it is caught up with this copy's time, so its write-backs still count.
      else if (pageView.has(key)) pageView.set(key, { ...pageView.get(key), savedAt: merged.savedAt });
    } catch {
      // Out of quota: this device keeps its own copy, and the server merge
      // still keeps every answer there.
      keys.delete(key);
    }
  });
  if (settled) restoreGeneration += 1;
  return { settled, keys };
};

export const removeQuestionDraft = (key) => {
  if (!key) return;
  pageView.delete(key);
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Local draft removal is best-effort only.
  }
};


/**
 * Every stored draft in one question's family (`prefix` and `prefix:*`), as
 * the entries `restoreQuestionDrafts` accepts. A secure item uses it to send
 * its tool's own drafts with the server copy, so the construction reopens on
 * another device exactly as it was left. Read-only: nothing is touched.
 */
export const readQuestionDraftFamily = (prefix) => {
  if (!prefix || !storageAvailable()) return [];
  const entries = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key !== prefix && !key?.startsWith(`${prefix}:`)) continue;
      const parsed = storedEnvelope(key);
      if (!parsed || parsed.value === undefined) continue;
      entries.push({
        key,
        value: parsed.value,
        savedAt: Number(parsed.savedAt) || 0,
        ...(parsed.savedAtIsEdit === true ? { savedAtIsEdit: true } : {}),
        ...(parsed.fieldEditedAt ? { fieldEditedAt: parsed.fieldEditedAt } : {}),
        ...(parsed.resetAt ? { resetAt: parsed.resetAt } : {}),
      });
    }
  } catch {
    // Storage that cannot be enumerated has nothing to send.
  }
  return entries;
};

export const removeQuestionDraftFamily = (prefix) => {
  if (!prefix) return;
  forgetPageView((key) => key === prefix || key.startsWith(`${prefix}:`));
  if (!storageAvailable()) return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key === prefix || key?.startsWith(`${prefix}:`)) window.localStorage.removeItem(key);
    }
  } catch {
    // Best-effort cleanup only.
  }
};

/**
 * Reset one question's entire draft family back to authored defaults.
 *
 * A plain localStorage deletion is not enough for student work: the server
 * backup can restore that older draft on the next device/session. Writing null
 * through the normal draft channel creates a newer tombstone for every draft
 * key this device knows about, so the background workspace sync retires the
 * same saved work remotely while readQuestionDraft treats null as "use the
 * authored fallback".
 *
 * The base key is always tombstoned too. Child keys include Step Algebra,
 * linear-intercepts, registry-tool workspaces, and any future nested workspace
 * that follows the question draft-key contract.
 */
export const resetQuestionDraftFamily = (prefix) => {
  if (!prefix) return 0;
  const keys = new Set([prefix]);

  if (storageAvailable()) {
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key === prefix || key?.startsWith(`${prefix}:`)) keys.add(key);
      }
    } catch {
      // The base-key tombstone still gives the sync layer a reset signal even
      // when browser storage cannot be enumerated.
    }
  }

  // The student (or teacher) asked for this: the reset is the newest thing
  // that happened to every one of these drafts, wherever they were last edited.
  keys.forEach((key) => writeQuestionDraft(key, null, { edit: true }));
  return keys.size;
};

/*
 * A DRAFT THAT BREAKS ITS QUESTION IS SET ASIDE, NOT DELETED.
 *
 * When a question's module throws while rendering what was saved, the student
 * needs the question back and support needs to see what broke it. Quarantine
 * does both: every draft in the question's family is copied, envelope and all,
 * under `QUARANTINE_PREFIX`, and then the family is reset exactly as Start over
 * resets it — tombstones through the normal channel, so the server backup does
 * not bring the broken draft back on the next device either.
 *
 * Bounded (the newest QUARANTINE_LIMIT copies), and local only: a quarantined
 * draft is diagnostic material, never restored automatically and never sent.
 */
const QUARANTINE_PREFIX = 'mathmaster:draft-quarantine:v1:';
const QUARANTINE_LIMIT = 20;

const quarantineKeys = () => {
  const keys = [];
  if (!storageAvailable()) return keys;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(QUARANTINE_PREFIX)) keys.push(key);
    }
  } catch {
    // Enumeration is best-effort.
  }
  return keys;
};

export const quarantineQuestionDraftFamily = (prefix, { reason = 'unusable-draft' } = {}) => {
  if (!prefix) return 0;
  const quarantinedAt = Date.now();
  let copied = 0;
  if (storageAvailable()) {
    try {
      // Collected first: writing the copies while walking by index would
      // reorder the very keys being walked.
      const family = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key === prefix || key?.startsWith(`${prefix}:`)) family.push(key);
      }
      for (const key of family) {
        const raw = window.localStorage.getItem(key);
        if (raw === null) continue;
        window.localStorage.setItem(`${QUARANTINE_PREFIX}${quarantinedAt}:${key}`, JSON.stringify({
          key, reason: String(reason), quarantinedAt, raw,
        }));
        copied += 1;
      }
      const stored = quarantineKeys()
        .map((key) => ({ key, at: Number(key.slice(QUARANTINE_PREFIX.length).split(':')[0]) || 0 }))
        .sort((left, right) => right.at - left.at);
      stored.slice(QUARANTINE_LIMIT).forEach(({ key }) => window.localStorage.removeItem(key));
    } catch {
      // Out of quota: the reset below still gives the student the question back.
    }
  }
  resetQuestionDraftFamily(prefix);
  return copied;
};

/** The copies quarantine kept for one question family (or all), newest first. */
export const readQuarantinedDrafts = (prefix = null) => quarantineKeys()
  .map((storageKey) => safeParse(window.localStorage.getItem(storageKey)))
  .filter((entry) => entry && typeof entry === 'object' && typeof entry.key === 'string')
  .filter((entry) => !prefix || entry.key === prefix || entry.key.startsWith(`${prefix}:`))
  .map((entry) => ({ key: entry.key, reason: entry.reason, quarantinedAt: entry.quarantinedAt, envelope: safeParse(entry.raw) }))
  .sort((left, right) => (right.quarantinedAt || 0) - (left.quarantinedAt || 0));

/** The envelope version of a stored draft, for diagnostics: a number, 'none' or 'unreadable'. */
export const questionDraftEnvelopeVersion = (key) => {
  if (!key || !storageAvailable()) return 'none';
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return 'none';
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.version !== undefined ? parsed.version : 'unreadable';
  } catch {
    return 'unreadable';
  }
};

export const removeAssignmentDrafts = ({ studentId, assignmentId }) => {
  const studentPart = normalizeKeyPart(studentId || 'anonymous');
  const assignmentPart = normalizeKeyPart(assignmentId || 'assignment');
  const prefix = `${DRAFT_PREFIX}:${studentPart}:${assignmentPart}:`;
  forgetPageView((key) => key.startsWith(prefix));
  if (!storageAvailable()) return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    // Best-effort cleanup only.
  }
};

const resumeKey = (studentId) => `${RESUME_PREFIX}${normalizeKeyPart(studentId || 'anonymous')}`;

export const saveResumeAction = (studentId, action) => {
  if (!studentId || !storageAvailable()) return false;
  try {
    window.localStorage.setItem(
      resumeKey(studentId),
      JSON.stringify({
        ...action,
        savedAt: Date.now(),
      }),
    );
    return true;
  } catch (error) {
    console.warn('MathMaster could not save the resume action:', error);
    return false;
  }
};

export const readResumeAction = (studentId) => {
  if (!studentId || !storageAvailable()) return null;
  const parsed = safeParse(window.localStorage.getItem(resumeKey(studentId)));
  if (!parsed || typeof parsed !== 'object') return null;
  if (Date.now() - Number(parsed.savedAt || 0) > MAX_DRAFT_AGE_MS) {
    window.localStorage.removeItem(resumeKey(studentId));
    return null;
  }
  return parsed;
};

export const clearResumeAction = (studentId) => {
  if (!studentId || !storageAvailable()) return;
  try {
    window.localStorage.removeItem(resumeKey(studentId));
  } catch {
    // Best-effort only.
  }
};

export const buildPracticeTrackerKey = (studentId, assignmentId) =>
  `mathmaster:practice-tracker:v1:${normalizeKeyPart(studentId || 'anonymous')}:${normalizeKeyPart(assignmentId || 'assignment')}`;
