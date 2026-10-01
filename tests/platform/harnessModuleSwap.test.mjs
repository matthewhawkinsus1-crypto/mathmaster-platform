// THE HARNESS SWAP, THROUGH VITE'S REAL PLUGIN CONTAINER.
//
// The browser harnesses replace every module that could reach a real Firebase
// project (src/firebase.js and four services) with an emulator module or a
// stub. Two things have to hold, and both are asserted by resolving imports
// the way the dev server does, not by reading the config as text:
//
//   SAFETY       the swap acts on the RESOLVED path. Every import of these
//                modules in src/ is relative ('../../firebase.js'); a swap
//                keyed on the specifier never fires, and the harness quietly
//                loads the production-pointed module while appearing to pass.
//
//   ONE RESOLUTION PER IMPORT
//                the config used one plugin per swapped module, each resolving
//                and then returning null — so Vite went on to the next one,
//                which resolved again, recursively: 326 resolutions per import
//                with five swaps. It made the cold dependency scan take 36–106 s
//                and was the whole reason the draft certification's first page
//                load needed a 180 s budget (tests/browser/emulator/swapModules.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const emulator = path.join(repo, 'tests/browser/emulator');

const SWAPPED = [
  'src/firebase.js',
  'src/platform/liveChallenge/liveChallengeService.js',
  'src/services/testCycleService.js',
  'src/services/secureExamService.js',
  'src/platform/rewards/rewardsClient.js',
];

/**
 * A dev-server plugin container for one harness config, plus a counter placed
 * right after the swap plugin: every resolution that gets past the swap is one
 * Vite's own resolver has to do.
 */
const harnessResolver = async (configFile) => {
  const { createServer } = await import('vite');
  const { default: config } = await import(pathToFileURL(path.join(emulator, configFile)).href);
  const resolutions = { count: 0 };
  const counter = { name: 'count-resolutions', enforce: 'pre', resolveId() { resolutions.count += 1; return null; } };
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'mm-harness-swap-'));
  // configFile: false, so nothing is merged over this object: the swap plugin
  // is exactly the one the harness runs.
  const server = await createServer({
    ...config,
    configFile: false,
    cacheDir,
    logLevel: 'silent',
    plugins: [...config.plugins, counter],
    server: { middlewareMode: true, ws: false, hmr: false, watch: null },
    optimizeDeps: { disabled: true },
  });
  const container = server.environments.client.pluginContainer;
  return {
    resolutions,
    resolve: async (specifier, importer) => (await container.resolveId(specifier, path.join(repo, importer)))?.id,
    close: async () => { await server.close(); rmSync(cacheDir, { recursive: true, force: true }); },
  };
};

test('vite.config.mjs swaps every Firebase-reaching module, however it is imported', { timeout: 60_000 }, async () => {
  const harness = await harnessResolver('vite.config.mjs');
  try {
    // The way src/ really imports it: relative, extensionless, from two depths.
    assert.equal(await harness.resolve('./firebase', 'src/App.jsx'), path.join(emulator, 'firebaseEmulator.js'));
    assert.equal(await harness.resolve('../../firebase.js', 'src/platform/liveChallenge/liveChallengeService.js'),
      path.join(emulator, 'firebaseEmulator.js'));
    for (const target of SWAPPED) {
      const swapped = await harness.resolve(path.join(repo, target), 'src/App.jsx');
      assert.equal(path.dirname(swapped), emulator, `${target} must resolve to an emulator module, got ${swapped}`);
    }
    // A stub may import the real module it stands in for, instead of itself.
    assert.equal(await harness.resolve(path.join(repo, 'src/firebase.js'), path.relative(repo, path.join(emulator, 'firebaseEmulator.js'))),
      path.join(repo, 'src/firebase.js'));
  } finally {
    await harness.close();
  }
});

test('the bridge config swaps firebase.js and the Live Challenge service the same way', { timeout: 60_000 }, async () => {
  const harness = await harnessResolver('vite.bridge.config.mjs');
  try {
    assert.equal(await harness.resolve('./firebase', 'src/App.jsx'), path.join(emulator, 'firebaseEmulator.js'));
    assert.equal(await harness.resolve('../../platform/liveChallenge/liveChallengeService.js', 'src/components/liveChallenge/LiveChallengeStudent.jsx'),
      path.join(emulator, 'liveChallengeBridgeService.js'));
  } finally {
    await harness.close();
  }
});

test('resolving an import through a harness config costs one resolution, not one per swap', { timeout: 60_000 }, async () => {
  for (const configFile of ['vite.config.mjs', 'vite.bridge.config.mjs']) {
    const harness = await harnessResolver(configFile);
    try {
      for (const [specifier, importer] of [['react', 'src/App.jsx'], ['./QuestionEngine.jsx', 'src/App.jsx'], ['./firebase', 'src/App.jsx']]) {
        const before = harness.resolutions.count;
        assert.ok(await harness.resolve(specifier, importer), `${specifier} must resolve`);
        assert.equal(harness.resolutions.count - before, 1,
          `${configFile}: resolving ${specifier} took ${harness.resolutions.count - before} resolutions. A swap plugin that `
          + 'resolves and then returns null sends Vite on to resolve again; return the resolution instead (swapModules.mjs).');
      }
    } finally {
      await harness.close();
    }
  }
});
