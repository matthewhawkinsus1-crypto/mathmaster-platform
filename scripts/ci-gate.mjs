#!/usr/bin/env node
// The "CI gate" job of .github/workflows/ci.yml: passes only when every
// workflow the run called passed or was skipped for an unchanged area
// (scripts/lib/ciGate.mjs). NEEDS is the job's `toJSON(needs)`.
import { appendFileSync } from 'node:fs';
import { gateVerdict } from './lib/ciGate.mjs';

let needs;
try {
  needs = JSON.parse(process.env.NEEDS || '');
} catch {
  console.error('NEEDS is not the JSON of the gate job\'s needs.');
  process.exit(1);
}

const { ok, rows, problems } = gateVerdict(needs);
rows.forEach(({ job, result }) => console.log(`${result.padEnd(10)} ${job}`));
console.log(ok ? '\nCI gate: every workflow that had to run passed.' : `\nCI gate FAILED:\n${problems.map((line) => `  - ${line}`).join('\n')}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    `### CI gate: ${ok ? 'passed' : 'failed'}`,
    '',
    '| Job | Result |',
    '| --- | --- |',
    ...rows.map(({ job, result }) => `| ${job} | ${result} |`),
    '',
    ...(ok ? [] : ['Failed because:', ...problems.map((line) => `- ${line}`), '']),
  ].join('\n'));
}
process.exit(ok ? 0 : 1);
