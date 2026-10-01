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
 * to share with anything.
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
