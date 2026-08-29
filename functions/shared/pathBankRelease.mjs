export const TSIA2_PATH_BANK_RELEASE = "tsia2-v2.1-authentic-language";

const TSIA2_FRAMEWORK = "tsia2";
const RELEASE_COLLECTION = "pathBankReleases";
const RELEASE_DOCUMENT = "tsia2";
const WRITE_CHUNK_SIZE = 400;

function normalizedRelease(value) {
  return String(value || "").trim();
}

function normalizedId(value) {
  return String(value || "").trim();
}

function isTsia2Record(record = {}) {
  return normalizedRelease(record.assessmentFramework) === TSIA2_FRAMEWORK;
}

/**
 * Pure migration planner. Keeping the selection policy free of Firestore makes
 * the release boundary independently testable and prevents a bank refresh from
 * accidentally broadening into SAT, ACT, or ordinary course Path state.
 */
export function planTsia2PathBankReleaseMigration({
  storedRelease = null,
  sessions = [],
  locks = [],
} = {}) {
  const release = TSIA2_PATH_BANK_RELEASE;
  if (normalizedRelease(storedRelease) === release) {
    return {
      noop: true,
      release,
      sessionIdsToRetire: [],
      lockIdsToDelete: [],
    };
  }

  const sessionIdsToRetire = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => isTsia2Record(session) && session?.status === "active")
    .map((session) => normalizedId(session?.id))
    .filter(Boolean);

  const lockIdsToDelete = (Array.isArray(locks) ? locks : [])
    .filter((lock) => isTsia2Record(lock))
    .map((lock) => normalizedId(lock?.id))
    .filter(Boolean);

  return {
    noop: false,
    release,
    sessionIdsToRetire,
    lockIdsToDelete,
  };
}

async function commitOperationsInChunks(db, operations) {
  for (let index = 0; index < operations.length; index += WRITE_CHUNK_SIZE) {
    const batch = db.batch();
    operations.slice(index, index + WRITE_CHUNK_SIZE).forEach((operation) => {
      if (operation.type === "delete") {
        batch.delete(operation.ref);
        return;
      }
      batch.set(operation.ref, operation.data, { merge: true });
    });
    // Firestore batches are intentionally sequential: if a later chunk fails,
    // the release marker is not written and the next admin refresh resumes the
    // idempotent migration instead of pretending it completed.
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

/**
 * Retire runtime state created against the pre-V2.1 TSIA2 bank.
 *
 * This is called only after the built-in bank replacement, superseded-record
 * cleanup, and stored coverage rebuild succeed. The marker is written last, so
 * an interrupted migration is safe to retry. Once the current release is
 * recorded, later built-in seed refreshes are no-ops and cannot retire newly
 * created TSIA2 sessions.
 */
export async function retireStaleTsia2PathStateForRelease(db, { now = Date.now() } = {}) {
  if (!db || typeof db.collection !== "function" || typeof db.batch !== "function") {
    throw new TypeError("A Firestore database instance is required for TSIA2 Path-bank retirement.");
  }

  const releaseRef = db.collection(RELEASE_COLLECTION).doc(RELEASE_DOCUMENT);
  const releaseSnapshot = await releaseRef.get();
  const storedRelease = releaseSnapshot.exists
    ? normalizedRelease(releaseSnapshot.data()?.release)
    : null;

  if (storedRelease === TSIA2_PATH_BANK_RELEASE) {
    return {
      ...planTsia2PathBankReleaseMigration({ storedRelease }),
      retiredSessionCount: 0,
      deletedLockCount: 0,
    };
  }

  // Single-field framework queries use Firestore's automatic indexes and avoid
  // requiring a new composite index solely for this one-time release migration.
  const [sessionSnapshot, lockSnapshot] = await Promise.all([
    db.collection("pathSessions").where("assessmentFramework", "==", TSIA2_FRAMEWORK).get(),
    db.collection("activePathLocks").where("assessmentFramework", "==", TSIA2_FRAMEWORK).get(),
  ]);

  const sessions = sessionSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const locks = lockSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const plan = planTsia2PathBankReleaseMigration({ storedRelease, sessions, locks });

  const sessionById = new Map(sessionSnapshot.docs.map((doc) => [doc.id, doc]));
  const lockById = new Map(lockSnapshot.docs.map((doc) => [doc.id, doc]));
  const operations = [];

  plan.sessionIdsToRetire.forEach((sessionId) => {
    const snapshot = sessionById.get(sessionId);
    if (!snapshot) return;
    operations.push({
      type: "set",
      ref: snapshot.ref,
      data: {
        status: "retired",
        retirementReason: "tsia2-path-bank-release",
        retiredForPathBankRelease: TSIA2_PATH_BANK_RELEASE,
        retiredAt: now,
        updatedAt: now,
      },
    });
  });

  plan.lockIdsToDelete.forEach((lockId) => {
    const snapshot = lockById.get(lockId);
    if (!snapshot) return;
    operations.push({ type: "delete", ref: snapshot.ref });
  });

  await commitOperationsInChunks(db, operations);

  // This write is deliberately last. It is the durable proof that every stale
  // active session and TSIA2 lock observed by this migration was handled.
  await releaseRef.set({
    framework: TSIA2_FRAMEWORK,
    release: TSIA2_PATH_BANK_RELEASE,
    appliedAt: now,
    retiredSessionCount: plan.sessionIdsToRetire.length,
    deletedLockCount: plan.lockIdsToDelete.length,
  }, { merge: true });

  return {
    ...plan,
    retiredSessionCount: plan.sessionIdsToRetire.length,
    deletedLockCount: plan.lockIdsToDelete.length,
  };
}
