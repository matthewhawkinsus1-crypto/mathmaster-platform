// Worked solution review for expressionMeaning (contract: ../toolSolutionReview.js, textOnlyReview).
/*
 * THE MEANING MATRIX'S WORKED SOLUTION — THE PICKS THE SHARED GRADER MARKS RIGHT.
 *
 * The tool has one view and one graded mode ('default'; ExpressionMeaning.jsx
 * never reads `question.mode`): for every authored expression the student
 * picks a unit, a contextual meaning and a mathematical role from the
 * question's choice banks. The shared grader
 * (functions/shared/serverGrading/tools/expressionMeaning.mjs, through
 * scoreExpressionMeaning) marks each pick against that expression's own
 * authored `unit`, `contextMeaning` and `mathRole` — trimmed, lower-cased,
 * spaces collapsed — and the question is correct only when every row has all
 * three right. So every question with a usable key has a single correct map,
 * and gets a review.
 *
 * The review states, for each row, the BANK OPTION the student taps (the one
 * that reads as the authored answer), never the authored text alone: an
 * answer no button carries cannot be followed. It then turns those picks into
 * the work the matrix would submit (expressionMeaningWork) and grades it with
 * the shared grader through the bytes the server reads (gradeWorkWithGrader).
 * Unless the grader calls that work correct and complete, the review is null.
 *
 * Null — never a guess — when:
 *   - there are no expressions, more than MAX_ROWS of them (the steps would
 *     be cut short), or an expression is not an object;
 *   - an expression has no id the matrix can open (missing, '', 0, an
 *     object) or two expressions share an id (1 and '1' are one row);
 *   - an expression has no display text the matrix shows;
 *   - for some row and dimension no bank option reads as the authored answer,
 *     or the only one is a value the matrix never counts as chosen (0, false,
 *     blank) — the row could never be completed correctly;
 *   - a text the review would quote could render differently from the
 *     button (a backslash, or a `$` that is not a single currency amount —
 *     MathText would read it as mathematics);
 *   - the grader does not accept the stated work as correct and complete.
 *
 * Shown only once the question is closed (QuestionEngine); pure, no React.
 */
import expressionMeaningGrader, {
  expressionMeaningWork,
} from '../../../../functions/shared/serverGrading/tools/expressionMeaning.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import {
  EXPRESSION_MEANING_DIMENSIONS,
  choiceBankFor,
} from '../../../../functions/shared/toolMath/expressionMeaning/expressionMeaningMath.mjs';

export const implemented = true;

// One intro step plus one step per row must fit the 12 steps textOnlyReview keeps.
const MAX_ROWS = 11;

// The matrix's own column names (ExpressionMeaning.jsx DIMENSION_LABEL).
const DIMENSION_LABEL = Object.freeze({ unit: 'Unit', contextMeaning: 'Contextual meaning', mathRole: 'Mathematical role' });

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// scoreExpressionMeaning's comparison: trimmed, lower-cased, spaces collapsed.
const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// A value the matrix can hold as a pick and counts as chosen: the work keeps
// text, finite numbers and booleans, and a row is complete only when each
// pick passes `String(value || '').trim()`.
const isChosenPick = (value) => {
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  return value === true;
};

// An id the matrix can open and key its answers by: `assign` ignores a falsy
// id, and the grader reads any scalar id as its own spelling.
const usableId = (value) => (
  (typeof value === 'string' && value !== '') || (typeof value === 'number' && Number.isFinite(value) && value !== 0)
);

const displayText = (value) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

// MathText reads `$…$` and `\(…\)` as mathematics. A quoted text must render
// as the button shows it, so it may hold at most one `$`, and only as a
// currency amount (the same rule as mathSegments.currencyPrefixLength: an
// amount not followed by a letter, digit or underscore), and no backslash.
// Every quoted text is separated by words of this review, so two currency
// amounts in one line are always read as prose, never paired into math.
const CURRENCY_AMOUNT = /^\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/;
const rendersAsWritten = (text) => {
  if (text.includes('\\')) return false;
  const first = text.indexOf('$');
  if (first < 0) return true;
  if (text.indexOf('$', first + 1) >= 0) return false;
  const match = CURRENCY_AMOUNT.exec(text.slice(first));
  if (!match) return false;
  return !/[A-Za-z0-9_]/.test(text[first + match[0].length] || '');
};

// The bank option a student taps for this row and dimension: the first, in
// the order the matrix shows the bank, that reads as the authored answer.
const optionFor = (question, expr, dimension) => {
  const answer = normalize(expr[dimension]);
  if (!answer) return null;
  const option = choiceBankFor(question, dimension).find((entry) => (
    (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') && normalize(entry) === answer
  ));
  return option !== undefined && isChosenPick(option) ? option : null;
};

const readRows = (question) => {
  const expressions = question.expressions;
  if (!Array.isArray(expressions) || !expressions.length || expressions.length > MAX_ROWS) return null;
  const seen = new Set();
  const rows = [];
  for (const expr of expressions) {
    if (!isRecord(expr) || !usableId(expr.id)) return null;
    const key = String(expr.id);
    if (seen.has(key)) return null;
    seen.add(key);
    const expression = displayText(expr.expression);
    if (!expression || !rendersAsWritten(expression)) return null;
    const picks = {};
    for (const dimension of EXPRESSION_MEANING_DIMENSIONS) {
      const option = optionFor(question, expr, dimension);
      if (option === null) return null;
      const text = String(option).trim();
      if (!rendersAsWritten(text)) return null;
      picks[dimension] = { option, text };
    }
    rows.push({ id: expr.id, expression, picks });
  }
  return rows;
};

const buildReview = (question) => {
  if (!isRecord(question)) return null;
  const rows = readRows(question);
  if (!rows) return null;

  // The work a student following this review submits: exactly the options
  // it names, keyed by row the way the matrix keys its state.
  const assignments = Object.fromEntries(rows.map(({ id, picks }) => [
    String(id),
    Object.fromEntries(EXPRESSION_MEANING_DIMENSIONS.map((dimension) => [dimension, picks[dimension].option])),
  ]));
  const work = expressionMeaningWork(question, assignments);
  const verdict = gradeWorkWithGrader({ grader: expressionMeaningGrader, question, work });
  if (verdict.graded !== true || verdict.isCorrect !== true || verdict.isComplete !== true) return null;

  const quoted = (text) => `“${text}”`;
  const rowCount = rows.length === 1 ? 'one row' : `${rows.length} rows`;
  const [first] = rows;
  return {
    title: 'Meaning-map solution',
    items: rows.map(({ expression, picks }) => ({
      label: expression,
      value: EXPRESSION_MEANING_DIMENSIONS.map((dimension) => `${DIMENSION_LABEL[dimension]}: ${picks[dimension].text}`).join(' · '),
    })),
    steps: [
      `The meaning matrix has ${rowCount}, one for each expression. For every row, decide what the expression stands for in the situation (its contextual meaning), what it is measured in (its unit), and what part it plays in the mathematics (its mathematical role).`,
      ...rows.map(({ expression, picks }) => (
        `For ${expression}: it stands for ${quoted(picks.contextMeaning.text)}, it is measured in ${quoted(picks.unit.text)}, and its mathematical role is ${quoted(picks.mathRole.text)}. Choose those three options in its row.`
      )),
    ],
    why: `Read each finished row back as one statement and check that its three choices describe the same quantity — for ${first.expression}: measured in ${quoted(first.picks.unit.text)}, standing for ${quoted(first.picks.contextMeaning.text)}, with the role ${quoted(first.picks.mathRole.text)}. A row counts only when all three of its choices are right, and the meaning map is correct only when every row is.`,
    note: null,
  };
};

export const buildExpressionMeaningReview = (question) => {
  try {
    return buildReview(question);
  } catch {
    return null;
  }
};

export default buildExpressionMeaningReview;
