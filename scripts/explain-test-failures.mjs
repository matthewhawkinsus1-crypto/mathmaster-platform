#!/usr/bin/env node
/*
 * Runs the platform suite and, for every failure, says what KIND of failure it
 * is and what to do about it.
 *
 * Why this exists. Across PRs #152 and #155-#166, 26 of 27 suite failures were
 * not regressions. They were assertions pinned to a REPRESENTATION — the text
 * of a file, a canonical value, a frozen object shape — that a correct refactor
 * had moved. Exactly one was a real bug.
 *
 * That base rate is the problem. A red suite looks identical in both cases, so
 * the cautious-looking response is to revert the change until the assertion
 * matches again. On PR #165 that would have restored an expression which had
 * itself become the double-draw bug the test existed to prevent.
 *
 * So the run tells you which kind you are looking at, instead of leaving it to
 * be guessed.
 *
 * One kind is not about the code at all. A checkout that ran the root `npm ci`
 * but not `npm --prefix functions ci` cannot load the suites that import Cloud
 * Functions code: firebase-admin, firebase-functions and googleapis live only
 * in functions/package.json. Those fail with ERR_MODULE_NOT_FOUND before a
 * single assertion runs, and used to be reported as BEHAVIOURAL — "more likely
 * than the others to be a genuine defect" — which is the opposite of the truth.
 * They are now ENVIRONMENT, listed apart, and never counted with the rest. The
 * run still exits non-zero: the suite did not pass.
 *
 * Parsing and classification live in scripts/lib/testFailureClassifier.mjs,
 * which tests/platform/explainTestFailures.test.mjs imports; this script only
 * runs the suite and prints.
 */

import { spawn } from 'node:child_process';
import {
  FUNCTIONS_DEPENDENCIES_NOTE,
  GUIDANCE,
  classify,
  missingFunctionsDependency,
  parseFailures,
} from './lib/testFailureClassifier.mjs';

const PLAYBOOK = 'docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md';

const run = () => new Promise((resolve) => {
  const child = spawn('node', ['--test', ...process.argv.slice(2).length ? process.argv.slice(2) : ['tests/platform/*.test.mjs']], {
    shell: true,
    encoding: 'utf8',
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
  child.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
  child.on('close', (code) => resolve({ out, code }));
});

const { out, code } = await run();
const failures = parseFailures(out);

if (!failures.length) process.exit(code);

const bar = '='.repeat(78);
const classified = failures.map((failure) => ({ ...failure, kind: classify(failure) }));
const environment = classified.filter((failure) => failure.kind === 'functionsDependencies');
const toRead = classified.filter((failure) => failure.kind !== 'functionsDependencies');

if (environment.length) {
  console.log(`\n${bar}`);
  console.log(`ENVIRONMENT, NOT A REGRESSION: ${environment.length} FAILURE${environment.length === 1 ? '' : 'S'}`);
  console.log(bar);
  console.log(`\n${FUNCTIONS_DEPENDENCIES_NOTE}`);
  console.log('These could not load Cloud Functions code: its packages live only in');
  console.log('functions/package.json. No assertion in them ran, so they say nothing about');
  console.log('your change, and they are not counted with the failures below.\n');
  environment.forEach((failure) => {
    console.log(`  - ${failure.name}  (missing ${missingFunctionsDependency(failure)})`);
  });
  console.log('\nInstall them, re-run, and read only what is still red.');
}

if (toRead.length) {
  console.log(`\n${bar}`);
  console.log(`HOW TO READ THESE ${toRead.length} FAILURE${toRead.length === 1 ? '' : 'S'}`);
  console.log(bar);
  console.log(
    '\nAcross PRs #152 and #155-#166, 26 of 27 failures in this suite were NOT\n'
    + 'regressions — they were assertions pinned to a representation that a correct\n'
    + 'refactor had moved. Exactly one was a real bug.\n\n'
    + 'So do not revert working code to make an assertion match again. On PR #165\n'
    + 'that would have restored an expression that had itself become the bug the\n'
    + 'test existed to prevent.\n\n'
    + `Full procedure: ${PLAYBOOK}`,
  );
}

const seen = new Set();
toRead.forEach((failure, index) => {
  const { kind } = failure;
  const g = GUIDANCE[kind];
  console.log(`\n${'-'.repeat(78)}`);
  console.log(`${index + 1}. ${failure.name}`);
  if (failure.file) console.log(`   ${failure.file}`);
  console.log(`\n   LIKELY: ${g.label}`);
  if (!seen.has(kind)) {
    console.log(`   ${g.why}`);
    console.log('\n   What to do:');
    g.steps.forEach((step, n) => console.log(`     ${n + 1}. ${step}`));
    seen.add(kind);
  } else {
    console.log(`   (same kind as above — see the steps listed there)`);
  }
});

console.log(`\n${bar}`);
console.log('Classification is a heuristic from the error shape. Verify before acting.');
console.log(bar);
process.exit(code || 1);
