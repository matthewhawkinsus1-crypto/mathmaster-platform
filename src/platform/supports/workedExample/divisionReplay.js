/*
 * THE SYNTHETIC AND LONG DIVISION REPLAY (WE-I; docs/platform/WORKED_EXAMPLES.md
 * sections 4 and 9).
 *
 * A worked example for a question the student answers in the Polynomial
 * Workshop's division views plays as that view's own work, one move per
 * slide:
 *
 *   syntheticDivision  (Dividing Polynomials, a divisor ax + b written as
 *                      text): divide through by a first when a ≠ 1; r in the
 *                      box and the coefficient row, a 0 for every missing
 *                      power; bring down; one slide per column (multiply by
 *                      r, add); read the quotient and the remainder; the
 *                      remainder over the original divisor when a ≠ 1; the
 *                      answer as quotient + remainder ÷ divisor.
 *   synthetic          (Remainder and Factor Theorems, coefficients in x and
 *                      a number r): the same table, then what the item asks
 *                      of it: P(r) is the remainder (the Remainder Theorem),
 *                      the depressed polynomial, and whether x − r is a factor
 *                      (the Factor Theorem).
 *   longDivision       (Dividing Polynomials, text): per round, divide the
 *                      leading terms, multiply back, subtract and bring down;
 *                      then the quotient, the remainder and the answer.
 *
 * EVERY LINE COMES FROM THE TOOL'S OWN ENGINE. The numbers on a slide are the
 * view's own key (polynomialMath.mjs: syntheticDivisionKey, longDivisionKey,
 * and the synthetic table, `syntheticDivision`), written with its own writers
 * (exactPolynomialLatex, ratioLatex, placeholderPolynomialLatex). The work a
 * student who divided the sibling correctly would send (divisionKeyWork, or
 * the table's cells) is handed to the workshop's own grader
 * (serverGrading/tools/polynomialWorkshop.mjs, the one the browser, the
 * question and the server run). Work the grader does not mark correct is
 * REFUSED: replayDivisionExample returns { ok: false, error } and nothing is
 * played. No line of mathematics is written anywhere else.
 *
 * THE SIBLING (divisionSiblingFor): the same view and the same kind of
 * division with other numbers. It keeps the letter, the dividend's degree and
 * which of its powers are missing (so the 0 placeholder is there exactly where
 * the item needs one), whether the divisor's leading coefficient is 1, −1 or
 * another number (so the "divide through by a first" slide is there exactly
 * where the item's is), the sign of r, and what a Remainder and Factor
 * Theorems item asks. Its dividend is never the item's.
 *
 * WHAT IT DOES NOT KEEP: the item's remainder. Whether a division comes out
 * even is part of its answer, so the example never says (as the plane
 * replay's system always crosses once). A division the item answers with a
 * quotient and a remainder always has a remainder that is not 0. An item
 * that asks whether x − r is a factor gets a sibling where it is (so there is
 * a depressed polynomial to read), and the factor slide says what a remainder
 * that is not 0 would have meant.
 *
 * A step carries `board`: its lines in words and numbers, and for synthetic
 * division `board.synthetic`, the table so far (the player draws it as a
 * table with named rows, so nothing rests on its layout alone).
 */
import {
  divisionKeyWork,
  exactPolynomialLatex,
  exactPolynomialPlainText,
  exactPolynomialTyped,
  exactTermLatex,
  longDivisionKey,
  placeholderPolynomialLatex,
  powerName,
  ratioLatex,
  ratioPlainText,
  ratioTyped,
  ratioValue,
  syntheticAsks,
  syntheticDivision as syntheticTable,
  syntheticDivisionKey,
  syntheticRemainderDivisor,
} from '../../../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import polynomialWorkshopGrader from '../../../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';

export const DIVISION_REPLAY_TOOL = Object.freeze({ SYNTHETIC: 'syntheticDivision', THEOREMS: 'synthetic', LONG: 'longDivision' });
export const DIVISION_BOARD = Object.freeze({ MOVE: 'move', READ: 'read', ANSWER: 'answer' });

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const refused = (error) => ({ ok: false, error });

/* ---------------------------------------------------------------- numbers */

// The engine's exact numbers are { n, d }; the Remainder and Factor Theorems
// table works in plain numbers. A whole number as an exact one, for its writers.
const exact = (value) => {
  if (isObject(value) && Number.isInteger(value.n) && Number.isInteger(value.d)) return value;
  const number = Number(value) + 0;
  return Object.freeze({ n: number, d: 1 });
};
const entriesOf = (coefficients) => coefficients.map((coefficient, index) => ({ coefficient: exact(coefficient), power: coefficients.length - 1 - index }));
const numberLatex = (value) => ratioLatex(exact(value));
const isZero = (value) => ratioValue(exact(value)) === 0;
// A number as one more term of a sum ("+ 3", "- 4"), and as a factor ("(-4)").
const plusLatex = (latex) => (latex.startsWith('-') ? `- ${latex.slice(1)}` : `+ ${latex}`);
const factorLatex = (latex) => (latex.startsWith('-') ? `(${latex})` : latex);
const polyLatex = (coefficients, letter) => exactPolynomialLatex(entriesOf(coefficients), letter);
const linearLatex = (leading, constant, letter) => exactPolynomialLatex([{ coefficient: exact(leading), power: 1 }, { coefficient: exact(constant), power: 0 }], letter);
// x − r, with r exact: "x - 3", "x + \frac{1}{2}".
const xMinusLatex = (r, letter) => linearLatex(1, exact({ n: -exact(r).n, d: exact(r).d }), letter);

/* ------------------------------------------------------------- the grader */

const graded = (question, work) => {
  let result;
  try {
    result = polynomialWorkshopGrader.grade(question, work);
  } catch {
    return false;
  }
  return result?.isCorrect === true;
};

/* -------------------------------------------------------- the pictures */

const line = (id, name, latex, result = false) => ({ id, name, latex, ...(result ? { result: true } : {}) });
const stepOf = ({ op, label, why, show, lines, kind = DIVISION_BOARD.MOVE, synthetic = null }) => ({
  show,
  why,
  board: { kind, operation: op, label, lines, ...(synthetic ? { synthetic } : {}) },
});

export const DIVISION_WHY = Object.freeze({
  scale: 'Synthetic division divides by x − r, whose leading coefficient is 1. Dividing the dividend and the divisor by the same number leaves the quotient the same.',
  setUp: 'The divisor x − r is 0 when x = r, so r goes in the box. Each column holds one power, highest first; a missing power gets a 0 so every column stays in its place.',
  bringDown: 'Nothing has been added to the first column yet, so its number comes straight down. It is the quotient’s leading coefficient.',
  column: 'Multiplying by r and adding does one round of long division in a single column: the product is what the divisor takes away there.',
  last: 'The last column is the constant column. What is left after it cannot be divided by x − r again, so it is the remainder.',
  read: 'Dividing by x lowers every power by one, so the bottom row (all but its last number) is the quotient, starting one power below the dividend.',
  unscale: 'The table divided by x − r, which is the divisor divided by a. Multiplying the table’s remainder by a gives the remainder over the divisor as it was written.',
  answer: 'Dividend = divisor × quotient + remainder, so dividing by the divisor gives the quotient plus the remainder over the divisor.',
  remainderTheorem: 'The Remainder Theorem: dividing P(x) by x − r leaves the remainder P(r), because P(x) = (x − r)Q(x) + R and x − r is 0 at x = r.',
  depressed: 'The bottom row, all but the remainder, is the quotient: the polynomial left once x − r is divided out, one degree lower.',
  factorYes: 'The Factor Theorem: x − r is a factor exactly when the remainder is 0. Here it is 0. A remainder that is not 0 would mean x − r is not a factor.',
  divide: 'Divide the leading term of what is left by the divisor’s leading term: that is the next term of the quotient.',
  multiply: 'Multiply that quotient term by the whole divisor, so it can be taken away.',
  subtract: 'Subtract, so the leading term cancels, then bring down the next term to keep going.',
  stop: 'What is left has a lower degree than the divisor, so it cannot be divided again: it is the remainder.',
});

// The synthetic table so far: every column named by its power, a cell blank until it is filled.
const tableOf = ({ rLatex, columns, top, middle, bottom, filled, remainderShown }) => ({
  r: rLatex,
  columns,
  top,
  middle: middle.map((value, index) => (index + 1 < filled ? value : '')),
  bottom: bottom.map((value, index) => (index < filled ? value : '')),
  remainder: remainderShown === true,
});

/* ------------------------------------------- synthetic: the table's slides */

const syntheticSteps = ({ letter, r, coefficients, products, bottom }) => {
  const n = coefficients.length - 1;
  const rLatex = numberLatex(r);
  const columns = coefficients.map((_, index) => powerName(n - index, letter));
  const topLatex = coefficients.map(numberLatex);
  const middleLatex = products.map(numberLatex);
  const bottomLatex = bottom.map(numberLatex);
  const table = (filled, remainderShown = false) => tableOf({ rLatex, columns, top: topLatex, middle: middleLatex, bottom: bottomLatex, filled, remainderShown });
  const steps = [];
  const missing = coefficients.map((value, index) => (isZero(value) ? powerName(n - index, letter) : null)).filter(Boolean);
  steps.push(stepOf({
    op: 'setUp',
    label: 'Set up the table',
    why: DIVISION_WHY.setUp,
    show: `The divisor is $${xMinusLatex(r, letter)}$, so $r = ${rLatex}$ goes in the box. Write the dividend’s coefficients from the highest power down: $${placeholderPolynomialLatex(coefficients.map(exact), letter)}$${missing.length ? `, a 0 for the missing ${missing.join(' and ')} term` : ''}.`,
    lines: [line('box', 'In the box: r', rLatex), line('top', 'Coefficient row', topLatex.join(',\\ '), true)],
    synthetic: table(0),
  }));
  steps.push(stepOf({
    op: 'bringDown',
    label: 'Bring down the first coefficient',
    why: DIVISION_WHY.bringDown,
    show: `Bring the first coefficient, $${bottomLatex[0]}$, straight down to the bottom row.`,
    lines: [line('down', 'Bottom row, column 1', bottomLatex[0], true)],
    synthetic: table(1),
  }));
  for (let column = 1; column <= n; column += 1) {
    const isLast = column === n;
    steps.push(stepOf({
      op: isLast ? 'remainder' : 'column',
      label: `Column ${column + 1} (${columns[column]}): multiply by r, then add`,
      why: isLast ? DIVISION_WHY.last : DIVISION_WHY.column,
      show: `Multiply $r = ${rLatex}$ by $${bottomLatex[column - 1]}$: $${rLatex} \\cdot ${factorLatex(bottomLatex[column - 1])} = ${middleLatex[column - 1]}$. Write it under $${topLatex[column]}$ and add: $${topLatex[column]} ${plusLatex(middleLatex[column - 1])} = ${bottomLatex[column]}$.${isLast ? ` The last number, $${bottomLatex[column]}$, is the remainder.` : ''}`,
      lines: [
        line('product', 'Multiply r by the bottom number before it', `${rLatex} \\cdot ${factorLatex(bottomLatex[column - 1])} = ${middleLatex[column - 1]}`),
        line('sum', isLast ? 'Add down the column: the remainder' : 'Add down the column', `${topLatex[column]} ${plusLatex(middleLatex[column - 1])} = ${bottomLatex[column]}`, true),
      ],
      synthetic: table(column + 1, isLast),
    }));
  }
  return { steps, table };
};

/* ------------------------------------------- syntheticDivision (text mode) */

const syntheticTextReplay = (question) => {
  const key = syntheticDivisionKey(question);
  if (!key) return refused('the division view cannot draw it.');
  const { letter, dividend, divisor } = key;
  const n = dividend.degree;
  const dividendLatex = exactPolynomialLatex(entriesOf(dividend.coefficients), letter);
  const divisorLatex = linearLatex(divisor.coefficients[0], divisor.coefficients[1], letter);
  const quotientLatex = exactPolynomialLatex(key.quotient, letter);
  const work = divisionKeyWork(question);
  if (!work || !graded(question, work)) return refused('the division view does not mark its work right.');
  const steps = [];
  if (key.scaled) {
    const scaledDividend = exactPolynomialLatex(entriesOf(key.coefficients), letter);
    steps.push(stepOf({
      op: 'scale',
      label: `Divide the dividend and the divisor by ${ratioTyped(key.leading)}`,
      why: DIVISION_WHY.scale,
      show: `The divisor $${divisorLatex}$ has leading coefficient $${numberLatex(key.leading)}$. Divide both by $${numberLatex(key.leading)}$: the problem becomes $(${scaledDividend}) \\div (${xMinusLatex(key.r, letter)})$.`,
      lines: [
        line('dividend', `The dividend ÷ ${ratioTyped(key.leading)}`, scaledDividend),
        line('divisor', `The divisor ÷ ${ratioTyped(key.leading)}`, xMinusLatex(key.r, letter), true),
      ],
    }));
  }
  const table = syntheticSteps({ letter, r: key.r, coefficients: key.coefficients, products: key.products, bottom: key.bottom });
  steps.push(...table.steps);
  const fadeLimit = steps.length;
  const lastLatex = numberLatex(key.remainder);
  steps.push(stepOf({
    op: 'read',
    kind: DIVISION_BOARD.READ,
    label: 'Read the bottom row',
    why: DIVISION_WHY.read,
    show: `The bottom row is $${key.bottom.map(numberLatex).join(',\\ ')}$. All but the last number are the quotient’s coefficients, starting at the ${powerName(n - 1, letter)} term: the quotient is $${quotientLatex}$. The table’s remainder is $${lastLatex}$.`,
    lines: [line('quotient', 'The quotient', quotientLatex, true), line('remainder', key.scaled ? `The table’s remainder (over ${letter} − r)` : 'The remainder', lastLatex)],
    synthetic: table.table(n + 1, true),
  }));
  const remainderLatex = numberLatex(key.remainderOverDivisor);
  if (key.scaled) {
    steps.push(stepOf({
      op: 'unscale',
      label: `Multiply the remainder by ${ratioTyped(key.leading)}`,
      why: DIVISION_WHY.unscale,
      show: `Over the divisor $${divisorLatex}$ as written, the remainder is $${numberLatex(key.leading)} \\cdot ${factorLatex(lastLatex)} = ${remainderLatex}$.`,
      lines: [line('remainder', `The remainder over ${text(question.divisor)}`, `${numberLatex(key.leading)} \\cdot ${factorLatex(lastLatex)} = ${remainderLatex}`, true)],
    }));
  }
  const answerLatex = `${quotientLatex} ${key.remainderOverDivisor.n < 0 ? '-' : '+'} \\frac{${ratioLatex({ n: Math.abs(key.remainderOverDivisor.n), d: key.remainderOverDivisor.d })}}{${divisorLatex}}`;
  steps.push(stepOf({
    op: 'answer',
    kind: DIVISION_BOARD.ANSWER,
    label: 'Write the answer',
    why: DIVISION_WHY.answer,
    show: `So $(${dividendLatex}) \\div (${divisorLatex}) = ${answerLatex}$.`,
    lines: [line('answer', 'The quotient plus the remainder over the divisor', answerLatex, true)],
  }));
  return {
    ok: true,
    tool: DIVISION_REPLAY_TOOL.SYNTHETIC,
    prompt: `Use synthetic division to find $(${dividendLatex}) \\div (${divisorLatex})$.`,
    steps,
    // In parts a practice box can check: "Quotient = x² + 2x + 7; remainder = 4".
    answer: `Quotient = ${exactPolynomialPlainText(key.quotient, letter)}; remainder = ${ratioPlainText(key.remainderOverDivisor)}`,
    record: work,
    fadeLimit,
    problems: [exactPolynomialTyped(entriesOf(dividend.coefficients), letter)],
  };
};

/* ------------------------------------- synthetic (Remainder and Factor Theorems) */

const theoremsReplay = (question) => {
  const dividend = list(question.dividend).map(Number);
  const divisor = syntheticRemainderDivisor(question);
  if (dividend.length < 2 || !dividend.every(Number.isInteger) || !divisor || divisor.leading !== 1 || !Number.isInteger(divisor.root)) {
    return refused('it is not a whole-number division by x − r that the table plays.');
  }
  const tableKey = syntheticTable(dividend, divisor.root);
  const { root: r, top, middle, bottom } = tableKey;
  const asks = syntheticAsks(question);
  const n = top.length - 1;
  const remainder = bottom[n];
  const quotient = bottom.slice(0, n);
  const work = {
    root: String(r),
    top: top.map(String),
    middle: middle.map(String),
    bottom: bottom.map(String),
    value: String(remainder),
    quotient: exactPolynomialTyped(entriesOf(quotient), 'x'),
    factorChoice: remainder === 0 ? 'yes' : 'no',
    choicesOpenUnanswered: true,
  };
  if (!graded(question, work)) return refused('the division view does not mark its work right.');
  const pLatex = polyLatex(top, 'x');
  const quotientLatex = polyLatex(quotient, 'x');
  const rLatex = numberLatex(r);
  const table = syntheticSteps({ letter: 'x', r, coefficients: top, products: middle, bottom });
  const steps = [...table.steps];
  const fadeLimit = steps.length;
  const full = table.table(n + 1, true);
  const answers = [];
  if (asks.includes('value')) {
    steps.push(stepOf({
      op: 'remainderTheorem',
      kind: DIVISION_BOARD.READ,
      label: `Read P(${r}) from the remainder`,
      why: DIVISION_WHY.remainderTheorem,
      show: `The remainder is $${numberLatex(remainder)}$, so $P(${rLatex}) = ${numberLatex(remainder)}$.`,
      lines: [line('value', `P(${r})`, numberLatex(remainder), true)],
      synthetic: full,
    }));
    answers.push(`P(${ratioPlainText(exact(r))}) = ${ratioPlainText(exact(remainder))}`);
  }
  if (asks.includes('quotient')) {
    steps.push(stepOf({
      op: 'depressed',
      kind: DIVISION_BOARD.READ,
      label: 'Read the quotient',
      why: DIVISION_WHY.depressed,
      show: `The bottom row without the remainder is $${quotient.map(numberLatex).join(',\\ ')}$: the quotient is $${quotientLatex}$.`,
      lines: [line('quotient', 'The quotient (the depressed polynomial)', quotientLatex, true)],
      synthetic: full,
    }));
    answers.push(`quotient = ${exactPolynomialPlainText(entriesOf(quotient), 'x')}`);
  }
  if (asks.includes('factor')) {
    if (remainder !== 0) return refused('its factor slide is written for a remainder of 0.');
    steps.push(stepOf({
      op: 'factorTheorem',
      kind: DIVISION_BOARD.READ,
      label: `Is $${xMinusLatex(r, 'x')}$ a factor?`,
      why: DIVISION_WHY.factorYes,
      show: `The remainder is $0$, so $${xMinusLatex(r, 'x')}$ is a factor: $${pLatex} = (${xMinusLatex(r, 'x')})(${quotientLatex})$.`,
      lines: [line('factor', 'Factored', `(${xMinusLatex(r, 'x')})(${quotientLatex})`, true)],
      synthetic: full,
    }));
    answers.push(`factor: yes, the remainder is zero`);
  }
  const asked = [
    asks.includes('value') ? `find $P(${rLatex})$` : '',
    asks.includes('quotient') ? 'give the quotient' : '',
    asks.includes('factor') ? `decide whether $${xMinusLatex(r, 'x')}$ is a factor` : '',
  ].filter(Boolean);
  const askText = asked.length > 1 ? `${asked.slice(0, -1).join(', ')} and ${asked[asked.length - 1]}` : asked[0];
  return {
    ok: true,
    tool: DIVISION_REPLAY_TOOL.THEOREMS,
    prompt: `Divide $P(x) = ${pLatex}$ by $${xMinusLatex(r, 'x')}$ with synthetic division. Then ${askText}.`,
    steps,
    answer: answers.join('; '),
    record: work,
    fadeLimit,
    problems: [exactPolynomialTyped(entriesOf(top), 'x')],
  };
};

/* ---------------------------------------------------------- longDivision */

const longReplay = (question) => {
  const key = longDivisionKey(question);
  if (!key) return refused('the division view cannot draw it.');
  const work = divisionKeyWork(question);
  if (!work || !graded(question, work)) return refused('the division view does not mark its work right.');
  const { letter, dividend, divisor } = key;
  const dividendLatex = exactPolynomialLatex(entriesOf(dividend.coefficients), letter);
  const divisorLatex = exactPolynomialLatex(entriesOf(divisor.coefficients), letter);
  const leadLatex = exactTermLatex({ coefficient: divisor.coefficients[0], power: divisor.degree }, letter);
  const missing = dividend.coefficients.map((value, index) => (isZero(value) ? powerName(dividend.degree - index, letter) : null)).filter(Boolean);
  const steps = [];
  key.rounds.forEach((round, index) => {
    const name = `Round ${index + 1}`;
    const leading = exactTermLatex(round.top[0], letter);
    const termLatex = exactTermLatex(round.term, letter);
    const topLatex = index === 0 ? placeholderPolynomialLatex(dividend.coefficients, letter) : exactPolynomialLatex(round.top, letter);
    const productLatex = exactPolynomialLatex(round.product, letter);
    const leftLatex = exactPolynomialLatex(round.left.filter((entry) => entry.power >= round.lowestBroughtDown), letter);
    steps.push(stepOf({
      op: 'divide',
      label: `${name}: divide the leading terms`,
      why: DIVISION_WHY.divide,
      show: `${index === 0 && missing.length ? `Write the dividend with a 0 for the missing ${missing.join(' and ')} term: $${topLatex}$. ` : ''}Divide $${leading}$ by $${leadLatex}$: $${termLatex}$.`,
      lines: [line('lead', 'Leading term ÷ the divisor’s leading term', `${leading} \\div ${leadLatex}`), line('term', 'The next term of the quotient', termLatex, true)],
    }));
    steps.push(stepOf({
      op: 'multiplyBack',
      label: `${name}: multiply back`,
      why: DIVISION_WHY.multiply,
      show: `Multiply $${termLatex}$ by $(${divisorLatex})$: $${productLatex}$.`,
      lines: [line('product', 'That term times the divisor', productLatex, true)],
    }));
    steps.push(stepOf({
      op: 'subtract',
      label: `${name}: subtract and bring down`,
      why: index === key.rounds.length - 1 ? `${DIVISION_WHY.subtract} ${DIVISION_WHY.stop}` : DIVISION_WHY.subtract,
      show: `Subtract $${productLatex}$ from $${exactPolynomialLatex(round.top, letter)}$${round.broughtDown ? ' and bring down the next term' : ''}: $${leftLatex}$.`,
      lines: [line('left', 'What is left', leftLatex, true)],
    }));
  });
  const fadeLimit = steps.length;
  const quotientLatex = exactPolynomialLatex(key.quotient, letter);
  const remainderLatex = exactPolynomialLatex(key.remainder, letter);
  const remainderEntries = key.remainder.filter((entry) => entry.coefficient.n !== 0);
  if (!remainderEntries.length) return refused('its remainder is 0, and an example never shows a division that comes out even.');
  const negative = remainderEntries.length === 1 && remainderEntries[0].coefficient.n < 0;
  const magnitude = negative ? exactPolynomialLatex([{ ...remainderEntries[0], coefficient: { n: -remainderEntries[0].coefficient.n, d: remainderEntries[0].coefficient.d } }], letter) : remainderLatex;
  const answerLatex = `${quotientLatex} ${negative ? '-' : '+'} \\frac{${magnitude}}{${divisorLatex}}`;
  steps.push(stepOf({
    op: 'read',
    kind: DIVISION_BOARD.READ,
    label: 'The quotient and the remainder',
    why: DIVISION_WHY.read.replace('the bottom row (all but its last number)', 'the terms found in each round, together,'),
    show: `The terms found in the rounds make the quotient: $${quotientLatex}$. What is left, $${remainderLatex}$, is the remainder.`,
    lines: [line('quotient', 'The quotient', quotientLatex, true), line('remainder', 'The remainder', remainderLatex)],
  }));
  steps.push(stepOf({
    op: 'answer',
    kind: DIVISION_BOARD.ANSWER,
    label: 'Write the answer',
    why: DIVISION_WHY.answer,
    show: `So $(${dividendLatex}) \\div (${divisorLatex}) = ${answerLatex}$.`,
    lines: [line('answer', 'The quotient plus the remainder over the divisor', answerLatex, true)],
  }));
  return {
    ok: true,
    tool: DIVISION_REPLAY_TOOL.LONG,
    prompt: `Use long division to find $(${dividendLatex}) \\div (${divisorLatex})$.`,
    steps,
    answer: `Quotient = ${exactPolynomialPlainText(key.quotient, letter)}; remainder = ${exactPolynomialPlainText(key.remainder, letter)}`,
    record: work,
    fadeLimit,
    problems: [exactPolynomialTyped(entriesOf(dividend.coefficients), letter)],
  };
};

/* ------------------------------------------------------------- the tool */

/** The division view a question is answered in, where its example can be replayed, or null. */
export const divisionReplayToolOf = (question) => {
  if (text(question?.type) !== 'polynomialWorkshop') return null;
  const mode = text(question?.mode);
  if (mode === 'syntheticDivision' && typeof question.dividend === 'string' && typeof question.divisor === 'string') return DIVISION_REPLAY_TOOL.SYNTHETIC;
  if (mode === 'longDivision' && typeof question.dividend === 'string' && typeof question.divisor === 'string') return DIVISION_REPLAY_TOOL.LONG;
  if (mode === 'synthetic' && Array.isArray(question.dividend)) return DIVISION_REPLAY_TOOL.THEOREMS;
  return null;
};

/**
 * Play a division question (a sibling) as its view's own work.
 *
 *   replayDivisionExample(siblingQuestion)
 *     → { ok: true, tool, prompt, steps: [{ show, why, board }], answer, record, fadeLimit }
 *     | { ok: false, error }
 */
export const replayDivisionExample = (question) => {
  const tool = divisionReplayToolOf(question);
  try {
    if (tool === DIVISION_REPLAY_TOOL.SYNTHETIC) return syntheticTextReplay(question);
    if (tool === DIVISION_REPLAY_TOOL.THEOREMS) return theoremsReplay(question);
    if (tool === DIVISION_REPLAY_TOOL.LONG) return longReplay(question);
  } catch (error) {
    return refused(`${String(error?.message || 'the view cannot play it')}.`);
  }
  return refused('it is not a division the replay covers.');
};

/* ---------------------------------------------------------- the item's key */

/**
 * The item's own answers, as text in each spelling the guard compares
 * (typed, as LaTeX, and with its minus written either way): the quotient,
 * the remainder and P(r). A remainder of 0 is the item's case, not a number
 * it states, and is left out (as the guard leaves out a case's words), so a
 * placeholder 0 on a slide is not mistaken for it.
 */
export const divisionItemAnswers = (question) => {
  const tool = divisionReplayToolOf(question);
  const values = [];
  const add = (typed, latex) => {
    [typed, latex].filter(Boolean).forEach((value) => {
      values.push(value, value.replace(/-/g, '−'));
    });
  };
  try {
    if (tool === DIVISION_REPLAY_TOOL.SYNTHETIC || tool === DIVISION_REPLAY_TOOL.LONG) {
      const key = tool === DIVISION_REPLAY_TOOL.SYNTHETIC ? syntheticDivisionKey(question) : longDivisionKey(question);
      if (!key) return [];
      add(exactPolynomialTyped(key.quotient, key.letter), exactPolynomialLatex(key.quotient, key.letter));
      const remainder = tool === DIVISION_REPLAY_TOOL.SYNTHETIC ? [{ coefficient: key.remainderOverDivisor, power: 0 }] : key.remainder;
      if (remainder.some((entry) => entry.coefficient.n !== 0)) add(exactPolynomialTyped(remainder, key.letter), exactPolynomialLatex(remainder, key.letter));
    } else if (tool === DIVISION_REPLAY_TOOL.THEOREMS) {
      const divisor = syntheticRemainderDivisor(question);
      if (!divisor) return [];
      const table = syntheticTable(list(question.dividend).map(Number), divisor.root);
      const quotient = table.quotient.map((value) => value / divisor.leading);
      if (quotient.every(Number.isInteger)) add(exactPolynomialTyped(entriesOf(quotient), 'x'), polyLatex(quotient, 'x'));
      if (table.remainder !== 0 && Number.isFinite(table.remainder)) add(String(table.remainder), null);
    }
  } catch {
    return [];
  }
  return [...new Set(values.filter(Boolean))];
};

/* -------------------------------------------------------------- the sibling */

// A seeded walk through small numbers, so a seed always gives the same sibling.
const pick = (options, seed, offset = 0) => (options.length ? options[((((Number(seed) || 0) * 7 + offset) % options.length) + options.length) % options.length] : null);
const COEFFICIENTS = Object.freeze([2, -3, 1, 4, -2, 3, -1, 5, -4, 6, -5]);
const ROOTS = Object.freeze([1, 2, 3]);
const SMALL = 80;

// The coefficients of a dividend shaped like the item's: its degree, its
// leading coefficient's size (1 kept as 1), and a 0 exactly where the item has one.
const shapedCoefficients = (pattern, leadingOne, seed, turn, scale = 1) => pattern.map((isZeroPower, index) => {
  if (index === 0) return scale * (leadingOne ? 1 : pick([2, 3, 4], seed, turn));
  if (isZeroPower) return 0;
  return scale * pick(COEFFICIENTS, seed, turn * 3 + index * 5);
});

// The sibling plays, and none of its lines or its answer holds the item's
// quotient, remainder or P(r) (the guard every example passes reads the same).
const playsWithoutTheItemsAnswer = (question, sibling) => {
  const replay = replayDivisionExample(sibling);
  if (!replay.ok) return false;
  const answers = divisionItemAnswers(question);
  const texts = [replay.prompt, replay.answer, ...replay.steps.flatMap((step) => [step.show, step.why])];
  return !texts.some((value) => hintRevealsAnswer(value, answers));
};

const sameList = (a, b) => a.length === b.length && a.every((value, index) => Math.abs(Number(value) - Number(b[index])) < 1e-9);
const small = (values) => values.every((value) => Math.abs(ratioValue(exact(value))) <= SMALL && exact(value).d <= 4);

const syntheticTextSibling = (question, seed) => {
  const key = syntheticDivisionKey(question);
  if (!key) return null;
  const { letter, dividend, leading } = key;
  const pattern = dividend.coefficients.map(isZero);
  const leadingOne = ratioValue(dividend.coefficients[0]) === 1;
  const a = ratioValue(leading);
  if (!Number.isInteger(a) || a === 0) return null;
  const itemR = ratioValue(key.r);
  for (let turn = 0; turn < 40; turn += 1) {
    // The divisor ax + b: a kept, b another number with the item's sign of r (r = −b/a).
    const magnitude = pick(Math.abs(a) === 1 ? [1, 2, 3, 4] : [1, 3, 5], seed, turn + 1);
    const b = -Math.sign(itemR || 1) * magnitude * Math.sign(a);
    const coefficients = shapedCoefficients(pattern, leadingOne, seed, turn, Math.abs(a) === 1 ? 1 : Math.abs(a));
    const sibling = {
      type: 'polynomialWorkshop',
      mode: 'syntheticDivision',
      dividend: exactPolynomialTyped(entriesOf(coefficients), letter),
      divisor: exactPolynomialTyped([{ coefficient: exact(a), power: 1 }, { coefficient: exact(b), power: 0 }], letter),
    };
    const siblingKey = syntheticDivisionKey(sibling);
    if (!siblingKey || isZero(siblingKey.remainder)) continue;
    if (sameList(siblingKey.dividend.coefficients.map(ratioValue), dividend.coefficients.map(ratioValue)) && ratioValue(siblingKey.r) === itemR) continue;
    if (!small([...siblingKey.products, ...siblingKey.bottom, siblingKey.remainderOverDivisor])) continue;
    // The remainder over the divisor as written is a whole number, as the item's is.
    if (siblingKey.remainderOverDivisor.d !== 1) continue;
    if (playsWithoutTheItemsAnswer(question, sibling)) return sibling;
  }
  return null;
};

const theoremsSibling = (question, seed) => {
  const dividend = list(question.dividend).map(Number);
  const divisor = syntheticRemainderDivisor(question);
  if (dividend.length < 2 || !dividend.every(Number.isInteger) || !divisor || !Number.isFinite(divisor.root)) return null;
  const asks = syntheticAsks(question);
  const pattern = dividend.map((value) => value === 0);
  const leadingOne = dividend[0] === 1;
  const sign = Math.sign(divisor.root) || 1;
  for (let turn = 0; turn < 60; turn += 1) {
    const r = sign * pick(ROOTS.filter((value) => sign * value !== divisor.root), seed, turn);
    const coefficients = shapedCoefficients(pattern, leadingOne, seed, turn);
    const n = coefficients.length - 1;
    // A factor item's sibling has x − r as a factor: its constant makes P(r) = 0.
    if (asks.includes('factor')) {
      if (pattern[n]) continue;
      const withoutConstant = coefficients.slice(0, n).reduce((sum, value, index) => sum + value * r ** (n - index), 0);
      coefficients[n] = -withoutConstant;
      if (coefficients[n] === 0 || Math.abs(coefficients[n]) > 60) continue;
    }
    const table = syntheticTable(coefficients, r);
    if (!asks.includes('factor') && table.remainder === 0) continue;
    if (sameList(coefficients, dividend)) continue;
    if (!small([...table.middle, ...table.bottom])) continue;
    const sibling = { type: 'polynomialWorkshop', mode: 'synthetic', dividend: coefficients, candidateRoot: r, ask: asks };
    if (playsWithoutTheItemsAnswer(question, sibling)) return sibling;
  }
  return null;
};

const longSibling = (question, seed) => {
  const key = longDivisionKey(question);
  if (!key || key.divisor.degree !== 1) return null;
  const { letter, dividend, divisor } = key;
  const pattern = dividend.coefficients.map(isZero);
  const leadingOne = ratioValue(dividend.coefficients[0]) === 1;
  const a = ratioValue(divisor.coefficients[0]);
  if (Math.abs(a) !== 1) return null;
  const itemB = ratioValue(divisor.coefficients[1]);
  // The divisor written as the item writes it: "x + 3", or "-a + 2" (its terms in the item's order).
  const constantFirst = /^\s*[+-]?\s*\d+\s*[+-]/.test(text(question.divisor));
  for (let turn = 0; turn < 40; turn += 1) {
    const b = (Math.sign(itemB) || 1) * pick([1, 2, 3, 4, 5].filter((value) => value !== Math.abs(itemB)), seed, turn);
    const coefficients = shapedCoefficients(pattern, leadingOne, seed, turn);
    const aTerm = exactPolynomialTyped([{ coefficient: exact(a), power: 1 }], letter);
    const divisorText = constantFirst ? `${b}${a < 0 ? '-' : '+'}${aTerm.replace(/^-/, '')}` : exactPolynomialTyped([{ coefficient: exact(a), power: 1 }, { coefficient: exact(b), power: 0 }], letter);
    const sibling = { type: 'polynomialWorkshop', mode: 'longDivision', dividend: exactPolynomialTyped(entriesOf(coefficients), letter), divisor: divisorText };
    const siblingKey = longDivisionKey(sibling);
    if (!siblingKey || siblingKey.remainder.every((entry) => entry.coefficient.n === 0)) continue;
    if (sameList(coefficients, dividend.coefficients.map(ratioValue))) continue;
    if (!small([...siblingKey.quotient.map((entry) => entry.coefficient), ...siblingKey.remainder.map((entry) => entry.coefficient), ...siblingKey.rounds.flatMap((round) => round.product.map((entry) => entry.coefficient))])) continue;
    if (playsWithoutTheItemsAnswer(question, sibling)) return sibling;
  }
  return null;
};

/**
 * A sibling for a division question: the same view and the same kind of
 * division with other numbers, or null (see the header for what it keeps).
 */
export const divisionSiblingFor = (question, { seed = 0 } = {}) => {
  const tool = divisionReplayToolOf(question);
  try {
    if (tool === DIVISION_REPLAY_TOOL.SYNTHETIC) return syntheticTextSibling(question, seed);
    if (tool === DIVISION_REPLAY_TOOL.THEOREMS) return theoremsSibling(question, seed);
    if (tool === DIVISION_REPLAY_TOOL.LONG) return longSibling(question, seed);
  } catch {
    return null;
  }
  return null;
};
