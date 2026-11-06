/*
 * A LINE BREAK THE AUTHOR WROTE IS A LINE BREAK (platform-polish-3;
 * F-PROMPT-LINES in the 2026-11-06 Algebra I M3 T2 walkthrough).
 *
 * A prompt written as a list, one system or one step per line, ran together
 * on the task card: HTML shows a line break as a space, so "System A: … and
 * 6x − 2y = a⏎System B: …" read "…6x − 2y = a System B: …", the parameter a
 * running into the next line's label, and an error analysis's four steps were
 * one line. The task card (QuestionPrompt) now breaks the line there. Read
 * aloud pauses there (speechText.js lineBreaksAsPauses).
 *
 * A run of breaks, a blank line among them, is one break: bank items put a
 * blank line around a table or a list of choices, and a blank line on a
 * phone's task card is space the work does not have. A break at either end
 * of the prompt shows nothing. A prompt with no line break is unchanged.
 */

const BREAK = /[^\S\n]*\n\s*/;

/** The prompt without line breaks at its ends: they would draw an empty line. */
export const withoutOuterLineBreaks = (text) => {
  const value = String(text ?? '');
  return value.includes('\n') ? value.replace(/^\s*\n\s*/, '').replace(/\s*\n\s*$/, '') : value;
};

/** A piece of prose as its lines, one entry per line (one entry when it has no line break). */
export const proseLines = (text) => {
  const value = String(text ?? '');
  return value.includes('\n') ? value.split(BREAK) : [value];
};
