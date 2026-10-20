#!/usr/bin/env node
// Do the emulator journeys' `paths` reach every file their drivers load?
//
//   node scripts/check-emulator-journey-paths.mjs          # report; exit 1 on a miss
//   node scripts/check-emulator-journey-paths.mjs --list   # also print every file loaded
//
// .github/workflows/student-pass3-emulator-journeys.yml runs testCycleRichToolQa
// and liveChallengeShellQa only on pull requests whose files match its `paths`
// (and nightly). A file a driver loads that no pattern reaches is a change that
// skips both journeys, and its break shows up at the nightly run, after merge
// (wave 7 review, F1).
//
// It rebuilds each driver's client import graph with Vite itself, under the
// driver's own bridge config, from the harness pages the driver opens; adds what
// the drivers load in node (read from their source); and matches every file
// with GitHub's rules: patterns in order, the last match wins, `!` excludes.
//
// Slow (Vite transforms some 800 modules per graph), so it is not part of
// test:platform. tests/platform/pass3BrowserDriversInCi.test.mjs pins the
// workflow's shape; this checks its reach.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = '.github/workflows/student-pass3-emulator-journeys.yml';

const DRIVERS = [
  {
    driver: 'tests/browser/testCycleRichToolQa.mjs',
    config: 'tests/browser/emulator/vite.testCycleBridge.config.mjs',
    entries: ['/tests/browser/testCycleLifecycleQaMain.jsx'],
  },
  {
    driver: 'tests/browser/liveChallengeShellQa.mjs',
    config: 'tests/browser/emulator/vite.bridge.config.mjs',
    entries: ['/tests/browser/graphFeatureRushStudentMain.jsx', '/tests/browser/graphFeatureRushTeacherMain.jsx'],
  },
];

/** The workflow's pull_request paths, in order. */
export const workflowPaths = (text) => {
  const block = text.split('\n  pull_request:\n')[1]?.split(/\n {2}[a-z_]+:\n/)[0] || '';
  const paths = block.split('\n    paths:\n')[1] || '';
  return paths.split('\n')
    .map((line) => line.match(/^ {6}- "([^"]+)"/)?.[1])
    .filter(Boolean);
};

/** GitHub's rule: patterns in order, the last one that matches decides. */
export const reachedBy = (file, patterns) => {
  let reached = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');
    if (path.matchesGlob(file, negated ? pattern.slice(1) : pattern)) reached = !negated;
  }
  return reached;
};

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
  const patterns = workflowPaths(readFileSync(path.join(repo, WORKFLOW), 'utf8'));
  if (!patterns.length) throw new Error(`no pull_request paths read from ${WORKFLOW}`);
  let missing = 0;
  for (const spec of DRIVERS) {
    const files = [...new Set([...(await clientGraph(spec)), ...nodeImports(spec.driver), spec.config])].sort();
    const missed = files.filter((file) => !reachedBy(file, patterns));
    console.log(`${spec.driver}: ${files.length} files loaded, ${missed.length} outside the workflow's paths`);
    missed.forEach((file) => console.log(`  MISSED ${file}`));
    if (process.argv.includes('--list')) files.forEach((file) => console.log(`  ${file}`));
    missing += missed.length;
  }
  if (missing) {
    console.log(`\n${missing} file(s) a driver loads would not run the emulator journeys on a pull request.`);
    process.exitCode = 1;
  } else {
    console.log('\nEvery file the two drivers load is inside the workflow\'s paths.');
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
