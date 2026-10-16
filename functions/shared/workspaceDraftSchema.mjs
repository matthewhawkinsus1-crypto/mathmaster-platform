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

const decodeFieldEditedAt = (entry) => {
  if (typeof entry?.fieldEditedAtJson !== 'string') return null;
  try {
    return normalizeFieldEditedAt(JSON.parse(entry.fieldEditedAtJson));
  } catch {
    return null;
  }
};

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
        // A field-record draft's per-answer edit times, or null (see above).
        fieldEditedAt: decodeFieldEditedAt(entry),
        fieldsFresh: entry?.fieldsFresh === true,
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

/*
 * ANSWERS KEPT FIELD BY FIELD: MULTI-ANSWER, STEP ALGEBRA, COMPOSED STEPS.
 *
 * Three drafts hold several answers in one record, and every write saves the
 * whole record:
 *
 *   `…:multi-answer`        one value per answer box, by field id;
 *   `…:workflow-responses`  one response per step of a composed question, by
 *                           step id (several steps, often on two devices);
 *   `…:step-algebra`        the equation and the steps that produced it, which
 *                           belong together, and the typed prompt answers.
 *
 * Merged whole by edit time, a Chromebook that had not yet received the work
 * (the question opens before the server copy is read, PQ-044) saved its
 * student's first touch as the newest copy of EVERY answer in the record, and
 * a second device editing step 2 replaced the step 1 the first device had just
 * saved. The tool-workspace merge (`__fresh`, above) did not reach them.
 *
 * So each copy of such a draft says when each of its answers was last edited:
 * `fieldEditedAt`, by answer (a "group": a field, a step, or — for Step
 * Algebra — the whole equation-and-steps work, which can only be taken whole),
 * in the device's envelope and in the server entry beside `savedAt`. A copy a
 * device started from nothing — no copy of any kind there, not even a reset's
 * tombstone — also says `fieldsFresh` until it has been settled against the
 * server's copy. Two copies of one draft then merge answer by answer
 * (`mergeFieldRecordCopies`):
 *
 *   - the answer edited later wins; an answer whose edit time is unknown (0:
 *     shown as it opened, or written by an older build) never beats a known one;
 *   - an answer only one copy holds is kept, unless the other copy removed it
 *     later;
 *   - Step Algebra's work begun on a fresh device yields to saved work: it was
 *     done on the question's starting equation, not on the student's steps,
 *     and the two cannot be laid over each other;
 *   - a reset (a tombstone, `null`) keeps only the answers edited after it.
 *
 * A copy without `fieldEditedAt` (an older build, or one restored from an
 * entry it saved) merges by the ordinary rule — newer whole — except against
 * a fresh copy, which has nothing of its own to lose: the older copy's answers
 * then count as edited at its `savedAt`. Older builds store and read these
 * entries as before; they drop the new fields when they rewrite an entry,
 * which then merges by the ordinary rule again.
 */
const FIELD_RECORD_DRAFT_KINDS = Object.freeze(['multi-answer', 'workflow-responses', 'step-algebra']);
const FIELD_RECORD_KEY = /^mathmaster:draft:v2::(?:[^:]*:){5}(?:[^:]+:)*(multi-answer|workflow-responses|step-algebra)$/;

/** 'multi-answer', 'workflow-responses' or 'step-algebra' for a draft kept field by field; otherwise null. */
export const fieldRecordDraftKind = (key) => {
  const text = String(key || '');
  if (text.includes(':work:') || text.includes(':undo:')) return null;
  const match = FIELD_RECORD_KEY.exec(text);
  return match && FIELD_RECORD_DRAFT_KINDS.includes(match[1]) ? match[1] : null;
};

// Step Algebra: the typed prompt answers stand alone; everything else is the
// work on the equation, taken whole. Only a change to what the student
// committed — the equation, its steps, the answers typed into a step — dates
// that work: arming a tile or typing an operand they have not applied does not.
const STEP_ALGEBRA_WORK = 'work';
const STEP_ALGEBRA_STANDALONE = Object.freeze(['promptAnswers']);
const STEP_ALGEBRA_COMMITTED = Object.freeze(['equation', 'workSteps', 'simplificationAnswers', 'distributionState', 'crossedSides', 'cancelledPairIds']);

/** The group a top-level field of a field-record draft belongs to. */
const groupOfField = (kind, field) => (
  kind === 'step-algebra' && !STEP_ALGEBRA_STANDALONE.includes(field) ? STEP_ALGEBRA_WORK : field
);

/** Groups that can only be taken whole from one copy, and yield to saved work when begun on a fresh device. */
const isCoupledGroup = (kind, group) => kind === 'step-algebra' && group === STEP_ALGEBRA_WORK;

const stableJson = (value) => {
  try {
    return JSON.stringify(value === undefined ? null : value);
  } catch {
    return null;
  }
};

/**
 * Each group of a field-record value, with the signature that says whether
 * it changed: Map(group -> { fields, signature }). Not a record: no groups.
 */
export const fieldRecordGroups = (kind, value) => {
  const groups = new Map();
  if (!kind || !isFieldRecord(value)) return groups;
  Object.keys(value).forEach((field) => {
    const group = groupOfField(kind, field);
    if (!groups.has(group)) groups.set(group, { fields: [], signature: null });
    groups.get(group).fields.push(field);
  });
  groups.forEach((entry, group) => {
    entry.signature = isCoupledGroup(kind, group)
      ? stableJson(Object.fromEntries(STEP_ALGEBRA_COMMITTED.map((field) => [field, value[field] ?? null])))
      : stableJson(Object.fromEntries(entry.fields.map((field) => [field, value[field]])));
  });
  return groups;
};

const EMPTY_SIGNATURES = new Set(['null', '""', '[]', '{}']);
const emptyGroupSignature = (kind, group, signature) => {
  if (signature === null || signature === undefined) return true;
  if (isCoupledGroup(kind, group)) return false;
  // A single field `{ "id": <empty> }`.
  try {
    const parsed = JSON.parse(signature);
    return Object.values(parsed).every((value) => EMPTY_SIGNATURES.has(stableJson(value)) || value === undefined);
  } catch {
    return false;
  }
};

/** A plain `{ group: editTime }` map, dropping anything that is not a positive time. */
export const normalizeFieldEditedAt = (value) => {
  if (!isFieldRecord(value)) return null;
  const out = {};
  Object.entries(value).forEach(([group, at]) => {
    const time = Number(at);
    if (Number.isFinite(time) && time > 0) out[group] = time;
  });
  return out;
};

/**
 * The edit times a write of `next` gives each group, from the copy it
 * replaces (`previous`, with its `previousEditedAt`). An edit dates every
 * group whose signature changed — including one it removed — except an empty
 * answer where there was none; a write that is not an edit dates nothing.
 */
export const stampFieldRecordEdits = ({ kind, previous, previousEditedAt, next, edit, now }) => {
  const times = { ...normalizeFieldEditedAt(previousEditedAt) };
  if (!kind || !edit || !isFieldRecord(next)) return times;
  const before = fieldRecordGroups(kind, previous);
  const after = fieldRecordGroups(kind, next);
  new Set([...before.keys(), ...after.keys()]).forEach((group) => {
    const was = before.get(group)?.signature;
    const is = after.get(group)?.signature;
    if (was === is) return;
    if (was === undefined && emptyGroupSignature(kind, group, is)) return;
    times[group] = now;
  });
  return times;
};

/**
 * Two copies of one field-record draft, merged answer by answer — or null to
 * apply the ordinary rule (the newer copy, whole).
 *
 * A copy: `{ value, savedAt, savedAtIsEdit, fieldEditedAt, fieldsFresh }`.
 * `prefer` ('a' or 'b') breaks a tie no other rule decides: the server keeps
 * the incoming write (the same device re-sending), a device keeps its own.
 * The result is never fresh.
 */
export const mergeFieldRecordCopies = ({ kind, a, b, prefer = 'b' } = {}) => {
  if (!kind || !a || !b) return null;
  const aTimes = normalizeFieldEditedAt(a.fieldEditedAt);
  const bTimes = normalizeFieldEditedAt(b.fieldEditedAt);
  const aRecord = isFieldRecord(a.value);
  const bRecord = isFieldRecord(b.value);
  const aAt = Math.max(0, Number(a.savedAt) || 0);
  const bAt = Math.max(0, Number(b.savedAt) || 0);

  // A reset (null) and a record dated after it: only answers edited after the
  // reset survive it. (A record dated before the reset is simply older.)
  const afterReset = (record, recordTimes, resetAt) => {
    const kept = {};
    const keptTimes = {};
    fieldRecordGroups(kind, record.value).forEach((entry, group) => {
      if ((recordTimes[group] || 0) > resetAt) {
        entry.fields.forEach((field) => { kept[field] = record.value[field]; });
        keptTimes[group] = recordTimes[group];
      }
    });
    return {
      value: kept,
      savedAt: Math.max(aAt, bAt),
      savedAtIsEdit: true,
      fieldEditedAt: keptTimes,
      fieldsFresh: false,
    };
  };
  if (aRecord && b.value === null && aTimes && aAt > bAt && b.savedAtIsEdit === true) return afterReset(a, aTimes, bAt);
  if (bRecord && a.value === null && bTimes && bAt > aAt && a.savedAtIsEdit === true) return afterReset(b, bTimes, aAt);

  if (!aRecord || !bRecord) return null;
  // Both copies must say when their answers were edited — or one must be a
  // fresh copy, which then counts the other's answers as edited at its time.
  const legacyTimes = (copy, at) => {
    const times = {};
    fieldRecordGroups(kind, copy.value).forEach((_, group) => { times[group] = at; });
    return times;
  };
  let aGroupTimes = aTimes;
  let bGroupTimes = bTimes;
  if (!aGroupTimes && bTimes && b.fieldsFresh === true) aGroupTimes = legacyTimes(a, aAt);
  if (!bGroupTimes && aTimes && a.fieldsFresh === true) bGroupTimes = legacyTimes(b, bAt);
  if (!aGroupTimes || !bGroupTimes) return null;

  const aGroups = fieldRecordGroups(kind, a.value);
  const bGroups = fieldRecordGroups(kind, b.value);
  const aFresh = a.fieldsFresh === true;
  const bFresh = b.fieldsFresh === true;
  const value = {};
  const fieldEditedAt = {};
  new Set([...aGroups.keys(), ...bGroups.keys(), ...Object.keys(aGroupTimes), ...Object.keys(bGroupTimes)]).forEach((group) => {
    const ta = aGroupTimes[group] || 0;
    const tb = bGroupTimes[group] || 0;
    const inA = aGroups.has(group);
    const inB = bGroups.has(group);
    let winner;
    if (!inA && !inB) winner = ta >= tb ? 'a' : 'b';
    // A copy that lacks the answer and never removed it has nothing to say about it.
    else if (inA && !inB && !tb) winner = 'a';
    else if (inB && !inA && !ta) winner = 'b';
    else if (isCoupledGroup(kind, group) && aFresh !== bFresh && (aFresh ? (inB && tb > 0) : (inA && ta > 0))) winner = aFresh ? 'b' : 'a';
    else if (ta !== tb) winner = ta > tb ? 'a' : 'b';
    else if (aFresh !== bFresh) winner = aFresh ? 'b' : 'a';
    else if (aAt !== bAt) winner = aAt > bAt ? 'a' : 'b';
    else winner = prefer === 'a' ? 'a' : 'b';
    const source = winner === 'a' ? a.value : b.value;
    const groups = winner === 'a' ? aGroups : bGroups;
    groups.get(group)?.fields.forEach((field) => { value[field] = source[field]; });
    const time = Math.max(ta, tb);
    if (time > 0) fieldEditedAt[group] = time;
  });
  const newer = aAt === bAt ? (prefer === 'a' ? a : b) : (aAt > bAt ? a : b);
  return {
    value,
    savedAt: Math.max(aAt, bAt),
    savedAtIsEdit: newer.savedAtIsEdit === true || a.savedAtIsEdit === true || b.savedAtIsEdit === true,
    fieldEditedAt,
    fieldsFresh: false,
  };
};

/** The stored entry two copies of one field-record draft become, or null to apply the ordinary rule. */
const mergeFieldRecordEntries = (kind, current, incoming) => {
  let currentValue;
  let incomingValue;
  try {
    currentValue = JSON.parse(current.valueJson);
    incomingValue = JSON.parse(incoming.valueJson);
  } catch {
    return null;
  }
  const merged = mergeFieldRecordCopies({
    kind,
    a: { ...current, value: currentValue, fieldEditedAt: decodeFieldEditedAt(current) },
    b: { ...incoming, value: incomingValue, fieldEditedAt: decodeFieldEditedAt(incoming) },
    prefer: 'b',
  });
  if (!merged || !sanitizeWorkspaceDraftValue(merged.value).ok) return null;
  const { fieldEditedAtJson: _stale, fieldsFresh: _fresh, ...rest } = incoming;
  return storableEntry({ ...rest, ...merged, savedAtIsEdit: merged.savedAtIsEdit });
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
    // A field-record draft's per-answer edit times (above), as text for the
    // same reason as the value: the keys are field and step ids.
    ...fieldRecordMarkers(key, entry),
  };
};

/*
 * `fieldEditedAt` travels as `fieldEditedAtJson` (and `fieldsFresh` only when
 * true), for field-record drafts only. Absent on every other entry, so those
 * are stored exactly as before.
 */
const fieldRecordMarkers = (key, entry) => {
  if (!fieldRecordDraftKind(key)) return {};
  let times = normalizeFieldEditedAt(entry?.fieldEditedAt);
  if (!times && typeof entry?.fieldEditedAtJson === 'string') {
    try { times = normalizeFieldEditedAt(JSON.parse(entry.fieldEditedAtJson)); } catch { times = null; }
  }
  if (!times) return {};
  const json = stableJson(times);
  if (!json || json.length > MAX_WORKSPACE_DRAFT_VALUE_BYTES) return {};
  return { fieldEditedAtJson: json, ...(entry?.fieldsFresh === true ? { fieldsFresh: true } : {}) };
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
export const mergeWorkspaceDraftDocument = ({ existing = null, patch } = {}) => (
  patch ? mergeWorkspaceDraftDocumentReport({ existing, patch }).document : existing
);

/**
 * The merged document, and the keys the caps left out of it (`droppedKeys`).
 * The document is exactly what mergeWorkspaceDraftDocument stores.
 */
export const mergeWorkspaceDraftDocumentReport = ({ existing = null, patch } = {}) => {
  if (!patch) return { document: existing, droppedKeys: [] };
  const byKey = new Map();
  (Array.isArray(existing?.entries) ? existing.entries : []).forEach((entry) => {
    const stored = storableEntry(entry);
    if (stored) byKey.set(stored.key, stored);
  });
  patch.entries.forEach((entry) => {
    const current = byKey.get(entry.key);
    // A tool workspace a device started from nothing is merged (above), and
    // a field-record draft is merged answer by answer (above).
    const fieldKind = fieldRecordDraftKind(entry.key);
    const merged = !current
      ? null
      : isToolWorkspaceDraftKey(entry.key)
        ? mergeToolWorkspaceEntries(current, entry)
        : fieldKind ? mergeFieldRecordEntries(fieldKind, current, entry) : null;
    if (merged) {
      byKey.set(entry.key, merged);
      return;
    }
    // Ties go to the incoming write: it is the same device re-sending.
    if (current && current.savedAt > entry.savedAt) return;
    byKey.set(entry.key, entry);
  });

  // Bounded: newest work is kept when the caps are reached. What does not fit
  // is still on the device that saved it, but no longer reaches another one —
  // so it is named (`droppedKeys`), and the student is told (App.jsx).
  const ordered = [...byKey.values()].sort((left, right) => right.savedAt - left.savedAt);
  const accepted = [];
  const droppedKeys = [];
  let total = 0;
  for (const entry of ordered) {
    const bytes = entry.valueJson.length + (entry.fieldEditedAtJson?.length || 0);
    if (accepted.length >= MAX_WORKSPACE_DRAFT_ENTRIES || total + bytes > MAX_WORKSPACE_DOCUMENT_BYTES) {
      droppedKeys.push(entry.key);
      continue;
    }
    total += bytes;
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

  return { droppedKeys, document: {
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
  } };
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
