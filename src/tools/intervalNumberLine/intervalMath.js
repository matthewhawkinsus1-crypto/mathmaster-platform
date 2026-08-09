// Interval arithmetic and notation for the number-line tool. Kept free of React
// so the validator, the contract and the tests can all use it.

const INF = Number.POSITIVE_INFINITY;

export const normalizeInterval = (raw = {}) => {
  const lowerRaw = raw.min ?? raw.from ?? raw.lower;
  const upperRaw = raw.max ?? raw.to ?? raw.upper;
  const lower = lowerRaw === null || lowerRaw === undefined || lowerRaw === '-inf' ? -INF : Number(lowerRaw);
  const upper = upperRaw === null || upperRaw === undefined || upperRaw === 'inf' ? INF : Number(upperRaw);
  return {
    min: Number.isNaN(lower) ? -INF : lower,
    max: Number.isNaN(upper) ? INF : upper,
    // An infinite end is never included, whatever the JSON says.
    minClosed: Number.isFinite(lower) ? raw.minClosed === true : false,
    maxClosed: Number.isFinite(upper) ? raw.maxClosed === true : false,
  };
};

export const normalizeIntervals = (raw = []) => (Array.isArray(raw) ? raw : [])
  .map(normalizeInterval)
  .filter((interval) => interval.min <= interval.max)
  .sort((a, b) => a.min - b.min || a.max - b.max);

const formatEndpoint = (value) => {
  if (value === -INF) return '−∞';
  if (value === INF) return '∞';
  return String(Number(Number(value).toFixed(4)));
};

export const intervalToNotation = (interval) => {
  const { min, max, minClosed, maxClosed } = normalizeInterval(interval);
  const open = min === -INF ? '(' : minClosed ? '[' : '(';
  const close = max === INF ? ')' : maxClosed ? ']' : ')';
  return `${open}${formatEndpoint(min)}, ${formatEndpoint(max)}${close}`;
};

export const intervalsToNotation = (intervals) => {
  const list = normalizeIntervals(intervals);
  if (!list.length) return '∅';
  return list.map(intervalToNotation).join(' ∪ ');
};

export const intervalToInequality = (interval, variable = 'x') => {
  const { min, max, minClosed, maxClosed } = normalizeInterval(interval);
  if (min === -INF && max === INF) return 'all real numbers';
  if (min === -INF) return `${variable} ${maxClosed ? '≤' : '<'} ${formatEndpoint(max)}`;
  if (max === INF) return `${variable} ${minClosed ? '≥' : '>'} ${formatEndpoint(min)}`;
  return `${formatEndpoint(min)} ${minClosed ? '≤' : '<'} ${variable} ${maxClosed ? '≤' : '<'} ${formatEndpoint(max)}`;
};

export const intervalsToInequality = (intervals, variable = 'x') => {
  const list = normalizeIntervals(intervals);
  if (!list.length) return 'no solution';
  return list.map((interval) => intervalToInequality(interval, variable)).join(' or ');
};

export const intervalContains = (interval, value) => {
  const { min, max, minClosed, maxClosed } = normalizeInterval(interval);
  const x = Number(value);
  if (!Number.isFinite(x)) return false;
  if (x < min || x > max) return false;
  if (x === min && !minClosed && min !== -INF) return false;
  if (x === max && !maxClosed && max !== INF) return false;
  return true;
};

const sameEndpoint = (a, b, tolerance = 1e-9) => {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= tolerance;
};

export const sameIntervals = (left, right) => {
  const a = normalizeIntervals(left);
  const b = normalizeIntervals(right);
  if (a.length !== b.length) return false;
  return a.every((interval, index) => {
    const other = b[index];
    return sameEndpoint(interval.min, other.min)
      && sameEndpoint(interval.max, other.max)
      && interval.minClosed === other.minClosed
      && interval.maxClosed === other.maxClosed;
  });
};

// Accept the several ways a student may legitimately type interval notation:
// different bracket spacing, "inf"/"infinity"/"∞", "U"/"∪" for union, and a
// hyphen or minus sign.
export const parseIntervalNotation = (text) => {
  const raw = String(text || '')
    .replace(/[−–—]/g, '-')
    .replace(/infinity|infty|inf/gi, '∞')
    .replace(/\bU\b/g, '∪')
    .trim();
  if (!raw) return null;
  const pieces = raw.split('∪').map((piece) => piece.trim()).filter(Boolean);
  if (!pieces.length) return null;

  const parsed = [];
  for (const piece of pieces) {
    const match = piece.match(/^([[(])\s*(-?∞|-?[\d.]+)\s*,\s*(-?∞|-?[\d.]+)\s*([\])])$/);
    if (!match) return null;
    const [, openBracket, lowerText, upperText, closeBracket] = match;
    const min = lowerText.includes('∞') ? (lowerText.startsWith('-') ? -INF : INF) : Number(lowerText);
    const max = upperText.includes('∞') ? (upperText.startsWith('-') ? -INF : INF) : Number(upperText);
    if (Number.isNaN(min) || Number.isNaN(max)) return null;
    parsed.push({
      min, max,
      minClosed: openBracket === '[' && Number.isFinite(min),
      maxClosed: closeBracket === ']' && Number.isFinite(max),
    });
  }
  return normalizeIntervals(parsed);
};

export const notationMatches = (studentText, expectedIntervals) => {
  const parsed = parseIntervalNotation(studentText);
  if (!parsed) return false;
  return sameIntervals(parsed, expectedIntervals);
};

export const INTERVAL_ASK_STAGES = Object.freeze(['graph', 'interval', 'inequality']);
