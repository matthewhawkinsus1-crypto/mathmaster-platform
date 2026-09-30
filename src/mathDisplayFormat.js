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
//
// NOT ONLY LETTER COMMANDS. LaTeX also spells spacing and escaped delimiters
// with a backslash and ONE character: `\ ` (a control space), `\,` `\;` `\:`
// `\!`, `\{` `\}` for set braces, `\\` for a line break, `\%` `\$` `\&` `\#`
// `\_` `\|`. None of those is a letter, so a list of two points written the
// way authors write it — `(2, -2),\ (4, -1)` — carried no signal above, went to
// MathLive as ASCIIMath, failed to parse and rendered blank. A set written
// `\{1, 2, 3\}` did the same. Any backslash command is LaTeX; ASCIIMath has
// none of these either.
const LATEX_SIGNAL = /\\(?:frac|dfrac|tfrac|sqrt|log|ln|sin|cos|tan|left|right|cdot|times|div|pm|mp|pi|theta|alpha|beta|begin|overline|underline|le|leq|ge|geq|ne|neq|approx|infty|cup|cap|in|notin|subset|emptyset|text|mathrm|operatorname|circ|degree|angle|triangle)\b|\\[()[\]]|\\[a-zA-Z]{2,}|\\[a-zA-Z](?![a-zA-Z])|\\[ ,;:!{}%$&#_|>]|\\\\|\^\{|_\{/;

/** Does this display string contain LaTeX syntax (any backslash command)? */
export const looksLikeLatex = (value) => LATEX_SIGNAL.test(String(value ?? ''));

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
  const latex = looksLikeLatex(value);

  if (requestedFormat === 'latex') return 'latex';
  if (requestedFormat === 'ascii-math' && !latex) return 'ascii-math';
  return latex ? 'latex' : 'ascii-math';
};

/*
 * UNICODE SUBSCRIPTS ARE NOT MATH MARKUP.
 *
 * Authors write sequence terms the way they look — "a₄", "aₙ₋₁" — and that is
 * right for plain text. But MathLive does not read those characters as
 * subscripts: "a₄" typeset as a literal "a_4" and "aₙ₋₁" as "an_−_1", so a
 * field labelled a₄ showed students an underscore. Rewrite each run into the
 * subscript syntax of the format that will actually parse it.
 */
const UNICODE_SUBSCRIPTS = Object.freeze({
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
  'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n',
  'ₚ': 'p', 'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ⱼ': 'j', 'ᵣ': 'r', 'ᵤ': 'u', 'ᵥ': 'v',
});
const SUBSCRIPT_RUN = new RegExp(`[${Object.keys(UNICODE_SUBSCRIPTS).join('')}]+`, 'g');

export const unicodeSubscriptsToMathMarkup = (value, format = 'ascii-math') => (
  String(value ?? '').replace(SUBSCRIPT_RUN, (run) => {
    const plain = [...run].map((character) => UNICODE_SUBSCRIPTS[character]).join('');
    if (plain.length === 1) return `_${plain}`;
    return format === 'latex' ? `_{${plain}}` : `_(${plain})`;
  })
);

export default resolveMathDisplayFormat;
