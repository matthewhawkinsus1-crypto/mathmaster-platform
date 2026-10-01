/*
 * WHICH CLOUD FUNCTIONS A CODEBASE ACTUALLY DEPLOYS.
 *
 * Read the way the Firebase CLI reads it: load the module named by the
 * codebase's package.json `main` and keep every export that carries a
 * firebase-functions endpoint. For the default codebase that module is
 * platformEntry.js -> entry.js -> index.js, plus the Classroom section entry.
 *
 * deploy-functions-in-groups.sh used to `grep '^exports\.'` in index.js. That
 * found 145 of the 153 functions: the eight defined in entry.js,
 * platformEntry.js and classroomSectionEntry.js — Live Challenge experience,
 * Gemini authoring and all four Classroom section-grade functions — were never
 * part of a "deploy everything" run.
 *
 *   node scripts/lib/functionsInventory.mjs [codebaseDir] [--json]
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const triggerKind = (endpoint = {}) => {
  if (endpoint.callableTrigger) return 'callable';
  if (endpoint.httpsTrigger) return 'https';
  if (endpoint.scheduleTrigger) return 'schedule';
  if (endpoint.eventTrigger) return 'event';
  if (endpoint.taskQueueTrigger) return 'taskQueue';
  if (endpoint.blockingTrigger) return 'blocking';
  return 'other';
};

// An endpoint with no region is deployed to the CLI's default region; null
// here means "the default" (scripts/lib/releasePlan.mjs DEFAULT_FUNCTIONS_REGION).
const endpointRegion = (endpoint = {}) => {
  const region = Array.isArray(endpoint.region) ? endpoint.region[0] : endpoint.region;
  return typeof region === 'string' && region ? region : null;
};

/**
 * @returns {{ entry: string, functions: Array<{ name: string, trigger: string, region: string|null, labels: object }> }}
 *          names sorted, so batching is deterministic from run to run. `labels`
 *          are the Cloud labels the CLI will set — including the deploy
 *          provenance labels (mm-git-sha, mm-tree) every function carries.
 */
export const listDeployableFunctions = ({ codebaseDir = path.join(repoRoot, 'functions') } = {}) => {
  const manifest = JSON.parse(readFileSync(path.join(codebaseDir, 'package.json'), 'utf8'));
  const entry = manifest.main || 'index.js';
  const require = createRequire(path.join(codebaseDir, entry));
  const exported = require(path.join(codebaseDir, entry));
  const functions = Object.entries(exported || {})
    .filter(([, value]) => value && (typeof value === 'function' || typeof value === 'object') && value.__endpoint)
    .map(([name, value]) => ({
      name,
      trigger: triggerKind(value.__endpoint),
      region: endpointRegion(value.__endpoint),
      labels: { ...value.__endpoint.labels },
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { entry, functions };
};

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const codebaseDir = args.find((arg) => !arg.startsWith('--'));
  const { entry, functions } = listDeployableFunctions(codebaseDir ? { codebaseDir: path.resolve(codebaseDir) } : {});
  if (args.includes('--json')) console.log(JSON.stringify({ entry, functions }, null, 2));
  else functions.forEach(({ name }) => console.log(name));
}
