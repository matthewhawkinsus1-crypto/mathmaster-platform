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
import test from 'node:test';

import { jobsOf, readWorkflow as read, runsOnPullRequest, stepsOf } from './helpers/ciWorkflows.mjs';

const SERVERS = {
  plain: /npx vite --host 127\.0\.0\.1 --port 5199 --strictPort/,
  teacher: /npx vite --config tests\/browser\/teacherWorkflow\/vite\.config\.mjs/,
  a11yApp: /TEACHER_HARNESS_PORT=(\d+) npx vite --config tests\/browser\/accessibilityAppHarness\.vite\.config\.mjs/,
  stubbed: /npx vite --config tests\/browser\/emulator\/vite\.config\.mjs[^\n]*--port (\d+)/,
  self: null,
};

const DRIVERS = [
  // Two jobs of about seven minutes: one runner took fourteen for them all.
  ['student-runtime-browser-gates.yml', 'pass3-student-screens', 'plain', [
    'submitNotQueued', 'toolDraftSyncSweep', 'matrixLabFeedback', 'day1SystemsJourney', 'day2NonuniqueJourneys',
  ]],
  ['student-runtime-browser-gates.yml', 'pass3-student-screens-2', 'plain', [
    'afterLastMiss', 'assignmentMobile', 'studentHomeToday', 'studentGradesRaise', 'studentResultUpNext',
    'studentWhatChanged', 'gradeCenterMobile', 'stepNotQueued', 'toolOutcomeReach', 'feedbackReasons2',
    'toolChoiceGroups',
  ]],
  ['student-runtime-browser-gates.yml', 'pass3-secure-screens', 'self', ['secureResults', 'secureExamNavigation']],
  ['student-runtime-browser-gates.yml', 'pass3-secure-screens', 'stubbed', ['secureAccessParity']],
  ['student-teacher-journeys.yml', 'pass3-student-journeys', 'teacher', [
    'teacherWorkflow/assignmentChromeJourneys', 'teacherWorkflow/studentNameJourneys',
    'teacherWorkflow/draftSaveNoticeReloadJourneys', 'teacherWorkflow/phoneSaveLineJourneys',
  ]],
  ['student-teacher-journeys.yml', 'pass3-student-journeys', 'a11yApp', ['teacherWorkflow/askMyTeacherJourneys']],
  // NV14: Back and a reload inside Recovery, Corrections and a Test review.
  ['student-teacher-journeys.yml', 'app-urls', 'teacher', ['teacherWorkflow/innerScreenBackJourneys']],
  ['student-pass3-emulator-journeys.yml', 'pass3-test-cycle-rich-tools', 'self', ['testCycleRichToolQa']],
  // CI16: a whole Test Cycle, ran by hand until it was run twice in a row green.
  ['student-pass3-emulator-journeys.yml', 'pass3-test-cycle-lifecycle', 'self', ['testCycleLifecycleQa']],
  ['student-pass3-emulator-journeys.yml', 'pass3-live-challenge-shell', 'self', ['liveChallengeShellQa']],
  // CI06: whole Graph Feature Rush games, ran by hand until it was green twice in a row.
  ['student-pass3-emulator-journeys.yml', 'pass3-graph-feature-rush', 'self', ['graphFeatureRushGame']],
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
      // Every step after the first runs whatever the step before it did, and
      // stops when the run is cancelled (ciWorkflow.test.mjs says why).
      if (steps.slice(0, index).some((earlier) => /run: node tests\/browser\//.test(earlier))) {
        assert.match(step, /if: \$\{\{ !cancelled\(\) \}\}/, `${driver} runs even when an earlier driver fails`);
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
  const gates = 'student-runtime-browser-gates.yml';
  ['submitNotQueued', 'toolDraftSyncSweep', 'toolOpenAudit', 'matrixLabFeedback', 'algebra2MatricesLesson',
    'afterLastMiss', 'day1Systems', 'day2Nonunique', 'assignmentMobile', 'studentHomeToday', 'studentGradesRaise',
    'studentResultUpNext', 'studentWhatChanged', 'gradeCenterMobile', 'secureResults', 'secureExamNavigation',
    'secureAccessParity', 'stepNotQueued', 'toolOutcomeReach', 'feedbackReasons2', 'toolChoiceGroups'].forEach((driver) => {
    for (const file of [`tests/browser/${driver}.mjs`, `tests/browser/${driver}.html`]) {
      assert.ok(runsOnPullRequest(gates, file), `a change to ${file} runs the gates`);
    }
  });
  // toolChoiceGroups (W7-2) opens the keyboard sweep's page.
  assert.ok(runsOnPullRequest(gates, 'tests/browser/keyboardSweep.html'));
  const journeys = 'student-teacher-journeys.yml';
  ['tests/browser/teacherWorkflow/askMyTeacherJourneys.mjs', 'tests/browser/teacherWorkflow/fixtures/school.js',
    'tests/browser/accessibilityAppHarness.vite.config.mjs', 'tests/browser/accessibilityFakeFirestore.js'].forEach((file) => {
    assert.ok(runsOnPullRequest(journeys, file), `a change to ${file} runs the journeys`);
  });
  const emulator = 'student-pass3-emulator-journeys.yml';
  ['functions/lib/anything.js', 'src/QuestionEngine.jsx', 'tests/browser/emulator/vite.bridge.config.mjs',
    'tests/browser/support/anything.mjs', 'tests/browser/testCycleRichToolQa.mjs', 'tests/browser/liveChallengeShellQa.mjs',
    'tests/browser/testCycleLifecycleQa.mjs', 'tests/browser/testCycleLifecycleQa.html', 'tests/fixtures/testCycleCertificationFixture.mjs',
    'tests/browser/graphFeatureRushGame.mjs', 'src/components/liveChallenge/GraphFeatureRushGraph.jsx',
    'tests/fixtures/secureRichToolAnswers.mjs'].forEach((file) => {
    assert.ok(runsOnPullRequest(emulator, file), `a change to ${file} runs the emulator journeys`);
  });
});

// The two long emulator drivers have a workflow of their own (wave 7 review,
// S3): only a change that can reach them runs them on a pull request, and they
// run nightly and on demand. The gates no longer run on every functions/
// change: only on the server files secureAccessParity grades with.
test('the emulator journeys run on their own area, nightly and on demand; the gates skip functions-only changes', () => {
  const emulator = read('student-pass3-emulator-journeys.yml');
  assert.match(emulator, /^ {2}schedule:\n {4}- cron: "[^"]+"$/m);
  assert.match(emulator, /^ {2}workflow_dispatch:$/m);
  assert.doesNotMatch(emulator, /\$\{\{\s*secrets\./, 'no secrets');
  const gates = 'student-runtime-browser-gates.yml';
  assert.equal(runsOnPullRequest(gates, 'functions/lib/classroomSync.js'), false, 'a functions-only change does not run the gates');
  ['mathPath', 'pathContentCompiler', 'pathFirestoreShape', 'secureItems', 'secureItemStorage'].forEach((name) => {
    assert.ok(runsOnPullRequest(gates, `functions/lib/${name}.js`), `${name}.js runs the gates (secureAccessParity)`);
  });
  assert.doesNotMatch(read(gates), /pass3-(test-cycle-rich-tools|test-cycle-lifecycle|live-challenge-shell|graph-feature-rush):/, 'the long jobs left the gates');
});

// The emulator journeys' area (scripts/lib/ciAreas.mjs) is all of src/ minus the
// directories neither driver loads (wave 7 re-review, F1: a hand-made list
// missed 313 loaded files). scripts/check-emulator-journey-paths.mjs rebuilds
// the drivers' import graphs with Vite and checks every file is reached; it is
// slow, so it runs by hand. This pins the shape and the matching rule it
// relies on.
test('the emulator journeys watch src/** with exclusions after it, and what the drivers load in node', async () => {
  const { emulatorJourneyPaths, reachedBy } = await import('../../scripts/check-emulator-journey-paths.mjs');
  const paths = emulatorJourneyPaths();
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
