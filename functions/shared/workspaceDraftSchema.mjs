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
import { normalizeDeliveryPin } from './questionGenerationIdentity.mjs';

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
        resetAt: Number(entry?.resetAt) > 0 ? Number(entry.resetAt) : 0,
        canonicalAt: Number(entry?.canonicalAt) > 0 ? Number(entry.canonicalAt) : 0,
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
 *                           belong together, and the typed prompt answers,
 *                           each on its own.
 *
 * Merged whole by edit time, a Chromebook that had not yet received the work
 * (the question opens before the server copy is read, PQ-044) saved its
 * student's first touch as the newest copy of EVERY answer in the record, and
 * a second device editing step 2 replaced the step 1 the first device had just
 * saved. The tool-workspace merge (`__fresh`, above) did not reach them.
 *
 * So each copy of such a draft says when each of its answers was last edited:
 * `fieldEditedAt`, by answer (a "group": a field, a step, or — for Step
 * Algebra — one prompt answer, or the whole equation-and-steps work, which can
 * only be taken whole),
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

// Step Algebra: each typed prompt answer stands alone — group
// `promptAnswers/<id>` (RT22: as one group, a later edit to one prompt on a
// second device replaced the other prompts' answers); everything else is the
// work on the equation, taken whole. Only a change to what the student
// committed — the equation, its steps, the answers typed into a step — dates
// that work: arming a tile or typing an operand they have not applied does not.
const STEP_ALGEBRA_WORK = 'work';
const STEP_ALGEBRA_PROMPTS = 'promptAnswers';
const PROMPT_GROUP = `${STEP_ALGEBRA_PROMPTS}/`;
const STEP_ALGEBRA_COMMITTED = Object.freeze(['equation', 'workSteps', 'simplificationAnswers', 'distributionState', 'crossedSides', 'cancelledPairIds']);

/** The group a top-level field of a field-record draft belongs to. */
const groupOfField = (kind, field) => (
  kind === 'step-algebra' && field !== STEP_ALGEBRA_PROMPTS ? STEP_ALGEBRA_WORK : field
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
export const fieldRecordGroups = (kind, value, { wholePrompts = false } = {}) => {
  const groups = new Map();
  if (!kind || !isFieldRecord(value)) return groups;
  Object.keys(value).forEach((field) => {
    const answers = own(value, field);
    // `wholePrompts`: the prompt answers as one group, as builds before RT22 keep them.
    if (!wholePrompts && kind === 'step-algebra' && field === STEP_ALGEBRA_PROMPTS && isFieldRecord(answers)) {
      // A prompt answer is one key of the field: `within` says which.
      Object.keys(answers).forEach((id) => groups.set(PROMPT_GROUP + id, { fields: [], within: [field, id], signature: null }));
      return;
    }
    const group = groupOfField(kind, field);
    if (!groups.has(group)) groups.set(group, { fields: [], signature: null });
    groups.get(group).fields.push(field);
  });
  groups.forEach((entry, group) => {
    if (entry.within) {
      const [field, id] = entry.within;
      entry.signature = stableJson(Object.fromEntries([[id, own(own(value, field), id)]]));
      return;
    }
    entry.signature = isCoupledGroup(kind, group)
      ? stableJson(Object.fromEntries(STEP_ALGEBRA_COMMITTED.map((field) => [field, value[field] ?? null])))
      : stableJson(Object.fromEntries(entry.fields.map((field) => [field, value[field]])));
  });
  return groups;
};

/**
 * Copies one group's answers from `source` into `target`, an object the
 * caller owns. A prompt answer goes into a copy of the target's map, never
 * into a map the target shares with someone else.
 */
export const copyFieldRecordGroup = (target, source, entry) => {
  if (entry.within) {
    const [field, id] = entry.within;
    const held = own(target, field);
    const answers = isFieldRecord(held) ? { ...held } : {};
    setOwn(answers, id, own(own(source, field), id));
    setOwn(target, field, answers);
    return target;
  }
  entry.fields.forEach((field) => setOwn(target, field, own(source, field)));
  return target;
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

/*
 * Field and step ids are the student's data's keys, and they can be anything a
 * teacher named a box: "__proto__", "constructor", "toString". Every read and
 * write of a per-answer map goes through these, so an id is always an own
 * property — never the prototype, never an inherited function read as a time.
 */
const own = (record, key) => (record && Object.hasOwn(record, key) ? record[key] : undefined);
const setOwn = (record, key, value) => {
  Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true });
};
/*
 * An answer's time is its edit time — or, NEGATIVE, an upper bound: "edited at
 * or before this", for an answer an older build saved without one
 * (adoptedFieldEditedAt). `rawTimeOf` keeps the sign; `timeOf` is the moment.
 */
const rawTimeOf = (times, group) => {
  const time = Number(own(times, group));
  return Number.isFinite(time) && time !== 0 ? time : 0;
};
const timeOf = (times, group) => Math.abs(rawTimeOf(times, group));

/*
 * A DRAFT AN OLDER BUILD TOUCHED KEEPS THE OLD RULE (RT22).
 *
 * Builds before RT22 — and a server not yet deployed — date Step Algebra's
 * prompt answers as one set, `promptAnswers`, and keep every other time they
 * are given as it was: in a copy one of them changed, the per-answer times are
 * out of date, and an answer it holds may have none. Nothing in such a copy
 * says which answers that build changed, so no per-answer reading of it is
 * safe. This build dates every answer it holds and keeps `promptAnswers` at
 * exactly the latest of them (`withPromptGroupTime`), so a copy an older build
 * touched shows it (`olderBuildPrompts`): an answer held with no time of its
 * own, or a set dated later than every one of its answers.
 *
 * Such a draft keeps the old rule for good: when either copy shows it, the
 * prompt answers are merged whole by the set's time, the merged copy carries no
 * per-answer times (so it goes on showing it), and this build's edits to it
 * date the set as an older build does (`promptsAsOneSet`). Only drafts this
 * build alone wrote are merged answer by answer. A mix of builds therefore
 * behaves exactly as before; the new rule starts with drafts begun after it.
 */
const olderBuildPrompts = (kind, value, times) => {
  if (kind !== 'step-algebra') return false;
  const answers = own(value, STEP_ALGEBRA_PROMPTS);
  const held = isFieldRecord(answers) ? Object.keys(answers).filter((id) => !EMPTY_SIGNATURES.has(stableJson(own(answers, id)))) : [];
  if (!times) return held.length > 0;
  if (held.some((id) => !rawTimeOf(times, PROMPT_GROUP + id))) return true;
  const setTime = timeOf(times, STEP_ALGEBRA_PROMPTS);
  return Boolean(setTime) && Object.keys(times).every((group) => !group.startsWith(PROMPT_GROUP) || timeOf(times, group) < setTime);
};
/** The times a draft that keeps the old rule carries: no per-answer ones. */
const promptsAsOneSet = (times) => {
  if (!times) return times;
  const out = {};
  Object.keys(times).forEach((group) => {
    if (!group.startsWith(PROMPT_GROUP)) setOwn(out, group, rawTimeOf(times, group));
  });
  return out;
};
/** How a copy's prompt answers are grouped: whole once an older build touched them. */
export const fieldRecordGroupsFor = (kind, value, times) => fieldRecordGroups(kind, value, { wholePrompts: olderBuildPrompts(kind, value, normalizeFieldEditedAt(times)) });
const withPromptGroupTime = (kind, times) => {
  if (kind !== 'step-algebra' || !times) return times;
  let latest = 0;
  Object.keys(times).forEach((group) => {
    const time = group.startsWith(PROMPT_GROUP) ? rawTimeOf(times, group) : 0;
    if (Math.abs(time) > Math.abs(latest)) latest = time;
  });
  // With no answer dated, a set time an older build gave is kept as it was.
  if (latest) setOwn(times, STEP_ALGEBRA_PROMPTS, latest);
  return times;
};

/** A plain `{ group: editTime }` map (a negative time is an upper bound), dropping anything else. */
export const normalizeFieldEditedAt = (value) => {
  if (!isFieldRecord(value)) return null;
  const out = {};
  Object.keys(value).forEach((group) => {
    const time = rawTimeOf(value, group);
    if (time) setOwn(out, group, time);
  });
  return out;
};

/*
 * THE RESET A COPY KNOWS ABOUT (`resetAt`).
 *
 * Start over writes a tombstone (null). Merged, the tombstone is gone — the
 * next record replaces it — so a record written over a reset, and every merge
 * that saw one, carries the reset's time. A copy that did not see the reset
 * (resetAt older) keeps none of its answers dated at or before it, in every
 * later merge, in any order, however often the same save is retried.
 */
export const resetTimeOf = (copy) => Math.max(
  Number(copy?.resetAt) > 0 ? Number(copy.resetAt) : 0,
  copy?.value === null && copy?.savedAtIsEdit === true ? Math.max(0, Number(copy?.savedAt) || 0) : 0,
);

/**
 * The per-answer edit times of a copy a device takes in: its own, or — for a
 * copy an older build saved, which has none — every non-empty answer dated at
 * the copy's time, when that time is an edit's. Without it the answers of such
 * a copy counted as never edited, and an older dated copy elsewhere won them
 * back. An unmarked copy's time may be an opening's: its answers stay undated.
 *
 * The copy's time is only an upper bound for each answer in it (it may have
 * been typed long before the copy's last save), so it is stored negative: such
 * an answer loses to the other copy's answer when the other copy was saved
 * after that bound — the rule an older build applied to the whole record,
 * applied per answer — and an answer only this copy holds is still kept.
 */
export const adoptedFieldEditedAt = (kind, copy) => {
  const times = normalizeFieldEditedAt(copy?.fieldEditedAt);
  if (times) return times;
  if (!kind || !isFieldRecord(copy?.value)) return null;
  // Unmarked: it stays a copy without times, which merges by the ordinary rule.
  const at = copy?.savedAtIsEdit === true ? Math.max(0, Number(copy?.savedAt) || 0) : 0;
  if (!at) return null;
  const out = {};
  // Such a copy is an older build's: its prompt answers are dated as one set.
  fieldRecordGroups(kind, copy.value, { wholePrompts: true }).forEach((entry, group) => {
    if (!emptyGroupSignature(kind, group, entry.signature)) setOwn(out, group, -at);
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
  const times = normalizeFieldEditedAt(previousEditedAt) || {};
  if (!kind || !edit || !isFieldRecord(next)) return times;
  // A draft an older build touched is dated as that build dates it: the set whole.
  const wholePrompts = isFieldRecord(previous) && olderBuildPrompts(kind, previous, normalizeFieldEditedAt(previousEditedAt));
  const before = fieldRecordGroups(kind, previous, { wholePrompts });
  const after = fieldRecordGroups(kind, next, { wholePrompts });
  new Set([...before.keys(), ...after.keys()]).forEach((group) => {
    const was = before.get(group)?.signature;
    const is = after.get(group)?.signature;
    if (was === is) return;
    if (was === undefined && emptyGroupSignature(kind, group, is)) return;
    setOwn(times, group, now);
  });
  return wholePrompts ? promptsAsOneSet(times) : withPromptGroupTime(kind, times);
};

/**
 * Two copies of one field-record draft, merged answer by answer — or null to
 * apply the ordinary rule (the newer copy, whole).
 *
 * A copy: `{ value, savedAt, savedAtIsEdit, fieldEditedAt, fieldsFresh,
 * resetAt }`. `canonicalAt` is the question's last submitted attempt, when
 * known: two copies on either side of it never merge answer by answer — the
 * earlier is the submitted attempt's draft, history, and the later copy wins
 * whole, exactly as before this merge existed. `prefer` ('a' or 'b') breaks a
 * tie no other rule decides: the server keeps the incoming write (the same
 * device re-sending), a device keeps its own. The result is never fresh.
 */
export const mergeFieldRecordCopies = ({ kind, a, b, prefer = 'b', canonicalAt = 0 } = {}) => {
  if (!kind || !a || !b) return null;
  const aAt = Math.max(0, Number(a.savedAt) || 0);
  const bAt = Math.max(0, Number(b.savedAt) || 0);
  const submittedAt = Math.max(0, Number(canonicalAt) || 0);
  const aRecord = isFieldRecord(a.value);
  const bRecord = isFieldRecord(b.value);
  const resetAt = Math.max(resetTimeOf(a), resetTimeOf(b));
  const resetMarker = resetAt > 0 ? { resetAt } : {};

  // Either side of a submission: the later copy, whole — still without any
  // answer the latest reset removed, and remembering that reset for every
  // later merge.
  if (submittedAt > 0 && (aAt <= submittedAt) !== (bAt <= submittedAt)) {
    const later = aAt > bAt ? a : b;
    const laterTimes = normalizeFieldEditedAt(later.fieldEditedAt);
    const wholePrompts = olderBuildPrompts(kind, later.value, laterTimes);
    const cut = resetTimeOf(later) >= resetAt ? 0 : resetAt;
    let value = later.value;
    let fieldEditedAt = laterTimes;
    if (cut && isFieldRecord(later.value) && laterTimes) {
      value = {};
      fieldEditedAt = {};
      fieldRecordGroups(kind, later.value, { wholePrompts }).forEach((entry, group) => {
        const time = rawTimeOf(laterTimes, group);
        if (Math.abs(time) <= cut) return;
        copyFieldRecordGroup(value, later.value, entry);
        setOwn(fieldEditedAt, group, time);
      });
    }
    return {
      value,
      savedAt: Math.max(aAt, bAt),
      savedAtIsEdit: later.savedAtIsEdit === true,
      fieldEditedAt: wholePrompts ? promptsAsOneSet(fieldEditedAt) : withPromptGroupTime(kind, fieldEditedAt),
      fieldsFresh: false,
      ...resetMarker,
    };
  }

  // A reset (null) and a record dated after it: only answers edited after the
  // reset survive it — unless the record was begun on that reset, when all of
  // its answers are after it. (A record dated before the reset is older.)
  if (!aRecord || !bRecord) {
    let record = null;
    if (aRecord && b.value === null && b.savedAtIsEdit === true && aAt > bAt) record = a;
    if (bRecord && a.value === null && a.savedAtIsEdit === true && bAt > aAt) record = b;
    const recordTimes = record ? normalizeFieldEditedAt(record.fieldEditedAt) : null;
    if (!record || !recordTimes) return null;
    const wholePrompts = olderBuildPrompts(kind, record.value, recordTimes);
    const cut = resetTimeOf(record) >= resetAt ? 0 : resetAt;
    const kept = {};
    const keptTimes = {};
    fieldRecordGroups(kind, record.value, { wholePrompts }).forEach((entry, group) => {
      const time = rawTimeOf(recordTimes, group);
      if (cut && Math.abs(time) <= cut) return;
      copyFieldRecordGroup(kept, record.value, entry);
      if (time) setOwn(keptTimes, group, time);
    });
    return {
      value: kept,
      savedAt: Math.max(aAt, bAt),
      savedAtIsEdit: true,
      fieldEditedAt: wholePrompts ? promptsAsOneSet(keptTimes) : withPromptGroupTime(kind, keptTimes),
      fieldsFresh: false,
      ...resetMarker,
    };
  }

  // Both copies must say when their answers were edited — or one must be a
  // fresh copy, which then counts the other's answers as edited at its time.
  let aGroupTimes = normalizeFieldEditedAt(a.fieldEditedAt);
  let bGroupTimes = normalizeFieldEditedAt(b.fieldEditedAt);
  // Answer by answer only when this build dated both copies' prompt answers.
  const wholePrompts = olderBuildPrompts(kind, a.value, aGroupTimes) || olderBuildPrompts(kind, b.value, bGroupTimes);
  const groupsOf = (value) => fieldRecordGroups(kind, value, { wholePrompts });
  const legacyTimes = (copy, at) => {
    const times = {};
    groupsOf(copy.value).forEach((_, group) => setOwn(times, group, at));
    return times;
  };
  if (!aGroupTimes && bGroupTimes && b.fieldsFresh === true) aGroupTimes = legacyTimes(a, aAt);
  if (!bGroupTimes && aGroupTimes && a.fieldsFresh === true) bGroupTimes = legacyTimes(b, bAt);
  if (!aGroupTimes || !bGroupTimes) return null;

  // A copy that did not see the latest reset keeps nothing dated at or before it.
  const aCut = resetTimeOf(a) < resetAt ? resetAt : 0;
  const bCut = resetTimeOf(b) < resetAt ? resetAt : 0;
  const aGroups = groupsOf(a.value);
  const bGroups = groupsOf(b.value);
  const aFresh = a.fieldsFresh === true;
  const bFresh = b.fieldsFresh === true;
  const value = {};
  const fieldEditedAt = {};
  new Set([...aGroups.keys(), ...bGroups.keys(), ...Object.keys(aGroupTimes), ...Object.keys(bGroupTimes)]).forEach((group) => {
    let rawA = rawTimeOf(aGroupTimes, group);
    let rawB = rawTimeOf(bGroupTimes, group);
    let inA = aGroups.has(group);
    let inB = bGroups.has(group);
    if (aCut && Math.abs(rawA) <= aCut) { rawA = 0; inA = false; }
    if (bCut && Math.abs(rawB) <= bCut) { rawB = 0; inB = false; }
    const ta = Math.abs(rawA);
    const tb = Math.abs(rawB);
    // An upper bound against the other copy: that answer was edited after the
    // bound, or its copy was saved after it — then it is the newer one.
    const aBounded = rawA < 0;
    const bBounded = rawB < 0;
    const boundedWinner = () => {
      if (!(inA && inB) || (!aBounded && !bBounded)) return null;
      if (aBounded && bBounded) return ta === tb ? null : (ta > tb ? 'a' : 'b');
      if (aBounded) return tb > ta || bAt > ta ? 'b' : 'a';
      return ta > tb || aAt > tb ? 'a' : 'b';
    };
    let winner;
    if (!inA && !inB) winner = ta >= tb ? 'a' : 'b';
    // A copy that lacks the answer and never removed it has nothing to say about it.
    else if (inA && !inB && !tb) winner = 'a';
    else if (inB && !inA && !ta) winner = 'b';
    else if (isCoupledGroup(kind, group) && aFresh !== bFresh && (aFresh ? (inB && tb > 0) : (inA && ta > 0))) winner = aFresh ? 'b' : 'a';
    else if (boundedWinner()) winner = boundedWinner();
    else if (ta !== tb) winner = ta > tb ? 'a' : 'b';
    // The same edit time, and one copy lacks the answer: that copy was written
    // without editing it (a write-back), so the answer is kept.
    else if (inA !== inB) winner = inA ? 'a' : 'b';
    else if (aFresh !== bFresh) winner = aFresh ? 'b' : 'a';
    else if (aAt !== bAt) winner = aAt > bAt ? 'a' : 'b';
    else winner = prefer === 'a' ? 'a' : 'b';
    const winnerHolds = winner === 'a' ? inA : inB;
    if (winnerHolds) {
      const source = winner === 'a' ? a.value : b.value;
      const groups = winner === 'a' ? aGroups : bGroups;
      copyFieldRecordGroup(value, source, groups.get(group));
    }
    // The winner's time, an upper bound staying one; with no bound, the later.
    const time = aBounded || bBounded ? ((winner === 'a' ? rawA : rawB) || (winner === 'a' ? rawB : rawA)) : Math.max(ta, tb);
    if (time) setOwn(fieldEditedAt, group, time);
  });
  const newer = aAt === bAt ? (prefer === 'a' ? a : b) : (aAt > bAt ? a : b);
  return {
    value,
    savedAt: Math.max(aAt, bAt),
    savedAtIsEdit: newer.savedAtIsEdit === true || a.savedAtIsEdit === true || b.savedAtIsEdit === true,
    fieldEditedAt: wholePrompts ? promptsAsOneSet(fieldEditedAt) : withPromptGroupTime(kind, fieldEditedAt),
    fieldsFresh: false,
    ...resetMarker,
  };
};

const decodeFieldRecordCopy = (entry) => {
  let value;
  try {
    value = JSON.parse(entry.valueJson);
  } catch {
    return null;
  }
  return { ...entry, value, fieldEditedAt: decodeFieldEditedAt(entry) };
};

/**
 * The stored entry two copies of one field-record draft become, or null to
 * apply the ordinary rule. Either copy may say when the question was last
 * submitted (`canonicalAt`); the later of the two applies.
 */
const mergeFieldRecordEntries = (kind, current, incoming) => {
  const a = decodeFieldRecordCopy(current);
  const b = decodeFieldRecordCopy(incoming);
  if (!a || !b) return null;
  const canonicalAt = Math.max(Number(current.canonicalAt) || 0, Number(incoming.canonicalAt) || 0);
  const merged = mergeFieldRecordCopies({ kind, a, b, prefer: 'b', canonicalAt });
  if (!merged) return null;
  // Too big to store merged: a fresh copy holds only what one device touched
  // before it read this one, so the copy already here is kept whole rather
  // than replaced by it. Any other copy is newer whole, as for tool records.
  if (!sanitizeWorkspaceDraftValue(merged.value).ok) return incoming.fieldsFresh === true ? current : null;
  const { fieldEditedAtJson: _stale, fieldsFresh: _fresh, resetAt: _reset, ...rest } = incoming;
  return storableEntry({ ...rest, ...merged, canonicalAt, savedAtIsEdit: merged.savedAtIsEdit });
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
const positiveTime = (value) => (Number(value) > 0 && Number.isFinite(Number(value)) ? Number(value) : 0);
const fieldRecordMarkers = (key, entry) => {
  if (!fieldRecordDraftKind(key)) return {};
  const markers = {};
  let times = normalizeFieldEditedAt(entry?.fieldEditedAt);
  if (!times && typeof entry?.fieldEditedAtJson === 'string') {
    try { times = normalizeFieldEditedAt(JSON.parse(entry.fieldEditedAtJson)); } catch { times = null; }
  }
  const json = times ? stableJson(times) : null;
  if (json && json.length <= MAX_WORKSPACE_DRAFT_VALUE_BYTES) {
    markers.fieldEditedAtJson = json;
    if (entry?.fieldsFresh === true) markers.fieldsFresh = true;
  }
  // The latest reset this copy saw, and the question's last submission as the
  // saving device knew it (mergeFieldRecordCopies).
  const resetAt = positiveTime(entry?.resetAt);
  if (resetAt) markers.resetAt = resetAt;
  const canonicalAt = positiveTime(entry?.canonicalAt);
  if (canonicalAt) markers.canonicalAt = canonicalAt;
  return markers;
};

/*
 * WHICH VERSION OF A PERSONALIZED QUESTION THE STUDENT WAS SHOWN (RT15).
 *
 * A Question Family slot is pinned on the device the moment it renders
 * (familyDeliveryPins.js) and on the question record at the first Submit. In
 * between, another Chromebook had only a fresh allocation to go on, and that
 * differs whenever the seats moved — a provisional seat, then the teacher's
 * app seating the class — so the student could open their work and find
 * different numbers. The pin now rides this document too: one per slot and
 * variant, the FIRST a device saved (it is what was shown, and the first
 * showing is the one the student may be working on). It is replaced only when
 * this build cannot read it, or by a device that was offered it and had to
 * drop it (`replace`: refused, or no longer replays).
 *
 * It holds no answer — it is the same pin the device keeps and the record
 * will carry — and it is never trusted: a device checks it exactly as it
 * checks its own (familyDelivery.js buildStudentFamilyContext), so a pin the
 * server would refuse is dropped there. A document with no pins carries no
 * `deliveryPins` field, so it is stored exactly as before.
 */
export const MAX_WORKSPACE_DELIVERY_PINS = 120;

/** One pin per slot and variant. */
export const deliveryPinKey = (pin) => `${pin?.slot || ''}|v${Number(pin?.variant) || 0}`;

const storableDeliveryPin = (raw) => {
  const pin = normalizeDeliveryPin(raw);
  return pin?.slot ? pin : null;
};

/** The pins a stored document holds, by deliveryPinKey (malformed ones dropped). */
export const readWorkspaceDeliveryPins = (document) => {
  const pins = new Map();
  (Array.isArray(document?.deliveryPins) ? document.deliveryPins : []).forEach((raw) => {
    const pin = storableDeliveryPin(raw);
    if (pin && !pins.has(deliveryPinKey(pin))) pins.set(deliveryPinKey(pin), pin);
  });
  return pins;
};

const patchDeliveryPins = (deliveryPins) => (Array.isArray(deliveryPins) ? deliveryPins : [])
  .map((entry) => {
    const pin = storableDeliveryPin(entry?.pin);
    return pin ? { pin, ...(entry?.replace === true ? { replace: true } : {}) } : null;
  })
  .filter(Boolean);

// First saved wins; an unreadable stored pin, or one a device had to drop
// (`replace`), gives way. Bounded like the entries; a pin past the cap stays
// on the device that showed it.
const mergeDeliveryPins = (existing, incoming) => {
  const pins = readWorkspaceDeliveryPins(existing);
  incoming.forEach(({ pin, replace }) => {
    const key = deliveryPinKey(pin);
    if (pins.has(key) && replace !== true) return;
    if (!pins.has(key) && pins.size >= MAX_WORKSPACE_DELIVERY_PINS) return;
    pins.set(key, pin);
  });
  return [...pins.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, pin]) => pin);
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
  // [{ pin, replace? }]: the delivery pins this device has to add (RT15).
  deliveryPins = [],
} = {}) => {
  const pins = patchDeliveryPins(deliveryPins);
  return {
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
    ...(pins.length ? { deliveryPins: pins } : {}),
  };
};

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
    // A field-record entry replaced whole still remembers the latest submission
    // either copy knew of, so a later merge can tell history from new work.
    const knownCanonical = fieldKind && current ? Math.max(Number(current.canonicalAt) || 0, Number(entry.canonicalAt) || 0) : 0;
    byKey.set(entry.key, knownCanonical ? { ...entry, canonicalAt: knownCanonical } : entry);
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
  // Every pin already stored is kept (a patch that adds none keeps them all).
  const deliveryPins = mergeDeliveryPins(existing, patchDeliveryPins(patch.deliveryPins));

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
    // Which version of each personalized question was shown (RT15, above).
    ...(deliveryPins.length ? { deliveryPins } : {}),
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
