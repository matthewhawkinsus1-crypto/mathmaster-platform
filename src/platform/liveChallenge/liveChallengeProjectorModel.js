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

export const projectorGameLabel = (room = {}) => (
  room?.challengeMode === 'solverRace' ? 'Solver Race' : 'Live Challenge'
);

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

export const podiumRows = (leaderboard = []) => {
  const rows = [...(Array.isArray(leaderboard) ? leaderboard : [])]
    .filter(Boolean)
    .sort((left, right) => {
      const rankDelta = (Number(left?.rank) || Number.MAX_SAFE_INTEGER) - (Number(right?.rank) || Number.MAX_SAFE_INTEGER);
      if (rankDelta) return rankDelta;
      const scoreDelta = projectorScore(right) - projectorScore(left);
      if (scoreDelta) return scoreDelta;
      return cleanText(left?.alias).localeCompare(cleanText(right?.alias));
    })
    .slice(0, 3);

  const byRank = new Map(rows.map((row, index) => [Number(row?.rank) || index + 1, row]));
  return {
    first: byRank.get(1) || rows[0] || null,
    second: byRank.get(2) || rows[1] || null,
    third: byRank.get(3) || rows[2] || null,
  };
};

export const finalStandingRows = (leaderboard = []) => (
  [...(Array.isArray(leaderboard) ? leaderboard : [])]
    .filter(Boolean)
    .sort((left, right) => {
      const rankDelta = (Number(left?.rank) || Number.MAX_SAFE_INTEGER) - (Number(right?.rank) || Number.MAX_SAFE_INTEGER);
      if (rankDelta) return rankDelta;
      return projectorScore(right) - projectorScore(left);
    })
);
