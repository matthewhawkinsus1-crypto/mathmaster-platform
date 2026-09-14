"use strict";

// MathMaster Path Release V2 — administrative control plane.
//
// This is a SEPARATE Firebase Functions codebase (`path-admin`) and it exists
// for one reason: deploying a Path content release change should not redeploy
// and re-mutate the mature MathMaster backend.
//
//   firebase deploy --only functions:path-admin
//
// The default codebase loads `platformEntry.js` -> `entry.js` -> `index.js`, a
// 12,000-line module that pulls in Google Classroom, assignments, grading, the
// AI authoring stack and the whole Path runtime. Firebase loads that during
// FUNCTION DISCOVERY, which is why discovery has needed
// FUNCTIONS_DISCOVERY_TIMEOUT=60, and deploying it mutates hundreds of unrelated
// functions, which is why that has hit
//
//   HTTP 429 Per project mutation requests per minute per region
//
// Discovery of THIS file must stay near-instant, so it requires exactly two
// Firebase modules and nothing else. Every expensive module — the compiler, the
// release engine, the Path issuer, the certified package — is loaded inside a
// handler, after discovery, and only when that handler needs it.
//
// This codebase is additive. It defines no name the default codebase already
// owns, so deploying it cannot delete or take ownership of an existing function.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");

if (!getApps().length) initializeApp();

/** Lazily loaded so function discovery never pays for the release engine. */
const releaseService = () => require("./lib/releaseService");
const authorization = () => require("./lib/authorization");

const CALLABLE_OPTIONS = Object.freeze({
  timeoutSeconds: 540,
  memory: "1GiB",
  // One release at a time. Concurrent activation attempts are also refused by
  // the job lease, but not starting two is cheaper than resolving two.
  maxInstances: 2,
});

function releaseFailure(result) {
  // A structured content/release failure is a RESULT, not an exception: the
  // admin page renders the phase, the document, the property path and the
  // recommended next action. Throwing would reduce all of that to a generic
  // "internal" error in the browser.
  return {
    ok: false,
    phase: result.phase || null,
    diagnostic: result.diagnostic || null,
    diagnostics: result.diagnostics || [],
  };
}

/**
 * What the administrator needs to know before deciding anything: which release
 * is deployed, which one production is serving, whether a job is running or
 * failed, and whether this browser bundle matches the deployed package.
 */
exports.getCoursePathReleaseStatusV2 = onCall({ timeoutSeconds: 60, memory: "256MiB" }, async (request) => {
  await authorization().requireRootAdmin(request);
  const browserManifest = request.data?.browserManifest && typeof request.data.browserManifest === "object"
    ? {
      releaseId: String(request.data.browserManifest.releaseId || "") || null,
      contentHash: String(request.data.browserManifest.contentHash || "") || null,
    }
    : null;
  return releaseService().readReleaseStatus({ browserManifest });
});

/**
 * Publish (or resume) the certified course Path release.
 *
 * Idempotent: the job id is the release id. Publishing a release that is already
 * active answers "already active"; publishing one that stopped part way resumes
 * it at the next unwritten chunk.
 */
exports.publishCoursePathReleaseV2 = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await authorization().requireRootAdmin(request);
  const result = await releaseService().runCoursePathRelease({
    actor,
    chunkSize: Number(request.data?.chunkSize) || null,
    timeBudgetMs: Number(request.data?.timeBudgetMs) || undefined,
  });
  return result.ok ? result : releaseFailure(result);
});

/**
 * Resume an interrupted release.
 *
 * Deliberately the same engine as publish — there is one code path, so the
 * resume path cannot rot from disuse. The distinct name exists so the admin UI
 * and the audit trail can say which button a human pressed.
 */
exports.resumeCoursePathReleaseV2 = onCall(CALLABLE_OPTIONS, async (request) => {
  const actor = await authorization().requireRootAdmin(request);
  const result = await releaseService().runCoursePathRelease({
    actor,
    chunkSize: Number(request.data?.chunkSize) || null,
    timeBudgetMs: Number(request.data?.timeBudgetMs) || undefined,
  });
  return result.ok ? result : releaseFailure(result);
});

/** Poll one release job. Used by the admin progress view. */
exports.getCoursePathReleaseJobV2 = onCall({ timeoutSeconds: 60, memory: "256MiB" }, async (request) => {
  await authorization().requireRootAdmin(request);
  const jobId = String(request.data?.jobId || "").trim();
  if (!jobId) throw new HttpsError("invalid-argument", "A Path release job id is required.");
  const { getFirestore } = require("firebase-admin/firestore");
  const store = require("./lib/releaseStore");
  const db = getFirestore();
  const job = await store.readJob(db, jobId);
  if (!job) throw new HttpsError("not-found", `No Path release job ${jobId} exists.`);
  const chunkStates = await store.readChunkStates(db, jobId);
  return {
    ...job,
    running: store.jobIsLeased(job),
    chunks: [...chunkStates.entries()].map(([index, state]) => ({ index, ...state })).sort((a, b) => a.index - b.index),
  };
});
