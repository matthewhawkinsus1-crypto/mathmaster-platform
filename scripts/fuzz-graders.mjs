#!/usr/bin/env node
/**
 * Grader fuzz and parity run (scripts/lib/graderFuzz, docs/architecture/GRADER_FUZZ.md).
 *
 *   node scripts/fuzz-graders.mjs                       the pull-request slice
 *   node scripts/fuzz-graders.mjs --seed 2026-11-16 --count 20000 --max-length 1000
 *                                                       a nightly-sized run
 *   node scripts/fuzz-graders.mjs --target typedFields  one target
 *   node scripts/fuzz-graders.mjs --replay case.json    one case again (a
 *                                                       finding's `repro`)
 *   --out findings.json    every finding, folded by signature, as JSON
 *   --budget-minutes N     stop each target after N minutes (it says so)
 *   --slow-ms N            what one verdict may take before it is a finding (2000)
 *   --strict-known         also fail when a listed known finding was not met
 *                          (for a run large enough to meet them all)
 *
 * Exit 1 when a finding is not listed in scripts/grader-fuzz-known-findings.json.
 * Read only: it writes only the --out file.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { formatFinding, summarizeFindings, readKnownFindings } from './lib/graderFuzz/findings.mjs';
import { TARGET_IDS, replayCase, runGraderFuzz } from './lib/graderFuzz/index.mjs';

const argOf = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const flag = (name) => process.argv.includes(name);

const known = readKnownFindings();
const replay = argOf('--replay');
const out = argOf('--out');
const maxLength = Number(argOf('--max-length', '600')) || 600;
const checkOptions = { slowMs: Number(argOf('--slow-ms', '2000')) || 2000 };

let result;
if (replay) {
  const parsed = JSON.parse(readFileSync(replay, 'utf8'));
  const fuzzCase = parsed.repro || parsed;
  const findings = await replayCase(fuzzCase, checkOptions);
  result = { seed: 'replay', cases: 1, perTarget: [], findings, summary: summarizeFindings(findings, known) };
} else {
  const targets = argOf('--target') ? argOf('--target').split(',') : TARGET_IDS;
  result = await runGraderFuzz({
    seed: argOf('--seed', 'pr'),
    count: Number(argOf('--count', '300')) || 300,
    targets,
    budgetMs: argOf('--budget-minutes') ? Number(argOf('--budget-minutes')) * 60_000 : Infinity,
    known,
    checkOptions,
    caseOptions: { maxLength },
  });
}

const { summary } = result;
console.log(`grader fuzz: seed ${JSON.stringify(result.seed)}, ${result.cases} cases`);
for (const row of result.perTarget) console.log(`  ${row.target}: ${row.cases} cases in ${row.ms} ms${row.cutShort ? ' (stopped at its time budget)' : ''}`);
console.log(`  ${summary.failures.length} new finding(s), ${summary.known.length} known, ${summary.reports.length} reported difference(s)`);

if (summary.reports.length) {
  console.log('\nREPORTED (graders that differ; not a failure):');
  for (const entry of summary.reports) console.log(`  ${entry.signature}  (${entry.count})`);
}
if (summary.known.length) {
  console.log('\nKNOWN (listed in scripts/grader-fuzz-known-findings.json):');
  for (const entry of summary.known) console.log(`  ${entry.signature}  (${entry.count})`);
}
if (summary.failures.length) {
  console.log('\nNEW FINDINGS:');
  for (const entry of summary.failures) console.log(formatFinding(entry));
  console.log('\nRun one again: save its `repro` JSON to a file and pass --replay <file>.');
}
const unmet = flag('--strict-known') ? summary.unmet : [];
if (unmet.length) {
  console.log('\nKNOWN FINDINGS THIS RUN DID NOT MEET (fixed? delete them from the list):');
  for (const signature of unmet) console.log(`  ${signature}`);
}
if (out) {
  writeFileSync(out, `${JSON.stringify({ seed: result.seed, cases: result.cases, perTarget: result.perTarget, failures: summary.failures, known: summary.known, reports: summary.reports, unmet: summary.unmet }, null, 2)}\n`);
  console.log(`\nwrote ${out}`);
}
process.exit(summary.failures.length || unmet.length ? 1 : 0);
