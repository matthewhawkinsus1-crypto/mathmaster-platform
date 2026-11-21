/*
 * AN ENTRY THAT IS NOT GRADED: UNFINISHED, OR TOO LONG (#557, #558; the
 * owner, 2026-11-19).
 *
 * UNFINISHED. A typed answer with a sign or a product sign left dangling
 * (`12 +`, `x=5-`, `4*`, `102\times`, `*38`, `3**x`) is not an answer yet.
 * Every typed-field grader marked it right, because the form comparison
 * dropped an operator that had no operand (answerEquivalence.mjs
 * constantTermsLast, commutedProduct). The decision: on the screen such an
 * entry cannot be submitted, the box says it is not finished and no try is
 * used; on the server it is never marked right, so a tab on an older build
 * earns nothing with one.
 *
 * TOO LONG. The attempt record keeps 240 characters of a typed box
 * (ordinaryResponseGrading.mjs normalizeOrdinaryResponse, attemptPolicy.mjs),
 * so a longer answer was graded whole on the screen and cut on the server:
 * one answer, two verdicts. The decision: a longer answer is refused on the
 * screen with a message that says so, and the server's comparison refuses it
 * at once instead of reading it.
 *
 * WHY 240, AND WHY A LENGTH IS ENOUGH HERE. 240 is the record's own number, so
 * the screen, the comparison and the record agree on what an answer is. The
 * longest answer any bank keys, in the math editor's own spelling, is
 * 165 characters (tests/platform/typedEntryGuard.test.mjs measures the banks). The
 * typed-field comparison (answerEquivalence.mjs, answerUtils.mjs,
 * ordinaryResponseGrading.mjs) reads text with its own parsers: it never asks
 * mathjs to simplify, whose rule matcher is what makes 48 like terms cost
 * 40 s in Step Algebra (docs/handoffs/NOVEMBER_BUILD_2026-11.md section 6, "A
 * long side"). Inside 240 characters its slowest input costs milliseconds;
 * the same test holds both the import boundary and the time.
 *
 * WHAT COUNTS AS DANGLING. Read on the text as typed or as the math editor
 * writes it, between the places an expression can end: the ends of the entry,
 * a relation, a comma or semicolon, the words "or" and "and", and either
 * side of a bracket.
 *
 *   a + or −   with nothing after it before such an end: `12 +`, `x=5-`,
 *              `(x+2+)(x+3)`. A sign that opens a term is not one (`-5`,
 *              `+3`, `3*-x`), nor a sign written as a power or a subscript
 *              (`2^+`, `x\to 0^{-}`, `a_{+}`), a charge (`Ca^{2+}`), or the
 *              side of a one-sided limit (`x→0+`, `f(2+)`).
 *   a product  with no factor before it (`*38`, `x=*5`, `2x+*1`) or none
 *   sign       after it (`4*`, `1\cdot`, `3**x`).
 *
 * Nothing else is called unfinished here. `12/`, `2^`, `(x` and `x=` were
 * never marked right, and are still graded as what they are. An entry that is
 * only signs (`-`, `+`) is left alone too: there is nothing it is the
 * unfinished form of.
 *
 * Pure, and imports nothing: it is in every student's first load.
 */

/** What the attempt record keeps of one typed box, and what a comparison reads. */
export const MAX_TYPED_ANSWER_LENGTH = 240;

/*
 * What a typed box keeps on its way to a grader: one character past the
 * limit. Cut to the limit itself, an over-long entry arrived looking like an
 * answer of exactly 240 characters, and the comparison could not refuse it:
 * `5`, 239 spaces and `+2` was wrong on the screen and right on the server.
 * One more character is enough for isOverLongAnswer to see it. The attempt
 * record still keeps 240 (attemptPolicy.mjs).
 */
export const TYPED_ANSWER_WIRE_LENGTH = MAX_TYPED_ANSWER_LENGTH + 1;

/** Longer than a typed answer may be. Counted as the record counts: every character sent. */
export const isOverLongAnswer = (value) => (typeof value === 'string' || typeof value === 'number')
  && String(value).length > MAX_TYPED_ANSWER_LENGTH;

const EDITOR_BOOKKEEPING = /\\(?:left|right|displaystyle|dfrac(?=\{)|tfrac(?=\{))(?![A-Za-z])|\\placeholder(?:\[[^\]]*\])?\{[^{}]*\}|\\[,;:! ]|\\(?:quad|qquad)(?![A-Za-z])/g;
const PRODUCT_SIGNS = /\\(?:cdot|times)(?![A-Za-z])|[×·⋅∙]/g;
const MINUS_SIGNS = /[−–—]/g;
// `!=` is a relation; a `!` alone is a factorial, part of its operand (`3!*2`).
const RELATIONS = /\\(?:leq?|geq?|neq?|lt|gt|approx)(?![A-Za-z])|!=|[<>=≤≥≠≈]/g;
const ARROWS = /\\(?:to|rightarrow|longrightarrow)(?![A-Za-z])|→|->/g;
const CONNECTIVES = /\\(?:text|mathrm|operatorname)\{\s*(?:or|and)\s*\}|\\(?:lor|land|vee|wedge)(?![A-Za-z])|[∨∧]|(?<![A-Za-z])(?:or|and)(?![A-Za-z])/gi;

/*
 * The entry as a run of marks: `+` and `-`, `*`, `;` where an expression can
 * end, `(` and `)` for any bracket, and `a` for anything else that is there.
 * An absolute-value bar is read as something there: it cannot be told open
 * from close, and `5*|x|*y^2` is a finished product.
 */
const marksOf = (value) => String(value ?? '')
  .replace(EDITOR_BOOKKEEPING, '')
  .replace(PRODUCT_SIGNS, '*')
  .replace(MINUS_SIGNS, '-')
  // A one-sided limit written without a caret: `x→0+`, `\\lim_{x\\to 0+}`,
  // and the value there, `f(2+)`. The sign is part of the number.
  .replace(ARROWS, '→')
  .replace(/→\s*(-?\d+(?:\.\d+)?)\s*[+-](?=\s*(?:$|[)\]},;]))/g, '→$1')
  .replace(/([A-Za-z])\(\s*(-?\d+(?:\.\d+)?)\s*[+-]\s*\)/g, '$1($2)')
  // Where an expression can end. Before the power rule below, which asks
  // what follows the sign: `x^+ or x^-`, `\\mathbb{R}^+\\text{ or }(0,\\infty)`.
  .replace(/;/g, ',')
  .replace(CONNECTIVES, ';')
  .replace(RELATIONS, ';')
  .replace(/,/g, ';')
  // A sign written as a power or a subscript is a mark of its own, not an
  // operator: `2^+`, `x^{-}`, `a_{+}`, and a charge, `Ca^{2+}`, `SO_4^{2-}`.
  .replace(/([\^_])\{\s*\d*\s*[+-]\s*\}/g, '$1{a}')
  .replace(/([\^_])\s*[+-](?!\s*[0-9A-Za-z.\\({π∞])/g, '$1a')
  .replace(/\s+/g, '')
  .replace(/[[{]/g, '(')
  .replace(/[\]}]/g, ')')
  .replace(/[^+\-*;()]/g, 'a')
  .replace(/a+/g, 'a');

/**
 * Does the entry leave a sign or a product sign dangling? (See the header for
 * exactly what that is.) False for a blank entry and for one that is only
 * signs.
 */
export const hasDanglingOperator = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const marks = marksOf(value);
  if (!marks.includes('a')) return false;
  // A sign, then the end of what it could belong to.
  if (/[+-](?:$|[;)])/.test(marks)) return true;
  // A product sign with no factor before it, or none after it.
  return /(?:^|[;(+\-*])\*/.test(marks) || /\*(?:$|[;)*])/.test(marks);
};

/** Is what makes it unfinished a product sign written twice (`3**x`, `x**2`)? */
const hasDoubledProductSign = (value) => /\*\*/.test(marksOf(value));

export const TYPED_ENTRY_PROBLEMS = Object.freeze({ TOO_LONG: 'tooLong', UNFINISHED: 'unfinished' });

/** Why a typed entry is not graded: 'tooLong', 'unfinished', or null. */
export const typedEntryProblem = (value) => {
  if (isOverLongAnswer(value)) return TYPED_ENTRY_PROBLEMS.TOO_LONG;
  if (hasDanglingOperator(value)) return TYPED_ENTRY_PROBLEMS.UNFINISHED;
  return null;
};

/*
 * What the box says. Fixed sentences: nothing of the key is in them, and each
 * says what to do next. The surface adds what the refusal cost (nothing).
 */
export const TYPED_ENTRY_MESSAGES = Object.freeze({
  [TYPED_ENTRY_PROBLEMS.TOO_LONG]: `This answer is longer than the ${MAX_TYPED_ANSWER_LENGTH} characters an answer box can keep. Shorten it, then submit it.`,
  [TYPED_ENTRY_PROBLEMS.UNFINISHED]: 'This answer is not finished: a +, − or × has nothing after it, or a × has nothing before it. Finish it or remove the sign.',
  // `x**2`: nothing is missing after the sign, so the sentence above would mislead.
  doubledProductSign: 'This answer is not finished: a × is written twice in a row. Remove one of them (for a power, use ^).',
});

/**
 * What a box says about its own entry, or '' when it may be submitted.
 *
 *   words  the box takes words ("increasing", "A+"): only its length is read.
 *   keys   the box's own keys, where the screen holds them: an unfinished
 *          entry is let through when a key is itself written that way, as the
 *          server does (refusesTypedEntry).
 *   tries  false where the surface counts none (a secure test).
 */
export const typedEntryNotice = (value, { words = false, keys = [], tries = true } = {}) => {
  const problem = typedEntryProblem(value);
  if (!problem) return '';
  if (problem === TYPED_ENTRY_PROBLEMS.UNFINISHED && (words || (Array.isArray(keys) ? keys : [keys]).some((key) => hasDanglingOperator(key)))) return '';
  const sentence = problem === TYPED_ENTRY_PROBLEMS.UNFINISHED && hasDoubledProductSign(value) ? TYPED_ENTRY_MESSAGES.doubledProductSign : TYPED_ENTRY_MESSAGES[problem];
  return `${sentence}${tries ? ' It is not submitted, and no try is used.' : ''}`;
};

/**
 * Is this entry refused whatever the key is? An entry over the limit always.
 * An unfinished one unless the key itself is written that way (an authored
 * `+` or `2^+` is the author's to key): then the comparison below decides.
 */
export const refusesTypedEntry = (value, keys = []) => {
  if (isOverLongAnswer(value)) return true;
  if (!hasDanglingOperator(value)) return false;
  return !(Array.isArray(keys) ? keys : [keys]).some((key) => hasDanglingOperator(key));
};
