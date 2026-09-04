/*
 * WHAT THE GAME LEAVES BEHIND.
 *
 * A finished challenge used to flip a status field and stop. Fifteen minutes of
 * a whole class answering questions under time pressure produced no record at
 * all — not which standards the room missed, not who never joined, not whether
 * it was worth running. The teacher's only takeaway was whatever they happened
 * to notice on the projector.
 *
 * Everything this report needs was already being computed. `roundMisses` is
 * kept for the second-chance replay, the per-player totals drive the
 * leaderboard, and the round-to-standard map is written when the room is built.
 * None of it was ever read back.
 *
 * TWO AUDIENCES, TWO RULES.
 *
 *   The teacher sees names. They are the teacher; the anonymity in this game
 *   protects students from each other, not from the person teaching them.
 *
 *   The report never leaves a verdict on a student. "Answered 3 of 10" is a
 *   fact. "Disengaged" is a judgement a fifteen-minute game has not earned, and
 *   a student who lost wifi produces the identical record.
 *
 * MASTERY EVIDENCE IS DELIBERATELY NOT WRITTEN HERE. Whether a timed, gamified
 * round counts as evidence of what a student knows is a policy decision that
 * has not been made, and quietly writing it while building a report would be
 * deciding it by accident. The report is a teacher-facing summary and nothing
 * downstream reads it.
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const int = (value) => Math.max(0, Math.round(Number(value) || 0));

const pct = (numerator, denominator) => (denominator > 0
  ? Math.round((numerator / denominator) * 100)
  : null);

/**
 * How the class did on each scheduled round.
 *
 * Replay rounds are folded into the round they repeat rather than listed
 * separately: a teacher reading the report wants to know how question 4 went,
 * not that it appeared twice.
 */
export const summarizeRounds = ({
  scheduledRoundCount = 0,
  roundMisses = {},
  roundStandards = {},
  secondChanceOf = {},
  answeredCounts = {},
  // Carried so a finished game can be saved and re-run. The set lives in
  // private state, which is deleted when the room closes, so if the report does
  // not hold it nothing can.
  questionIds = [],
} = {}) => {
  const scheduled = Math.max(0, Math.floor(Number(scheduledRoundCount) || 0));
  const replayedOriginals = new Set(
    Object.values(secondChanceOf || {}).map(Number).filter(Number.isInteger),
  );

  return Array.from({ length: scheduled }, (_, roundIndex) => {
    const answered = int(answeredCounts?.[roundIndex] ?? answeredCounts?.[String(roundIndex)]);
    const missed = int(roundMisses?.[roundIndex] ?? roundMisses?.[String(roundIndex)]);
    // A student who never answered is not a student who got it wrong, so the
    // rate is over the people who actually responded.
    const correct = Math.max(0, answered - missed);
    return {
      roundIndex,
      roundNumber: roundIndex + 1,
      standard: String(roundStandards?.[roundIndex] ?? roundStandards?.[String(roundIndex)] ?? '') || null,
      questionId: String((Array.isArray(questionIds) ? questionIds[roundIndex] : '') || '') || null,
      answered,
      missed,
      correct,
      accuracyPercent: pct(correct, answered),
      replayed: replayedOriginals.has(roundIndex),
    };
  });
};

/**
 * Standards ranked by how much trouble the class had, hardest first.
 *
 * This is the line a teacher acts on tomorrow, so it is computed over rounds
 * that were actually attempted — a round nobody reached says nothing about the
 * standard.
 */
export const summarizeStandards = (rounds = []) => {
  const byStandard = new Map();
  for (const round of Array.isArray(rounds) ? rounds : []) {
    if (!round?.standard || !round.answered) continue;
    const entry = byStandard.get(round.standard)
      || { standard: round.standard, answered: 0, correct: 0, missed: 0, rounds: 0 };
    entry.answered += round.answered;
    entry.correct += round.correct;
    entry.missed += round.missed;
    entry.rounds += 1;
    byStandard.set(round.standard, entry);
  }

  return [...byStandard.values()]
    .map((entry) => ({ ...entry, accuracyPercent: pct(entry.correct, entry.answered) }))
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent
      || b.answered - a.answered
      || a.standard.localeCompare(b.standard));
};

/**
 * One row per student on the roster, named, including the ones who never came.
 *
 * Absent players are kept rather than filtered out: "who was not in this" is
 * one of the questions the report exists to answer, and it is the row that
 * connects to attendance.
 */
export const summarizePlayers = ({ players = [], totalRounds = 0 } = {}) => {
  const rounds = Math.max(0, Math.floor(Number(totalRounds) || 0));

  return (Array.isArray(players) ? players : [])
    .map((player) => {
      const answered = int(player?.roundsAnswered);
      const correct = clamp(int(player?.correctCount), 0, answered);
      return {
        studentId: player?.studentId ? String(player.studentId) : null,
        alias: String(player?.alias || 'Player'),
        joined: player?.joined === true,
        score: int(player?.score),
        answered,
        correct,
        accuracyPercent: pct(correct, answered),
        // Named plainly, because it is what it is: how many of the rounds this
        // student was present for. It is not a claim about effort.
        participationPercent: pct(answered, rounds),
        comebacks: int(player?.comebackCount),
        recoveries: int(player?.recoveryCount),
        bestStreak: int(player?.bestStreak),
      };
    })
    .sort((a, b) => b.score - a.score
      || b.correct - a.correct
      || String(a.alias).localeCompare(String(b.alias)));
};

/**
 * The whole report, assembled from state the room already held.
 */
export const buildChallengeReport = ({
  room = {},
  scheduledRoundCount = 0,
  roundMisses = {},
  roundStandards = {},
  secondChanceOf = {},
  answeredCounts = {},
  questionIds = [],
  players = [],
  finishedAt = null,
} = {}) => {
  const rounds = summarizeRounds({
    scheduledRoundCount, roundMisses, roundStandards, secondChanceOf, answeredCounts, questionIds,
  });
  const standards = summarizeStandards(rounds);
  const roster = summarizePlayers({ players, totalRounds: scheduledRoundCount });
  const played = roster.filter((entry) => entry.joined);
  const neverJoined = roster.filter((entry) => !entry.joined);

  const totalAnswered = rounds.reduce((sum, round) => sum + round.answered, 0);
  const totalCorrect = rounds.reduce((sum, round) => sum + round.correct, 0);
  const replays = Object.keys(secondChanceOf || {}).length;

  return {
    title: String(room?.title || 'Live Challenge'),
    className: room?.className ? String(room.className) : null,
    courseId: room?.courseId ? String(room.courseId) : null,
    standardCode: room?.standardCode ? String(room.standardCode) : null,
    roundSeconds: int(room?.roundSeconds) || null,
    finishedAt: finishedAt || null,

    scheduledRoundCount: Math.max(0, Math.floor(Number(scheduledRoundCount) || 0)),
    secondChanceRoundCount: replays,

    playedCount: played.length,
    eligibleCount: roster.length,
    neverJoined: neverJoined.map((entry) => ({ studentId: entry.studentId, alias: entry.alias })),

    classAccuracyPercent: pct(totalCorrect, totalAnswered),
    rounds,
    standards,
    // Hardest first, so the one line a teacher reads is the one they can act on.
    weakestStandard: standards[0] || null,
    players: roster,
  };
};

export default buildChallengeReport;
