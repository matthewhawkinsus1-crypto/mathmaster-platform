#!/usr/bin/env node
/*
 * What a change to App.jsx did to the hooks React runs.
 *
 *   node scripts/app-hook-ledger.mjs                     the working tree against origin/main
 *   node scripts/app-hook-ledger.mjs --base <ref>        against another commit
 *   node scripts/app-hook-ledger.mjs --list              the working tree's effects, in run order
 *   node scripts/app-hook-ledger.mjs --allow-moved       exit 0 when effects only moved (still printed)
 *
 * Exit 1 when an effect's code changed, appeared or disappeared, or when an
 * effect now runs in a different order and --allow-moved was not given.
 * scripts/lib/appHookLedger.mjs explains what is compared and why.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compareLedgers, createHookLedger, describeEntry, EFFECT_HOOKS } from './lib/appHookLedger.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index === -1 ? fallback : args[index + 1]; };
const base = option('--base', 'origin/main');
const component = option('--component', 'App');
const path = option('--file', 'src/App.jsx');

const fromWorkingTree = (file) => (existsSync(ROOT + file) ? readFileSync(ROOT + file, 'utf8') : null);
const fromCommit = (ref) => (file) => {
  try { return execFileSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }); }
  catch { return null; }
};

const after = createHookLedger(fromWorkingTree).ledger(path, component);

if (args.includes('--list')) {
  for (const entry of after) if (EFFECT_HOOKS.has(entry.hook)) console.log(`${entry.hash}  ${describeEntry(entry)}`);
  process.exit(0);
}

const before = createHookLedger(fromCommit(base)).ledger(path, component);
const { effects, hooks } = compareLedgers(before, after);
const count = (entries) => entries.filter((entry) => EFFECT_HOOKS.has(entry.hook)).length;

console.log(`${component}'s hooks, ${base} -> working tree: ${before.length} -> ${after.length} hook calls, ${count(before)} -> ${count(after)} effects.`);
if (effects.same) console.log('Effects: the same code in the same order.');
for (const entry of effects.removed) console.log(`EFFECT GONE OR CHANGED  ${describeEntry(entry)}`);
for (const entry of effects.added) console.log(`EFFECT NEW OR CHANGED   ${describeEntry(entry)}`);
for (const move of effects.moved) {
  console.log(`EFFECT MOVED  ${describeEntry(move.before)} -> ${describeEntry(move.after)}`);
  for (const crossed of move.crossed) console.log(`    crossed  ${describeEntry(crossed)}`);
}
if (hooks.same) console.log('Every hook call: the same code in the same order.');
else console.log(`Other hooks: ${hooks.moved.length} moved, ${hooks.removed.length} gone or changed, ${hooks.added.length} new or changed (order here is identity only; an effect's order is behaviour).`);
if (args.includes('--verbose')) {
  for (const entry of hooks.removed) console.log(`  gone or changed  ${describeEntry(entry)}`);
  for (const entry of hooks.added) console.log(`  new or changed   ${describeEntry(entry)}`);
  for (const move of hooks.moved) console.log(`  moved  ${describeEntry(move.before)} -> ${describeEntry(move.after)}`);
}

const changed = effects.removed.length > 0 || effects.added.length > 0;
const moved = effects.moved.length > 0;
process.exit(changed || (moved && !args.includes('--allow-moved')) ? 1 : 0);
