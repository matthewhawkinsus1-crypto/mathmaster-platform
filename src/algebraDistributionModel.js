// Interactive distribution: an outside multiplicative factor applied to an
// additive parenthetical group (e.g. `-(2/3)(x + 3)`), as its own algebra
// step distinct from simplification.
//
// Distribution may occur either as the whole side OR as one additive term on a
// side. That matters because a valid earlier move can produce
// `y = -(2/3)(x + 3) + 7`; distribution is still available inside that term.
import {
  expressionToLatex,
  simplifyExpression,
  splitAdditiveTerms,
  splitMultiplicativeFactors,
} from './algebraAstEngine.js';

// A factor the student authored with its own parentheses (e.g. the `(2/3)`
// in `-(2/3)(x+3)`) round-trips through mathjs's printer as `-(2 / 3)`.
// Strip exactly one redundant outer grouping for the factor chip/result.
const unwrapRedundantParens = (text) => {
  const trimmed = String(text).trim();
  const negative = trimmed.startsWith('-(') && trimmed.endsWith(')');
  const bare = !negative && trimmed.startsWith('(') && trimmed.endsWith(')');
  const body = negative ? trimmed.slice(2, -1) : bare ? trimmed.slice(1, -1) : null;
  if (body == null) return trimmed;
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '(') depth += 1;
    else if (body[i] === ')') {
      depth -= 1;
      if (depth < 0) return trimmed;
    }
  }
  if (depth !== 0) return trimmed;
  return negative ? `-${body}` : body;
};

const detectFactoredTerm = (expressionText) => {
  const factors = splitMultiplicativeFactors(expressionText);
  if (!factors) return null;

  // Only a parenthetical ADDITIVE GROUP in the numerator is a distribution
  // target. Denominator factors belong to the outside coefficient (for example
  // -2/3), not to the group itself.
  const withTerms = factors.numerator.map((factor) => ({
    factor,
    terms: splitAdditiveTerms(factor.text),
  }));
  const groupCandidates = withTerms
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => Array.isArray(entry.terms) && entry.terms.length >= 2);
  if (groupCandidates.length !== 1) return null;

  const group = groupCandidates[0];
  const otherNumeratorFactors = withTerms.filter((_, index) => index !== group.index);
  const denominatorFactors = factors.denominator || [];
  if (!otherNumeratorFactors.length && !denominatorFactors.length) return null;

  const numeratorText = otherNumeratorFactors.length
    ? otherNumeratorFactors
      .map((entry) => unwrapRedundantParens(entry.factor.text))
      .join(' * ')
    : '1';
  const denominatorText = denominatorFactors
    .map((factor) => unwrapRedundantParens(factor.text))
    .join(' * ');
  const simpleScalar = /^[+-]?(?:\d+(?:\.\d+)?|[A-Za-z])$/;
  const factorOperand = (value) => (
    simpleScalar.test(String(value).trim()) ? String(value).trim() : `(${value})`
  );
  const factorText = denominatorText
    ? `${factorOperand(numeratorText)} / ${factorOperand(denominatorText)}`
    : numeratorText;

  // Render from ONE canonical factor expression rather than concatenating
  // source factor LaTeX. This handles both grouped and flattened rational
  // coefficients and prevents a leading negative from being emitted twice.
  let factorLatex;
  try {
    factorLatex = expressionToLatex(factorText);
  } catch {
    const numeratorLatex = otherNumeratorFactors.map((entry) => entry.factor.latex).join('\\,') || '1';
    const denominatorLatex = denominatorFactors.map((factor) => factor.latex).join('\\,');
    factorLatex = denominatorLatex
      ? `\\frac{${numeratorLatex}}{${denominatorLatex}}`
      : numeratorLatex;
  }

  return {
    factorText,
    factorLatex,
    groupText: group.factor.text,
    terms: group.terms,
  };
};

const withAdditiveSign = (detected, sign) => {
  if (!detected || sign >= 0) return detected;
  let factorText;
  try {
    factorText = simplifyExpression(`-1 * (${detected.factorText})`);
  } catch {
    factorText = `-(${detected.factorText})`;
  }
  let factorLatex;
  try {
    factorLatex = expressionToLatex(factorText);
  } catch {
    factorLatex = `-${detected.factorLatex}`;
  }
  return { ...detected, factorText, factorLatex };
};

const detectOnSide = (side, expressionText) => {
  const sideTerms = splitAdditiveTerms(expressionText);
  if (!Array.isArray(sideTerms) || !sideTerms.length) return null;

  const candidates = sideTerms
    .map((term, sideTermIndex) => {
      // Additive-term splitting already separates the leading +/− from the
      // magnitude. Detect distribution on that unsigned magnitude and fold the
      // sign into the outside factor afterward. Parsing the signed term as a
      // whole can turn -3(2x-7) into one opaque unary-minus node, which is why
      // larger substitutions into a negative coefficient used to strand the
      // solver with no Distribute action.
      let detected = detectFactoredTerm(term.magnitudeText);
      if (!detected && term.sign < 0) {
        const directTerms = splitAdditiveTerms(term.magnitudeText);
        if (Array.isArray(directTerms) && directTerms.length >= 2) {
          detected = {
            factorText: '1',
            factorLatex: '1',
            groupText: term.magnitudeText,
            terms: directTerms,
          };
        }
      }
      detected = withAdditiveSign(detected, term.sign);
      return detected ? { ...detected, sideTermIndex } : null;
    })
    .filter(Boolean);

  // More than one distributable term on the same side is intentionally left
  // for a later enhancement rather than guessing which group the student meant.
  if (candidates.length !== 1) return null;

  return {
    ...candidates[0],
    side,
    // Store only presentation descriptors needed to rebuild the side after the
    // selected term is expanded. Grading continues to use the equation strings.
    sideTerms: sideTerms.map((term) => ({
      sign: term.sign,
      magnitudeText: term.magnitudeText,
      magnitudeLatex: term.magnitudeLatex,
      text: term.text,
      latex: term.latex,
    })),
  };
};

export const detectDistributableGroup = (equation) => {
  if (!equation) return null;
  return detectOnSide('left', equation.left) || detectOnSide('right', equation.right);
};

export const initDistributionState = (detected) => (detected ? {
  ...detected,
  placedIndices: [],
  armed: false,
} : null);

export const isDistributionComplete = (state) => Boolean(
  state && state.terms.length > 0 && state.placedIndices.length === state.terms.length,
);

export const armFactor = (state) => (
  state && !isDistributionComplete(state) ? { ...state, armed: true } : state
);

export const disarmFactor = (state) => (state ? { ...state, armed: false } : state);

export const placeOnTerm = (state, termIndex) => {
  if (!state || !state.armed) return state;
  if (termIndex < 0 || termIndex >= state.terms.length) return state;
  if (state.placedIndices.includes(termIndex)) return state;
  const placedIndices = [...state.placedIndices, termIndex];
  return {
    ...state,
    armed: placedIndices.length < state.terms.length,
    placedIndices,
  };
};

export const undoLastPlacement = (state) => {
  if (!state || !state.placedIndices.length) return state;
  return {
    ...state,
    placedIndices: state.placedIndices.slice(0, -1),
    armed: true,
  };
};

const signedTermText = (term) => (
  term.sign < 0 ? `-${term.magnitudeText}` : term.magnitudeText
);

/**
 * Expanded but deliberately UNSIMPLIFIED:
 * `-(2/3)(x + 3)` -> `(-2/3)(x) + (-2/3)(3)`.
 */
export const expandedGroupText = (state, { simplifyProducts = false } = {}) => {
  if (!isDistributionComplete(state)) return null;
  return state.terms
    .map((term) => {
      const product = `(${state.factorText})(${signedTermText(term)})`;
      if (!simplifyProducts) return product;
      try {
        const simplified = simplifyExpression(product);
        // MathJS may print a negative product as "-(6 * x)". Preserve the
        // product as its own term, but remove that redundant outer grouping so
        // the next Combine like terms step reads naturally as "-6x", not
        // "+ -(6x)".
        const negativeGroup = simplified.match(/^-\((.+)\)$/);
        return negativeGroup ? `-${negativeGroup[1]}` : simplified;
      } catch {
        return product;
      }
    })
    .join(' + ');
};

const appendOrdinaryTerm = (current, term) => {
  const magnitude = String(term?.magnitudeText || '').trim();
  if (!magnitude) return current;
  if (!current) return term.sign < 0 ? `-${magnitude}` : magnitude;
  return `${current}${term.sign < 0 ? ' - ' : ' + '}${magnitude}`;
};

const rebuildSideWithDistribution = (state, expanded) => {
  if (!Array.isArray(state.sideTerms) || state.sideTerms.length <= 1) return expanded;

  let result = '';
  state.sideTerms.forEach((term, index) => {
    if (index === state.sideTermIndex) {
      // The replacement already carries the selected term's sign in factorText.
      // If it is not first, adding a negative product is mathematically exact
      // and MathJS will present it as subtraction on the next render.
      result = result ? `${result} + ${expanded}` : expanded;
      return;
    }
    result = appendOrdinaryTerm(result, term);
  });
  return result;
};

/** Applies a completed distribution to the selected term of the full equation. */
export const commitDistribution = (equation, state, options = {}) => {
  const expanded = expandedGroupText(state, options);
  if (!expanded || !equation) return null;
  return {
    ...equation,
    [state.side]: rebuildSideWithDistribution(state, expanded),
  };
};
