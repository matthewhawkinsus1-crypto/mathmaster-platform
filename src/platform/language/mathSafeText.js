/*
 * MATH-SAFE TEXT — the mathematics in a sentence is never language.
 *
 * Every language support (translation, Break it down, Read aloud) changes the
 * WORDS around a task. None of them may touch an equation, a variable, a
 * coordinate, a fraction, an inequality, function notation or an answer
 * expression. This module splits a prompt into text and math segments so the
 * supports can work on the text and carry the math through byte for byte:
 *
 *   "Graph y = -2/3x + 7 and name the point (0, 7)."
 *   text "Graph " · math "y = -2/3x + 7" · text " and name the point " ·
 *   math "(0, 7)" · text "."
 *
 * It is deliberately conservative: when it cannot tell, it calls a token
 * MATH, because leaving a word untranslated costs a student a little, while
 * translating "x" or reordering "3 < x" costs them the question.
 *
 * Recognised:
 *   - delimited LaTeX ($…$, $$…$$, \(…\), \[…\]) and bare LaTeX commands;
 *   - template placeholders ({{n}}) in uninstantiated text;
 *   - numbers (with decimals, thousands commas, %, leading $ for money);
 *   - single-letter variables (but not the words "a", "A" or "I" standing
 *     alone in prose, nor answer-choice letters A–D when a sentence lists
 *     them — those are kept as math too, which is the safe direction);
 *   - function notation f(x), g(-2), h(t + 1) and named functions sin, log…;
 *   - operator and relation symbols = ≠ < > ≤ ≥ + − - × · * / ÷ ^ ± √ π ∞ ² ³ |;
 *   - parenthesised or bracketed groups whose content is all mathematics:
 *     (3, -2), [0, 5), (x + 1);
 *   - consecutive math atoms joined by spaces are ONE run ("y = -2/3x + 7").
 *
 * Words — including hyphenated vocabulary such as y-intercept and x-axis —
 * are text.
 */

const OPERATOR = /[=≠<>≤≥+−\-×·*/÷^±√π∞²³|]/;
const NAMED_FUNCTIONS = new Set(['sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'abs', 'exp']);
// Letters that are common one-letter WORDS in a language. Alone in prose they
// are text: English "a" and "I"; Spanish "y" (and), "o" (or), "a" (to), "e",
// "u" — so "pasa por (2, 3) y (4, 7)" keeps its "y" as a word.
const ONE_LETTER_WORDS = Object.freeze({
  en: new Set(['a', 'A', 'I']),
  es: new Set(['y', 'Y', 'o', 'O', 'a', 'A', 'e', 'E', 'u', 'U']),
});
const oneLetterWordsFor = (language) => ONE_LETTER_WORDS[String(language || 'en').toLowerCase().split('-')[0]] || ONE_LETTER_WORDS.en;

const DELIMITED = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\{\{[^{}]+\}\}/g;
const LATEX_COMMAND = /\\[a-zA-Z]+(?:\s*\{[^{}]*\})*/g;

/** Tokens: words, numbers, whitespace, LaTeX, single characters. */
// Thousands commas only before exactly three digits, so "7, what" ends at 7.
const TOKEN = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*|\$?(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d+)?%?|\.\d+%?|\s+|./gsu;

const isSpace = (value) => /^\s+$/.test(value);

const classifyToken = (token, previous, next, words = ONE_LETTER_WORDS.en) => {
  if (isSpace(token)) return 'space';
  if (/^\$?\d|^\.\d/.test(token)) return 'math';
  if (OPERATOR.test(token) && token.length === 1) return 'math';
  if (/^[A-Za-zÀ-ÖØ-öø-ÿ]$/.test(token)) {
    if (!words.has(token)) return 'math';
    // "a", "A" or "I" is math only when it is pressed against mathematics
    // ("a = 3", "2a", "f(a)") or stands as a label before punctuation
    // ("Type A, B, C, or D.", "A) 12", "Solve for a."). Before a word it is
    // the article or the pronoun: "A line passes through…".
    return previous === 'math-adjacent' || next === 'math-adjacent' || next === 'label-end' ? 'math' : 'text';
  }
  if (/^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/.test(token)) return 'word';
  return 'punct';
};

/** Is everything inside a bracket pair mathematics (no prose words)? */
const groupIsMath = (inner) => {
  const tokens = inner.match(TOKEN) || [];
  if (!tokens.length) return false;
  let sawMath = false;
  for (const token of tokens) {
    if (isSpace(token) || token === ',' || token === ';') continue;
    const kind = classifyToken(token, 'math-adjacent', 'math-adjacent');
    if (kind === 'word') {
      if (NAMED_FUNCTIONS.has(token.toLowerCase())) { sawMath = true; continue; }
      return false;
    }
    if (kind === 'math' || '()[]'.includes(token)) sawMath = true;
    else if (kind === 'punct' && !'()[]'.includes(token)) return false;
  }
  return sawMath;
};

const OPENERS = new Set(['(', '[']);

/** The matching close for the bracket at `start`, or -1. Same line only. */
const matchingClose = (text, start) => {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\n') return -1;
    if (OPENERS.has(char)) depth += 1;
    else if (char === ')' || char === ']') {
      depth -= 1;
      // Half-open intervals close with the other bracket: [0, 5).
      if (depth === 0) return index;
    }
  }
  return -1;
};

/**
 * Split text into ordered segments `{ kind: 'text' | 'math', value }`.
 * Joining the values always reproduces the input exactly.
 */
export const segmentMathText = (input, { language = 'en' } = {}) => {
  const words = oneLetterWordsFor(language);
  const text = String(input ?? '');
  if (!text) return [];
  // 1. Protected spans that are unambiguous: delimited LaTeX, placeholders and
  //    bare LaTeX commands.
  const protectedSpans = [];
  const collect = (pattern, accept = () => true) => {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      if (!accept(match[0])) { pattern.lastIndex = start + 1; continue; }
      if (!protectedSpans.some((span) => start < span.end && end > span.start)) protectedSpans.push({ start, end });
    }
  };
  // A pair of prices on one line ("$4 and $5") is not a LaTeX span.
  collect(DELIMITED, (value) => !/^\$\d[\d,]*(?:\.\d+)?\s+[A-Za-z]{2,}/.test(value) || /[\\{}^=]/.test(value));
  collect(LATEX_COMMAND);
  protectedSpans.sort((a, b) => a.start - b.start);

  // 2. Everything else, token by token.
  const atoms = []; // { kind: 'math'|'text'|'space'|'word'|'punct', value }
  let cursor = 0;
  const tokenize = (chunk) => {
    let index = 0;
    while (index < chunk.length) {
      const char = chunk[index];
      if (OPENERS.has(char)) {
        const close = matchingClose(chunk, index);
        if (close > index && groupIsMath(chunk.slice(index + 1, close))) {
          atoms.push({ kind: 'math', value: chunk.slice(index, close + 1) });
          index = close + 1;
          continue;
        }
      }
      TOKEN.lastIndex = index;
      const match = TOKEN.exec(chunk);
      const token = match ? match[0] : char;
      atoms.push({ kind: 'raw', value: token });
      index += token.length;
    }
  };
  protectedSpans.forEach((span) => {
    if (span.start > cursor) tokenize(text.slice(cursor, span.start));
    atoms.push({ kind: 'math', value: text.slice(span.start, span.end) });
    cursor = span.end;
  });
  if (cursor < text.length) tokenize(text.slice(cursor));

  // 3. Classify raw tokens, with "pressed against math" for one-letter words:
  //    touching a number, bracket or math span ("2a", "f(a)"), or facing a
  //    relation/operator symbol across spaces ("a = 3", "y + 2").
  const isOperatorAtom = (atom) => atom?.kind === 'raw' && atom.value.length === 1 && OPERATOR.test(atom.value);
  const isMathish = (atom) => Boolean(atom) && (atom.kind === 'math'
    || isOperatorAtom(atom) || (atom.kind === 'raw' && (/^\$?\d/.test(atom.value) || atom.value === '(')));
  const neighbour = (index, step) => {
    let cursorIndex = index + step;
    let spaced = false;
    while (atoms[cursorIndex] && atoms[cursorIndex].kind === 'raw' && isSpace(atoms[cursorIndex].value)) {
      spaced = true;
      cursorIndex += step;
    }
    return { atom: atoms[cursorIndex], spaced };
  };
  const adjacent = ({ atom, spaced }) => (spaced ? isOperatorAtom(atom) : isMathish(atom));
  const endsLabel = (atom) => !atom || (atom.kind === 'raw' && /^[,.;:)\]?!]$/.test(atom.value));
  atoms.forEach((atom, index) => {
    if (atom.kind !== 'raw') return;
    const after = atoms[index + 1];
    const kind = classifyToken(
      atom.value,
      adjacent(neighbour(index, -1)) ? 'math-adjacent' : 'text',
      adjacent(neighbour(index, 1)) ? 'math-adjacent' : endsLabel(after) ? 'label-end' : 'text',
      words,
    );
    // Function notation: a one-letter or named function directly followed by a
    // math group or "(" is math ("f(x)", "log(100)").
    if (kind === 'word' && NAMED_FUNCTIONS.has(atom.value.toLowerCase()) && after && (after.kind === 'math' || after.value === '(')) {
      atom.kind = 'math';
      return;
    }
    atom.kind = kind === 'word' ? 'text' : kind;
  });

  // 4. Join: consecutive math atoms (with only spaces between) become one run.
  //    A sentence-final period after math stays text; a comma or semicolon
  //    between math atoms ends the run (so "A, B, C" stays three runs and the
  //    prose comma survives).
  const segments = [];
  const push = (kind, value) => {
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) last.value += value;
    else segments.push({ kind, value });
  };
  for (let index = 0; index < atoms.length; index += 1) {
    const atom = atoms[index];
    if (atom.kind === 'math') {
      push('math', atom.value);
      continue;
    }
    if (atom.kind === 'space') {
      // A space inside a math run belongs to the run only if math continues.
      const previousMath = segments[segments.length - 1]?.kind === 'math';
      let lookahead = index + 1;
      while (atoms[lookahead]?.kind === 'space') lookahead += 1;
      const nextMath = atoms[lookahead]?.kind === 'math';
      const touchesOperator = previousMath && nextMath && (
        OPERATOR.test(segments[segments.length - 1].value.trim().slice(-1))
        || OPERATOR.test(atoms[lookahead].value.trim().charAt(0))
      );
      if (touchesOperator) push('math', atom.value);
      else push('text', atom.value);
      continue;
    }
    push('text', atom.value);
  }
  return segments;
};

const PLACEHOLDER = (index) => `⟦${index}⟧`;
const PLACEHOLDER_PATTERN = /⟦(\d+)⟧/g;

/**
 * Replace every math segment with a numbered placeholder: ⟦0⟧, ⟦1⟧, …
 * `masked` is what a language provider may look up or translate; `tokens`
 * restores the mathematics exactly.
 */
export const maskMath = (input, { language = 'en' } = {}) => {
  const tokens = [];
  const masked = segmentMathText(input, { language }).map((segment) => {
    if (segment.kind !== 'math') return segment.value;
    tokens.push(segment.value);
    return PLACEHOLDER(tokens.length - 1);
  }).join('');
  return { masked, tokens };
};

/**
 * Put the mathematics back. Every placeholder must appear exactly once and no
 * other; anything else means the language step damaged the mathematics, and
 * the result is refused (null) rather than shown.
 */
export const unmaskMath = (masked, tokens = []) => {
  const text = String(masked ?? '');
  const seen = new Map();
  let match;
  PLACEHOLDER_PATTERN.lastIndex = 0;
  while ((match = PLACEHOLDER_PATTERN.exec(text))) {
    const index = Number(match[1]);
    seen.set(index, (seen.get(index) || 0) + 1);
  }
  if (seen.size !== tokens.length) return null;
  for (let index = 0; index < tokens.length; index += 1) {
    if (seen.get(index) !== 1) return null;
  }
  return text.replace(PLACEHOLDER_PATTERN, (_, index) => tokens[Number(index)]);
};

/** The math tokens of a text, whitespace-normalized, in order. */
export const mathTokensOf = (input, { language = 'en' } = {}) => segmentMathText(input, { language })
  .filter((segment) => segment.kind === 'math')
  .map((segment) => segment.value.replace(/\s+/g, ''))
  .filter(Boolean);

// Multi-letter names written in capitals — points, segments, triangles and
// angles (AB, ABC, ∠DEF's "DEF", AB′) — read as prose to the segmenter, but
// they are as mathematical as "x": a translation must carry them unchanged.
const IDENTIFIER = /(?<![A-Za-zÀ-ÖØ-öø-ÿ])[A-Z]{2,}['′’]*(?![A-Za-zÀ-ÖØ-öø-ÿ])/g;
const identifiersOf = (input) => (String(input ?? '').match(IDENTIFIER) || []).map((name) => name.replace(/[’′]/g, "'"));

const sameTokens = (a, b) => {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((token, index) => token === right[index]);
};

/**
 * Does `candidate` carry exactly the mathematics of `original` (same tokens,
 * any order, and the same capital-letter names)? The guard every language
 * provider's output must pass.
 */
export const preservesMath = (original, candidate, { language = 'en' } = {}) => (
  sameTokens(mathTokensOf(original), mathTokensOf(candidate, { language }))
  && sameTokens(identifiersOf(original), identifiersOf(candidate))
);

/** Sentences of a text, keeping math (and decimals inside it) intact. */
export const splitSentences = (input, { language = 'en' } = {}) => {
  const segments = segmentMathText(input, { language });
  const sentences = [];
  let current = '';
  segments.forEach((segment) => {
    if (segment.kind === 'math') { current += segment.value; return; }
    // A sentence ends at . ? or ! followed by space, or at a line break.
    const pieces = segment.value.split(/([.?!])(?=\s)|\n+/);
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      if (piece === undefined) {
        if (current.trim()) sentences.push(current.trim());
        current = '';
        continue;
      }
      if (/^[.?!]$/.test(piece) && index % 2 === 1) {
        current += piece;
        if (current.trim()) sentences.push(current.trim());
        current = '';
        continue;
      }
      current += piece;
    }
  });
  if (current.trim()) sentences.push(current.trim());
  return sentences;
};
