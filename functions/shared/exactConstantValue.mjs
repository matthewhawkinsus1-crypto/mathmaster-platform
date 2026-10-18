// The value of an exact constant: integers, + − × ÷, brackets, integer powers,
// \frac and square roots, and nothing else.
//
// WHY. An ordered pair is a point, and its coordinates are compared by value
// (`(1/2, 3)` is `(0.5, 3)`, Job P). A coordinate with a root was compared as
// text, so a key a generator wrote unsimplified — Algebra II's
// quadratic-formula-exact keys `((-(-2)-sqrt(8))/2, 2*((-(-2)-sqrt(8))/2)+3)` —
// matched only itself: `(1-\sqrt{2}, 5-2\sqrt{2})` was wrong (student pass 3).
//
// WHAT IT READS. The text answerEquivalence.normalizeAnswer writes (`\frac`,
// `\sqrt{…}`, `*`, no spaces). It refuses anything else rather than guess:
//   - a decimal point (an exact answer was asked for; decimals keep their own
//     comparison, asNumber);
//   - a letter, π, a function, an nth root, `%`, `$`;
//   - a root of a negative number, a zero denominator, a non-integer or large
//     exponent.
// `radical` says whether a square root was read, so a caller can insist that
// an irrational key is answered with a root and not a long rational
// approximation.

const MAX_EXPONENT = 12;

const tokenize = (text) => {
  const tokens = [];
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index);
    const number = /^\d+/.exec(rest);
    if (number) {
      if (rest[number[0].length] === '.') return null;
      tokens.push({ kind: 'number', value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const command = /^\\(frac|sqrt)(?![A-Za-z])/.exec(rest);
    if (command) {
      tokens.push({ kind: command[1] });
      index += command[0].length;
      continue;
    }
    if ('+-*/^(){}'.includes(rest[0])) {
      tokens.push({ kind: rest[0] });
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
};

const parse = (tokens) => {
  let position = 0;
  let radical = false;
  const peek = () => tokens[position]?.kind;
  const take = (kind) => {
    if (peek() !== kind) throw new Error('unexpected');
    position += 1;
  };
  const group = (open, close) => {
    take(open);
    const value = expression();
    take(close);
    return value;
  };

  const primary = () => {
    const kind = peek();
    if (kind === 'number') { position += 1; return tokens[position - 1].value; }
    if (kind === '(') return group('(', ')');
    if (kind === '{') return group('{', '}');
    if (kind === 'sqrt') {
      position += 1;
      const radicand = group('{', '}');
      if (radicand < 0) throw new Error('negative radicand');
      radical = true;
      return Math.sqrt(radicand);
    }
    if (kind === 'frac') {
      position += 1;
      const numerator = group('{', '}');
      const denominator = group('{', '}');
      if (denominator === 0) throw new Error('zero denominator');
      return numerator / denominator;
    }
    throw new Error('unexpected');
  };

  const power = () => {
    const base = primary();
    if (peek() !== '^') return base;
    position += 1;
    let sign = 1;
    if (peek() === '-') { sign = -1; position += 1; }
    const exponent = sign * (peek() === 'number' ? (position += 1, tokens[position - 1].value) : primary());
    if (!Number.isInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) throw new Error('exponent');
    if (base === 0 && exponent < 0) throw new Error('zero denominator');
    return base ** exponent;
  };

  const unary = () => {
    if (peek() === '-') { position += 1; return -unary(); }
    if (peek() === '+') { position += 1; return unary(); }
    return power();
  };

  // A factor may follow another without a sign (`2\sqrt{2}`, `2(1+\sqrt{3})`),
  // but a number never follows a number: `2 3` is not a product.
  const startsFactor = (previous) => ['(', '{', 'sqrt', 'frac'].includes(peek())
    || (peek() === 'number' && previous !== 'number');

  const term = () => {
    let value = unary();
    for (;;) {
      if (peek() === '*') { position += 1; value *= unary(); continue; }
      if (peek() === '/') {
        position += 1;
        const divisor = unary();
        if (divisor === 0) throw new Error('zero denominator');
        value /= divisor;
        continue;
      }
      if (startsFactor(tokens[position - 1]?.kind)) { value *= power(); continue; }
      return value;
    }
  };

  function expression() {
    let value = term();
    while (peek() === '+' || peek() === '-') {
      const sign = peek() === '+' ? 1 : -1;
      position += 1;
      value += sign * term();
    }
    return value;
  }

  const value = expression();
  if (position !== tokens.length || !Number.isFinite(value)) throw new Error('trailing');
  return { value, radical };
};

/** `{ value, radical }` for an exact constant, or null. */
export const exactConstantValue = (normalized) => {
  const text = String(normalized ?? '');
  if (!text || text.length > 200) return null;
  const tokens = tokenize(text);
  if (!tokens || !tokens.length) return null;
  try {
    return parse(tokens);
  } catch {
    return null;
  }
};

export default exactConstantValue;
