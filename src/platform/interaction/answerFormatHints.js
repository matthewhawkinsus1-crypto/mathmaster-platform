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
 */

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
    example: '0 ≤ x ≤ 4',
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

/** A generic example of the shape. Never derived from the expected answer. */
export const exampleFor = (formatId) => FORMATS[normalizeAnswerFormatId(formatId)]?.example || '';

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
