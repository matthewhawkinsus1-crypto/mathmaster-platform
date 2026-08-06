import 'mathlive';

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

const detectMathFormat = (value, requestedFormat) => {
  if (requestedFormat === 'latex' || requestedFormat === 'ascii-math') {
    return requestedFormat;
  }

  const text = String(value ?? '');
  const looksLikeLatex =
    /\\(?:frac|sqrt|log|ln|sin|cos|tan|left|right|cdot|times|pi|theta|alpha|beta|begin|overline|underline)\b/.test(text) ||
    /\\[()[\]]/.test(text) ||
    /\^\{|_\{/.test(text);

  return looksLikeLatex ? 'latex' : 'ascii-math';
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
  const cleanValue = stripMathDelimiters(value);
  if (!cleanValue) return null;

  const resolvedFormat = detectMathFormat(cleanValue, format);
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
