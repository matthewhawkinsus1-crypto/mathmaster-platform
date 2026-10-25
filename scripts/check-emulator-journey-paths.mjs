#!/usr/bin/env node
// Does the emulator journeys' area reach every file their drivers load?
//
//   node scripts/check-emulator-journey-paths.mjs          # report; exit 1 on a miss
//   node scripts/check-emulator-journey-paths.mjs --list   # also print every file loaded
//
// .github/workflows/student-pass3-emulator-journeys.yml runs its drivers
// (testCycleRichToolQa, testCycleLifecycleQa, liveChallengeShellQa,
// graphFeatureRushGame) on a pull request only when their files are in the
// workflow's area
// (scripts/lib/ciAreas.mjs, which ci.yml reads), and nightly. A file a driver
// loads that no pattern reaches is a change that skips the journeys, and its
// break shows up at the nightly run, after merge (wave 7 review, F1).
//
// It rebuilds each driver's client import graph with Vite itself, under the
// driver's own bridge config, from the harness pages the driver opens; adds what
// the drivers load in node (read from their source); and matches every file
// with GitHub's rules: patterns in order, the last match wins, `!` excludes
// (the same matcher ci.yml uses).
//
// Slow (Vite transforms some 800 modules per graph), so it is not part of
// test:platform. tests/platform/pass3BrowserDriversInCi.test.mjs pins the
// workflow's shape; this checks its reach.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CI_AREAS, reachedBy } from './lib/ciAreas.mjs';

export { reachedBy };

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AREA = 'student-pass3-emulator-journeys';

/** The emulator journeys' area: the patterns a pull request's files must reach, in order. */
export const emulatorJourneyPaths = () => CI_AREAS[AREA];

const DRIVERS = [
  {
    driver: 'tests/browser/testCycleRichToolQa.mjs',
    config: 'tests/browser/emulator/vite.testCycleBridge.config.mjs',
    entries: ['/tests/browser/testCycleLifecycleQaMain.jsx'],
  },
  {
    // CI16: the same page and bridge as the rich-tools driver, a different journey.
    driver: 'tests/browser/testCycleLifecycleQa.mjs',
    config: 'tests/browser/emulator/vite.testCycleBridge.config.mjs',
    entries: ['/tests/browser/testCycleLifecycleQaMain.jsx'],
  },
  {
    driver: 'tests/browser/liveChallengeShellQa.mjs',
    config: 'tests/browser/emulator/vite.bridge.config.mjs',
    entries: ['/tests/browser/graphFeatureRushStudentMain.jsx', '/tests/browser/graphFeatureRushTeacherMain.jsx'],
  },
  {
    // CI06: the same pages and bridge as the shell driver, whole Rush games.
    driver: 'tests/browser/graphFeatureRushGame.mjs',
    config: 'tests/browser/emulator/vite.bridge.config.mjs',
    entries: ['/tests/browser/graphFeatureRushStudentMain.jsx', '/tests/browser/graphFeatureRushTeacherMain.jsx'],
  },
];

/** Files a driver loads in node, read from its own imports. */
const nodeImports = (driver) => {
  const source = readFileSync(path.join(repo, driver), 'utf8');
  const found = [driver];
  for (const match of source.matchAll(/path\.join\((repo|here), '([^']+)'\)/g)) {
    const file = match[1] === 'repo' ? match[2] : path.join(path.dirname(driver), match[2]);
    if (/\.(m?js|jsx|json)$/.test(file)) found.push(file);
  }
  return found;
};

const clientGraph = async ({ config, entries }) => {
  const { createServer } = await import(path.join(repo, 'node_modules/vite/dist/node/index.js'));
  const server = await createServer({
    configFile: path.join(repo, config),
    server: { middlewareMode: true, hmr: false, watch: null },
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const seen = new Set();
  const files = new Set();
  const visit = async (url) => {
    if (seen.has(url)) return;
    seen.add(url);
    try { await server.transformRequest(url); } catch { return; }
    const node = await server.moduleGraph.getModuleByUrl(url);
    if (node?.file) files.add(node.file);
    for (const dep of node?.importedModules || []) if (dep.url && !dep.url.includes('/node_modules/')) await visit(dep.url);
  };
  for (const entry of entries) await visit(entry);
  await server.close();
  return [...files]
    .map((file) => path.relative(repo, file.split('?')[0]))
    .filter((file) => !file.startsWith('..') && !file.startsWith('node_modules/'));
};

const main = async () => {
  const patterns = emulatorJourneyPaths();
  if (!patterns?.length) throw new Error(`no area named ${AREA} in scripts/lib/ciAreas.mjs`);
  let missing = 0;
  for (const spec of DRIVERS) {
    const files = [...new Set([...(await clientGraph(spec)), ...nodeImports(spec.driver), spec.config])].sort();
    const missed = files.filter((file) => !reachedBy(file, patterns));
    console.log(`${spec.driver}: ${files.length} files loaded, ${missed.length} outside the workflow's area`);
    missed.forEach((file) => console.log(`  MISSED ${file}`));
    if (process.argv.includes('--list')) files.forEach((file) => console.log(`  ${file}`));
    missing += missed.length;
  }
  if (missing) {
    console.log(`\n${missing} file(s) a driver loads would not run the emulator journeys on a pull request.`);
    process.exitCode = 1;
  } else {
    console.log('\nEvery file the drivers load is inside the workflow\'s area.');
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
