/*
 * UNFINISHED WORK THAT SURVIVES LEAVING THE QUESTION.
 *
 * `QuestionEngine` remounts a question workspace every time the student moves
 * between questions — deliberately, because keeping twenty workspaces mounted
 * is what made navigation slow. Anything a registry tool kept in `useState`
 * therefore died at the first Next, and came back blank. That is the bug this
 * module closes: a student who typed into the Function Operations Workbench,
 * went to question 4 and came back found the box empty, and they had never
 * pressed Submit, so none of the Persistence V3 submission machinery had any
 * reason to have heard about it.
 *
 * THE PATH A KEYSTROKE TAKES, AND WHAT IT DOES NOT TOUCH:
 *
 *   student edit
 *     -> setState (the UI has already continued)
 *     -> one localStorage write, synchronous, sub-millisecond
 *     -> writeQuestionDraft notifies the workspace sync, which returns
 *        immediately and coalesces a background Firestore write
 *
 * No Firestore call, no Functions call, no network, no await is on that path.
 * The local draft IS the durability layer; the server copy is a backup for the
 * Chromebook that never comes back.
 *
 * A draft is NOT a submission. Restoring one puts values back in the boxes and
 * nothing else: no attempt, no attempt count, no correctness, no partial
 * credit, no evidence, no Classroom passback. Once the student presses Submit,
 * PR #247's durable submission path owns the outcome and this layer only keeps
 * the workspace looking the way they left it.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  parseQuestionDraftKey,
  questionDraftEnvelopeVersion,
  questionDraftExists,
  questionDraftRestoreGeneration,
  questionDraftSavedAt,
  readQuestionDraft,
  removeQuestionDraft,
  studentInputMark,
  studentInputSince,
  writeQuestionDraft,
} from '../../questionDraftStorage.js';
import {
  TOOL_WORKSPACE_FRESH_FIELD,
  freshToolWorkspaceEdits,
  isSyncableDraftKey,
  isToolWorkspaceDraftKey,
  toolWorkspaceFields,
} from '../../../functions/shared/workspaceDraftSchema.mjs';
import { recordClientDiagnostic } from '../../platform/runtime/clientDiagnostics.js';

/*
 * `${draftKey}:work:${scope}` — one entry per tool workspace per question.
 *
 * It hangs off the question's own draft key, so it inherits every namespace
 * rule that key already encodes: the student, the assignment, the question
 * index, the VARIANT (a replacement question cannot restore the previous
 * variant's work) and the session bucket (post-deadline Practice Mode has its
 * own bucket and can never overwrite the graded workspace). It also inherits
 * the lifecycle: `removeQuestionDraftFamily(draftKey)` already clears
 * `draftKey` and everything under `draftKey:`, so a replacement question
 * retires this entry with the rest of the family and no new teardown path is
 * needed.
 */
export const TOOL_DRAFT_SEGMENT = 'work';
export const DEFAULT_TOOL_DRAFT_SCOPE = 'tool';

/*
 * The longest a high-frequency edit may exist only in memory.
 *
 * Typing, clicking and every discrete change write straight through — the
 * default is zero, and it stays zero. This budget exists for the one case that
 * cannot: a finger dragging a point emits pointermove at display rate, and
 * serialising the whole workspace sixty times a second is exactly the graph lag
 * this PR is not allowed to introduce. Those writers coalesce within this
 * window and persist immediately on pointer-up, so the worst a sudden shutdown
 * can cost is a fraction of one drag — never a typed value, and never a
 * finished drag.
 */
export const TOOL_DRAFT_COALESCE_MS = 120;

export const toolDraftKey = (draftKey, scope = DEFAULT_TOOL_DRAFT_SCOPE) => (
  draftKey ? `${draftKey}:${TOOL_DRAFT_SEGMENT}:${scope || DEFAULT_TOOL_DRAFT_SCOPE}` : null
);

const isPlainRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/*
 * A WORKSPACE THIS DEVICE STARTS FROM NOTHING SAYS SO (`__fresh`).
 *
 * The question opens before the server's copy of its drafts is read (PQ-044),
 * so on a Chromebook that has never held this work the record starts empty —
 * and every write saves the WHOLE record. The student's first edit there used
 * to become the newest copy of the entire workspace, and replaced the full
 * board on the server and on every device (workspaceDraftSchema.mjs, "a
 * workspace a device started from nothing").
 *
 * Such a record carries `__fresh`: the fields its student has edited. The
 * server merge lays those over the copy it holds instead of swapping the
 * record in, and reconcileToolWorkspaceDrafts settles this device's copy the
 * same way once the read lands; either drops the marker. A record begun on
 * anything stored — the student's own copy, a restored one, a reset's
 * tombstone — is not fresh, which is what keeps "Start over" stuck. Only a
 * synced tool workspace is marked: a secure item's or a preview's never is.
 */
const tracksFreshness = (key) => isToolWorkspaceDraftKey(key) && isSyncableDraftKey(key);

const readRecord = (key) => {
  const stored = readQuestionDraft(key, null);
  const fields = isPlainRecord(stored) ? toolWorkspaceFields(stored) : {};
  if (!tracksFreshness(key)) return { fields, fresh: null };
  const edited = freshToolWorkspaceEdits(stored);
  if (edited) return { fields, fresh: new Set(edited) };
  return { fields, fresh: questionDraftExists(key) ? null : new Set() };
};

/** What is written for a store: its fields, and its fresh marker while it has one. */
const storedRecord = (store) => (store.fresh
  ? { ...store.record, [TOOL_WORKSPACE_FRESH_FIELD]: [...store.fresh] }
  : store.record);

/*
 * One parsed record per key, shared by every field of the tool showing it.
 *
 * Without it each field would re-read and re-parse the same JSON, and — worse —
 * two fields writing in the same tick would each serialise from their own stale
 * copy and the second would erase the first.
 */
const stores = new Map();

/*
 * Bounded. A long assignment visits every question, and each visit parses one
 * small record; holding all of them for the session would be a slow leak on a
 * Chromebook that stays on a page all period. The oldest entry is flushed
 * before it is dropped, so eviction can never cost an edit.
 */
const MAX_CACHED_WORKSPACES = 48;

const evictOldest = () => {
  while (stores.size > MAX_CACHED_WORKSPACES) {
    const oldest = stores.keys().next().value;
    const store = stores.get(oldest);
    if (store) flushStore(store);
    stores.delete(oldest);
  }
};

const loadStore = (key) => {
  const generation = questionDraftRestoreGeneration();
  let store = stores.get(key);
  if (!store) {
    const loaded = readRecord(key);
    store = { key, record: loaded.fields, fresh: loaded.fresh, generation, timer: null, pending: false, pendingEdit: false };
    stores.set(key, store);
    evictOldest();
    return store;
  }
  // A server workspace restore wrote straight into local storage behind us.
  // Its copy was already checked against this device's and against the
  // question's last canonical attempt, so it outranks anything cached here.
  // So does a fresh record settled against the server's copy.
  if (store.generation !== generation) {
    flushStore(store);
    const loaded = readRecord(key);
    store.record = loaded.fields;
    store.fresh = loaded.fresh;
    store.generation = generation;
  }
  return store;
};

function flushStore(store) {
  if (store.timer !== null) {
    clearTimeout(store.timer);
    store.timer = null;
  }
  if (!store.pending) return false;
  store.pending = false;
  // An edit if any change it coalesced was one (see commitField).
  const edit = store.pendingEdit === true;
  store.pendingEdit = false;
  writeQuestionDraft(store.key, storedRecord(store), { edit });
  return true;
}

/** Persist every workspace that is mid-coalesce. Cheap when nothing is. */
export const flushToolDrafts = () => {
  let flushed = 0;
  stores.forEach((store) => { if (flushStore(store)) flushed += 1; });
  return flushed;
};

/*
 * A drag that ends because the tab is hidden still ends. Registered once, at
 * module scope, because a per-tool listener would be added and removed on every
 * navigation and a crash during that gap is exactly when this matters.
 */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', flushToolDrafts);
  window.addEventListener('beforeunload', flushToolDrafts);
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushToolDrafts(); });
  }
}

/*
 * `edit`: did the student make this change (PQ-044)? A tool that sets a field
 * from an effect as it mounts — normalising what it restored, deriving a
 * default — is not editing, and must not make the record look newer than work
 * saved on another Chromebook. usePersistentToolState answers it per mounted
 * field; see writeQuestionDraft for what the answer changes.
 */
const commitField = (key, field, value, coalesceMs, edit = true) => {
  if (!key) return false;
  // Through loadStore, so an edit that lands after a restore (or a fresh
  // record's settling) and before the remount is applied to what was
  // restored, not to the cached copy it replaced.
  const store = loadStore(key);
  store.record = { ...store.record, [field]: value };
  if (store.fresh && edit) store.fresh.add(field);
  if (!coalesceMs) {
    store.pending = false;
    // A coalesced edit still waiting goes out with this write, as an edit.
    const coalescedEdit = store.pendingEdit === true;
    store.pendingEdit = false;
    if (store.timer !== null) { clearTimeout(store.timer); store.timer = null; }
    return writeQuestionDraft(key, storedRecord(store), { edit: edit || coalescedEdit }) !== false;
  }
  store.pending = true;
  store.pendingEdit = store.pendingEdit === true || edit;
  if (store.timer === null) {
    store.timer = setTimeout(() => { store.timer = null; flushStore(store); }, coalesceMs);
  }
  return true;
};

/*
 * How much newer a submitted answer has to be before it retires a draft.
 *
 * Not zero, and the reason is a clock rather than a policy. The canonical
 * attempt is timestamped when the attempt is recorded; the workspace is
 * re-stamped a moment later, when the submission returns — and under server
 * grading the two timestamps come from two different machines. A strict
 * comparison would read that ordinary gap, or a few seconds of clock skew, as
 * "this device is stale" and blank a workspace the student had just submitted
 * from.
 *
 * A genuinely stale draft is one written before a submission made somewhere
 * else, which is minutes or hours behind, never seconds. The margin keeps the
 * rule and removes the false positive.
 */
export const TOOL_DRAFT_SUPERSEDE_MARGIN_MS = 5000;

/**
 * Is this workspace draft older than the question's last real submission?
 *
 * The precedence this decides, from strongest to weakest:
 *
 *   newer canonical/submitted state  >  local draft  >  server workspace draft
 *   >  blank
 *
 * Both sides are platform timestamps — `savedAt` is stamped by
 * `writeQuestionDraft` and `canonicalSavedAt` comes from the question record's
 * `lastAttemptAt` — rather than anything a tool reports about itself. A
 * submission made on this device re-stamps its own draft (see
 * `stampToolDraftSubmission`), so a draft that is genuinely older than the
 * canonical attempt can only have come from before that attempt, or from a
 * device that has been offline since. Either way the submitted answer is the
 * student's real state and the draft is history.
 */
export const toolDraftIsSuperseded = (key, canonicalSavedAt) => {
  const canonical = Number(canonicalSavedAt) || 0;
  if (!key || canonical <= 0) return false;
  const savedAt = questionDraftSavedAt(key);
  return savedAt > 0 && savedAt + TOOL_DRAFT_SUPERSEDE_MARGIN_MS < canonical;
};

const acquireRecord = (key, canonicalSavedAt) => {
  if (!key) return null;
  if (toolDraftIsSuperseded(key, canonicalSavedAt)) {
    // Retire it rather than leave it to lose the same race on every mount.
    // `readQuestionDraft` already drops expired drafts on read, so a
    // superseded one being dropped on read is the same lifecycle.
    stores.delete(key);
    removeQuestionDraft(key);
    return null;
  }
  return loadStore(key).record;
};

const resolveInitial = (initialValue) => (typeof initialValue === 'function' ? initialValue() : initialValue);

/*
 * A DRAFT IS READ BACK AS A CLAIM, NOT A FACT.
 *
 * What a field held when it was saved is whatever some build, on some device,
 * persisted — this one, an older one, another Chromebook through the server
 * backup. A tool renders from it the moment it mounts, so a shape it does not
 * expect is not a wrong answer, it is an exception: Warm-Up Question 1
 * (lmr-wu-1) threw `Cannot read properties of null` on a persisted `null`
 * where its card map belonged, on every reload and every device, because the
 * draft was still there each time.
 *
 * Two checks, both before the tool sees the value:
 *
 *   - the field's own `normalize` (usePersistentToolState's option), when the
 *     tool gives one. It knows the question — which cards exist, which slots —
 *     so it can keep the valid part of a draft and drop the rest. It returns
 *     `{ value, issues }`.
 *   - for EVERY draft-backed field, the collection-shape guard: a field that
 *     starts as a map ({}) restores only a map, and one that starts as a list
 *     ([]) only a list. Every such field in src/tools keeps its kind for life
 *     (no setter assigns one a scalar), so anything else is damage, and the
 *     field starts from its initial value instead. Scalar fields are left to
 *     the tool: `null` becoming a number is an ordinary edit there.
 *
 * `restored` is false when the initial value is used. `issues` is empty for a
 * clean draft. The stored record is not rewritten here: the next real edit
 * saves the repaired value, and until then the original stays where support
 * can read it.
 */
const isPlainMap = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const collectionKind = (value) => (Array.isArray(value) ? 'list' : isPlainMap(value) ? 'map' : null);

export const hydrateToolDraftField = ({ record, field, initialValue, normalize = null } = {}) => {
  const fallback = () => resolveInitial(initialValue);
  // `hasOwnProperty`, never a falsy test. A student who typed 12, deleted it and
  // navigated away must come back to an EMPTY box: the cleared value is their
  // work, and `record[field] || fallback` would hand them the 12 back.
  if (!isPlainMap(record) || !Object.prototype.hasOwnProperty.call(record, field)) {
    return { value: fallback(), restored: false, issues: [] };
  }
  let value = record[field];
  const issues = [];
  if (typeof normalize === 'function') {
    try {
      const result = normalize(value);
      value = result?.value;
      (Array.isArray(result?.issues) ? result.issues : []).forEach((issue) => issues.push(String(issue)));
    } catch {
      return { value: fallback(), restored: false, issues: ['normalize-failed'] };
    }
  }
  const initial = fallback();
  const expected = collectionKind(initial);
  if (expected && collectionKind(value) !== expected) {
    return { value: initial, restored: false, issues: [...issues, `expected-${expected}`] };
  }
  return { value, restored: true, issues };
};

/*
 * Say once, without the student, that a draft had to be repaired. The key
 * names the student, so only the assignment, the question's position and the
 * field go into the diagnostic (clientDiagnostics.js scrubs and bounds it).
 */
const reportDraftRepair = (key, field, issues) => {
  if (!issues.length) return;
  const identity = parseQuestionDraftKey(key);
  const where = identity
    ? `assignment ${identity.assignmentId} q${identity.questionIndex} v${identity.variantIndex} ${identity.toolSuffix}`
    : 'unscoped';
  const message = `${field}: ${issues.join(', ')} (${where}, draft v${questionDraftEnvelopeVersion(key)})`;
  console.warn(`MathMaster repaired a saved draft before showing it — ${message}`);
  recordClientDiagnostic({ kind: 'draft-repaired', source: 'tool-draft', message });
};

const restoreField = (key, field, initialValue, canonicalSavedAt, normalize = null) => {
  const record = acquireRecord(key, canonicalSavedAt);
  const result = hydrateToolDraftField({ record, field, initialValue, normalize });
  reportDraftRepair(key, field, result.issues);
  return result.value;
};

/**
 * Read a tool's whole persisted workspace. For tests and for tools that restore
 * several fields as one object.
 */
export const readToolDraftRecord = (draftKey, scope = DEFAULT_TOOL_DRAFT_SCOPE) => {
  const key = toolDraftKey(draftKey, scope);
  return key ? { ...loadStore(key).record } : {};
};

/**
 * Forget every cached workspace under a question's draft key.
 *
 * Called beside `removeQuestionDraftFamily` when a question is replaced. The
 * storage entries go, and this drops the parsed copies that would otherwise
 * still be able to answer a read — which is how a replacement question could
 * come up holding the previous variant's work.
 */
export const forgetToolDrafts = (draftKey) => {
  if (!draftKey) return 0;
  const prefix = `${draftKey}:${TOOL_DRAFT_SEGMENT}:`;
  let forgotten = 0;
  [...stores.keys()].forEach((key) => {
    if (key !== draftKey && !key.startsWith(prefix)) return;
    const store = stores.get(key);
    if (store?.timer !== null && store?.timer !== undefined) clearTimeout(store.timer);
    stores.delete(key);
    forgotten += 1;
  });
  return forgotten;
};

/**
 * Forget every cached tool workspace for one student/assignment.
 *
 * localStorage can be cleared independently of this module-level parsed cache
 * (teacher "Restart Preview Fresh" is the important case). Clearing only disk
 * and leaving this cache alive resurrects the supposedly deleted answers on
 * the next mount.
 */
/**
 * Forget every cached tool workspace under a whole draft FAMILY — a secure
 * session, one secure item, a teacher's preview. forgetToolDrafts matches one
 * item's `:work:` keys only; a family sits a level above them. A family whose
 * storage was cleared must lose this cache too, or the next write (a submit's
 * stamp, a remount reading the cache) puts the cleared work straight back.
 */
export const forgetToolDraftFamily = (prefix) => {
  if (!prefix) return 0;
  let forgotten = 0;
  [...stores.keys()].forEach((key) => {
    if (key !== prefix && !key.startsWith(`${prefix}:`)) return;
    const store = stores.get(key);
    if (store?.timer !== null && store?.timer !== undefined) clearTimeout(store.timer);
    stores.delete(key);
    forgotten += 1;
  });
  return forgotten;
};

export const forgetAssignmentToolDrafts = ({ studentId, assignmentId } = {}) => {
  const wantedStudent = String(studentId ?? '');
  const wantedAssignment = String(assignmentId ?? '');
  if (!wantedStudent || !wantedAssignment) return 0;
  let forgotten = 0;
  [...stores.keys()].forEach((key) => {
    const identity = parseQuestionDraftKey(key);
    if (!identity) return;
    if (identity.studentId !== wantedStudent || identity.assignmentId !== wantedAssignment) return;
    if (!String(identity.toolSuffix || '').startsWith(`${TOOL_DRAFT_SEGMENT}:`)) return;
    const store = stores.get(key);
    if (store?.timer !== null && store?.timer !== undefined) clearTimeout(store.timer);
    stores.delete(key);
    forgotten += 1;
  });
  return forgotten;
};

/**
 * Mark this question's workspace drafts as current at submission time.
 *
 * Without this, submitting would make the student's own work look stale: the
 * canonical attempt is stamped now, the draft that produced it was stamped a
 * few seconds ago, and `toolDraftIsSuperseded` would throw away the very values
 * the student just submitted the next time they opened the question. Re-stamping
 * keeps the rule meaningful — after this, an older draft really did come from
 * somewhere that has not seen the submission.
 *
 * It writes the SAME values back. It creates no attempt and changes no grade.
 */
export const stampToolDraftSubmission = (draftKey) => {
  if (!draftKey) return 0;
  const prefix = `${draftKey}:${TOOL_DRAFT_SEGMENT}:`;
  let stamped = 0;
  stores.forEach((store, key) => {
    if (!key.startsWith(prefix)) return;
    flushStore(store);
    // Deliberately the newest time: the student just submitted this work,
    // here (PQ-044 keeps every other unchanged write at its old time).
    writeQuestionDraft(key, storedRecord(store), { edit: true });
    stamped += 1;
  });
  return stamped;
};

/*
 * WHERE A TOOL'S DRAFT KEY COMES FROM.
 *
 * `QuestionEngine` mounts a registry tool with `questionData` and `onAction`
 * and nothing else — the same reason Universal Undo is a context rather than a
 * prop. Threading a key through every tool and every one of its mode
 * sub-components would put the burden on whoever writes the next tool, which is
 * how the gap this PR closes was created in the first place.
 */
const ToolDraftScopeContext = createContext(null);

export function ToolDraftScopeProvider({
  draftKey = null,
  scope = DEFAULT_TOOL_DRAFT_SCOPE,
  // Millisecond timestamp of the question's last canonical attempt, or 0 when
  // it has never been submitted.
  canonicalSavedAt = 0,
  children,
}) {
  const value = useMemo(() => ({
    key: toolDraftKey(draftKey, scope),
    draftKey,
    scope,
    canonicalSavedAt: Number(canonicalSavedAt) || 0,
  }), [draftKey, scope, canonicalSavedAt]);
  return React.createElement(ToolDraftScopeContext.Provider, { value }, children);
}

export const useToolDraftScope = () => useContext(ToolDraftScopeContext);

/**
 * `useState` for a value that is part of the student's answer.
 *
 * Drop-in: `const [value, setValue] = usePersistentToolState('sum', '')`. The
 * tool knows nothing about Firestore, nothing about the assignment, and nothing
 * about which student is signed in — it names the field, and the platform
 * decides where that lives and when it reaches the server.
 *
 * With no draft scope in the tree — the tools lab bench, a unit harness — it is
 * an ordinary `useState` and the tool still works.
 *
 * ONLY MATHEMATICS BELONGS HERE. Hover, animation, tooltips, transient error
 * text, measured viewports, loading flags, modal visibility, correctness
 * verdicts, answer keys and server feedback are presentation or grading, not
 * the student's work, and stay in plain `useState`.
 */
export default function usePersistentToolState(field, initialValue, options = {}) {
  const { coalesceMs = 0, enabled = true, normalize = null } = options;
  const scope = useToolDraftScope();
  const key = enabled ? scope?.key || null : null;
  const canonicalSavedAt = scope?.canonicalSavedAt || 0;
  const initialRef = useRef(initialValue);
  // Keep the latest question-specific initializer available for a key change.
  // Several registry tools derive defaults from questionData; if a host swaps
  // questions without remounting the tool, the new key must not fall back to
  // the previous question's defaults.
  initialRef.current = initialValue;
  // The field's own check of a restored value (see hydrateToolDraftField). It
  // usually closes over the question on screen, so the latest one is kept.
  const normalizeRef = useRef(normalize);
  normalizeRef.current = normalize;
  // Where "has the student touched the page since this field loaded?" is
  // measured from — per mounted field, because the parsed record is cached
  // across mounts and a tool that comes back after a question change has not
  // been edited by coming back (PQ-044).
  const inputMarkRef = useRef(0);
  const [value, setValue] = useState(() => {
    inputMarkRef.current = studentInputMark();
    return restoreField(key, field, initialRef.current, canonicalSavedAt, normalizeRef.current);
  });

  // The question can change UNDER a mounted tool: PathSessionPlayer renders one
  // QuestionEngine and swaps the question beneath it. Re-read rather than keep
  // showing the previous question's answer.
  const keyRef = useRef(key);
  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    inputMarkRef.current = studentInputMark();
    // `setValue`, not the persisting setter: reading a draft back is not an
    // edit and must not write it out again.
    setValue(restoreField(key, field, initialRef.current, canonicalSavedAt, normalizeRef.current));
  }, [key, field, canonicalSavedAt]);

  const setPersistentValue = useCallback((next) => {
    setValue((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      // Preserve React's no-op updater semantics: a tool that reports the same
      // state twice must not be handed a new reference, or a parent that renders
      // on identity change can loop.
      if (Object.is(resolved, current)) return current;
      // Persisted DURING the transition, not in a later effect. A Chromebook
      // that loses power between the two would lose the edit, and an effect
      // that never runs because the component unmounted first would lose it
      // every time.
      commitField(keyRef.current, field, resolved, coalesceMs, studentInputSince(inputMarkRef.current));
      return resolved;
    });
  }, [field, coalesceMs]);

  return [value, setPersistentValue];
}
