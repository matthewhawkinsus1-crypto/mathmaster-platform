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

import { mergePracticeTrackers, samePracticeProgress } from './practiceTrackerMerge.mjs';

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

/*
 * WHERE, NOT ONLY WHETHER.
 *
 * `containsForbiddenKey` answers the question the guard needs answered. It does
 * not say which of forty fields tripped it, and "forbidden-key" on a board with
 * nine cards sent PR #397 hunting through every one of them. This walks the
 * same depth-limited tree in the same order and names the first offending path,
 * so a developer reads `cardChecks.slopeIntercept.isCorrect` instead of
 * guessing. It never changes the verdict — it is only ever called after the
 * guard has already said no.
 */
const firstForbiddenKeyPath = (value, path = '', depth = 0) => {
  if (depth > 8 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstForbiddenKeyPath(value[index], `${path}[${index}]`, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (FORBIDDEN_DRAFT_KEYS.includes(key)) return here;
    const found = firstForbiddenKeyPath(nested, here, depth + 1);
    if (found) return found;
  }
  return null;
};

// The biggest top-level fields of an oversized record, so "too-large" names the
// history or cache that grew rather than leaving the reader to measure them.
const largestFields = (value, limit = 3) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value)
    .map(([key, nested]) => {
      let bytes = 0;
      try { bytes = JSON.stringify(nested ?? null)?.length || 0; } catch { bytes = Number.NaN; }
      return { path: key, bytes };
    })
    .sort((a, b) => (b.bytes || 0) - (a.bytes || 0))
    .slice(0, limit);
};

/**
 * Why a draft value may not be stored, in terms a developer can act on.
 *
 * Same verdict as `sanitizeWorkspaceDraftValue` — it calls it — plus the path
 * of the first forbidden key, or the largest fields of an oversized record.
 * For diagnostics only: nothing here relaxes the guard.
 */
export const explainWorkspaceDraftRejection = (value) => {
  const check = sanitizeWorkspaceDraftValue(value);
  if (check.ok) return { ok: true, reason: null, path: null, bytes: check.bytes, largest: [] };
  if (check.reason === 'forbidden-key') {
    return { ok: false, reason: check.reason, path: firstForbiddenKeyPath(value), bytes: null, largest: [] };
  }
  if (check.reason === 'too-large') {
    let bytes = null;
    try { bytes = JSON.stringify(value ?? null).length; } catch { bytes = null; }
    return { ok: false, reason: check.reason, path: null, bytes, limit: MAX_WORKSPACE_DRAFT_VALUE_BYTES, largest: largestFields(value) };
  }
  return { ok: false, reason: check.reason, path: null, bytes: null, largest: [] };
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

/*
 * THE EDIT-TIME MARKER (`savedAtIsEdit`).
 *
 * An entry's `savedAt` is what every copy is ordered by. This build stamps it
 * only when the student edits (PQ-044, questionDraftStorage.js); builds before
 * it stamped every write, and every question writes its drafts back the moment
 * it opens — so an entry an older build saved may carry the time a Chromebook
 * merely OPENED the question, over boxes that were empty there. Nothing in such
 * an entry tells the two apart, so this build says it: every entry whose time
 * is a student's edit carries `savedAtIsEdit: true`. Entries without it are
 * legacy, and a restore lets one replace only a device that has nothing dated
 * of its own (`selectRestorableDraftEntries`) — what an older build did there.
 *
 * The marker travels with its entry: stored, merged and read back with it. An
 * older build that saves to the same document rewrites the entries with the
 * fields it knows and so drops every marker; those entries then count as
 * legacy, as they would have before this build. Firestore's rules check the
 * document's top-level fields only, and the schema version is unchanged, so
 * older builds read and write these documents as they always did.
 */
const editMarker = (entry) => (entry?.savedAtIsEdit === true ? { savedAtIsEdit: true } : {});

/** Decode what was stored, dropping anything that no longer parses. */
export const readWorkspaceDraftEntries = (document) => (
  (Array.isArray(document?.entries) ? document.entries : []).flatMap((entry) => {
    try {
      return [{
        key: String(entry?.key || ''),
        value: JSON.parse(String(entry?.valueJson ?? 'null')),
        savedAt: Number(entry?.savedAt) || 0,
        // True only when the saving device said its time is an edit's.
        savedAtIsEdit: entry?.savedAtIsEdit === true,
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

/*
 * A WORKSPACE A DEVICE STARTED FROM NOTHING IS MERGED, NOT SWAPPED IN.
 *
 * `${draftKey}:work:${scope}` (src/tools/shared/usePersistentToolState.js) is
 * one record holding every answerable value of a tool — the Multiple
 * Representations board keeps twenty fields and its collapsed panels in one.
 * A field is in it only once a device has set it: initial values are never
 * written, and no field is ever removed (a reset tombstones the whole record
 * with null).
 *
 * The question opens before the server's copy is read (PQ-044). On a
 * Chromebook that has never seen this work the record therefore starts empty,
 * and the student's first edit — a typed box, a collapsed panel, "Find the
 * slope" — saved `{ thatField }` as the newest copy of the whole workspace.
 * Newest-wins per key kept that on the server and restored it over every
 * other device: the whole board, gone everywhere.
 *
 * So a record a device starts from NOTHING — no copy of any kind on that
 * device, not even a reset's tombstone — says so: `__fresh` lists the fields
 * its student has edited. Laid over a copy it never saw, a fresh record
 * contributes those fields, and any field only it holds; everything else
 * comes from that copy, and the result is no longer fresh. Every other
 * record replaces as before, newest whole — which is what keeps "Start over"
 * stuck: a record begun on a reset is not fresh, even when the reset itself
 * never reached the server (the sync sends only a key's newest copy).
 *
 * A draft key's segments are URI-encoded (buildQuestionDraftKey), so the five
 * after the prefix — student, assignment, question, variant, bucket — hold no
 * ':'. The device-local Undo history (`…:work:<scope>:undo:<owner>`) never
 * reaches the server and is not a workspace record.
 */
const TOOL_WORKSPACE_KEY = /^mathmaster:draft:v2::(?:[^:]*:){5}work:/;

export const isToolWorkspaceDraftKey = (key) => {
  const text = String(key || '');
  return TOOL_WORKSPACE_KEY.test(text) && !text.includes(':undo:');
};

export const TOOL_WORKSPACE_FRESH_FIELD = '__fresh';

const isFieldRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The fields a fresh workspace record's student edited, or null for a record that is not fresh. */
export const freshToolWorkspaceEdits = (value) => {
  const marker = isFieldRecord(value) ? value[TOOL_WORKSPACE_FRESH_FIELD] : undefined;
  return Array.isArray(marker) ? marker.filter((field) => typeof field === 'string') : null;
};

/** A workspace record's own fields, without the fresh marker. Anything else is returned as it is. */
export const toolWorkspaceFields = (value) => {
  if (!isFieldRecord(value)) return value;
  const { [TOOL_WORKSPACE_FRESH_FIELD]: _fresh, ...fields } = value;
  return fields;
};

/**
 * A fresh workspace record laid over a copy it never saw: the fields its
 * student edited and any field only it holds, every other field from `seen`.
 * The result is no longer fresh.
 */
export const mergeFreshToolWorkspace = (seen, fresh) => {
  const edited = new Set(freshToolWorkspaceEdits(fresh) || []);
  const merged = { ...toolWorkspaceFields(isFieldRecord(seen) ? seen : {}) };
  Object.entries(toolWorkspaceFields(fresh)).forEach(([field, value]) => {
    if (edited.has(field) || !Object.hasOwn(merged, field)) merged[field] = value;
  });
  return merged;
};

/**
 * The stored entry two copies of one tool workspace become when the newer is
 * fresh, or null to apply the ordinary rule (the newer copy, whole). Equal
 * times are one device re-sending, which the ordinary rule already handles.
 */
const mergeToolWorkspaceEntries = (current, incoming) => {
  if (current.savedAt === incoming.savedAt) return null;
  const [older, newer] = current.savedAt > incoming.savedAt ? [incoming, current] : [current, incoming];
  let olderValue;
  let newerValue;
  try {
    olderValue = JSON.parse(older.valueJson);
    newerValue = JSON.parse(newer.valueJson);
  } catch {
    return null;
  }
  if (!freshToolWorkspaceEdits(newerValue)) return null;
  // Over a record, merged; over a reset or a value an older build stored,
  // there is nothing to keep, and the fresh record simply stops being fresh.
  const value = isFieldRecord(olderValue) ? mergeFreshToolWorkspace(olderValue, newerValue) : toolWorkspaceFields(newerValue);
  if (!sanitizeWorkspaceDraftValue(value).ok) return null;
  return storableEntry({ ...newer, value });
};

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
    // Absent rather than false when unmarked: a legacy entry and an unmarked
    // one are stored alike, because they mean the same thing.
    ...editMarker(entry),
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
 * device. `hasResume`/`hasPractice` distinguish "not changed" from "sent", so
 * an untouched field is never mistaken for a deletion. (A resume can be
 * cleared; practice is merged per question, so a patch can add to it and
 * never take it away.)
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
 * Each entry keeps its own edit-time marker: the copy that wins brings its
 * marker, or its lack of one, with it.
 *
 * Resume uses its own `updatedAt` for the same reason. Practice is merged per
 * question instead (see below).
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
    // A tool workspace a device started from nothing is merged (above).
    const merged = current && isToolWorkspaceDraftKey(entry.key) ? mergeToolWorkspaceEntries(current, entry) : null;
    if (merged) {
      byKey.set(entry.key, merged);
      return;
    }
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

  /*
   * POST-DEADLINE PRACTICE, PER QUESTION (practiceTrackerMerge.mjs).
   *
   * A device sends its whole tracker. The server keeps, for each question,
   * the record with more practice progress — the rule the device applies to
   * the copy it reads back. A tracker with nothing new in it — the fresh
   * start every device sends as Practice Mode opens, or none at all from an
   * ordinary assignment — therefore changes nothing, whichever save lands
   * first. It used to replace the saved practice whole whenever it was the
   * newer save. `practiceUpdatedAt` is when the progress last changed.
   */
  const existingPractice = existing?.practice && typeof existing.practice === 'object' ? existing.practice : null;
  const existingPracticeUpdatedAt = Math.max(0, Number(existing?.practiceUpdatedAt) || 0);
  const incomingPractice = patch.hasPractice && patch.practice && typeof patch.practice === 'object' ? patch.practice : null;
  const practice = incomingPractice ? mergePracticeTrackers(existingPractice || {}, incomingPractice) : existingPractice;
  const practiceChanged = incomingPractice !== null && !samePracticeProgress(existingPractice || {}, practice);

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
    practice: practice ?? null,
    practiceUpdatedAt: practiceChanged
      ? Math.max(existingPracticeUpdatedAt, Math.max(0, Number(patch.practiceUpdatedAt) || 0))
      : existingPracticeUpdatedAt,
  };
};

/**
 * Which stored entries should be written back into this device's local drafts?
 *
 * A draft never overwrites newer work. `localSavedAt` is what this device
 * already has; `canonicalSavedAt` is when the question was last actually
 * submitted. Either being newer means the stored draft is history.
 *
 * An entry without the edit-time marker (see above) was saved by an older
 * build, and its time may be when some Chromebook merely opened the question.
 * It is restored only where this device has nothing dated of its own for that
 * draft — a fresh device, or one where it was never edited — which is what an
 * older build did there too. A device that has a copy keeps it, as an older
 * build's devices did (their own opening re-dated it): that copy may be the
 * student's own work, and the legacy entry an empty question opened elsewhere.
 */
export const selectRestorableDraftEntries = ({ entries = [], localSavedAt = () => 0, canonicalSavedAt = () => 0 } = {}) => (
  (Array.isArray(entries) ? entries : []).filter((entry) => {
    const savedAt = Number(entry?.savedAt) || 0;
    if (!savedAt) return false;
    const local = Number(localSavedAt(entry.key)) || 0;
    if (savedAt <= local) return false;
    if (savedAt <= (Number(canonicalSavedAt(entry)) || 0)) return false;
    if (entry?.savedAtIsEdit !== true && local > 0) return false;
    return true;
  })
);
