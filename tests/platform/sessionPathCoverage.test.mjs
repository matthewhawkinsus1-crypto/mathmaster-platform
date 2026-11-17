/*
 * A STUDENT READS EACH COURSE'S PATH COVERAGE INDEX ONCE A SESSION
 * (pathCoverageService.js fetchSessionPathCoverage).
 *
 * The reads probe (tests/browser/teacherWorkflow/sessionReadsProbe.mjs) found
 * `pathCoverage/<course>` read on every Home visit (Recommended for you) and
 * every My Math Path visit. The index changes only when content is released,
 * so the first read of a course now serves the rest of the session; a newer
 * release reaches the student at their next sign-in, or a reload. Teacher and
 * administrator tools that rebuild it keep reading it fresh, and a rebuild
 * drops the session's copy, so that page shows what it just built.
 *
 * The real service, over an in-memory Firestore (helpers/firestoreClientStub.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { firestoreClient, putDocument, resetFirestoreClient } from './helpers/firestoreClientStub.mjs';

register('./helpers/firestoreClientIsolation.mjs', import.meta.url);
const coverageService = await import('../../src/platform/path/pathCoverageService.js');
const { fetchPathCoverage, fetchSessionPathCoverage, forgetSessionPathCoverage } = coverageService;

const ALGEBRA_2 = 'pathCoverage/algebra2';
const ALGEBRA_1 = 'pathCoverage/algebra1';
const readsOf = (path) => firestoreClient.reads.filter((read) => read.path === path).length;
const fresh = () => {
  resetFirestoreClient();
  forgetSessionPathCoverage();
  putDocument(ALGEBRA_2, { courseId: 'algebra2', skills: { 'a2.2a': { studentReady: true } } });
  putDocument(ALGEBRA_1, { courseId: 'algebra1', skills: {} });
};
const quietly = async (run) => {
  const original = console.error;
  console.error = () => {};
  try { return await run(); } finally { console.error = original; }
};

test('Home, then My Math Path, then Home again: one read of the course\'s index', async () => {
  fresh();
  const home = await fetchSessionPathCoverage('algebra2');
  const mathPath = await fetchSessionPathCoverage('algebra2');
  const homeAgain = await fetchSessionPathCoverage('algebra2');
  assert.equal(readsOf(ALGEBRA_2), 1);
  assert.equal(home.skills['a2.2a'].studentReady, true);
  assert.deepEqual(mathPath, home);
  assert.deepEqual(homeAgain, home);
});

test('two screens asking at once share one read; each course is read once', async () => {
  fresh();
  const [first, second] = await Promise.all([fetchSessionPathCoverage('algebra2'), fetchSessionPathCoverage('algebra2')]);
  assert.deepEqual(first, second);
  await fetchSessionPathCoverage('algebra1');
  await fetchSessionPathCoverage('algebra1');
  assert.equal(readsOf(ALGEBRA_2), 1);
  assert.equal(readsOf(ALGEBRA_1), 1, 'per course');
});

test('a failed read fails closed and is not kept: the next visit reads again', async () => {
  fresh();
  firestoreClient.failReads = 1;
  assert.equal(await quietly(() => fetchSessionPathCoverage('algebra2')), null, 'null: nothing is launchable, never "everything is"');
  const next = await fetchSessionPathCoverage('algebra2');
  assert.equal(next.courseId, 'algebra2', 'the next visit has the index');
  assert.equal(readsOf(ALGEBRA_2), 2);
  await fetchSessionPathCoverage('algebra2');
  assert.equal(readsOf(ALGEBRA_2), 2, 'and keeps it');
});

test('an index never built is null for the session; a new sign-in reads again', async () => {
  fresh();
  assert.equal(await fetchSessionPathCoverage('grade8'), null);
  assert.equal(await fetchSessionPathCoverage('grade8'), null);
  assert.equal(readsOf('pathCoverage/grade8'), 1);
  // Released mid-session: it reaches the student at the next sign-in (or reload).
  putDocument('pathCoverage/grade8', { courseId: 'grade8', skills: {} });
  assert.equal(await fetchSessionPathCoverage('grade8'), null);
  forgetSessionPathCoverage();
  assert.equal((await fetchSessionPathCoverage('grade8')).courseId, 'grade8');
  assert.equal(readsOf('pathCoverage/grade8'), 2);
});

test('teacher tools read fresh, and a rebuild in this page drops the session\'s copy', async () => {
  fresh();
  await fetchSessionPathCoverage('algebra2');
  await fetchPathCoverage('algebra2');
  await fetchPathCoverage('algebra2');
  assert.equal(readsOf(ALGEBRA_2), 3, 'fetchPathCoverage always reads');
  // A rebuild's callable refuses here (no Functions in this test); the copy goes either way.
  await assert.rejects(coverageService.rebuildPathCoverage(['algebra2']));
  await fetchSessionPathCoverage('algebra2');
  assert.equal(readsOf(ALGEBRA_2), 4, 'read again after a rebuild');
  for (const release of ['refreshBundledCoursePathBank', 'refreshReleasedAsvabPathBank', 'refreshReleasedCcmrPathBanks', 'initializeBundledPathBankStarter']) {
    await assert.rejects(coverageService[release]());
    const before = readsOf(ALGEBRA_2);
    await fetchSessionPathCoverage('algebra2');
    assert.equal(readsOf(ALGEBRA_2), before + 1, `${release} drops it too`);
  }
});

/* ------------------------------------------------------------ the wiring */

const source = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('Home\'s recommendations and My Math Path read the session\'s index', () => {
  const recommended = source('src/components/student/RecommendedSkills.jsx');
  assert.match(recommended, /import \{ fetchSessionPathCoverage \} from '\.\.\/\.\.\/platform\/path\/pathCoverageService\.js';/);
  assert.match(recommended, /fetchSessionPathCoverage\(courseId\)\.then\(/);
  assert.doesNotMatch(recommended, /fetchPathCoverage\(/);
  const mathPath = source('src/components/student/MyMathPathApp.jsx');
  assert.match(mathPath, /import \{ fetchSessionPathCoverage \} from '\.\.\/\.\.\/platform\/path\/pathCoverageService\.js';/);
  assert.match(mathPath, /fetchSessionPathCoverage\(courseId\)\.then\(/);
  assert.doesNotMatch(mathPath, /fetchPathCoverage\(/);
});

test('a new sign-in on the page reads the index again', () => {
  const app = source('src/App.jsx');
  assert.match(app, /import \{ forgetSessionPathCoverage \} from '\.\/platform\/path\/pathCoverageService\.js';/);
  // The session effect: any account other than the one this page hydrated last,
  // after a sign-out (null) or straight from another account.
  const hydrate = region(app, 'if (hydratedSessionUidRef.current && hydratedSessionUidRef.current !== session.uid) {', 'const hydrateSession = async () => {', 'the session effect');
  assert.match(hydrate, /if \(hydratedSessionUidRef\.current !== session\.uid\) forgetSessionPathCoverage\(\);\s*hydratedSessionUidRef\.current = session\.uid;/);
});
