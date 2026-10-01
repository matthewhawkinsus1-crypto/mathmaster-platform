import { getChallengeMode } from '../../../functions/shared/liveChallengeModes.mjs';

const FAMILY_LABELS = Object.freeze({
  linearEquation: 'Linear Equations',
  literalEquation: 'Literal Equations',
  linearInequality: 'Linear Inequalities',
  absoluteValueEquation: 'Absolute Value Equations',
  absoluteValueInequality: 'Absolute Value Inequalities',
});

const DIFFICULTY_LABELS = Object.freeze({
  foundation: 'Foundation',
  developing: 'Developing',
  advanced: 'Advanced',
  challenge: 'Challenge',
});

const cleanText = (value) => String(value ?? '').trim();

export const projectorFamilyLabel = (room = {}) => {
  const family = cleanText(
    room?.currentQuestion?.challengeFamily
      || room?.currentQuestion?.tool?.challengeFamily,
  );
  if (family && FAMILY_LABELS[family]) return FAMILY_LABELS[family];

  const standard = cleanText(room?.currentQuestion?.teksCode || room?.standardCode);
  if (standard && standard !== 'mixed') return standard;

  if (room?.challengeMode === 'solverRace') {
    const focus = cleanText(room?.solverRaceFocus);
    if (focus && focus !== 'mixed' && FAMILY_LABELS[focus]) return FAMILY_LABELS[focus];
    return 'Mixed Solver Race';
  }
  return 'Mixed Review';
};

export const projectorDifficultyLabel = (room = {}) => {
  const raw = cleanText(
    room?.currentQuestion?.difficultyBand
      || room?.currentQuestion?.solverRaceStage
      || room?.currentQuestion?.tool?.difficultyBand
      || room?.currentQuestion?.tool?.solverRaceStage
      || room?.solverRaceDifficulty,
  );
  if (!raw || raw === 'ramp') return room?.challengeMode === 'solverRace' ? 'Ramp Up' : '';
  return DIFFICULTY_LABELS[raw] || raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
};

// The game mode names itself; an unknown or missing mode reads as Standard.
export const projectorGameLabel = (room = {}) => getChallengeMode(room?.challengeMode).projectorLabel;

export const projectorRoundCount = (room = {}) => {
  const scheduled = Math.round(Number(room?.scheduledRoundCount) || 0);
  const configured = Math.round(Number(room?.roundCount) || 0);
  const currentRound = Math.max(0, Math.round(Number(room?.currentRound) || 0) + 1);
  return Math.max(1, scheduled, configured, currentRound);
};

export const projectorCurrentRound = (room = {}) => (
  Math.max(1, Math.round(Number(room?.currentRound) || 0) + 1)
);

export const projectorAnsweredCount = (leaderboard = [], currentRound = 0) => (
  (Array.isArray(leaderboard) ? leaderboard : [])
    .filter((row) => Number(row?.answeredRound) === Number(currentRound))
    .length
);

export const projectorScore = (row = {}) => (
  Math.max(0, Math.round(Number(row?.liveScore ?? row?.score) || 0))
);

/*
 * Standing order: by rank, then by the leaderboard's own display order. The
 * sort is stable, so players who share a rank keep the deterministic order the
 * ranking gave them (liveChallengeRanking.mjs) instead of being re-sorted here
 * by a second, different rule.
 */
export const finalStandingRows = (leaderboard = []) => (
  [...(Array.isArray(leaderboard) ? leaderboard : [])]
    .filter(Boolean)
    .sort((left, right) => (
      (Number(left?.rank) || Number.MAX_SAFE_INTEGER) - (Number(right?.rank) || Number.MAX_SAFE_INTEGER)
    ))
);

/*
 * The three podium steps, filled in standing order. Tied players share a rank,
 * so looking places up by rank number would put one of them on two steps and
 * leave the other off the podium; each step shows its player's own rank.
 */
export const podiumRows = (leaderboard = []) => {
  const [first = null, second = null, third = null] = finalStandingRows(leaderboard);
  return { first, second, third };
};

/** Everyone after the three podium steps, in standing order. */
export const belowPodiumRows = (leaderboard = []) => finalStandingRows(leaderboard).slice(3);
