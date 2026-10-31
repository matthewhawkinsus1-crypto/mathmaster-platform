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
 * Pure. A column's `name` is the quantity it holds when the question names
 * one ("Rental time (hours)"), said once with the headers.
 */
import { round } from './toolMath.js';

const column = (key, label, name = '') => (name ? { key, label, name } : { key, label });
const list = (rows) => (Array.isArray(rows) ? rows : []);

/** A given x/y table: each row [x, y] as the tool draws it, and the quantities the question names. */
export const givenXyTable = (rows, quantities = null) => ({
  columns: [column('x', 'x', quantities?.x), column('y', 'y', quantities?.y)],
  rows: list(rows).map(([x, y]) => [x, y]),
});

/** The student's own x/y rows ({ x, y } as typed): each cell what they wrote, or blank. */
export const enteredXyTable = (rows) => ({
  columns: [column('x', 'x'), column('y', 'y')],
  rows: list(rows).map((row) => [{ entered: String(row?.x ?? '') }, { entered: String(row?.y ?? '') }]),
});

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
