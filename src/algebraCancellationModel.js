import {
  expressionsEquivalent,
  splitAdditiveTerms,
  splitMultiplicativeFactors,
} from './algebraAstEngine.js';

const termMagnitude = (term) => String(term?.text ?? '').replace(/^[+-]\s*/, '');

const additiveResultExpression = (terms, pairs) => {
  const cancelled = new Set((pairs || []).flatMap((pair) => pair.indices || []));
  const remaining = (terms || []).filter((_, index) => !cancelled.has(index));
  let result = remaining.map((term) => term.text).join(' ').trim() || '0';
  result = result.replace(/^\+\s*/, '');
  return result;
};

const fractionResultExpression = (numerator, denominator, pairs) => {
  const numeratorCount = numerator.length;
  const cancelledNumerator = new Set();
  const cancelledDenominator = new Set();

  (pairs || []).forEach((pair) => {
    const [first, second] = pair.indices || [];
    [first, second].forEach((index) => {
      if (!Number.isInteger(index)) return;
      if (index < numeratorCount) cancelledNumerator.add(index);
      else cancelledDenominator.add(index - numeratorCount);
    });
  });

  const remainingNumerator = numerator.filter((_, index) => !cancelledNumerator.has(index));
  const remainingDenominator = denominator.filter((_, index) => !cancelledDenominator.has(index));

  const multiply = (items) => {
    if (!items.length) return '1';
    if (items.length === 1) return items[0].text;
    return items.map((item) => `(${item.text})`).join(' * ');
  };

  const numeratorText = multiply(remainingNumerator);
  if (!remainingDenominator.length) return numeratorText;
  return `(${numeratorText}) / (${multiply(remainingDenominator)})`;
};

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
        resultExpression: fractionResultExpression(numerator, denominator, structuralFactorPairs),
      };
    }

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
        resultExpression: fractionResultExpression(numerator, denominator, pairs),
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
      resultExpression: additiveResultExpression(terms, structuralAdditivePairs),
    };
  }

  const used = new Set();
  const visiblePairs = [];

  for (let i = 0; i < terms.length; i += 1) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < terms.length; j += 1) {
      if (used.has(j) || terms[i].sign === terms[j].sign) continue;

      const leftMagnitude = termMagnitude(terms[i]);
      const rightMagnitude = termMagnitude(terms[j]);
      if (!expressionsEquivalent(leftMagnitude, rightMagnitude, variable)) continue;

      used.add(i);
      used.add(j);
      visiblePairs.push({
        id: `additive-${visiblePairs.length}`,
        indices: [i, j],
      });
      break;
    }
  }

  if (visiblePairs.length) {
    return {
      kind: 'additive',
      terms,
      pairs: visiblePairs,
      tokenCount: terms.length,
      resultExpression: additiveResultExpression(terms, visiblePairs),
    };
  }

  if (targetExpression != null) {
    for (let i = 0; i < terms.length; i += 1) {
      for (let j = i + 1; j < terms.length; j += 1) {
        const remainderText = terms
          .filter((_, index) => index !== i && index !== j)
          .map((term) => term.text)
          .join(' ') || '0';
        try {
          if (expressionsEquivalent(remainderText, targetExpression, variable)) {
            const pair = { id: 'additive-0', indices: [i, j] };
            return {
              kind: 'additive',
              terms,
              pairs: [pair],
              tokenCount: terms.length,
              resultExpression: additiveResultExpression(terms, [pair]),
            };
          }
        } catch {
          // Keep searching.
        }
      }
    }
  }

  return null;
};
