import { auditDraftWrite } from './platform/persistence/draftSyncDiagnostics.js';

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

const notifyDraftWritten = (key, value, savedAt, edit) => {
  draftSubscribers.forEach((listener) => {
    try {
      listener({ key, value, savedAt, edit });
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

const notePageRead = (key, savedAt) => {
  pageView.set(key, { savedAt: Number(savedAt) || 0, input: studentInputCount });
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
  notePageRead(key, savedAt);
  return parsed.value ?? fallback;
};

const storedSavedAt = (key) => {
  if (!key || !storageAvailable()) return 0;
  try {
    return Number(safeParse(window.localStorage.getItem(key))?.savedAt) || 0;
  } catch {
    return 0;
  }
};

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
  if (!isEdit) {
    const stored = storedSavedAt(key);
    // Something else wrote this draft after this page last saw it — a newer
    // copy restored from the server, this student's edit in another tab. The
    // page's own copy is the older one, and a write that is not an edit must
    // not put it back. (The page catches up when it next reads: a restore
    // remounts the question.)
    if (seen && stored !== seen.savedAt) return false;
    savedAt = stored;
  }
  pageView.set(key, { savedAt, input: seen ? seen.input : 0 });
  // Development only: name the field that would stop the server backup at the
  // keystroke that introduced it, whether or not a signed-in sync is running.
  // A no-op in production, where the sync reports what it refuses.
  auditDraftWrite(key, value);
  // The background save is offered even when local storage is unavailable —
  // a district policy that blocks site data is exactly the case where the
  // server copy is the only copy the student will get back.
  notifyDraftWritten(key, value, savedAt, isEdit);
  if (!storageAvailable()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify({ version: 2, savedAt, value, touchedAt: now }));
    return true;
  } catch (error) {
    console.warn('MathMaster could not save local question work:', error);
    return false;
  }
};

/** When the student last edited that draft (as this device knows it), or 0. */
export const questionDraftSavedAt = (key) => storedSavedAt(key);

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
    try {
      window.localStorage.setItem(key, JSON.stringify({ version: 2, savedAt, value: entry.value }));
      restored += 1;
    } catch {
      // Out of quota: the student keeps whatever this device already had.
    }
  });
  if (restored) restoreGeneration += 1;
  return restored;
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
