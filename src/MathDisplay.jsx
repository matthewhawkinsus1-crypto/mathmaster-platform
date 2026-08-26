import 'mathlive';
import { stackDivisions } from '../functions/shared/stackDivisions.mjs';
import { resolveMathDisplayFormat } from './mathDisplayFormat.js';

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
  const cleanValue = stackDivisions(stripMathDelimiters(value));
  if (!cleanValue) return null;

  // Important: stackDivisions may have introduced a LaTeX \frac into a value
  // that the caller originally classified as ASCIIMath. Re-resolve the format
  // from the rewritten value so MathLive typesets the fraction instead of
  // displaying \frac / \left / \right as visible command text.
  const resolvedFormat = resolveMathDisplayFormat(cleanValue, format);
  const Element = inline ? 'math-span' : 'math-div';

  return (
    <Element
      key={`${resolvedFormat}:${cleanValue}`}
      format={resolvedFormat}
      aria-label={ariaLabel}
      className={className}
      style={{
        display: inline ? 'inline-block' : 'block',
        maxWidth: '100%',
        overflowX: inline ? 'visible' : 'auto',
        overflowY: 'hidden',
        verticalAlign: inline ? '-0.16em' : 'middle',
        lineHeight: 1.35,
        ...style,
      }}
    >
      {cleanValue}
    </Element>
  );
}
