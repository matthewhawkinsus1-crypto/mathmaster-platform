#!/usr/bin/env node
// Carry Grade Transfer's TEAMS sync target builder into the default functions
// bundle (#612).
//
// The scheduled publish (gradingFunctions.js publishTeamsSyncTargetsOnSchedule)
// builds each linked class's TEAMS sync targets on the server, with THE SAME
// code Grade Export runs when a teacher presses "Send current grades":
// src/platform/gradeTransfer/teamsSync.js and Grade Transfer's projection
// behind it. That code lives in src/, and Firebase uploads only functions/,
// so this copies its module closure into functions/vendor/teamsSyncTargets/
// in the repository's own layout, exactly as
// scripts/sync-functions-weekly-planner.mjs does for the weekly planner.
//
// `vendor/` is generated and gitignored; the repository copy wins whenever it
// is present (functions/lib/teamsSyncScheduledTargets.js), so tests read the
// one real source. Without this step the deployed job finds no builder and
// publishes nothing (it fails closed; "Send current grades" still works).
//
// Run at predeploy of the default codebase (firebase.json), or by hand:
//   node scripts/sync-functions-teams-sync.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { TARGET_BUILDER_ENTRIES, VENDOR_ROOT } = require('../functions/lib/teamsSyncScheduledTargets.js');

// Import statements are read where they start a line, from the raw text. No
// comment stripping: a comment mentioning a path such as "shared/*" would
// open a "block comment" that swallows real imports (supportDeadline.mjs has
// one), and a line that starts with `import` is code, never prose.
const STATEMENTS = [
  /^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"]+)['"]/gm,
  /^[ \t]*import\s*['"]([^'"]+)['"]/gm,
  /^[^/\n*]*\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm,
];
const specifiersOf = (source) => STATEMENTS.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));

/** Every repository file the builder loads, as repo-relative paths. */
export function teamsSyncBuilderClosure({ root = ROOT } = {}) {
  const seen = new Set();
  const stack = Object.values(TARGET_BUILDER_ENTRIES).map((entry) => path.join(root, entry));
  while (stack.length) {
    const file = stack.pop();
    const relative = path.relative(root, file);
    if (seen.has(relative)) continue;
    if (relative.startsWith('..') || !fs.existsSync(file)) {
      throw new Error(`The TEAMS sync builder imports ${relative}, which is not a repository file.`);
    }
    seen.add(relative);
    for (const specifier of specifiersOf(fs.readFileSync(file, 'utf8'))) {
      // A package import would not resolve inside vendor/ (and would mean the
      // builder reached for the browser's Firebase client): refuse it here.
      if (!specifier.startsWith('.')) {
        throw new Error(`The TEAMS sync builder imports the package "${specifier}" in ${relative}; it must stay pure.`);
      }
      stack.push(path.resolve(path.dirname(file), specifier));
    }
  }
  return [...seen].sort();
}

/** Copy the closure into `vendorRoot` (the deploy bundle's by default). */
export function syncFunctionsTeamsSync({ root = ROOT, vendorRoot = VENDOR_ROOT } = {}) {
  const files = teamsSyncBuilderClosure({ root });
  fs.rmSync(vendorRoot, { recursive: true, force: true });
  files.forEach((relative) => {
    const target = path.join(vendorRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target);
  });
  // The functions package is CommonJS; these .js files are ESM, as they are
  // under the repository's own package.json.
  fs.writeFileSync(path.join(vendorRoot, 'package.json'), `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`);
  return files;
}

/** Vendored files that are missing or differ from their source. */
export function teamsSyncVendorDrift({ root = ROOT, vendorRoot = VENDOR_ROOT } = {}) {
  return teamsSyncBuilderClosure({ root }).filter((relative) => {
    const vendored = path.join(vendorRoot, relative);
    return !fs.existsSync(vendored) || fs.readFileSync(vendored).compare(fs.readFileSync(path.join(root, relative))) !== 0;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = syncFunctionsTeamsSync();
  console.log(`Synced ${files.length} TEAMS sync builder file(s) into ${path.relative(ROOT, VENDOR_ROOT)}/.`);
}
