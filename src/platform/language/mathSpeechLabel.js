/*
 * WHAT A SCREEN READER SAYS FOR RENDERED MATHEMATICS.
 *
 * MathDisplay used to label every expression "Mathematical expression". That
 * label replaced MathLive's own speech, and the element still exposed two more
 * copies underneath it — the LaTeX source ("\frac{1}{2}bh") and MathLive's
 * MathML ("12b⁢h") — so a screen-reader student heard a placeholder followed
 * by backslash commands, three times per expression, and never the math.
 *
 * Now the rendered math is hidden from assistive technology and ONE spoken
 * copy sits beside it, made by the same math-to-speech Read Aloud uses
 * (./speechText.js): "y equals negative 2 over 3 x plus 4". It reads inline
 * with the prose around it ("Solve … now."), not as an image.
 *
 * An authored label still wins, but it is spoken the same way: many callers
 * pass program syntax ("2 * x") or raw LaTeX ("Given equation \frac{1}{2}x"),
 * and a label must say what the screen shows, in words — never more. The
 * placeholders that told a student nothing are treated as no label.
 */
import { mathToSpeech, speechTextFor } from './speechText.js';

const PLACEHOLDER_LABELS = new Set(['mathematical expression', 'math', 'expression', 'fraction expression', 'equation']);

const isPlaceholder = (label) => PLACEHOLDER_LABELS.has(String(label).trim().toLowerCase());

/** Speech for an authored label that may contain math in program syntax or LaTeX. */
export const spokenMathLabel = (label, { language = 'en' } = {}) => {
  const text = String(label ?? '').trim();
  if (!text) return '';
  // A label that is nothing but math ("2 * x", "-3", "\frac{1}{2}") is
  // spoken whole; prose with math in it keeps its words.
  if (!/[A-Za-z]{3,}/.test(text.replace(/\\[A-Za-z]+/g, ''))) return mathToSpeech(text, { language });
  // Prose around raw LaTeX ("Given equation \frac{1}{2}x"): the LaTeX
  // reader leaves words alone, and prose detection cannot see undelimited TeX.
  if (/\\[A-Za-z]/.test(text)) return mathToSpeech(text, { language });
  return speechTextFor(text, { language })
    // "Given point (2, -3)": the label already said "point".
    .replace(/\b(point|punto) (?:the point|el punto)\b/gi, '$1');
};

/**
 * The one spoken copy of a rendered expression. `value` is what MathDisplay
 * typesets; `ariaLabel` the caller's label, if any.
 */
export const mathSpeechLabel = ({ value, ariaLabel = null, language = 'en' } = {}) => {
  if (ariaLabel != null && String(ariaLabel).trim() && !isPlaceholder(ariaLabel)) {
    return spokenMathLabel(ariaLabel, { language });
  }
  const text = String(value ?? '').trim();
  return text ? mathToSpeech(text, { language }) : '';
};
