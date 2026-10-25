/*
 * WHAT THE MATH EDITOR HOLDS WHEN A STUDENT TYPES AN ANSWER (TS05).
 *
 * A secure expression or equation field may move from a text box to the math
 * editor only where the grader reads what the editor writes exactly as it reads
 * the same characters typed. The equivalence sweep
 * (scripts/sweep-equivalence-verdicts.mjs) needs the editor's spelling of every
 * key to check that, and the editor is MathLive (0.110, behind MathInput), which
 * only runs in a browser. This is a model of it.
 *
 * The model is checked against the real editor: tests/browser/editorKeyRoundTrip.mjs
 * types every expression and equation key the secure runtime can issue into a
 * real MathInput (996 distinct keys, three draws a family) and records what it
 * holds (tests/platform/fixtures/editorKeyRoundTrip.json), and
 * tests/platform/editorKeySpellings.test.mjs requires this model to write
 * exactly that for every recorded key.
 *
 * The student types the characters of an answer and leaves each fraction,
 * power, root or subscript where the typed text's own reading ends it (the
 * caret is visibly inside the box until they do). The editor then holds:
 *
 *   brackets   \left( … \right); set braces \left\lbrace … \right\rbrace, a bar
 *              inside them \,\middle{\vert}\,; an absolute value \left| … \right|
 *   a `/`      \frac{N}{D}, N being everything the editor takes before the slash
 *              (digits, letters, powers, bracket groups, roots and named
 *              functions, back to an operator), D the operand typed after it;
 *              two single digits are written \frac34
 *   powers     ^2 for one digit, ^{t} for a letter, ^{…} otherwise; subscripts
 *              alike (_0, _{n})
 *   roots      sqrt( and cbrt( become \sqrt{…} and \sqrt[3]{…} and keep the
 *              brackets typed inside them; \sqrt5 for one digit
 *   words      * is \cdot, pi \pi, ln \ln, log_b \log_{_{}b} (the empty
 *              subscript is the editor's), and \land, or \lor, != \ne, ∅
 *              \varnothing; a command before a letter is followed by a space
 *
 * `variant: 'natural'` leaves out the brackets round a whole power, root,
 * subscript or log base (its box already groups it) and writes the log base as
 * the logₐ key does — the same answer built with the keypad. A denominator
 * keeps its brackets either way: typed without them, `d/4r` is (d/4)·r.
 *
 * Input the model does not read (other LaTeX commands, a {{template}}) gives
 * null: the sweep claims no editor spelling for it.
 */

const isDigit = (character) => /[0-9]/.test(character || '');
const isLetter = (character) => /[A-Za-z]/.test(character || '');

const matchClose = (text, start, open, close) => {
  let level = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === open) level += 1;
    else if (text[index] === close) { level -= 1; if (level === 0) return index; }
  }
  return -1;
};

const FUNCTION_NAME = /^(?:ln|log|sin|cos|tan)(?![A-Za-z])/;
// The only commands a typed key holds that the model reads.
const UNREAD_COMMAND = /\\(?!sqrt(?![A-Za-z])|pi(?![A-Za-z]))[A-Za-z]+/;
// Markers no typed answer holds (private-use characters).
const WORD = '\uE001';
// A space after a whole number, then digits and a slash: MathInput builds the
// mixed number 3\frac{1}{2} from a typed "3 1/2" (GR33, typedFractionEntry.js).
const MIXED = '\uE002';
const MIXED_NUMBER_TYPED = /(^|[^0-9.A-Za-z}_^\\])(\d+)\s+(\d+)(?=\s*\/)/g;

const parse = (input, variant) => {
  const text = String(input)
    .replace(/\s+(and|or)\s+/g, `${WORD}$1${WORD}`)
    .replace(MIXED_NUMBER_TYPED, `$1$2${MIXED}$3`)
    .replace(/\s+/g, '');
  const natural = variant === 'natural';
  let i = 0;

  const fenceAt = () => {
    const close = matchClose(text, i, '(', ')');
    const end = close < 0 ? text.length : close;
    i += 1;
    // eslint-disable-next-line no-use-before-define
    const body = sequence(end);
    i = end + 1;
    return { t: 'fence', body };
  };

  // The brackets' contents only: the box (a power, a root) groups them.
  const contentsOf = (close) => {
    i += 1;
    // eslint-disable-next-line no-use-before-define
    const body = sequence(close < 0 ? text.length : close);
    i = close < 0 ? text.length : close + 1;
    return body;
  };

  const rootAt = () => {
    if (text.startsWith('\\sqrt', i)) {
      i += 5;
      let index = null;
      if (text[i] === '[') {
        const close = matchClose(text, i, '[', ']');
        index = text.slice(i + 1, close);
        i = close + 1;
      }
      // \sqrt5: a one-character radicand, typed sqrt then 5.
      if (text[i] !== '{') {
        if (!/[0-9A-Za-z]/.test(text[i] || '')) throw new Error('a root the model does not read');
        i += 1;
        return { t: 'root', index, body: [{ t: 'atom', v: text[i - 1] }] };
      }
      const body = contentsOf(matchClose(text, i, '{', '}'));
      return { t: 'root', index, body };
    }
    const cube = text.startsWith('cbrt', i);
    i += 4;
    // sqrt5 or sqrtx: the editor's root takes the one operand typed into it.
    // eslint-disable-next-line no-use-before-define
    if (text[i] !== '(') return { t: 'root', index: cube ? '3' : null, body: operand() };
    const body = natural ? contentsOf(matchClose(text, i, '(', ')')) : [fenceAt()];
    return { t: 'root', index: cube ? '3' : null, body };
  };

  // ln and log typed become \ln and \log; a base is typed after `_`.
  const functionAt = () => {
    const name = FUNCTION_NAME.exec(text.slice(i))[0];
    i += name.length;
    const node = { t: 'fn', name };
    if (text[i] === '_') {
      i += 1;
      // eslint-disable-next-line no-use-before-define
      node.base = operand({ dropOwnBrackets: true });
      node.typedBase = !natural;
    }
    return node;
  };

  // One operand after `/`, `^` or `_`.
  const operand = ({ dropOwnBrackets = false } = {}) => {
    const nodes = [];
    if (text[i] === '-') { nodes.push({ t: 'atom', v: '-' }); i += 1; }
    const character = text[i];
    if (character === '(') {
      if (dropOwnBrackets) nodes.push(...contentsOf(matchClose(text, i, '(', ')')));
      else nodes.push(fenceAt());
    } else if (character === '{') {
      nodes.push(...contentsOf(matchClose(text, i, '{', '}')));
    } else if (text.startsWith('\\sqrt', i) || /^(?:sqrt|cbrt)(?=[(0-9A-Za-z])/.test(text.slice(i))) {
      nodes.push(rootAt());
    } else if (text.startsWith('\\pi', i)) {
      nodes.push({ t: 'cmd', v: '\\pi' }); i += 3;
    } else if (character === 'π' || /^pi(?![A-Za-z])/.test(text.slice(i))) {
      nodes.push({ t: 'cmd', v: '\\pi' }); i += character === 'π' ? 1 : 2;
    } else if (FUNCTION_NAME.test(text.slice(i))) {
      nodes.push(functionAt());
      // The call comes with its argument: /ln(2), /ln2.
      if (text[i] === '(') nodes.push(fenceAt());
      else if (/[0-9A-Za-z.]/.test(text[i] || '')) nodes.push(...operand());
    } else if (isDigit(character) || character === '.') {
      while (i < text.length && (isDigit(text[i]) || text[i] === '.')) { nodes.push({ t: 'atom', v: text[i] }); i += 1; }
    } else if (isLetter(character)) {
      nodes.push({ t: 'atom', v: character }); i += 1;
      if (text[i] === '_') { i += 1; nodes.push({ t: 'sub', body: operand({ dropOwnBrackets: natural }) }); }
    } else if (i < text.length) {
      nodes.push({ t: 'atom', v: character }); i += 1;
    }
    return nodes;
  };

  // MathLive's numerator for a typed `/`: the run before the slash, back to an
  // operator (its implicit argument: digits, letters, powers, groups, roots).
  // A named function comes along only behind a bracket group — ln(3)/ is
  // \frac{\ln(3)}{…}, but ln3/ is \ln\frac{3}{…} — and a slash right after a
  // fraction takes nothing (an empty fraction the model does not write).
  const takeNumerator = (nodes) => {
    const afterBrackets = ['fence', 'abs'].includes(nodes[nodes.length - 1]?.t);
    let start = nodes.length;
    while (start > 0) {
      const node = nodes[start - 1];
      const implicit = ['fence', 'abs', 'root', 'sup', 'sub'].includes(node.t)
        || (node.t === 'fn' && afterBrackets)
        || (node.t === 'cmd' && node.v === '\\pi')
        || (node.t === 'atom' && /[0-9A-Za-z.]/.test(node.v));
      if (!implicit) break;
      start -= 1;
    }
    if (start === nodes.length) throw new Error('a slash with nothing before it');
    return nodes.splice(start);
  };

  const sequence = (end, { inSet = false } = {}) => {
    const nodes = [];
    while (i < end && i < text.length) {
      const character = text[i];
      const rest = text.slice(i);
      const afterLetter = isLetter(text[i - 1]);
      if (character === WORD) {
        const word = /^\uE001(and|or)\uE001/.exec(rest)[1];
        nodes.push({ t: 'cmd', v: word === 'and' ? '\\land' : '\\lor' });
        i += word.length + 2;
      } else if (character === MIXED) {
        // The whole number stays out of the fraction its digits start.
        nodes.push({ t: 'mixed' });
        i += 1;
      } else if (rest.startsWith('!=')) {
        nodes.push({ t: 'cmd', v: '\\ne' }); i += 2;
      } else if (character === '∅') {
        nodes.push({ t: 'cmd', v: '\\varnothing' }); i += 1;
      } else if (character === '*') {
        nodes.push({ t: 'cmd', v: '\\cdot' }); i += 1;
      } else if (character === 'π' || rest.startsWith('\\pi') || (/^pi(?![A-Za-z])/.test(rest) && !afterLetter)) {
        nodes.push({ t: 'cmd', v: '\\pi' });
        i += character === 'π' ? 1 : rest.startsWith('\\pi') ? 3 : 2;
      } else if (rest.startsWith('\\sqrt') || (/^(?:sqrt|cbrt)(?=[(0-9A-Za-z])/.test(rest) && !afterLetter)) {
        nodes.push(rootAt());
      } else if (FUNCTION_NAME.test(rest) && !afterLetter) {
        nodes.push(functionAt());
      } else if (character === '(') {
        nodes.push(fenceAt());
      } else if (character === '{') {
        const close = matchClose(text, i, '{', '}');
        const stop = close < 0 ? text.length : close;
        i += 1;
        const body = sequence(stop, { inSet: true });
        i = stop + 1;
        nodes.push({ t: 'set', body });
      } else if (character === '|' && inSet && !nodes.some((node) => node.t === 'bar')) {
        nodes.push({ t: 'bar' }); i += 1;
      } else if (character === '|') {
        let close = i + 1;
        while (close < end && text[close] !== '|') close += 1;
        i += 1;
        const body = sequence(close);
        i = close + 1;
        nodes.push({ t: 'abs', body });
      } else if (character === '/') {
        i += 1;
        const num = takeNumerator(nodes);
        let den = operand();
        // A power on the denominator comes with it: 1/x^3.
        if (text[i] === '^') { i += 1; den = [...den, { t: 'sup', body: operand({ dropOwnBrackets: natural }) }]; }
        nodes.push({ t: 'frac', num, den });
      } else if (character === '^' || character === '_') {
        i += 1;
        const body = operand({ dropOwnBrackets: natural });
        // A typed power leaves its box after a first digit (MathLive's smart
        // superscript), so typed x^11 is held as x^11, shown x¹1; the xⁿ key's
        // box keeps every digit, x^{11}.
        const typedDigits = character === '^' && !natural && body.length > 1 && body.every((node) => node.t === 'atom' && isDigit(node.v));
        nodes.push({ t: character === '^' ? 'sup' : 'sub', body, typedDigits });
      } else {
        nodes.push({ t: 'atom', v: character }); i += 1;
      }
    }
    return nodes;
  };

  return sequence(text.length);
};

const isOneDigit = (nodes) => nodes.length === 1 && nodes[0].t === 'atom' && isDigit(nodes[0].v);

const serialize = (nodes) => {
  let out = '';
  const append = (piece) => {
    // A command before a letter is followed by a space: \cdot x, \land x.
    if (/\\[A-Za-z]+$/.test(out) && /^[A-Za-z]/.test(piece)) out += ' ';
    out += piece;
  };
  const script = (mark, body) => (isOneDigit(body) ? `${mark}${serialize(body)}` : `${mark}{${serialize(body)}}`);
  for (const node of nodes) {
    if (node.t === 'atom' || node.t === 'cmd') append(node.v);
    else if (node.t === 'fence') append(`\\left(${serialize(node.body)}\\right)`);
    else if (node.t === 'set') {
      const body = serialize(node.body);
      append(`\\left\\lbrace${/^[A-Za-z]/.test(body) ? ' ' : ''}${body}\\right\\rbrace`);
    } else if (node.t === 'bar') append('\\,\\middle{\\vert}\\,');
    else if (node.t === 'abs') append(`\\left|${serialize(node.body)}\\right|`);
    else if (node.t === 'sup') append(node.typedDigits ? `^${serialize(node.body)}` : script('^', node.body));
    else if (node.t === 'sub') append(script('_', node.body));
    else if (node.t === 'frac') {
      append(isOneDigit(node.num) && isOneDigit(node.den)
        ? `\\frac${serialize(node.num)}${serialize(node.den)}`
        : `\\frac{${serialize(node.num)}}{${serialize(node.den)}}`);
    } else if (node.t === 'root') {
      const head = node.index ? `\\sqrt[${node.index}]` : '\\sqrt';
      append(!node.index && isOneDigit(node.body) ? `${head}${serialize(node.body)}` : `${head}{${serialize(node.body)}}`);
    } else if (node.t === 'fn') {
      let piece = `\\${node.name}`;
      if (node.base) piece += node.typedBase ? `_{_{}${serialize(node.base)}}` : script('_', node.base);
      append(piece);
    }
  }
  return out;
};

/** What the editor holds for a typed answer, or null for input the model does not read. */
export const editorTypedSpelling = (text, { variant = 'literal' } = {}) => {
  const value = String(text ?? '');
  if (!value.trim() || /\{\{/.test(value) || UNREAD_COMMAND.test(value)) return null;
  try {
    return serialize(parse(value, variant));
  } catch {
    return null;
  }
};

/*
 * The editor's spellings of a typed answer that differ from it, both ways of
 * building it. None is claimed for an ASCII `B^(E)/N` (drawn B^(E/N), GR04),
 * whose editor spelling is another number however it is typed.
 */
export const editorTypedSpellings = (text) => {
  if (/\^\([^()]*\)\s*\//.test(String(text ?? ''))) return [];
  const out = new Set();
  for (const variant of ['literal', 'natural']) {
    const spelling = editorTypedSpelling(text, { variant });
    if (spelling && spelling !== text) out.add(spelling);
  }
  return [...out];
};
