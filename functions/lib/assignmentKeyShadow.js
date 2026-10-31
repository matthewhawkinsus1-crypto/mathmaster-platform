"use strict";

/*
 * EVERY ASSIGNMENT'S ANSWER KEYS, WRITTEN IN SHADOW (D10 Phase 1, P1-4;
 * docs/handoffs/ANSWER_KEY_SERVER_SIDE_DESIGN.md §3; SI02).
 *
 * When an assignment is written, the shadowAssignmentKeys trigger
 * (functions/entry.js) splits its V5 sections with
 * functions/shared/assignmentKeySplit.mjs and stores the private parts in
 * `assignmentKeys/{assignmentId}`. IN SHADOW THE ASSIGNMENT KEEPS EVERY KEY:
 * the key document is a copy that nothing reads yet, so no student or teacher
 * sees any change. It is what the next steps are built on: the server readers
 * (P1-2), the parity audit (P1-5) and the backfill (P1-6).
 *
 * IDEMPOTENT BY sourceContentHash: the sha256 of the canonical JSON
 * (shared/idUtils.mjs stableStringify) of the sections a key document was
 * split from. A write that leaves the sections as they were — a due date, a
 * class toggle, a Classroom link — finds the key document current and writes
 * nothing, and so does a retried event.
 *
 * SAFE AGAINST EVENTS OUT OF ORDER. Firestore delivers trigger events at least
 * once and in no promised order, so an event's own snapshot is used only to
 * skip work. A write happens in a transaction that re-reads the assignment as
 * it is NOW: a late event for an older version cannot overwrite the keys of a
 * newer one, and a deleted assignment's key document is deleted.
 *
 * WHAT IS STORED (schemaVersion 1):
 *   { schemaVersion, status: 'split', splitVersion, sourceContentHash,
 *     keysByQuestionId: { [questionId]: storableItem(privatePart) }, updatedAt }
 * Private parts go through secureItemStorage.storableItem (design P1-3), so a
 * value holding an array inside an array is stored as JSON rather than refused
 * by Firestore. When the split refuses — a question with keys and no id, two
 * questions sharing one, a merge that would not give back the stored sections
 * exactly, a key document over the size limit — it stores
 *   { schemaVersion, status: 'unsplittable', reason, splitVersion, sourceContentHash, updatedAt }
 * with no keys, and a reader keeps using the assignment as it is.
 *
 * READS: the assignment's `schemaVersion` and `sections` only (a field mask:
 * the per-student fields an assignment can still carry are never read), and
 * the key document's version fields. Nothing here reads or writes anything a
 * student sees.
 */

const crypto = require("node:crypto");
const { storableItem, holdsNestedArray } = require("./secureItemStorage");

const ASSIGNMENTS = "assignments";
const SOURCE_FIELDS = Object.freeze(["schemaVersion", "sections"]);
const VERSION_FIELDS = Object.freeze(["schemaVersion", "splitVersion", "sourceContentHash"]);
// Firestore's limit is 1 MiB per document; the stored JSON is kept well under it.
const MAX_KEY_DOCUMENT_BYTES = 900 * 1024;

const SHADOW_OUTCOME = Object.freeze({
  CREATED: "created",
  UPDATED: "updated",
  CURRENT: "current",
  UNSPLITTABLE: "unsplittable",
  DELETED: "deleted",
  ABSENT: "absent",
  NOT_V5: "not-v5",
});

let splitModulePromise = null;
const splitModule = () => {
  if (!splitModulePromise) splitModulePromise = import("../shared/assignmentKeySplit.mjs");
  return splitModulePromise;
};
let idUtilsPromise = null;
const idUtils = () => {
  if (!idUtilsPromise) idUtilsPromise = import("../shared/idUtils.mjs");
  return idUtilsPromise;
};

/** sha256 of the canonical JSON of an assignment's sections. */
async function assignmentKeysSourceHash(sections) {
  const { stableStringify } = await idUtils();
  return crypto.createHash("sha256").update(stableStringify(sections ?? null)).digest("hex");
}

const isV5 = (assignment) => Boolean(assignment) && Number(assignment.schemaVersion) === 5 && Array.isArray(assignment.sections);

/** Is this key document already the split of these sections, under this split? */
async function keysAreCurrent(existing, sections) {
  if (!existing) return false;
  const split = await splitModule();
  return existing.schemaVersion === split.ASSIGNMENT_KEYS_SCHEMA_VERSION
    && existing.splitVersion === split.SPLIT_VERSION
    && existing.sourceContentHash === await assignmentKeysSourceHash(sections);
}

/**
 * What `assignmentKeys/{id}` should become, given the assignment as it is now
 * (null when deleted) and the key document as it is (null when absent). Pure:
 *   { action: 'write', document, outcome, keyedQuestions? , reason? }
 *   { action: 'delete', outcome }   { action: 'none', outcome }
 * `document` has no `updatedAt`; the writer adds the server's time.
 */
async function planAssignmentKeys({ assignment = null, existing = null } = {}) {
  if (!assignment) return existing ? { action: "delete", outcome: SHADOW_OUTCOME.DELETED } : { action: "none", outcome: SHADOW_OUTCOME.ABSENT };
  // Only V5 sections are read by anything (storedAssignmentV5.js); an older
  // document has no key document, and loses one it should not have.
  if (!isV5(assignment)) return existing ? { action: "delete", outcome: SHADOW_OUTCOME.DELETED } : { action: "none", outcome: SHADOW_OUTCOME.NOT_V5 };
  if (await keysAreCurrent(existing, assignment.sections)) return { action: "none", outcome: SHADOW_OUTCOME.CURRENT };

  const split = await splitModule();
  const base = {
    schemaVersion: split.ASSIGNMENT_KEYS_SCHEMA_VERSION,
    splitVersion: split.SPLIT_VERSION,
    sourceContentHash: await assignmentKeysSourceHash(assignment.sections),
  };
  const unsplittable = (reason) => ({
    action: "write",
    outcome: SHADOW_OUTCOME.UNSPLITTABLE,
    reason,
    document: { ...base, status: "unsplittable", reason },
  });

  let parts;
  try {
    const { publicSections, keysByQuestionId } = split.splitAssignment(assignment.sections);
    // Never store keys that would not give back exactly what is stored.
    const merged = split.mergeAssignment(publicSections, keysByQuestionId);
    if (JSON.stringify(merged) !== JSON.stringify(assignment.sections)) return unsplittable("round-trip-mismatch");
    parts = keysByQuestionId;
  } catch (error) {
    if (error && error.name === "AssignmentKeyError") return unsplittable(String(error.code || "refused"));
    throw error;
  }

  const keysByQuestionId = {};
  Object.keys(parts).forEach((questionId) => {
    Object.defineProperty(keysByQuestionId, questionId, {
      value: storableItem(parts[questionId]), enumerable: true, writable: true, configurable: true,
    });
  });
  const document = { ...base, status: "split", keysByQuestionId };
  if (holdsNestedArray(document)) return unsplittable("nested-array");
  if (Buffer.byteLength(JSON.stringify(document), "utf8") > MAX_KEY_DOCUMENT_BYTES) return unsplittable("too-large");
  return {
    action: "write",
    outcome: existing ? SHADOW_OUTCOME.UPDATED : SHADOW_OUTCOME.CREATED,
    keyedQuestions: Object.keys(keysByQuestionId).length,
    document,
  };
}

/**
 * Bring `assignmentKeys/{assignmentId}` in line with the assignment as it is
 * now, in one transaction. Returns the plan's outcome (and reason).
 */
async function syncAssignmentKeys({ db, assignmentId, serverTimestamp }) {
  const split = await splitModule();
  const assignmentRef = db.collection(ASSIGNMENTS).doc(assignmentId);
  const keysRef = db.collection(split.ASSIGNMENT_KEYS_COLLECTION).doc(assignmentId);
  return db.runTransaction(async (transaction) => {
    const [source] = await transaction.getAll(assignmentRef, { fieldMask: [...SOURCE_FIELDS] });
    const [keys] = await transaction.getAll(keysRef, { fieldMask: [...VERSION_FIELDS] });
    const plan = await planAssignmentKeys({
      assignment: source.exists ? source.data() : null,
      existing: keys.exists ? keys.data() : null,
    });
    if (plan.action === "write") transaction.set(keysRef, { ...plan.document, updatedAt: serverTimestamp() });
    if (plan.action === "delete") transaction.delete(keysRef);
    return { outcome: plan.outcome, reason: plan.reason || null, keyedQuestions: plan.keyedQuestions ?? null };
  });
}

/**
 * The trigger's body. `after` is the event's snapshot of the assignment after
 * the write (it may be missing). When those sections are already what the
 * key document was split from, nothing is read under a lock and nothing is
 * written; otherwise the transaction above decides from the current state.
 */
async function shadowAssignmentKeysOnWrite({ db, assignmentId, after = null, serverTimestamp }) {
  const data = after && after.exists ? (after.data() || {}) : null;
  if (data && isV5(data)) {
    const split = await splitModule();
    const [keys] = await db.getAll(db.collection(split.ASSIGNMENT_KEYS_COLLECTION).doc(assignmentId), { fieldMask: [...VERSION_FIELDS] });
    if (await keysAreCurrent(keys.exists ? keys.data() : null, data.sections)) {
      return { outcome: SHADOW_OUTCOME.CURRENT, reason: null, keyedQuestions: null };
    }
  }
  return syncAssignmentKeys({ db, assignmentId, serverTimestamp });
}

module.exports = {
  MAX_KEY_DOCUMENT_BYTES,
  SHADOW_OUTCOME,
  SOURCE_FIELDS,
  VERSION_FIELDS,
  assignmentKeysSourceHash,
  planAssignmentKeys,
  shadowAssignmentKeysOnWrite,
  syncAssignmentKeys,
};
