import {
  expressionsEquivalent,
  splitAdditiveTerms,
  splitMultiplicativeFactors,
} from './algebraAstEngine.js';

/**
 * Presentation model for cancellation marks.
 *
 * The algebra engine already detects exact structural cancellation pairs.
 * Prefer those indices instead of attempting to rediscover them from a
 * simplified expression. This matters for additive inverses such as
 *   2x + 9 - 2x
 * where the engine knows terms 0 and 2 cancel.
 *
 * targetExpression remains as a backwards-compatible fallback for old saved
 * pending moves that predate cancellationPairs.
 */
export const buildCancellationModel = (
  expression,
  targetExpression,
  variable,
  structuralPairs = [],
) => {
  const factorParts = splitMultiplicativeFactors(expression);
  if (factorParts?.denominator?.length) {
    const numerator = factorParts.numerator || [];
    const denominator = factorParts.denominator || [];

    const structuralFactorPairs = (structuralPairs || [])
      .filter((pair) => Number.isInteger(pair?.numeratorIndex) && Number.isInteger(pair?.denominatorIndex))
      .map((pair, index) => ({
        id: `factor-${index}`,
        indices: [pair.numeratorIndex, numerator.length + pair.denominatorIndex],
      }));

    if (structuralFactorPairs.length) {
      return {
        kind: 'fraction',
        numerator,
        denominator,
        pairs: structuralFactorPairs,
        tokenCount: numerator.length + denominator.length,
      };
    }

    // Backwards-compatible fallback for an old saved pending move that does
    // not contain structural pair metadata.
    const usedNumerator = new Set();
    const pairs = [];
    denominator.forEach((denominatorFactor, denominatorIndex) => {
      const numeratorIndex = numerator.findIndex((numeratorFactor, index) => (
        !usedNumerator.has(index)
        && expressionsEquivalent(numeratorFactor.text, denominatorFactor.text, variable)
      ));
      if (numeratorIndex < 0) return;
      usedNumerator.add(numeratorIndex);
      pairs.push({
        id: `factor-${pairs.length}`,
        indices: [numeratorIndex, numerator.length + denominatorIndex],
      });
    });
    if (pairs.length) {
      return {
        kind: 'fraction',
        numerator,
        denominator,
        pairs,
        tokenCount: numerator.length + denominator.length,
      };
    }
  }

  const terms = splitAdditiveTerms(expression);
  if (!terms?.length) return null;

  const structuralAdditivePairs = (structuralPairs || [])
    .filter((pair) => Number.isInteger(pair?.firstIndex) && Number.isInteger(pair?.secondIndex))
    .filter((pair) => (
      pair.firstIndex >= 0
      && pair.secondIndex >= 0
      && pair.firstIndex < terms.length
      && pair.secondIndex < terms.length
    ))
    .map((pair, index) => ({
      id: `additive-${index}`,
      indices: [pair.firstIndex, pair.secondIndex],
    }));

  if (structuralAdditivePairs.length) {
    return {
      kind: 'additive',
      terms,
      pairs: structuralAdditivePairs,
      tokenCount: terms.length,
    };
  }

  // Old-draft fallback only. New moves should always carry the structural
  // indices from algebraAstEngine.
  for (let i = 0; i < terms.length; i += 1) {
    for (let j = i + 1; j < terms.length; j += 1) {
      const remainderText = terms
        .filter((_, index) => index !== i && index !== j)
        .map((term) => term.text)
        .join(' ') || '0';
      try {
        if (expressionsEquivalent(remainderText, targetExpression, variable)) {
          return {
            kind: 'additive',
            terms,
            pairs: [{ id: 'additive-0', indices: [i, j] }],
            tokenCount: terms.length,
          };
        }
      } catch {
        // Keep searching.
      }
    }
  }

  return null;
};
