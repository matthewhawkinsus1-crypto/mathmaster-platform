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
 * coordinates, function notation, powers, absolute value and roots — into
 * speech, and leaves prose alone. Math is found by mathSafeText.js, so a word
 * such as "y-intercept" is never read as "y minus intercept".
 *
 * `language` chooses the spoken math words; the browser's voice is chosen by
 * the caller (speakAloud sets the utterance language).
 */
import { segmentMathText } from './mathSafeText.js';

const WORDS = {
  en: {
    over: 'over', cubeRoot: 'the cube root of', squareRoot: 'the square root of', logBase: 'log base', of: 'of',
    inverse: 'inverse', squared: 'squared', cubed: 'cubed', power: 'to the power',
    le: 'is less than or equal to', ge: 'is greater than or equal to', ne: 'is not equal to', lt: 'is less than', gt: 'is greater than',
    eq: 'equals', pm: 'plus or minus', infinity: 'infinity', times: 'times', divided: 'divided by', plus: 'plus', minus: 'minus',
    negative: 'negative', abs: 'the absolute value of', point: 'the point', pi: 'pi', percent: 'percent', dollars: 'dollars',
    quantity: 'the quantity',
    fraction: 'the fraction', endFraction: 'end fraction', endRoot: 'end root', root: (n) => `the ${n}th root of`,
    degrees: 'degrees', repeating: 'repeating', segment: 'segment', ray: 'ray', sub: 'sub', endSub: '',
    approx: 'is approximately equal to', cong: 'is congruent to', sim: 'is similar to', parallel: 'is parallel to',
    perp: 'is perpendicular to', angle: 'angle', triangle: 'triangle', in: 'is in', theta: 'theta',
    setOpen: 'the set', setClose: 'end set', squareRootFn: 'the square root of',
  },
  es: {
    over: 'sobre', cubeRoot: 'la raíz cúbica de', squareRoot: 'la raíz cuadrada de', logBase: 'logaritmo en base', of: 'de',
    inverse: 'inversa', squared: 'al cuadrado', cubed: 'al cubo', power: 'a la potencia',
    le: 'es menor o igual que', ge: 'es mayor o igual que', ne: 'no es igual a', lt: 'es menor que', gt: 'es mayor que',
    eq: 'es igual a', pm: 'más o menos', infinity: 'infinito', times: 'por', divided: 'dividido entre', plus: 'más', minus: 'menos',
    negative: 'negativo', abs: 'el valor absoluto de', point: 'el punto', pi: 'pi', percent: 'por ciento', dollars: 'dólares',
    quantity: 'la cantidad',
    fraction: 'la fracción', endFraction: 'fin de fracción', endRoot: 'fin de raíz', root: (n) => `la raíz ${n} de`,
    degrees: 'grados', repeating: 'periódico', segment: 'segmento', ray: 'rayo', sub: 'sub', endSub: '',
    approx: 'es aproximadamente igual a', cong: 'es congruente con', sim: 'es semejante a', parallel: 'es paralela a',
    perp: 'es perpendicular a', angle: 'ángulo', triangle: 'triángulo', in: 'pertenece a', theta: 'theta',
    setOpen: 'el conjunto', setClose: 'fin de conjunto', squareRootFn: 'la raíz cuadrada de',
  },
};

export const SPEECH_LANGUAGES = Object.freeze(Object.keys(WORDS));

const wordsFor = (language) => WORDS[String(language || 'en').toLowerCase().split('-')[0]] || WORDS.en;

// One-letter names that are functions when followed by "(": f(x), g(2), C(n).
// x, y, a, b, c, n, k, m are left alone so x(x + 1) is still a product.
const FUNCTION_LETTERS = 'fghpqrstuvwCPAVRNTDHGF';

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

const latexToSpeech = (raw, w) => {
  let text = String(raw)
    // An escaped dollar is a price, not a delimiter.
    .replace(/\\\$/g, '\uE002')
    .replace(/\$\$?/g, ' ')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, ' ')
    // Sizing only: \left( is "(".
    .replace(/\\(?:left|right|big|Big|bigg|Bigg)(?![A-Za-z])/g, '')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\\{/g, ` ${w.setOpen} `)
    .replace(/\\\}/g, ` ${w.setClose} `);
  text = rewriteCommand(text, String.raw`\\(?:text|mathrm|textbf|mathbf|operatorname)\s*`, 1, (body) => ` ${body} `);
  // 0.\overline{3}: a repeating decimal; \overline{AB}: segment AB.
  text = rewriteCommand(text, String.raw`(\d\.?\d*)?\\overline\s*`, 1, (body, match) => (
    match[1] ? ` ${match[1]}${body} ${w.repeating} ` : ` ${w.segment} ${body} `
  ));
  text = rewriteCommand(text, String.raw`\\overrightarrow\s*`, 1, (body) => ` ${w.ray} ${body} `);
  for (let pass = 0; pass < 4 && /\\[dt]?frac|\\sqrt/.test(text); pass += 1) {
    text = rewriteCommand(text, String.raw`\\[dt]?frac\s*`, 2, (top, bottom) => (isSimplePart(top) && isSimplePart(bottom)
      ? ` ${top} ${w.over} ${bottom} `
      : ` ${w.fraction} ${top} ${w.over} ${bottom} ${w.endFraction} `));
    text = rewriteCommand(text, String.raw`\\sqrt\s*\[\s*3\s*\]\s*`, 1, (body) => ` ${w.cubeRoot} ${body} `);
    text = rewriteCommand(text, String.raw`\\sqrt\s*\[\s*([^\]]+)\]\s*`, 1, (body, match) => ` ${w.root(match[1])} ${body} `);
    text = rewriteCommand(text, String.raw`\\sqrt\s*`, 1, (body) => (isSimplePart(body)
      ? ` ${w.squareRoot} ${body} `
      : ` ${w.squareRoot} ${body} ${w.endRoot} `));
  }
  return text
    // log base b of (x): the bracket is the argument, not a product.
    .replace(/\\log_\{?(\w+)\}?\s*\(([^()]*)\)/g, ` ${w.logBase} $1 ${w.of} $2 `)
    .replace(/\\log_\{?(\w+)\}?/g, ` ${w.logBase} $1 ${w.of} `)
    .replace(/\\(sin|cos|tan|ln|log)\s*\(([^()]*)\)/g, ' $1 $2 ')
    .replace(/\^\s*\{?\s*\\circ\s*\}?/g, ` ${w.degrees} `)
    .replace(/\\circ\b/g, ` ${w.degrees} `)
    .replace(/°/g, ` ${w.degrees} `)
    .replace(/\\le(q)?\b/g, ' ≤ ')
    .replace(/\\ge(q)?\b/g, ' ≥ ')
    .replace(/\\ne(q)?\b/g, ' ≠ ')
    .replace(/\\approx\b/g, ` ${w.approx} `)
    .replace(/\\cong\b/g, ` ${w.cong} `)
    .replace(/\\sim\b/g, ` ${w.sim} `)
    .replace(/\\parallel\b/g, ` ${w.parallel} `)
    .replace(/\\perp\b/g, ` ${w.perp} `)
    .replace(/\\angle\b/g, ` ${w.angle} `)
    .replace(/\\triangle\b/g, ` ${w.triangle} `)
    .replace(/\\in\b/g, ` ${w.in} `)
    .replace(/\\pm\b/g, ' ± ')
    .replace(/\\infty/g, ' ∞ ')
    .replace(/\\cdot|\\times/g, ' × ')
    .replace(/\\div/g, ' ÷ ')
    .replace(/\\pi\b/g, ' π ')
    .replace(/\\theta\b/g, ` ${w.theta} `)
    .replace(/\\%/g, '%')
    .replace(/\\(sin|cos|tan|ln|log)\b/g, ' $1 ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    // Subscripts: x_1 is "x sub 1", a_{n-1} is "a sub n minus 1".
    .replace(/_\{([^{}]+)\}/g, ` ${w.sub} $1 ${w.endSub} `)
    .replace(/_([A-Za-z0-9])/g, ` ${w.sub} $1 `)
    .replace(/\^\{([^{}]+)\}/g, '^($1)')
    .replace(/[{}]/g, ' ')
    .replace(/\uE002/g, '$');
};

/** Plain-text mathematics (after LaTeX is reduced) to words. */
const plainMathToSpeech = (raw, w) => {
  let text = ` ${raw} `;
  // Coordinates: a bracket group of two or three comma-separated values.
  text = text.replace(/\(\s*([^(),]+?)\s*,\s*([^(),]+?)\s*(?:,\s*([^(),]+?)\s*)?\)/g, (match, a, b, c) => (
    ` ${w.point} ${a}, ${b}${c ? `, ${c}` : ''} `
  ));
  text = text
    .replace(/\|([^|]+)\|/g, ` ${w.abs} $1 `)
    .replace(new RegExp(`(^|[^A-Za-z])([${FUNCTION_LETTERS}])\\(([^()]+)\\)`, 'g'), `$1 $2 ${w.of} $3 `)
    .replace(/(?:√|\bsqrt)\s*\(([^()]+)\)/g, ` ${w.squareRoot} $1 `)
    .replace(/√\s*([A-Za-z0-9.]+)/g, ` ${w.squareRoot} $1 `)
    .replace(/\^\(?-1\)?/g, ` ${w.inverse} `)
    .replace(/\^\(?2\)?(?![0-9])|²/g, ` ${w.squared} `)
    .replace(/\^\(?3\)?(?![0-9])|³/g, ` ${w.cubed} `)
    .replace(/\^\(([^()]+)\)/g, ` ${w.power} $1 `)
    .replace(/\^(-?[A-Za-z0-9.]+)/g, ` ${w.power} $1 `)
    .replace(/<=|≤/g, ` ${w.le} `)
    .replace(/>=|≥/g, ` ${w.ge} `)
    .replace(/!=|≠/g, ` ${w.ne} `)
    .replace(/</g, ` ${w.lt} `)
    .replace(/>/g, ` ${w.gt} `)
    .replace(/±/g, ` ${w.pm} `)
    .replace(/=/g, ` ${w.eq} `)
    .replace(/∞/g, ` ${w.infinity} `)
    .replace(/π/g, ` ${w.pi} `)
    .replace(/[×·*]/g, ` ${w.times} `)
    .replace(/÷/g, ` ${w.divided} `)
    .replace(/(\d)\s*%/g, `$1 ${w.percent}`)
    .replace(/\$(\d[\d,]*(?:\.\d+)?)/g, `$1 ${w.dollars}`)
    // a/b — a fraction, read "a over b". The denominator is one number, one
    // letter or one bracket, so "-2/3x" is "negative 2 over 3 x".
    .replace(/([A-Za-z0-9.)]+)\s*\/\s*(\d+(?:\.\d+)?|[A-Za-z]|\([^()]*\))/g, ` $1 ${w.over} $2 `)
    .replace(/\+/g, ` ${w.plus} `)
    // Products with brackets: 2(x + 1), x(x - 3), (x + 2)(x + 3).
    .replace(/\)\s*\(/g, ')\uE000(')
    .replace(/([A-Za-z0-9])\s*\(/g, '$1\uE000(')
    .replace(/\uE000/g, ` ${w.times} `)
    .replace(/\(/g, ` ${w.quantity} `);
  // A minus sign is "negative" where it starts a quantity (start, after an
  // operator word or an opening bracket) and "minus" between two quantities.
  const operatorWords = [w.eq, w.plus, w.minus, w.times, w.over, w.lt, w.gt, w.le, w.ge, w.ne, w.pm, w.of, w.point, w.divided, w.power]
    .map((word) => word.split(' ').pop());
  text = text.replace(/(\S*)\s*[-−]\s*(?=[A-Za-z0-9.(√])/g, (match, before) => {
    const previous = before.trim();
    const unary = !previous || /[(,[]$/.test(previous) || operatorWords.includes(previous);
    return unary ? `${previous} ${w.negative} ` : `${previous} ${w.minus} `;
  });
  return text.replace(/[()[\]]/g, ' ');
};

/** Speech for one math segment. */
export const mathToSpeech = (raw, { language = 'en' } = {}) => {
  const w = wordsFor(language);
  // A price is not a LaTeX span: "$4.50" is "4.50 dollars".
  const price = String(raw).trim().match(/^\$(\d[\d,]*(?:\.\d+)?)$/);
  if (price) return `${price[1]} ${w.dollars}`;
  return plainMathToSpeech(latexToSpeech(raw, w), w).replace(/\s+/g, ' ').trim();
};

/**
 * Text a speech engine should say for a prompt (prose untouched, every math
 * segment spoken). Empty for empty input.
 */
export const speechTextFor = (raw, { language = 'en' } = {}) => {
  const text = String(raw ?? '');
  if (!text.trim()) return '';
  return segmentMathText(text)
    .map((segment) => (segment.kind === 'math' ? ` ${mathToSpeech(segment.value, { language })} ` : segment.value))
    .join('')
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/\s+/g, ' ')
    // "name the point (0, 7)" — the prose already said "the point".
    .replace(/\b(the point|el punto) \1\b/gi, '$1')
    .trim();
};

/**
 * Speak a prompt. Returns false when this browser cannot speak (the caller
 * reports that as unavailable — never as used).
 */
export const speakAloud = (raw, { language = 'en' } = {}) => {
  if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return false;
  const spoken = speechTextFor(raw, { language });
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
