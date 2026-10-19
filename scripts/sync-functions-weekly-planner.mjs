#!/usr/bin/env node
// Carry the browser's weekly Path planner into the default functions bundle.
//
// resolveWeeklyPathGoalSnapshot checks a short weekly proposal against the
// server's own plan for the week (functions/lib/weeklyPathServerPlan.js), made
// by the SAME planner the student's browser runs. That planner lives in src/,
// and Firebase uploads only functions/, so this copies the planner's module
// closure into functions/vendor/weeklyPathPlanner/ in the repository's own
// layout (src/... and functions/shared/...), so every relative import inside
// it resolves exactly as it does in the repository.
//
// This is a COPY, not a fork: `vendor/` is generated and gitignored, the
// repository copy wins whenever it is present (so tests read the one real
// source), and tests/platform/weeklyPathShortWeek.test.mjs syncs into a
// scratch directory and plans from the copy. Without this step the deployed
// server cannot plan, and a short week is refused, as before.
//
// Run at predeploy of the default codebase (firebase.json), or by hand:
//   node scripts/sync-functions-weekly-planner.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PLANNER_ENTRIES, VENDOR_ROOT } = require('../functions/lib/weeklyPathServerPlan.js');

// Static imports and re-exports (`import … from`, `export … from`, bare
// `import '…'`) and literal dynamic imports. Comments are stripped first so a
// specifier quoted in prose is not mistaken for a dependency.
const SPECIFIERS = [
  /\b(?:import|export)\s*(?:[\w*{}\s,$]*?\bfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g,
  /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
];
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');

/** Every repository file the planner entries load, as repo-relative paths. */
export function plannerClosure({ root = ROOT } = {}) {
  const seen = new Set();
  const stack = Object.values(PLANNER_ENTRIES).map((entry) => path.join(root, entry));
  while (stack.length) {
    const file = stack.pop();
    const relative = path.relative(root, file);
    if (seen.has(relative)) continue;
    if (relative.startsWith('..') || !fs.existsSync(file)) {
      throw new Error(`The weekly planner imports ${relative}, which is not a repository file.`);
    }
    seen.add(relative);
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    SPECIFIERS.forEach((pattern) => {
      for (const match of source.matchAll(pattern)) stack.push(path.resolve(path.dirname(file), match[1]));
    });
  }
  return [...seen].sort();
}

/** Copy the closure into `vendorRoot` (the deploy bundle's by default). */
export function syncFunctionsWeeklyPlanner({ root = ROOT, vendorRoot = VENDOR_ROOT } = {}) {
  const files = plannerClosure({ root });
  fs.rmSync(vendorRoot, { recursive: true, force: true });
  files.forEach((relative) => {
    const target = path.join(vendorRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target);
  });
  // The functions package is CommonJS; the planner's .js files are ESM, as
  // they are under the repository's own package.json.
  fs.writeFileSync(path.join(vendorRoot, 'package.json'), `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`);
  return files;
}

/** Vendored files that are missing or differ from their source. */
export function plannerVendorDrift({ root = ROOT, vendorRoot = VENDOR_ROOT } = {}) {
  return plannerClosure({ root }).filter((relative) => {
    const vendored = path.join(vendorRoot, relative);
    return !fs.existsSync(vendored) || fs.readFileSync(vendored).compare(fs.readFileSync(path.join(root, relative))) !== 0;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = syncFunctionsWeeklyPlanner();
  console.log(`Synced ${files.length} weekly planner file(s) into ${path.relative(ROOT, VENDOR_ROOT)}/.`);
}
