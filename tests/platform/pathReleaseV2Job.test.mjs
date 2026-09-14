import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { createFakeFirestore } from './helpers/fakeFirestore.mjs';
import { PATH_RELEASE_ERROR, PATH_RELEASE_PHASE, releaseIdForContentHash } from '../../functions/shared/pathReleasePlan.mjs';

const require = createRequire(import.meta.url);
const compiler = require('../../functions/lib/pathContentCompiler.js');
const realArtifact = require('../../functions-path-admin/lib/releaseArtifact.js');
const { runCoursePathRelease, readReleaseStatus } = require('../../functions-path-admin/lib/releaseService.js');

// The release engine, end to end, against a Firestore stand-in that records the
// exact sequence of commits. Everything asserted here is a property of that
// sequence: what is written, what is deliberately NOT written, what order
// activation and cleanup happen in, and what a second attempt does.

const ACTOR = { uid: 'uid-admin', email: 'matthew.hawkins@desotoisd.org' };
const BANK = 'pathQuestionBank';

/** A small certified release, compiled and hashed exactly as the build does. */
function syntheticRelease(authored) {
  const compiled = compiler.compilePathQuestionPackage(authored, {
    defaults: { builtInPathSeed: 'mathmaster-built-in-path-bank' },
  });
  assert.equal(compiled.ok, true, compiled.errors.map((error) => `${error.code} ${error.path}`).join('; '));

  const documents = compiled.documents
    .map((entry) => ({
      id: entry.id,
      familyId: entry.familyId,
      courseId: String(entry.document.courseId || 'algebra1'),
      contentHash: entry.contentHash,
      samples: 12,
      document: entry.document,
    }))
    .sort((left, right) => (left.id < right.id ? -1 : 1));

  const contentHash = compiler.pathContentHash({
    schemaVersion: 1,
    compilerSchemaVersion: compiler.PATH_COMPILER_SCHEMA_VERSION,
    documents: documents.map((entry) => [entry.id, entry.contentHash, entry.courseId]),
  });

  const manifest = {
    schemaVersion: 1,
    compilerSchemaVersion: compiler.PATH_COMPILER_SCHEMA_VERSION,
    releaseLine: 'course',
    releaseId: releaseIdForContentHash(contentHash),
    contentHash,
    questionCount: documents.length,
    courses: ['algebra1'],
    courseCounts: { algebra1: documents.length },
    certificationSamples: 12,
    documents: documents.map((entry) => ({
      id: entry.id, familyId: entry.familyId, courseId: entry.courseId, contentHash: entry.contentHash, samples: entry.samples,
    })),
  };

  return {
    manifest,
    artifact: {
      loadReleaseManifest: () => manifest,
      loadReleaseDocuments: () => ({
        schemaVersion: manifest.schemaVersion,
        releaseId: manifest.releaseId,
        contentHash: manifest.contentHash,
        documents: documents.map((entry) => ({
          id: entry.id, courseId: entry.courseId, contentHash: entry.contentHash, document: entry.document,
        })),
      }),
      deployedReleaseIdentity: () => ({
        releaseId: manifest.releaseId,
        contentHash: manifest.contentHash,
        schemaVersion: manifest.schemaVersion,
        compilerSchemaVersion: manifest.compilerSchemaVersion,
        questionCount: manifest.questionCount,
        courses: manifest.courses,
        courseCounts: manifest.courseCounts,
        documentsAvailable: true,
      }),
      verifyReleaseManifest: realArtifact.verifyReleaseManifest,
      verifyDocumentsForStaging: realArtifact.verifyDocumentsForStaging,
    },
  };
}

const family = (id, { prompt = 'Solve for x.', courseId = 'algebra1', standard = 'texas:A.2A', band = 3 } = {}) => ({
  id,
  active: true,
  courseId,
  familyId: `${id}-family`,
  alignmentKeys: [standard],
  questionType: 'response',
  difficultyBand: band,
  dok: 2,
  prompt,
  responseFields: [{ id: 'answer', label: 'x =', expected: '4' }],
});

const run = (db, artifact, options = {}) => runCoursePathRelease({
  db,
  actor: ACTOR,
  releaseArtifact: artifact,
  serverTimestamp: () => 1700000000000,
  chunkSize: 2,
  ...options,
});

const bankCount = (db) => db.countIn(BANK);

test('a first release stages, activates, rebuilds coverage and verifies', async () => {
  const db = createFakeFirestore();
  const { manifest, artifact } = syntheticRelease([family('q1'), family('q2'), family('q3')]);

  const result = await run(db, artifact);

  assert.equal(result.ok, true, JSON.stringify(result.diagnostic || {}));
  assert.equal(result.phase, PATH_RELEASE_PHASE.COMPLETE);
  assert.deepEqual(
    { added: result.counts.added, changed: result.counts.changed, unchanged: result.counts.unchanged, removed: result.counts.removed },
    { added: 3, changed: 0, unchanged: 0, removed: 0 },
  );
  assert.equal(bankCount(db), 3);

  const state = db.snapshotFor('pathReleaseState/course').data();
  assert.equal(state.status, 'active');
  assert.equal(state.releaseId, manifest.releaseId);
  assert.equal(state.contentHash, manifest.contentHash);

  const job = db.snapshotFor(`pathReleaseJobs/${manifest.releaseId}`).data();
  assert.equal(job.phase, PATH_RELEASE_PHASE.COMPLETE);
  assert.equal(job.actorEmail, ACTOR.email);
  assert.equal(job.lastError, null);

  // Every stored document carries the release identity the next comparison reads.
  const stored = db.snapshotFor(`${BANK}/q1`).data();
  assert.equal(stored.pathReleaseId, manifest.releaseId);
  assert.equal(stored.pathContentHash, manifest.documents.find((entry) => entry.id === 'q1').contentHash);
  assert.equal(stored.builtInPathSeed, 'mathmaster-built-in-path-bank');
  assert.deepEqual(result.coverage.courses, ['algebra1']);
});

// 9. The same release, twice.
test('publishing the same release twice resolves to already active and writes nothing', async () => {
  const db = createFakeFirestore();
  const { manifest, artifact } = syntheticRelease([family('q1'), family('q2'), family('q3')]);

  await run(db, artifact);
  const writesAfterFirst = db.counters.writes;
  db.resetCounters();

  const second = await run(db, artifact);

  assert.equal(second.ok, true);
  assert.equal(second.status, 'already-active');
  assert.equal(second.releaseId, manifest.releaseId);
  assert.equal(db.counters.writes, 0, 'a retry of an active release writes nothing at all');
  assert.equal(db.counters.deletes, 0);
  assert.ok(writesAfterFirst > 0);
  assert.equal(bankCount(db), 3, 'and no document was duplicated');
});

// 11 + 12. Unchanged documents are skipped; changed ones are written.
test('a one-document change writes one document and leaves the rest untouched', async () => {
  const db = createFakeFirestore();
  const first = syntheticRelease([family('q1'), family('q2'), family('q3')]);
  await run(db, first.artifact);

  const q3Before = db.snapshotFor(`${BANK}/q3`).data();
  db.resetCounters();

  const second = syntheticRelease([
    family('q1'),
    family('q2', { prompt: 'Solve for x, showing each step.' }),
    family('q3'),
  ]);
  const result = await run(db, second.artifact);

  assert.equal(result.ok, true, JSON.stringify(result.diagnostic || {}));
  assert.equal(result.counts.changed, 1);
  assert.equal(result.counts.unchanged, 2);
  assert.equal(result.counts.added, 0);

  const bankWrites = db.commitLog.flat().filter((operation) => operation.startsWith(`set:${BANK}/`));
  assert.deepEqual(bankWrites, [`set:${BANK}/q2`], 'only the changed document is written');
  assert.deepEqual(db.snapshotFor(`${BANK}/q3`).data(), q3Before, 'an unchanged document is not rewritten');
  assert.equal(db.snapshotFor(`${BANK}/q2`).data().prompt, 'Solve for x, showing each step.');
});

// 13. Superseded documents are removed only after staging and activation.
test('superseded content is deleted only after every write and the pointer flip', async () => {
  const db = createFakeFirestore();
  await run(db, syntheticRelease([family('q1'), family('q2'), family('retired')]).artifact);
  db.resetCounters();

  const next = syntheticRelease([family('q1'), family('q2', { prompt: 'Changed.' }), family('q4')]);
  const result = await run(db, next.artifact);

  assert.equal(result.ok, true);
  assert.equal(result.counts.removed, 1);
  assert.equal(db.snapshotFor(`${BANK}/retired`).exists, false);
  assert.equal(db.snapshotFor(`${BANK}/q4`).exists, true);

  const flattened = db.commitLog.flat();
  const deleteIndex = flattened.indexOf(`delete:${BANK}/retired`);
  const lastBankWrite = flattened.map((operation, index) => (operation.startsWith(`set:${BANK}/`) ? index : -1))
    .reduce((highest, index) => Math.max(highest, index), -1);
  assert.ok(deleteIndex > lastBankWrite, 'nothing is deleted until every replacement has been written');

  // And the pointer says active before the delete happens.
  const stateWrite = flattened.indexOf('set:pathReleaseState/course');
  assert.ok(stateWrite === -1 || deleteIndex > stateWrite);
});

test('a superseded document is not deleted when the release fails before activation', async () => {
  const db = createFakeFirestore();
  await run(db, syntheticRelease([family('q1'), family('retired')]).artifact);

  const next = syntheticRelease([family('q1'), family('q2'), family('q3')]);
  db.resetCounters();
  db.interruptFromCommit(1);
  const failed = await run(db, next.artifact);

  assert.equal(failed.ok, false);
  assert.equal(failed.diagnostic.code, PATH_RELEASE_ERROR.STAGE_WRITE_FAILED);
  assert.equal(db.snapshotFor(`${BANK}/retired`).exists, true, 'content nobody has replaced yet is still there');
});

// 10. Interrupted, then resumed.
test('a release interrupted mid-staging resumes and completes exactly once', async () => {
  const db = createFakeFirestore();
  const { manifest, artifact } = syntheticRelease([
    family('q1'), family('q2'), family('q3'), family('q4'), family('q5'),
  ]);

  // Chunks of two: the first commit lands, the second is interrupted.
  db.interruptFromCommit(2);
  const interrupted = await run(db, artifact);

  assert.equal(interrupted.ok, false);
  assert.equal(interrupted.phase, PATH_RELEASE_PHASE.FAILED);
  assert.equal(interrupted.failedFromPhase, PATH_RELEASE_PHASE.STAGING);
  assert.equal(bankCount(db), 2, 'only the committed chunk reached production');

  const midJob = db.snapshotFor(`pathReleaseJobs/${manifest.releaseId}`).data();
  assert.equal(midJob.phase, PATH_RELEASE_PHASE.FAILED);
  assert.equal(midJob.totalChunks, 3);
  assert.deepEqual(midJob.completedChunkIndexes, [0]);
  const updatingState = db.snapshotFor('pathReleaseState/course').data();
  assert.equal(updatingState.status, 'updating', 'production says updating, not active');

  // Resume.
  db.resume();
  db.resetCounters();
  const resumed = await run(db, artifact);

  assert.equal(resumed.ok, true, JSON.stringify(resumed.diagnostic || {}));
  assert.equal(resumed.phase, PATH_RELEASE_PHASE.COMPLETE);
  assert.equal(bankCount(db), 5);

  const rewritten = db.commitLog.flat().filter((operation) => operation.startsWith(`set:${BANK}/`));
  assert.deepEqual(rewritten.sort(), [`set:${BANK}/q3`, `set:${BANK}/q4`, `set:${BANK}/q5`],
    'the chunk that already committed is not rewritten');

  const finalState = db.snapshotFor('pathReleaseState/course').data();
  assert.equal(finalState.status, 'active');
  assert.equal(finalState.releaseId, manifest.releaseId);

  // Exactly one active release: one job document, one pointer, one index.
  const jobs = db.documentsIn('pathReleaseJobs');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, manifest.releaseId);
  const shards = db.documentsIn('pathReleaseState/course/documentIndex');
  const indexed = shards.flatMap((shard) => shard.data().entries);
  assert.equal(indexed.length, 5);
  assert.deepEqual([...new Set(shards.map((shard) => shard.data().releaseId))], [manifest.releaseId]);

  // And the stored hashes are the certified ones.
  const expected = new Map(manifest.documents.map((entry) => [entry.id, entry.contentHash]));
  ['q1', 'q2', 'q3', 'q4', 'q5'].forEach((id) => {
    assert.equal(db.snapshotFor(`${BANK}/${id}`).data().pathContentHash, expected.get(id));
  });
});

test('resuming twice after completion is still one release', async () => {
  const db = createFakeFirestore();
  const { manifest, artifact } = syntheticRelease([family('q1'), family('q2')]);
  await run(db, artifact);
  await run(db, artifact);
  const third = await run(db, artifact);

  assert.equal(third.status, 'already-active');
  assert.equal(db.documentsIn('pathReleaseJobs').length, 1);
  assert.equal(bankCount(db), 2);
  assert.equal(db.snapshotFor(`pathReleaseJobs/${manifest.releaseId}`).data().phase, PATH_RELEASE_PHASE.COMPLETE);
});

// 16. An invalid package fails before any live mutation.
test('a package whose document does not match its certified hash writes nothing', async () => {
  const db = createFakeFirestore();
  const { manifest, artifact } = syntheticRelease([family('q1'), family('q2')]);
  const tampered = {
    ...artifact,
    loadReleaseDocuments: () => {
      const payload = artifact.loadReleaseDocuments();
      return {
        ...payload,
        documents: payload.documents.map((entry) => (entry.id === 'q2'
          ? { ...entry, document: { ...entry.document, prompt: 'Tampered after certification.' } }
          : entry)),
      };
    },
  };

  const result = await run(db, tampered);

  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, PATH_RELEASE_ERROR.DOCUMENT_HASH_MISMATCH);
  assert.equal(result.diagnostic.questionId, 'q2');
  assert.equal(bankCount(db), 0, 'not one live document was mutated');
  // The release state document may exist because taking the release lease writes
  // to it. What must NOT have happened is an activation: no release is named, and
  // production is not told anything changed.
  const state = db.snapshotFor('pathReleaseState/course').data() || {};
  assert.equal(state.releaseId ?? null, null, 'no release was activated');
  assert.equal(state.status ?? null, null);
  assert.equal(state.pendingReleaseId ?? null, null, 'production was never told an update had begun');
  assert.equal(db.snapshotFor(`pathReleaseJobs/${manifest.releaseId}`).data().phase, PATH_RELEASE_PHASE.FAILED);
});

test('a package carrying an uncertifiable document fails with the property path', async () => {
  const db = createFakeFirestore();
  const { artifact } = syntheticRelease([family('q1')]);
  const broken = {
    ...artifact,
    loadReleaseDocuments: () => {
      const payload = artifact.loadReleaseDocuments();
      const entry = payload.documents[0];
      const document = { ...entry.document, variants: [{}, { stimulus: { diagram: { segments: [['a', 'b']] } } }] };
      return {
        ...payload,
        documents: [{ ...entry, document, contentHash: compiler.pathDocumentContentHash(document) }],
      };
    },
  };
  // The tampered document no longer matches the manifest, so the hash gate is
  // what catches it first; make the manifest agree so certification is reached.
  const payload = broken.loadReleaseDocuments();
  const manifest = artifact.loadReleaseManifest();
  const alignedManifest = {
    ...manifest,
    documents: [{ ...manifest.documents[0], contentHash: payload.documents[0].contentHash }],
  };
  broken.loadReleaseManifest = () => alignedManifest;
  broken.verifyReleaseManifest = async () => [];

  const result = await run(db, broken);

  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, PATH_RELEASE_ERROR.DOCUMENT_UNCERTIFIED);
  assert.equal(result.diagnostic.propertyPath, 'variants[1].stimulus.diagram.segments[0]');
  assert.equal(result.diagnostic.recoverable, false);
  assert.equal(bankCount(db), 0);
});

test('a release whose manifest declares an unsupported schema is refused', async () => {
  const db = createFakeFirestore();
  const { artifact, manifest } = syntheticRelease([family('q1')]);
  const future = { ...artifact, loadReleaseManifest: () => ({ ...manifest, schemaVersion: 99 }) };

  const result = await run(db, future);

  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, PATH_RELEASE_ERROR.SCHEMA_UNSUPPORTED);
  assert.equal(bankCount(db), 0);
});

// 14. A course release touches no assessment-framework document.
test('a course release never reads, writes or deletes assessment content', async () => {
  const db = createFakeFirestore();
  db.seed(`${BANK}/sat-1`, {
    id: 'sat-1', courseId: 'algebra1', alignmentKeys: ['texas:A.2A'],
    assessmentContext: { framework: 'digitalSAT' }, builtInPathSeed: 'mathmaster-built-in-path-bank',
  });
  db.seed(`${BANK}/asvab-1`, {
    id: 'asvab-1', courseId: 'algebra1', alignmentKeys: ['texas:A.2A'],
    assessmentContext: { framework: 'asvab' }, builtInPathSeed: 'mathmaster-built-in-path-bank',
  });

  const result = await run(db, syntheticRelease([family('q1'), family('q2')]).artifact);

  assert.equal(result.ok, true);
  assert.equal(result.counts.removed, 0, 'assessment documents are not superseded by a course release');
  assert.equal(db.snapshotFor(`${BANK}/sat-1`).exists, true);
  assert.equal(db.snapshotFor(`${BANK}/asvab-1`).exists, true);

  const touched = db.commitLog.flat().filter((operation) => /sat-1|asvab-1/.test(operation));
  assert.deepEqual(touched, []);

  // Nor do they reach the release index.
  const indexed = db.documentsIn('pathReleaseState/course/documentIndex')
    .flatMap((shard) => shard.data().entries.map((entry) => entry.id));
  assert.deepEqual(indexed.sort(), ['q1', 'q2']);
});

test('an existing bank with identical content is recognised, not rewritten', async () => {
  const db = createFakeFirestore();
  const { manifest, artifact } = syntheticRelease([family('q1'), family('q2')]);

  // Production already holds exactly this content, written by an earlier run.
  manifest.documents.forEach((entry) => {
    const payload = artifact.loadReleaseDocuments().documents.find((document) => document.id === entry.id);
    db.seed(`${BANK}/${entry.id}`, {
      ...payload.document,
      builtInPathSeed: 'mathmaster-built-in-path-bank',
      pathContentHash: entry.contentHash,
    });
  });
  db.resetCounters();

  const result = await run(db, artifact);

  assert.equal(result.ok, true);
  assert.equal(result.counts.unchanged, 2);
  assert.equal(result.counts.writes, 0);
  const bankWrites = db.commitLog.flat().filter((operation) => operation.startsWith(`set:${BANK}/`));
  assert.deepEqual(bankWrites, [], 'approximately zero question-document writes');
});

test('status reports the deployed release, the active release and the job', async () => {
  const db = createFakeFirestore();
  const { manifest, artifact } = syntheticRelease([family('q1'), family('q2')]);

  const before = await readReleaseStatus({ db, releaseArtifact: artifact });
  assert.equal(before.status, 'activation-required');
  assert.equal(before.deployedReleaseId, manifest.releaseId);
  assert.equal(before.activeReleaseId, null);

  await run(db, artifact);

  const after = await readReleaseStatus({ db, releaseArtifact: artifact });
  assert.equal(after.status, 'current');
  assert.equal(after.label, 'Production is current');
  assert.equal(after.activeReleaseId, manifest.releaseId);
  assert.equal(after.job.phase, PATH_RELEASE_PHASE.COMPLETE);
  assert.equal(after.legacyRefreshDeprecated, true);

  const mismatched = await readReleaseStatus({
    db,
    releaseArtifact: artifact,
    browserManifest: { releaseId: 'course-path-v2-staleaaaaaaaaaa', contentHash: 'stale' },
  });
  assert.equal(mismatched.status, 'deployment-mismatch');
  assert.equal(mismatched.mismatch.serverReleaseId, manifest.releaseId);
});

test('coverage is rebuilt only for the affected course and reuses certified verdicts', async () => {
  const db = createFakeFirestore();
  const first = syntheticRelease([
    family('a1', { standard: 'texas:A.2A' }),
    family('g6', { standard: 'texas:6.4A', courseId: 'grade6' }),
  ]);
  first.manifest.courses = ['grade6', 'algebra1'];
  await run(db, first.artifact);

  const second = syntheticRelease([
    family('a1', { standard: 'texas:A.2A', prompt: 'Changed.' }),
    family('g6', { standard: 'texas:6.4A', courseId: 'grade6' }),
  ]);
  second.manifest.courses = ['grade6', 'algebra1'];

  const result = await run(db, second.artifact);

  assert.equal(result.ok, true, JSON.stringify(result.diagnostic || {}));
  assert.deepEqual(result.coverage.courses, ['algebra1']);
  assert.ok(result.coverage.skipped.includes('grade6'));
  assert.equal(result.coverage.issuerRuns, 0, 'certified verdicts are reused rather than re-derived');
  assert.equal(result.coverage.reusedCertifiedPlans, 2);
});

// --- one release at a time, across releases ---------------------------------
//
// Mutual exclusion has to live on what is SHARED. A lease held per job cannot
// see a different release at all, because two releases write two different job
// documents — and then release A's supersede list, computed before B activated,
// can delete documents B has just written.

test('a release in progress blocks a different release from starting', async () => {
  const db = createFakeFirestore();
  const releaseB = syntheticRelease([family('q1'), family('q2')]);

  // Release A is mid-flight: it holds the lease on the shared course state.
  db.seed('pathReleaseState/course', {
    status: 'updating',
    pendingReleaseId: 'course-path-v2-aaaaaaaaaaaaaaaa',
    leaseOperationId: 'op-release-a',
    leaseReleaseId: 'course-path-v2-aaaaaaaaaaaaaaaa',
    leaseHeartbeatAt: Date.now(),
  });
  db.resetCounters();

  const result = await run(db, releaseB.artifact, { operationId: 'op-release-b' });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, PATH_RELEASE_ERROR.ACTIVATION_CONFLICT);
  assert.match(result.diagnostic.message, /course-path-v2-aaaaaaaaaaaaaaaa/);
  assert.equal(result.diagnostic.details.heldByReleaseId, 'course-path-v2-aaaaaaaaaaaaaaaa');
  assert.equal(bankCount(db), 0, 'the blocked release writes nothing');
  assert.equal(db.snapshotFor('pathReleaseState/course').data().pendingReleaseId, 'course-path-v2-aaaaaaaaaaaaaaaa');
});

test('a second attempt at the same release is refused while the first holds the lease', async () => {
  const db = createFakeFirestore();
  const { manifest, artifact } = syntheticRelease([family('q1'), family('q2')]);
  db.seed('pathReleaseState/course', {
    leaseOperationId: 'op-first',
    leaseReleaseId: manifest.releaseId,
    leaseHeartbeatAt: Date.now(),
  });

  const second = await run(db, artifact, { operationId: 'op-second' });

  assert.equal(second.ok, false);
  assert.equal(second.diagnostic.code, PATH_RELEASE_ERROR.ACTIVATION_CONFLICT);
  assert.equal(bankCount(db), 0);
});

test('a stale lease is taken over, because that is what resuming is', async () => {
  const db = createFakeFirestore();
  const { manifest, artifact } = syntheticRelease([family('q1'), family('q2')]);
  db.seed('pathReleaseState/course', {
    leaseOperationId: 'op-abandoned',
    leaseReleaseId: manifest.releaseId,
    leaseHeartbeatAt: Date.now() - (10 * 60 * 1000),
  });

  const result = await run(db, artifact, { operationId: 'op-resuming' });

  assert.equal(result.ok, true, JSON.stringify(result.diagnostic || {}));
  assert.equal(result.phase, PATH_RELEASE_PHASE.COMPLETE);
  assert.equal(bankCount(db), 2);
});

test('the lease is given back when a release finishes or fails', async () => {
  const db = createFakeFirestore();
  const { artifact } = syntheticRelease([family('q1')]);

  await run(db, artifact, { operationId: 'op-complete' });
  assert.equal(db.snapshotFor('pathReleaseState/course').data().leaseOperationId, null, 'a completed release holds nothing');

  // A DIFFERENT release, so this is a real attempt rather than the already-active
  // answer, and one whose package is missing so it fails during validation.
  const other = syntheticRelease([family('q9')]);
  const broken = { ...other.artifact, loadReleaseDocuments: () => null };
  const failed = await run(db, broken, { operationId: 'op-failed' });
  assert.equal(failed.ok, false);
  assert.equal(db.snapshotFor('pathReleaseState/course').data().leaseOperationId, null, 'a failed release holds nothing either');
});

test('a release that lost its lease refuses to activate or delete anything', async () => {
  const db = createFakeFirestore();
  await run(db, syntheticRelease([family('q1'), family('retired')]).artifact);

  const next = syntheticRelease([family('q1'), family('q2')]);
  // Somebody else takes the lease while this release is staging.
  const stealAfterStaging = {
    ...next.artifact,
    verifyDocumentsForStaging: async (...args) => {
      const diagnostics = await next.artifact.verifyDocumentsForStaging(...args);
      db.seed('pathReleaseState/course', {
        ...db.snapshotFor('pathReleaseState/course').data(),
        leaseOperationId: 'op-somebody-else',
        leaseHeartbeatAt: Date.now(),
      });
      return diagnostics;
    },
  };

  const result = await run(db, stealAfterStaging, { operationId: 'op-overtaken' });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostic.code, PATH_RELEASE_ERROR.ACTIVATION_CONFLICT);
  assert.equal(result.diagnostic.phase, PATH_RELEASE_PHASE.ACTIVATING);
  assert.equal(db.snapshotFor(`${BANK}/retired`).exists, true, 'nothing was superseded');
  assert.notEqual(db.snapshotFor('pathReleaseState/course').data().releaseId, next.manifest.releaseId);
});

// --- rolling back -----------------------------------------------------------
//
// A completed job whose release production is NO LONGER serving is a rollback,
// not a resume. Its recorded chunks were written against a different production
// state; following them stages nothing and still moves the pointer.

test('rolling back to an earlier release actually moves the content back', async () => {
  const db = createFakeFirestore();
  const releaseA = syntheticRelease([family('q1'), family('q2')]);
  const releaseB = syntheticRelease([
    family('q1', { prompt: 'Version B.' }),
    family('q2', { prompt: 'Version B.' }),
  ]);

  await run(db, releaseA.artifact);
  await run(db, releaseB.artifact);
  assert.equal(db.snapshotFor(`${BANK}/q1`).data().prompt, 'Version B.');

  const rollback = await run(db, releaseA.artifact);

  assert.equal(rollback.ok, true, JSON.stringify(rollback.diagnostic || {}));
  assert.equal(rollback.counts.changed, 2, 'both documents are written back');
  assert.equal(db.snapshotFor(`${BANK}/q1`).data().prompt, 'Solve for x.');
  assert.equal(db.snapshotFor(`${BANK}/q2`).data().prompt, 'Solve for x.');

  const state = db.snapshotFor('pathReleaseState/course').data();
  assert.equal(state.releaseId, releaseA.manifest.releaseId);
  assert.equal(state.previousReleaseId, releaseB.manifest.releaseId);

  const expected = new Map(releaseA.manifest.documents.map((entry) => [entry.id, entry.contentHash]));
  ['q1', 'q2'].forEach((id) => {
    assert.equal(db.snapshotFor(`${BANK}/${id}`).data().pathContentHash, expected.get(id));
  });
});

test('a rollback re-supersedes content the newer release added', async () => {
  const db = createFakeFirestore();
  const releaseA = syntheticRelease([family('q1')]);
  const releaseB = syntheticRelease([family('q1'), family('added-by-b')]);

  await run(db, releaseA.artifact);
  await run(db, releaseB.artifact);
  assert.equal(db.snapshotFor(`${BANK}/added-by-b`).exists, true);

  const rollback = await run(db, releaseA.artifact);

  assert.equal(rollback.ok, true, JSON.stringify(rollback.diagnostic || {}));
  assert.equal(rollback.counts.removed, 1);
  assert.equal(db.snapshotFor(`${BANK}/added-by-b`).exists, false);
  assert.equal(bankCount(db), 1);
});

test('the rollback replans rather than replaying the completed run', async () => {
  const db = createFakeFirestore();
  const releaseA = syntheticRelease([family('q1'), family('q2')]);
  const releaseB = syntheticRelease([family('q1', { prompt: 'Version B.' }), family('q2', { prompt: 'Version B.' })]);

  await run(db, releaseA.artifact);
  await run(db, releaseB.artifact);
  db.resetCounters();

  await run(db, releaseA.artifact);

  // The chunk plan on disk describes the ROLLBACK, not the original run.
  const chunks = db.documentsIn(`pathReleaseJobs/${releaseA.manifest.releaseId}/chunks`);
  const planned = chunks.flatMap((chunk) => chunk.data().ids);
  assert.deepEqual(planned.sort(), ['q1', 'q2']);
  chunks.forEach((chunk) => assert.equal(chunk.data().status, 'complete'));

  const written = db.commitLog.flat().filter((operation) => operation.startsWith(`set:${BANK}/`));
  assert.deepEqual(written.sort(), [`set:${BANK}/q1`, `set:${BANK}/q2`]);
});
