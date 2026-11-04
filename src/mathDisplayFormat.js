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
  // A radical with an index written before it (⁶√(x¹⁸)) has no ASCIIMath
  // spelling MathLive reads, so it is LaTeX too (unicodeSuperscriptsToMathMarkup).
  const latex = looksLikeLatex(value) || hasIndexedRadical(value);

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

// The ")" that closes the "(" at `open`, or -1.
const closingBracket = (text, open) => {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

/*
 * UNICODE SUPERSCRIPTS ARE NOT MATH MARKUP EITHER.
 *
 * The radicals and exponents lessons write powers the way they look: "(−3)⁴",
 * "x¹⁸", "x⁻²", "aⁿ", "⁶√(x¹⁸)". An author's x^4 reaches a label as x⁴ too
 * (normalizePlainMathTypography). MathLive reads these characters one at a
 * time: in ASCIIMath every one but ² and ³ typeset as a caret, so students saw
 * "(−3)ˆ4" and "ˆ6√(xˆ1ˆ8)", and in LaTeX "x¹⁸" is the double power x^1^8.
 * Each run becomes one power in the syntax of the format that parses it, and
 * an index written before √ becomes the radical's index, which only LaTeX can
 * draw (resolveMathDisplayFormat). Words stay words: a run inside \text{…} or
 * an ASCIIMath "…" is left as written. Display only: nothing graded reads this.
 */
const UNICODE_SUPERSCRIPTS = Object.freeze({
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ⁱ': 'i', 'ˣ': 'x',
});
const SUPERSCRIPT_RUN = new RegExp(`[${Object.keys(UNICODE_SUPERSCRIPTS).join('')}]+`, 'g');
const HAS_SUPERSCRIPT = new RegExp(`[${Object.keys(UNICODE_SUPERSCRIPTS).join('')}]`);
const plainSuperscripts = (run) => [...run].map((character) => UNICODE_SUPERSCRIPTS[character]).join('');

// An index before a square-root sign: ⁶√, ⁿ√. Right after a letter, a number
// or a bracket the run is that factor's power instead: "x³√x" is x³ times √x,
// as stackDivisions.mjs reads it.
const RADICAL_INDEX = /([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ]+)√/g;
const POWER_BASE = /[\p{L}\p{N})\]}|]/u;

// The radicand after a radical sign: a bracketed group, a number or one letter.
const radicandAt = (text, start) => {
  if (text[start] === '(') {
    const close = closingBracket(text, start);
    return close === -1 ? null : { inner: text.slice(start + 1, close), end: close + 1 };
  }
  const token = /^(?:\d+(?:\.\d+)?|\p{L})/u.exec(text.slice(start));
  return token ? { inner: token[0], end: start + token[0].length } : null;
};

const indexedRadicalsToLatex = (text) => {
  let out = '';
  let from = 0;
  for (const match of text.matchAll(RADICAL_INDEX)) {
    if (match.index < from || POWER_BASE.test(text[match.index - 1] || '')) continue;
    const radicand = radicandAt(text, match.index + match[0].length);
    if (!radicand) continue;
    out += `${text.slice(from, match.index)}\\sqrt[${plainSuperscripts(match[1])}]{${indexedRadicalsToLatex(radicand.inner)}}`;
    from = radicand.end;
  }
  return out + text.slice(from);
};

// Words in a value: LaTeX \text{…} (and its kin) or an ASCIIMath "…".
const VERBATIM_LATEX = /\\(?:text|mathrm|operatorname|textrm|mbox)\s*\{/g;
const verbatimSpans = (text, format) => {
  if (format !== 'latex') return [...text.matchAll(/"[^"]*"/g)].map((match) => [match.index, match.index + match[0].length]);
  const spans = [];
  for (const match of text.matchAll(VERBATIM_LATEX)) {
    if (spans.length && match.index < spans[spans.length - 1][1]) continue;
    let depth = 0;
    for (let index = match.index + match[0].length - 1; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}' && (depth -= 1) === 0) { spans.push([match.index, index + 1]); break; }
    }
  }
  return spans;
};
const outsideWords = (text, format, rewrite) => {
  let out = '';
  let from = 0;
  for (const [start, end] of verbatimSpans(text, format)) {
    out += rewrite(text.slice(from, start)) + text.slice(start, end);
    from = end;
  }
  return out + rewrite(text.slice(from));
};

const hasIndexedRadical = (value) => {
  const text = String(value ?? '');
  return /[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ]√/.test(text) && outsideWords(text, 'latex', indexedRadicalsToLatex) !== text;
};

export const unicodeSuperscriptsToMathMarkup = (value, format = 'ascii-math') => {
  const text = String(value ?? '');
  if (!HAS_SUPERSCRIPT.test(text)) return text;
  return outsideWords(text, format, (math) => (format === 'latex' ? indexedRadicalsToLatex(math) : math)
    .replace(SUPERSCRIPT_RUN, (run) => (format === 'latex' ? `^{${plainSuperscripts(run)}}` : `^(${plainSuperscripts(run)})`)));
};

/*
 * A BRACKETED EXPONENT IS A GROUP, AND IN LATEX A GROUP IS BRACES.
 *
 * "x^(1/3)" is a power in plain text and in ASCIIMath, where the brackets
 * group the exponent. Once MathDisplay has stacked a fraction the value is
 * typeset as LaTeX, and there "^(" raises the bracket alone: y^(1/7) was drawn
 * as y⁽ with 1/7 on the line after it, in every Rational Exponents lesson. A
 * bracketed exponent or subscript becomes the braced group it means. Display
 * only: nothing graded reads this.
 */
export const braceScriptGroups = (value, format = 'latex') => {
  const text = String(value ?? '');
  if (format !== 'latex' || !/[\^_]\s*\(/.test(text)) return text;
  let out = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if ((character === '^' || character === '_') && text[index - 1] !== '\\') {
      let open = index + 1;
      while (text[open] === ' ') open += 1;
      const close = text[open] === '(' ? closingBracket(text, open) : -1;
      if (close !== -1) {
        out += `${character}{${braceScriptGroups(text.slice(open + 1, close), format)}}`;
        index = close;
        continue;
      }
    }
    out += character;
  }
  return out;
};

// Verbatim groups: words, not math (`\text{log in}`).
const VERBATIM_GROUP = /\\(?:text|mathrm|operatorname|textrm|mbox)\s*\{/g;
const FUNCTION_NAME = /(?<![A-Za-z\\])(ln|log|sin|cos|tan|sec|csc|cot)(?=\s*(?:\(|\\left\(|_|\^))/g;

/*
 * A FUNCTION'S NAME IS UPRIGHT. Once a value is typeset as LaTeX — a stacked
 * fraction makes it so — a bare ln(3) is the letters l and n in italics, the
 * product of two variables. ln, log, sin, cos, tan, sec, csc and cot written
 * just before their bracket or base become the commands that draw the name.
 * Words in \text{…} stay words. Display only.
 */
export const latexFunctionNames = (value, format = 'latex') => {
  const text = String(value ?? '');
  if (format !== 'latex' || !/(?:ln|log|sin|cos|tan|sec|csc|cot)/.test(text)) return text;
  let out = '';
  let from = 0;
  for (const match of text.matchAll(VERBATIM_GROUP)) {
    if (match.index < from) continue;
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let index = open; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}') {
        depth -= 1;
        if (depth === 0) { close = index; break; }
      }
    }
    if (close < 0) break;
    out += text.slice(from, match.index).replace(FUNCTION_NAME, '\\$1') + text.slice(match.index, close + 1);
    from = close + 1;
  }
  return out + text.slice(from).replace(FUNCTION_NAME, '\\$1');
};

export default resolveMathDisplayFormat;
