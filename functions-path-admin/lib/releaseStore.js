"use strict";

// Durable state for the Path release control plane.
//
// Three Firestore shapes, and the reason each one exists:
//
//   pathReleaseState/course              WHICH release production is serving,
//                                        and whether it is active or updating.
//   pathReleaseState/course/documentIndex/{shard}
//                                        the id -> content-hash map of the
//                                        active release. Comparing against this
//                                        is what makes an unchanged release cost
//                                        three document reads instead of a scan
//                                        of the whole secure bank.
//   pathReleaseJobs/{jobId}              one resumable job per release, with its
//                                        chunk plan in a subcollection so a job
//                                        that stops after chunk N resumes at
//                                        chunk N+1 rather than starting over.
//
// The job id IS the release id. That is the whole idempotency story: retrying a
// release finds the same job, never creates a second one, never re-writes a
// committed chunk, and never activates twice.

const { requireRuntime, importRuntime } = require("./runtime");

const BANK_COLLECTION = "pathQuestionBank";
const BUILT_IN_PATH_SEED_MARKER = "mathmaster-built-in-path-bank";
const LEGACY_BUILT_IN_PATH_SEED_SOURCE = "MathMaster curated starter coverage";

/** How long an in-flight attempt holds the release before another may take over. */
const JOB_LEASE_MS = 3 * 60 * 1000;

const plan = () => importRuntime("shared/pathReleasePlan.mjs");
const compiler = () => requireRuntime("lib/pathContentCompiler.js");

async function stateRef(db) {
  const { PATH_RELEASE_STATE_COLLECTION, COURSE_RELEASE_STATE_DOC } = await plan();
  return db.collection(PATH_RELEASE_STATE_COLLECTION).doc(COURSE_RELEASE_STATE_DOC);
}

async function readReleaseState(db) {
  const snapshot = await (await stateRef(db)).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function writeReleaseState(db, data) {
  await (await stateRef(db)).set(data, { merge: true });
  return data;
}

// ---------------------------------------------------------------------------
// The global release lease
// ---------------------------------------------------------------------------
//
// Mutual exclusion has to live on the thing that is SHARED, and what two
// releases share is production: the `pathQuestionBank` collection and the single
// `pathReleaseState/course` pointer. A lease held per job cannot see a different
// release at all — release A and release B write different job documents — so
// A's supersede list, computed before B activated, could delete documents B had
// just written and leave the pointer naming a bank that was never fully staged.
//
// So the lease lives on the course release state, and it is taken in a
// transaction: a read-then-write check can be passed by two callers at once,
// which is the same race one document lower down.

/** Whether a stored lease is still live and belongs to somebody else. */
function leaseHeldByAnother(state, { operationId, now, leaseMs = JOB_LEASE_MS }) {
  const holder = state?.leaseOperationId || null;
  if (!holder || holder === operationId) return false;
  const heartbeat = Number(state?.leaseHeartbeatAt || 0);
  return Number.isFinite(heartbeat) && now - heartbeat < leaseMs;
}

/**
 * Take the release lease, or report who is holding it.
 *
 * A stale lease is not a conflict: it is the interrupted release this design
 * exists to resume, and taking it over is how the resume happens.
 */
async function acquireCourseReleaseLease(db, {
  operationId,
  releaseId,
  actorUid = null,
  now = Date.now(),
  leaseMs = JOB_LEASE_MS,
} = {}) {
  const ref = await stateRef(db);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const state = snapshot.exists ? snapshot.data() : null;
    if (leaseHeldByAnother(state, { operationId, now, leaseMs })) {
      return {
        acquired: false,
        heldByReleaseId: state?.leaseReleaseId || null,
        heldSince: Number(state?.leaseHeartbeatAt || 0) || null,
      };
    }
    transaction.set(ref, {
      leaseOperationId: operationId,
      leaseReleaseId: releaseId,
      leaseActorUid: actorUid,
      leaseHeartbeatAt: now,
    }, { merge: true });
    return { acquired: true, heldByReleaseId: null, heldSince: null };
  });
}

/**
 * Keep the lease alive while a long phase runs.
 *
 * Refreshes the heartbeat ONLY while the lease is still ours. Writing the holder
 * unconditionally would let a release whose lease had already expired and been
 * taken over quietly take it back mid-staging, which is the exact overlap the
 * lease exists to prevent. Returns whether we still hold it.
 */
async function refreshCourseReleaseLease(db, { operationId, now = Date.now() } = {}) {
  const ref = await stateRef(db);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    if ((snapshot.data()?.leaseOperationId || null) !== operationId) return false;
    transaction.set(ref, { leaseHeartbeatAt: now }, { merge: true });
    return true;
  });
}

/**
 * Still ours?
 *
 * Checked again immediately before the two steps that cannot be undone — moving
 * the pointer and deleting superseded content — because a lease can expire under
 * a slow phase and someone else can legitimately have taken over by then.
 */
async function holdsCourseReleaseLease(db, { operationId } = {}) {
  const state = await readReleaseState(db);
  return (state?.leaseOperationId || null) === operationId;
}

/** Give the lease back, if it is ours to give. */
async function releaseCourseReleaseLease(db, { operationId } = {}) {
  const ref = await stateRef(db);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    if ((snapshot.data()?.leaseOperationId || null) !== operationId) return;
    transaction.set(ref, {
      leaseOperationId: null,
      leaseReleaseId: null,
      leaseActorUid: null,
      leaseHeartbeatAt: null,
    }, { merge: true });
  });
}

// ---------------------------------------------------------------------------
// The active release's document index
// ---------------------------------------------------------------------------

async function indexCollection(db) {
  const { RELEASE_INDEX_SUBCOLLECTION } = await plan();
  return (await stateRef(db)).collection(RELEASE_INDEX_SUBCOLLECTION);
}

/**
 * The id -> {contentHash, courseId} map of the release production is serving.
 *
 * Returns `{ source: 'index' | 'scan', entries }`. There is no index before the
 * first V2 activation, so the first release derives one by reading the secure
 * bank once and hashing what it finds with the same compiler hash — which means
 * a document whose stored content already matches the release is recognised as
 * unchanged and is not rewritten.
 */
async function readActiveReleaseIndex(db, { releaseId = null } = {}) {
  if (releaseId) {
    const snapshot = await (await indexCollection(db)).get();
    if (!snapshot.empty) {
      const entries = [];
      snapshot.docs.forEach((doc) => {
        const data = doc.data() || {};
        if (data.releaseId && releaseId && data.releaseId !== releaseId) return;
        const shardEntries = Array.isArray(data.entries) ? data.entries : [];
        shardEntries.forEach((entry) => entries.push({
          id: entry.id,
          contentHash: entry.contentHash,
          courseId: entry.courseId || null,
          managed: entry.managed !== false,
        }));
      });
      if (entries.length) return { source: "index", entries };
    }
  }
  return { source: "scan", entries: await scanActiveCourseBank(db) };
}

/**
 * One metadata pass over the secure bank, used only when no index exists yet.
 *
 * Assessment content is filtered out here and is never validated, never issued
 * against, and never written by a course release.
 */
async function scanActiveCourseBank(db) {
  const { pathDocumentContentHash } = compiler();
  const snapshot = await db.collection(BANK_COLLECTION).get();
  const entries = [];
  snapshot.docs.forEach((doc) => {
    const data = doc.data() || {};
    const framework = String(data?.assessmentContext?.framework || "course");
    if (framework !== "course") return;
    const managed = data.builtInPathSeed === BUILT_IN_PATH_SEED_MARKER
      || data?.seedMetadata?.source === LEGACY_BUILT_IN_PATH_SEED_SOURCE;
    entries.push({
      id: doc.id,
      // A document written by this control plane carries its hash. Anything else
      // is hashed from what is actually stored, so identical content is still
      // recognised as unchanged.
      contentHash: data.pathContentHash || pathDocumentContentHash({ id: doc.id, ...data }),
      courseId: data.courseId ? String(data.courseId) : null,
      managed,
    });
  });
  return entries;
}

/** Replace the stored index with the newly activated release's documents. */
async function writeActiveReleaseIndex(db, { releaseId, entries }) {
  const { RELEASE_INDEX_SHARD_SIZE } = await plan();
  const collection = await indexCollection(db);
  const existing = await collection.get();

  const shards = [];
  for (let index = 0; index < entries.length; index += RELEASE_INDEX_SHARD_SIZE) {
    shards.push(entries.slice(index, index + RELEASE_INDEX_SHARD_SIZE));
  }

  for (let shardIndex = 0; shardIndex < shards.length; shardIndex += 1) {
    // eslint-disable-next-line no-await-in-loop
    await collection.doc(`shard-${String(shardIndex).padStart(4, "0")}`).set({
      releaseId,
      shardIndex,
      entries: shards[shardIndex].map((entry) => ({
        id: entry.id,
        contentHash: entry.contentHash,
        courseId: entry.courseId || null,
        managed: true,
      })),
      updatedAt: Date.now(),
    });
  }

  // Retire shards a smaller release no longer needs.
  const keep = new Set(shards.map((_, shardIndex) => `shard-${String(shardIndex).padStart(4, "0")}`));
  const stale = existing.docs.filter((doc) => !keep.has(doc.id));
  for (let index = 0; index < stale.length; index += 200) {
    const batch = db.batch();
    stale.slice(index, index + 200).forEach((doc) => batch.delete(doc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return { shards: shards.length, retiredShards: stale.length };
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

async function jobRef(db, jobId) {
  const { PATH_RELEASE_JOB_COLLECTION } = await plan();
  return db.collection(PATH_RELEASE_JOB_COLLECTION).doc(jobId);
}

async function readJob(db, jobId) {
  const snapshot = await (await jobRef(db, jobId)).get();
  return snapshot.exists ? { jobId, ...snapshot.data() } : null;
}

async function writeJob(db, jobId, data) {
  await (await jobRef(db, jobId)).set({ ...data, updatedAt: Date.now() }, { merge: true });
}

/** The most recent job, for a status page that does not know the release id. */
async function readLatestJob(db) {
  const { PATH_RELEASE_JOB_COLLECTION } = await plan();
  const snapshot = await db.collection(PATH_RELEASE_JOB_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { jobId: doc.id, ...doc.data() };
}

async function chunkCollection(db, jobId) {
  return (await jobRef(db, jobId)).collection("chunks");
}

async function readChunkStates(db, jobId) {
  const snapshot = await (await chunkCollection(db, jobId)).get();
  const states = new Map();
  snapshot.docs.forEach((doc) => states.set(Number(doc.id.replace(/^chunk-/, "")), doc.data() || {}));
  return states;
}

/**
 * Persist the write plan as soon as it is decided.
 *
 * Chunk INDEXES only mean something relative to one plan, and the plan derived
 * from a fresh comparison shifts as staging progresses — documents an
 * interrupted attempt already wrote are correctly seen as unchanged the next
 * time, so re-deriving the plan on resume would renumber the chunks and skip the
 * wrong ones. Writing the plan down once makes "continue at chunk N+1" mean what
 * it says.
 */
async function writeChunkPlan(db, jobId, chunks) {
  const collection = await chunkCollection(db, jobId);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    // eslint-disable-next-line no-await-in-loop
    await collection.doc(`chunk-${String(chunk.index).padStart(5, "0")}`).set({
      index: chunk.index,
      ids: chunk.ids,
      status: "pending",
      documentCount: chunk.ids.length,
      plannedAt: Date.now(),
    });
  }
  return chunks.length;
}

/**
 * Throw away a job's recorded plan.
 *
 * Chunk indexes only mean something relative to ONE plan. A completed job that is
 * being run again — a rollback to a release production is no longer serving — is
 * a new execution against a different production state, and its old chunks would
 * mark the new plan's chunks complete and stage nothing at all.
 */
async function clearChunkPlan(db, jobId) {
  const collection = await chunkCollection(db, jobId);
  const snapshot = await collection.get();
  for (let index = 0; index < snapshot.docs.length; index += 200) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + 200).forEach((doc) => batch.delete(doc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return snapshot.size;
}

async function markChunkComplete(db, jobId, { index, ids, writtenAt = Date.now() }) {
  await (await chunkCollection(db, jobId)).doc(`chunk-${String(index).padStart(5, "0")}`).set({
    index,
    ids,
    status: "complete",
    documentCount: ids.length,
    writtenAt,
  }, { merge: true });
}

/**
 * Whether another attempt is currently working this job.
 *
 * A stale lease is not a conflict — it is exactly the interrupted release this
 * design exists to resume.
 */
function jobIsLeased(job, { now = Date.now(), operationId = null } = {}) {
  if (!job?.operationId || job.operationId === operationId) return false;
  const heartbeat = Number(job.heartbeatAt || job.updatedAt || 0);
  return Number.isFinite(heartbeat) && now - heartbeat < JOB_LEASE_MS;
}

module.exports = {
  BANK_COLLECTION,
  BUILT_IN_PATH_SEED_MARKER,
  JOB_LEASE_MS,
  readReleaseState,
  writeReleaseState,
  leaseHeldByAnother,
  acquireCourseReleaseLease,
  refreshCourseReleaseLease,
  holdsCourseReleaseLease,
  releaseCourseReleaseLease,
  readActiveReleaseIndex,
  scanActiveCourseBank,
  writeActiveReleaseIndex,
  readJob,
  writeJob,
  readLatestJob,
  readChunkStates,
  writeChunkPlan,
  clearChunkPlan,
  markChunkComplete,
  jobIsLeased,
};
