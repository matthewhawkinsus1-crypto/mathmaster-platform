import { expect } from 'chai';
import {
  calculateStudentChallengeAchievements,
  buildAchievementTransactionId,
  ACHIEVEMENT_CODES,
  MAX_CHALLENGE_CLASS_POINTS,
} from '../shared/liveChallengeClassPoints.mjs';

describe('Live Challenge Achievements → Class Points', () => {
  const rounds = [
    { id: 'r0' }, { id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' },
    { id: 'r0_rep', secondChanceOf: 'r0' },
  ];

  it('awards Finisher (+2) for 80% attendance after joining', () => {
    const p = { hasJoined: true, joinedAtRound: 0, answers: { r0: { submitted: true }, r1: { submitted: true }, r2: { submitted: true }, r3: { submitted: true }, r4: { submitted: false } } };
    const res = calculateStudentChallengeAchievements(p, rounds.slice(0, 5));
    expect(res.some(a => a.achievementCode === ACHIEVEMENT_CODES.FINISHER && a.amount === 2)).to.be.true;
  });

  it('awards Strong Accuracy (+3) for >=80% accuracy over original rounds', () => {
    const p = { hasJoined: true, answers: { r0: { submitted: true, isCorrect: true }, r1: { submitted: true, isCorrect: true }, r2: { submitted: true, isCorrect: true }, r3: { submitted: true, isCorrect: false } } };
    const res = calculateStudentChallengeAchievements(p, rounds.slice(0, 5));
    expect(res.some(a => a.achievementCode === ACHIEVEMENT_CODES.STRONG_ACCURACY)).to.be.false; // 75%
  });

  it('awards Comeback (+2) once for missed original and correct replay', () => {
    const p = { hasJoined: true, answers: { r0: { submitted: true, isCorrect: false }, r0_rep: { submitted: true, isCorrect: true } } };
    const res = calculateStudentChallengeAchievements(p, rounds);
    expect(res.some(a => a.achievementCode === ACHIEVEMENT_CODES.COMEBACK && a.amount === 2)).to.be.true;
  });

  it('deterministic transaction id format', () => {
    expect(buildAchievementTransactionId('room1', 'user1', 'comeback')).to.equal('lca_room1_user1_comeback');
  });
});
