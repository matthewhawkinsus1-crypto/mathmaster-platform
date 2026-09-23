import { parse } from 'mathjs';
import { splitAdditiveTerms } from './algebraAstEngine.js';

const EPS = 1e-9;

const mergeFactors = (left, right, sign = 1) => {
  const result = new Map(left);
  right.forEach((power, name) => {
    const next = Number(result.get(name) || 0) + (sign * Number(power || 0));
    if (Math.abs(next) < EPS) result.delete(name);
    else result.set(name, next);
  });
  return result;
};

const multiplyMonomials = (left, right) => ({
  coefficient: left.coefficient * right.coefficient,
  factors: mergeFactors(left.factors, right.factors),
});

const divideMonomials = (left, right) => {
  if (Math.abs(right.coefficient) < EPS) return null;
  return {
    coefficient: left.coefficient / right.coefficient,
    factors: mergeFactors(left.factors, right.factors, -1),
  };
};

const powerMonomial = (base, exponent) => {
  if (!Number.isFinite(exponent)) return null;
  const coefficient = base.coefficient ** exponent;
  if (!Number.isFinite(coefficient)) return null;
  const factors = new Map();
  base.factors.forEach((power, name) => {
    const next = power * exponent;
    if (Math.abs(next) >= EPS) factors.set(name, next);
  });
  return { coefficient, factors };
};

const decomposeNode = (node) => {
  if (!node) return null;
  if (node.type === 'ParenthesisNode') return decomposeNode(node.content);
  if (node.type === 'ConstantNode') {
    const value = Number(node.value);
    return Number.isFinite(value) ? { coefficient: value, factors: new Map() } : null;
  }
  if (node.type === 'SymbolNode') {
    return { coefficient: 1, factors: new Map([[node.name, 1]]) };
  }
  if (node.type !== 'OperatorNode') return null;

  if (node.fn === 'unaryMinus' && node.args?.length === 1) {
    const inner = decomposeNode(node.args[0]);
    return inner ? { coefficient: -inner.coefficient, factors: inner.factors } : null;
  }

  if (node.fn === 'multiply' && Array.isArray(node.args) && node.args.length >= 2) {
    return node.args.reduce((acc, arg) => {
      if (!acc) return null;
      const next = decomposeNode(arg);
      return next ? multiplyMonomials(acc, next) : null;
    }, { coefficient: 1, factors: new Map() });
  }

  if (node.fn === 'divide' && node.args?.length === 2) {
    const numerator = decomposeNode(node.args[0]);
    const denominator = decomposeNode(node.args[1]);
    return numerator && denominator ? divideMonomials(numerator, denominator) : null;
  }

  if (node.fn === 'pow' && node.args?.length === 2 && node.args[1]?.type === 'ConstantNode') {
    const base = decomposeNode(node.args[0]);
    const exponent = Number(node.args[1].value);
    return base ? powerMonomial(base, exponent) : null;
  }

  return null;
};

export const decomposeMonomial = (expression) => {
  try {
    const result = decomposeNode(parse(String(expression)));
    if (!result || !Number.isFinite(result.coefficient)) return null;
    return result;
  } catch {
    return null;
  }
};

export const monomialSignature = (expression) => {
  const decomposed = decomposeMonomial(expression);
  if (!decomposed) return null;
  const entries = [...decomposed.factors.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, power]) => `${name}^${Math.round(power * 1e9) / 1e9}`);
  return entries.length ? entries.join('*') : 'constant';
};

export const findLikeTermGroups = (expression) => {
  const terms = splitAdditiveTerms(expression) || [];
  const grouped = new Map();

  terms.forEach((term, index) => {
    const key = monomialSignature(term.text);
    if (!key) return;
    const list = grouped.get(key) || [];
    list.push(index);
    grouped.set(key, list);
  });

  return [...grouped.entries()]
    .filter(([, indices]) => indices.length >= 2)
    .map(([key, indices]) => ({ key, indices }));
};

const signedText = (term, isFirst) => {
  const magnitude = String(term.magnitudeText || '').trim();
  if (isFirst) return term.sign < 0 ? `-${magnitude}` : magnitude;
  return term.sign < 0 ? `- ${magnitude}` : `+ ${magnitude}`;
};

const serializeTerms = (terms) => terms.map((term, index) => signedText(term, index === 0)).join(' ');

export const selectedLikeTermInfo = (expression, indices) => {
  const terms = splitAdditiveTerms(expression) || [];
  const normalized = [...new Set((indices || []).map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < terms.length))]
    .sort((a, b) => a - b);
  if (normalized.length < 2) return { valid: false, reason: 'Choose at least two terms.' };

  const signatures = normalized.map((index) => monomialSignature(terms[index].text));
  if (signatures.some((value) => !value) || signatures.some((value) => value !== signatures[0])) {
    return { valid: false, reason: 'Those terms are not alike. Choose terms with the same variable part.' };
  }

  const selectedTerms = normalized.map((index) => terms[index]);
  return {
    valid: true,
    key: signatures[0],
    indices: normalized,
    selectedExpression: serializeTerms(selectedTerms),
  };
};

export const replacementIsSingleLikeTerm = (replacementExpression, expectedKey) => {
  const terms = splitAdditiveTerms(replacementExpression) || [];
  return terms.length === 1 && monomialSignature(terms[0].text) === expectedKey;
};

export const replaceSelectedLikeTerms = (expression, indices, replacementExpression) => {
  const terms = splitAdditiveTerms(expression) || [];
  const normalized = [...new Set((indices || []).map(Number))]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < terms.length)
    .sort((a, b) => a - b);
  if (normalized.length < 2) return null;

  const replacementTerms = splitAdditiveTerms(replacementExpression) || [];
  if (replacementTerms.length !== 1) return null;

  const selected = new Set(normalized);
  const insertionIndex = normalized[0];
  const nextTerms = [];
  terms.forEach((term, index) => {
    if (index === insertionIndex) nextTerms.push(replacementTerms[0]);
    if (!selected.has(index)) nextTerms.push(term);
  });

  if (!nextTerms.length) return null;
  const result = serializeTerms(nextTerms);
  try {
    parse(result);
    return result;
  } catch {
    return null;
  }
};
