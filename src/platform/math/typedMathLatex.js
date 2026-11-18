/*
 * DRAWING WHAT A STUDENT TYPED, WITHOUT EVER THROWING.
 *
 * Nov 16, 2026, Solving Radical Equations (Step Algebra): a value typed in a
 * check arrived from the math box as MathLive's LaTeX ("\frac12", "\sqrt{36}")
 * and was drawn through relationExpressionToLatex, which parses relation TEXT
 * and throws on any LaTeX command. It threw inside render, the question module
 * crashed, and because the value was in the saved draft it crashed again on
 * every reload (#553, which fixed the radical panels).
 *
 * expressionToLatex, equationToLatex and relationExpressionToLatex parse what
 * they are given with mathjs, so text they cannot read — LaTeX, a half-typed
 * "2x +", a bracket the student closed before opening it, an answer longer
 * than the parser takes — is an exception. Where such text is something the
 * student typed (or the board kept from what they typed), it is drawn through
 * here instead: drawn the same way when it can be read, and shown as written
 * when it cannot — LaTeX as the LaTeX it is, anything else as text.
 *
 * Drawing only. Nothing here reads, checks or grades a value.
 */
import { equationToLatex, expressionToLatex } from '../../algebraAstEngine.js';

const LATEX_COMMAND = /\\[A-Za-z]/;

/** Text as LaTeX text: what it says, with the characters TeX would read as commands left out. */
export const latexText = (text) => `\\text{${String(text ?? '').replace(/[\\{}$%#&_^~]/g, '')}}`;

/** `convert(value)` when it can draw the value; otherwise the value as written. Never throws. */
export const latexOrAsWritten = (convert, value) => {
  const text = String(value ?? '');
  try {
    return String(convert(text));
  } catch {
    return LATEX_COMMAND.test(text) ? text : latexText(text);
  }
};

/** A value typed in a math box: LaTeX already ("\frac12"), or plain text drawn by `convert` ("1/2"). Never throws. */
export const typedLatex = (value, convert = expressionToLatex) => {
  const text = String(value ?? '').trim();
  return LATEX_COMMAND.test(text) ? text : latexOrAsWritten(convert, text);
};

/** An expression as classroom LaTeX, or as written when it cannot be read. Never throws. */
export const expressionLatexOrText = (expression) => latexOrAsWritten(expressionToLatex, expression);

/** `left = right`, each side as expressionLatexOrText draws it. Never throws. */
export const equationLatexOrText = (equation) => {
  try {
    return equationToLatex(equation);
  } catch {
    return `${expressionLatexOrText(equation?.left)} = ${expressionLatexOrText(equation?.right)}`;
  }
};
