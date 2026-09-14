"use strict";

// The Path Release V2 phase engine.
//
//   created -> validating -> staging -> activating -> coverage -> verifying -> complete
//
// Every phase is resumable and every phase is idempotent. The job id is the
// release id, chunk completion is recorded in Firestore as each chunk commits,
// and each phase re-reads what it needs rather than trusting anything held in
// memory by a previous invocation — because in production there frequently was
// no previous invocation: the process that started the release is gone.
//
// One invocation does as much as its time budget allows and then returns with
// `continue: true`. The admin page calls again; the job picks up where it
// stopped. Nothing about that path is exceptional — an interrupted release and a
// budgeted one resume through exactly the same code.

const { importRuntime } = require("./runtime");
const artifact = require("./releaseArtifact");
const store = require("./releaseStore");
const { rebuildAffectedCoverage, existingCoverageCourses } = require("./coverage");

const plan = () => importRuntime("shared/pathReleasePlan.mjs");

// firebase-admin is loaded lazily and only when a caller did not supply its own
// Firestore. Requiring it at module load would make this engine untestable
// outside a Functions runtime, and the parts worth testing — resume, idempotency,
// what is written and what is deliberately not — are exactly the parts that do
// not need a real Firestore.
const firestoreAdmin = () => require("firebase-admin/firestore");
const defaultDb = () => firestoreAdmin().getFirestore();
const defaultServerTimestamp = () => firestoreAdmin().FieldValue.serverTimestamp();

/** Leave room inside the callable timeout to persist progress and reply. */
const DEFAULT_TIME_BUDGET_MS = 210000;

/** How many written documents verification re-reads from production. */
const VERIFICATION_SAMPLE_SIZE = 25;

const nowMs = () => Date.now();

function auditRef(db) {
  return db.collection("adminAuditLog");
}

async function writeReleaseAudit(db, actor, action, details) {
  try {
    await auditRef(db).add({
      action,
      actorUid: actor?.uid || null,
      actorEmail: actor?.email || null,
      target: "pathQuestionBank",
      details,
      at: Date.now(),
    });
  } catch {
    // An audit write must never be the reason a content release fails.
  }
}

/**
 * Status for the admin page, cheap enough to poll.
 *
 * Reads the deployed artifact identity (no documents), the active pointer, and
 * the job for the deployed release. It never reads the question bank.
 */
async function readReleaseStatus({ db = null, browserManifest = null, releaseArtifact = artifact } = {}) {
  const database = db || defaultDb();
  const { resolveReleaseStatus, PATH_RELEASE_PHASE } = await plan();
  const deployed = releaseArtifact.deployedReleaseIdentity();
  const active = await store.readReleaseState(database);
  const job = deployed?.releaseId ? await store.readJob(database, deployed.releaseId) : await store.readLatestJob(database);

  const jobSummary = job ? {
    jobId: job.jobId,
    releaseId: job.releaseId || null,
    phase: job.phase || null,
    totalChunks: job.totalChunks ?? 0,
    completedChunks: job.completedChunks ?? 0,
    counts: job.counts || null,
    lastError: job.lastError || null,
    startedAt: job.startedAt || null,
    updatedAt: job.updatedAt || null,
    completedAt: job.completedAt || null,
    actorEmail: job.actorEmail || null,
    running: store.jobIsLeased(job),
  } : null;

  const resolved = resolveReleaseStatus({
    deployed,
    active: active ? {
      releaseId: active.releaseId || null,
      contentHash: active.contentHash || null,
      status: active.status || null,
    } : null,
    job: jobSummary,
    browserManifest,
  });

  return {
    ...resolved,
    phaseLabels: (await plan()).PATH_RELEASE_PHASE_LABELS,
    deployed,
    active: active || null,
    job: jobSummary,
    legacyRefreshDeprecated: true,
    supportedPhases: Object.values(PATH_RELEASE_PHASE),
  };
}

/**
 * Start or resume the certified course Path release.
 *
 * Returns a structured result in every case — including failure. "Unexpected
 * server error" is not an outcome an administrator should ever have to work out
 * from Cloud Functions logs.
 */
async function runCoursePathRelease({
  db = null,
  actor,
  serverTimestamp = null,
  operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  chunkSize = null,
  now = nowMs,
  // The deployed certified artifact. Swappable so the resumability and
  // idempotency contracts can be certified against a small synthetic release
  // instead of only against the 1,161-document production one.
  releaseArtifact = artifact,
} = {}) {
  const planning = await plan();
  const {
    PATH_RELEASE_PHASE,
    PATH_RELEASE_ERROR,
    pathReleaseDiagnostic,
    diffPathRelease,
    planReleaseChunks,
    coverageRebuildPlan,
    resumePlanForJob,
    RELEASE_WRITE_CHUNK_SIZE,
  } = planning;

  const database = db || defaultDb();
  const stampNow = serverTimestamp || defaultServerTimestamp;
  const startedAt = now();
  const outOfBudget = () => now() - startedAt >= timeBudgetMs;

  const manifest = releaseArtifact.loadReleaseManifest();
  const manifestDiagnostics = await releaseArtifact.verifyReleaseManifest(manifest, { phase: PATH_RELEASE_PHASE.VALIDATING });
  if (manifestDiagnostics.length) {
    return { ok: false, phase: PATH_RELEASE_PHASE.VALIDATING, diagnostic: manifestDiagnostics[0], diagnostics: manifestDiagnostics };
  }

  const releaseId = manifest.releaseId;
  const jobId = releaseId;

  const activeState = await store.readReleaseState(database);
  let job = await store.readJob(database, jobId);

  // Already there. A retry of the same release is a question, not a mutation.
  if (
    activeState?.releaseId === releaseId
    && activeState?.status === "active"
    && job?.phase === PATH_RELEASE_PHASE.COMPLETE
  ) {
    return {
      ok: true,
      phase: PATH_RELEASE_PHASE.COMPLETE,
      status: "already-active",
      releaseId,
      jobId,
      counts: job.counts || null,
      continue: false,
      message: "Production is already serving this certified release.",
    };
  }

  if (store.jobIsLeased(job, { now: now(), operationId })) {
    return {
      ok: false,
      phase: job.phase,
      diagnostic: pathReleaseDiagnostic({
        phase: job.phase,
        code: PATH_RELEASE_ERROR.ACTIVATION_CONFLICT,
        message: "Another administrator's release attempt is currently running for this release.",
        releaseId,
        jobId,
      }),
    };
  }

  const documents = releaseArtifact.loadReleaseDocuments();
  if (!documents) {
    return {
      ok: false,
      phase: PATH_RELEASE_PHASE.VALIDATING,
      diagnostic: pathReleaseDiagnostic({
        phase: PATH_RELEASE_PHASE.VALIDATING,
        code: PATH_RELEASE_ERROR.ARTIFACT_MISSING,
        message: "The certified release manifest is deployed but its question package is not.",
        releaseId,
        jobId,
      }),
    };
  }
  if (documents.releaseId !== releaseId || documents.contentHash !== manifest.contentHash) {
    return {
      ok: false,
      phase: PATH_RELEASE_PHASE.VALIDATING,
      diagnostic: pathReleaseDiagnostic({
        phase: PATH_RELEASE_PHASE.VALIDATING,
        code: PATH_RELEASE_ERROR.MANIFEST_MISMATCH,
        message: "The deployed question package and its certified manifest name different releases.",
        releaseId,
        jobId,
        details: {
          manifestReleaseId: releaseId,
          packageReleaseId: documents.releaseId || null,
        },
      }),
    };
  }

  const documentById = new Map(documents.documents.map((entry) => [entry.id, entry]));
  const writeChunkSize = Number(chunkSize) > 0 ? Number(chunkSize) : RELEASE_WRITE_CHUNK_SIZE;

  // ---------------------------------------------------------------- validating
  const activeIndex = await store.readActiveReleaseIndex(database, { releaseId: activeState?.releaseId || null });
  const diff = diffPathRelease({
    incoming: manifest.documents.map((entry) => ({
      id: entry.id,
      contentHash: entry.contentHash,
      courseId: entry.courseId,
    })),
    active: activeIndex.entries,
  });
  // The plan a running job is already following wins over a freshly derived one.
  // Documents an interrupted attempt wrote are seen as unchanged the next time
  // round, so re-deriving would renumber the chunks and skip the wrong ones.
  const storedChunkStates = await store.readChunkStates(database, jobId);
  const hasStoredPlan = job?.releaseId === releaseId && storedChunkStates.size > 0;
  const chunks = hasStoredPlan
    ? [...storedChunkStates.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, state]) => ({ index, ids: Array.isArray(state.ids) ? state.ids : [] }))
    : planReleaseChunks(diff.writeIds, writeChunkSize);

  // Counts and the supersede list belong to the job once it exists, so a report
  // does not shift underneath a resume.
  const effectivePlan = hasStoredPlan && job?.counts
    ? {
      counts: job.counts,
      removed: Array.isArray(job.removedIds) ? job.removedIds : diff.removed,
      affectedCourses: Array.isArray(job.affectedCourses) ? job.affectedCourses : diff.affectedCourses,
      writeIds: chunks.flatMap((chunk) => chunk.ids),
    }
    : { counts: diff.counts, removed: diff.removed, affectedCourses: diff.affectedCourses, writeIds: diff.writeIds };

  const resume = resumePlanForJob({ job, releaseId, chunks });
  if (resume.action === "conflict") {
    return {
      ok: false,
      phase: job.phase,
      diagnostic: pathReleaseDiagnostic({
        phase: job.phase,
        code: PATH_RELEASE_ERROR.ACTIVATION_CONFLICT,
        message: `A job for release ${job.releaseId} already holds this id.`,
        releaseId,
        jobId,
      }),
    };
  }

  const baseJob = {
    jobId,
    releaseId,
    schemaVersion: manifest.schemaVersion,
    compilerSchemaVersion: manifest.compilerSchemaVersion,
    contentHash: manifest.contentHash,
    courses: manifest.courses,
    operationId,
    actorUid: actor?.uid || null,
    actorEmail: actor?.email || null,
    heartbeatAt: now(),
    totalChunks: chunks.length,
    counts: effectivePlan.counts,
    removedIds: effectivePlan.removed,
    affectedCourses: effectivePlan.affectedCourses,
    comparedAgainst: activeIndex.source,
  };

  if (!job) {
    await store.writeJob(database, jobId, {
      ...baseJob,
      phase: PATH_RELEASE_PHASE.VALIDATING,
      createdAt: now(),
      startedAt: now(),
      completedChunks: 0,
      completedChunkIndexes: [],
      lastError: null,
    });
    job = await store.readJob(database, jobId);
  } else {
    await store.writeJob(database, jobId, { ...baseJob, phase: resume.phase, lastError: null });
    job = await store.readJob(database, jobId);
  }

  // Certify only what is about to be written. Documents production already has,
  // byte for byte, are not re-verified: they are not being touched.
  const stagingEntries = effectivePlan.writeIds.map((id) => documentById.get(id)).filter(Boolean);
  if (stagingEntries.length !== effectivePlan.writeIds.length) {
    const missing = effectivePlan.writeIds.filter((id) => !documentById.has(id));
    return failJob(database, jobId, pathReleaseDiagnostic({
      phase: PATH_RELEASE_PHASE.VALIDATING,
      code: PATH_RELEASE_ERROR.DOCUMENT_NOT_COMPILED,
      message: `${missing.length} manifest document(s) are missing from the deployed package.`,
      releaseId,
      jobId,
      questionId: missing[0] || null,
    }), PATH_RELEASE_PHASE.VALIDATING);
  }

  const stagingDiagnostics = await releaseArtifact.verifyDocumentsForStaging(stagingEntries, {
    manifest,
    phase: PATH_RELEASE_PHASE.VALIDATING,
    jobId,
  });
  if (stagingDiagnostics.length) {
    // NOTHING has been written at this point. An invalid package fails before a
    // single live mutation, which is the difference between a refused release and
    // a half-updated bank.
    return failJob(database, jobId, stagingDiagnostics[0], PATH_RELEASE_PHASE.VALIDATING, stagingDiagnostics);
  }

  // Nothing to write, nothing to supersede: the release is already the content
  // production is serving. Record the pointer and finish.
  const activationOnly = effectivePlan.writeIds.length === 0 && effectivePlan.removed.length === 0;

  if (!activationOnly) {
    await store.writeReleaseState(database, {
      status: "updating",
      pendingReleaseId: releaseId,
      pendingContentHash: manifest.contentHash,
      updateStartedAt: now(),
      updatedBy: actor?.uid || null,
      schemaVersion: manifest.schemaVersion,
    });
  }

  // ------------------------------------------------------------------- staging
  if (!hasStoredPlan && chunks.length) await store.writeChunkPlan(database, jobId, chunks);
  await store.writeJob(database, jobId, { phase: PATH_RELEASE_PHASE.STAGING, heartbeatAt: now() });
  const chunkStates = hasStoredPlan ? storedChunkStates : await store.readChunkStates(database, jobId);
  const completedIndexes = new Set([...chunkStates.entries()]
    .filter(([, state]) => state.status === "complete")
    .map(([index]) => index));

  for (const chunk of chunks) {
    if (completedIndexes.has(chunk.index)) continue;
    if (outOfBudget()) {
      await store.writeJob(database, jobId, {
        phase: PATH_RELEASE_PHASE.STAGING,
        completedChunks: completedIndexes.size,
        completedChunkIndexes: [...completedIndexes].sort((a, b) => a - b),
        heartbeatAt: now(),
      });
      return progressResult({
        ok: true,
        phase: PATH_RELEASE_PHASE.STAGING,
        releaseId,
        jobId,
        counts: effectivePlan.counts,
        completedChunks: completedIndexes.size,
        totalChunks: chunks.length,
        continueRelease: true,
      });
    }
    try {
      const batch = database.batch();
      chunk.ids.forEach((id) => {
        const entry = documentById.get(id);
        batch.set(database.collection(store.BANK_COLLECTION).doc(id), {
          ...entry.document,
          builtInPathSeed: store.BUILT_IN_PATH_SEED_MARKER,
          builtInPathSeedRelease: releaseId,
          pathReleaseId: releaseId,
          pathReleaseSchemaVersion: manifest.schemaVersion,
          pathContentHash: entry.contentHash,
          seededAt: stampNow(),
          seededBy: actor?.uid || null,
        });
      });
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      // eslint-disable-next-line no-await-in-loop
      await store.markChunkComplete(database, jobId, { index: chunk.index, ids: chunk.ids, writtenAt: now() });
      completedIndexes.add(chunk.index);
      // eslint-disable-next-line no-await-in-loop
      await store.writeJob(database, jobId, {
        phase: PATH_RELEASE_PHASE.STAGING,
        completedChunks: completedIndexes.size,
        completedChunkIndexes: [...completedIndexes].sort((a, b) => a - b),
        heartbeatAt: now(),
      });
    } catch (error) {
      return failJob(database, jobId, pathReleaseDiagnostic({
        phase: PATH_RELEASE_PHASE.STAGING,
        code: PATH_RELEASE_ERROR.STAGE_WRITE_FAILED,
        message: `Chunk ${chunk.index + 1} of ${chunks.length} could not be written: ${error?.message || error}`,
        releaseId,
        jobId,
        questionId: chunk.ids[0] || null,
        details: { chunkIndex: chunk.index, documentCount: chunk.ids.length },
      }), PATH_RELEASE_PHASE.STAGING);
    }
  }

  // ---------------------------------------------------------------- activating
  await store.writeJob(database, jobId, {
    phase: PATH_RELEASE_PHASE.ACTIVATING,
    completedChunks: completedIndexes.size,
    completedChunkIndexes: [...completedIndexes].sort((a, b) => a - b),
    heartbeatAt: now(),
  });

  await store.writeActiveReleaseIndex(database, {
    releaseId,
    entries: manifest.documents.map((entry) => ({
      id: entry.id,
      contentHash: entry.contentHash,
      courseId: entry.courseId,
    })),
  });
  await store.writeReleaseState(database, {
    status: "active",
    releaseId,
    contentHash: manifest.contentHash,
    schemaVersion: manifest.schemaVersion,
    compilerSchemaVersion: manifest.compilerSchemaVersion,
    questionCount: manifest.questionCount,
    courses: manifest.courses,
    courseCounts: manifest.courseCounts,
    activatedAt: now(),
    activatedBy: actor?.uid || null,
    pendingReleaseId: null,
    pendingContentHash: null,
    previousReleaseId: activeState?.releaseId || null,
  });

  // ONLY NOW. Superseded documents are removed after every replacement write
  // has committed and the pointer has moved, so an interrupted release never
  // deletes content it has not already replaced.
  let removedCount = 0;
  if (effectivePlan.removed.length) {
    for (let index = 0; index < effectivePlan.removed.length; index += 200) {
      const batch = database.batch();
      effectivePlan.removed.slice(index, index + 200)
        .forEach((id) => batch.delete(database.collection(store.BANK_COLLECTION).doc(id)));
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      removedCount += Math.min(200, effectivePlan.removed.length - index);
    }
  }

  // ------------------------------------------------------------------ coverage
  await store.writeJob(database, jobId, { phase: PATH_RELEASE_PHASE.COVERAGE, heartbeatAt: now() });
  const builtCoverage = await existingCoverageCourses(database, manifest.courses);
  const coveragePlan = coverageRebuildPlan({
    diff: { affectedCourses: effectivePlan.affectedCourses },
    releaseCourses: manifest.courses,
    existingCoverageCourses: builtCoverage,
  });
  let coverage;
  try {
    coverage = await rebuildAffectedCoverage(database, {
      courses: coveragePlan.courses,
      certifiedPlans: new Map(manifest.documents.map((entry) => [entry.contentHash, { samples: entry.samples }])),
      now: now(),
    });
  } catch (error) {
    return failJob(database, jobId, pathReleaseDiagnostic({
      phase: PATH_RELEASE_PHASE.COVERAGE,
      code: PATH_RELEASE_ERROR.COVERAGE_FAILED,
      message: `Coverage could not be rebuilt: ${error?.message || error}`,
      releaseId,
      jobId,
      details: { courses: coveragePlan.courses },
    }), PATH_RELEASE_PHASE.COVERAGE);
  }

  // ----------------------------------------------------------------- verifying
  await store.writeJob(database, jobId, { phase: PATH_RELEASE_PHASE.VERIFYING, heartbeatAt: now() });
  const verification = await verifyActivation(database, { manifest, writeIds: effectivePlan.writeIds, releaseId });
  if (!verification.ok) {
    return failJob(database, jobId, pathReleaseDiagnostic({
      phase: PATH_RELEASE_PHASE.VERIFYING,
      code: PATH_RELEASE_ERROR.VERIFICATION_FAILED,
      message: verification.message,
      releaseId,
      jobId,
      questionId: verification.questionId || null,
      details: verification.details || null,
    }), PATH_RELEASE_PHASE.VERIFYING);
  }

  // ------------------------------------------------------------------ complete
  const summary = {
    phase: PATH_RELEASE_PHASE.COMPLETE,
    completedAt: now(),
    completedChunks: chunks.length,
    completedChunkIndexes: chunks.map((chunk) => chunk.index),
    counts: { ...effectivePlan.counts, removedApplied: removedCount },
    coverage: {
      courses: coverage.courses,
      skipped: coveragePlan.skipped,
      issuerRuns: coverage.issuerRuns,
      reusedCertifiedPlans: coverage.reusedCertifiedPlans,
      documentsRead: coverage.documentsRead,
    },
    verification: verification.summary,
    lastError: null,
    operationId: null,
    heartbeatAt: null,
  };
  await store.writeJob(database, jobId, summary);
  await writeReleaseAudit(database, actor, "course_path_release_activated", {
    releaseId,
    contentHash: manifest.contentHash,
    counts: summary.counts,
    coverageCourses: coverage.courses,
  });

  return {
    ok: true,
    phase: PATH_RELEASE_PHASE.COMPLETE,
    status: "complete",
    releaseId,
    jobId,
    counts: summary.counts,
    coverage: summary.coverage,
    verification: verification.summary,
    continue: false,
    elapsedMs: now() - startedAt,
  };
}

/**
 * Prove production is serving what the manifest promises.
 *
 * Checks the pointer, the size of the stored index, and re-reads a sample of the
 * documents this release actually wrote. Verification that only re-read its own
 * memory would prove nothing.
 */
async function verifyActivation(database, { manifest, writeIds = [], releaseId }) {
  const state = await store.readReleaseState(database);
  if (state?.releaseId !== releaseId || state?.status !== "active") {
    return {
      ok: false,
      message: "The active release pointer does not name this release after activation.",
      details: { activeReleaseId: state?.releaseId || null, status: state?.status || null },
    };
  }
  const index = await store.readActiveReleaseIndex(database, { releaseId });
  if (index.source !== "index" || index.entries.length !== manifest.questionCount) {
    return {
      ok: false,
      message: `The stored release index holds ${index.entries.length} documents; the manifest declares ${manifest.questionCount}.`,
      details: { source: index.source, indexed: index.entries.length, expected: manifest.questionCount },
    };
  }

  const sampleIds = writeIds.slice(0, VERIFICATION_SAMPLE_SIZE);
  if (sampleIds.length) {
    const expected = new Map(manifest.documents.map((entry) => [entry.id, entry.contentHash]));
    const snapshots = await database.getAll(...sampleIds.map((id) => database.collection(store.BANK_COLLECTION).doc(id)));
    for (const snapshot of snapshots) {
      if (!snapshot.exists) {
        return { ok: false, message: `${snapshot.id} was staged but is not present in production.`, questionId: snapshot.id };
      }
      const stored = snapshot.data() || {};
      if (stored.pathContentHash !== expected.get(snapshot.id)) {
        return {
          ok: false,
          message: `${snapshot.id} is present but does not carry this release's certified content hash.`,
          questionId: snapshot.id,
          details: { stored: stored.pathContentHash || null, expected: expected.get(snapshot.id) || null },
        };
      }
    }
  }

  return {
    ok: true,
    summary: {
      activeReleaseId: releaseId,
      indexedDocuments: index.entries.length,
      sampledDocuments: sampleIds.length,
      verifiedAt: Date.now(),
    },
  };
}

async function failJob(database, jobId, diagnostic, failedFromPhase, diagnostics = null) {
  const { PATH_RELEASE_PHASE } = await plan();
  await store.writeJob(database, jobId, {
    phase: PATH_RELEASE_PHASE.FAILED,
    failedFromPhase,
    lastError: diagnostic,
    operationId: null,
    heartbeatAt: null,
  });
  return { ok: false, phase: PATH_RELEASE_PHASE.FAILED, failedFromPhase, diagnostic, diagnostics: diagnostics || [diagnostic] };
}

function progressResult({ ok, phase, releaseId, jobId, counts, completedChunks, totalChunks, continueRelease }) {
  return {
    ok,
    phase,
    status: "in-progress",
    releaseId,
    jobId,
    counts,
    completedChunks,
    totalChunks,
    continue: continueRelease,
    message: `Staged ${completedChunks} of ${totalChunks} chunks. Continue to finish the release.`,
  };
}

module.exports = {
  runCoursePathRelease,
  readReleaseStatus,
  verifyActivation,
  DEFAULT_TIME_BUDGET_MS,
  VERIFICATION_SAMPLE_SIZE,
};
