// PLATFORM: which build is live, student presence and spotlight frames.
//
// One of the domain modules functions/index.js loads (see its header). The
// code here was moved from index.js as it stood; helpers that another domain
// also uses are in functionsCommon.js.

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall } = require("firebase-functions/v2/https");
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const liveSpotlight = require("./lib/liveSpotlight");
const studentSessionSummary = require("./lib/studentSessionSummary");
const { deployProvenance } = require("./lib/deployProvenance");
const {
  STUDENT_SESSION_SUMMARY_COLLECTION,
  studentIdentity,
} = require("./functionsCommon");

// WHICH COMMIT IS LIVE (F-REL-3). Read-only and deliberately unauthenticated:
// it returns this deployment's provenance and nothing else — no request data,
// no Firestore, no secret. mathmaster-build.json already publishes the Hosting
// commit the same way. scripts/release-firebase.mjs redeploys it in every
// functions release and then calls it to prove the functions now serve the
// commit it just deployed; `--whats-live` reads it too. Capped at two
// instances so an anonymous caller cannot scale it into a bill.
exports.platformBuildInfo = onCall({ maxInstances: 2 }, () => ({
  codebase: deployProvenance.codebase,
  gitSha: deployProvenance.gitSha,
  gitShaShort: deployProvenance.gitShaShort,
  treeClean: deployProvenance.treeClean,
  writtenAt: deployProvenance.writtenAt,
}));
const PRESENCE_STALE_AFTER_MS = 3 * 60 * 1000;

async function archiveStudentPresenceSnapshot({
  live = {},
  studentId: suppliedStudentId = null,
  observedAt = null,
} = {}) {
  const studentId = String(suppliedStudentId || live.studentId || "").trim();
  const assignmentId = String(live.assignmentId || "").trim();
  const startedAt = Number(live.startedAt) || 0;
  const summaryId = studentSessionSummary.sessionSummaryIdFor({ studentId, assignmentId, startedAt });
  if (!summaryId) return false;

  const db = getFirestore();
  const grade = await db.collection("grades").doc(studentId).get();
  // No roster row, no summary (SI06). A student permanently deleted while
  // their tab was open leaves a presence document behind (and an ID token
  // that worked for up to an hour); when it is swept or deleted, archiving it
  // would write a durable record of a student the deletion just erased. A
  // student with no row cannot sign in, so nothing real is lost.
  if (!grade.exists) return false;
  const gradeData = grade.data() || {};
  const ref = db.collection(STUDENT_SESSION_SUMMARY_COLLECTION).doc(summaryId);
  const endedAt = Number(observedAt) || Number(live.updatedAt) || Date.now();
  // The shared name resolver: the summary keeps a real name or null, never the id.
  const names = await studentIdentity();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? (snapshot.data() || {}) : {};
    const summary = studentSessionSummary.buildMergedSessionSummary({
      live,
      gradeData,
      studentId,
      previous,
      observedAt: endedAt,
      names,
    });
    if (!summary) return;

    transaction.set(ref, {
      ...summary,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: previous.createdAt || FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return true;
}

// Normal clean exit. The stable session id means an accidental duplicate delete
// can only merge into the same compact record; it cannot manufacture another
// class session.
exports.archiveStudentPresenceSession = onDocumentDeleted("presence/{studentId}", async (event) => {
  const live = event.data?.data() || {};
  await archiveStudentPresenceSnapshot({
    live,
    studentId: event.params.studentId,
    observedAt: Number(live.updatedAt) || Date.now(),
  });
});

// Browsers cannot guarantee a Firestore delete when a Chromebook tab is killed,
// the device sleeps, or Wi-Fi disappears. Sweep only documents whose heartbeat
// has been stale for at least three minutes. The transaction re-checks the live
// document immediately before deleting it, so a student who just reconnected is
// never expired by an old query result. The deletion trigger above performs the
// archive.
exports.expireStaleStudentPresence = onSchedule({
  schedule: "every 5 minutes",
  // setGlobalOptions({ invoker: "public" }) exists for Firebase client callables.
  // A scheduler job is server infrastructure, so override that global HTTPS
  // setting here rather than exposing the cleanup endpoint publicly.
  invoker: "private",
}, async () => {
  const db = getFirestore();
  const cutoff = Date.now() - PRESENCE_STALE_AFTER_MS;
  const stale = await db.collection("presence")
    .where("updatedAt", "<", cutoff)
    .limit(500)
    .get();

  let expired = 0;
  for (const candidate of stale.docs) {
    // eslint-disable-next-line no-await-in-loop
    const didExpire = await db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidate.ref);
      if (!current.exists) return false;
      const live = current.data() || {};
      if ((Number(live.updatedAt) || 0) >= cutoff) return false;
      transaction.delete(candidate.ref);
      return true;
    });
    if (didExpire) expired += 1;
  }

  if (expired) {
    logger.info("Expired stale student presence documents", {
      expired,
      scanned: stale.size,
      cutoff,
    });
  }
});

// Client stop paths erase frames immediately. This sweep is the backstop for
// killed tabs, closed Chromebooks and lost networks: expired response-bearing
// presentation content is physically removed rather than retained as history.
exports.deleteExpiredStudentSpotlightFrames = onSchedule({
  schedule: "every 5 minutes",
  invoker: "private",
}, async () => {
  const result = await liveSpotlight.deleteExpiredSpotlightFrames(getFirestore());
  if (result.deleted) logger.info("Deleted expired Student Spotlight frames", result);
});
