/*
 * HOW A SEQUENCE'S TERMS ARE WRITTEN ON THE SCREEN (TL39, findings E2-9, D-76).
 *
 * Sequence Explorer wrote every term as aₙ, while the Algebra I DOL writes a
 * sequence in function form — f(1) = −7, f(n) = f(n − 1) + 4 — so a student who
 * practised here worked in a different notation from the test they were
 * practising for. DOL #3 Review's question 13 explained the mapping in its
 * prompt ("In the tool, the nth term f(n) is written aₙ") as a stopgap.
 *
 * An authored `notation` on the question picks the words the screen uses:
 *
 *   "a_n"   (the default)  aₙ, a₁, aₙ₋₁ and a6 — as it has always been
 *   "f(n)"                 f(n), f(1), f(n − 1) and f(6)
 *
 * It is a LABEL, and only that: no value, no grader and no accepted answer reads
 * it (the grader reads the sequence, the table, the points and the rules).
 *
 * WHERE A STUDENT TYPES A RULE, THE SCREEN STAYS aₙ. The rule boxes read "aₙ =
 * …" and "Use aₙ₋₁ in your rule", and the grader reads a rule written with aₙ;
 * a screen that said f(n) beside a box that only understood aₙ would grade a
 * correct f(n − 1) + 4 wrong. So a question that has the student write a rule in
 * the tool (the rule-writing mode, or Build the Sequence Model with an explicit
 * or recursive rule to write) draws aₙ whatever was authored, and the authoring
 * check (toolSchemas.js) says so instead of letting the notation be ignored
 * silently. Reading f(n − 1) in a rule is a grader change, left for later.
 *
 * Pure: no React, no DOM.
 */

/** The two notations a question may name. */
export const SEQUENCE_NOTATIONS = Object.freeze(['a_n', 'f(n)']);

const RULE_ACTIONS = Object.freeze(['writeExplicit', 'writeRecursive']);

/** Whether this question has the student type a rule into the tool. */
export const sequenceWritesRules = (question = {}) => {
  const mode = question?.mode || 'analyze';
  if (mode === 'ruleBridge') return true;
  if (mode !== 'fullBridge') return false;
  const actions = Array.isArray(question?.studentActions) ? question.studentActions : [];
  return actions.some((action) => RULE_ACTIONS.includes(action));
};

/** The notation the screen draws: what was authored, and aₙ wherever a rule is typed. */
export const shownSequenceNotation = (question = {}) => (
  question?.notation === 'f(n)' && !sequenceWritesRules(question) ? 'f(n)' : 'a_n'
);

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
const subscriptOf = (n) => String(n).split('').map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit).join('');

const A_N = Object.freeze({
  notation: 'a_n',
  general: 'aₙ',
  first: 'a₁',
  previous: 'aₙ₋₁',
  // "a6": a label for term n (a table's output, a point, a card).
  term: (n) => `a${n}`,
  // "a₍36₎": a term named inside a sentence, where a long subscript needs its brackets.
  inSentence: (n) => `a₍${n}₎`,
  // "a₃₆": a term named in a hint, its number as a subscript.
  subscripted: (n) => `a${subscriptOf(n)}`,
});

const F_N = Object.freeze({
  notation: 'f(n)',
  general: 'f(n)',
  first: 'f(1)',
  previous: 'f(n − 1)',
  term: (n) => `f(${n})`,
  inSentence: (n) => `f(${n})`,
  subscripted: (n) => `f(${n})`,
});

/** The words for one question's terms. */
export const sequenceWords = (question = {}) => (shownSequenceNotation(question) === 'f(n)' ? F_N : A_N);

/** The words of the default notation, for a caller that has no question to ask. */
export const A_N_WORDS = A_N;
