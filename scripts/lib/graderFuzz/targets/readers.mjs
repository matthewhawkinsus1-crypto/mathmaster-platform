/*
 * FUZZ TARGET: THE READERS AND DISPLAY HELPERS A TYPED OR AUTHORED VALUE PASSES THROUGH.
 *
 * Before a value is graded or drawn it is read: LaTeX to an expression, an
 * equation to its sides, a relation to its branches, a value to the LaTeX the
 * screen shows or the words a screen reader says. Two kinds of helper:
 *
 *   SAFE       a helper whose callers hand it whatever was typed or saved and
 *              draw the result: it must return for every value. The radical
 *              tools' typedValueLatex and relationLatex (PR #553), the spoken
 *              labels, the answer normalisers, the stored-response reader.
 *              A throw here fails.
 *   PARSER     a parser that refuses text it cannot read BY THROWING
 *              (relationExpressionToLatex, parseEquationInput, ...). Its
 *              callers must catch. A throw here is reported, with the kind of
 *              input, as a map of what each parser refuses: any screen that
 *              calls one on a typed or saved value without a catch is where
 *              the next PR #553 is. Making every render path safe is separate
 *              work (PR #552's branch); this lists, it does not fail.
 *
 * PROPERTIES
 *
 *   never-throws      a SAFE helper returns
 *   parser-refuses    (report only) which input classes each PARSER throws on
 *   stable            the same text, the same reading, asked again
 *   answers-in-time   one reading takes under `slowMs`
 */
import { isDeepStrictEqual } from 'node:util';

import { equationToLatex, expressionToLatex, latexToExpression, parseEquationInput } from '../../../../functions/shared/algebra/algebraAstEngine.mjs';
import { normalizeAnswer, normalizeStructuralMathLive } from '../../../../functions/shared/answerEquivalence.mjs';
import { parseOrderedPair } from '../../../../functions/shared/answerUtils.mjs';
import { writtenNumberLatex } from '../../../../functions/shared/fractionAnswer.mjs';
import { readExactValue } from '../../../../functions/shared/serverGrading/stepAlgebraRadicalGrading.mjs';
import { parseRelationSource, relationExpressionToLatex } from '../../../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { looksLikeLatex } from '../../../../src/mathDisplayFormat.js';
import { spokenMathLabel } from '../../../../src/platform/language/mathSpeechLabel.js';
import { relationLatex, typedValueLatex } from '../../../../src/relationRadicalToolsModel.js';
import { readableStoredResponseLatex } from '../../../../src/tools/graphing2/storedLineText.js';
import { spokenMathValue } from '../../../../src/tools/shared/spokenMathValue.js';
import { errorLine, finding } from '../findings.mjs';
import { FREE_CLASSES, typedInput } from '../inputs.mjs';

export const id = 'readers';

const SAFE = Object.freeze({
  typedValueLatex,
  relationLatex,
  readExactValue,
  spokenMathLabel,
  spokenMathValue,
  readableStoredResponseLatex,
  looksLikeLatex,
  normalizeAnswer,
  normalizeStructuralMathLive,
  parseOrderedPair,
  writtenNumberLatex,
});

const PARSERS = Object.freeze({
  latexToExpression,
  relationExpressionToLatex,
  parseRelationSource,
  parseEquationInput,
  expressionToLatex,
  equationToLatex: (value) => equationToLatex({ left: value, right: '7' }),
});

// Authored givens that have reached students unread, and their neighbours.
const AUTHORED = ['x(x - 5) = 0', '2x + = 7', 'A = Prt', 'C = 2πr', 'Pr', '2πr', '\\frac12', '-\\frac12', '\\sqrt{24}', '\\sqrt[3]{8}', 'sqrt(5x - 1) = 2x - 1', 'x² − 4 = 0', '|x − 3| ≤ 5', '3 < x ≤ 7', 'x = 1 or x = 4', 'y = mx + b', 'f(x) = 2x + 1', '(x + 2)(x − 3)', '1/2 bh', 'x^2 + 5x + 6 = 0'];

export const cases = function* cases({ rng, count, maxLength = 2000 }) {
  for (let index = 0; index < count; index += 1) {
    if (index < AUTHORED.length) { yield { target: id, input: { text: AUTHORED[index], inputClass: 'authored' } }; continue; }
    const input = typedInput(rng, rng.pick(FREE_CLASSES), { maxLength: Math.min(maxLength, 600) });
    yield { target: id, input: { text: input.text, inputClass: input.inputClass } };
  }
};

export const check = async (fuzzCase, { slowMs = 2000 } = {}) => {
  const { text, inputClass } = fuzzCase.input;
  const found = [];
  const report = (property, signature, message, severity) => found.push(finding({ target: id, property, signature, message, repro: fuzzCase, severity }));
  const read = (name, helper, onThrow) => {
    const started = performance.now();
    try {
      return { value: helper(text) };
    } catch (error) {
      onThrow(error);
      return { thrown: true };
    } finally {
      const elapsed = performance.now() - started;
      if (elapsed > slowMs) report('answers-in-time', `${name}/${inputClass}`, `${name} took ${Math.round(elapsed)} ms on a ${text.length}-character ${inputClass} value`);
    }
  };
  for (const [name, helper] of Object.entries(SAFE)) {
    const first = read(name, helper, (error) => report('never-throws', `${name}/${errorLine(error)}`, `${name} threw on ${JSON.stringify(text.slice(0, 80))}: ${error?.message}`));
    if (first.thrown) continue;
    const again = read(name, helper, () => {});
    if (again.thrown || !isDeepStrictEqual(again.value, first.value)) report('stable', name, `${name} read ${JSON.stringify(text.slice(0, 80))} two ways`);
  }
  for (const [name, helper] of Object.entries(PARSERS)) {
    read(name, helper, (error) => report('parser-refuses', name, `${name} throws on a value of class ${inputClass}, ${JSON.stringify(text.slice(0, 80))}: ${error?.message}`, 'report'));
  }
  return found;
};
