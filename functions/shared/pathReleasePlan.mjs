// Path Release V2 — the pure decisions.
//
// Everything here is a function of its arguments: no Firestore, no clock it does
// not receive, no network. The release control plane is the interesting part of
// this project and the part most likely to be wrong in a way nobody notices
// until a classroom is waiting, so the parts that DECIDE (what changed, what to
// write, what phase comes next, what a failure means) are separated from the
// parts that ACT and are tested directly.
//
// The lifecycle this module describes:
//
//   AUTHOR -> COMPILE -> CERTIFY   (build time; scripts/build-course-path-release-v2.mjs)
//     -> STAGE -> ACTIVATE -> REBUILD AFFECTED COVERAGE -> VERIFY   (production)

/** Bumped when the release artifact or job document shape changes. */
export const PATH_RELEASE_SCHEMA_VERSION = 1;

/** The collection holding one durable, resumable job per release. */
export const PATH_RELEASE_JOB_COLLECTION = 'pathReleaseJobs';

/** The pointer that says which release production is actually serving. */
export const PATH_RELEASE_STATE_COLLECTION = 'pathReleaseState';
export const COURSE_RELEASE_STATE_DOC = 'course';

/** Per-release document-hash shards hanging off the state document. */
export const RELEASE_INDEX_SUBCOLLECTION = 'documentIndex';
export const RELEASE_INDEX_SHARD_SIZE = 400;

/** Firestore commits at most 500 writes per batch; stay clear of the ceiling. */
export const RELEASE_WRITE_CHUNK_SIZE = 200;

export const PATH_RELEASE_PHASE = Object.freeze({
  CREATED: 'created',
  VALIDATING: 'validating',
  STAGING: 'staging',
  ACTIVATING: 'activating',
  COVERAGE: 'coverage',
  VERIFYING: 'verifying',
  COMPLETE: 'complete',
  FAILED: 'failed',
});

/** The order a healthy release moves through. */
export const PATH_RELEASE_PHASE_ORDER = Object.freeze([
  PATH_RELEASE_PHASE.CREATED,
  PATH_RELEASE_PHASE.VALIDATING,
  PATH_RELEASE_PHASE.STAGING,
  PATH_RELEASE_PHASE.ACTIVATING,
  PATH_RELEASE_PHASE.COVERAGE,
  PATH_RELEASE_PHASE.VERIFYING,
  PATH_RELEASE_PHASE.COMPLETE,
]);

export const PATH_RELEASE_PHASE_LABELS = Object.freeze({
  [PATH_RELEASE_PHASE.CREATED]: 'Certified release detected',
  [PATH_RELEASE_PHASE.VALIDATING]: 'Comparing with production',
  [PATH_RELEASE_PHASE.STAGING]: 'Staging',
  [PATH_RELEASE_PHASE.ACTIVATING]: 'Activating',
  [PATH_RELEASE_PHASE.COVERAGE]: 'Rebuilding coverage',
  [PATH_RELEASE_PHASE.VERIFYING]: 'Verifying',
  [PATH_RELEASE_PHASE.COMPLETE]: 'Complete',
  [PATH_RELEASE_PHASE.FAILED]: 'Failed',
});

export const isTerminalReleasePhase = (phase) => (
  phase === PATH_RELEASE_PHASE.COMPLETE || phase === PATH_RELEASE_PHASE.FAILED
);

/** The phase that follows a completed one. `failed` never advances on its own. */
export const nextReleasePhase = (phase) => {
  const index = PATH_RELEASE_PHASE_ORDER.indexOf(phase);
  if (index < 0) return null;
  return PATH_RELEASE_PHASE_ORDER[index + 1] || null;
};

/** How far through the lifecycle a job is, for a progress bar. */
export const releasePhaseProgress = (phase) => {
  const index = PATH_RELEASE_PHASE_ORDER.indexOf(phase);
  if (index < 0) return phase === PATH_RELEASE_PHASE.FAILED ? 0 : 0;
  return index / (PATH_RELEASE_PHASE_ORDER.length - 1);
};

// ---------------------------------------------------------------------------
// Structured failure
// ---------------------------------------------------------------------------

export const PATH_RELEASE_ERROR = Object.freeze({
  ARTIFACT_MISSING: 'path-release/artifact-missing',
  ARTIFACT_UNREADABLE: 'path-release/artifact-unreadable',
  SCHEMA_UNSUPPORTED: 'path-release/schema-unsupported',
  MANIFEST_MISMATCH: 'path-release/manifest-mismatch',
  DOCUMENT_HASH_MISMATCH: 'path-release/document-hash-mismatch',
  DOCUMENT_NOT_COMPILED: 'path-release/document-not-compiled',
  DOCUMENT_UNCERTIFIED: 'path-release/document-uncertified',
  DOCUMENT_COUNT_MISMATCH: 'path-release/document-count-mismatch',
  STAGE_WRITE_FAILED: 'path-release/stage-write-failed',
  ACTIVATION_CONFLICT: 'path-release/activation-conflict',
  COVERAGE_FAILED: 'path-release/coverage-failed',
  VERIFICATION_FAILED: 'path-release/verification-failed',
  JOB_SUPERSEDED: 'path-release/job-superseded',
  PERMISSION_DENIED: 'path-release/permission-denied',
  DEPLOYMENT_MISMATCH: 'path-release/deployment-mismatch',
});

const RECOVERABLE_BY_DEFAULT = Object.freeze([
  PATH_RELEASE_ERROR.STAGE_WRITE_FAILED,
  PATH_RELEASE_ERROR.COVERAGE_FAILED,
  PATH_RELEASE_ERROR.VERIFICATION_FAILED,
  PATH_RELEASE_ERROR.ACTIVATION_CONFLICT,
]);

const DEFAULT_NEXT_ACTION = Object.freeze({
  [PATH_RELEASE_ERROR.ARTIFACT_MISSING]:
    'Build and deploy the certified release: npm run release:path:build, then npm run deploy:path-admin.',
  [PATH_RELEASE_ERROR.ARTIFACT_UNREADABLE]:
    'Rebuild the release artifact (npm run release:path:build) and redeploy the path-admin codebase.',
  [PATH_RELEASE_ERROR.SCHEMA_UNSUPPORTED]:
    'Deploy a path-admin build that supports this release schema, or rebuild the release with the deployed build.',
  [PATH_RELEASE_ERROR.MANIFEST_MISMATCH]:
    'The deployed package and its manifest disagree. Rebuild with npm run release:path:build and redeploy path-admin.',
  [PATH_RELEASE_ERROR.DOCUMENT_HASH_MISMATCH]:
    'Rebuild the release artifact so every document hash matches its manifest entry, then redeploy path-admin.',
  [PATH_RELEASE_ERROR.DOCUMENT_NOT_COMPILED]:
    'This document was not produced by the Path content compiler. Rebuild the release artifact.',
  [PATH_RELEASE_ERROR.DOCUMENT_UNCERTIFIED]:
    'Fix the authored content at the reported property path, then rebuild and redeploy the release.',
  [PATH_RELEASE_ERROR.DOCUMENT_COUNT_MISMATCH]:
    'Re-run the release. If it repeats, rebuild the artifact and redeploy path-admin.',
  [PATH_RELEASE_ERROR.STAGE_WRITE_FAILED]:
    'Choose Resume release. Completed chunks are not rewritten.',
  [PATH_RELEASE_ERROR.ACTIVATION_CONFLICT]:
    'Another release is in progress. Wait for it to finish, then resume this one.',
  [PATH_RELEASE_ERROR.COVERAGE_FAILED]:
    'Choose Resume release to rebuild coverage for the affected courses only.',
  [PATH_RELEASE_ERROR.VERIFICATION_FAILED]:
    'Choose Resume release. Verification re-reads production and repeats any missing write.',
  [PATH_RELEASE_ERROR.JOB_SUPERSEDED]:
    'A newer certified release exists. Publish that release instead.',
  [PATH_RELEASE_ERROR.PERMISSION_DENIED]:
    'Sign in as the MathMaster root administrator.',
  [PATH_RELEASE_ERROR.DEPLOYMENT_MISMATCH]:
    'Deploy Hosting and the path-admin codebase from the same build, then reload this page.',
});

/**
 * The one shape every Path release failure takes.
 *
 * "Unexpected server error" is a last resort: an administrator should be able to
 * read the phase, the document, the property path and what to do next without
 * opening Cloud Functions logs.
 */
export const pathReleaseDiagnostic = ({
  phase = null,
  code = 'path-release/unknown',
  message = 'The Path release failed.',
  releaseId = null,
  jobId = null,
  questionId = null,
  familyId = null,
  propertyPath = null,
  diagnosticId = null,
  recoverable = null,
  nextAction = null,
  details = null,
} = {}) => ({
  phase,
  code,
  message,
  releaseId,
  jobId,
  questionId,
  familyId,
  propertyPath,
  diagnosticId,
  recoverable: recoverable === null ? RECOVERABLE_BY_DEFAULT.includes(code) : Boolean(recoverable),
  nextAction: nextAction || DEFAULT_NEXT_ACTION[code] || 'Review the release report and try again.',
  details,
});

/** A compiler error becomes a release diagnostic without losing its location. */
export const diagnosticFromCompilerError = (error = {}, { phase, releaseId, jobId } = {}) => pathReleaseDiagnostic({
  phase,
  releaseId,
  jobId,
  code: PATH_RELEASE_ERROR.DOCUMENT_UNCERTIFIED,
  message: error.message || 'A compiled Path document is not storable.',
  questionId: error.questionId || null,
  familyId: error.familyId || null,
  propertyPath: error.path || null,
  details: { compilerCode: error.code || null },
  recoverable: false,
});

// ---------------------------------------------------------------------------
// Release identity
// ---------------------------------------------------------------------------

export const RELEASE_ID_PREFIX = 'course-path-v2';

/**
 * A release is named by what is in it.
 *
 * Two builds of identical content produce the same id, which is what makes
 * "publish the same release twice" resolve to "already active" instead of
 * writing the bank again.
 */
export const releaseIdForContentHash = (contentHash) => {
  const clean = String(contentHash || '').trim().toLowerCase();
  if (!/^[0-9a-f]{32,}$/.test(clean)) {
    throw new TypeError('A Path release id needs a hexadecimal content hash.');
  }
  return `${RELEASE_ID_PREFIX}-${clean.slice(0, 16)}`;
};

// ---------------------------------------------------------------------------
// The incremental comparison
// ---------------------------------------------------------------------------

const asEntryMap = (entries) => {
  const map = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const id = String(entry?.id || '').trim();
    if (!id) return;
    map.set(id, {
      id,
      contentHash: String(entry?.contentHash || '').trim() || null,
      courseId: entry?.courseId ? String(entry.courseId) : null,
      managed: entry?.managed !== false,
    });
  });
  return map;
};

/**
 * What this release changes, compared with what production is serving.
 *
 * Only added and changed documents are written. Unchanged documents are not
 * rewritten — an unchanged release performs zero question-document writes, which
 * is the whole point of doing this incrementally rather than replacing the bank
 * on every publish.
 *
 * `removed` holds documents the active release owns that the incoming release
 * does not. They are reported here but are NOT deleted until staging and
 * activation have succeeded; content nobody has replaced yet is content students
 * are still using.
 */
export const diffPathRelease = ({ incoming = [], active = [] } = {}) => {
  const incomingMap = asEntryMap(incoming);
  const activeMap = asEntryMap(active);

  const added = [];
  const changed = [];
  const unchanged = [];
  const removed = [];
  const affected = new Set();

  incomingMap.forEach((entry, id) => {
    const current = activeMap.get(id);
    if (!current) {
      added.push(id);
      if (entry.courseId) affected.add(entry.courseId);
      return;
    }
    if (!current.contentHash || current.contentHash !== entry.contentHash) {
      changed.push(id);
      if (entry.courseId) affected.add(entry.courseId);
      if (current.courseId) affected.add(current.courseId);
      return;
    }
    unchanged.push(id);
  });

  activeMap.forEach((entry, id) => {
    if (incomingMap.has(id)) return;
    // Only content this release line owns may be superseded. A teacher-imported
    // or otherwise unmanaged course document is left exactly where it is.
    if (!entry.managed) return;
    removed.push(id);
    if (entry.courseId) affected.add(entry.courseId);
  });

  added.sort();
  changed.sort();
  unchanged.sort();
  removed.sort();

  const writeIds = [...added, ...changed].sort();
  return {
    added,
    changed,
    unchanged,
    removed,
    writeIds,
    affectedCourses: [...affected].sort(),
    counts: {
      added: added.length,
      changed: changed.length,
      unchanged: unchanged.length,
      removed: removed.length,
      writes: writeIds.length,
      incoming: incomingMap.size,
      active: activeMap.size,
    },
  };
};

/** Split the write plan into resumable, individually committed chunks. */
export const planReleaseChunks = (ids = [], chunkSize = RELEASE_WRITE_CHUNK_SIZE) => {
  const size = Math.max(1, Number(chunkSize) || RELEASE_WRITE_CHUNK_SIZE);
  const list = (Array.isArray(ids) ? ids : []).filter(Boolean);
  const chunks = [];
  for (let index = 0; index < list.length; index += size) {
    chunks.push({ index: chunks.length, ids: list.slice(index, index + size) });
  }
  return chunks;
};

/**
 * Which course coverage documents this release actually invalidates.
 *
 * A release that changed one Algebra I family rebuilds Algebra I. It does not
 * rebuild Grade 6, and it never reads, validates or rebuilds Digital SAT, ACT,
 * TSIA2 or ASVAB content — those are separate release lines with their own
 * coordinated protocols.
 */
export const coverageRebuildPlan = ({
  diff = null,
  releaseCourses = [],
  existingCoverageCourses = [],
} = {}) => {
  const courses = new Set(diff?.affectedCourses || []);
  // A course whose coverage document has never been built is affected even when
  // its content did not change: production has no index to serve.
  const built = new Set(existingCoverageCourses.map(String));
  releaseCourses.map(String).forEach((courseId) => {
    if (!built.has(courseId)) courses.add(courseId);
  });
  const list = [...courses].filter((courseId) => releaseCourses.map(String).includes(String(courseId))).sort();
  return { courses: list, skipped: releaseCourses.map(String).filter((courseId) => !list.includes(courseId)).sort() };
};

// ---------------------------------------------------------------------------
// What the administrator is looking at
// ---------------------------------------------------------------------------

export const RELEASE_STATUS = Object.freeze({
  CURRENT: 'current',
  ACTIVATION_REQUIRED: 'activation-required',
  RUNNING: 'running',
  INTERRUPTED: 'interrupted',
  FAILED: 'failed',
  NO_ARTIFACT: 'no-artifact',
  DEPLOYMENT_MISMATCH: 'deployment-mismatch',
});

export const RELEASE_STATUS_LABELS = Object.freeze({
  [RELEASE_STATUS.CURRENT]: 'Production is current',
  [RELEASE_STATUS.ACTIVATION_REQUIRED]: 'Activation required',
  [RELEASE_STATUS.RUNNING]: 'Release in progress',
  [RELEASE_STATUS.INTERRUPTED]: 'Resume release',
  [RELEASE_STATUS.FAILED]: 'Release failed',
  [RELEASE_STATUS.NO_ARTIFACT]: 'No certified release is deployed',
  [RELEASE_STATUS.DEPLOYMENT_MISMATCH]: 'Deployment mismatch',
});

/**
 * What the admin page should say, from three facts it can read cheaply.
 *
 * Deployed Functions are NOT evidence that content is current: a deploy ships a
 * certified release, and only an activation puts it in front of a student. The
 * whole reason this state exists is that the old workflow could not tell the
 * difference.
 */
export const resolveReleaseStatus = ({
  deployed = null,
  active = null,
  job = null,
  browserManifest = null,
} = {}) => {
  const deployedId = deployed?.releaseId || null;
  const deployedHash = deployed?.contentHash || null;
  const activeId = active?.releaseId || null;
  const activeHash = active?.contentHash || null;

  if (!deployedId) {
    return {
      status: RELEASE_STATUS.NO_ARTIFACT,
      label: RELEASE_STATUS_LABELS[RELEASE_STATUS.NO_ARTIFACT],
      activationRequired: false,
      deployedReleaseId: null,
      activeReleaseId: activeId,
      jobId: job?.jobId || null,
      phase: job?.phase || null,
    };
  }

  // Hosting and path-admin are one production release. A browser holding a
  // different certified manifest is looking at a stale bundle, and must say so
  // rather than publishing against assumptions that no longer hold.
  if (browserManifest?.releaseId && browserManifest.releaseId !== deployedId) {
    return {
      status: RELEASE_STATUS.DEPLOYMENT_MISMATCH,
      label: RELEASE_STATUS_LABELS[RELEASE_STATUS.DEPLOYMENT_MISMATCH],
      activationRequired: false,
      deployedReleaseId: deployedId,
      activeReleaseId: activeId,
      jobId: job?.jobId || null,
      phase: job?.phase || null,
      mismatch: {
        browserReleaseId: browserManifest.releaseId,
        browserContentHash: browserManifest.contentHash || null,
        serverReleaseId: deployedId,
        serverContentHash: deployedHash,
        differs: browserManifest.contentHash === deployedHash ? ['releaseId'] : ['releaseId', 'contentHash'],
      },
    };
  }

  const jobForDeployed = job && job.releaseId === deployedId ? job : null;
  if (jobForDeployed && jobForDeployed.phase === PATH_RELEASE_PHASE.FAILED) {
    return {
      status: RELEASE_STATUS.FAILED,
      label: RELEASE_STATUS_LABELS[RELEASE_STATUS.FAILED],
      activationRequired: true,
      deployedReleaseId: deployedId,
      activeReleaseId: activeId,
      jobId: jobForDeployed.jobId || null,
      phase: jobForDeployed.phase,
      lastError: jobForDeployed.lastError || null,
    };
  }

  if (activeId === deployedId && activeHash === deployedHash && active?.status === 'active') {
    return {
      status: RELEASE_STATUS.CURRENT,
      label: RELEASE_STATUS_LABELS[RELEASE_STATUS.CURRENT],
      activationRequired: false,
      deployedReleaseId: deployedId,
      activeReleaseId: activeId,
      jobId: jobForDeployed?.jobId || null,
      phase: PATH_RELEASE_PHASE.COMPLETE,
    };
  }

  if (jobForDeployed && !isTerminalReleasePhase(jobForDeployed.phase)) {
    const stalled = jobForDeployed.running === false;
    return {
      status: stalled ? RELEASE_STATUS.INTERRUPTED : RELEASE_STATUS.RUNNING,
      label: RELEASE_STATUS_LABELS[stalled ? RELEASE_STATUS.INTERRUPTED : RELEASE_STATUS.RUNNING],
      activationRequired: true,
      deployedReleaseId: deployedId,
      activeReleaseId: activeId,
      jobId: jobForDeployed.jobId || null,
      phase: jobForDeployed.phase,
      completedChunks: jobForDeployed.completedChunks ?? 0,
      totalChunks: jobForDeployed.totalChunks ?? 0,
    };
  }

  return {
    status: RELEASE_STATUS.ACTIVATION_REQUIRED,
    label: RELEASE_STATUS_LABELS[RELEASE_STATUS.ACTIVATION_REQUIRED],
    activationRequired: true,
    deployedReleaseId: deployedId,
    activeReleaseId: activeId,
    jobId: jobForDeployed?.jobId || null,
    phase: jobForDeployed?.phase || null,
  };
};

/**
 * Exactly what differs between two certified manifests.
 *
 * Used for the "build/server release mismatch" message, which has to name the
 * difference rather than tell an administrator that something, somewhere, is out
 * of date.
 */
export const compareReleaseManifests = (left = null, right = null) => {
  const fields = ['releaseId', 'contentHash', 'schemaVersion', 'compilerSchemaVersion', 'questionCount'];
  const differences = fields
    .filter((field) => (left?.[field] ?? null) !== (right?.[field] ?? null))
    .map((field) => ({ field, left: left?.[field] ?? null, right: right?.[field] ?? null }));
  const leftCourses = Object.entries(left?.courseCounts || {});
  const rightCourses = right?.courseCounts || {};
  leftCourses.forEach(([courseId, count]) => {
    if (rightCourses[courseId] !== count) {
      differences.push({ field: `courseCounts.${courseId}`, left: count, right: rightCourses[courseId] ?? null });
    }
  });
  Object.entries(rightCourses).forEach(([courseId, count]) => {
    if (!(courseId in (left?.courseCounts || {}))) {
      differences.push({ field: `courseCounts.${courseId}`, left: null, right: count });
    }
  });
  return { identical: differences.length === 0, differences };
};

/**
 * Whether a job document may be resumed by this attempt.
 *
 * Idempotency rule: the same release resolves to the same job id, so a retry
 * never creates a second job, never re-writes a chunk another attempt already
 * committed, and never activates twice.
 */
export const resumePlanForJob = ({ job = null, releaseId = null, chunks = [] } = {}) => {
  if (!job) {
    return { action: 'create', phase: PATH_RELEASE_PHASE.CREATED, remainingChunks: chunks.map((chunk) => chunk.index) };
  }
  if (job.releaseId !== releaseId) {
    return { action: 'conflict', phase: job.phase, remainingChunks: [] };
  }
  if (job.phase === PATH_RELEASE_PHASE.COMPLETE) {
    return { action: 'already-complete', phase: job.phase, remainingChunks: [] };
  }
  const completed = new Set((job.completedChunkIndexes || []).map(Number));
  return {
    action: 'resume',
    phase: job.phase === PATH_RELEASE_PHASE.FAILED
      ? (job.failedFromPhase || PATH_RELEASE_PHASE.VALIDATING)
      : job.phase,
    remainingChunks: chunks.map((chunk) => chunk.index).filter((index) => !completed.has(index)),
  };
};

export default {
  PATH_RELEASE_SCHEMA_VERSION,
  PATH_RELEASE_PHASE,
  PATH_RELEASE_ERROR,
  diffPathRelease,
  planReleaseChunks,
  coverageRebuildPlan,
  resolveReleaseStatus,
  compareReleaseManifests,
  resumePlanForJob,
  pathReleaseDiagnostic,
  releaseIdForContentHash,
};
