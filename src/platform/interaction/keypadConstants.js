/*
 * π, e AND logₐ ONLY WHERE THE ITEM'S MATH USES THEM (TL23; walkthrough D-54).
 *
 * Every answer keypad carried π, e and logₐ, so an Algebra I student writing
 * f(x) = 6x read past three keys the item never needs, on a phone pad that is
 * already six rows deep. A question now tells its keypads which of the three
 * its mathematics uses, and the others are left off.
 *
 * "Uses" is read from the WHOLE item — prompt, givens, every accepted answer,
 * the worked solution — never from what the student has typed, and it errs on
 * keeping a key: any π, \pi or "pi"; any e standing alone (e^x, 2e, a variable
 * named e, "e.g." in a sentence); any log, ln or "logarithm". So a key an
 * answer needs is never taken away (solve 3^x = 20: its key log_3(20) keeps
 * logₐ). What a field declares it needs (`requiredSymbols`) is untouched.
 *
 * Only where help is allowed and outcomes are shown (practice): there a key
 * appearing for "the answer has π in it" is no more than the platform already
 * gives. An assessment item keeps every key, so the keypad says nothing about
 * the answer's form. A host with no question (a teacher's bench, a secure
 * field outside QuestionEngine) gives no answer, and every key stays.
 */
import { createContext, createElement, useContext } from 'react';

// Not math the student writes, so not read: hex colours (#1a73e8), numbers in
// scientific notation, ids ("id": "e1"), and a generator's {{placeholders}},
// which become numbers before a student sees them. They could only ever keep
// a key, never drop one.
const NOT_MATH = /#[0-9a-f]{3,8}(?![0-9a-z])|\d(?:\.\d+)?e[-+]?\d|"(?:id|key|questionId|variantId|templateId)"\s*:\s*"[^"]*"|\{\{[^}]*\}\}/gi;

const PI = /π|(?<![A-Za-z])pi(?![A-Za-z])/i;
// e standing alone (not a letter or a backslash before it, as in \sec; not a
// letter after it), e raised to a power wherever it stands (A = Pe^{rt}),
// e written upright, exp, and the words that name it.
const E = /(?<![A-Za-z\\])e(?![A-Za-z])|e\s*\^|\\mathrm\{e\}|(?<![A-Za-z])exp(?![A-Za-z])|euler|natural (?:log|base)|continuous(?:ly)? compound/;
const LOG = /(?<![A-Za-z])(?:log|ln)(?![A-Za-z])|logarithm/i;

/**
 * { pi, e, log } — which of the three keys this question's math uses — or null
 * when there is no question to read (then every key stays).
 */
export const keypadConstantsFor = (question) => {
  if (!question || typeof question !== 'object') return null;
  let text;
  try {
    text = JSON.stringify(question);
  } catch {
    return null;
  }
  if (!text) return null;
  const math = text.replace(NOT_MATH, ' ');
  return Object.freeze({ pi: PI.test(math), e: E.test(math), log: LOG.test(math) });
};

/** Keys tagged `constant: 'pi' | 'e' | 'log'` that `constants` says the item does not use, left off. */
export const keysForConstants = (keys, constants) => (
  constants ? keys.filter((key) => !key?.constant || constants[key.constant] === true) : keys
);

const KeypadConstantsContext = createContext(null);

export const KeypadConstantsProvider = ({ constants = null, children }) => (
  createElement(KeypadConstantsContext.Provider, { value: constants }, children)
);

export const useKeypadConstants = () => useContext(KeypadConstantsContext);
