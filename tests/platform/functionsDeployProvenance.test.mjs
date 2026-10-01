// WHICH COMMIT THE DEPLOYED CLOUD FUNCTIONS CAME FROM (F-REL-3).
//
// The chain, end to end, without deploying anything:
//   firebase.json predeploy -> scripts/write-functions-provenance.mjs writes
//   <codebase>/deploy-provenance.json -> the Firebase CLI uploads it (its
//   `ignore` list, not .gitignore, decides) -> functions/lib/deployProvenance.js
//   reads it -> every function's Cloud labels and platformBuildInfo carry it.
// Each link is checked against the real thing: the real config, the CLI's own
// packaging filter, the real entry points and endpoint manifests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  keepExistingProvenance,
  writeFunctionsProvenance,
} from '../../scripts/write-functions-provenance.mjs';
import { listDeployableFunctions } from '../../scripts/lib/functionsInventory.mjs';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'));
const core = require('../../functions/lib/deployProvenance.js');

const HEAD = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00';
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mm-provenance-'));
const git = (...args) => spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

test('the provenance writer is the FIRST predeploy step of both codebases, pointed at its own source', () => {
  const codebases = firebaseConfig.functions;
  assert.deepEqual(codebases.map((entry) => entry.codebase).sort(), ['default', 'path-admin']);
  codebases.forEach((entry) => {
    assert.equal(
      entry.predeploy[0],
      `node scripts/write-functions-provenance.mjs --codebase ${entry.codebase} --dir ${entry.source}`,
      `${entry.codebase}: the commit must be stamped before anything else runs or is packaged`,
    );
    // firebase-tools warns that a predeploy command containing "=" may not run.
    assert.doesNotMatch(entry.predeploy[0], /=/);
  });
});

test('the Firebase CLI packages deploy-provenance.json with each codebase', async () => {
  // firebase-tools' own packaging walk (prepareFunctionsUpload): the codebase's
  // `ignore` list plus the files the CLI always drops. .gitignore plays no part,
  // which is why the file can be gitignored and still deployed.
  const { readdirRecursive } = require('firebase-tools/lib/fsAsync.js');
  for (const entry of firebaseConfig.functions) {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, core.PROVENANCE_FILE_NAME), '{}');
    fs.writeFileSync(path.join(dir, 'index.js'), '');
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'node_modules', 'dependency.js'), '');
    // eslint-disable-next-line no-await-in-loop
    const files = (await readdirRecursive({
      path: dir,
      ignore: [...(entry.ignore || ['node_modules', '.git']), 'firebase-debug.log', 'firebase-debug.*.log', '.runtimeconfig.json'],
    })).map((file) => path.relative(dir, file.name));
    assert.ok(files.includes(core.PROVENANCE_FILE_NAME), `${entry.codebase}: its ignore list must not drop ${core.PROVENANCE_FILE_NAME}`);
    assert.ok(!files.some((file) => file.startsWith('node_modules')), 'the walk really applies the ignore list');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the generated files are never committed', () => {
  for (const entry of firebaseConfig.functions) {
    const file = `${entry.source}/${core.PROVENANCE_FILE_NAME}`;
    assert.equal(git('check-ignore', '--no-index', '-q', file).status, 0, `${file} must be gitignored`);
  }
});

test('the writer stamps HEAD and the tree state, and leaves an identical stamp alone', () => {
  const dir = tempDir();
  const porcelainEmpty = () => git('status', '--porcelain').stdout.trim() === '';
  const cleanBefore = porcelainEmpty();
  const first = writeFunctionsProvenance({ codebase: 'default', dir });
  const cleanAfter = porcelainEmpty();
  const expectedSha = git('rev-parse', 'HEAD').stdout.trim();
  const file = path.join(dir, core.PROVENANCE_FILE_NAME);
  const written = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(first.written, true);
  assert.equal(written.gitSha, expectedSha);
  assert.equal(written.gitShaShort, expectedSha.slice(0, 12));
  // Sampled either side of the write, so a file another test creates for a
  // moment cannot make this flaky; when the tree held still, it is exact.
  assert.ok(written.treeClean === cleanBefore || written.treeClean === cleanAfter);
  if (cleanBefore === cleanAfter) assert.equal(written.treeClean, cleanBefore);
  assert.equal(written.codebase, 'default');
  assert.equal(written.schemaVersion, core.PROVENANCE_SCHEMA_VERSION);

  // Same commit, same tree: byte for byte unchanged, so the CLI's source hash
  // is unchanged and a whole-codebase re-run can still skip what already landed.
  const bytes = fs.readFileSync(file, 'utf8');
  const second = writeFunctionsProvenance({ codebase: 'default', dir, now: () => new Date('2030-01-01T00:00:00Z') });
  assert.equal(second.written, false);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);

  // A new commit is a new stamp.
  const moved = writeFunctionsProvenance({
    codebase: 'default', dir, git: (args) => (args[0] === 'rev-parse' ? `${HEAD}\n` : ''), now: () => new Date('2030-01-01T00:00:00Z'),
  });
  assert.equal(moved.written, true);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).writtenAt, '2030-01-01T00:00:00.000Z');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the writer never fails a deploy over git, and does fail on a wrong directory', () => {
  const dir = tempDir();
  const { provenance } = writeFunctionsProvenance({ codebase: 'path-admin', dir, git: () => null });
  assert.equal(provenance.gitSha, 'unknown');
  assert.equal(provenance.treeClean, false);

  // The real CLI with no git on PATH at all.
  const noGit = spawnSync(process.execPath, ['scripts/write-functions-provenance.mjs', '--codebase', 'default', '--dir', dir], {
    cwd: repoRoot, encoding: 'utf8', env: { ...process.env, PATH: '' },
  });
  assert.equal(noGit.status, 0, noGit.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, core.PROVENANCE_FILE_NAME), 'utf8')).gitSha, 'unknown');
  assert.match(noGit.stderr, /unknown/);

  const typo = spawnSync(process.execPath, ['scripts/write-functions-provenance.mjs', '--codebase', 'default', '--dir', path.join(dir, 'missing')], {
    cwd: repoRoot, encoding: 'utf8',
  });
  assert.equal(typo.status, 2);
  assert.match(typo.stderr, /not a directory/);
  assert.throws(() => writeFunctionsProvenance({ codebase: 'Not A Codebase', dir }), /--codebase/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an existing stamp is kept only when it says exactly what a new one would', () => {
  const next = core.buildDeployProvenance({ gitSha: HEAD, porcelainStatus: '', nowIso: '2026-10-01T10:00:00.000Z', codebase: 'default' });
  const existing = { ...next, writtenAt: '2026-10-01T09:00:00.000Z' };
  assert.equal(keepExistingProvenance(existing, next), true);
  assert.equal(keepExistingProvenance({ ...existing, gitSha: 'decade00decade00decade00decade00decade00' }, next), false);
  assert.equal(keepExistingProvenance({ ...existing, treeClean: false }, next), false);
  assert.equal(keepExistingProvenance({ ...existing, codebase: 'path-admin' }, next), false);
  assert.equal(keepExistingProvenance({ ...existing, schemaVersion: 2 }, next), false);
  assert.equal(keepExistingProvenance({ ...existing, writtenAt: null }, next), false);
  assert.equal(keepExistingProvenance(null, next), false);
  const unknown = core.buildDeployProvenance({ gitSha: null, porcelainStatus: null, nowIso: '2026-10-01T10:00:00.000Z', codebase: 'default' });
  assert.equal(keepExistingProvenance({ ...unknown, writtenAt: '2026-10-01T09:00:00.000Z' }, unknown), false, 'an unknown commit is always re-stamped');
});

test('reading a stamp never throws: missing, malformed or foreign records are "unknown"', () => {
  const dir = tempDir();
  const file = path.join(dir, core.PROVENANCE_FILE_NAME);
  const read = () => core.readDeployProvenance(file, { codebase: 'default' });

  assert.equal(read().gitSha, 'unknown', 'missing');
  fs.writeFileSync(file, '{ "gitSha": ');
  assert.equal(read().gitSha, 'unknown', 'malformed JSON');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 2, gitSha: HEAD, treeClean: true }));
  assert.equal(read().gitSha, 'unknown', 'a schema this reader does not know');
  fs.writeFileSync(file, JSON.stringify([HEAD]));
  assert.equal(read().gitSha, 'unknown', 'not an object');
  assert.equal(core.readDeployProvenance(dir).gitSha, 'unknown', 'a directory');

  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, codebase: 'default', gitSha: HEAD.toUpperCase(), treeClean: true, writtenAt: '2026-10-01T09:00:00Z' }));
  assert.deepEqual({ ...read() }, {
    schemaVersion: 1, codebase: 'default', gitSha: HEAD, gitShaShort: HEAD.slice(0, 12), treeClean: true, writtenAt: '2026-10-01T09:00:00.000Z',
  });
  assert.ok(Object.isFrozen(read()));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('every function the default codebase deploys carries the commit labels', () => {
  // The endpoint manifest the CLI reads during discovery, from the real entry
  // point. Labels set here are what `firebase deploy` writes onto each function.
  const { functions } = listDeployableFunctions();
  const expected = core.deployProvenanceLabels;
  assert.deepEqual(Object.keys(expected).sort(), ['mm-git-sha', 'mm-tree']);
  assert.ok(functions.length > 150);
  const unlabeled = functions.filter((fn) => fn.labels['mm-git-sha'] !== expected['mm-git-sha'] || fn.labels['mm-tree'] !== expected['mm-tree']);
  assert.deepEqual(unlabeled.map((fn) => fn.name), [], 'every endpoint carries mm-git-sha and mm-tree');

  // And the labels say what this codebase's deploy-provenance.json says.
  assert.deepEqual(expected, core.provenanceLabels(core.readDeployProvenance(path.join(repoRoot, 'functions', core.PROVENANCE_FILE_NAME))));
});

test('platformBuildInfo answers with the provenance, and nothing else, to anyone', async () => {
  const exported = require('../../functions/platformEntry.js');
  const callable = exported.platformBuildInfo;
  assert.ok(callable?.__endpoint?.callableTrigger, 'platformBuildInfo is a callable');
  // No caller identity at all: it must not require one.
  const answer = await callable.run({ data: {}, auth: undefined, rawRequest: {} });
  const { deployProvenance } = core;
  assert.deepEqual(answer, {
    codebase: deployProvenance.codebase,
    gitSha: deployProvenance.gitSha,
    gitShaShort: deployProvenance.gitShaShort,
    treeClean: deployProvenance.treeClean,
    writtenAt: deployProvenance.writtenAt,
  });
  assert.equal(answer.codebase, 'default');
  // It cannot scale into a bill on anonymous traffic.
  assert.ok(callable.__endpoint.maxInstances > 0 && callable.__endpoint.maxInstances <= 5);
});

test('the verify step speaks the real callable protocol to the real platformBuildInfo', async () => {
  // The deployed handler is firebase-functions' own callable implementation.
  // Serve it locally (express ships with firebase-functions) and send it the
  // exact request the release tool sends: if the method, content type or
  // {"data": {}} envelope were wrong it would answer 400, and the verdict would
  // be "unreachable" rather than a reading of the commit.
  const functionsRequire = createRequire(path.join(repoRoot, 'functions', 'package.json'));
  const express = functionsRequire('express');
  const { buildInfoRequest, assessBuildInfoResponse } = await import('../../scripts/lib/releasePlan.mjs');
  const exported = require('../../functions/platformEntry.js');
  const app = express();
  app.use(express.json());
  app.post('/platformBuildInfo', (request, response) => exported.platformBuildInfo(request, response));
  const server = await new Promise((resolve) => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  // The SDK logs every callable request (and the refusal below); keep that
  // expected output out of the suite's.
  const sdkLogger = functionsRequire('firebase-functions/logger');
  const quieted = Object.fromEntries(['debug', 'info', 'log', 'warn', 'error'].map((level) => [level, sdkLogger[level]]));
  Object.keys(quieted).forEach((level) => { sdkLogger[level] = () => {}; });
  try {
    const { init } = buildInfoRequest({ project: 'mathmaster-aleks' });
    const url = `http://127.0.0.1:${server.address().port}/platformBuildInfo`;
    const response = await fetch(url, init);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(Object.keys(body), ['result']);
    const { deployProvenance } = core;
    assert.equal(body.result.gitSha, deployProvenance.gitSha);

    const verdict = assessBuildInfoResponse({ url, reachable: true, status: response.status, body, error: null }, { expectedGitSha: HEAD });
    assert.equal(verdict.liveGitSha, deployProvenance.gitSha, 'the verifier reads the commit out of the real envelope');
    assert.equal(verdict.failure, 'sha-mismatch', 'and compares it — never mistakes a real answer for no answer');

    // A request without the callable envelope is refused by the SDK, which the
    // verifier reports as no usable answer.
    const bare = await fetch(url, { ...init, body: '{}' });
    const refused = assessBuildInfoResponse({ url, reachable: true, status: bare.status, body: await bare.json(), error: null }, { expectedGitSha: HEAD });
    assert.equal(bare.status, 400);
    assert.equal(refused.failure, 'unreachable');
  } finally {
    Object.assign(sdkLogger, quieted);
    await new Promise((resolve) => server.close(resolve));
  }
});

test('every path-admin function carries the same commit labels, read from its own stamp', () => {
  // functions-path-admin has no node_modules in the repository; its declared
  // firebase-functions/firebase-admin versions are the default codebase's
  // (both lockfiles: 5.1.1 / 12.7.0), so load it against those, in a child
  // process, and read the endpoint manifest the CLI would read.
  const lock = (dir) => JSON.parse(fs.readFileSync(path.join(repoRoot, dir, 'package-lock.json'), 'utf8')).packages['node_modules/firebase-functions'].version;
  assert.equal(lock('functions-path-admin'), lock('functions'));

  const probe = spawnSync(process.execPath, ['-e', `
    const exported = require(${JSON.stringify(path.join(repoRoot, 'functions-path-admin'))});
    const labels = {};
    for (const [name, value] of Object.entries(exported)) if (value && value.__endpoint) labels[name] = value.__endpoint.labels;
    process.stdout.write(JSON.stringify(labels));
  `], { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, NODE_PATH: path.join(repoRoot, 'functions', 'node_modules') } });
  assert.equal(probe.status, 0, probe.stderr);
  const labelsByFunction = JSON.parse(probe.stdout);
  const { provenanceFile, deployProvenance, deployProvenanceLabels } = require('../../functions-path-admin/lib/deployProvenance.js');
  // Its own stamp — the one its first predeploy step writes — never the default codebase's.
  const pathAdmin = firebaseConfig.functions.find((entry) => entry.codebase === 'path-admin');
  assert.equal(provenanceFile, path.join(repoRoot, pathAdmin.source, core.PROVENANCE_FILE_NAME));
  assert.equal(deployProvenance.codebase, 'path-admin');
  assert.deepEqual(Object.keys(labelsByFunction).sort(), [
    'getCoursePathReleaseJobV2', 'getCoursePathReleaseStatusV2', 'publishCoursePathReleaseV2', 'resumeCoursePathReleaseV2',
  ]);
  Object.entries(labelsByFunction).forEach(([name, labels]) => {
    assert.deepEqual(labels, { ...deployProvenanceLabels }, `${name} must carry mm-git-sha and mm-tree`);
  });
  assert.deepEqual(
    { ...deployProvenanceLabels },
    core.provenanceLabels(core.readDeployProvenance(path.join(repoRoot, 'functions-path-admin', core.PROVENANCE_FILE_NAME))),
    'path-admin reads functions-path-admin/deploy-provenance.json, not the default codebase stamp',
  );
});
