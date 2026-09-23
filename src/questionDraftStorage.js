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

const notifyDraftWritten = (key, value, savedAt) => {
  draftSubscribers.forEach((listener) => {
    try {
      listener({ key, value, savedAt });
    } catch (error) {
      // A failing sync listener must never cost the student their keystroke.
      console.warn('MathMaster could not queue a draft for background save:', error);
    }
  });
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

export const readQuestionDraft = (key, fallback = null) => {
  if (!key || !storageAvailable()) return fallback;
  const parsed = safeParse(window.localStorage.getItem(key));
  if (!parsed || typeof parsed !== 'object') return fallback;
  const savedAt = Number(parsed.savedAt || 0);
  if (savedAt && Date.now() - savedAt > MAX_DRAFT_AGE_MS) {
    window.localStorage.removeItem(key);
    return fallback;
  }
  return parsed.value ?? fallback;
};

export const writeQuestionDraft = (key, value) => {
  if (!key) return false;
  const savedAt = Date.now();
  // The background save is offered even when local storage is unavailable —
  // a district policy that blocks site data is exactly the case where the
  // server copy is the only copy the student will get back.
  notifyDraftWritten(key, value, savedAt);
  if (!storageAvailable()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify({ version: 2, savedAt, value }));
    return true;
  } catch (error) {
    console.warn('MathMaster could not save local question work:', error);
    return false;
  }
};

/** When this device last saved that draft, or 0 if it never did. */
export const questionDraftSavedAt = (key) => {
  if (!key || !storageAvailable()) return 0;
  const parsed = safeParse(window.localStorage.getItem(key));
  return Number(parsed?.savedAt) || 0;
};

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
 * Called before the assignment renders, so useLocalDraftState and
 * useUndoHistory pick the restored value up on their first read exactly as if
 * the student had never left.
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
  if (!key || !storageAvailable()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Local draft removal is best-effort only.
  }
};


export const removeQuestionDraftFamily = (prefix) => {
  if (!prefix || !storageAvailable()) return;
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

  keys.forEach((key) => writeQuestionDraft(key, null));
  return keys.size;
};

export const removeAssignmentDrafts = ({ studentId, assignmentId }) => {
  if (!storageAvailable()) return;
  const studentPart = normalizeKeyPart(studentId || 'anonymous');
  const assignmentPart = normalizeKeyPart(assignmentId || 'assignment');
  const prefix = `${DRAFT_PREFIX}:${studentPart}:${assignmentPart}:`;
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
