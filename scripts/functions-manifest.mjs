/*
 * WHAT FIREBASE WOULD DEPLOY: EVERY FUNCTION'S DEFINITION, AND A DIFF OF IT.
 *
 * The Firebase CLI deploys a function from the endpoint its export carries:
 * its name, trigger (callable, HTTPS, Firestore path and event, schedule and
 * time zone, retry), region, memory, timeout, concurrency, instance limits,
 * secrets, labels and invoker. A change that is meant to move code and change
 * none of that (splitting a file, making a require lazy) can prove it here:
 *
 *   node scripts/functions-manifest.mjs                    print the definitions (JSON, names sorted)
 *   node scripts/functions-manifest.mjs --compare main     compare this checkout with a commit
 *   node scripts/functions-manifest.mjs --dir functions-path-admin [--compare main]
 *
 * --compare checks the other commit out into a temporary git worktree, loads
 * its entry point with this checkout's node_modules, and prints each function
 * that was added, removed or changed, with the fields that differ. It exits 1
 * when anything differs. It deploys nothing and reads no project.
 *
 * Each side is loaded in its own node process, the way the CLI discovers
 * functions: package.json `main`, every export with an endpoint. The deploy
 * provenance labels (mm-git-sha, mm-tree) come from a file written at deploy
 * time, which neither side has here, so they compare equal.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Runs in the child: load the codebase and print its definitions. A value
// that is not plain data (a secret or a parameter expression) is printed as
// its class and its text, so two of them compare by what they would deploy.
const DUMP = `
const path = require('path');
const dir = process.argv[1];
const main = require(path.join(dir, 'package.json')).main || 'index.js';
const exported = require(path.join(dir, main));
const plain = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value, (key, item) => (
  item && typeof item === 'object' && item.constructor && !['Object', 'Array'].includes(item.constructor.name)
    ? { __class: item.constructor.name, ...item, text: String(item) }
    : item
)));
const out = {};
for (const name of Object.keys(exported).sort()) {
  const value = exported[name];
  if (value && (typeof value === 'function' || typeof value === 'object') && value.__endpoint) {
    out[name] = { endpoint: plain(value.__endpoint), requiredAPIs: plain(value.__requiredAPIs), trigger: plain(value.__trigger) };
  }
}
process.stdout.write(JSON.stringify(out));
`;

/** { name: { endpoint, requiredAPIs, trigger } } for the codebase in `codebaseDir`. */
export const functionsManifest = (codebaseDir) => {
  const run = spawnSync(process.execPath, ['-e', DUMP, path.resolve(codebaseDir)], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`${codebaseDir} did not load:\n${run.stderr}`);
  return JSON.parse(run.stdout);
};

// The paths at which two values differ, e.g. "endpoint.availableMemoryMb".
const differingPaths = (left, right, at = '') => {
  if (JSON.stringify(left) === JSON.stringify(right)) return [];
  const bothObjects = left && right && typeof left === 'object' && typeof right === 'object' && Array.isArray(left) === Array.isArray(right);
  if (!bothObjects) return [at || '(value)'];
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
    .flatMap((key) => differingPaths(left[key], right[key], at ? `${at}.${key}` : key));
};

/** What differs between two manifests: { added, removed, changed: { name: [paths] } }. */
export const compareManifests = (before, after) => {
  const added = Object.keys(after).filter((name) => !(name in before)).sort();
  const removed = Object.keys(before).filter((name) => !(name in after)).sort();
  const changed = {};
  Object.keys(after).filter((name) => name in before).sort().forEach((name) => {
    const paths = differingPaths(before[name], after[name]);
    if (paths.length) changed[name] = paths;
  });
  return { added, removed, changed, same: !added.length && !removed.length && !Object.keys(changed).length };
};

/** The manifest of `codebase` (a directory name) at commit `ref`, from a temporary worktree. */
export const manifestAtCommit = ({ ref, codebase = 'functions', root = repoRoot } = {}) => {
  const worktree = mkdtempSync(path.join(os.tmpdir(), 'functions-manifest-'));
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const added = git('worktree', 'add', '--detach', worktree, ref);
  if (added.status !== 0) {
    rmSync(worktree, { recursive: true, force: true });
    throw new Error(`could not check out ${ref}: ${added.stderr.trim()}`);
  }
  try {
    const modules = path.join(root, codebase, 'node_modules');
    if (!existsSync(modules)) throw new Error(`${codebase}/node_modules is missing: run npm ci in ${codebase} first`);
    symlinkSync(modules, path.join(worktree, codebase, 'node_modules'), 'dir');
    return functionsManifest(path.join(worktree, codebase));
  } finally {
    git('worktree', 'remove', '--force', worktree);
    rmSync(worktree, { recursive: true, force: true });
  }
};

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const codebase = option('--dir') || 'functions';
  const ref = option('--compare');
  const here = functionsManifest(path.join(repoRoot, codebase));
  if (!ref) {
    console.log(JSON.stringify(here, null, 2));
  } else {
    const there = manifestAtCommit({ ref, codebase });
    const { added, removed, changed, same } = compareManifests(there, here);
    console.log(`${codebase}: ${Object.keys(there).length} function(s) at ${ref}, ${Object.keys(here).length} in this checkout.`);
    added.forEach((name) => console.log(`  added    ${name}`));
    removed.forEach((name) => console.log(`  removed  ${name}`));
    Object.entries(changed).forEach(([name, paths]) => console.log(`  changed  ${name}: ${paths.join(', ')}`));
    console.log(same ? 'Every function\'s definition is identical.' : 'The definitions differ.');
    process.exit(same ? 0 : 1);
  }
}
