// Every LaTeX command that can appear in authored student-facing math, not
// only the ones that happen to look like functions.
//
// WHY THE RELATIONS MATTER. A prompt reading "restricted to \(-3\le x<4\)"
// carries no \frac and no \sqrt, so the original list did not recognise it as
// LaTeX and MathLive was handed it as ASCIIMath. ASCIIMath has no \le, so it
// rendered the raw command joined to the next token — students saw "\lex" in
// red error type in the middle of the sentence telling them what to do. Every
// domain, range and interval prompt on the platform is written this way, so the
// gap was not one bad question.
//
// The trailing `\\[a-zA-Z]{2,}` catches the rest of LaTeX rather than waiting
// for the next command to be reported as garbage. ASCIIMath has no backslash
// commands at all, so a multi-letter backslash command is LaTeX by definition.
const LATEX_SIGNAL = /\\(?:frac|dfrac|tfrac|sqrt|log|ln|sin|cos|tan|left|right|cdot|times|div|pm|mp|pi|theta|alpha|beta|begin|overline|underline|le|leq|ge|geq|ne|neq|approx|infty|cup|cap|in|notin|subset|emptyset|text|mathrm|operatorname|circ|degree|angle|triangle)\b|\\[()[\]]|\\[a-zA-Z]{2,}|\^\{|_\{/;

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
