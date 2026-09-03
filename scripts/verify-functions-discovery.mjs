#!/usr/bin/env node
//
// Prove the Cloud Functions codebase can be discovered BEFORE handing the job to
// `firebase deploy`.
//
// Why this exists: `firebase deploy` loads the whole codebase in a short-lived
// child process to build its manifest, then filters down to the functions you
// asked for. When that step fails the CLI only says
//
//   Error: Failed to list functions for <project>
//
// which does not distinguish "your code throws on load" from "the CLI's own
// localhost poll timed out on a small machine". This script answers the first
// question definitively and in isolation, so a real code defect is never
// mistaken for a flaky deploy environment.
//
// Usage:
//   node scripts/verify-functions-discovery.mjs [requiredFunctionName ...]

import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const functionsRoot = path.join(repoRoot, 'functions');
const require = createRequire(path.join(functionsRoot, 'index.js'));

const required = process.argv.slice(2).filter(Boolean);
const startedAt = Date.now();

const fail = (message, remedy = []) => {
  console.error(`\nFunctions discovery check FAILED: ${message}`);
  for (const line of remedy) console.error(`  ${line}`);
  process.exit(1);
};

let exported;
try {
  exported = require(path.join(functionsRoot, 'index.js'));
} catch (error) {
  fail(`functions/index.js threw while loading: ${error?.message || error}`, [
    'This is a real code defect, not a deploy environment problem.',
    'Run `npm ci --prefix functions` first; if it still throws, fix the error above.',
  ]);
}

const exportedNames = Object.keys(exported || {});
if (!exportedNames.length) {
  fail('functions/index.js loaded but exported nothing.');
}

// Ask firebase-functions itself to build the manifest when we can reach its
// loader, so this check matches what the CLI actually does rather than only
// proving the module imports. The loader lives on an internal path, so treat its
// absence as a version difference and fall back to the export list.
let endpointNames = null;
try {
  const loader = require(path.join(functionsRoot, 'node_modules/firebase-functions/lib/runtime/loader.js'));
  const stack = await loader.loadStack(functionsRoot);
  endpointNames = Object.keys(stack?.endpoints || {});
} catch (error) {
  console.log(`note: firebase-functions manifest loader unavailable (${error?.code || error?.message || 'unknown'}); checking exports instead.`);
}

const names = endpointNames || exportedNames;
const missing = required.filter((name) => !names.includes(name));
if (missing.length) {
  fail(`the codebase does not define: ${missing.join(', ')}`, [
    'Confirm this checkout is the commit you intended to deploy.',
  ]);
}

const elapsedMs = Date.now() - startedAt;
console.log(`Functions discovery check passed in ${elapsedMs}ms.`);
console.log(`  ${names.length} function${names.length === 1 ? '' : 's'} discovered${endpointNames ? ' via the firebase-functions manifest loader' : ''}.`);
for (const name of required) console.log(`  present: ${name}`);

// The CLI gives its discovery child process a fixed budget. Loading this
// codebase is fast on a workstation and much slower on a small Cloud Shell VM,
// so say plainly when the margin is thin rather than letting the deploy fail
// with a message that points nowhere.
if (elapsedMs > 5000) {
  console.log('');
  console.log(`warning: discovery took ${Math.round(elapsedMs / 1000)}s on this machine.`);
  console.log('If `firebase deploy` reports "Failed to list functions", raise its budget:');
  console.log('  export FUNCTIONS_DISCOVERY_TIMEOUT=180');
}
