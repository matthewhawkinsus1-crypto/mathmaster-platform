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
//   vite    the driver starts the plain dev server itself, and nothing else:
//           no emulator, no bridge, no callables (systemsRushScreens)
//
// A step that only runs on a schedule counts only where it is meant to.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { jobsOf, readWorkflow as read, runsOnPullRequest, stepsOf } from './helpers/ciWorkflows.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const SERVERS = {
  plain: /npx vite --host 127\.0\.0\.1 --port 5199 --strictPort/,
  teacher: /npx vite --config tests\/browser\/teacherWorkflow\/vite\.config\.mjs/,
  a11yApp: /TEACHER_HARNESS_PORT=(\d+) npx vite --config tests\/browser\/accessibilityAppHarness\.vite\.config\.mjs/,
  stubbed: /npx vite --config tests\/browser\/emulator\/vite\.config\.mjs[^\n]*--port (\d+)/,
  self: null,
  vite: null,
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
    // #386 R12: the first operand on a fresh Step Algebra stage is kept.
    // #386 R5: Enter in a composed question's step never submits it.
    'stepAlgebraFirstOperand', 'workflowStepEnter',
    // My Math Path's weekly panel (the grade so far), a session's end (the next
    // weekly session) and My Progress (the weeks hit). They ran by hand only,
    // and each had failed since 10 to 13 October. What they show is worked out
    // in functions/shared, which this workflow's area reaches.
    'pathProgressTruth', 'pathSessionEnd', 'myMathPathProgress',
  ]],
  ['student-runtime-browser-gates.yml', 'pass3-secure-screens', 'self', ['secureResults', 'secureExamNavigation']],
  // CI10: the M2 T2 lessons' every question, laptop and phone, and their tries.
  ['student-runtime-browser-gates.yml', 'student-runtime-2', 'plain', ['algebra1Module2Topic2']],
  // WCAG 1.4.13: the plane's hover readout and the wheels' detail close on Escape.
  ['student-runtime-browser-gates.yml', 'student-runtime-3', 'plain', ['planeReadoutEscape', 'wheelEscape']],
  // Ran by hand only, and had gone stale: Graphing 2's plane stays put while
  // points are placed (it jumped 18px), and a point is dragged from its dot.
  ['student-runtime-browser-gates.yml', 'student-runtime-3', 'plain', ['plotInteraction']],
  // Focus that leaves a math box inside MathLive's 60 ms hand-over stays where
  // it went (math-box-focus): a Tab, a held Tab, the page's moves, a blur.
  ['student-runtime-browser-gates.yml', 'student-runtime-3', 'plain', ['mathBoxFocus']],
  // FB10: after a miss, the hint opens under it and Check stays in view.
  ['student-teacher-journeys.yml', 'student', 'plain', ['feedbackTeachesHintPlace']],
  ['student-runtime-browser-gates.yml', 'pass3-secure-screens', 'stubbed', ['secureAccessParity']],
  // The secure exam's reference sheet and graphing calculator stay in the
  // test's Tab round, in the real app (student-a11y-2).
  ['student-runtime-browser-gates.yml', 'pass3-secure-screens', 'a11yApp', ['secureExamToolFocus']],
  ['student-teacher-journeys.yml', 'pass3-student-journeys', 'teacher', [
    'teacherWorkflow/assignmentChromeJourneys', 'teacherWorkflow/studentNameJourneys',
    'teacherWorkflow/draftSaveNoticeReloadJourneys', 'teacherWorkflow/phoneSaveLineJourneys',
    // LC23: the Practice Passes switch in the real Review, desktop and phone.
    'teacherWorkflow/practicePassSwitchJourneys',
    // The matrices lesson on a phone in the real App (PH10, PH03, P-4), run by hand only until student-keyboard-ci.
    'teacherWorkflow/matrixLabPhoneJourneys',
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
  // Whole Graph the Line games, with its phone pass (the bar and grid held still);
  // ran by hand until it passed three times in a row in two Chromiums.
  ['student-pass3-emulator-journeys.yml', 'pass3-graph-the-line', 'self', ['lineGraphGame']],
  // S5 (#547): Systems of Equations Rush's round screen on a phone and a laptop,
  // beside the whole Graph Feature Rush games; ran by hand until it passed
  // twice in a row in Playwright's headless Chromium.
  ['student-pass3-emulator-journeys.yml', 'pass3-systems-rush-screens', 'vite', ['systemsRushScreens']],
  // S14 (#548): radical equations solved through Step Algebra's controls and
  // graded and replayed by the server's code, in shards (below); ran by hand
  // until it passed twice in a row in Playwright's headless Chromium.
  ['student-runtime-browser-gates.yml', 'radical-step-algebra', 'plain', ['algebra2RadicalStepAlgebra']],
  // S14 (#548): a radical solve in the real App, graded by the harness's
  // server (the shared ingestion) as the browser graded it.
  ['student-teacher-journeys.yml', 'radical-server-grading', 'teacher', ['teacherWorkflow/radicalServerGradingJourneys']],
  // #386 R12: the operand typed on a fresh Step Algebra stage outlives the
  // server's copy of the drafts arriving, in the real App.
  ['student-teacher-journeys.yml', 'step-algebra-operand', 'teacher', ['teacherWorkflow/stepAlgebraOperandDraftJourneys']],
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
      // (firebase-admin) live only in functions/. A driver that starts only
      // Vite loads no callable, and is given no server: it starts its own.
      if (workflow === 'student-pass3-emulator-journeys.yml' && server === 'self') {
        assert.ok(steps.slice(0, index).some((earlier) => /run: npm --prefix functions ci\s*$/m.test(earlier)), `${job} installs functions/ before ${driver}`);
      }
      if (server === 'vite') assert.doesNotMatch(step, /AUDIT_ORIGIN/, `${driver} starts its own dev server: no origin is handed to it`);
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

// S14: one browser took 17 minutes for every radical journey, so
// radical-step-algebra splits them over shards, one `ONLY=` list each. Every
// journey the driver has runs in exactly one shard (a journey in none is
// coverage nobody sees go; one in two is time spent twice), and the driver
// refuses a name that is no journey before it starts a browser, so a list
// cannot quietly run less than it says.
test('every radical Step Algebra journey runs in exactly one shard of radical-step-algebra', () => {
  const job = jobsOf(read('student-runtime-browser-gates.yml'))['radical-step-algebra'];
  assert.ok(job, 'student-runtime-browser-gates.yml has a radical-step-algebra job');
  const step = stepsOf(job).find((entry) => /run: node tests\/browser\/algebra2RadicalStepAlgebra\.mjs\s*$/m.test(entry));
  assert.match(step, /^ +ONLY: \$\{\{ matrix\.shard\.only \}\}$/m, 'each shard runs its own list');
  const shards = [...job.matchAll(/^ {10}- \{ name: ([\w-]+), only: "([^"]*)" \}\s*$/gm)].map(([, name, only]) => ({ name, journeys: only.split(',') }));
  assert.ok(shards.length >= 2, `${shards.length} shard(s)`);
  // The driver's journeys, as it lists them when it refuses a name.
  const artifacts = mkdtempSync(path.join(os.tmpdir(), 'radical-journeys-'));
  try {
    const refusal = spawnSync(process.execPath, [path.join(repo, 'tests/browser/algebra2RadicalStepAlgebra.mjs')], {
      encoding: 'utf8',
      timeout: 60_000,
      // No browser is wanted, and none must be reached: a module that does not exist.
      env: { PATH: process.env.PATH, ONLY: 'examples,no-such-journey', PLAYWRIGHT_MODULE: '/nonexistent/playwright.mjs', ARTIFACTS_DIR: artifacts },
    });
    assert.equal(refusal.status, 2, `${refusal.stderr}`.slice(0, 400));
    assert.match(refusal.stderr, /No journey called no-such-journey\./);
    const journeys = (refusal.stderr.match(/The journeys are: ([^.]+)\./) || [])[1]?.split(', ') || [];
    assert.ok(journeys.length >= 5, `the driver lists its journeys (${journeys.join(', ')})`);
    const ran = {};
    shards.forEach(({ journeys: list }) => list.forEach((name) => { ran[name] = (ran[name] || 0) + 1; }));
    assert.deepEqual(Object.keys(ran).sort(), [...journeys].sort(), 'the shards run the driver\'s journeys and no others');
    journeys.forEach((name) => assert.equal(ran[name], 1, `${name} runs in exactly one shard`));
  } finally {
    rmSync(artifacts, { recursive: true, force: true });
  }
});

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
    'secureAccessParity', 'stepNotQueued', 'toolOutcomeReach', 'feedbackReasons2', 'toolChoiceGroups', 'mathBoxFocus',
    'stepAlgebraFirstOperand', 'workflowStepEnter', 'pathProgressTruth', 'pathSessionEnd', 'myMathPathProgress'].forEach((driver) => {
    for (const file of [`tests/browser/${driver}.mjs`, `tests/browser/${driver}.html`]) {
      assert.ok(runsOnPullRequest(gates, file), `a change to ${file} runs the gates`);
    }
  });
  // The My Math Path pages, and the shared rules that work out what they show:
  // the grade so far and its label, which sessions count toward a week, the
  // weeks hit, and the session's review.
  ['tests/browser/pathProgressTruthMain.jsx', 'tests/browser/pathSessionEndMain.jsx', 'tests/browser/myMathPathProgressMain.jsx',
    'functions/shared/weeklyPathGrade.mjs', 'functions/shared/weeklyPathCompletion.mjs', 'functions/shared/weeklyPathHistory.mjs',
    'functions/shared/pathSessionRecap.mjs'].forEach((file) => {
    assert.ok(runsOnPullRequest(gates, file), `a change to ${file} runs the gates`);
  });
  // toolChoiceGroups (W7-2) opens the keyboard sweep's page.
  assert.ok(runsOnPullRequest(gates, 'tests/browser/keyboardSweep.html'));
  // S14: the radical journeys' driver, page and student emulator, the scenarios
  // they append, the lesson they import, what they solve and grade with, and
  // the dev server's config.
  ['tests/browser/algebra2RadicalStepAlgebra.mjs', 'tests/browser/algebra2RadicalStepAlgebra.html', 'tests/browser/algebra2RadicalStepAlgebraMain.jsx',
    'tests/browser/radicalStepAlgebraDriver.mjs', 'tests/browser/relationWorkspaceDriver.mjs', 'tests/browser/fixtures/radicalStepAlgebraScenarios.json',
    'teacher-import-jsons/algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors_Step_Algebra.json',
    'functions/shared/serverGrading/stepAlgebraRadicalGrading.mjs', 'functions/shared/submissionEnvelope.mjs', 'src/MultiRelationAlgebraCore.jsx',
    'src/platform/contract/radicalEquationIntent.js', 'vite.config.js'].forEach((file) => {
    assert.ok(runsOnPullRequest(gates, file), `a change to ${file} runs the gates`);
  });
  // secureExamToolFocus opens the app harness's practice test (no page of its own).
  ['tests/browser/secureExamToolFocus.mjs', 'tests/browser/accessibilityAppHarness.vite.config.mjs',
    'tests/browser/teacherWorkflow/innerScreensFixture.js', 'tests/browser/teacherWorkflow/fakeSecureExamService.js'].forEach((file) => {
    assert.ok(runsOnPullRequest(gates, file), `a change to ${file} runs the gates`);
  });
  const journeys = 'student-teacher-journeys.yml';
  // The matrices lesson on a phone, and the helper it reads the Work View opener's cover with.
  ['tests/browser/teacherWorkflow/askMyTeacherJourneys.mjs', 'tests/browser/teacherWorkflow/fixtures/school.js',
    'tests/browser/accessibilityAppHarness.vite.config.mjs', 'tests/browser/teacherWorkflow/fakeFirestore.js',
    'tests/browser/teacherWorkflow/matrixLabPhoneJourneys.mjs', 'tests/browser/support/openerCover.mjs',
    'src/components/common/MatrixGrid.jsx',
    // S14: the radical server-grading journeys, the harness server and lesson
    // they run on, the student emulator they solve with, the lesson itself, and
    // the ingestion and grader the server runs.
    'tests/browser/teacherWorkflow/radicalServerGradingJourneys.mjs', 'tests/browser/teacherWorkflow/fakeServer.js',
    'tests/browser/teacherWorkflow/lessonFixtures.js', 'tests/browser/radicalStepAlgebraDriver.mjs', 'tests/browser/relationWorkspaceDriver.mjs',
    'teacher-import-jsons/algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors_Step_Algebra.json',
    'functions/shared/submissionIngestion.mjs', 'functions/shared/serverGrading/stepAlgebraRadicalGrading.mjs'].forEach((file) => {
    assert.ok(runsOnPullRequest(journeys, file), `a change to ${file} runs the journeys`);
  });
  const emulator = 'student-pass3-emulator-journeys.yml';
  ['functions/lib/anything.js', 'src/QuestionEngine.jsx', 'tests/browser/emulator/vite.bridge.config.mjs',
    'tests/browser/support/anything.mjs', 'tests/browser/testCycleRichToolQa.mjs', 'tests/browser/liveChallengeShellQa.mjs',
    'tests/browser/testCycleLifecycleQa.mjs', 'tests/browser/testCycleLifecycleQa.html', 'tests/fixtures/testCycleCertificationFixture.mjs',
    'tests/browser/graphFeatureRushGame.mjs', 'src/components/liveChallenge/GraphFeatureRushGraph.jsx',
    'tests/browser/lineGraphGame.mjs', 'src/components/liveChallenge/LineGraphRound.jsx', 'tests/browser/support/roundBarFit.mjs',
    'tests/fixtures/secureRichToolAnswers.mjs',
    // S5: the Systems Rush round screen's driver and page, what it draws and
    // grades with, and the plain dev server's config it is served by.
    'tests/browser/systemsRushScreens.mjs', 'tests/browser/systemsRushScreens.html', 'tests/browser/systemsRushScreensMain.jsx',
    'src/components/liveChallenge/GraphFeatureRushRound.jsx', 'src/platform/liveChallenge/rushGraphModel.js',
    'functions/shared/systemsGenerator.mjs', 'functions/shared/systemsRush.mjs', 'src/theme/forcedColors.css', 'vite.config.js'].forEach((file) => {
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
  assert.doesNotMatch(read(gates), /pass3-(test-cycle-rich-tools|test-cycle-lifecycle|live-challenge-shell|graph-feature-rush|graph-the-line):/, 'the long jobs left the gates');
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
    'tests/fixtures/secureRichToolAnswers.mjs', 'functions/platformEntry.js', 'tests/browser/emulator/vite.bridge.config.mjs',
    // Loaded in node by the Live Challenge drivers, before the server.
    'tests/integration/support/emulatorTransactions.mjs',
    // Loaded in node by liveChallengeShellQa, to work a banked line's equation.
    'tests/browser/equationWorkspacePlanner.mjs']
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
