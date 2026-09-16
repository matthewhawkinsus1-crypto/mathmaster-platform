import { expect } from 'chai';
import {
  calculateStudentChallengeAchievements,
  buildAchievementTransactionId,
  ACHIEVEMENT_CODES,
  MAX_CHALLENGE_CLASS_POINTS,
  processLiveChallengeClassPoints,
} from '../shared/liveChallengeClassPoints.mjs';
import {
  accountId,
  emptyAccount,
  applyTransaction,
  classPointsAuthorizationContext,
  CLASS_POINTS_SCHEMA_VERSION,
  SOURCE_TYPES,
} from '../shared/classPoints.mjs';

describe('Live Challenge Achievements → Class Points (Phase 5B Real State)', () => {
  it('cancelled challenge produces zero Class Points and skips execution', async () => {
    const result = await processLiveChallengeClassPoints({}, 'room1', { classId: 'c1' }, [], {}, 'cancelled');
    expect(result.status).to.equal('skipped');
    expect(result.reason).to.equal('not_finished');
  });

  describe('Finisher (+2)', () => {
    it('awards Finisher when answered scheduled rounds >= 80% of available rounds', () => {
      const player = {
        joined: true,
        joinedAtRound: 0,
        answeredRounds: [0, 1, 2, 3], // 4 answered out of 5 scheduled = 80%
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 5,
        secondChanceOf: {},
      });
      const f = ach.find((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER);
      expect(f).to.exist;
      expect(f.amount).to.equal(2);
    });

    it('requires at least 2 available rounds', () => {
      const player = {
        joined: true,
        joinedAtRound: 4, // 1 round available out of 5
        answeredRounds: [4],
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 5,
        secondChanceOf: {},
      });
      expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER)).to.be.false;
    });

    it('uses late-join denominator correctly', () => {
      const player = {
        joined: true,
        joinedAtRound: 2, // 3 available rounds: 2, 3, 4
        answeredRounds: [2, 3, 4], // 3/3 = 100%
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 5,
        secondChanceOf: {},
      });
      expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER)).to.be.true;
    });

    it('79% participation does not qualify, 80% qualifies', () => {
      const player79 = {
        joined: true,
        joinedAtRound: 0,
        answeredRounds: Array.from({ length: 79 }, (_, i) => i),
      };
      const failAch = calculateStudentChallengeAchievements({
        player: player79,
        scheduledRoundCount: 100,
        secondChanceOf: {},
      });
      expect(failAch.some((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER)).to.be.false;

      const player80 = {
        joined: true,
        joinedAtRound: 0,
        answeredRounds: Array.from({ length: 80 }, (_, i) => i),
      };
      const passAch = calculateStudentChallengeAchievements({
        player: player80,
        scheduledRoundCount: 100,
        secondChanceOf: {},
      });
      expect(passAch.some((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER)).to.be.true;
    });

    it('replay answers do not increase Finisher numerator or denominator', () => {
      const player = {
        joined: true,
        joinedAtRound: 0,
        answeredRounds: [0, 1, 5], // 5 is a replay round index (scheduled count is 4)
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 4,
        secondChanceOf: { '5': 0 },
      });
      // 2 original answered out of 4 scheduled = 50% < 80%
      expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER)).to.be.false;
    });
  });

  describe('Strong Accuracy (+3)', () => {
    it('awards Strong Accuracy when accuracy on >= 3 original rounds is >= 80%', () => {
      const player = {
        joined: true,
        submissionReceipts: {
          r0: { roundIndex: 0, isCorrect: true, serverConfirmed: true },
          r1: { roundIndex: 1, isCorrect: true, serverConfirmed: true },
          r2: { roundIndex: 2, isCorrect: true, serverConfirmed: true },
          r3: { roundIndex: 3, isCorrect: true, serverConfirmed: true },
        },
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 5,
        secondChanceOf: {},
      });
      const sa = ach.find((a) => a.achievementCode === ACHIEVEMENT_CODES.STRONG_ACCURACY);
      expect(sa).to.exist;
      expect(sa.amount).to.equal(3);
    });

    it('requires at least 3 original rounds answered', () => {
      const player = {
        joined: true,
        submissionReceipts: {
          r0: { roundIndex: 0, isCorrect: true, serverConfirmed: true },
          r1: { roundIndex: 1, isCorrect: true, serverConfirmed: true },
        },
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 5,
        secondChanceOf: {},
      });
      expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.STRONG_ACCURACY)).to.be.false;
    });

    it('79% accuracy does not qualify, 80% qualifies', () => {
      const player75 = {
        joined: true,
        submissionReceipts: {
          r0: { roundIndex: 0, isCorrect: true, serverConfirmed: true },
          r1: { roundIndex: 1, isCorrect: true, serverConfirmed: true },
          r2: { roundIndex: 2, isCorrect: true, serverConfirmed: true },
          r3: { roundIndex: 3, isCorrect: false, serverConfirmed: true },
        }, // 3/4 = 75%
      };
      const failAch = calculateStudentChallengeAchievements({
        player: player75,
        scheduledRoundCount: 5,
        secondChanceOf: {},
      });
      expect(failAch.some((a) => a.achievementCode === ACHIEVEMENT_CODES.STRONG_ACCURACY)).to.be.false;

      const player80 = {
        joined: true,
        submissionReceipts: {
          r0: { roundIndex: 0, isCorrect: true, serverConfirmed: true },
          r1: { roundIndex: 1, isCorrect: true, serverConfirmed: true },
          r2: { roundIndex: 2, isCorrect: true, serverConfirmed: true },
          r3: { roundIndex: 3, isCorrect: true, serverConfirmed: true },
          r4: { roundIndex: 4, isCorrect: false, serverConfirmed: true },
        }, // 4/5 = 80%
      };
      const passAch = calculateStudentChallengeAchievements({
        player: player80,
        scheduledRoundCount: 5,
        secondChanceOf: {},
      });
      expect(passAch.some((a) => a.achievementCode === ACHIEVEMENT_CODES.STRONG_ACCURACY)).to.be.true;
    });

    it('replay receipts are excluded and do not inflate Strong Accuracy', () => {
      const player = {
        joined: true,
        submissionReceipts: {
          r0: { roundIndex: 0, isCorrect: false, serverConfirmed: true },
          r1: { roundIndex: 1, isCorrect: true, serverConfirmed: true },
          r2: { roundIndex: 2, isCorrect: true, serverConfirmed: true },
          r3: { roundIndex: 3, isCorrect: false, serverConfirmed: true },
          // Replay round (index 5) marked correct
          r5: { roundIndex: 5, isCorrect: true, serverConfirmed: true, secondChance: true },
        },
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 4,
        secondChanceOf: { '5': 0 },
      });
      // Original accuracy: 2/4 = 50%
      expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.STRONG_ACCURACY)).to.be.false;
    });
  });

  describe('Comeback (+2)', () => {
    it('specifically proves replay -> original round 0 works', () => {
      const player = {
        joined: true,
        missedRounds: [0], // missed Round 0
        submissionReceipts: {
          r0: { roundIndex: 0, isCorrect: false, serverConfirmed: true },
          r5: { roundIndex: 5, isCorrect: true, serverConfirmed: true, secondChance: true },
        },
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 5,
        secondChanceOf: { '5': 0 },
      });
      const cb = ach.find((a) => a.achievementCode === ACHIEVEMENT_CODES.COMEBACK);
      expect(cb).to.exist;
      expect(cb.amount).to.equal(2);
    });

    it('original correct does not qualify for Comeback', () => {
      const player = {
        joined: true,
        missedRounds: [], // round 0 was NOT missed
        submissionReceipts: {
          r0: { roundIndex: 0, isCorrect: true, serverConfirmed: true },
          r5: { roundIndex: 5, isCorrect: true, serverConfirmed: true, secondChance: true },
        },
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 5,
        secondChanceOf: { '5': 0 },
      });
      expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.COMEBACK)).to.be.false;
    });

    it('replay missed does not qualify for Comeback', () => {
      const player = {
        joined: true,
        missedRounds: [0],
        submissionReceipts: {
          r0: { roundIndex: 0, isCorrect: false, serverConfirmed: true },
          r5: { roundIndex: 5, isCorrect: false, serverConfirmed: true, secondChance: true },
        },
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 5,
        secondChanceOf: { '5': 0 },
      });
      expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.COMEBACK)).to.be.false;
    });

    it('multiple recoveries still award Comeback only once', () => {
      const player = {
        joined: true,
        missedRounds: [0, 1],
        submissionReceipts: {
          r0: { roundIndex: 0, isCorrect: false, serverConfirmed: true },
          r1: { roundIndex: 1, isCorrect: false, serverConfirmed: true },
          r5: { roundIndex: 5, isCorrect: true, serverConfirmed: true, secondChance: true },
          r6: { roundIndex: 6, isCorrect: true, serverConfirmed: true, secondChance: true },
        },
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 5,
        secondChanceOf: { '5': 0, '6': 1 },
      });
      const comebacks = ach.filter((a) => a.achievementCode === ACHIEVEMENT_CODES.COMEBACK);
      expect(comebacks.length).to.equal(1);
      expect(comebacks[0].amount).to.equal(2);
    });
  });

  describe('Policy Cap and Independence', () => {
    it('qualifying for all three produces exactly +7 points and cannot exceed 7', () => {
      const player = {
        joined: true,
        joinedAtRound: 0,
        answeredRounds: [0, 1, 2, 3, 4, 5],
        missedRounds: [0],
        submissionReceipts: {
          r0: { roundIndex: 0, isCorrect: false, serverConfirmed: true },
          r1: { roundIndex: 1, isCorrect: true, serverConfirmed: true },
          r2: { roundIndex: 2, isCorrect: true, serverConfirmed: true },
          r3: { roundIndex: 3, isCorrect: true, serverConfirmed: true },
          r4: { roundIndex: 4, isCorrect: true, serverConfirmed: true }, // 4/5 original = 80% Strong Accuracy
          r5: { roundIndex: 5, isCorrect: true, serverConfirmed: true, secondChance: true }, // Comeback
        },
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 5,
        secondChanceOf: { '5': 0 },
      });
      const total = ach.reduce((sum, a) => sum + a.amount, 0);
      expect(total).to.equal(7);
      expect(total).to.be.at.most(MAX_CHALLENGE_CLASS_POINTS);
    });

    it('challenge score, speed bonus, streak bonus, and rank are completely ignored', () => {
      const highRankPlayer = {
        joined: true,
        score: 999999,
        speedBonus: 50000,
        streak: 50,
        rank: 1,
        answeredRounds: [],
        submissionReceipts: {},
      };
      const ach = calculateStudentChallengeAchievements({
        player: highRankPlayer,
        scheduledRoundCount: 5,
        secondChanceOf: {},
      });
      expect(ach).to.be.empty;
    });
  });

  describe('Class Points Architecture Integration', () => {
    it('uses sha256 safe hash for deterministic transaction document ID', () => {
      const id1 = buildAchievementTransactionId('room1', 'user1', 'comeback');
      const id2 = buildAchievementTransactionId('room1', 'user1', 'comeback');
      expect(id1).to.equal(id2);
      expect(id1).to.match(/^lca_[0-9a-f]{32}$/);
    });

    it('uses accountId, emptyAccount, and applyTransaction from classPoints.mjs correctly', () => {
      const accDocId = accountId('s1', 'c1');
      expect(accDocId).to.be.a('string');

      const empty = emptyAccount({ studentId: 's1', classId: 'c1' });
      expect(empty.balance).to.equal(0);
      expect(empty.lifetimeEarned).to.equal(0);

      const tx = {
        schemaVersion: CLASS_POINTS_SCHEMA_VERSION,
        studentId: 's1',
        classId: 'c1',
        amount: 2,
        sourceType: SOURCE_TYPES.LIVE_CHALLENGE_ACHIEVEMENT,
        reasonCode: 'liveChallengeAchievement',
        isReversal: false,
        reversalOf: null,
      };

      const updated = applyTransaction(empty, tx);
      expect(updated.balance).to.equal(2);
      expect(updated.lifetimeEarned).to.equal(2);
      expect(updated.lifetimeSpent).to.equal(0);
    });

    it('classPointsAuthorizationContext produces authorized teacher fields', () => {
      const classRecord = {
        teacherEmail: 'teacher@school.org',
        ownerEmail: 'teacher@school.org',
      };
      const auth = classPointsAuthorizationContext({ classRecord, existingRecord: null });
      expect(auth).to.have.property('originTeacherEmail');
      expect(auth).to.have.property('authorizedTeacherEmails');
    });
  });
});
