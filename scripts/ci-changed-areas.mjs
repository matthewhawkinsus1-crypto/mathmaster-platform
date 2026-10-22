#!/usr/bin/env node
// Which workflows this run of .github/workflows/ci.yml calls (scripts/lib/ciAreas.mjs).
//
//   node scripts/ci-changed-areas.mjs                   # in CI: areas=<json> to GITHUB_OUTPUT
//   node scripts/ci-changed-areas.mjs --base origin/main  # what a pull request from here would run
//
// On a pull request GitHub checks out the merge of the pull request into its
// base, whose first parent is the base: the files between them are the pull
// request's change. Anything else (a push to main, a manual run) runs every
// workflow, and so does a diff that cannot be read: a gap in what is known
// never becomes a check that did not run.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { CI_AREAS, RUN_EVERYTHING, changedAreas, firstReaching } from './lib/ciAreas.mjs';

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : null;
};
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const base = option('--base') || (process.env.GITHUB_EVENT_NAME === 'pull_request' ? 'HEAD^1' : null);
let files = null;
let reason = `${process.env.GITHUB_EVENT_NAME || 'no pull request'}: every workflow runs`;
if (base) {
  try {
    files = git('diff', '--name-only', git('merge-base', base, 'HEAD'), 'HEAD').split('\n').filter(Boolean);
    reason = `${files.length} file(s) changed since ${base}`;
  } catch (error) {
    reason = `could not read the change against ${base} (${String(error.message).split('\n')[0]}): every workflow runs`;
  }
}

const areas = changedAreas(files);
const ciChange = files && firstReaching(files, RUN_EVERYTHING);
const lines = Object.entries(areas).map(([workflow, runs]) => {
  const because = !runs ? 'no file in its area changed'
    : files === null ? 'not a pull request'
      : ciChange ? `CI changed (${ciChange})`
        : firstReaching(files, CI_AREAS[workflow]);
  return `| ${workflow}.yml | ${runs ? 'runs' : 'skipped'} | ${because} |`;
});

console.log(`${reason}.`);
console.log('full-platform-suite.yml runs on every pull request.');
Object.entries(areas).forEach(([workflow, runs]) => console.log(`${runs ? 'run ' : 'skip'} ${workflow}.yml`));

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '### Workflows this run calls',
    '',
    `${reason}. full-platform-suite.yml runs on every pull request.`,
    '',
    '| Workflow | | Why |',
    '| --- | --- | --- |',
    ...lines,
    '',
  ].join('\n'));
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `areas=${JSON.stringify(areas)}\n`);
