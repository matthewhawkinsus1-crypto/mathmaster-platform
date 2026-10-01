import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACHIEVEMENT_CODES,
  MAX_CHALLENGE_CLASS_POINTS,
  buildAchievementTransactionId,
  buildRewardGrantId,
  calculateStudentChallengeAchievements,
  cleanupStudentLiveChallengeAchievements,
  JOBS_COLLECTION,
  jobStatusFor,
  mergeStagedAwards,
  planLiveChallengeAwards,
  processLiveChallengeClassPoints,
  RETRYABLE_JOB_STATUSES,
  retryPendingLiveChallengeAchievementJobs,
  rosterAuthorizationFromRecords,
  validateRosterAuthorization,
} from '../../functions/shared/liveChallengeClassPoints.mjs';
import { classPointsAuthorizationContext } from '../../functions/shared/classPoints.mjs';
import {
  DEFAULT_LIVE_CHALLENGE_REWARD_POLICY,
  MAX_CLASS_POINTS_PER_MATCH,
  MAX_GRANT_RULES_PER_POLICY,
  MAX_RULES_PER_POLICY,
  RewardPolicyError,
  criterionMet,
  evaluateRewardPolicy,
  normalizeRewardPolicy,
  rewardAwardIdentity,
  storedRewardPolicy,
} from '../../functions/shared/liveChallengeRewardRules.mjs';
import { buildMatchResult } from '../../functions/shared/liveChallengeResults.mjs';

/*
 * GAME SCORE IS NOT A REWARD. Reward rules read the durable match result and
 * decide who earned what; delivery issues each award exactly once under an
 * identity derived from match + student + rule. The achievement cases below
 * are carried over from the Phase 5B suite (functions/test, which no script
 * ran) and now run against the rule engine every award goes through.
 */

const achievements = (player, scheduledRoundCount, secondChanceOf = {}) => calculateStudentChallengeAchievements({ player, scheduledRoundCount, secondChanceOf });
const codes = (list) => list.map((entry) => entry.achievementCode);
const receipt = (roundIndex, isCorrect, extra = {}) => ({ roundIndex, isCorrect, serverConfirmed: true, ...extra });

/* ---------- Finisher (+2) ---------- */

test('Finisher: answering at least 80% of the rounds a student could play', () => {
  const finisher = achievements({ joined: true, joinedAtRound: 0, answeredRounds: [0, 1, 2, 3] }, 5);
  assert.deepEqual(finisher.find((entry) => entry.achievementCode === ACHIEVEMENT_CODES.FINISHER), {
    achievementCode: 'challengeFinisher', amount: 2, reasonLabel: 'Live Challenge — Finisher',
  });
  assert.ok(!codes(achievements({ joined: true, joinedAtRound: 4, answeredRounds: [4] }, 5)).includes('challengeFinisher'), 'needs at least 2 available rounds');
  assert.ok(codes(achievements({ joined: true, joinedAtRound: 2, answeredRounds: [2, 3, 4] }, 5)).includes('challengeFinisher'), 'a late join is measured against the rounds left');
  const rounds = (count) => Array.from({ length: count }, (_, index) => index);
  assert.ok(!codes(achievements({ joined: true, joinedAtRound: 0, answeredRounds: rounds(79) }, 100)).includes('challengeFinisher'), '79% is not 80%');
  assert.ok(codes(achievements({ joined: true, joinedAtRound: 0, answeredRounds: rounds(80) }, 100)).includes('challengeFinisher'));
  assert.ok(!codes(achievements({ joined: true, joinedAtRound: 0, answeredRounds: [0, 1, 5] }, 4, { 5: 0 })).includes('challengeFinisher'), 'a replay counts toward neither side');
});

/* ---------- Strong Accuracy (+3) ---------- */

test('Strong Accuracy: at least 80% correct across at least 3 original rounds', () => {
  const strong = achievements({ joined: true, submissionReceipts: { r0: receipt(0, true), r1: receipt(1, true), r2: receipt(2, true), r3: receipt(3, true) } }, 5);
  assert.equal(strong.find((entry) => entry.achievementCode === 'strongAccuracy').amount, 3);
  assert.ok(!codes(achievements({ joined: true, submissionReceipts: { r0: receipt(0, true), r1: receipt(1, true) } }, 5)).includes('strongAccuracy'));
  assert.ok(!codes(achievements({
    joined: true,
    submissionReceipts: { r0: receipt(0, false), r1: receipt(1, true), r2: receipt(2, true), r3: receipt(3, false), r5: receipt(5, true, { secondChance: true }) },
  }, 4, { 5: 0 })).includes('strongAccuracy'), 'a replay does not inflate accuracy');
});

test('Strong Accuracy counts a Solver Race round by its answer, not its milestones', () => {
  // The bug: milestone receipts (no isCorrect) were written before each final
  // answer and read as the round's response, so a student who solved every
  // round correctly was scored 0% accurate.
  const milestone = (roundIndex, depth) => ({ serverConfirmed: true, receiptKind: 'productiveSpeedMilestone', roundIndex, pointsAwarded: 20, sequence: roundIndex * 10 + depth });
  const solver = {
    joined: true,
    submissionReceipts: Object.fromEntries([0, 1, 2].flatMap((round) => [
      [`milestone:${round}:1`, milestone(round, 1)],
      [`milestone:${round}:2`, milestone(round, 2)],
      [`answer-${round}`, receipt(round, true, { receiptKind: 'response', sequence: round * 10 + 5 })],
    ])),
  };
  assert.ok(codes(achievements(solver, 3)).includes('strongAccuracy'));
});

/* ---------- Comeback (+2) ---------- */

test('Comeback: getting right the replay of a round the student missed', () => {
  const comeback = (missedRounds, receipts, secondChanceOf) => codes(achievements({ joined: true, missedRounds, submissionReceipts: receipts }, 5, secondChanceOf)).filter((code) => code === 'comeback');
  assert.deepEqual(comeback([0], { r0: receipt(0, false), r5: receipt(5, true, { secondChance: true }) }, { 5: 0 }), ['comeback']);
  assert.deepEqual(comeback([], { r0: receipt(0, true), r5: receipt(5, true, { secondChance: true }) }, { 5: 0 }), [], 'confirming a round already right is not a comeback');
  assert.deepEqual(comeback([0], { r0: receipt(0, false), r5: receipt(5, false, { secondChance: true }) }, { 5: 0 }), [], 'missing the replay is not a comeback');
  assert.deepEqual(comeback([0, 1], {
    r0: receipt(0, false), r1: receipt(1, false), r5: receipt(5, true, { secondChance: true }), r6: receipt(6, true, { secondChance: true }),
  }, { 5: 0, 6: 1 }), ['comeback'], 'several recoveries are still one Comeback');
});

/* ---------- the policy cap, and what never counts ---------- */

test('every achievement together is +7, and score, speed, streak and rank are ignored', () => {
  const all = achievements({
    joined: true, joinedAtRound: 0, answeredRounds: [0, 1, 2, 3, 4, 5], missedRounds: [0],
    submissionReceipts: { r0: receipt(0, false), r1: receipt(1, true), r2: receipt(2, true), r3: receipt(3, true), r4: receipt(4, true), r5: receipt(5, true, { secondChance: true }) },
  }, 5, { 5: 0 });
  const total = all.reduce((sum, entry) => sum + entry.amount, 0);
  assert.equal(total, 7);
  assert.ok(total <= MAX_CHALLENGE_CLASS_POINTS);
  assert.deepEqual(achievements({ joined: true, score: 999_999, speedBonus: 50_000, streak: 50, rank: 1, answeredRounds: [], submissionReceipts: {} }, 5), []);
  assert.deepEqual(achievements({ joined: false, answeredRounds: [0, 1, 2, 3, 4] }, 5), [], 'a student who never joined earns nothing');
});

test('a cancelled match produces no rewards and touches nothing', async () => {
  const result = await processLiveChallengeClassPoints({}, 'room1', { classId: 'c1' }, [], {}, 'cancelled');
  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'not_finished');
});

/* ---------- deterministic award identity ---------- */

test('an award id is derived from match, student and rule — and never ambiguous', () => {
  const first = buildAchievementTransactionId('room:a', 'student', 'strongAccuracy');
  const second = buildAchievementTransactionId('room', 'a:student', 'strongAccuracy');
  assert.notEqual(first, second);
  assert.match(first, /^lca_[0-9a-f]{32}$/);
  assert.equal(buildAchievementTransactionId('room', 'student', 'comeback'), buildAchievementTransactionId('room', 'student', 'comeback'));
  const identity = rewardAwardIdentity({ sourceId: 'room-1', studentId: 's1', ruleId: 'topFinish' });
  assert.equal(identity, 'liveChallenge\u0000room-1\u0000s1\u0000topFinish');
  assert.match(buildRewardGrantId(identity), /^lcg_[0-9a-f]{40}$/);
  assert.throws(() => rewardAwardIdentity({ sourceId: 'room-1', ruleId: 'x' }), /student/);
});

/* ---------- reward policies ---------- */

const RICH_POLICY = {
  rules: [
    { ruleId: 'challengeFinisher', criterion: { kind: 'participation' }, reward: { kind: 'classPoints', amount: 2 } },
    { ruleId: 'topFinish', criterion: { kind: 'placement', maxRank: 1 }, reward: { kind: 'grant', rewardCode: 'practicePass', expiresInDays: 14 } },
    { ruleId: 'podiumBadge', criterion: { kind: 'placement', maxRank: 3, minRoundsAnswered: 2 }, reward: { kind: 'grant', rewardCode: 'badge', badgeCode: 'podium' } },
  ],
};

test('a reward policy is validated before a room may use it', () => {
  assert.equal(normalizeRewardPolicy(null), DEFAULT_LIVE_CHALLENGE_REWARD_POLICY, 'no policy is the default policy');
  const normalized = normalizeRewardPolicy(RICH_POLICY);
  assert.equal(normalized.rules.length, 3);
  assert.equal(normalized.rules[1].reward.label, 'Practice Pass');
  assert.equal(normalized.rules[2].reward.badgeCode, 'podium');
  const rule = (overrides) => ({ ruleId: 'r1', criterion: { kind: 'comeback' }, reward: { kind: 'classPoints', amount: 1 }, ...overrides });
  const rejects = (rules, pattern) => assert.throws(() => normalizeRewardPolicy({ rules }), (error) => error instanceof RewardPolicyError && pattern.test(error.message));
  rejects(Array.from({ length: MAX_RULES_PER_POLICY + 1 }, (_, index) => rule({ ruleId: `r${index}` })), /at most 8 rules/);
  rejects([rule(), rule()], /appears twice/);
  rejects(Array.from({ length: MAX_GRANT_RULES_PER_POLICY + 1 }, (_, index) => rule({ ruleId: `g${index}`, reward: { kind: 'grant', rewardCode: 'badge' } })), /at most 3 item rewards/);
  rejects([rule({ ruleId: 'a', reward: { kind: 'classPoints', amount: 10 } }), rule({ ruleId: 'b', reward: { kind: 'classPoints', amount: 10 } }), rule({ ruleId: 'c', reward: { kind: 'classPoints', amount: 1 } })], new RegExp(`at most ${MAX_CLASS_POINTS_PER_MATCH} Class Points`));
  rejects([rule({ reward: { kind: 'classPoints', amount: 11 } })], /amount must be a whole number from 1 to 10/);
  rejects([rule({ reward: { kind: 'classPoints' } })], /needs an amount/);
  rejects([rule({ reward: { kind: 'grant', rewardCode: 'classPoints' } })], /cannot be granted|can be granted/);
  rejects([rule({ reward: { kind: 'grant', rewardCode: 'practicePass', expiresInDays: 400 } })], /expiresInDays/);
  rejects([rule({ criterion: { kind: 'vibes' } })], /not a recognized reward criterion/);
  rejects([rule({ criterion: { kind: 'accuracy', minRatio: 1.5 } })], /ratio/);
  rejects([rule({ ruleId: 'has spaces' })], /valid reward rule id/);
  assert.throws(() => normalizeRewardPolicy({ rules: 'all of them' }), RewardPolicyError);
  // A stored policy that no longer validates is treated as absent, never as "reward by a broken rule".
  assert.equal(storedRewardPolicy({ rules: [rule({ reward: { kind: 'classPoints', amount: 99 } })] }), DEFAULT_LIVE_CHALLENGE_REWARD_POLICY);
});

const matchResult = () => buildMatchResult({
  roomId: 'room-77',
  room: { classId: 'class-1', roundCount: 3, currentRound: 2 },
  privateState: { scheduledRoundCount: 3, questionIds: ['q0', 'q1', 'q2'] },
  players: [
    { studentId: 'champ', joined: true, joinedAtRound: 0, score: 3_000, correctCount: 3, roundsAnswered: 3, answeredRounds: [0, 1, 2], submissionReceipts: { a: receipt(0, true), b: receipt(1, true), c: receipt(2, true) } },
    { studentId: 'co-champ', joined: true, joinedAtRound: 0, score: 3_000, correctCount: 3, roundsAnswered: 3, answeredRounds: [0, 1, 2], submissionReceipts: { d: receipt(0, true), e: receipt(1, true), f: receipt(2, true) } },
    { studentId: 'third', joined: true, joinedAtRound: 0, score: 900, correctCount: 1, roundsAnswered: 1, answeredRounds: [0], submissionReceipts: { g: receipt(0, true) } },
    { studentId: 'absent', joined: false },
  ],
  status: 'finished',
});

test('rules read the final standings: tied winners both finish first', () => {
  const awards = evaluateRewardPolicy({ matchResult: matchResult(), policy: RICH_POLICY });
  const by = (ruleId) => awards.filter((award) => award.ruleId === ruleId).map((award) => award.studentId);
  assert.deepEqual(by('topFinish'), ['champ', 'co-champ'], 'a tie for first is two first places');
  assert.deepEqual(by('podiumBadge'), ['champ', 'co-champ'], 'third place answered only one round, below the rule minimum');
  assert.deepEqual(by('challengeFinisher'), ['champ', 'co-champ']);
  assert.ok(!awards.some((award) => award.studentId === 'absent'));
  assert.ok(criterionMet({ kind: 'placement', maxRank: 3, minRoundsAnswered: 1 }, matchResult().standings.find((row) => row.studentId === 'third')));
});

test('the same match always plans the same awards under the same ids', () => {
  const first = planLiveChallengeAwards({ matchResult: matchResult(), policy: RICH_POLICY });
  const again = planLiveChallengeAwards({ matchResult: matchResult(), policy: RICH_POLICY });
  assert.deepEqual(first, again);
  const points = first.find((award) => award.ruleId === 'challengeFinisher' && award.studentId === 'champ');
  assert.equal(points.id, buildAchievementTransactionId('room-77', 'champ', 'challengeFinisher'), 'Class Points keep the historical ledger id');
  assert.equal(points.amount, 2);
  const pass = first.find((award) => award.ruleId === 'topFinish' && award.studentId === 'champ');
  assert.equal(pass.id, buildRewardGrantId(rewardAwardIdentity({ sourceId: 'room-77', studentId: 'champ', ruleId: 'topFinish' })));
  assert.equal(pass.rewardKind, 'grant');
  assert.equal(pass.rewardCode, 'practicePass');
  assert.equal(pass.expiresInDays, 14);
  assert.equal(new Set(first.map((award) => award.id)).size, first.length, 'every award has its own id');
  const elsewhere = planLiveChallengeAwards({ matchResult: { ...matchResult(), roomId: 'room-78' }, policy: RICH_POLICY });
  assert.ok(elsewhere.every((award) => !first.some((prior) => prior.id === award.id)), 'another match is another set of awards');
});

test('the default policy is exactly the original achievements', () => {
  const result = matchResult();
  const fromPolicy = evaluateRewardPolicy({ matchResult: result });
  for (const standing of result.standings.filter((row) => row.joined)) {
    const policyCodes = fromPolicy.filter((award) => award.studentId === standing.studentId).map((award) => award.ruleId).sort();
    assert.ok(policyCodes.every((code) => Object.values(ACHIEVEMENT_CODES).includes(code)));
  }
  assert.deepEqual(fromPolicy.filter((award) => award.studentId === 'champ').map((award) => [award.ruleId, award.reward.amount]), [
    ['challengeFinisher', 2], ['strongAccuracy', 3],
  ]);
});

test('re-staging merges: a delivered award stays delivered, history is never dropped', () => {
  const planned = planLiveChallengeAwards({ matchResult: matchResult(), policy: RICH_POLICY });
  const delivered = planned.map((award, index) => (index === 0
    ? { ...award, processed: true, outcome: 'awarded', processedAt: '2026-09-01T00:00:00.000Z' }
    : index === 1 ? { ...award, attempts: 3, lastError: 'deadline exceeded' } : award));
  const retired = { id: 'lca_retired', studentId: 'gone', processed: true, outcome: 'skipped', skipReason: 'grade_not_found' };
  const merged = mergeStagedAwards([...delivered, retired], planned);
  assert.equal(merged[0].processed, true, 'staging again cannot reset a delivered award');
  assert.equal(merged[0].outcome, 'awarded');
  assert.equal(merged[0].processedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(merged[1].attempts, 3);
  assert.equal(merged[1].lastError, 'deadline exceeded');
  assert.equal(merged.length, planned.length + 1);
  assert.deepEqual(merged.at(-1), retired, 'an award the plan no longer produces is kept as history');
  assert.deepEqual(mergeStagedAwards(undefined, planned), planned);
});

/* ---------- the retry sweep ---------- */

test('a job whose awards are all processed is finished, even when one failed for good', () => {
  const award = (processed, outcome = null) => ({ id: `award-${processed}-${outcome}`, processed, outcome });
  assert.equal(jobStatusFor([award(true, 'awarded'), award(true, 'skipped'), award(true, 'alreadyAwarded')]), 'completed');
  assert.equal(jobStatusFor([award(true, 'awarded'), award(true, 'failed')]), 'completed_with_failures');
  assert.equal(jobStatusFor([award(true, 'failed'), award(false)]), 'pending');
  assert.equal(jobStatusFor([]), 'completed');
  // Only a job with something left to deliver is retried. A finished job —
  // failures and all — that stayed in the sweep's query would be re-run
  // forever, and twenty of them would take every slot from the jobs behind.
  for (const finished of [[award(true, 'failed')], [award(true, 'awarded'), award(true, 'failed')], [award(true, 'skipped')], []]) {
    assert.equal(RETRYABLE_JOB_STATUSES.includes(jobStatusFor(finished)), false, JSON.stringify(finished));
  }
  assert.equal(RETRYABLE_JOB_STATUSES.includes(jobStatusFor([award(true, 'failed'), award(false)])), true);
  assert.ok(RETRYABLE_JOB_STATUSES.includes('partially_failed'), 'a job the earlier implementation left undelivered is still retried');
});

test('the sweep selects jobs by exactly the retryable statuses', async () => {
  const queries = [];
  const recordingDb = {
    collection: (name) => ({
      where: (...clause) => {
        queries.push([name, ...clause]);
        return { limit: () => ({ get: async () => ({ docs: [], size: 0 }) }) };
      },
    }),
  };
  assert.deepEqual(await retryPendingLiveChallengeAchievementJobs(recordingDb), { scanned: 0, completed: 0, failed: 0 });
  assert.deepEqual(queries, [[JOBS_COLLECTION, 'status', 'in', [...RETRYABLE_JOB_STATUSES]]]);
});

/* ---------- roster authority ---------- */

const fakeDb = (classData, gradeData, { classExists = true, gradeExists = true } = {}) => ({
  collection: (name) => ({
    doc: () => ({
      get: async () => ({
        exists: name === 'classes' ? classExists : gradeExists,
        data: () => (name === 'classes' ? classData : gradeData),
      }),
    }),
  }),
});

test('an award reaches only a student still on the class roster of record', async () => {
  const active = { status: 'active', teacherOfRecord: 't@s.org' };
  const enrolled = { classId: 'c1', assignedTeacherEmail: 't@s.org' };
  assert.deepEqual(await validateRosterAuthorization(fakeDb(active, enrolled), 'c1', 's1'), { valid: true, classRecord: active, gradeData: enrolled });
  assert.equal((await validateRosterAuthorization(fakeDb({ ...active, status: 'archived' }, enrolled), 'c1', 's1')).reason, 'class_archived');
  assert.equal((await validateRosterAuthorization(fakeDb(active, { ...enrolled, assignedTeacherEmail: '' }), 'c1', 's1')).reason, 'teacher_mismatch_or_missing');
  assert.equal((await validateRosterAuthorization(fakeDb(active, { ...enrolled, assignedTeacherEmail: 'other@s.org' }), 'c1', 's1')).reason, 'teacher_mismatch_or_missing');
  assert.equal((await validateRosterAuthorization(fakeDb(active, { ...enrolled, classId: 'c2' }), 'c1', 's1')).reason, 'grade_class_mismatch');
  assert.equal((await validateRosterAuthorization(fakeDb(active, enrolled, { classExists: false }), 'c1', 's1')).reason, 'class_not_found');
  assert.equal((await validateRosterAuthorization(fakeDb(active, null, { gradeExists: false }), 'c1', 's1')).reason, 'grade_not_found');
  assert.equal(rosterAuthorizationFromRecords({ classId: 'c1', classRecord: { status: 'active' }, gradeData: enrolled }).reason, 'missing_teacher_of_record');
  assert.equal(rosterAuthorizationFromRecords({ classId: '' }).reason, 'missing_ids');
  const context = classPointsAuthorizationContext({ classRecord: { classId: 'c1', teacherOfRecord: 'teacher@school.org' }, existingRecord: null });
  assert.equal(context.originTeacherEmail, 'teacher@school.org');
  assert.ok(context.authorizedTeacherEmails.includes('teacher@school.org'));
});

test('removing a student from award jobs commits in batches below the write limit', async () => {
  let batchesCreated = 0;
  let batchesCommitted = 0;
  const docs = Array.from({ length: 460 }, (_, index) => ({
    ref: { id: `doc${index}` },
    data: () => ({ status: 'pending', awards: [{ studentId: 'targetStudent' }, { studentId: 'otherStudent' }] }),
  }));
  const db = {
    collection: () => ({ where: () => ({ get: async () => ({ empty: false, docs }) }) }),
    batch: () => {
      batchesCreated += 1;
      return { update() {}, delete() {}, commit: async () => { batchesCommitted += 1; } };
    },
  };
  const outcome = await cleanupStudentLiveChallengeAchievements(db, 'targetStudent');
  assert.equal(batchesCreated, 2);
  assert.equal(batchesCommitted, 2);
  assert.equal(outcome.jobsUpdated, 460);
});
