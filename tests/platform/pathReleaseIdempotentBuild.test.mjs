// A PREDEPLOY MUST NOT DIRTY THE TREE WHEN NOTHING CHANGED (F-REL-6).
//
// `node scripts/build-course-path-release-v2.mjs` is the path-admin predeploy,
// and the Firebase CLI runs every codebase's predeploy for a deploy that names
// functions (`--only functions:<name>`) — so it runs for every function group
// of a release. It used to rewrite its two TRACKED outputs with a fresh
// builtAt/gitCommit every time; the tree went dirty and the Hosting step's
// provenance gate refused the rest of the release. Now the tracked pair is
// rewritten only when the certified release changed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BROWSER_MANIFEST_PATH,
  MANIFEST_PATH,
  browserManifestSource,
  buildCoursePathRelease,
  planCourseReleaseWrites,
  writeCourseReleaseFiles,
} from '../../scripts/build-course-path-release-v2.mjs';

const BUILD = Object.freeze({
  builtAt: '2026-09-13T23:38:08.892Z',
  builtBy: 'scripts/build-course-path-release-v2.mjs',
  gitCommit: '6bedfd2dfd93d8510df8d018b79bb0f46021a008',
  nodeVersion: 'v22.22.2',
  certificationMs: 1344,
});

const built = Object.freeze({
  schemaVersion: 1,
  compilerSchemaVersion: 2,
  releaseLine: 'course',
  releaseId: 'course-path-v2-605951fe94fedd2b',
  contentHash: '605951fe94fedd2bf440b0deb2bc93a0e4608449dd729e6444586633adaf7b86',
  questionCount: 3,
  courses: ['grade6', 'algebra1'],
  courseCounts: { grade6: 2, algebra1: 1 },
  certificationSamples: 12,
  sourceFiles: [{ courseId: 'grade6', file: 'grade6.json', sha256: 'a'.repeat(64), bytes: 10 }],
  documents: [{ id: 'q1', familyId: 'q1', courseId: 'grade6', contentHash: 'h1', samples: 12 }],
});
const committed = (overrides = {}) => ({ ...built, build: BUILD, ...overrides });
const committedBrowser = browserManifestSource(built, BUILD);

test('an unchanged release keeps both tracked files and the build metadata they were committed with', () => {
  const plan = planCourseReleaseWrites({ builtManifest: built, committedManifest: committed(), committedBrowserSource: committedBrowser });
  assert.equal(plan.unchanged, true);
  assert.equal(plan.writeManifest, false);
  assert.equal(plan.writeBrowserManifest, false);
  assert.equal(plan.writeDocuments, true, 'the gitignored, deployed package is always written');
  assert.deepEqual(plan.buildMetadata, BUILD);
});

test('a change to any identity field is a new release: both tracked files are rewritten, freshly stamped', () => {
  const changes = {
    releaseId: { releaseId: 'course-path-v2-0000000000000000' },
    contentHash: { contentHash: '0'.repeat(64) },
    schemaVersion: { schemaVersion: 2 },
    compilerSchemaVersion: { compilerSchemaVersion: 3 },
    questionCount: { questionCount: 4 },
    'courseCounts.grade6': { courseCounts: { grade6: 1, algebra1: 1 } },
    'courseCounts.algebra2': { courseCounts: { grade6: 2, algebra1: 1, algebra2: 0 } },
    'courseCounts.algebra1': { courseCounts: { grade6: 2 } },
  };
  Object.entries(changes).forEach(([field, override]) => {
    const plan = planCourseReleaseWrites({ builtManifest: built, committedManifest: committed(override), committedBrowserSource: committedBrowser });
    assert.equal(plan.unchanged, false, field);
    assert.equal(plan.writeManifest, true, field);
    assert.equal(plan.writeBrowserManifest, true, field);
    assert.equal(plan.buildMetadata, null, `${field}: fresh build metadata`);
    assert.ok(plan.differences.some((difference) => difference.field === field), `${field} is named: ${JSON.stringify(plan.differences)}`);
  });
});

test('what is not release identity does not restamp the tracked files', () => {
  const plan = planCourseReleaseWrites({
    builtManifest: built,
    committedManifest: committed({
      certificationSamples: 6,
      sourceFiles: [{ courseId: 'grade6', file: 'grade6.json', sha256: 'b'.repeat(64), bytes: 11 }],
      documents: [{ id: 'q1', familyId: 'q1', courseId: 'grade6', contentHash: 'h1', samples: 6 }],
      build: { ...BUILD, nodeVersion: 'v20.0.0' },
    }),
    committedBrowserSource: browserManifestSource(built, { ...BUILD, nodeVersion: 'v20.0.0' }),
  });
  assert.equal(plan.writeManifest, false);
  assert.equal(plan.writeBrowserManifest, false);
});

test('no committed manifest, or one with no build metadata, is written fresh', () => {
  for (const committedManifest of [null, committed({ build: undefined }), committed({ build: { builtBy: 'hand' } })]) {
    const plan = planCourseReleaseWrites({ builtManifest: built, committedManifest, committedBrowserSource: committedBrowser });
    assert.equal(plan.writeManifest, true);
    assert.equal(plan.writeBrowserManifest, true);
    assert.equal(plan.buildMetadata, null);
  }
  // A failed build has no release id and is never "unchanged".
  assert.equal(planCourseReleaseWrites({ builtManifest: { ...built, releaseId: null }, committedManifest: committed({ releaseId: null }) }).unchanged, false);
});

test('a missing or stale browser identity is regenerated from the KEPT build metadata, never restamped', () => {
  for (const committedBrowserSource of [null, committedBrowser.replace('builtAt: "2026', 'builtAt: "2025'), `${committedBrowser}// edited\n`]) {
    const plan = planCourseReleaseWrites({ builtManifest: built, committedManifest: committed(), committedBrowserSource });
    assert.equal(plan.writeManifest, false);
    assert.equal(plan.writeBrowserManifest, true);
    assert.deepEqual(plan.buildMetadata, BUILD, 'the manifest and the browser identity keep one builtAt');
  }
});

// --- the real files and the real content ------------------------------------

const release = await buildCoursePathRelease({ samples: 1 });
const tempCopy = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-path-release-'));
  const paths = {
    manifest: path.join(dir, 'release', 'coursePathReleaseV2.manifest.json'),
    documents: path.join(dir, 'release', 'coursePathReleaseV2.documents.json'),
    browserManifest: path.join(dir, 'src', 'pathReleaseManifest.generated.js'),
  };
  fs.mkdirSync(path.dirname(paths.manifest), { recursive: true });
  fs.mkdirSync(path.dirname(paths.browserManifest), { recursive: true });
  fs.copyFileSync(MANIFEST_PATH, paths.manifest);
  fs.copyFileSync(BROWSER_MANIFEST_PATH, paths.browserManifest);
  return { dir, paths };
};

test('the committed release files are current, so the path-admin predeploy rewrites nothing tracked', () => {
  assert.deepEqual(release.failures, []);
  const plan = planCourseReleaseWrites({
    builtManifest: release.manifest,
    committedManifest: JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')),
    committedBrowserSource: fs.readFileSync(BROWSER_MANIFEST_PATH, 'utf8'),
  });
  assert.equal(plan.writeManifest, false, `run npm run release:path:build and commit: ${JSON.stringify(plan.differences)}`);
  assert.equal(plan.writeBrowserManifest, false, 'the committed browser identity matches the committed manifest');
});

test('rebuilding unchanged content leaves the tracked files byte for byte, and still writes the deployed package', () => {
  const { dir, paths } = tempCopy();
  const before = { manifest: fs.readFileSync(paths.manifest), browser: fs.readFileSync(paths.browserManifest) };
  let stamped = 0;
  const result = writeCourseReleaseFiles({
    manifest: release.manifest,
    documents: release.documents,
    freshBuildMetadata: () => { stamped += 1; return { builtAt: 'NOW' }; },
    paths,
  });
  assert.equal(stamped, 0, 'no fresh build metadata is even computed');
  assert.ok(fs.readFileSync(paths.manifest).equals(before.manifest), 'manifest untouched');
  assert.ok(fs.readFileSync(paths.browserManifest).equals(before.browser), 'browser identity untouched');
  assert.deepEqual(result.kept.sort(), [paths.browserManifest, paths.manifest].sort());
  const documents = JSON.parse(fs.readFileSync(paths.documents, 'utf8'));
  assert.equal(documents.releaseId, release.manifest.releaseId);
  assert.equal(documents.documents.length, release.manifest.questionCount);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('changed content rewrites both tracked files with fresh build metadata, to be committed', () => {
  const { dir, paths } = tempCopy();
  const stale = JSON.parse(fs.readFileSync(paths.manifest, 'utf8'));
  fs.writeFileSync(paths.manifest, `${JSON.stringify({ ...stale, contentHash: '0'.repeat(64), releaseId: 'course-path-v2-0000000000000000' }, null, 2)}\n`);
  const result = writeCourseReleaseFiles({
    manifest: release.manifest,
    documents: release.documents,
    freshBuildMetadata: () => ({ builtAt: '2030-01-01T00:00:00.000Z', builtBy: 'test' }),
    paths,
  });
  assert.equal(result.unchanged, false);
  const rewritten = JSON.parse(fs.readFileSync(paths.manifest, 'utf8'));
  assert.equal(rewritten.contentHash, release.manifest.contentHash);
  assert.deepEqual(rewritten.build, { builtAt: '2030-01-01T00:00:00.000Z', builtBy: 'test' });
  assert.match(fs.readFileSync(paths.browserManifest, 'utf8'), /builtAt: "2030-01-01T00:00:00\.000Z"/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- the default codebase's predeploy ---------------------------------------

test('the default codebase predeploy (CCMR --write) writes back exactly the committed bytes', async () => {
  // `node scripts/build-ccmr-v2-1-production-release.mjs --write` rewrites six
  // tracked seed files on every functions deploy. It stamps no time and no
  // commit, so for unchanged content each write is byte-identical and git sees
  // no change. Comparing BYTES (not parsed JSON) is what keeps that true: a
  // hand-formatted seed would pass the --check comparison and still dirty the
  // tree at deploy.
  const { compileCcmrV21ProductionRelease, buildCcmrV21ProductionWritePlan } = await import('../../scripts/lib/ccmr-v2-1-production-release.mjs');
  const { packages } = await compileCcmrV21ProductionRelease();
  const plan = buildCcmrV21ProductionWritePlan(packages);
  assert.equal(plan.length, 6);
  plan.forEach((entry) => {
    assert.ok(fs.readFileSync(entry.path, 'utf8') === entry.content, `${path.relative(process.cwd(), entry.path)} would be rewritten by the predeploy`);
  });
});
