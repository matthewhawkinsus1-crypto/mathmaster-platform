/*
 * HOW A STUDENT TYPES A SECURE FIELD ITEM'S ANSWER.
 *
 * A secure Test or practice exam collected every typed answer in a plain text
 * box, so a student who writes three quarters on My Math Path in the
 * platform's math editor met a bare `3/4` on the test. The editor is a
 * RESPONSE capability (functions/shared/questionRuntimePolicy.mjs,
 * `mathEntry`): no mode switches it off, so the secure item should have it too.
 *
 * But the editor changes WHAT IS SUBMITTED, from the characters a student
 * typed to MathLive's LaTeX, and on a secure item nobody sees a verdict until
 * the results are released. A correct answer the server grader cannot read
 * would be marked wrong in silence. So each input profile gets the editor
 * only where the real server field grader (functions/lib/secureItems.js
 * gradeItem → mathPath.gradeResponse) is shown to accept what the editor
 * produces — tests/platform/secureMathAnswerRoundTrip.test.mjs feeds it the
 * strings tests/browser/secureAccessParity.mjs captured from the real editor,
 * on a phone entered only through the keypad a phone student actually has.
 *
 *   number, set, interval, orderedPair, inequality
 *       the math editor. Fractions, negatives, decimals, set braces, ∅, ∞ and
 *       ∪, a pair's coordinates, ≤ ≥ and a compound "and"/"or", π, roots, %
 *       and $ in the editor's LaTeX all grade as the typed text does (student
 *       pass 3, H-13: Push P taught the grader \land, \lor, \pi, \sqrt, \% and
 *       \$; a stacked fraction around π or a root is read since H-13 too).
 *
 *   expression, equation
 *       PLAIN TEXT, deliberately, for a reason the grader still has
 *       (SECURE_TEXT_PROFILE_REASONS; the round-trip test pins each one, so
 *       when the server learns to read the editor's form it fails and says to
 *       move that profile over).
 *
 *   text, and anything unrecognised
 *       plain text — words are the answer, or the field did not say.
 *
 * THE KEYPAD SAYS NOTHING ABOUT THE ANSWER. Outside a test, MathInput puts the
 * symbols a field names in a row captioned "Needed for this answer" — on a
 * test that caption would tell a student the answer has a π in it, or is a
 * fraction. So a secure field hands MathInput no such symbols: what it needs
 * goes into the keypad itself (`keys`), uncaptioned, and every key a profile
 * adds is the same on every item of that profile. The one item-specific set
 * is an inequality's letters, which come from what the student is reading —
 * the PROMPT and the field's own label — beside x and y on every inequality
 * (inequalityLetters), never from the key.
 *
 * Nothing here decides correctness or rewrites an answer. It picks a keyboard.
 */
import { normalizeInteractionInputProfile, toolProfileForInputProfile } from '../interaction/interactionContract.js';
import { requiredAnswerToolForSymbol } from '../interaction/answerEntryTools.js';
import { isMathSegment, splitMathSegments } from '../../components/common/mathSegments.js';

export const SECURE_ANSWER_EDITORS = Object.freeze({
  MATH: 'math',
  TEXT: 'text',
});

/** Profiles whose math-editor output the server field grader accepts. */
export const SECURE_MATH_EDITOR_PROFILES = Object.freeze(['number', 'set', 'interval', 'orderedPair', 'inequality']);

/** Profiles kept on typed text, with the reason the round-trip test pins. */
export const SECURE_TEXT_PROFILE_REASONS = Object.freeze({
  expression: 'the grader does not read the editor\'s division binding the way it reads typed text (\\frac{2A}{h}-b_2 vs 2A/h-b_2)',
  equation: 'the grader keeps the backslash of a named function the editor writes (\\log_2\\left(32\\right)=5 vs log_2(32)=5)',
});

/*
 * The symbols a field's public metadata may name, each spelled once (`pi`,
 * `\pi` and π are one key). The keypad gets π and √ when a field names them;
 * % and $ need no key: the grader reads a bare number for a key of 25% or $25,
 * and the number hint says to leave them out (a typed % or $ is read too).
 */
const SYMBOL_ALIASES = Object.freeze({
  'π': 'π', pi: 'π', '\\pi': 'π',
  '√': '√', sqrt: '√', '\\sqrt': '√', 'ⁿ√': 'ⁿ√',
  '%': '%', '\\%': '%', percent: '%',
  '$': '$', '\\$': '$', dollar: '$',
});
const FORMAT_WORD_SYMBOLS = Object.freeze({
  pi: 'π', radical: '√', radicals: '√', sqrt: '√', root: '√', roots: '√',
  percent: '%', percentage: '%', currency: '$', money: '$', dollar: '$', dollars: '$',
});
const KEYLESS_SYMBOLS = new Set(['%', '$']);
// Whole words of a format name ("exact-pi", "exactPi", "simplest radical"),
// so "orderedPair" or "piecewise" never match.
const formatWords = (format) => clean(format).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);

/*
 * Keys a profile adds on a secure item, identical on every item of it.
 *
 *   number       √ and π: a number answer can be 2√3 or 3π/4, and a key on
 *                one number box but not the next would say which answers
 *                have one (decided in the H-13 review; the owner can reverse).
 *   orderedPair  √ and π, which the pair keypad lacks and a coordinate can
 *                hold; the text box this replaces took `sqrt(3)` too.
 *   inequality   a fraction, |x|, a power, √ and π, and "and" / "or" for a
 *                compound inequality — a phone's keypad had no way to write
 *                any of them. The words are \operatorname{and} and
 *                \operatorname{or}: math atoms drawn as words, so the caret
 *                stays in math (a \text{} key left it typing text), and the
 *                grader reads them as it reads typed and / or.
 */
export const SECURE_AND = '\\operatorname{and}';
export const SECURE_OR = '\\operatorname{or}';

/*
 * MathLive turns a typed "and" or "or" into ∧ or ∨, which a student who typed
 * the word may not recognise as theirs. A secure field writes the word, as
 * its keys do.
 */
export const SECURE_INLINE_SHORTCUTS = Object.freeze({ and: SECURE_AND, or: SECURE_OR });

const tool = (label, command, ariaLabel) => Object.freeze({ label, command, ariaLabel });
const ROOT_KEY = tool('√', '\\sqrt{#0}', 'Insert square root');
const PI_KEY = tool('π', '\\pi', 'Insert pi');
export const SECURE_PROFILE_KEYS = Object.freeze({
  number: Object.freeze([ROOT_KEY, PI_KEY]),
  orderedPair: Object.freeze([ROOT_KEY, PI_KEY]),
  inequality: Object.freeze([
    tool('a⁄b', '\\frac{#0}{#?}', 'Insert stacked fraction'),
    tool('|x|', '\\left|#0\\right|', 'Insert absolute value'),
    tool('xⁿ', '#@^{#?}', 'Insert exponent'),
    ROOT_KEY,
    PI_KEY,
    tool('and', SECURE_AND, 'Insert and'),
    tool('or', SECURE_OR, 'Insert or'),
  ]),
});

/*
 * THE LETTERS AN INEQUALITY'S PROMPT USES. Every inequality key has a
 * variable, and a phone's math field opens no letter keyboard, so the keypad
 * gets the single letters written in the prompt's mathematics — the spans
 * MathText draws as mathematics (splitMathSegments, so a price such as
 * "$5 and $12" is prose): the ones the student is reading. Never the key's (which never reaches the browser).
 * A prompt that names none gets x. At most four.
 */
const MAX_PROMPT_VARIABLES = 4;
const lettersInMath = (text = '') => {
  const letters = [];
  const math = splitMathSegments(String(text ?? '')).filter(isMathSegment);
  for (const segment of math) {
    const body = segment
      .replace(/\\(?:text|mathrm|operatorname|textbf|mbox)\s*\{[^{}]*\}/g, ' ')
      .replace(/\\[A-Za-z]+/g, ' ');
    // A run of letters is a word or a product; only a letter standing alone,
    // or in a product of single letters (2xy), is a variable.
    for (const run of body.match(/[A-Za-z]+/g) || []) {
      if (run.length > 3) continue;
      for (const letter of run) if (!letters.includes(letter)) letters.push(letter);
    }
  }
  return letters;
};
export const variablesInPrompt = (prompt = '') => {
  const letters = lettersInMath(prompt);
  return (letters.length ? letters : ['x']).slice(0, MAX_PROMPT_VARIABLES);
};

/*
 * THE LETTERS AN INEQUALITY'S KEYPAD OFFERS (TS04). The prompt's letters
 * (above) left some keys untypeable on a phone. A sweep of every family the
 * secure runtime can issue (12 draws each) found 16 inequality fields whose
 * key's letter had no key: 13 in y — a range written in y beside f(x), or a
 * boundary line shown only in a table or a graph — and 3 whose letter the
 * item names only in words ("Reasonable domain of h", "Range of C",
 * "Physical restriction on v"). So the keypad also offers:
 *
 *   x and y, on every inequality: the same two keys on every item say nothing
 *   about any one answer;
 *   the single letters the field's own label names, in words or in
 *   mathematics: the legend the student reads above the box. In words, a
 *   letter standing alone, but not "a", "A" or "I", which are words.
 *
 * Still never the key's letters.
 */
export const EVERY_INEQUALITY_LETTER = Object.freeze(['x', 'y']);
const NOT_LETTER_WORDS = new Set(['a', 'A', 'I']);
const lettersInWords = (text = '') => {
  const words = splitMathSegments(String(text ?? '')).filter((segment) => !isMathSegment(segment)).join(' ');
  return [...words.matchAll(/(?<![A-Za-z0-9'’-])[A-Za-z](?![A-Za-z0-9'’])/g)]
    .map(([letter]) => letter)
    .filter((letter) => !NOT_LETTER_WORDS.has(letter));
};
export const inequalityLetters = ({ prompt = '', label = '' } = {}) => [...new Set([
  ...lettersInMath(prompt).slice(0, MAX_PROMPT_VARIABLES),
  ...lettersInMath(label),
  ...lettersInWords(label),
  ...EVERY_INEQUALITY_LETTER,
])];

const variableKey = (letter) => tool(letter, letter, `Insert ${/[A-Z]/.test(letter) ? 'capital ' : ''}${letter}`);

/*
 * A SHORT LINE UNDER THE BOX ABOUT HOW TO TYPE, NEVER WHAT TO TYPE.
 *
 * No example numbers: an example that happened to equal an item's answer would
 * read as a hint on a test. The server's own `responseHint` (public, authored
 * with the item, presentation only) wins when the field has one.
 */
export const SECURE_ENTRY_HINTS = Object.freeze({
  number: 'Type only the number. Make a fraction with / or the a/b key. Leave out commas, units, % and $.',
  set: 'Write your answer as a set, with the numbers separated by commas.',
  interval: 'Write your answer in interval notation.',
  orderedPair: 'Write your answer as an ordered pair: (x, y). Make a fraction with / or the a/b key.',
  inequality: 'Write your answer as an inequality. Use the ≤ and ≥ keys, or type <= and >=.',
  expression: 'Use ^ for a power, / for a fraction and parentheses to group.',
  equation: 'Write a full equation. Use ^ for a power, / for a fraction and parentheses to group.',
});

/*
 * A MIXED NUMBER DEPENDS ON THE EXAM (TS04). Every grader reads 3½ as 7/2
 * (GR13) and the editor builds 3½ from a typed "3 1/2" (GR33), so a teacher's
 * course Test — and its Corrections, which name no exam — no longer tells the
 * student to avoid one. Every practice exam keeps the line: it is the real
 * rule on the Digital SAT, which takes no mixed number. The grader is the same
 * on both; only the words differ. Neither line is read by Read aloud or
 * Translate (a secure item's supports read the prompt only), so neither has a
 * Spanish entry.
 */
export const SECURE_PRACTICE_EXAM_HINTS = Object.freeze({
  number: 'Type only the number. Make a fraction with / or the a/b key, and write a mixed number as a fraction or a decimal. Leave out commas, units, % and $.',
});

const clean = (value) => String(value ?? '').trim();

/** A practice exam (Digital SAT, ACT, TSIA2, ASVAB), not a teacher's course Test. */
export const isPracticeExam = (examType) => Boolean(clean(examType)) && clean(examType) !== 'courseTest';
const entryHintFor = (profile, examType) => (
  (isPracticeExam(examType) && SECURE_PRACTICE_EXAM_HINTS[profile]) || SECURE_ENTRY_HINTS[profile] || ''
);
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const requiredSymbolsOf = (field) => (Array.isArray(field.requiredSymbols) ? field.requiredSymbols : field.inputContract?.requiredSymbols || [])
  .map(clean).filter(Boolean).slice(0, 16);

/** The symbols this field's public entry metadata names, one spelling each. */
export const namedEntrySymbols = (field = {}) => {
  const safe = isObject(field) ? field : {};
  const named = [];
  const add = (symbol) => { if (symbol && !named.includes(symbol)) named.push(symbol); };
  for (const symbol of requiredSymbolsOf(safe)) add(SYMBOL_ALIASES[symbol.toLowerCase()] || SYMBOL_ALIASES[symbol] || symbol);
  for (const word of formatWords(safe.answerFormat || safe.inputContract?.format)) add(FORMAT_WORD_SYMBOLS[word]);
  return named;
};

const keyId = (key) => key.command;

/**
 * The editor, keypad and hint one secure response field gets.
 *
 * @param {object} field a sanitized response field from the server
 *   (mathPath.normalizeResponseFields: id, label, inputProfile, answerFormat,
 *   requiredSymbols, responseHint, placeholder, unit)
 * @param {object} [context]
 * @param {string} [context.prompt] the item's public prompt (an inequality's
 *   letters come from it and from the field's label)
 * @param {string} [context.examType] the session's exam type: a practice exam
 *   keeps its test's own number line (SECURE_PRACTICE_EXAM_HINTS)
 */
export const secureAnswerEntryFor = (field = {}, { prompt = '', examType = null } = {}) => {
  const safe = isObject(field) ? field : {};
  const profile = normalizeInteractionInputProfile(safe.inputProfile) || 'text';
  const serverHint = clean(safe.responseHint);
  if (SECURE_MATH_EDITOR_PROFILES.includes(profile)) {
    const named = namedEntrySymbols(safe).filter((symbol) => !KEYLESS_SYMBOLS.has(symbol));
    const keys = [];
    const add = (key) => { if (key && !keys.some((existing) => keyId(existing) === keyId(key))) keys.push(key); };
    (SECURE_PROFILE_KEYS[profile] || []).forEach(add);
    if (profile === 'inequality') inequalityLetters({ prompt, label: safe.label }).forEach((letter) => add(variableKey(letter)));
    named.forEach((symbol) => add(requiredAnswerToolForSymbol(symbol)));
    return {
      editor: SECURE_ANSWER_EDITORS.MATH,
      profile,
      toolProfile: toolProfileForInputProfile(profile),
      answerFormat: clean(safe.answerFormat || safe.inputContract?.format) || profile,
      keys: Object.freeze(keys),
      // A named symbol no key can type keeps the phone's own keyboard open
      // (MathInput leaves it for an unserved symbol); it shows no key, so
      // nothing is captioned "Needed for this answer".
      unservedSymbols: named.filter((symbol) => !requiredAnswerToolForSymbol(symbol)),
      hint: serverHint || entryHintFor(profile, examType),
    };
  }
  return {
    editor: SECURE_ANSWER_EDITORS.TEXT,
    profile,
    // The phone's own keyboard, letters and symbols included: a typed answer
    // here may need a variable, "and", a bracket or a slash. Never an HTML
    // number input, which refuses 3/4.
    inputMode: 'text',
    hint: serverHint || entryHintFor(profile, examType),
  };
};

/*
 * WHILE AN ANSWER IS HELD, NOTHING MAY REACH THE EDITOR.
 *
 * MathLive's own read-only mode stops its typing, but MathInput (shared by
 * every tool, not this package's) handles some keys itself before MathLive
 * sees them — a typed backslash is inserted with mathField.insert, which no
 * read-only flag stops — and its keypad inserts on click. So the secure field
 * listens on its wrapper in the CAPTURE phase, ahead of everything inside it,
 * and swallows, while it is read-only:
 *
 *   click         on any button inside it (keypad keys, the √x toggle);
 *   keydown       an editing key aimed at the math field — a character,
 *                 Backspace, Delete, Enter, or one the keyboard cannot name;
 *                 never Tab, Escape or an arrow, so the field is not a trap;
 *   drop, beforeinput  aimed at the math field. MathLive announces every
 *                 insert — its own, and MathInput's mathField.insert — with a
 *                 cancelable beforeinput, so this is a second lock on the
 *                 backslash door: tests/browser/secureAccessParity.mjs shows
 *                 either lock alone keeps it out, and neither lets it in.
 *
 * SHORTCUTS AND THE CLIPBOARD ARE STOPPED, NOT SWALLOWED. The exam's
 * integrity logger (examIntegrityLogger.js) listens on the document for
 * Ctrl+C, Ctrl+V, Ctrl+X and copy, paste and cut, and a held field must not
 * hide an attempt from it. So a Ctrl or ⌘ shortcut, and a paste or cut aimed
 * at the field, only has its default action cancelled — nothing is pasted,
 * cut or undone, and a read-only MathLive inserts nothing from a cancelled
 * paste (tests/browser/secureAccessParity.mjs) — and travels on to the page.
 * The one exception is the backslash, which MathInput inserts whatever
 * modifier is held.
 */
export const SECURE_EDITOR_HELD_EVENTS = Object.freeze(['click', 'keydown', 'paste', 'cut', 'drop', 'beforeinput']);
const EDITING_KEYS = new Set(['Backspace', 'Delete', 'Enter', 'Unidentified', 'Process']);

/** What a read-only secure editor does with an event. */
export const READ_ONLY_EDITOR_ACTIONS = Object.freeze({
  PASS: 'pass',
  /** preventDefault only: the event still reaches the page (a shortcut, a paste or a cut). */
  CANCEL: 'cancel',
  /** preventDefault and stopPropagation: nothing inside the field sees it. */
  HOLD: 'hold',
});

/**
 * What a read-only secure editor does with this event. Pure over the event's
 * `type`, `key`, modifier flags and `target` (anything with `closest`) and the
 * wrapper (anything with `contains`), so node can test it without a DOM.
 */
export const readOnlyEditorAction = (event, { readOnly = false, wrapper = null } = {}) => {
  const { PASS, CANCEL, HOLD } = READ_ONLY_EDITOR_ACTIONS;
  if (!readOnly || !event || !wrapper || typeof wrapper.contains !== 'function') return PASS;
  const target = event.target;
  if (!target || typeof target.closest !== 'function' || !wrapper.contains(target)) return PASS;
  if (event.type === 'click') {
    const button = target.closest('button');
    return button && wrapper.contains(button) ? HOLD : PASS;
  }
  const field = target.closest('math-field');
  if (!field || !wrapper.contains(field)) return PASS;
  if (event.type === 'keydown') {
    const key = String(event.key ?? '');
    if (!(key.length === 1 || EDITING_KEYS.has(key))) return PASS;
    if ((event.ctrlKey || event.metaKey) && key !== '\\') return CANCEL;
    return HOLD;
  }
  if (event.type === 'paste' || event.type === 'cut') return CANCEL;
  return event.type === 'drop' || event.type === 'beforeinput' ? HOLD : PASS;
};

export default secureAnswerEntryFor;
