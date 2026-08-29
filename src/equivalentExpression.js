import {
  normalizeAlgebraicText,
  parsePolynomial,
  samePolynomial,
} from '../functions/shared/algebraicForm.mjs';

const stripBalancedOuterParens = (value) => {
  let text = String(value ?? '').trim();

  const enclosesWholeExpression = (candidate) => {
    if (!candidate.startsWith('(') || !candidate.endsWith(')')) return false;
    let depth = 0;
    for (let index = 0; index < candidate.length; index += 1) {
      if (candidate[index] === '(') depth += 1;
      else if (candidate[index] === ')') depth -= 1;
      if (depth === 0 && index < candidate.length - 1) return false;
      if (depth < 0) return false;
    }
    return depth === 0;
  };

  while (enclosesWholeExpression(text)) text = text.slice(1, -1).trim();
  return text;
};

const splitTopLevelQuotient = (value) => {
  const normalized = normalizeAlgebraicText(value);
  if (!normalized || normalized.includes('=')) return null;
  const text = stripBalancedOuterParens(normalized);

  let depth = 0;
  let slashIndex = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === '/' && depth === 0) {
      if (slashIndex >= 0) return null;
      slashIndex = index;
    }
    if (depth < 0) return null;
  }
  if (depth !== 0 || slashIndex <= 0 || slashIndex >= text.length - 1) return null;

  const numerator = parsePolynomial(stripBalancedOuterParens(text.slice(0, slashIndex)));
  const denominator = parsePolynomial(stripBalancedOuterParens(text.slice(slashIndex + 1)));
  if (!numerator || !denominator) return null;
  return { numerator, denominator };
};

/**
 * Mathematical equivalence for fields that explicitly opt into expression
 * grading. It accepts polynomial rearrangement and the same simple rational
 * function written with slash or MathLive's stacked \frac notation.
 *
 * It deliberately refuses equations. Form-sensitive tasks such as factoring,
 * vertex form, or slope-intercept form should not opt into this grading mode.
 */
export const sameEquivalentExpression = (left, right, tolerance = 1e-6) => {
  const leftText = String(left ?? '');
  const rightText = String(right ?? '');
  if (!leftText.trim() || !rightText.trim()) return false;
  if (leftText.includes('=') || rightText.includes('=')) return false;

  const leftPolynomial = parsePolynomial(leftText);
  const rightPolynomial = parsePolynomial(rightText);
  if (leftPolynomial && rightPolynomial) {
    return samePolynomial(leftPolynomial, rightPolynomial, tolerance);
  }

  const leftQuotient = splitTopLevelQuotient(leftText);
  const rightQuotient = splitTopLevelQuotient(rightText);
  if (!leftQuotient || !rightQuotient) return false;

  return samePolynomial(leftQuotient.numerator, rightQuotient.numerator, tolerance)
    && samePolynomial(leftQuotient.denominator, rightQuotient.denominator, tolerance);
};

export default sameEquivalentExpression;
