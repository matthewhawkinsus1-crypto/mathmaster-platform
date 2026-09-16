import fs from 'fs';
import { expect } from 'chai';
import {
  calculateStudentChallengeAchievements,
  buildAchievementTransactionId,
  ACHIEVEMENT_CODES,
  MAX_CHALLENGE_CLASS_POINTS,
  processLiveChallengeClassPoints,
  validateRosterAuthorization,
  cleanupStudentLiveChallengeAchievements,
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
        answeredRounds: [0, 1, 2, 3], // 4/5 = 80%
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
        joinedAtRound: 4,
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
      const p79 = {
        joined: true,
        joinedAtRound: 0,
        answeredRounds: Array.from({ length: 79 }, (_, i) => i),
      };
      const failAch = calculateStudentChallengeAchievements({
        player: p79,
        scheduledRoundCount: 100,
        secondChanceOf: {},
      });
      expect(failAch.some((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER)).to.be.false;

      const p80 = {
        joined: true,
        joinedAtRound: 0,
        answeredRounds: Array.from({ length: 80 }, (_, i) => i),
      };
      const passAch = calculateStudentChallengeAchievements({
        player: p80,
        scheduledRoundCount: 100,
        secondChanceOf: {},
      });
      expect(passAch.some((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER)).to.be.true;
    });

    it('replay answers do not count toward Finisher numerator or denominator', () => {
      const player = {
        joined: true,
        joinedAtRound: 0,
        answeredRounds: [0, 1, 5], // 5 is replay round
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 4,
        secondChanceOf: { '5': 0 },
      });
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

    it('replay receipts are excluded and do not inflate Strong Accuracy', () => {
      const player = {
        joined: true,
        submissionReceipts: {
          r0: { roundIndex: 0, isCorrect: false, serverConfirmed: true },
          r1: { roundIndex: 1, isCorrect: true, serverConfirmed: true },
          r2: { roundIndex: 2, isCorrect: true, serverConfirmed: true },
          r3: { roundIndex: 3, isCorrect: false, serverConfirmed: true },
          r5: { roundIndex: 5, isCorrect: true, serverConfirmed: true, secondChance: true },
        },
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 4,
        secondChanceOf: { '5': 0 },
      });
      expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.STRONG_ACCURACY)).to.be.false;
    });
  });

  describe('Comeback (+2)', () => {
    it('specifically proves replay -> original round 0 works', () => {
      const player = {
        joined: true,
        missedRounds: [0], // Missed round 0
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
        missedRounds: [],
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
          r4: { roundIndex: 4, isCorrect: true, serverConfirmed: true },
          r5: { roundIndex: 5, isCorrect: true, serverConfirmed: true, secondChance: true },
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
      const player = {
        joined: true,
        score: 999999,
        speedBonus: 50000,
        streak: 50,
        rank: 1,
        answeredRounds: [],
        submissionReceipts: {},
      };
      const ach = calculateStudentChallengeAchievements({
        player,
        scheduledRoundCount: 5,
        secondChanceOf: {},
      });
      expect(ach).to.be.empty;
    });
  });

  describe('Deterministic Achievement IDs', () => {
    it('uses an unambiguous safe hash identity for room, student, and achievement', () => {
      const first = buildAchievementTransactionId('room:a', 'student', 'strongAccuracy');
      const second = buildAchievementTransactionId('room', 'a:student', 'strongAccuracy');
      expect(first).to.not.equal(second);
      expect(first).to.match(/^lca_[0-9a-f]{32}$/);
    });
  });

  describe('Roster Authority and Authorization Context', () => {
    it('rejects archived class (status === "archived")', async () => {
      const db = {
        collection: (col) => ({
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => (col === 'classes' ? { status: 'archived', teacherOfRecord: 't@s.org' } : { classId: 'c1', assignedTeacherEmail: 't@s.org' }),
            }),
          }),
        }),
      };
      const auth = await validateRosterAuthorization(db, 'c1', 's1');
      expect(auth.valid).to.be.false;
      expect(auth.reason).to.equal('class_archived');
    });

    it('rejects missing or mismatched assignedTeacherEmail', async () => {
      const dbMissing = {
        collection: (col) => ({
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => (col === 'classes' ? { status: 'active', teacherOfRecord: 't@s.org' } : { classId: 'c1', assignedTeacherEmail: '' }),
            }),
          }),
        }),
      };
      const auth1 = await validateRosterAuthorization(dbMissing, 'c1', 's1');
      expect(auth1.valid).to.be.false;
      expect(auth1.reason).to.equal('teacher_mismatch_or_missing');

      const dbMismatch = {
        collection: (col) => ({
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => (col === 'classes' ? { status: 'active', teacherOfRecord: 't@s.org' } : { classId: 'c1', assignedTeacherEmail: 'other@s.org' }),
            }),
          }),
        }),
      };
      const auth2 = await validateRosterAuthorization(dbMismatch, 'c1', 's1');
      expect(auth2.valid).to.be.false;
      expect(auth2.reason).to.equal('teacher_mismatch_or_missing');
    });

    it('requires exact teacherOfRecord match', async () => {
      const dbValid = {
        collection: (col) => ({
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => (col === 'classes' ? { status: 'active', teacherOfRecord: 't@s.org' } : { classId: 'c1', assignedTeacherEmail: 't@s.org' }),
            }),
          }),
        }),
      };
      const auth = await validateRosterAuthorization(dbValid, 'c1', 's1');
      expect(auth.valid).to.be.true;
      expect(auth.classRecord.teacherOfRecord).to.equal('t@s.org');
    });

    it('classPointsAuthorizationContext fixture produces non-empty originTeacherEmail and includes teacher', () => {
      const classRecord = {
        classId: 'c1',
        teacherOfRecord: 'teacher@school.org',
      };
      const auth = classPointsAuthorizationContext({ classRecord, existingRecord: null });
      expect(auth.originTeacherEmail).to.equal('teacher@school.org');
      expect(auth.authorizedTeacherEmails).to.include('teacher@school.org');
    });
  });

  describe('Cleanup Batch Safety (>450 operations)', () => {
    it('creates and uses a new WriteBatch after committing 450 operations', async () => {
      let batchesCreated = 0;
      let batchesCommitted = 0;
      const mockBatch = () => ({
        update: () => {},
        delete: () => {},
        commit: async () => { batchesCommitted++; },
      });

      const docs = Array.from({ length: 460 }, (_, i) => ({
        ref: { id: `doc${i}` },
        data: () => ({
          status: 'pending',
          awards: [{ studentId: 'targetStudent' }, { studentId: 'otherStudent' }],
        }),
      }));

      const mockDb = {
        collection: () => ({
          where: () => ({
            get: async () => ({
              empty: false,
              docs,
            }),
          }),
        }),
        batch: () => {
          batchesCreated++;
          return mockBatch();
        },
      };

      await cleanupStudentLiveChallengeAchievements(mockDb, 'targetStudent');
      expect(batchesCreated).to.equal(2);
      expect(batchesCommitted).to.equal(2);
    });
  });

  describe('functions/index.js Static & Runtime Architecture Assertions', () => {
    const indexSource = fs.readFileSync('functions/index.js', 'utf8');

    it('no privatePlayers query remains in functions/index.js', () => {
      expect(indexSource).to.not.include('privatePlayers');
    });

    it('finishLiveChallengeRoom uses existing players and real privateState', () => {
      expect(indexSource).to.include('loadPrivateChallengePlayers');
      expect(indexSource).to.include('privateSnapshot.data()');
      expect(indexSource).to.include('processLiveChallengeClassPoints(db, roomRef.id, room, players, privateState, status)');
    });

    it('no undefined functions.firestore or admin.firestore', () => {
      expect(indexSource).to.not.include('functions.firestore');
      expect(indexSource).to.not.include('admin.firestore');
    });

    it('scheduled retry export exists and handles the unstaged-finish recovery window', () => {
      expect(indexSource).to.include('exports.retryLiveChallengeAchievementJobs = onSchedule');
      expect(indexSource).to.include('classPointsRecoveryPending');
      expect(indexSource).to.include('retryPendingLiveChallengeAchievementJobs');
    });

    it('finish awaits private cleanup only after Class Points staging is durable', () => {
      expect(indexSource).to.include('classPointsPlanDurable');
      expect(indexSource).to.include('await deletePrivateChallengeState(db, privateRef, players)');
    });

    it('permanent student deletion removes Live Challenge achievement job references', () => {
      expect(indexSource).to.include('cleanupStudentLiveChallengeAchievements(db, studentId)');
    });

    it('preproduction reset in functions/lib/admin.js contains liveChallengeAchievementJobs', () => {
      const adminSource = fs.readFileSync('functions/lib/admin.js', 'utf8');
      expect(adminSource).to.include('liveChallengeAchievementJobs');
    });
  });
});
