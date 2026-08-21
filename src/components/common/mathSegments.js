// Splitting prose into "words" and "mathematics", in one place.
//
// MathText and QuestionPrompt each carried their own copy of this regex, and
// each copy read `$…$` as "a dollar, then anything that is not a dollar, then a
// dollar". That is wrong for the one case a mathematics platform is guaranteed
// to meet: money.
//
//   "Three withdrawals of $\$18.25$ total $3 \times 18.25 = \$54.75$."
//
// `\$` is the LaTeX escape for a literal dollar sign, and it is what the bank
// uses in every currency problem — 103 seed strings and counting. The old
// pattern stopped at the escaped dollar, so every delimiter after it was off by
// one: the mathematics landed in the prose segments and the student was shown
// `3 \times 18.25 = \` on screen.
//
// So the scanner has to know about escapes. `(?:\\.|[^\\$\n])` consumes an
// escaped character as a unit before it will consider a closing delimiter,
// which is the whole fix.
//
// A LONE dollar sign is still prose. "Plan A total ($)" has no partner, does
// not match, and renders as the currency symbol it is — a pair is required, and
// that is deliberate: guessing would turn "$12 and $15" into mathematics.

/** One inline or display math span, as a capturing group so `split` keeps it. */
export const MATH_SEGMENT_SOURCE = [
  '\\$\\$[\\s\\S]+?\\$\\$', // $$ … $$
  '\\\\\\[[\\s\\S]+?\\\\\\]', // \[ … \]
  '\\\\\\([\\s\\S]+?\\\\\\)', // \( … \)
  '\\$(?:\\\\.|[^\\\\$\\n])+?\\$', // $ … $, escape-aware
].join('|');

/** A fresh regex every call: a shared /g regex carries `lastIndex` between callers. */
export const mathSegmentPattern = () => new RegExp(`(${MATH_SEGMENT_SOURCE})`, 'g');

/** Whether a segment produced by `splitMathSegments` is mathematics. */
export const isMathSegment = (segment) => mathSegmentPattern().test(String(segment ?? ''));

/** Prose and mathematics, in order, with empties dropped. */
export const splitMathSegments = (text) => String(text ?? '')
  .split(mathSegmentPattern())
  .filter(Boolean);

/**
 * Authored text as plain characters, for the places that cannot typeset.
 *
 * An SVG `<text>` node holds characters, not markup, so the label drawn beside
 * a plotted point cannot use MathText — and drawing "Plot the point where
 * $x = 0$" on the coordinate plane is exactly the bug this round of work is
 * about, just somewhere a DOM-based fix cannot reach. The same is true of an
 * `aria-label`: a screen reader should hear "x equals 0", not "dollar x".
 *
 * So the mathematics is unwrapped and spelled out with the characters a person
 * reads: ≤ rather than \le, ² rather than ^2, a/b rather than \frac{a}{b}.
 * Lossy by design — this is a caption, not a formula.
 */
export const toPlainMath = (value) => splitMathSegments(value)
  .map((segment) => (isMathSegment(segment) ? unwrapMathSegment(segment).value : segment))
  .join('')
  .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
  .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
  .replace(/\\(?:le|leq)\b/g, '≤')
  .replace(/\\(?:ge|geq)\b/g, '≥')
  .replace(/\\(?:ne|neq)\b/g, '≠')
  .replace(/\\(?:cdot|times)\b/g, '×')
  .replace(/\\infty\b/g, '∞')
  .replace(/\\cup\b/g, '∪')
  .replace(/\\cap\b/g, '∩')
  .replace(/\\pi\b/g, 'π')
  .replace(/\\left|\\right/g, '')
  .replace(/\\(?:text|mathrm|operatorname)\s*\{([^{}]*)\}/g, '$1')
  .replace(/\^\{?2\}?/g, '²')
  .replace(/\^\{?3\}?/g, '³')
  .replace(/\\(?:,|;|!|quad|qquad)/g, ' ')
  .replace(/[{}]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The mathematics inside a delimited segment, and how to set it.
 *
 * Display for `$$…$$` and `\[…\]`; inline for `\(…\)` and `$…$`.
 */
export const unwrapMathSegment = (segment) => {
  const text = String(segment ?? '');
  if (text.startsWith('$$')) return { value: text.slice(2, -2), inline: false };
  if (text.startsWith('\\[')) return { value: text.slice(2, -2), inline: false };
  if (text.startsWith('\\(')) return { value: text.slice(2, -2), inline: true };
  return { value: text.slice(1, -1), inline: true };
};
