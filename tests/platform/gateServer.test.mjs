// THE BROWSER GATES' DEV SERVER: STARTED WARM, HELD STILL.
//
// scripts/lib/gateServer.mjs replaced "spawn vite, call it ready when `/`
// answers" in the draft-persistence and durable-outbox runners. That readiness
// was the moment the server LISTENED, so every cold-start cost landed inside
// the browser's first page timeout: the draft certification's first `goto`
// took 88–113 s from a cold cache (and was given 180 s), the durable-outbox
// certification failed outright. These tests pin what the launcher promises.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import net from 'node:net';
import { Writable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GATES,
  REPO_ROOT,
  depsUrlPrefix,
  gateCacheDir,
  gateServerConfig,
  importSpecifiers,
  mathliveAssetPath,
  mathliveAssetsPlugin,
  moduleScriptUrls,
  startGateServer,
} from '../../scripts/lib/gateServer.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(path.join(repo, relative), 'utf8');
const { parseAst } = await import('vite');

test('the launcher resolves the repository it lives in', () => {
  assert.equal(REPO_ROOT, repo);
});

test('every gate names a real config, real harness pages and installed packages', () => {
  const pkg = JSON.parse(read('package.json'));
  const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
  const packageOf = (specifier) => (specifier.startsWith('@') ? specifier.split('/').slice(0, 2) : specifier.split('/').slice(0, 1)).join('/');
  assert.ok(Object.keys(GATES).length >= 2);
  for (const [key, gate] of Object.entries(GATES)) {
    assert.equal(gate.name, key, 'a gate is looked up by its own name');
    assert.ok(existsSync(path.join(repo, gate.configFile)), `${key}: ${gate.configFile} must exist`);
    assert.ok(gate.harness.length > 0, `${key}: a gate serves at least one harness page`);
    gate.harness.forEach((page) => assert.ok(existsSync(path.join(repo, page)), `${key}: ${page} must exist`));
    // An include entry that is not installed is a resolve error at every start.
    gate.include.forEach((specifier) => assert.ok(declared.has(packageOf(specifier)),
      `${key}: optimizeDeps.include names ${specifier}, which package.json does not declare`));
  }
  assert.ok(GATES['draft-persistence'].include.includes('mathlive'), 'the draft harness types into MathLive fields');
});

test('a gate server never hot-reloads, owns its cache, and scans only its harness', () => {
  const gate = GATES['draft-persistence'];
  const config = gateServerConfig(gate, { port: 5999 });
  assert.equal(config.server.hmr, false, 'an edit to src/ must not reload the harness mid-scene (PQ-033)');
  assert.equal(config.server.strictPort, true, 'a busy port is an error, not a different origin');
  assert.equal(config.server.port, 5999);
  assert.equal(config.appType, 'mpa', 'a URL that names no file must 404, not become index.html');
  assert.equal(config.cacheDir, gateCacheDir(gate.name));
  assert.deepEqual(config.optimizeDeps.entries, [...gate.harness], 'Vite would otherwise scan every .html in the repo');
  assert.deepEqual(config.optimizeDeps.include, [...gate.include]);
  assert.ok(config.plugins.some((plugin) => plugin.name === 'mm-gate:mathlive-assets'));
  assert.equal(config.configFile, path.join(repo, gate.configFile));
});

test('each gate has its own cache, and a shared node_modules does not make checkouts share one', () => {
  assert.notEqual(gateCacheDir('draft-persistence'), gateCacheDir('durable-outbox'));
  assert.ok(gateCacheDir('draft-persistence').includes(`${path.sep}node_modules${path.sep}.vite-gates${path.sep}`));
  assert.throws(() => gateCacheDir('../escape'), /kebab-case/);

  const scratch = mkdtempSync(path.join(os.tmpdir(), 'mm-gate-cache-'));
  try {
    const own = path.join(scratch, 'own');
    mkdirSync(path.join(own, 'node_modules'), { recursive: true });
    assert.equal(gateCacheDir('draft-persistence', { root: own }), path.join(own, 'node_modules', '.vite-gates', 'draft-persistence'));

    // Two git worktrees symlinked to one node_modules.
    const shared = path.join(scratch, 'shared-node-modules');
    mkdirSync(shared);
    const [first, second] = ['worktree-a', 'worktree-b'].map((name) => {
      const root = path.join(scratch, name);
      mkdirSync(root);
      symlinkSync(shared, path.join(root, 'node_modules'), 'dir');
      return gateCacheDir('draft-persistence', { root });
    });
    assert.notEqual(first, second, 'two checkouts sharing node_modules must not share a gate cache');
    assert.match(path.basename(first), /^draft-persistence-[0-9a-f]{8}$/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('pre-bundled MathLive asks for its fonts next to the bundle, and the gate serves them there', async () => {
  const root = repo;
  const cacheDir = path.join(repo, 'node_modules', '.vite-gates', 'draft-persistence');
  const prefix = depsUrlPrefix({ root, cacheDir });
  assert.equal(prefix, '/node_modules/.vite-gates/draft-persistence/deps/');
  assert.equal(depsUrlPrefix({ root, cacheDir: '/elsewhere/cache' }), '/@fs/elsewhere/cache/deps/');

  assert.equal(mathliveAssetPath(`${prefix}fonts/KaTeX_Main-Regular.woff2`, prefix), 'fonts/KaTeX_Main-Regular.woff2');
  assert.equal(mathliveAssetPath(`${prefix}sounds/keypress-standard.wav?v=1`, prefix), 'sounds/keypress-standard.wav');
  assert.equal(mathliveAssetPath(`${prefix}mathlive.js?v=1`, prefix), null, 'the bundle itself is Vite\'s to serve');
  assert.equal(mathliveAssetPath(`${prefix}fonts/../../../package.json`, prefix), null);
  assert.equal(mathliveAssetPath(`${prefix}fonts/%2e%2e`, prefix), null);
  assert.equal(mathliveAssetPath('/src/fonts/KaTeX_Main-Regular.woff2', prefix), null);

  // The middleware itself, against the real package files.
  let middleware;
  mathliveAssetsPlugin().configureServer({ config: { root, cacheDir }, middlewares: { use: (handler) => { middleware = handler; } } });
  const call = (url) => new Promise((resolve) => {
    const chunks = [];
    const headers = {};
    const response = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
    response.statusCode = 200;
    response.setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
    response.on('finish', () => resolve({ status: response.statusCode, headers, body: Buffer.concat(chunks), next: false }));
    middleware({ url }, response, () => resolve({ next: true }));
  });
  const font = await call(`${prefix}fonts/KaTeX_Main-Regular.woff2`);
  const onDisk = path.join(repo, 'node_modules', 'mathlive', 'fonts', 'KaTeX_Main-Regular.woff2');
  assert.equal(font.status, 200);
  assert.equal(font.headers['content-type'], 'font/woff2');
  assert.equal(font.body.length, statSync(onDisk).size, 'the real font file, not index.html');
  const missing = await call(`${prefix}fonts/NoSuchFont.woff2`);
  assert.equal(missing.status, 404, 'a missing asset is a 404 — passing it on would answer with index.html');
  assert.deepEqual(await call('/src/App.jsx'), { next: true });
});

test('readiness follows real imports: static, re-exports and literal dynamic imports, nothing in strings', () => {
  const code = [
    'import React from "/node_modules/.vite-gates/x/deps/react.js?v=1";',
    'import "/src/index.css";',
    'export { a } from "./a.js";',
    'export * from "/src/b.js";',
    'const decoy = \'import("/not/an/import.js")\';',
    'const lazy = () => import("/src/tools/Graphing2.jsx");',
    'const computed = (name) => import(`/src/x/${name}.js`);',
  ].join('\n');
  assert.deepEqual(importSpecifiers(parseAst, code).sort(),
    ['./a.js', '/node_modules/.vite-gates/x/deps/react.js?v=1', '/src/b.js', '/src/index.css', '/src/tools/Graphing2.jsx'].sort());
  assert.ok(!importSpecifiers(parseAst, code, { deep: false }).includes('/src/tools/Graphing2.jsx'),
    'a pre-bundled dependency is read for its top-level imports only');

  const html = [
    '<script type="module" src="/@vite/client"></script>',
    '<script type="module">import { injectIntoGlobalHook } from "/@react-refresh"; injectIntoGlobalHook(window);</script>',
    '<script>window.notAModule = true;</script>',
    '<script type="module" src="/tests/browser/draftPersistenceMain.jsx"></script>',
  ].join('\n');
  assert.deepEqual(moduleScriptUrls(parseAst, html), ['/@vite/client', '/@react-refresh', '/tests/browser/draftPersistenceMain.jsx']);
});

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.unref();
  probe.on('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

test('a gate server is ready only once its page and everything it imports answer, and 404s what is not there', { timeout: 120_000 }, async () => {
  // Its own cache name, so this never races a real durable-outbox run.
  const gate = { ...GATES['durable-outbox'], name: 'durable-outbox-selftest' };
  const port = await freePort();
  const served = await startGateServer(gate, { port });
  try {
    assert.equal(served.origin, `http://127.0.0.1:${port}`);
    assert.ok(served.readiness.entries.some((entry) => entry.startsWith('/tests/browser/durableOutboxHarness.html?html-proxy')),
      `the inline harness module is an entry: ${served.readiness.entries}`);
    assert.ok(served.readiness.modules >= 3, 'the outbox modules the harness imports were compiled');
    assert.deepEqual(served.readiness.problems, []);
    assert.deepEqual(served.lateRebundles(), []);
    const page = await fetch(`${served.origin}/${gate.harness[0]}`);
    assert.equal(page.status, 200);
    const missing = await fetch(`${served.origin}/tests/browser/noSuchHarness.html`, { headers: { accept: 'text/html' } });
    assert.equal(missing.status, 404, 'Vite\'s SPA fallback would have answered index.html with a 200');
  } finally {
    await served.close();
  }
  await assert.rejects(fetch(`${served.origin}/${gate.harness[0]}`), 'close() releases the port');
});

test('a gate whose harness page does not exist is refused before a server starts', async () => {
  const port = await freePort();
  await assert.rejects(
    startGateServer({ ...GATES['durable-outbox'], name: 'missing-page-selftest', harness: ['tests/browser/noSuchHarness.html'] }, { port }),
    /no harness page at tests\/browser\/noSuchHarness\.html/,
  );
  assert.ok(!existsSync(gateCacheDir('missing-page-selftest')), 'nothing was started, so nothing was cached');
});

test('both certification runners start their gate warm instead of polling `/`', () => {
  for (const [runner, gate] of [
    ['scripts/run-draft-persistence-certification.mjs', 'draft-persistence'],
    ['scripts/run-durable-outbox-certification.mjs', 'durable-outbox'],
  ]) {
    const source = executableSource(read(runner));
    assert.match(source, /import \{[^}]*\bstartGateServer\b[^}]*\} from '\.\/lib\/gateServer\.mjs'/, `${runner} must use the gate server`);
    assert.match(source, new RegExp(`startGateServer\\(GATES\\['${gate}'\\]`), `${runner} must start the ${gate} gate`);
    assert.match(source, /AUDIT_ORIGIN: gate\.origin/, `${runner} must hand the driver the warm server's origin`);
    assert.doesNotMatch(source, /vite\/bin\/vite\.js/, `${runner} must not start a second, cold server of its own`);
  }
});

test('the draft certification gives its page loads an ordinary budget again', () => {
  // A long first-navigation budget is how a cold-start regression hides: the
  // run still passes, three minutes later. If the first load is slow, the
  // server is not warm — fix the warm-up in scripts/lib/gateServer.mjs.
  const source = executableSource(read('tests/browser/draftPersistence.mjs'));
  const gotos = [...source.matchAll(/\.goto\(([^)]*)\)/g)].map((match) => match[1]);
  assert.ok(gotos.length >= 2, 'the driver opens the harness, and reopens it in a new context');
  for (const call of gotos) {
    const timeout = /timeout:\s*([\d_]+)/.exec(call);
    assert.ok(!timeout || Number(timeout[1].replace(/_/g, '')) <= 30000, `page.goto(${call}) carries a budget beyond 30 s`);
  }
});
