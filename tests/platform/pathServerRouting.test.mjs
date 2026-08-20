import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { teksSkillId } from '../../functions/shared/pathSkillGraph.mjs';
import { PATH_ACTION } from '../../functions/shared/pathSessionRouting.mjs';
import { buildCoverageIndex } from '../../functions/shared/pathCoverage.mjs';

const require = createRequire(import.meta.url);
const pathRouting = require('../../functions/lib/pathRouting.js');

const serverSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

const TARGET = 'A.5C';
const PREREQ = 'A.5A';

// A coverage index in which everything named is launchable. Built the real way,
// through `buildCoverageIndex`, so the test cannot pass against a shape the
// server would not recognise.
const coverageFor = (codes) => ({
  algebra1: buildCoverageIndex({
    courseId: 'algebra1',
    wheelTeks: codes,
    bankItems: codes.flatMap((code) => [1, 2, 3, 4, 5].map((slot) => ({
      id: `${code}-${slot}`,
      active: true,
      alignmentKeys: [`texas:${code}`],
      difficultyBand: slot <= 2 ? 2 : 3,
      responseFields: [{ id: 'answer', expected: String(slot) }],
    }))),
    plans: Object.fromEntries(codes.flatMap((code) => [1, 2, 3, 4, 5].map((slot) => [`${code}-${slot}`, { issuable: true }]))),
  }),
  algebra2: null,
});

const sessionFor = (overrides = {}) => ({
  status: 'active',
  sessionKind: 'practice',
  requiredQuestions: 5,
  target: { alignmentKey: `texas:${TARGET}` },
  currentSkillCode: TARGET,
  summary: { completedQuestions: 1, correctQuestions: 0, independentSuccesses: 0 },
  evidenceBySkill: {},
  excursion: null,
  diagnosing: null,
  route: [],
  ...overrides,
});

// --- The engine actually runs on the server -----------------------------------

test('the live session callable routes rather than always re-issuing the target', () => {
  assert.ok(serverSource.includes('pathRouting.routeAfterFinalizedQuestion'),
    'submitPathResponse must ask the routing engine what happens next');
  assert.ok(serverSource.includes('session.currentSkillCode || targetDisplayCode'),
    'issueNextQuestion must issue from the skill routing chose, not always the target');
  assert.ok(serverSource.includes('array-contains", activeAlignmentKey'),
    'the bank query must follow the active skill');
});

test('evidence is recorded against the skill the question came from', () => {
  assert.ok(serverSource.includes('alignmentKeys: [activeAlignmentKey]'),
    'an excursion question must not be credited to the target skill');
});

test('a diagnostic gets one attempt, not three', () => {
  assert.ok(serverSource.includes('pathRole === "diagnose" ? 1 : 3'),
    'a diagnostic asks whether a prerequisite is the obstacle; three tries measures persistence instead');
});

test('a retention probe is never routed into a repair excursion', () => {
  assert.ok(serverSource.includes('if (session.sessionKind === "retentionProbe")'),
    'a two-question check must not become a surprise unit of remediation');
});

// --- Mastery, from documents plus the current session ---------------------------

test('stored mastery is read from the profile the trigger writes', async () => {
  const mastery = await pathRouting.buildMasteryBySkill({
    profiles: { [PREREQ]: { mastery: { estimate: 82 }, dimensions: { eligibleGradeLevelEvents: 6 } } },
  });
  assert.equal(mastery[teksSkillId(PREREQ)].mastery, 0.82);
  assert.equal(mastery[teksSkillId(PREREQ)].attempts, 6);
});

test('in-session evidence counts, so a repair can be noticed before the trigger catches up', async () => {
  const skillId = teksSkillId(PREREQ);
  const withoutSession = await pathRouting.buildMasteryBySkill({
    profiles: { [PREREQ]: { mastery: { estimate: 20 }, dimensions: { eligibleGradeLevelEvents: 2 } } },
  });
  const withSession = await pathRouting.buildMasteryBySkill({
    profiles: { [PREREQ]: { mastery: { estimate: 20 }, dimensions: { eligibleGradeLevelEvents: 2 } } },
    evidenceBySkill: { [skillId]: { finalized: 4, correct: 4, missed: 0, consecutiveMisses: 0 } },
  });
  assert.ok(withSession[skillId].mastery > withoutSession[skillId].mastery,
    'four correct answers in this session must move the number the engine reasons with');
});

test('a single in-session answer is not treated as evidence of mastery', async () => {
  const skillId = teksSkillId(PREREQ);
  const mastery = await pathRouting.buildMasteryBySkill({
    profiles: {},
    evidenceBySkill: { [skillId]: { finalized: 1, correct: 1, missed: 0, consecutiveMisses: 0 } },
  });
  assert.equal(mastery[skillId], undefined, 'one right answer is not a mastery estimate');
});

// --- The decisions a live session now makes ------------------------------------

test('one miss keeps the student on the skill', async () => {
  const routed = await pathRouting.routeAfterFinalizedQuestion({
    session: sessionFor(),
    skillCode: TARGET,
    isCorrect: false,
    profiles: {},
    coverageIndexes: coverageFor([TARGET, PREREQ]),
  });
  assert.equal(routed.decision.action, PATH_ACTION.SUPPORTED_RETRY);
  assert.equal(routed.currentSkillCode, TARGET);
  assert.equal(routed.excursion, null);
});

test('repeated misses with a weak prerequisite open a repair excursion', async () => {
  const session = sessionFor({
    summary: { completedQuestions: 2, correctQuestions: 0, independentSuccesses: 0 },
    evidenceBySkill: { [teksSkillId(TARGET)]: { finalized: 1, correct: 0, missed: 1, consecutiveMisses: 1 } },
  });
  const routed = await pathRouting.routeAfterFinalizedQuestion({
    session,
    skillCode: TARGET,
    isCorrect: false,
    profiles: {
      [PREREQ]: { mastery: { estimate: 25 }, dimensions: { eligibleGradeLevelEvents: 5 } },
    },
    coverageIndexes: coverageFor([TARGET, PREREQ]),
  });
  assert.equal(routed.decision.action, PATH_ACTION.DESCEND);
  assert.equal(routed.currentSkillCode, PREREQ, 'the next question comes from the prerequisite');
  assert.equal(routed.excursion.originSkillId, teksSkillId(TARGET), 'the way back is written down');
  assert.match(routed.lastDecision.studentMessage, /Solving linear equations/);
  assert.ok(!/texas:/.test(routed.lastDecision.studentMessage), 'the student is not shown engine identifiers');
});

test('a repair that holds bridges back to the original skill', async () => {
  const session = sessionFor({
    currentSkillCode: PREREQ,
    summary: { completedQuestions: 3, correctQuestions: 2, independentSuccesses: 2 },
    excursion: {
      originSkillId: teksSkillId(TARGET),
      targetSkillId: teksSkillId(PREREQ),
      reason: 'prerequisiteGap',
      depth: 1,
      returnThreshold: 0.7,
    },
    evidenceBySkill: { [teksSkillId(PREREQ)]: { finalized: 2, correct: 2, missed: 0, consecutiveMisses: 0 } },
  });
  const routed = await pathRouting.routeAfterFinalizedQuestion({
    session,
    skillCode: PREREQ,
    isCorrect: true,
    profiles: {},
    coverageIndexes: coverageFor([TARGET, PREREQ]),
  });
  assert.equal(routed.decision.action, PATH_ACTION.BRIDGE);
  assert.equal(routed.currentSkillCode, TARGET, 'the bridging question is asked on the skill being returned to');
  assert.equal(routed.excursion, null, 'the excursion is closed');
  assert.match(routed.lastDecision.studentHeadline, /Back to where you were/);
});

test('a student who has mastered the skill is extended rather than drilled', async () => {
  const routed = await pathRouting.routeAfterFinalizedQuestion({
    session: sessionFor(),
    skillCode: TARGET,
    isCorrect: true,
    profiles: { [TARGET]: { mastery: { estimate: 95 }, dimensions: { eligibleGradeLevelEvents: 8 } } },
    coverageIndexes: coverageFor([TARGET, PREREQ]),
  });
  assert.equal(routed.decision.action, PATH_ACTION.ENRICHMENT);
  assert.match(routed.lastDecision.studentMessage, /pushes it further/);
});

test('routing never sends a student to a standard the bank cannot serve', async () => {
  const session = sessionFor({
    summary: { completedQuestions: 2, correctQuestions: 0, independentSuccesses: 0 },
    evidenceBySkill: { [teksSkillId(TARGET)]: { finalized: 1, correct: 0, missed: 1, consecutiveMisses: 1 } },
  });
  const routed = await pathRouting.routeAfterFinalizedQuestion({
    session,
    skillCode: TARGET,
    isCorrect: false,
    profiles: { [PREREQ]: { mastery: { estimate: 25 }, dimensions: { eligibleGradeLevelEvents: 5 } } },
    // Only the target has content: the prerequisite is empty.
    coverageIndexes: coverageFor([TARGET]),
  });
  assert.equal(routed.currentSkillCode, TARGET, 'the session stays where a question can actually be issued');
  assert.equal(routed.status, 'active');
  assert.match(routed.routeEntry.reason, /content_unavailable|prerequisites_intact|nothing_to_route_to/);
});

test('past the descent limit a teacher is involved, not another level of graph', async () => {
  const session = sessionFor({
    currentSkillCode: PREREQ,
    summary: { completedQuestions: 3, correctQuestions: 0, independentSuccesses: 0 },
    excursion: { originSkillId: teksSkillId(TARGET), targetSkillId: teksSkillId(PREREQ), depth: 2, returnThreshold: 0.7 },
    evidenceBySkill: { [teksSkillId(PREREQ)]: { finalized: 1, correct: 0, missed: 1, consecutiveMisses: 1 } },
  });
  const routed = await pathRouting.routeAfterFinalizedQuestion({
    session,
    skillCode: PREREQ,
    isCorrect: false,
    profiles: {},
    coverageIndexes: coverageFor([TARGET, PREREQ]),
  });
  assert.equal(routed.decision.action, PATH_ACTION.TEACHER_SUPPORT);
  assert.equal(routed.status, 'teacherSupportNeeded');
  assert.ok(routed.teacherMessage);
});

test('a passed diagnostic returns the student upward with support', async () => {
  const session = sessionFor({
    currentSkillCode: PREREQ,
    diagnosing: { originSkillId: teksSkillId(TARGET), targetSkillId: teksSkillId(PREREQ) },
    summary: { completedQuestions: 2, correctQuestions: 1, independentSuccesses: 1 },
  });
  const routed = await pathRouting.routeAfterFinalizedQuestion({
    session,
    skillCode: PREREQ,
    isCorrect: true,
    profiles: {},
    coverageIndexes: coverageFor([TARGET, PREREQ]),
  });
  assert.equal(routed.decision.action, PATH_ACTION.RETURN_TO_ORIGIN);
  assert.equal(routed.currentSkillCode, TARGET);
  assert.equal(routed.diagnosing, null);
});

test('the route trace records every move in the student\'s own terms', async () => {
  const routed = await pathRouting.routeAfterFinalizedQuestion({
    session: sessionFor(),
    skillCode: TARGET,
    isCorrect: false,
    profiles: {},
    coverageIndexes: coverageFor([TARGET, PREREQ]),
  });
  assert.equal(routed.routeEntry.at, 'question 2');
  assert.ok(routed.routeEntry.explanation.length > 10);
  assert.equal(routed.routeEntry.wasCorrect, false);
});
