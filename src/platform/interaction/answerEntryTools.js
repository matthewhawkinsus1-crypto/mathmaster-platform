const clean = (value) => String(value ?? '').trim();

const normalizeName = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');

export const ANSWER_SYMBOL_SPECS = Object.freeze({
  '(': { label: '(', command: '(', ariaLabel: 'Insert open parenthesis' },
  ')': { label: ')', command: ')', ariaLabel: 'Insert close parenthesis' },
  ',': { label: ',', command: ',', ariaLabel: 'Insert comma' },
  '[': { label: '[', command: '[', ariaLabel: 'Insert open bracket' },
  ']': { label: ']', command: ']', ariaLabel: 'Insert close bracket' },
  '{': { label: '{', command: '\\lbrace', ariaLabel: 'Insert opening set brace' },
  '}': { label: '}', command: '\\rbrace', ariaLabel: 'Insert closing set brace' },
  '∞': { label: '∞', command: '\\infty', ariaLabel: 'Insert positive infinity' },
  '∪': { label: '∪', command: '\\cup', ariaLabel: 'Insert union' },
  '<': { label: '<', command: '<', ariaLabel: 'Insert less than' },
  '≤': { label: '≤', command: '\\le', ariaLabel: 'Insert less than or equal to' },
  '>': { label: '>', command: '>', ariaLabel: 'Insert greater than' },
  '≥': { label: '≥', command: '\\ge', ariaLabel: 'Insert greater than or equal to' },
  '≠': { label: '≠', command: '\\ne', ariaLabel: 'Insert not equal to' },
  '=': { label: '=', command: '=', ariaLabel: 'Insert equals sign' },
  '−': { label: '−', command: '-', ariaLabel: 'Insert negative sign' },
  '-': { label: '−', command: '-', ariaLabel: 'Insert negative sign' },
  x: { label: 'x', command: 'x', ariaLabel: 'Insert x' },
  y: { label: 'y', command: 'y', ariaLabel: 'Insert y' },
  '√': { label: '√', command: '\\sqrt{#0}', ariaLabel: 'Insert square root' },
  'ⁿ√': { label: 'ⁿ√', command: '\\sqrt[#?]{#0}', ariaLabel: 'Insert nth root' },
  'xⁿ': { label: 'xⁿ', command: '#@^{#?}', ariaLabel: 'Insert exponent' },
  'a⁄b': { label: 'a⁄b', command: '\\frac{#0}{#?}', ariaLabel: 'Insert stacked fraction' },
});

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
  'basic+set': FORMAT_SYMBOLS.set,
});

const normalizeExplicitSymbols = (symbols) => {
  if (!Array.isArray(symbols)) return [];
  return symbols.map(clean).filter(Boolean);
};

/**
 * Resolve keys that must be directly reachable for an answer format.
 * These are semantic requirements, not hints to the grader.
 */
export const resolveRequiredAnswerSymbols = ({
  answerFormat = '',
  toolProfile = '',
  requiredSymbols = [],
} = {}) => {
  const formatSymbols = FORMAT_SYMBOLS[normalizeName(answerFormat)] || [];
  const profileSymbols = PROFILE_SYMBOLS[clean(toolProfile).toLowerCase()] || [];
  return [...new Set([
    ...formatSymbols,
    ...profileSymbols,
    ...normalizeExplicitSymbols(requiredSymbols),
  ])];
};

export const supportedRequiredAnswerSymbols = () => Object.keys(ANSWER_SYMBOL_SPECS);

export const answerSymbolSpec = (symbol) => ANSWER_SYMBOL_SPECS[clean(symbol)] || null;

export const knownAnswerFormats = () => Object.keys(FORMAT_SYMBOLS);
