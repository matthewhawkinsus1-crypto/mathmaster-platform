/*
 * THE CHECKS BEHIND EVERY TEST-PREP WORKED SOLUTION (job O).
 *
 * The Digital SAT, ACT and TSIA2 Path templates are also Live Challenge
 * questions, and a round's solution is shown to the class once the round
 * closes. Their reviews used to be one generic sentence; each is now a worked
 * solution built from the draw's own values. There are hundreds of them, so
 * instead of one hand-written oracle per template (the #469 method for 79
 * templates), every rendered review goes through the same independent checks:
 *
 *   - ARITHMETIC. Every relation the review writes inside $...$ is read back
 *     as mathematics (mathjs, not the generator's evaluator) and must be true:
 *     numeric chains exactly (or within the rounding a "\approx" shows),
 *     symbolic chains as identities at random points, and equations at the
 *     solution the review itself states. A review that writes 3(x+2)=3x+5, or
 *     4x=20 next to x=6, fails.
 *   - THE KEY. The answer summary states the keyed choice's own text (or the
 *     keyed number, which the production grader marks correct), and the last
 *     step or the headline reaches it. Neither the headline nor the summary
 *     states a losing option.
 *   - THE DRAW. The review is fully substituted, mentions a value from its own
 *     prompt, fits the clamps the Path and the Live Challenge projector render
 *     (headline 160, at most 5 steps of 400, error 400, summary 240), and
 *     never reads "1x", "+ 0", "+ -" or "x^1".
 *
 * Exported pieces are used by tests/platform/ccmrSolutionReviews_*.test.mjs.
 */
import * as math from 'mathjs';

export const reviewTexts = (review) => [
  review.headline, ...(review.reasoning || []), review.commonError, review.connection, review.answerSummary,
].filter((entry) => typeof entry === 'string' && entry);

export const mathSpans = (text) => String(text).split('$').filter((part, index) => index % 2 === 1);

// --- display ----------------------------------------------------------------------

// Forms a worked solution must never show. Checked inside math spans and in
// prose (a review may write arithmetic undelimited).
export const DISPLAY_BANS = [
  [/(^|[^\d.\\a-zA-Z_{])1\s*[a-z](?![a-z])/, 'a coefficient of 1 ("1x")'],
  [/(^|[^\d.\\a-zA-Z_{])0\s*[a-z](?![a-z])/, 'a coefficient of 0 ("0x")'],
  // A zero added to a variable term ("3x + 0", "x - 0"); "6 - 0" in a
  // substituted formula is arithmetic, not a display fault.
  [/[a-zA-Z]\s*[+-]\s*0(?![\d.])/, 'a zero term ("+ 0")'],
  [/[+-]\s*[+-]\s*\d/, 'a doubled sign ("+ -3")'],
  [/\^\s*\{?\s*1\s*\}?(?![\d.])/, 'an exponent of 1'],
  [/\{\{|\}\}/, 'an unfilled placeholder'],
  [/NaN|Infinity/, 'a broken value'],
  // "undefined" is a word a slope review needs; inside math it is a bug.
  [/undefined|null/, 'a broken value in math'],
  [/\d\.\d*?(\d)\1{5,}/, 'a floating-point artefact'],
];

export const displayProblems = (review) => {
  const problems = [];
  for (const text of reviewTexts(review)) {
    const prose = text.replace(/\$[^$]*\$/g, ' ');
    for (const [pattern, label] of DISPLAY_BANS) {
      // Prose may say "1 hour" or "+ 0.5 points": only math is held to the
      // coefficient and zero-term rules.
      const targets = /coefficient|zero term|exponent|in math/.test(label) ? mathSpans(text) : [...mathSpans(text), prose];
      for (const target of targets) if (pattern.test(target)) problems.push(`${label}: "${target}" in "${text}"`);
    }
  }
  return problems;
};

export const SHAPE_LIMITS = Object.freeze({ headline: 160, steps: 5, step: 400, commonError: 400, answerSummary: 240 });

export const shapeProblems = (review) => {
  const problems = [];
  if (!review || typeof review !== 'object') return ['no review'];
  if (!review.headline || review.headline.length > SHAPE_LIMITS.headline) problems.push(`headline missing or over ${SHAPE_LIMITS.headline}`);
  if (!Array.isArray(review.reasoning) || review.reasoning.length < 2 || review.reasoning.length > SHAPE_LIMITS.steps) problems.push(`2–${SHAPE_LIMITS.steps} steps`);
  (review.reasoning || []).forEach((step, index) => { if (!step || step.length > SHAPE_LIMITS.step) problems.push(`step ${index + 1} empty or over ${SHAPE_LIMITS.step}`); });
  if (review.commonError && review.commonError.length > SHAPE_LIMITS.commonError) problems.push('commonError too long');
  if (!review.answerSummary || review.answerSummary.length > SHAPE_LIMITS.answerSummary) problems.push(`answerSummary missing or over ${SHAPE_LIMITS.answerSummary}`);
  for (const text of reviewTexts(review)) if ((text.match(/\$/g) || []).length % 2) problems.push(`unbalanced $ in "${text}"`);
  return problems;
};

// --- LaTeX to mathjs ----------------------------------------------------------------

const FUNCTION_NAMES = new Set(['sqrt', 'cbrt', 'nthRoot', 'abs', 'log', 'log10', 'log2', 'exp', 'sin', 'cos', 'tan', 'sind', 'cosd', 'tand', 'asin', 'acos', 'atan', 'pi', 'e', 'i']);

const readGroup = (text, start) => {
  // text[start] === '{' → returns [inner, indexAfter]
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') { depth -= 1; if (depth === 0) return [text.slice(start + 1, index), index + 1]; }
  }
  return null;
};

const readArgument = (text, start) => {
  let index = start;
  while (text[index] === ' ') index += 1;
  if (text[index] === '{') return readGroup(text, index);
  if (index < text.length) return [text[index], index + 1];
  return null;
};

// Replace \cmd{a}{b} forms recursively.
const replaceCommand = (text, command, arity, build) => {
  let out = '';
  let index = 0;
  for (;;) {
    const at = text.indexOf(command, index);
    if (at < 0) { out += text.slice(index); return out; }
    const after = text[at + command.length];
    if (after && /[a-zA-Z]/.test(after)) { out += text.slice(index, at + command.length); index = at + command.length; continue; }
    out += text.slice(index, at);
    let cursor = at + command.length;
    let optional = null;
    if (text[cursor] === '[') {
      const close = text.indexOf(']', cursor);
      optional = text.slice(cursor + 1, close);
      cursor = close + 1;
    }
    const args = [];
    for (let n = 0; n < arity; n += 1) {
      const arg = readArgument(text, cursor);
      if (!arg) return null;
      args.push(arg[0]);
      cursor = arg[1];
    }
    out += build(args.map((arg) => replaceCommand(arg, command, arity, build) ?? arg), optional);
    index = cursor;
  }
};

/**
 * One side of a relation, LaTeX → mathjs source. Returns null when the side is
 * not plain mathematics (words, sets, intervals, ellipses...): such a side is
 * skipped, never guessed.
 */
export const latexToMathjs = (latex) => {
  let text = String(latex);
  // f(3), g(x), C(n): function notation is a name, not a product.
  if (/(^|[^a-zA-Z\\])([fgh]|[A-Z])\s*\(/.test(text)) return null;
  if (/\\(?:dots|ldots|cdots|infty|pm|mp|in|cup|cap|emptyset|varnothing|angle|triangle|overline|overrightarrow|parallel|perp|sim|cong|Rightarrow|to|rightarrow|implies|text\{[^}]*[a-zA-Z]{2}[^}]*\}\s*[a-zA-Z0-9(])|\[|\]|\\\{|\\\}|\\mid|:/.test(text)) return null;
  text = text
    .replace(/\\text\{[^}]*\}/g, ' ')
    .replace(/\\(?:mathrm|textbf|mathbf|operatorname)\{([^}]*)\}/g, '$1')
    .replace(/\{,\}/g, '')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/\\[,;!:]|\\quad|\\qquad|~/g, ' ')
    .replace(/\\left|\\right|\\big|\\Big/g, '')
    .replace(/\\displaystyle/g, '')
    .replace(/\\[dt]frac/g, '\\frac')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\pi/g, ' pi ')
    .replace(/\\%/g, '%')
    .replace(/−/g, '-');
  const degrees = /\^\s*\{?\\circ\}?|°/.test(text);
  text = text.replace(/\^\s*\{?\\circ\}?|°/g, '');
  text = text.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
  if (text.includes('%')) return null;
  text = replaceCommand(text, '\\frac', 2, ([a, b]) => `((${a})/(${b}))`);
  if (text == null) return null;
  text = replaceCommand(text, '\\sqrt', 1, ([a], index) => (index ? `nthRoot(${a}, ${index})` : `sqrt(${a})`));
  if (text == null) return null;
  text = text
    .replace(/\\log_\{?(\w+)\}?\s*\(?/g, (m, base) => `log_${base}(`)
    .replace(/\\ln/g, 'log')
    .replace(/\\log/g, 'log10')
    .replace(/\\(sin|cos|tan)/g, (m, fn) => (degrees ? `${fn}d` : fn));
  // log_b(x) -> log(x, b): only handle the parenthesised form.
  if (/log_\w+\(/.test(text)) {
    text = text.replace(/log_(\w+)\(([^()]*)\)/g, (m, base, arg) => `log(${arg}, ${base})`);
    if (/log_/.test(text)) return null;
  }
  // |x| pairs (non-nested).
  if (text.includes('|')) {
    if ((text.match(/\|/g) || []).length % 2) return null;
    text = text.replace(/\|([^|]*)\|/g, '(abs($1))');
  }
  if (/\\[a-zA-Z]+/.test(text)) return null;
  text = text.replace(/\^\s*\{([^{}]*)\}/g, '^($1)').replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'));
  text = text.replace(/_\(?([a-zA-Z0-9]+)\)?/g, '$1');
  // Multi-letter identifiers that are not functions are products of letters.
  text = text.replace(/[A-Za-z][A-Za-z0-9]*/g, (word) => {
    if (FUNCTION_NAMES.has(word)) return word;
    if (/^[A-Za-z]\d+$/.test(word)) return word; // x1, y2
    return word.split('').join('*');
  });
  // x(B+C) is a product (f, g, h and capitals were refused above as notation).
  text = text.replace(/(?<![A-Za-z])([a-eik-z])\s*\(/g, '$1*(');
  // sind/cosd/tand are degree helpers registered below.
  if (!text.trim()) return null;
  if (/[a-zA-Z]{2,}\s*\*/.test(text) && !/(sqrt|nthRoot|abs|log|log10|exp|sind|cosd|tand|sin|cos|tan)/.test(text)) return null;
  return text;
};

const mathjs = math.create(math.all, { number: 'number' });
mathjs.import({
  sind: (x) => Math.sin((x * Math.PI) / 180),
  cosd: (x) => Math.cos((x * Math.PI) / 180),
  tand: (x) => Math.tan((x * Math.PI) / 180),
}, { override: true });

const compile = (source) => {
  try { return mathjs.parse(source); } catch { return null; }
};

const freeSymbols = (node) => {
  const names = new Set();
  node.traverse((child, path, parent) => {
    if (child.isSymbolNode && !(parent && parent.isFunctionNode && parent.fn === child)) {
      if (!['pi', 'e', 'i', 'sqrt', 'cbrt', 'nthRoot', 'abs', 'log', 'log10', 'exp', 'sin', 'cos', 'tan', 'sind', 'cosd', 'tand'].includes(child.name)) names.add(child.name);
    }
  });
  return [...names];
};

const evaluateNode = (node, scope) => {
  try {
    const value = node.evaluate({ ...scope });
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value && value.isComplex) return value;
    return null;
  } catch { return null; }
};

const RELATION_SPLIT = /(\\approx|\\neq|\\ne|\\leq|\\geq|\\le|\\ge|\\lt|\\gt|=|<|>)/;
const RELATION_NAME = { '\\approx': '≈', '\\neq': '≠', '\\ne': '≠', '\\leq': '<=', '\\geq': '>=', '\\le': '<=', '\\ge': '>=', '\\lt': '<', '\\gt': '>', '=': '=', '<': '<', '>': '>' };

// Split a span into separate statements at top-level commas/semicolons/\quad
// and "and"/"or" words.
const statements = (span) => {
  const parts = [];
  let depth = 0;
  let current = '';
  const source = span.replace(/\\(?:quad|qquad)|\\text\{\s*(?:and|or|so|then|if)\s*\}/g, ';');
  for (const char of source) {
    if ('({['.includes(char)) depth += 1;
    if (')}]'.includes(char)) depth -= 1;
    if (depth === 0 && (char === ';' || char === ',')) { parts.push(current); current = ''; continue; }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
};

// The common error states a wrong move on purpose, so it is never read as a
// claim (nor as the solution the equations are checked at).
const claimTexts = (review) => [review.headline, ...(review.reasoning || []), review.connection, review.answerSummary]
  .filter((entry) => typeof entry === 'string' && entry);

export const relationChains = (review) => {
  const chains = [];
  for (const text of claimTexts(review)) {
    for (const span of mathSpans(text)) {
      for (const statement of statements(span)) {
        const pieces = statement.split(RELATION_SPLIT);
        if (pieces.length < 3) continue;
        const sides = [];
        const relations = [];
        pieces.forEach((piece, index) => {
          if (index % 2 === 0) sides.push(piece.trim());
          else relations.push(RELATION_NAME[piece]);
        });
        chains.push({ text, statement, sides, relations });
      }
    }
  }
  return chains;
};

const decimalsOf = (side) => {
  const match = /^-?\d+(?:\.(\d+))?$/.exec(String(side).replace(/\s+/g, '').replace(/\{,\}/g, ''));
  return match ? (match[1] || '').length : null;
};

const isNumber = (value) => typeof value === 'number';
const closeEnough = (a, b, tolerance) => {
  if (isNumber(a) && isNumber(b)) return Math.abs(a - b) <= tolerance + 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  try { return mathjs.abs(mathjs.subtract(a, b)) <= tolerance + 1e-9; } catch { return false; }
};

const holds = (relation, a, b, tolerance) => {
  if (relation === '=' ) return closeEnough(a, b, tolerance);
  if (relation === '≈') return closeEnough(a, b, tolerance);
  if (!isNumber(a) || !isNumber(b)) return relation === '≠' ? !closeEnough(a, b, 0) : false;
  return ({ '≠': !closeEnough(a, b, 0), '<': a < b, '>': a > b, '<=': a <= b + 1e-9, '>=': a >= b - 1e-9 })[relation];
};

/**
 * The single-variable assignments a review states ("$x=5$", "$k=-3$"), used to
 * check the equations it writes on the way there.
 */
const statedAssignments = (chains) => {
  const values = {};
  for (const { sides, relations } of chains) {
    if (relations.some((relation) => relation !== '=' && relation !== '≈')) continue;
    const head = sides[0].replace(/\s+/g, '');
    if (!/^[a-zA-Z](?:_\{?\w+\}?)?$/.test(head)) continue;
    const name = head.replace(/_\{?(\w+)\}?/, '$1');
    for (const side of sides.slice(1)) {
      const source = latexToMathjs(side);
      const node = source && compile(source);
      if (!node || freeSymbols(node).length) continue;
      const value = evaluateNode(node, {});
      if (isNumber(value)) (values[name] ||= new Set()).add(value);
    }
  }
  return Object.fromEntries(Object.entries(values).map(([name, set]) => [name, [...set]]));
};

const assignmentsFor = (symbols, stated) => {
  if (!symbols.every((name) => stated[name])) return null;
  let combos = [{}];
  for (const name of symbols) {
    combos = combos.flatMap((combo) => stated[name].map((value) => ({ ...combo, [name]: value })));
    if (combos.length > 64) return null;
  }
  return combos;
};

/**
 * Check every relation a rendered review writes. Returns
 *   { checked, problems: [...] }
 * `checked` counts relations actually verified (numeric, identity or at the
 * stated solution); a relation the reader cannot parse is skipped, not passed.
 * `extraKnown` lists relations given in the question itself (the prompt's own
 * equation), which a review may restate.
 */
export const checkRelations = (review, { prompt = '', givenScope = {} } = {}) => {
  const chains = relationChains(review);
  const stated = statedAssignments(chains);
  const promptText = String(prompt).replace(/\s+/g, '');
  let checked = 0;
  const problems = [];
  for (const chain of chains) {
    const nodes = chain.sides.map((side) => {
      const source = latexToMathjs(side);
      const node = source && compile(source);
      return node ? { node, symbols: freeSymbols(node), side } : null;
    });
    // Compose the relations between two parsed sides: "=" chains stay "=",
    // a "\approx" anywhere makes it approximate, one strict or weak
    // inequality among "="s is that inequality; anything else is skipped.
    const compose = (relations) => {
      const kinds = new Set(relations);
      if ([...kinds].every((relation) => relation === '=')) return '=';
      if ([...kinds].every((relation) => relation === '=' || relation === '≈')) return '≈';
      const others = [...kinds].filter((relation) => relation !== '=');
      return others.length === 1 && others[0] !== '≈' ? others[0] : null;
    };
    let tolerance = 0;
    let previousIndex = -1;
    for (let index = 0; index < nodes.length; index += 1) {
      if (index > 0 && chain.relations[index - 1] === '≈') {
        const decimals = decimalsOf(chain.sides[index]) ?? decimalsOf(chain.sides[index - 1]);
        tolerance = Math.max(tolerance, decimals == null ? 0.01 : 0.5 * 10 ** -decimals * 1.0001);
      }
      const current = nodes[index];
      if (!current) continue;
      if (previousIndex >= 0) {
        const previous = nodes[previousIndex];
        const relation = compose(chain.relations.slice(previousIndex, index));
        const symbols = [...new Set([...previous.symbols, ...current.symbols])];
        const left = previous.node;
        const right = current.node;
        if (!relation) { /* mixed directions: not a claim between these two */ }
        else if (!symbols.length) {
          const a = evaluateNode(left, givenScope);
          const b = evaluateNode(right, givenScope);
          if (a != null && b != null) {
            checked += 1;
            if (!holds(relation, a, b, tolerance)) problems.push(`false: ${previous.side} ${relation} ${current.side} (${a} vs ${b}) in "${chain.text}"`);
          }
        } else if (relation === '=' || relation === '≈') {
          // An identity holds at random points; otherwise it is an equation and
          // must hold at the solution the review states.
          const at = (scope) => {
            const a = evaluateNode(left, { ...givenScope, ...scope });
            const b = evaluateNode(right, { ...givenScope, ...scope });
            return a != null && b != null && closeEnough(a, b, tolerance + 1e-7);
          };
          const samples = [0.37, -1.73, 2.41].map((seed) => Object.fromEntries(symbols.map((name, k) => [name, seed + k * 0.917])));
          if (samples.every(at)) checked += 1;
          else {
            const combos = assignmentsFor(symbols, stated);
            const restated = promptText.includes(`${previous.side}=${current.side}`.replace(/\s+/g, ''));
            if (combos && !restated) {
              checked += 1;
              if (!combos.some(at)) problems.push(`equation false at the stated solution ${JSON.stringify(stated)}: ${previous.side} = ${current.side} in "${chain.text}"`);
            }
          }
        }
      }
      previousIndex = index;
    }
  }
  return { checked, problems, stated };
};

// --- the key -----------------------------------------------------------------------

export const normalizeAnswerText = (text) => String(text)
  .replace(/\\left|\\right/g, '')
  .replace(/\\[dt]frac/g, '\\frac')
  .replace(/\{,\}/g, '')
  .replace(/\$/g, '')
  .replace(/\s+/g, '')
  .replace(/\.$/, '')
  .toLowerCase();

// "12" must not match inside "120" or "3.12".
export const containsAnswer = (haystack, needle) => {
  const hay = normalizeAnswerText(haystack);
  const key = normalizeAnswerText(needle);
  if (!key) return false;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(key, from);
    if (at < 0) return false;
    const before = hay[at - 1] || '';
    const after = hay[at + key.length] || '';
    const numericEdge = /[\d.]/;
    const keyStartsNumeric = /^[-\d.]/.test(key);
    const keyEndsNumeric = /[\d.]$/.test(key);
    const badBefore = keyStartsNumeric && (numericEdge.test(before) || (before === '-' && !key.startsWith('-')));
    const badAfter = keyEndsNumeric && (numericEdge.test(after) && !(after === '.' && !/\d/.test(hay[at + key.length + 1] || '')));
    if (!badBefore && !badAfter) return true;
    from = at + 1;
  }
};

/**
 * Whether the review reaches the keyed answer and never states a losing one.
 * `key` is the keyed choice label or the keyed value; `losers` the other
 * choice labels.
 */
export const keyProblems = (review, { key, losers = [] }) => {
  const problems = [];
  const steps = review.reasoning || [];
  if (!containsAnswer(review.answerSummary, key)) problems.push(`answer summary does not state the key "${key}": "${review.answerSummary}"`);
  if (!containsAnswer(steps[steps.length - 1] || '', key) && !containsAnswer(review.headline, key)) problems.push(`neither the last step nor the headline reaches the key "${key}"`);
  // A numeric option is "stated" when it is the value the text ends on (the
  // part after the last "=", "\\approx" or ":"); a summary "f(2)=-39" does not
  // state the option 2, nor does "four 15-minute blocks: 900". A worded option
  // is stated anywhere in the text.
  const finalValue = (text) => String(text).split(/=|\\approx|:/).pop();
  const numeric = (option) => /^-?\d+(?:\.\d+)?$/.test(normalizeAnswerText(option));
  for (const loser of losers) {
    if (!normalizeAnswerText(loser) || containsAnswer(key, loser)) continue;
    for (const [where, text] of [['headline', review.headline], ['answerSummary', review.answerSummary]]) {
      if (containsAnswer(numeric(loser) ? finalValue(text) : text, loser)) problems.push(`${where} states the losing option "${loser}": "${text}"`);
    }
  }
  return problems;
};

/** The numbers a rendered prompt shows, so a review can be held to its draw. */
export const promptNumbers = (text) => (String(text).replace(/\{,\}/g, '').replace(/(\d),(?=\d{3})/g, '$1').match(/\d+(?:\.\d+)?/g) || []);

export const mentionsDraw = (review, prompt) => {
  const numbers = promptNumbers(prompt);
  if (!numbers.length) return true;
  const body = reviewTexts(review).join(' ').replace(/\{,\}/g, '').replace(/(\d),(?=\d{3})/g, '$1');
  return numbers.some((value) => new RegExp(`(^|[^\\d.])${value.replace('.', '\\.')}(?![\\d])`).test(body));
};
