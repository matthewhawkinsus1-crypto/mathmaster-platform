/*
 * ONE LATEX → EXPRESSION BOUNDARY FOR WHAT A STUDENT TYPES.
 *
 * MathLive reports LaTeX; everything that evaluates a student's expression
 * speaks mathjs. This lived in algebraAstEngine.js, and a second, weaker copy
 * in workflow/modelExpression.js read the same fields differently:
 *
 *   - it knew only braced \frac{a}{b}, but MathLive writes ANY single-digit
 *     fraction compactly — \frac23, whether typed or built from the keypad — so
 *     f(x) = −(2/3)x + 4 in a workflow function stage was "not a function";
 *   - it deleted every brace after one pass, so 2^{x+1} became 2^x + 1: the
 *     student's exponential model was evaluated (and graphed, and graded) as a
 *     different function — f(3) = 9 instead of 16;
 *   - \dfrac and fractions inside fractions were unreadable.
 *
 * Both now call this. Pure string rewriting, no mathjs import, so it is cheap
 * to share with anything — including the server, which grades the same text
 * (functions/shared; src/platform/math/latexToExpression.js re-exports it).
 */

const LATEX_TO_EXPRESSION = [
  [/[−–—]/g, '-'],
  [/\\left|\\right/g, ''],
  [/\\dfrac|\\tfrac/g, '\\frac'],
  [/\\cdot|\\times/g, '*'],
  [/\\div/g, '/'],
  // MathLive legitimately emits compact atomic fractions such as \frac12,
  // \frac1{2}, and \frac{1}2. Accept all of them before the ordinary braced
  // form so a student's keypad choice never turns into a parser crash.
  [/\\frac\s*([A-Za-z0-9])\s*\{([^{}]*)\}/g, '(($1)/($2))'],
  [/\\frac\{([^{}]*)\}\s*([A-Za-z0-9])/g, '(($1)/($2))'],
  [/\\frac\s*([A-Za-z0-9])\s*([A-Za-z0-9])/g, '(($1)/($2))'],
  [/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))'],
  // ∛x is nthRoot(x, 3); the index has to be read before the plain root.
  [/\\sqrt\[([^\]{}]*)\]\{([^{}]*)\}/g, 'nthRoot($2, $1)'],
  [/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)'],
  [/\\pi/g, 'pi'],
  [/\\,|\\!|\\;/g, ''],
  // `~` is LaTeX's non-breaking space, and MathJS's own toTex writes every
  // implicit product with one: the operand a student types as 2y comes back
  // from Step Algebra as `2~ y`. To MathJS `~` is bitwise NOT, so left in place
  // it made the isolated expression unparseable (issue #334). A space, not
  // nothing: `x~y` is the product x y, never the single symbol `xy`.
  [/\s*~\s*/g, ' '],
  // MathJS's toTex also writes the BASE of every power in braces — { r}^{2},
  // {2}^{ x}, {\left( x+1\right)}^{2} — a TeX group, which mathjs reads as an
  // object literal, so r² h did not read back (TL32, finding C2-57; it left
  // `{ r}^(2) h`). The group is the whole base: a bare symbol or number needs
  // no bracket, a bracketed one keeps its own, anything longer gets one pair.
  // Only a group that a power follows, and only where nothing makes it an
  // argument: a command's own braces (\mathrm{h}, \frac{a}{b}, \sqrt[3]{x}),
  // a subscript's (x_{12}^{2}) and a set's \{…\} are all left to their rules.
  [/(?<![\\A-Za-z0-9_\]}])\{\s*([A-Za-z0-9.]+)\s*\}(?=\^)/g, '$1'],
  [/(?<![\\A-Za-z0-9_\]}])\{\s*(\([^(){}]*\))\s*\}(?=\^)/g, '$1'],
  [/(?<![\\A-Za-z0-9_\]}])\{\s*([^{}]*[^{}\s])\s*\}(?=\^)/g, '($1)'],
  [/\^\{([^{}]*)\}/g, '^($1)'],
  [/_\{([^{}]*)\}/g, '_$1'],
];

// Every rule removes one level of braces, innermost first, so the text stops
// changing once the deepest structure a student can build has been read. The
// bound only guards against pathological input.
const MAX_PASSES = 8;

export const latexToExpression = (rawValue) => {
  let text = String(rawValue ?? '').trim();
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const before = text;
    LATEX_TO_EXPRESSION.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
    if (text === before) break;
  }
  return text.trim();
};

/*
 * LETTERS TYPED TOGETHER, READ AS THE PRODUCT THEY ARE — WHERE THAT IS SAFE
 * (GR36). mathjs reads `xy` as one name, so a typed 5xy was not 5·x·y: on a
 * board the engine holds as 2·x·y + 3·x·y (drawn 2xy + 3xy), One Simplify
 * refused the student's 5xy and 5yx. A run of letters is read as those
 * letters multiplied only when every letter is a variable the context (the
 * board being simplified) uses on its own, the run itself is not a name the
 * context uses, and it is no function or constant (log, ln, sin, pi, …).
 * Anything else stays exactly as typed: a board that holds `xy` as one name,
 * a formula's multi-letter quantity (Area), a letter the board does not have.
 * Only ever reads a right answer as right; the answer graders already read
 * 5xy as 5·x·y (algebraicForm.mjs) and do not come through here.
 */
const NAMES_NEVER_SPLIT = new Set(['pi', 'sqrt', 'cbrt', 'abs', 'exp', 'log', 'ln', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'mod', 'min', 'max', 'nthRoot', 'nthroot']);
// A run of letters standing alone: never part of a command (\pi), a
// subscripted or digit-carrying name (x_1, x2), or a call (f(x), sqrt(…)).
const LETTER_RUN = /(?<![A-Za-z_\\])[A-Za-z]+(?![A-Za-z0-9_(])/g;

export const letterRunsAsProducts = (expression, context = []) => {
  const singles = new Set();
  const runs = new Set();
  (Array.isArray(context) ? context : [context]).forEach((text) => {
    (String(text ?? '').match(LETTER_RUN) || []).forEach((run) => (run.length === 1 ? singles : runs).add(run));
  });
  return String(expression ?? '').replace(LETTER_RUN, (run) => {
    if (run.length < 2 || NAMES_NEVER_SPLIT.has(run) || runs.has(run)) return run;
    return [...run].every((letter) => singles.has(letter)) ? [...run].join(' ') : run;
  });
};
