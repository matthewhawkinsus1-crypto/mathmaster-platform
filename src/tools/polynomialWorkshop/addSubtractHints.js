/*
 * THE ADD & SUBTRACT HINTS, WRITTEN FOR THE ITEM ON SCREEN (the module 2 walk,
 * 2026-11-06).
 *
 *   addSubtractHints(model) → [first, second, last]     model: addSubtractKey(question)
 *
 * The Workshop's own hint panel showed the same fixed hints on every add and
 * subtract item. "The opposite of a³ is −a³, the opposite of −3a is +3a, and
 * the opposite of 2 is −2." filled in all three of Operations on Polynomials
 * CW 3's "Its opposite" boxes before the last hint, and spoke of a³ on every
 * other item, whatever its letters. The hints are now built from the item's
 * own polynomials, the way the platform's other help is written:
 *
 *   - the first hint asks a question about the step;
 *   - no hint but the last gives a box's answer or does the step: each writes
 *     only terms the problem shows (a term to ask about, a column's two terms);
 *   - the last hint shows the step, once: subtracting, the opposite of every
 *     term; adding, one column combined. The rest stays the student's.
 *
 * Inside a question the panel hands these to the platform's ladder
 * (toolHintChannel.js), which reads them aloud and offers Translate. Like every
 * tool's hints they are English until the Spanish review (AX07), so Translate
 * says it has no Spanish for them, as it did before. Pure: no React.
 */
import { columnPlainText, polynomialTermsPlainText, termPlainText } from './polynomialMath.js';

const negate = (term) => ({ ...term, coefficient: -term.coefficient });
// "−a³, 3a and −2".
const listed = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
// One term added to another: "−9x + (−5x)", "4x² + 2x²".
const sumText = (left, right) => `${termPlainText(left)} + ${right.coefficient < 0 ? `(${termPlainText(right)})` : termPlainText(right)}`;

/*
 * The term of the subtracted polynomial to ask about: the first after its
 * leading term that is negative (the walk's slip: the opposite of −3a left as
 * −3a), else the one after the leading term, since changing only the first
 * sign is the common error.
 */
const termToAskAbout = (second) => second.slice(1).find((term) => term.coefficient < 0) || second[1] || second[0];

const subtractHints = (model) => {
  const second = polynomialTermsPlainText(model.second);
  if (model.second.length === 1) {
    const opposite = termPlainText(negate(model.second[0]));
    return [
      `Subtracting ${second} is the same as adding its opposite. What is the opposite of ${second}?`,
      `Which column does the opposite of ${second} go in? Then add down each column.`,
      `The opposite of ${second} is ${opposite}. Now add down each column.`,
    ];
  }
  const opposites = model.second.map((term) => termPlainText(negate(term)));
  return [
    `What does the minus sign in front of (${second}) do to each of its terms: change only the first one, or every one?`,
    `What is the opposite of ${termPlainText(termToAskAbout(model.second))}? Write the opposite of every term of ${second}, each in its own column, then add down each column.`,
    `Every term of ${second} changes sign, so its opposites are ${listed(opposites)}. Now add down each column.`,
  ];
};

/*
 * The column to talk about when adding: one with a term from each polynomial,
 * a column of letters before the constants, and where the signs need care
 * (the terms' signs differ, or both are negative) before one where they do not.
 */
const columnToCombine = (model) => {
  const pairs = model.columns.map((column, index) => ({ column, first: model.firstByColumn[index], second: model.secondByColumn[index], sum: model.sums[index] }))
    .filter((pair) => pair.first && pair.second);
  const careful = (pair) => pair.first.coefficient < 0 || pair.second.coefficient < 0;
  const letters = (pair) => Boolean(pair.column.signature);
  return pairs.find((pair) => letters(pair) && careful(pair)) || pairs.find(letters) || pairs.find(careful) || pairs[0] || null;
};

const addHints = (model) => {
  const first = polynomialTermsPlainText(model.first);
  const second = polynomialTermsPlainText(model.second);
  const ask = `Which terms of ${first} and ${second} are like terms, with the same letters and the same exponents?`;
  const pair = columnToCombine(model);
  if (!pair) {
    return [
      ask,
      'Does any column hold a term from both polynomials? What happens to a term that has no like term?',
      'No two of these terms are like terms, so none of them combine: each term stays as it is in the result.',
    ];
  }
  const sum = sumText(pair.first, pair.second);
  // Asked without writing the sum: "4x² + (−2x²)" is the Combined box's
  // answer, not yet simplified, so only the last hint writes it.
  const signQuestion = pair.sum.coefficient === 0 ? 'What do their coefficients add up to?' : 'Will their sum be positive or negative?';
  if (!pair.column.signature) {
    return [
      ask,
      `In the constants column, which numbers do you add? ${signQuestion}`,
      `Add the numbers, watching the signs: ${sum} = ${termPlainText(pair.sum)}. A term with no like term stays as it is.`,
    ];
  }
  return [
    ask,
    `In the ${columnPlainText(pair.column)} column, do you add the coefficients of ${termPlainText(pair.first)} and ${termPlainText(pair.second)}, or their exponents? ${signQuestion}`,
    `Keep the letters and the exponents, and add the coefficients, watching the signs: ${sum} = ${termPlainText(pair.sum)}. Combine each other column the same way.`,
  ];
};

/** The panel's hints for an add or subtract item; none when it cannot be drawn. */
export const addSubtractHints = (model) => {
  if (!model || !Array.isArray(model.second) || !model.second.length) return [];
  return model.operation === 'subtract' ? subtractHints(model) : addHints(model);
};

export default addSubtractHints;
