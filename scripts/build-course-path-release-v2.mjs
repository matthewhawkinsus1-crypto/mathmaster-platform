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
export function browserManifestSource(manifest, buildMetadata) {
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

/*
 * WRITE ONLY WHAT CHANGED (F-REL-6).
 *
 * Two of the three outputs are TRACKED: the certified manifest and the
 * browser's release identity. Both carry build metadata (builtAt, gitCommit),
 * so rewriting them on every run dirtied the tree on every run. And this build
 * runs far more often than a content change: it is the path-admin predeploy,
 * and the Firebase CLI runs every codebase's predeploy for a deploy that names
 * functions (`--only functions:<name>`), so each function group of a release
 * rebuilt it. The Hosting step's provenance gate then refused a dirty tree, and
 * the release stopped one step short of done.
 *
 * So the build compares before it writes. When the committed manifest already
 * describes the release just built — the same identity `--verify` checks
 * (releaseId, contentHash, schemaVersion, compilerSchemaVersion, questionCount,
 * courseCounts) — the tracked pair is left as it is, with the build metadata it
 * was committed with. The answer-bearing documents package (gitignored, deployed)
 * is always written. When the content changed, both tracked files are
 * rewritten with fresh build metadata, as before, and must be committed.
 */

export const RELEASE_FILE_PATHS = Object.freeze({
  manifest: MANIFEST_PATH,
  documents: DOCUMENTS_PATH,
  browserManifest: BROWSER_MANIFEST_PATH,
});

/**
 * Which release files a build must write. Pure.
 *
 * @param {object} input
 * @param {object} input.builtManifest           the manifest just built (no `build` block)
 * @param {object|null} input.committedManifest  the manifest on disk, parsed, or null
 * @param {string|null} input.committedBrowserSource  the browser identity file's text, or null
 * @returns {{ unchanged: boolean, writeManifest: boolean, writeBrowserManifest: boolean,
 *             writeDocuments: true, buildMetadata: object|null, differences: object[] }}
 *          `buildMetadata` is the committed build block to keep, or null when
 *          the caller must stamp fresh metadata.
 */
export function planCourseReleaseWrites({ builtManifest, committedManifest = null, committedBrowserSource = null } = {}) {
  const comparison = compareReleaseManifests(committedManifest, builtManifest);
  const keptBuild = committedManifest?.build && typeof committedManifest.build === 'object' && committedManifest.build.builtAt
    ? committedManifest.build
    : null;
  const unchanged = Boolean(builtManifest?.releaseId) && Boolean(committedManifest?.releaseId) && comparison.identical && Boolean(keptBuild);
  if (!unchanged) {
    return {
      unchanged: false,
      writeManifest: true,
      writeBrowserManifest: true,
      writeDocuments: true,
      buildMetadata: null,
      differences: comparison.differences,
    };
  }
  // The browser identity is derived from the release and the kept build
  // metadata. Rewrite it only when it no longer says exactly that — missing,
  // hand-edited, or produced by an older template — never just to restamp it.
  return {
    unchanged: true,
    writeManifest: false,
    writeBrowserManifest: committedBrowserSource !== browserManifestSource(builtManifest, keptBuild),
    writeDocuments: true,
    buildMetadata: keptBuild,
    differences: [],
  };
}

const readJsonOrNull = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

const readTextOrNull = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

/**
 * Write the release files the plan calls for. `freshBuildMetadata()` is only
 * called when the tracked files are rewritten (it shells out to git).
 */
export function writeCourseReleaseFiles({ manifest, documents, freshBuildMetadata, paths = RELEASE_FILE_PATHS }) {
  const plan = planCourseReleaseWrites({
    builtManifest: manifest,
    committedManifest: readJsonOrNull(paths.manifest),
    committedBrowserSource: readTextOrNull(paths.browserManifest),
  });
  const buildMetadata = plan.buildMetadata || freshBuildMetadata();
  const written = [];
  const kept = [];

  fs.mkdirSync(path.dirname(paths.manifest), { recursive: true });
  if (plan.writeManifest) {
    fs.writeFileSync(paths.manifest, `${JSON.stringify({ ...manifest, build: buildMetadata }, null, 2)}\n`);
    written.push(paths.manifest);
  } else {
    kept.push(paths.manifest);
  }
  fs.mkdirSync(path.dirname(paths.documents), { recursive: true });
  fs.writeFileSync(paths.documents, `${JSON.stringify({
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
  written.push(paths.documents);
  if (plan.writeBrowserManifest) {
    fs.mkdirSync(path.dirname(paths.browserManifest), { recursive: true });
    fs.writeFileSync(paths.browserManifest, browserManifestSource(manifest, buildMetadata));
    written.push(paths.browserManifest);
  } else {
    kept.push(paths.browserManifest);
  }
  return { ...plan, buildMetadata, written, kept };
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

  const result = writeCourseReleaseFiles({
    manifest,
    documents,
    freshBuildMetadata: () => ({
      builtAt: new Date().toISOString(),
      builtBy: 'scripts/build-course-path-release-v2.mjs',
      gitCommit: gitCommit(),
      nodeVersion: process.version,
      certificationMs: elapsed,
    }),
  });

  const describe = {
    [MANIFEST_PATH]: 'certified manifest, committed',
    [DOCUMENTS_PATH]: 'answer-bearing package — server-side only, never Hosting',
    [BROWSER_MANIFEST_PATH]: 'identity only, committed',
  };
  console.log(`\nWrote:`);
  result.written.forEach((file) => console.log(`  ${path.relative(ROOT, file)}  (${describe[file] || 'release file'})`));
  if (result.kept.length) {
    console.log(`Kept, unchanged — the committed files already describe ${manifest.releaseId} (built ${result.buildMetadata.builtAt}):`);
    result.kept.forEach((file) => console.log(`  ${path.relative(ROOT, file)}  (${describe[file] || 'release file'})`));
  }
  if (!result.unchanged) {
    console.log('\nThe release changed: commit the manifest and the browser identity with the content change.');
  }
  console.log('');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
