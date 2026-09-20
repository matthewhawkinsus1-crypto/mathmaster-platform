// Interactive distribution: an outside multiplicative factor applied to an
// additive parenthetical group (e.g. `-(2/3)(x + 3)`), as its own algebra
// step distinct from simplification. See issue #297 part B.
//
// distribution = copy the factor to every signed term, unsimplified;
// simplification = evaluate the resulting products/signs (handled by the
// existing Rewrite/Simplify flow, unchanged by this module);
// solving = continue balancing (unchanged).
//
// Detection and reconstruction are built entirely on the AST utilities
// StepByStepAlgebraCore already uses for cancellation/term rendering
// (splitAdditiveTerms, splitMultiplicativeFactors) rather than a second
// parser or regex, per the issue's explicit requirement.
import { splitAdditiveTerms, splitMultiplicativeFactors } from './algebraAstEngine.js';

/**
 * Find a `factor * (term ± term ± ...)` shape on one side of the equation.
 *
 * Deliberately narrow, as the issue allows: the ENTIRE side must be exactly
 * one outside factor expression (which may itself be a product such as 2L)
 * times one additive group — not a factor buried inside a larger sum. Every
 * documented example in the issue (`y - 7 =
 * -(2/3)(x + 3)`, `-3(x - 4)`, ...) is a full side shaped exactly this way.
 */
// A factor the student authored with its own parentheses (e.g. the `(2/3)`
// in `-(2/3)(x+3)`) round-trips through mathjs's printer as `-(2 / 3)`. That
// is correct but visually double-wraps once this module wraps it again as
// `(factor)(term)`. Strip exactly one redundant outer grouping so the result
// matches the issue's own worked examples, never touching inner structure.
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
      if (depth < 0) return trimmed; // parens are not the outermost grouping
    }
  }
  if (depth !== 0) return trimmed;
  return negative ? `-${body}` : body;
};

const detectOnSide = (side, expressionText) => {
  const factors = splitMultiplicativeFactors(expressionText);
  if (!factors || factors.denominator.length) return null;
  const withTerms = factors.numerator.map((factor) => ({
    factor,
    terms: splitAdditiveTerms(factor.text),
  }));
  const groupCandidates = withTerms
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => Array.isArray(entry.terms) && entry.terms.length >= 2);
  if (groupCandidates.length !== 1) return null;
  const group = groupCandidates[0];
  const otherFactors = withTerms.filter((_, index) => index !== group.index);
  if (!otherFactors.length) return null;

  // The outside factor may itself be a product, e.g. 2L(x + w). Distribution
  // applies the whole outside product to every term, not just the nearest
  // atomic factor. Preserve the product structurally and let MathDisplay
  // typeset the factor chips from the constituent LaTeX.
  const factorParts = otherFactors.map((entry) => ({
    text: unwrapRedundantParens(entry.factor.text),
    latex: entry.factor.latex,
  }));
  return {
    side,
    factorText: factorParts.map((part) => part.text).join(' * '),
    factorLatex: factorParts.map((part) => part.latex).join('\\,'),
    groupText: group.factor.text,
    terms: group.terms,
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

export const armFactor = (state) => (state && !isDistributionComplete(state) ? { ...state, armed: true } : state);

export const disarmFactor = (state) => (state ? { ...state, armed: false } : state);

export const placeOnTerm = (state, termIndex) => {
  if (!state || !state.armed) return state;
  if (termIndex < 0 || termIndex >= state.terms.length) return state;
  if (state.placedIndices.includes(termIndex)) return state; // already received the factor
  const placedIndices = [...state.placedIndices, termIndex];
  // One pick-up means "carry this factor through the whole parenthetical
  // group." Keep it armed while unserved terms remain; disarm only when every
  // term has received a copy.
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
    // Undoing a placement returns the factor to the student's hand so the
    // missing destination can be corrected without an extra pick-up.
    armed: true,
  };
};

const signedTermText = (term) => (term.sign < 0 ? `-${term.magnitudeText}` : term.magnitudeText);

/**
 * The expanded-but-unsimplified replacement for the distributed side, e.g.
 * `-(2/3)(x) + (-2/3)(3)`. Each term keeps its own sign inside its own
 * parenthetical factor, joined by a plain `+`, exactly matching what the
 * issue's worked examples show — never folded/evaluated, so the existing
 * Rewrite/Simplify flow still has real work to do afterward.
 */
export const expandedGroupText = (state) => {
  if (!isDistributionComplete(state)) return null;
  return state.terms
    .map((term) => `(${state.factorText})(${signedTermText(term)})`)
    .join(' + ');
};

/** Applies a completed distribution to the full equation, returning the next equation state. */
export const commitDistribution = (equation, state) => {
  const expanded = expandedGroupText(state);
  if (!expanded || !equation) return null;
  return { ...equation, [state.side]: expanded };
};
