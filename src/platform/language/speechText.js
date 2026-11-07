/*
 * READ ALOUD — one math-aware speech text for every surface.
 *
 * Before this module the assignment's Read button stripped "$" and "\" and
 * handed the rest to the browser ("y equals minus two slash three x" at best,
 * "backslash frac" at worst), while My Math Path had its own LaTeX reader.
 * Both now ask this one function, so Read aloud says the same mathematics the
 * same way on an assignment, in Work View and on the Path.
 *
 * It is not a full MathML reader. It turns the notation MathMaster actually
 * authors — LaTeX and plain-text equations, inequalities, fractions,
 * coordinates, intervals, sets, function notation and composition, powers,
 * logarithms, absolute value and roots — into speech, and leaves prose alone.
 * Math is found by mathSafeText.js, so a word such as "y-intercept" is never
 * read as "y minus intercept".
 *
 * `language` chooses the spoken math words; the browser's voice is chosen by
 * the caller (speakAloud sets the utterance language).
 */
import { NOT_TWO_VARIABLES, SAID_CLOSE, SAID_OPEN, segmentMathText } from './mathSafeText.js';

// Marks the "a" a phrase is said with in Spanish: an arrow's ("corresponde
// a") and a relation's ("es igual a", "pertenece a", math-speech-3). That "a"
// joins any "el" after it ("corresponde al punto", "es igual al valor
// absoluto"); an "a" without it is the letter a, which never does. Removed by
// `contract`.
const PREPOSITION_A = '';

const WORDS = {
  en: {
    over: 'over', cubeRoot: 'the cube root of', squareRoot: 'the square root of', logBase: 'log base', of: 'of',
    inverse: 'inverse', squared: 'squared', cubed: 'cubed', power: 'to the power',
    le: 'is less than or equal to', ge: 'is greater than or equal to', ne: 'is not equal to', lt: 'is less than', gt: 'is greater than',
    eq: 'equals', pm: 'plus or minus', infinity: 'infinity', times: 'times', divided: 'divided by', plus: 'plus', minus: 'minus',
    negative: 'negative', abs: 'the absolute value of', endAbs: 'end absolute value', point: 'the point', pi: 'pi', percent: 'percent', dollars: 'dollars',
    dollar: 'dollar', cent: 'cent', cents: 'cents', moneyAnd: 'and', composed: 'composed with',
    matrix: (rows, columns) => `a ${rows} by ${columns} matrix`, row: 'row', endMatrix: 'end matrix', determinant: 'the determinant of',
    quantity: 'the quantity', by: 'by',
    fraction: 'the fraction', endFraction: 'end fraction', endRoot: 'end root', root: (n) => `the ${n}th root of`,
    degrees: 'degrees', repeating: 'repeating', segment: 'segment', ray: 'ray', sub: 'sub', endSub: '',
    approx: 'is approximately equal to', cong: 'is congruent to', sim: 'is similar to', parallel: 'is parallel to',
    perp: 'is perpendicular to', angle: 'angle', triangle: 'triangle', in: 'is in', theta: 'theta',
    setOpen: 'the set', setClose: 'end set', squareRootFn: 'the square root of', not: 'not', hat: 'hat',
    union: 'union', interval: (from, to) => `the interval from ${from} to ${to}`, contract: (text) => text,
    // Which ends an interval holds ("[2, 5)" includes 2 but not 5, as the
    // glossary says it). `only(a, b)`: a is included and b is not.
    ends: {
      both: (a, b) => `including ${a} and ${b}`, neither: (a, b) => `not including ${a} or ${b}`,
      only: (a, b) => `including ${a} but not ${b}`, one: (a) => `including ${a}`, none: (a) => `not including ${a}`,
    },
    // A log with no base is the common log, said as ln is said (math-speech-2).
    commonLog: 'log', naturalLog: 'natural log',
    // {y | y > 3}: "the set of y such that y is greater than 3".
    setBuilder: { of: 'the set of', suchThat: 'such that' },
    // What an arrow means where it stands (arrowWords below). Nested, so a
    // short word here ("to") is never taken for a word in a denominator.
    arrows: {
      approaches: 'approaches', mapsTo: 'maps to', to: 'to', gives: 'gives', next: 'then', means: 'means',
      goesInto: 'goes into', replacedBy: 'is replaced by', correspondsTo: 'corresponds to', iff: 'if and only if', implies: 'implies',
    },
    // A bare unit after a quantity: "Cost ($)" is "Cost in dollars".
    units: { dollars: 'in dollars' },
    // Where a bracket of more than one term closes, when more follows.
    endQuantity: 'end quantity',
    // A fraction written as one character (platform-polish-3): ½ is "one
    // half", 2½ "2 and one half".
    vulgarFractions: {
      '½': 'one half', '⅓': 'one third', '⅔': 'two thirds', '¼': 'one fourth', '¾': 'three fourths',
      '⅕': 'one fifth', '⅖': 'two fifths', '⅗': 'three fifths', '⅘': 'four fifths', '⅙': 'one sixth',
      '⅚': 'five sixths', '⅐': 'one seventh', '⅛': 'one eighth', '⅜': 'three eighths', '⅝': 'five eighths',
      '⅞': 'seven eighths', '⅑': 'one ninth', '⅒': 'one tenth',
    },
    mixedAnd: 'and',
    // sin, cos and tan by name, as log and ln are (platform-polish-3).
    trig: { sin: 'sine', cos: 'cosine', tan: 'tangent' },
    // A blank to fill in, "4x + ___" (math-speech-3).
    blank: 'blank',
    // Greek letters by name (math-speech-3): \alpha, β and \Delta were silent
    // or passed raw. A capital is said as its letter, "delta x" for Δx.
    greek: {
      alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'epsilon', lambda: 'lambda', mu: 'mu',
      rho: 'rho', sigma: 'sigma', tau: 'tau', phi: 'phi', omega: 'omega',
    },
    // What the sweep of every lesson and bank text found passed raw
    // (math-speech-3): ∓, a mean's bar (x̄) and a point's primes (B′, A″).
    mp: 'minus or plus', bar: 'bar', primes: ['prime', 'double prime', 'triple prime'],
  },
  es: {
    over: 'sobre', cubeRoot: 'la raíz cúbica de', squareRoot: 'la raíz cuadrada de', logBase: 'logaritmo en base', of: 'de',
    inverse: 'inversa', squared: 'al cuadrado', cubed: 'al cubo', power: 'a la potencia',
    le: 'es menor o igual que', ge: 'es mayor o igual que', ne: `no es igual a${PREPOSITION_A}`, lt: 'es menor que', gt: 'es mayor que',
    eq: `es igual a${PREPOSITION_A}`, pm: 'más o menos', infinity: 'infinito', times: 'por', divided: 'dividido entre', plus: 'más', minus: 'menos',
    negative: 'negativo', abs: 'el valor absoluto de', endAbs: 'fin del valor absoluto', point: 'el punto', pi: 'pi', percent: 'por ciento', dollars: 'dólares',
    dollar: 'dólar', cent: 'centavo', cents: 'centavos', moneyAnd: 'con', composed: 'compuesta con',
    matrix: (rows, columns) => `una matriz de ${rows} por ${columns}`, row: 'fila', endMatrix: 'fin de matriz', determinant: 'el determinante de',
    quantity: 'la cantidad', by: 'por',
    fraction: 'la fracción', endFraction: 'fin de fracción', endRoot: 'fin de raíz', root: (n) => `la raíz ${n} de`,
    degrees: 'grados', repeating: 'periódico', segment: 'segmento', ray: 'rayo', sub: 'sub', endSub: '',
    approx: `es aproximadamente igual a${PREPOSITION_A}`, cong: 'es congruente con', sim: `es semejante a${PREPOSITION_A}`,
    parallel: `es paralela a${PREPOSITION_A}`, perp: `es perpendicular a${PREPOSITION_A}`, angle: 'ángulo', triangle: 'triángulo',
    in: `pertenece a${PREPOSITION_A}`, theta: 'theta',
    setOpen: 'el conjunto', setClose: 'fin de conjunto', squareRootFn: 'la raíz cuadrada de', not: 'no', hat: 'gorro',
    // New with the interval reading (2026-11-06): for the Spanish review
    // (docs/handoffs/NOVEMBER_BUILD_2026-11.md, section 5). "incluye" is the
    // pack's verb for an endpoint ("{2} incluye {3}").
    union: 'unión', interval: (from, to) => `el intervalo de ${from} a ${to}`,
    // "pertenece al conjunto", "del intervalo": a and de join the article. A
    // phrase's "a" (PREPOSITION_A) joins any "el" after it: "corresponde al
    // punto", "es igual al valor absoluto" (math-speech-3; the November
    // handoff, section 6: it was "es igual a el valor absoluto"). "de" joins
    // every article the reader says: "la raíz cuadrada del valor absoluto",
    // "del punto". The letter a is not a preposition: "a|x|" keeps "a el".
    contract: (text) => text
      .replace(new RegExp(`\\ba${PREPOSITION_A} el\\b`, 'g'), 'al')
      .replace(new RegExp(PREPOSITION_A, 'g'), '')
      .replace(/\bde el (valor absoluto|punto|determinante)\b/g, 'del $1')
      .replace(/\b(a|de) el (conjunto|intervalo)\b/g, (match, word, noun) => `${word === 'a' ? 'al' : 'del'} ${noun}`),
    ends: {
      both: (a, b) => `que incluye ${a} y ${b}`, neither: (a, b) => `que no incluye ${a} ni ${b}`,
      only: (a, b) => `que incluye ${a} pero no ${b}`, one: (a) => `que incluye ${a}`, none: (a) => `que no incluye ${a}`,
    },
    // New with math-speech-2, for the Spanish review (NOVEMBER_BUILD section
    // 5). "se acerca a" and "corresponde a" are the pack's own words for
    // "approaches" and "maps to" (esSupport.js).
    commonLog: 'logaritmo', naturalLog: 'logaritmo natural',
    setBuilder: { of: 'el conjunto de', suchThat: 'tal que' },
    arrows: {
      approaches: `se acerca a${PREPOSITION_A}`, mapsTo: `corresponde a${PREPOSITION_A}`, to: `a${PREPOSITION_A}`, gives: 'da', next: 'luego', means: 'significa',
      goesInto: 'entra en', replacedBy: 'se reemplaza por', correspondsTo: `corresponde a${PREPOSITION_A}`, iff: 'si y solo si', implies: 'implica',
    },
    units: { dollars: 'en dólares' },
    endQuantity: 'fin de la cantidad',
    // New with platform-polish-3, for the Spanish review (NOVEMBER_BUILD
    // section 5): a fraction written as one character, a mixed number's "y",
    // and the names of sine, cosine and tangent.
    vulgarFractions: {
      '½': 'un medio', '⅓': 'un tercio', '⅔': 'dos tercios', '¼': 'un cuarto', '¾': 'tres cuartos',
      '⅕': 'un quinto', '⅖': 'dos quintos', '⅗': 'tres quintos', '⅘': 'cuatro quintos', '⅙': 'un sexto',
      '⅚': 'cinco sextos', '⅐': 'un séptimo', '⅛': 'un octavo', '⅜': 'tres octavos', '⅝': 'cinco octavos',
      '⅞': 'siete octavos', '⅑': 'un noveno', '⅒': 'un décimo',
    },
    mixedAnd: 'y',
    trig: { sin: 'seno', cos: 'coseno', tan: 'tangente' },
    // New with math-speech-3, for the Spanish review: a blank to fill in is
    // the pack's "espacio en blanco", and the Greek letters' Spanish names.
    blank: 'espacio en blanco',
    greek: {
      alpha: 'alfa', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'épsilon', lambda: 'lambda', mu: 'mu',
      rho: 'ro', sigma: 'sigma', tau: 'tau', phi: 'fi', omega: 'omega',
    },
    mp: 'menos o más', bar: 'barra', primes: ['prima', 'doble prima', 'triple prima'],
  },
};

export const SPEECH_LANGUAGES = Object.freeze(Object.keys(WORDS));

const wordsFor = (language) => WORDS[String(language || 'en').toLowerCase().split('-')[0]] || WORDS.en;

// One-letter names that are functions when followed by "(": f(x), g(2), C(n).
// x, y, a, b, c, n, k, m are left alone so x(x + 1) is still a product. j is a
// function: Algebra I names a fourth function j(x) far more often than it
// multiplies by a variable j (Oct 2026: "j times the quantity x equals 2x − 1").
const FUNCTION_LETTERS = 'fghjpqrstuvwCPAVRNTDHGF';

// Any other letter is a function where the text itself DEFINES it as one:
// "c(x) = 5x + 20", "Let m(t) = …" (Q-21 / PR-29: c, d, m and n were read as
// products — "c times the quantity x"). A definition is a letter applied to
// one other letter and followed by "=", so x(x + 1) = 6 and the point-slope
// "y − 2 = m(x − 6)" stay products: neither defines a function.
const DEFINITION = /(?<![A-Za-z\\])([A-Za-z])\s*\(\s*([A-Za-z])\s*\)\s*=(?!=)/g;

// A letter whose inverse is applied is a function too: "E⁻¹(x)", "E(E⁻¹(x))"
// (math-speech-3: "E inverse the quantity x", "E ( E inverse …").
const INVERSE_APPLIED = /(?<![A-Za-z\\])([A-Za-z])\s*(?:⁻¹|\^\{\s*-1\s*\}|\^\(\s*-1\s*\))\s*\(/g;

/** The one-letter function names a text defines ("c(x) = …"), as a string of letters. */
export const definedFunctionNames = (raw) => {
  const text = String(raw ?? '').replace(/\\(?:left|right)(?![A-Za-z])/g, '');
  const names = new Set();
  for (const match of text.matchAll(DEFINITION)) {
    if (match[1] !== match[2]) names.add(match[1]);
  }
  for (const match of text.matchAll(INVERSE_APPLIED)) names.add(match[1]);
  return [...names].join('');
};

const functionLettersFor = (extra = '') => {
  const letters = new Set(FUNCTION_LETTERS);
  String(extra || '').split('').filter((letter) => /^[A-Za-z]$/.test(letter)).forEach((letter) => letters.add(letter));
  return [...letters].join('');
};

/*
 * MONEY, said the way a person says it: "$4.50" is "4 dollars and 50 cents",
 * "$1" is "1 dollar", "$0.99" is "99 cents". An amount with more than two
 * decimal places is not money a person would say in cents; it keeps the
 * plain "4.505 dollars".
 */
const priceSpeech = (amount, w) => {
  const [whole, decimals = ''] = String(amount).split('.');
  if (decimals.length > 2) return `${amount} ${w.dollars}`;
  const dollars = Number(whole.replace(/,/g, ''));
  const cents = decimals ? Number(decimals.padEnd(2, '0')) : 0;
  const dollarWords = `${whole} ${dollars === 1 ? w.dollar : w.dollars}`;
  if (!cents) return dollarWords;
  const centWords = `${cents} ${cents === 1 ? w.cent : w.cents}`;
  return dollars === 0 ? centWords : `${dollarWords} ${w.moneyAnd} ${centWords}`;
};

/*
 * A LaTeX matrix, read row by row the way a teacher reads one out:
 * "a 2 by 2 matrix: row 1: 1, 2; row 2: 3, 4; end matrix". A vmatrix is a
 * determinant. Each cell is still mathematics ("-1" is "negative 1").
 */
const matrixSpeech = (body, environment, w) => {
  const rows = String(body)
    .split(/\\\\(?:\[[^\]]*\])?/)
    .map((row) => row.split('&').map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
  if (!rows.length) return ' ';
  const columns = Math.max(...rows.map((row) => row.length));
  const spoken = rows.map((row, index) => `${w.row} ${index + 1}: ${row.join(', ')}`).join('; ');
  const lead = /^[vV]matrix$/.test(environment) ? `${w.determinant} ${w.matrix(rows.length, columns)}` : w.matrix(rows.length, columns);
  return ` ${lead}: ${spoken}; ${w.endMatrix} `;
};
const MATRIX_ENVIRONMENT = /\\begin\{([bpvBV]?matrix|smallmatrix|array)\}(?:\{[^{}]*\})?([\s\S]*?)\\end\{\1\}/g;
// A system in a brace, \begin{cases}…\end{cases} (the Digital SAT bank's
// systems), is its equations one after another, as the question reading says
// a system: "y equals 3x plus 3; y equals 3x squared plus 3x". It was "cases
// y equals 3x plus 3\\ equals …", the row break raw (math-speech-3). Read
// before a text is split, so a brace written without $…$ is read whole too.
const CASES_ENVIRONMENT = /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g;
const casesSpeech = (body) => ` ${String(body).split(/\\\\(?:\[[^\]]*\])?/).map((row) => row.replace(/&/g, ' ').trim()).filter(Boolean).join('; ')} `;

// f(x − 7) and f(x) − 7 are opposite transformations, so the words must differ:
// an input of more than one term is "the quantity", as a bracket is everywhere
// else ("f of the quantity x minus 7" against "f of x minus 7"). Where more
// follows, the input ends at a pause: f(n − 1) + 4 was "f of the quantity n
// minus 1 plus 4", which is also how f(n − 1 + 4) sounds (walkthrough
// 2026-10-22). The pause is PAUSE until the minus signs are read, so a "−"
// after it is still "minus", never "negative".
const PAUSE = '\uE003';
const moreMathFollows = (offset, whole, match) => typeof whole === 'string'
  && /[^\s.,;:?!)\]]/.test(whole.slice(offset + match.length));

/*
 * WHERE A QUANTITY ENDS (math-speech-2, item 10). "(0.002x\u00B2 + 4x + 350) \u2212 12x"
 * sounded the same as "(0.002x\u00B2 + 4x + 350 \u2212 12x)": where the bracket closed
 * was never said. A bracket of more than one term that more of the expression
 * follows (a sign, "times", "over") now ends with "end quantity", as a
 * fraction, a root and the bars already end. One that ends the expression, or
 * that a relation ("= 0") or its own power (", squared") follows, is read as
 * before, so plain speech is no longer than it was. Called just before every
 * remaining "(" becomes "the quantity"; the mark is said at the very end, so
 * a "\u2212" after it is still "minus".
 */
const QUANTITY_END = '\uE005';
/*
 * ONE NUMBER OR ONE LETTER IN BRACKETS IS NOT A QUANTITY (math-speech-3).
 * "6(4) + 4 = 28" was "6 times the quantity 4 plus 4 equals 28", which is how
 * 6(4 + 4) sounds (Algebra I M3 T1 Honors PR 13, walkthrough 2026-11-06). It
 * is "6 times 4 plus 4 equals 28", and "(−3) + 2" "negative 3 plus 2": the
 * bracket only keeps a sign apart. So is a number with its letter, "3(2x) +
 * 1" ("3 times 2x plus 1"), except in a denominator: 1/(2x) is not (1/2)x.
 * Its own power keeps a bracket a quantity, "(−3)²" is "the quantity negative
 * 3, squared", and so does anything more ("(1/2)x", "(x + 1)").
 */
const ONE_TERM = /^\s*[-−]?\s*(?:\d[\d,]*(?:\.\d+)?|\p{L})\s*$/u;
const ONE_TERM_WITH_LETTERS = /^\s*[-−]?\s*\d[\d,]*(?:\.\d+)?\p{L}{1,2}\s*$/u;
const markQuantityEnds = (text, w, operatorWords) => {
  const words = [w.times, w.plus, w.over, w.divided, w.pm].map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const continues = new RegExp(`^\\s*(?:[−\\-+×·÷*/]|(?:${words.join('|')})(?=\\s|$))`);
  // More than one term: a "plus", or a minus between two terms (not a sign after an operator word).
  const terms = new RegExp(`(?:^|\\s)${words[1]}(?=\\s|$)`);
  const denominator = new RegExp(`(?:^|\\s)(?:${words[2]}|${words[3]})\\s*$`);
  const binaryMinus = (inner) => [...inner.matchAll(/(\S+)\s*[\u2212-]\s*(?=\S)/g)]
    .some(([, before]) => /[\p{L}\p{N})\]]$/u.test(before) && !operatorWords.includes(before));
  const ends = [];
  const open = [];
  const dropped = new Set();
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '(') open.push(index);
    else if (text[index] === ')' && open.length) {
      const start = open.pop();
      const inner = text.slice(start + 1, index);
      // A power after a bracket stands after a pause (plainMathToSpeech).
      const oneTerm = ONE_TERM.test(inner) || (ONE_TERM_WITH_LETTERS.test(inner) && !denominator.test(text.slice(0, start)));
      if (oneTerm && !/^\s*/.test(text.slice(index + 1))) {
        dropped.add(start).add(index);
        continue;
      }
      if ((terms.test(inner) || binaryMinus(inner)) && continues.test(text.slice(index + 1))) ends.push(index + 1);
    }
  }
  const kept = dropped.size ? text.split('').map((char, index) => (dropped.has(index) ? ' ' : char)).join('') : text;
  return ends.reverse().reduce((out, at) => `${out.slice(0, at)}${QUANTITY_END}${out.slice(at)}`, kept);
};
const functionApplicationSpeech = (w) => (match, before, name, argument, offset, whole) => (
  // An operator after the first character: f(−3) is one term, f(x − 3) is two.
  // An inner application already read ("d of 2" in c(d(2))) is one term.
  /.[\s+\-−*/·=<>]/.test(argument.trim()) && !new RegExp(`^[A-Za-z](?: ${w.inverse})? ${w.of} (?!.*[+\\-−*/·=<>])`).test(argument.trim())
    ? `${before} ${name} ${w.of} ${w.quantity} ${argument.trim()}${moreMathFollows(offset, whole, match) ? PAUSE : ''} `
    : `${before} ${name} ${w.of} ${argument} `
);

// The argument of a LaTeX command, braces balanced: `\frac{x^{2}+1}{3}` has
// numerator `x^{2}+1`. Returns [argument, indexAfter] or null.
const readGroup = (text, from) => {
  let index = from;
  while (text[index] === ' ') index += 1;
  if (text[index] !== '{') {
    // \frac12 — a single token argument.
    const token = text.slice(index).match(/^\\[A-Za-z]+|^[A-Za-z0-9]/);
    return token ? [token[0], index + token[0].length] : null;
  }
  let depth = 0;
  for (let cursor = index; cursor < text.length; cursor += 1) {
    if (text[cursor] === '\\') { cursor += 1; continue; }
    if (text[cursor] === '{') depth += 1;
    else if (text[cursor] === '}') {
      depth -= 1;
      if (depth === 0) return [text.slice(index + 1, cursor), cursor + 1];
    }
  }
  return null;
};

// Rewrite every `\command{a}{b}` (innermost first is not needed: the callback
// recurses into its own arguments).
const rewriteCommand = (text, pattern, arity, speak) => {
  let out = '';
  let cursor = 0;
  const finder = new RegExp(pattern, 'g');
  let match;
  while ((match = finder.exec(text))) {
    if (match.index < cursor) continue;
    const args = [];
    let after = match.index + match[0].length;
    for (let n = 0; n < arity; n += 1) {
      const group = readGroup(text, after);
      if (!group) break;
      args.push(group[0]);
      after = group[1];
    }
    if (args.length < arity) continue;
    out += text.slice(cursor, match.index) + speak(...args, match);
    cursor = after;
    finder.lastIndex = after;
  }
  return out + text.slice(cursor);
};

// A fraction part that is more than one number or letter needs its edges said
// aloud: "x² + 1 over 3" could be x² + (1/3).
const isSimplePart = (part) => /^\s*-?\s*(?:\d+(?:\.\d+)?|[A-Za-z]|\\pi)\s*$/.test(part);

// \log_{0.5}, \log_2: a braced base, or a bare number or letter.
const LATEX_LOG_BASE = String.raw`\\log_(?:\{\s*([^{}]+?)\s*\}|(\d+(?:\.\d+)?|[A-Za-z]))`;

/*
 * \log(x), \ln x, \ln3, with no base: "log of x", "natural log of 3", as the
 * typed forms are (plainLogsToWords, math-speech-2). A bracket is read whole,
 * one inside it too ("\log(x-(-2))" was "log times the quantity x minus the
 * quantity negative 2"), and is said as a quantity when it holds more than one
 * term: "\log(x+2)" was "log x plus 2", which is also log(x) + 2.
 */
const LATEX_PLAIN_LOG = /\\(ln|log)(?![A-Za-z_])\s*/g;
const latexLogsToWords = (text, w) => {
  let out = '';
  let from = 0;
  for (const match of text.matchAll(LATEX_PLAIN_LOG)) {
    if (match.index < from) continue;
    const at = match.index + match[0].length;
    const bare = /^(?:\d+(?:\.\d+)?|[A-Za-z](?![A-Za-z])|\|[^|]+\|)/.exec(text.slice(at));
    const group = text[at] === '(' ? rootArgument(text, at) : text[at] === '{' ? readGroup(text, at) : bare && [bare[0], at + bare[0].length];
    const name = match[1] === 'ln' ? w.naturalLog : w.commonLog;
    if (!group) {
      out += `${text.slice(from, match.index)} ${name} `;
      from = at;
      continue;
    }
    const argument = group[0].trim();
    const quantity = text[at] === '(' && !/^[A-Za-z0-9.]+$/.test(argument);
    out += `${text.slice(from, match.index)} ${name} ${w.of} ${quantity ? `(${argument})` : argument} `;
    from = group[1];
  }
  return out + text.slice(from);
};

/*
 * GREEK LETTERS BY NAME (math-speech-3; platform-polish-3 logged it). LaTeX's
 * \alpha, \beta and \Delta were silent: "\Delta y/\Delta x" was "y over x",
 * "\cos\alpha" "cosine". The letters written as characters went to the voice
 * raw, and "φ − 1" was "φ negative 1": the split took φ for prose (Read
 * aloud's split now takes a Greek letter as mathematics, mathSafeText.js). π
 * and θ were already said.
 */
const GREEK_NAMES = Object.freeze({
  alpha: 'alpha', beta: 'beta', gamma: 'gamma', Gamma: 'gamma', delta: 'delta', Delta: 'delta', epsilon: 'epsilon',
  varepsilon: 'epsilon', lambda: 'lambda', Lambda: 'lambda', mu: 'mu', rho: 'rho', varrho: 'rho', sigma: 'sigma',
  Sigma: 'sigma', tau: 'tau', phi: 'phi', varphi: 'phi', Phi: 'phi', omega: 'omega', Omega: 'omega',
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'Γ': 'gamma', 'δ': 'delta', 'Δ': 'delta', 'ε': 'epsilon', 'ϵ': 'epsilon',
  'λ': 'lambda', 'Λ': 'lambda', 'μ': 'mu', 'ρ': 'rho', 'σ': 'sigma', 'Σ': 'sigma', 'τ': 'tau', 'φ': 'phi', 'ϕ': 'phi',
  'Φ': 'phi', 'ω': 'omega', 'Ω': 'omega',
});
const LATEX_GREEK = new RegExp(`\\\\(${Object.keys(GREEK_NAMES).filter((name) => /^[A-Za-z]+$/.test(name)).join('|')})(?![A-Za-z])`, 'g');
const UNICODE_GREEK = new RegExp(`[${Object.keys(GREEK_NAMES).filter((name) => !/^[A-Za-z]+$/.test(name)).join('')}]`, 'g');

const latexToSpeech = (raw, w) => {
  let text = String(raw)
    // An escaped dollar is a price, not a delimiter.
    .replace(/\\\$/g, '\uE002')
    .replace(/\$\$?/g, ' ')
    .replace(MATRIX_ENVIRONMENT, (match, environment, body) => matrixSpeech(body, environment, w))
    .replace(/\\det(?![A-Za-z])/g, ` ${w.determinant} `)
    // (f \circ g)(x): between two names \circ is composition, not degrees.
    .replace(/([A-Za-z])\s*\\circ(?![A-Za-z])\s*(?=[A-Za-z])/g, '$1 ∘ ')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, ' ')
    // Sizing only: \left( is "(".
    .replace(/\\(?:left|right|big|Big|bigg|Bigg)(?![A-Za-z])/g, '')
    .replace(/\\[,;:! ]/g, ' ')
    // `~` is a LaTeX non-breaking space, never a word.
    .replace(/~/g, ' ')
    // Set-builder notation, \{y \mid y > 3\}: "the set of y such that y is
    // greater than 3" (math-speech-2). It was "the set y y is greater than 3
    // end set": \mid was dropped. A colon may stand for the bar.
    .replace(/\\\{\s*([A-Za-z])\s*(?:\\middle\s*)?(?:\\mid(?![A-Za-z])|\\vert(?![A-Za-z])|\||:)\s*([\s\S]*?)\s*(?:\\middle\s*)?\\\}/g, ` ${w.setBuilder.of} $1 ${w.setBuilder.suchThat} $2 `)
    // A first member's sign is said here: after "the set" the reader's later
    // pass hears a subtraction ("the set minus 2, 0").
    .replace(/\\\{\s*[-−]\s*/g, ` ${w.setOpen} ${w.negative} `)
    .replace(/\\\{/g, ` ${w.setOpen} `)
    .replace(/\\\}/g, ` ${w.setClose} `);
  text = rewriteCommand(text, String.raw`\\(?:text|mathrm|textbf|mathbf|operatorname)(?![A-Za-z])\s*`, 1, (body) => ` ${body} `);
  // 0.\overline{3}: a repeating decimal; \overline{AB}: segment AB.
  text = rewriteCommand(text, String.raw`(\d\.?\d*)?\\overline(?![A-Za-z])\s*`, 1, (body, match) => (
    match[1] ? ` ${match[1]}${body} ${w.repeating} ` : ` ${w.segment} ${body} `
  ));
  text = rewriteCommand(text, String.raw`\\overrightarrow(?![A-Za-z])\s*`, 1, (body) => ` ${w.ray} ${body} `);
  for (let pass = 0; pass < 4 && /\\[dt]?frac|\\sqrt/.test(text); pass += 1) {
    text = rewriteCommand(text, String.raw`\\[dt]?frac(?![A-Za-z])\s*`, 2, (top, bottom) => (isSimplePart(top) && isSimplePart(bottom)
      ? ` ${top} ${w.over} ${bottom} `
      : ` ${w.fraction} ${top} ${w.over} ${bottom} ${w.endFraction} `));
    text = rewriteCommand(text, String.raw`\\sqrt(?![A-Za-z])\s*\[\s*3\s*\]\s*`, 1, (body) => ` ${w.cubeRoot} ${body} `);
    text = rewriteCommand(text, String.raw`\\sqrt(?![A-Za-z])\s*\[\s*([^\]]+)\]\s*`, 1, (body, match) => ` ${w.root(match[1])} ${body} `);
    text = rewriteCommand(text, String.raw`\\sqrt(?![A-Za-z])\s*`, 1, (body) => (isSimplePart(body)
      ? ` ${w.squareRoot} ${body} `
      : ` ${w.squareRoot} ${body} ${w.endRoot} `));
  }
  // A command ends at the first non-letter, never at `\b`: there is no word
  // boundary between a letter and a digit, so `\ge15`, `\pi2` and `\ne4`
  // fell through to the catch-all below and their words were lost (QA M4).
  // The lookahead also keeps a short name off a longer one (`\ln` / `\lnot`).
  return latexLogsToWords(text, w)
    // log base b of (x): the bracket is the argument, not a product. A base
    // is a braced group or, bare, one number or one letter: \log_{0.5}(x) was
    // "log base 0 of .5", \log_{ 3 }3 "log sub 3 3" and \log_3x "log base 3x
    // of" (walkthrough 2026-11-06, P-1; the Path bank).
    // An argument of more than one term is a quantity, as in the typed form
    // (logBasesToWords): "\log_{0.5}(x - 3)" was "log base 0.5 of x minus 3",
    // which is also log(x) − 3 (math-speech-2).
    .replace(new RegExp(`${LATEX_LOG_BASE}\\s*\\(([^()]*)\\)`, 'g'), (match, braced, bare, argument) => ` ${w.logBase} ${braced ?? bare} ${w.of} ${/^\s*[A-Za-z0-9.]+\s*$/.test(argument) ? argument : `(${argument})`} `)
    .replace(new RegExp(LATEX_LOG_BASE, 'g'), (match, braced, bare) => ` ${w.logBase} ${braced ?? bare} ${w.of} `)
    .replace(/\\(sin|cos|tan)\s*\(([^()]*)\)/g, ' $1 $2 ')
    .replace(/\^\s*\{?\s*\\circ\s*\}?/g, ` ${w.degrees} `)
    .replace(/\\circ(?![A-Za-z])/g, ` ${w.degrees} `)
    .replace(/°/g, ` ${w.degrees} `)
    // The slanted forms are the same relations (AX16: they were silent).
    .replace(/\\le(?:q|qslant)?(?![A-Za-z])/g, ' ≤ ')
    .replace(/\\ge(?:q|qslant)?(?![A-Za-z])/g, ' ≥ ')
    .replace(/\\(?:neg|lnot)(?![A-Za-z])|¬/g, ` ${w.not} `)
    .replace(/\\ne(q)?(?![A-Za-z])/g, ' ≠ ')
    .replace(/\\lt(?![A-Za-z])/g, ' < ')
    .replace(/\\gt(?![A-Za-z])/g, ' > ')
    .replace(/\\approx(?![A-Za-z])/g, ` ${w.approx} `)
    .replace(/\\cong(?![A-Za-z])/g, ` ${w.cong} `)
    .replace(/\\sim(?![A-Za-z])/g, ` ${w.sim} `)
    .replace(/\\parallel(?![A-Za-z])/g, ` ${w.parallel} `)
    .replace(/\\perp(?![A-Za-z])/g, ` ${w.perp} `)
    .replace(/\\angle(?![A-Za-z])/g, ` ${w.angle} `)
    .replace(/\\triangle(?![A-Za-z])/g, ` ${w.triangle} `)
    .replace(/\\in(?![A-Za-z])/g, ` ${w.in} `)
    .replace(/\\pm(?![A-Za-z])/g, ' ± ')
    .replace(/\\infty(?![A-Za-z])/g, ' ∞ ')
    // A union is read with its intervals (plainMathToSpeech); it was dropped.
    .replace(/\\cup(?![A-Za-z])/g, ' ∪ ')
    .replace(/\\(?:cdot|times)(?![A-Za-z])/g, ' × ')
    .replace(/\\div(?![A-Za-z])/g, ' ÷ ')
    .replace(/\\pi(?![A-Za-z])/g, ' π ')
    .replace(/\\(?:var)?theta(?![A-Za-z])|[θϑ]/g, ` ${w.theta} `)
    .replace(LATEX_GREEK, (match, name) => ` ${w.greek[GREEK_NAMES[name]]} `)
    .replace(UNICODE_GREEK, (letter) => ` ${w.greek[GREEK_NAMES[letter]]} `)
    .replace(/\\%/g, '%')
    .replace(/\\(sin|cos|tan|ln|log)(?![A-Za-z])/g, ' $1 ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    // Subscripts: x_1 is "x sub 1", a_{n-1} is "a sub n minus 1".
    .replace(/_\{([^{}]+)\}/g, ` ${w.sub} $1 ${w.endSub} `)
    .replace(/_([A-Za-z0-9])/g, ` ${w.sub} $1 `)
    .replace(/\^\{([^{}]+)\}/g, '^($1)')
    .replace(/[{}]/g, ' ')
    .replace(/\uE002/g, '$');
};

// Letter runs a denominator may hold that are said as one word (review SF2).
const DENOMINATOR_WORDS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'ln', 'log', 'exp', 'abs', 'sqrt', 'pi']);
// The first and last word of each spoken phrase: "the" (the square root of),
// "la", "el", and the operator words a phrase ends in.
const phraseWordsFor = (w) => new Set(Object.values(w).filter((value) => typeof value === 'string' && value)
  .flatMap((value) => { const parts = value.split(' '); return [parts[0], parts[parts.length - 1]]; }));
const phraseWordsCache = new WeakMap();
const readsAsWord = (letters, w) => {
  if (DENOMINATOR_WORDS.has(letters.toLowerCase())) return true;
  // A Greek letter's name, said already ("1/φ": "1 over phi", Spanish "fi").
  if (Object.values(w.greek).includes(letters)) return true;
  if (!phraseWordsCache.has(w)) phraseWordsCache.set(w, phraseWordsFor(w));
  if (phraseWordsCache.get(w).has(letters)) return true;
  return letters.length >= 3 && /[aeiou]/i.test(letters);
};

/*
 * INTERVALS, SAID AS INTERVALS (walkthrough 2026-11-06, P-1). (−∞, ∞) was
 * read "the point negative infinity, infinity", and [0, ∞) "0, infinity": the
 * brackets, which are the answer, were dropped. A pair is an interval when an
 * end is infinite or a bracket is square (not a row of a matrix written in
 * brackets). Two finite ends in round brackets are a point, unless the
 * sentence says this is an interval (`intervals`: "increasing on (−2, 2)",
 * a union). Each finite end says whether it is included; infinity never is,
 * so at infinity only a square bracket, which is wrong there, is said.
 */
const INTERVAL_PAIR = /([[(])\s*([^()[\],;]+?)\s*,\s*([^()[\],;]+?)\s*([\])])/g;
// A value's own sign is said here: after "from", "to", "including" or "the
// set" the reader's later pass would hear a subtraction ("to minus 2").
const leadingSignInWords = (value, w) => value.trim().replace(/^[-−]\s*/, `${w.negative} `).replace(/∞/g, w.infinity);
const intervalSpeech = (open, left, right, close, w) => {
  const [from, to] = [leadingSignInWords(left, w), leadingSignInWords(right, w)];
  const [fromIn, toIn] = [open === '[', close === ']'];
  const fromSaid = fromIn || !/∞/.test(left);
  const toSaid = toIn || !/∞/.test(right);
  let ends = '';
  if (fromSaid && toSaid) {
    if (fromIn === toIn) ends = fromIn ? w.ends.both(from, to) : w.ends.neither(from, to);
    else ends = fromIn ? w.ends.only(from, to) : w.ends.only(to, from);
  } else if (fromSaid || toSaid) {
    const [included, end] = fromSaid ? [fromIn, from] : [toIn, to];
    ends = included ? w.ends.one(end) : w.ends.none(end);
  }
  return ` ${w.interval(from, to)}${ends ? `, ${ends}` : ''} `;
};

// x^((3 + 3)/3): the exponent's own bracket is the power's, "x to the power
// the quantity 3 plus 3 end quantity over 3"; the brackets inside it are read
// as any are.
const bracketedPowers = (raw, w) => {
  let text = raw;
  for (let at = text.indexOf('^('); at !== -1; at = text.indexOf('^(')) {
    let depth = 0;
    let close = -1;
    for (let index = at + 1; index < text.length; index += 1) {
      if (text[index] === '(') depth += 1;
      else if (text[index] === ')') { depth -= 1; if (depth === 0) { close = index; break; } }
    }
    if (close === -1) break;
    text = `${text.slice(0, at)} ${w.power} ${text.slice(at + 2, close)} ${text.slice(close + 1)}`;
  }
  return text;
};

/** Plain-text mathematics (after LaTeX is reduced) to words. */
/*
 * A FRACTION WRITTEN AS ONE CHARACTER (platform-polish-3; F-READ-SYMBOLS in
 * the 2026-11-06 Algebra I M3 T2 walkthrough). "y = ½x + 4" was "y equals ½
 * x plus 4": the character went to the voice as it is. It is said as a
 * fraction is: "one half", 2½ "2 and one half". Said first, so the rules
 * below read it as any number: −½ is "negative one half" and ½(x − 4) "one
 * half times the quantity x minus 4".
 */
const VULGAR_FRACTIONS = '½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒';
const MIXED_VULGAR = new RegExp(`(\\d)([${VULGAR_FRACTIONS}])`, 'g');
const LONE_VULGAR = new RegExp(`[${VULGAR_FRACTIONS}]`, 'g');
const vulgarFractionsToWords = (text, w) => String(text)
  .replace(MIXED_VULGAR, (match, whole, fraction) => `${whole} ${w.mixedAnd} ${w.vulgarFractions[fraction]} `)
  .replace(LONE_VULGAR, (fraction) => ` ${w.vulgarFractions[fraction]} `);

/*
 * A BRACKET THAT HOLDS A RELATION IS AN ASIDE, NEVER A QUANTITY
 * (math-speech-3). "…the greatest whole number is 153 (f(153) = 598.75)" was
 * "…is 153 the quantity f of 153 equals 598.75" (Algebra I M3 T1 L3 CW 11
 * and Honors CW 9, worked steps), and "a negative number (b = −2)" "… the
 * quantity b equals negative 2". Its brackets are pauses: "is 153, f of 153
 * equals 598.75". A bracket pressed against a name or a number, f(x = 2), is
 * not an aside; nor is a relation inside a bracket inside it.
 */
const RELATION_SYMBOL = /[=<>≤≥≠≈]/;
const asideSpans = (text) => {
  const spans = [];
  const open = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '(') open.push(index);
    else if (text[index] === ')' && open.length) {
      const start = open.pop();
      let own = text.slice(start + 1, index);
      for (let pass = 0; pass < 4 && /\([^()]*\)/.test(own); pass += 1) own = own.replace(/\([^()]*\)/g, ' ');
      if (RELATION_SYMBOL.test(own) && !/[\p{L}\p{N})\]]$/u.test(text.slice(0, start))) spans.push([start, index]);
    }
  }
  // The outermost only: an aside inside an aside is read with it.
  return spans.filter(([start, end]) => !spans.some(([from, to]) => from < start && to > end));
};
// A pause where something is said before or after it, and none against a
// stop that is already there ("(b = −2), which").
const PAUSES_BEFORE = /[\p{L}\p{N}%)\]’”"']\s*$/u;
const PAUSES_AFTER = /^\s*[\p{L}\p{N}(]/u;
const relationAsidesAsPauses = (text) => asideSpans(text)
  .sort((a, b) => b[0] - a[0])
  .reduce((out, [start, end]) => {
    const [before, after] = [out.slice(0, start), out.slice(end + 1)];
    return `${before}${PAUSES_BEFORE.test(before) ? PAUSE : ''} ${out.slice(start + 1, end)} ${PAUSES_AFTER.test(after) ? PAUSE : ''}${after}`;
  }, text);
// A run of mathematics that is one aside ("(f(153) = 598.75)" after a word):
// speechTextFor gives it its pauses, which the run cannot see.
const isWholeAside = (value) => {
  const text = String(value).trim();
  return asideSpans(text).some(([start, end]) => start === 0 && end === text.length - 1);
};

const plainMathToSpeech = (raw, w, functionNames = '', { intervals = false } = {}) => {
  let text = relationAsidesAsPauses(` ${vulgarFractionsToWords(raw, w)} `);
  const letters = functionLettersFor(functionNames);
  // The last word of every operator phrase: a bracket after one of these is a
  // new quantity, not a product ("x equals the quantity …", never "equals
  // times the quantity").
  // A Spanish phrase's marked "a" is one of them, and so, as before, is the
  // letter a (a sign after it is read as after "es igual a"; the November
  // handoff's section 5 holds that for the owner).
  const operatorWords = [w.eq, w.plus, w.minus, w.times, w.over, w.lt, w.gt, w.le, w.ge, w.ne, w.pm, w.of, w.point, w.divided, w.power, w.quantity, w.union]
    .flatMap((word) => { const last = word.split(' ').pop(); return [last, last.replace(PREPOSITION_A, '')]; });
  // A bracket holding only the symbol names the symbol: "a union (∪)".
  text = text.replace(/\(\s*([∘∪])\s*\)/g, ' $1 ');
  const matrixRows = /\[\s*\[|\]\s*\]/.test(text);
  text = text.replace(INTERVAL_PAIR, (match, open, left, right, close, offset, whole) => {
    const square = open === '[' || close === ']';
    // What follows "x ∈" is a set or an interval, never a point.
    const afterIn = /∈\s*$/.test(whole.slice(0, offset));
    const interval = square ? !matrixRows : (intervals || afterIn || /∞/.test(`${left}${right}`));
    return interval ? intervalSpeech(open, left, right, close, w) : match;
  });
  // Coordinates: a bracket group of two or three comma-separated values.
  text = text.replace(/\(\s*([^(),]+?)\s*,\s*([^(),]+?)\s*(?:,\s*([^(),]+?)\s*)?\)/g, (match, a, b, c) => (
    ` ${w.point} ${a}, ${b}${c ? `, ${c}` : ''} `
  ));
  text = text
    // |x − 2|: "times" after a coefficient (2|x − 2| was "2 the absolute value
    // of"), and an end where more follows a multi-term inside, so 2|x − 2| − 4
    // is not heard as 2|x − 2 − 4| (walkthrough 2026-10-22).
    // One term inside ends too where a sign, a product or a power follows:
    // "|−3| − 3" was heard as |−3 − 3|, "|b|·|x|" as |b·|x|| (math-speech-2,
    // item 11). A relation or the end needs none ("|x| = 3"). No "times"
    // after a word already said: "log base 2 of |x|" was "of times …".
    .replace(/\|([^|]+)\|/g, (match, body, offset, whole) => {
      const before = whole.slice(0, offset).trimEnd();
      const coefficient = /[A-Za-z0-9)½⅓⅔¼¾]$/.test(before) && !operatorWords.includes(before.split(/\s+/).pop());
      const ends = /.[\s+\-−*/·=<>]/.test(body.trim())
        ? moreMathFollows(offset, whole, match)
        : /^\s*(?:[+\-−*/·×÷^√∛∜(|]|[\p{L}\p{N}])/u.test(whole.slice(offset + match.length));
      return ` ${coefficient ? `${w.times} ` : ''}${w.abs} ${body} ${ends ? `${w.endAbs} ` : ''}`;
    })
    // (f + g)(x), (m − n)(2), (f ∘ g)(x): an operation on two functions,
    // applied — "f plus g of x", never "the quantity f plus g times x". Two
    // function names side by side, (fg)(x), are their product (AX20): "f
    // times g of x", never "the quantity fg times the quantity x".
    .replace(new RegExp(`\\(\\s*([${letters}])\\s*([-+−*·×/∘]?)\\s*([${letters}])\\s*\\)\\s*\\(([^()]+)\\)`, 'g'), (match, left, operator, right, argument) => {
      const word = { '+': w.plus, '-': w.minus, '−': w.minus, '/': w.over, '∘': w.composed }[operator] || w.times;
      return functionApplicationSpeech(w)(match, ` ${left} ${word}`, right, argument);
    })
    // "In (f ∘ g), g acts first": the bracket only names the composite.
    .replace(new RegExp(`\\(\\s*([${letters}])\\s*∘\\s*([${letters}])\\s*\\)(?!\\s*\\()`, 'g'), ' $1 ∘ $2 ')
    .replace(/∘/g, ` ${w.composed} `)
    // A pause before "union", so a piece's "not including 0" is heard as its own.
    .replace(/∪/g, (match, offset, whole) => `${/\S/.test(whole.slice(0, offset)) ? PAUSE : ''} ${w.union} `)
    // "x ∈ {−2, 0, 2}" is "x is in the set …", as LaTeX's \in is.
    .replace(/∈/g, ` ${w.in} `);
  // f(g(2)) is applied from the inside out: each pass reads one level. An
  // inverse applied, f⁻¹(x) or f^(-1)(x), is "f inverse of x"; it was "f
  // inverse x" or "f inverse times x" (math-speech-3).
  const application = new RegExp(`(^|[^A-Za-z])([${letters}])(⁻¹|\\^\\(\\s*-1\\s*\\))?\\(([^()]+)\\)`, 'g');
  const applied = (match, before, name, inverse, argument, offset, whole) => functionApplicationSpeech(w)(match, before, inverse ? `${name} ${w.inverse}` : name, argument, offset, whole);
  for (let pass = 0; pass < 4; pass += 1) {
    const next = text.replace(application, applied);
    if (next === text) break;
    text = next;
  }
  text = text
    .replace(/(?:√|\bsqrt)\s*\(([^()]+)\)/g, ` ${w.squareRoot} $1 `)
    .replace(/√\s*([A-Za-z0-9.]+)/g, ` ${w.squareRoot} $1 `)
    // A power after a bracket ends the bracket first: (27x⁶)^(1/3) is "the
    // quantity 27x to the power 6, to the power 1 over 3".
    .replace(/\)\s*(?=\^)/g, `)${PAUSE}`)
    // Exact exponents only: "^(2" of ^(2/3) is not "squared", nor "^(-1" of
    // ^(-1/2) "inverse" — x^{2/3} was read "x squared over 3" (walkthrough
    // 2026-10-23, Rational Exponents).
    .replace(/\^\(\s*-1\s*\)|\^-1(?![0-9./])|⁻¹/g, ` ${w.inverse} `)
    .replace(/\^\(\s*2\s*\)|\^2(?![0-9./])|²/g, ` ${w.squared} `)
    .replace(/\^\(\s*3\s*\)|\^3(?![0-9./])|³/g, ` ${w.cubed} `)
    .replace(/\^\(([^()]+)\)/g, ` ${w.power} $1 `)
    .replace(/\^(-?[A-Za-z0-9.]+)/g, ` ${w.power} $1 `)
    // An exponent that holds a bracket, x^((3 + 3)/3), and a power whose
    // exponent the reader has said in words (x^√8): the caret reached the
    // voice, "x^ the quantity the quantity 3 plus 3 …" (math-speech-3).
    .replace(/[\s\S]*/, (whole) => bracketedPowers(whole, w))
    .replace(/\^\s*/g, ` ${w.power} `)
    .replace(/<=|≤/g, ` ${w.le} `)
    .replace(/>=|≥/g, ` ${w.ge} `)
    .replace(/!=|≠/g, ` ${w.ne} `)
    .replace(/</g, ` ${w.lt} `)
    .replace(/>/g, ` ${w.gt} `)
    .replace(/∓/g, ` ${w.mp} `)
    .replace(/±/g, ` ${w.pm} `)
    // ≈ as \approx is; it was passed raw (math-speech-3), and so was ⟂.
    .replace(/≈/g, ` ${w.approx} `)
    .replace(/[⟂⊥]/g, ` ${w.perp} `)
    .replace(/=/g, ` ${w.eq} `)
    .replace(/∞/g, ` ${w.infinity} `)
    .replace(/π/g, ` ${w.pi} `)
    .replace(/[×·*]/g, ` ${w.times} `)
    .replace(/÷/g, ` ${w.divided} `)
    .replace(/(\d)\s*%/g, `$1 ${w.percent}`)
    .replace(/\$(\d[\d,]*(?:\.\d+)?)/g, (match, amount) => priceSpeech(amount, w))
    // a/b — a fraction, read "a over b". The denominator is one number, one
    // word or one bracket, so "-2/3x" is "negative 2 over 3 x". It may carry
    // its own sign: a divided term "-10 / -2" is "negative 10 over negative 2"
    // (it read "negative 10 / minus 2"; pass 3, MATH_DISPLAY "Not done").
    // Letters after "/" are read as a word only when they are one: a function
    // or constant (sin, ln, pi), the head of a phrase already said in words
    // ("the square root of"), or a word of three or more letters with a vowel
    // (rise/run, miles/hour). Anything else is a product of variables, said
    // letter by letter: "V/lw" is "V over l w", "dy/dx" "dy over d x"
    // (review SF2).
    .replace(/([A-Za-z0-9.)]+)\s*\/\s*([-−]?\s*)(\d+(?:\.\d+)?|[A-Za-z]+|\([^()]*\))/g, (match, numerator, sign, denominator) => (
      ` ${numerator} ${w.over} ${sign}${/^[A-Za-z]+$/.test(denominator) && !readsAsWord(denominator, w) ? denominator.split('').join(' ') : denominator} `
    ))
    .replace(/\+/g, ` ${w.plus} `)
    // Products with brackets: 2(x + 1), x(x - 3), (x + 2)(x + 3).
    .replace(/\)\s*\(/g, ')\uE000(')
    .replace(/([\p{L}0-9]+)\s*\(/gu, (match, token) => (operatorWords.includes(token) ? `${token} (` : `${token}\uE000(`))
    .replace(/\uE000/g, ` ${w.times} `);
  text = markQuantityEnds(text, w, operatorWords)
    .replace(/\(/g, ` ${w.quantity} `);
  // A minus sign is "negative" where it starts a quantity (start, after an
  // operator word or an opening bracket) and "minus" between two quantities.
  // The word before a sign never holds a sign itself: "x-7 - 50/(x-5)" kept
  // "x-7" whole as the word before the second sign and read it with its
  // hyphen (walkthrough 2026-10-22, "x-7 minus the fraction …").
  text = text.replace(/([^\s\-−]*)\s*[-−]\s*(?=[A-Za-z0-9.(√]|[-−]\s*[A-Za-z0-9.(√])/g, (match, before) => {
    const previous = before.trim();
    const unary = !previous || /[(,[;:]$/.test(previous) || operatorWords.includes(previous);
    return unary ? `${previous} ${w.negative} ` : `${previous} ${w.minus} `;
  });
  // A sign the run ends with (math-speech-3). The split cuts it off from
  // the words after it, "(starting amount) − (rate) · (variable)" (Algebra I
  // M3 T1 L3 PR 6), "joined by + or −", "4x − ___", and it reached the voice
  // as the symbol. After an operand, or alone, it is "minus"; after an
  // operator word or an opening, "negative" ("x = −___": "negative blank").
  // A hyphen pressed against what is before it is a word's: "the x- and
  // y-values", "a 6-hour job".
  text = text.replace(/([^\s\-−]*)(\s*)([-−])\s*$/, (match, before, space, sign) => {
    if (sign === '-' && before && !space) return match;
    const previous = before.trim();
    const unary = Boolean(previous) && (/[(,[;:]$/.test(previous) || operatorWords.includes(previous));
    return unary ? `${previous} ${w.negative} ` : `${previous} ${w.minus} `;
  });
  return text.replace(/[()[\]]/g, ' ').replace(/\s*\uE003/g, ',').replace(new RegExp(QUANTITY_END, 'g'), ` ${w.endQuantity} `);
};

/*
 * UNICODE POWERS AND ROOTS, IN THE FORMS THE READER ALREADY READS.
 *
 * Labels and prompts write powers and roots as characters: x⁶, √(16x⁴y¹¹),
 * ∛2, ⁶√16. Only ² and ³ were read; ⁴…⁹ stayed raw, and the segmenter split
 * ∛, ∜ and an index root off as prose, so "⁶√16" was read "⁶ the square root
 * of 16" (walkthrough 2026-10-23, Polynomials and Radicals). A power becomes
 * ^(n); a root becomes its words in the reader's language, then its argument
 * (bracketed when it is more than one term, so where the root ends is said).
 *
 * A letter written as a superscript is a power too (walkthrough 2026-11-06,
 * P-1): 2ˣ was read "2 ˣ", the raw character, while the typed 2^x was "2 to
 * the power x". So were bⁿ, xᵃ⁺ᵇ and x⁻ᵃ, and ⁿ√b was "ⁿ the square root of
 * b". A superscript ordinal (1ˢᵗ, 2ⁿᵈ) is still the word "1st".
 */
const SUPERSCRIPT_MAP = {
  // A minus sign, not a hyphen: "a-b" is one word to the segmenter.
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '−', '⁺': '+',
  '⁼': '=', '⁽': '(', '⁾': ')',
  'ᵃ': 'a', 'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e', 'ᶠ': 'f', 'ᵍ': 'g', 'ʰ': 'h', 'ⁱ': 'i', 'ʲ': 'j', 'ᵏ': 'k', 'ˡ': 'l', 'ᵐ': 'm',
  'ⁿ': 'n', 'ᵒ': 'o', 'ᵖ': 'p', 'ʳ': 'r', 'ˢ': 's', 'ᵗ': 't', 'ᵘ': 'u', 'ᵛ': 'v', 'ʷ': 'w', 'ˣ': 'x', 'ʸ': 'y', 'ᶻ': 'z',
};
const SUPERSCRIPTS = Object.keys(SUPERSCRIPT_MAP).join('');
// The characters a power's exponent is written in, without a sign or a bracket.
const EXPONENT_CHARACTERS = SUPERSCRIPTS.replace(/[⁻⁺⁼⁽⁾]/g, '');
const fromSuperscript = (run) => [...run].map((char) => SUPERSCRIPT_MAP[char] ?? '').join('');
const SUPERSCRIPT_ORDINAL = /(\d)(ˢᵗ|ⁿᵈ|ʳᵈ|ᵗʰ)(?![\p{L}\p{N}])/gu;
const SIMPLE_ARGUMENT = new RegExp(`^[A-Za-z0-9.…]+[${EXPONENT_CHARACTERS}]*$`);
const ROOT_OF_SIMPLE = new RegExp(`^(?:[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ]+√|[√∛∜])[A-Za-z0-9.…]+[${EXPONENT_CHARACTERS}]*$`);
const rootArgument = (text, from) => {
  let index = from;
  while (text[index] === ' ') index += 1;
  if (text[index] === '(') {
    let depth = 0;
    for (let end = index; end < text.length; end += 1) {
      if (text[end] === '(') depth += 1;
      else if (text[end] === ')') { depth -= 1; if (depth === 0) return [text.slice(index + 1, end), end + 1]; }
    }
    return null;
  }
  const run = new RegExp(`^[A-Za-z0-9.…]+[${EXPONENT_CHARACTERS}]*`).exec(text.slice(index));
  return run ? [run[0], index + run[0].length] : null;
};

/*
 * A LOGARITHM'S BASE WRITTEN AS TEXT: log₂(x), log₁⁄₂(x), log_0.5(x), log_b x.
 * Only LaTeX's \log_2 was read as a base. A subscript base was "log sub 2
 * times the quantity x", an underscore "log_ 0.5 times the quantity x" (the
 * function family's own spelling of a base that is not 2 or 10), and the
 * fraction base of log₁⁄₂(x) "log sub 1 ⁄₂ the quantity x" (walkthrough
 * 2026-11-06, P-1). Each is said "log base 2 of x", in the reader's words, its
 * argument bracketed when it is more than one term, as a root's is.
 */
const SUBSCRIPT_BASE = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₐ': 'a', 'ₑ': 'e', 'ₓ': 'x', 'ₙ': 'n', 'ₖ': 'k', 'ₘ': 'm', '⁄': '/' };
const LOG_BASE = /(?<![A-Za-z\\])log(?:([₀-₉ₐₑₓₙₖₘ]+(?:[⁄.][₀-₉]+)?)|_\{\s*([^{}]+?)\s*\}|_(\d+(?:\.\d+)?|[A-Za-z]))/g;
const logArgument = (text, from) => {
  let index = from;
  while (text[index] === ' ') index += 1;
  // A bracket is the argument; without one, a number or a lone letter
  // ("log₂ 8", "log_b x"), never the next word ("log₂ is …").
  if (text[index] === '(') return rootArgument(text, index);
  const run = /^(?:\d+(?:\.\d+)?|[A-Za-z](?![A-Za-z]))/.exec(text.slice(index));
  return run ? [run[0], index + run[0].length] : null;
};
const logBasesToWords = (text, w) => {
  let out = '';
  let from = 0;
  for (const match of text.matchAll(LOG_BASE)) {
    if (match.index < from) continue;
    const base = match[1] ? [...match[1]].map((char) => SUBSCRIPT_BASE[char] ?? char).join('') : (match[2] ?? match[3]);
    const after = match.index + match[0].length;
    const argument = logArgument(text, after);
    const body = argument?.[0].trim();
    const of = argument ? ` ${w.of} ${SIMPLE_ARGUMENT.test(body) ? body : `(${body})`}` : '';
    out += `${text.slice(from, match.index)} ${w.logBase} ${base}${of} `;
    from = argument ? argument[1] : after;
  }
  return out + text.slice(from);
};

/*
 * A LOG WITH NO BASE, AND LN (math-speech-2). "log(x)" was "log times the
 * quantity x" and "ln(x)" "ln times the quantity x": the bracket was read as
 * a product. They are "log of x", the common log, as "log base 2 of x" is
 * said, and "natural log of x". The argument is found as a base's is
 * (logArgument), and only mathematics is one: the word "log" in prose ("a log
 * (record) of every read", "log a question") is left alone.
 */
const PLAIN_LOG = /(?<![A-Za-z\\])(log|ln)(?![A-Za-z_₀-₉ₐₑₓₙₖₘ])/g;
const FUNCTION_WORDS = new Set(['sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'abs', 'exp']);
const plainLogArgument = (text, from) => {
  const argument = logArgument(text, from);
  if (!argument || /^\s*[aAI]\s*$/.test(argument[0])) return null;
  const words = argument[0].match(/[A-Za-z]{3,}/g) || [];
  return words.every((word) => FUNCTION_WORDS.has(word.toLowerCase())) ? argument : null;
};
const plainLogsToWords = (text, w) => {
  let out = '';
  let from = 0;
  for (const match of text.matchAll(PLAIN_LOG)) {
    if (match.index < from) continue;
    const argument = plainLogArgument(text, match.index + match[0].length);
    if (!argument) {
      // ln alone is still the natural log; "log" is a word as it stands.
      if (match[1] === 'ln') {
        out += `${text.slice(from, match.index)} ${w.naturalLog} `;
        from = match.index + match[0].length;
      }
      continue;
    }
    const body = argument[0].trim();
    out += `${text.slice(from, match.index)} ${match[1] === 'ln' ? w.naturalLog : w.commonLog} ${w.of} ${SIMPLE_ARGUMENT.test(body) ? body : `(${body})`} `;
    from = argument[1];
  }
  return out + text.slice(from);
};

// A log or ln in prose before its argument ("ln x", "log 100 = 2"): the
// segmenter keeps a name followed by a space as a word, so its "of" is said
// here, before the mathematics that follows. Any other "ln" is the natural
// log by name ("Take ln of both sides").
const proseLogNames = (prose, next, w) => prose
  .replace(/(?<![A-Za-z\\])(?<!\ban? )(log|ln)(\s+)$/, (match, name, space) => (
    next?.kind === 'math' && /^\s*(?:\d|[A-Za-z](?![A-Za-z])|\()/.test(next.value) ? `${name === 'ln' ? w.naturalLog : w.commonLog} ${w.of}${space}` : match))
  // …and sin, cos or tan before its own (platform-polish-3): "sin x" is
  // "sine of x", and "sin2x" "sine of 2x".
  .replace(/(?<![A-Za-z\\])(sin|cos|tan)(\s*)$/, (match, name, space) => (
    next?.kind === 'math' && /^\s*(?:\d|[A-Za-z](?![A-Za-z])|\(|[θαβφ])/.test(next.value) ? `${w.trig[name]} ${w.of}${space}` : match))
  // …or before an angle's name in the prose ("tan θ").
  .replace(/(?<![A-Za-z\\])(sin|cos|tan)(\s*)(?=[θαβφ])/g, (match, name, space) => `${w.trig[name]} ${w.of}${space || ' '}`)
  .replace(/(?<![A-Za-z\\])ln(?![A-Za-z])/g, w.naturalLog);

/*
 * A SET WRITTEN WITH PLAIN BRACES: {(−3, 26), (2, 11)}, {0, 1, 2, …, 48}.
 * LaTeX's \{…\} is read "the set …, end set"; plain braces were left raw ("{
 * the point negative 3, 26, … }", walkthrough 2026-11-06, P-1). They read the
 * same now. A brace that groups LaTeX (\frac{1}{2}, x^{2}, a_{n},
 * \sqrt[3]{x}), a template placeholder ({{n}}) or any brace inside a $…$
 * span is not a set, and a set of one member holds one number, point or
 * letter, never a word.
 */
const LATEX_SPAN = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g;
const PLAIN_SET = /(?<![\\^_{}\]\p{L}])\{([^{}$\\^_]*)\}(?!\})/gu;
const isSetMembers = (members) => /[\p{L}\p{N}∞]/u.test(members) && !/\p{L}{2,}/u.test(members)
  && (members.includes(',') || /^\s*(?:[-−+±]?\s*\d+(?:\.\d+)?|\([^()]*\)|\p{L})\s*$/u.test(members));
// A bare unit after a quantity, "Money raised by 39 muffins and 25 smoothies
// ($)", is said "in dollars", as a person reads a table's heading; the voice
// was handed "($)" (lesson re-walk 2026-11-06). Taken out before the text is
// split, so its "$" never opens a LaTeX span with a later one.
const dollarUnits = (text, w) => text.replace(/\s*\(\s*\$\s*\)/g, ` ${w.units.dollars}`);

/*
 * A NAME'S MARKS, SAID (math-speech-3; the sweep of every lesson and bank
 * text). A point's primes went to the voice raw and apart from their letter
 * ("B ′", "A‴ B ‴"), and a mean's bar too ("x ̄"). They are "B prime", "A
 * triple prime" and "x bar", held for Read aloud's split as a root's words
 * are.
 */
const PRIMES = { '′': 0, '″': 1, '‴': 2 };
const markedNames = (text, w, mark) => {
  const said = (words) => (mark ? `${SAID_OPEN}${words}${SAID_CLOSE}` : ` ${words} `);
  return text
    .replace(/([A-Za-z])([′″‴])/g, (match, letter, prime) => `${letter}${said(w.primes[PRIMES[prime]])}`)
    .replace(/([A-Za-z])\u0304/g, (match, letter) => `${letter}${said(w.bar)}`)
    .replace(/ȳ/g, `y${said(w.bar)}`);
};

// A blank to fill in, "4(x − 2) + 3 = 4x + ___" (Algebra I M3 T1 L1 PR 11,
// walkthrough 2026-11-06), reached the voice as underscores. It is "blank",
// a word, so "___x + 1" is "blank x plus 1" (math-speech-3).
const blanksToWords = (text, w) => text.replace(/_{3,}/g, ` ${w.blank} `);

// "!=" typed for ≠, as the bank's set-builder examples write it ("{x|x!=3}"):
// in prose the segmenter split the "!" off, and it was read "x! equals 3".
const typedNotEqual = (text) => text.replace(/(?<=[\p{L}\p{N})\]}])\s*!=\s*/gu, ' ≠ ');

// Set-builder notation in plain braces, {y | y > 3} or {x : x ≠ 2}, is read
// as LaTeX's is: "the set of y such that y is greater than 3". It was "{ y |
// y is greater than 3 }", braces and bar raw (math-speech-2).
const SET_BUILDER = /^\s*([A-Za-z])\s*[|:]\s*(\S[\s\S]*?)\s*$/;
const plainSetsToWords = (text, w) => {
  const rewrite = (plain) => plain.replace(PLAIN_SET, (match, members) => {
    const builder = SET_BUILDER.exec(members);
    if (builder) return ` ${w.setBuilder.of} ${builder[1]} ${w.setBuilder.suchThat} ${builder[2]} `;
    return isSetMembers(members) ? ` ${w.setOpen} ${leadingSignInWords(members, w)} ${w.setClose} ` : match;
  });
  let out = '';
  let from = 0;
  for (const span of text.matchAll(LATEX_SPAN)) {
    out += rewrite(text.slice(from, span.index)) + span[0];
    from = span.index + span[0].length;
  }
  return out + rewrite(text.slice(from));
};

// What a superscript straight after it is a power of, as MathDisplay draws it
// (mathDisplayFormat.js): a letter, a digit, a closing bracket or a bar.
const POWER_BASE = /[\p{L}\p{N})\]}|]/u;
// The end of what a root after it multiplies: 5∛2, and x³√x.
const ROOT_COEFFICIENT = new RegExp(`[A-Za-z0-9)⁾${EXPONENT_CHARACTERS}]$`);
/*
 * `mark`: Read aloud's own pass over a whole text, before it is split. A root
 * is said in words there, and the split took its words for prose: a sign, a
 * bracket or bars around the root were cut off from their mathematics and
 * reached the voice raw ("|√x|" was "| the square root of x |", "(√3 + 1)/2"
 * "( the square root of 3 plus 1 ) /2", math-speech-3). The words are held
 * between two marks the split takes as mathematics (mathSafeText.js
 * SAID_OPEN), and speechTextFor takes the marks out before anything is said.
 */
const unicodeMathToSpokenForm = (raw, w, { mark = false } = {}) => {
  // A blank power, 2^(…), is "2 to the power …", and so is x^?, which kept
  // its caret ("x^3 · x^4 = x^?", lesson re-walk 2026-11-06, Rational
  // Exponents Warm-Up 1).
  const text = String(raw ?? '').replace(/\^\s*\(\s*(…|\.\.\.)\s*\)/g, ` ${w.power} $1`)
    .replace(/\^\s*\?/g, ` ${w.power} …`)
    .replace(SUPERSCRIPT_ORDINAL, (match, digit, suffix) => `${digit}${fromSuperscript(suffix)}`);
  if (!new RegExp(`[√∛∜${SUPERSCRIPTS}]`).test(text)) return text;
  let out = '';
  for (let index = 0; index < text.length;) {
    // A superscript straight after its base is a power, as it is drawn, so
    // x³√x is x³ times √x, never "x times the cube root of x" (lesson re-walk
    // 2026-11-06, Radical Operations CW 4 and its worked solutions). An index
    // stands at the start, or after a space or an operator: ³√x, 2 + ⁴√x.
    const indexRun = POWER_BASE.test(text[index - 1] || '') ? null : /^([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ]+)√/.exec(text.slice(index));
    const symbol = indexRun ? null : { '√': '2', '∛': '3', '∜': '4' }[text[index]];
    if (indexRun || symbol) {
      const order = indexRun ? fromSuperscript(indexRun[1]) : symbol;
      const argument = rootArgument(text, index + (indexRun ? indexRun[0].length : 1));
      if (argument) {
        const words = order === '2' ? w.squareRoot : order === '3' ? w.cubeRoot : w.root(order);
        // A root inside a root (√(∛x)) is read the same way, and a root of
        // one number or letter is one term: "the square root of the cube
        // root of x" needs no "quantity" (math-speech-3).
        const simple = SIMPLE_ARGUMENT.test(argument[0].trim()) || ROOT_OF_SIMPLE.test(argument[0].trim());
        const body = unicodeMathToSpokenForm(argument[0].trim(), w, { mark }).trim();
        // A slash before a root is a fraction bar, "over": "√8/√2" and "3 /
        // √6". The root is words from here on, so the slash was left to the
        // voice as a symbol (platform-polish-3).
        const over = /\/\s*$/.test(out);
        if (over) out = out.replace(/\s*\/\s*$/, ' ');
        // 5∛2 is "5 times the cube root of 2", and x³√x "x cubed times …".
        const coefficient = !over && ROOT_COEFFICIENT.test(out);
        // A root after absolute-value bars multiplies them, "|5b⁷k⁵| ⁴√(k³)",
        // and is written so (×): the bars' end is then said where they close
        // ("… end absolute value times the 4th root of k cubed"). It never was
        // (platform-polish-3). Only after a closing bar: bars are counted.
        const afterBars = !over && /\|\s*$/.test(out) && (out.match(/\|/g) || []).length % 2 === 0;
        const said = `${over ? `${w.over} ` : afterBars ? '× ' : coefficient ? `${w.times} ` : ''}${words}`;
        const argumentSaid = simple ? body : `(${body})`;
        out += mark ? ` ${SAID_OPEN}${said}${SAID_CLOSE}${argumentSaid} ` : ` ${said} ${argumentSaid} `;
        index = argument[1];
        continue;
      }
    }
    out += text[index];
    index += 1;
  }
  // x⁶ is x^(6) and 2ˣ is 2^(x), after a bar too (|z|ⁿ); ⁻¹ stays, for the
  // inverse rules below. A bracketed exponent, x⁽ⁿ⁺¹⁾, is one bracket. The
  // letters of xᵃᵇ are said apart, "a b": "ab" would be read as a word. An
  // exponent that holds a bracket (h⁶⁻⁽⁻²⁾) is said as a power here, since
  // ^(…) is read only without one.
  return out.replace(new RegExp(`([A-Za-z0-9)\\]|])([${SUPERSCRIPTS}]+)`, 'g'), (match, base, run) => {
    if (run === '⁻¹') return match;
    const exponent = fromSuperscript(run).replace(/^\(([^()]*)\)$/, '$1').replace(/([a-z])(?=[a-z])/g, '$1 ');
    return /[()]/.test(exponent) ? `${base} ${w.power} (${exponent}) ` : `${base}^(${exponent})`;
  });
};

/*
 * ARROWS, SAID BY WHAT THEY MEAN WHERE THEY STAND (math-speech-2). → and ←
 * reached the voice as symbols ("x equals 2 → x plus 7 equals 9"), and
 * LaTeX's \to was dropped ("the point x, y the point 3x, 3y"). One arrow means
 * different things, so the words come from what stands on each side:
 *   - a limit, "x → ∞", "as x → −∞, f(x) → 0": "approaches";
 *   - a mapping, "2 → 5", "(x, y) → (3x, 3y)", "S1 → P1", "x → 3x", and a list
 *     of pairs in words ("base → base, result → argument"): "maps to";
 *   - a path of points or names, "A → B → C", and "Row 1 → Row 2": "to";
 *   - a function machine, "5 → g → 1 → f → 5": "goes into", "gives";
 *   - a step of work, "x = 2 → x + 7 = 9", "s = 600 → (600, 0)": "gives";
 *   - steps in words, "eliminate … → solve … → back-substitute": "then";
 *   - a rule in words, "Outside negative → x-axis reflection": "means".
 * ← is "is replaced by" (a row operation, R₂ ← R₂ − 2R₁), ↔ "corresponds to",
 * ⇔ "if and only if" and ⇒ "implies". Translate is unchanged: an arrow in
 * prose stays prose to the segmenter, and the Spanish pack keeps its arrows.
 */
const LATEX_ARROWS = Object.freeze({
  to: '→', rightarrow: '→', longrightarrow: '→', mapsto: '→', longmapsto: '→',
  leftarrow: '←', longleftarrow: '←', gets: '←', leftrightarrow: '↔', longleftrightarrow: '↔',
  Leftrightarrow: '⇔', Longleftrightarrow: '⇔', iff: '⇔', Rightarrow: '⇒', Longrightarrow: '⇒', implies: '⇒',
});
const LATEX_ARROW = new RegExp(`\\\\(${Object.keys(LATEX_ARROWS).join('|')})(?![A-Za-z])`, 'g');
const ARROW = /[→←↔⇔⇒]/;
const arrowsAsCharacters = (text) => text
  .replace(LATEX_ARROW, (match, name) => ` ${LATEX_ARROWS[name]} `)
  .replace(/[⟶↦⟼]/g, '→').replace(/⟵/g, '←').replace(/⟷/g, '↔').replace(/⟺/g, '⇔').replace(/⟹/g, '⇒');

// One side of an arrow: nothing, prose, or mathematics of a kind. A value is
// a number, a point or ordered pair, or one name ("x", "S1", "R_2", "A′").
const ARROW_VALUE = /^(?:[-−+]?\s*\d[\d,]*(?:\.\d+)?|\([^()]*,[^()]*\)|[A-Za-z](?:_\{?[A-Za-z0-9]+\}?|[₀-₉]+|\d+)?['′’]*)$/;
const mathSide = (raw, letters) => {
  const text = String(raw).replace(/(?<!\\)\$\$?|\\[()[\]]|\\(?:left|right)(?![A-Za-z])/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { kind: 'none' };
  const type = /^[-−+]?\s*(?:∞|\\infty)$/.test(text) ? 'infinite'
    : /[=<>≤≥≠]|\\(?:le|ge|ne|lt|gt)(?:q|qslant)?(?![A-Za-z])/.test(text) ? 'relation'
      : new RegExp(`^[${letters}]$`).test(text) ? 'function'
        // f(x), g(t): a function of a variable, which can approach a value.
        : /^[A-Za-z]\s*\(\s*[A-Za-z]\s*\)$/.test(text) ? 'functionValue'
          : ARROW_VALUE.test(text) ? 'value' : 'expression';
  return { kind: 'math', type, text };
};

/**
 * The words for one run of arrows: sides[i] → sides[i + 1] for each arrow.
 * `limit`: the sentence is about a limit ("as x → …", or an arrow to ∞).
 * `pairs`: the sentence lists several arrows, each its own pair. `labels[i]`:
 * the arrow joins two names of the same kind ("Row 1 → Row 2").
 */
const arrowWords = (arrows, sides, w, { limit = false, pairs = false, labels = [] } = {}) => {
  const say = w.arrows;
  const valueLike = (side) => side.kind === 'math' && (side.type === 'value' || side.type === 'function');
  // A function machine: a value, a function's name, a value, … ("5 → g → 1").
  const machine = arrows.length > 1 && sides.length % 2 === 1 && arrows.every((arrow) => arrow === '→')
    && sides.every((side, index) => side.kind === 'math'
      && (index % 2 ? side.type === 'function' : side.type !== 'function' && side.type !== 'relation' && !/^[A-Za-z]/.test(side.text)));
  return arrows.map((arrow, index) => {
    const [left, right] = [sides[index], sides[index + 1]];
    if (arrow === '←') return say.replacedBy;
    if (arrow === '↔') return say.correspondsTo;
    if (arrow === '⇔') return say.iff;
    if (arrow === '⇒') return say.implies;
    // Nothing after it: an arrow drawn as decoration, not said.
    if (right.kind === 'none') return '';
    const toward = right.kind === 'math' && right.type !== 'relation';
    if (right.type === 'infinite' || (left.type === 'functionValue' && toward && right.type !== 'expression')
      || (limit && left.kind === 'math' && ['value', 'function', 'functionValue'].includes(left.type) && toward)) return say.approaches;
    if (machine) return index % 2 ? say.gives : `${index ? ',' : ''} ${say.goesInto}`;
    // "Row 1 → Row 3", and a heading's "Transformations → Absolute Value
    // Functions": from one named thing to the next.
    const named = (side) => side.kind === 'prose' && /^(?:[A-Z][\p{L}'’-]*\s*)+$/u.test(side.text);
    if (labels[index] || (named(left) && named(right))) return say.to;
    // A coordinate rule whose image the segmenter left as prose ("−½·y").
    if (left.kind === 'math' && /,/.test(left.text) && left.type === 'value' && right.kind === 'prose' && right.text.startsWith('(')) return say.mapsTo;
    if (arrows.length > 1) {
      if (sides.every(valueLike)) return say.to;
      return sides.some((side) => side.kind !== 'math') ? say.next : say.gives;
    }
    if (valueLike(left) && toward) return say.mapsTo;
    if (left.kind === 'math') return say.gives;
    return pairs && right.kind === 'prose' ? say.mapsTo : say.means;
  });
};

// An arrow inside one piece of mathematics ("$(x,y)\to(3x,3y)$"): each side
// is read on its own and the arrow's words go between them. Null when there
// is no arrow.
const mathArrowSpeech = (raw, options, w, letters) => {
  if (!ARROW.test(raw)) return null;
  const parts = String(raw).replace(/(?<!\\)\$\$?|\\[()[\]]/g, ' ').split(/([→←↔⇔⇒])/);
  const operands = parts.filter((part, index) => index % 2 === 0);
  const arrows = parts.filter((part, index) => index % 2 === 1);
  const words = arrowWords(arrows, operands.map((part) => mathSide(part, letters)), w);
  return operands.map((part, index) => `${part.trim() ? mathToSpeech(part, options) : ''}${index < arrows.length ? ` ${words[index]} ` : ''}`)
    .join('').replace(/\s+/g, ' ').trim();
};

/*
 * Arrows in prose, between the pieces of a sentence ("x = 2 → x + 7 = 9",
 * "Vertical axis → square x."): each arrow's words, from the piece next to it
 * on each side (the mathematics or the words up to the comma, colon or
 * stop). Arrows with nothing but one side between them are one run, a chain.
 * Returns the segments with every arrow in prose said in words.
 */
const STOP = /^(?:[.;:!?\n]|,)$/;
const SENTENCE_STOP = /^[.;!?\n]$/;
const proseArrowsToWords = (segments, w, letters) => {
  if (!segments.some((segment) => segment.kind !== 'math' && ARROW.test(segment.value))) return segments;
  const pieces = [];
  segments.forEach((segment, at) => {
    if (segment.kind === 'math') { pieces.push({ type: 'math', value: segment.value, at }); return; }
    segment.value.split(/([→←↔⇔⇒]|[.;:!?\n]|,)/).filter(Boolean).forEach((value) => pieces.push({
      type: ARROW.test(value) ? 'arrow' : STOP.test(value) ? 'stop' : 'prose', value, at,
    }));
  });
  const blank = (piece) => piece.type === 'prose' && !piece.value.trim();
  const sideAt = (index, step) => {
    let cursor = index + step;
    while (pieces[cursor] && blank(pieces[cursor])) cursor += step;
    const piece = pieces[cursor];
    if (!piece || piece.type === 'stop' || piece.type === 'arrow') return { side: { kind: 'none' }, cursor };
    // A lone letter beside an arrow is a variable, even where the segmenter
    // kept it as the word "a" ("6x − 2(3x − 2) = a → 4 = a").
    const math = piece.type === 'math' || /^[A-Za-z]$/.test(piece.value.trim());
    return { side: math ? mathSide(piece.value, letters) : { kind: 'prose', text: piece.value.trim() }, cursor };
  };
  const wholeAt = (index, step) => {
    let cursor = index + step;
    const out = [];
    while (pieces[cursor] && pieces[cursor].type !== 'stop' && pieces[cursor].type !== 'arrow') { out.push(pieces[cursor].value); cursor += step; }
    return (step < 0 ? out.reverse() : out).join('').replace(/\s+/g, ' ').trim();
  };
  // Runs of arrows, and the sentences they stand in.
  const runs = [];
  let sentence = 0;
  let linked = false;
  pieces.forEach((piece, index) => {
    if (piece.type === 'stop') { linked = false; if (SENTENCE_STOP.test(piece.value)) sentence += 1; return; }
    if (piece.type !== 'arrow') return;
    const run = linked ? runs[runs.length - 1] : { arrows: [], sentence };
    if (!linked) runs.push(run);
    run.arrows.push(index);
    linked = true;
  });
  const words = new Map();
  for (const run of runs) {
    const lefts = run.arrows.map((index) => sideAt(index, -1));
    const rights = run.arrows.map((index) => sideAt(index, 1));
    // What stands between two arrows of a chain is one side: prose if any of
    // it is ("→ solve the 2×2 system →").
    const sides = [lefts[0].side, ...rights.map((right, position) => {
      const next = lefts[position + 1];
      if (!next || next.cursor === right.cursor) return right.side;
      return right.side.kind === 'math' && next.side.kind === 'math' ? { kind: 'math', type: 'expression', text: '' } : { kind: 'prose', text: '' };
    })];
    const inSentence = runs.filter((other) => other.sentence === run.sentence);
    const limit = inSentence.some((other) => other.arrows.some((index) => {
      const { side: left, cursor } = sideAt(index, -1);
      return sideAt(index, 1).side.type === 'infinite'
        || (left.kind === 'math' && pieces[cursor - 1]?.type === 'prose' && /\b(?:as|when|cuando)\s*$/i.test(pieces[cursor - 1].value));
    }));
    // "Row 1 → Row 2": two names of one kind, each with its number.
    const labels = run.arrows.map((index) => {
      const before = /\b([A-Z][a-z]+) [-−]?\d+\b(?!.*\b[A-Z][a-z]+ \d)/.exec(wholeAt(index, -1));
      return Boolean(before) && new RegExp(`^${before[1]} [-−]?\\d+\\b`).test(wholeAt(index, 1));
    });
    const said = arrowWords(run.arrows.map((index) => pieces[index].value), sides, w, { limit, pairs: inSentence.length > 1, labels });
    run.arrows.forEach((index, position) => words.set(index, said[position]));
  }
  const rebuilt = segments.map((segment) => ({ ...segment, value: segment.kind === 'math' ? segment.value : '' }));
  pieces.forEach((piece, index) => {
    if (piece.type === 'math') return;
    rebuilt[piece.at].value += piece.type === 'arrow' ? ` ${words.get(index)} ` : piece.value;
  });
  return rebuilt;
};

// What is written as text but said in words: an arrow written in LaTeX, a
// logarithm's base and a set in braces, then the powers and roots above. (A
// log with no base is read with the mathematics around it, in mathToSpeech:
// said here, "1/-ln(x)" lost its fraction to the prose.)
const writtenNotationToSpokenForm = (raw, w, { mark = false } = {}) => unicodeMathToSpokenForm(
  plainSetsToWords(logBasesToWords(typedNotEqual(blanksToWords(dollarUnits(markedNames(arrowsAsCharacters(String(raw ?? '').replace(CASES_ENVIRONMENT, (match, body) => casesSpeech(body))), w, mark), w), w)), w), w), w, { mark },
);

/**
 * Speech for one math segment. `intervals`: the sentence says a pair in round
 * brackets is an interval ("increasing on (−2, 2)"), not a point.
 */
/*
 * SINE, COSINE AND TANGENT, BY NAME (platform-polish-3; F-READ-SYMBOLS).
 * "sin(x)" was "sin times the quantity x": the bracket was read as a product,
 * and the voice said the word "sin". They are "sine of x", "cosine of x",
 * "tangent of x", as "log of x" is (plainLogsToWords), LaTeX's \sin too. A
 * power on the name is said with it: sin²(x) is "sine squared of x". A name
 * with no argument is still said by name.
 */
const TRIG_NAME = /(?<![A-Za-z])\\?(sin|cos|tan)(?:\^[({]?\s*(\d+)\s*[)}]?)?(?![A-Za-z_])\s*/g;
// The argument: a bracket, or a number with its letter ("\sin2x" is sin(2x)),
// a letter, or an angle's name (θ; \theta, the one the reader says).
const TRIG_ARGUMENT = new RegExp(`^(?:\\d+(?:\\.\\d+)?[A-Za-z]?|[A-Za-z]|[θϑ]|${UNICODE_GREEK.source}|\\\\(?:var)?theta|${LATEX_GREEK.source.slice(0, -'(?![A-Za-z])'.length)})(?![A-Za-z])`);
const trigArgument = (text, from) => {
  if (text[from] === '(') return plainLogArgument(text, from);
  const run = TRIG_ARGUMENT.exec(text.slice(from));
  return run ? [run[0], from + run[0].length] : null;
};
const trigToWords = (text, w) => {
  let out = '';
  let from = 0;
  for (const match of String(text).matchAll(TRIG_NAME)) {
    if (match.index < from) continue;
    const power = match[2] === '2' ? ` ${w.squared}` : match[2] === '3' ? ` ${w.cubed}` : match[2] ? ` ${w.power} ${match[2]}` : '';
    const argument = trigArgument(text, match.index + match[0].length);
    const body = argument?.[0].trim();
    const simple = SIMPLE_ARGUMENT.test(body ?? '') || TRIG_ARGUMENT.test(body ?? '');
    const of = argument ? ` ${w.of} ${simple ? body : `(${body})`}` : '';
    out += `${text.slice(from, match.index)} ${w.trig[match[1]]}${power}${of} `;
    from = argument ? argument[1] : match.index + match[0].length;
  }
  return out + text.slice(from);
};

/*
 * TWO LETTERS SIDE BY SIDE ARE TWO VARIABLES (platform-polish-3;
 * F-READ-SYMBOLS). "3x + my = 5" was "3x plus my equals 5", "my" said as the
 * word, and "kx + 2y = 7" "kx" as one sound. Two lowercase letters beside an
 * operator are said apart: "m y", "k x"; a word, a unit or a name the reader
 * says is not (mathSafeText.js NOT_TWO_VARIABLES: "≤ or ≥", "ln"), nor a
 * pair with only a sign pressed against a number after it ("de −5").
 */
const TWO_LETTERS = /(?<![A-Za-z\\])([a-z])([a-z])(?![A-Za-z])/g;
const OPERATOR_BEFORE = /[=≠<>≤≥+−\-×·*±÷]$/;
const OPERATOR_AFTER = /^\s*(?:[=≠<>≤≥×·*±÷]|[+\-−](?=\s))/;
const twoLetterProductsApart = (text) => String(text).replace(TWO_LETTERS, (match, first, second, offset, whole) => {
  if (NOT_TWO_VARIABLES.has(match)) return match;
  const beside = OPERATOR_BEFORE.test(whole.slice(0, offset).trimEnd()) || OPERATOR_AFTER.test(whole.slice(offset + match.length));
  return beside ? `${first} ${second}` : match;
});

export const mathToSpeech = (raw, { language = 'en', functionNames = '', intervals = false } = {}) => {
  const w = wordsFor(language);
  // A price is not a LaTeX span: "$4.50" is "4 dollars and 50 cents".
  const price = String(raw).trim().match(/^\$(\d[\d,]*(?:\.\d+)?)$/);
  if (price) return priceSpeech(price[1], w);
  const names = `${functionNames || ''}${definedFunctionNames(raw)}`;
  const arrowed = mathArrowSpeech(arrowsAsCharacters(String(raw)), { language, functionNames: names, intervals }, w, functionLettersFor(names));
  if (arrowed !== null) return w.contract(arrowed);
  const reduced = latexToSpeech(trigToWords(plainLogsToWords(writtenNotationToSpokenForm(twoLetterProductsApart(raw), w), w), w), w);
  // A union's pieces are intervals, (−3, 1) ∪ (2, 5) too; a union of sets is not.
  const union = reduced.includes('∪') && !reduced.includes(w.setOpen);
  return w.contract(plainMathToSpeech(reduced, w, names, { intervals: intervals || union }).replace(/\s+/g, ' ').trim());
};

/**
 * Text a speech engine should say for a prompt (prose untouched, every math
 * segment spoken). Empty for empty input.
 */
/*
 * The named forms of a line, said letter by letter (review of pass 3, R-3):
 * an engine reads "mx" as one sound, "By" as the word "by", and leaves "y₁"
 * to guess. Point-slope form is said in full ("y minus y sub 1 equals m times
 * the quantity x minus x sub 1"); any other subscript digit is "sub N".
 */
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const SUBSCRIPT_LETTERS = { 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ⱼ': 'j', 'ᵣ': 'r', 'ᵤ': 'u', 'ᵥ': 'v' };
const SUBSCRIPT_SPOKEN = {
  ...Object.fromEntries([...SUBSCRIPT_DIGITS].map((digit, value) => [digit, () => String(value)])),
  ...Object.fromEntries(Object.entries(SUBSCRIPT_LETTERS).map(([mark, letter]) => [mark, () => letter])),
  '₊': (w) => w.plus, '₋': (w) => w.minus, '₌': (w) => w.eq, '₍': () => '', '₎': () => '',
};
const SUBSCRIPT_SOURCE = Object.keys(SUBSCRIPT_SPOKEN).join('');
const spokenLineForms = (text, w) => text
  // ŷ, the predicted y (the Data Modeling Lab's residual table and worked
  // solutions), is said "y hat": the engine was handed the bare character, so
  // the table's y and ŷ columns could sound alike (AX10).
  .replace(/ŷ/g, `y ${w.hat}`)
  .replace(/\by\s*[-−]\s*y₁\s*=\s*m\s*\(\s*x\s*[-−]\s*x₁\s*\)/g,
    `y ${w.minus} y ${w.sub} 1 ${w.eq} m ${w.times} ${w.quantity} x ${w.minus} x ${w.sub} 1`)
  .replace(/\by\s*=\s*mx\s*\+\s*b\b/g, 'y = m x + b')
  .replace(/\bAx\s*\+\s*By\s*=\s*C\b/g, 'A x + B y = C')
  .replace(/([A-Za-z])([₀-₉]+)/g, (match, letter, digits) => `${letter} ${w.sub} ${[...digits].map((digit) => SUBSCRIPT_DIGITS.indexOf(digit)).join('')}`)
  // aₙ, aₙ₋₁, a₍₁₂₎: an engine gets the raw character and says nothing or
  // its name (walkthrough 2026-10-22). Letters, signs and brackets too.
  .replace(new RegExp(`([A-Za-z])([${SUBSCRIPT_SOURCE}]+)`, 'g'), (match, letter, marks) => (
    // Digits side by side are one number: a₍₁₂₎ is "a sub 12".
    `${letter} ${w.sub} ${[...marks].map((mark) => SUBSCRIPT_SPOKEN[mark]?.(w) ?? '').join(' ').replace(/(\d) (?=\d)/g, '$1').replace(/\s+/g, ' ').trim()} `
  ));

// Prose that says the pair after it is an interval, in English and Spanish:
// "increasing on (−2, 2)", "negative (−2, 0)" (a worked summary), "the domain
// is (0, 5)", "In interval notation:", "creciente en (−2, 2)". Anything else
// keeps a round pair a point.
const INTERVAL_CUE = /(?:\b(?:increasing|decreasing|positive|negative|constant)(?:\s+on)?|\bintervals?(?:\s+notation)?\s*:?|\b(?:domain|range)(?:\s+is|\s*[:=])?|\b(?:creciente|decreciente)(?:\s+en)?|\b(?:positiva|positivo|negativa|negativo|constante)\s+en|\bintervalos?\s*:?|\b(?:dominio|rango)(?:\s+es|\s*[:=])?)\s*$/i;

/*
 * A LINE BREAK THE AUTHOR WROTE IS A PAUSE (platform-polish-3; F-PROMPT-LINES
 * in the 2026-11-06 Algebra I M3 T2 walkthrough). The task card now draws a
 * prompt's line breaks (components/common/promptLines.js). A voice runs them
 * together: "…6x − 2y = a⏎System B: …" was "…equals a System B…". A line that
 * does not end in a stop gets a full stop, so each listed system or step is
 * heard as its own sentence. Only where another line follows, and never
 * inside display mathematics ($$…$$, \[…\], \(…\)), whose breaks are LaTeX
 * spacing. Text with no line break is returned as it is.
 */
const DISPLAY_MATH = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/g;
const SAID_MARKS = new RegExp(`[${SAID_OPEN}${SAID_CLOSE}]`, 'g');
const ENDS_LINE = /[.;:!?,…][)\]"'”’]*\s*$/u;
// A line that ends inside a $…$ span it opened (a broken one: a span never
// holds a line break) is left as it was. Its LaTeX signs are odd in number
// (a "$" before a digit is a price's).
const opensSpan = (line) => (line.match(/(?<!\\)\$(?!\d)/g) || []).length % 2 === 1;
export const lineBreaksAsPauses = (raw) => {
  const text = String(raw ?? '');
  if (!text.includes('\n')) return text;
  // Display mathematics as one placeholder each, so its own breaks stay.
  const spans = [];
  const masked = text.replace(DISPLAY_MATH, (span) => `\uE010${spans.push(span) - 1}\uE010`);
  const lines = masked.split('\n');
  const last = lines.reduce((found, line, index) => (line.trim() ? index : found), -1);
  return lines
    .map((line, index) => (index < last && line.trim() && !ENDS_LINE.test(line) && !opensSpan(line) ? `${line.trimEnd()}.` : line))
    .join('\n')
    .replace(/\uE010(\d+)\uE010/g, (match, index) => spans[Number(index)]);
};

/*
 * A PRICE IN A RUN OF MATHEMATICS IS MONEY (platform-polish-3; F-READ-PRICES).
 * "After 6 weeks each has 10(6) + 40 = $100", "450 × $5" and "$4 + $6 = $10 a
 * week" were said without "dollars": the reader dropped every "$" as a LaTeX
 * delimiter. In a run the segmenter built from the sentence, one with no $…$
 * span in it (mathSafeText.js `delimited`), a "$" before a number can only be
 * a price's, so it is read as one ("10 times the quantity 6 plus 40 equals 100
 * dollars").
 */
const withPriceSigns = (segment) => (segment.delimited || /^\s*\$\d[\d,]*(?:\.\d+)?\s*$/.test(segment.value)
  ? segment.value
  : segment.value.replace(/(?<!\\)\$(?=\d)/g, '\\$'));

export const speechTextFor = (raw, { language = 'en', functionNames = '' } = {}) => {
  const w = wordsFor(language);
  const text = spokenLineForms(writtenNotationToSpokenForm(lineBreaksAsPauses(raw), w, { mark: true }), w);
  if (!text.trim()) return '';
  // A name the text defines anywhere ("Let c(x) = …") is a function in every
  // later sentence too ("Find c(4).").
  const names = `${functionNames || ''}${definedFunctionNames(text)}`;
  const split = segmentMathText(text, { speech: true }).map((segment) => ({ ...segment, value: segment.value.replace(SAID_MARKS, ' ') }));
  const segments = proseArrowsToWords(split, w, functionLettersFor(names));
  const dimensionsText = /dimension|matri|dimensi/i.test(text);
  return segments
    .map((segment, index) => {
      // "1st": the number is split from its suffix, and "1 st" is read
      // "one street". It stays one word.
      if (segment.kind === 'math' && /^\d+$/.test(segment.value) && /^(?:st|nd|rd|th)\b/.test(segments[index + 1]?.value || '')) return segment.value;
      // "3 × 2" in a sentence about a matrix's dimensions is "3 by 2".
      if (segment.kind === 'math' && dimensionsText && /^\d+\s*[×x]\s*\d+$/.test(segment.value.trim())) {
        return ` ${segment.value.trim().replace(/\s*[×x]\s*/, ` ${w.by} `)} `;
      }
      if (segment.kind === 'math') {
        const intervals = segments[index - 1]?.kind === 'text' && INTERVAL_CUE.test(segments[index - 1].value);
        const spoken = mathToSpeech(withPriceSigns(segment), { language, functionNames: names, intervals });
        // An aside in brackets after a word is said between pauses: "is 153,
        // f of 153 equals 598.75." (relationAsidesAsPauses).
        if (!isWholeAside(segment.value)) return ` ${spoken} `;
        const around = (from, to) => segments.slice(from, to).map((part) => part.value).join('');
        return ` ${PAUSES_BEFORE.test(around(0, index)) ? ',' : ''} ${spoken}${PAUSES_AFTER.test(around(index + 1)) ? ',' : ''} `;
      }
      // "A⁻¹" in prose is "A inverse"; a speech engine cannot say ⁻¹. An
      // escaped price ("\\$4.50" outside a span) loses its backslash.
      const prose = /^\$\d/.test(segments[index + 1]?.value || '') ? segment.value.replace(/\\$/, '') : segment.value;
      // "$x$-terms" is "x terms": the hyphen joins a word to the math.
      const joined = segments[index - 1]?.kind === 'math' ? prose.replace(/^[-‐‑](?=\p{L})/u, ' ') : prose;
      return proseLogNames(joined, segments[index + 1], w).replace(/⁻¹/g, ` ${w.inverse}`);
    })
    .join('')
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/\s+/g, ' ')
    // "name the point (0, 7)" — the prose already said "the point"; so for
    // "the set {1, 2}", "on the interval [0, 5)" and "a union (∪)".
    .replace(/\b(the point|el punto|the set|el conjunto|the interval|el intervalo|union|unión) \1\b/gi, '$1')
    .replace(/[\s\S]*/, w.contract)
    .trim();
};

/**
 * Speak a prompt. Returns false when this browser cannot speak (the caller
 * reports that as unavailable — never as used).
 */
export const speakAloud = (raw, { language = 'en', functionNames = '' } = {}) => {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return false;
  const spoken = speechTextFor(raw, { language, functionNames });
  if (!spoken) return false;
  const utterance = new window.SpeechSynthesisUtterance(spoken);
  if (language && language !== 'en') utterance.lang = language;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
};

export const stopSpeaking = () => {
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
};

export const speechAvailable = () => (
  typeof window !== 'undefined' && Boolean(window.speechSynthesis) && typeof window.SpeechSynthesisUtterance === 'function'
);
