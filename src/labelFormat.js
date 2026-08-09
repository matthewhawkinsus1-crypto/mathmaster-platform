// Labels written by a teacher or an AI are usually English — "Reasonable
// domain", "Discrete or continuous?" — but they are sometimes pure math —
// "f(x)", "x", "2x + 1". Feeding English to the math typesetter mangles it:
// spaces vanish and words become juxtaposed variables, so "Discrete or
// continuous?" renders as "Discrete ∨ continuous?" with "or" read as logical
// disjunction. Feeding math to a plain-text renderer only costs italics.
//
// So the default is plain text, and math rendering is used only when the label
// contains no ordinary word.

// Two or more letters in a row, not immediately part of a function call like
// f(x) or a unit-free symbol. Anything matching is treated as an English word.
const ENGLISH_WORD = /[A-Za-z]{2,}/g;

// Words that are mathematical even though they are spelled out.
const MATH_WORDS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'exp', 'sqrt', 'abs',
  'max', 'min', 'lim', 'pi', 'inf', 'infinity', 'dx', 'dy', 'dt',
]);

export const labelLooksLikeMath = (label) => {
  const text = String(label ?? '').trim();
  if (!text) return false;
  const words = text.match(ENGLISH_WORD) || [];
  return words.every((word) => MATH_WORDS.has(word.toLowerCase()));
};

/**
 * Resolve how a label should be rendered.
 * `latexFlag` is the legacy `field.labelLatex`; `explicitFormat` is an author's
 * `labelFormat` override. Returns null when the label should stay plain text.
 */
export const resolveLabelFormat = (label, { latexFlag = false, explicitFormat = null } = {}) => {
  if (latexFlag) return 'latex';
  if (explicitFormat) return explicitFormat;
  return labelLooksLikeMath(label) ? 'ascii-math' : null;
};
