// Shared answer-equivalence rules used by the browser, Teacher Path Simulator,
// and Cloud Functions. A mathematically correct response must not be rejected
// merely because MathLive serializes it differently from the authored key.
//
// Keep deterministic equivalence here rather than in individual renderers. The
// same student response should receive the same verdict everywhere MathMaster
// grades it.

const UNICODE_MINUS = /[−–—]/g;

const normalizeStructuralMathLive = (value) => String(value ?? '')
  .trim()
  .replace(UNICODE_MINUS, '-')
  .replace(/\\left|\\right/g, '')
  .replace(/\\dfrac/g, '\\frac')
  .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$1')
  // MathLive commonly serializes visible set braces as \{...\}, \lbrace...
  // \rbrace, or the same tokens wrapped in \left/\right. They are the same
  // mathematical delimiters as authored literal { ... } braces.
  .replace(/\\lbrace/g, '{')
  .replace(/\\rbrace/g, '}')
  .replace(/\\\{/g, '{')
  .replace(/\\\}/g, '}')
  .replace(/\\varnothing|\\emptyset|∅/g, '∅');

export const normalizeAnswer = (value) => normalizeStructuralMathLive(value)
  .replace(/\\cdot|\\times/g, '*')
  .replace(/\\infty|∞/g, 'inf')
  .replace(/\\cup|∪/g, 'u')
  .replace(/\\cap|∩/g, 'n')
  .replace(/\\leq?|≤/g, '<=')
  .replace(/\\geq?|≥/g, '>=')
  .replace(/\\neq?|≠/g, '!=')
  .replace(/\\,/g, '')
  .replace(/\{,\}/g, ',')
  .replace(/\s+/g, '')
  .toLowerCase();

export const asNumber = (value) => {
  const text = normalizeAnswer(value);
  if (!text) return null;

  const latexFraction = text.match(/^(-?)\\frac\{([^{}]+)\}\{([^{}]+)\}$/);
  if (latexFraction) {
    const numerator = Number(`${latexFraction[1]}${latexFraction[2]}`);
    const denominator = Number(latexFraction[3]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
  }

  const fraction = text.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
};

export const sameNumber = (left, right, tolerance = 1e-6) => {
  const a = asNumber(left);
  const b = asNumber(right);
  return a !== null && b !== null && Math.abs(a - b) <= tolerance;
};

export const sameText = (left, right) => normalizeAnswer(left) === normalizeAnswer(right);

const splitTopLevelCommaList = (value) => {
  const parts = [];
  let token = '';
  let roundDepth = 0;
  let squareDepth = 0;
  let braceDepth = 0;

  for (const char of String(value ?? '')) {
    if (char === '(') roundDepth += 1;
    else if (char === ')') roundDepth = Math.max(0, roundDepth - 1);
    else if (char === '[') squareDepth += 1;
    else if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
    else if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);

    if (char === ',' && roundDepth === 0 && squareDepth === 0 && braceDepth === 0) {
      parts.push(token.trim());
      token = '';
    } else {
      token += char;
    }
  }
  parts.push(token.trim());
  return parts;
};

/**
 * Parse finite roster-form set notation. Returns null when the response is not
 * written as a set, and [] for the empty set.
 *
 * Examples accepted as the same structure:
 *   {-4, -3, -2}
 *   \\{-4,-3,-2\\}
 *   \\left\\lbrace -4,-3,-2 \\right\\rbrace
 */
export const parseFiniteSetNotation = (value) => {
  const text = normalizeStructuralMathLive(value).trim();
  if (!text) return null;
  if (text === '∅') return [];
  if (!(text.startsWith('{') && text.endsWith('}'))) return null;
  const inner = text.slice(1, -1).trim();
  if (!inner) return [];
  const parts = splitTopLevelCommaList(inner);
  if (parts.some((part) => !part)) return null;
  return parts;
};

export const looksLikeFiniteSetNotation = (value) => parseFiniteSetNotation(value) !== null;

const sameAtomicValue = (left, right, tolerance = 1e-6) => (
  sameNumber(left, right, tolerance) || sameText(left, right)
);

const dedupeEquivalent = (values, tolerance) => {
  const unique = [];
  values.forEach((value) => {
    if (!unique.some((existing) => sameAtomicValue(value, existing, tolerance))) unique.push(value);
  });
  return unique;
};

/**
 * Compare two finite sets mathematically: element order and repeated roster
 * entries do not change a set. Braces are still required when a set is the
 * expected representation so a comma list is not silently accepted as roster
 * notation.
 */
export const sameFiniteSetNotation = (left, right, tolerance = 1e-6) => {
  const parsedLeft = parseFiniteSetNotation(left);
  const parsedRight = parseFiniteSetNotation(right);
  if (parsedLeft === null || parsedRight === null) return false;

  const a = dedupeEquivalent(parsedLeft, tolerance);
  const b = dedupeEquivalent(parsedRight, tolerance);
  if (a.length !== b.length) return false;

  return b.every((wanted) => {
    const index = a.findIndex((candidate) => sameAtomicValue(candidate, wanted, tolerance));
    if (index < 0) return false;
    a.splice(index, 1);
    return true;
  });
};

export const sameValue = (left, right, tolerance = 1e-6) => {
  const leftSet = parseFiniteSetNotation(left);
  const rightSet = parseFiniteSetNotation(right);
  if (leftSet !== null || rightSet !== null) {
    return leftSet !== null && rightSet !== null && sameFiniteSetNotation(left, right, tolerance);
  }
  return sameAtomicValue(left, right, tolerance);
};
