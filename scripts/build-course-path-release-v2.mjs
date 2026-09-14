#!/usr/bin/env node
// Build and CERTIFY the course Path release artifact.
//
//   node scripts/build-course-path-release-v2.mjs            # build + write
//   node scripts/build-course-path-release-v2.mjs --verify    # CI gate, writes nothing
//   node scripts/build-course-path-release-v2.mjs --samples 16
//
// Certification is the expensive half of the lifecycle and it belongs HERE, in
// the build, not in a production callable that repeats it on every publish:
//
//   1. compile   every authored family through the one Path content compiler
//   2. certify   the compiled document against the recursive Firestore-shape
//                validator — a malformed record fails the build, naming the
//                question, the family and the exact property path
//   3. issue     sample real generated instances through the PRODUCTION issuer
//                and confirm each one is issuable AND privately gradeable
//   4. hash      a stable content hash per document and one for the release
//
// The answer-bearing package stays server-side: the compiled documents are
// written into the Cloud Functions source for the path-admin codebase, never
// into `public/`, `dist/`, or any browser bundle. Only a non-answer-bearing
// identity summary (release id, hashes, counts) reaches the browser.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const compiler = require(path.join(ROOT, 'functions/lib/pathContentCompiler.js'));
const mathPath = require(path.join(ROOT, 'functions/lib/mathPath.js'));
const {
  PATH_RELEASE_SCHEMA_VERSION,
  releaseIdForContentHash,
  compareReleaseManifests,
} = await import(path.join(ROOT, 'functions/shared/pathReleasePlan.mjs'));

/** The built-in course release line. Assessment frameworks are NOT part of it. */
export const COURSE_RELEASE_SOURCES = Object.freeze([
  { courseId: 'grade6', file: 'grade6_pathQuestionBank_seed.json' },
  { courseId: 'grade7', file: 'grade7_pathQuestionBank_seed.json' },
  { courseId: 'grade8', file: 'grade8_pathQuestionBank_seed.json' },
  { courseId: 'algebra1', file: 'algebra1_pathQuestionBank_seed.json' },
  { courseId: 'algebra2', file: 'algebra2_pathQuestionBank_seed.json' },
]);

const SEED_DIR = path.join(ROOT, 'functions/seeds/pathQuestionBank');
const RELEASE_DIR = path.join(ROOT, 'functions-path-admin/release');
export const MANIFEST_PATH = path.join(RELEASE_DIR, 'coursePathReleaseV2.manifest.json');
export const DOCUMENTS_PATH = path.join(RELEASE_DIR, 'coursePathReleaseV2.documents.json');
export const BROWSER_MANIFEST_PATH = path.join(ROOT, 'src/platform/path/pathReleaseManifest.generated.js');

/** Written onto every release document so legacy cleanup still recognises it. */
export const BUILT_IN_PATH_SEED_MARKER = 'mathmaster-built-in-path-bank';

/** How many generated instances must prove a family before it may ship. */
export const DEFAULT_CERTIFICATION_SAMPLES = 12;

const readSeed = (file) => {
  const parsed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), 'utf8'));
  return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
};

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

const gitCommit = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

const authoredFramework = (item) => {
  const raw = item?.assessmentContext?.framework ?? item?.assessmentFramework ?? null;
  const text = String(raw ?? '').trim();
  return text && text.toLowerCase() !== 'course' ? text : null;
};

/**
 * Compile + certify the whole built-in course release.
 *
 * Returns the manifest, the compiled documents and every failure. Exported so
 * the tests can certify the real content without shelling out to a build.
 */
export async function buildCoursePathRelease({
  samples = DEFAULT_CERTIFICATION_SAMPLES,
  onProgress = null,
} = {}) {
  const failures = [];
  const documents = [];
  const courseCounts = {};
  const sourceFiles = [];

  for (const source of COURSE_RELEASE_SOURCES) {
    const raw = fs.readFileSync(path.join(SEED_DIR, source.file), 'utf8');
    sourceFiles.push({ courseId: source.courseId, file: source.file, sha256: sha256(raw), bytes: raw.length });
    const items = readSeed(source.file);
    onProgress?.({ phase: 'compile', courseId: source.courseId, count: items.length });

    // A course release must never carry assessment-framework content. Checking
    // it here means the coordinated SAT/ACT/TSIA2 and independent ASVAB release
    // lines cannot be disturbed by publishing course content.
    items.forEach((item, index) => {
      const framework = authoredFramework(item);
      if (framework) {
        failures.push({
          code: 'path-release/assessment-content-in-course-release',
          questionId: item?.id || `items[${index}]`,
          familyId: item?.familyId || null,
          courseId: source.courseId,
          path: `items[${index}].assessmentContext.framework`,
          message: `${source.file} contains ${framework} assessment content. The course release line may only carry course content.`,
        });
      }
    });

    const compiled = compiler.compilePathQuestionPackage(items, {
      defaults: { builtInPathSeed: BUILT_IN_PATH_SEED_MARKER },
    });
    compiled.errors.forEach((error) => failures.push({
      code: error.code,
      questionId: error.questionId,
      familyId: error.familyId,
      courseId: source.courseId,
      path: error.path,
      message: error.message,
    }));

    for (const entry of compiled.documents) {
      // THE PRODUCTION ISSUER, on the COMPILED document — the exact bytes a
      // student will be served. Validating the authored object instead would
      // certify something production never stores.
      // eslint-disable-next-line no-await-in-loop
      const plan = await certifyIssuable(entry.document, samples);
      if (!plan.issuable) {
        failures.push({
          code: 'path-release/not-issuable',
          questionId: entry.id,
          familyId: entry.familyId,
          courseId: entry.document.courseId || source.courseId,
          path: '$',
          message: `The production issuer refused this family after ${plan.samples} sampled instances: ${plan.reason}.`,
        });
        continue;
      }
      documents.push({
        id: entry.id,
        familyId: entry.familyId,
        courseId: String(entry.document.courseId || source.courseId),
        contentHash: entry.contentHash,
        samples: plan.samples,
        document: entry.document,
      });
    }
    courseCounts[source.courseId] = compiled.documents.length;
    onProgress?.({ phase: 'certify', courseId: source.courseId, count: compiled.documents.length });
  }

  documents.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  const contentHash = compiler.pathContentHash({
    schemaVersion: PATH_RELEASE_SCHEMA_VERSION,
    compilerSchemaVersion: compiler.PATH_COMPILER_SCHEMA_VERSION,
    documents: documents.map((entry) => [entry.id, entry.contentHash, entry.courseId]),
  });

  const manifest = {
    schemaVersion: PATH_RELEASE_SCHEMA_VERSION,
    compilerSchemaVersion: compiler.PATH_COMPILER_SCHEMA_VERSION,
    releaseLine: 'course',
    releaseId: failures.length ? null : releaseIdForContentHash(contentHash),
    contentHash,
    questionCount: documents.length,
    courses: COURSE_RELEASE_SOURCES.map((source) => source.courseId),
    courseCounts,
    certificationSamples: samples,
    sourceFiles,
    documents: documents.map((entry) => ({
      id: entry.id,
      familyId: entry.familyId,
      courseId: entry.courseId,
      contentHash: entry.contentHash,
      samples: entry.samples,
    })),
  };

  return { manifest, documents, failures };
}

async function certifyIssuable(document, samples) {
  try {
    const plan = await mathPath.buildTemplateIssuePlan(document, { samples });
    if (!plan.issuable) return { issuable: false, reason: plan.reason || 'not_issuable', samples: plan.samples || 0 };
    return { issuable: true, reason: null, samples: plan.samples || 0 };
  } catch (error) {
    return { issuable: false, reason: `validator_exception: ${error?.message || error}`, samples: 0 };
  }
}

/** The identity the browser bundle carries. No answers, no question content. */
function browserManifestSource(manifest, buildMetadata) {
  return `// GENERATED by scripts/build-course-path-release-v2.mjs — do not edit.
//
// The certified course Path release this Hosting bundle was built from. It is
// IDENTITY ONLY: a release id, a content hash and counts. No question, answer,
// generator or grading data is ever published to the browser — the answer-bearing
// package lives only inside the path-admin Cloud Functions deployment.
//
// The admin release page sends this identity to the server so a Hosting bundle
// and a path-admin deployment from different builds are reported as a mismatch
// rather than silently publishing against stale assumptions.

export const DEPLOYED_COURSE_PATH_RELEASE = Object.freeze({
  releaseId: ${JSON.stringify(manifest.releaseId)},
  contentHash: ${JSON.stringify(manifest.contentHash)},
  schemaVersion: ${JSON.stringify(manifest.schemaVersion)},
  compilerSchemaVersion: ${JSON.stringify(manifest.compilerSchemaVersion)},
  questionCount: ${JSON.stringify(manifest.questionCount)},
  courses: Object.freeze(${JSON.stringify(manifest.courses)}),
  courseCounts: Object.freeze(${JSON.stringify(manifest.courseCounts)}),
  builtAt: ${JSON.stringify(buildMetadata.builtAt)},
});

export default DEPLOYED_COURSE_PATH_RELEASE;
`;
}

function reportFailures(failures) {
  const byCode = failures.reduce((acc, failure) => {
    acc[failure.code] = (acc[failure.code] || 0) + 1;
    return acc;
  }, {});
  console.error(`\n✗ ${failures.length} Path release certification failure(s)`);
  Object.entries(byCode).sort().forEach(([code, count]) => console.error(`   ${count.toString().padStart(5)}  ${code}`));
  console.error('\nFirst failures:');
  failures.slice(0, 25).forEach((failure) => {
    console.error(`   ${failure.questionId || '(no id)'} [${failure.courseId || '?'}] ${failure.path}`);
    console.error(`      ${failure.code}: ${failure.message}`);
  });
  if (failures.length > 25) console.error(`   … and ${failures.length - 25} more`);
}

async function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes('--verify');
  const samplesIndex = args.indexOf('--samples');
  const samples = samplesIndex >= 0 ? Number(args[samplesIndex + 1]) || DEFAULT_CERTIFICATION_SAMPLES : DEFAULT_CERTIFICATION_SAMPLES;

  const started = Date.now();
  const { manifest, documents, failures } = await buildCoursePathRelease({ samples });
  const elapsed = Date.now() - started;

  if (failures.length) {
    reportFailures(failures);
    console.error(`\nNothing was written. Fix the authored content and run this again.\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`Course Path release ${manifest.releaseId}`);
  console.log(`  schema ${manifest.schemaVersion} · compiler ${manifest.compilerSchemaVersion}`);
  console.log(`  ${manifest.questionCount} certified documents in ${elapsed} ms (${samples} sampled instances each)`);
  Object.entries(manifest.courseCounts).forEach(([courseId, count]) => console.log(`    ${courseId.padEnd(9)} ${count}`));
  console.log(`  content hash ${manifest.contentHash}`);

  if (verifyOnly) {
    if (!fs.existsSync(MANIFEST_PATH)) {
      console.error('\n✗ No committed manifest to verify against. Run the build without --verify first.');
      process.exitCode = 1;
      return;
    }
    const committed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const comparison = compareReleaseManifests(committed, manifest);
    if (!comparison.identical) {
      console.error('\n✗ The committed release manifest does not match the built-in course content.');
      comparison.differences.forEach((difference) => {
        console.error(`   ${difference.field}: committed ${JSON.stringify(difference.left)} · built ${JSON.stringify(difference.right)}`);
      });
      console.error('\nRun: npm run release:path:build\n');
      process.exitCode = 1;
      return;
    }
    const committedDocs = new Map((committed.documents || []).map((entry) => [entry.id, entry.contentHash]));
    const drifted = manifest.documents.filter((entry) => committedDocs.get(entry.id) !== entry.contentHash);
    if (drifted.length) {
      console.error(`\n✗ ${drifted.length} document hash(es) drifted from the committed manifest:`);
      drifted.slice(0, 15).forEach((entry) => console.error(`   ${entry.id} (${entry.courseId})`));
      console.error('\nRun: npm run release:path:build\n');
      process.exitCode = 1;
      return;
    }
    console.log('\n✓ The committed release manifest matches the built-in course content.\n');
    return;
  }

  const buildMetadata = {
    builtAt: new Date().toISOString(),
    builtBy: 'scripts/build-course-path-release-v2.mjs',
    gitCommit: gitCommit(),
    nodeVersion: process.version,
    certificationMs: elapsed,
  };

  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify({ ...manifest, build: buildMetadata }, null, 2)}\n`);
  fs.writeFileSync(DOCUMENTS_PATH, `${JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    compilerSchemaVersion: manifest.compilerSchemaVersion,
    releaseId: manifest.releaseId,
    contentHash: manifest.contentHash,
    documents: documents.map((entry) => ({
      id: entry.id,
      courseId: entry.courseId,
      contentHash: entry.contentHash,
      document: entry.document,
    })),
  })}\n`);
  fs.writeFileSync(BROWSER_MANIFEST_PATH, browserManifestSource(manifest, buildMetadata));

  console.log(`\nWrote:`);
  console.log(`  ${path.relative(ROOT, MANIFEST_PATH)}   (certified manifest, committed)`);
  console.log(`  ${path.relative(ROOT, DOCUMENTS_PATH)}  (answer-bearing package — server-side only, never Hosting)`);
  console.log(`  ${path.relative(ROOT, BROWSER_MANIFEST_PATH)} (identity only)\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
