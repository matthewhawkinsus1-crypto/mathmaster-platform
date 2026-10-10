#!/usr/bin/env node
/*
 * The student first-load budget (scripts/lib/firstLoadBudget.mjs).
 *
 *   npm run build && node scripts/check-first-load-budget.mjs
 *   node scripts/check-first-load-budget.mjs --report          # every file on each path
 *   node scripts/check-first-load-budget.mjs --write-baseline  # only after a deliberate reduction
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { baselineFrom, compareToBaseline, criticalPaths, measurePaths } from './lib/firstLoadBudget.mjs';

const root = process.cwd();
const dist = path.join(root, 'dist');
const manifestPath = path.join(dist, '.vite/manifest.json');
const baselinePath = path.join(root, 'scripts/first-load-baseline.json');

if (!existsSync(manifestPath)) {
  console.error(`No ${path.relative(root, manifestPath)} — run \`npm run build\` first (vite.config.js sets build.manifest).`);
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sizes = new Map();
const sizeOf = (file) => {
  if (!sizes.has(file)) sizes.set(file, gzipSync(readFileSync(path.join(dist, file)), { level: 9 }).length);
  return sizes.get(file);
};
let paths;
try {
  paths = criticalPaths(manifest);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const measured = measurePaths(paths, sizeOf);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

for (const [name, value] of Object.entries(measured)) console.log(`${name}: ${kb(value.bytes)} gzip in ${value.files} files`);
if (process.argv.includes('--report')) {
  for (const [name, files] of Object.entries(paths)) {
    console.log(`\n${name}:`);
    files.map((file) => [file, sizeOf(file)]).sort((a, b) => b[1] - a[1]).forEach(([file, bytes]) => console.log(`  ${kb(bytes).padStart(9)}  ${file}`));
  }
}

const previous = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
if (!previous && !process.argv.includes('--write-baseline')) {
  console.error(`No ${path.relative(root, baselinePath)} — a budget with no baseline checks nothing. Create it with --write-baseline.`);
  process.exit(1);
}
if (process.argv.includes('--write-baseline')) {
  writeFileSync(baselinePath, `${JSON.stringify(baselineFrom(measured, previous), null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, baselinePath)}.`);
  process.exit(0);
}
const result = compareToBaseline({ measured, baseline: previous, allowanceBytes: previous.allowanceBytes });
result.reduced.forEach(({ name, bytes, baseline }) => console.log(`${name} is ${kb(baseline - bytes)} below its baseline — lower it with --write-baseline.`));
if (!result.ok) {
  result.over.forEach(({ name, bytes, baseline, growth }) => console.error(`${name}: ${kb(bytes)} is ${kb(growth)} over its baseline of ${kb(baseline)} (allowance ${kb(previous.allowanceBytes)}). Something joined the first load: run with --report, and load it lazily.`));
  result.unknown.forEach((name) => console.error(`${name} has no baseline.`));
  process.exit(1);
}
console.log('First-load budget: within baseline.');
