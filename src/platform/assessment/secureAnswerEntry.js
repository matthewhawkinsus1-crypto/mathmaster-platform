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
 *   number, set, interval
 *       the math editor. Fractions, negatives, decimals, set braces, ∅, ∞ and
 *       ∪ in the editor's LaTeX all grade as the typed text does.
 *
 *   orderedPair, inequality, expression, equation
 *       PLAIN TEXT, deliberately, for a reason the grader still has
 *       (SECURE_TEXT_PROFILE_REASONS; the round-trip test pins each one, so
 *       when the server learns to read the editor's form it fails and says to
 *       move that profile over).
 *
 *   text, and anything unrecognised
 *       plain text — words are the answer, or the field did not say.
 *
 * A math-editor profile also falls back to typed text when the field's own
 * public entry metadata names a symbol the editor writes in a form the grader
 * does not read (SECURE_TEXT_SYMBOLS: π, √, % and $). The key itself never
 * reaches the browser, so a key that uses one of them WITHOUT saying so is a
 * gap only the grader can close (see the round-trip test).
 *
 * Nothing here decides correctness or rewrites an answer. It picks a keyboard.
 */
import { normalizeInteractionInputProfile, toolProfileForInputProfile } from '../interaction/interactionContract.js';

export const SECURE_ANSWER_EDITORS = Object.freeze({
  MATH: 'math',
  TEXT: 'text',
});

/** Profiles whose math-editor output the server field grader accepts. */
export const SECURE_MATH_EDITOR_PROFILES = Object.freeze(['number', 'set', 'interval']);

/** Profiles kept on typed text, with the reason the round-trip test pins. */
export const SECURE_TEXT_PROFILE_REASONS = Object.freeze({
  orderedPair: 'the grader compares a pair as text, so the a/b key\'s (\\frac{-1}{2},3) is not the key (-1/2,3) — and on a phone the a/b key is the only way to make a fraction in a pair — and a root typed into a pair swallows the rest of it ((3\\sqrt{(2),1)})',
  inequality: 'the editor writes a typed "and" as \\land, which the grader does not read (0<=h\\land h<=12 vs 0<=h and h<=12), and a phone\'s inequality keypad has no letter keys while every inequality key has a variable',
  expression: 'the grader does not read the editor\'s division binding the way it reads typed text (\\frac{2A}{h}-b_2 vs 2A/h-b_2)',
  equation: 'the grader keeps the backslash of a named function the editor writes (\\log_2\\left(32\\right)=5 vs log_2(32)=5)',
});

/*
 * Symbols the editor writes as LaTeX the grader keeps as it is — `2\pi`,
 * `3\sqrt{2}`, `25\%`, `\$25` — so a key spelled 2pi, 3sqrt(2), 25% or $25 is
 * not matched. A field whose public metadata (requiredSymbols, answerFormat)
 * names one of them gets typed text, where the same characters are matched.
 */
export const SECURE_TEXT_SYMBOLS = Object.freeze(['π', 'pi', '\\pi', '√', 'ⁿ√', 'sqrt', '\\sqrt', '%', '\\%', 'percent', '$', '\\$']);
const TEXT_SYMBOL_SET = new Set(SECURE_TEXT_SYMBOLS.map((symbol) => symbol.toLowerCase()));
// Whole words of a format name ("exact-pi", "exactPi", "simplest radical"),
// so "orderedPair" or "piecewise" never match.
const TEXT_SYMBOL_FORMAT_WORDS = new Set(['pi', 'radical', 'radicals', 'sqrt', 'root', 'roots', 'percent', 'percentage', 'currency', 'money', 'dollar', 'dollars']);
const formatWords = (format) => clean(format).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);

/*
 * A SHORT LINE UNDER THE BOX ABOUT HOW TO TYPE, NEVER WHAT TO TYPE.
 *
 * No example numbers: an example that happened to equal an item's answer would
 * read as a hint on a test. The server's own `responseHint` (public, authored
 * with the item, presentation only) wins when the field has one.
 */
export const SECURE_ENTRY_HINTS = Object.freeze({
  number: 'Type only the number. Make a fraction with / or the a/b key, and write a mixed number as a fraction or a decimal. Leave out commas, units, % and $.',
  set: 'Write your answer as a set, with the numbers separated by commas.',
  interval: 'Write your answer in interval notation.',
  orderedPair: 'Write your answer as an ordered pair: (x, y). Use / for a fraction.',
  inequality: 'Write your answer as an inequality. Type <= for ≤ and >= for ≥.',
  expression: 'Use ^ for a power, / for a fraction and parentheses to group.',
  equation: 'Write a full equation. Use ^ for a power, / for a fraction and parentheses to group.',
});

/** A math-editor profile sent to typed text has no a/b key to mention. */
export const SECURE_TEXT_FALLBACK_HINTS = Object.freeze({
  number: 'Type your answer. Use / for a fraction.',
});

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const requiredSymbolsOf = (field) => (Array.isArray(field.requiredSymbols) ? field.requiredSymbols : field.inputContract?.requiredSymbols || [])
  .map(clean).filter(Boolean).slice(0, 16);

/** Does this field's public entry metadata name a symbol the editor would misspell for the grader? */
export const namesTextOnlySymbol = (field = {}) => {
  const safe = isObject(field) ? field : {};
  if (requiredSymbolsOf(safe).some((symbol) => TEXT_SYMBOL_SET.has(symbol.toLowerCase()))) return true;
  return formatWords(safe.answerFormat || safe.inputContract?.format).some((word) => TEXT_SYMBOL_FORMAT_WORDS.has(word));
};

/**
 * The editor, keypad and hint one secure response field gets.
 *
 * @param {object} field a sanitized response field from the server
 *   (mathPath.normalizeResponseFields: id, label, inputProfile, answerFormat,
 *   requiredSymbols, responseHint, placeholder, unit)
 */
export const secureAnswerEntryFor = (field = {}) => {
  const safe = isObject(field) ? field : {};
  const profile = normalizeInteractionInputProfile(safe.inputProfile) || 'text';
  const serverHint = clean(safe.responseHint);
  if (SECURE_MATH_EDITOR_PROFILES.includes(profile) && !namesTextOnlySymbol(safe)) {
    return {
      editor: SECURE_ANSWER_EDITORS.MATH,
      profile,
      toolProfile: toolProfileForInputProfile(profile),
      answerFormat: clean(safe.answerFormat || safe.inputContract?.format) || profile,
      requiredSymbols: requiredSymbolsOf(safe),
      hint: serverHint || SECURE_ENTRY_HINTS[profile] || '',
    };
  }
  return {
    editor: SECURE_ANSWER_EDITORS.TEXT,
    profile,
    // The phone's own keyboard, letters and symbols included: a typed answer
    // here may need a variable, "and", a bracket or a slash. Never an HTML
    // number input, which refuses 3/4.
    inputMode: 'text',
    hint: serverHint || SECURE_TEXT_FALLBACK_HINTS[profile] || SECURE_ENTRY_HINTS[profile] || '',
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
