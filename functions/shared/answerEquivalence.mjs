// Shared answer-equivalence rules used by the browser, Teacher Path Simulator,
// and Cloud Functions. A mathematically correct response must not be rejected
// merely because MathLive serializes it differently from the authored key.
//
// Keep deterministic equivalence here rather than in individual renderers. The
// same student response should receive the same verdict everywhere MathMaster
// grades it.

import {
  expandLatexShorthand,
  parsePolynomial,
  polynomialDegree,
  sameLinearEquation,
  samePolynomial,
  splitEquationSides,
} from './algebraicForm.mjs';
import { stackDivisions } from './stackDivisions.mjs';
import { sameExpandedPolynomialExpression } from './expandedPolynomialExpressionEquivalence.mjs';
import { sameLinearInequality } from './linearInequalityEquivalence.mjs';

const UNICODE_MINUS = /[−–—]/g;

const normalizeStructuralMathLive = (value) => expandLatexShorthand(value)
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
  // ...and the same is true of interval brackets. Typing `[-5,7]` into a math
  // field serializes as `\left\lbrack-5,7\right\rbrack`, which every grader
  // used to read as a different answer from the `[-5,7]` in the answer key.
  .replace(/\\lbrack/g, '[')
  .replace(/\\rbrack/g, ']')
  .replace(/\\\[/g, '[')
  .replace(/\\\]/g, ']')
  .replace(/\\varnothing|\\emptyset|∅/g, '∅');

/**
 * One spelling for a division, whichever way it was written.
 *
 * An author types `L = 180/d^2` into the answer key. A student presses the
 * fraction key and the editor sends `L=\frac{180}{d^2}`. Those are the same
 * answer, and the grader marked the student wrong. Canonicalising both onto
 * `\frac` before any text comparison is what makes them agree — and it costs
 * nothing, because a division that cannot be read confidently is left alone.
 */
const canonicalizeDivisions = (value) => stackDivisions(value, { skipAsciiCalls: false });

export const normalizeAnswer = (value) => canonicalizeDivisions(normalizeStructuralMathLive(value))
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

const invertInequalityOperator = (operator) => ({
  '<': '>',
  '<=': '>=',
  '>': '<',
  '>=': '<=',
}[operator] || operator);

const canonicalSimpleInequality = (value) => {
  const text = normalizeAnswer(value);
  if (!text || text.includes('!=')) return null;

  // Range quantities are routinely written either as V or V(t), f or f(x).
  // In an inequality these name the same dependent quantity; the argument is
  // notation, not a second mathematical variable. Keep this deliberately
  // narrow: one function letter and one single-letter argument only.
  const quantityPattern = '[a-z](?:\\([a-z]\\))?';
  const canonicalQuantity = (variable) => {
    const match = /^([a-z])(?:\([a-z]\))?$/.exec(String(variable || ''));
    return match ? match[1] : null;
  };

  const constraint = (variable, operator, bound) => {
    const numeric = asNumber(bound);
    const quantity = canonicalQuantity(variable);
    if (!quantity || numeric === null) return null;
    const side = operator === '>' || operator === '>=' ? 'lower' : 'upper';
    return { variable: quantity, side, operator, bound: numeric };
  };

  const direct = text.match(new RegExp('^(' + quantityPattern + ')(<=|>=|<|>)(-?\\d+(?:\\.\\d+)?)$'));
  if (direct) {
    const item = constraint(direct[1], direct[2], direct[3]);
    return item ? { variable: item.variable, constraints: [item] } : null;
  }

  const reversed = text.match(new RegExp('^(-?\\d+(?:\\.\\d+)?)(<=|>=|<|>)(' + quantityPattern + ')$'));
  if (reversed) {
    const item = constraint(reversed[3], invertInequalityOperator(reversed[2]), reversed[1]);
    return item ? { variable: item.variable, constraints: [item] } : null;
  }

  const chained = text.match(new RegExp('^(-?\\d+(?:\\.\\d+)?)(<=|>=|<|>)(' + quantityPattern + ')(<=|>=|<|>)(-?\\d+(?:\\.\\d+)?)$'));
  if (!chained) return null;

  const first = constraint(chained[3], invertInequalityOperator(chained[2]), chained[1]);
  const second = constraint(chained[3], chained[4], chained[5]);
  if (!first || !second) return null;
  return {
    variable: first.variable,
    constraints: [first, second].sort((a, b) => a.side.localeCompare(b.side)),
  };
};

export const sameSimpleInequality = (left, right, tolerance = 1e-6) => {
  const a = canonicalSimpleInequality(left);
  const b = canonicalSimpleInequality(right);
  if (!a || !b || a.variable !== b.variable || a.constraints.length !== b.constraints.length) return false;
  return a.constraints.every((constraint, index) => {
    const other = b.constraints[index];
    return constraint.side === other.side
      && constraint.operator === other.operator
      && Math.abs(constraint.bound - other.bound) <= tolerance;
  });
};

const sameAtomicValue = (left, right, tolerance = 1e-6) => (
  sameNumber(left, right, tolerance) || sameText(left, right)
);


/**
 * Compare an inverse-function equation without treating f^{-1}(x) as a
 * polynomial variable.
 *
 * The generic linear-equation fallback intentionally cannot parse function
 * notation on the left side. That meant a student could write the exact visible
 * inverse equation and still be marked wrong merely because MathLive serialized
 * the right side as a stacked fraction and the bank key used a slash.
 *
 * We keep the requested FORM strict:
 *   - both equations must put the same inverse-function name on the left;
 *   - only the right-hand linear polynomial is compared algebraically;
 *   - degree > 1 is refused, just like sameLinearEquation.
 */
const inverseFunctionHead = (value) => {
  const normalized = normalizeStructuralMathLive(value)
    .replace(/\s+/g, '')
    .replace(/⁻¹/g, '^-1')
    .replace(/\^\{\s*-1\s*\}/g, '^-1')
    .toLowerCase();
  const match = /^([a-z])\^-1\(([a-z])\)$/.exec(normalized);
  return match ? `${match[1]}^-1(${match[2]})` : null;
};

export const sameInverseFunctionEquation = (left, right, tolerance = 1e-6) => {
  const a = splitEquationSides(left);
  const b = splitEquationSides(right);
  if (!a || !b) return false;

  const leftHead = inverseFunctionHead(a.left);
  const rightHead = inverseFunctionHead(b.left);
  if (!leftHead || !rightHead || leftHead !== rightHead) return false;

  const one = parsePolynomial(a.right);
  const two = parsePolynomial(b.right);
  if (!one || !two) return false;
  if (polynomialDegree(one) > 1 || polynomialDegree(two) > 1) return false;
  return samePolynomial(one, two, tolerance);
};


/**
 * Compare two equations that are BOTH written in expanded polynomial form.
 *
 * This is intentionally narrower than "algebraically equivalent polynomial".
 * A question that asks for standard form should accept:
 *
 *   y = 1*x^2 + (-6)*x + (1)
 *   y = x^2 - 6x + 1
 *
 * because those are merely machine-vs-human spellings of the SAME expanded
 * form. But it should NOT silently accept vertex/factored form:
 *
 *   y = (x - 3)^2 - 8
 *
 * even though that expands to the same polynomial. Form is part of the skill
 * in many Algebra I/II questions.
 */
const hasVariableGrouping = (value) => {
  const text = normalizeStructuralMathLive(value).replace(/\s+/g, '');
  // Parentheses/brackets containing a variable AND an addition/subtraction
  // are structural algebra groups (vertex/factored form), not harmless
  // parentheses around a generated numeric coefficient such as (-6).
  return /[\(\[][^)\]]*[A-Za-z][^)\]]*[+\-][^)\]]*[\)\]]/.test(text);
};


/**
 * Normalize cosmetic machine-vs-human differences WITHOUT changing algebraic
 * form or term order.
 *
 * Examples that should become identical:
 *   f(x)=2*(x-(4))^2+(-3)
 *   f(x)=2(x-4)^2-3
 *
 *   y=1*x^2+(-6)*x+(1)
 *   y=x^2-6x+1
 *
 * This is intentionally NOT an expander or simplifier. It does not transform
 * vertex form into standard form, factor, distribute, reorder terms, or move
 * anything across the equals sign.
 */
const normalizeFormPreservingSide = (value) => {
  // Remove generator bookkeeping around SINGLE numeric parameters BEFORE
  // structural MathLive normalization. This ordering matters for radicals:
  //
  //   sqrt(x-(1))  -> sqrt(x-1) -> \\sqrt{x-1}
  //
  // If the parentheses are removed only AFTER `normalizeStructuralMathLive`,
  // the first spelling is still ASCII `sqrt(...)` while the student spelling
  // has already become LaTeX `\\sqrt{...}`, and a correct answer is rejected.
  //
  // Settling signs here is equally important:
  //   x-(-5) -> x+5
  //   x+(-5) -> x-5
  let radicalReady = String(value ?? '')
    .replace(/\((-?\d+(?:\.\d+)?)\)/g, '$1');

  for (let guard = 0; guard < 4; guard += 1) {
    const next = radicalReady
      .replace(/\+\+/g, '+')
      .replace(/\+-/g, '-')
      .replace(/-\+/g, '-')
      .replace(/--/g, '+');
    if (next === radicalReady) break;
    radicalReady = next;
  }

  // A student commonly writes 8sqrt(x) while a generator stores 8*sqrt(x).
  // Insert only the missing multiplication marker before the named radical
  // call BEFORE MathLive/ASCII radical normalization.
  radicalReady = radicalReady
    .replace(/([0-9A-Za-z)\]])sqrt\s*\(/g, '$1*sqrt(');

  let text = canonicalizeDivisions(normalizeStructuralMathLive(radicalReady))
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\s+/g, '')
    .replace(/\^\{(-?\d+)\}/g, '^$1');

  // Parentheses around generated numeric parameters are bookkeeping:
  //   x-(4) -> x-4
  //   x-(-2) -> x--2 -> x+2
  //   +(-3) -> +-3 -> -3
  // They are not algebraic grouping around a variable expression.
  text = text.replace(/\((-?\d+(?:\.\d+)?)\)/g, '$1');

  // Settle adjacent signs created by removing numeric bookkeeping parentheses.
  for (let guard = 0; guard < 4; guard += 1) {
    const next = text
      .replace(/\+\+/g, '+')
      .replace(/\+-/g, '-')
      .replace(/-\+/g, '-')
      .replace(/--/g, '+');
    if (next === text) break;
    text = next;
  }

  // An explicit multiplication mark next to a variable/group is just a typing
  // style. Do NOT remove 2*3, because turning it into 23 would change value.
  text = text
    .replace(/([0-9A-Za-z)\]])\*(?=[A-Za-z(])/g, '$1')
    .replace(/([0-9A-Za-z)\]])\*(?=\\sqrt\{)/g, '$1')
    .replace(/([A-Za-z)\]])\*(?=\()/g, '$1');

  // Suppress a coefficient of one only where algebra convention suppresses it.
  // 1x -> x, 1(x+2) -> (x+2), -1x -> -x.
  text = text
    .replace(/^1(?=[A-Za-z(])/g, '')
    .replace(/^\-1(?=[A-Za-z(])/g, '-')
    .replace(/([+\-])1(?=[A-Za-z(])/g, '$1');

  return text;
};

export const sameFormPreservingEquation = (left, right) => {
  const a = splitEquationSides(left);
  const b = splitEquationSides(right);
  if (!a || !b) return false;

  return normalizeFormPreservingSide(a.left) === normalizeFormPreservingSide(b.left)
    && normalizeFormPreservingSide(a.right) === normalizeFormPreservingSide(b.right);
};


/**
 * The same form-preserving comparison for answer FIELDS that are expressions
 * rather than equations.
 *
 * This is the category the mass audit just exposed:
 *
 *   (x-11)*(x^2+11*x+121)
 *   (x-11)(x^{2}+11x+121)
 *
 * Those are the same factored difference-of-cubes form. The only differences
 * are explicit multiplication signs and MathLive's braces around an exponent.
 *
 * This comparator deliberately refuses anything containing "=" and uses the
 * same cosmetic-only normalizer as the equation comparator. It never expands,
 * factors, distributes, reorders factors, or simplifies a different form.
 */
export const sameFormPreservingExpression = (left, right) => {
  const a = String(left ?? '').trim();
  const b = String(right ?? '').trim();
  if (!a || !b) return false;
  if (a.includes('=') || b.includes('=')) return false;
  return normalizeFormPreservingSide(a) === normalizeFormPreservingSide(b);
};

export const sameExpandedPolynomialEquation = (left, right, tolerance = 1e-6) => {
  const a = splitEquationSides(left);
  const b = splitEquationSides(right);
  if (!a || !b) return false;

  // Preserve which quantity/function is being defined.
  if (!sameText(a.left, b.left)) return false;

  // Do not turn a form-specific question into a generic "same graph" grader.
  if (hasVariableGrouping(a.right) || hasVariableGrouping(b.right)) return false;

  const one = parsePolynomial(a.right);
  const two = parsePolynomial(b.right);
  if (!one || !two) return false;
  if (polynomialDegree(one) > 8 || polynomialDegree(two) > 8) return false;

  return samePolynomial(one, two, tolerance);
};

/**
 * Compare polynomial EQUATIONS as relations rather than as a requested form.
 *
 * This is deliberately NOT called by sameValue. It is opt-in from private
 * grading metadata for constructs such as a parabola equation, where
 *
 *   (x-h)^2 = 4p(y-k)
 *   4p(y-k) = (x-h)^2
 *   y = (x-h)^2/(4p) + k
 *
 * are the same mathematical equation and should all grade the same. Algebra
 * questions that ask for a specific form keep the existing strict comparators.
 */
export const samePolynomialEquationRelation = (left, right, tolerance = 1e-6) => {
  const relationPolynomial = (value) => {
    const sides = splitEquationSides(value);
    if (!sides) return null;
    const lhs = parsePolynomial(sides.left);
    const rhs = parsePolynomial(sides.right);
    if (!lhs || !rhs) return null;
    if (polynomialDegree(lhs) > 8 || polynomialDegree(rhs) > 8) return null;

    const delta = new Map(lhs);
    for (const [key, coefficient] of rhs) {
      delta.set(key, (delta.get(key) || 0) - coefficient);
    }
    for (const [key, coefficient] of [...delta.entries()]) {
      if (Math.abs(coefficient) <= tolerance) delta.delete(key);
    }
    return delta.size ? delta : null;
  };

  const a = relationPolynomial(left);
  const b = relationPolynomial(right);
  if (!a || !b) return false;

  const keys = new Set([...a.keys(), ...b.keys()]);
  let ratio = null;
  for (const key of keys) {
    const av = a.get(key) || 0;
    const bv = b.get(key) || 0;
    if (Math.abs(av) <= tolerance && Math.abs(bv) <= tolerance) continue;
    if (Math.abs(av) <= tolerance || Math.abs(bv) <= tolerance) return false;
    const current = bv / av;
    if (!Number.isFinite(current) || Math.abs(current) <= tolerance) return false;
    if (ratio === null) ratio = current;
    else if (Math.abs(current - ratio) > tolerance * Math.max(1, Math.abs(ratio))) return false;
  }
  return ratio !== null;
};


/**
 * Compare absolute-value linear equations by the solution set they define.
 *
 * This is opt-in for modeling/formulation fields. It accepts harmless
 * equivalents such as |x-5|=3, |-x+5|=3, or the same equation with its sides
 * reversed, without changing the form-sensitive default equation grader.
 */
export const sameAbsoluteValueLinearEquation = (left, right, tolerance = 1e-6) => {
  const parse = (value) => {
    const sides = splitEquationSides(value);
    if (!sides) return null;

    const readAbsoluteSide = (side) => {
      const normalized = normalizeStructuralMathLive(side)
        .replace(/\\lvert|\\rvert|\\vert/g, '|')
        .replace(/\\operatorname\{abs\}/g, 'abs')
        .replace(/\\abs/g, 'abs')
        .trim();

      let inner = null;
      const bars = normalized.match(/^\|(.+)\|$/);
      const call = normalized.match(/^abs\((.+)\)$/i);
      if (bars) inner = bars[1];
      else if (call) inner = call[1];
      if (!inner) return null;

      const poly = parsePolynomial(inner);
      if (!poly || polynomialDegree(poly) > 1) return null;
      const variableTerms = [...poly.entries()].filter(([key]) => key !== '');
      if (variableTerms.length !== 1) return null;
      const [variable, coefficient] = variableTerms[0];
      if (!/^[a-z]$/.test(variable) || Math.abs(coefficient) <= tolerance) return null;
      return {
        variable,
        coefficient,
        constant: poly.get('') || 0,
      };
    };

    const leftAbs = readAbsoluteSide(sides.left);
    const rightAbs = readAbsoluteSide(sides.right);
    const leftConstant = asNumber(sides.left);
    const rightConstant = asNumber(sides.right);

    let absSide = null;
    let distanceSide = null;
    if (leftAbs && rightConstant !== null) {
      absSide = leftAbs;
      distanceSide = rightConstant;
    } else if (rightAbs && leftConstant !== null) {
      absSide = rightAbs;
      distanceSide = leftConstant;
    } else {
      return null;
    }

    if (distanceSide < -tolerance) {
      return { variable: absSide.variable, empty: true };
    }

    return {
      variable: absSide.variable,
      empty: false,
      center: -absSide.constant / absSide.coefficient,
      distance: Math.max(0, distanceSide) / Math.abs(absSide.coefficient),
    };
  };

  const a = parse(left);
  const b = parse(right);
  if (!a || !b || a.variable !== b.variable || a.empty !== b.empty) return false;
  if (a.empty) return true;
  return Math.abs(a.center - b.center) <= tolerance
    && Math.abs(a.distance - b.distance) <= tolerance;
};

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


/**
 * Compare structured modeling equations while allowing only harmless
 * commutativity of top-level additive terms and reversal of equation sides.
 *
 * This is deliberately narrower than algebraic equation equivalence. It is
 * intended for authored rational-model fields such as work-rate equations,
 * where 1/a + 1/b = 1/t and 1/b + 1/a = 1/t are the same model, but moving or
 * cancelling variable-dependent terms would change the formulation being
 * assessed.
 */
export const sameCommutativeModelEquation = (left, right) => {
  const canonicalSide = (value) => {
    const text = normalizeAnswer(value);
    if (!text) return null;
    const terms = [];
    let token = '';
    let sign = '+';
    let roundDepth = 0;
    let squareDepth = 0;
    let braceDepth = 0;

    const push = () => {
      if (!token) return;
      terms.push(`${sign}${token}`);
      token = '';
    };

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '(') roundDepth += 1;
      else if (char === ')') roundDepth = Math.max(0, roundDepth - 1);
      else if (char === '[') squareDepth += 1;
      else if (char === ']') squareDepth = Math.max(0, squareDepth - 1);
      else if (char === '{') braceDepth += 1;
      else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);

      const topLevel = roundDepth === 0 && squareDepth === 0 && braceDepth === 0;
      if (topLevel && (char === '+' || char === '-') && token) {
        push();
        sign = char;
      } else if (topLevel && (char === '+' || char === '-') && !token) {
        sign = char;
      } else {
        token += char;
      }
    }
    push();
    return terms.sort().join('');
  };

  const a = splitEquationSides(left);
  const b = splitEquationSides(right);
  if (!a || !b) return false;

  const al = canonicalSide(a.left);
  const ar = canonicalSide(a.right);
  const bl = canonicalSide(b.left);
  const br = canonicalSide(b.right);
  if (!al || !ar || !bl || !br) return false;

  return (al === bl && ar === br) || (al === br && ar === bl);
};


const canonicalSetBuilderNotation = (value) => {
  const text = normalizeAnswer(value)
    .replace(/\\mathbb\{r\}|ℝ/g, 'r')
    .replace(/\\in|∈/g, 'in')
    .replace(/\\mid|∣|｜/g, '|')
    .replace(/\\colon/g, ':')
    .replace(/\\land|∧|&&/g, '&')
    .replace(/\band\b/g, '&')
    .replace(/;/g, '&');

  const match = /^\{([xy])(?:inr)?[|:]([^{}]+)\}$/.exec(text);
  if (!match) return null;

  const variable = match[1];
  const conditionText = match[2]
    .replace(/,+/g, '&')
    .replace(/&+/g, '&')
    .replace(/^&|&$/g, '');
  if (!conditionText) return null;

  const invert = (operator) => ({
    '<': '>',
    '<=': '>=',
    '>': '<',
    '>=': '<=',
  }[operator] || operator);

  const atoms = conditionText.split('&').filter(Boolean).map((condition) => {
    const direct = new RegExp('^' + variable + '(!=|<=|>=|<|>)(-?\\d+(?:\\.\\d+)?)
  const leftSet = parseFiniteSetNotation(left);
  const rightSet = parseFiniteSetNotation(right);
  if (leftSet !== null || rightSet !== null) {
    return leftSet !== null && rightSet !== null && sameFiniteSetNotation(left, right, tolerance);
  }
  if (sameAtomicValue(left, right, tolerance)) return true;
  if (sameSimpleInequality(left, right, tolerance)) return true;
  if (sameLinearInequality(left, right, tolerance)) return true;
  if (sameFormPreservingEquation(left, right)) return true;
  if (sameFormPreservingExpression(left, right)) return true;
  // Expanded polynomial answers are mathematical expressions, so harmless
  // term order and coefficient arithmetic must not make a correct student
  // response wrong. The comparator is deliberately form-specific: if either
  // side contains a grouped variable expression such as (x+2)(x+3), it
  // refuses rather than silently turning a factoring task into expansion.
  if (sameExpandedPolynomialExpression(left, right, tolerance)) return true;
  if (sameInverseFunctionEquation(left, right, tolerance)) return true;
  if (sameExpandedPolynomialEquation(left, right, tolerance)) return true;
  // LAST RESORT, and only for equations. Text equality already handled every
  // spelling the author thought to list; this catches the ones they did not —
  // an unreduced slope, a decimal for a fraction, a `\frac` from the keypad.
  // It compares side against side, so it cannot accept a different FORM of the
  // same line, and it refuses above degree one so it cannot silently grade a
  // "simplify" or "vertex form" question. See functions/shared/algebraicForm.mjs.
  return sameLinearEquation(left, right, tolerance);
};
).exec(condition);
    if (direct) return {
      variable,
      operator: direct[1],
      bound: Number(direct[2]),
    };

    const reversed = new RegExp('^(-?\\d+(?:\\.\\d+)?)(<=|>=|<|>)' + variable + '
  const leftSet = parseFiniteSetNotation(left);
  const rightSet = parseFiniteSetNotation(right);
  if (leftSet !== null || rightSet !== null) {
    return leftSet !== null && rightSet !== null && sameFiniteSetNotation(left, right, tolerance);
  }
  if (sameAtomicValue(left, right, tolerance)) return true;
  if (sameSimpleInequality(left, right, tolerance)) return true;
  if (sameLinearInequality(left, right, tolerance)) return true;
  if (sameFormPreservingEquation(left, right)) return true;
  if (sameFormPreservingExpression(left, right)) return true;
  // Expanded polynomial answers are mathematical expressions, so harmless
  // term order and coefficient arithmetic must not make a correct student
  // response wrong. The comparator is deliberately form-specific: if either
  // side contains a grouped variable expression such as (x+2)(x+3), it
  // refuses rather than silently turning a factoring task into expansion.
  if (sameExpandedPolynomialExpression(left, right, tolerance)) return true;
  if (sameInverseFunctionEquation(left, right, tolerance)) return true;
  if (sameExpandedPolynomialEquation(left, right, tolerance)) return true;
  // LAST RESORT, and only for equations. Text equality already handled every
  // spelling the author thought to list; this catches the ones they did not —
  // an unreduced slope, a decimal for a fraction, a `\frac` from the keypad.
  // It compares side against side, so it cannot accept a different FORM of the
  // same line, and it refuses above degree one so it cannot silently grade a
  // "simplify" or "vertex form" question. See functions/shared/algebraicForm.mjs.
  return sameLinearEquation(left, right, tolerance);
};
).exec(condition);
    if (reversed) return {
      variable,
      operator: invert(reversed[2]),
      bound: Number(reversed[1]),
    };

    return null;
  });

  if (atoms.some((atom) => !atom || !Number.isFinite(atom.bound))) return null;

  const deduped = [];
  for (const atom of atoms) {
    if (!deduped.some((entry) => entry.operator === atom.operator && entry.bound === atom.bound)) {
      deduped.push(atom);
    }
  }

  deduped.sort((a, b) => (
    a.operator.localeCompare(b.operator) || a.bound - b.bound
  ));
  return { variable, atoms: deduped };
};

/**
 * Compare the simple set-builder forms used for rational-function domain/range
 * restrictions. This is opt-in so a finite roster set such as {2,5} keeps its
 * existing semantics.
 *
 * Accepted harmless notation differences include:
 *   {x | x != 3}
 *   {x ∈ R : x ≠ 3}
 *   \{x\in\mathbb{R}\mid x\ne 3\}
 *
 * Multiple restrictions may be reordered. The comparator deliberately refuses
 * compound algebra, unions, or predicates it cannot parse rather than guessing.
 */
export const sameSetBuilderNotation = (left, right, tolerance = 1e-6) => {
  const a = canonicalSetBuilderNotation(left);
  const b = canonicalSetBuilderNotation(right);
  if (!a || !b || a.variable !== b.variable || a.atoms.length !== b.atoms.length) return false;
  return a.atoms.every((atom, index) => (
    atom.operator === b.atoms[index].operator
    && Math.abs(atom.bound - b.atoms[index].bound) <= tolerance
  ));
};

export const sameValue = (left, right, tolerance = 1e-6) => {
  const leftSet = parseFiniteSetNotation(left);
  const rightSet = parseFiniteSetNotation(right);
  if (leftSet !== null || rightSet !== null) {
    return leftSet !== null && rightSet !== null && sameFiniteSetNotation(left, right, tolerance);
  }
  if (sameAtomicValue(left, right, tolerance)) return true;
  if (sameSimpleInequality(left, right, tolerance)) return true;
  if (sameLinearInequality(left, right, tolerance)) return true;
  if (sameFormPreservingEquation(left, right)) return true;
  if (sameFormPreservingExpression(left, right)) return true;
  // Expanded polynomial answers are mathematical expressions, so harmless
  // term order and coefficient arithmetic must not make a correct student
  // response wrong. The comparator is deliberately form-specific: if either
  // side contains a grouped variable expression such as (x+2)(x+3), it
  // refuses rather than silently turning a factoring task into expansion.
  if (sameExpandedPolynomialExpression(left, right, tolerance)) return true;
  if (sameInverseFunctionEquation(left, right, tolerance)) return true;
  if (sameExpandedPolynomialEquation(left, right, tolerance)) return true;
  // LAST RESORT, and only for equations. Text equality already handled every
  // spelling the author thought to list; this catches the ones they did not —
  // an unreduced slope, a decimal for a fraction, a `\frac` from the keypad.
  // It compares side against side, so it cannot accept a different FORM of the
  // same line, and it refuses above degree one so it cannot silently grade a
  // "simplify" or "vertex form" question. See functions/shared/algebraicForm.mjs.
  return sameLinearEquation(left, right, tolerance);
};
