// One authored question, many real questions.
//
// THE PROBLEM. The My Math Path bank holds exactly five questions per standard,
// with fixed numbers. A five-question session uses all five. Practise the same
// standard again and a student meets the identical five, so a retention probe
// re-asks something they have memorised and the mastery evidence is worth less
// than the number suggests.
//
// The platform already has a seeded generator, but it lives in the BROWSER
// (src/problemGenerator.js) and the Path's whole security model is that the
// answer never leaves the server. Pointing the Path at it would have the
// browser re-randomise the numbers while the server graded against the stored
// key — every answer wrong, and the same shape of bug as the interval tool's
// start/min and the graph tool's analysisParts/analysisRequests. So generation
// for the Path happens HERE, on the server, at issue time.
//
// THE MODEL IS SUBSTITUTION, not a library of question shapes. Look at what an
// authored item actually is: the number -3 appears in the prompt, in `expected`,
// in four `accepted` spellings, twice in the solution review and once in a hint.
// A generator that builds "a point-slope question" has to know all of those
// places. A generator that draws parameters and substitutes them everywhere
// does not — and it works for every question type, including tool questions,
// because it never has to understand the document it is filling in.
//
//   "generator": {
//     "parameters": { "m": { "type": "int", "min": -6, "max": 6, "exclude": [0, 1] },
//                     "x1": { "type": "int", "min": -5, "max": 5 } },
//     "derived":    { "b": "y1 - m * x1" },
//     "constraints": ["abs(b) <= 20", "m != b"]
//   }
//
// and the document writes {{m}}, {{x1}}, {{b}} wherever those numbers belong.
//
// DETERMINISTIC. The same seed always produces the same question, so a student
// who reloads mid-question gets the question they were looking at rather than a
// new one. The session stores the generated instance anyway; this makes the two
// agree by construction rather than by luck.
//
// NOTHING HERE DECIDES CORRECTNESS. A generated instance goes through exactly
// the same `buildIssuePlan` gate as an authored one, and it is refused on the
// same terms. See `samplePathInstances`: a template is validated by generating
// from it, not by inspecting it, because the thing that reaches a student is an
// instance and never the template.

// --- deterministic randomness --------------------------------------------------
//
// FNV-1a into mulberry32, the same pair the browser generator uses. Seeded, so
// "random" here means "unpredictable to a student, identical on every replay".

const hashString = (value) => {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed) => () => {
  let value = (seed += 0x6d2b79f5);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

export const createSeededRandom = (seedKey) => mulberry32(hashString(seedKey));

// --- a small arithmetic language -----------------------------------------------
//
// Deliberately small, and deliberately not `eval`. Derived values and
// constraints are author-written expressions that run on the server, so the
// grammar is a closed list: numbers, parameter names, + - * / % ^, comparison,
// && ||, and a fixed set of functions. Anything else fails to parse and the
// template is refused rather than guessed at.

const FUNCTIONS = {
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
  sqrt: Math.sqrt,
  pow: (base, exponent) => base ** exponent,
  gcd: (a, b) => {
    let left = Math.abs(Math.round(a));
    let right = Math.abs(Math.round(b));
    while (right) { [left, right] = [right, left % right]; }
    return left;
  },
};

const tokenizeExpression = (text) => {
  const tokens = [];
  const source = String(text ?? '');
  for (let index = 0; index < source.length;) {
    const char = source[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if (/[\d.]/.test(char)) {
      const match = /^\d*\.?\d+/.exec(source.slice(index));
      if (!match) return null;
      tokens.push({ kind: 'number', value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index));
      tokens.push({ kind: 'name', value: match[0] });
      index += match[0].length;
      continue;
    }
    const two = source.slice(index, index + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
      tokens.push({ kind: two });
      index += 2;
      continue;
    }
    if ('+-*/%^(),<>'.includes(char)) {
      tokens.push({ kind: char });
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
};

/**
 * Evaluate one expression against a set of bound names.
 *
 * Returns null when the expression cannot be read or a name is unbound —
 * never a partial answer, because a derived value that silently came out as
 * NaN would be substituted into a question and shown to a student.
 */
export const evaluateExpression = (text, scope = {}) => {
  const tokens = tokenizeExpression(text);
  if (!tokens || !tokens.length) return null;
  let position = 0;
  let failed = false;
  const peek = () => tokens[position] || null;
  const eat = (kind) => { if (peek()?.kind === kind) { position += 1; return true; } return false; };

  let parseOr;

  const parsePrimary = () => {
    const token = peek();
    if (!token) { failed = true; return 0; }
    if (token.kind === 'number') { position += 1; return token.value; }
    if (token.kind === '-') { position += 1; return -parsePrimary(); }
    if (token.kind === '+') { position += 1; return parsePrimary(); }
    if (token.kind === '(') {
      position += 1;
      const inner = parseOr();
      if (!eat(')')) failed = true;
      return inner;
    }
    if (token.kind === 'name') {
      position += 1;
      if (eat('(')) {
        const fn = FUNCTIONS[token.value];
        if (!fn) { failed = true; return 0; }
        const args = [];
        if (peek()?.kind !== ')') {
          do { args.push(parseOr()); } while (eat(','));
        }
        if (!eat(')')) failed = true;
        return fn(...args);
      }
      if (!Object.prototype.hasOwnProperty.call(scope, token.value)) { failed = true; return 0; }
      const bound = Number(scope[token.value]);
      if (!Number.isFinite(bound)) { failed = true; return 0; }
      return bound;
    }
    failed = true;
    return 0;
  };

  // Right-associative, so 2^3^2 is 2^9 as it is on paper.
  const parsePower = () => {
    const base = parsePrimary();
    if (eat('^')) return base ** parsePower();
    return base;
  };

  const parseProduct = () => {
    let left = parsePower();
    for (;;) {
      if (eat('*')) left *= parsePower();
      else if (eat('/')) { const right = parsePower(); if (right === 0) { failed = true; return 0; } left /= right; }
      else if (eat('%')) { const right = parsePower(); if (right === 0) { failed = true; return 0; } left %= right; }
      else return left;
    }
  };

  const parseSum = () => {
    let left = parseProduct();
    for (;;) {
      if (eat('+')) left += parseProduct();
      else if (eat('-')) left -= parseProduct();
      else return left;
    }
  };

  const parseComparison = () => {
    const left = parseSum();
    const token = peek();
    if (!token) return left;
    // A comparison yields 1 or 0 so constraints and arithmetic share one grammar.
    if (eat('<=')) return left <= parseSum() ? 1 : 0;
    if (eat('>=')) return left >= parseSum() ? 1 : 0;
    if (eat('==')) return left === parseSum() ? 1 : 0;
    if (eat('!=')) return left !== parseSum() ? 1 : 0;
    if (eat('<')) return left < parseSum() ? 1 : 0;
    if (eat('>')) return left > parseSum() ? 1 : 0;
    return left;
  };

  const parseAnd = () => {
    let left = parseComparison();
    while (eat('&&')) { const right = parseComparison(); left = (left && right) ? 1 : 0; }
    return left;
  };

  parseOr = () => {
    let left = parseAnd();
    while (eat('||')) { const right = parseAnd(); left = (left || right) ? 1 : 0; }
    return left;
  };

  const result = parseOr();
  // Trailing tokens mean we understood only part of it, which is worse than
  // understanding none of it.
  if (failed || position !== tokens.length || !Number.isFinite(result)) return null;
  return result;
};

// --- drawing the parameters ----------------------------------------------------

const drawParameter = (spec, random) => {
  const type = String(spec?.type || 'int');
  if (type === 'choice') {
    const values = Array.isArray(spec.values) ? spec.values : [];
    if (!values.length) return null;
    return values[Math.floor(random() * values.length)];
  }
  const minimum = Number(spec?.min);
  const maximum = Number(spec?.max);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) return null;
  if (type === 'decimal') {
    const places = Number.isFinite(Number(spec?.places)) ? Number(spec.places) : 2;
    const raw = minimum + random() * (maximum - minimum);
    return Number(raw.toFixed(places));
  }
  const step = Number.isFinite(Number(spec?.step)) && Number(spec.step) > 0 ? Number(spec.step) : 1;
  const steps = Math.floor((maximum - minimum) / step);
  return minimum + step * Math.floor(random() * (steps + 1));
};

const excluded = (spec, value) => Array.isArray(spec?.exclude)
  && spec.exclude.some((entry) => Number(entry) === Number(value));

// --- filling the document ------------------------------------------------------

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|\s*([A-Za-z]+)\s*)?\}\}/g;

/**
 * How a value reads where it is being substituted.
 *
 * `signed` is the one that matters in practice: an author writing
 * "y = {{m}}x {{b|signed}}" gets "y = 3x - 4" rather than "y = 3x + -4".
 */
const applyFilter = (value, filter) => {
  if (!filter) return String(value);
  const numeric = Number(value);
  switch (filter) {
    case 'abs': return String(Number.isFinite(numeric) ? Math.abs(numeric) : value);
    case 'signed': return Number.isFinite(numeric)
      ? `${numeric < 0 ? '-' : '+'} ${Math.abs(numeric)}`
      : String(value);
    case 'sign': return Number.isFinite(numeric) ? (numeric < 0 ? '-' : '+') : String(value);
    // Parenthesise a negative so "3 × {{m|paren}}" reads "3 × (-4)".
    case 'paren': return Number.isFinite(numeric) && numeric < 0 ? `(${numeric})` : String(value);
    default: return String(value);
  }
};

/** Every placeholder name a document mentions, so unbound ones can be reported. */
export const placeholdersUsed = (node, found = new Set()) => {
  if (typeof node === 'string') {
    PLACEHOLDER.lastIndex = 0;
    for (let match = PLACEHOLDER.exec(node); match; match = PLACEHOLDER.exec(node)) found.add(match[1]);
    return found;
  }
  if (Array.isArray(node)) { node.forEach((entry) => placeholdersUsed(entry, found)); return found; }
  if (node && typeof node === 'object') { Object.values(node).forEach((entry) => placeholdersUsed(entry, found)); return found; }
  return found;
};

const substituteString = (text, scope) => {
  PLACEHOLDER.lastIndex = 0;
  // A string that is ONLY a placeholder takes the value's own type, so a
  // numeric field stays a number rather than becoming the string "7".
  const whole = /^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/.exec(text);
  if (whole && Object.prototype.hasOwnProperty.call(scope, whole[1])) return scope[whole[1]];
  return text.replace(PLACEHOLDER, (match, name, filter) => (
    Object.prototype.hasOwnProperty.call(scope, name) ? applyFilter(scope[name], filter) : match
  ));
};

/**
 * COLLAPSE THE SIGNS A SUBSTITUTION JUST CREATED.
 *
 * Vertex form is written `(x-{{h}})`, which is right until `h` draws negative
 * and the student is shown `(x--5)`. Auditing the bank by generating from it
 * found 329 templates that do this — every quadratic vertex family, every
 * slope-from-two-points family, anything that subtracts a signed parameter.
 *
 * It is not a cosmetic problem. No textbook prints `(x--5)`, and a student who
 * reads it as `(x-5)` puts the vertex at +5 instead of -5 and gets the question
 * wrong for a reason that is the platform's fault. It is also in the answer
 * fields, where a key of `--4` would mark a student typing `4` incorrect.
 *
 * Fixing it here rather than in 329 templates is not a shortcut: this is exact
 * sign arithmetic, it is the seam where the problem is created, and it holds
 * for every template authored after today.
 *
 * The trailing DIGIT requirement is what keeps prose safe — an em-dash written
 * as `--` is followed by a space or a letter, never by a numeral.
 */
// A RUN of signs, collapsed by parity rather than by enumerating cases.
//
// Pattern-by-pattern rules handle `a--5` and miss `a---5`; parity handles any
// length, which matters because two adjacent signed substitutions can produce
// three signs in a row. The captured prefix decides what the surviving sign
// attaches to:
//
//   after an OPERAND (`x`, `8`, `)`)   an even run is `+`, an odd run is `-`
//   after an OPERATOR (`=`, `(`, `,`)  an even run is nothing, an odd run is `-`
//
// The trailing DIGIT requirement is what keeps prose safe: an em-dash written
// as `--` is followed by a space or a letter, never by a numeral.
const SIGN_RUN_AFTER_OPERAND = /([0-9A-Za-z)\]}])(\s*)((?:[-+]\s*){2,})(\d)/g;
const SIGN_RUN_AFTER_OPERATOR = /([=(\[,{])(\s*)((?:[-+]\s*){2,})(\d)/g;

const negativeParity = (run) => ((run.match(/-/g) || []).length % 2 === 1);

// A run at the very start of a fragment has no prefix to attach to — an answer
// key stored as `--4` is exactly this case, and would mark a student typing `4`
// incorrect.
const SIGN_RUN_AT_START = /^(\s*)((?:[-+]\s*){2,})(\d)/;

const collapseRuns = (fragment) => fragment
  .replace(SIGN_RUN_AT_START, (match, gap, run, digit) => (
    `${gap}${negativeParity(run) ? '-' : ''}${digit}`
  ))
  .replace(SIGN_RUN_AFTER_OPERAND, (match, prefix, gap, run, digit) => (
    `${prefix}${gap}${negativeParity(run) ? '-' : '+'}${digit}`
  ))
  .replace(SIGN_RUN_AFTER_OPERATOR, (match, prefix, gap, run, digit) => (
    `${prefix}${gap}${negativeParity(run) ? '-' : ''}${digit}`
  ));

// Prose is left alone by construction, not by luck. The rewrite runs inside
// `$...$` spans, and — for fields like an answer key that carry a bare
// expression with no delimiters — only on strings that contain no ordinary
// words. "the value -- and then --3 apples" is prose and stays as written;
// `-5`, `x--5` and `(3--2)/4` are expressions and get fixed.
const looksLikeProse = (text) => /[A-Za-z]{2,}/.test(text.replace(/\\[A-Za-z]+/g, ''));

/**
 * Undelimited arithmetic inside a sentence.
 *
 * A solution review writes "the coefficients add to -8+-6=-14" with no `$`
 * around the sum, so the span pass cannot see it and the prose guard rightly
 * refuses to rewrite the whole sentence. This looks at whitespace-separated
 * TOKENS and rewrites only the ones that are unambiguously expressions.
 *
 * The qualifying test is deliberately strict: the token must contain a digit
 * AND an `=`, a bracket, or an operator that is not merely its leading sign.
 * That admits `y=--1` and `-8+-6=-14`, and excludes a bare `--3` sitting in a
 * sentence, where a double dash is far more likely to be punctuation.
 */
const EXPRESSION_TOKEN = /^[-+()\[\]{}0-9a-zA-Z^./*=,\\]+$/;

const collapseExpressionTokens = (text) => {
  if (!/[-+]\s*[-+]/.test(text)) return text;
  return text.replace(/\S+/g, (token) => {
    if (!/[-+][-+]/.test(token)) return token;
    if (!EXPRESSION_TOKEN.test(token)) return token;
    if (!/\d/.test(token)) return token;
    // An operator or relation beyond the token's own leading sign.
    // A token with no letters at all is a number, never a word. Scanning the
    // whole bank found ZERO authored `--` in any template source — every double
    // sign in a rendered question is created by substitution — so a run glued
    // to a digit is arithmetic. An author writing a real em-dash puts a space
    // after it, which fails the trailing-digit requirement anyway.
    const bare = !/[A-Za-z]/.test(token);
    if (!bare && !/[=()\[\]{}*/^,]/.test(token) && !/[0-9a-zA-Z][-+]/.test(token)) return token;
    // A WORD of three or more letters means prose that happens to lack spaces.
    // Math function and LaTeX command names are stripped first: `sqrt`, `frac`
    // and `log` are mathematics, not sentences.
    const withoutMathNames = token
      .replace(/\\[A-Za-z]+/g, '')
      .replace(/\b(sqrt|frac|cbrt|log|ln|sin|cos|tan|abs|min|max|pi|deg)\b/gi, '');
    if (/[A-Za-z]{3,}/.test(withoutMathNames)) return token;
    return collapseRuns(token);
  });
};

export const collapseSigns = (text) => {
  if (typeof text !== 'string' || !/[-+]\s*[-+]/.test(text)) return text;

  if (text.includes('$')) {
    // Odd indices are the math spans once split on the delimiter. Even indices
    // are prose, but a solution review routinely writes undelimited arithmetic
    // in the middle of a sentence — "the coefficients add to -8+-6=-14" — so
    // those get the token pass rather than being skipped.
    return text
      .split('$')
      .map((part, index) => (index % 2 === 1 ? collapseRuns(part) : collapseExpressionTokens(part)))
      .join('$');
  }
  return looksLikeProse(text) ? collapseExpressionTokens(text) : collapseRuns(text);
};

const substitute = (node, scope) => {
  if (typeof node === 'string') return collapseSigns(substituteString(node, scope));
  if (Array.isArray(node)) return node.map((entry) => substitute(entry, scope));
  if (node && typeof node === 'object') {
    const out = {};
    Object.entries(node).forEach(([key, value]) => { out[key] = substitute(value, scope); });
    return out;
  }
  return node;
};

// Multiple-choice families often keep a stable answer id (for example
// `opt-1`) while the option LABELS are generated from the same parameters as
// the question. That is secure for grading but, if the array order also stays
// fixed, a student can learn that the first button is usually correct. Shuffle
// the rendered options server-side with the same seeded RNG used for the
// question. The order is therefore different across generated instances but
// deterministic for the same question seed, so reloads never move the answer.
const shuffleWithRandom = (values, random) => {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

// --- the generator --------------------------------------------------------------

const hasDirectPathGenerator = (question) => Boolean(
  question?.generator && typeof question.generator === 'object'
  && question.generator.parameters && typeof question.generator.parameters === 'object'
  && Object.keys(question.generator.parameters).length > 0
);

export const hasPathVariants = (question) => (
  Array.isArray(question?.variants)
  && question.variants.some((variant) => variant && typeof variant === 'object')
);

export const hasPathGenerator = (question) => Boolean(
  hasDirectPathGenerator(question)
  || (Array.isArray(question?.variants) && question.variants.some((variant) => hasDirectPathGenerator(variant)))
);

const finitePreference = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const mergedPathVariant = (template, variant) => {
  const { variants: unusedVariants, ...base } = template || {};
  return variant ? { ...base, ...variant } : base;
};

/**
 * Every effective variant row a family can issue.
 *
 * A family with no variants has one row: itself. A family with variants has one
 * row per authored variant; the base document supplies inherited fields exactly
 * the same way generation does.
 */
export const effectivePathVariants = (template) => {
  const variants = Array.isArray(template?.variants)
    ? template.variants.filter((entry) => entry && typeof entry === 'object')
    : [];
  if (!variants.length) {
    return [{
      template: mergedPathVariant(template, null),
      variant: null,
      variantIndex: null,
      dok: finitePreference(template?.dok) ?? 2,
      difficultyBand: finitePreference(template?.difficultyBand) ?? 3,
    }];
  }
  return variants.map((variant, variantIndex) => {
    const effective = mergedPathVariant(template, variant);
    return {
      template: effective,
      variant,
      variantIndex,
      dok: finitePreference(effective?.dok) ?? 2,
      difficultyBand: finitePreference(effective?.difficultyBand) ?? 3,
    };
  });
};

/**
 * Rank a family's effective variants against an adaptive target.
 *
 * Complexity remains the first accessibility axis, mirroring
 * pathQuestionSelection: nearest band first, easier side at an equal distance,
 * then nearest DOK. Exact authored cells therefore always win, while a target
 * above the authored ceiling (for example legacy pass-level Band 5) degrades to
 * the nearest real cell instead of producing an empty session.
 */
export const rankPathVariantsForTarget = (template, {
  preferredDok = null,
  preferredDifficultyBand = null,
} = {}) => {
  const targetDok = finitePreference(preferredDok);
  const targetBand = finitePreference(preferredDifficultyBand);
  return effectivePathVariants(template)
    .map((entry) => {
      const bandDistance = targetBand == null ? 0 : Math.abs(entry.difficultyBand - targetBand);
      const dokDistance = targetDok == null ? 0 : Math.abs(entry.dok - targetDok);
      const easierTie = targetBand == null ? 0 : entry.difficultyBand - targetBand;
      return { ...entry, bandDistance, dokDistance, easierTie };
    })
    .sort((a, b) => (
      a.bandDistance - b.bandDistance
      || a.easierTie - b.easierTie
      || a.dokDistance - b.dokDistance
      || (a.variantIndex ?? -1) - (b.variantIndex ?? -1)
    ));
};

export const bestPathVariantForTarget = (template, options = {}) => (
  rankPathVariantsForTarget(template, options)[0] || {
    template: mergedPathVariant(template, null),
    variant: null,
    variantIndex: null,
    dok: finitePreference(template?.dok) ?? 2,
    difficultyBand: finitePreference(template?.difficultyBand) ?? 3,
    bandDistance: 0,
    dokDistance: 0,
    easierTie: 0,
  }
);

const selectPathVariant = (template, seedKey, options = {}) => {
  const variants = Array.isArray(template?.variants)
    ? template.variants.filter((entry) => entry && typeof entry === 'object')
    : [];
  if (!variants.length) return { template, variantIndex: null };

  const targetDok = finitePreference(options?.preferredDok);
  const targetBand = finitePreference(options?.preferredDifficultyBand);
  const random = createSeededRandom(`${template.id || 'template'}|${seedKey}|variant`);

  // No adaptive target means legacy deterministic-random variant selection.
  if (targetDok == null && targetBand == null) {
    const variantIndex = Math.floor(random() * variants.length);
    return { template: mergedPathVariant(template, variants[variantIndex]), variantIndex };
  }

  const ranked = rankPathVariantsForTarget(template, {
    preferredDok: targetDok,
    preferredDifficultyBand: targetBand,
  });
  const best = ranked[0];
  if (!best) return { template: mergedPathVariant(template, null), variantIndex: null };

  // If more than one variant is equally good, retain seeded variety among only
  // those equally good rows. A reload therefore reproduces the same choice.
  const tied = ranked.filter((entry) => (
    entry.bandDistance === best.bandDistance
    && entry.dokDistance === best.dokDistance
    && entry.easierTie === best.easierTie
  ));
  const selected = tied[Math.floor(random() * tied.length)] || best;
  return { template: selected.template, variantIndex: selected.variantIndex };
};

/**
 * One question from one template, for one seed.
 *
 * Returns `{ question, parameters, reason }`. On failure `question` is null and
 * `reason` says why — a template that cannot satisfy its own constraints is a
 * broken template, and it has to be refused at import rather than at the moment
 * a student asks for a question.
 */
export const generatePathInstance = (template, seedKey, options = {}) => {
  const selected = selectPathVariant(template, seedKey, options);
  const resolvedTemplate = selected.template;
  if (!hasDirectPathGenerator(resolvedTemplate)) {
    return { question: resolvedTemplate, parameters: selected.variantIndex == null ? null : { __variantIndex: selected.variantIndex }, reason: null };
  }

  const generator = resolvedTemplate.generator;
  const random = createSeededRandom(`${resolvedTemplate.id || 'template'}|${seedKey}|v${generator.version || 1}`);
  const parameterNames = Object.keys(generator.parameters);
  const derived = generator.derived && typeof generator.derived === 'object' ? generator.derived : {};
  const constraints = Array.isArray(generator.constraints) ? generator.constraints : [];
  const attempts = Math.min(400, Math.max(1, Number(generator.attempts) || 120));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const scope = {};
    let usable = true;

    for (const name of parameterNames) {
      const spec = generator.parameters[name];
      let value = null;
      // Redraw past excluded values rather than rejecting the whole attempt:
      // excluding 0 from a range should not cost an attempt each time.
      for (let redraw = 0; redraw < 40; redraw += 1) {
        value = drawParameter(spec, random);
        if (value === null) break;
        if (!excluded(spec, value)) break;
        value = null;
      }
      if (value === null) { usable = false; break; }
      scope[name] = value;
    }
    if (!usable) continue;

    for (const [name, expression] of Object.entries(derived)) {
      const value = evaluateExpression(expression, scope);
      if (value === null) { usable = false; break; }
      scope[name] = value;
    }
    if (!usable) continue;

    if (!constraints.every((expression) => evaluateExpression(expression, scope) === 1)) continue;

    const { generator: unused, variants: unusedVariants, ...document } = resolvedTemplate;
    const filled = substitute(document, scope);
    if (Array.isArray(filled.choices) && filled.choices.length > 1) {
      filled.choices = shuffleWithRandom(filled.choices, random);
    }
    // A placeholder nobody bound would reach a student as literal `{{b}}`.
    const unbound = [...placeholdersUsed(filled)];
    if (unbound.length) {
      return { question: null, parameters: scope, reason: `unbound_placeholders:${unbound.join(',')}` };
    }
    return {
      question: filled,
      parameters: selected.variantIndex == null ? scope : { ...scope, __variantIndex: selected.variantIndex },
      reason: null,
    };
  }

  return { question: null, parameters: null, reason: 'constraints_unsatisfiable' };
};

/**
 * N different instances of one template, for the import gate.
 *
 * A template is validated by GENERATING from it, never by inspecting it: the
 * thing that reaches a student is an instance, so the instance is what has to
 * pass `buildIssuePlan`. Distinct seeds, so this also measures whether the
 * template actually varies.
 */
export const samplePathInstances = (template, count = 8) => Array.from({ length: count }, (unused, index) => (
  generatePathInstance(template, `sample-${index}`)
));

/**
 * The same thing, but it does not give up on one unlucky seed.
 *
 * Constraints can be tight enough that a particular draw sequence runs out of
 * attempts while a neighbouring seed succeeds immediately. At import that is
 * worth reporting; at issue time it is not worth stranding a student over, so
 * the seed is nudged a few times before the failure becomes real. Still
 * deterministic: the first seed that works is a function of the input, so a
 * reload returns the same question.
 */
export const generatePathInstanceWithRetries = (template, seedKey, retries = 4, options = {}) => {
  const first = generatePathInstance(template, seedKey, options);
  if (first.question || !hasPathGenerator(template)) return first;
  // An unbound placeholder is a fault in the document and no seed will fix it.
  if (String(first.reason || '').startsWith('unbound_placeholders')) return first;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const next = generatePathInstance(template, `${seedKey}|retry-${attempt}`, options);
    if (next.question) return next;
  }
  return first;
};
