/*
 * THE AREA MODEL'S HINTS, WRITTEN FOR THE ITEM ON SCREEN (display and reading
 * polish, after the Add & Subtract hints: addSubtractHints.js).
 *
 *   areaModelHints(model)            → [first, second, last]   model: areaModelKey(question)
 *   coefficientAreaHints(left, right) → [first, second, last]  two binomials in x, as coefficient lists
 *
 * The area model showed the same fixed hints on every item. The second, "a² ·
 * 3a = 3a³, because a² · a = a³", filled in Operations on Polynomials CW 10's
 * first cell, (a² + 3a − 4)(a + 2), before the last hint, and spoke of a on
 * items in x, y and m; the binomial view opened with "An area model is just
 * organised distribution" on Algebra II Honors L4 CW 3, which has no hints of
 * its own. The hints are now built from the item's own factors, as the Add &
 * Subtract hints are:
 *
 *   - the first asks a question about the step, with the item's factors;
 *   - no hint but the last gives a cell's or a box's answer: before it, a hint
 *     writes a cell only as the cell's own label does ("(−4) · a"), never what
 *     it comes to;
 *   - the last works one cell out, once, and says which cells combine. The
 *     rest stays the student's. (The binomial view's last says the step in
 *     words: see coefficientAreaHints.)
 *
 * The cell worked is the one where the step needs most care: two terms with
 * letters (their exponents add) and a negative sign, else a number to multiply
 * as well as letters, else a sign. Inside a question the panel hands these to
 * the platform's ladder (toolHintChannel.js), which reads them aloud and offers
 * Translate; like every tool's hints they are English until the Spanish review
 * (AX07). Pure: no React.
 */
import { columnPlainText, polynomialTermsPlainText, termPlainText } from './polynomialMath.js';
import { polynomialReadoutText } from './polynomialReadout.js';

// "(−4)", "a": a term as a factor in a cell's label (PolynomialWorkshop.jsx's factorLatex).
const factorText = (term) => (term.coefficient < 0 ? `(${termPlainText(term)})` : termPlainText(term));
// The label the cell itself shows: "(−4) · a".
const cellLabel = ({ row, column }) => `${factorText(row)} · ${factorText(column)}`;
const lettersOf = (terms) => [...new Set(terms.flatMap((term) => Object.keys(term.powers)))].sort();
// "the exponents of a", or "the exponents of each letter" for two.
const exponentsOf = (letters) => (letters.length === 1 ? `the exponents of ${letters[0]}` : 'the exponents of each letter');
const listed = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const signWord = (value) => (value < 0 ? 'a negative' : 'a positive');
// "a positive times a negative is negative", in the order the cell multiplies.
const signRule = (left, right) => `${signWord(left)} times ${signWord(right)} is ${(left < 0) === (right < 0) ? 'positive' : 'negative'}`;

const pairsOf = (model) => model.rows.flatMap((row, r) => model.columns.map((column, c) => ({ row, column, cell: model.cells[r * model.columns.length + c] })));
const lettered = (pair) => Boolean(pair.row.signature && pair.column.signature);
const signed = (pair) => pair.row.coefficient < 0 || pair.column.coefficient < 0;
const counted = (pair) => Math.abs(pair.row.coefficient) !== 1 || Math.abs(pair.column.coefficient) !== 1;
const cellToWork = (model) => {
  const pairs = pairsOf(model);
  return pairs.find((pair) => lettered(pair) && signed(pair))
    || pairs.find((pair) => lettered(pair) && counted(pair))
    || pairs.find(lettered) || pairs.find(signed) || pairs[0];
};

// The question about the cell to work, asked without its product.
const cellQuestion = (pair, letters) => {
  const label = cellLabel(pair);
  const own = lettersOf([pair.row, pair.column]);
  const power = own.length === 1 ? `what power of ${own[0]} does it have` : 'what exponent does each letter have';
  if (signed(pair)) return lettered(pair) ? `Is ${label} positive or negative, and ${power}?` : `Is ${label} positive or negative?`;
  if (lettered(pair)) return `What power of ${letters.length === 1 ? letters[0] : 'each letter'} does ${label} have, and what number is in front of it?`;
  if (own.length) return `What coefficient does ${label} have?`;
  return `What number is ${label}?`;
};

// Each kind of term two or more cells share, with what the cells add to.
const likeGroups = (model) => {
  const groups = new Map();
  model.cells.forEach((cell) => {
    const group = groups.get(cell.signature) || { kind: cell, count: 0, total: 0 };
    groups.set(cell.signature, { ...group, count: group.count + 1, total: group.total + cell.coefficient });
  });
  return [...groups.values()];
};
// "the a² cells", "the constant cells".
const kindText = (group) => `the ${columnPlainText(group.kind)} cells`;

/** The area model's hints for an item written with `leftFactor` / `rightFactor`; none when it cannot be drawn. */
export const areaModelHints = (model) => {
  if (!model || !Array.isArray(model.rows) || !model.rows.length || !Array.isArray(model.columns) || !model.columns.length) return [];
  const left = polynomialTermsPlainText(model.rows);
  const right = polynomialTermsPlainText(model.columns);
  const letters = lettersOf([...model.rows, ...model.columns]);
  const pair = cellToWork(model);
  const each = model.rows.length === 1 ? `Each cell multiplies ${left} by one term of ${right}.`
    : model.columns.length === 1 ? `Each cell multiplies one term of ${left} by ${right}.`
      : `Each cell multiplies a term of ${left} by a term of ${right}.`;
  const groups = likeGroups(model);
  const alike = groups.filter((group) => group.count > 1);
  const rule = lettered(pair) ? `multiply the coefficients and add ${exponentsOf(lettersOf([pair.row, pair.column]))}`
    : pair.row.signature || pair.column.signature ? 'multiply the coefficients and keep the letters' : 'multiply the numbers';
  const sign = signed(pair) ? `, and ${signRule(pair.row.coefficient, pair.column.coefficient)}` : '';
  const combine = !alike.length
    ? 'No two cells are like terms, so the product is all the cells added together.'
    : `Then add the cells that are like terms, ${listed(alike.map(kindText))}${alike.length < groups.length ? ', and keep each other cell as it is' : ''}.${alike.some((group) => Math.abs(group.total) < 1e-9) ? ' Like terms that add to 0 drop out of the product.' : ''}`;
  return [
    `${each} Do you multiply or add their coefficients, and do you multiply or add ${exponentsOf(letters)}?`,
    `${cellQuestion(pair, letters)} Once every cell is filled in, which cells have the same letters with the same exponents?`,
    `${cellLabel(pair)} = ${termPlainText(pair.cell)}: ${rule}${sign}. ${combine}`,
  ];
};

/*
 * The binomial view: (ax + b)(cx + d) with a box for each cell's signed
 * coefficient (the cell shows its power of x) and the expanded polynomial as
 * a coefficient list. Every one of those numbers is an answer the platform's
 * leak guard reads (questionAnswerValues), so a hint that wrote one, even the
 * last, would be held back: these name a cell by what it holds ("the x²
 * cell") and write no number the factors do not show.
 */
export const coefficientAreaHints = (left, right) => {
  const [a, b] = (Array.isArray(left) ? left : []).map(Number);
  const [c, d] = (Array.isArray(right) ? right : []).map(Number);
  if (![a, b, c, d].every(Number.isFinite)) return [];
  const negative = [a, b, c, d].some((value) => value < 0);
  // The sign rules this item's cells use: one negative, two.
  const products = [[a, c], [a, d], [b, c], [b, d]];
  const signs = [
    products.some(([row, column]) => (row < 0) !== (column < 0)) ? 'a negative times a positive is negative' : '',
    products.some(([row, column]) => row < 0 && column < 0) ? 'a negative times a negative is positive' : '',
  ].filter(Boolean);
  const middle = 'Which two cells hold x terms? Their coefficients add to make the expanded polynomial\'s middle number.';
  return [
    `Each cell multiplies a term of ${polynomialReadoutText([a, b])} by a term of ${polynomialReadoutText([c, d])}, and its box holds that product's signed coefficient. Do you add or multiply the two terms' coefficients?`,
    negative ? `Which cells multiply by a negative term, and what sign does each of those products have? ${middle}` : middle,
    `The x² cell multiplies the two x terms, the constant cell the two numbers, and each x cell an x term by a number: multiply their coefficients${signs.map((rule) => `, and ${rule}`).join('')}. Then add the two x cells' coefficients for the middle number, and list the numbers from x² down to the constant, with a zero for any power that cancels.`,
  ];
};

export default areaModelHints;
