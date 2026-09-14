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
        questionIndex: Number.isInteger(Number(entry?.questionIndex)) ? Number(entry.questionIndex) : null,
        variantIndex: Number.isInteger(Number(entry?.variantIndex)) ? Number(entry.variantIndex) : null,
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
export const buildWorkspaceDraftDocument = ({
  studentId,
  assignmentId,
  classId = null,
  revision = 1,
  entries = [],
  resume = null,
  practice = null,
} = {}) => {
  const accepted = [];
  let total = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (accepted.length >= MAX_WORKSPACE_DRAFT_ENTRIES) break;
    const key = String(entry?.key || '');
    if (!isSyncableDraftKey(key)) continue;
    const check = sanitizeWorkspaceDraftValue(entry?.value);
    if (!check.ok) continue;
    if (total + check.bytes > MAX_WORKSPACE_DOCUMENT_BYTES) break;
    total += check.bytes;
    accepted.push({
      key,
      // STORED AS TEXT ON PURPOSE.
      //
      // A tool's workspace is its own shape — plotted strokes are arrays of
      // arrays of points, and Firestore refuses an array directly inside an
      // array. Serializing sidesteps every one of those shape rules, makes the
      // size cap exact, and says the true thing about this field: the server
      // stores it and never interprets it.
      valueJson: check.json,
      savedAt: Math.max(0, Number(entry?.savedAt) || 0),
      questionIndex: Number.isInteger(Number(entry?.questionIndex)) ? Number(entry.questionIndex) : null,
      variantIndex: Number.isInteger(Number(entry?.variantIndex)) ? Number(entry.variantIndex) : null,
    });
  }
  return {
    schemaVersion: WORKSPACE_DRAFT_SCHEMA_VERSION,
    documentId: workspaceDraftDocumentId({ studentId, assignmentId }),
    studentId: String(studentId ?? ''),
    assignmentId: String(assignmentId ?? ''),
    classId: classId ? String(classId) : null,
    revision: Math.max(1, Number(revision) || 1),
    secure: false,
    entries: accepted,
    // Where the student was. Never authoritative over grading.
    resume: resume
      ? {
        questionIndex: Number(resume.questionIndex) || 0,
        activityRole: String(resume.activityRole || ''),
        variantIndex: Number(resume.variantIndex) || 0,
        updatedAt: Math.max(0, Number(resume.updatedAt) || 0),
      }
      : null,
    // Post-deadline Practice Mode. A separate structure precisely so it can
    // never be mistaken for, or merged into, the canonical grade.
    practice: practice && typeof practice === 'object' ? practice : null,
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
