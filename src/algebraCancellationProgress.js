/**
 * Pure cancellation-progress reducer for the Step Algebra workspace.
 *
 * A compound symbolic move may expose several independent cancellation pairs
 * at once, e.g. (P*r*t)/(P*t) has P/P and t/t.  The interaction must remember
 * more than one half-completed pair so the student can slash several numerator
 * factors first, several denominator factors second, or sweep across every
 * matching factor in a single stroke.
 */
export const advanceCancellationProgress = ({
  pairs = [],
  completedPairIds = [],
  selectedIndices = [],
  hitIndices = [],
} = {}) => {
  const completed = new Set(completedPairIds);
  const selected = new Set(selectedIndices);
  const validTokenIndices = new Set(
    pairs.filter((pair) => !completed.has(pair.id)).flatMap((pair) => pair.indices || []),
  );

  let acceptedAny = false;
  for (const rawIndex of hitIndices || []) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || !validTokenIndices.has(index)) continue;
    acceptedAny = true;
    selected.add(index);
  }

  const newlyCompletedPairIds = [];
  for (const pair of pairs) {
    if (completed.has(pair.id)) continue;
    const indices = pair.indices || [];
    if (indices.length < 2 || !indices.every((index) => selected.has(index))) continue;
    completed.add(pair.id);
    newlyCompletedPairIds.push(pair.id);
    indices.forEach((index) => selected.delete(index));
  }

  return {
    acceptedAny,
    completedPairIds: [...completed],
    selectedIndices: [...selected],
    newlyCompletedPairIds,
    allPairsComplete: pairs.length > 0 && pairs.every((pair) => completed.has(pair.id)),
  };
};
