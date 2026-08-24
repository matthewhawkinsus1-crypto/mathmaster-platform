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
  const newlyCompletedPairIds = [];

  // A cancellation pair is one mathematical action, not two UI actions.
  // If a student taps/slashes either member of a uniquely identified pair,
  // complete that whole pair immediately. The engine already proved the two
  // visible terms/factors are true opposites or matching numerator/denominator
  // factors, so requiring a second click on the partner adds interface work
  // without adding mathematical reasoning. Multiple pairs still require the
  // student to identify each pair once, and one sweep can hit several pairs.
  for (const rawIndex of hitIndices || []) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || !validTokenIndices.has(index)) continue;
    acceptedAny = true;

    const matchingPair = pairs.find((pair) => (
      !completed.has(pair.id)
      && Array.isArray(pair.indices)
      && pair.indices.includes(index)
    ));

    if (!matchingPair) continue;

    completed.add(matchingPair.id);
    newlyCompletedPairIds.push(matchingPair.id);
    (matchingPair.indices || []).forEach((pairIndex) => selected.delete(pairIndex));
  }

  return {
    acceptedAny,
    completedPairIds: [...completed],
    selectedIndices: [...selected],
    newlyCompletedPairIds,
    allPairsComplete: pairs.length > 0 && pairs.every((pair) => completed.has(pair.id)),
  };
};
