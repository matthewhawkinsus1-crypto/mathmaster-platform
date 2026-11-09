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
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const emulator = path.join(repo, 'tests/browser/emulator');

const SWAPPED = [
  'src/firebase.js',
  // The production config itself, which the sign-in path imports for Auth and
  // Functions without Firestore (src/firebaseApp.js).
  'src/firebaseApp.js',
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
    // ...and the way the sign-in path imports the production config.
    assert.equal(await harness.resolve('../firebaseApp.js', 'src/auth/AuthProvider.jsx'), path.join(emulator, 'firebaseEmulator.js'));
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

// The production config is two modules since the sign-in screen stopped
// loading Firestore: src/firebaseApp.js (the app, Auth and Functions, which the
// sign-in path imports) and src/firebase.js (Firestore on that app, for App).
// A harness that swapped only firebase.js would run the real firebaseApp.js
// for every AuthProvider, authService and classroomApi import: the production
// project, with real callables. So every harness that swaps one swaps both.
const FIREBASE_SWAPPING_CONFIGS = [
  'vite.config.mjs',
  'vite.bridge.config.mjs',
  'vite.testCycleBridge.config.mjs',
  '../classRewardsQa.vite.config.mjs',
  '../secureResults.vite.config.mjs',
  '../secureExamNavigation.vite.config.mjs',
  '../liveChallengeTeachingQa.vite.config.mjs',
  '../forcedColors.vite.config.mjs',
];

test('every harness that swaps firebase.js swaps firebaseApp.js, however the sign-in path imports it', { timeout: 180_000 }, async () => {
  for (const configFile of FIREBASE_SWAPPING_CONFIGS) {
    const harness = await harnessResolver(configFile);
    try {
      const firebase = await harness.resolve('./firebase', 'src/App.jsx');
      assert.equal(path.dirname(firebase), emulator, `${configFile}: firebase.js resolved to ${firebase}`);
      for (const [specifier, importer] of [
        ['../firebaseApp.js', 'src/auth/AuthProvider.jsx'],
        ['../firebaseApp.js', 'src/auth/authService.js'],
        ['./firebaseApp.js', 'src/classroomApi.js'],
        [path.join(repo, 'src/firebaseApp.js'), 'src/App.jsx'],
      ]) {
        assert.equal(await harness.resolve(specifier, importer), firebase, `${configFile}: ${specifier} from ${importer} must resolve to the emulator module`);
      }
    } finally {
      await harness.close();
    }
  }
});

test('no harness swaps firebase.js without firebaseApp.js (the inline server included)', () => {
  const browser = path.join(repo, 'tests/browser');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'artifacts' || entry.name === 'node_modules') return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
  const swapsFirebase = /path\.join\(repo, 'src\/firebase\.js'\)/;
  const swappers = walk(browser).filter((file) => /\.m?js$/.test(file) && swapsFirebase.test(readFileSync(file, 'utf8')));
  assert.ok(swappers.length >= FIREBASE_SWAPPING_CONFIGS.length, `only ${swappers.length} harness files swap firebase.js: the scan is not finding them`);
  for (const file of swappers) {
    const relative = path.relative(emulator, file);
    // A config file is resolved through Vite above; the inline server
    // (liveChallengeProjectorPrivacyQa.mjs) and any other file must name both.
    if (FIREBASE_SWAPPING_CONFIGS.includes(relative)) continue;
    assert.match(readFileSync(file, 'utf8'), /path\.join\(repo, 'src\/firebaseApp\.js'\)/, `${path.relative(repo, file)} swaps firebase.js but not firebaseApp.js`);
    assert.ok(!/vite\.[\w.]*config\.mjs$/.test(file), `${path.relative(repo, file)} is a harness config: add it to FIREBASE_SWAPPING_CONFIGS`);
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
