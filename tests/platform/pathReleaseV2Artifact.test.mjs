import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

import { buildCoursePathRelease, COURSE_RELEASE_SOURCES, MANIFEST_PATH, BROWSER_MANIFEST_PATH } from '../../scripts/build-course-path-release-v2.mjs';
import { compareReleaseManifests, releaseIdForContentHash } from '../../functions/shared/pathReleasePlan.mjs';
import { indexApprovedFamilies } from '../../functions/shared/testCycleBlueprint.mjs';
import { bestPathVariantForTarget, generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const compiler = require('../../functions/lib/pathContentCompiler.js');
const mathPath = require('../../functions/lib/mathPath.js');

// The real built-in course content, compiled and certified the way the build
// does it. This is the gate requirement B describes: a malformed record fails
// here, before production, naming the question and the property path.

const built = await buildCoursePathRelease({ samples: 6 });
const committedManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

const directNestedArrayPaths = (value, path = '$', found = []) => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (Array.isArray(entry)) found.push(`${path}[${index}]`);
      directNestedArrayPaths(entry, `${path}[${index}]`, found);
    });
    return found;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => directNestedArrayPaths(entry, `${path}.${key}`, found));
  }
  return found;
};

const authoredItems = () => COURSE_RELEASE_SOURCES.flatMap((source) => {
  const parsed = JSON.parse(fs.readFileSync(new URL(`../../functions/seeds/pathQuestionBank/${source.file}`, import.meta.url), 'utf8'));
  return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
});

test('the whole built-in course release compiles and certifies with no failures', () => {
  assert.deepEqual(built.failures, [], built.failures.slice(0, 5).map((failure) => `${failure.questionId} ${failure.path}: ${failure.code}`).join('\n'));
  assert.ok(built.documents.length > 1000, `only ${built.documents.length} documents`);
  assert.deepEqual(built.manifest.courses, ['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2']);
});

test('every compiled release document is legal Firestore data', () => {
  const offenders = built.documents
    .map((entry) => ({ id: entry.id, paths: directNestedArrayPaths(entry.document) }))
    .filter((entry) => entry.paths.length);
  assert.deepEqual(offenders, [], offenders.slice(0, 5).map((entry) => `${entry.id}: ${entry.paths[0]}`).join('\n'));

  const uncertified = built.documents
    .flatMap((entry) => compiler.certifyCompiledDocument(entry.document, { id: entry.id }))
    .slice(0, 5);
  assert.deepEqual(uncertified, []);
});

test('the authored course content really does contain the shapes Firestore refuses', () => {
  // This is the production failure the compiler exists to remove. If authoring
  // ever stops producing 2-D rows and coordinate pairs, this test should be
  // deleted deliberately rather than quietly passing for the wrong reason.
  const authored = authoredItems();
  const offenders = authored.filter((item) => directNestedArrayPaths(item).length);
  assert.ok(offenders.length > 0, 'authored content still nests arrays, which is why the compiler is a boundary');

  const beyondTopLevelTables = offenders.filter((item) => directNestedArrayPaths(item)
    .some((path) => !path.startsWith('$.stimulus.table.rows')));
  assert.ok(
    beyondTopLevelTables.length > 0,
    'the shapes that broke production live outside stimulus.table.rows — variants, points and matrix rows',
  );
});

test('a course release carries no assessment-framework content', () => {
  const frameworks = built.documents
    .map((entry) => entry.document?.assessmentContext?.framework || entry.document?.assessmentFramework || null)
    .filter(Boolean);
  assert.deepEqual([...new Set(frameworks)], []);

  ['digitalSAT', 'act', 'tsia2', 'asvab'].forEach((framework) => {
    assert.equal(
      COURSE_RELEASE_SOURCES.some((source) => source.file.includes(framework)),
      false,
      `${framework} is not a course release source`,
    );
  });
});

test('the committed manifest is the content that is actually in the repository', () => {
  const comparison = compareReleaseManifests(committedManifest, built.manifest);
  assert.equal(comparison.identical, true, JSON.stringify(comparison.differences, null, 2));

  const committedHashes = new Map(committedManifest.documents.map((entry) => [entry.id, entry.contentHash]));
  const drifted = built.manifest.documents.filter((entry) => committedHashes.get(entry.id) !== entry.contentHash);
  assert.deepEqual(drifted.map((entry) => entry.id), [], 'run npm run release:path:build');
  assert.equal(committedManifest.releaseId, releaseIdForContentHash(committedManifest.contentHash));
});

test('the release is deterministic: the same content is the same release', async () => {
  const again = await buildCoursePathRelease({ samples: 2 });
  assert.equal(again.manifest.contentHash, built.manifest.contentHash);
  assert.equal(again.manifest.releaseId, built.manifest.releaseId);
  assert.deepEqual(
    again.manifest.documents.map((entry) => entry.contentHash),
    built.manifest.documents.map((entry) => entry.contentHash),
  );
});

test('certification used the production issuer on every family', () => {
  const unsampled = built.documents.filter((entry) => !(entry.samples > 0));
  assert.deepEqual(unsampled.map((entry) => entry.id), [], 'every generator family is proved by sampled instances');
});

test('compiled release documents are still issuable and privately gradeable', async () => {
  // The document production stores is the document the issuer must accept. A
  // sample across all five courses, checked through the real gate.
  const perCourse = new Map();
  built.documents.forEach((entry) => {
    const list = perCourse.get(entry.courseId) || [];
    if (list.length < 12) list.push(entry);
    perCourse.set(entry.courseId, list);
  });

  for (const [courseId, entries] of perCourse) {
    for (const entry of entries) {
      // eslint-disable-next-line no-await-in-loop
      const plan = await mathPath.buildTemplateIssuePlan(entry.document, { samples: 4 });
      assert.equal(plan.issuable, true, `${courseId} ${entry.id}: ${plan.reason}`);
    }
  }
});

test('a generated instance of a compiled family still carries a private answer key', async () => {
  const entry = built.documents.find((document) => document.id === 'mm_A2_4E_v2_quadratic-regression-table')
    || built.documents.find((document) => document.courseId === 'algebra2');
  const draw = generatePathInstance(entry.document, 'path-release-v2-certification');
  assert.ok(draw.question, draw.reason || 'the compiled family must generate');
  assert.doesNotMatch(JSON.stringify(draw.question), /{{|}}/, 'no placeholder survives into a student instance');
});

// --- Test Cycle blueprint resolution -----------------------------------------

test('Test Cycle blueprint family resolution is unchanged by a course release', () => {
  const authored = authoredItems();
  const authoredIndex = indexApprovedFamilies(authored);
  const compiledIndex = indexApprovedFamilies(built.documents.map((entry) => entry.document));

  assert.deepEqual([...compiledIndex.keys()].sort(), [...authoredIndex.keys()].sort());
  // The key a blueprint addresses is the bank document id, and the properties
  // preflight reads must survive compilation byte for byte.
  [...authoredIndex.keys()].slice(0, 50).forEach((familyId) => {
    const before = authoredIndex.get(familyId);
    const after = compiledIndex.get(familyId);
    assert.equal(after.bankQuestionId, before.bankQuestionId);
    assert.equal(after.generative, before.generative);
    assert.equal(after.validated, before.validated);
    assert.equal(after.active, before.active);
    assert.deepEqual(after.alignmentKeys, before.alignmentKeys);
    assert.equal(after.dok, before.dok);
    assert.equal(after.difficultyBand, before.difficultyBand);
  });
});

test('the exact Test Cycle literal variant still resolves after compilation', () => {
  const entry = built.documents.find((document) => document.id === 'mm_A_12E_v2_temperature-style');
  assert.ok(entry, 'the A.12E three-step literal family must be in the release');

  const selected = bestPathVariantForTarget(entry.document, { preferredDok: 2, preferredDifficultyBand: 4 });
  assert.equal(selected.variant?.coverageKey, 'test-cycle-d2b4-three-step-literal');

  const draw = generatePathInstance(entry.document, 'test-cycle-literal-certification', {
    preferredDok: 2,
    preferredDifficultyBand: 4,
  });
  assert.ok(draw.question, draw.reason);
  assert.deepEqual(draw.question.responseFields.map((field) => field.id), ['after-multiply', 'after-add', 'answer']);
});

test('compilation preserves every variant coverage key the fidelity work depends on', () => {
  const authoredByCourse = new Map(authoredItems().map((item) => [item.id, item]));
  built.documents.forEach((entry) => {
    const authored = authoredByCourse.get(entry.id);
    const before = (authored?.variants || []).map((variant) => variant.coverageKey || null);
    const after = (entry.document.variants || []).map((variant) => variant.coverageKey || null);
    assert.deepEqual(after, before, `${entry.id} variant coverage keys`);
  });
});

test('compilation preserves response field identity and order', () => {
  const authoredById = new Map(authoredItems().map((item) => [item.id, item]));
  built.documents.forEach((entry) => {
    const before = (authoredById.get(entry.id)?.responseFields || []).map((field) => field.id);
    const after = (entry.document.responseFields || []).map((field) => field.id);
    assert.deepEqual(after, before, `${entry.id} response fields`);
  });
});

// --- the answer-bearing package stays server-side ----------------------------

test('the browser manifest is identity only and carries no question content', () => {
  const source = fs.readFileSync(BROWSER_MANIFEST_PATH, 'utf8');
  assert.match(source, /DEPLOYED_COURSE_PATH_RELEASE/);
  assert.match(source, /releaseId:/);
  assert.match(source, /contentHash:/);

  // Assert against the CODE. The file's comment explains that the answer-bearing
  // package stays server-side, and a word-match over the whole file would fire
  // on the explanation rather than on anything that ships.
  const code = executableSource(source);
  ['prompt', 'responseFields', 'expected', 'answer', 'generator', 'solutionReview'].forEach((forbidden) => {
    assert.doesNotMatch(code, new RegExp(`\\b${forbidden}\\b`), `${forbidden} must never reach the browser bundle`);
  });
  // And the shipped object really is only identity and counts.
  const shipped = code.match(/Object\.freeze\(\{([\s\S]*?)\}\);/)[1];
  const keys = [...shipped.matchAll(/^\s{2}(\w+):/gm)].map((match) => match[1]).sort();
  assert.deepEqual(keys, [
    'builtAt', 'compilerSchemaVersion', 'contentHash', 'courseCounts', 'courses', 'questionCount', 'releaseId', 'schemaVersion',
  ]);
});

test('the answer-bearing package lives only inside the Cloud Functions deployment', () => {
  assert.match(MANIFEST_PATH, /functions-path-admin\/release\//);
  assert.equal(fs.existsSync(new URL('../../public/coursePathReleaseV2.documents.json', import.meta.url)), false);

  const gitignore = fs.readFileSync(new URL('../../functions-path-admin/.gitignore', import.meta.url), 'utf8');
  assert.match(gitignore, /coursePathReleaseV2\.documents\.json/);

  // Nothing under src/ may import the package, and Hosting must not serve it.
  const hostingBuild = fs.readFileSync(new URL('../../scripts/build-firebase-hosting.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(hostingBuild, /coursePathReleaseV2\.documents/);
  const browserService = fs.readFileSync(new URL('../../src/platform/path/pathReleaseV2Service.js', import.meta.url), 'utf8');
  assert.doesNotMatch(browserService, /coursePathReleaseV2\.documents/);
});

test('the manifest records the provenance of every source package', () => {
  assert.equal(built.manifest.sourceFiles.length, COURSE_RELEASE_SOURCES.length);
  built.manifest.sourceFiles.forEach((source) => {
    assert.match(source.sha256, /^[0-9a-f]{64}$/);
    assert.ok(source.bytes > 0);
    assert.ok(COURSE_RELEASE_SOURCES.some((entry) => entry.file === source.file));
  });
  assert.equal(
    Object.values(built.manifest.courseCounts).reduce((total, count) => total + count, 0),
    built.manifest.questionCount,
  );
});
