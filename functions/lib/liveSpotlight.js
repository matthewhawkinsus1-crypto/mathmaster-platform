const SPOTLIGHT_FRAME_COLLECTION = "liveSpotlightFrames";
const SPOTLIGHT_CLEANUP_BATCH_SIZE = 500;

function timestampMillis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function expiredSpotlightFrame(frame, nowMs = Date.now()) {
  const expiresAt = timestampMillis(frame?.expiresAt);
  return expiresAt !== null && expiresAt <= nowMs;
}

async function deleteExpiredSpotlightFrames(db, { now = new Date(), limit = SPOTLIGHT_CLEANUP_BATCH_SIZE } = {}) {
  const snapshot = await db.collection(SPOTLIGHT_FRAME_COLLECTION)
    .where("expiresAt", "<=", now)
    .limit(limit)
    .get();
  let deleted = 0;
  for (const candidate of snapshot.docs) {
    // Re-read in a transaction so a stale query result cannot delete a frame
    // whose expiry was legitimately extended by a future contract revision.
    // eslint-disable-next-line no-await-in-loop
    const removed = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      if (!current.exists || !expiredSpotlightFrame(current.data(), now.getTime())) return false;
      transaction.delete(candidate.ref);
      return true;
    });
    if (removed) deleted += 1;
  }
  return { deleted, scanned: snapshot.size };
}

module.exports = {
  SPOTLIGHT_CLEANUP_BATCH_SIZE,
  SPOTLIGHT_FRAME_COLLECTION,
  deleteExpiredSpotlightFrames,
  expiredSpotlightFrame,
  timestampMillis,
};
