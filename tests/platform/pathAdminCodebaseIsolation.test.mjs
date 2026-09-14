import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

import { syncPathAdminRuntime, vendorDrift, vendoredFilePairs } from '../../scripts/sync-path-admin-runtime.mjs';
import { authorizeRootAdmin, ROOT_ADMIN_EMAIL } from '../../functions/shared/rolePolicy.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

const firebaseConfig = JSON.parse(read('firebase.json'));
const packageJson = JSON.parse(read('package.json'));
const entrySource = read('functions-path-admin/index.js');

// Why this codebase exists: deploying a Path content release must not redeploy
// and re-mutate the mature backend, and function DISCOVERY must not load it.

test('path-admin is an additive Firebase Functions codebase of its own', () => {
  const codebases = firebaseConfig.functions.map((entry) => entry.codebase);
  assert.ok(codebases.includes('default'), 'the mature backend keeps its codebase');
  assert.ok(codebases.includes('path-admin'));

  const pathAdmin = firebaseConfig.functions.find((entry) => entry.codebase === 'path-admin');
  assert.equal(pathAdmin.source, 'functions-path-admin');
  assert.deepEqual(pathAdmin.predeploy, [
    'node scripts/build-course-path-release-v2.mjs',
    'node scripts/sync-path-admin-runtime.mjs',
  ]);

  const defaultCodebase = firebaseConfig.functions.find((entry) => entry.codebase === 'default');
  assert.equal(defaultCodebase.source, 'functions', 'the default codebase is untouched');
  assert.deepEqual(defaultCodebase.predeploy, ['node scripts/build-ccmr-v2-1-production-release.mjs --write']);
});

test('discovery of the path-admin entry loads no MathMaster backend module', () => {
  // Firebase loads the entry point to DISCOVER functions. The default codebase
  // loads platformEntry -> entry -> index.js (12,000 lines) at that moment,
  // which is why discovery has needed FUNCTIONS_DISCOVERY_TIMEOUT=60.
  const code = executableSource(entrySource);
  const topLevelRequires = [...code.matchAll(/^const \{[^}]*\} = require\("([^"]+)"\)/gm)].map((match) => match[1]);
  assert.deepEqual(topLevelRequires.sort(), ['firebase-admin/app', 'firebase-functions/v2/https']);

  ['functions/index.js', './index.js', 'entry.js', 'platformEntry.js', 'googleapis'].forEach((forbidden) => {
    assert.doesNotMatch(code, new RegExp(`require\\(["'][^"']*${forbidden.replace(/[./]/g, '\\$&')}`),
      `${forbidden} must never be reachable from path-admin discovery`);
  });

  // Everything expensive is behind a lazy accessor called inside a handler.
  assert.match(code, /const releaseService = \(\) => require\("\.\/lib\/releaseService"\)/);
  assert.match(code, /const authorization = \(\) => require\("\.\/lib\/authorization"\)/);
});

test('the release engine and compiler load fast enough to keep discovery cheap', () => {
  // A measurement, not a guess: this is the whole module graph a handler pulls
  // in on its first call, excluding the Firebase SDKs Functions loads anyway.
  const started = process.hrtime.bigint();
  require('../../functions-path-admin/lib/releaseService.js');
  require('../../functions-path-admin/lib/releaseStore.js');
  require('../../functions/lib/pathContentCompiler.js');
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(elapsedMs < 2000, `path-admin release modules took ${elapsedMs.toFixed(1)} ms to load`);
});

test('path-admin defines only new V2 names, so it can take nothing from the default codebase', () => {
  const exported = [...entrySource.matchAll(/^exports\.(\w+)\s*=/gm)].map((match) => match[1]).sort();
  assert.deepEqual(exported, [
    'getCoursePathReleaseJobV2',
    'getCoursePathReleaseStatusV2',
    'publishCoursePathReleaseV2',
    'resumeCoursePathReleaseV2',
  ]);

  const defaultExports = new Set([
    ...[...read('functions/index.js').matchAll(/^exports\.(\w+)\s*=/gm)].map((match) => match[1]),
    ...[...read('functions/platformEntry.js').matchAll(/^exports\.(\w+)\s*=/gm)].map((match) => match[1]),
    ...[...read('functions/entry.js').matchAll(/^exports\.(\w+)\s*=/gm)].map((match) => match[1]),
  ]);
  exported.forEach((name) => {
    assert.equal(defaultExports.has(name), false, `${name} is already owned by the default codebase`);
  });

  // And the legacy Path callables are still there. This project deletes nothing.
  ['refreshBuiltInCoursePathBank', 'refreshReleasedAsvabPathBank', 'refreshReleasedCcmrPathBanks', 'rebuildPathCoverage']
    .forEach((name) => assert.equal(defaultExports.has(name), true, `${name} must not be removed`));
});

test('every path-admin callable is gated on the root administrator', () => {
  const handlers = entrySource.split(/^exports\./m).slice(1);
  assert.equal(handlers.length, 4);
  handlers.forEach((handler) => {
    const name = handler.slice(0, handler.indexOf(' '));
    assert.match(handler, /authorization\(\)\.requireRootAdmin\(request\)/, `${name} must require the root administrator`);
  });

  const authorizationSource = read('functions-path-admin/lib/authorization.js');
  // The same shared decision function the mature backend uses, not a second
  // copy of the rule.
  assert.match(authorizationSource, /rolePolicy\.authorizeRootAdmin\(auth, \{ rootAdminEmail: ROOT_ADMIN_EMAIL \}\)/);
  assert.match(authorizationSource, /shared\/rolePolicyIdentity\.cjs/);
  assert.match(authorizationSource, /token\.email_verified === false/);
});

test('the authorization decision admits the root administrator and refuses everyone else', () => {
  const context = { rootAdminEmail: ROOT_ADMIN_EMAIL };
  const token = (extra) => ({ uid: 'uid', token: extra });

  assert.deepEqual(
    authorizeRootAdmin(token({ role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN_EMAIL }), context),
    { allowed: true, reason: null },
  );

  // A student. A teacher. An administrator who is not the root administrator.
  assert.equal(authorizeRootAdmin(token({ role: 'student', studentId: 'S1' }), context).allowed, false);
  assert.equal(authorizeRootAdmin(token({ role: 'teacher', email: 'teacher@desotoisd.org' }), context).allowed, false);
  assert.equal(authorizeRootAdmin(token({ role: 'teacher', admin: true, email: 'teacher@desotoisd.org' }), context).allowed, false);
  assert.equal(authorizeRootAdmin(token({ role: 'teacher', admin: true, rootAdmin: true, email: 'someone@else.org' }), context).allowed, false);
  assert.equal(authorizeRootAdmin(null, context).reason, 'unauthenticated');
  assert.equal(authorizeRootAdmin(token({ role: 'student' }), context).reason, 'not_root_admin');
});

test('the shared Path runtime travels with the deployment and never forks', () => {
  const synced = syncPathAdminRuntime();
  assert.ok(synced.length > 20, `only ${synced.length} runtime files vendored`);
  assert.deepEqual(vendorDrift().map((pair) => pair.relative), [], 'a vendored copy differs from its source');

  // The declared closure must cover everything path-admin actually loads.
  const vendored = new Set(vendoredFilePairs().map((pair) => pair.relative.split(path.sep).join('/')));
  const loaded = [
    ...[...read('functions-path-admin/lib/releaseStore.js').matchAll(/(?:requireRuntime|importRuntime)\("([^"]+)"\)/g)],
    ...[...read('functions-path-admin/lib/releaseArtifact.js').matchAll(/(?:requireRuntime|importRuntime)\("([^"]+)"\)/g)],
    ...[...read('functions-path-admin/lib/coverage.js').matchAll(/(?:requireRuntime|importRuntime)\("([^"]+)"\)/g)],
    ...[...read('functions-path-admin/lib/authorization.js').matchAll(/(?:requireRuntime|importRuntime)\("([^"]+)"\)/g)],
    ...[...read('functions-path-admin/lib/releaseService.js').matchAll(/(?:requireRuntime|importRuntime)\("([^"]+)"\)/g)],
  ].map((match) => match[1]);
  assert.ok(loaded.length > 0);
  loaded.forEach((relative) => assert.equal(vendored.has(relative), true, `${relative} is loaded but not vendored`));
});

test('the repository source wins over the vendored copy when both are present', () => {
  const runtime = require('../../functions-path-admin/lib/runtime.js');
  const resolved = runtime.runtimeModulePath('lib/pathContentCompiler.js');
  assert.ok(resolved.includes(`${path.sep}functions${path.sep}lib${path.sep}`), resolved);
  assert.equal(resolved.includes('vendor'), false, 'tests must read the one real source, never a generated copy');
  assert.equal(runtime.usingVendoredRuntime(), false);
});

test('a Path release deploys without touching the default backend', () => {
  assert.equal(packageJson.scripts['deploy:path-admin'], 'npm run release:path:build && npm run release:path:sync && firebase deploy --only functions:path-admin');
  assert.equal(packageJson.scripts['release:path:build'], 'node scripts/build-course-path-release-v2.mjs');
  assert.equal(packageJson.scripts['release:path:verify'], 'node scripts/build-course-path-release-v2.mjs --verify');
  assert.ok(packageJson.scripts['test:path-release']);

  const docs = read('docs/PATH_RELEASE_V2.md');
  assert.match(docs, /firebase deploy --only functions:path-admin/);
  assert.match(docs, /npm run deploy:path-admin/);
});

test('the deployment fix is architectural, not a raised timeout', () => {
  // The failures this project removes must not come back as configuration.
  const repoFiles = ['firebase.json', 'package.json', 'functions-path-admin/index.js', 'functions-path-admin/package.json'];
  repoFiles.forEach((file) => {
    assert.doesNotMatch(executableSource(read(file)), /FUNCTIONS_DISCOVERY_TIMEOUT/, `${file} must not raise the discovery timeout`);
  });
});
