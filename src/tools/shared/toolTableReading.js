/*
 * A TABLE A TOOL DRAWS ITSELF, FOR READ ALOUD (AX10).
 *
 * Read aloud read the tables a question shows (QuestionVisual) and the
 * fillable table (TableGrader), and none that a tool draws itself: the Linear
 * Table Workbench's rows (walkthrough 2026-10-22, DOL #3 review, PR 3), the
 * Data Modeling Lab's residual table, the Linear Multiple Representations
 * board's given table and the student's table of values, and the Sequence
 * Explorer's terms. Each now publishes its table beside the one it draws
 * (platform/language/figureReadings.js), in the shape displayTable.js gives
 * QuestionVisual, from the same rows, so Read aloud says what the screen shows
 * and nothing more:
 *
 *   - a value is the text the tool draws for it;
 *   - a cell the student fills in is { entered }: what they typed ("you
 *     wrote …"), or blank, never the value it should hold;
 *   - a cell the screen keeps back (a sequence's missing term, "?") is null,
 *     read "blank";
 *   - a table is published only while it is drawn: one that appears once the
 *     student's model is complete, or a card still locked, says nothing before.
 *
 * The Regression Calculator's tables and the board's process-mode row
 * choosers follow the same rules (AX10, slice 2): the calculator's table is
 * what the student typed into its x₁ and y₁ boxes, and its source data is read
 * only where the screen lists it (never beside a source scatterplot, which
 * is the data the student is to read); a row chooser says which rows the
 * student has chosen — their own picks, never which row is right — and a table
 * the student extends says what they typed, or blank.
 *
 * IN THE READER'S LANGUAGE (AX05, slice 2): a table is worded by the reader
 * (Fila, Columnas, en blanco); a row chooser's own sentences are messages
 * (ROW_CHOOSER_WORDS), said in Spanish from platform/language/packs/esFigures.js
 * under an authored Spanish translation, with the rows' values as drawn.
 *
 * Pure. A column's `name` is the quantity it holds when the question names
 * one ("Rental time (hours)"), said once with the headers.
 */
import { round } from './toolMath.js';
import { say, sayFigure } from '../../platform/language/figureSay.js';

const column = (key, label, name = '') => (name ? { key, label, name } : { key, label });
const list = (rows) => (Array.isArray(rows) ? rows : []);

/** A given x/y table: each row [x, y] as the tool draws it, and the quantities the question names. */
export const givenXyTable = (rows, quantities = null) => ({
  columns: [column('x', 'x', quantities?.x), column('y', 'y', quantities?.y)],
  rows: list(rows).map(([x, y]) => [x, y]),
});

/**
 * The student's own x/y rows ({ x, y } as typed): each cell what they wrote, or
 * blank. `labels` are the column names the screen draws when they are not x and
 * y (the Regression Calculator's x₁ and y₁).
 */
export const enteredXyTable = (rows, labels = null) => ({
  columns: [column('x', labels?.x ?? 'x'), column('y', labels?.y ?? 'y')],
  rows: list(rows).map((row) => [{ entered: String(row?.x ?? '') }, { entered: String(row?.y ?? '') }]),
});

/**
 * Process mode's "extend the table": the given rows as the screen draws them,
 * then the rows the student adds, each cell what they typed or blank. The row
 * where the line meets an axis is never filled in for them.
 */
export const extendedXyTable = (givenRows, newRows) => ({
  columns: [column('x', 'x'), column('y', 'y')],
  rows: [
    ...list(givenRows).map(([x, y]) => [x, y]),
    ...list(newRows).map((row) => [{ entered: String(row?.x ?? '') }, { entered: String(row?.y ?? '') }]),
  ],
});

/**
 * What a row chooser says, by message id, in English: what it asks (its
 * caption on the screen, too), each row, and the student's picks.
 */
export const ROW_CHOOSER_WORDS = Object.freeze({
  chooseTwoRows: () => 'Choose two rows: row 1, then row 2.',
  chooseXInterceptRow: () => 'Choose the row where the line meets the x-axis.',
  chooseYInterceptRow: () => 'Choose the row where the line meets the y-axis.',
  chooseRowAsPoint: () => 'Choose a row to use as a point on the line.',
  chooserRow: (number, x, y) => `Row ${number}: x, ${x}; y, ${y}.`,
  chosenChooserRow: (number, x, y, note) => `Row ${number}: x, ${x}; y, ${y}; ${note}.`,
  rowChosen: () => 'chosen',
  rowChosenAs: (number) => `chosen as row ${number}`,
  noRowChosenYet: () => 'None is chosen yet.',
});
const english = (segments) => sayFigure(segments, ROW_CHOOSER_WORDS, { english: true }) || '';

/** What a chooser asks (one of ROW_CHOOSER_WORDS' questions, by id), as the screen draws it. */
export const rowChooserAsk = (ask) => english([say(ask)]);

const chosenRowNoteSay = (position, chosenCount) => {
  if (!(position >= 0)) return null;
  return chosenCount > 1 ? say('rowChosenAs', position + 1) : say('rowChosen');
};

/**
 * What a row chooser's button says about its row, and so what is read: nothing
 * for a row that is not chosen; "chosen" for one that is, and, where two rows
 * are being chosen, as which ("chosen as row 2"). `position` is the row's place
 * among the chosen rows, in the order they were chosen (-1 for none).
 */
export const chosenRowNote = (position, chosenCount) => {
  const note = chosenRowNoteSay(position, chosenCount);
  return note ? english([note]) : '';
};

/**
 * A table the student chooses rows from (process mode's row chooser), as a
 * figure: what it asks (`ask`, a ROW_CHOOSER_WORDS id: "Choose two rows: row 1,
 * then row 2."), every given row as the screen draws it, and which of them the
 * student has chosen. It is the student's pick, never the row that answers the
 * question: nothing here knows which that is. `chosen` is the picked rows'
 * numbers (0-based), in the order they were picked. `say` is the same reading
 * as messages: Read aloud says it in Spanish under a translation (AX05).
 */
export const rowChooserEntry = ({ ask, rows, chosen = [] }) => {
  const picked = list(chosen);
  const says = [
    say(ask),
    ...list(rows).map(([x, y], index) => {
      const note = chosenRowNoteSay(picked.indexOf(index), picked.length);
      return note ? say('chosenChooserRow', index + 1, String(x), String(y), note) : say('chooserRow', index + 1, String(x), String(y));
    }),
    ...(picked.length ? [] : [say('noRowChosenYet')]),
  ];
  return { kind: 'figure', label: 'Rows to choose from', text: english(says), say: says };
};

/** The Data Modeling Lab's residual table: x, y, ŷ and the residual, rounded as the lab draws them. */
export const residualTable = (rows, quantities = null) => ({
  columns: [column('x', 'x', quantities?.x), column('y', 'y', quantities?.y), column('predicted', 'ŷ'), column('residual', 'residual')],
  rows: list(rows).map((row) => [row.x, row.y, round(row.predicted, 2), round(row.residual, 2)]),
});

/**
 * A sequence's terms, one row per term: its number n, then `termCell(row,
 * index)` — the value the screen draws, { entered } where the student types
 * it, or null where the screen keeps it back. `names` are what a table's row
 * headings call the two ("Domain input n", "Output f(n)"), said once.
 */
export const sequenceTable = (rows, { termHeader, termCell, names = null }) => ({
  columns: [column('n', 'n', names?.input), column('term', termHeader, names?.term)],
  rows: list(rows).map((row, index) => [row.n, termCell(row, index)]),
});
