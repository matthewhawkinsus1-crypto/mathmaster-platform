/*
 * UNFINISHED STUDENT WORK THAT SURVIVES THE DEVICE.
 *
 * A working draft is the state of a student's workspace: the expression in the
 * box, the cells they filled in, the points they plotted, the stage of the
 * workflow they reached. It is NOT an attempt, a grade, evidence, mastery or
 * anything Google Classroom hears about. It exists so that a Chromebook that
 * gets turned off — or swapped for a different one — does not cost a student
 * the work they had done.
 *
 * Because it is student-written and student-read, it may never contain
 * anything that would give a student the answer or let them forge a result:
 * no answer keys, no expected values, no grading definitions, no generator
 * seeds, and nothing from a secure Test Cycle or a private Path session.
 */

export const WORKSPACE_DRAFT_SCHEMA_VERSION = 1;

/** One document per student per assignment: one read on open, one write per flush. */
export const workspaceDraftDocumentId = ({ studentId, assignmentId } = {}) => (
  [studentId, assignmentId].map((part) => encodeURIComponent(String(part ?? ''))).join('__')
);

export const MAX_WORKSPACE_DRAFT_ENTRIES = 120;
export const MAX_WORKSPACE_DRAFT_VALUE_BYTES = 16_000;
export const MAX_WORKSPACE_DOCUMENT_BYTES = 400_000;

/*
 * Keys that would turn a draft into a cheat sheet or a forged result.
 *
 * A tool's own draft is the student's work, so in practice these never appear.
 * The check exists because a tool can be changed later, and a draft that
 * started carrying `acceptedAnswers` would hand every student the key through
 * a document they are allowed to read.
 */
export const FORBIDDEN_DRAFT_KEYS = Object.freeze([
  'answerKey',
  'answerFields',
  'acceptedAnswers',
  'accepted',
  'expectedAnswer',
  'correctAnswer',
  'responseFields',
  'grading',
  'gradingContract',
  'solution',
  'seed',
  'isCorrect',
  'score',
  'partGrades',
]);

const containsForbiddenKey = (value, depth = 0) => {
  if (depth > 8 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => containsForbiddenKey(entry, depth + 1));
  return Object.entries(value).some(([key, nested]) => (
    FORBIDDEN_DRAFT_KEYS.includes(key) || containsForbiddenKey(nested, depth + 1)
  ));
};

/**
 * May this draft value be stored on the server?
 *
 * Fails closed and says why, so an excluded tool is visible in the
 * compatibility matrix instead of silently not syncing.
 */
export const sanitizeWorkspaceDraftValue = (value) => {
  if (value === undefined) return { ok: false, reason: 'undefined-value' };
  if (containsForbiddenKey(value)) return { ok: false, reason: 'forbidden-key' };
  let json;
  try {
    json = JSON.stringify(value ?? null);
  } catch {
    return { ok: false, reason: 'not-serializable' };
  }
  if (typeof json !== 'string') return { ok: false, reason: 'not-serializable' };
  if (json.length > MAX_WORKSPACE_DRAFT_VALUE_BYTES) return { ok: false, reason: 'too-large' };
  return { ok: true, reason: null, value, json, bytes: json.length };
};

/** Decode what was stored, dropping anything that no longer parses. */
export const readWorkspaceDraftEntries = (document) => (
  (Array.isArray(document?.entries) ? document.entries : []).flatMap((entry) => {
    try {
      return [{
        key: String(entry?.key || ''),
        value: JSON.parse(String(entry?.valueJson ?? 'null')),
        savedAt: Number(entry?.savedAt) || 0,
        // `Number(null)` is 0, and 0 is a real question index, so a guard that
        // only tests `Number.isInteger` turns a missing index into question
        // zero. Read nulls as nulls.
        questionIndex: entry?.questionIndex === null || entry?.questionIndex === undefined
          ? null
          : (Number.isInteger(Number(entry.questionIndex)) ? Number(entry.questionIndex) : null),
        variantIndex: entry?.variantIndex === null || entry?.variantIndex === undefined
          ? null
          : (Number.isInteger(Number(entry.variantIndex)) ? Number(entry.variantIndex) : null),
      }];
    } catch {
      return [];
    }
  })
);

/** Preview, secure Test Cycle and private Path work never reach this collection. */
export const isSyncableDraftKey = (key) => {
  const text = String(key || '');
  if (!text) return false;
  if (text.includes(':preview')) return false;
  if (/test-?cycle|secure|exam|path-session|pathSession/i.test(text)) return false;
  return true;
};

/**
 * Build the document.
 *
 * `revision` is monotonic per device so the newest acknowledged state wins on
 * the server, and `updatedAt` is stamped by Firestore rather than by a client
 * clock that may be wrong.
 */
/**
 * Normalize one draft entry for storage, or null if it may not be stored.
 *
 * The value is kept as TEXT on purpose. A tool's workspace is its own shape —
 * plotted strokes are arrays of arrays of points, and Firestore refuses an
 * array directly inside an array. Serializing sidesteps every one of those
 * shape rules, makes the size cap exact, and says the true thing about this
 * field: the server stores it and never interprets it.
 */
const storableEntry = (entry) => {
  const key = String(entry?.key || '');
  if (!isSyncableDraftKey(key)) return null;
  const check = sanitizeWorkspaceDraftValue(entry?.value !== undefined ? entry.value : undefined);
  const valueJson = check.ok ? check.json : (typeof entry?.valueJson === 'string' ? entry.valueJson : null);
  if (valueJson === null) return null;
  if (valueJson.length > MAX_WORKSPACE_DRAFT_VALUE_BYTES) return null;
  return {
    key,
    valueJson,
    savedAt: Math.max(0, Number(entry?.savedAt) || 0),
    questionIndex: Number.isInteger(Number(entry?.questionIndex)) ? Number(entry.questionIndex) : null,
    variantIndex: Number.isInteger(Number(entry?.variantIndex)) ? Number(entry.variantIndex) : null,
  };
};

const normalizeResume = (resume) => (resume
  ? {
    questionIndex: Number(resume.questionIndex) || 0,
    activityRole: String(resume.activityRole || ''),
    variantIndex: Number(resume.variantIndex) || 0,
    updatedAt: Math.max(0, Number(resume.updatedAt) || 0),
  }
  : null);

/**
 * THE PATCH A BACKGROUND SAVE SENDS.
 *
 * Only what THIS device changed. A full-document write was a data-loss bug: a
 * device that restored ten questions and then edited one would send a document
 * containing one entry, and `setDoc` would erase the other nine for every
 * device. `hasResume`/`hasPractice` distinguish "not changed" from "cleared",
 * so an untouched field is never mistaken for a deletion.
 */
export const buildWorkspaceDraftPatch = ({
  studentId,
  assignmentId,
  classId = null,
  entries = [],
  resume = null,
  hasResume = false,
  practice = null,
  hasPractice = false,
  practiceUpdatedAt = 0,
} = {}) => ({
  schemaVersion: WORKSPACE_DRAFT_SCHEMA_VERSION,
  documentId: workspaceDraftDocumentId({ studentId, assignmentId }),
  studentId: String(studentId ?? ''),
  assignmentId: String(assignmentId ?? ''),
  classId: classId ? String(classId) : null,
  entries: (Array.isArray(entries) ? entries : []).map(storableEntry).filter(Boolean),
  resume: normalizeResume(resume),
  hasResume: Boolean(hasResume),
  practice: practice && typeof practice === 'object' ? practice : null,
  hasPractice: Boolean(hasPractice),
  practiceUpdatedAt: Math.max(0, Number(practiceUpdatedAt) || 0),
});

/**
 * MERGE, NEVER REPLACE.
 *
 * Unrelated draft keys can never conflict: they are merged by key, so Device A
 * editing question 1 and Device B editing question 2 both survive.
 *
 * For the SAME key the newer `savedAt` wins. That is the student's own device
 * clock, and both writers are the same student, so it is the best available
 * ordering — and it means an obviously stale device cannot wipe newer work.
 * A per-device `revision` is deliberately NOT used for this: device A's
 * revision 15 and device B's revision 2 say nothing about which is newer.
 *
 * Resume uses its own `updatedAt` and Practice its own `practiceUpdatedAt` for
 * the same reason.
 */
export const mergeWorkspaceDraftDocument = ({ existing = null, patch } = {}) => {
  if (!patch) return existing;
  const byKey = new Map();
  (Array.isArray(existing?.entries) ? existing.entries : []).forEach((entry) => {
    const stored = storableEntry(entry);
    if (stored) byKey.set(stored.key, stored);
  });
  patch.entries.forEach((entry) => {
    const current = byKey.get(entry.key);
    // Ties go to the incoming write: it is the same device re-sending.
    if (current && current.savedAt > entry.savedAt) return;
    byKey.set(entry.key, entry);
  });

  // Bounded: newest work is kept when the caps are reached.
  const ordered = [...byKey.values()].sort((left, right) => right.savedAt - left.savedAt);
  const accepted = [];
  let total = 0;
  for (const entry of ordered) {
    if (accepted.length >= MAX_WORKSPACE_DRAFT_ENTRIES) break;
    if (total + entry.valueJson.length > MAX_WORKSPACE_DOCUMENT_BYTES) break;
    total += entry.valueJson.length;
    accepted.push(entry);
  }

  const existingResume = normalizeResume(existing?.resume);
  const resume = patch.hasResume
    && (!existingResume || (patch.resume?.updatedAt || 0) >= existingResume.updatedAt)
    ? patch.resume
    : existingResume;

  const existingPracticeUpdatedAt = Math.max(0, Number(existing?.practiceUpdatedAt) || 0);
  const practiceIsNewer = patch.hasPractice && patch.practiceUpdatedAt >= existingPracticeUpdatedAt;

  return {
    schemaVersion: WORKSPACE_DRAFT_SCHEMA_VERSION,
    documentId: patch.documentId,
    studentId: patch.studentId,
    assignmentId: patch.assignmentId,
    classId: patch.classId ?? existing?.classId ?? null,
    secure: false,
    // Sorted by key so the stored document is stable to read and diff.
    entries: accepted.sort((left, right) => left.key.localeCompare(right.key)),
    // Where the student was. Never authoritative over grading.
    resume,
    // Post-deadline Practice Mode. A separate structure precisely so it can
    // never be mistaken for, or merged into, the canonical grade.
    practice: practiceIsNewer ? patch.practice : (existing?.practice ?? null),
    practiceUpdatedAt: practiceIsNewer ? patch.practiceUpdatedAt : existingPracticeUpdatedAt,
  };
};

/**
 * Which stored entries should be written back into this device's local drafts?
 *
 * A draft never overwrites newer work. `localSavedAt` is what this device
 * already has; `canonicalSavedAt` is when the question was last actually
 * submitted. Either being newer means the stored draft is history.
 */
export const selectRestorableDraftEntries = ({ entries = [], localSavedAt = () => 0, canonicalSavedAt = () => 0 } = {}) => (
  (Array.isArray(entries) ? entries : []).filter((entry) => {
    const savedAt = Number(entry?.savedAt) || 0;
    if (!savedAt) return false;
    if (savedAt <= (Number(localSavedAt(entry.key)) || 0)) return false;
    if (savedAt <= (Number(canonicalSavedAt(entry)) || 0)) return false;
    return true;
  })
);
