/*
 * WHAT A TIMED GAME IS WORTH AS EVIDENCE.
 *
 * A Live Challenge round is a real answer to a real question from the secure
 * bank, graded by the same graders as everything else. It is evidence. But the
 * conditions are not the conditions of practice: one attempt, a countdown, and
 * a leaderboard the student can see. A correct answer under that pressure says
 * something slightly different from a correct answer at a desk, and a wrong one
 * says much less — it may mean "cannot do this" or it may mean "ran out of
 * seconds".
 *
 * Two consequences follow, and both are deliberate.
 *
 *   IT IS AGGREGATED PER STANDARD, NOT PER ROUND. One timed question is close
 *   to a coin flip. Three questions on the same standard is a proportion, and a
 *   proportion is what the mastery estimate can actually use. So a student who
 *   answered four A.3(C) rounds and got three right produces ONE event worth
 *   0.75, not four events worth 1, 1, 1, 0.
 *
 *   REPLAYS DO NOT COUNT AGAIN. A second-chance round is the same question the
 *   room already missed, offered back. Counting it would let one question enter
 *   a student's record twice, and the second time is the easier time — they
 *   have seen it. The recovery mechanic is for the game; the evidence is for
 *   the mathematics.
 *
 * Rounds a student never answered contribute nothing at all. Not a zero — a
 * student who was still reading when the timer ended has not demonstrated that
 * they cannot do it.
 */

const int = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

const cleanKey = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * The rounds that count: answered by this student, and not a replay.
 */
export const scoredRoundsForPlayer = ({ player = null, secondChanceOf = {} } = {}) => {
  const answered = Array.isArray(player?.answeredRounds) ? player.answeredRounds : [];
  const missed = new Set((Array.isArray(player?.missedRounds) ? player.missedRounds : []).map(int));
  const replays = new Set(Object.keys(secondChanceOf || {}).map((key) => int(key)).filter((value) => value !== null));

  const seen = new Set();
  const rounds = [];
  answered.map(int).filter((round) => round !== null && round >= 0).forEach((round) => {
    if (replays.has(round)) return;
    if (seen.has(round)) return;
    seen.add(round);
    rounds.push({ round, correct: !missed.has(round) });
  });
  return rounds;
};

/**
 * One evidence event per student per standard.
 *
 * `roundStandards` maps a round index to the standard that round was about. It
 * is captured when the room is built, so a bank edited afterwards cannot change
 * what a class is recorded as having answered.
 */
export const buildChallengeEvidenceEvents = ({
  roomId = '',
  players = [],
  roundStandards = {},
  secondChanceOf = {},
  occurredAt = Date.now(),
  activityRole = 'liveChallenge',
} = {}) => {
  const events = [];
  const room = cleanKey(roomId);
  if (!room) return events;

  (Array.isArray(players) ? players : []).forEach((player) => {
    const studentId = cleanKey(player?.studentId);
    if (!studentId || player?.joined !== true) return;

    const byStandard = new Map();
    scoredRoundsForPlayer({ player, secondChanceOf }).forEach(({ round, correct }) => {
      const standard = cleanKey(roundStandards?.[String(round)]);
      if (!standard) return;
      const bucket = byStandard.get(standard) || { answered: 0, correct: 0, rounds: [] };
      bucket.answered += 1;
      if (correct) bucket.correct += 1;
      bucket.rounds.push(round);
      byStandard.set(standard, bucket);
    });

    [...byStandard.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([standard, bucket]) => {
        if (bucket.answered <= 0) return;
        events.push({
          schemaVersion: 1,
          studentId,
          // Stable and unique per student per standard per room, so a retried
          // finish cannot count the same game twice.
          eventKey: `liveChallenge_${room}_${standard}`,
          occurredAt,
          alignmentKeys: [standard],
          masteryEvidenceKeys: [standard],
          questionSnapshot: { questionType: 'liveChallengeRound', dok: null, familyId: null },
          source: { kind: 'liveChallenge', roomId: room, activityRole },
          performance: {
            score: bucket.correct / bucket.answered,
            isCorrect: bucket.correct === bucket.answered,
            attemptNumber: 1,
            status: 'finalized',
            // A timed round offers no hints and no second attempt, so every
            // answer here is independent by construction.
            isMathematicallyIndependent: true,
            roundsAnswered: bucket.answered,
            roundsCorrect: bucket.correct,
          },
          supportUsage: {},
          // Stated on the record itself so a reader can see the conditions
          // rather than having to know them.
          conditions: 'Timed Live Challenge round. One attempt, no hints, countdown visible.',
        });
      });
  });

  return events;
};

export default buildChallengeEvidenceEvents;
