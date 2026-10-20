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
import { existsSync, readFileSync } from 'node:fs';
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
  ['student-pass3-emulator-journeys.yml', 'pass3-test-cycle-rich-tools', 'self', ['testCycleRichToolQa']],
  ['student-pass3-emulator-journeys.yml', 'pass3-live-challenge-shell', 'self', ['liveChallengeShellQa']],
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
      // The emulator drivers load the real callables, whose dependencies
      // (firebase-admin) live only in functions/.
      if (workflow === 'student-pass3-emulator-journeys.yml') {
        assert.ok(steps.slice(0, index).some((earlier) => /run: npm --prefix functions ci\s*$/m.test(earlier)), `${job} installs functions/ before ${driver}`);
      }
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

test('a pull request that changes one of these drivers, or a page it opens, runs its workflow', () => {
  const gates = read('student-runtime-browser-gates.yml');
  ['submitNotQueued', 'toolDraftSyncSweep', 'toolOpenAudit', 'matrixLabFeedback', 'algebra2MatricesLesson',
    'afterLastMiss', 'day1Systems', 'day2Nonunique', 'assignmentMobile', 'studentHomeToday', 'studentGradesRaise',
    'studentResultUpNext', 'studentWhatChanged', 'gradeCenterMobile', 'secureResults', 'secureExamNavigation',
    'secureAccessParity', 'stepNotQueued', 'toolOutcomeReach', 'feedbackReasons2', 'toolChoiceGroups'].forEach((driver) => {
    assert.match(gates, new RegExp(`- "tests/browser/${driver}\\*"`), `${driver} is in the gates' paths`);
  });
  // toolChoiceGroups (W7-2) opens the keyboard sweep's page.
  assert.match(gates, /- "tests\/browser\/keyboardSweep\.html"/);
  const journeys = read('student-teacher-journeys.yml');
  assert.match(journeys, /- "tests\/browser\/teacherWorkflow\/\*\*"/);
  assert.match(journeys, /- "tests\/browser\/accessibilityAppHarness\*"/);
  assert.match(journeys, /- "tests\/browser\/accessibilityFakeFirestore\.js"/);
  const emulator = read('student-pass3-emulator-journeys.yml');
  ['functions/\\*\\*', 'src/\\*\\*', 'tests/browser/emulator/\\*\\*', 'tests/browser/support/\\*\\*', 'tests/browser/testCycleRichToolQa\\*',
    'tests/browser/liveChallengeShellQa\\*', 'tests/fixtures/secureRichToolAnswers\\.mjs'].forEach((glob) => {
    assert.match(emulator, new RegExp(`- "${glob}"`), `${glob} is in the emulator journeys' paths`);
  });
});

// The two long emulator drivers have a workflow of their own (wave 7 review,
// S3): only a change that can reach them runs them on a pull request, and they
// run nightly and on demand. The gates no longer run on every functions/
// change: only on the server files secureAccessParity grades with.
test('the emulator journeys run on their own paths, nightly and on demand; the gates skip functions-only changes', () => {
  const emulator = read('student-pass3-emulator-journeys.yml');
  assert.match(emulator, /^ {2}schedule:\n {4}- cron: "[^"]+"$/m);
  assert.match(emulator, /^ {2}workflow_dispatch:$/m);
  assert.doesNotMatch(emulator, /\$\{\{\s*secrets\./, 'no secrets');
  const gates = read('student-runtime-browser-gates.yml');
  assert.doesNotMatch(gates, /- "functions\/\*\*"/);
  ['mathPath', 'pathContentCompiler', 'pathFirestoreShape', 'secureItems', 'secureItemStorage'].forEach((name) => {
    assert.match(gates, new RegExp(`- "functions/lib/${name}\\.js"`), `${name}.js triggers the gates (secureAccessParity)`);
  });
  assert.doesNotMatch(gates, /pass3-(test-cycle-rich-tools|live-challenge-shell):/, 'the long jobs left the gates');
});

// The emulator journeys' paths are all of src/ minus the directories neither
// driver loads (wave 7 re-review, F1: a hand-made list missed 313 loaded
// files). scripts/check-emulator-journey-paths.mjs rebuilds the drivers'
// import graphs with Vite and checks every file is reached; it is slow, so it
// runs by hand. This pins the shape and the matching rule it relies on.
test('the emulator journeys watch src/** with exclusions after it, and what the drivers load in node', async () => {
  const { workflowPaths, reachedBy } = await import('../../scripts/check-emulator-journey-paths.mjs');
  const paths = workflowPaths(read('student-pass3-emulator-journeys.yml'));
  const all = paths.indexOf('src/**');
  assert.ok(all >= 0, 'src/** is watched');
  const exclusions = paths.filter((pattern) => pattern.startsWith('!'));
  assert.ok(exclusions.length >= 20, `${exclusions.length} exclusions`);
  exclusions.forEach((pattern) => {
    assert.ok(paths.indexOf(pattern) > all, `${pattern} comes after src/** (GitHub: the last match wins)`);
    assert.match(pattern, /^!src\/[A-Za-z]+\/[A-Za-z]+\/\*\*$/, `${pattern} excludes a whole directory`);
  });
  assert.equal(paths.filter((pattern) => pattern.startsWith('src/') && pattern !== 'src/**').length, 0, 'no hand-made src list beside src/**');
  // Loaded by both drivers (QuestionEngine, MultiRelationAlgebraCore): never excluded.
  ['src/platform/context/wordProblemLayer.js', 'src/platform/curriculum/inequalityRepresentationPolicy.js',
    'src/platform/rewards/challengeRewardPolicy.js', 'src/MathInput.jsx', 'src/QuestionEngine.jsx',
    'tests/fixtures/secureRichToolAnswers.mjs', 'functions/platformEntry.js', 'tests/browser/emulator/vite.bridge.config.mjs']
    .forEach((file) => assert.ok(reachedBy(file, paths), `${file} runs the journeys`));
  assert.equal(reachedBy('src/platform/gradeTransfer/gradeTransferModel.js', paths), false, 'an excluded directory does not');
  // The matching rule itself: in order, the last match decides.
  assert.equal(reachedBy('src/a/b.js', ['src/**', '!src/a/**']), false);
  assert.equal(reachedBy('src/a/b.js', ['!src/a/**', 'src/**']), true);
  assert.equal(reachedBy('src/c.js', ['src/**', '!src/a/**']), true);
});

test('no workflow here runs on pull_request_target', () => {
  ['student-runtime-browser-gates.yml', 'student-teacher-journeys.yml', 'student-pass3-emulator-journeys.yml'].forEach((name) => {
    assert.doesNotMatch(read(name), /pull_request_target/, name);
  });
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
    // A guard that outlives its file would skip forever if the file were
    // renamed. Once the driver is here: drop the guard and pin it in DRIVERS
    // (the handoff, "Converting a guarded step", says how).
    if (existsSync(new URL(`../../${file}`, import.meta.url))) assert.fail(`${file} is here: drop its guard and pin it in DRIVERS`);
    const step = steps.find((candidate) => candidate.includes(`if [ -f ${file} ]; then node ${file}; else echo`));
    assert.ok(step, `${job} has a guarded step for ${file}`);
    assert.match(step, /if: always\(\)/);
    if (job === 'pass3-student-screens') assert.match(step, /AUDIT_ORIGIN: "http:\/\/127\.0\.0\.1:5199"/);
  });
}
