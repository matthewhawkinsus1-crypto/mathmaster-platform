// Figure matching (the pure half) moved to functions/shared/toolMath/workflow/figureMatch.mjs
// so the server grades composed workflows with the same code the browser runs
// (server-authoritative grading parity). This shim keeps every existing src
// import path working.
export * from '../../../functions/shared/toolMath/workflow/figureMatch.mjs';

/*
 * A LONG EQUATION ON A FIGURE CARD BREAKS AT ITS EQUALS SIGN.
 *
 * Typeset math does not wrap, and a card is about 310 px wide: "9x − 2(3x + 1)
 * + 7 = −4(2x − 2) + 2(2x − 3)" was cut off after "+ 2(2" (walkthrough
 * 2026-10-23, Solving Linear Equations CW 14). An equation longer than a card
 * line is set as a textbook sets it: the left side, then "= right side" under
 * it. Only a single top-level "=" splits; an inequality, a list or anything
 * inside braces stays whole.
 */
export const FIGURE_EQUATION_LINE_CHARS = 26;

export const figureEquationLines = (math) => {
  const text = String(math ?? '').trim();
  if (text.length <= FIGURE_EQUATION_LINE_CHARS || /[<>≤≥≠]|\\[lg]eq?\b|\\neq\b/.test(text)) return [text];
  let depth = 0;
  const splits = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '=' && depth === 0) splits.push(index);
  }
  if (splits.length !== 1) return [text];
  const left = text.slice(0, splits[0]).trim();
  const right = text.slice(splits[0] + 1).trim();
  return left && right ? [left, `= ${right}`] : [text];
};
