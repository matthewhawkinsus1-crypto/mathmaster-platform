/*
 * TELL THE STUDENT WHAT SHAPE THE ANSWER TAKES.
 *
 * The platform already ENFORCES a format on most response fields. A field whose
 * answer is the x-intercept carries requiredSymbols ["(", ")", ","], so a
 * student who types 3 is rejected — correct mathematics, marked wrong for
 * punctuation nobody told them about. The same question then asks for the zero,
 * which is the number 3 and rejects (3,0).
 *
 * Nothing was wrong with the enforcement. What was missing is that the contract
 * was never stated. A student was expected to infer, from the word "zero"
 * versus "x-intercept", which of two visually identical boxes wanted brackets.
 * That is a reading comprehension test wearing an algebra costume, and the
 * students it fails are not the ones who do not understand intercepts.
 *
 * So every field gets two things drawn from its declared format:
 *
 *   placeholder   a concrete example of the SHAPE, inside the empty box
 *   hint          a short line under the label, stating the format in words
 *
 * NEITHER MAY LEAK THE ANSWER. Examples here are deliberately generic constants
 * with no relationship to any question — an ordered-pair example is always
 * (2, -5) whatever the real point is. Deriving an example from the expected
 * value would be an answer leak dressed as help, and this file must never grow
 * one: `exampleFor` takes a format, never a field, so there is nothing for an
 * answer to arrive in.
 *
 * AN INEQUALITY'S EXAMPLE IS WRITTEN IN LETTERS. "0 ≤ x ≤ 4" was the example
 * for every inequality box, and numbers can be an answer: the authoring
 * contract asks for domains written just so, and a Path family draws
 * 0 <= x <= 4 as its key. The letters of the shape are no item's answer
 * (inequalityExample.test.mjs reads every bank and grades every version of
 * every lesson), and the hints already use them ("For y ≥ mx + b, shade
 * above").
 */

import { isMathSegment, splitMathSegments } from '../../components/common/mathSegments.js';

const FORMATS = Object.freeze({
  orderedPair: {
    label: 'ordered pair',
    example: '(2, -5)',
    hint: 'Write an ordered pair, with parentheses and a comma.',
  },
  number: {
    label: 'number',
    example: '-4',
    hint: 'Write a single number.',
  },
  equation: {
    label: 'equation',
    example: 'x = 2',
    hint: 'Write a full equation, including the equals sign.',
  },
  inequality: {
    label: 'inequality',
    // One variable: a domain, a range, a solution set.
    example: 'a ≤ x ≤ b',
    // An inequality in x and y, where the student reads both (readsXAndY).
    twoVariableExample: 'y ≥ mx + b',
    hint: 'Write an inequality using the symbols above.',
  },
  interval: {
    label: 'interval',
    example: '[2, ∞)',
    hint: 'Write an interval, using [ ] when the endpoint is included and ( ) when it is not.',
  },
  set: {
    label: 'set',
    example: '{1, 2, 3}',
    hint: 'List the values inside braces, separated by commas.',
  },
  expression: {
    label: 'expression',
    example: '2x + 1',
    hint: 'Write an expression. No equals sign.',
  },
});

const ALIASES = Object.freeze({
  orderedpair: 'orderedPair',
  coordinate: 'orderedPair',
  coordinates: 'orderedPair',
  point: 'orderedPair',
  pair: 'orderedPair',
  numeric: 'number',
  value: 'number',
  scalar: 'number',
  eq: 'equation',
  inequalities: 'inequality',
  intervalnotation: 'interval',
  setnotation: 'set',
  roster: 'set',
});

export const ANSWER_FORMAT_IDS = Object.freeze(Object.keys(FORMATS));

/** Reduce any of the several spellings the content carries to one id. */
export const normalizeAnswerFormatId = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (FORMATS[raw]) return raw;
  const squashed = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (FORMATS[squashed]) return squashed;
  return ALIASES[squashed] || '';
};

/**
 * The declared format of one response field.
 *
 * Reads only the field's own contract. A field that declares nothing gets
 * nothing — a guessed format that turns out to be wrong is worse than silence,
 * because the student would then be following an instruction the grader
 * disagrees with.
 */
export const answerFormatOf = (field = {}) => normalizeAnswerFormatId(
  field?.answerFormat
  || field?.inputContract?.format
  || field?.notation
  || field?.inputMode
  || field?.inputProfile
  || field?.type,
);

/*
 * DOES WHAT THE STUDENT READS NAME BOTH x AND y? (F-GRAPH-IN-WORDS, PR #537
 * walkthrough.)
 *
 * "a ≤ x ≤ b" is a compound inequality in one variable: the shape of a domain
 * or a solution set, and the wrong one beside "Write each statement as an
 * inequality, where x is her two-point shots and y her three-point shots".
 * An inequality in x and y is shown one in x and y.
 *
 * What the student reads is the prompt and the field's own label, never the
 * key: this takes those two strings and nothing else. The label speaks first.
 * A label that names a variable of its own ("Values of k", "The miles x for
 * which Company A costs less") asks about that one, whatever letters the
 * prompt's lines are written in; one that names none, or only a part
 * ("(b)", "Graph a", "System c"), leaves it to the prompt. A variable is a
 * letter in the mathematics (2xy is x and y) or standing alone in the words
 * (a coefficient before it is allowed: 3x), but never "a", "A" or "I", which
 * are words.
 */
const NOT_LETTER_WORDS = new Set(['a', 'A', 'I']);
const PART_NAMES = /\((?:[A-Za-z])\)|\b(?:graphs?|systems?|parts?|tables?|figures?|steps?)\s+[A-Za-z](?![A-Za-z])/gi;
const variablesNamed = (text) => {
  const letters = new Set();
  for (const segment of splitMathSegments(String(text ?? ''))) {
    if (isMathSegment(segment)) {
      const body = segment
        .replace(/\\(?:text|mathrm|operatorname|textbf|mbox)\s*\{[^{}]*\}/g, ' ')
        .replace(/\\[A-Za-z]+/g, ' ');
      // A run of letters is a word or a product; only a short run is a product of variables.
      for (const run of body.match(/[A-Za-z]+/g) || []) if (run.length <= 3) [...run].forEach((letter) => letters.add(letter));
    } else {
      // Beside any letter of a word, accents included ("César" names no C).
      for (const [letter] of segment.replace(PART_NAMES, ' ').matchAll(/(?<![\p{L}'’])[A-Za-z](?![\p{L}'’])/gu)) {
        if (!NOT_LETTER_WORDS.has(letter)) letters.add(letter);
      }
    }
  }
  return letters;
};
export const readsXAndY = ({ prompt = '', label = '' } = {}) => {
  const own = variablesNamed(label);
  const read = own.size ? own : variablesNamed(prompt);
  return read.has('x') && read.has('y');
};

/**
 * A generic example of the shape. Never derived from the expected answer.
 * `twoVariables`: what the student reads names both x and y (readsXAndY).
 */
export const exampleFor = (formatId, { twoVariables = false } = {}) => {
  const spec = FORMATS[normalizeAnswerFormatId(formatId)];
  return (twoVariables && spec?.twoVariableExample) || spec?.example || '';
};

/**
 * Placeholder text for an empty box.
 *
 * An author-supplied placeholder always wins: it is more specific to the
 * question than anything derivable here.
 */
export const placeholderForField = (field = {}) => {
  const authored = String(field?.placeholder ?? '').trim();
  if (authored) return authored;
  const example = exampleFor(answerFormatOf(field));
  return example ? `for example ${example}` : 'Type your answer';
};

/**
 * What an empty answer box says, and what the line above it says about it.
 *
 * "for example (2, -5)" used to be the box's placeholder, so a box 127px wide
 * (four to a row at 1366) read "for exampl…" and the example, the only
 * informative part, was cut off. The words now live above the box, where they
 * wrap, and the box keeps the example alone. An author's own placeholder still
 * wins, word for word, and then there is no example to state above it.
 * `inferredFormat` is the format the field's input kind implies when it
 * declares none (a set box, an inequality box). `prompt` is the question's,
 * which with the field's label says whether an inequality is in x and y.
 */
export const describeBoxPlaceholder = (field = {}, { inferredFormat = '', prompt = '' } = {}) => {
  const authored = String(field?.placeholder ?? '').trim();
  if (authored) return { placeholder: authored, example: '' };
  const shape = { twoVariables: readsXAndY({ prompt, label: field?.label }) };
  const example = exampleFor(answerFormatOf(field), shape) || exampleFor(inferredFormat, shape);
  return { placeholder: example || 'Type your answer', example };
};

/**
 * The one-line format statement shown under the label.
 *
 * Returns '' for choice and free-text fields, which have no format to state,
 * and for fields that declare no format at all.
 */
export const formatHintForField = (field = {}) => {
  if (field?.type === 'choice' || field?.inputProfile === 'choice') return '';
  if (field?.type === 'text' || field?.inputProfile === 'text') return '';
  const spec = FORMATS[answerFormatOf(field)];
  return spec ? spec.hint : '';
};

/** Short noun for the format, for a compact chip beside the label. */
export const formatLabelForField = (field = {}) => FORMATS[answerFormatOf(field)]?.label || '';

/**
 * Everything a response field needs in order to state its own contract.
 * One call, so a surface cannot show the example while omitting the words.
 */
export const describeAnswerFormat = (field = {}) => {
  const formatId = answerFormatOf(field);
  return {
    formatId,
    label: formatLabelForField(field),
    example: exampleFor(formatId),
    hint: formatHintForField(field),
    placeholder: placeholderForField(field),
  };
};

export default describeAnswerFormat;
