import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { buildCoverageIndex } from '../../functions/shared/pathCoverage.mjs';
import { PATH_ACTION } from '../../functions/shared/pathSessionRouting.mjs';
import { teksSkillId } from '../../functions/shared/pathSkillGraph.mjs';
import { INSTRUCTIONAL_BAND } from '../../src/platform/profile/studentLearningProfile.js';
import {
  LIFECYCLE,
  PURPOSE,
  foundationBridgeCap,
  resolvePurpose,
  resolveTarget,
  weeklyMixFor,
} from '../../src/platform/path/recommendationV2.js';
import { describeCoursePathPass } from '../../src/platform/path/pathPassPresentation.js';
import { createTeacherPathRuntime } from '../../src/platform/simulation/teacherPathRuntime.js';

const require = createRequire(import.meta.url);
const pathRouting = require('../../functions/lib/pathRouting.js');

const TARGET = 'A.5C';
const PREREQ = 'A.5A';

const profileAt = (stableBand = 3, overrides = {}) => ({
  baseline: { established: true },
  instructionalBand: INSTRUCTIONAL_BAND.ON,
  difficultyProfile: { stableBand },
  dokProfile: {},
  ccmrTransfer: {},
  foundationGapDepth: 0,
  ...overrides,
});

const bankItem = (code, slug, { dok = 2, band = 3, framework = 'course' } = {}) => ({
  id: `journey_${code.replace(/\./g, '_')}_${slug}`,
  active: true,
  alignmentKeys: [`texas:${code}`],
  courseId: 'algebra1',
  familyId: `journey:${code}:${slug}`,
  familyVersion: 1,
  questionType: 'response',
  activityRole: 'practice',
  difficultyBand: band,
  dok,
  taskType: dok >= 3 ? 'errorAnalysis' : 'procedural',
  representation: dok >= 3 ? 'verbal' : 'symbolic',
  prompt: `${code} ${slug}: enter 1.`,
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', expected: '1' }],
  ...(framework === 'course' ? {} : {
    assessmentContext: { framework, examStyle: true, reference: `${framework} journey item` },
  }),
});

const adaptiveBankFor = (code) => [
  bankItem(code, 'd2b2', { dok: 2, band: 2 }),
  bankItem(code, 'd2b3', { dok: 2, band: 3 }),
  bankItem(code, 'd2b4', { dok: 2, band: 4 }),
  bankItem(code, 'd3b3', { dok: 3, band: 3 }),
  bankItem(code, 'd3b4', { dok: 3, band: 4 }),
];

const runtimeFor = (records = adaptiveBankFor(TARGET)) => createTeacherPathRuntime({
  assignments: [],
  pathBankQuestions: records,
  courseId: 'algebra1',
  learner: { id: 'teacherSimulation:journey', gradesByAssignment: {} },
});

const coverageFor = (codes) => {
  const records = codes.flatMap((code) => adaptiveBankFor(code));
  return {
    algebra1: buildCoverageIndex({
      courseId: 'algebra1',
      wheelTeks: codes,
      bankItems: records,
      plans: Object.fromEntries(records.map((item) => [item.id, { issuable: true }])),
    }),
    algebra2: null,
  };
};

const routeSession = (overrides = {}) => ({
  status: 'active',
  sessionKind: 'practice',
  requiredQuestions: 6,
  target: { alignmentKey: `texas:${TARGET}` },
  currentSkillCode: TARGET,
  summary: { completedQuestions: 1, correctQuestions: 0, independentSuccesses: 0 },
  evidenceBySkill: {},
  excursion: null,
  diagnosing: null,
  route: [],
  ...overrides,
});

const masteryProfiles = (target = 30, prereq = 25) => ({
  [teksSkillId(TARGET)]: { masteryEstimate: target },
  [teksSkillId(PREREQ)]: { masteryEstimate: prereq },
});

const advanceRoute = (session, routed) => ({
  ...session,
  currentSkillCode: routed.currentSkillCode,
  excursion: routed.excursion,
  diagnosing: routed.diagnosing,
  lastDecision: routed.lastDecision,
  evidenceBySkill: routed.evidenceBySkill,
  summary: {
    ...session.summary,
    completedQuestions: Number(session.summary.completedQuestions || 0) + 1,
  },
  route: [...(session.route || []), routed.routeEntry].filter(Boolean),
});

const routeAnswer = (session, isCorrect, profiles, coverage = coverageFor([TARGET, PREREQ])) =>
  pathRouting.routeAfterFinalizedQuestion({
    session,
    skillCode: session.currentSkillCode,
    isCorrect,
    profiles,
    coverageIndexes: coverage,
    retentionConcern: false,
  });

test('SCENARIO 1 fresh regular student gets ordinary course work at the core target', async () => {
  const mix = weeklyMixFor({ band: INSTRUCTIONAL_BAND.ON, honors: false, sessions: 4 });
  assert.equal(mix.length, 4);
  assert.ok(mix.includes(PURPOSE.CURRENT_LEARNING));
  assert.equal(mix.includes(PURPOSE.EXTENSION), false);

  const runtime = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({
    targetAlignmentKey: TARGET,
    requiredQuestions: 2,
  });
  assert.equal(session.coursePracticeIntent, null);
  assert.equal(session.intendedDok, 2);
  assert.equal(session.intendedDifficultyBand, 3);

  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  assert.equal(questionInstance.teksCode, TARGET);
  assert.equal(questionInstance.selectedDok, 2);
  assert.equal(questionInstance.selectedBand, 3);
});

test('SCENARIO 2 below-level learner gets a bounded bridge and can return to the course target', async () => {
  const mix = weeklyMixFor({ band: INSTRUCTIONAL_BAND.BELOW, honors: false, sessions: 4 });
  assert.ok(mix.includes(PURPOSE.CURRENT_LEARNING));
  assert.ok(mix.includes(PURPOSE.FOUNDATION_BRIDGE));
  assert.ok(mix.filter((purpose) => purpose === PURPOSE.FOUNDATION_BRIDGE).length <= foundationBridgeCap(4));

  let session = routeSession();
  const weak = masteryProfiles();

  for (let i = 0; i < 4 && session.currentSkillCode === TARGET && !session.diagnosing; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    session = advanceRoute(session, await routeAnswer(session, false, weak));
  }

  assert.ok(
    session.diagnosing || session.currentSkillCode !== TARGET,
    'repeated misses must leave ordinary same-level repetition',
  );

  const strongPrereq = masteryProfiles(35, 90);
  let returned = session.currentSkillCode === TARGET && !session.excursion;
  for (let i = 0; i < 7 && !returned; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    session = advanceRoute(session, await routeAnswer(session, true, strongPrereq));
    returned = session.currentSkillCode === TARGET && !session.excursion;
  }
  assert.equal(returned, true, 'successful repair must bridge the student back to the original TEKS');
});

test('SCENARIO 3 Honors preserves both course Challenge and CCMR Transfer as distinct journeys', async () => {
  assert.deepEqual(
    weeklyMixFor({ band: INSTRUCTIONAL_BAND.ON, honors: true, sessions: 4 }),
    [PURPOSE.CURRENT_LEARNING, PURPOSE.RETENTION, PURPOSE.EXTENSION, PURPOSE.TRANSFER],
  );

  const courseRuntime = runtimeFor();
  const challenge = await courseRuntime.startOrResumePathSession({
    targetAlignmentKey: TARGET,
    coursePracticeIntent: 'challenge',
    requiredQuestions: 1,
  });
  assert.equal(challenge.session.assessmentFramework, null);
  assert.equal(challenge.session.coursePracticeIntent, 'challenge');
  assert.equal(challenge.session.intendedDok, 3);
  assert.equal(challenge.session.intendedDifficultyBand, 4);
  const challengeQuestion = await courseRuntime.fetchNextSanitizedQuestion({ sessionId: challenge.session.sessionId });
  assert.equal(challengeQuestion.questionInstance.selectedDok, 3);
  assert.equal(challengeQuestion.questionInstance.selectedBand, 4);

  const transferRuntime = runtimeFor([
    ...adaptiveBankFor(TARGET),
    bankItem(TARGET, 'sat-transfer', { dok: 2, band: 3, framework: 'digitalSAT' }),
  ]);
  const transfer = await transferRuntime.startOrResumePathSession({
    targetAlignmentKey: TARGET,
    assessmentFramework: 'digitalSAT',
    intendedDok: 2,
    intendedDifficultyBand: 3,
    requiredQuestions: 1,
  });
  assert.equal(transfer.session.assessmentFramework, 'digitalSAT');
  assert.equal(transfer.session.coursePracticeIntent, null);
  const transferQuestion = await transferRuntime.fetchNextSanitizedQuestion({ sessionId: transfer.session.sessionId });
  assert.equal(transferQuestion.questionInstance.teksCode, TARGET);
  assert.equal(transferQuestion.questionInstance.selectedDok, 2);
});

test('SCENARIO 4 above-level regular learner earns course Challenge without needing an Honors label', async () => {
  const mix = weeklyMixFor({ band: INSTRUCTIONAL_BAND.ABOVE, honors: false, sessions: 4 });
  assert.ok(mix.includes(PURPOSE.EXTENSION));

  const target = resolveTarget({
    purpose: PURPOSE.EXTENSION,
    profile: profileAt(3, { instructionalBand: INSTRUCTIONAL_BAND.ABOVE }),
  });
  assert.equal(target.dok, 3);
  assert.equal(target.difficultyBand, 4);
});

test('SCENARIO 5 a CCMR-disabled Honors week stays full and backfills with course work', () => {
  const mix = weeklyMixFor({
    band: INSTRUCTIONAL_BAND.ON,
    honors: true,
    sessions: 4,
    allowTransfer: false,
  });
  assert.equal(mix.length, 4);
  assert.equal(mix.includes(PURPOSE.TRANSFER), false);
  assert.ok(mix.includes(PURPOSE.EXTENSION));
  assert.ok(mix.filter((purpose) => purpose === PURPOSE.CURRENT_LEARNING).length >= 2);
});

test('SCENARIO 6 retention stays retention and never becomes Challenge', async () => {
  assert.equal(
    resolvePurpose({ lifecycle: LIFECYCLE.RETENTION_DUE }),
    PURPOSE.RETENTION,
  );

  const runtime = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({
    targetAlignmentKey: TARGET,
    sessionKind: 'retentionProbe',
    requiredQuestions: 1,
    weeklyPurpose: PURPOSE.RETENTION,
  });
  assert.equal(session.sessionKind, 'retentionProbe');
  assert.equal(session.coursePracticeIntent, null);
  assert.equal(session.assessmentFramework, null);
  assert.notEqual(session.weeklyPurpose, PURPOSE.EXTENSION);
});

test('SCENARIO 7 a Band-4 miss lowers complexity on the same TEKS before prerequisite descent', async () => {
  const target = resolveTarget({
    purpose: PURPOSE.CURRENT_LEARNING,
    profile: profileAt(3),
    recentFailureBand: 4,
  });
  assert.deepEqual(
    { dok: target.dok, difficultyBand: target.difficultyBand },
    { dok: 2, difficultyBand: 3 },
  );
  assert.equal(target.reason, 'retry_same_standard_at_a_manageable_complexity');

  const runtime = runtimeFor();
  const { session } = await runtime.startOrResumePathSession({
    targetAlignmentKey: TARGET,
    intendedDok: target.dok,
    intendedDifficultyBand: target.difficultyBand,
    requiredQuestions: 1,
    weekKey: '2026-08-30',
    weeklySlotKey: 'journey-band4-retry',
    weeklySlot: 1,
    weeklyPurpose: PURPOSE.CURRENT_LEARNING,
  });
  const issued = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  assert.equal(issued.questionInstance.teksCode, TARGET);
  assert.equal(issued.questionInstance.selectedDok, 2);
  assert.equal(issued.questionInstance.selectedBand, 3);
});

test('SCENARIO 8 repeated misses diagnose or repair instead of looping forever on the same question type', async () => {
  let session = routeSession();
  const weak = masteryProfiles(25, 20);
  const actions = [];

  for (let i = 0; i < 4; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const routed = await routeAnswer(session, false, weak);
    actions.push(routed.decision.action);
    session = advanceRoute(session, routed);
    if ([PATH_ACTION.DIAGNOSE, PATH_ACTION.DESCEND].includes(routed.decision.action)) break;
  }

  assert.ok(
    actions.some((action) => [PATH_ACTION.DIAGNOSE, PATH_ACTION.DESCEND].includes(action)),
    'the route must enter diagnosis or bounded repair after repeated misses',
  );
  assert.ok(actions.length <= 4, 'the learner must not be trapped in an unbounded same-skill miss loop');
});

test('SCENARIO 9 free-choice completion visibly progresses Foundation to Deeper practice to Mastery challenge', () => {
  const level1 = describeCoursePathPass({ passesCompleted: 0 }, { mastered: false });
  const level2 = describeCoursePathPass({ passesCompleted: 1 }, { mastered: false });
  const level3 = describeCoursePathPass({ passesCompleted: 2 }, { mastered: false });

  assert.equal(level1.buttonLabel, 'Start Level 1');
  assert.equal(level2.buttonLabel, 'Start Level 2');
  assert.equal(level3.buttonLabel, 'Start Level 3');
  assert.match(level1.levelLabel, /Foundation/);
  assert.match(level2.levelLabel, /Deeper practice/);
  assert.match(level3.levelLabel, /Mastery challenge/);

  const server = readFileSync('functions/index.js', 'utf8');
  assert.match(server, /if \(coursePassLevel >= 2\)[\s\S]{0,500}preferredDifficultyBand = Math\.max\(4/);
  assert.match(server, /if \(coursePassLevel >= 3\)[\s\S]{0,650}preferredDok = Math\.max\(3/);
});

test('SCENARIO 10 weekly assigned sessions contribute evidence but never increment numbered free-choice passes', async () => {
  const runtime = runtimeFor();
  const weekly = await runtime.startOrResumePathSession({
    targetAlignmentKey: TARGET,
    requiredQuestions: 1,
    weekKey: '2026-08-30',
    weeklySlotKey: 'journey-weekly-slot',
    weeklySlot: 2,
    weeklyPurpose: PURPOSE.EXTENSION,
    intendedDok: 3,
    intendedDifficultyBand: 4,
  });
  assert.equal(weekly.session.weeklySlotKey, 'journey-weekly-slot');
  assert.equal(weekly.session.weeklyPurpose, PURPOSE.EXTENSION);
  assert.equal(weekly.session.coursePracticeIntent, null);
  assert.equal(weekly.session.intendedDok, 3);
  assert.equal(weekly.session.intendedDifficultyBand, 4);

  const issued = await runtime.fetchNextSanitizedQuestion({ sessionId: weekly.session.sessionId });
  assert.equal(issued.questionInstance.weeklyPurpose, PURPOSE.EXTENSION);
  assert.equal(issued.questionInstance.selectedDok, 3);
  assert.equal(issued.questionInstance.selectedBand, 4);

  const server = readFileSync('functions/index.js', 'utf8');
  assert.match(
    server,
    /if \(session\.weeklySlotKey\) return;/,
    'weekly completions must be excluded from course-pass counting',
  );
});
