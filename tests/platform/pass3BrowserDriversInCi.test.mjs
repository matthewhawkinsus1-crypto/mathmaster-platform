// Student pass 3's browser drivers run in CI (wave 7, CI hygiene).
//
// Twenty of them ran by hand only: a driver no workflow runs finds nothing,
// and two of them (toolDraftSyncSweep, studentHomeToday) had been red on main
// without anyone seeing it. This pins each one to a job, and that job to the
// server the driver needs:
//
//   plain   `npx vite --host 127.0.0.1 --port 5199` (AUDIT_ORIGIN)
//   teacher the teacher-workflow harness on 5188 (TEACHER_HARNESS_ORIGIN)
//   a11yApp the accessibility App harness, which askMyTeacherJourneys needs
//   stubbed the emulator Vite config's stubbed services (secureAccessParity)
//   self    the driver starts its own servers (emulator, bridge, Vite)
//
// A step that only runs on a schedule counts only where it is meant to.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');

/** The workflow's jobs, each as its own text (two-space keys under `jobs:`). */
const jobsOf = (text) => {
  const body = text.slice(text.indexOf('\njobs:\n'));
  const jobs = {};
  let name = null;
  body.split('\n').forEach((line) => {
    const key = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (key) { name = key[1]; jobs[name] = ''; return; }
    if (name) jobs[name] += `${line}\n`;
  });
  return jobs;
};

/** The steps of a job, split on `- name:` / `- run:` / `- uses:` entries. */
const stepsOf = (jobText) => jobText.split(/\n(?= {6}- )/).filter((step) => /^ {6}- /.test(step.trim() ? step.replace(/^\n/, '') : ''));

const SERVERS = {
  plain: /npx vite --host 127\.0\.0\.1 --port 5199 --strictPort/,
  teacher: /npx vite --config tests\/browser\/teacherWorkflow\/vite\.config\.mjs/,
  a11yApp: /TEACHER_HARNESS_PORT=(\d+) npx vite --config tests\/browser\/accessibilityAppHarness\.vite\.config\.mjs/,
  stubbed: /npx vite --config tests\/browser\/emulator\/vite\.config\.mjs[^\n]*--port (\d+)/,
  self: null,
};

const DRIVERS = [
  ['student-runtime-browser-gates.yml', 'pass3-student-screens', 'plain', [
    'submitNotQueued', 'toolDraftSyncSweep', 'matrixLabFeedback', 'afterLastMiss', 'day1SystemsJourney',
    'day2NonuniqueJourneys', 'assignmentMobile', 'studentHomeToday', 'studentGradesRaise', 'studentResultUpNext',
    'studentWhatChanged', 'gradeCenterMobile',
  ]],
  ['student-runtime-browser-gates.yml', 'pass3-secure-screens', 'self', ['secureResults', 'secureExamNavigation']],
  ['student-runtime-browser-gates.yml', 'pass3-secure-screens', 'stubbed', ['secureAccessParity']],
  ['student-teacher-journeys.yml', 'pass3-student-journeys', 'teacher', [
    'teacherWorkflow/assignmentChromeJourneys', 'teacherWorkflow/studentNameJourneys',
  ]],
  ['student-teacher-journeys.yml', 'pass3-student-journeys', 'a11yApp', ['teacherWorkflow/askMyTeacherJourneys']],
  ['student-runtime-browser-gates.yml', 'pass3-test-cycle-rich-tools', 'self', ['testCycleRichToolQa']],
  ['student-runtime-browser-gates.yml', 'pass3-live-challenge-shell', 'self', ['liveChallengeShellQa']],
];

for (const [workflow, job, server, drivers] of DRIVERS) {
  test(`${workflow} ${job} runs ${drivers.join(', ')} (${server})`, () => {
    const text = read(workflow);
    assert.match(text, /^permissions:\n {2}contents: read$/m, `${workflow} reads only`);
    assert.doesNotMatch(text, /contents:\s*write/, `${workflow} holds no write token`);
    const jobText = jobsOf(text)[job];
    assert.ok(jobText, `${workflow} has a ${job} job`);
    assert.match(jobText, /timeout-minutes: \d+/, `${job} has a time limit`);
    const steps = stepsOf(jobText);
    drivers.forEach((driver) => {
      const command = new RegExp(`run: node tests/browser/${driver}\\.mjs\\s*$`, 'm');
      const index = steps.findIndex((step) => command.test(step));
      assert.ok(index >= 0, `${job} runs tests/browser/${driver}.mjs`);
      const step = steps[index];
      // Every step after the first runs whatever the step before it did.
      if (steps.slice(0, index).some((earlier) => /run: node tests\/browser\//.test(earlier))) {
        assert.match(step, /if: always\(\)/, `${driver} runs even when an earlier driver fails`);
      }
      assert.doesNotMatch(step, /github\.event_name == 'schedule'/, `${driver} runs on pull requests, not only at night`);
      const pattern = SERVERS[server];
      if (!pattern) return;
      const start = steps.slice(0, index).find((earlier) => pattern.test(earlier));
      assert.ok(start, `${job} starts the ${server} server before ${driver}`);
      const port = start.match(pattern)[1];
      if (server === 'plain') assert.match(step, /AUDIT_ORIGIN: "http:\/\/127\.0\.0\.1:5199"/, `${driver} is pointed at 5199`);
      if (server === 'stubbed') assert.match(step, new RegExp(`AUDIT_ORIGIN: "http://127\\.0\\.0\\.1:${port}"`), `${driver} is pointed at the stubbed server`);
      if (server === 'a11yApp') assert.match(step, new RegExp(`TEACHER_HARNESS_ORIGIN: "http://127\\.0\\.0\\.1:${port}"`), `${driver} is pointed at the accessibility App harness`);
    });
  });
}

test('the lobby invite journey enters the game on the accessibility App harness', () => {
  const steps = stepsOf(jobsOf(read('student-teacher-journeys.yml'))['pass3-student-journeys']);
  const harness = steps.findIndex((step) => SERVERS.a11yApp.test(step));
  const chrome = steps.findIndex((step) => /run: node tests\/browser\/teacherWorkflow\/assignmentChromeJourneys\.mjs/.test(step));
  assert.ok(harness >= 0 && harness < chrome, 'the accessibility App harness starts before the assignment chrome journeys');
  const port = steps[harness].match(SERVERS.a11yApp)[1];
  assert.match(steps[chrome], new RegExp(`LIVE_CHALLENGE_HARNESS_ORIGIN: "http://127\\.0\\.0\\.1:${port}"`));
});

test('a pull request that changes one of these drivers runs its workflow', () => {
  const gates = read('student-runtime-browser-gates.yml');
  ['submitNotQueued', 'toolDraftSyncSweep', 'matrixLabFeedback', 'afterLastMiss', 'day1Systems', 'day2Nonunique',
    'assignmentMobile', 'studentHomeToday', 'studentGradesRaise', 'studentResultUpNext', 'studentWhatChanged',
    'gradeCenterMobile', 'secureResults', 'secureExamNavigation', 'secureAccessParity', 'testCycleRichToolQa',
    'liveChallengeShellQa'].forEach((driver) => {
    assert.match(gates, new RegExp(`- "tests/browser/${driver}\\*"`), `${driver} is in the gates' paths`);
  });
  assert.match(read('student-teacher-journeys.yml'), /- "tests\/browser\/teacherWorkflow\/\*\*"/);
});

// Wave 7's other branches add five drivers. Until each merges, its step skips
// cleanly; once the file is there, the same step runs it, beside the drivers
// that share its server.
const GUARDED = [
  ['student-runtime-browser-gates.yml', 'pass3-student-screens', 'stepNotQueued'],
  ['student-runtime-browser-gates.yml', 'pass3-student-screens', 'toolOutcomeReach'],
  ['student-runtime-browser-gates.yml', 'pass3-student-screens', 'feedbackReasons2'],
  ['student-runtime-browser-gates.yml', 'pass3-student-screens', 'toolChoiceGroups'],
  ['student-teacher-journeys.yml', 'pass3-student-journeys', 'teacherWorkflow/draftSaveNoticeReloadJourneys'],
];
for (const [workflow, job, driver] of GUARDED) {
  test(`${job} runs ${driver} once its branch merges, and skips cleanly before`, () => {
    const steps = stepsOf(jobsOf(read(workflow))[job]);
    const file = `tests/browser/${driver}.mjs`;
    const step = steps.find((candidate) => candidate.includes(`if [ -f ${file} ]; then node ${file}; else echo`));
    assert.ok(step, `${job} has a guarded step for ${file}`);
    assert.match(step, /if: always\(\)/);
    if (job === 'pass3-student-screens') assert.match(step, /AUDIT_ORIGIN: "http:\/\/127\.0\.0\.1:5199"/);
  });
}
