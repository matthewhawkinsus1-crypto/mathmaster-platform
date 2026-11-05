/*
 * DOES THIS SENTENCE STATE A BOX'S ANSWER? (PR #537 walkthrough,
 * F-HINT-GIVES-STEP and F-NO-MISCONCEPTION-FEEDBACK.)
 *
 *   boxesStated(sentence, version) → ['fieldId (key)', …]
 *
 * A hint before the last one, or the sentence said on a miss, must not hand
 * over a box's answer. The platform's leak guard reads an answer as text
 * (hintLeakGuard.js), so "16 = 2⁴, so ⁶√16 = 2^(4/6)" passed it for the key
 * 2^(2/3), and "(a√2)² − a² = 2a² − a²" for the key a². This reads it the
 * way the radicals grader does: a number box by value (the leak guard's own
 * reading, a quotation of the problem excepted), any other box by its
 * simplest-form spelling or by the value of an expression the sentence
 * writes. Test code only.
 */
import { questionDisplayText, questionVisibleText } from '../../../src/platform/supports/hints/questionHints.js';
import { statedAnswers } from '../../../src/platform/supports/hints/hintLeakGuard.js';
import { unicodeSuperscriptsToMathMarkup } from '../../../src/mathDisplayFormat.js';
import { expandLatexShorthand } from '../../../functions/shared/algebraicForm.mjs';
import { radicalFormMiss, sameSimplestRadicalForm } from '../../../functions/shared/simplestRadicalFormEquivalence.mjs';

// Mathematics as the comparisons read it: superscripts and written radicals
// as LaTeX (x⁴ is x^4, ⁶√16 is \sqrt[6]{16}, √(x³) is \sqrt{x^3}), one minus
// sign, one multiplication sign.
const asMath = (text) => expandLatexShorthand(unicodeSuperscriptsToMathMarkup(String(text), 'latex'))
  .replace(/[−–]/g, '-')
  .replace(/·|×|\\cdot|\\times/g, '*');
const squash = (text) => expandLatexShorthand(asMath(text).replace(/\s+/g, ''));
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `piece` is written whole in `text`: not as part of a longer number, monomial or power. */
const writesWhole = (text, piece) => new RegExp(`(?<![0-9A-Za-z^.\\\\])${escaped(piece)}(?![0-9A-Za-z^.({])`).test(text);

// A token of mathematics: a digit, a command, a bracket or an operator, and
// no word of three letters or more once the commands are set aside.
const isMathToken = (token) => {
  const bare = token.replace(/\$/g, '').replace(/[.,;:?]+$/, '');
  return /[0-9\\^()[\]{}|/*=+-]/.test(bare) && !/[A-Za-z]{3}/.test(bare.replace(/\\[A-Za-z]+/g, ''));
};
/** The runs of mathematics a text writes, each without its spaces ("(q³ + 5)⁴" is one). */
const mathRuns = (text) => {
  const runs = [];
  let run = [];
  const close = () => {
    if (run.length) runs.push(expandLatexShorthand(run.join('').replace(/\$/g, '').replace(/[.,;:?]+$/, '')));
    run = [];
  };
  asMath(text).split(/\s+/).forEach((token) => {
    if (!isMathToken(token)) { close(); return; }
    run.push(token);
    if (/[.,;:?]$/.test(token)) close();
  });
  close();
  return runs.filter(Boolean);
};
/**
 * The expressions a sentence writes: each side of each equation in it, and
 * the base of each bracketed power ("(2xy²)⁴" writes 2xy²). A lone letter is
 * a name, not a statement.
 */
const fragments = (sentence) => {
  const sides = mathRuns(sentence).flatMap((run) => run.split('=')).map((side) => side.replace(/^[*/+]|[*/+-]$/g, ''));
  const bases = sides.flatMap((side) => [...side.matchAll(/[([]([^()[\]]+)[)\]]\^/g)].map(([, base]) => base));
  return [...new Set([...sides, ...bases])].filter((piece) => piece && !/^-?[A-Za-z]$/.test(piece));
};

// The same value, as the radicals grader reads it: the key itself, the key
// left unsimplified, or the key in the other notation.
const sameValue = (written, key) => {
  try {
    return sameSimplestRadicalForm(written, key) || ['notSimplest', 'notation'].includes(radicalFormMiss(written, key));
  } catch {
    return false;
  }
};
// Its value where every letter is positive: 2xy² is 2|x|y² with the bars left off.
const withoutBars = (key) => key.replace(/\|([^|]*)\|/g, '($1)');

/**
 * The boxes whose answer this sentence states, in this version: a number box
 * whose number it writes, or any other box whose key it writes in its
 * simplest-form spelling, or whose value it writes as an expression the
 * problem does not show. Choices are not boxes: their options are on screen.
 */
export const boxesStated = (sentence, version) => {
  const visible = questionVisibleText(version);
  // The prompt's and the labels' own mathematics: quoting it states nothing new.
  const shown = mathRuns(visible);
  const quoted = (piece) => shown.some((run) => writesWhole(run, piece));
  const written = fragments(sentence);
  return (version.answerFields || []).filter((field) => field.type !== 'choice').filter((field) => {
    const key = String(field.answer);
    if (field.inputProfile === 'number') {
      return statedAnswers(sentence, { answers: [key], visibleText: visible, displayText: questionDisplayText(version) }).length > 0;
    }
    if (written.includes(squash(key))) return true;
    return written.some((piece) => !quoted(piece)
      && (sameValue(piece, key) || (key.includes('|') && sameValue(piece, withoutBars(key)))));
  }).map((field) => `${field.id} (${field.answer})`);
};
