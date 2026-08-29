const LATEX_SIGNAL = /\\(?:frac|sqrt|log|ln|sin|cos|tan|left|right|cdot|times|pi|theta|alpha|beta|begin|overline|underline)\b|\\[()[\]]|\^\{|_\{/;

/**
 * Resolve the parser MathLive should use for a display string.
 *
 * A caller may request ASCIIMath, but MathDisplay can rewrite a slash division
 * to an explicit LaTeX \frac before this function runs. Once a LaTeX command
 * exists in the rendered value, forcing ASCIIMath would expose the command text
 * instead of typesetting it. Explicit LaTeX always wins; explicit ASCIIMath is
 * kept only while the value still contains no LaTeX syntax.
 */
export const resolveMathDisplayFormat = (value, requestedFormat = 'auto') => {
  const text = String(value ?? '');
  const looksLikeLatex = LATEX_SIGNAL.test(text);

  if (requestedFormat === 'latex') return 'latex';
  if (requestedFormat === 'ascii-math' && !looksLikeLatex) return 'ascii-math';
  return looksLikeLatex ? 'latex' : 'ascii-math';
};

export default resolveMathDisplayFormat;
