import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PATH_RELEASE_ERROR,
  PATH_RELEASE_PHASE,
  PATH_RELEASE_PHASE_ORDER,
  RELEASE_STATUS,
  compareReleaseManifests,
  coverageRebuildPlan,
  diffPathRelease,
  isTerminalReleasePhase,
  nextReleasePhase,
  pathReleaseDiagnostic,
  planReleaseChunks,
  releaseIdForContentHash,
  resolveReleaseStatus,
  resumePlanForJob,
} from '../../functions/shared/pathReleasePlan.mjs';

const entry = (id, contentHash, courseId = 'algebra1', managed = true) => ({ id, contentHash, courseId, managed });

// --- the incremental comparison ---------------------------------------------

test('an unchanged release plans no writes at all', () => {
  const documents = [entry('a', 'h1'), entry('b', 'h2'), entry('c', 'h3', 'grade6')];
  const diff = diffPathRelease({ incoming: documents, active: documents });

  assert.deepEqual(diff.counts, {
    added: 0, changed: 0, unchanged: 3, removed: 0, writes: 0, incoming: 3, active: 3,
  });
  assert.deepEqual(diff.writeIds, []);
  assert.deepEqual(diff.affectedCourses, []);
});

test('a one-document content change writes one document and touches one course', () => {
  const active = [entry('a', 'h1'), entry('b', 'h2'), entry('c', 'h3', 'grade6')];
  const incoming = [entry('a', 'h1'), entry('b', 'CHANGED'), entry('c', 'h3', 'grade6')];
  const diff = diffPathRelease({ incoming, active });

  assert.deepEqual(diff.changed, ['b']);
  assert.deepEqual(diff.writeIds, ['b']);
  assert.equal(diff.counts.unchanged, 2);
  assert.equal(diff.counts.writes, 1);
  assert.deepEqual(diff.affectedCourses, ['algebra1'], 'grade6 is untouched by an Algebra I change');
});

test('added, changed, unchanged and superseded are all reported', () => {
  const diff = diffPathRelease({
    incoming: [entry('keep', 'h1'), entry('edit', 'new'), entry('new', 'h9', 'grade7')],
    active: [entry('keep', 'h1'), entry('edit', 'old'), entry('gone', 'h4', 'grade8')],
  });

  assert.deepEqual(diff.added, ['new']);
  assert.deepEqual(diff.changed, ['edit']);
  assert.deepEqual(diff.unchanged, ['keep']);
  assert.deepEqual(diff.removed, ['gone']);
  assert.deepEqual(diff.affectedCourses, ['algebra1', 'grade7', 'grade8']);
});

test('content this release line does not own is never superseded', () => {
  const diff = diffPathRelease({
    incoming: [entry('built-in', 'h1')],
    active: [entry('built-in', 'h1'), entry('teacher-imported', 'h5', 'algebra1', false)],
  });
  assert.deepEqual(diff.removed, [], 'a custom course document is left exactly where it is');
});

test('a document production holds with no recorded hash is treated as changed', () => {
  const diff = diffPathRelease({
    incoming: [entry('a', 'h1')],
    active: [{ id: 'a', contentHash: null, courseId: 'algebra1' }],
  });
  assert.deepEqual(diff.changed, ['a']);
});

test('the write plan splits into chunks that can be committed independently', () => {
  const ids = Array.from({ length: 450 }, (unused, index) => `q-${String(index).padStart(4, '0')}`);
  const chunks = planReleaseChunks(ids, 200);

  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map((chunk) => chunk.index), [0, 1, 2]);
  assert.equal(chunks[0].ids.length, 200);
  assert.equal(chunks[2].ids.length, 50);
  assert.equal(chunks.flatMap((chunk) => chunk.ids).length, ids.length);
});

// --- only what is necessary --------------------------------------------------

test('coverage rebuilds only the courses a release actually changed', () => {
  const diff = diffPathRelease({
    incoming: [entry('a', 'new'), entry('b', 'h2', 'grade6')],
    active: [entry('a', 'old'), entry('b', 'h2', 'grade6')],
  });
  const plan = coverageRebuildPlan({
    diff,
    releaseCourses: ['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2'],
    existingCoverageCourses: ['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2'],
  });

  assert.deepEqual(plan.courses, ['algebra1']);
  assert.deepEqual(plan.skipped, ['algebra2', 'grade6', 'grade7', 'grade8']);
});

test('a course whose coverage was never built is rebuilt even when unchanged', () => {
  const diff = diffPathRelease({ incoming: [entry('a', 'h1')], active: [entry('a', 'h1')] });
  const plan = coverageRebuildPlan({
    diff,
    releaseCourses: ['grade6', 'algebra1'],
    existingCoverageCourses: ['algebra1'],
  });
  assert.deepEqual(plan.courses, ['grade6']);
});

test('a course release never names an assessment framework as an affected course', () => {
  const diff = diffPathRelease({
    incoming: [entry('a', 'new')],
    active: [entry('a', 'old')],
  });
  const plan = coverageRebuildPlan({
    diff,
    releaseCourses: ['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2'],
    existingCoverageCourses: ['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2'],
  });
  ['digitalSAT', 'act', 'tsia2', 'asvab'].forEach((framework) => {
    assert.equal(plan.courses.includes(framework), false);
    assert.equal(plan.skipped.includes(framework), false);
  });
});

// --- identity and idempotency -----------------------------------------------

test('a release is named by its content, so identical content is the same release', () => {
  const hash = 'a'.repeat(64);
  assert.equal(releaseIdForContentHash(hash), 'course-path-v2-aaaaaaaaaaaaaaaa');
  assert.equal(releaseIdForContentHash(hash), releaseIdForContentHash(hash));
  assert.notEqual(releaseIdForContentHash(hash), releaseIdForContentHash(`b${hash.slice(1)}`));
  assert.throws(() => releaseIdForContentHash('not-a-hash'), TypeError);
});

test('resuming a job continues at the first chunk that was never committed', () => {
  const chunks = planReleaseChunks(['a', 'b', 'c', 'd', 'e', 'f'], 2);
  const plan = resumePlanForJob({
    job: { releaseId: 'r1', phase: PATH_RELEASE_PHASE.STAGING, completedChunkIndexes: [0, 1] },
    releaseId: 'r1',
    chunks,
  });

  assert.equal(plan.action, 'resume');
  assert.equal(plan.phase, PATH_RELEASE_PHASE.STAGING);
  assert.deepEqual(plan.remainingChunks, [2], 'committed chunks are not rewritten');
});

test('a completed job is answered, not repeated', () => {
  const plan = resumePlanForJob({
    job: { releaseId: 'r1', phase: PATH_RELEASE_PHASE.COMPLETE, completedChunkIndexes: [0] },
    releaseId: 'r1',
    chunks: planReleaseChunks(['a'], 1),
  });
  assert.equal(plan.action, 'already-complete');
});

test('a failed job resumes from the phase that failed, not from the beginning', () => {
  const plan = resumePlanForJob({
    job: {
      releaseId: 'r1',
      phase: PATH_RELEASE_PHASE.FAILED,
      failedFromPhase: PATH_RELEASE_PHASE.COVERAGE,
      completedChunkIndexes: [0, 1],
    },
    releaseId: 'r1',
    chunks: planReleaseChunks(['a', 'b'], 1),
  });
  assert.equal(plan.action, 'resume');
  assert.equal(plan.phase, PATH_RELEASE_PHASE.COVERAGE);
  assert.deepEqual(plan.remainingChunks, []);
});

test('the lifecycle advances in one order and stops at its terminals', () => {
  assert.deepEqual(PATH_RELEASE_PHASE_ORDER, [
    'created', 'validating', 'staging', 'activating', 'coverage', 'verifying', 'complete',
  ]);
  assert.equal(nextReleasePhase(PATH_RELEASE_PHASE.STAGING), PATH_RELEASE_PHASE.ACTIVATING);
  assert.equal(nextReleasePhase(PATH_RELEASE_PHASE.COMPLETE), null);
  assert.equal(nextReleasePhase(PATH_RELEASE_PHASE.FAILED), null, 'a failed job never advances on its own');
  assert.equal(isTerminalReleasePhase(PATH_RELEASE_PHASE.COMPLETE), true);
  assert.equal(isTerminalReleasePhase(PATH_RELEASE_PHASE.FAILED), true);
  assert.equal(isTerminalReleasePhase(PATH_RELEASE_PHASE.STAGING), false);
});

// --- what the administrator is told ------------------------------------------

const deployed = { releaseId: 'course-path-v2-1111', contentHash: 'hash-1' };

test('a deployed release that production is serving reads as current', () => {
  const status = resolveReleaseStatus({
    deployed,
    active: { releaseId: 'course-path-v2-1111', contentHash: 'hash-1', status: 'active' },
    job: { jobId: 'course-path-v2-1111', releaseId: 'course-path-v2-1111', phase: 'complete' },
  });
  assert.equal(status.status, RELEASE_STATUS.CURRENT);
  assert.equal(status.activationRequired, false);
});

test('deploying Functions is not evidence that content is current', () => {
  const status = resolveReleaseStatus({
    deployed,
    active: { releaseId: 'course-path-v2-0000', contentHash: 'hash-0', status: 'active' },
    job: null,
  });
  assert.equal(status.status, RELEASE_STATUS.ACTIVATION_REQUIRED);
  assert.equal(status.activationRequired, true);
  assert.equal(status.activeReleaseId, 'course-path-v2-0000');
});

test('a job still holding its lease reads as running; a stalled one as resumable', () => {
  const base = { jobId: 'course-path-v2-1111', releaseId: 'course-path-v2-1111', phase: 'staging', completedChunks: 2, totalChunks: 6 };
  assert.equal(resolveReleaseStatus({ deployed, active: null, job: { ...base, running: true } }).status, RELEASE_STATUS.RUNNING);

  const interrupted = resolveReleaseStatus({ deployed, active: null, job: { ...base, running: false } });
  assert.equal(interrupted.status, RELEASE_STATUS.INTERRUPTED);
  assert.equal(interrupted.completedChunks, 2);
  assert.equal(interrupted.totalChunks, 6);
});

test('a failed job is reported as failed and carries its diagnostic', () => {
  const lastError = pathReleaseDiagnostic({
    phase: PATH_RELEASE_PHASE.STAGING,
    code: PATH_RELEASE_ERROR.STAGE_WRITE_FAILED,
    questionId: 'mm_A_2A_v2_table-domain-range',
    propertyPath: 'variants[2].stimulus.table.rows[1]',
  });
  const status = resolveReleaseStatus({
    deployed,
    active: null,
    job: { jobId: 'course-path-v2-1111', releaseId: 'course-path-v2-1111', phase: 'failed', lastError },
  });

  assert.equal(status.status, RELEASE_STATUS.FAILED);
  assert.equal(status.lastError.questionId, 'mm_A_2A_v2_table-domain-range');
  assert.equal(status.lastError.propertyPath, 'variants[2].stimulus.table.rows[1]');
  assert.equal(status.lastError.recoverable, true);
});

test('no deployed artifact is its own state, not a failure', () => {
  const status = resolveReleaseStatus({ deployed: null, active: null, job: null });
  assert.equal(status.status, RELEASE_STATUS.NO_ARTIFACT);
  assert.equal(status.activationRequired, false);
});

test('a Hosting bundle from a different build is reported as a mismatch, with what differs', () => {
  const status = resolveReleaseStatus({
    deployed,
    active: { releaseId: 'course-path-v2-1111', contentHash: 'hash-1', status: 'active' },
    job: null,
    browserManifest: { releaseId: 'course-path-v2-2222', contentHash: 'hash-2' },
  });

  assert.equal(status.status, RELEASE_STATUS.DEPLOYMENT_MISMATCH);
  assert.equal(status.mismatch.browserReleaseId, 'course-path-v2-2222');
  assert.equal(status.mismatch.serverReleaseId, 'course-path-v2-1111');
  assert.deepEqual(status.mismatch.differs, ['releaseId', 'contentHash']);
});

test('comparing two manifests names every field and course count that differs', () => {
  const comparison = compareReleaseManifests(
    { releaseId: 'a', contentHash: 'h1', schemaVersion: 1, questionCount: 1161, courseCounts: { algebra1: 245, grade6: 237 } },
    { releaseId: 'b', contentHash: 'h2', schemaVersion: 1, questionCount: 1162, courseCounts: { algebra1: 246, grade7: 212 } },
  );

  assert.equal(comparison.identical, false);
  const fields = comparison.differences.map((difference) => difference.field);
  assert.ok(fields.includes('releaseId'));
  assert.ok(fields.includes('contentHash'));
  assert.ok(fields.includes('questionCount'));
  assert.ok(fields.includes('courseCounts.algebra1'));
  assert.ok(fields.includes('courseCounts.grade6'));
  assert.ok(fields.includes('courseCounts.grade7'));
  assert.equal(fields.includes('schemaVersion'), false);

  assert.equal(compareReleaseManifests({ releaseId: 'a' }, { releaseId: 'a' }).identical, true);
});

// --- diagnostics --------------------------------------------------------------

test('every release failure carries what an administrator needs to act', () => {
  const diagnostic = pathReleaseDiagnostic({
    phase: PATH_RELEASE_PHASE.VALIDATING,
    code: PATH_RELEASE_ERROR.DOCUMENT_UNCERTIFIED,
    message: 'A compiled Path document is not storable.',
    releaseId: 'course-path-v2-1111',
    jobId: 'course-path-v2-1111',
    questionId: 'mm_A2_4E_v2_quadratic-regression-table',
    familyId: 'A2.4E-regression',
    propertyPath: 'variants[2].stimulus.table.rows[1]',
  });

  assert.equal(diagnostic.phase, 'validating');
  assert.equal(diagnostic.questionId, 'mm_A2_4E_v2_quadratic-regression-table');
  assert.equal(diagnostic.familyId, 'A2.4E-regression');
  assert.equal(diagnostic.propertyPath, 'variants[2].stimulus.table.rows[1]');
  assert.equal(diagnostic.recoverable, false);
  assert.match(diagnostic.nextAction, /rebuild/i);
});

test('an interrupted write is recoverable and says so', () => {
  const diagnostic = pathReleaseDiagnostic({
    phase: PATH_RELEASE_PHASE.STAGING,
    code: PATH_RELEASE_ERROR.STAGE_WRITE_FAILED,
  });
  assert.equal(diagnostic.recoverable, true);
  assert.match(diagnostic.nextAction, /Resume/i);
});
