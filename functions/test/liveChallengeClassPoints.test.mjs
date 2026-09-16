import { expect } from 'chai';
import {
  calculateStudentChallengeAchievements,
  buildAchievementTransactionId,
  ACHIEVEMENT_CODES,
  MAX_CHALLENGE_CLASS_POINTS,
  processLiveChallengeClassPoints,
} from '../shared/liveChallengeClassPoints.mjs';

describe('Live Challenge Achievements → Class Points (Phase 5B)', () => {
  const standardRounds = [
    { id: 'r0', questionId: 'q0', isSecondChance: false },
    { id: 'r1', questionId: 'q1', isSecondChance: false },
    { id: 'r2', questionId: 'q2', isSecondChance: false },
    { id: 'r3', questionId: 'q3', isSecondChance: false },
    { id: 'r4', questionId: 'q4', isSecondChance: false },
  ];

  it('cancelled challenge earns zero Class Points', async () => {
    const res = await processLiveChallengeClassPoints({}, 'room1', {}, [], 'cancelled');
    expect(res.status).to.equal('skipped');
  });

  it('Finisher = +2 when answering at least 80% of available rounds', () => {
    const player = {
      hasJoined: true,
      joinedAtRound: 0,
      answers: {
        r0: { submitted: true },
        r1: { submitted: true },
        r2: { submitted: true },
        r3: { submitted: true },
        r4: { submitted: false },
      },
    };
    const ach = calculateStudentChallengeAchievements(player, standardRounds);
    const f = ach.find((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER);
    expect(f).to.exist;
    expect(f.amount).to.equal(2);
  });

  it('Finisher requires at least 2 available rounds', () => {
    const player = {
      hasJoined: true,
      joinedAtRound: 4,
      answers: { r4: { submitted: true } },
    };
    const ach = calculateStudentChallengeAchievements(player, standardRounds);
    expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER)).to.be.false;
  });

  it('Finisher uses late-join denominator', () => {
    const player = {
      hasJoined: true,
      joinedAtRound: 2, // 3 rounds available
      answers: { r2: { submitted: true }, r3: { submitted: true }, r4: { submitted: true } },
    };
    const ach = calculateStudentChallengeAchievements(player, standardRounds);
    expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER)).to.be.true;
  });

  it('79% participation does not earn Finisher', () => {
    const hundredRounds = Array.from({ length: 100 }, (_, i) => ({ id: `r${i}` }));
    const answers = {};
    for (let i = 0; i < 79; i++) answers[`r${i}`] = { submitted: true };
    const player = { hasJoined: true, joinedAtRound: 0, answers };
    const ach = calculateStudentChallengeAchievements(player, hundredRounds);
    expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.FINISHER)).to.be.false;
  });

  it('Strong Accuracy = +3 for >= 80% on >= 3 original rounds', () => {
    const player = {
      hasJoined: true,
      answers: {
        r0: { submitted: true, isCorrect: true },
        r1: { submitted: true, isCorrect: true },
        r2: { submitted: true, isCorrect: true },
        r3: { submitted: true, isCorrect: true },
      },
    };
    const ach = calculateStudentChallengeAchievements(player, standardRounds);
    const sa = ach.find((a) => a.achievementCode === ACHIEVEMENT_CODES.STRONG_ACCURACY);
    expect(sa).to.exist;
    expect(sa.amount).to.equal(3);
  });

  it('Strong Accuracy requires at least 3 original rounds answered', () => {
    const player = {
      hasJoined: true,
      answers: {
        r0: { submitted: true, isCorrect: true },
        r1: { submitted: true, isCorrect: true },
      },
    };
    const ach = calculateStudentChallengeAchievements(player, standardRounds);
    expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.STRONG_ACCURACY)).to.be.false;
  });

  it('replay rounds do not inflate Strong Accuracy', () => {
    const rounds = [
      { id: 'r0', isSecondChance: false },
      { id: 'r1', isSecondChance: false },
      { id: 'r2', isSecondChance: false },
      { id: 'r3', isSecondChance: false },
      { id: 'r0_rep', isSecondChance: true, secondChanceOf: 'r0' },
    ];
    const player = {
      hasJoined: true,
      answers: {
        r0: { submitted: true, isCorrect: false },
        r1: { submitted: true, isCorrect: true },
        r2: { submitted: true, isCorrect: true },
        r3: { submitted: true, isCorrect: false },
        r0_rep: { submitted: true, isCorrect: true },
      },
    };
    const ach = calculateStudentChallengeAchievements(player, rounds);
    expect(ach.some((a) => a.achievementCode === ACHIEVEMENT_CODES.STRONG_ACCURACY)).to.be.false;
  });

  it('Comeback = +2 for missed original + correct replay', () => {
    const rounds = [
      { id: 'r0', isSecondChance: false },
      { id: 'r0_rep', isSecondChance: true, secondChanceOf: 'r0' },
    ];
    const player = {
      hasJoined: true,
      answers: {
        r0: { submitted: true, isCorrect: false },
        r0_rep: { submitted: true, isCorrect: true },
      },
    };
    const ach = calculateStudentChallengeAchievements(player, rounds);
    const cb = ach.find((a) => a.achievementCode === ACHIEVEMENT_CODES.COMEBACK);
    expect(cb).to.exist;
    expect(cb.amount).to.equal(2);
  });

  it('multiple recoveries still award Comeback only once', () => {
    const rounds = [
      { id: 'r0', isSecondChance: false },
      { id: 'r1', isSecondChance: false },
      { id: 'r0_rep', isSecondChance: true, secondChanceOf: 'r0' },
      { id: 'r1_rep', isSecondChance: true, secondChanceOf: 'r1' },
    ];
    const player = {
      hasJoined: true,
      answers: {
        r0: { submitted: true, isCorrect: false },
        r1: { submitted: true, isCorrect: false },
        r0_rep: { submitted: true, isCorrect: true },
        r1_rep: { submitted: true, isCorrect: true },
      },
    };
    const ach = calculateStudentChallengeAchievements(player, rounds);
    const comebacks = ach.filter((a) => a.achievementCode === ACHIEVEMENT_CODES.COMEBACK);
    expect(comebacks.length).to.equal(1);
  });

  it('qualifying for all three produces exactly +7', () => {
    const rounds = [
      { id: 'r0', isSecondChance: false },
      { id: 'r1', isSecondChance: false },
      { id: 'r2', isSecondChance: false },
      { id: 'r3', isSecondChance: false },
      { id: 'r4', isSecondChance: false },
      { id: 'r0_rep', isSecondChance: true, secondChanceOf: 'r0' },
    ];
    const player = {
      hasJoined: true,
      joinedAtRound: 0,
      answers: {
        r0: { submitted: true, isCorrect: false },
        r1: { submitted: true, isCorrect: true },
        r2: { submitted: true, isCorrect: true },
        r3: { submitted: true, isCorrect: true },
        r4: { submitted: true, isCorrect: true },
        r0_rep: { submitted: true, isCorrect: true },
      },
    };
    const ach = calculateStudentChallengeAchievements(player, rounds);
    const total = ach.reduce((sum, a) => sum + a.amount, 0);
    expect(total).to.equal(7);
    expect(total).to.be.at.most(MAX_CHALLENGE_CLASS_POINTS);
  });

  it('challenge score, speed bonus, streak bonus, and rank do not alter Class Points', () => {
    const player = {
      hasJoined: true,
      score: 999999,
      speedBonus: 50000,
      streak: 50,
      rank: 1,
      answers: {},
    };
    const ach = calculateStudentChallengeAchievements(player, standardRounds);
    expect(ach).to.be.empty;
  });

  it('deterministic transaction id matches format', () => {
    expect(buildAchievementTransactionId('room1', 'user1', 'challengeFinisher')).to.equal(
      'lca_room1_user1_challengeFinisher'
    );
  });
});
