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
  'basic+set': FORMAT_SYMBOLS.set,
});

const normalizeExplicitSymbols = (symbols) => {
  if (!Array.isArray(symbols)) return [];
  return symbols.map(clean).filter(Boolean);
};

/**
 * Resolve the keys that must be directly reachable for an answer format.
 *
 * `answerFormat` is the semantic contract (orderedPair, interval, set, ...).
 * `toolProfile` is the legacy UI profile and remains a useful fallback.
 * `requiredSymbols` lets authored content add a symbol without creating a new
 * global format. MathInput will fail open to the device keyboard if it cannot
 * render one of these explicit requirements.
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

export const knownAnswerFormats = () => Object.keys(FORMAT_SYMBOLS);
