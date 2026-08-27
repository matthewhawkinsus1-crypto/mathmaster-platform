const clean = (value) => String(value ?? '').trim();

const normalizeName = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

const FORMAT_SYMBOLS = Object.freeze({
  orderedpair: ['(', ',', ')'],
  coordinate: ['(', ',', ')'],
  coordinates: ['(', ',', ')'],
  point: ['(', ',', ')'],
  interval: ['(', ')', '[', ']', '∞', '∪'],
  intervalnotation: ['(', ')', '[', ']', '∞', '∪'],
  set: ['{', ',', '}'],
  setnotation: ['{', ',', '}'],
  inequality: ['<', '≤', '>', '≥'],
  inequalitynotation: ['<', '≤', '>', '≥'],
  function: ['x', '(', ')'],
  functionrule: ['x', '(', ')'],
});

const PROFILE_SYMBOLS = Object.freeze({
  interval: FORMAT_SYMBOLS.interval,
  set: FORMAT_SYMBOLS.set,
  inequality: FORMAT_SYMBOLS.inequality,
  function: FORMAT_SYMBOLS.function,
  equation: ['x', '(', ')', '='],
  'basic+set': FORMAT_SYMBOLS.set,
});

const STATIC_REQUIRED_TOOLS = Object.freeze({
  '(': { label: '(', command: '(', ariaLabel: 'Insert open parenthesis' },
  ')': { label: ')', command: ')', ariaLabel: 'Insert close parenthesis' },
  ',': { label: ',', command: ',', ariaLabel: 'Insert comma' },
  '[': { label: '[', command: '[', ariaLabel: 'Insert open bracket' },
  ']': { label: ']', command: ']', ariaLabel: 'Insert close bracket' },
  '{': { label: '{', command: '\\lbrace', ariaLabel: 'Insert opening set brace' },
  '}': { label: '}', command: '\\rbrace', ariaLabel: 'Insert closing set brace' },
  '∞': { label: '∞', command: '\\infty', ariaLabel: 'Insert positive infinity' },
  '∪': { label: '∪', command: '\\cup', ariaLabel: 'Insert union' },
  '∅': { label: '∅', command: '\\varnothing', ariaLabel: 'Insert empty set' },
  '<': { label: '<', command: '<', ariaLabel: 'Insert less than' },
  '≤': { label: '≤', command: '\\le', ariaLabel: 'Insert less than or equal to' },
  '>': { label: '>', command: '>', ariaLabel: 'Insert greater than' },
  '≥': { label: '≥', command: '\\ge', ariaLabel: 'Insert greater than or equal to' },
  '≠': { label: '≠', command: '\\ne', ariaLabel: 'Insert not equal to' },
  '=': { label: '=', command: '=', ariaLabel: 'Insert equals sign' },
  '−': { label: '−', command: '-', ariaLabel: 'Insert negative sign' },
  '-': { label: '−', command: '-', ariaLabel: 'Insert negative sign' },
  'π': { label: 'π', command: '\\pi', ariaLabel: 'Insert pi' },
  '√': { label: '√', command: '\\sqrt{#0}', ariaLabel: 'Insert square root' },
  'ⁿ√': { label: 'ⁿ√', command: '\\sqrt[#?]{#0}', ariaLabel: 'Insert nth root' },
  'a⁄b': { label: 'a⁄b', command: '\\frac{#0}{#?}', ariaLabel: 'Insert stacked fraction' },
  'xⁿ': { label: 'xⁿ', command: '#@^{#?}', ariaLabel: 'Insert exponent' },
  '|': { label: '|', command: '|', ariaLabel: 'Insert vertical bar' },
  ':': { label: ':', command: ':', ariaLabel: 'Insert colon' },
});

const normalizeExplicitSymbols = (symbols) => {
  if (!Array.isArray(symbols)) return [];
  return symbols.map(clean).filter(Boolean);
};

const flattenAnswerValues = (value, out = [], depth = 0) => {
  if (depth > 5 || value == null) return out;
  if (['string', 'number', 'boolean'].includes(typeof value)) {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => flattenAnswerValues(entry, out, depth + 1));
    return out;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((entry) => flattenAnswerValues(entry, out, depth + 1));
  }
  return out;
};

const normalizedMathText = (value) => String(value ?? '')
  .replace(/\\left|\\right/g, '')
  .replace(/\\operatorname\{[^}]+\}/g, '')
  .replace(/\\text\{[^}]*\}/g, '')
  .replace(/\\(?:frac|sqrt|infty|cup|varnothing|emptyset|leq?|geq?|neq?|pi|lbrace|rbrace)\b/g, ' ')
  .replace(/\b(?:sqrt|infinity|inf|pi)\b/gi, ' ');

// Infer only the keys needed to TYPE the already-resolved mathematical answer.
// This never changes grading and never exposes an answer to the student.
export const inferRequiredAnswerSymbols = (values = []) => {
  const text = flattenAnswerValues(values).join(' ');
  if (!text) return [];

  const required = [];
  const add = (symbol) => { if (symbol && !required.includes(symbol)) required.push(symbol); };

  if (/\(/.test(text) || /\\left\s*\(/.test(text)) add('(');
  if (/\)/.test(text) || /\\right\s*\)/.test(text)) add(')');
  if (/,/.test(text)) add(',');
  const latexGrouping = /\\(?:frac|sqrt|text|operatorname)\b/.test(text);
  if (/(^|∪|\\cup)\s*\[/.test(text)) add('[');
  if (/\]\s*(?:$|∪|\\cup)/.test(text)) add(']');
  if (/\\lbrace|\\\{/.test(text) || (!latexGrouping && /\{/.test(text))) add('{');
  if (/\\rbrace|\\\}/.test(text) || (!latexGrouping && /\}/.test(text))) add('}');
  if (/∞|\\infty|\b(?:infinity|inf)\b/i.test(text)) add('∞');
  if (/∪|\\cup/.test(text)) add('∪');
  if (/∅|\\varnothing|\\emptyset/.test(text)) add('∅');
  if (/≤|\\leq?\b/.test(text)) add('≤');
  if (/≥|\\geq?\b/.test(text)) add('≥');
  if (/≠|\\neq?\b/.test(text)) add('≠');
  if (/(^|[^<])<([^=]|$)/.test(text)) add('<');
  if (/(^|[^>])>([^=]|$)/.test(text)) add('>');
  if (/=/.test(text)) add('=');
  if (/π|\\pi\b|\bpi\b/i.test(text)) add('π');
  if (/√|\\sqrt|\bsqrt\b/i.test(text)) add('√');
  if (/\\sqrt\s*\[/.test(text)) add('ⁿ√');
  if (/\\frac|\d\s*\/\s*\d|[A-Za-z)]\s*\/\s*[A-Za-z0-9(]/.test(text)) add('a⁄b');
  if (/\^|[⁰¹²³⁴⁵⁶⁷⁸⁹]|⁻¹/.test(text)) add('xⁿ');
  if (/\|/.test(text)) add('|');
  if (/:/.test(text)) add(':');

  const variableText = normalizedMathText(text);
  const letters = variableText.match(/[A-Za-z]/g) || [];
  letters.forEach(add);
  const greekLetters = variableText.match(/[\u0370-\u03FF]/g) || [];
  greekLetters.forEach(add);
  return required;
};

// Resolve the semantic answer-entry contract used by both Preflight and MathInput.
export const resolveRequiredAnswerSymbols = ({
  answerFormat = '',
  toolProfile = '',
  requiredSymbols = [],
  expectedAnswers = [],
} = {}) => {
  const formatSymbols = FORMAT_SYMBOLS[normalizeName(answerFormat)] || [];
  const profileSymbols = PROFILE_SYMBOLS[clean(toolProfile).toLowerCase()] || [];
  const inferredSymbols = inferRequiredAnswerSymbols(expectedAnswers);
  return [...new Set([
    ...formatSymbols,
    ...profileSymbols,
    ...normalizeExplicitSymbols(requiredSymbols),
    ...inferredSymbols,
  ])];
};

export const requiredAnswerToolForSymbol = (symbol) => {
  const value = clean(symbol);
  if (STATIC_REQUIRED_TOOLS[value]) return STATIC_REQUIRED_TOOLS[value];
  if (/^[A-Za-z]$/.test(value)) {
    return {
      label: value,
      command: value,
      ariaLabel: 'Insert ' + (/[A-Z]/.test(value) ? 'capital ' : '') + value,
    };
  }
  return null;
};

export const answerSymbolSpec = requiredAnswerToolForSymbol;

export const canServeRequiredAnswerSymbol = (symbol) => Boolean(requiredAnswerToolForSymbol(symbol));

export const unsupportedRequiredAnswerSymbols = (symbols = []) => (
  [...new Set(normalizeExplicitSymbols(symbols))].filter((symbol) => !canServeRequiredAnswerSymbol(symbol))
);

export const knownAnswerFormats = () => Object.keys(FORMAT_SYMBOLS);

export const supportedRequiredAnswerSymbols = () => Object.freeze([
  ...Object.keys(STATIC_REQUIRED_TOOLS),
  'A–Z',
  'a–z',
]);
