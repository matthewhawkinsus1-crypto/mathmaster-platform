/*
 * A CSS LENGTH EXPRESSION, WORKED OUT THE WAY A BROWSER DOES IT.
 *
 * Nothing in this suite lays a page out, but a layout rule that is arithmetic
 * (a cap written with min(), max(), calc() and the page's own variables) can be
 * asked what it comes to for a window and a stack of pinned chrome, which is the
 * behaviour a student gets, instead of being matched by its wording:
 *
 *   evaluateLength('max(220px, min(70dvh, calc(100dvh - var(--bar, 72px))))',
 *     { viewport: { width: 1366, height: 640 }, vars: { '--bar': '65px' } })
 *     // -> 448 is 70dvh, 575 is the window less the bar, so min is 448 -> 448
 *
 * Supports numbers, px / dvh / vh / vw / rem / em, + - * / with calc()'s
 * precedence, parentheses, calc(), min(), max(), clamp() and var() with a
 * fallback. Anything else throws, so a rule written in a form this does not
 * read fails loudly rather than evaluating to something plausible.
 */

const NUMBER = /^([+-]?\d*\.?\d+)(px|dvh|vh|svh|lvh|vw|rem|em)?/;

const substituteVars = (text, vars, depth = 0) => {
  if (depth > 20) throw new Error('cssMath: variables refer to each other too deeply');
  let out = '';
  let index = 0;
  while (index < text.length) {
    const at = text.indexOf('var(', index);
    if (at === -1) { out += text.slice(index); break; }
    out += text.slice(index, at);
    // The matching close paren, and the first top-level comma inside it.
    let level = 0;
    let comma = -1;
    let close = -1;
    for (let cursor = at + 3; cursor < text.length; cursor += 1) {
      const ch = text[cursor];
      if (ch === '(') level += 1;
      else if (ch === ')') { level -= 1; if (level === 0) { close = cursor; break; } }
      else if (ch === ',' && level === 1 && comma === -1) comma = cursor;
    }
    if (close === -1) throw new Error('cssMath: a var( is never closed');
    const name = text.slice(at + 4, comma === -1 ? close : comma).trim();
    const fallback = comma === -1 ? null : text.slice(comma + 1, close).trim();
    if (name in vars) out += `(${substituteVars(String(vars[name]), vars, depth + 1)})`;
    else if (fallback !== null) out += `(${substituteVars(fallback, vars, depth + 1)})`;
    else throw new Error(`cssMath: ${name} has no value and no fallback`);
    index = close + 1;
  }
  return out;
};

const tokenize = (text) => {
  const tokens = [];
  let rest = text.trim();
  // A + or - is a sign only where a value is expected; after a value it is the
  // operator (calc() needs the spaces around it, so "1px - 5px" reads one way).
  const afterValue = () => ['number', 'close'].includes(tokens[tokens.length - 1]?.kind);
  while (rest.length) {
    const space = /^\s+/.exec(rest);
    if (space) { rest = rest.slice(space[0].length); continue; }
    const number = NUMBER.exec(rest);
    if (number && (!afterValue() || !/^[+-]/.test(rest))) {
      tokens.push({ kind: 'number', value: Number(number[1]), unit: number[2] || '' });
      rest = rest.slice(number[0].length);
      continue;
    }
    const word = /^[a-z][a-z-]*(?=\()/i.exec(rest);
    if (word) { tokens.push({ kind: 'fn', name: word[0].toLowerCase() }); rest = rest.slice(word[0].length); continue; }
    const ch = rest[0];
    if ('+-*/'.includes(ch)) tokens.push({ kind: 'op', value: ch });
    else if (ch === '(') tokens.push({ kind: 'open' });
    else if (ch === ')') tokens.push({ kind: 'close' });
    else if (ch === ',') tokens.push({ kind: 'comma' });
    else throw new Error(`cssMath: cannot read "${rest.slice(0, 20)}"`);
    rest = rest.slice(1);
  }
  return tokens;
};

export function evaluateLength(expression, { viewport = { width: 1366, height: 768 }, vars = {}, rootPx = 16 } = {}) {
  const tokens = tokenize(substituteVars(String(expression), vars));
  let at = 0;
  const peek = () => tokens[at];
  const take = (kind) => {
    const token = tokens[at];
    if (!token || (kind && token.kind !== kind)) throw new Error(`cssMath: expected ${kind} in "${expression}"`);
    at += 1;
    return token;
  };
  // A value is { px, number }: a length in px, or a plain number (for * and /).
  const length = (px) => ({ px, plain: false });
  const plain = (value) => ({ px: value, plain: true });
  const toPx = (token) => {
    const unit = token.unit;
    if (unit === '') return plain(token.value);
    if (unit === 'px') return length(token.value);
    if (['dvh', 'vh', 'svh', 'lvh'].includes(unit)) return length((token.value * viewport.height) / 100);
    if (unit === 'vw') return length((token.value * viewport.width) / 100);
    return length(token.value * rootPx);
  };
  const add = (a, b, sign) => {
    if (a.plain !== b.plain) throw new Error(`cssMath: a length and a number cannot be added in "${expression}"`);
    return { px: a.px + sign * b.px, plain: a.plain };
  };
  const multiply = (a, b) => {
    if (!a.plain && !b.plain) throw new Error(`cssMath: two lengths cannot be multiplied in "${expression}"`);
    return { px: a.px * b.px, plain: a.plain && b.plain };
  };
  const divide = (a, b) => {
    if (!b.plain) throw new Error(`cssMath: a length cannot be a divisor in "${expression}"`);
    return { px: a.px / b.px, plain: a.plain };
  };
  const list = () => {
    const values = [sum()];
    while (peek()?.kind === 'comma') { take('comma'); values.push(sum()); }
    return values;
  };
  const primary = () => {
    const token = peek();
    if (!token) throw new Error(`cssMath: "${expression}" ends too soon`);
    if (token.kind === 'number') { take('number'); return toPx(token); }
    if (token.kind === 'open') { take('open'); const inner = sum(); take('close'); return inner; }
    if (token.kind === 'fn') {
      take('fn'); take('open');
      const args = list();
      take('close');
      if (token.name === 'calc') return args[0];
      if (token.name === 'min') return args.reduce((a, b) => (b.px < a.px ? b : a));
      if (token.name === 'max') return args.reduce((a, b) => (b.px > a.px ? b : a));
      if (token.name === 'clamp') return length(Math.min(Math.max(args[1].px, args[0].px), args[2].px));
      throw new Error(`cssMath: ${token.name}() is not supported`);
    }
    if (token.kind === 'op' && token.value === '-') { take('op'); const inner = primary(); return { px: -inner.px, plain: inner.plain }; }
    throw new Error(`cssMath: unexpected ${token.kind} in "${expression}"`);
  };
  const term = () => {
    let value = primary();
    while (peek()?.kind === 'op' && ['*', '/'].includes(peek().value)) {
      const op = take('op').value;
      const right = primary();
      value = op === '*' ? multiply(value, right) : divide(value, right);
    }
    return value;
  };
  function sum() {
    let value = term();
    while (peek()?.kind === 'op' && ['+', '-'].includes(peek().value)) {
      const op = take('op').value;
      value = add(value, term(), op === '+' ? 1 : -1);
    }
    return value;
  }
  const result = sum();
  if (at !== tokens.length) throw new Error(`cssMath: "${expression}" has something left over`);
  return result.px;
}

export default { evaluateLength };
