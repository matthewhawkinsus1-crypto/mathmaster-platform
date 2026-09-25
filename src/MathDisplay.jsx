import { useEffect, useRef } from 'react';
import 'mathlive';
import { ensureMathElementRenders } from './platform/math/ensureMathElementRenders.js';
import { stackDivisions } from '../functions/shared/stackDivisions.mjs';
import { resolveMathDisplayFormat } from './mathDisplayFormat.js';

// Before the inequality keypad became atomic, MathLive could serialize
// "\\le" followed immediately by t as the TeX command "\\let" (and the
// analogous \\get / \\net joins). Old in-progress drafts can still contain
// those strings. Repair them at display time so a student never sees editor
// command text in Model so far, solution review, or another math surface.
const repairLegacyMathLiveRelations = (value) => String(value ?? '')
  .replace(/\\let\b/g, '\\le t')
  .replace(/\\get\b/g, '\\ge t')
  .replace(/\\net\b/g, '\\ne t');

// Parentheses whose entire contents are one stacked fraction are redundant in
// ordinary coefficient notation: (2/3)x existed only to make the old slash
// renderer unambiguous. After stackDivisions has produced a real fraction, keep
// the fraction as one MathLive atom and drop that visual-only grouping. This is
// deliberately narrow: parentheses around sums/products are never touched.
const stripRedundantStackedFractionParens = (value) => String(value ?? '')
  // Remove coefficient-only wrappers such as (2/3)x, where the following
  // variable already makes the multiplication unambiguous. Do NOT strip the
  // grouping from 3(20/9): there the parentheses communicate the student's
  // substitution and prevent the product from visually collapsing into the
  // fraction numerator.
  .replace(/\\left\(\s*(\\frac\{[^{}]+\}\{[^{}]+\})\s*\\right\)(?=\s*(?:[A-Za-z]|\\[A-Za-z]))/g, '$1')
  .replace(/\(\s*(\\frac\{[^{}]+\}\{[^{}]+\})\s*\)(?=\s*(?:[A-Za-z]|\\[A-Za-z]))/g, '$1');

const stripMathDelimiters = (value) => {
  const text = String(value ?? '').trim();

  if (text.startsWith('$$') && text.endsWith('$$')) {
    return text.slice(2, -2).trim();
  }
  if (text.startsWith('\\[') && text.endsWith('\\]')) {
    return text.slice(2, -2).trim();
  }
  if (text.startsWith('\\(') && text.endsWith('\\)')) {
    return text.slice(2, -2).trim();
  }
  if (text.startsWith('$') && text.endsWith('$')) {
    return text.slice(1, -1).trim();
  }

  return text;
};

/**
 * Renders non-editable mathematical notation with MathLive.
 *
 * Use format="latex" for strings such as "\\frac{1}{2}bh".
 * Use format="ascii-math" for strings such as "1/2 b h", "sqrt(x)",
 * "x^2", or "log_2(x)". The default "auto" detects common LaTeX.
 */
export default function MathDisplay({
  value,
  format = 'auto',
  inline = false,
  ariaLabel = 'Mathematical expression',
  style = {},
  className = '',
}) {
  // A division becomes a fraction before anything decides how to render it.
  //
  // Without this, whether `3/4` stacked depended on the rest of the sentence:
  // ASCIIMath stacks a numeric division, LaTeX does not, and NEITHER stacks a
  // division with a letter in it, so `x/2` was always a side slash. `\frac`
  // stacks in both modes, so writing it out settles the question before format
  // detection runs. Anything ambiguous is left exactly as authored — see
  // ../functions/shared/stackDivisions.mjs.
  const cleanValue = stripRedundantStackedFractionParens(
    stackDivisions(repairLegacyMathLiveRelations(stripMathDelimiters(value))),
  );
  const elementRef = useRef(null);
  useEffect(() => ensureMathElementRenders(elementRef.current), [cleanValue, format]);
  if (!cleanValue) return null;

  // Important: stackDivisions may have introduced a LaTeX \frac into a value
  // that the caller originally classified as ASCIIMath. Re-resolve the format
  // from the rewritten value so MathLive typesets the fraction instead of
  // displaying \frac / \left / \right as visible command text.
  const resolvedFormat = resolveMathDisplayFormat(cleanValue, format);
  const Element = inline ? 'math-span' : 'math-div';

  return (
    <Element
      ref={elementRef}
      key={`${resolvedFormat}:${cleanValue}`}
      format={resolvedFormat}
      aria-label={ariaLabel}
      className={className}
      style={{
        display: inline ? 'inline-block' : 'block',
        maxWidth: '100%',
        overflowX: inline ? 'visible' : 'auto',
        // Inline math never scrolls. `visible` on one axis with `hidden` on the
        // other computes to `auto`, so a stacked fraction a few pixels taller
        // than the line (the solved value 20/9 in a substitution token) was
        // clipped and grew a horizontal scrollbar under it.
        overflowY: inline ? 'visible' : 'hidden',
        verticalAlign: inline ? '-0.16em' : 'middle',
        lineHeight: 1.35,
        // Block math clips vertically at its padding box, and a stacked
        // fraction hangs ~0.4em below the line: denominators on the systems
        // verify card lost their bottom 7px. Room for the fraction, only when
        // there is one.
        ...(!inline && cleanValue.includes('\\frac') ? { paddingTop: '0.1em', paddingBottom: '0.4em' } : null),
        ...style,
      }}
    >
      {cleanValue}
    </Element>
  );
}
