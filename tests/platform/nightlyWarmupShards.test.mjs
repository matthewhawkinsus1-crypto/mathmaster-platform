// THE THROTTLED WARM-UP REOPEN RUN FITS THE TIME IT IS GIVEN (CI11, issue #522).
//
// The nightly's "Student and Teacher Journeys" was cancelled at its 45-minute
// limit on Oct 23 and again on Oct 24: teacher-nightly-warmup ran the ten
// Warm-Up close-and-reopen journeys on a throttled Chromebook in one job, and
// they take about 79 minutes there (every reload costs four; they reload
// fifteen times). A cancelled run is reported, but the slow-Chromebook coverage
// never finished, so the nightly stayed red and the last journeys (the ones
// with the server) were never reached at all.
//
// The fix splits them over jobs, one `ONLY=` list each. What has to stay true,
// whatever the split looks like:
//   - every journey runs, in exactly one job (a journey left out of every list
//     is coverage nobody sees go;
//     one in two lists is time spent twice);
//   - no job is given more work than its own limit allows, by the last
//     measurement (warmupReopenJourneyNames.mjs): putting the shards back into
//     one job is the defect;
//   - the throttled run stays nightly and on demand only (a pull request runs
//     the journeys at normal speed, in teacher-drafts);
//   - a list that names no journey is refused, not run as nothing.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { WARMUP_REOPEN_JOURNEYS, WARMUP_REOPEN_SLOW_MINUTES } from '../browser/teacherWorkflow/warmupReopenJourneyNames.mjs';
import { jobsOf, readWorkflow, stepsOf } from './helpers/ciWorkflows.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DRIVER = 'tests/browser/teacherWorkflow/warmupReopenJourneys.mjs';
// A job may be given this share of its limit, by the last measurement: the
// numbers are one CI runner's, and the nightly's runners vary.
const SHARE_OF_LIMIT = 0.6;

/**
 * Every job that runs the throttled driver, once for each list it is given:
 * { job, journeys, limit, condition }. An `ONLY` that reads the job's matrix is
 * one instance per matrix entry (that is how GitHub runs it); no `ONLY` is all
 * the journeys at once.
 */
const throttledJobs = () => {
  const found = [];
  for (const [job, text] of Object.entries(jobsOf(readWorkflow('student-teacher-journeys.yml')))) {
    for (const step of stepsOf(text)) {
      if (!new RegExp(`run: node ${DRIVER.replaceAll('.', '\\.')}[^\\n]*--slow`).test(step)) continue;
      const only = (step.match(/^ +ONLY: (.+)$/m) || [])[1]?.trim() ?? null;
      const viaMatrix = only?.match(/^\$\{\{ matrix\.\w+\.(\w+) \}\}$/);
      const lists = viaMatrix
        ? [...text.matchAll(new RegExp(`^ {10}- \\{[^}]*\\b${viaMatrix[1]}: "([^"]*)"[^}]*\\}\\s*$`, 'gm'))].map((match) => match[1])
        : [only ?? WARMUP_REOPEN_JOURNEYS.join(',')];
      const limit = Number((text.match(/^ {4}timeout-minutes: (\d+)\s*$/m) || [])[1]);
      const condition = (text.match(/^ {4}if: (.+)$/m) || [])[1] || null;
      lists.forEach((list) => found.push({ job, journeys: list.split(','), limit, condition }));
    }
  }
  return found;
};

test('the throttled run is read from the workflow: more than one job, each with a limit of its own', () => {
  const jobs = throttledJobs();
  assert.ok(jobs.length >= 2, `${jobs.length} throttled job(s)`);
  jobs.forEach(({ job, limit, journeys }) => {
    assert.ok(Number.isFinite(limit) && limit > 0, `${job} has a timeout-minutes`);
    assert.ok(journeys.length > 0 && journeys.every(Boolean), `${job} names its journeys`);
  });
});

test('every Warm-Up reopen journey runs throttled, in exactly one job', () => {
  const ran = {};
  throttledJobs().forEach(({ journeys }) => journeys.forEach((name) => { ran[name] = (ran[name] || 0) + 1; }));
  const named = Object.keys(ran).sort();
  assert.deepEqual(named, [...WARMUP_REOPEN_JOURNEYS].sort(), 'the jobs run the driver\'s journeys and no others');
  WARMUP_REOPEN_JOURNEYS.forEach((name) => assert.equal(ran[name], 1, `${name} runs once`));
});

test('no throttled job is given more work than its own limit allows', () => {
  throttledJobs().forEach(({ job, journeys, limit }) => {
    const minutes = journeys.reduce((sum, name) => sum + WARMUP_REOPEN_SLOW_MINUTES[name], 0);
    assert.ok(minutes <= limit * SHARE_OF_LIMIT,
      `${job} (${journeys.join(', ')}) is about ${minutes.toFixed(1)} minutes of work in a ${limit}-minute limit; at most ${(limit * SHARE_OF_LIMIT).toFixed(0)} are planned`);
  });
  assert.deepEqual(Object.keys(WARMUP_REOPEN_SLOW_MINUTES), [...WARMUP_REOPEN_JOURNEYS], 'every journey has its minutes');
});

test('the throttled run is for the nightly and on demand, never a pull request', () => {
  throttledJobs().forEach(({ job, condition }) => {
    assert.match(condition || '', /github\.event_name == 'schedule'/, `${job} runs on the schedule`);
    assert.match(condition || '', /github\.event_name == 'workflow_dispatch'/, `${job} runs on demand`);
    assert.doesNotMatch(condition || '', /pull_request|push/, `${job} is not run for a pull request`);
  });
});

/* --- the driver's own side: a name that is no journey is refused ---------------- */

const runDriver = (only) => spawnSync(process.execPath, [path.join(repo, DRIVER)], {
  encoding: 'utf8',
  timeout: 30_000,
  // No browser is wanted, and none must be reached: a module that does not exist.
  env: { PATH: process.env.PATH, ONLY: only, PLAYWRIGHT_MODULE: '/nonexistent/playwright.mjs' },
});

test('the driver refuses an ONLY that names no journey, before it touches a browser', () => {
  const run = runDriver('inprogress,corupt');
  assert.equal(run.status, 2, `${run.stderr}`.slice(0, 300));
  assert.match(run.stderr, /ONLY names no journey: corupt\b/);
  WARMUP_REOPEN_JOURNEYS.forEach((name) => assert.ok(run.stderr.includes(name), `the refusal lists ${name}`));
});

test('the driver does not refuse the names it has: it goes on to the browser', () => {
  const run = runDriver(WARMUP_REOPEN_JOURNEYS.join(','));
  // The browser module is missing on purpose, so it stops there — not at the list.
  assert.notEqual(run.status, 2, `${run.stderr}`.slice(0, 300));
  assert.doesNotMatch(run.stderr, /ONLY names no journey/);
});
