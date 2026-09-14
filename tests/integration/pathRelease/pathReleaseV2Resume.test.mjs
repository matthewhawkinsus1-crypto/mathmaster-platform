/*
 * PATH RELEASE V2 — interrupted multi-chunk release, against real Firestore.
 *
 * HOW TO RUN:  npm run test:path-release:emulator
 *
 * WHY THIS IS IN A SUBDIRECTORY. `npm run test:challenge-finish` runs
 * `node --test tests/integration/*.test.mjs` — one emulator, every suite in that
 * directory, in parallel. This suite stages 1,161 documents into
 * `pathQuestionBank` and clears `pathCoverage` around itself, which is exactly
 * the state the Live Challenge and Test Cycle certifications are reading. The
 * glob is not recursive, so living one level down keeps both honest: they get an
 * undisturbed database, and this gets a database it is allowed to own.
 *
 * tests/platform proves the RULES with a Firestore stand-in: what the diff says,
 * which chunk resumes, what order activation and cleanup happen in. All of that
 * can be true while the release is broken, because none of it runs against a
 * database that enforces batch limits, document sizes, field paths and its own
 * idea of what a nested array is.
 *
 * So this stages the REAL certified course release — every Grade 6/7/8,
 * Algebra I and Algebra II family — into a real Firestore, kills it part way
 * through, resumes it, and reads back what actually landed.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const require = createRequire(import.meta.url);

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  'FIRESTORE_EMULATOR_HOST must be set — this suite must never reach a real project.',
);

const admin = require(require.resolve('firebase-admin', { paths: [path.join(repo, 'functions')] }));
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'mathmaster-path-release' });
const db = admin.firestore();

const compiler = require(path.join(repo, 'functions/lib/pathContentCompiler.js'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const { generatePathInstance } = await import(path.join(repo, 'functions/shared/pathQuestionGeneration.mjs'));
const releaseArtifact = require(path.join(repo, 'functions-path-admin/lib/releaseArtifact.js'));
const { runCoursePathRelease, readReleaseStatus } = require(path.join(repo, 'functions-path-admin/lib/releaseService.js'));
const { buildCoursePathRelease } = await import(path.join(repo, 'scripts/build-course-path-release-v2.mjs'));
const { releaseIdForContentHash } = await import(path.join(repo, 'functions/shared/pathReleasePlan.mjs'));

const ACTOR = { uid: 'uid-root-admin', email: 'matthew.hawkins@desotoisd.org' };
const BANK = 'pathQuestionBank';

// In production path-admin resolves firebase-admin from its own deployed
// node_modules; here the suite hands it the same sentinel from the copy the
// emulator harness already loaded. Nothing about the release logic changes.
const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

/** The real certified release, compiled and issuer-proved exactly as CI does. */
const built = await buildCoursePathRelease({ samples: 4 });
assert.deepEqual(built.failures, [], 'the built-in course content must certify before this suite runs');

const artifact = {
  loadReleaseManifest: () => built.manifest,
  loadReleaseDocuments: () => ({
    schemaVersion: built.manifest.schemaVersion,
    releaseId: built.manifest.releaseId,
    contentHash: built.manifest.contentHash,
    documents: built.documents.map((entry) => ({
      id: entry.id, courseId: entry.courseId, contentHash: entry.contentHash, document: entry.document,
    })),
  }),
  deployedReleaseIdentity: () => ({
    releaseId: built.manifest.releaseId,
    contentHash: built.manifest.contentHash,
    schemaVersion: built.manifest.schemaVersion,
    compilerSchemaVersion: built.manifest.compilerSchemaVersion,
    questionCount: built.manifest.questionCount,
    courses: built.manifest.courses,
    courseCounts: built.manifest.courseCounts,
    documentsAvailable: true,
  }),
  verifyReleaseManifest: releaseArtifact.verifyReleaseManifest,
  verifyDocumentsForStaging: releaseArtifact.verifyDocumentsForStaging,
};

/**
 * The real Firestore, with a kill switch on batch commits.
 *
 * "The process stopped after chunk N" is not something a test can politely ask
 * for, so the commit that would have been chunk N+1 simply never happens.
 */
const interruptible = (database) => {
  const state = { commits: 0, failFrom: null };
  const wrapper = {
    state,
    collection: (name) => database.collection(name),
    getAll: (...refs) => database.getAll(...refs),
    // The release lease is transactional, and it must stay transactional here:
    // pass it straight through to real Firestore rather than modelling it.
    runTransaction: (handler) => database.runTransaction(handler),
    batch: () => {
      const batch = database.batch();
      return {
        set: (...args) => batch.set(...args),
        delete: (...args) => batch.delete(...args),
        commit: async () => {
          state.commits += 1;
          if (state.failFrom != null && state.commits >= state.failFrom) {
            throw new Error(`Commit ${state.commits} interrupted by the certification.`);
          }
          return batch.commit();
        },
      };
    },
  };
  return wrapper;
};

const deleteCollection = async (reference) => {
  const snapshot = await reference.get();
  for (let index = 0; index < snapshot.docs.length; index += 300) {
    const batch = db.batch();
    snapshot.docs.slice(index, index + 300).forEach((doc) => batch.delete(doc.ref));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
};

const clean = async () => {
  await deleteCollection(db.collection(BANK));
  await deleteCollection(db.collection('pathCoverage'));
  const jobs = await db.collection('pathReleaseJobs').get();
  for (const job of jobs.docs) {
    // eslint-disable-next-line no-await-in-loop
    await deleteCollection(job.ref.collection('chunks'));
    // eslint-disable-next-line no-await-in-loop
    await job.ref.delete();
  }
  await deleteCollection(db.collection('pathReleaseState').doc('course').collection('documentIndex'));
  await db.collection('pathReleaseState').doc('course').delete().catch(() => {});
};

before(clean);
after(clean);

test('an interrupted multi-chunk release resumes into exactly one active release', async (t) => {
  const releaseId = built.manifest.releaseId;
  assert.equal(releaseId, releaseIdForContentHash(built.manifest.contentHash));

  // --- stage the first chunk, then stop --------------------------------------
  const first = interruptible(db);
  first.state.failFrom = 2;
  const interrupted = await runCoursePathRelease({
    db: first,
    actor: ACTOR,
    releaseArtifact: artifact,
    serverTimestamp,
    chunkSize: 400,
  });

  assert.equal(interrupted.ok, false, 'the release must report the interruption');
  assert.equal(interrupted.failedFromPhase, 'staging');
  assert.equal(interrupted.diagnostic.code, 'path-release/stage-write-failed');

  const stagedCount = (await db.collection(BANK).count().get()).data().count;
  assert.equal(stagedCount, 400, `only the committed chunk reached production, found ${stagedCount}`);

  const midState = (await db.collection('pathReleaseState').doc('course').get()).data();
  assert.equal(midState.status, 'updating', 'a half-staged release is never advertised as active');
  assert.equal(midState.pendingReleaseId, releaseId);

  const midJob = (await db.collection('pathReleaseJobs').doc(releaseId).get()).data();
  assert.equal(midJob.phase, 'failed');
  assert.deepEqual(midJob.completedChunkIndexes, [0]);
  assert.equal(midJob.totalChunks, Math.ceil(built.manifest.questionCount / 400));

  t.diagnostic(`interrupted after ${midJob.completedChunks} of ${midJob.totalChunks} chunks`);

  // --- resume ----------------------------------------------------------------
  const second = interruptible(db);
  const resumed = await runCoursePathRelease({
    db: second,
    actor: ACTOR,
    releaseArtifact: artifact,
    serverTimestamp,
    chunkSize: 400,
  });

  assert.equal(resumed.ok, true, JSON.stringify(resumed.diagnostic || {}));
  assert.equal(resumed.phase, 'complete');

  // --- exactly one active release --------------------------------------------
  const jobs = await db.collection('pathReleaseJobs').get();
  assert.equal(jobs.size, 1, 'a resumed release must not create a second job');
  assert.equal(jobs.docs[0].id, releaseId);
  assert.equal(jobs.docs[0].data().phase, 'complete');

  const finalState = (await db.collection('pathReleaseState').doc('course').get()).data();
  assert.equal(finalState.status, 'active');
  assert.equal(finalState.releaseId, releaseId);
  assert.equal(finalState.contentHash, built.manifest.contentHash);
  assert.equal(finalState.pendingReleaseId, null);

  // --- correct final document counts and hashes ------------------------------
  const finalCount = (await db.collection(BANK).count().get()).data().count;
  assert.equal(finalCount, built.manifest.questionCount);

  const indexShards = await db.collection('pathReleaseState').doc('course').collection('documentIndex').get();
  const indexed = indexShards.docs.flatMap((shard) => shard.data().entries);
  assert.equal(indexed.length, built.manifest.questionCount);
  assert.deepEqual([...new Set(indexShards.docs.map((shard) => shard.data().releaseId))], [releaseId]);

  const expected = new Map(built.manifest.documents.map((entry) => [entry.id, entry.contentHash]));
  const stored = await db.collection(BANK).get();
  assert.equal(stored.size, expected.size);
  const mismatched = [];
  stored.docs.forEach((doc) => {
    const data = doc.data();
    if (data.pathContentHash !== expected.get(doc.id)) mismatched.push(doc.id);
    if (data.pathReleaseId !== releaseId) mismatched.push(`${doc.id}:releaseId`);
    // And what landed really is what the compiler certified: re-hash the stored
    // document, which is the only way to prove Firestore did not reshape it.
    if (compiler.pathDocumentContentHash({ id: doc.id, ...data }) !== expected.get(doc.id)) {
      mismatched.push(`${doc.id}:rehash`);
    }
  });
  assert.deepEqual(mismatched.slice(0, 5), []);

  // --- coverage is valid ------------------------------------------------------
  for (const courseId of built.manifest.courses) {
    // eslint-disable-next-line no-await-in-loop
    const coverage = (await db.collection('pathCoverage').doc(courseId).get()).data();
    assert.ok(coverage, `${courseId} coverage must exist`);
    assert.ok(coverage.summary, `${courseId} coverage must carry a summary`);
    const studentReady = Object.values(coverage.skills || {}).filter((skill) => skill.studentReady).length;
    assert.ok(studentReady > 0, `${courseId} must have launchable standards after the release`);
    t.diagnostic(`${courseId}: ${studentReady} student-ready standards`);
  }
});

test('a student can still be issued a question from what production now stores', async (t) => {
  // The round trip is the point. A document can compile, certify and hash
  // correctly and still come back from Firestore in a shape the issuer refuses —
  // that is exactly the class of failure this project exists to remove, and the
  // only way to see it is to read production back.
  const sampled = [];
  for (const courseId of built.manifest.courses) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection(BANK).where('courseId', '==', courseId).limit(6).get();
    snapshot.docs.forEach((doc) => sampled.push({ courseId, id: doc.id, data: { id: doc.id, ...doc.data() } }));
  }
  assert.ok(sampled.length >= 25, `only ${sampled.length} stored documents sampled`);

  for (const entry of sampled) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await mathPath.buildTemplateIssuePlan(entry.data, { samples: 4 });
    assert.equal(plan.issuable, true, `${entry.courseId} ${entry.id}: ${plan.reason}`);

    const draw = generatePathInstance(entry.data, `issuance-after-release-${entry.id}`);
    assert.ok(draw.question, `${entry.id}: ${draw.reason}`);
    // A real unbound placeholder is `{{name}}`. Matching a bare `}}` would fire
    // on the JSON of the stored Firestore timestamp, which is not a placeholder.
    assert.doesNotMatch(JSON.stringify(draw.question), /\{\{[^{}]*\}\}/, `${entry.id} left a placeholder unbound`);

    // eslint-disable-next-line no-await-in-loop
    const issued = await mathPath.buildIssuePlan(draw.question);
    assert.equal(issued.issuable, true, `${entry.id} generated an instance the issuer refuses`);
    assert.ok(issued.privateGrading, `${entry.id} generated an instance with no private answer key`);
  }
  t.diagnostic(`issued and privately graded ${sampled.length} stored families`);
});

test('republishing the completed release writes nothing and reports already active', async () => {
  const before = (await db.collection(BANK).get()).docs
    .map((doc) => `${doc.id}:${doc.data().pathContentHash}`)
    .sort();

  const again = await runCoursePathRelease({ db, actor: ACTOR, releaseArtifact: artifact, serverTimestamp, chunkSize: 400 });
  assert.equal(again.ok, true);
  assert.equal(again.status, 'already-active');

  const after = (await db.collection(BANK).get()).docs
    .map((doc) => `${doc.id}:${doc.data().pathContentHash}`)
    .sort();
  assert.deepEqual(after, before, 'not one question document changed');

  const status = await readReleaseStatus({ db, releaseArtifact: artifact });
  assert.equal(status.status, 'current');
  assert.equal(status.activationRequired, false);
});

test('a one-question change writes one document and rebuilds one course', async () => {
  const target = built.documents.find((entry) => entry.courseId === 'algebra1');
  const changedDocument = { ...target.document, prompt: `${target.document.prompt} (release certification)` };
  const changedHash = compiler.pathDocumentContentHash(changedDocument);

  const nextDocuments = built.documents.map((entry) => (entry.id === target.id
    ? { ...entry, contentHash: changedHash, document: changedDocument }
    : entry));
  const nextManifestDocuments = built.manifest.documents.map((entry) => (entry.id === target.id
    ? { ...entry, contentHash: changedHash }
    : entry));
  const contentHash = compiler.pathContentHash({
    schemaVersion: built.manifest.schemaVersion,
    compilerSchemaVersion: built.manifest.compilerSchemaVersion,
    documents: nextManifestDocuments.map((entry) => [entry.id, entry.contentHash, entry.courseId]),
  });
  const nextManifest = {
    ...built.manifest,
    contentHash,
    releaseId: releaseIdForContentHash(contentHash),
    documents: nextManifestDocuments,
  };

  const nextArtifact = {
    ...artifact,
    loadReleaseManifest: () => nextManifest,
    loadReleaseDocuments: () => ({
      schemaVersion: nextManifest.schemaVersion,
      releaseId: nextManifest.releaseId,
      contentHash: nextManifest.contentHash,
      documents: nextDocuments.map((entry) => ({
        id: entry.id, courseId: entry.courseId, contentHash: entry.contentHash, document: entry.document,
      })),
    }),
  };

  const result = await runCoursePathRelease({ db, actor: ACTOR, releaseArtifact: nextArtifact, serverTimestamp, chunkSize: 400 });

  assert.equal(result.ok, true, JSON.stringify(result.diagnostic || {}));
  assert.equal(result.counts.changed, 1);
  assert.equal(result.counts.added, 0);
  assert.equal(result.counts.removed, 0);
  assert.equal(result.counts.unchanged, built.manifest.questionCount - 1);
  assert.deepEqual(result.coverage.courses, ['algebra1'], 'only the affected course is rebuilt');
  assert.equal(result.coverage.issuerRuns, 0, 'certified verdicts are reused rather than re-derived');

  const stored = (await db.collection(BANK).doc(target.id).get()).data();
  assert.equal(stored.pathContentHash, changedHash);
  assert.match(stored.prompt, /release certification/);
  assert.equal((await db.collection(BANK).count().get()).data().count, built.manifest.questionCount);

  // Two releases have now run; there is still exactly one job per release and
  // one active pointer.
  const state = (await db.collection('pathReleaseState').doc('course').get()).data();
  assert.equal(state.releaseId, nextManifest.releaseId);
  assert.equal(state.previousReleaseId, built.manifest.releaseId);
});
